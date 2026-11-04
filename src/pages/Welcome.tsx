import { Link } from 'react-router-dom';
import { setDemoMode, useBackend } from '../api';

export function Welcome() {
  const backend = useBackend();
  return (
    <section className="card" style={{ maxWidth: 640, margin: '40px auto', textAlign: 'center', padding: 32 }}>
      <div className="brand-mark" style={{ width: 48, height: 48, margin: '0 auto 16px', fontSize: 22 }}>F</div>
      <h1 style={{ margin: '0 0 8px', letterSpacing: '-0.02em' }}>Bienvenue sur Flonary</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Regroupez tous vos comptes (Interactive Brokers, Trade Republic, PEE…) et suivez une performance qui garde vos plus-values réalisées.
      </p>
      <div className="toolbar" style={{ justifyContent: 'center', marginTop: 20 }}>
        <Link className="btn primary" to="/comptes">
          1. Créer mes comptes
        </Link>
        <Link className="btn" to="/mouvements?new=1">
          2. Ajouter une opération
        </Link>
        <Link className="btn" to="/comptes?import=1">
          Importer un CSV
        </Link>
      </div>
      {backend.mode === 'live' && (
        <p className="small" style={{ marginTop: 24 }}>
          Envie de voir à quoi ça ressemble ?{' '}
          <button
            className="btn small ghost"
            style={{ color: 'var(--accent)' }}
            onClick={() => {
              setDemoMode(true);
              window.location.reload();
            }}
          >
            Explorer le portefeuille de démo
          </button>
        </p>
      )}
    </section>
  );
}
