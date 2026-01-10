import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  role: 'ADMIN' | 'TEAM';
  teamId: string | null;
  teamName?: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  isAdmin: () => boolean;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token: string, user: User) => {
        // Store token separately for API interceptor to read
        localStorage.setItem('token', token);
        set({ token, user });
      },
      logout: () => {
        localStorage.removeItem('token');
        set({ token: null, user: null });
      },
      isAdmin: () => get().user?.role === 'ADMIN',
      isAuthenticated: () => {
        const state = get();
        // Check both zustand state and localStorage for token
        return !!(state.token || localStorage.getItem('token'));
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      // On rehydrate, also ensure localStorage 'token' is synced
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          localStorage.setItem('token', state.token);
        }
      },
    }
  )
);

interface LeagueState {
  currentWeek: number;
  setCurrentWeek: (week: number) => void;
}

export const useLeagueStore = create<LeagueState>((set) => ({
  currentWeek: 1,
  setCurrentWeek: (week: number) => set({ currentWeek: week }),
}));
