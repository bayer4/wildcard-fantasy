import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api';

const ROUND_NAMES: Record<number, string> = {
  1: 'Wildcard',
  2: 'Divisional',
  3: 'Conference',
  4: 'Super Bowl',
};

interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  spreadHome: number | null;
  total: number | null;
}

const EXAMPLE_JSON = `[
  {
    "kickoff_utc": "2025-01-11T21:30:00Z",
    "home_team": "PHI",
    "away_team": "GB",
    "status": "SCHEDULED",
    "spread_home": -4.5,
    "total": 45.5
  },
  {
    "kickoff_utc": "2025-01-12T18:00:00Z",
    "home_team": "BUF",
    "away_team": "NE",
    "status": "SCHEDULED",
    "spread_home": -8,
    "total": 42
  }
]`;

export default function AdminGames() {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [games, setGames] = useState<Game[]>([]);
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadGames();
  }, [selectedWeek]);

  const loadGames = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getGames(selectedWeek);
      setGames(res.data.games || []);
    } catch (err) {
      console.error('Failed to load games', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!jsonInput.trim()) {
      setMessage({ type: 'error', text: 'Please enter JSON data' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const parsed = JSON.parse(jsonInput);
      const gamesArray = Array.isArray(parsed) ? parsed : [parsed];
      
      const res = await adminApi.uploadGames(selectedWeek, gamesArray);
      setMessage({ 
        type: 'success', 
        text: `Uploaded ${res.data.total} games (${res.data.inserted} new, ${res.data.updated} updated)` 
      });
      setJsonInput('');
      loadGames();
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setMessage({ type: 'error', text: 'Invalid JSON format' });
      } else {
        setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to upload games' });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleClearGames = async () => {
    if (!confirm(`Are you sure you want to delete ALL ${ROUND_NAMES[selectedWeek]} games? This cannot be undone.`)) {
      return;
    }

    setClearing(true);
    setMessage(null);

    try {
      const res = await adminApi.clearGames(selectedWeek);
      setMessage({ 
        type: 'success', 
        text: `Cleared ${res.data.deleted} games from ${ROUND_NAMES[selectedWeek]}` 
      });
      loadGames();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to clear games' });
    } finally {
      setClearing(false);
    }
  };

  const formatKickoff = (utc: string) => {
    const date = new Date(utc);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  const formatSpread = (spread: number | null) => {
    if (spread === null) return '-';
    if (spread === 0) return 'PK';
    return spread > 0 ? `+${spread}` : spread.toString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Game Schedule</h1>
          <p className="text-slate-400 mt-1">Upload and manage NFL game schedules</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="text-slate-400 text-sm">Round:</label>
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
            className="bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-700 focus:border-amber-500 focus:outline-none"
          >
            {[1, 2, 3, 4].map((w) => (
              <option key={w} value={w}>{ROUND_NAMES[w]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-xl font-semibold text-white">Upload Games</h2>
            <p className="text-slate-500 text-sm mt-1">Paste JSON array of games for {ROUND_NAMES[selectedWeek]}</p>
          </div>
          <div className="p-6 space-y-4">
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={EXAMPLE_JSON}
              className="w-full h-64 bg-slate-950 text-slate-300 font-mono text-sm p-4 rounded-lg border border-slate-700 focus:border-amber-500 focus:outline-none resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={handleUpload}
                disabled={uploading || !jsonInput.trim()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-medium rounded-lg transition-colors"
              >
                {uploading ? 'Uploading...' : `Upload to ${ROUND_NAMES[selectedWeek]}`}
              </button>
              <button
                onClick={() => setJsonInput(EXAMPLE_JSON)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-lg transition-colors"
              >
                Load Example
              </button>
            </div>
            
            <div className="text-xs text-slate-600 space-y-1">
              <p>Required fields: <code className="text-slate-500">kickoff_utc</code>, <code className="text-slate-500">home_team</code>, <code className="text-slate-500">away_team</code></p>
              <p>Optional: <code className="text-slate-500">status</code>, <code className="text-slate-500">spread_home</code>, <code className="text-slate-500">total</code>, <code className="text-slate-500">home_score</code>, <code className="text-slate-500">away_score</code></p>
            </div>
          </div>
        </div>

        {/* Current Games */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">{ROUND_NAMES[selectedWeek]} Games</h2>
                <p className="text-slate-500 text-sm mt-1">{games.length} games loaded</p>
              </div>
              {games.length > 0 && (
                <button
                  onClick={handleClearGames}
                  disabled={clearing}
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 disabled:bg-slate-700 border border-red-500/30 text-red-400 text-sm font-medium rounded-lg transition-colors"
                >
                  {clearing ? 'Clearing...' : 'Clear All'}
                </button>
              )}
            </div>
          </div>
          <div className="divide-y divide-slate-800 max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading...</div>
            ) : games.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No games uploaded for {ROUND_NAMES[selectedWeek]}
              </div>
            ) : (
              games.map((game) => (
                <div key={game.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-white font-medium">{game.awayTeam}</span>
                      <span className="text-slate-500">@</span>
                      <span className="text-white font-medium">{game.homeTeam}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      game.status === 'final' ? 'bg-slate-700 text-slate-400' :
                      game.status === 'in_progress' ? 'bg-green-500/20 text-green-400' :
                      'bg-amber-500/20 text-amber-400'
                    }`}>
                      {game.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm text-slate-400">
                    {formatKickoff(game.kickoffUtc)}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-slate-500">
                    {game.spreadHome !== null && (
                      <span>Spread: <span className="text-slate-400">{game.homeTeam} {formatSpread(game.spreadHome)}</span></span>
                    )}
                    {game.total !== null && (
                      <span>O/U: <span className="text-slate-400">{game.total}</span></span>
                    )}
                    {game.homeScore !== null && game.awayScore !== null && (
                      <span>Score: <span className="text-slate-400">{game.awayTeam} {game.awayScore} - {game.homeTeam} {game.homeScore}</span></span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

