import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { setDemoMode, useBackend } from '../api';

export function Login() {
  const backend = useBackend();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Error coming back from the Google sign-in redirect
  const [error, setError] = useState<string | null>(() => new URLSearchParams(window.location.search).get('login_error'));
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await (await fetch('/api/health')).json()) as { google?: boolean; signup?: boolean },
    enabled: backend.mode === 'live',
    staleTime: 5 * 60_000,
  });
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
        {health.data?.google && (
          <>
            <a className="btn" href="/api/auth/google" style={{ width: '100%', marginBottom: 12 }}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continuer avec Google
            </a>
            <div className="hint" style={{ textAlign: 'center', marginBottom: 12 }}>ou avec un e-mail</div>
          </>
        )}
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
