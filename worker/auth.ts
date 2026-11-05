import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from './env';
import { b64, hashPassword, PBKDF2_ITERATIONS, randomToken, sha256, timingSafeEqual, unb64, uuid } from './crypto';

export const COOKIE = 'flonary_session';
const SESSION_DAYS = 30;

export type AppEnv = { Bindings: Env; Variables: { userId: string } };

export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503,
    message: string,
  ) {
    super(message);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials(email: unknown, password: unknown, isRegister: boolean): { email: string; password: string } {
  if (typeof email !== 'string' || typeof password !== 'string') throw new HttpError(400, 'E-mail et mot de passe requis');
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 200) throw new HttpError(400, 'Adresse e-mail invalide');
  if (isRegister && password.length < 10) throw new HttpError(400, 'Le mot de passe doit contenir au moins 10 caractères');
  if (password.length > 200) throw new HttpError(400, 'Mot de passe trop long');
  return { email: e, password };
}

/**
 * Anyone can create an account (each user only sees their own data), unless:
 * - ALLOW_SIGNUP = "false" → registrations closed,
 * - ALLOWED_EMAILS = "a@x.com,b@y.com" → only these addresses.
 */
export function assertSignupAllowed(env: Env, email: string) {
  if (env.ALLOW_SIGNUP === 'false') throw new HttpError(403, 'Les inscriptions sont fermées sur ce site.');
  const allowed = (env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(email)) throw new HttpError(403, "Cette adresse e-mail n'est pas autorisée sur ce site.");
}

export async function createSession(c: Context<AppEnv>, userId: string) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), userId, expires.toISOString()).run();
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    expires,
  });
}

export async function register(c: Context<AppEnv>, emailIn: unknown, passwordIn: unknown) {
  const { email, password } = validateCredentials(emailIn, passwordIn, true);
  assertSignupAllowed(c.env, email);
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (exists) throw new HttpError(409, 'Un compte existe déjà avec cet e-mail');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const id = uuid();
  await c.env.DB.prepare('INSERT INTO users (id, email, password_hash, password_salt, password_iterations) VALUES (?, ?, ?, ?, ?)')
    .bind(id, email, await hashPassword(password, salt), b64(salt), PBKDF2_ITERATIONS)
    .run();
  await createSession(c, id);
  return { id, email };
}

export async function login(c: Context<AppEnv>, emailIn: unknown, passwordIn: unknown) {
  const { email, password } = validateCredentials(emailIn, passwordIn, false);
  const u = await c.env.DB.prepare('SELECT id, email, password_hash, password_salt, password_iterations FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; email: string; password_hash: string; password_salt: string; password_iterations: number }>();
  // Always run PBKDF2 so response time does not reveal whether the account exists.
  const googleOnly = u?.password_hash === 'google';
  const salt = u && !googleOnly ? unb64(u.password_salt) : new Uint8Array(16);
  const hash = await hashPassword(password, salt, u && !googleOnly ? u.password_iterations : PBKDF2_ITERATIONS);
  if (googleOnly) throw new HttpError(401, 'Ce compte se connecte avec Google : utilisez « Continuer avec Google ».');
  if (!u || !timingSafeEqual(hash, u.password_hash)) throw new HttpError(401, 'E-mail ou mot de passe incorrect');
  await createSession(c, u.id);
  // Opportunistic cleanup of expired sessions
  await c.env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(new Date().toISOString()).run();
  return { id: u.id, email: u.email };
}

export async function logout(c: Context<AppEnv>) {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function currentUser(c: Context<AppEnv>): Promise<{ id: string; email: string } | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const row = await c.env.DB.prepare(
    'SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?',
  )
    .bind(await sha256(token), new Date().toISOString())
    .first<{ id: string; email: string }>();
  return row ?? null;
}

/** Requires a valid session; sets c.var.userId. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const u = await currentUser(c);
  if (!u) throw new HttpError(401, 'Non connecté');
  c.set('userId', u.id);
  await next();
};

/** CSRF defence for cookie auth: state-changing requests must come from our own origin. */
export const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    const host = new URL(c.req.url).host;
    if (origin && new URL(origin).host !== host) throw new HttpError(403, 'Origine refusée');
    if (!origin && c.req.header('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Origine refusée');
  }
  await next();
};
