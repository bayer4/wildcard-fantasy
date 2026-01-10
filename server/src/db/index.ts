import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/wildcard.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

export default db;

// Initialize database schema
export function initializeDatabase(): void {
  db.exec(`
    -- Conferences (AFC, NFC)
    CREATE TABLE IF NOT EXISTS conferences (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Fantasy Teams (belong to a conference)
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      conference_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conference_id) REFERENCES conferences(id)
    );

    -- NFL Players (global table - real-life players)
    -- Players can appear on multiple fantasy teams
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      position TEXT NOT NULL CHECK (position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF')),
      nfl_team TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (display_name, position, nfl_team)
    );

    -- Roster: join table linking fantasy teams to players
    -- A player CAN appear on multiple fantasy teams
    CREATE TABLE IF NOT EXISTS roster_players (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (player_id) REFERENCES players(id),
      UNIQUE (team_id, player_id)
    );

    -- Lineup: tracks slot assignment per week
    -- References roster_players to know which team-player combo
    -- slot values: QB, RB, WRTE, FLEX1, FLEX2, FLEX3, K, DEF (null = bench)
    CREATE TABLE IF NOT EXISTS lineup_entries (
      id TEXT PRIMARY KEY,
      roster_player_id TEXT NOT NULL,
      week INTEGER NOT NULL,
      slot TEXT CHECK (slot IS NULL OR slot IN ('QB', 'RB', 'WRTE', 'FLEX1', 'FLEX2', 'FLEX3', 'K', 'DEF')),
      is_starter INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (roster_player_id) REFERENCES roster_players(id),
      UNIQUE (roster_player_id, week)
    );

    -- NFL Games
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      week INTEGER NOT NULL,
      home_team_abbr TEXT NOT NULL,
      away_team_abbr TEXT NOT NULL,
      kickoff_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'final')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Player game stats (box scores)
    CREATE TABLE IF NOT EXISTS player_game_stats (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      pass_yards INTEGER DEFAULT 0,
      pass_tds INTEGER DEFAULT 0,
      pass_interceptions INTEGER DEFAULT 0,
      pass_2pt_conversions INTEGER DEFAULT 0,
      rush_yards INTEGER DEFAULT 0,
      rush_tds INTEGER DEFAULT 0,
      rush_2pt_conversions INTEGER DEFAULT 0,
      receptions INTEGER DEFAULT 0,
      rec_yards INTEGER DEFAULT 0,
      rec_tds INTEGER DEFAULT 0,
      rec_2pt_conversions INTEGER DEFAULT 0,
      fumbles_lost INTEGER DEFAULT 0,
      fg_made_0_39 INTEGER DEFAULT 0,
      fg_made_40_49 INTEGER DEFAULT 0,
      fg_made_50_54 INTEGER DEFAULT 0,
      fg_made_55_plus INTEGER DEFAULT 0,
      fg_missed INTEGER DEFAULT 0,
      xp_made INTEGER DEFAULT 0,
      xp_missed INTEGER DEFAULT 0,
      raw_json TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (game_id) REFERENCES games(id),
      UNIQUE (player_id, game_id)
    );

    -- Team defense game stats
    CREATE TABLE IF NOT EXISTS team_defense_game_stats (
      id TEXT PRIMARY KEY,
      defense_team_abbr TEXT NOT NULL,
      game_id TEXT NOT NULL,
      points_allowed INTEGER DEFAULT 0,
      yards_allowed INTEGER DEFAULT 0,
      sacks INTEGER DEFAULT 0,
      interceptions INTEGER DEFAULT 0,
      fumble_recoveries INTEGER DEFAULT 0,
      defense_tds INTEGER DEFAULT 0,
      safeties INTEGER DEFAULT 0,
      blocked_kicks INTEGER DEFAULT 0,
      return_tds INTEGER DEFAULT 0,
      raw_json TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (game_id) REFERENCES games(id),
      UNIQUE (defense_team_abbr, game_id)
    );

    -- Game events (for bonus calculations)
    CREATE TABLE IF NOT EXISTS game_events (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      player_id TEXT,
      event_type TEXT NOT NULL,
      yards INTEGER,
      description TEXT,
      bonus_points REAL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (player_id) REFERENCES players(id)
    );

    -- Scoring rule sets
    CREATE TABLE IF NOT EXISTS scoring_rule_sets (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      rules_json TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Team scores per week
    CREATE TABLE IF NOT EXISTS team_scores (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      week INTEGER NOT NULL,
      starter_points REAL DEFAULT 0,
      bench_points REAL DEFAULT 0,
      total_points REAL DEFAULT 0,
      breakdown_json TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      UNIQUE (team_id, week)
    );

    -- Player scores per week (per fantasy team)
    CREATE TABLE IF NOT EXISTS player_scores (
      id TEXT PRIMARY KEY,
      roster_player_id TEXT NOT NULL,
      week INTEGER NOT NULL,
      points REAL DEFAULT 0,
      is_starter INTEGER DEFAULT 0,
      breakdown_json TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (roster_player_id) REFERENCES roster_players(id),
      UNIQUE (roster_player_id, week)
    );

    -- League settings (singleton)
    CREATE TABLE IF NOT EXISTS league_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      current_week INTEGER DEFAULT 1,
      lock_time TEXT,
      active_scoring_rule_set_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (active_scoring_rule_set_id) REFERENCES scoring_rule_sets(id)
    );

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'TEAM')),
      team_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );

    -- Matchups (for 1v1 rounds: Divisional, Conference, Super Bowl)
    CREATE TABLE IF NOT EXISTS matchups (
      id TEXT PRIMARY KEY,
      week INTEGER NOT NULL,
      home_team_id TEXT NOT NULL,
      away_team_id TEXT NOT NULL,
      home_score REAL DEFAULT 0,
      away_score REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'final')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (home_team_id) REFERENCES teams(id),
      FOREIGN KEY (away_team_id) REFERENCES teams(id)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_matchups_week ON matchups(week);
    CREATE INDEX IF NOT EXISTS idx_roster_players_team ON roster_players(team_id);
    CREATE INDEX IF NOT EXISTS idx_roster_players_player ON roster_players(player_id);
    CREATE INDEX IF NOT EXISTS idx_lineup_entries_roster ON lineup_entries(roster_player_id);
    CREATE INDEX IF NOT EXISTS idx_lineup_entries_week ON lineup_entries(week);
    CREATE INDEX IF NOT EXISTS idx_player_game_stats_player ON player_game_stats(player_id);
    CREATE INDEX IF NOT EXISTS idx_player_game_stats_game ON player_game_stats(game_id);
    CREATE INDEX IF NOT EXISTS idx_games_week ON games(week);
    CREATE INDEX IF NOT EXISTS idx_team_scores_week ON team_scores(team_id, week);
  `);

  // Initialize league settings if not exists
  const existing = db.prepare('SELECT id FROM league_settings WHERE id = ?').get('default');
  if (!existing) {
    db.prepare('INSERT INTO league_settings (id) VALUES (?)').run('default');
  }

  // Run migrations
  runMigrations();

  console.log('Database initialized successfully');
}

/**
 * Run database migrations for schema changes
 * Each migration checks if it's needed before running
 */
function runMigrations(): void {
  // Migration 1: Add 'slot' column to lineup_entries if it doesn't exist
  const lineupColumns = db.prepare("PRAGMA table_info(lineup_entries)").all() as { name: string }[];
  const hasSlotColumn = lineupColumns.some(col => col.name === 'slot');
  
  if (!hasSlotColumn) {
    console.log('Migration: Adding slot column to lineup_entries...');
    db.exec(`
      ALTER TABLE lineup_entries ADD COLUMN slot TEXT 
        CHECK (slot IS NULL OR slot IN ('QB', 'RB', 'WRTE', 'FLEX1', 'FLEX2', 'FLEX3', 'K', 'DEF'));
    `);
    console.log('Migration: slot column added successfully');
  }

  // Create index for slot-based queries if it doesn't exist
  // Note: SQLite doesn't have IF NOT EXISTS for indexes in older versions,
  // so we check manually
  const indexes = db.prepare("PRAGMA index_list(lineup_entries)").all() as { name: string }[];
  const hasSlotIndex = indexes.some(idx => idx.name === 'idx_lineup_entries_slot');
  
  if (!hasSlotIndex) {
    console.log('Migration: Creating slot index on lineup_entries...');
    db.exec(`
      CREATE INDEX idx_lineup_entries_slot ON lineup_entries(roster_player_id, week, slot);
    `);
    console.log('Migration: slot index created successfully');
  }

  // Migration 2: Add vegas/score columns to games table
  const gamesColumns = db.prepare("PRAGMA table_info(games)").all() as { name: string }[];
  const gamesColumnNames = gamesColumns.map(c => c.name);
  
  if (!gamesColumnNames.includes('home_score')) {
    console.log('Migration: Adding score/vegas columns to games...');
    db.exec(`
      ALTER TABLE games ADD COLUMN home_score INTEGER;
      ALTER TABLE games ADD COLUMN away_score INTEGER;
      ALTER TABLE games ADD COLUMN spread_home REAL;
      ALTER TABLE games ADD COLUMN total REAL;
    `);
    console.log('Migration: games columns added successfully');
  }

  // Migration 3: Add additional stat columns to player_game_stats for stat lines
  const pgsColumns = db.prepare("PRAGMA table_info(player_game_stats)").all() as { name: string }[];
  const pgsColumnNames = pgsColumns.map(c => c.name);
  
  const newPgsColumns = [
    { name: 'pass_attempts', type: 'INTEGER DEFAULT 0' },
    { name: 'pass_completions', type: 'INTEGER DEFAULT 0' },
    { name: 'rush_attempts', type: 'INTEGER DEFAULT 0' },
    { name: 'fg_long', type: 'INTEGER DEFAULT 0' },
  ];
  
  for (const col of newPgsColumns) {
    if (!pgsColumnNames.includes(col.name)) {
      console.log(`Migration: Adding ${col.name} to player_game_stats...`);
      db.exec(`ALTER TABLE player_game_stats ADD COLUMN ${col.name} ${col.type};`);
      console.log(`Migration: ${col.name} added successfully`);
    }
  }
}
