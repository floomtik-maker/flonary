import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setDemoMode, useBackend } from '../api';

export function Login() {
  const backend = useBackend();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await backend.login(email, password);
      else await backend.register(email, password);
      await qc.invalidateQueries();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-page">
      <div className="card auth-card">
        <div className="brand" style={{ padding: '0 0 12px' }}>
          <div className="brand-mark">F</div> Flonary
        </div>
        <h2 style={{ margin: '0 0 4px' }}>{mode === 'login' ? 'Connexion' : 'Créer un compte'}</h2>
        <p className="muted small" style={{ marginTop: 0 }}>Tous vos investissements, une seule vue.</p>
        <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
          <label className="field">
            E-mail
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            Mot de passe
            <input
              className="input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 10 : undefined}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'register' && <span className="hint">10 caractères minimum.</span>}
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn primary" disabled={busy}>
            {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>
        <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: 14 }}>
          <button className="btn ghost small" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Créer un compte' : "J'ai déjà un compte"}
          </button>
          <button
            className="btn ghost small"
            style={{ color: 'var(--accent)' }}
            onClick={() => {
              setDemoMode(true);
              window.location.reload();
            }}
          >
            Voir la démo
          </button>
        </div>
      </div>
    </div>
  );
}
