import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { publicApi } from '../lib/api';

interface Player {
  displayName: string;
  position: string;
  nflTeam: string;
  slot?: string;
  points: number;
  statLine?: string;
}

interface TeamData {
  id: string;
  name: string;
  totalPoints: number;
  starters: Player[];
}

interface MatchupData {
  team1: TeamData;
  team2: TeamData;
  conference: string;
  matchupNum: number;
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

export default function HeadToHead() {
  const { week, conference, matchup } = useParams<{ week: string; conference: string; matchup: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<MatchupData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMatchup();
  }, [week, conference, matchup]);

  const loadMatchup = async () => {
    try {
      const weekNum = parseInt(week || '2');
      const matchupNum = parseInt(matchup || '1');
      
      // Get scoreboard data to find the teams
      const res = await publicApi.getScoreboard(weekNum);
      const conf = res.data.conferences.find((c: any) => c.name === conference);
      
      if (!conf) {
        setLoading(false);
        return;
      }

      // Get teams in bracket order for week 2
      const BRACKET_ORDER: Record<string, string[]> = {
        NFC: ["Sacks and the City", "CMFers", "Masters of the Universe", "Stacy's Mom"],
        AFC: ["Bash Brothers", "Pole Patrol", "Nemesis Enforcer", "Monday Morning QBs"],
      };
      
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
          starters: team1Res.data.starters || [],
        },
        team2: {
          id: team2Id,
          name: team2Res.data.team.name,
          totalPoints: team2Res.data.team.totalPoints || 0,
          starters: team2Res.data.starters || [],
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

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Clean Header */}
      <div className="border-b border-slate-800/50">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <button
            onClick={() => navigate('/live')}
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>
      </div>

      {/* Matchup Title */}
      <div className="max-w-5xl mx-auto px-4 pt-8 pb-6 text-center">
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4 ${
          isNFC ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'
        }`}>
          <span>{data.conference}</span>
          <span className="text-slate-600">•</span>
          <span>Semifinal {data.matchupNum}</span>
        </div>
      </div>

      {/* Score Display */}
      <div className="max-w-5xl mx-auto px-4 pb-8">
        <div className={`rounded-2xl border overflow-hidden ${
          isNFC ? 'bg-blue-500/5 border-blue-500/20' : 'bg-red-500/5 border-red-500/20'
        }`}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center py-10 px-6">
            {/* Team 1 */}
            <div className="text-center">
              <div className={`text-base font-medium mb-3 ${team1Leading ? 'text-amber-400' : 'text-slate-300'}`}>
                {data.team1.name}
              </div>
              <div className={`text-6xl md:text-7xl font-black tracking-tight ${team1Leading ? 'text-amber-400' : 'text-white'}`}>
                {data.team1.totalPoints > 0 ? Math.round(data.team1.totalPoints) : '—'}
              </div>
            </div>

            {/* VS Divider */}
            <div className="flex flex-col items-center justify-center px-6">
              <div className="w-px h-12 bg-slate-700/50 mb-3"></div>
              <div className="text-slate-600 text-xs font-medium tracking-widest">VS</div>
              <div className="w-px h-12 bg-slate-700/50 mt-3"></div>
            </div>

            {/* Team 2 */}
            <div className="text-center">
              <div className={`text-base font-medium mb-3 ${team2Leading ? 'text-amber-400' : 'text-slate-300'}`}>
                {data.team2.name}
              </div>
              <div className={`text-6xl md:text-7xl font-black tracking-tight ${team2Leading ? 'text-amber-400' : 'text-white'}`}>
                {data.team2.totalPoints > 0 ? Math.round(data.team2.totalPoints) : '—'}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {totalPoints > 0 && (
            <div className="px-8 pb-8">
              <div className="h-2 bg-slate-800/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500"
                  style={{ width: `${team1Percent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>{Math.round(team1Percent)}%</span>
                <span>{Math.round(100 - team1Percent)}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Side-by-Side Lineups */}
      <div className="max-w-5xl mx-auto px-4 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Team 1 Lineup */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 overflow-hidden">
            <div className={`px-4 py-3 border-b border-slate-800/50 ${team1Leading ? 'bg-amber-500/5' : ''}`}>
              <h2 className={`font-semibold text-sm ${team1Leading ? 'text-amber-400' : 'text-white'}`}>
                {data.team1.name} {team1Leading && '👑'}
              </h2>
            </div>
            <div className="divide-y divide-slate-800/30">
              {SLOT_ORDER.map((slot) => {
                const player = team1Starters.find(p => p.slot === slot);
                const opponent = team2Starters.find(p => p.slot === slot);
                const winning = player && opponent && player.points > opponent.points;
                const losing = player && opponent && player.points < opponent.points;
                
                return (
                  <div key={slot} className={`px-4 py-2.5 flex items-center justify-between ${winning ? 'bg-green-500/5' : losing ? 'bg-red-500/5' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 text-[10px] font-semibold text-slate-500 uppercase">
                        {SLOT_LABELS[slot]}
                      </div>
                      {player ? (
                        <div>
                          <div className="font-medium text-white text-sm">{player.displayName}</div>
                          <div className="text-[10px] text-slate-500">{player.nflTeam}</div>
                        </div>
                      ) : (
                        <div className="text-slate-600 text-xs">Empty</div>
                      )}
                    </div>
                    <div className={`text-lg font-bold ${
                      winning ? 'text-green-400' : losing ? 'text-red-400' : player?.points ? 'text-white' : 'text-slate-700'
                    }`}>
                      {player?.points ? Math.round(player.points) : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Team 2 Lineup */}
          <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 overflow-hidden">
            <div className={`px-4 py-3 border-b border-slate-800/50 ${team2Leading ? 'bg-amber-500/5' : ''}`}>
              <h2 className={`font-semibold text-sm ${team2Leading ? 'text-amber-400' : 'text-white'}`}>
                {data.team2.name} {team2Leading && '👑'}
              </h2>
            </div>
            <div className="divide-y divide-slate-800/30">
              {SLOT_ORDER.map((slot) => {
                const player = team2Starters.find(p => p.slot === slot);
                const opponent = team1Starters.find(p => p.slot === slot);
                const winning = player && opponent && player.points > opponent.points;
                const losing = player && opponent && player.points < opponent.points;
                
                return (
                  <div key={slot} className={`px-4 py-2.5 flex items-center justify-between ${winning ? 'bg-green-500/5' : losing ? 'bg-red-500/5' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 text-[10px] font-semibold text-slate-500 uppercase">
                        {SLOT_LABELS[slot]}
                      </div>
                      {player ? (
                        <div>
                          <div className="font-medium text-white text-sm">{player.displayName}</div>
                          <div className="text-[10px] text-slate-500">{player.nflTeam}</div>
                        </div>
                      ) : (
                        <div className="text-slate-600 text-xs">Empty</div>
                      )}
                    </div>
                    <div className={`text-lg font-bold ${
                      winning ? 'text-green-400' : losing ? 'text-red-400' : player?.points ? 'text-white' : 'text-slate-700'
                    }`}>
                      {player?.points ? Math.round(player.points) : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
