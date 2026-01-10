import { IngestData, IngestGame, IngestPlayerGameStats, IngestDefenseGameStats, IngestGameEvent } from '../types';

/**
 * SportsDataIO provider configuration
 * Endpoints can be adjusted based on your subscription tier
 */
const CONFIG = {
  baseUrl: 'https://api.sportsdata.io/v3/nfl',
  endpoints: {
    // Scores and schedules
    scoresByWeek: '/scores/json/ScoresByWeek/{season}/{week}',
    // Box scores
    boxScore: '/stats/json/BoxScore/{gameId}',
    boxScoreByTeam: '/stats/json/BoxScoreByTeam/{season}/{week}/{team}',
    // Player stats
    playerGameStats: '/stats/json/PlayerGameStatsByWeek/{season}/{week}',
    // Team stats (for defense)
    teamGameStats: '/stats/json/TeamGameStats/{season}/{week}',
    // Play by play (may require higher tier)
    playByPlay: '/stats/json/PlayByPlay/{gameId}',
  },
  // Current NFL season
  season: '2024POST', // Adjust for playoff week
};

function getApiKey(): string | null {
  return process.env.SPORTSDATAIO_API_KEY || null;
}

async function fetchFromApi<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('SportsDataIO API key not configured');
    return null;
  }

  let url = `${CONFIG.baseUrl}${endpoint}`;
  
  // Replace path parameters
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`{${key}}`, value);
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
    });

    if (!response.ok) {
      console.error(`SportsDataIO API error: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('SportsDataIO fetch error:', error);
    return null;
  }
}

interface SportsDataIOScore {
  GameKey: string;
  Week: number;
  HomeTeam: string;
  AwayTeam: string;
  Date: string;
  Status: string;
  HomeScore: number;
  AwayScore: number;
}

interface SportsDataIOPlayerStats {
  PlayerID: number;
  Name: string;
  Position: string;
  Team: string;
  PassingYards: number;
  PassingTouchdowns: number;
  PassingInterceptions: number;
  Passing2PtConversions: number;
  RushingYards: number;
  RushingTouchdowns: number;
  Rushing2PtConversions: number;
  Receptions: number;
  ReceivingYards: number;
  ReceivingTouchdowns: number;
  Receiving2PtConversions: number;
  FumblesLost: number;
  FieldGoalsMade0to39: number;
  FieldGoalsMade40to49: number;
  FieldGoalsMade50Plus: number;
  FieldGoalsMissed: number;
  ExtraPointsMade: number;
  ExtraPointsMissed: number;
}

interface SportsDataIOTeamStats {
  Team: string;
  OpponentScore: number;
  OpponentOffensiveYards: number;
  Sacks: number;
  Interceptions: number;
  FumblesRecovered: number;
  DefensiveTouchdowns: number;
  Safeties: number;
  BlockedKicks: number;
  KickReturnTouchdowns: number;
  PuntReturnTouchdowns: number;
}

/**
 * Fetch and transform data from SportsDataIO
 */
export async function fetchSportsDataIO(week: number, season: string = CONFIG.season): Promise<IngestData | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return null;
  }

  const result: IngestData = {
    games: [],
    playerGameStats: [],
    defenseGameStats: [],
    gameEvents: [],
  };

  // Fetch scores/schedule
  const scores = await fetchFromApi<SportsDataIOScore[]>(
    CONFIG.endpoints.scoresByWeek,
    { season, week: week.toString() }
  );

  if (scores) {
    result.games = scores.map(score => ({
      externalId: score.GameKey,
      week: score.Week,
      homeTeamAbbr: score.HomeTeam,
      awayTeamAbbr: score.AwayTeam,
      kickoffTime: score.Date,
      status: mapGameStatus(score.Status),
    }));
  }

  // Fetch player stats
  const playerStats = await fetchFromApi<SportsDataIOPlayerStats[]>(
    CONFIG.endpoints.playerGameStats,
    { season, week: week.toString() }
  );

  if (playerStats) {
    result.playerGameStats = playerStats
      .filter(p => p.Position !== 'DEF') // Exclude defense "players"
      .map(p => ({
        playerExternalId: p.PlayerID.toString(),
        playerName: p.Name,
        position: mapPosition(p.Position),
        nflTeamAbbr: p.Team,
        gameWeek: week,
        passYards: p.PassingYards || 0,
        passTDs: p.PassingTouchdowns || 0,
        passInterceptions: p.PassingInterceptions || 0,
        pass2PtConversions: p.Passing2PtConversions || 0,
        rushYards: p.RushingYards || 0,
        rushTDs: p.RushingTouchdowns || 0,
        rush2PtConversions: p.Rushing2PtConversions || 0,
        receptions: p.Receptions || 0,
        recYards: p.ReceivingYards || 0,
        recTDs: p.ReceivingTouchdowns || 0,
        rec2PtConversions: p.Receiving2PtConversions || 0,
        fumblesLost: p.FumblesLost || 0,
        fgMade0_39: p.FieldGoalsMade0to39 || 0,
        fgMade40_49: p.FieldGoalsMade40to49 || 0,
        fgMade50_54: 0, // SportsDataIO groups 50+ together
        fgMade55Plus: p.FieldGoalsMade50Plus || 0,
        fgMissed: p.FieldGoalsMissed || 0,
        xpMade: p.ExtraPointsMade || 0,
        xpMissed: p.ExtraPointsMissed || 0,
      }));
  }

  // Fetch team stats (for defense)
  const teamStats = await fetchFromApi<SportsDataIOTeamStats[]>(
    CONFIG.endpoints.teamGameStats,
    { season, week: week.toString() }
  );

  if (teamStats) {
    result.defenseGameStats = teamStats.map(t => ({
      teamAbbr: t.Team,
      gameWeek: week,
      pointsAllowed: t.OpponentScore || 0,
      yardsAllowed: t.OpponentOffensiveYards || 0,
      sacks: t.Sacks || 0,
      interceptions: t.Interceptions || 0,
      fumbleRecoveries: t.FumblesRecovered || 0,
      defenseTDs: t.DefensiveTouchdowns || 0,
      safeties: t.Safeties || 0,
      blockedKicks: t.BlockedKicks || 0,
      returnTDs: (t.KickReturnTouchdowns || 0) + (t.PuntReturnTouchdowns || 0),
    }));
  }

  return result;
}

function mapGameStatus(status: string): 'scheduled' | 'in_progress' | 'final' {
  switch (status) {
    case 'Final':
    case 'F':
    case 'F/OT':
      return 'final';
    case 'InProgress':
    case 'Halftime':
    case '1':
    case '2':
    case '3':
    case '4':
    case 'OT':
      return 'in_progress';
    default:
      return 'scheduled';
  }
}

function mapPosition(position: string): string {
  // Normalize position names
  const posMap: Record<string, string> = {
    'QB': 'QB',
    'RB': 'RB',
    'WR': 'WR',
    'TE': 'TE',
    'K': 'K',
    'DEF': 'DEF',
    'FB': 'RB', // Map fullback to RB
  };
  return posMap[position] || position;
}

/**
 * Check if SportsDataIO is configured and available
 */
export function isSportsDataIOAvailable(): boolean {
  return !!getApiKey();
}

