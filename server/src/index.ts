import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize database
import db, { initializeDatabase } from './db';
initializeDatabase();

// Auto-seed if database is empty
import { autoSeedIfEmpty } from './seed/runSeed';
autoSeedIfEmpty();

// Import routes
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import teamRoutes from './routes/team';
import scoresRoutes from './routes/scores';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json({ limit: '10mb' })); // Increased limit for stats ingest

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.CLIENT_URL, // Set this in production
].filter(Boolean) as string[];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

/**
 * IMPORTANT ORDERING:
 * - Register API routes first (/api/...)
 * - Then, in production, serve the built client for everything else
 */

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/scores', scoresRoutes);

// Public games endpoint (no auth required)
app.get('/api/games', (req: Request, res: Response) => {
  const week = parseInt(req.query.week as string) || 1;

  const games = db
    .prepare(
      `
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
  `
    )
    .all(week);

  res.json({ week, games });
});

// Public writeup endpoint - returns the active writeup for a week if publish time has passed
app.get('/api/public/writeup/:week', (req: Request, res: Response) => {
  const week = parseInt(req.params.week) || 1;
  const now = new Date().toISOString();
  
  try {
    // Check if table exists first
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='weekly_writeups'").get();
    if (!tableExists) {
      return res.json({ writeup: null });
    }
    
    const writeup = db.prepare(`
      SELECT id, week, title, content, publish_at
      FROM weekly_writeups
      WHERE week = ? AND publish_at <= ?
    `).get(week, now) as { id: string; week: number; title: string; content: string; publish_at: string } | undefined;
    
    if (!writeup) {
      return res.json({ writeup: null });
    }
    
    res.json({ writeup });
  } catch (error) {
    res.json({ writeup: null });
  }
});

// Public scoreboard endpoint (no auth required)
app.get('/api/public/scoreboard/:week', (req: Request, res: Response) => {
  const weekNum = parseInt(req.params.week) || 1;

  const teams = db
    .prepare(
      `
    SELECT 
      t.id,
      t.name,
      c.id as conference_id,
      c.name as conference_name,
      COALESCE(ts.starter_points, 0) as score,
      (SELECT COUNT(*) FROM lineup_entries le 
       JOIN roster_players rp ON le.roster_player_id = rp.id 
       WHERE rp.team_id = t.id AND le.week = ? AND le.slot IS NOT NULL) as starters_count
    FROM teams t
    JOIN conferences c ON t.conference_id = c.id
    LEFT JOIN team_scores ts ON t.id = ts.team_id AND ts.week = ?
    ORDER BY c.name, COALESCE(ts.starter_points, 0) DESC, COALESCE(ts.bench_points, 0) DESC
  `
    )
    .all(weekNum, weekNum) as Array<{
    id: string;
    name: string;
    conference_id: string;
    conference_name: string;
    score: number;
    starters_count: number;
  }>;

  const conferences: Record<string, { id: string; name: string; teams: any[] }> = {};

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
      score: Math.round(team.score),
      minutesLeft: getMinutesLeft(team.id, weekNum),
    });
  }

  res.json({
    week: weekNum,
    conferences: Object.values(conferences),
  });
});

// Helper: calculate minutes left for a team based on starters' game statuses
function getMinutesLeft(teamId: string, week: number): number {
  // Get all starters for this team and their NFL teams
  const starters = db.prepare(`
    SELECT p.nfl_team
    FROM lineup_entries le
    JOIN roster_players rp ON le.roster_player_id = rp.id
    JOIN players p ON rp.player_id = p.id
    WHERE rp.team_id = ? AND le.week = ? AND le.slot IS NOT NULL
  `).all(teamId, week) as Array<{ nfl_team: string }>;

  let minutesLeft = 0;
  
  for (const starter of starters) {
    const game = db.prepare(`
      SELECT status FROM games 
      WHERE week = ? AND (home_team_abbr = ? OR away_team_abbr = ?)
    `).get(week, starter.nfl_team, starter.nfl_team) as { status: string } | undefined;
    
    if (!game) {
      // No game found, assume full 60 minutes
      minutesLeft += 60;
    } else {
      const status = game.status.toLowerCase();
      if (status === 'scheduled') {
        minutesLeft += 60;
      } else if (status === 'in_progress') {
        minutesLeft += 30; // Estimate mid-game
      }
      // 'final' adds 0 minutes
    }
  }
  
  return minutesLeft;
}

// Helper: get game info for a player's NFL team
function getPublicGameInfo(nflTeam: string, week: number) {
  const game = db
    .prepare(
      `
    SELECT 
      id, home_team_abbr, away_team_abbr, kickoff_time, status,
      home_score, away_score, spread_home, total
    FROM games 
    WHERE week = ? AND (home_team_abbr = ? OR away_team_abbr = ?)
  `
    )
    .get(week, nflTeam, nflTeam) as
    | {
        id: string;
        home_team_abbr: string;
        away_team_abbr: string;
        kickoff_time: string;
        status: string;
        home_score: number | null;
        away_score: number | null;
        spread_home: number | null;
        total: number | null;
      }
    | undefined;

  if (!game) return null;

  const isHome = game.home_team_abbr === nflTeam;
  const opponent = isHome ? `vs ${game.away_team_abbr}` : `@ ${game.home_team_abbr}`;

  return {
    opponent,
    kickoffUtc: game.kickoff_time,
    gameStatus: game.status,
    spreadHome: game.spread_home,
    total: game.total,
    isHome,
  };
}

// Helper: generate stat line for public view
function generatePublicStatLine(position: string, playerId: string, nflTeam: string, week: number): string {
  if (position === 'DEF') {
    const defStats = db
      .prepare(
        `
      SELECT * FROM team_defense_game_stats tdgs
      JOIN games g ON tdgs.game_id = g.id
      WHERE tdgs.defense_team_abbr = ? AND g.week = ?
    `
      )
      .get(nflTeam, week) as any;

    if (!defStats) return '';
    const parts: string[] = [];
    parts.push(`PA ${defStats.points_allowed || 0}`);
    parts.push(`Yds ${defStats.yards_allowed || 0}`);
    if (defStats.sacks > 0) parts.push(`Sack ${defStats.sacks}`);
    if (defStats.interceptions > 0) parts.push(`INT ${defStats.interceptions}`);
    if (defStats.fumble_recoveries > 0) parts.push(`FR ${defStats.fumble_recoveries}`);
    if (defStats.defense_tds > 0) parts.push(`TD ${defStats.defense_tds}`);
    if (defStats.return_tds > 0) parts.push(`Ret TD ${defStats.return_tds}`);
    if (defStats.safeties > 0) parts.push(`Safety ${defStats.safeties}`);
    return parts.join(' • ');
  }

  const stats = db
    .prepare(
      `
    SELECT * FROM player_game_stats pgs
    JOIN games g ON pgs.game_id = g.id
    WHERE pgs.player_id = ? AND g.week = ?
  `
    )
    .get(playerId, week) as any;

  if (!stats) return '';

  if (position === 'QB') {
    const parts: string[] = [];
    if (stats.pass_yards > 0 || stats.pass_tds > 0 || stats.pass_attempts > 0) {
      let passLine = `${stats.pass_completions || 0}/${stats.pass_attempts || 0} ${stats.pass_yards || 0}y`;
      if ((stats.pass_tds || 0) > 0) passLine += ` ${stats.pass_tds}TD`;
      if ((stats.pass_interceptions || 0) > 0) passLine += ` ${stats.pass_interceptions}INT`;
      parts.push(passLine);
    }
    if ((stats.rush_attempts || 0) > 0 || (stats.rush_yards || 0) !== 0 || (stats.rush_tds || 0) > 0) {
      let rushLine = `Rush ${stats.rush_attempts || 0}-${stats.rush_yards || 0}`;
      if ((stats.rush_tds || 0) > 0) rushLine += ` ${stats.rush_tds}TD`;
      parts.push(rushLine);
    }
    return parts.join(' • ');
  }

  if (position === 'RB') {
    const parts: string[] = [];
    if ((stats.rush_attempts || 0) > 0 || (stats.rush_yards || 0) !== 0 || (stats.rush_tds || 0) > 0) {
      let rushLine = `${stats.rush_attempts || 0}-${stats.rush_yards || 0}`;
      if ((stats.rush_tds || 0) > 0) rushLine += ` ${stats.rush_tds}TD`;
      parts.push(rushLine);
    }
    if ((stats.receptions || 0) > 0 || (stats.rec_yards || 0) !== 0) {
      let recLine = `Rec ${stats.receptions || 0}-${stats.rec_yards || 0}`;
      if ((stats.rec_tds || 0) > 0) recLine += ` ${stats.rec_tds}TD`;
      parts.push(recLine);
    }
    return parts.join(' • ');
  }

  if (position === 'WR' || position === 'TE') {
    const parts: string[] = [];
    if ((stats.receptions || 0) > 0 || (stats.rec_yards || 0) !== 0) {
      let recLine = `${stats.receptions || 0}-${stats.rec_yards || 0}`;
      if ((stats.rec_tds || 0) > 0) recLine += ` ${stats.rec_tds}TD`;
      parts.push(recLine);
    }
    if ((stats.rush_attempts || 0) > 0 || (stats.rush_yards || 0) !== 0) {
      parts.push(`Rush ${stats.rush_attempts || 0}-${stats.rush_yards || 0}`);
    }
    return parts.join(' • ');
  }

  if (position === 'K') {
    const parts: string[] = [];
    const fgMade =
      (stats.fg_made_0_39 || 0) +
      (stats.fg_made_40_49 || 0) +
      (stats.fg_made_50_54 || 0) +
      (stats.fg_made_55_plus || 0);
    const fgTotal = fgMade + (stats.fg_missed || 0);
    if (fgTotal > 0) {
      let fgLine = `FG ${fgMade}/${fgTotal}`;
      if ((stats.fg_long || 0) > 0) fgLine += ` (${stats.fg_long}L)`;
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

// Public team roster view (no auth required)
app.get('/api/public/team/:teamId', (req: Request, res: Response) => {
  const { teamId } = req.params;
  const weekNum = parseInt(req.query.week as string) || 1;

  const team = db
    .prepare(
      `
    SELECT t.id, t.name, c.name as conference_name
    FROM teams t
    JOIN conferences c ON t.conference_id = c.id
    WHERE t.id = ?
  `
    )
    .get(teamId) as { id: string; name: string; conference_name: string } | undefined;

  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  // Get starters
  const starters = db
    .prepare(
      `
    SELECT 
      rp.player_id,
      p.display_name,
      p.position,
      p.nfl_team,
      le.slot,
      COALESCE(ps.points, 0) as points
    FROM roster_players rp
    JOIN players p ON rp.player_id = p.id
    LEFT JOIN lineup_entries le ON rp.id = le.roster_player_id AND le.week = ?
    LEFT JOIN player_scores ps ON rp.id = ps.roster_player_id AND ps.week = ?
    WHERE rp.team_id = ? AND le.slot IS NOT NULL
    ORDER BY 
      CASE le.slot 
        WHEN 'QB' THEN 1 WHEN 'RB' THEN 2 WHEN 'WRTE' THEN 3 
        WHEN 'FLEX1' THEN 4 WHEN 'FLEX2' THEN 5 WHEN 'FLEX3' THEN 6 
        WHEN 'K' THEN 7 WHEN 'DEF' THEN 8 
      END
  `
    )
    .all(weekNum, weekNum, teamId) as Array<{
    player_id: string;
    display_name: string;
    position: string;
    nfl_team: string;
    slot: string;
    points: number;
  }>;

  // Get bench players
  const bench = db
    .prepare(
      `
    SELECT 
      rp.player_id,
      p.display_name,
      p.position,
      p.nfl_team,
      COALESCE(ps.points, 0) as points
    FROM roster_players rp
    JOIN players p ON rp.player_id = p.id
    LEFT JOIN lineup_entries le ON rp.id = le.roster_player_id AND le.week = ?
    LEFT JOIN player_scores ps ON rp.id = ps.roster_player_id AND ps.week = ?
    WHERE rp.team_id = ? AND (le.slot IS NULL OR le.id IS NULL)
    ORDER BY p.position, p.display_name
  `
    )
    .all(weekNum, weekNum, teamId) as Array<{
    player_id: string;
    display_name: string;
    position: string;
    nfl_team: string;
    points: number;
  }>;

  const totalPoints = Math.round(starters.reduce((sum, p) => sum + p.points, 0));

  res.json({
    team: {
      id: team.id,
      name: team.name,
      conferenceName: team.conference_name,
      totalPoints,
      minutesLeft: getMinutesLeft(teamId, weekNum),
    },
    starters: starters.map((p) => ({
      displayName: p.display_name,
      position: p.position,
      nflTeam: p.nfl_team,
      slot: p.slot,
      points: Math.round(p.points),
      statLine: generatePublicStatLine(p.position, p.player_id, p.nfl_team, weekNum),
      game: getPublicGameInfo(p.nfl_team, weekNum),
    })),
    bench: bench.map((p) => ({
      displayName: p.display_name,
      position: p.position,
      nflTeam: p.nfl_team,
      points: Math.round(p.points),
      statLine: generatePublicStatLine(p.position, p.player_id, p.nfl_team, weekNum),
      game: getPublicGameInfo(p.nfl_team, weekNum),
    })),
    week: weekNum,
  });
});

/**
 * Serve the built client in production
 * This must be AFTER all /api routes and must NOT be blocked by a "/" health route.
 */
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  console.log(`Production mode: serving static files from ${clientDist}`);

  app.use(express.static(clientDist));

  // SPA fallback for React Router (Express 5 syntax)
  app.get('{*splat}', (req: Request, res: Response) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });

} else {
  // Dev-only health check
  app.get('/', (req: Request, res: Response) => {
    res.send('Wildcard Fantasy API running');
  });
}

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: Function) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
  console.log(`Database path: ${process.env.DATABASE_PATH || 'data/wildcard.db'}`);
});

export default app;
