import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../lib/store';

export default function Layout() {
  const { user, logout, isAdmin } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="bg-slate-900 border-b border-amber-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2">
                <span className="text-2xl">🏈</span>
                <span className="text-xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                  2025 BCFL Playoffs
                </span>
              </Link>
              
              <div className="flex items-center gap-4">
                {isAdmin() ? (
                  <>
                    <Link
                      to="/admin"
                      className="text-slate-300 hover:text-amber-400 transition-colors font-medium"
                    >
                      Dashboard
                    </Link>
                    <Link
                      to="/admin/teams"
                      className="text-slate-300 hover:text-amber-400 transition-colors font-medium"
                    >
                      Teams
                    </Link>
                    <Link
                      to="/admin/players"
                      className="text-slate-300 hover:text-amber-400 transition-colors font-medium"
                    >
                      Players
                    </Link>
                    <Link
                      to="/admin/users"
                      className="text-slate-300 hover:text-amber-400 transition-colors font-medium"
                    >
                      Users
                    </Link>
                    <Link
                      to="/admin/ingest"
                      className="text-slate-300 hover:text-amber-400 transition-colors font-medium"
                    >
                      Stats
                    </Link>
                    <Link
                      to="/admin/scores"
                      className="text-slate-300 hover:text-amber-400 transition-colors font-medium"
                    >
                      Scores
                    </Link>
                    <Link
                      to="/admin/rules"
                      className="text-slate-300 hover:text-amber-400 transition-colors font-medium"
                    >
                      Rules
                    </Link>
                    <Link
                      to="/admin/games"
                      className="text-slate-300 hover:text-amber-400 transition-colors font-medium"
                    >
                      Games
                    </Link>
                    <Link
                      to="/admin/writeups"
                      className="text-slate-300 hover:text-amber-400 transition-colors font-medium"
                    >
                      Writeups
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      to="/scoreboard"
                      className="text-slate-300 hover:text-amber-400 transition-colors font-medium"
                    >
                      Scoreboard
                    </Link>
                    <Link
                      to="/team"
                      className="text-slate-300 hover:text-amber-400 transition-colors font-medium"
                    >
                      My Lineup
                    </Link>
                    <Link
                      to="/standings"
                      className="text-slate-300 hover:text-amber-400 transition-colors font-medium"
                    >
                      Standings
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-slate-400 text-sm">
                {user?.email}
                {user?.role === 'ADMIN' && (
                  <span className="ml-2 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                    Admin
                  </span>
                )}
              </span>
              <Link
                to="/settings"
                className="text-slate-400 hover:text-white transition-colors text-sm"
              >
                Settings
              </Link>
              <button
                onClick={handleLogout}
                className="text-slate-400 hover:text-white transition-colors text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}

