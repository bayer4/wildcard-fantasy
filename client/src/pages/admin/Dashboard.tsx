import { useState, useEffect } from 'react';
import { adminApi, getToken, API_BASE_URL } from '../../lib/api';
import { useAuthStore } from '../../lib/store';

interface DebugInfo {
  apiBaseUrl: string;
  isAuthenticated: boolean;
  role: string | null;
  tokenPresent: boolean;
  lastStatusFetchStatus: number | null;
  error: string | null;
}

export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuthStore();
  const [settings, setSettings] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [debug, setDebug] = useState<DebugInfo>({
    apiBaseUrl: API_BASE_URL,
    isAuthenticated: false,
    role: null,
    tokenPresent: false,
    lastStatusFetchStatus: null,
    error: null,
  });

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
      console.log('[Dashboard] Loading data, token present:', !!token);
      
      const [settingsRes, statusRes] = await Promise.all([
        adminApi.getSettings(),
        adminApi.getStatus(),
      ]);
      
      console.log('[Dashboard] Settings response:', settingsRes.data);
      console.log('[Dashboard] Status response:', statusRes.data);
      
      setSettings(settingsRes.data);
      setStatus(statusRes.data);
      
      setDebug(prev => ({
        ...prev,
        lastStatusFetchStatus: statusRes.status,
        error: null,
      }));
    } catch (err: any) {
      const httpStatus = err.response?.status || 0;
      const errorMsg = err.response?.data?.error || err.message || 'Unknown error';
      
      console.error('[Dashboard] Failed to load data:', httpStatus, errorMsg);
      
      setDebug(prev => ({
        ...prev,
        lastStatusFetchStatus: httpStatus,
        error: `${httpStatus}: ${errorMsg}`,
      }));
      
      setMessage(`Error loading data: ${httpStatus} - ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateWeek = async (week: number) => {
    try {
      await adminApi.updateSettings({ currentWeek: week });
      setMessage(`Week updated to ${week}`);
      loadData();
    } catch (err: any) {
      const status = err.response?.status || 0;
      setMessage(`Error: ${status} - ${err.response?.data?.error || 'Failed to update week'}`);
    }
  };

  const handleSetLockTime = async (lockTime: string | null) => {
    try {
      await adminApi.updateSettings({ lockTime });
      setMessage(lockTime ? `Lock time set` : 'Lock time cleared');
      loadData();
    } catch (err: any) {
      const status = err.response?.status || 0;
      setMessage(`Error: ${status} - ${err.response?.data?.error || 'Failed to set lock time'}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  const ready = status?.ready || {};

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-slate-400 mt-1">Manage your Wildcard Fantasy league</p>
      </div>

      {/* Debug Panel */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 text-xs font-mono">
        <div className="text-slate-500 mb-2">Debug Info:</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-slate-400">
          <div>apiBaseUrl: <span className="text-amber-400">{debug.apiBaseUrl}</span></div>
          <div>isAuthenticated: <span className={debug.isAuthenticated ? 'text-green-400' : 'text-red-400'}>{String(debug.isAuthenticated)}</span></div>
          <div>role: <span className="text-amber-400">{debug.role || 'null'}</span></div>
          <div>tokenPresent: <span className={debug.tokenPresent ? 'text-green-400' : 'text-red-400'}>{String(debug.tokenPresent)}</span></div>
          <div>lastStatusFetchStatus: <span className={debug.lastStatusFetchStatus === 200 ? 'text-green-400' : 'text-red-400'}>{debug.lastStatusFetchStatus || 'none'}</span></div>
          {debug.error && <div className="col-span-3 text-red-400">error: {debug.error}</div>}
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

      {/* Setup Status */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <h2 className="text-xl font-semibold text-white mb-4">Setup Status</h2>
        
        {!ready.hasTeams && !ready.hasPlayers && !ready.hasScoringRules ? (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-4">
            <p className="text-amber-400 font-medium">League not configured</p>
            <p className="text-amber-400/70 text-sm mt-1">
              Auto-seed should have created league data. Check server logs.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <StatusCard label="Conferences" count={status?.conferences || 0} ready={status?.conferences > 0} />
          <StatusCard label="Teams" count={status?.teams || 0} ready={ready.hasTeams} />
          <StatusCard label="Players" count={status?.players || 0} ready={ready.hasPlayers} />
          <StatusCard label="Rosters" count={status?.rosterEntries || 0} ready={ready.hasRosters} />
          <StatusCard label="Lineups" count={status?.lineupEntries || 0} ready={ready.hasLineups} />
          <StatusCard label="Games" count={status?.games || 0} ready={ready.hasGames} />
          <StatusCard label="Rules" count={status?.scoringRuleSets || 0} ready={ready.hasScoringRules} />
        </div>

        {status?.activeScoringRules && (
          <p className="mt-4 text-sm text-slate-400">
            Active Scoring Rules: <span className="text-amber-400">{status.activeScoringRules}</span>
          </p>
        )}
      </div>

      {/* League Settings */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <h2 className="text-xl font-semibold text-white mb-4">League Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Current Week
            </label>
            <select
              value={settings?.current_week || 1}
              onChange={(e) => handleUpdateWeek(parseInt(e.target.value))}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
                <option value={1}>Wildcard</option>
                <option value={2}>Divisional</option>
                <option value={3}>Conference</option>
                <option value={4}>Super Bowl</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Seeding creates lineup entries for this week.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Global Lock Time
            </label>
            <div className="flex gap-2">
              <input
                type="datetime-local"
                defaultValue={settings?.lock_time?.slice(0, 16) || ''}
                onChange={(e) => handleSetLockTime(e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={() => handleSetLockTime(null)}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Clear
              </button>
            </div>
            {settings?.lock_time && (
              <p className="mt-1 text-xs text-slate-500">
                Locked at: {new Date(settings.lock_time).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Guide */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <h2 className="text-xl font-semibold text-white mb-4">Setup Guide</h2>
        <ol className="space-y-3 text-slate-300">
          <li className="flex gap-3">
            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm ${
              ready.hasTeams ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-400'
            }`}>1</span>
            <div>
              <strong>Seed Teams & Rosters</strong>
              <p className="text-sm text-slate-500">
                {ready.hasTeams 
                  ? '✓ Auto-seeded on server start' 
                  : 'Run: cd server && npm run seed'}
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm ${
              ready.hasScoringRules ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-400'
            }`}>2</span>
            <div>
              <strong>Upload Scoring Rules</strong>
              <p className="text-sm text-slate-500">
                {ready.hasScoringRules 
                  ? '✓ Rules loaded from auto-seed' 
                  : 'Stats tab → Scoring Rules'}
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm bg-slate-700 text-slate-400">3</span>
            <div>
              <strong>Assign Users to Teams</strong>
              <p className="text-sm text-slate-500">Teams tab → Create users and assign to teams</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm ${
              ready.hasStats ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-400'
            }`}>4</span>
            <div>
              <strong>Ingest Game Stats</strong>
              <p className="text-sm text-slate-500">Stats tab → Game Stats → Paste stats JSON after games</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm bg-slate-700 text-slate-400">5</span>
            <div>
              <strong>Recompute Scores</strong>
              <p className="text-sm text-slate-500">Stats tab → Click "Compute" to calculate fantasy points</p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
}

function StatusCard({ label, count, ready }: { label: string; count: number; ready: boolean }) {
  return (
    <div className={`p-4 rounded-lg border ${
      ready ? 'bg-green-500/10 border-green-500/20' : 'bg-slate-800 border-slate-700'
    }`}>
      <div className={`text-2xl font-bold ${ready ? 'text-green-400' : 'text-slate-400'}`}>
        {count}
      </div>
      <div className="text-slate-400 text-sm">{label}</div>
    </div>
  );
}
