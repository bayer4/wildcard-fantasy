import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { processManualIngest, addManualBonus } from '../ingest/providers/manual';
import { fetchSportsDataIO, isSportsDataIOAvailable } from '../ingest/providers/sportsdataio';
import { persistTeamScores, canComputeScores } from '../scoring/engine';
import { getScoringRulesSchema, normalizeRulesPayload } from '../scoring/rules';
import { IngestData } from '../ingest/types';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate, requireAdmin);

// ========== SEED ENDPOINT ==========

interface SeedRosterPlayer {
  displayName: string;
  position: string;
  nflTeam: string;
}

interface SeedTeam {
  name: string;
  roster: SeedRosterPlayer[];
}

interface SeedConference {
  name: string;
  teams: SeedTeam[];
}

interface SeedPayload {
  conferences: SeedConference[];
}

/**
 * Seed endpoint - accepts nested JSON with conferences, teams, rosters
 * Format: { conferences: [{ name, teams: [{ name, roster: [{ displayName, position, nflTeam }]}]}]}
 */
router.post('/seed', (req: AuthRequest, res: Response) => {
  try {
    const payload: SeedPayload = req.body;

    if (!payload.conferences || !Array.isArray(payload.conferences)) {
      res.status(400).json({ 
        error: 'Invalid payload. Expected: { conferences: [{ name, teams: [{ name, roster: [...] }] }] }' 
      });
      return;
    }

    const results = {
      conferencesCreated: 0,
      teamsCreated: 0,
      playersCreated: 0,
      rosterEntriesCreated: 0,
      lineupEntriesCreated: 0,
      errors: [] as string[]
    };

    // Get current week from league settings
    const settings = db.prepare('SELECT current_week FROM league_settings WHERE id = ?').get('default') as { current_week: number } | undefined;
    const currentWeek = settings?.current_week || 1;

    // Prepared statements
    const upsertConference = db.prepare(`
      INSERT INTO conferences (id, name) VALUES (?, ?)
      ON CONFLICT (name) DO UPDATE SET name = excluded.name
      RETURNING id
    `);

    const upsertTeam = db.prepare(`
      INSERT INTO teams (id, name, conference_id) VALUES (?, ?, ?)
      ON CONFLICT (name) DO UPDATE SET conference_id = excluded.conference_id
      RETURNING id
    `);

    const upsertPlayer = db.prepare(`
      INSERT INTO players (id, display_name, position, nfl_team) VALUES (?, ?, ?, ?)
      ON CONFLICT (display_name, position, nfl_team) DO UPDATE SET display_name = excluded.display_name
      RETURNING id
    `);

    const upsertRosterPlayer = db.prepare(`
      INSERT INTO roster_players (id, team_id, player_id) VALUES (?, ?, ?)
      ON CONFLICT (team_id, player_id) DO UPDATE SET team_id = excluded.team_id
      RETURNING id
    `);

    const upsertLineupEntry = db.prepare(`
      INSERT INTO lineup_entries (id, roster_player_id, week, is_starter) VALUES (?, ?, ?, 0)
      ON CONFLICT (roster_player_id, week) DO NOTHING
    `);

    const transaction = db.transaction(() => {
      for (const conference of payload.conferences) {
        if (!conference.name) {
          results.errors.push('Conference missing name');
          continue;
        }

        // Upsert conference
        const confResult = upsertConference.get(uuidv4(), conference.name) as { id: string };
        const conferenceId = confResult.id;
        results.conferencesCreated++;

        if (!conference.teams || !Array.isArray(conference.teams)) {
          continue;
        }

        for (const team of conference.teams) {
          if (!team.name) {
            results.errors.push(`Team missing name in conference ${conference.name}`);
            continue;
          }

          // Upsert team
          const teamResult = upsertTeam.get(uuidv4(), team.name, conferenceId) as { id: string };
          const teamId = teamResult.id;
          results.teamsCreated++;

          if (!team.roster || !Array.isArray(team.roster)) {
            continue;
          }

          for (const rosterPlayer of team.roster) {
            if (!rosterPlayer.displayName || !rosterPlayer.position || !rosterPlayer.nflTeam) {
              results.errors.push(`Invalid roster player in team ${team.name}: ${JSON.stringify(rosterPlayer)}`);
              continue;
            }

            // Validate position
            const validPositions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
            if (!validPositions.includes(rosterPlayer.position)) {
              results.errors.push(`Invalid position "${rosterPlayer.position}" for ${rosterPlayer.displayName}`);
              continue;
            }

            // Upsert player (global players table)
            const playerResult = upsertPlayer.get(
              uuidv4(), 
              rosterPlayer.displayName, 
              rosterPlayer.position, 
              rosterPlayer.nflTeam
            ) as { id: string };
            const playerId = playerResult.id;
            results.playersCreated++;

            // Upsert roster entry (team-player join)
            const rosterResult = upsertRosterPlayer.get(uuidv4(), teamId, playerId) as { id: string };
            const rosterPlayerId = rosterResult.id;
            results.rosterEntriesCreated++;

            // Create lineup entry for current week (default to BENCH)
            const lineupResult = upsertLineupEntry.run(uuidv4(), rosterPlayerId, currentWeek);
            if (lineupResult.changes > 0) {
              results.lineupEntriesCreated++;
            }
          }
        }
      }
    });

    transaction();

    res.json({ 
      success: true, 
      week: currentWeek,
      ...results 
    });
  } catch (error: any) {
    console.error('Seed error:', error);
    res.status(500).json({ error: 'Failed to seed data', details: error.message });
  }
});

// ========== RULES ENDPOINT ==========

/**
 * Upload scoring rules - accepts JSON ruleset, stores as-is
 */
/**
 * Upload scoring rules - accepts any JSON, stores as-is
 * Normalizes multiple payload shapes:
 * A) { "name": string, ...BCFL_RULES_FIELDS }
 * B) { "ruleSetName": string, "rules": { ...BCFL_RULES_FIELDS } }
 * C) { name, rules: { ruleSetName, rules: {...} } } (UI shape)
 */
router.post('/rules', (req: AuthRequest, res: Response) => {
  try {
    // Normalize the incoming payload
    const { name, active, rules } = normalizeRulesPayload(req.body);

    if (!rules || typeof rules !== 'object' || Object.keys(rules).length === 0) {
      res.status(400).json({ 
        error: 'No rules content found. Send rules as a JSON object.',
        received: req.body
      });
      return;
    }

    const ruleSetId = uuidv4();
    
    // Insert new rule set
    db.prepare(`
      INSERT INTO scoring_rule_sets (id, name, rules_json, is_active)
      VALUES (?, ?, ?, ?)
    `).run(ruleSetId, name, JSON.stringify(rules), active ? 1 : 0);

    // If active, deactivate other rule sets and set in league settings
    if (active) {
      db.prepare('UPDATE scoring_rule_sets SET is_active = 0 WHERE id != ?').run(ruleSetId);
      db.prepare('UPDATE league_settings SET active_scoring_rule_set_id = ? WHERE id = ?').run(ruleSetId, 'default');
    }

    console.log(`[Admin] Rules uploaded: "${name}" (active=${active})`);

    res.status(201).json({ 
      success: true, 
      ruleSetId, 
      name,
      active,
      message: `Scoring rules "${name}" uploaded${active ? ' and activated' : ''}`
    });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'A ruleset with this name already exists' });
      return;
    }
    console.error('Rules upload error:', error);
    res.status(500).json({ error: 'Failed to upload rules', details: error.message });
  }
});

// Get expected rules schema
router.get('/rules/schema', (req: AuthRequest, res: Response) => {
  res.json(getScoringRulesSchema());
});

// Get all scoring rule sets (with full rules for active one)
router.get('/rules', (req: AuthRequest, res: Response) => {
  const rules = db.prepare('SELECT id, name, rules_json, is_active, created_at FROM scoring_rule_sets ORDER BY created_at DESC').all() as any[];
  
  // Parse rules_json for each rule set
  const parsed = rules.map(r => ({
    id: r.id,
    name: r.name,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
    rules: r.rules_json ? JSON.parse(r.rules_json) : null
  }));
  
  // Find the active ruleset
  const active = parsed.find(r => r.isActive);
  
  res.json({
    ruleSets: parsed,
    active: active || null
  });
});

// ========== MANUAL INGEST ENDPOINT ==========

router.post('/ingest/manual', (req: AuthRequest, res: Response) => {
  try {
    const data: IngestData = req.body;

    if (!data || typeof data !== 'object') {
      res.status(400).json({ error: 'Invalid ingest data format.' });
      return;
    }

    const result = processManualIngest(data);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Manual ingest error:', error);
    res.status(500).json({ error: 'Failed to process ingest data', details: error.message });
  }
});

// SportsDataIO ingest
router.post('/ingest/sportsdataio', async (req: AuthRequest, res: Response) => {
  try {
    const { week, season } = req.body;

    if (!week) {
      res.status(400).json({ error: 'Week is required' });
      return;
    }

    if (!isSportsDataIOAvailable()) {
      res.status(400).json({ error: 'SportsDataIO API key not configured' });
      return;
    }

    const data = await fetchSportsDataIO(week, season);
    if (!data) {
      res.status(500).json({ error: 'Failed to fetch from SportsDataIO' });
      return;
    }

    const result = processManualIngest(data);
    res.json({ success: true, source: 'sportsdataio', ...result });
  } catch (error: any) {
    console.error('SportsDataIO error:', error);
    res.status(500).json({ error: 'Failed to process SportsDataIO data' });
  }
});

router.get('/ingest/sportsdataio/status', (req: AuthRequest, res: Response) => {
  res.json({ available: isSportsDataIOAvailable() });
});

router.post('/ingest/bonus', (req: AuthRequest, res: Response) => {
  try {
    const { week, playerName, nflTeam, bonusPoints, description } = req.body;

    if (!week || !playerName || !nflTeam || bonusPoints === undefined || !description) {
      res.status(400).json({ error: 'week, playerName, nflTeam, bonusPoints, description required' });
      return;
    }

    const success = addManualBonus(week, playerName, nflTeam, bonusPoints, description);
    if (!success) {
      res.status(404).json({ error: 'Player or game not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Add bonus error:', error);
    res.status(500).json({ error: 'Failed to add bonus' });
  }
});

// ========== RECOMPUTE SCORES ==========

router.post('/recompute-scores', (req: AuthRequest, res: Response) => {
  try {
    const { week } = req.body;

    if (!week) {
      res.status(400).json({ error: 'Week is required' });
      return;
    }

    const validation = canComputeScores(week);
    if (!validation.canCompute) {
      res.status(400).json({ 
        error: 'Cannot compute scores - missing prerequisites',
        details: validation.errors
      });
      return;
    }

    const result = persistTeamScores(week);
    if (!result.success) {
      res.status(400).json({ error: result.error, details: result.details });
      return;
    }

    res.json({ success: true, week });
  } catch (error: any) {
    console.error('Recompute scores error:', error);
    res.status(500).json({ error: 'Failed to recompute scores' });
  }
});

router.get('/recompute-scores/check/:week', (req: AuthRequest, res: Response) => {
  const { week } = req.params;
  const validation = canComputeScores(parseInt(week));
  res.json(validation);
});

// ========== VIEW DATA ENDPOINTS ==========

// Get conferences
router.get('/conferences', (req: AuthRequest, res: Response) => {
  const conferences = db.prepare('SELECT * FROM conferences ORDER BY name').all();
  res.json(conferences);
});

// Get all teams with conference info
router.get('/teams', (req: AuthRequest, res: Response) => {
  const teams = db.prepare(`
    SELECT t.*, c.name as conference_name 
    FROM teams t 
    JOIN conferences c ON t.conference_id = c.id 
    ORDER BY c.name, t.name
  `).all();
  res.json(teams);
});

// Helper: get current week from league settings
function getCurrentWeek(): number {
  const settings = db.prepare('SELECT current_week FROM league_settings WHERE id = ?').get('default') as { current_week: number } | undefined;
  return settings?.current_week || 1;
}

// Position sort order
const POSITION_ORDER: Record<string, number> = {
  'QB': 1,
  'RB': 2,
  'WR': 3,
  'TE': 4,
  'K': 5,
  'DEF': 6,
};

// ========== SLOT-BASED LINEUP CONSTANTS ==========

const STARTER_SLOTS = ['QB', 'RB', 'WRTE', 'FLEX1', 'FLEX2', 'FLEX3', 'K', 'DEF'] as const;
type SlotType = typeof STARTER_SLOTS[number];

const SLOT_ELIGIBILITY: Record<SlotType, string[]> = {
  'QB': ['QB'],
  'RB': ['RB'],
  'WRTE': ['WR', 'TE'],
  'FLEX1': ['RB', 'WR', 'TE'],
  'FLEX2': ['RB', 'WR', 'TE'],
  'FLEX3': ['RB', 'WR', 'TE'],
  'K': ['K'],
  'DEF': ['DEF'],
};

function isPlayerLocked(nflTeam: string, week: number): { locked: boolean; reason?: string } {
  if (nflTeam === 'Multi' || nflTeam === 'MULTI') {
    return { locked: false };
  }

  const settings = db.prepare('SELECT lock_time FROM league_settings WHERE id = ?').get('default') as { lock_time: string | null } | undefined;
  if (settings?.lock_time && new Date() >= new Date(settings.lock_time)) {
    return { locked: true, reason: 'League is locked' };
  }

  const game = db.prepare(`
    SELECT kickoff_time, status FROM games
    WHERE week = ? AND (home_team_abbr = ? OR away_team_abbr = ?)
  `).get(week, nflTeam, nflTeam) as { kickoff_time: string; status: string } | undefined;

  if (game) {
    if (new Date() >= new Date(game.kickoff_time) || game.status === 'in_progress' || game.status === 'final') {
      return { locked: true, reason: 'Game has started' };
    }
  }

  return { locked: false };
}

interface GameInfo {
  gameId: string;
  opponent: string;
  kickoffUtc: string;
  gameStatus: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  spreadHome: number | null;
  total: number | null;
}

function getGameInfoForPlayer(nflTeam: string, week: number): GameInfo | null {
  if (!nflTeam || nflTeam === 'Multi' || nflTeam === 'MULTI') {
    return null;
  }

  const game = db.prepare(`
    SELECT 
      id, home_team_abbr, away_team_abbr, kickoff_time, status,
      home_score, away_score, spread_home, total
    FROM games
    WHERE week = ? AND (home_team_abbr = ? OR away_team_abbr = ?)
  `).get(week, nflTeam, nflTeam) as {
    id: string;
    home_team_abbr: string;
    away_team_abbr: string;
    kickoff_time: string;
    status: string;
    home_score: number | null;
    away_score: number | null;
    spread_home: number | null;
    total: number | null;
  } | undefined;

  if (!game) return null;

  const isHome = game.home_team_abbr === nflTeam;
  const opponent = isHome ? `vs ${game.away_team_abbr}` : `@ ${game.home_team_abbr}`;

  return {
    gameId: game.id,
    opponent,
    kickoffUtc: game.kickoff_time,
    gameStatus: game.status,
    homeTeam: game.home_team_abbr,
    awayTeam: game.away_team_abbr,
    homeScore: game.home_score,
    awayScore: game.away_score,
    spreadHome: game.spread_home,
    total: game.total,
  };
}

// Get single team with roster and slot-based lineup
router.get('/teams/:teamId', (req: AuthRequest, res: Response) => {
  const { teamId } = req.params;
  const week = req.query.week ? parseInt(req.query.week as string) : getCurrentWeek();

  // Get team info
  const team = db.prepare(`
    SELECT t.id, t.name, t.conference_id, c.name as conference_name
    FROM teams t
    JOIN conferences c ON t.conference_id = c.id
    WHERE t.id = ?
  `).get(teamId) as { id: string; name: string; conference_id: string; conference_name: string } | undefined;

  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  // Get all roster players with their current slot assignments
  const roster = db.prepare(`
    SELECT 
      rp.id as roster_player_id,
      rp.player_id,
      p.display_name,
      p.position,
      p.nfl_team,
      le.slot
    FROM roster_players rp
    JOIN players p ON rp.player_id = p.id
    LEFT JOIN lineup_entries le ON rp.id = le.roster_player_id AND le.week = ?
    WHERE rp.team_id = ?
    ORDER BY p.position, p.display_name
  `).all(week, teamId) as Array<{
    roster_player_id: string;
    player_id: string;
    display_name: string;
    position: string;
    nfl_team: string;
    slot: string | null;
  }>;

  // Build lineup slots object
  const lineup: Record<string, any> = {
    QB: null,
    RB: null,
    WRTE: null,
    FLEX1: null,
    FLEX2: null,
    FLEX3: null,
    K: null,
    DEF: null,
  };

  const bench: any[] = [];

  for (const player of roster) {
    const lockStatus = isPlayerLocked(player.nfl_team, week);
    const gameInfo = getGameInfoForPlayer(player.nfl_team, week);
    const playerData = {
      rosterPlayerId: player.roster_player_id,
      playerId: player.player_id,
      displayName: player.display_name,
      position: player.position,
      nflTeam: player.nfl_team,
      isLocked: lockStatus.locked,
      lockReason: lockStatus.reason,
      game: gameInfo,
    };

    if (player.slot && STARTER_SLOTS.includes(player.slot as SlotType)) {
      lineup[player.slot as SlotType] = playerData;
    } else {
      bench.push(playerData);
    }
  }

  res.json({
    team: {
      id: team.id,
      name: team.name,
      conferenceId: team.conference_id,
      conferenceName: team.conference_name,
    },
    week,
    lineup,
    bench,
  });
});

// Admin: Assign player to slot for any team
router.put('/teams/:teamId/lineup/:week/assign', (req: AuthRequest, res: Response) => {
  const { teamId, week } = req.params;
  const { rosterPlayerId, slot } = req.body;
  const weekNum = parseInt(week);

  if (!rosterPlayerId || !slot) {
    res.status(400).json({ error: 'rosterPlayerId and slot are required' });
    return;
  }

  if (!STARTER_SLOTS.includes(slot)) {
    res.status(400).json({ error: `Invalid slot. Must be one of: ${STARTER_SLOTS.join(', ')}` });
    return;
  }

  // Get the player being assigned
  const player = db.prepare(`
    SELECT rp.id, rp.team_id, p.position, p.nfl_team, p.display_name
    FROM roster_players rp
    JOIN players p ON rp.player_id = p.id
    WHERE rp.id = ? AND rp.team_id = ?
  `).get(rosterPlayerId, teamId) as { id: string; team_id: string; position: string; nfl_team: string; display_name: string } | undefined;

  if (!player) {
    res.status(404).json({ error: 'Player not found on this team roster' });
    return;
  }

  // Check if player is locked
  const lockStatus = isPlayerLocked(player.nfl_team, weekNum);
  if (lockStatus.locked) {
    res.status(403).json({ error: `Cannot modify lineup: ${lockStatus.reason}` });
    return;
  }

  // Validate slot eligibility
  const eligiblePositions = SLOT_ELIGIBILITY[slot as SlotType];
  if (!eligiblePositions.includes(player.position)) {
    res.status(400).json({ 
      error: `${player.position} cannot be placed in ${slot} slot. Eligible: ${eligiblePositions.join(', ')}`
    });
    return;
  }

  // Check if this slot is already occupied
  const currentOccupant = db.prepare(`
    SELECT le.id, le.roster_player_id, p.display_name, p.nfl_team
    FROM lineup_entries le
    JOIN roster_players rp ON le.roster_player_id = rp.id
    JOIN players p ON rp.player_id = p.id
    WHERE rp.team_id = ? AND le.week = ? AND le.slot = ?
  `).get(teamId, weekNum, slot) as { id: string; roster_player_id: string; display_name: string; nfl_team: string } | undefined;

  if (currentOccupant) {
    const occupantLock = isPlayerLocked(currentOccupant.nfl_team, weekNum);
    if (occupantLock.locked) {
      res.status(403).json({ error: `Cannot swap: ${currentOccupant.display_name} is locked (${occupantLock.reason})` });
      return;
    }
  }

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    if (currentOccupant) {
      db.prepare(`
        UPDATE lineup_entries 
        SET slot = NULL, is_starter = 0, updated_at = ?
        WHERE roster_player_id = ? AND week = ?
      `).run(now, currentOccupant.roster_player_id, weekNum);
    }

    const existing = db.prepare('SELECT id FROM lineup_entries WHERE roster_player_id = ? AND week = ?')
      .get(rosterPlayerId, weekNum);

    if (existing) {
      db.prepare(`
        UPDATE lineup_entries 
        SET slot = ?, is_starter = 1, updated_at = ?
        WHERE roster_player_id = ? AND week = ?
      `).run(slot, now, rosterPlayerId, weekNum);
    } else {
      db.prepare(`
        INSERT INTO lineup_entries (id, roster_player_id, week, slot, is_starter, updated_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(uuidv4(), rosterPlayerId, weekNum, slot, now);
    }
  });

  transaction();

  res.json({ 
    success: true, 
    rosterPlayerId, 
    slot,
    playerName: player.display_name,
    swappedOut: currentOccupant?.display_name || null,
  });
});

// Admin: Move player to bench for any team
router.put('/teams/:teamId/lineup/:week/bench', (req: AuthRequest, res: Response) => {
  const { teamId, week } = req.params;
  const { rosterPlayerId } = req.body;
  const weekNum = parseInt(week);

  if (!rosterPlayerId) {
    res.status(400).json({ error: 'rosterPlayerId is required' });
    return;
  }

  const player = db.prepare(`
    SELECT rp.id, rp.team_id, p.nfl_team, p.display_name
    FROM roster_players rp
    JOIN players p ON rp.player_id = p.id
    WHERE rp.id = ? AND rp.team_id = ?
  `).get(rosterPlayerId, teamId) as { id: string; team_id: string; nfl_team: string; display_name: string } | undefined;

  if (!player) {
    res.status(404).json({ error: 'Player not found on this team roster' });
    return;
  }

  const lockStatus = isPlayerLocked(player.nfl_team, weekNum);
  if (lockStatus.locked) {
    res.status(403).json({ error: `Cannot modify lineup: ${lockStatus.reason}` });
    return;
  }

  const now = new Date().toISOString();

  const existing = db.prepare('SELECT id FROM lineup_entries WHERE roster_player_id = ? AND week = ?')
    .get(rosterPlayerId, weekNum);

  if (existing) {
    db.prepare(`
      UPDATE lineup_entries 
      SET slot = NULL, is_starter = 0, updated_at = ?
      WHERE roster_player_id = ? AND week = ?
    `).run(now, rosterPlayerId, weekNum);
  } else {
    db.prepare(`
      INSERT INTO lineup_entries (id, roster_player_id, week, slot, is_starter, updated_at)
      VALUES (?, ?, ?, NULL, 0, ?)
    `).run(uuidv4(), rosterPlayerId, weekNum, now);
  }

  res.json({ 
    success: true, 
    rosterPlayerId,
    playerName: player.display_name,
  });
});

// Get all players
router.get('/players', (req: AuthRequest, res: Response) => {
  const players = db.prepare('SELECT * FROM players ORDER BY position, display_name').all();
  res.json(players);
});

// Get roster for a team
router.get('/roster/:teamId', (req: AuthRequest, res: Response) => {
  const { teamId } = req.params;
  const roster = db.prepare(`
    SELECT rp.id as roster_player_id, rp.team_id, rp.player_id,
           p.display_name, p.position, p.nfl_team
    FROM roster_players rp
    JOIN players p ON rp.player_id = p.id
    WHERE rp.team_id = ?
    ORDER BY p.position, p.display_name
  `).all(teamId);
  res.json(roster);
});

// Get lineup for team and week
router.get('/lineup/:teamId/:week', (req: AuthRequest, res: Response) => {
  const { teamId, week } = req.params;
  const lineup = db.prepare(`
    SELECT le.id as lineup_id, le.roster_player_id, le.week, le.is_starter,
           rp.team_id, rp.player_id,
           p.display_name, p.position, p.nfl_team
    FROM lineup_entries le
    JOIN roster_players rp ON le.roster_player_id = rp.id
    JOIN players p ON rp.player_id = p.id
    WHERE rp.team_id = ? AND le.week = ?
    ORDER BY le.is_starter DESC, p.position, p.display_name
  `).all(teamId, parseInt(week));
  res.json(lineup);
});

// Get all users
router.get('/users', (req: AuthRequest, res: Response) => {
  const users = db.prepare(`
    SELECT u.id, u.email, u.role, u.team_id, t.name as team_name
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    ORDER BY u.role, u.email
  `).all();
  res.json(users);
});

// Create user
router.post('/users', async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, role = 'TEAM', teamId } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, team_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, email, passwordHash, role, teamId || null);

    res.status(201).json({ id: userId, email, role, teamId });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'Email already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Assign user to team (legacy endpoint)
router.put('/users/:userId/team', (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const { teamId } = req.body;
  db.prepare('UPDATE users SET team_id = ? WHERE id = ?').run(teamId, userId);
  res.json({ success: true });
});

// Update user (role and teamId)
router.put('/users/:userId', (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const { role, teamId } = req.body;

  // Validate role if provided
  if (role && !['ADMIN', 'TEAM'].includes(role)) {
    res.status(400).json({ error: 'Invalid role. Must be ADMIN or TEAM' });
    return;
  }

  // Check user exists
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId) as { id: string; email: string } | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // If changing to TEAM, teamId can be set; if ADMIN, clear teamId
  const finalTeamId = role === 'ADMIN' ? null : (teamId !== undefined ? teamId : undefined);

  const now = new Date().toISOString();

  if (role !== undefined && finalTeamId !== undefined) {
    db.prepare('UPDATE users SET role = ?, team_id = ? WHERE id = ?').run(role, finalTeamId, userId);
  } else if (role !== undefined) {
    // Only update role, keep teamId unless ADMIN
    if (role === 'ADMIN') {
      db.prepare('UPDATE users SET role = ?, team_id = NULL WHERE id = ?').run(role, userId);
    } else {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    }
  } else if (teamId !== undefined) {
    db.prepare('UPDATE users SET team_id = ? WHERE id = ?').run(teamId, userId);
  }

  // Get updated user
  const updatedUser = db.prepare(`
    SELECT u.id, u.email, u.role, u.team_id, t.name as team_name
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.id = ?
  `).get(userId);

  res.json({ success: true, user: updatedUser });
});

// Generate random password helper
function generateRandomPassword(length = 12): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Reset user password (admin only) - generates new random password
router.post('/users/:userId/reset-password', async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const { password: providedPassword } = req.body;

  // Check user exists
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId) as { id: string; email: string } | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Use provided password or generate random one
  const newPassword = providedPassword || generateRandomPassword();
  const passwordHash = await bcrypt.hash(newPassword, 10);

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);

  res.json({ 
    success: true, 
    message: `Password reset for ${user.email}`,
    email: user.email,
    newPassword // Return so admin can share with user
  });
});

// Get games for week
router.get('/games/:week', (req: AuthRequest, res: Response) => {
  const { week } = req.params;
  const games = db.prepare('SELECT * FROM games WHERE week = ? ORDER BY kickoff_time').all(parseInt(week));
  res.json(games);
});

// Get league settings
router.get('/settings', (req: AuthRequest, res: Response) => {
  const settings = db.prepare('SELECT * FROM league_settings WHERE id = ?').get('default');
  res.json(settings);
});

// Update league settings
router.put('/settings', (req: AuthRequest, res: Response) => {
  try {
    const { currentWeek, lockTime } = req.body;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE league_settings 
      SET current_week = COALESCE(?, current_week),
          lock_time = ?,
          updated_at = ?
      WHERE id = 'default'
    `).run(currentWeek, lockTime, now);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get scores for week
router.get('/scores/:week', (req: AuthRequest, res: Response) => {
  const { week } = req.params;
  const scores = db.prepare(`
    SELECT ts.*, t.name as team_name, c.name as conference_name
    FROM team_scores ts
    JOIN teams t ON ts.team_id = t.id
    JOIN conferences c ON t.conference_id = c.id
    WHERE ts.week = ?
    ORDER BY ts.starter_points DESC, ts.bench_points DESC
  `).all(parseInt(week));
  res.json(scores);
});

// ========== GAMES ENDPOINTS ==========

interface GameUpload {
  week: number;
  kickoff_utc: string;
  home_team: string;
  away_team: string;
  status?: string;
  home_score?: number | null;
  away_score?: number | null;
  spread_home?: number | null;
  total?: number | null;
}

// Clear all games for a week
router.delete('/games/:week', (req: AuthRequest, res: Response) => {
  const { week } = req.params;
  const weekNum = parseInt(week);

  if (!weekNum || weekNum < 1 || weekNum > 4) {
    res.status(400).json({ error: 'Invalid week number' });
    return;
  }

  try {
    // Get game IDs for this week
    const gameIds = db.prepare('SELECT id FROM games WHERE week = ?')
      .all(weekNum) as Array<{ id: string }>;
    
    if (gameIds.length === 0) {
      res.json({ success: true, week: weekNum, deleted: 0 });
      return;
    }

    const ids = gameIds.map(g => g.id);
    const placeholders = ids.map(() => '?').join(',');

    // Delete related records first (foreign key constraints)
    db.prepare(`DELETE FROM player_game_stats WHERE game_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM team_defense_game_stats WHERE game_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM game_events WHERE game_id IN (${placeholders})`).run(...ids);

    // Now delete the games
    const result = db.prepare('DELETE FROM games WHERE week = ?').run(weekNum);
    
    res.json({ 
      success: true, 
      week: weekNum, 
      deleted: result.changes 
    });
  } catch (error: any) {
    console.error('Clear games error:', error);
    res.status(500).json({ error: 'Failed to clear games', details: error.message });
  }
});

// Upload/upsert games for a week
router.post('/games/upload', (req: AuthRequest, res: Response) => {
  try {
    const { week, games } = req.body as { week: number; games: GameUpload[] };

    if (!week || !games || !Array.isArray(games)) {
      res.status(400).json({ 
        error: 'Invalid payload. Expected: { week: number, games: [{ kickoff_utc, home_team, away_team, ... }] }' 
      });
      return;
    }

    let inserted = 0;
    let updated = 0;

    const upsertGame = db.prepare(`
      INSERT INTO games (id, week, home_team_abbr, away_team_abbr, kickoff_time, status, home_score, away_score, spread_home, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kickoff_time = excluded.kickoff_time,
        status = excluded.status,
        home_score = excluded.home_score,
        away_score = excluded.away_score,
        spread_home = excluded.spread_home,
        total = excluded.total,
        updated_at = datetime('now')
    `);

    // Check if game exists by week + teams
    const findGame = db.prepare(`
      SELECT id FROM games 
      WHERE week = ? AND home_team_abbr = ? AND away_team_abbr = ?
    `);

    for (const game of games) {
      const existingGame = findGame.get(week, game.home_team, game.away_team) as { id: string } | undefined;
      
      const gameId = existingGame?.id || uuidv4();
      const status = game.status || 'scheduled';

      upsertGame.run(
        gameId,
        week,
        game.home_team,
        game.away_team,
        game.kickoff_utc,
        status.toLowerCase(),
        game.home_score ?? null,
        game.away_score ?? null,
        game.spread_home ?? null,
        game.total ?? null
      );

      if (existingGame) {
        updated++;
      } else {
        inserted++;
      }
    }

    res.json({ 
      success: true, 
      week,
      inserted, 
      updated,
      total: games.length 
    });
  } catch (error: any) {
    console.error('Games upload error:', error);
    res.status(500).json({ error: 'Failed to upload games', details: error.message });
  }
});

// Get games for a week (admin)
router.get('/games', (req: AuthRequest, res: Response) => {
  const week = parseInt(req.query.week as string) || 1;
  
  const games = db.prepare(`
    SELECT 
      id,
      week,
      home_team_abbr as homeTeam,
      away_team_abbr as awayTeam,
      kickoff_time as kickoffUtc,
      status,
      home_score as homeScore,
      away_score as awayScore,
      spread_home as spreadHome,
      total
    FROM games 
    WHERE week = ?
    ORDER BY kickoff_time ASC
  `).all(week);

  res.json({ week, games });
});

// Get database status
router.get('/status', (req: AuthRequest, res: Response) => {
  const conferences = db.prepare('SELECT COUNT(*) as count FROM conferences').get() as { count: number };
  const teams = db.prepare('SELECT COUNT(*) as count FROM teams').get() as { count: number };
  const players = db.prepare('SELECT COUNT(*) as count FROM players').get() as { count: number };
  const rosters = db.prepare('SELECT COUNT(*) as count FROM roster_players').get() as { count: number };
  const lineups = db.prepare('SELECT COUNT(*) as count FROM lineup_entries').get() as { count: number };
  const games = db.prepare('SELECT COUNT(*) as count FROM games').get() as { count: number };
  const stats = db.prepare('SELECT COUNT(*) as count FROM player_game_stats').get() as { count: number };
  const rules = db.prepare('SELECT COUNT(*) as count FROM scoring_rule_sets').get() as { count: number };
  const activeRule = db.prepare(`
    SELECT srs.name FROM league_settings ls
    LEFT JOIN scoring_rule_sets srs ON ls.active_scoring_rule_set_id = srs.id
    WHERE ls.id = 'default'
  `).get() as { name: string | null } | undefined;

  res.json({
    conferences: conferences.count,
    teams: teams.count,
    players: players.count,
    rosterEntries: rosters.count,
    lineupEntries: lineups.count,
    games: games.count,
    playerStats: stats.count,
    scoringRuleSets: rules.count,
    activeScoringRules: activeRule?.name || null,
    ready: {
      hasTeams: teams.count > 0,
      hasPlayers: players.count > 0,
      hasRosters: rosters.count > 0,
      hasLineups: lineups.count > 0,
      hasGames: games.count > 0,
      hasStats: stats.count > 0,
      hasScoringRules: rules.count > 0
    }
  });
});

/**
 * DELETE /api/admin/cleanup/week/:week
 * Removes all player_game_stats, team_defense_game_stats, and games for a specific week
 * Use for cleaning up erroneous test data
 */
router.delete('/cleanup/week/:week', (req: AuthRequest, res: Response) => {
  const week = parseInt(req.params.week);
  
  if (isNaN(week) || week < 1) {
    res.status(400).json({ error: 'Invalid week number' });
    return;
  }

  try {
    // Get game IDs for this week
    const games = db.prepare('SELECT id FROM games WHERE week = ?').all(week) as { id: string }[];
    const gameIds = games.map(g => g.id);

    if (gameIds.length === 0) {
      res.json({ 
        message: `No games found for week ${week}`, 
        deleted: { games: 0, playerStats: 0, defenseStats: 0, events: 0 } 
      });
      return;
    }

    // Delete in order: events -> player_stats -> defense_stats -> games
    const placeholders = gameIds.map(() => '?').join(',');
    
    const eventsDeleted = db.prepare(
      `DELETE FROM game_events WHERE game_id IN (${placeholders})`
    ).run(...gameIds);
    
    const playerStatsDeleted = db.prepare(
      `DELETE FROM player_game_stats WHERE game_id IN (${placeholders})`
    ).run(...gameIds);
    
    const defenseStatsDeleted = db.prepare(
      `DELETE FROM team_defense_game_stats WHERE game_id IN (${placeholders})`
    ).run(...gameIds);
    
    const gamesDeleted = db.prepare(
      `DELETE FROM games WHERE week = ?`
    ).run(week);

    res.json({
      message: `Cleaned up week ${week} data`,
      deleted: {
        games: gamesDeleted.changes,
        playerStats: playerStatsDeleted.changes,
        defenseStats: defenseStatsDeleted.changes,
        events: eventsDeleted.changes
      }
    });
  } catch (error: any) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup week data', details: error.message });
  }
});

// ========== WEEKLY WRITEUPS ==========

// Get all writeups
router.get('/writeups', (_req: AuthRequest, res: Response) => {
  try {
    // Check if table exists first
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='weekly_writeups'").get();
    if (!tableExists) {
      return res.json([]); // Return empty array if table doesn't exist yet
    }
    
    const writeups = db.prepare(`
      SELECT id, week, title, content, publish_at, created_at
      FROM weekly_writeups
      ORDER BY week DESC
    `).all();
    res.json(writeups);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch writeups', details: error.message });
  }
});

// Get writeup by week
router.get('/writeups/:week', (req: AuthRequest, res: Response) => {
  try {
    const week = parseInt(req.params.week);
    const writeup = db.prepare(`
      SELECT id, week, title, content, publish_at, created_at
      FROM weekly_writeups
      WHERE week = ?
    `).get(week);
    
    if (!writeup) {
      return res.status(404).json({ error: 'Writeup not found' });
    }
    res.json(writeup);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch writeup', details: error.message });
  }
});

// Create or update writeup
router.post('/writeups', (req: AuthRequest, res: Response) => {
  try {
    const { week, title, content, publishAt } = req.body;
    
    if (!week || !title || !content || !publishAt) {
      return res.status(400).json({ error: 'Missing required fields: week, title, content, publishAt' });
    }
    
    const id = `writeup-${week}`;
    
    db.prepare(`
      INSERT INTO weekly_writeups (id, week, title, content, publish_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (week) DO UPDATE SET
        title = excluded.title,
        content = excluded.content,
        publish_at = excluded.publish_at
    `).run(id, week, title, content, publishAt);
    
    res.json({ success: true, id, week, title, publishAt });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save writeup', details: error.message });
  }
});

// Delete writeup
router.delete('/writeups/:week', (req: AuthRequest, res: Response) => {
  try {
    const week = parseInt(req.params.week);
    const result = db.prepare('DELETE FROM weekly_writeups WHERE week = ?').run(week);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Writeup not found' });
    }
    res.json({ success: true, message: `Deleted writeup for week ${week}` });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete writeup', details: error.message });
  }
});

// ========== DIVISIONAL ROUND SETUP ==========

/**
 * POST /api/admin/setup-divisional
 * Cleans up Wildcard teams and sets up for Divisional round
 * - Keeps only specified winner teams
 * - Clears their rosters
 * - Adds new teams for the round
 */
router.post('/setup-divisional', (req: AuthRequest, res: Response) => {
  try {
    const { keepTeams, newTeams } = req.body;
    
    // keepTeams: array of team names to keep (e.g., ["CMFers", "Pole Patrol"])
    // newTeams: { AFC: ["Team1", "Team2"], NFC: ["Team3", "Team4"] }
    
    if (!keepTeams || !Array.isArray(keepTeams)) {
      return res.status(400).json({ error: 'keepTeams array required' });
    }
    if (!newTeams || !newTeams.AFC || !newTeams.NFC) {
      return res.status(400).json({ error: 'newTeams object with AFC and NFC arrays required' });
    }

    const results: string[] = [];

    // Get teams to keep
    const keepTeamIds = db.prepare(`
      SELECT id FROM teams WHERE name IN (${keepTeams.map(() => '?').join(',')})
    `).all(...keepTeams) as { id: string }[];
    
    const keepIds = keepTeamIds.map(t => t.id);
    results.push(`Keeping ${keepIds.length} teams: ${keepTeams.join(', ')}`);

    // Get teams to delete
    const teamsToDelete = db.prepare(`
      SELECT id, name FROM teams WHERE id NOT IN (${keepIds.map(() => '?').join(',') || "''"})
    `).all(...keepIds) as { id: string; name: string }[];

    // Delete in order: player_scores -> lineup_entries -> roster_players -> users -> teams
    for (const team of teamsToDelete) {
      // Get roster player IDs for this team
      const rosterPlayerIds = db.prepare(
        'SELECT id FROM roster_players WHERE team_id = ?'
      ).all(team.id) as { id: string }[];
      
      if (rosterPlayerIds.length > 0) {
        const rpIds = rosterPlayerIds.map(r => r.id);
        db.prepare(`DELETE FROM player_scores WHERE roster_player_id IN (${rpIds.map(() => '?').join(',')})`).run(...rpIds);
        db.prepare(`DELETE FROM lineup_entries WHERE roster_player_id IN (${rpIds.map(() => '?').join(',')})`).run(...rpIds);
        db.prepare('DELETE FROM roster_players WHERE team_id = ?').run(team.id);
      }
      
      // Delete team scores
      db.prepare('DELETE FROM team_scores WHERE team_id = ?').run(team.id);
      
      // Delete users associated with this team
      db.prepare('DELETE FROM users WHERE team_id = ?').run(team.id);
      
      // Delete the team
      db.prepare('DELETE FROM teams WHERE id = ?').run(team.id);
      
      results.push(`Deleted team: ${team.name}`);
    }

    // Clear rosters for kept teams (but keep the team and users)
    for (const teamId of keepIds) {
      const rosterPlayerIds = db.prepare(
        'SELECT id FROM roster_players WHERE team_id = ?'
      ).all(teamId) as { id: string }[];
      
      if (rosterPlayerIds.length > 0) {
        const rpIds = rosterPlayerIds.map(r => r.id);
        db.prepare(`DELETE FROM player_scores WHERE roster_player_id IN (${rpIds.map(() => '?').join(',')})`).run(...rpIds);
        db.prepare(`DELETE FROM lineup_entries WHERE roster_player_id IN (${rpIds.map(() => '?').join(',')})`).run(...rpIds);
        db.prepare('DELETE FROM roster_players WHERE team_id = ?').run(teamId);
      }
      
      // Delete team scores for the new week
      db.prepare('DELETE FROM team_scores WHERE team_id = ?').run(teamId);
      
      const teamName = db.prepare('SELECT name FROM teams WHERE id = ?').get(teamId) as { name: string };
      results.push(`Cleared roster for: ${teamName.name}`);
    }

    // Get conference IDs
    const afcConf = db.prepare("SELECT id FROM conferences WHERE name = 'AFC'").get() as { id: string };
    const nfcConf = db.prepare("SELECT id FROM conferences WHERE name = 'NFC'").get() as { id: string };

    // Add new AFC teams
    for (const teamName of newTeams.AFC) {
      const teamId = uuidv4();
      db.prepare('INSERT INTO teams (id, name, conference_id) VALUES (?, ?, ?)').run(teamId, teamName, afcConf.id);
      results.push(`Added AFC team: ${teamName}`);
    }

    // Add new NFC teams
    for (const teamName of newTeams.NFC) {
      const teamId = uuidv4();
      db.prepare('INSERT INTO teams (id, name, conference_id) VALUES (?, ?, ?)').run(teamId, teamName, nfcConf.id);
      results.push(`Added NFC team: ${teamName}`);
    }

    res.json({ 
      success: true, 
      message: 'Divisional round setup complete',
      results 
    });
  } catch (error: any) {
    console.error('Setup divisional error:', error);
    res.status(500).json({ error: 'Failed to setup divisional round', details: error.message });
  }
});

export default router;
