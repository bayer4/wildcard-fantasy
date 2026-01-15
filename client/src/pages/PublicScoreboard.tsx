import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { publicApi } from '../lib/api';
import WriteupPopup from '../components/WriteupPopup';
import SuperBowlWinnerPopup from '../components/SuperBowlWinnerPopup';

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
const ACTIVE_ROUNDS = [1, 2]; // Wildcard and Divisional

interface Team {
  id: string;
  name: string;
  score: number;
  minutesLeft?: number;
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
  minutesLeft?: number;
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
  const [week, setWeek] = useState<number | null>(null); // Currently viewed week
  const [currentWeek, setCurrentWeek] = useState<number | null>(null); // Actual current week from admin
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [allGamesFinal, setAllGamesFinal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<{ team: TeamDetail; starters: Starter[]; bench?: BenchPlayer[] } | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch current week from admin settings on mount
  useEffect(() => {
    const fetchCurrentWeek = async () => {
      try {
        const res = await axios.get('/api/public/league');
        const adminWeek = res.data.currentWeek || 2;
        setWeek(adminWeek);
        setCurrentWeek(adminWeek);
      } catch {
        setWeek(2); // Fallback to Divisional
        setCurrentWeek(2);
      }
    };
    fetchCurrentWeek();
  }, []);

  useEffect(() => {
    if (week !== null) {
      loadScoreboard();
    }
  }, [week]);

  useEffect(() => {
    if (teamId && week !== null) {
      loadTeam(teamId);
    } else {
      setSelectedTeam(null);
    }
  }, [teamId, week]);

  const loadScoreboard = async () => {
    if (week === null) return;
    try {
      const res = await publicApi.getScoreboard(week);
      setConferences(res.data.conferences);
      setAllGamesFinal(res.data.allGamesFinal || false);
    } catch (err) {
      console.error('Failed to load scoreboard', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTeam = async (id: string) => {
    if (week === null) return;
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

  // Wait for week to be loaded
  if (week === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

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
              <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                2025 BCFL Playoffs
              </h1>
            </Link>
            {/* Team Login button hidden for now */}
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
                    {selectedTeam.team.minutesLeft !== undefined && selectedTeam.team.minutesLeft > 0 && (
                      <div className="text-slate-400 text-sm mt-1 flex items-center justify-end gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {selectedTeam.team.minutesLeft}m left
                      </div>
                    )}
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
            ) : week === 1 ? (
              <WildcardHistoricalResults />
            ) : ACTIVE_ROUNDS.includes(week) ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {conferences.map((conference) => (
                  <ConferenceCard
                    key={conference.id}
                    conference={conference}
                    isPoolRound={isPoolRound}
                    allGamesFinal={allGamesFinal}
                    week={week}
                    onTeamClick={handleTeamClick}
                    onMatchupClick={(conf, matchupNum) => navigate(`/h2h/${week}/${conf}/${matchupNum}`)}
                  />
                ))}
              </div>
            ) : (
              <FutureRoundCard roundName={roundName} />
            )}
          </div>
        )}

      </main>

      {/* Weekly Writeup Popup - only shows for current week, not historical */}
      <WriteupPopup week={week} currentWeek={currentWeek ?? undefined} />

      {/* Super Bowl Winner Easter Egg */}
      <SuperBowlWinnerPopup 
        week={week} 
        winnerName={
          week === 4 && conferences.length > 0
            ? [...conferences.flatMap(c => c.teams)].sort((a, b) => b.score - a.score)[0]?.name || null
            : null
        }
      />
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
        <p className="text-slate-400 mb-6">Divisional winners face off for the conference title</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
            <div className="text-red-400 font-bold mb-3">AFC Championship</div>
            <div className="text-slate-400 italic text-sm">Winner of Bash Brothers / Pole Patrol</div>
            <div className="text-slate-600 my-2">vs</div>
            <div className="text-slate-400 italic text-sm">Winner of Nemesis Enforcer / Monday Morning QBs</div>
          </div>
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5">
            <div className="text-blue-400 font-bold mb-3">NFC Championship</div>
            <div className="text-slate-400 italic text-sm">Winner of Sacks and the City / CMFers</div>
            <div className="text-slate-600 my-2">vs</div>
            <div className="text-slate-400 italic text-sm">Winner of Masters of the Universe / Stacy's Mom</div>
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

// Historical Wildcard Results (Week 1 - completed)
const WILDCARD_RESULTS = {
  NFC: [
    { name: "CMFers", score: 56, isWinner: true },
    { name: "Leroy Kelly", score: 55, isWinner: false },
    { name: "Glass Funyon", score: 51, isWinner: false },
    { name: "Greyhounds", score: 47, isWinner: false },
  ],
  AFC: [
    { name: "Pole Patrol", score: 72, isWinner: true },
    { name: "Dischargers", score: 57, isWinner: false },
    { name: "Bald Eagles", score: 43, isWinner: false },
    { name: "Fighting Irish", score: 31, isWinner: false },
  ],
};

function WildcardHistoricalResults() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* AFC Pool */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-700/50 bg-gradient-to-r from-red-600/20 to-red-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg bg-red-500/20 text-red-400">
                AFC
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">AFC Pool</h2>
                <p className="text-slate-500 text-sm">4 teams competed</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase tracking-wide">🏆 Winner</div>
              <div className="text-amber-400 font-bold">Pole Patrol</div>
            </div>
          </div>
        </div>
        <div className="divide-y divide-slate-800/50">
          {WILDCARD_RESULTS.AFC.map((team, index) => (
            <div
              key={team.name}
              className={`px-6 py-4 flex items-center justify-between ${
                team.isWinner ? 'bg-amber-500/5' : ''
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                  index === 0 ? 'bg-amber-500 text-black' :
                  index === 1 ? 'bg-slate-600 text-white' :
                  index === 2 ? 'bg-orange-700 text-white' :
                  'bg-slate-700 text-slate-400'
                }`}>
                  {index + 1}
                </div>
                <div>
                  <h3 className={`font-semibold ${team.isWinner ? 'text-amber-400' : 'text-white'}`}>
                    {team.name} {team.isWinner && '🏆'}
                  </h3>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-black ${team.isWinner ? 'text-amber-400' : 'text-white'}`}>
                  {team.score}
                </div>
                <div className="text-slate-600 text-xs uppercase">pts</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* NFC Pool */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-700/50 bg-gradient-to-r from-blue-600/20 to-blue-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg bg-blue-500/20 text-blue-400">
                NFC
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">NFC Pool</h2>
                <p className="text-slate-500 text-sm">4 teams competed</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase tracking-wide">🏆 Winner</div>
              <div className="text-amber-400 font-bold">CMFers</div>
            </div>
          </div>
        </div>
        <div className="divide-y divide-slate-800/50">
          {WILDCARD_RESULTS.NFC.map((team, index) => (
            <div
              key={team.name}
              className={`px-6 py-4 flex items-center justify-between ${
                team.isWinner ? 'bg-amber-500/5' : ''
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                  index === 0 ? 'bg-amber-500 text-black' :
                  index === 1 ? 'bg-slate-600 text-white' :
                  index === 2 ? 'bg-orange-700 text-white' :
                  'bg-slate-700 text-slate-400'
                }`}>
                  {index + 1}
                </div>
                <div>
                  <h3 className={`font-semibold ${team.isWinner ? 'text-amber-400' : 'text-white'}`}>
                    {team.name} {team.isWinner && '🏆'}
                  </h3>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-black ${team.isWinner ? 'text-amber-400' : 'text-white'}`}>
                  {team.score}
                </div>
                <div className="text-slate-600 text-xs uppercase">pts</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Bracket order for Divisional round (week 2) - 1v4, 2v3 matchups
const DIVISIONAL_DRAFT_ORDER: Record<string, string[]> = {
  NFC: ["Sacks and the City", "CMFers", "Masters of the Universe", "Stacy's Mom"],
  AFC: ["Bash Brothers", "Pole Patrol", "Nemesis Enforcer", "Monday Morning QBs"],
};

interface ConferenceCardProps {
  conference: Conference;
  isPoolRound: boolean;
  allGamesFinal: boolean;
  week: number;
  onTeamClick: (teamId: string) => void;
  onMatchupClick: (conference: string, matchupNum: number) => void;
}

function ConferenceCard({ conference, isPoolRound, week, onTeamClick, onMatchupClick }: ConferenceCardProps) {
  const hasScores = conference.teams.some(t => t.score > 0);
  
  // Sort teams: by score if scores exist, otherwise by draft order for divisional
  const sortedTeams = [...conference.teams].sort((a, b) => {
    if (hasScores) {
      return b.score - a.score;
    }
    // Use draft order for divisional round when no scores yet
    if (week === 2) {
      const order = DIVISIONAL_DRAFT_ORDER[conference.name] || [];
      return order.indexOf(a.name) - order.indexOf(b.name);
    }
    return 0;
  });
  
  const winner = sortedTeams[0];
  const isNFC = conference.name === 'NFC';

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl">
      {/* Conference Header - Sleek gradient bar */}
      <div className={`px-6 py-4 text-center ${
        isNFC 
          ? 'bg-gradient-to-r from-blue-600/30 via-blue-800/20 to-blue-600/30' 
          : 'bg-gradient-to-r from-red-600/30 via-red-800/20 to-red-600/30'
      }`}>
        <span className={`text-3xl font-black tracking-[0.3em] ${
          isNFC ? 'text-blue-400' : 'text-red-400'
        }`}>
          {conference.name}
        </span>
        {hasScores && winner && (
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="text-amber-400">🏆</span>
            <span className="text-amber-400 font-bold text-sm">{winner.name}</span>
          </div>
        )}
      </div>

      {/* Teams List - Bracket format with Wildcard styling */}
      {week === 2 && !hasScores ? (
        <div className="p-4 space-y-3">
          {/* Semifinal 1: #1 vs #4 */}
          <div 
            onClick={() => onMatchupClick(conference.name, 1)}
            className="bg-slate-800/30 rounded-xl p-4 cursor-pointer hover:bg-slate-800/50 transition-all group"
          >
            <div className="text-xs text-amber-400/80 font-semibold uppercase tracking-wider mb-3 text-center">
              Semifinal 1
            </div>
            <div className="flex items-center">
              {/* Team 1 */}
              <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
                <span className="font-semibold text-white text-sm truncate">{sortedTeams[0]?.name}</span>
                <div className="w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center font-bold text-xs bg-gradient-to-br from-amber-500 to-yellow-500 text-black">
                  1
                </div>
              </div>
              {/* VS */}
              <span className="text-slate-600 font-medium text-xs px-3 flex-shrink-0">vs</span>
              {/* Team 2 */}
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center font-bold text-xs bg-gradient-to-br from-slate-700 to-slate-600 text-slate-300">
                  4
                </div>
                <span className="font-semibold text-white text-sm truncate">{sortedTeams[1]?.name}</span>
              </div>
            </div>
          </div>
          
          {/* Semifinal 2: #2 vs #3 */}
          <div 
            onClick={() => onMatchupClick(conference.name, 2)}
            className="bg-slate-800/30 rounded-xl p-4 cursor-pointer hover:bg-slate-800/50 transition-all group"
          >
            <div className="text-xs text-amber-400/80 font-semibold uppercase tracking-wider mb-3 text-center">
              Semifinal 2
            </div>
            <div className="flex items-center">
              {/* Team 1 */}
              <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
                <span className="font-semibold text-white text-sm truncate">{sortedTeams[2]?.name}</span>
                <div className="w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center font-bold text-xs bg-gradient-to-br from-slate-400 to-slate-300 text-black">
                  2
                </div>
              </div>
              {/* VS */}
              <span className="text-slate-600 font-medium text-xs px-3 flex-shrink-0">vs</span>
              {/* Team 2 */}
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center font-bold text-xs bg-gradient-to-br from-orange-700 to-amber-700 text-white">
                  3
                </div>
                <span className="font-semibold text-white text-sm truncate">{sortedTeams[3]?.name}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
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

                {/* Score & Minutes */}
                <div className="flex items-center gap-4">
                  {/* Minutes Left */}
                  {team.minutesLeft !== undefined && team.minutesLeft > 0 && (
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {team.minutesLeft}m
                    </div>
                  )}
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
      )}

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

  // Only show O/U and spread for upcoming/live games, not final
  if (!isFinal) {
    if (game.total !== null) {
      parts.push(`O/U ${game.total}`);
    }

    const spread = formatSpread(game.spreadHome, game.isHome);
    if (spread) {
      parts.push(spread);
    }
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
