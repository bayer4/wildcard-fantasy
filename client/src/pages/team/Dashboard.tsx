import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamApi } from '../../lib/api';
import { useAuthStore } from '../../lib/store';

// Slot configuration
const STARTER_SLOTS = ['QB', 'RB', 'WRTE', 'FLEX1', 'FLEX2', 'FLEX3', 'K', 'DEF'] as const;
type SlotType = typeof STARTER_SLOTS[number];

const SLOT_LABELS: Record<SlotType, string> = {
  QB: 'QB',
  RB: 'RB',
  WRTE: 'WR/TE',
  FLEX1: 'FLEX',
  FLEX2: 'FLEX',
  FLEX3: 'FLEX',
  K: 'K',
  DEF: 'DEF',
};

const SLOT_ELIGIBILITY: Record<SlotType, string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WRTE: ['WR', 'TE'],
  FLEX1: ['RB', 'WR', 'TE'],
  FLEX2: ['RB', 'WR', 'TE'],
  FLEX3: ['RB', 'WR', 'TE'],
  K: ['K'],
  DEF: ['DEF'],
};

interface GameInfo {
  gameId: string;
  opponent: string;
  kickoffUtc: string;
  gameStatus: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  spreadHome: number | null;
  total: number | null;
}

interface Player {
  rosterPlayerId: string;
  playerId: string;
  displayName: string;
  position: string;
  nflTeam: string;
  isLocked?: boolean;
  lockReason?: string;
  game?: GameInfo | null;
}

// Compact game info strip component
function GameStrip({ game, nflTeam }: { game?: GameInfo | null; nflTeam: string }) {
  if (!game) {
    return <span className="text-slate-600 text-xs">No game</span>;
  }

  const kickoff = new Date(game.kickoffUtc);
  const isLive = game.gameStatus === 'in_progress' || game.gameStatus === 'IN_PROGRESS';
  const isFinal = game.gameStatus === 'final' || game.gameStatus === 'FINAL';
  
  const formatKickoff = () => {
    if (isFinal) return 'Final';
    if (isLive) return 'Live';
    return kickoff.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatSpread = () => {
    if (game.spreadHome === null) return null;
    const isHome = game.homeTeam === nflTeam;
    const spread = isHome ? game.spreadHome : -game.spreadHome;
    if (spread === 0) return 'PK';
    return spread > 0 ? `+${spread}` : spread.toString();
  };

  const spread = formatSpread();

  return (
    <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
      {isLive && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      )}
      <span className={isLive ? 'text-green-400' : ''}>
        {game.opponent}
      </span>
      <span className="text-slate-600">•</span>
      <span className={isLive ? 'text-green-400 font-medium' : ''}>
        {formatKickoff()}
      </span>
      {!isFinal && game.total !== null && (
        <>
          <span className="text-slate-600">•</span>
          <span>O/U {game.total}</span>
        </>
      )}
      {!isFinal && spread && (
        <>
          <span className="text-slate-600">•</span>
          <span>{spread}</span>
        </>
      )}
    </div>
  );
}

interface LineupData {
  team: {
    id: string;
    name: string;
    conferenceName: string;
    minutesLeft?: number;
  };
  week: number;
  lineup: Record<SlotType, Player | null>;
  bench: Player[];
}

export default function TeamDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  
  const [lineupData, setLineupData] = useState<LineupData | null>(null);
  const [league, setLeague] = useState<{ current_week: number; lock_time: string | null } | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedSlot, setSelectedSlot] = useState<SlotType | null>(null);
  const [selectedBenchPlayer, setSelectedBenchPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Redirect ADMIN users
  useEffect(() => {
    if (user?.role === 'ADMIN') {
      navigate('/admin', { replace: true });
      return;
    }
  }, [user, navigate]);

  // Load initial data
  useEffect(() => {
    if (user?.role === 'TEAM') {
      loadLeague();
    }
  }, [user]);

  // Load lineup when week changes
  useEffect(() => {
    if (user?.role === 'TEAM' && user?.teamId && selectedWeek) {
      loadLineup();
    }
  }, [user, selectedWeek]);

  const loadLeague = async () => {
    try {
      const res = await teamApi.getLeague();
      setLeague(res.data);
      setSelectedWeek(res.data.current_week || 1);
    } catch (err) {
      console.error('Failed to load league', err);
    }
  };

  const loadLineup = async () => {
    setLoading(true);
    try {
      const res = await teamApi.getLineup(selectedWeek);
      setLineupData(res.data);
    } catch (err) {
      console.error('Failed to load lineup', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSlotClick = async (slot: SlotType) => {
    // If we have a bench player selected, try to assign them to this slot
    if (selectedBenchPlayer) {
      const eligibleSlots = getEligibleSlotsForPlayer(selectedBenchPlayer);
      if (eligibleSlots.includes(slot)) {
        await handleBenchPlayerClick(selectedBenchPlayer, slot);
        return;
      }
      // Not eligible - just switch to selecting this slot instead
    }
    
    // If clicking the same slot, deselect
    if (selectedSlot === slot) {
      setSelectedSlot(null);
    } else {
      setSelectedSlot(slot);
    }
    setSelectedBenchPlayer(null);
    setMessage(null);
  };

  const handleBenchPlayerClick = async (player: Player, targetSlot?: SlotType) => {
    if (player.isLocked) {
      setMessage({ type: 'error', text: `${player.displayName} is locked: ${player.lockReason}` });
      return;
    }

    // If we have a target slot (from slot selection or dropdown), assign directly
    const slotToUse = targetSlot || selectedSlot;
    
    if (slotToUse) {
      // Check eligibility
      const eligible = SLOT_ELIGIBILITY[slotToUse];
      if (!eligible.includes(player.position)) {
        setMessage({ type: 'error', text: `${player.position} cannot be placed in ${SLOT_LABELS[slotToUse]} slot` });
        return;
      }

      try {
        await teamApi.assignSlot(selectedWeek, player.rosterPlayerId, slotToUse);
        setSelectedSlot(null);
        setSelectedBenchPlayer(null);
        setMessage(null);
        loadLineup();
      } catch (err: any) {
        setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to assign player' });
      }
    } else {
      // No slot selected - show player options
      if (selectedBenchPlayer?.rosterPlayerId === player.rosterPlayerId) {
        // Clicking same player deselects
        setSelectedBenchPlayer(null);
      } else {
        setSelectedBenchPlayer(player);
        setSelectedSlot(null);
      }
      setMessage(null);
    }
  };

  const getEligibleSlotsForPlayer = (player: Player) => {
    return STARTER_SLOTS.filter(s => SLOT_ELIGIBILITY[s].includes(player.position));
  };

  const getEmptyEligibleSlots = (player: Player) => {
    if (!lineupData) return [];
    return getEligibleSlotsForPlayer(player).filter(s => !lineupData.lineup[s]);
  };

  const getOccupiedEligibleSlots = (player: Player) => {
    if (!lineupData) return [];
    return getEligibleSlotsForPlayer(player).filter(s => lineupData.lineup[s]);
  };

  const handleBenchStarter = async (slot: SlotType) => {
    const player = lineupData?.lineup[slot];
    if (!player) return;

    if (player.isLocked) {
      setMessage({ type: 'error', text: `${player.displayName} is locked: ${player.lockReason}` });
      return;
    }

    try {
      await teamApi.benchPlayer(selectedWeek, player.rosterPlayerId);
      setMessage(null);
      loadLineup();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to bench player' });
    }
  };

  // Don't render for ADMIN users
  if (user?.role === 'ADMIN') {
    return null;
  }

  if (user?.role === 'TEAM' && !user?.teamId) {
    return (
      <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">No Team Assigned</h2>
        <p className="text-slate-400">Contact your league admin to be assigned to a team.</p>
      </div>
    );
  }

  if (loading && !lineupData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading lineup...</div>
      </div>
    );
  }

  if (!lineupData) {
    return (
      <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Team Not Found</h2>
        <p className="text-slate-400">Your assigned team may not exist. Contact your admin.</p>
      </div>
    );
  }

  const isGloballyLocked = league?.lock_time && new Date(league.lock_time) <= new Date();

  // Group bench by position
  const benchByPosition = lineupData.bench.reduce((acc, player) => {
    if (!acc[player.position]) acc[player.position] = [];
    acc[player.position].push(player);
    return acc;
  }, {} as Record<string, Player[]>);

  const positionOrder = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{lineupData.team.name}</h1>
          <div className="flex items-center gap-3">
            <p className="text-slate-400">{lineupData.team.conferenceName} Conference</p>
            {lineupData.team.minutesLeft !== undefined && lineupData.team.minutesLeft > 0 && (
              <span className="text-slate-500 text-sm flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {lineupData.team.minutesLeft}m left
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="text-slate-400 text-sm">Round:</label>
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
            className="bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-700 focus:border-amber-500 focus:outline-none"
          >
            <option value={1}>Wildcard</option>
            <option value={2}>Divisional</option>
            <option value={3}>Conference</option>
            <option value={4}>Super Bowl</option>
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

      {isGloballyLocked && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          🔒 Lineups are locked for the week
        </div>
      )}



      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Starters */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-xl font-semibold text-white">Starters</h2>
            <p className="text-slate-500 text-sm">8 slots</p>
          </div>
          <div className="divide-y divide-slate-800">
            {STARTER_SLOTS.map((slot) => {
              const player = lineupData.lineup[slot];
              const isSelected = selectedSlot === slot;
              const canReceiveBenchPlayer = selectedBenchPlayer && 
                getEligibleSlotsForPlayer(selectedBenchPlayer).includes(slot);
              const isValidTarget = canReceiveBenchPlayer && (!player || !player.isLocked);
              
              return (
                <div 
                  key={slot}
                  className={`px-6 py-4 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected 
                      ? 'bg-amber-500/10 border-l-4 border-l-amber-500' 
                      : isValidTarget
                        ? 'bg-emerald-500/5 hover:bg-emerald-500/10 border-l-4 border-l-emerald-500/50'
                        : 'hover:bg-slate-800/50'
                  }`}
                  onClick={() => handleSlotClick(slot)}
                >
                  <div className="flex items-center gap-4">
                    <span className={`w-12 text-center px-2 py-1 rounded text-xs font-bold ${
                      player ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {SLOT_LABELS[slot]}
                    </span>
                    {player ? (
                      <div>
                        <div className="text-white font-medium flex items-center gap-2">
                          {player.displayName}
                          {player.isLocked && (
                            <span className="text-red-400 text-xs">🔒</span>
                          )}
                        </div>
                        <GameStrip game={player.game} nflTeam={player.nflTeam} />
                      </div>
                    ) : (
                      <div className="text-slate-500 italic">
                        Empty - click to select
                      </div>
                    )}
                  </div>
                  {player && !player.isLocked && !isGloballyLocked && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBenchStarter(slot);
                      }}
                      className="px-3 py-1 rounded text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                    >
                      Bench
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bench */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-xl font-semibold text-white">Bench</h2>
            <p className="text-slate-500 text-sm">{lineupData.bench.length} players</p>
          </div>
          <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
            {positionOrder.map((pos) => {
              const players = benchByPosition[pos];
              if (!players || players.length === 0) return null;
              
              return (
                <div key={pos}>
                  <div className="px-6 py-2 bg-slate-800/50">
                    <span className="text-xs font-bold text-slate-400 uppercase">{pos}</span>
                  </div>
                  {players.map((player) => {
                    // Determine which slots this player is eligible for
                    const eligibleSlots = STARTER_SLOTS.filter(
                      (s) => SLOT_ELIGIBILITY[s].includes(player.position)
                    );
                    const canAssign = selectedSlot && eligibleSlots.includes(selectedSlot);
                    const isSelectedBench = selectedBenchPlayer?.rosterPlayerId === player.rosterPlayerId;
                    const emptySlots = getEmptyEligibleSlots(player);
                    const occupiedSlots = getOccupiedEligibleSlots(player);
                    
                    return (
                      <div
                        key={player.rosterPlayerId}
                        className={`px-6 py-3 cursor-pointer transition-colors ${
                          isSelectedBench
                            ? 'bg-slate-800/80'
                            : selectedSlot && canAssign 
                              ? 'bg-green-500/5 hover:bg-green-500/10' 
                              : selectedSlot && !canAssign
                                ? 'opacity-40'
                                : 'hover:bg-slate-800/50'
                        }`}
                        onClick={() => {
                          if (selectedSlot && canAssign) {
                            handleBenchPlayerClick(player);
                          } else if (!selectedSlot) {
                            handleBenchPlayerClick(player);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`w-10 text-center px-2 py-1 rounded text-xs font-medium ${
                              isSelectedBench ? 'bg-amber-500/30 text-amber-300' : 'bg-slate-700 text-slate-400'
                            }`}>
                              {player.position}
                            </span>
                            <div>
                              <div className={`flex items-center gap-2 ${isSelectedBench ? 'text-white' : 'text-slate-300'}`}>
                                {player.displayName}
                                {player.isLocked && (
                                  <span className="text-red-400 text-xs">🔒</span>
                                )}
                              </div>
                              <GameStrip game={player.game} nflTeam={player.nflTeam} />
                            </div>
                          </div>
                          {selectedSlot && canAssign && !player.isLocked && (
                            <span className="px-3 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400">
                              → {SLOT_LABELS[selectedSlot]}
                            </span>
                          )}
                          {!selectedSlot && !isSelectedBench && (
                            <span className="text-slate-600 text-xs">
                              {eligibleSlots.map(s => SLOT_LABELS[s]).join(' / ')}
                            </span>
                          )}
                        </div>
                        {/* Inline slot options when selected */}
                        {isSelectedBench && !selectedSlot && lineupData && (
                          <div className="flex flex-wrap gap-1.5 mt-2 ml-13">
                            {emptySlots.map(slot => (
                              <button
                                key={slot}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleBenchPlayerClick(player, slot);
                                }}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded transition-colors"
                              >
                                {SLOT_LABELS[slot]}
                              </button>
                            ))}
                            {occupiedSlots.map(slot => {
                              const currentPlayer = lineupData.lineup[slot];
                              if (!currentPlayer) return null;
                              const isLocked = currentPlayer.isLocked;
                              return (
                                <button
                                  key={slot}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isLocked) handleBenchPlayerClick(player, slot);
                                  }}
                                  disabled={isLocked}
                                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                    isLocked 
                                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                                      : 'bg-slate-600 hover:bg-slate-500 text-slate-200'
                                  }`}
                                >
                                  ↔ {currentPlayer.displayName.split(' ').pop()}
                                </button>
                              );
                            })}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBenchPlayer(null);
                              }}
                              className="px-2 py-1 text-slate-500 hover:text-slate-300 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {lineupData.bench.length === 0 && (
              <div className="px-6 py-8 text-center text-slate-500">
                All players are starting
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
