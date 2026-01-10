/**
 * Normalized ingest data format
 * Both manual and SportsDataIO providers map to this format
 */

export interface IngestGame {
  week: number;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  kickoffTime: string;
  status: 'scheduled' | 'in_progress' | 'final' | 'SCHEDULED' | 'IN_PROGRESS' | 'FINAL';
  // Optional scores and lines
  homeScore?: number | null;
  awayScore?: number | null;
  spreadHome?: number | null;
  total?: number | null;
}

export interface IngestPlayerGameStats {
  playerName: string;
  position: string;
  nflTeamAbbr: string;
  gameWeek: number;
  
  // Passing
  passYards?: number;
  passTDs?: number;
  passInterceptions?: number;
  pass2PtConversions?: number;
  passAttempts?: number;
  passCompletions?: number;
  
  // Rushing
  rushYards?: number;
  rushTDs?: number;
  rush2PtConversions?: number;
  rushAttempts?: number;
  
  // Receiving
  receptions?: number;
  recYards?: number;
  recTDs?: number;
  rec2PtConversions?: number;
  
  // Misc
  fumblesLost?: number;
  
  // Kicking
  fgMade0_39?: number;
  fgMade40_49?: number;
  fgMade50_54?: number;
  fgMade55Plus?: number;
  fgMissed?: number;
  fgLong?: number;
  xpMade?: number;
  xpMissed?: number;
}

export interface IngestDefenseGameStats {
  teamAbbr: string;
  gameWeek: number;
  pointsAllowed: number;
  yardsAllowed: number;
  sacks?: number;
  interceptions?: number;
  fumbleRecoveries?: number;
  defenseTDs?: number;
  safeties?: number;
  blockedKicks?: number;
  returnTDs?: number;
}

export interface IngestGameEvent {
  gameWeek: number;
  eventType: string;
  playerName?: string;
  nflTeamAbbr?: string;
  yards?: number;
  description?: string;
  bonusPoints?: number;
}

export interface IngestData {
  games?: IngestGame[];
  playerGameStats?: IngestPlayerGameStats[];
  defenseGameStats?: IngestDefenseGameStats[];
  gameEvents?: IngestGameEvent[];
}
