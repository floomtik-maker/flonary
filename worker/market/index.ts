/**
 * Market data service: EODHD behind a D1 cache and a daily call budget, OpenFIGI for ISINs,
 * ECB (Frankfurter) for FX. Designed to work within EODHD's free plan (20 calls/day):
 * - price history is fetched once, then extended by 1 call per ticker per trading day,
 * - dividends + splits are refreshed weekly,
 * - live quotes are only used when the daily limit is large (paid plan),
 * - a nightly cron (worker/index.ts) refreshes the tickers held by the users.
 */
import type { Env } from '../env';
import type { InstrumentProfile, Point, PriceHistory, Quote, SearchResult } from '../../shared/types';
import { addDays, toISODate } from '../../shared/series';
import { guessCountry } from '../../shared/geo';
import { eodhd } from './eodhd';
import { fxSeries } from './fx';
import { cached } from './cache';
import { dailyLimit, spend } from './budget';
import { isIsin, searchIsin } from './openfigi';
import { ProviderError, type MarketProvider } from './types';

const H = 60 * 60_000;
const CORP_REFRESH_DAYS = 7;

export function provider(env: Env): MarketProvider | null {
  if (!env.EODHD_API_KEY) return null;
  return eodhd(env.EODHD_API_KEY, (n) => spend(env, n), { fundamentals: env.EODHD_FUNDAMENTALS === 'true' });
}

function requireProvider(env: Env): MarketProvider {
  const p = provider(env);
  if (!p) throw new ProviderError('Aucune source de cours configurée : ajoutez une clé EODHD dans Comptes › Source des cours.', 503);
  return p;
}

/** Live (delayed) quotes cost 1 call each: only worth it on a paid plan. */
export const quotesEnabled = (env: Env) => dailyLimit(env) >= 1000;

/** Last weekday strictly before `iso`. */
export function previousBusinessDay(iso: string): string {
  let d = addDays(iso, -1);
  while ([0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay())) d = addDays(d, -1);
  return d;
}

/** Merges new points into a sorted series (new values win on the same date). */
export function mergePoints(a: Point[], b: Point[]): Point[] {
  const m = new Map<string, number>(a);
  for (const [d, v] of b) m.set(d, v);
  return [...m.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1));
}

interface CachedHistory extends PriceHistory {
  from: string;
  /** UTC day of the last price fetch */
  fetchedOn: string;
  /** UTC day of the last dividends/splits fetch */
  corpOn: string;
}

/**
 * Should we call the provider again for this cached history?
 * Closes are published in the evening: during the day, yesterday's close is up to date.
 */
export function needsPriceRefresh(c: CachedHistory, today: string, utcHour: number): boolean {
  if (c.fetchedOn === today) return false;
  const last = c.points.at(-1)?.[0] ?? '';
  const weekday = ![0, 6].includes(new Date(today + 'T00:00:00Z').getUTCDay());
  const expected = weekday && utcHour >= 22 ? today : previousBusinessDay(today);
  return last < expected;
}

async function readCache<T>(db: D1Database, key: string): Promise<T | null> {
  const row = await db.prepare('SELECT value FROM market_cache WHERE key = ?').bind(key).first<{ value: string }>();
  return row ? (JSON.parse(row.value) as T) : null;
}
async function writeCache(db: D1Database, key: string, value: unknown) {
  await db
    .prepare('INSERT INTO market_cache (key, value, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at')
    .bind(key, JSON.stringify(value), Date.now())
    .run();
}

const histKey = (symbol: string) => `hist:v2:${symbol}`;

/** Returns the (possibly refreshed) history for one symbol. Falls back to the cache on any error. */
export async function history(env: Env, symbol: string, from: string, now = new Date()): Promise<PriceHistory> {
  const today = toISODate(now);
  const c = await readCache<CachedHistory>(env.DB, histKey(symbol));
  const full = !c || c.from > from;
  if (c && !full && !needsPriceRefresh(c, today, now.getUTCHours())) return c;
  const p = requireProvider(env);
  try {
    let next: CachedHistory;
    if (full) {
      const eod = await p.eod(symbol, from);
      if (eod.points.length === 0 && !c) throw new ProviderError(`Aucun cours trouvé pour ${symbol} (ticker inconnu ?)`, 404);
      next = { symbol, currency: eod.currency, points: mergePoints(c?.points ?? [], eod.points), dividends: c?.dividends ?? [], splits: c?.splits ?? [], from, fetchedOn: today, corpOn: c?.corpOn ?? '' };
    } else {
      const lastDate = c!.points.at(-1)?.[0] ?? from;
      const eod = await p.eod(symbol, addDays(lastDate, 1));
      next = { ...c!, points: mergePoints(c!.points, eod.points), fetchedOn: today };
    }
    await writeCache(env.DB, histKey(symbol), next);
    // Dividends and splits change rarely: weekly refresh, best effort (never blocks prices).
    if (!next.corpOn || next.corpOn < addDays(today, -CORP_REFRESH_DAYS)) {
      try {
        const [dividends, splits] = [await p.dividends(symbol, next.from), await p.splits(symbol)];
        next = { ...next, dividends, splits, corpOn: today };
        await writeCache(env.DB, histKey(symbol), next);
      } catch {
        /* keep previous dividends/splits */
      }
    }
    return next;
  } catch (e) {
    if (c) return c;
    throw e;
  }
}

const cleanSymbols = (s: string | null) =>
  [...new Set((s ?? '').split(',').map((x) => x.trim()).filter((x) => x && !x.startsWith('manual:') && /^[A-Za-z0-9.\-^=_/]{1,24}$/.test(x)))].slice(0, 80);

export async function getHistories(env: Env, symbolsParam: string | null, from: string): Promise<{ data: Record<string, PriceHistory>; errors: Record<string, string> }> {
  const data: Record<string, PriceHistory> = {};
  const errors: Record<string, string> = {};
  // Sequential on purpose: keeps the call budget predictable and providers happy.
  for (const symbol of cleanSymbols(symbolsParam)) {
    try {
      data[symbol] = await history(env, symbol, from);
    } catch (e) {
      errors[symbol] = (e as Error).message;
    }
  }
  return { data, errors };
}

export async function getQuotes(env: Env, symbolsParam: string | null): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  const p = provider(env);
  if (!p || !quotesEnabled(env)) return out; // the UI uses the last close
  for (const symbol of cleanSymbols(symbolsParam)) {
    try {
      out[symbol] = await cached(env.DB, `quote:v1:${symbol}`, 15 * 60_000, () => p.quote(symbol));
    } catch {
      /* fall back to last close */
    }
  }
  return out;
}

export async function getFx(env: Env, currenciesParam: string | null, from: string): Promise<Record<string, Point[]>> {
  const currencies = [...new Set((currenciesParam ?? '').split(',').map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c) && c !== 'EUR'))].slice(0, 12);
  const today = toISODate(new Date());
  const start = from < '1999-01-04' ? '1999-01-04' : from;
  const out: Record<string, Point[]> = {};
  await Promise.all(
    currencies.map(async (c) => {
      const v = await cached(env.DB, `fx:v1:${c}`, 12 * H, async () => ({ from: start, points: await fxSeries(c, start, today) }), (v) => v.from <= start);
      out[c] = v.points;
    }),
  );
  return out;
}

export async function search(env: Env, q: string): Promise<SearchResult[]> {
  const query = q.trim().slice(0, 40);
  if (query.length < 2) return [];
  // ISINs are resolved for free through OpenFIGI
  if (isIsin(query)) {
    const isin = query.toUpperCase();
    return cached(env.DB, `isin:v1:${isin}`, 30 * 24 * H, () => searchIsin(isin));
  }
  const p = requireProvider(env);
  try {
    return await cached(env.DB, `search:v1:${query.toLowerCase()}`, 24 * 7 * H, () => p.search(query));
  } catch (e) {
    if (e instanceof ProviderError && e.status === 503)
      throw new ProviderError("Recherche indisponible (quota du jour atteint). Tapez directement le ticker, par ex. MC.PA ou AAPL, ou un code ISIN.", 503);
    throw e;
  }
}

/** Country, sector and upcoming events. Uses no API call unless EODHD_FUNDAMENTALS is on. */
export async function profile(env: Env, symbol: string): Promise<InstrumentProfile> {
  const today = toISODate(new Date());
  const p = provider(env);
  const fund = p?.profile ? await cached(env.DB, `profile:v2:${symbol}`, 24 * 7 * H, () => p.profile!(symbol, today)).catch(() => null) : null;
  const hist = await readCache<CachedHistory>(env.DB, histKey(symbol));
  const isEtf = /etf|fund/i.test(fund?.type ?? '');
  return {
    symbol,
    name: fund?.name,
    country: fund?.country ?? guessCountry(symbol, fund?.name ?? '', isEtf),
    sector: fund?.sector ?? (isEtf ? 'ETF' : null),
    asset_class: isEtf ? 'etf' : undefined,
    events: [
      ...(fund?.earnings ?? []).map((date) => ({ symbol, date, kind: 'earnings' as const })),
      // EODHD lists already-declared future dividends in the dividends feed
      ...(hist?.dividends ?? []).filter(([d]) => d >= today).map(([date, amount]) => ({ symbol, date, kind: 'ex_dividend' as const, amount, currency: hist?.currency })),
    ],
  };
}

/** Nightly job: refresh every ticker held by any user, stalest first, within the budget. */
export async function refreshAll(env: Env): Promise<{ refreshed: number; failed: number }> {
  if (!provider(env)) return { refreshed: 0, failed: 0 };
  const rows = await env.DB.prepare(
    "SELECT symbol, MIN(date) AS first FROM transactions WHERE symbol IS NOT NULL AND symbol NOT LIKE 'manual:%' GROUP BY symbol",
  ).all<{ symbol: string; first: string }>();
  const items = await Promise.all(
    rows.results.map(async (r) => ({ ...r, last: (await readCache<CachedHistory>(env.DB, histKey(r.symbol)))?.fetchedOn ?? '' })),
  );
  items.sort((a, b) => (a.last < b.last ? -1 : 1));
  let refreshed = 0;
  let failed = 0;
  for (const it of items) {
    try {
      await history(env, it.symbol, addDays(it.first, -400));
      refreshed++;
    } catch {
      failed++;
    }
  }
  return { refreshed, failed };
}
