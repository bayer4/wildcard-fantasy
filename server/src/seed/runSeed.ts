import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db from '../db';
import { seedData, scoringRules } from './bcflWildcardSeed';

interface RosterPlayer {
  displayName: string;
  position: string;
  nflTeam: string;
}

interface Team {
  name: string;
  roster: RosterPlayer[];
}

interface Conference {
  name: string;
  teams: Team[];
}

/**
 * Check if the DB already has league data (conferences/teams)
 */
export function isDatabaseSeeded(): boolean {
  const conferenceCount = db.prepare('SELECT COUNT(*) as count FROM conferences').get() as { count: number };
  return conferenceCount.count > 0;
}

/**
 * Wipe all league data tables (for force-reseed)
 */
export function wipLeagueData(): void {
  console.log('Wiping existing league data...');
  
  // Temporarily disable foreign keys for clean wipe
  db.pragma('foreign_keys = OFF');
  
  db.exec(`
    UPDATE users SET team_id = NULL;
    UPDATE league_settings SET active_scoring_rule_set_id = NULL WHERE id = 'default';
    DELETE FROM player_scores;
    DELETE FROM team_scores;
    DELETE FROM game_events;
    DELETE FROM team_defense_game_stats;
    DELETE FROM player_game_stats;
    DELETE FROM games;
    DELETE FROM lineup_entries;
    DELETE FROM roster_players;
    DELETE FROM players;
    DELETE FROM teams;
    DELETE FROM conferences;
    DELETE FROM scoring_rule_sets;
  `);
  
  // Re-enable foreign keys
  db.pragma('foreign_keys = ON');
  
  console.log('League data wiped.');
}

/**
 * Normalize position - convert "D/ST" to "DEF"
 */
function normalizePosition(position: string): string {
  if (position === 'D/ST') return 'DEF';
  return position;
}

/**
 * Run the BCFL seed - creates conferences, teams, players, rosters, and scoring rules
 */
export function runBcflSeed(force: boolean = false): {
  success: boolean;
  conferencesCreated: number;
  teamsCreated: number;
  playersCreated: number;
  rosterSlotsCreated: number;
  rulesLoaded: boolean;
} {
  // Check if already seeded
  if (!force && isDatabaseSeeded()) {
    return {
      success: false,
      conferencesCreated: 0,
      teamsCreated: 0,
      playersCreated: 0,
      rosterSlotsCreated: 0,
      rulesLoaded: false
    };
  }

  // Wipe if force
  if (force) {
    wipLeagueData();
  }

  let conferencesCreated = 0;
  let teamsCreated = 0;
  let playersCreated = 0;
  let rosterSlotsCreated = 0;

  // Get current week for lineup entries
  const settings = db.prepare('SELECT current_week FROM league_settings WHERE id = ?').get('default') as { current_week: number } | undefined;
  const currentWeek = settings?.current_week || 1;

  // Prepared statements
  const insertConference = db.prepare('INSERT INTO conferences (id, name) VALUES (?, ?)');
  const insertTeam = db.prepare('INSERT INTO teams (id, name, conference_id) VALUES (?, ?, ?)');
  const findPlayer = db.prepare('SELECT id FROM players WHERE display_name = ? AND position = ? AND nfl_team = ?');
  const insertPlayer = db.prepare('INSERT INTO players (id, display_name, position, nfl_team) VALUES (?, ?, ?, ?)');
  const insertRosterPlayer = db.prepare('INSERT INTO roster_players (id, team_id, player_id) VALUES (?, ?, ?)');
  const insertLineupEntry = db.prepare('INSERT INTO lineup_entries (id, roster_player_id, week, is_starter) VALUES (?, ?, ?, 0)');

  const transaction = db.transaction(() => {
    for (const conference of seedData.conferences as Conference[]) {
      const conferenceId = uuidv4();
      insertConference.run(conferenceId, conference.name);
      conferencesCreated++;

      for (const team of conference.teams) {
        const teamId = uuidv4();
        insertTeam.run(teamId, team.name, conferenceId);
        teamsCreated++;

        for (const rosterPlayer of team.roster) {
          const position = normalizePosition(rosterPlayer.position);
          
          // Find or create player
          let playerId: string;
          const existingPlayer = findPlayer.get(rosterPlayer.displayName, position, rosterPlayer.nflTeam) as { id: string } | undefined;
          
          if (existingPlayer) {
            playerId = existingPlayer.id;
          } else {
            playerId = uuidv4();
            insertPlayer.run(playerId, rosterPlayer.displayName, position, rosterPlayer.nflTeam);
            playersCreated++;
          }

          // Create roster entry
          const rosterPlayerId = uuidv4();
          insertRosterPlayer.run(rosterPlayerId, teamId, playerId);
          rosterSlotsCreated++;

          // Create lineup entry (default to bench)
          insertLineupEntry.run(uuidv4(), rosterPlayerId, currentWeek);
        }
      }
    }

    // Insert scoring rules
    const ruleSetId = uuidv4();
    db.prepare(`
      INSERT INTO scoring_rule_sets (id, name, rules_json, is_active)
      VALUES (?, ?, ?, 1)
    `).run(ruleSetId, scoringRules.name, JSON.stringify(scoringRules));

    // Set as active in league settings
    db.prepare('UPDATE league_settings SET active_scoring_rule_set_id = ? WHERE id = ?').run(ruleSetId, 'default');

    // Create default admin user if no users exist
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    if (userCount.count === 0) {
      const adminId = uuidv4();
      const passwordHash = bcrypt.hashSync('admin', 10);
      db.prepare(`
        INSERT INTO users (id, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `).run(adminId, 'admin@bcfl.com', passwordHash, 'admin');
      console.log('Created default admin user: admin@bcfl.com / admin');
    }
  });

  transaction();

  return {
    success: true,
    conferencesCreated,
    teamsCreated,
    playersCreated,
    rosterSlotsCreated,
    rulesLoaded: true
  };
}

/**
 * Auto-seed function for server startup
 * Only seeds if DB is empty
 */
export function autoSeedIfEmpty(): void {
  if (isDatabaseSeeded()) {
    console.log('Database already has league data, skipping auto-seed.');
    return;
  }

  console.log('Database is empty, running auto-seed...');
  const result = runBcflSeed(false);

  if (result.success) {
    console.log(`✅ Auto-seeded: ${result.conferencesCreated} conferences, ${result.teamsCreated} teams, ${result.rosterSlotsCreated} roster slots, rules loaded`);
  }
}

/**
 * Force seed function (for npm run seed script)
 * Wipes existing data and reseeds
 */
export function forceSeed(): void {
  console.log('Force-seeding database...');
  const result = runBcflSeed(true);

  if (result.success) {
    console.log(`✅ Force-seeded: ${result.conferencesCreated} conferences, ${result.teamsCreated} teams, ${result.playersCreated} unique players, ${result.rosterSlotsCreated} roster slots, rules loaded`);
  } else {
    console.log('❌ Seed failed');
  }
}

// If this file is run directly (via ts-node), do a force seed
if (require.main === module) {
  // Initialize DB first
  const { initializeDatabase } = require('../db');
  initializeDatabase();
  
  forceSeed();
  process.exit(0);
}

