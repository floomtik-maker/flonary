import { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useBackend } from './api';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { PageLoading } from './components/ui';

// Route-level code splitting: only the dashboard (landing page) and login ship in the main bundle.
const Positions = lazy(() => import('./pages/Positions').then((m) => ({ default: m.Positions })));
const PositionDetail = lazy(() => import('./pages/PositionDetail').then((m) => ({ default: m.PositionDetail })));
const Transactions = lazy(() => import('./pages/Transactions').then((m) => ({ default: m.Transactions })));
const Analysis = lazy(() => import('./pages/Analysis').then((m) => ({ default: m.Analysis })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const Projection = lazy(() => import('./pages/Projection').then((m) => ({ default: m.Projection })));
const Accounts = lazy(() => import('./pages/Accounts').then((m) => ({ default: m.Accounts })));
const More = lazy(() => import('./pages/More').then((m) => ({ default: m.More })));

const page = (el: React.ReactNode) => <Suspense fallback={<PageLoading />}>{el}</Suspense>;

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
          <Route path="positions" element={page(<Positions />)} />
          <Route path="positions/:symbol" element={page(<PositionDetail />)} />
          <Route path="mouvements" element={page(<Transactions />)} />
          <Route path="analyse" element={page(<Analysis />)} />
          <Route path="calendrier" element={page(<CalendarPage />)} />
          <Route path="projection" element={page(<Projection />)} />
          <Route path="comptes" element={page(<Accounts />)} />
          <Route path="plus" element={page(<More />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}
