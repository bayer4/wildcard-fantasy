import { v4 as uuidv4 } from 'uuid';
import db from '../../db';
import { IngestData } from '../types';

/**
 * Manual ingestion provider
 * Processes JSON data pasted/uploaded by admin and stores in database
 */

export function processManualIngest(data: IngestData): { 
  gamesCreated: number;
  gamesUpdated: number;
  playerStatsUpserted: number;
  defenseStatsUpserted: number;
  eventsCreated: number;
} {
  let gamesCreated = 0;
  let gamesUpdated = 0;
  let playerStatsUpserted = 0;
  let defenseStatsUpserted = 0;
  let eventsCreated = 0;

  const now = new Date().toISOString();

  // Process games
  const upsertGame = db.prepare(`
    INSERT INTO games (id, week, home_team_abbr, away_team_abbr, kickoff_time, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      status = excluded.status,
      kickoff_time = excluded.kickoff_time,
      updated_at = excluded.updated_at
  `);

  const findGame = db.prepare(`
    SELECT id FROM games WHERE week = ? AND home_team_abbr = ? AND away_team_abbr = ?
  `);

  const gameIdMap: Record<string, string> = {};

  for (const game of data.games || []) {
    const key = `${game.week}-${game.homeTeamAbbr}-${game.awayTeamAbbr}`;
    const existing = findGame.get(game.week, game.homeTeamAbbr, game.awayTeamAbbr) as { id: string } | undefined;
    
    if (existing) {
      gameIdMap[key] = existing.id;
      upsertGame.run(existing.id, game.week, game.homeTeamAbbr, game.awayTeamAbbr, game.kickoffTime, game.status, now);
      gamesUpdated++;
    } else {
      const gameId = uuidv4();
      gameIdMap[key] = gameId;
      upsertGame.run(gameId, game.week, game.homeTeamAbbr, game.awayTeamAbbr, game.kickoffTime, game.status, now);
      gamesCreated++;
    }
  }

  // Helper to find or create player (uses display_name, position, nfl_team)
  const findPlayer = db.prepare(`SELECT id FROM players WHERE display_name = ? AND nfl_team = ?`);
  const insertPlayer = db.prepare(`INSERT INTO players (id, display_name, position, nfl_team) VALUES (?, ?, ?, ?)`);
  
  function getOrCreatePlayerId(name: string, position: string, nflTeam: string): string {
    const existing = findPlayer.get(name, nflTeam) as { id: string } | undefined;
    if (existing) return existing.id;
    
    const id = uuidv4();
    insertPlayer.run(id, name, position, nflTeam);
    return id;
  }

  // Helper to find game for a week and team
  function findGameForTeam(week: number, teamAbbr: string): string | null {
    const game = db.prepare(`
      SELECT id FROM games WHERE week = ? AND (home_team_abbr = ? OR away_team_abbr = ?)
    `).get(week, teamAbbr, teamAbbr) as { id: string } | undefined;
    return game?.id || null;
  }

  // Process player stats
  const upsertPlayerStats = db.prepare(`
    INSERT INTO player_game_stats (
      id, player_id, game_id,
      pass_yards, pass_tds, pass_interceptions, pass_2pt_conversions,
      pass_attempts, pass_completions,
      rush_yards, rush_tds, rush_2pt_conversions, rush_attempts,
      receptions, rec_yards, rec_tds, rec_2pt_conversions,
      fumbles_lost,
      fg_made_0_39, fg_made_40_49, fg_made_50_54, fg_made_55_plus, fg_missed, fg_long,
      xp_made, xp_missed,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (player_id, game_id) DO UPDATE SET
      pass_yards = excluded.pass_yards,
      pass_tds = excluded.pass_tds,
      pass_interceptions = excluded.pass_interceptions,
      pass_2pt_conversions = excluded.pass_2pt_conversions,
      pass_attempts = excluded.pass_attempts,
      pass_completions = excluded.pass_completions,
      rush_yards = excluded.rush_yards,
      rush_tds = excluded.rush_tds,
      rush_2pt_conversions = excluded.rush_2pt_conversions,
      rush_attempts = excluded.rush_attempts,
      receptions = excluded.receptions,
      rec_yards = excluded.rec_yards,
      rec_tds = excluded.rec_tds,
      rec_2pt_conversions = excluded.rec_2pt_conversions,
      fumbles_lost = excluded.fumbles_lost,
      fg_made_0_39 = excluded.fg_made_0_39,
      fg_made_40_49 = excluded.fg_made_40_49,
      fg_made_50_54 = excluded.fg_made_50_54,
      fg_made_55_plus = excluded.fg_made_55_plus,
      fg_missed = excluded.fg_missed,
      fg_long = excluded.fg_long,
      xp_made = excluded.xp_made,
      xp_missed = excluded.xp_missed,
      updated_at = excluded.updated_at
  `);

  for (const stat of data.playerGameStats || []) {
    const playerId = getOrCreatePlayerId(stat.playerName, stat.position, stat.nflTeamAbbr);
    const gameId = findGameForTeam(stat.gameWeek, stat.nflTeamAbbr);
    
    if (!gameId) {
      console.warn(`No game found for week ${stat.gameWeek} and team ${stat.nflTeamAbbr}`);
      continue;
    }

    const statsId = uuidv4();
    upsertPlayerStats.run(
      statsId, playerId, gameId,
      stat.passYards || 0,
      stat.passTDs || 0,
      stat.passInterceptions || 0,
      stat.pass2PtConversions || 0,
      stat.passAttempts || 0,
      stat.passCompletions || 0,
      stat.rushYards || 0,
      stat.rushTDs || 0,
      stat.rush2PtConversions || 0,
      stat.rushAttempts || 0,
      stat.receptions || 0,
      stat.recYards || 0,
      stat.recTDs || 0,
      stat.rec2PtConversions || 0,
      stat.fumblesLost || 0,
      stat.fgMade0_39 || 0,
      stat.fgMade40_49 || 0,
      stat.fgMade50_54 || 0,
      stat.fgMade55Plus || 0,
      stat.fgMissed || 0,
      stat.fgLong || 0,
      stat.xpMade || 0,
      stat.xpMissed || 0,
      now
    );
    playerStatsUpserted++;
  }

  // Process defense stats
  const upsertDefenseStats = db.prepare(`
    INSERT INTO team_defense_game_stats (
      id, defense_team_abbr, game_id,
      points_allowed, yards_allowed,
      sacks, interceptions, fumble_recoveries,
      defense_tds, safeties, blocked_kicks, return_tds,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (defense_team_abbr, game_id) DO UPDATE SET
      points_allowed = excluded.points_allowed,
      yards_allowed = excluded.yards_allowed,
      sacks = excluded.sacks,
      interceptions = excluded.interceptions,
      fumble_recoveries = excluded.fumble_recoveries,
      defense_tds = excluded.defense_tds,
      safeties = excluded.safeties,
      blocked_kicks = excluded.blocked_kicks,
      return_tds = excluded.return_tds,
      updated_at = excluded.updated_at
  `);

  for (const stat of data.defenseGameStats || []) {
    const gameId = findGameForTeam(stat.gameWeek, stat.teamAbbr);
    
    if (!gameId) {
      console.warn(`No game found for week ${stat.gameWeek} and team ${stat.teamAbbr}`);
      continue;
    }

    const statsId = uuidv4();
    upsertDefenseStats.run(
      statsId, stat.teamAbbr, gameId,
      stat.pointsAllowed,
      stat.yardsAllowed,
      stat.sacks || 0,
      stat.interceptions || 0,
      stat.fumbleRecoveries || 0,
      stat.defenseTDs || 0,
      stat.safeties || 0,
      stat.blockedKicks || 0,
      stat.returnTDs || 0,
      now
    );
    defenseStatsUpserted++;
  }

  // Process game events
  const insertEvent = db.prepare(`
    INSERT INTO game_events (id, game_id, player_id, event_type, yards, description, bonus_points, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const event of data.gameEvents || []) {
    let playerId: string | null = null;
    if (event.playerName && event.nflTeamAbbr) {
      const player = findPlayer.get(event.playerName, event.nflTeamAbbr) as { id: string } | undefined;
      playerId = player?.id || null;
    }

    const gameId = findGameForTeam(event.gameWeek, event.nflTeamAbbr || '');
    if (!gameId && !event.bonusPoints) {
      console.warn(`No game found for event in week ${event.gameWeek}`);
      continue;
    }

    insertEvent.run(
      uuidv4(),
      gameId,
      playerId,
      event.eventType,
      event.yards || null,
      event.description || null,
      event.bonusPoints || null,
      now
    );
    eventsCreated++;
  }

  return {
    gamesCreated,
    gamesUpdated,
    playerStatsUpserted,
    defenseStatsUpserted,
    eventsCreated
  };
}

/**
 * Add a manual bonus event for a player
 */
export function addManualBonus(
  week: number,
  playerName: string,
  nflTeam: string,
  bonusPoints: number,
  description: string
): boolean {
  const player = db.prepare(`SELECT id FROM players WHERE display_name = ? AND nfl_team = ?`)
    .get(playerName, nflTeam) as { id: string } | undefined;
  
  if (!player) {
    console.warn(`Player not found: ${playerName} (${nflTeam})`);
    return false;
  }

  const game = db.prepare(`
    SELECT id FROM games WHERE week = ? AND (home_team_abbr = ? OR away_team_abbr = ?)
  `).get(week, nflTeam, nflTeam) as { id: string } | undefined;

  if (!game) {
    console.warn(`Game not found for week ${week} and team ${nflTeam}`);
    return false;
  }

  db.prepare(`
    INSERT INTO game_events (id, game_id, player_id, event_type, bonus_points, description, created_at)
    VALUES (?, ?, ?, 'bonus', ?, ?, ?)
  `).run(uuidv4(), game.id, player.id, bonusPoints, description, new Date().toISOString());

  return true;
}
