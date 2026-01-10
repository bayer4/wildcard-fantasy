import { useState, useEffect } from 'react';
import { teamApi } from '../lib/api';

const ROUND_NAMES: Record<number, string> = {
  1: 'Wildcard',
  2: 'Divisional',
  3: 'Conference',
  4: 'Super Bowl',
};

export default function Standings() {
  const [week, setWeek] = useState(1);
  const [standings, setStandings] = useState<any[]>([]);
  const [league, setLeague] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeague();
  }, []);

  useEffect(() => {
    if (league) {
      loadStandings();
    }
  }, [week, league]);

  const loadLeague = async () => {
    try {
      const { data } = await teamApi.getLeague();
      setLeague(data);
      setWeek(data.current_week || 1);
    } catch (err) {
      console.error('Failed to load league', err);
      setLoading(false);
    }
  };

  const loadStandings = async () => {
    setLoading(true);
    try {
      const { data } = await teamApi.getStandings(week);
      setStandings(data);
    } catch (err) {
      console.error('Failed to load standings', err);
    } finally {
      setLoading(false);
    }
  };

  // Sort by starter points, then bench points as tiebreaker
  const afcTeams = standings.filter((s) => s.conference === 'AFC').sort((a, b) => 
    b.starter_points - a.starter_points || b.bench_points - a.bench_points
  );
  const nfcTeams = standings.filter((s) => s.conference === 'NFC').sort((a, b) => 
    b.starter_points - a.starter_points || b.bench_points - a.bench_points
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">League Standings</h1>
          <p className="text-slate-400 mt-1">{ROUND_NAMES[week] || `Round ${week}`} standings by conference</p>
        </div>
        <select
          value={week}
          onChange={(e) => setWeek(parseInt(e.target.value))}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
            <option value={1}>Wildcard</option>
            <option value={2}>Divisional</option>
            <option value={3}>Conference</option>
            <option value={4}>Super Bowl</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400">Loading standings...</div>
        </div>
      ) : standings.length === 0 ? (
        <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 text-center">
          <p className="text-slate-400 mb-2">No standings available for {ROUND_NAMES[week] || `Round ${week}`}.</p>
          <p className="text-slate-500 text-sm">
            Scores need to be computed by the admin first.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* AFC */}
            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
              <h2 className="text-2xl font-bold text-red-400 mb-6 flex items-center gap-2">
                <span className="w-8 h-8 bg-red-500/20 rounded flex items-center justify-center">
                  🏈
                </span>
                AFC
              </h2>
              <div className="space-y-3">
                {afcTeams.map((team, idx) => (
                  <StandingCard key={team.team_id} team={team} rank={idx + 1} />
                ))}
                {afcTeams.length === 0 && (
                  <p className="text-slate-400 text-center py-4">No AFC teams</p>
                )}
              </div>
            </div>

            {/* NFC */}
            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
              <h2 className="text-2xl font-bold text-blue-400 mb-6 flex items-center gap-2">
                <span className="w-8 h-8 bg-blue-500/20 rounded flex items-center justify-center">
                  🏈
                </span>
                NFC
              </h2>
              <div className="space-y-3">
                {nfcTeams.map((team, idx) => (
                  <StandingCard key={team.team_id} team={team} rank={idx + 1} />
                ))}
                {nfcTeams.length === 0 && (
                  <p className="text-slate-400 text-center py-4">No NFC teams</p>
                )}
              </div>
            </div>
          </div>

          {/* Overall Leaderboard */}
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
            <h2 className="text-2xl font-bold text-white mb-6">Overall Leaderboard</h2>
            <div className="space-y-2">
              {standings
                .sort((a, b) => b.starter_points - a.starter_points || b.bench_points - a.bench_points)
                .map((team, idx) => (
                  <div
                    key={team.team_id}
                    className={`p-4 rounded-lg flex items-center justify-between ${
                      idx === 0 ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30' :
                      idx < 3 ? 'bg-slate-800' : 'bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${
                        idx === 0 ? 'bg-amber-500 text-black' :
                        idx === 1 ? 'bg-slate-400 text-black' :
                        idx === 2 ? 'bg-amber-700 text-white' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {idx + 1}
                      </span>
                      <div>
                        <div className="text-white font-medium">{team.team_name}</div>
                        <div className={`text-xs ${
                          team.conference === 'AFC' ? 'text-red-400' : 'text-blue-400'
                        }`}>
                          {team.conference}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${
                        idx === 0 ? 'text-amber-400' : 'text-white'
                      }`}>
                        {team.starter_points.toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-500">
                        Bench: {team.bench_points.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StandingCard({ team, rank }: { team: any; rank: number }) {
  return (
    <div className={`p-4 rounded-lg flex items-center justify-between ${
      rank === 1 ? 'bg-gradient-to-r from-amber-500/20 to-transparent border-l-4 border-amber-500' :
      'bg-slate-800'
    }`}>
      <div className="flex items-center gap-3">
        <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${
          rank === 1 ? 'bg-amber-500 text-black' :
          rank === 2 ? 'bg-slate-400 text-black' :
          rank === 3 ? 'bg-amber-700 text-white' :
          'bg-slate-700 text-slate-400'
        }`}>
          {rank}
        </span>
        <span className="text-white font-medium">{team.team_name}</span>
      </div>
      <div className="text-right">
        <div className={`text-xl font-bold ${rank === 1 ? 'text-amber-400' : 'text-white'}`}>
          {team.starter_points.toFixed(2)}
        </div>
        <div className="text-xs text-slate-500">pts</div>
      </div>
    </div>
  );
}
