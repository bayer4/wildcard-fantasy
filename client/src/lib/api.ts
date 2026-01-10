import axios from 'axios';

// In production (same origin), use relative URL. In dev, default to localhost:3001
const isProduction = import.meta.env.PROD;
export const API_BASE_URL = import.meta.env.VITE_API_URL || (isProduction ? '' : 'http://localhost:3001');
const API_BASE = API_BASE_URL + '/api';

/**
 * Single source of truth for getting the auth token
 * Tries Zustand store first (via localStorage 'auth-storage'), then direct 'token' key
 */
export function getToken(): string | null {
  // Try the direct token key first (set by setAuth)
  const directToken = localStorage.getItem('token');
  if (directToken) return directToken;

  // Try the Zustand persisted store
  try {
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const parsed = JSON.parse(authStorage);
      if (parsed?.state?.token) {
        return parsed.state.token;
      }
    }
  } catch {
    // Ignore parse errors
  }

  return null;
}

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Track if we've warned about missing token (to avoid spam)
let hasWarnedNoToken = false;

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = getToken();
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    hasWarnedNoToken = false; // Reset warning flag when token is present
  } else {
    // Warn once if calling admin endpoints without token
    if (config.url?.includes('/admin/') && !hasWarnedNoToken) {
      console.warn('[API] No auth token found when calling admin endpoint:', config.url);
      hasWarnedNoToken = true;
    }
  }
  
  return config;
});

// Handle 401 responses - but NOT on the login page to avoid loops
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect to login on 401 if we're not already on login/register pages
    // and not calling auth endpoints
    if (error.response?.status === 401) {
      const isAuthEndpoint = error.config?.url?.includes('/auth/');
      const isOnLoginPage = window.location.pathname === '/login' || window.location.pathname === '/register';
      
      if (!isAuthEndpoint && !isOnLoginPage) {
        console.warn('[API] 401 response, clearing token and redirecting to login');
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string, role?: string) =>
    api.post('/auth/register', { email, password, role }),
  me: () => api.get('/auth/me'),
  promote: (email: string) => api.post('/auth/promote', { email }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/auth/password', { currentPassword, newPassword }),
};

// Public API (no auth required)
export const publicApi = {
  getScoreboard: (week: number) => api.get(`/public/scoreboard/${week}`),
  getTeam: (teamId: string, week: number) => api.get(`/public/team/${teamId}`, { params: { week } }),
  getGames: (week: number) => api.get('/games', { params: { week } }),
};

// Seed payload types
interface SeedRosterPlayer {
  displayName: string;
  position: string;
  nflTeam: string;
}

interface SeedTeam {
  name: string;
  roster: SeedRosterPlayer[];
}

interface SeedConference {
  name: string;
  teams: SeedTeam[];
}

interface SeedPayload {
  conferences: SeedConference[];
}

// Admin API
export const adminApi = {
  // Status
  getStatus: () => api.get('/admin/status'),

  // Seed (new format with conferences/teams/rosters)
  seed: (data: SeedPayload) => api.post('/admin/seed', data),

  // Single team with roster (slot-based lineup)
  getTeam: (teamId: string, week?: number) => 
    api.get(`/admin/teams/${teamId}`, { params: week ? { week } : {} }),
  
  // Slot-based lineup management
  assignSlot: (teamId: string, week: number, rosterPlayerId: string, slot: string) =>
    api.put(`/admin/teams/${teamId}/lineup/${week}/assign`, { rosterPlayerId, slot }),
  benchPlayer: (teamId: string, week: number, rosterPlayerId: string) =>
    api.put(`/admin/teams/${teamId}/lineup/${week}/bench`, { rosterPlayerId }),

  // Scoring Rules
  uploadRules: (name: string, rules: any) =>
    api.post('/admin/rules', { name, rules }),
  getRules: () => api.get('/admin/rules'),
  getRulesSchema: () => api.get('/admin/rules/schema'),

  // Teams
  getTeams: () => api.get('/admin/teams'),
  getConferences: () => api.get('/admin/conferences'),

  // Players
  getPlayers: () => api.get('/admin/players'),

  // Rosters & Lineups
  getRoster: (teamId: string) => api.get(`/admin/roster/${teamId}`),
  getLineup: (teamId: string, week: number) => api.get(`/admin/lineup/${teamId}/${week}`),

  // Users
  getUsers: () => api.get('/admin/users'),
  createUser: (email: string, password: string, role: string, teamId?: string) =>
    api.post('/admin/users', { email, password, role, teamId }),
  updateUser: (userId: string, updates: { role?: string; teamId?: string | null }) =>
    api.put(`/admin/users/${userId}`, updates),
  assignUserToTeam: (userId: string, teamId: string) =>
    api.put(`/admin/users/${userId}/team`, { teamId }),
  resetUserPassword: (userId: string, password?: string) =>
    api.post(`/admin/users/${userId}/reset-password`, { password }),

  // Games
  getGames: (week: number) => api.get('/admin/games', { params: { week } }),
  uploadGames: (week: number, games: any[]) => api.post('/admin/games/upload', { week, games }),

  // Settings
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (settings: { currentWeek?: number; lockTime?: string | null }) =>
    api.put('/admin/settings', settings),

  // Ingestion
  manualIngest: (data: any) => api.post('/admin/ingest/manual', data),
  sportsdataioIngest: (week: number, season?: string) =>
    api.post('/admin/ingest/sportsdataio', { week, season }),
  sportsdataioStatus: () => api.get('/admin/ingest/sportsdataio/status'),
  addBonus: (week: number, playerName: string, nflTeam: string, bonusPoints: number, description: string) =>
    api.post('/admin/ingest/bonus', { week, playerName, nflTeam, bonusPoints, description }),

  // Scores
  recomputeScores: (week: number) => api.post('/admin/recompute-scores', { week }),
  checkRecompute: (week: number) => api.get(`/admin/recompute-scores/check/${week}`),
  getScores: (week: number) => api.get(`/admin/scores/${week}`),
  getTeamScores: (week: number, teamId: string) => api.get(`/admin/scores/${week}`, { params: { teamId } }),

  // Roster assignment
  assignRoster: (teamId: string, playerId: string, week: number, isStarter: boolean) =>
    api.post(`/admin/teams/${teamId}/roster`, { playerId, week, isStarter }),
};

// Team API
export const teamApi = {
  getMyTeam: () => api.get('/team/my-team'),
  getLineup: (week: number, teamId?: string) =>
    api.get(`/team/lineup/${week}`, { params: teamId ? { teamId } : {} }),
  // Slot-based lineup management
  assignSlot: (week: number, rosterPlayerId: string, slot: string) =>
    api.put(`/team/lineup/${week}/assign`, { rosterPlayerId, slot }),
  benchPlayer: (week: number, rosterPlayerId: string) =>
    api.put(`/team/lineup/${week}/bench`, { rosterPlayerId }),
  // Legacy (kept for compatibility)
  setPlayerStatus: (week: number, rosterPlayerId: string, isStarter: boolean) =>
    api.put(`/team/lineup/${week}/${rosterPlayerId}`, { isStarter }),
  getScores: (week: number, teamId?: string) =>
    api.get(`/team/scores/${week}`, { params: teamId ? { teamId } : {} }),
  getStandings: (week: number) => api.get(`/team/standings/${week}`),
  getGames: (week: number) => api.get(`/team/games/${week}`),
  getLeague: () => api.get('/team/league'),
  // Scoreboard
  getScoreboard: (week: number) => api.get(`/team/scoreboard/${week}`),
  getMatchup: (week: number, teamId: string) => api.get(`/team/matchup/${week}/${teamId}`),
};

// Scores API
export const scoresApi = {
  getScores: (week: number) => api.get(`/scores/${week}`),
  getLiveScores: (week: number) => api.get(`/scores/${week}/live`),
};
