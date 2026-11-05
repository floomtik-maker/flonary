/**
 * "Sign in with Google" (OpenID Connect, authorization code flow). Optional: enabled when
 * GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. Setup steps: docs/MISE-EN-LIGNE.md.
 */
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { assertSignupAllowed, createSession, HttpError, type AppEnv } from './auth';
import { randomToken, uuid } from './crypto';

const STATE_COOKIE = 'flonary_oauth_state';

export const googleEnabled = (c: Context<AppEnv>) => !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET);

const redirectUri = (c: Context<AppEnv>) => `${new URL(c.req.url).origin}/api/auth/google/callback`;

export function googleStart(c: Context<AppEnv>) {
  if (!googleEnabled(c)) throw new HttpError(404, 'Connexion Google non configurée');
  const state = randomToken(16);
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/api/auth/google',
    maxAge: 600,
  });
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(c),
    response_type: 'code',
    scope: 'openid email',
    state,
    prompt: 'select_account',
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1] ?? '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))));
}

export async function googleCallback(c: Context<AppEnv>) {
  const fail = (msg: string) => c.redirect(`/?login_error=${encodeURIComponent(msg)}`);
  if (!googleEnabled(c)) return fail('Connexion Google non configurée');
  const state = c.req.query('state');
  const expected = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: '/api/auth/google' });
  if (!state || !expected || state !== expected) return fail('Session de connexion expirée, réessayez.');
  const code = c.req.query('code');
  if (!code) return fail('Connexion Google annulée.');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(c),
      grant_type: 'authorization_code',
    }),
  });
  const tok = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !tok.id_token) return fail(`Google a refusé la connexion (${tok.error ?? res.status}).`);
  // The ID token comes straight from Google's token endpoint over TLS, authenticated with our
  // client secret: per OpenID Connect Core §3.1.3.7 its signature check may be skipped.
  const claims = decodeJwtPayload(tok.id_token);
  const iss = String(claims.iss ?? '');
  if (claims.aud !== c.env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(iss))
    return fail('Réponse Google invalide.');
  const email = String(claims.email ?? '').toLowerCase();
  if (!email || claims.email_verified !== true) return fail('Adresse e-mail Google non vérifiée.');

  let user = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?').bind(email).first<{ id: string; password_hash: string }>();
  if (user && user.password_hash !== 'google') {
    // Sign-up by password never verifies the e-mail: someone may have pre-registered this
    // address to spy on its future owner. Google proves ownership, so the password (unknown
    // to the real owner, or not) is revoked along with every open session.
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE users SET password_hash = 'google', password_salt = '', password_iterations = 0 WHERE id = ?").bind(user.id),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    ]);
  }
  if (!user) {
    try {
      assertSignupAllowed(c.env, email);
    } catch (e) {
      return fail((e as Error).message);
    }
    const id = uuid();
    // No password: this account signs in with Google only.
    await c.env.DB.prepare('INSERT INTO users (id, email, password_hash, password_salt, password_iterations) VALUES (?, ?, ?, ?, ?)')
      .bind(id, email, 'google', '', 0)
      .run();
    user = { id, password_hash: 'google' };
  }
  await createSession(c, user.id);
  return c.redirect('/');
}
