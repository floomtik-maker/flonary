import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { forcedDemo, setDemoMode, useBackend } from '../api';
import { IconCalendar, IconHome, IconList, IconPie, IconSwap, IconTrend, IconWallet } from './Icons';
import { resetDemo } from '../demo/demoBackend';

const NAV = [
  { to: '/', label: 'Synthèse', icon: IconHome, end: true },
  { to: '/positions', label: 'Positions', icon: IconList },
  { to: '/mouvements', label: 'Mouvements', icon: IconSwap },
  { to: '/analyse', label: 'Analyse', icon: IconPie },
  { to: '/calendrier', label: 'Calendrier', icon: IconCalendar },
  { to: '/projection', label: 'Projection', icon: IconTrend },
  { to: '/comptes', label: 'Comptes', icon: IconWallet },
];
const MOBILE = ['/', '/positions', '/analyse', '/calendrier', '/plus'];

export function Layout() {
  const backend = useBackend();
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">F</div> Flonary
        </div>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Icon /> {label}
          </NavLink>
        ))}
        <div className="sidebar-footer">{backend.mode === 'demo' ? 'Mode démo' : ''}</div>
      </aside>
      <main className="main">
        {backend.mode === 'demo' && (
          <div className="demo-banner">
            <span>
              <b>Mode démo</b> — portefeuille fictif et cours simulés. Vos modifications restent dans ce navigateur.
            </span>
            <span className="toolbar">
              <button
                className="btn small ghost"
                onClick={() => {
                  resetDemo();
                  qc.invalidateQueries();
                }}
              >
                Réinitialiser
              </button>
              {!forcedDemo && (
                <button
                  className="btn small"
                  onClick={() => {
                    setDemoMode(false);
                    navigate('/');
                    window.location.reload();
                  }}
                >
                  Quitter la démo
                </button>
              )}
            </span>
          </div>
        )}
        <Outlet />
      </main>
      <nav className="bottom-nav">
        {MOBILE.map((to) => {
          const item = NAV.find((n) => n.to === to);
          const Icon = item?.icon ?? IconWallet;
          return (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon />
              {item?.label ?? 'Plus'}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
