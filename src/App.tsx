import { useQuery } from '@tanstack/react-query';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useBackend } from './api';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Positions } from './pages/Positions';
import { PositionDetail } from './pages/PositionDetail';
import { Transactions } from './pages/Transactions';
import { Analysis } from './pages/Analysis';
import { CalendarPage } from './pages/CalendarPage';
import { Projection } from './pages/Projection';
import { Accounts } from './pages/Accounts';
import { More } from './pages/More';
import { Login } from './pages/Login';
import { PageLoading } from './components/ui';

export function App() {
  const backend = useBackend();
  const me = useQuery({ queryKey: ['me'], queryFn: () => backend.me(), staleTime: Infinity, retry: false });
  // The single-file demo build is opened from arbitrary URLs: hash routing works everywhere.
  const Router = import.meta.env.VITE_SINGLEFILE === '1' ? HashRouter : BrowserRouter;

  if (me.isLoading)
    return (
      <div className="main">
        <PageLoading />
      </div>
    );
  if (me.error)
    return (
      <div className="center-page">
        <div className="card auth-card">
          <h2 style={{ marginTop: 0 }}>Serveur injoignable</h2>
          <p className="muted">{(me.error as Error).message}</p>
          <button className="btn" onClick={() => me.refetch()}>Réessayer</button>
        </div>
      </div>
    );
  if (!me.data) return <Login />;

  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="positions" element={<Positions />} />
          <Route path="positions/:symbol" element={<PositionDetail />} />
          <Route path="mouvements" element={<Transactions />} />
          <Route path="analyse" element={<Analysis />} />
          <Route path="calendrier" element={<CalendarPage />} />
          <Route path="projection" element={<Projection />} />
          <Route path="comptes" element={<Accounts />} />
          <Route path="plus" element={<More />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}
