/**
 * Massive (formerly Polygon.io, https://massive.com) — official API, US stocks only.
 * Free "Stocks Basic" plan: 5 calls/min, end-of-day data, ~2 years of history, personal use.
 *
 * How to wire (done by the coordinator in worker/market/index.ts, not here):
 *  - New secret `MASSIVE_API_KEY` (optional). When set, `provider()` routes symbols for which
 *    `isUsTicker(symbol)` is true (AAPL, BRK-B…) to `massive(env.MASSIVE_API_KEY, throttle)`,
 *    and every other symbol (MC.PA, SAP.DE, BTC-USD…) to EODHD as today.
 *  - Massive calls do NOT go through `spend()`: they never consume the EODHD daily budget.
 *    The 5 calls/min limit is handled by `throttle` (e.g. a per-isolate queue spacing calls
 *    12 s apart, or a D1/KV counter per minute); HTTP 429 surfaces as a ProviderError (503).
 *  - Nightly cron: one call to /v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=false
 *    (`groupedDailyCloses` / `groupedDailyToCloses`) gives the close of ALL US tickers for that
 *    day → append to each cached US history instead of one call per ticker.
 *  - Search: merge `massive.search` (US) with EODHD search, or keep EODHD only to save calls.
 *
 * Verified against the official docs (massive.com/docs/rest/stocks/…, fetched 2026-11-05):
 *  - Base URL https://api.massive.com, auth with the `apiKey` query parameter.
 *  - Custom bars: GET /v2/aggs/ticker/{stocksTicker}/range/{multiplier}/{timespan}/{from}/{to}
 *    ?adjusted&sort&limit → { results: [{ c, t (ms epoch, start of window), o, h, l, v }], next_url }.
 *  - Previous day bar: GET /v2/aggs/ticker/{stocksTicker}/prev?adjusted → { results: [{ T, c, o, t… }] }.
 *  - Daily market summary: GET /v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted
 *    → { results: [{ T, c, t… }] }.
 *  - Dividends: GET /stocks/v1/dividends?ticker=&ex_dividend_date.gte=&limit=&sort=
 *    → { results: [{ ticker, ex_dividend_date, cash_amount (original amount per share),
 *    split_adjusted_cash_amount, currency… }], next_url }. We use the RAW `cash_amount`.
 *    (Replaces the legacy /v3/reference/dividends.)
 *  - Splits: GET /stocks/v1/splits?ticker=&limit=&sort=execution_date.asc
 *    → { results: [{ ticker, execution_date, split_from (old), split_to (new), adjustment_type }] }.
 *    (Replaces the legacy /v3/reference/splits.)
 *  - Tickers: GET /v3/reference/tickers?search=&market=stocks&active=true&limit=
 *    → { results: [{ ticker, name, market, primary_exchange, type, currency_name }] }.
 *  Share-class tickers use a dot at Massive (BRK.B) where the app uses a dash (BRK-B).
 */
import type { Point, Quote, SearchResult } from '../../shared/types';
import { getJson, ProviderError, type MarketProvider } from './types';

const BASE = 'https://api.massive.com';

/**
 * True for internal (Yahoo-style) symbols that are US listings: no exchange suffix,
 * optional share class (BRK-B), not crypto (BTC-USD) nor a manual fund (manual:xxx).
 */
export function isUsTicker(symbol: string): boolean {
  return /^[A-Z][A-Z0-9]{0,5}(-[A-Z])?$/.test(symbol);
}

/** Internal → Massive ticker (BRK-B → BRK.B) */
export function toMassive(symbol: string): string {
  return symbol.replace('-', '.');
}

/** Massive → internal ticker (BRK.B → BRK-B) */
export function fromMassive(ticker: string): string {
  return ticker.replace('.', '-');
}

/** Massive bar timestamp (ms, start of the day in New York) → YYYY-MM-DD */
function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

interface Bar {
  T?: string;
  c: number;
  t: number;
}
interface AggsResponse {
  results?: Bar[];
  resultsCount?: number;
  status?: string;
  next_url?: string;
}

/**
 * Pure: response of /v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=false
 * → { [internal symbol]: close }.
 */
export function groupedDailyToCloses(json: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const results = (json as AggsResponse | null)?.results;
  if (!Array.isArray(results)) return out;
  for (const r of results) {
    if (typeof r?.T === 'string' && typeof r.c === 'number' && Number.isFinite(r.c)) out[fromMassive(r.T)] = r.c;
  }
  return out;
}

export interface MassiveProvider extends MarketProvider {
  /** One call: raw closes of every US stock for `date` (empty on holidays/weekends). */
  groupedDailyCloses(date: string): Promise<Record<string, number>>;
}

/**
 * @param throttle awaited before every HTTP call (free plan: 5 calls/min)
 */
export function massive(apiKey: string, throttle: () => Promise<void> = async () => {}): MassiveProvider {
  const get = async <T>(path: string, params: Record<string, string>, label: string): Promise<T> => {
    await throttle();
    const url = `${BASE}${path}?${new URLSearchParams({ ...params, apiKey })}`;
    try {
      return await getJson<T>(url, label);
    } catch (e) {
      if (e instanceof ProviderError && /HTTP 429/.test(e.message)) throw new ProviderError(`${label} : trop d'appels, réessayez dans une minute`, 503);
      throw e;
    }
  };
  const today = () => new Date().toISOString().slice(0, 10);

  return {
    name: 'Massive',
    async eod(symbol, from) {
      const t = encodeURIComponent(toMassive(symbol));
      const res = await get<AggsResponse>(
        `/v2/aggs/ticker/${t}/range/1/day/${from}/${today()}`,
        { adjusted: 'false', sort: 'asc', limit: '50000' },
        'Massive cours',
      );
      const points = (res.results ?? []).filter((b) => typeof b.c === 'number').map((b): Point => [isoDay(b.t), b.c]);
      return { currency: 'USD', points };
    },
    async dividends(symbol, from) {
      const res = await get<{ results?: { ex_dividend_date: string; cash_amount: number }[] }>(
        '/stocks/v1/dividends',
        { ticker: toMassive(symbol), 'ex_dividend_date.gte': from, sort: 'ex_dividend_date.asc', limit: '1000' },
        'Massive dividendes',
      );
      return (res.results ?? [])
        .filter((d) => d.ex_dividend_date && typeof d.cash_amount === 'number')
        .map((d): Point => [d.ex_dividend_date, d.cash_amount])
        .sort((a, b) => a[0].localeCompare(b[0]));
    },
    async splits(symbol) {
      const res = await get<{ results?: { execution_date: string; split_from: number; split_to: number }[] }>(
        '/stocks/v1/splits',
        { ticker: toMassive(symbol), sort: 'execution_date.asc', limit: '1000' },
        'Massive splits',
      );
      return (res.results ?? [])
        .filter((s) => s.execution_date && s.split_from > 0 && s.split_to > 0)
        .map((s): Point => [s.execution_date, s.split_to / s.split_from])
        .sort((a, b) => a[0].localeCompare(b[0]));
    },
    async quote(symbol) {
      const res = await get<AggsResponse>(`/v2/aggs/ticker/${encodeURIComponent(toMassive(symbol))}/prev`, { adjusted: 'false' }, 'Massive cotation');
      const bar = res.results?.[0];
      if (!bar || typeof bar.c !== 'number') throw new ProviderError(`Massive : pas de cotation pour ${symbol}`, 404);
      return { symbol, price: bar.c, currency: 'USD', change_pct: null, time: new Date(bar.t).toISOString() } satisfies Quote;
    },
    async search(q) {
      const res = await get<{
        results?: { ticker: string; name: string; primary_exchange?: string; type?: string; currency_name?: string }[];
      }>('/v3/reference/tickers', { search: q, market: 'stocks', active: 'true', limit: '12' }, 'Massive recherche');
      return (res.results ?? []).map(
        (r): SearchResult => ({
          symbol: fromMassive(r.ticker),
          name: r.name,
          exchange: r.primary_exchange,
          type: r.type,
          currency: r.currency_name ? r.currency_name.toUpperCase() : 'USD',
        }),
      );
    },
    async groupedDailyCloses(date) {
      const json = await get<unknown>(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, { adjusted: 'false' }, 'Massive clôtures');
      return groupedDailyToCloses(json);
    },
  };
}
