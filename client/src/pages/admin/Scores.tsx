import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api';

const ROUND_NAMES: Record<number, string> = {
  1: 'Wildcard',
  2: 'Divisional',
  3: 'Conference',
  4: 'Super Bowl',
};

export default function AdminScores() {
  const [week, setWeek] = useState(1);
  const [scores, setScores] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [playerScores, setPlayerScores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScores();
  }, [week]);

  const loadScores = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.getScores(week);
      setScores(data);
    } catch (err) {
      console.error('Failed to load scores', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTeamScores = async (team: any) => {
    setSelectedTeam(team);
    try {
      const { data } = await adminApi.getTeamScores(week, team.team_id);
      setPlayerScores(data);
    } catch (err) {
      console.error('Failed to load player scores', err);
    }
  };

  const afcTeams = scores.filter((s) => s.conference === 'AFC');
  const nfcTeams = scores.filter((s) => s.conference === 'NFC');

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Scores</h1>
          <p className="text-slate-400 mt-1">View computed team and player scores</p>
        </div>
        <select
          value={week}
          onChange={(e) => {
            setWeek(parseInt(e.target.value));
            setSelectedTeam(null);
          }}
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
          <div className="text-slate-400">Loading scores...</div>
        </div>
      ) : scores.length === 0 ? (
        <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 text-center">
          <p className="text-slate-400 mb-2">No scores computed for {ROUND_NAMES[week] || `Round ${week}`}.</p>
          <p className="text-slate-500 text-sm">
            Upload scoring rules and stats, then click "Recompute Scores" in the Stats tab.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Standings */}
          <div className="lg:col-span-2 space-y-6">
            {['AFC', 'NFC'].map((conf) => {
              const confTeams = conf === 'AFC' ? afcTeams : nfcTeams;
              return (
                <div key={conf} className="bg-slate-900 rounded-xl p-6 border border-slate-800">
                  <h2 className="text-xl font-semibold text-amber-400 mb-4">{conf} Standings</h2>
                  {confTeams.length === 0 ? (
                    <p className="text-slate-400 text-center py-4">No {conf} teams</p>
                  ) : (
                    <div className="space-y-2">
                      {confTeams
                        .sort((a, b) => b.starter_points - a.starter_points)
                        .map((team, idx) => (
                          <div
                            key={team.team_id}
                            onClick={() => loadTeamScores(team)}
                            className={`p-4 rounded-lg cursor-pointer transition-colors ${
                              selectedTeam?.team_id === team.team_id
                                ? 'bg-amber-500/20 border border-amber-500/50'
                                : 'bg-slate-800 hover:bg-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-sm font-bold ${
                                  idx === 0 ? 'bg-amber-500 text-black' :
                                  idx === 1 ? 'bg-slate-400 text-black' :
                                  idx === 2 ? 'bg-amber-700 text-white' :
                                  'bg-slate-600 text-white'
                                }`}>
                                  {idx + 1}
                                </span>
                                <span className="text-white font-medium">{team.team_name}</span>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-bold text-amber-400">
                                  {team.starter_points.toFixed(2)}
                                </div>
                                <div className="text-xs text-slate-400">
                                  Bench: {team.bench_points.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Player Breakdown */}
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 h-fit">
            <h2 className="text-xl font-semibold text-white mb-4">
              {selectedTeam ? selectedTeam.team_name : 'Select a team'}
            </h2>
            {selectedTeam ? (
              <div className="space-y-3">
                <div className="pb-3 border-b border-slate-700">
                  <div className="text-3xl font-bold text-amber-400">
                    {selectedTeam.starter_points.toFixed(2)}
                  </div>
                  <div className="text-sm text-slate-400">
                    Starter Points (Bench: {selectedTeam.bench_points.toFixed(2)})
                  </div>
                </div>
                
                {playerScores.length === 0 ? (
                  <p className="text-slate-400 text-center py-4">No player scores</p>
                ) : (
                  <>
                    <h3 className="text-sm font-medium text-slate-400 mt-4">Starters</h3>
                    {playerScores
                      .filter((p) => p.is_starter)
                      .sort((a, b) => b.points - a.points)
                      .map((player) => (
                        <div
                          key={player.player_id}
                          className="flex items-center justify-between p-2 bg-slate-800 rounded"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              player.position === 'QB' ? 'bg-red-500/20 text-red-400' :
                              player.position === 'RB' ? 'bg-green-500/20 text-green-400' :
                              player.position === 'WR' ? 'bg-blue-500/20 text-blue-400' :
                              player.position === 'TE' ? 'bg-purple-500/20 text-purple-400' :
                              player.position === 'K' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-slate-600 text-slate-300'
                            }`}>
                              {player.position}
                            </span>
                            <span className="text-white text-sm">{player.name}</span>
                          </div>
                          <span className="text-amber-400 font-medium">{player.points.toFixed(2)}</span>
                        </div>
                      ))}

                    <h3 className="text-sm font-medium text-slate-400 mt-4">Bench</h3>
                    {playerScores
                      .filter((p) => !p.is_starter)
                      .sort((a, b) => b.points - a.points)
                      .map((player) => (
                        <div
                          key={player.player_id}
                          className="flex items-center justify-between p-2 bg-slate-800/50 rounded opacity-75"
                        >
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded text-xs bg-slate-600 text-slate-400">
                              {player.position}
                            </span>
                            <span className="text-slate-400 text-sm">{player.name}</span>
                          </div>
                          <span className="text-slate-400">{player.points.toFixed(2)}</span>
                        </div>
                      ))}
                  </>
                )}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-8">
                Click on a team to view player breakdown
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
