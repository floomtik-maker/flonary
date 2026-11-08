import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { forcedDemo, setDemoMode, useBackend } from '../api';
import { IconChevron, IconMoon, IconSun, IconWallet } from './Icons';
import { resetDemo } from '../demo/demoBackend';
import { MOBILE_BAR, NAV_GROUPS, SHORT_MENU } from '../lib/nav';
import { useTheme } from '../lib/theme';

function MegaMenu({ onClose }: { onClose: () => void }) {
  const backend = useBackend();
  const qc = useQueryClient();
  return (
    <div className="mega" role="menu" id="mega-menu">
      <div className="mega-cols">
        {NAV_GROUPS.map((g) => (
          <div className="mega-col" key={g.title}>
            <div className="mega-title">{g.title}</div>
            {g.items.map(({ to, label, sub, icon: Icon }) => (
              <Link key={to} to={to} className="mega-item" role="menuitem" onClick={onClose}>
                <Icon width={18} height={18} />
                <span>
                  <span className="mega-label">{label}</span>
                  <span className="mega-sub">{sub}</span>
                </span>
              </Link>
            ))}
          </div>
        ))}
      </div>
      {backend.mode === 'live' && (
        <div className="mega-foot">
          <button
            className="btn small ghost"
            onClick={async () => {
              await backend.logout();
              qc.clear();
              window.location.reload();
            }}
          >
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { pathname, search } = useLocation();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the mega-menu on navigation, Escape, or a click outside
  useEffect(() => setOpen(false), [pathname, search]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <header className="topbar">
      <div className="topbar-inner" ref={ref}>
        <Link to="/" className="brand" aria-label="Flonary, accueil">
          <span className="brand-mark">F</span> Flonary
        </Link>
        <nav className="topnav" aria-label="Navigation principale">
          {SHORT_MENU.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {label}
            </NavLink>
          ))}
          <button className={`nav-link mega-toggle ${open ? 'active' : ''}`} aria-expanded={open} aria-controls="mega-menu" aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
            Menu <IconChevron width={14} height={14} className={open ? 'flip' : ''} />
          </button>
        </nav>
        <span className="spacer" />
        <button className="icon-btn" onClick={toggle} aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'} title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}>
          {theme === 'dark' ? <IconSun width={18} height={18} /> : <IconMoon width={18} height={18} />}
        </button>
        {open && <MegaMenu onClose={() => setOpen(false)} />}
      </div>
    </header>
  );
}

export function Layout() {
  const backend = useBackend();
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <div className="app">
      <Header />
      <main className="main">
        {backend.mode === 'demo' && (
          <div className="demo-banner">
            <span>
              <b>Démo</b> · portefeuille fictif, cours simulés
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
        {MOBILE_BAR.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon />
            {label}
          </NavLink>
        ))}
        <NavLink to="/plus" className={({ isActive }) => (isActive ? 'active' : '')}>
          <IconWallet />
          Plus
        </NavLink>
      </nav>
    </div>
  );
}
