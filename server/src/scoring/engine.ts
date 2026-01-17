import db from '../db';
import { ScoreBreakdown } from '../types';

/**
 * BCFL Scoring Engine
 * Supports milestone-based scoring with bonuses
 */

interface PlayerStatsRow {
  id: string;
  player_id: string;
  game_id: string;
  pass_yards: number;
  pass_tds: number;
  pass_interceptions: number;
  pass_2pt_conversions: number;
  rush_yards: number;
  rush_tds: number;
  rush_2pt_conversions: number;
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
  xp_made: number;
  xp_missed: number;
}

interface DefenseStatsRow {
  id: string;
  defense_team_abbr: string;
  game_id: string;
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

interface GameEventRow {
  id: string;
  game_id: string;
  player_id: string | null;
  event_type: string;
  yards: number | null;
  bonus_points: number | null;
}

interface LineupRow {
  roster_player_id: string;
  player_id: string;
  is_starter: number;
  slot: string | null;
  position: string;
  nfl_team: string;
  display_name: string;
}

export interface PlayerScoreResult {
  rosterPlayerId: string;
  playerId: string;
  playerName: string;
  position: string;
  isStarter: boolean;
  points: number;
  breakdown: ScoreBreakdown[];
}

export interface TeamScoreResult {
  teamId: string;
  teamName: string;
  week: number;
  starterPoints: number;
  benchPoints: number;
  totalPoints: number;
  playerScores: PlayerScoreResult[];
}

// BCFL Rules interfaces
interface YardageMilestone {
  yards: number;
  totalBonus: number;
}

interface BCFLRules {
  bonuses?: {
    rushing?: {
      yardageMilestones?: YardageMilestone[];
      td50PlusBonus?: number;
    };
    receiving?: {
      yardageMilestones?: YardageMilestone[];
      td50PlusBonus?: number;
    };
    combinedRushReceive?: {
      onlyIfNeitherCategoryReached?: boolean;
      milestones?: Array<{
        yards: number;
        bonus: number;
        requiresNeitherRush75NorReceive75?: boolean;
        requiresNeitherRush100NorReceive100?: boolean;
      }>;
    };
    passing?: {
      tdPoints?: number;
      yardageMilestones?: YardageMilestone[];
      tdPass50PlusBonus?: number;
      qbRushingTdBonus?: number;
      interception?: number;
      nonQbPassTdPoints?: number;
    };
    turnovers?: {
      fumble?: number;
    };
    kicking?: {
      fgUnder53?: number;
      fg53or54?: number;
      fg55Plus?: number;
      missedXP?: number;
      missedFG30to39?: number;
      missedFG29orLess?: number;
    };
    defenseSpecialTeams?: {
      directScore?: string;
      shutout?: number;
      interception?: number;
      fumbleRecovery?: number;
      leastTotalYardageAllowed?: number;
    };
    twoPointConversions?: {
      playerScoring?: number;
      playerPassing?: number;
    };
  };
}

/**
 * Get active scoring rules from database
 */
export function getActiveScoringRules(): BCFLRules | null {
  const settings = db.prepare(`
    SELECT srs.rules_json 
    FROM league_settings ls
    LEFT JOIN scoring_rule_sets srs ON ls.active_scoring_rule_set_id = srs.id
    WHERE ls.id = 'default'
  `).get() as { rules_json: string | null } | undefined;

  if (!settings?.rules_json) {
    return null;
  }

  try {
    return JSON.parse(settings.rules_json);
  } catch {
    return null;
  }
}

/**
 * Check if system can compute scores
 */
export function canComputeScores(week: number): { canCompute: boolean; errors: string[] } {
  const errors: string[] = [];

  const rules = getActiveScoringRules();
  if (!rules) {
    errors.push('No scoring rules configured. Upload a ruleset via /admin/rules first.');
  }

  const teams = db.prepare('SELECT COUNT(*) as count FROM teams').get() as { count: number };
  if (teams.count === 0) {
    errors.push('No teams exist. Seed teams via /admin/seed first.');
  }

  const lineups = db.prepare(`
    SELECT COUNT(*) as count FROM lineup_entries WHERE week = ?
  `).get(week) as { count: number };
  if (lineups.count === 0) {
    errors.push(`No lineup entries for week ${week}.`);
  }

  const games = db.prepare('SELECT COUNT(*) as count FROM games WHERE week = ?').get(week) as { count: number };
  if (games.count === 0) {
    errors.push(`No games exist for week ${week}. Ingest game data first.`);
  }

  const stats = db.prepare(`
    SELECT COUNT(*) as count FROM player_game_stats pgs
    JOIN games g ON pgs.game_id = g.id
    WHERE g.week = ?
  `).get(week) as { count: number };
  if (stats.count === 0) {
    errors.push(`No player stats exist for week ${week}. Ingest stats first.`);
  }

  return {
    canCompute: errors.length === 0,
    errors
  };
}

/**
 * Get the highest milestone bonus for given yards
 * Milestones are cumulative - you get the totalBonus for the highest milestone reached
 */
function getMilestoneBonus(yards: number, milestones?: YardageMilestone[]): number {
  if (!milestones || milestones.length === 0) return 0;
  
  // Sort milestones by yards descending to find the highest reached
  const sorted = [...milestones].sort((a, b) => b.yards - a.yards);
  
  for (const m of sorted) {
    if (yards >= m.yards) {
      return m.totalBonus;
    }
  }
  return 0;
}

/**
 * Calculate BCFL player score
 */
export function calculatePlayerScore(
  stats: PlayerStatsRow,
  position: string,
  rules: BCFLRules,
  events: GameEventRow[]
): { points: number; breakdown: ScoreBreakdown[] } {
  const breakdown: ScoreBreakdown[] = [];
  let points = 0;
  const bonuses = rules.bonuses || {};

  // ===== PASSING =====
  const passing = bonuses.passing || {};
  
  // Passing TDs - Non-QBs get nonQbPassTdPoints (7), QBs get tdPoints (4)
  if (stats.pass_tds > 0) {
    const isNonQb = position !== 'QB';
    const tdPts = isNonQb && passing.nonQbPassTdPoints 
      ? passing.nonQbPassTdPoints 
      : (passing.tdPoints ?? 4);
    const passTdPoints = stats.pass_tds * tdPts;
    points += passTdPoints;
    breakdown.push({ 
      category: 'Passing', 
      stat: isNonQb ? 'Non-QB Pass TD' : 'TDs', 
      value: stats.pass_tds, 
      points: passTdPoints 
    });
  }

  // Passing yardage milestone bonus
  if (stats.pass_yards > 0) {
    const milestoneBonus = getMilestoneBonus(stats.pass_yards, passing.yardageMilestones);
    if (milestoneBonus > 0) {
      points += milestoneBonus;
      breakdown.push({ category: 'Passing', stat: 'Yardage Bonus', value: stats.pass_yards, points: milestoneBonus });
    }
  }

  // Interceptions
  if (stats.pass_interceptions > 0 && passing.interception) {
    const intPoints = stats.pass_interceptions * passing.interception;
    points += intPoints;
    breakdown.push({ category: 'Passing', stat: 'Interceptions', value: stats.pass_interceptions, points: intPoints });
  }

  // 2PT passing
  if (stats.pass_2pt_conversions > 0 && bonuses.twoPointConversions?.playerPassing) {
    const pts = stats.pass_2pt_conversions * bonuses.twoPointConversions.playerPassing;
    points += pts;
    breakdown.push({ category: 'Passing', stat: '2PT Pass', value: stats.pass_2pt_conversions, points: pts });
  }

  // ===== RUSHING =====
  const rushing = bonuses.rushing || {};
  
  // Rushing TDs (NFL face value = 6)
  if (stats.rush_tds > 0) {
    const rushTdPoints = stats.rush_tds * 6;
    points += rushTdPoints;
    breakdown.push({ category: 'Rushing', stat: 'TDs', value: stats.rush_tds, points: rushTdPoints });
    
    // QB rushing TD bonus
    if (position === 'QB' && passing.qbRushingTdBonus) {
      const qbBonus = stats.rush_tds * passing.qbRushingTdBonus;
      points += qbBonus;
      breakdown.push({ category: 'Rushing', stat: 'QB Rush TD Bonus', value: stats.rush_tds, points: qbBonus });
    }
  }

  // Rushing yardage milestone bonus
  const rushMilestoneBonus = getMilestoneBonus(stats.rush_yards, rushing.yardageMilestones);
  if (rushMilestoneBonus > 0) {
    points += rushMilestoneBonus;
    breakdown.push({ category: 'Rushing', stat: 'Yardage Bonus', value: stats.rush_yards, points: rushMilestoneBonus });
  }

  // 2PT rushing
  if (stats.rush_2pt_conversions > 0 && bonuses.twoPointConversions?.playerScoring) {
    const pts = stats.rush_2pt_conversions * bonuses.twoPointConversions.playerScoring;
    points += pts;
    breakdown.push({ category: 'Rushing', stat: '2PT Rush', value: stats.rush_2pt_conversions, points: pts });
  }

  // ===== RECEIVING =====
  const receiving = bonuses.receiving || {};
  
  // Receiving TDs (NFL face value = 6)
  if (stats.rec_tds > 0) {
    const recTdPoints = stats.rec_tds * 6;
    points += recTdPoints;
    breakdown.push({ category: 'Receiving', stat: 'TDs', value: stats.rec_tds, points: recTdPoints });
  }

  // Receiving yardage milestone bonus
  const recMilestoneBonus = getMilestoneBonus(stats.rec_yards, receiving.yardageMilestones);
  if (recMilestoneBonus > 0) {
    points += recMilestoneBonus;
    breakdown.push({ category: 'Receiving', stat: 'Yardage Bonus', value: stats.rec_yards, points: recMilestoneBonus });
  }

  // 2PT receiving
  if (stats.rec_2pt_conversions > 0 && bonuses.twoPointConversions?.playerScoring) {
    const pts = stats.rec_2pt_conversions * bonuses.twoPointConversions.playerScoring;
    points += pts;
    breakdown.push({ category: 'Receiving', stat: '2PT Rec', value: stats.rec_2pt_conversions, points: pts });
  }

  // ===== COMBINED RUSH/RECEIVE =====
  // Only applies if neither individual category reached threshold
  const combined = bonuses.combinedRushReceive;
  if (combined?.milestones && combined.onlyIfNeitherCategoryReached) {
    const totalCombined = stats.rush_yards + stats.rec_yards;
    
    for (const m of combined.milestones) {
      // Check if neither category reached the threshold
      let eligible = false;
      if (m.requiresNeitherRush75NorReceive75) {
        eligible = stats.rush_yards < 75 && stats.rec_yards < 75;
      } else if (m.requiresNeitherRush100NorReceive100) {
        eligible = stats.rush_yards < 100 && stats.rec_yards < 100;
      }
      
      if (eligible && totalCombined >= m.yards) {
        points += m.bonus;
        breakdown.push({ category: 'Combined', stat: 'Rush+Rec Bonus', value: totalCombined, points: m.bonus });
        break; // Only one combined bonus
      }
    }
  }

  // ===== TURNOVERS =====
  if (stats.fumbles_lost > 0 && bonuses.turnovers?.fumble) {
    const fumblePoints = stats.fumbles_lost * bonuses.turnovers.fumble;
    points += fumblePoints;
    breakdown.push({ category: 'Turnover', stat: 'Fumbles Lost', value: stats.fumbles_lost, points: fumblePoints });
  }

  // ===== KICKING =====
  if (position === 'K') {
    const kicking = bonuses.kicking || {};
    
    // FGs under 53 yards (0-52)
    const fgsUnder53 = stats.fg_made_0_39 + stats.fg_made_40_49 + 
                       (stats.fg_made_50_54 > 0 ? Math.max(0, stats.fg_made_50_54 - countFG53Plus(stats)) : 0);
    // Simplified: assume fg_made_0_39 and fg_made_40_49 are all under 53
    const totalFGsUnder53 = stats.fg_made_0_39 + stats.fg_made_40_49;
    if (totalFGsUnder53 > 0 && kicking.fgUnder53) {
      const pts = totalFGsUnder53 * kicking.fgUnder53;
      points += pts;
      breakdown.push({ category: 'Kicking', stat: 'FG <53', value: totalFGsUnder53, points: pts });
    }

    // FG 53-54 (part of 50-54 bucket)
    // We'll count 50-54 bucket as a mix, but BCFL might need more granular data
    // For now, treat fg_made_50_54 as "around 53"
    if (stats.fg_made_50_54 > 0 && kicking.fg53or54) {
      const pts = stats.fg_made_50_54 * kicking.fg53or54;
      points += pts;
      breakdown.push({ category: 'Kicking', stat: 'FG 53-54', value: stats.fg_made_50_54, points: pts });
    }

    // FG 55+ (base points + bonus)
    // fg55Plus is the BONUS on top of base FG value
    if (stats.fg_made_55_plus > 0) {
      const basePts = kicking.fgUnder53 || 3;  // Base FG value
      const bonusPts = kicking.fg55Plus || 0;  // Additional bonus for 55+
      const pts = stats.fg_made_55_plus * (basePts + bonusPts);
      points += pts;
      breakdown.push({ category: 'Kicking', stat: 'FG 55+', value: stats.fg_made_55_plus, points: pts });
    }

    // XP Made (NFL face value = 1)
    if (stats.xp_made > 0) {
      points += stats.xp_made;
      breakdown.push({ category: 'Kicking', stat: 'XP Made', value: stats.xp_made, points: stats.xp_made });
    }

    // Missed XP
    if (stats.xp_missed > 0 && kicking.missedXP) {
      const pts = stats.xp_missed * kicking.missedXP;
      points += pts;
      breakdown.push({ category: 'Kicking', stat: 'XP Missed', value: stats.xp_missed, points: pts });
    }

    // Missed FG penalties only apply to short misses (under 40 yards)
    // Since we don't track miss distance, no automatic penalty is applied
    // Use manual bonuses via Admin -> Ingest for short miss penalties:
    //   - missedFG30to39: -1
    //   - missedFG29orLess: -2
    // Misses 40+ yards have no penalty
  }

  // ===== EVENT-BASED BONUSES (50+ yard TDs, etc.) =====
  const playerEvents = events.filter(e => e.player_id === stats.player_id);
  for (const event of playerEvents) {
    // 50+ yard TD bonuses
    if (event.event_type === 'passing_td' && event.yards && event.yards >= 50 && passing.tdPass50PlusBonus) {
      points += passing.tdPass50PlusBonus;
      breakdown.push({ category: 'Bonus', stat: '50+ Yard Pass TD', value: event.yards, points: passing.tdPass50PlusBonus });
    }
    if (event.event_type === 'rushing_td' && event.yards && event.yards >= 50 && rushing.td50PlusBonus) {
      points += rushing.td50PlusBonus;
      breakdown.push({ category: 'Bonus', stat: '50+ Yard Rush TD', value: event.yards, points: rushing.td50PlusBonus });
    }
    if (event.event_type === 'receiving_td' && event.yards && event.yards >= 50 && receiving.td50PlusBonus) {
      points += receiving.td50PlusBonus;
      breakdown.push({ category: 'Bonus', stat: '50+ Yard Rec TD', value: event.yards, points: receiving.td50PlusBonus });
    }
    // Manual bonus
    if (event.event_type === 'bonus' && event.bonus_points) {
      points += event.bonus_points;
      breakdown.push({ category: 'Bonus', stat: 'Manual Bonus', value: 1, points: event.bonus_points });
    }
  }

  return { points: Math.round(points * 100) / 100, breakdown };
}

// Helper for FG counting (simplified)
function countFG53Plus(_stats: PlayerStatsRow): number {
  // This would need more granular data to be accurate
  return 0;
}

/**
 * Calculate BCFL defense score
 */
export function calculateDefenseScore(
  stats: DefenseStatsRow,
  rules: BCFLRules,
  _events: GameEventRow[]
): { points: number; breakdown: ScoreBreakdown[] } {
  const breakdown: ScoreBreakdown[] = [];
  let points = 0;
  const dst = rules.bonuses?.defenseSpecialTeams || {};

  // Shutout bonus
  if (stats.points_allowed === 0 && dst.shutout) {
    points += dst.shutout;
    breakdown.push({ category: 'Defense', stat: 'Shutout', value: 0, points: dst.shutout });
  }

  // Interceptions
  if (stats.interceptions > 0 && dst.interception) {
    const pts = stats.interceptions * dst.interception;
    points += pts;
    breakdown.push({ category: 'Defense', stat: 'Interceptions', value: stats.interceptions, points: pts });
  }

  // Fumble Recoveries
  if (stats.fumble_recoveries > 0 && dst.fumbleRecovery) {
    const pts = stats.fumble_recoveries * dst.fumbleRecovery;
    points += pts;
    breakdown.push({ category: 'Defense', stat: 'Fumble Recoveries', value: stats.fumble_recoveries, points: pts });
  }

  // Defensive TDs (NFL face value = 6)
  if (stats.defense_tds > 0) {
    const pts = stats.defense_tds * 6;
    points += pts;
    breakdown.push({ category: 'Defense', stat: 'Defensive TDs', value: stats.defense_tds, points: pts });
  }

  // Return TDs (NFL face value = 6)
  if (stats.return_tds > 0) {
    const pts = stats.return_tds * 6;
    points += pts;
    breakdown.push({ category: 'Defense', stat: 'Return TDs', value: stats.return_tds, points: pts });
  }

  // Safeties (NFL face value = 2)
  if (stats.safeties > 0) {
    const pts = stats.safeties * 2;
    points += pts;
    breakdown.push({ category: 'Defense', stat: 'Safeties', value: stats.safeties, points: pts });
  }

  // Blocked kicks
  if (stats.blocked_kicks > 0) {
    const pts = stats.blocked_kicks * 2; // Typical value
    points += pts;
    breakdown.push({ category: 'Defense', stat: 'Blocked Kicks', value: stats.blocked_kicks, points: pts });
  }

  return { points: Math.round(points * 100) / 100, breakdown };
}

/**
 * Compute scores for all teams
 */
export function computeTeamScores(week: number): TeamScoreResult[] | { error: string; details: string[] } {
  const validation = canComputeScores(week);
  if (!validation.canCompute) {
    return { error: 'Cannot compute scores', details: validation.errors };
  }

  const rules = getActiveScoringRules()!;
  const results: TeamScoreResult[] = [];

  // Track started defenses for "least yards allowed" bonus
  interface StartedDefense {
    teamId: string;
    rosterPlayerId: string;
    yardsAllowed: number;
  }
  const startedDefenses: StartedDefense[] = [];

  const teams = db.prepare('SELECT id, name FROM teams').all() as { id: string; name: string }[];

  const games = db.prepare('SELECT id FROM games WHERE week = ?').all(week) as { id: string }[];
  const gameIds = games.map(g => g.id);

  const events = gameIds.length > 0
    ? db.prepare(`SELECT * FROM game_events WHERE game_id IN (${gameIds.map(() => '?').join(',')})`).all(...gameIds) as GameEventRow[]
    : [];

  for (const team of teams) {
    // Get lineup entries - use slot to determine if starter (slot not null = starter)
    const lineup = db.prepare(`
      SELECT le.roster_player_id, le.is_starter, le.slot,
             rp.player_id, p.position, p.nfl_team, p.display_name
      FROM lineup_entries le
      JOIN roster_players rp ON le.roster_player_id = rp.id
      JOIN players p ON rp.player_id = p.id
      WHERE rp.team_id = ? AND le.week = ?
    `).all(team.id, week) as LineupRow[];

    const playerScores: PlayerScoreResult[] = [];
    let starterPoints = 0;
    let benchPoints = 0;

    for (const lineupEntry of lineup) {
      // Starter if slot is assigned OR is_starter flag is set
      const isStarter = lineupEntry.slot !== null || lineupEntry.is_starter === 1;

      if (lineupEntry.position === 'DEF') {
        const defStats = db.prepare(`
          SELECT tdgs.* FROM team_defense_game_stats tdgs
          JOIN games g ON tdgs.game_id = g.id
          WHERE tdgs.defense_team_abbr = ? AND g.week = ?
        `).get(lineupEntry.nfl_team, week) as DefenseStatsRow | undefined;

        if (defStats) {
          const { points, breakdown } = calculateDefenseScore(defStats, rules, events);
          playerScores.push({
            rosterPlayerId: lineupEntry.roster_player_id,
            playerId: lineupEntry.player_id,
            playerName: lineupEntry.display_name,
            position: lineupEntry.position,
            isStarter,
            points,
            breakdown
          });
          if (isStarter) {
            starterPoints += points;
            // Track started defense for "least yards allowed" bonus
            startedDefenses.push({
              teamId: team.id,
              rosterPlayerId: lineupEntry.roster_player_id,
              yardsAllowed: defStats.yards_allowed
            });
          }
          else benchPoints += points;
        } else {
          playerScores.push({
            rosterPlayerId: lineupEntry.roster_player_id,
            playerId: lineupEntry.player_id,
            playerName: lineupEntry.display_name,
            position: lineupEntry.position,
            isStarter,
            points: 0,
            breakdown: []
          });
        }
      } else {
        const playerStats = db.prepare(`
          SELECT pgs.* FROM player_game_stats pgs
          JOIN games g ON pgs.game_id = g.id
          WHERE pgs.player_id = ? AND g.week = ?
        `).get(lineupEntry.player_id, week) as PlayerStatsRow | undefined;

        if (playerStats) {
          const { points, breakdown } = calculatePlayerScore(playerStats, lineupEntry.position, rules, events);
          playerScores.push({
            rosterPlayerId: lineupEntry.roster_player_id,
            playerId: lineupEntry.player_id,
            playerName: lineupEntry.display_name,
            position: lineupEntry.position,
            isStarter,
            points,
            breakdown
          });
          if (isStarter) starterPoints += points;
          else benchPoints += points;
        } else {
          playerScores.push({
            rosterPlayerId: lineupEntry.roster_player_id,
            playerId: lineupEntry.player_id,
            playerName: lineupEntry.display_name,
            position: lineupEntry.position,
            isStarter,
            points: 0,
            breakdown: []
          });
        }
      }
    }

    results.push({
      teamId: team.id,
      teamName: team.name,
      week,
      starterPoints,
      benchPoints,
      totalPoints: starterPoints + benchPoints,
      playerScores
    });
  }

  // Award "least yards allowed" bonus to the defense with fewest yards
  // Only award this bonus when ALL games for the week are final
  const leastYardsBonus = rules.bonuses?.defenseSpecialTeams?.leastTotalYardageAllowed;
  if (leastYardsBonus && startedDefenses.length > 0) {
    // Check if all games for this week are final
    const allGames = db.prepare('SELECT status FROM games WHERE week = ?').all(week) as { status: string }[];
    const allGamesFinal = allGames.length > 0 && allGames.every(g => g.status === 'final');
    
    if (allGamesFinal) {
      // Find the minimum yards allowed
      const minYards = Math.min(...startedDefenses.map(d => d.yardsAllowed));
      
      // Find all defenses with that minimum (could be ties)
      const winners = startedDefenses.filter(d => d.yardsAllowed === minYards);
      
      // Award bonus to winners
      for (const winner of winners) {
        const teamResult = results.find(r => r.teamId === winner.teamId);
        if (teamResult) {
          const defenseScore = teamResult.playerScores.find(
            ps => ps.rosterPlayerId === winner.rosterPlayerId
          );
          if (defenseScore) {
            defenseScore.points += leastYardsBonus;
            defenseScore.breakdown.push({
              category: 'Defense',
              stat: 'Fewest Yards Allowed',
              value: winner.yardsAllowed,
              points: leastYardsBonus
            });
            teamResult.starterPoints += leastYardsBonus;
            teamResult.totalPoints += leastYardsBonus;
          }
        }
      }
    }
  }

  // Round all point values
  for (const result of results) {
    result.starterPoints = Math.round(result.starterPoints * 100) / 100;
    result.benchPoints = Math.round(result.benchPoints * 100) / 100;
    result.totalPoints = Math.round(result.totalPoints * 100) / 100;
  }

  return results;
}

/**
 * Persist computed scores to database
 */
export function persistTeamScores(week: number): { success: boolean; error?: string; details?: string[] } {
  const results = computeTeamScores(week);
  
  if ('error' in results) {
    return { success: false, error: results.error, details: results.details };
  }

  const now = new Date().toISOString();

  const upsertTeamScore = db.prepare(`
    INSERT INTO team_scores (id, team_id, week, starter_points, bench_points, total_points, breakdown_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (team_id, week) DO UPDATE SET
      starter_points = excluded.starter_points,
      bench_points = excluded.bench_points,
      total_points = excluded.total_points,
      breakdown_json = excluded.breakdown_json,
      updated_at = excluded.updated_at
  `);

  const upsertPlayerScore = db.prepare(`
    INSERT INTO player_scores (id, roster_player_id, week, points, is_starter, breakdown_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (roster_player_id, week) DO UPDATE SET
      points = excluded.points,
      is_starter = excluded.is_starter,
      breakdown_json = excluded.breakdown_json,
      updated_at = excluded.updated_at
  `);

  const transaction = db.transaction(() => {
    for (const result of results) {
      const teamScoreId = `${result.teamId}-${week}`;
      upsertTeamScore.run(
        teamScoreId,
        result.teamId,
        week,
        result.starterPoints,
        result.benchPoints,
        result.totalPoints,
        JSON.stringify(result.playerScores),
        now
      );

      for (const ps of result.playerScores) {
        const playerScoreId = `${ps.rosterPlayerId}-${week}`;
        upsertPlayerScore.run(
          playerScoreId,
          ps.rosterPlayerId,
          week,
          ps.points,
          ps.isStarter ? 1 : 0,
          JSON.stringify(ps.breakdown),
          now
        );
      }
    }
  });

  transaction();
  return { success: true };
}
