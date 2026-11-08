import { Link } from 'react-router-dom';
import { useBackend } from '../api';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { NAV_GROUPS } from '../lib/nav';

/** Mobile "Plus" menu: the same groups as the desktop mega-menu */
export function More() {
  const backend = useBackend();
  const qc = useQueryClient();
  return (
    <>
      <PageHeader title="Plus" />
      <div className="stack">
        {NAV_GROUPS.map((g) => (
          <section key={g.title}>
            <div className="mega-title">{g.title}</div>
            <div className="card" style={{ padding: 8 }}>
              <div className="list">
                {g.items.map(({ to, label, sub, icon: Icon }) => (
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
            </div>
          </section>
        ))}
      </div>
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
