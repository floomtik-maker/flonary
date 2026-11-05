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

/**
 * Per-user cap on symbols fetched for the first time today (a first fetch is the expensive
 * part: full history + corporate actions). Without it, one account of the open sign-up could
 * spend the whole site's budget by requesting made-up tickers. Half the daily budget, min 5.
 */
export const newSymbolCap = (env: Env) => Math.max(5, Math.floor(dailyLimit(env) / 2));

/** Counts one new symbol for `userId` today, or throws when the user's cap is reached. */
export async function spendNewSymbol(env: Env, userId: string): Promise<void> {
  const k = `ucap:${new Date().toISOString().slice(0, 10)}:${userId}`;
  await env.DB.prepare("INSERT INTO market_cache (key, value, fetched_at) VALUES (?, '0', ?) ON CONFLICT(key) DO NOTHING").bind(k, Date.now()).run();
  const row = await env.DB.prepare(
    'UPDATE market_cache SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = ? AND CAST(value AS INTEGER) + 1 <= ? RETURNING value',
  )
    .bind(k, newSymbolCap(env))
    .first<{ value: string }>();
  if (!row) throw new ProviderError('Trop de nouveaux titres demandés aujourd’hui : réessayez demain.', 429);
}
