import type { Env } from '../env';
import type { InstrumentProfile, Point, PriceHistory, Quote, SearchResult } from '../../shared/types';
import { addDays, toISODate } from '../../shared/series';
import { guessCountry } from '../../shared/geo';
import { eodhd } from './eodhd';
import { twelveData } from './twelvedata';
import { fxSeries } from './fx';
import { cached } from './cache';
import { ProviderError, type MarketProvider } from './types';

const H = 60 * 60_000;

export function providers(env: Env): MarketProvider[] {
  const list: MarketProvider[] = [];
  if (env.EODHD_API_KEY) list.push(eodhd(env.EODHD_API_KEY, { fundamentals: env.EODHD_FUNDAMENTALS === 'true' }));
  if (env.TWELVEDATA_API_KEY) list.push(twelveData(env.TWELVEDATA_API_KEY));
  return list;
}

/** Tries each configured provider in order. */
async function firstOk<T>(env: Env, fn: (p: MarketProvider) => Promise<T>): Promise<T> {
  const list = providers(env);
  if (list.length === 0)
    throw new ProviderError('Aucune source de cours configurée (EODHD_API_KEY ou TWELVEDATA_API_KEY). Voir README.', 503);
  let last: unknown;
  for (const p of list) {
    try {
      return await fn(p);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** Run with limited concurrency (providers rate-limit). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const cleanSymbols = (s: string | null) =>
  [...new Set((s ?? '').split(',').map((x) => x.trim()).filter((x) => x && !x.startsWith('manual:') && /^[A-Za-z0-9.\-^=_/]{1,24}$/.test(x)))].slice(0, 60);

export async function getHistories(env: Env, symbolsParam: string | null, from: string): Promise<{ data: Record<string, PriceHistory>; errors: Record<string, string> }> {
  const symbols = cleanSymbols(symbolsParam);
  const data: Record<string, PriceHistory> = {};
  const errors: Record<string, string> = {};
  const today = toISODate(new Date());
  await mapLimit(symbols, 4, async (symbol) => {
    try {
      data[symbol] = await cached(
        env.DB,
        `hist:v1:${symbol}`,
        6 * H,
        async () => {
          const h = await firstOk(env, (p) => p.history(symbol, from));
          return { ...h, from } as PriceHistory & { from: string };
        },
        // refetch when the cache does not go back far enough or is from a previous day
        (v) => (v as PriceHistory & { from: string }).from <= from && (v.points.at(-1)?.[0] ?? '') >= addDays(today, -4),
      );
    } catch (e) {
      errors[symbol] = (e as Error).message;
    }
  });
  return { data, errors };
}

export async function getQuotes(env: Env, symbolsParam: string | null): Promise<Record<string, Quote>> {
  const symbols = cleanSymbols(symbolsParam);
  const out: Record<string, Quote> = {};
  await mapLimit(symbols, 4, async (symbol) => {
    try {
      out[symbol] = await cached(env.DB, `quote:v1:${symbol}`, 15 * 60_000, () => firstOk(env, (p) => p.quote(symbol)));
    } catch {
      /* the UI falls back to the last close */
    }
  });
  return out;
}

export async function getFx(env: Env, currenciesParam: string | null, from: string): Promise<Record<string, Point[]>> {
  const currencies = [...new Set((currenciesParam ?? '').split(',').map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c) && c !== 'EUR'))].slice(0, 12);
  const today = toISODate(new Date());
  const start = from < '1999-01-04' ? '1999-01-04' : from;
  const out: Record<string, Point[]> = {};
  await Promise.all(
    currencies.map(async (c) => {
      const v = await cached(
        env.DB,
        `fx:v1:${c}`,
        12 * H,
        async () => ({ from: start, points: await fxSeries(c, start, today) }),
        (v) => v.from <= start,
      );
      out[c] = v.points;
    }),
  );
  return out;
}

export async function search(env: Env, q: string): Promise<SearchResult[]> {
  const query = q.trim().slice(0, 40);
  if (query.length < 2) return [];
  return cached(env.DB, `search:v1:${query.toLowerCase()}`, 24 * 7 * H, () => firstOk(env, (p) => p.search(query)));
}

export async function profile(env: Env, symbol: string): Promise<InstrumentProfile> {
  const today = toISODate(new Date());
  const p = await cached(env.DB, `profile:v1:${symbol}`, 24 * H, () => firstOk(env, (p) => p.profile(symbol, today))).catch(() => null);
  const isEtf = /etf|fund/i.test(p?.type ?? '');
  return {
    symbol,
    name: p?.name,
    country: p?.country ?? guessCountry(symbol, p?.name ?? '', isEtf),
    sector: p?.sector ?? (isEtf ? 'ETF' : null),
    asset_class: isEtf ? 'etf' : undefined,
    events: (p?.events ?? []).filter((e) => e.date >= today),
  };
}
