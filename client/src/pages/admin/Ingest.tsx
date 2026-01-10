import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api';

export default function AdminIngest() {
  const [activeTab, setActiveTab] = useState<'seed' | 'rules' | 'stats'>('seed');
  const [inputJson, setInputJson] = useState('');
  const [week, setWeek] = useState(1);
  const [rulesName, setRulesName] = useState('');
  const [sportsdataioAvailable, setSportsdataioAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    checkSportsdataio();
  }, []);

  const checkSportsdataio = async () => {
    try {
      const { data } = await adminApi.sportsdataioStatus();
      setSportsdataioAvailable(data.available);
    } catch {
      setSportsdataioAvailable(false);
    }
  };

  const handleSeed = async () => {
    setLoading(true);
    setMessage(null);
    setResult(null);
    try {
      const data = JSON.parse(inputJson);
      const { data: res } = await adminApi.seed(data);
      setResult(res);
      setMessage({ type: 'success', text: 'Data seeded successfully!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || err.message || 'Failed to seed data' });
    } finally {
      setLoading(false);
    }
  };

  const handleUploadRules = async () => {
    setLoading(true);
    setMessage(null);
    setResult(null);
    try {
      const rules = JSON.parse(inputJson);
      const { data: res } = await adminApi.uploadRules(rulesName, rules);
      setResult(res);
      setMessage({ type: 'success', text: 'Scoring rules uploaded and activated!' });
      setRulesName('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || err.message || 'Failed to upload rules' });
    } finally {
      setLoading(false);
    }
  };

  const handleIngestStats = async () => {
    setLoading(true);
    setMessage(null);
    setResult(null);
    try {
      const data = JSON.parse(inputJson);
      const { data: res } = await adminApi.manualIngest(data);
      setResult(res);
      setMessage({ type: 'success', text: 'Stats ingested successfully!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || err.message || 'Failed to ingest stats' });
    } finally {
      setLoading(false);
    }
  };

  const handleRecomputeScores = async () => {
    setLoading(true);
    setMessage(null);
    setResult(null);
    try {
      await adminApi.recomputeScores(week);
      setMessage({ type: 'success', text: `Scores recomputed for week ${week}!` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to recompute scores' });
      if (err.response?.data?.details) {
        setResult({ errors: err.response.data.details });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Data Management</h1>
        <p className="text-slate-400 mt-1">Upload JSON data to configure your league</p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg border ${
          message.type === 'success'
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      {result && (
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <h3 className="text-lg font-semibold text-white mb-2">Result</h3>
          <pre className="bg-slate-800 p-4 rounded-lg text-sm text-slate-300 overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        {[
          { id: 'seed', label: 'Seed Teams/Rosters' },
          { id: 'rules', label: 'Scoring Rules' },
          { id: 'stats', label: 'Game Stats' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as any); setInputJson(''); setResult(null); }}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-amber-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* JSON Input */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <h2 className="text-xl font-semibold text-white mb-4">
            {activeTab === 'seed' && 'Seed Conferences, Teams & Rosters'}
            {activeTab === 'rules' && 'Upload Scoring Rules'}
            {activeTab === 'stats' && 'Ingest Game Stats'}
          </h2>
          
          {activeTab === 'rules' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Ruleset Name
              </label>
              <input
                type="text"
                value={rulesName}
                onChange={(e) => setRulesName(e.target.value)}
                placeholder="e.g., PPR Standard"
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}

          <textarea
            value={inputJson}
            onChange={(e) => setInputJson(e.target.value)}
            className="w-full h-80 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="Paste your JSON here..."
          />
          
          <button
            onClick={
              activeTab === 'seed' ? handleSeed :
              activeTab === 'rules' ? handleUploadRules :
              handleIngestStats
            }
            disabled={loading || !inputJson || (activeTab === 'rules' && !rulesName)}
            className="mt-4 w-full py-2 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 
              activeTab === 'seed' ? 'Seed Data' :
              activeTab === 'rules' ? 'Upload Rules' :
              'Ingest Stats'
            }
          </button>
        </div>

        {/* Right Panel - Format Reference */}
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
            <h2 className="text-xl font-semibold text-white mb-4">Expected Format</h2>
            <pre className="bg-slate-800 p-4 rounded-lg text-xs text-slate-300 overflow-x-auto max-h-80">
{activeTab === 'seed' ? `{
  "conferences": [
    {
      "name": "AFC",
      "teams": [
        {
          "name": "Team Alpha",
          "roster": [
            { "displayName": "Patrick Mahomes", "position": "QB", "nflTeam": "KC" },
            { "displayName": "Travis Kelce", "position": "TE", "nflTeam": "KC" },
            { "displayName": "KC Defense", "position": "DEF", "nflTeam": "KC" }
          ]
        },
        {
          "name": "Team Beta",
          "roster": [
            { "displayName": "Lamar Jackson", "position": "QB", "nflTeam": "BAL" }
          ]
        }
      ]
    },
    {
      "name": "NFC",
      "teams": [
        {
          "name": "Team Gamma",
          "roster": [...]
        }
      ]
    }
  ]
}` : activeTab === 'rules' ? `{
  "passing": { 
    "yardsPerPoint": 25, 
    "tdPoints": 4, 
    "interceptionPoints": -2, 
    "twoPtConversionPoints": 2 
  },
  "rushing": { 
    "yardsPerPoint": 10, 
    "tdPoints": 6, 
    "twoPtConversionPoints": 2 
  },
  "receiving": { 
    "yardsPerPoint": 10, 
    "tdPoints": 6, 
    "receptionPoints": 1, 
    "twoPtConversionPoints": 2 
  },
  "kicking": { 
    "fgMade0_39Points": 3, 
    "fgMade40_49Points": 4, 
    "fgMade50_54Points": 5, 
    "fgMade55PlusPoints": 6, 
    "fgMissedPoints": -1, 
    "xpMadePoints": 1, 
    "xpMissedPoints": -1 
  },
  "defense": { 
    "sackPoints": 1, 
    "interceptionPoints": 2, 
    "fumbleRecoveryPoints": 2, 
    "defenseTDPoints": 6, 
    "safetyPoints": 2, 
    "blockedKickPoints": 2, 
    "returnTDPoints": 6, 
    "pointsAllowedScoring": [...], 
    "yardsAllowedScoring": [...] 
  },
  "misc": { "fumbleLostPoints": -2 },
  "bonuses": { 
    "passingTD50PlusYards": 2, 
    "rushingTD50PlusYards": 2, 
    ... 
  }
}` : `{
  "games": [
    { "week": 1, "homeTeamAbbr": "KC", "awayTeamAbbr": "BAL", 
      "kickoffTime": "2025-01-11T20:00:00Z", "status": "final" }
  ],
  "playerGameStats": [
    { "playerName": "Patrick Mahomes", "position": "QB", 
      "nflTeamAbbr": "KC", "gameWeek": 1, 
      "passYards": 320, "passTDs": 3, ... }
  ],
  "defenseGameStats": [
    { "teamAbbr": "KC", "gameWeek": 1, 
      "pointsAllowed": 17, "yardsAllowed": 320, ... }
  ]
}`}
            </pre>
          </div>

          {/* Recompute Scores */}
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
            <h2 className="text-xl font-semibold text-white mb-4">Recompute Scores</h2>
            <p className="text-slate-400 text-sm mb-4">
              Run scoring engine after uploading rules and stats.
            </p>
            <div className="flex gap-4">
              <select
                value={week}
                onChange={(e) => setWeek(parseInt(e.target.value))}
                className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              >
                  <option value={1}>Wildcard</option>
                  <option value={2}>Divisional</option>
                  <option value={3}>Conference</option>
                  <option value={4}>Super Bowl</option>
              </select>
              <button
                onClick={handleRecomputeScores}
                disabled={loading}
                className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Compute
              </button>
            </div>
          </div>

          {/* SportsDataIO */}
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
            <h2 className="text-xl font-semibold text-white mb-4">SportsDataIO (Optional)</h2>
            <div className={`p-3 rounded-lg ${
              sportsdataioAvailable 
                ? 'bg-green-500/10 text-green-400' 
                : 'bg-slate-800 text-slate-400'
            }`}>
              {sportsdataioAvailable 
                ? '✓ API Key configured' 
                : '✗ Set SPORTSDATAIO_API_KEY in server/.env'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
