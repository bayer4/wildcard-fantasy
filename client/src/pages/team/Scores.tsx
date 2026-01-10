import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamApi } from '../../lib/api';
import { useAuthStore } from '../../lib/store';

const ROUND_NAMES: Record<number, string> = {
  1: 'Wildcard',
  2: 'Divisional',
  3: 'Conference',
  4: 'Super Bowl',
};

export default function TeamScores() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [week, setWeek] = useState(1);
  const [scores, setScores] = useState<any>(null);
  const [league, setLeague] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Redirect ADMIN users to admin dashboard - they shouldn't be here
  useEffect(() => {
    if (user?.role === 'ADMIN') {
      navigate('/admin/scores', { replace: true });
      return;
    }
  }, [user, navigate]);

  useEffect(() => {
    if (user?.role === 'TEAM') {
      loadLeague();
    }
  }, [user]);

  useEffect(() => {
    if (league && user?.role === 'TEAM') {
      loadScores();
    }
  }, [week, league, user]);

  const loadLeague = async () => {
    try {
      const { data } = await teamApi.getLeague();
      setLeague(data);
      setWeek(data.current_week || 1);
    } catch (err) {
      console.error('Failed to load league', err);
    }
  };

  const loadScores = async () => {
    setLoading(true);
    try {
      const { data } = await teamApi.getScores(week);
      setScores(data);
    } catch (err) {
      console.error('Failed to load scores', err);
    } finally {
      setLoading(false);
    }
  };

  // Don't render for ADMIN users (they're being redirected)
  if (user?.role === 'ADMIN') {
    return null;
  }

  // Only show "No Team Assigned" for TEAM users
  if (user?.role === 'TEAM' && !user?.teamId) {
    return (
      <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">No Team Assigned</h2>
        <p className="text-slate-400">
          Contact your league admin to be assigned to a team.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">My Scores</h1>
          <p className="text-slate-400 mt-1">View your weekly scoring breakdown</p>
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
          <div className="text-slate-400">Loading scores...</div>
        </div>
      ) : !scores?.teamScore ? (
        <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 text-center">
          <p className="text-slate-400">No scores available for {ROUND_NAMES[week] || `Round ${week}`}.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-xl p-6 border border-amber-500/20">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-4xl font-bold text-amber-400">
                  {scores.teamScore.starter_points?.toFixed(2)}
                </div>
                <div className="text-slate-400">Starter Points</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-slate-400">
                  {scores.teamScore.bench_points?.toFixed(2)}
                </div>
                <div className="text-slate-400">Bench Points</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-white">
                  {scores.teamScore.total_points?.toFixed(2)}
                </div>
                <div className="text-slate-400">Total Points</div>
              </div>
            </div>
          </div>

          {/* Player Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Starters */}
            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
              <h2 className="text-xl font-semibold text-white mb-4">Starters</h2>
              <div className="space-y-3">
                {scores.playerScores
                  ?.filter((p: any) => p.is_starter)
                  .sort((a: any, b: any) => b.points - a.points)
                  .map((player: any) => (
                    <PlayerScoreCard key={player.player_id} player={player} />
                  ))}
              </div>
            </div>

            {/* Bench */}
            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
              <h2 className="text-xl font-semibold text-slate-400 mb-4">Bench</h2>
              <div className="space-y-3">
                {scores.playerScores
                  ?.filter((p: any) => !p.is_starter)
                  .sort((a: any, b: any) => b.points - a.points)
                  .map((player: any) => (
                    <PlayerScoreCard key={player.player_id} player={player} isBench />
                  ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PlayerScoreCard({ player, isBench = false }: { player: any; isBench?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const breakdown = player.breakdown_json ? JSON.parse(player.breakdown_json) : [];

  return (
    <div
      className={`rounded-lg overflow-hidden ${isBench ? 'bg-slate-800/50' : 'bg-slate-800'}`}
    >
      <div
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            isBench ? 'bg-slate-700 text-slate-400' :
            player.position === 'QB' ? 'bg-red-500/20 text-red-400' :
            player.position === 'RB' ? 'bg-green-500/20 text-green-400' :
            player.position === 'WR' ? 'bg-blue-500/20 text-blue-400' :
            player.position === 'TE' ? 'bg-purple-500/20 text-purple-400' :
            player.position === 'K' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-slate-600 text-slate-300'
          }`}>
            {player.position}
          </span>
          <div>
            <div className={isBench ? 'text-slate-400' : 'text-white'}>
              {player.name}
            </div>
            <div className="text-xs text-slate-500">{player.nfl_team_abbr}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xl font-bold ${isBench ? 'text-slate-400' : 'text-amber-400'}`}>
            {player.points.toFixed(2)}
          </span>
          <span className="text-slate-500">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && breakdown.length > 0 && (
        <div className="px-4 pb-4 border-t border-slate-700 pt-3">
          <div className="space-y-1 text-sm">
            {breakdown.map((item: any, idx: number) => (
              <div key={idx} className="flex justify-between text-slate-400">
                <span>
                  {item.category}: {item.stat} ({item.value})
                </span>
                <span className={item.points >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {item.points >= 0 ? '+' : ''}{item.points.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
