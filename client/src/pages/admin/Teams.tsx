import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi, getToken, API_BASE_URL } from '../../lib/api';
import { useAuthStore } from '../../lib/store';

interface Team {
  id: string;
  name: string;
  conference_id: string;
  conference_name: string;
  created_at: string;
}

interface User {
  id: string;
  email: string;
  role: string;
  team_id: string | null;
  team_name: string | null;
}

interface DebugInfo {
  apiBaseUrl: string;
  isAuthenticated: boolean;
  role: string | null;
  tokenPresent: boolean;
  lastTeamsFetchStatus: number | null;
  teamsReturned: number;
  error: string | null;
}

export default function AdminTeams() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [debug, setDebug] = useState<DebugInfo>({
    apiBaseUrl: API_BASE_URL,
    isAuthenticated: false,
    role: null,
    tokenPresent: false,
    lastTeamsFetchStatus: null,
    teamsReturned: 0,
    error: null,
  });
  
  // New user form
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('TEAM');
  const [newUserTeam, setNewUserTeam] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const token = getToken();
    
    // Update debug info
    setDebug(prev => ({
      ...prev,
      isAuthenticated: isAuthenticated(),
      role: user?.role || null,
      tokenPresent: !!token,
    }));

    try {
      console.log('[Teams] Loading data, token present:', !!token);
      
      const [teamsRes, usersRes] = await Promise.all([
        adminApi.getTeams(),
        adminApi.getUsers(),
      ]);
      
      console.log('[Teams] Raw teams response:', teamsRes.data);
      console.log('[Teams] Raw users response:', usersRes.data);
      
      const teamsData = Array.isArray(teamsRes.data) ? teamsRes.data : [];
      const usersData = Array.isArray(usersRes.data) ? usersRes.data : [];
      
      setTeams(teamsData);
      setUsers(usersData);
      
      setDebug(prev => ({
        ...prev,
        lastTeamsFetchStatus: teamsRes.status,
        teamsReturned: teamsData.length,
        error: null,
      }));
    } catch (err: any) {
      const status = err.response?.status || 0;
      const errorMsg = err.response?.data?.error || err.message || 'Unknown error';
      
      console.error('[Teams] Failed to load data:', status, errorMsg);
      
      setDebug(prev => ({
        ...prev,
        lastTeamsFetchStatus: status,
        teamsReturned: 0,
        error: `${status}: ${errorMsg}`,
      }));
      
      setMessage(`Error loading data: ${status} - ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.createUser(newUserEmail, newUserPassword, newUserRole, newUserTeam || undefined);
      setMessage(`User "${newUserEmail}" created!`);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserTeam('');
      loadData();
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleAssignTeam = async (userId: string, teamId: string) => {
    try {
      await adminApi.assignUserToTeam(userId, teamId);
      setMessage('User assigned to team');
      loadData();
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Failed to assign team');
    }
  };

  // Group teams by conference
  const teamsByConference = teams.reduce((acc, team) => {
    const conf = team.conference_name || 'Unknown';
    if (!acc[conf]) acc[conf] = [];
    acc[conf].push(team);
    return acc;
  }, {} as Record<string, Team[]>);

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
        <h1 className="text-3xl font-bold text-white">Teams & Users</h1>
        <p className="text-slate-400 mt-1">View teams and manage user assignments</p>
      </div>

      {/* Debug Panel */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 text-xs font-mono">
        <div className="text-slate-500 mb-2">Debug Info:</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-slate-400">
          <div>apiBaseUrl: <span className="text-amber-400">{debug.apiBaseUrl}</span></div>
          <div>isAuthenticated: <span className={debug.isAuthenticated ? 'text-green-400' : 'text-red-400'}>{String(debug.isAuthenticated)}</span></div>
          <div>role: <span className="text-amber-400">{debug.role || 'null'}</span></div>
          <div>tokenPresent: <span className={debug.tokenPresent ? 'text-green-400' : 'text-red-400'}>{String(debug.tokenPresent)}</span></div>
          <div>lastFetchStatus: <span className={debug.lastTeamsFetchStatus === 200 ? 'text-green-400' : 'text-red-400'}>{debug.lastTeamsFetchStatus || 'none'}</span></div>
          <div>teamsReturned: <span className="text-amber-400">{debug.teamsReturned}</span></div>
          {debug.error && <div className="col-span-2 text-red-400">error: {debug.error}</div>}
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg border ${
          message.startsWith('Error') 
            ? 'bg-red-500/10 border-red-500/20 text-red-400' 
            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
        }`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Teams */}
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
            <h2 className="text-xl font-semibold text-white mb-4">Teams ({teams.length})</h2>
            
            {teams.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-2">No teams found.</p>
                <p className="text-slate-500 text-sm">
                  {debug.error 
                    ? `API Error: ${debug.error}` 
                    : 'Auto-seed should have created teams. Check server logs.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(teamsByConference).map(([conference, confTeams]) => (
                  <div key={conference}>
                    <h3 className="text-lg font-medium text-amber-400 mb-2">{conference}</h3>
                    <div className="space-y-2">
                      {confTeams.map((team) => (
                        <div
                          key={team.id}
                          onClick={() => navigate(`/admin/teams/${team.id}`)}
                          className="p-3 bg-slate-800 rounded-lg flex items-center justify-between cursor-pointer hover:bg-slate-700 transition-colors"
                        >
                          <div>
                            <span className="text-white font-medium">{team.name}</span>
                            <span className="text-slate-500 text-sm ml-2">→</span>
                          </div>
                          <span className="text-xs text-slate-500 font-mono">{team.id.slice(0, 8)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Users */}
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
            <h2 className="text-xl font-semibold text-white mb-4">Create User</h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Role
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="TEAM">Team Owner</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              {newUserRole === 'TEAM' && teams.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Assign to Team
                  </label>
                  <select
                    value={newUserTeam}
                    onChange={(e) => setNewUserTeam(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">No team (assign later)</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({team.conference_name})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="submit"
                className="w-full py-2 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition-colors"
              >
                Create User
              </button>
            </form>
          </div>

          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
            <h2 className="text-xl font-semibold text-white mb-4">All Users ({users.length})</h2>
            
            {users.length === 0 ? (
              <p className="text-slate-400 text-center py-4">No users yet</p>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="p-3 bg-slate-800 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white">{user.email}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        user.role === 'ADMIN' 
                          ? 'bg-amber-500/20 text-amber-400' 
                          : 'bg-slate-700 text-slate-300'
                      }`}>
                        {user.role}
                      </span>
                    </div>
                    {user.role === 'TEAM' && teams.length > 0 && (
                      <select
                        value={user.team_id || ''}
                        onChange={(e) => handleAssignTeam(user.id, e.target.value)}
                        className="w-full px-3 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">No team assigned</option>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
