import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { publicApi } from '../lib/api';

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

// Which rounds have been drafted/seeded
const ACTIVE_ROUNDS = [1]; // Only Wildcard is active for now

interface Team {
  id: string;
  name: string;
  score: number;
}

interface GameInfo {
  opponent: string;
  kickoffUtc: string;
  gameStatus: string;
  spreadHome: number | null;
  total: number | null;
  isHome: boolean;
}

interface Conference {
  id: string;
  name: string;
  teams: Team[];
}

interface TeamDetail {
  id: string;
  name: string;
  conferenceName: string;
  totalPoints: number;
}

interface Starter {
  displayName: string;
  position: string;
  nflTeam: string;
  slot: string;
  points: number;
  statLine?: string;
  game?: GameInfo | null;
}

interface BenchPlayer {
  displayName: string;
  position: string;
  nflTeam: string;
  points: number;
  statLine?: string;
  game?: GameInfo | null;
}

export default function PublicScoreboard() {
  const navigate = useNavigate();
  const { teamId } = useParams<{ teamId?: string }>();
  const [week, setWeek] = useState(1);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<{ team: TeamDetail; starters: Starter[]; bench?: BenchPlayer[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScoreboard();
  }, [week]);

  useEffect(() => {
    if (teamId) {
      loadTeam(teamId);
    } else {
      setSelectedTeam(null);
    }
  }, [teamId, week]);

  const loadScoreboard = async () => {
    try {
      const res = await publicApi.getScoreboard(week);
      setConferences(res.data.conferences);
    } catch (err) {
      console.error('Failed to load scoreboard', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTeam = async (id: string) => {
    try {
      const res = await publicApi.getTeam(id, week);
      setSelectedTeam(res.data);
    } catch (err) {
      console.error('Failed to load team', err);
      setSelectedTeam(null);
    }
  };

  const handleTeamClick = (id: string) => {
    navigate(`/live/${id}`);
  };

  const roundName = ROUND_NAMES[week] || `Week ${week}`;
  const isPoolRound = week === 1;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900 border-b border-amber-500/20">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/live" className="flex items-center gap-3">
              <span className="text-3xl">🏈</span>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                  Wildcard Fantasy
                </h1>
                <p className="text-slate-500 text-sm">BCFL 2025 Playoffs</p>
              </div>
            </Link>
            <Link
              to="/login"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              League Login
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Team Detail View */}
        {selectedTeam ? (
          <div className="space-y-6">
            <button
              onClick={() => navigate('/live')}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Scoreboard
            </button>

            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl">
              <div className={`px-6 py-6 border-b border-slate-700/50 ${
                selectedTeam.team.conferenceName === 'NFC' 
                  ? 'bg-gradient-to-r from-blue-600/20 to-blue-900/20' 
                  : 'bg-gradient-to-r from-red-600/20 to-red-900/20'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`inline-block px-3 py-1 rounded-lg text-sm font-bold mb-3 ${
                      selectedTeam.team.conferenceName === 'NFC' 
                        ? 'bg-blue-500/20 text-blue-400' 
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {selectedTeam.team.conferenceName}
                    </span>
                    <h2 className="text-3xl font-black text-white">{selectedTeam.team.name}</h2>
                    <p className="text-slate-400 mt-1">{roundName} Round</p>
                  </div>
                  <div className="text-right">
                    <div className="text-5xl font-black text-amber-400">
                      {selectedTeam.team.totalPoints}
                    </div>
                    <div className="text-slate-500 text-sm uppercase tracking-wide">Points</div>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-slate-800/50">
                {selectedTeam.starters.map((player, index) => (
                  <div key={index} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <span className="w-14 text-center flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-400">
                          {SLOT_LABELS[player.slot] || player.slot}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-white font-medium">{player.displayName}</div>
                          {/* Stat line */}
                          {player.statLine ? (
                            <div className="text-emerald-400 text-sm">{player.statLine}</div>
                          ) : null}
                          {/* Game info strip */}
                          {player.game ? (
                            <GameStrip game={player.game} />
                          ) : (
                            <div className="text-slate-600 text-sm">{player.nflTeam}</div>
                          )}
                        </div>
                      </div>
                      <div className={`text-xl font-bold min-w-[3rem] text-right flex-shrink-0 ${
                        player.statLine ? 'text-white' : player.points > 0 ? 'text-white' : 'text-slate-600'
                      }`}>
                        {player.points}
                      </div>
                    </div>
                  </div>
                ))}

                {selectedTeam.starters.length === 0 && (
                  <div className="px-6 py-12 text-center text-slate-500">
                    Lineup not yet set
                  </div>
                )}
              </div>
            </div>

            {/* Bench Section */}
            {selectedTeam.bench && selectedTeam.bench.length > 0 && (
              <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl">
                <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/30">
                  <h3 className="text-lg font-semibold text-white">Bench</h3>
                  <p className="text-slate-500 text-sm">{selectedTeam.bench.length} players</p>
                </div>
                <div className="divide-y divide-slate-800/50">
                  {selectedTeam.bench.map((player, index) => (
                    <div key={index} className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <span className="w-14 text-center flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-700/50 text-slate-400">
                            {player.position}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-slate-300 font-medium">{player.displayName}</div>
                            {/* Stat line */}
                            {player.statLine ? (
                              <div className="text-emerald-400 text-sm">{player.statLine}</div>
                            ) : null}
                            {/* Game info strip */}
                            {player.game ? (
                              <GameStrip game={player.game} />
                            ) : (
                              <div className="text-slate-600 text-sm">{player.nflTeam}</div>
                            )}
                          </div>
                        </div>
                        <div className={`text-xl font-bold min-w-[3rem] text-right flex-shrink-0 ${
                          player.statLine ? 'text-slate-400' : player.points > 0 ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          {player.points}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Scoreboard View */
          <div className="space-y-8">
            {/* Header */}
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-3 px-6 py-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-full border border-amber-500/30">
                <span className="text-amber-400 text-sm font-medium uppercase tracking-wider">
                  {isPoolRound ? '4-Way Pool' : 'Head to Head'}
                </span>
              </div>
              
              <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-red-400">
                {roundName} Round
              </h1>
              
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4].map((w) => (
                  <button
                    key={w}
                    onClick={() => {
                      setWeek(w);
                      navigate('/live');
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      week === w
                        ? 'bg-amber-500 text-black'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {ROUND_NAMES[w]}
                  </button>
                ))}
              </div>
              
              <p className="text-orange-400/80 text-sm font-medium">
                ⏱ Scores update at halftime & end of games
              </p>
            </div>

            {/* Conference Pools */}
            {loading ? (
              <div className="text-center py-12 text-slate-400">Loading...</div>
            ) : ACTIVE_ROUNDS.includes(week) ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {conferences.map((conference) => (
                  <ConferenceCard
                    key={conference.id}
                    conference={conference}
                    isPoolRound={isPoolRound}
                    onTeamClick={handleTeamClick}
                  />
                ))}
              </div>
            ) : (
              <FutureRoundCard roundName={roundName} />
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-slate-600 text-sm">
          <p>BCFL Wildcard Playoffs 2025</p>
        </div>
      </main>
    </div>
  );
}

function FutureRoundCard({ roundName }: { roundName: string }) {
  if (roundName === 'Divisional') {
    return (
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-slate-700/50 p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 mb-4">
            <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Draft Pending</h2>
          <p className="text-slate-400">New teams will be drafted after Wildcard concludes</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-red-500/20 flex items-center gap-2">
              <span className="px-3 py-1 bg-red-500/20 text-red-400 text-sm font-bold rounded-lg">AFC</span>
              <span className="text-slate-400 text-sm">Divisional Matchups</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">Bash Brothers</span>
                  <span className="text-slate-600">vs</span>
                  <span className="text-amber-400 italic">Wildcard Winner</span>
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">Nemesis Enforcer</span>
                  <span className="text-slate-600">vs</span>
                  <span className="text-slate-300 font-medium">Monday Morning QBs</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-blue-500/20 flex items-center gap-2">
              <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-sm font-bold rounded-lg">NFC</span>
              <span className="text-slate-400 text-sm">Divisional Matchups</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">Sacks and the City</span>
                  <span className="text-slate-600">vs</span>
                  <span className="text-amber-400 italic">Wildcard Winner</span>
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">Masters of the Universe</span>
                  <span className="text-slate-600">vs</span>
                  <span className="text-slate-300 font-medium">Stacy's Mom</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-slate-800/30 rounded-xl border border-slate-700/30 text-center">
          <p className="text-slate-500 text-sm">
            Teams drafted for Divisional carry through Super Bowl. After Divisional, winners adopt 1 player from losing teams.
          </p>
        </div>
      </div>
    );
  }

  if (roundName === 'Conference') {
    return (
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-slate-700/50 p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/10 mb-4">
          <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Conference Championships</h2>
        <p className="text-slate-400 mb-6">Divisional winners advance with their enhanced rosters</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
            <div className="text-red-400 font-bold mb-3">AFC Championship</div>
            <div className="text-slate-500 italic">Winner of Bash/WC</div>
            <div className="text-slate-600 my-2">vs</div>
            <div className="text-slate-500 italic">Winner of Nemesis/MMQBs</div>
          </div>
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5">
            <div className="text-blue-400 font-bold mb-3">NFC Championship</div>
            <div className="text-slate-500 italic">Winner of Sacks/WC</div>
            <div className="text-slate-600 my-2">vs</div>
            <div className="text-slate-500 italic">Winner of Masters/Stacy's</div>
          </div>
        </div>
      </div>
    );
  }

  // Super Bowl
  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-slate-700/50 p-8 text-center">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-amber-500/20 to-yellow-500/20 mb-4">
        <span className="text-4xl">🏆</span>
      </div>
      <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-400 mb-2">
        Super Bowl
      </h2>
      <p className="text-slate-400 mb-6">Conference Champions battle for glory</p>
      
      <div className="max-w-md mx-auto bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="text-center">
            <div className="text-red-400 font-bold text-lg">AFC Champion</div>
            <div className="text-slate-500 text-sm italic">TBD</div>
          </div>
          <div className="px-4">
            <span className="text-2xl font-black text-slate-600">VS</span>
          </div>
          <div className="text-center">
            <div className="text-blue-400 font-bold text-lg">NFC Champion</div>
            <div className="text-slate-500 text-sm italic">TBD</div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConferenceCardProps {
  conference: Conference;
  isPoolRound: boolean;
  onTeamClick: (teamId: string) => void;
}

function ConferenceCard({ conference, isPoolRound, onTeamClick }: ConferenceCardProps) {
  // Sort teams by score
  const sortedTeams = [...conference.teams].sort((a, b) => b.score - a.score);
  const leader = sortedTeams[0];
  const hasScores = sortedTeams.some(t => t.score > 0);

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl">
      {/* Conference Header */}
      <div className={`px-6 py-5 border-b border-slate-700/50 ${
        conference.name === 'NFC' 
          ? 'bg-gradient-to-r from-blue-600/20 to-blue-900/20' 
          : 'bg-gradient-to-r from-red-600/20 to-red-900/20'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg ${
              conference.name === 'NFC'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              {conference.name}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{conference.name} {isPoolRound ? 'Pool' : 'Bracket'}</h2>
              <p className="text-slate-500 text-sm">{sortedTeams.length} teams competing</p>
            </div>
          </div>
          {hasScores && leader && (
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase tracking-wide">Leader</div>
              <div className="text-amber-400 font-bold">{leader.name}</div>
            </div>
          )}
        </div>
      </div>

      {/* Teams List */}
      <div className="divide-y divide-slate-800/50">
        {sortedTeams.map((team, index) => {
          const rank = index + 1;
          const rankColors: Record<number, string> = {
            1: 'from-amber-500 to-yellow-500 text-black',
            2: 'from-slate-400 to-slate-300 text-black',
            3: 'from-orange-700 to-amber-700 text-white',
            4: 'from-slate-700 to-slate-600 text-slate-300',
          };

          return (
            <div
              key={team.id}
              onClick={() => onTeamClick(team.id)}
              className="px-6 py-4 flex items-center justify-between cursor-pointer transition-all group hover:bg-slate-800/50"
            >
              <div className="flex items-center gap-4">
                {/* Rank Badge */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm bg-gradient-to-br ${rankColors[rank] || rankColors[4]}`}>
                  {rank}
                </div>
                
                {/* Team Name */}
                <span className="font-semibold text-white">{team.name}</span>
              </div>

              {/* Score */}
              <div className="flex items-center gap-3">
                <div className={`text-2xl font-black ${
                  team.score > 0 ? 'text-white' : 'text-slate-600'
                }`}>
                  {team.score > 0 ? team.score : '—'}
                </div>
                <svg className="w-5 h-5 text-slate-600 group-hover:text-slate-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pool Footer */}
      {isPoolRound && (
        <div className="px-6 py-3 bg-slate-800/30 border-t border-slate-800/50">
          <p className="text-xs text-slate-500 text-center">
            Top scorer advances to Divisional Round
          </p>
        </div>
      )}
    </div>
  );
}

// Game info strip component
function GameStrip({ game }: { game: GameInfo }) {
  const formatKickoff = (utc: string) => {
    const date = new Date(utc);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = days[date.getDay()];
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${day} ${displayHour}:${displayMinutes} ${ampm}`;
  };

  const formatSpread = (spreadHome: number | null, isHome: boolean) => {
    if (spreadHome === null) return null;
    // If viewing away team, flip the spread
    const spread = isHome ? spreadHome : -spreadHome;
    if (spread === 0) return 'PK';
    return spread > 0 ? `+${spread}` : `${spread}`;
  };

  const isLive = game.gameStatus === 'IN_PROGRESS' || game.gameStatus === 'in_progress';
  const isFinal = game.gameStatus === 'FINAL' || game.gameStatus === 'final';

  const parts: string[] = [game.opponent];
  
  if (isFinal) {
    parts.push('Final');
  } else if (isLive) {
    parts.push('Live');
  } else {
    parts.push(formatKickoff(game.kickoffUtc));
  }

  if (game.total !== null) {
    parts.push(`O/U ${game.total}`);
  }

  const spread = formatSpread(game.spreadHome, game.isHome);
  if (spread) {
    parts.push(spread);
  }

  return (
    <div className="text-slate-500 text-sm flex items-center gap-1.5">
      {isLive && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      )}
      <span className={isLive ? 'text-green-400' : ''}>
        {parts.join(' • ')}
      </span>
    </div>
  );
}
