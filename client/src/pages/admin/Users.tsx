import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api';

interface User {
  id: string;
  email: string;
  role: 'ADMIN' | 'TEAM';
  team_id: string | null;
  team_name: string | null;
}

interface Team {
  id: string;
  name: string;
  conference_name: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newPassword, setNewPassword] = useState<{ email: string; password: string } | null>(null);

  // Track pending changes
  const [pendingChanges, setPendingChanges] = useState<Record<string, { role?: string; teamId?: string | null }>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, teamsRes] = await Promise.all([
        adminApi.getUsers(),
        adminApi.getTeams(),
      ]);
      setUsers(usersRes.data);
      setTeams(teamsRes.data);
    } catch (err) {
      console.error('Failed to load data', err);
      setMessage({ type: 'error', text: 'Failed to load users' });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    setPendingChanges((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        role: newRole,
        // Clear teamId if changing to ADMIN
        teamId: newRole === 'ADMIN' ? null : prev[userId]?.teamId,
      },
    }));
  };

  const handleTeamChange = (userId: string, newTeamId: string | null) => {
    setPendingChanges((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        teamId: newTeamId,
      },
    }));
  };

  const saveUser = async (userId: string) => {
    const changes = pendingChanges[userId];
    if (!changes) return;

    setSaving(userId);
    setMessage(null);

    try {
      await adminApi.updateUser(userId, {
        role: changes.role,
        teamId: changes.teamId,
      });
      
      // Clear pending changes for this user
      setPendingChanges((prev) => {
        const { [userId]: _, ...rest } = prev;
        return rest;
      });

      // Reload to get updated data
      await loadData();
      setMessage({ type: 'success', text: 'User updated successfully' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to update user' });
    } finally {
      setSaving(null);
    }
  };

  const getUserDisplayRole = (user: User) => {
    return pendingChanges[user.id]?.role ?? user.role;
  };

  const getUserDisplayTeamId = (user: User) => {
    const pending = pendingChanges[user.id];
    if (pending?.teamId !== undefined) return pending.teamId;
    return user.team_id;
  };

  const hasChanges = (userId: string) => {
    return !!pendingChanges[userId];
  };

  const resetPassword = async (userId: string, email: string) => {
    setResetting(userId);
    setMessage(null);
    setNewPassword(null);

    try {
      const res = await adminApi.resetUserPassword(userId);
      setNewPassword({ email, password: res.data.newPassword });
      setMessage({ type: 'success', text: `Password reset for ${email}` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to reset password' });
    } finally {
      setResetting(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage({ type: 'success', text: 'Copied to clipboard!' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading users...</div>
      </div>
    );
  }

  // Group teams by conference for the dropdown
  const teamsByConference = teams.reduce((acc, team) => {
    if (!acc[team.conference_name]) acc[team.conference_name] = [];
    acc[team.conference_name].push(team);
    return acc;
  }, {} as Record<string, Team[]>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Users</h1>
        <p className="text-slate-400 mt-1">Manage user roles and team assignments</p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg border ${
          message.type === 'success' 
            ? 'bg-green-500/10 border-green-500/20 text-green-400' 
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="float-right opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* New Password Display */}
      {newPassword && (
        <div className="p-4 rounded-lg border bg-emerald-500/10 border-emerald-500/20">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-emerald-400 font-medium">New Password Generated</h3>
            <button 
              onClick={() => setNewPassword(null)} 
              className="text-slate-400 hover:text-white"
            >
              ×
            </button>
          </div>
          <div className="flex items-center gap-3 bg-slate-800 rounded-lg p-3">
            <div className="flex-1">
              <div className="text-slate-400 text-xs mb-1">{newPassword.email}</div>
              <div className="text-white font-mono text-lg">{newPassword.password}</div>
            </div>
            <button
              onClick={() => copyToClipboard(newPassword.password)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Copy
            </button>
            <button
              onClick={() => copyToClipboard(`${newPassword.email}\n${newPassword.password}`)}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
              title="Copy email + password"
            >
              Copy Both
            </button>
          </div>
          <p className="text-slate-500 text-xs mt-2">
            Share this password with the user. They can change it in Settings.
          </p>
        </div>
      )}

      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Email</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Role</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-slate-400">Team</th>
              <th className="px-6 py-4 text-right text-sm font-medium text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map((user) => {
              const displayRole = getUserDisplayRole(user);
              const displayTeamId = getUserDisplayTeamId(user);
              const changed = hasChanges(user.id);
              const isSaving = saving === user.id;

              return (
                <tr key={user.id} className={changed ? 'bg-amber-500/5' : ''}>
                  <td className="px-6 py-4">
                    <div className="text-white">{user.email}</div>
                    <div className="text-slate-500 text-xs font-mono">{user.id.slice(0, 8)}...</div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={displayRole}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-700 focus:border-amber-500 focus:outline-none text-sm"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="TEAM">TEAM</option>
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    {displayRole === 'ADMIN' ? (
                      <span className="text-slate-500 italic text-sm">N/A (Admin)</span>
                    ) : (
                      <select
                        value={displayTeamId || ''}
                        onChange={(e) => handleTeamChange(user.id, e.target.value || null)}
                        className="bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-700 focus:border-amber-500 focus:outline-none text-sm min-w-[200px]"
                      >
                        <option value="">-- No Team --</option>
                        {Object.entries(teamsByConference).map(([conf, confTeams]) => (
                          <optgroup key={conf} label={conf}>
                            {confTeams.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => resetPassword(user.id, user.email)}
                        disabled={resetting === user.id}
                        className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-600 disabled:opacity-50 transition-colors"
                        title="Generate new password"
                      >
                        {resetting === user.id ? '...' : 'Reset PW'}
                      </button>
                      {changed && (
                        <button
                          onClick={() => saveUser(user.id)}
                          disabled={isSaving}
                          className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="px-6 py-12 text-center text-slate-500">
            No users registered yet
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
        <h3 className="text-white font-medium mb-2">Assignment Guide</h3>
        <ul className="text-slate-400 text-sm space-y-1">
          <li>• <strong>ADMIN</strong> users can manage all teams, settings, and data</li>
          <li>• <strong>TEAM</strong> users can only manage their assigned team's lineup</li>
          <li>• A user must be assigned a team before they can set their lineup</li>
          <li>• Each team should have exactly one owner</li>
        </ul>
      </div>
    </div>
  );
}

