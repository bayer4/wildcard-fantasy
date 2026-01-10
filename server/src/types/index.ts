// User types
export type UserRole = 'ADMIN' | 'TEAM';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  teamId: string | null;
  createdAt: string;
}

// League types
export interface Conference {
  id: string;
  name: string;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  conferenceId: string;
  createdAt: string;
}

export interface Player {
  id: string;
  displayName: string;
  position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
  nflTeam: string;
  createdAt: string;
}

export interface RosterPlayer {
  id: string;
  teamId: string;
  playerId: string;
  createdAt: string;
}

export interface LineupEntry {
  id: string;
  rosterPlayerId: string;
  week: number;
  isStarter: boolean;
  createdAt: string;
  updatedAt: string;
}

// Game types
export interface Game {
  id: string;
  week: number;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  kickoffTime: string;
  status: 'scheduled' | 'in_progress' | 'final';
  createdAt: string;
  updatedAt: string;
}

// Stats types
export interface PlayerGameStats {
  id: string;
  playerId: string;
  gameId: string;
  passYards: number;
  passTDs: number;
  passInterceptions: number;
  pass2PtConversions: number;
  rushYards: number;
  rushTDs: number;
  rush2PtConversions: number;
  receptions: number;
  recYards: number;
  recTDs: number;
  rec2PtConversions: number;
  fumblesLost: number;
  fgMade0_39: number;
  fgMade40_49: number;
  fgMade50_54: number;
  fgMade55Plus: number;
  fgMissed: number;
  xpMade: number;
  xpMissed: number;
  rawJson?: string;
  updatedAt: string;
}

export interface TeamDefenseGameStats {
  id: string;
  defenseTeamAbbr: string;
  gameId: string;
  pointsAllowed: number;
  yardsAllowed: number;
  sacks: number;
  interceptions: number;
  fumbleRecoveries: number;
  defenseTDs: number;
  safeties: number;
  blockedKicks: number;
  returnTDs: number;
  rawJson?: string;
  updatedAt: string;
}

// Scoring types
export interface ScoringRules {
  passing: {
    yardsPerPoint: number;
    tdPoints: number;
    interceptionPoints: number;
    twoPtConversionPoints: number;
  };
  rushing: {
    yardsPerPoint: number;
    tdPoints: number;
    twoPtConversionPoints: number;
  };
  receiving: {
    yardsPerPoint: number;
    tdPoints: number;
    receptionPoints: number;
    twoPtConversionPoints: number;
  };
  kicking: {
    fgMade0_39Points: number;
    fgMade40_49Points: number;
    fgMade50_54Points: number;
    fgMade55PlusPoints: number;
    fgMissedPoints: number;
    xpMadePoints: number;
    xpMissedPoints: number;
  };
  defense: {
    sackPoints: number;
    interceptionPoints: number;
    fumbleRecoveryPoints: number;
    defenseTDPoints: number;
    safetyPoints: number;
    blockedKickPoints: number;
    returnTDPoints: number;
    pointsAllowedScoring: Array<{
      maxPoints: number;
      fantasyPoints: number;
    }>;
    yardsAllowedScoring: Array<{
      maxYards: number;
      fantasyPoints: number;
    }>;
  };
  misc: {
    fumbleLostPoints: number;
  };
  bonuses: {
    passingTD50PlusYards?: number;
    rushingTD50PlusYards?: number;
    receivingTD50PlusYards?: number;
    passing300PlusYards?: number;
    passing400PlusYards?: number;
    rushing100PlusYards?: number;
    rushing200PlusYards?: number;
    receiving100PlusYards?: number;
    receiving200PlusYards?: number;
    fg55PlusYards?: number;
  };
}

export interface ScoreBreakdown {
  category: string;
  stat: string;
  value: number;
  points: number;
}

export interface TeamScore {
  id: string;
  teamId: string;
  week: number;
  starterPoints: number;
  benchPoints: number;
  totalPoints: number;
  breakdownJson?: string;
  updatedAt: string;
}

export interface PlayerScore {
  id: string;
  rosterPlayerId: string;
  week: number;
  points: number;
  isStarter: boolean;
  breakdownJson?: string;
  updatedAt: string;
}

// League settings
export interface LeagueSettings {
  id: string;
  currentWeek: number;
  lockTime: string | null;
  activeScoringRuleSetId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Game events (for bonus tracking)
export interface GameEvent {
  id: string;
  gameId: string;
  playerId: string | null;
  eventType: string;
  yards: number | null;
  description: string | null;
  bonusPoints: number | null;
  createdAt: string;
}
