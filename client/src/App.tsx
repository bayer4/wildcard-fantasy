import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './lib/store';

// Layout
import Layout from './components/Layout';

// Auth pages
import Login from './pages/Login';
import Register from './pages/Register';

// Admin pages
import AdminDashboard from './pages/admin/Dashboard';
import AdminTeams from './pages/admin/Teams';
import AdminTeamDetail from './pages/admin/TeamDetail';
import AdminPlayers from './pages/admin/Players';
import AdminUsers from './pages/admin/Users';
import AdminIngest from './pages/admin/Ingest';
import AdminScores from './pages/admin/Scores';
import AdminRules from './pages/admin/Rules';
import AdminGames from './pages/admin/Games';

// Team pages
import TeamDashboard from './pages/team/Dashboard';
import TeamScores from './pages/team/Scores';
import Standings from './pages/Standings';
import Scoreboard from './pages/Scoreboard';
import Matchup from './pages/Matchup';
import Settings from './pages/Settings';
import PublicScoreboard from './pages/PublicScoreboard';

// Protected route wrapper - requires authentication
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Admin-only route - redirects non-admins to /team
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuthStore();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin()) {
    return <Navigate to="/team" replace />;
  }

  return <>{children}</>;
}

// Team-only route - redirects admins to /admin
function TeamRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuthStore();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  // Admins should not be on team pages - redirect them to admin
  if (isAdmin()) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}

// Redirect based on role
function RoleRedirect() {
  const { isAuthenticated, isAdmin } = useAuthStore();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (isAdmin()) {
    return <Navigate to="/admin" replace />;
  }

  // TEAM users go to scoreboard as their home page
  return <Navigate to="/scoreboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes (no auth required) */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/live" element={<PublicScoreboard />} />
        <Route path="/live/:teamId" element={<PublicScoreboard />} />

        {/* Root redirect */}
        <Route path="/" element={<RoleRedirect />} />

        {/* Protected routes with layout */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* Admin routes - only for ADMIN users */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/teams"
            element={
              <AdminRoute>
                <AdminTeams />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/teams/:teamId"
            element={
              <AdminRoute>
                <AdminTeamDetail />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/players"
            element={
              <AdminRoute>
                <AdminPlayers />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <AdminUsers />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/ingest"
            element={
              <AdminRoute>
                <AdminIngest />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/scores"
            element={
              <AdminRoute>
                <AdminScores />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rules"
            element={
              <AdminRoute>
                <AdminRules />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/games"
            element={
              <AdminRoute>
                <AdminGames />
              </AdminRoute>
            }
          />

          {/* Team routes - only for TEAM users */}
          <Route
            path="/team"
            element={
              <TeamRoute>
                <TeamDashboard />
              </TeamRoute>
            }
          />
          <Route
            path="/team/scores"
            element={
              <TeamRoute>
                <TeamScores />
              </TeamRoute>
            }
          />
          
          {/* Standings - available to all authenticated users */}
          <Route path="/standings" element={<Standings />} />
          
          {/* Scoreboard & Matchups - available to all authenticated users */}
          <Route path="/scoreboard" element={<Scoreboard />} />
          <Route path="/matchup/:week/:teamId" element={<Matchup />} />
          
          {/* Settings - available to all authenticated users */}
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
