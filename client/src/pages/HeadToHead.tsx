import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { publicApi } from '../lib/api';

interface GameInfo {
  opponent: string;
  kickoffUtc: string;
  gameStatus: string;
  spreadHome: number | null;
  total: number | null;
  isHome: boolean;
}

interface Player {
  displayName: string;
  position: string;
  nflTeam: string;
  slot?: string;
  points: number;
  statLine?: string;
  game?: GameInfo | null;
}

// Helper: check if player's game is live (reusable)
function isPlayerLive(player: Player | undefined, debugLive: boolean, debugIndex?: number, currentIndex?: number): boolean {
  if (!player) return false;
  // Debug mode: force first player with a game to show as live
  if (debugLive && player.game && debugIndex !== undefined && currentIndex !== undefined && currentIndex === debugIndex) {
    return true;
  }
  if (!player.game) return false;
  const status = player.game.gameStatus;
  return status === 'in_progress' || status === 'IN_PROGRESS';
}

// Check if a player's game has started (in_progress or final)
function hasGameStarted(player: Player | undefined): boolean {
  if (!player?.game) return false;
  const status = player.game.gameStatus?.toLowerCase();
  return status === 'in_progress' || status === 'final';
}

// Compact game info strip component
function GameStrip({ game, muted = false, forceLive = false }: { game?: GameInfo | null; muted?: boolean; forceLive?: boolean }) {
  if (!game) {
    return <span className="text-slate-600" style={{ fontSize: '10px', lineHeight: '14px' }}>No game</span>;
  }

  const kickoff = new Date(game.kickoffUtc);
  const isLive = forceLive || game.gameStatus === 'in_progress' || game.gameStatus === 'IN_PROGRESS';
  const isFinal = game.gameStatus === 'final' || game.gameStatus === 'FINAL';
  
  const formatKickoff = () => {
    if (isFinal) return 'Final';
    if (isLive) return 'LIVE';
    return kickoff.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatSpread = () => {
    if (game.spreadHome === null) return null;
    const spread = game.isHome ? game.spreadHome : -game.spreadHome;
    if (spread === 0) return 'PK';
    return spread > 0 ? `+${spread}` : spread.toString();
  };

  const spread = formatSpread();
  const textColor = muted ? 'text-slate-600' : 'text-slate-500';
  const dotColor = muted ? 'text-slate-700' : 'text-slate-600';

  return (
    <div className={`${textColor} flex items-center gap-1.5 flex-wrap`} style={{ fontSize: '10px', lineHeight: '14px' }}>
      {isLive && (
        <span className="relative flex h-2 w-2 mr-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      )}
      <span className={isLive ? 'text-green-400 font-semibold' : ''}>
        {isLive ? 'LIVE' : game.opponent}
      </span>
      {!isLive && (
        <>
          <span className={dotColor}>•</span>
          <span>{formatKickoff()}</span>
        </>
      )}
      {isLive && (
        <>
          <span className="text-green-600">•</span>
          <span className="text-green-400">{game.opponent}</span>
        </>
      )}
      {!isFinal && !isLive && game.total !== null && (
        <>
          <span className={dotColor}>•</span>
          <span>O/U {game.total}</span>
        </>
      )}
      {!isFinal && !isLive && spread && (
        <>
          <span className={dotColor}>•</span>
          <span>{spread}</span>
        </>
      )}
    </div>
  );
}

// Player points display with live styling
function PlayerPoints({ 
  player, 
  isLive, 
  winning, 
  muted = false 
}: { 
  player: Player | undefined; 
  isLive: boolean; 
  winning?: boolean;
  muted?: boolean;
}) {
  if (!player) {
    return (
      <div className="text-slate-700" style={{ fontSize: '1.125rem', lineHeight: '1.75rem', fontWeight: 700 }}>
        —
      </div>
    );
  }

  // Check if game has started (has stats to show)
  const gameStarted = hasGameStarted(player);
  // Show actual points (including 0 and negative) if game started, otherwise show dash
  const showPoints = gameStarted || player.points !== 0;
  const pointsValue = Math.round(player.points);
  
  // Determine color based on state - only IN_PROGRESS gets green
  let colorClass = muted ? 'text-slate-500' : 'text-white';
  if (isLive) {
    colorClass = 'text-green-400';
  } else if (!showPoints) {
    colorClass = 'text-slate-700';
  }

  return (
    <div className="text-right">
      <div className={colorClass} style={{ fontSize: '1.125rem', lineHeight: '1.75rem', fontWeight: 700 }}>
        {showPoints ? pointsValue : '—'}
      </div>
    </div>
  );
}

interface TeamData {
  id: string;
  name: string;
  totalPoints: number;
  minutesLeft: number;
  starters: Player[];
  bench: Player[];
}

interface MatchupData {
  team1: TeamData;
  team2: TeamData;
  conference: string;
  matchupNum: number;
}

interface OtherMatchup {
  conference: string;
  matchupNum: number;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  isCurrent: boolean;
}

const SLOT_ORDER = ['QB', 'RB', 'WRTE', 'FLEX1', 'FLEX2', 'FLEX3', 'K', 'DEF'];
const SLOT_LABELS: Record<string, string> = {
  QB: 'QB',
  RB: 'RB',
  WRTE: 'WR/TE',
  FLEX1: 'FLEX',
  FLEX2: 'FLEX',
  FLEX3: 'FLEX',
  K: 'K',
  DEF: 'DEF',
};

// Bracket order for all conferences
const BRACKET_ORDER: Record<string, string[]> = {
  NFC: ["Sacks and the City", "CMFers", "Masters of the Universe", "Stacy's Mom"],
  AFC: ["Bash Brothers", "Pole Patrol", "Nemesis Enforcer", "Monday Morning QBs"],
};

export default function HeadToHead() {
  const { week, conference, matchup } = useParams<{ week: string; conference: string; matchup: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState<MatchupData | null>(null);
  const [allMatchups, setAllMatchups] = useState<OtherMatchup[]>([]);
  const [loading, setLoading] = useState(true);

  // Debug mode: ?debugLive=1 forces first player with a game to show as live
  const debugLive = searchParams.get('debugLive') === '1';
  
  // Find the first player index that has a game (for debug mode)
  const getDebugLiveIndex = (starters: Player[]): number => {
    return starters.findIndex(p => p.game !== null && p.game !== undefined);
  };

  useEffect(() => {
    loadMatchup();
  }, [week, conference, matchup]);

  const loadMatchup = async () => {
    try {
      const weekNum = parseInt(week || '2');
      const matchupNum = parseInt(matchup || '1');
      
      // Get scoreboard data to find the teams
      const res = await publicApi.getScoreboard(weekNum);
      
      // Build all matchups for the scoreboard strip
      const matchups: OtherMatchup[] = [];
      for (const conf of res.data.conferences) {
        const order = BRACKET_ORDER[conf.name] || [];
        const sortedTeams = [...conf.teams].sort((a: any, b: any) => {
          return order.indexOf(a.name) - order.indexOf(b.name);
        });
        
        // Matchup 1: teams[0] vs teams[1]
        matchups.push({
          conference: conf.name,
          matchupNum: 1,
          team1Name: sortedTeams[0]?.name || '',
          team2Name: sortedTeams[1]?.name || '',
          team1Score: sortedTeams[0]?.score || 0,
          team2Score: sortedTeams[1]?.score || 0,
          isCurrent: conf.name === conference && matchupNum === 1,
        });
        
        // Matchup 2: teams[2] vs teams[3]
        matchups.push({
          conference: conf.name,
          matchupNum: 2,
          team1Name: sortedTeams[2]?.name || '',
          team2Name: sortedTeams[3]?.name || '',
          team1Score: sortedTeams[2]?.score || 0,
          team2Score: sortedTeams[3]?.score || 0,
          isCurrent: conf.name === conference && matchupNum === 2,
        });
      }
      setAllMatchups(matchups);
      
      const conf = res.data.conferences.find((c: any) => c.name === conference);
      
      if (!conf) {
        setLoading(false);
        return;
      }

      const order = BRACKET_ORDER[conference || ''] || [];
      const sortedTeams = [...conf.teams].sort((a: any, b: any) => {
        return order.indexOf(a.name) - order.indexOf(b.name);
      });

      // Matchup 1 = teams[0] vs teams[1], Matchup 2 = teams[2] vs teams[3]
      const team1Index = matchupNum === 1 ? 0 : 2;
      const team2Index = matchupNum === 1 ? 1 : 3;
      
      const team1Id = sortedTeams[team1Index]?.id;
      const team2Id = sortedTeams[team2Index]?.id;

      if (!team1Id || !team2Id) {
        setLoading(false);
        return;
      }

      // Fetch both teams' details
      const [team1Res, team2Res] = await Promise.all([
        publicApi.getTeam(team1Id, weekNum),
        publicApi.getTeam(team2Id, weekNum),
      ]);

      setData({
        team1: {
          id: team1Id,
          name: team1Res.data.team.name,
          totalPoints: team1Res.data.team.totalPoints || 0,
          minutesLeft: team1Res.data.team.minutesLeft || 0,
          starters: team1Res.data.starters || [],
          bench: team1Res.data.bench || [],
        },
        team2: {
          id: team2Id,
          name: team2Res.data.team.name,
          totalPoints: team2Res.data.team.totalPoints || 0,
          minutesLeft: team2Res.data.team.minutesLeft || 0,
          starters: team2Res.data.starters || [],
          bench: team2Res.data.bench || [],
        },
        conference: conference || '',
        matchupNum,
      });
    } catch (err) {
      console.error('Failed to load matchup', err);
    } finally {
      setLoading(false);
    }
  };

  const getSortedStarters = (starters: Player[]) => {
    return [...starters].sort((a, b) => {
      const aIndex = SLOT_ORDER.indexOf(a.slot || '');
      const bIndex = SLOT_ORDER.indexOf(b.slot || '');
      return aIndex - bIndex;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading matchup...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Matchup not found</div>
      </div>
    );
  }

  const team1Starters = getSortedStarters(data.team1.starters);
  const team2Starters = getSortedStarters(data.team2.starters);
  const team1Leading = data.team1.totalPoints > data.team2.totalPoints;
  const team2Leading = data.team2.totalPoints > data.team1.totalPoints;
  const totalPoints = data.team1.totalPoints + data.team2.totalPoints;
  const team1Percent = totalPoints > 0 ? (data.team1.totalPoints / totalPoints) * 100 : 50;

  const isNFC = data.conference === 'NFC';

  // Helper to get abbreviated team name
  const abbreviate = (name: string) => {
    const abbrevs: Record<string, string> = {
      "Sacks and the City": "StC",
      "CMFers": "CMF",
      "Masters of the Universe": "MotU",
      "Stacy's Mom": "SM",
      "Bash Brothers": "BB",
      "Pole Patrol": "PP",
      "Nemesis Enforcer": "NE",
      "Monday Morning QBs": "MMQB",
    };
    return abbrevs[name] || name.substring(0, 4);
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Scoreboard Strip - ESPN style */}
      <div className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center">
            {/* Back button */}
            <button
              onClick={() => navigate('/live')}
              className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors border-r border-slate-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            {/* Matchup boxes */}
            <div className="flex-1 flex overflow-x-auto">
              {allMatchups.map((m) => {
                const isCurrentMatchup = m.isCurrent;
                const confColor = m.conference === 'NFC' ? 'blue' : 'red';
                
                return (
                  <button
                    key={`${m.conference}-${m.matchupNum}`}
                    onClick={() => navigate(`/h2h/${week}/${m.conference}/${m.matchupNum}`)}
                    className={`flex-shrink-0 px-3 py-2 border-r border-slate-800 transition-colors ${
                      isCurrentMatchup 
                        ? confColor === 'blue' ? 'bg-blue-500/10' : 'bg-red-500/10'
                        : 'hover:bg-slate-800'
                    }`}
                  >
                    <div className={`text-[9px] font-medium uppercase tracking-wider mb-1 ${
                      confColor === 'blue' ? 'text-blue-400' : 'text-red-400'
                    }`}>
                      {m.conference}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className={`font-medium ${m.team1Score > m.team2Score ? 'text-white' : 'text-slate-500'}`}>
                        {abbreviate(m.team1Name)}
                      </div>
                      <div className={`font-bold tabular-nums ${m.team1Score > m.team2Score ? 'text-white' : 'text-slate-500'}`}>
                        {m.team1Score || 0}
                      </div>
                      <div className="text-slate-700">-</div>
                      <div className={`font-bold tabular-nums ${m.team2Score > m.team1Score ? 'text-white' : 'text-slate-500'}`}>
                        {m.team2Score || 0}
                      </div>
                      <div className={`font-medium ${m.team2Score > m.team1Score ? 'text-white' : 'text-slate-500'}`}>
                        {abbreviate(m.team2Name)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Compact Score Strip - ESPN/RT Sports style */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className={`rounded-xl border overflow-hidden ${
          isNFC ? 'bg-slate-900/80 border-blue-500/20' : 'bg-slate-900/80 border-red-500/20'
        }`}>
          {/* Main Score Area */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-4">
            {/* Team 1 */}
            <div className="flex items-center gap-4">
              <div className={`text-4xl md:text-5xl font-black tabular-nums ${team1Leading ? 'text-amber-400' : 'text-white'}`}>
                {data.team1.totalPoints > 0 ? Math.round(data.team1.totalPoints) : '0'}
              </div>
              <div>
                <div className={`font-semibold ${team1Leading ? 'text-amber-400' : 'text-white'}`}>
                  {data.team1.name}
                </div>
                {team1Leading && <div className="text-[10px] text-amber-400/70 uppercase tracking-wider">Leading</div>}
              </div>
            </div>

            {/* Center Divider */}
            <div className="px-4 md:px-8">
              <div className="text-slate-600 text-xs font-medium">VS</div>
            </div>

            {/* Team 2 */}
            <div className="flex items-center justify-end gap-4">
              <div className="text-right">
                <div className={`font-semibold ${team2Leading ? 'text-amber-400' : 'text-white'}`}>
                  {data.team2.name}
                </div>
                {team2Leading && <div className="text-[10px] text-amber-400/70 uppercase tracking-wider">Leading</div>}
              </div>
              <div className={`text-4xl md:text-5xl font-black tabular-nums ${team2Leading ? 'text-amber-400' : 'text-white'}`}>
                {data.team2.totalPoints > 0 ? Math.round(data.team2.totalPoints) : '0'}
              </div>
            </div>
          </div>

          {/* Slim Progress Bar */}
          <div className="px-4 pb-3">
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
              <div 
                className={`h-full transition-all duration-500 ${team1Leading ? 'bg-amber-500' : 'bg-slate-600'}`}
                style={{ width: `${team1Percent}%` }}
              />
              <div 
                className={`h-full transition-all duration-500 ${team2Leading ? 'bg-amber-500' : 'bg-slate-600'}`}
                style={{ width: `${100 - team1Percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-Side Lineups */}
      <div className="max-w-5xl mx-auto px-4 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Team 1 Lineup */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 overflow-hidden">
            <div className={`px-4 py-3 border-b border-slate-800/50 ${team1Leading ? 'bg-amber-500/5' : ''}`}>
              <div className="flex items-center justify-between">
                <h2 className={`font-semibold text-sm ${team1Leading ? 'text-amber-400' : 'text-white'}`}>
                  {data.team1.name}
                </h2>
                {data.team1.minutesLeft > 0 && (
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {data.team1.minutesLeft}m
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-slate-800/30">
              {SLOT_ORDER.map((slot) => {
                const player = team1Starters.find(p => p.slot === slot);
                const opponent = team2Starters.find(p => p.slot === slot);
                // Only show winning/losing when both players' games have started
                const bothStarted = hasGameStarted(player) && hasGameStarted(opponent);
                const winning = bothStarted && player && opponent && player.points > opponent.points;
                const debugLiveIndex = getDebugLiveIndex(team1Starters);
                const playerIndex = team1Starters.findIndex(p => p.slot === slot);
                const isLive = isPlayerLive(player, debugLive, debugLiveIndex, playerIndex);
                
                // Row background: only IN_PROGRESS gets green
                const rowBg = isLive ? 'bg-green-500/10' : '';
                
                return (
                  <div key={slot} className={`px-4 h-16 flex items-center justify-between ${rowBg}`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-10 flex-shrink-0 text-[10px] font-semibold uppercase ${isLive ? 'text-green-400' : 'text-slate-500'}`}>
                        {SLOT_LABELS[slot]}
                      </div>
                      {player ? (
                        <div className="min-w-0 flex-1">
                          <div className={`truncate ${isLive ? 'text-green-400' : 'text-white'}`} style={{ fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 500 }}>{player.displayName}</div>
                          <div className="flex items-center gap-1.5 text-slate-500" style={{ fontSize: '10px', lineHeight: '14px' }}>
                            <GameStrip game={player.game} forceLive={isLive} />
                          </div>
                          <div className={`truncate h-3 ${isLive ? 'text-green-400/70' : 'text-slate-500'}`} style={{ fontSize: '9px', lineHeight: '12px' }}>
                            {hasGameStarted(player) && player.statLine ? player.statLine : '\u00A0'}
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-600" style={{ fontSize: '0.875rem', lineHeight: '1.25rem' }}>Empty</div>
                      )}
                    </div>
                    <PlayerPoints player={player} isLive={isLive} winning={winning} />
                  </div>
                );
              })}
            </div>
            
            {/* Bench Section */}
            {data.team1.bench.length > 0 && (
              <div className="mt-2 border-t border-slate-700/50">
                <div className="px-4 py-2 bg-slate-800/40">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Bench</span>
                </div>
                <div className="divide-y divide-slate-800/20 bg-slate-900/30">
                  {data.team1.bench.map((player, idx) => {
                    const isLive = isPlayerLive(player, debugLive, 0, idx === 0 ? 0 : -1);
                    return (
                      <div key={idx} className={`px-4 h-16 flex items-center justify-between ${isLive ? 'bg-green-500/5' : ''}`}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`w-10 flex-shrink-0 text-[10px] font-semibold uppercase ${isLive ? 'text-green-500' : 'text-slate-600'}`}>
                            {player.position}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`truncate ${isLive ? 'text-green-400' : 'text-slate-400'}`} style={{ fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 500 }}>{player.displayName}</div>
                            <div className="flex items-center gap-1.5 text-slate-500" style={{ fontSize: '10px', lineHeight: '14px' }}>
                              <GameStrip game={player.game} muted={!isLive} forceLive={isLive} />
                            </div>
                            <div className={`truncate h-3 ${isLive ? 'text-green-400/70' : 'text-slate-500'}`} style={{ fontSize: '9px', lineHeight: '12px' }}>
                              {hasGameStarted(player) && player.statLine ? player.statLine : '\u00A0'}
                            </div>
                          </div>
                        </div>
                        <PlayerPoints player={player} isLive={isLive} muted={!isLive} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Team 2 Lineup */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 overflow-hidden">
            <div className={`px-4 py-3 border-b border-slate-800/50 ${team2Leading ? 'bg-amber-500/5' : ''}`}>
              <div className="flex items-center justify-between">
                <h2 className={`font-semibold text-sm ${team2Leading ? 'text-amber-400' : 'text-white'}`}>
                  {data.team2.name}
                </h2>
                {data.team2.minutesLeft > 0 && (
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {data.team2.minutesLeft}m
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-slate-800/30">
              {SLOT_ORDER.map((slot) => {
                const player = team2Starters.find(p => p.slot === slot);
                const opponent = team1Starters.find(p => p.slot === slot);
                // Only show winning/losing when both players' games have started
                const bothStarted = hasGameStarted(player) && hasGameStarted(opponent);
                const winning = bothStarted && player && opponent && player.points > opponent.points;
                const debugLiveIndex = getDebugLiveIndex(team2Starters);
                const playerIndex = team2Starters.findIndex(p => p.slot === slot);
                const isLive = isPlayerLive(player, debugLive, debugLiveIndex, playerIndex);
                
                // Row background: only IN_PROGRESS gets green
                const rowBg = isLive ? 'bg-green-500/10' : '';
                
                return (
                  <div key={slot} className={`px-4 h-16 flex items-center justify-between ${rowBg}`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-10 flex-shrink-0 text-[10px] font-semibold uppercase ${isLive ? 'text-green-400' : 'text-slate-500'}`}>
                        {SLOT_LABELS[slot]}
                      </div>
                      {player ? (
                        <div className="min-w-0 flex-1">
                          <div className={`truncate ${isLive ? 'text-green-400' : 'text-white'}`} style={{ fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 500 }}>{player.displayName}</div>
                          <div className="flex items-center gap-1.5 text-slate-500" style={{ fontSize: '10px', lineHeight: '14px' }}>
                            <GameStrip game={player.game} forceLive={isLive} />
                          </div>
                          <div className={`truncate h-3 ${isLive ? 'text-green-400/70' : 'text-slate-500'}`} style={{ fontSize: '9px', lineHeight: '12px' }}>
                            {hasGameStarted(player) && player.statLine ? player.statLine : '\u00A0'}
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-600" style={{ fontSize: '0.875rem', lineHeight: '1.25rem' }}>Empty</div>
                      )}
                    </div>
                    <PlayerPoints player={player} isLive={isLive} winning={winning} />
                  </div>
                );
              })}
            </div>
            
            {/* Bench Section */}
            {data.team2.bench.length > 0 && (
              <div className="mt-2 border-t border-slate-700/50">
                <div className="px-4 py-2 bg-slate-800/40">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Bench</span>
                </div>
                <div className="divide-y divide-slate-800/20 bg-slate-900/30">
                  {data.team2.bench.map((player, idx) => {
                    const isLive = isPlayerLive(player, debugLive, 0, idx === 0 ? 0 : -1);
                    return (
                      <div key={idx} className={`px-4 h-16 flex items-center justify-between ${isLive ? 'bg-green-500/5' : ''}`}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`w-10 flex-shrink-0 text-[10px] font-semibold uppercase ${isLive ? 'text-green-500' : 'text-slate-600'}`}>
                            {player.position}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`truncate ${isLive ? 'text-green-400' : 'text-slate-400'}`} style={{ fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 500 }}>{player.displayName}</div>
                            <div className="flex items-center gap-1.5 text-slate-500" style={{ fontSize: '10px', lineHeight: '14px' }}>
                              <GameStrip game={player.game} muted={!isLive} forceLive={isLive} />
                            </div>
                            <div className={`truncate h-3 ${isLive ? 'text-green-400/70' : 'text-slate-500'}`} style={{ fontSize: '9px', lineHeight: '12px' }}>
                              {hasGameStarted(player) && player.statLine ? player.statLine : '\u00A0'}
                            </div>
                          </div>
                        </div>
                        <PlayerPoints player={player} isLive={isLive} muted={!isLive} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
