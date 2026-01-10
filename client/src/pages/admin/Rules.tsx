import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api';

interface Milestone {
  yards: number;
  totalBonus?: number;
  bonus?: number;
  requiresNeitherRush75NorReceive75?: boolean;
  requiresNeitherRush100NorReceive100?: boolean;
}

interface RulesData {
  name?: string;
  notes?: string[];
  bonuses?: {
    rushing?: {
      yardageMilestones?: Milestone[];
      td50PlusBonus?: number;
    };
    receiving?: {
      yardageMilestones?: Milestone[];
      td50PlusBonus?: number;
    };
    combinedRushReceive?: {
      onlyIfNeitherCategoryReached?: boolean;
      milestones?: Milestone[];
    };
    passing?: {
      tdPoints?: number;
      yardageMilestones?: Milestone[];
      tdPass50PlusBonus?: number;
      qbRushingTdBonus?: number;
      interception?: number;
      nonQbPassTdPoints?: number;
    };
    turnovers?: {
      fumble?: number;
    };
    kicking?: {
      fgUnder53?: number;
      fg53or54?: number;
      fg55Plus?: number;
      missedXP?: number;
      missedFG30to39?: number;
      missedFG29orLess?: number;
    };
    defenseSpecialTeams?: {
      directScore?: string;
      shutout?: number;
      interception?: number;
      fumbleRecovery?: number;
      leastTotalYardageAllowed?: number;
      leastTotalYardageAllowedNotes?: string;
    };
    twoPointConversions?: {
      playerScoring?: number;
      playerPassing?: number;
    };
  };
}

interface RuleSet {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  rules: RulesData | null;
}

interface RulesResponse {
  ruleSets: RuleSet[];
  active: RuleSet | null;
}

export default function AdminRules() {
  const [data, setData] = useState<RulesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      const res = await adminApi.getRules();
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading rules...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-red-400">
        {error}
      </div>
    );
  }

  const activeRules = data?.active;
  const rules = activeRules?.rules?.bonuses;

  if (!activeRules || !rules) {
    return (
      <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">No Scoring Rules</h2>
        <p className="text-slate-400">No active scoring rules found. Upload rules via the Admin Dashboard.</p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const MilestoneTable = ({ milestones, label }: { milestones: Milestone[]; label: string }) => (
    <div className="mt-3">
      <div className="text-xs text-slate-500 uppercase mb-2">{label}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-700">
            <th className="pb-2">Yards</th>
            <th className="pb-2">Total Bonus</th>
          </tr>
        </thead>
        <tbody>
          {milestones.map((m, i) => (
            <tr key={i} className="border-b border-slate-800">
              <td className="py-2 text-slate-300">{m.yards}+</td>
              <td className="py-2 text-amber-400 font-medium">+{m.totalBonus || m.bonus}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-600 mt-2 italic">* Bonuses are cumulative totals, not additive</p>
    </div>
  );

  const StatRow = ({ label, value, note }: { label: string; value: number | string | undefined; note?: string }) => {
    if (value === undefined) return null;
    const isNegative = typeof value === 'number' && value < 0;
    return (
      <div className="flex justify-between py-2 border-b border-slate-800">
        <span className="text-slate-400">{label}</span>
        <div className="text-right">
          <span className={`font-medium ${isNegative ? 'text-red-400' : 'text-emerald-400'}`}>
            {typeof value === 'number' ? (value > 0 ? `+${value}` : value) : value}
          </span>
          {note && <span className="text-xs text-slate-600 ml-2">({note})</span>}
        </div>
      </div>
    );
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        {title}
      </h3>
      {children}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{activeRules.name}</h1>
          <p className="text-slate-400 mt-1">
            Uploaded {formatDate(activeRules.createdAt)}
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-sm font-medium rounded-full">
          Active
        </span>
      </div>

      {/* Notes */}
      {activeRules.rules?.notes && activeRules.rules.notes.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <div className="text-amber-400 font-medium mb-2">Notes</div>
          <ul className="text-slate-300 text-sm space-y-1">
            {activeRules.rules.notes.map((note, i) => (
              <li key={i}>• {note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Rules Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rushing */}
        {rules.rushing && (
          <Section title="🏃 Rushing">
            <StatRow label="TD 50+ Yards Bonus" value={rules.rushing.td50PlusBonus} />
            {rules.rushing.yardageMilestones && (
              <MilestoneTable milestones={rules.rushing.yardageMilestones} label="Yardage Milestones" />
            )}
          </Section>
        )}

        {/* Receiving */}
        {rules.receiving && (
          <Section title="🎯 Receiving">
            <StatRow label="TD 50+ Yards Bonus" value={rules.receiving.td50PlusBonus} />
            {rules.receiving.yardageMilestones && (
              <MilestoneTable milestones={rules.receiving.yardageMilestones} label="Yardage Milestones" />
            )}
          </Section>
        )}

        {/* Combined Rush/Receive */}
        {rules.combinedRushReceive && (
          <Section title="🔄 Combined Rush/Receive">
            {rules.combinedRushReceive.onlyIfNeitherCategoryReached && (
              <p className="text-sm text-slate-400 mb-3 italic">
                Only applies if neither individual category milestone is reached
              </p>
            )}
            {rules.combinedRushReceive.milestones && (
              <div className="space-y-2">
                {rules.combinedRushReceive.milestones.map((m, i) => (
                  <div key={i} className="flex justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400">
                      {m.yards}+ combined yards
                      {m.requiresNeitherRush75NorReceive75 && (
                        <span className="text-xs text-slate-600 ml-2">(neither 75+ rush nor 75+ rec)</span>
                      )}
                      {m.requiresNeitherRush100NorReceive100 && (
                        <span className="text-xs text-slate-600 ml-2">(neither 100+ rush nor 100+ rec)</span>
                      )}
                    </span>
                    <span className="text-emerald-400 font-medium">+{m.bonus}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Passing */}
        {rules.passing && (
          <Section title="🏈 Passing">
            <StatRow label="Passing TD" value={rules.passing.tdPoints} />
            <StatRow label="TD Pass 50+ Yards Bonus" value={rules.passing.tdPass50PlusBonus} />
            <StatRow label="QB Rushing TD Bonus" value={rules.passing.qbRushingTdBonus} />
            <StatRow label="Non-QB Pass TD" value={rules.passing.nonQbPassTdPoints} note="trick play" />
            <StatRow label="Interception" value={rules.passing.interception} />
            {rules.passing.yardageMilestones && (
              <MilestoneTable milestones={rules.passing.yardageMilestones} label="Yardage Milestones" />
            )}
          </Section>
        )}

        {/* Kicking */}
        {rules.kicking && (
          <Section title="🦵 Kicking">
            <div className="text-xs text-slate-500 mb-3 italic">
              Base FG = {rules.kicking.fgUnder53} pts. Longer kicks earn bonuses.
            </div>
            <StatRow label="FG Under 53 yards" value={rules.kicking.fgUnder53} note="base" />
            <StatRow label="FG 53-54 yards" value={rules.kicking.fg53or54} note="total" />
            <StatRow 
              label="FG 55+ yards" 
              value={(rules.kicking.fgUnder53 || 3) + (rules.kicking.fg55Plus || 0)} 
              note={`${rules.kicking.fgUnder53 || 3} base + ${rules.kicking.fg55Plus || 0} bonus`} 
            />
            <div className="mt-4 pt-3 border-t border-slate-700">
              <div className="text-xs text-slate-500 mb-2 uppercase">Missed Kicks</div>
              <StatRow label="Missed XP" value={rules.kicking.missedXP} />
              <StatRow label="Missed FG 30-39 yards" value={rules.kicking.missedFG30to39} />
              <StatRow label="Missed FG 29 or less" value={rules.kicking.missedFG29orLess} />
            </div>
          </Section>
        )}

        {/* Defense / Special Teams */}
        {rules.defenseSpecialTeams && (
          <Section title="🛡️ Defense / Special Teams">
            <StatRow label="Defensive/ST Score" value={rules.defenseSpecialTeams.directScore} />
            <StatRow label="Shutout Bonus" value={rules.defenseSpecialTeams.shutout} />
            <StatRow label="Interception" value={rules.defenseSpecialTeams.interception} />
            <StatRow label="Fumble Recovery" value={rules.defenseSpecialTeams.fumbleRecovery} />
            <StatRow 
              label="Least Yards Allowed Bonus" 
              value={rules.defenseSpecialTeams.leastTotalYardageAllowed} 
              note={rules.defenseSpecialTeams.leastTotalYardageAllowedNotes}
            />
          </Section>
        )}

        {/* Turnovers */}
        {rules.turnovers && (
          <Section title="💥 Turnovers">
            <StatRow label="Fumble Lost" value={rules.turnovers.fumble} />
          </Section>
        )}

        {/* Two-Point Conversions */}
        {rules.twoPointConversions && (
          <Section title="2️⃣ Two-Point Conversions">
            <StatRow label="Player Scoring" value={rules.twoPointConversions.playerScoring} />
            <StatRow label="Player Passing" value={rules.twoPointConversions.playerPassing} />
          </Section>
        )}
      </div>

      {/* Raw JSON Toggle */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <button
          onClick={() => setShowRawJson(!showRawJson)}
          className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-slate-800/50 transition-colors"
        >
          <span className="text-slate-400 font-medium">Raw JSON</span>
          <span className="text-slate-500">{showRawJson ? '▼' : '▶'}</span>
        </button>
        {showRawJson && (
          <div className="px-6 pb-6">
            <pre className="bg-slate-950 p-4 rounded-lg text-xs text-slate-400 overflow-x-auto max-h-96">
              {JSON.stringify(activeRules.rules, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

