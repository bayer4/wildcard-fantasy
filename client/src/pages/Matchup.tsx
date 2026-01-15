import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { teamApi } from '../lib/api';
import { useAuthStore } from '../lib/store';

const ROUND_NAMES: Record<number, string> = {
  1: 'Wildcard',
  2: 'Divisional',
  3: 'Conference',
  4: 'Super Bowl',
};

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

const SLOT_ORDER = ['QB', 'RB', 'WRTE', 'FLEX1', 'FLEX2', 'FLEX3', 'K', 'DEF'];

// Draft order for Divisional round (week 2)
const DIVISIONAL_DRAFT_ORDER: Record<string, string[]> = {
  NFC: ["Sacks and the City", "Masters of the Universe", "Stacy's Mom", "CMFers"],
  AFC: ["Bash Brothers", "Nemesis Enforcer", "Monday Morning QBs", "Pole Patrol"],
};

interface GameInfo {
  gameId: string;
  opponent: string;
  kickoffUtc: string;
  gameStatus: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  spreadHome: number | null;
  total: number | null;
}

interface BreakdownItem {
  label: string;
  points: number;
}

interface Player {
  displayName: string;
  position: string;
  nflTeam: string;
  slot?: string;
  points: number;
  statLine?: string;
  breakdown?: BreakdownItem[];
  game?: GameInfo | null;
}

// Player stat line component
function StatLine({ statLine }: { statLine?: string }) {
  if (!statLine) return null;
  return (
    <div className="text-xs text-emerald-400 font-mono mt-0.5">
      {statLine}
    </div>
  );
}

// Expandable breakdown component
function BreakdownPanel({ breakdown, expanded }: { breakdown?: BreakdownItem[]; expanded: boolean }) {
  if (!expanded || !breakdown || breakdown.length === 0) return null;
  return (
    <div className="mt-2 pt-2 border-t border-slate-700/50 grid grid-cols-2 gap-x-4 gap-y-1">
      {breakdown.map((item, i) => (
        <div key={i} className="flex justify-between text-xs">
          <span className="text-slate-500">{item.label}</span>
          <span className={item.points >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {item.points > 0 ? '+' : ''}{item.points}
          </span>
        </div>
      ))}
    </div>
  );
}

// Compact game info strip component
function GameStrip({ game, nflTeam }: { game?: GameInfo | null; nflTeam: string }) {
  if (!game) {
    return <span className="text-slate-600 text-xs">No game</span>;
  }

  const kickoff = new Date(game.kickoffUtc);
  const now = new Date();
  const isUpcoming = kickoff > now && game.gameStatus === 'scheduled';
  
  const formatKickoff = () => {
    if (game.gameStatus === 'final') return 'Final';
    if (game.gameStatus === 'in_progress') return 'Live';
    return kickoff.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatSpread = () => {
    if (game.spreadHome === null) return null;
    const isHome = game.homeTeam === nflTeam;
    const spread = isHome ? game.spreadHome : -game.spreadHome;
    if (spread === 0) return 'PK';
    return spread > 0 ? `+${spread}` : spread.toString();
  };

  const spread = formatSpread();

  const isLive = game.gameStatus === 'in_progress' || game.gameStatus === 'IN_PROGRESS';

  return (
    <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
      {isLive && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      )}
      <span className={isLive ? 'text-green-400' : ''}>
        {game.opponent}
      </span>
      <span className="text-slate-600">•</span>
      <span className={isLive ? 'text-green-400 font-medium' : ''}>
        {formatKickoff()}
      </span>
      {isUpcoming && game.total !== null && (
        <>
          <span className="text-slate-600">•</span>
          <span>O/U {game.total}</span>
        </>
      )}
      {isUpcoming && spread && (
        <>
          <span className="text-slate-600">•</span>
          <span>{spread}</span>
        </>
      )}
    </div>
  );
}

interface PoolTeam {
  id: string;
  name: string;
  score: number;
  lineupSet: boolean;
  isCurrentTeam: boolean;
}

interface MatchupData {
  team: {
    id: string;
    name: string;
    conferenceName: string;
    starterPoints: number;
    benchPoints: number;
    totalPoints: number;
    rank: number;
  };
  starters: Player[];
  bench: Player[];
  conferencePool: PoolTeam[];
  week: number;
}

export default function Matchup() {
  const { week, teamId } = useParams<{ week: string; teamId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  const [data, setData] = useState<MatchupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set());

  const toggleBreakdown = (playerKey: string) => {
    setExpandedPlayers(prev => {
      const next = new Set(prev);
      if (next.has(playerKey)) {
        next.delete(playerKey);
      } else {
        next.add(playerKey);
      }
      return next;
    });
  };

  useEffect(() => {
    if (week && teamId) {
      loadMatchup();
    }
  }, [week, teamId]);

  const loadMatchup = async () => {
    setLoading(true);
    try {
      const res = await teamApi.getMatchup(parseInt(week!), teamId!);
      setData(res.data);
    } catch (err) {
      console.error('Failed to load matchup', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading matchup...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-white mb-4">Team Not Found</h2>
        <button onClick={() => navigate('/scoreboard')} className="text-amber-400 hover:underline">
          ← Back to Scoreboard
        </button>
      </div>
    );
  }

  const weekNum = parseInt(week!);
  const roundName = ROUND_NAMES[weekNum] || `Week ${weekNum}`;
  const isUserTeam = data.team.id === user?.teamId;
  const isNFC = data.team.conferenceName === 'NFC';

  // Sort starters by slot order
  const sortedStarters = [...data.starters].sort((a, b) => {
    const aIndex = SLOT_ORDER.indexOf(a.slot || '');
    const bIndex = SLOT_ORDER.indexOf(b.slot || '');
    return aIndex - bIndex;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Back Button */}
      <button
        onClick={() => navigate('/scoreboard')}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Scoreboard
      </button>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className={`px-3 py-1 rounded-lg text-sm font-bold ${
              isNFC ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {data.team.conferenceName}
            </span>
            <span className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-lg text-sm font-medium">
              {roundName} Round
            </span>
            {isUserTeam && (
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-medium">
                Your Team
              </span>
            )}
          </div>
          <h1 className="text-4xl font-black text-white">{data.team.name}</h1>
          <p className="text-slate-400 mt-1">
            Rank #{data.team.rank} in {data.team.conferenceName} Pool
          </p>
        </div>

        {/* Score Summary */}
        <div className="flex gap-6">
          <div className="text-center px-6 py-4 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-2xl border border-amber-500/20">
            <div className="text-4xl font-black text-amber-400">
              {data.team.starterPoints > 0 ? Math.round(data.team.starterPoints) : '—'}
            </div>
            <div className="text-sm text-slate-500 uppercase tracking-wide">Starters</div>
          </div>
          <div className="text-center px-6 py-4 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="text-2xl font-bold text-slate-400">
              {data.team.benchPoints > 0 ? Math.round(data.team.benchPoints) : '—'}
            </div>
            <div className="text-sm text-slate-500 uppercase tracking-wide">Bench</div>
          </div>
        </div>
      </div>

      {/* Conference Pool Standings */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">{data.team.conferenceName} Pool Standings</h2>
        </div>
        <div className="grid grid-cols-4 gap-1 p-2">
          {[...data.conferencePool].sort((a, b) => {
            const hasScores = data.conferencePool.some(t => t.score > 0);
            if (hasScores) {
              return b.score - a.score; // Sort by score when games have started
            }
            // Use draft order for week 2 before scores
            if (weekNum === 2) {
              const order = DIVISIONAL_DRAFT_ORDER[data.team.conferenceName] || [];
              return order.indexOf(a.name) - order.indexOf(b.name);
            }
            return 0;
          }).map((team, index) => (
            <button
              key={team.id}
              onClick={() => team.id !== teamId && navigate(`/matchup/${weekNum}/${team.id}`)}
              disabled={team.id === teamId}
              className={`p-4 rounded-xl transition-all ${
                team.isCurrentTeam
                  ? 'bg-amber-500/10 border-2 border-amber-500/50'
                  : 'bg-slate-800/50 hover:bg-slate-700/50 border-2 border-transparent'
              }`}
            >
              <div className={`text-xs font-bold mb-1 ${
                index === 0 ? 'text-amber-400' : 'text-slate-500'
              }`}>
                #{index + 1}
              </div>
              <div className={`font-semibold truncate ${
                team.isCurrentTeam ? 'text-amber-400' : 'text-white'
              }`}>
                {team.name}
              </div>
              <div className={`text-2xl font-black mt-1 ${
                team.score > 0 ? 'text-white' : 'text-slate-600'
              }`}>
                {team.score > 0 ? Math.round(team.score) : '—'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Starters */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Starting Lineup</h2>
            <p className="text-slate-500 text-sm">{sortedStarters.length} of 8 slots filled</p>
          </div>
          {isUserTeam && (
            <button
              onClick={() => navigate('/team')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
            >
              Edit Lineup
            </button>
          )}
        </div>
        
        <div className="divide-y divide-slate-800">
          {SLOT_ORDER.map((slotKey) => {
            const player = sortedStarters.find(p => p.slot === slotKey);
            const playerKey = player ? `starter-${player.displayName}-${slotKey}` : '';
            const hasBreakdown = player?.breakdown && player.breakdown.length > 0;
            const isExpanded = expandedPlayers.has(playerKey);
            
            return (
              <div key={slotKey} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <span className={`w-14 text-center px-3 py-1.5 rounded-lg text-xs font-bold mt-0.5 ${
                      player ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {SLOT_LABELS[slotKey]}
                    </span>
                    {player ? (
                      <div className="flex-1">
                        <div className="text-white font-medium">{player.displayName}</div>
                        <StatLine statLine={player.statLine} />
                        <GameStrip game={player.game} nflTeam={player.nflTeam} />
                      </div>
                    ) : (
                      <div className="text-slate-600 italic">Empty</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`text-xl font-bold min-w-[2rem] text-right ${
                      player 
                        ? (player.statLine && player.statLine.length > 0) || player.points > 0
                          ? 'text-white' 
                          : 'text-slate-700'
                        : 'text-slate-700'
                    }`}>
                      {player ? Math.round(player.points) : '—'}
                    </div>
                    <button
                      onClick={() => hasBreakdown && toggleBreakdown(playerKey)}
                      className={`p-1 w-6 h-6 flex items-center justify-center transition-colors ${
                        hasBreakdown ? 'text-slate-500 hover:text-slate-300 cursor-pointer' : 'invisible'
                      }`}
                      title={hasBreakdown ? 'Show scoring breakdown' : undefined}
                      disabled={!hasBreakdown}
                    >
                      <svg 
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
                {player && <BreakdownPanel breakdown={player.breakdown} expanded={isExpanded} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bench */}
      {data.bench.length > 0 && (
        <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800/50">
            <h2 className="text-lg font-semibold text-slate-300">Bench</h2>
            <p className="text-slate-500 text-sm">{data.bench.length} players</p>
          </div>
          
          <div className="divide-y divide-slate-800/50">
            {data.bench.map((player, index) => {
              const playerKey = `bench-${player.displayName}-${index}`;
              const hasBreakdown = player.breakdown && player.breakdown.length > 0;
              const isExpanded = expandedPlayers.has(playerKey);
              
              return (
                <div key={index} className="px-6 py-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <span className="w-14 text-center px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/50 text-slate-500 mt-0.5">
                        {player.position}
                      </span>
                      <div className="flex-1">
                        <div className="text-slate-300">{player.displayName}</div>
                        <StatLine statLine={player.statLine} />
                        <GameStrip game={player.game} nflTeam={player.nflTeam} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`font-medium min-w-[2rem] text-right ${
                        (player.statLine && player.statLine.length > 0) || player.points > 0 
                          ? 'text-slate-300' 
                          : 'text-slate-700'
                      }`}>
                        {Math.round(player.points)}
                      </div>
                      <button
                        onClick={() => hasBreakdown && toggleBreakdown(playerKey)}
                        className={`p-1 w-6 h-6 flex items-center justify-center transition-colors ${
                          hasBreakdown ? 'text-slate-500 hover:text-slate-300 cursor-pointer' : 'invisible'
                        }`}
                        title={hasBreakdown ? 'Show scoring breakdown' : undefined}
                        disabled={!hasBreakdown}
                      >
                        <svg 
                          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <BreakdownPanel breakdown={player.breakdown} expanded={isExpanded} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

