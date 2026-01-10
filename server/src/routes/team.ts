import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, requireTeamOrAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// All team routes require authentication
router.use(authenticate, requireTeamOrAdmin);

// ========== CONSTANTS ==========

// Valid slot values
const STARTER_SLOTS = ['QB', 'RB', 'WRTE', 'FLEX1', 'FLEX2', 'FLEX3', 'K', 'DEF'] as const;
type SlotType = typeof STARTER_SLOTS[number];

// Slot eligibility rules
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

// ========== LINEUP LOCKING LOGIC ==========

interface LeagueSettingsRow {
  lock_time: string | null;
  current_week: number;
}

function isPlayerLocked(nflTeam: string, week: number): { locked: boolean; reason?: string } {
  // MULTI players stay unlocked with warning
  if (nflTeam === 'Multi' || nflTeam === 'MULTI') {
    return { locked: false };
  }

  // Check global lock time first
  const settings = db.prepare('SELECT lock_time, current_week FROM league_settings WHERE id = ?')
    .get('default') as LeagueSettingsRow;
  
  if (settings?.lock_time) {
    const lockTime = new Date(settings.lock_time);
    if (new Date() >= lockTime) {
      return { locked: true, reason: 'League is locked for the week' };
    }
  }

  // Check if player's game has started
  const game = db.prepare(`
    SELECT id, kickoff_time, status
    FROM games
    WHERE week = ? AND (home_team_abbr = ? OR away_team_abbr = ?)
  `).get(week, nflTeam, nflTeam) as { id: string; kickoff_time: string; status: string } | undefined;

  if (game) {
    const kickoff = new Date(game.kickoff_time);
    if (new Date() >= kickoff || game.status === 'in_progress' || game.status === 'final') {
      return { locked: true, reason: 'Game has started' };
    }
  }

  return { locked: false };
}

function getCurrentWeek(): number {
  const settings = db.prepare('SELECT current_week FROM league_settings WHERE id = ?').get('default') as { current_week: number } | undefined;
  return settings?.current_week || 1;
}

interface GameInfo {
  gameId: string;
  opponent: string;      // e.g. "vs DAL" or "@ DAL"
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
      id,
      home_team_abbr,
      away_team_abbr,
      kickoff_time,
      status,
      home_score,
      away_score,
      spread_home,
      total
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

// ========== TEAM INFO ==========

router.get('/my-team', (req: AuthRequest, res: Response) => {
  if (!req.user?.teamId) {
    res.status(400).json({ error: 'No team assigned' });
    return;
  }

  const team = db.prepare(`
    SELECT t.*, c.name as conference_name
    FROM teams t
    JOIN conferences c ON t.conference_id = c.id
    WHERE t.id = ?
  `).get(req.user.teamId);
  
  res.json(team);
});

// ========== NEW SLOT-BASED LINEUP ==========

interface RosterPlayerRow {
  roster_player_id: string;
  player_id: string;
  display_name: string;
  position: string;
  nfl_team: string;
  slot: string | null;
}

/**
 * GET /api/team/lineup/:week
 * Returns team lineup with explicit slots
 */
router.get('/lineup/:week', (req: AuthRequest, res: Response) => {
  const { week } = req.params;
  const teamId = req.user?.teamId;

  if (!teamId && req.user?.role !== 'ADMIN') {
    res.status(400).json({ error: 'No team assigned' });
    return;
  }

  const targetTeamId = req.user?.role === 'ADMIN' && req.query.teamId 
    ? req.query.teamId as string 
    : teamId;

  if (!targetTeamId) {
    res.status(400).json({ error: 'Team ID required' });
    return;
  }

  const weekNum = parseInt(week);

  // Get team info
  const team = db.prepare(`
    SELECT t.id, t.name, c.name as conference_name
    FROM teams t
    JOIN conferences c ON t.conference_id = c.id
    WHERE t.id = ?
  `).get(targetTeamId) as { id: string; name: string; conference_name: string } | undefined;

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
  `).all(weekNum, targetTeamId) as RosterPlayerRow[];

  // Build lineup slots object
  const lineup: Record<SlotType, any> = {
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
    const lockStatus = isPlayerLocked(player.nfl_team, weekNum);
    const gameInfo = getGameInfoForPlayer(player.nfl_team, weekNum);
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
      conferenceName: team.conference_name,
    },
    week: weekNum,
    lineup,
    bench,
  });
});

/**
 * PUT /api/team/lineup/:week/assign
 * Assign a player to a slot
 */
router.put('/lineup/:week/assign', (req: AuthRequest, res: Response) => {
  const { week } = req.params;
  const { rosterPlayerId, slot } = req.body;
  const teamId = req.user?.teamId;

  if (!teamId) {
    res.status(400).json({ error: 'No team assigned' });
    return;
  }

  if (!rosterPlayerId || !slot) {
    res.status(400).json({ error: 'rosterPlayerId and slot are required' });
    return;
  }

  if (!STARTER_SLOTS.includes(slot)) {
    res.status(400).json({ error: `Invalid slot. Must be one of: ${STARTER_SLOTS.join(', ')}` });
    return;
  }

  const weekNum = parseInt(week);

  // Get the player being assigned
  const player = db.prepare(`
    SELECT rp.id, rp.team_id, p.position, p.nfl_team, p.display_name
    FROM roster_players rp
    JOIN players p ON rp.player_id = p.id
    WHERE rp.id = ? AND rp.team_id = ?
  `).get(rosterPlayerId, teamId) as { id: string; team_id: string; position: string; nfl_team: string; display_name: string } | undefined;

  if (!player) {
    res.status(404).json({ error: 'Player not found on your roster' });
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

  // Check if the player being assigned is locked (for swap scenario)
  if (currentOccupant) {
    const occupantLock = isPlayerLocked(currentOccupant.nfl_team, weekNum);
    if (occupantLock.locked) {
      res.status(403).json({ error: `Cannot swap: ${currentOccupant.display_name} is locked (${occupantLock.reason})` });
      return;
    }
  }

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    // If slot is occupied, move the occupant to bench (set slot to null)
    if (currentOccupant) {
      db.prepare(`
        UPDATE lineup_entries 
        SET slot = NULL, is_starter = 0, updated_at = ?
        WHERE roster_player_id = ? AND week = ?
      `).run(now, currentOccupant.roster_player_id, weekNum);
    }

    // Check if the player already has a lineup entry for this week
    const existing = db.prepare('SELECT id, slot FROM lineup_entries WHERE roster_player_id = ? AND week = ?')
      .get(rosterPlayerId, weekNum) as { id: string; slot: string | null } | undefined;

    if (existing) {
      // Update existing entry
      db.prepare(`
        UPDATE lineup_entries 
        SET slot = ?, is_starter = 1, updated_at = ?
        WHERE roster_player_id = ? AND week = ?
      `).run(slot, now, rosterPlayerId, weekNum);
    } else {
      // Create new entry
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

/**
 * PUT /api/team/lineup/:week/bench
 * Move a player to bench (clear their slot)
 */
router.put('/lineup/:week/bench', (req: AuthRequest, res: Response) => {
  const { week } = req.params;
  const { rosterPlayerId } = req.body;
  const teamId = req.user?.teamId;

  if (!teamId) {
    res.status(400).json({ error: 'No team assigned' });
    return;
  }

  if (!rosterPlayerId) {
    res.status(400).json({ error: 'rosterPlayerId is required' });
    return;
  }

  const weekNum = parseInt(week);

  // Get the player
  const player = db.prepare(`
    SELECT rp.id, rp.team_id, p.nfl_team, p.display_name
    FROM roster_players rp
    JOIN players p ON rp.player_id = p.id
    WHERE rp.id = ? AND rp.team_id = ?
  `).get(rosterPlayerId, teamId) as { id: string; team_id: string; nfl_team: string; display_name: string } | undefined;

  if (!player) {
    res.status(404).json({ error: 'Player not found on your roster' });
    return;
  }

  // Check if player is locked
  const lockStatus = isPlayerLocked(player.nfl_team, weekNum);
  if (lockStatus.locked) {
    res.status(403).json({ error: `Cannot modify lineup: ${lockStatus.reason}` });
    return;
  }

  const now = new Date().toISOString();

  // Check if entry exists
  const existing = db.prepare('SELECT id FROM lineup_entries WHERE roster_player_id = ? AND week = ?')
    .get(rosterPlayerId, weekNum);

  if (existing) {
    db.prepare(`
      UPDATE lineup_entries 
      SET slot = NULL, is_starter = 0, updated_at = ?
      WHERE roster_player_id = ? AND week = ?
    `).run(now, rosterPlayerId, weekNum);
  } else {
    // Create entry with no slot (bench)
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

// ========== SCORES ==========

router.get('/scores/:week', (req: AuthRequest, res: Response) => {
  const { week } = req.params;
  const teamId = req.user?.teamId;

  if (!teamId && req.user?.role !== 'ADMIN') {
    res.status(400).json({ error: 'No team assigned' });
    return;
  }

  const targetTeamId = req.user?.role === 'ADMIN' && req.query.teamId 
    ? req.query.teamId as string 
    : teamId;

  if (!targetTeamId) {
    res.status(400).json({ error: 'Team ID required' });
    return;
  }

  const weekNum = parseInt(week);

  const teamScore = db.prepare(`
    SELECT ts.*, t.name as team_name
    FROM team_scores ts
    JOIN teams t ON ts.team_id = t.id
    WHERE ts.team_id = ? AND ts.week = ?
  `).get(targetTeamId, weekNum);

  const playerScores = db.prepare(`
    SELECT ps.*, p.display_name, p.position, p.nfl_team
    FROM player_scores ps
    JOIN roster_players rp ON ps.roster_player_id = rp.id
    JOIN players p ON rp.player_id = p.id
    WHERE rp.team_id = ? AND ps.week = ?
    ORDER BY ps.is_starter DESC, ps.points DESC
  `).all(targetTeamId, weekNum);

  res.json({
    teamScore: teamScore || null,
    playerScores
  });
});

// Get standings for week
router.get('/standings/:week', (req: AuthRequest, res: Response) => {
  const { week } = req.params;
  const weekNum = parseInt(week);

  const standings = db.prepare(`
    SELECT ts.*, t.name as team_name, c.name as conference_name
    FROM team_scores ts
    JOIN teams t ON ts.team_id = t.id
    JOIN conferences c ON t.conference_id = c.id
    WHERE ts.week = ?
    ORDER BY ts.starter_points DESC, ts.bench_points DESC
  `).all(weekNum);

  res.json(standings);
});

// Get games for week
router.get('/games/:week', (req: AuthRequest, res: Response) => {
  const { week } = req.params;
  const games = db.prepare('SELECT * FROM games WHERE week = ? ORDER BY kickoff_time').all(parseInt(week));
  res.json(games);
});

// Get league settings
router.get('/league', (req: AuthRequest, res: Response) => {
  const settings = db.prepare(`
    SELECT current_week, lock_time 
    FROM league_settings 
    WHERE id = 'default'
  `).get();
  res.json(settings);
});

// ========== SCOREBOARD ==========

interface ScoreboardTeam {
  id: string;
  name: string;
  score: number;
  conferenceId: string;
  conferenceName: string;
  lineupSet: boolean;
}

/**
 * GET /api/team/scoreboard/:week
 * Returns all teams grouped by conference with scores for the scoreboard
 */
router.get('/scoreboard/:week', (req: AuthRequest, res: Response) => {
  const weekNum = parseInt(req.params.week);

  // Get all teams with their conference info and scores
  const teams = db.prepare(`
    SELECT 
      t.id,
      t.name,
      t.conference_id,
      c.name as conference_name,
      COALESCE(ts.starter_points, 0) as score,
      (SELECT COUNT(*) FROM lineup_entries le 
       JOIN roster_players rp ON le.roster_player_id = rp.id 
       WHERE rp.team_id = t.id AND le.week = ? AND le.slot IS NOT NULL) as starters_count
    FROM teams t
    JOIN conferences c ON t.conference_id = c.id
    LEFT JOIN team_scores ts ON t.id = ts.team_id AND ts.week = ?
    ORDER BY c.name, COALESCE(ts.starter_points, 0) DESC, COALESCE(ts.bench_points, 0) DESC
  `).all(weekNum, weekNum) as Array<{
    id: string;
    name: string;
    conference_id: string;
    conference_name: string;
    score: number;
    starters_count: number;
  }>;

  // Group by conference
  const conferences: Record<string, { id: string; name: string; teams: ScoreboardTeam[] }> = {};

  for (const team of teams) {
    if (!conferences[team.conference_id]) {
      conferences[team.conference_id] = {
        id: team.conference_id,
        name: team.conference_name,
        teams: [],
      };
    }
    conferences[team.conference_id].teams.push({
      id: team.id,
      name: team.name,
      score: team.score,
      conferenceId: team.conference_id,
      conferenceName: team.conference_name,
      lineupSet: team.starters_count >= 8, // All 8 slots filled
    });
  }

  // Get current user's team info if available
  let userTeam = null;
  if (req.user?.teamId) {
    const ut = teams.find(t => t.id === req.user?.teamId);
    if (ut) {
      userTeam = {
        id: ut.id,
        name: ut.name,
        conferenceName: ut.conference_name,
      };
    }
  }

  res.json({
    week: weekNum,
    conferences: Object.values(conferences),
    userTeam,
  });
});

// ========== STAT LINE HELPERS ==========

interface PlayerGameStatsRow {
  pass_yards: number;
  pass_tds: number;
  pass_interceptions: number;
  pass_2pt_conversions: number;
  pass_attempts: number;
  pass_completions: number;
  rush_yards: number;
  rush_tds: number;
  rush_2pt_conversions: number;
  rush_attempts: number;
  receptions: number;
  rec_yards: number;
  rec_tds: number;
  rec_2pt_conversions: number;
  fumbles_lost: number;
  fg_made_0_39: number;
  fg_made_40_49: number;
  fg_made_50_54: number;
  fg_made_55_plus: number;
  fg_missed: number;
  fg_long: number;
  xp_made: number;
  xp_missed: number;
}

interface DefenseGameStatsRow {
  points_allowed: number;
  yards_allowed: number;
  sacks: number;
  interceptions: number;
  fumble_recoveries: number;
  defense_tds: number;
  safeties: number;
  blocked_kicks: number;
  return_tds: number;
}

/**
 * Generate a compact stat line based on position
 */
function generateStatLine(position: string, stats: PlayerGameStatsRow | null, defStats: DefenseGameStatsRow | null): string {
  if (position === 'DEF' && defStats) {
    const parts: string[] = [];
    parts.push(`PA ${defStats.points_allowed}`);
    parts.push(`Yds ${defStats.yards_allowed}`);
    if (defStats.sacks > 0) parts.push(`Sack ${defStats.sacks}`);
    if (defStats.interceptions > 0) parts.push(`INT ${defStats.interceptions}`);
    if (defStats.fumble_recoveries > 0) parts.push(`FR ${defStats.fumble_recoveries}`);
    if (defStats.defense_tds > 0) parts.push(`TD ${defStats.defense_tds}`);
    if (defStats.return_tds > 0) parts.push(`Ret TD ${defStats.return_tds}`);
    if (defStats.safeties > 0) parts.push(`Safety ${defStats.safeties}`);
    return parts.join(' • ');
  }

  if (!stats) return '';

  if (position === 'QB') {
    const parts: string[] = [];
    // Passing: completions/attempts yards TDs INTs
    if (stats.pass_yards > 0 || stats.pass_tds > 0) {
      const passLine = `${stats.pass_completions || 0}/${stats.pass_attempts || 0} ${stats.pass_yards}y`;
      const tds = stats.pass_tds > 0 ? ` ${stats.pass_tds}TD` : '';
      const ints = stats.pass_interceptions > 0 ? ` ${stats.pass_interceptions}INT` : '';
      parts.push(passLine + tds + ints);
    }
    // Rushing
    if (stats.rush_yards > 0 || stats.rush_tds > 0) {
      let rushLine = `Rush ${stats.rush_attempts || 0}-${stats.rush_yards}`;
      if (stats.rush_tds > 0) rushLine += ` ${stats.rush_tds}TD`;
      parts.push(rushLine);
    }
    return parts.join(' • ');
  }

  if (position === 'RB') {
    const parts: string[] = [];
    // Rushing
    if (stats.rush_yards > 0 || stats.rush_tds > 0) {
      let rushLine = `${stats.rush_attempts || 0}-${stats.rush_yards}`;
      if (stats.rush_tds > 0) rushLine += ` ${stats.rush_tds}TD`;
      parts.push(rushLine);
    }
    // Receiving
    if (stats.receptions > 0 || stats.rec_yards > 0) {
      let recLine = `Rec ${stats.receptions}-${stats.rec_yards}`;
      if (stats.rec_tds > 0) recLine += ` ${stats.rec_tds}TD`;
      parts.push(recLine);
    }
    return parts.join(' • ');
  }

  if (position === 'WR' || position === 'TE') {
    const parts: string[] = [];
    // Receiving
    if (stats.receptions > 0 || stats.rec_yards > 0) {
      let recLine = `${stats.receptions}-${stats.rec_yards}`;
      if (stats.rec_tds > 0) recLine += ` ${stats.rec_tds}TD`;
      parts.push(recLine);
    }
    // Rushing (rare but possible)
    if (stats.rush_yards > 0 || stats.rush_tds > 0) {
      let rushLine = `Rush ${stats.rush_attempts || 0}-${stats.rush_yards}`;
      if (stats.rush_tds > 0) rushLine += ` ${stats.rush_tds}TD`;
      parts.push(rushLine);
    }
    return parts.join(' • ');
  }

  if (position === 'K') {
    const parts: string[] = [];
    const fgMade = (stats.fg_made_0_39 || 0) + (stats.fg_made_40_49 || 0) + (stats.fg_made_50_54 || 0) + (stats.fg_made_55_plus || 0);
    const fgTotal = fgMade + (stats.fg_missed || 0);
    if (fgTotal > 0) {
      let fgLine = `FG ${fgMade}/${fgTotal}`;
      if (stats.fg_long > 0) fgLine += ` (${stats.fg_long}L)`;
      parts.push(fgLine);
    }
    const xpTotal = (stats.xp_made || 0) + (stats.xp_missed || 0);
    if (xpTotal > 0) {
      parts.push(`XP ${stats.xp_made || 0}/${xpTotal}`);
    }
    return parts.join(' • ');
  }

  return '';
}

/**
 * Parse breakdown JSON into an array of { label, points }
 */
function parseBreakdown(breakdownJson: string | null): Array<{ label: string; points: number }> {
  if (!breakdownJson) return [];
  try {
    const breakdown = JSON.parse(breakdownJson);
    if (Array.isArray(breakdown)) {
      return breakdown.map((item: any) => ({
        label: item.label || item.category || item.stat || 'Points',
        points: Math.round(item.points || 0),
      })).filter((item: any) => item.points !== 0);
    }
  } catch (e) {
    // Invalid JSON
  }
  return [];
}

/**
 * GET /api/team/matchup/:week/:teamId
 * Returns detailed matchup view for a team (their lineup + conference rivals)
 */
router.get('/matchup/:week/:teamId', (req: AuthRequest, res: Response) => {
  const weekNum = parseInt(req.params.week);
  const { teamId } = req.params;

  // Get the team info
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

  // Get the team's lineup with player scores and stats
  const roster = db.prepare(`
    SELECT 
      rp.id as roster_player_id,
      rp.player_id,
      p.display_name,
      p.position,
      p.nfl_team,
      le.slot,
      COALESCE(ps.points, 0) as points,
      ps.breakdown_json
    FROM roster_players rp
    JOIN players p ON rp.player_id = p.id
    LEFT JOIN lineup_entries le ON rp.id = le.roster_player_id AND le.week = ?
    LEFT JOIN player_scores ps ON rp.id = ps.roster_player_id AND ps.week = ?
    WHERE rp.team_id = ?
    ORDER BY 
      CASE le.slot 
        WHEN 'QB' THEN 1 WHEN 'RB' THEN 2 WHEN 'WRTE' THEN 3 
        WHEN 'FLEX1' THEN 4 WHEN 'FLEX2' THEN 5 WHEN 'FLEX3' THEN 6 
        WHEN 'K' THEN 7 WHEN 'DEF' THEN 8 ELSE 9 
      END,
      p.display_name
  `).all(weekNum, weekNum, teamId) as Array<{
    roster_player_id: string;
    player_id: string;
    display_name: string;
    position: string;
    nfl_team: string;
    slot: string | null;
    points: number;
    breakdown_json: string | null;
  }>;

  // Helper to get player stats
  const getPlayerStats = (playerId: string): PlayerGameStatsRow | null => {
    const stats = db.prepare(`
      SELECT pgs.* FROM player_game_stats pgs
      JOIN games g ON pgs.game_id = g.id
      WHERE pgs.player_id = ? AND g.week = ?
    `).get(playerId, weekNum) as PlayerGameStatsRow | undefined;
    return stats || null;
  };

  // Helper to get defense stats
  const getDefenseStats = (nflTeam: string): DefenseGameStatsRow | null => {
    const stats = db.prepare(`
      SELECT tdgs.* FROM team_defense_game_stats tdgs
      JOIN games g ON tdgs.game_id = g.id
      WHERE tdgs.defense_team_abbr = ? AND g.week = ?
    `).get(nflTeam, weekNum) as DefenseGameStatsRow | undefined;
    return stats || null;
  };

  // Map roster to include stats and stat lines
  const mapPlayer = (p: typeof roster[0]) => {
    const playerStats = p.position !== 'DEF' ? getPlayerStats(p.player_id) : null;
    const defenseStats = p.position === 'DEF' ? getDefenseStats(p.nfl_team) : null;
    const statLine = generateStatLine(p.position, playerStats, defenseStats);
    const breakdown = parseBreakdown(p.breakdown_json);
    const roundedPoints = Math.round(p.points);

    return {
      displayName: p.display_name,
      position: p.position,
      nflTeam: p.nfl_team,
      slot: p.slot,
      points: roundedPoints,
      statLine,
      breakdown,
      game: getGameInfoForPlayer(p.nfl_team, weekNum),
    };
  };

  const starters = roster.filter(p => p.slot !== null).map(mapPlayer);
  const bench = roster.filter(p => p.slot === null).map(mapPlayer);
  const starterPoints = Math.round(starters.reduce((sum, p) => sum + p.points, 0));
  const benchPoints = Math.round(bench.reduce((sum, p) => sum + p.points, 0));

  // Get all teams in the same conference for the pool view
  const conferenceTeams = db.prepare(`
    SELECT 
      t.id,
      t.name,
      COALESCE(ts.starter_points, 0) as score,
      (SELECT COUNT(*) FROM lineup_entries le 
       JOIN roster_players rp ON le.roster_player_id = rp.id 
       WHERE rp.team_id = t.id AND le.week = ? AND le.slot IS NOT NULL) as starters_count
    FROM teams t
    LEFT JOIN team_scores ts ON t.id = ts.team_id AND ts.week = ?
    WHERE t.conference_id = ?
    ORDER BY COALESCE(ts.starter_points, 0) DESC, COALESCE(ts.bench_points, 0) DESC
  `).all(weekNum, weekNum, team.conference_id) as Array<{
    id: string;
    name: string;
    score: number;
    starters_count: number;
  }>;

  // Calculate rank
  const rank = conferenceTeams.findIndex(t => t.id === teamId) + 1;

  res.json({
    team: {
      id: team.id,
      name: team.name,
      conferenceName: team.conference_name,
      starterPoints,
      benchPoints,
      totalPoints: starterPoints + benchPoints,
      rank,
    },
    starters,
    bench,
    conferencePool: conferenceTeams.map(t => ({
      id: t.id,
      name: t.name,
      score: Math.round(t.score),
      lineupSet: t.starters_count >= 8,
      isCurrentTeam: t.id === teamId,
    })),
    week: weekNum,
  });
});

export default router;
