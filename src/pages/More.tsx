import { Link } from 'react-router-dom';
import { IconPie, IconSwap, IconTrend, IconWallet } from '../components/Icons';
import { useBackend } from '../api';
import { useQueryClient } from '@tanstack/react-query';

/** Mobile "Plus" menu */
export function More() {
  const backend = useBackend();
  const qc = useQueryClient();
  const items = [
    { to: '/mouvements', label: 'Mouvements', sub: 'Achats, ventes, dividendes, import', icon: IconSwap },
    { to: '/analyse', label: 'Analyse', sub: 'Exposition et risque', icon: IconPie },
    { to: '/projection', label: 'Projection', sub: 'Simuler un investissement mensuel', icon: IconTrend },
    { to: '/comptes', label: 'Comptes & connexions', sub: 'Courtiers, import CSV, sauvegarde', icon: IconWallet },
  ];
  return (
    <>
      <div className="page-head">
        <h1>Plus</h1>
      </div>
      <section className="card" style={{ padding: 8 }}>
        <div className="list">
          {items.map(({ to, label, sub, icon: Icon }) => (
            <Link key={to} to={to} className="row" style={{ padding: 12 }}>
              <Icon width={22} height={22} />
              <div className="row-main">
                <div className="row-title">{label}</div>
                <div className="row-sub">{sub}</div>
              </div>
              <span className="muted">›</span>
            </Link>
          ))}
        </div>
      </section>
      {backend.mode === 'live' && (
        <button
          className="btn"
          style={{ marginTop: 16, width: '100%' }}
          onClick={async () => {
            await backend.logout();
            qc.clear();
            window.location.reload();
          }}
        >
          Se déconnecter
        </button>
      )}
    </>
  );
}
