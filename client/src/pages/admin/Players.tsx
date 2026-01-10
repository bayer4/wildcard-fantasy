import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

export default function AdminPlayers() {
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterTeam, setFilterTeam] = useState('');

  // Roster assignment
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [assignTeam, setAssignTeam] = useState('');
  const [assignWeek, setAssignWeek] = useState(1);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [playersRes, teamsRes] = await Promise.all([
        adminApi.getPlayers(),
        adminApi.getTeams(),
      ]);
      setPlayers(playersRes.data);
      setTeams(teamsRes.data);
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignToRoster = async () => {
    if (!selectedPlayer || !assignTeam) return;
    try {
      await adminApi.assignRoster(assignTeam, selectedPlayer.id, assignWeek, true);
      setMessage(`${selectedPlayer.name} assigned to roster!`);
      setSelectedPlayer(null);
      setAssignTeam('');
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Failed to assign to roster');
    }
  };

  // Get unique NFL teams from players
  const nflTeams = [...new Set(players.map(p => p.nfl_team_abbr))].sort();

  const filteredPlayers = players.filter((p) => {
    if (filterPosition && p.position !== filterPosition) return false;
    if (filterTeam && p.nfl_team_abbr !== filterTeam) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Players</h1>
        <p className="text-slate-400 mt-1">View players and manage roster assignments</p>
      </div>

      {message && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400">
          {message}
        </div>
      )}

      {players.length === 0 ? (
        <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 text-center">
          <p className="text-slate-400 mb-2">No players in database.</p>
          <p className="text-slate-500 text-sm">
            Upload player data via <code className="text-amber-400">/admin/seed</code> endpoint
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Players List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">
                  All Players ({filteredPlayers.length})
                </h2>
                <div className="flex gap-2">
                  <select
                    value={filterPosition}
                    onChange={(e) => setFilterPosition(e.target.value)}
                    className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none"
                  >
                    <option value="">All Positions</option>
                    {POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                  <select
                    value={filterTeam}
                    onChange={(e) => setFilterTeam(e.target.value)}
                    className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none"
                  >
                    <option value="">All Teams</option>
                    {nflTeams.map((team) => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="max-h-[600px] overflow-y-auto space-y-2">
                {filteredPlayers.map((player) => (
                  <div
                    key={player.id}
                    className={`p-3 bg-slate-800 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                      selectedPlayer?.id === player.id ? 'ring-2 ring-amber-500' : 'hover:bg-slate-700'
                    }`}
                    onClick={() => setSelectedPlayer(selectedPlayer?.id === player.id ? null : player)}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        player.position === 'QB' ? 'bg-red-500/20 text-red-400' :
                        player.position === 'RB' ? 'bg-green-500/20 text-green-400' :
                        player.position === 'WR' ? 'bg-blue-500/20 text-blue-400' :
                        player.position === 'TE' ? 'bg-purple-500/20 text-purple-400' :
                        player.position === 'K' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-slate-600 text-slate-300'
                      }`}>
                        {player.position}
                      </span>
                      <span className="text-white">{player.name}</span>
                    </div>
                    <span className="text-slate-400 text-sm">{player.nfl_team_abbr}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Roster Assignment */}
          <div className="space-y-6">
            {teams.length === 0 ? (
              <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 text-center">
                <p className="text-slate-400 mb-2">No fantasy teams exist.</p>
                <p className="text-slate-500 text-sm">
                  Seed teams first to assign rosters.
                </p>
              </div>
            ) : selectedPlayer ? (
              <div className="bg-slate-900 rounded-xl p-6 border border-amber-500/50">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Assign to Roster
                </h3>
                <div className="mb-4 p-3 bg-slate-800 rounded-lg">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    selectedPlayer.position === 'QB' ? 'bg-red-500/20 text-red-400' :
                    selectedPlayer.position === 'RB' ? 'bg-green-500/20 text-green-400' :
                    selectedPlayer.position === 'WR' ? 'bg-blue-500/20 text-blue-400' :
                    selectedPlayer.position === 'TE' ? 'bg-purple-500/20 text-purple-400' :
                    selectedPlayer.position === 'K' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-slate-600 text-slate-300'
                  }`}>
                    {selectedPlayer.position}
                  </span>
                  <span className="text-white ml-2">{selectedPlayer.name}</span>
                  <span className="text-slate-400 ml-2">({selectedPlayer.nfl_team_abbr})</span>
                </div>
                <div className="space-y-4">
                  <select
                    value={assignTeam}
                    onChange={(e) => setAssignTeam(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Select Fantasy Team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({team.conference})
                      </option>
                    ))}
                  </select>
                  <select
                    value={assignWeek}
                    onChange={(e) => setAssignWeek(parseInt(e.target.value))}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                      <option value={1}>Wildcard</option>
                      <option value={2}>Divisional</option>
                      <option value={3}>Conference</option>
                      <option value={4}>Super Bowl</option>
                  </select>
                  <button
                    onClick={handleAssignToRoster}
                    disabled={!assignTeam}
                    className="w-full py-2 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Assign to Roster
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 text-center">
                <p className="text-slate-400">
                  Click a player to assign them to a team roster.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
