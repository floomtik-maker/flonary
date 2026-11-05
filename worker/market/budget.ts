/**
 * Daily API-call budget shared by all users of this site (stored in D1).
 * EODHD free plan = 20 calls/day; paid plans = 100 000. Set EODHD_DAILY_LIMIT accordingly.
 */
import type { Env } from '../env';
import { ProviderError } from './types';

export const dailyLimit = (env: Env) => {
  const n = Number(env.EODHD_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 20;
};

const key = () => `budget:${new Date().toISOString().slice(0, 10)}`;

/** Reserves `n` calls or throws when today's budget is spent. */
export async function spend(env: Env, n: number): Promise<void> {
  const k = key();
  await env.DB.prepare("INSERT INTO market_cache (key, value, fetched_at) VALUES (?, '0', ?) ON CONFLICT(key) DO NOTHING").bind(k, Date.now()).run();
  const row = await env.DB.prepare(
    'UPDATE market_cache SET value = CAST(CAST(value AS INTEGER) + ? AS TEXT) WHERE key = ? AND CAST(value AS INTEGER) + ? <= ? RETURNING value',
  )
    .bind(n, k, n, dailyLimit(env))
    .first<{ value: string }>();
  if (!row) throw new ProviderError("Quota d'appels du jour atteint : les cours seront mis à jour demain.", 503);
}

export async function usedToday(env: Env): Promise<number> {
  const row = await env.DB.prepare('SELECT value FROM market_cache WHERE key = ?').bind(key()).first<{ value: string }>();
  return Number(row?.value ?? 0);
}
