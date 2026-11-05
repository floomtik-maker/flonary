/**
 * Settings stored in D1: site-wide (`app_settings`) and per user (`user_settings`).
 * The market-data key can be pasted in the app by a non-technical owner; a Worker secret
 * (EODHD_API_KEY) always takes precedence.
 */
import type { Env } from './env';
import { seal, unseal } from './crypto';
import { HttpError } from './auth';

const KEY = 'eodhd_api_key';
const LIMIT = 'eodhd_daily_limit';
const OWNER = 'eodhd_owner';
export const PAID_LIMIT = '100000';

export async function getAppSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}
export async function setAppSetting(db: D1Database, key: string, value: string | null) {
  if (value == null) await db.prepare('DELETE FROM app_settings WHERE key = ?').bind(key).run();
  else
    await db
      .prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .bind(key, value, new Date().toISOString())
      .run();
}

const memo = new WeakMap<Env, Promise<Env>>();

/**
 * Returns `env` completed with the market key/limit stored in app_settings when no secret is set.
 * Memoized per env object (i.e. loaded once per request).
 */
export function withMarketKey(env: Env): Promise<Env> {
  if (env.EODHD_API_KEY) return Promise.resolve(env);
  let p = memo.get(env);
  if (!p) {
    p = (async () => {
      try {
        const sealed = await getAppSetting(env.DB, KEY);
        if (!sealed) return env;
        const apiKey = await unseal(sealed, env.SECRETS_KEY);
        const limit = await getAppSetting(env.DB, LIMIT);
        return { ...env, EODHD_API_KEY: apiKey, EODHD_DAILY_LIMIT: limit ?? '20' };
      } catch (e) {
        console.error('market key', e);
        return env;
      }
    })();
    memo.set(env, p);
  }
  return p;
}

export interface MarketSettings {
  configured: boolean;
  source: 'env' | 'app' | null;
  plan: 'free' | 'paid';
  /** false when the key belongs to another user (or to the host): shown read-only. */
  editable: boolean;
}

/**
 * The site-wide key is owned by the user who first saved it; nobody else may replace it
 * (sign-up is open, so any visitor could otherwise swap or wipe the owner's paid key).
 * A key saved before ownership existed (owner null) is claimed by the next user who saves one.
 */
export function canEditMarketKey(ownerId: string | null, userId: string): boolean {
  return ownerId == null || ownerId === userId;
}

export async function marketSettings(env: Env, userId: string): Promise<MarketSettings> {
  const e = await withMarketKey(env);
  const source = env.EODHD_API_KEY ? 'env' : e.EODHD_API_KEY ? 'app' : null;
  const editable = source !== 'env' && (source == null || canEditMarketKey(await getAppSetting(env.DB, OWNER), userId));
  return { configured: source != null, source, plan: source && Number(e.EODHD_DAILY_LIMIT) >= 1000 ? 'paid' : 'free', editable };
}

/** Checks the key against EODHD's account endpoint (not counted in the daily call quota). */
async function validateKey(apiKey: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`https://eodhd.com/api/user?api_token=${encodeURIComponent(apiKey)}&fmt=json`);
  } catch {
    throw new HttpError(502, 'Impossible de joindre EODHD pour vérifier la clé, réessayez plus tard.');
  }
  if (res.status === 401 || res.status === 403) throw new HttpError(422, 'Clé refusée par EODHD : vérifiez qu’elle est copiée en entier.');
  if (!res.ok) throw new HttpError(502, `EODHD a répondu ${res.status}, réessayez plus tard.`);
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!j || typeof j !== 'object' || 'error' in j) throw new HttpError(422, 'Clé refusée par EODHD.');
}

export async function saveMarketSettings(env: Env, userId: string, b: Record<string, unknown>): Promise<MarketSettings> {
  if (env.EODHD_API_KEY) throw new HttpError(409, 'La clé est déjà définie par l’hébergeur (secret EODHD_API_KEY).');
  const hasKey = (await getAppSetting(env.DB, KEY)) != null;
  if (hasKey && !canEditMarketKey(await getAppSetting(env.DB, OWNER), userId))
    throw new HttpError(403, 'La clé de données de marché a été configurée par un autre utilisateur : seul lui peut la modifier.');
  const apiKey = typeof b.apiKey === 'string' ? b.apiKey.trim() : '';
  if (!/^[A-Za-z0-9._-]{4,100}$/.test(apiKey)) throw new HttpError(422, 'Clé EODHD invalide');
  await validateKey(apiKey);
  await setAppSetting(env.DB, KEY, await seal(apiKey, env.SECRETS_KEY));
  await setAppSetting(env.DB, LIMIT, b.paid === true ? PAID_LIMIT : null);
  await setAppSetting(env.DB, OWNER, userId);
  memo.delete(env);
  return marketSettings(env, userId);
}

// ---------------------------------------------------------------- per-user goal
export interface Goal {
  target: number;
  date: string;
  monthly?: number;
}

export async function getGoal(db: D1Database, userId: string): Promise<Goal | null> {
  const row = await db.prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'goal'").bind(userId).first<{ value: string }>();
  return row ? (JSON.parse(row.value) as Goal) : null;
}

export function validateGoal(b: Record<string, unknown>): Goal {
  const target = Number(b.target);
  const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : '';
  if (!(target > 0 && target < 1e12) || !date) throw new HttpError(422, 'Montant positif et date requis');
  const goal: Goal = { target, date };
  if (b.monthly != null && b.monthly !== '') {
    const m = Number(b.monthly);
    if (!(m >= 0 && m < 1e9)) throw new HttpError(422, 'Versement mensuel invalide');
    goal.monthly = m;
  }
  return goal;
}

export async function saveGoal(db: D1Database, userId: string, goal: Goal) {
  await db
    .prepare(
      "INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, 'goal', ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(userId, JSON.stringify(goal), new Date().toISOString())
    .run();
}
