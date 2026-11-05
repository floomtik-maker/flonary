/**
 * EODHD (https://eodhd.com) — official API, global coverage (US, Euronext, Xetra, LSE…).
 * Docs: https://eodhd.com/financial-apis/  ·  Cost: 1 call per request (fundamentals: 10).
 */
import type { Point, Quote, SearchResult } from '../../shared/types';
import { countryFr, sectorFr } from '../../shared/geo';
import { getJson, ProviderError, type MarketProvider, type ProviderProfile } from './types';

const BASE = 'https://eodhd.com/api';

/** Internal (Yahoo-style) → EODHD ticker */
export function toEodhd(symbol: string): string {
  if (/-(USD|EUR)$/.test(symbol)) return `${symbol}.CC`;
  const m = /^(.+)\.([A-Z]{1,3})$/.exec(symbol);
  if (!m) return `${symbol}.US`;
  const [, code, suffix] = m;
  const map: Record<string, string> = { DE: 'XETRA', L: 'LSE', T: 'TSE' };
  return `${code}.${map[suffix] ?? suffix}`;
}

/** EODHD exchange code → internal suffix */
export function fromEodhd(code: string, exchange: string): string {
  const ex = exchange.toUpperCase();
  if (['US', 'NASDAQ', 'NYSE', 'NYSE ARCA', 'NYSE MKT', 'BATS', 'AMEX', 'OTC', 'PINK'].includes(ex)) return code;
  if (ex === 'CC') return code;
  const map: Record<string, string> = { XETRA: 'DE', LSE: 'L', TSE: 'T' };
  return `${code}.${map[ex] ?? ex}`;
}

/** The EOD endpoint has no currency field: infer it from the exchange. */
export function currencyOfSymbol(symbol: string): string {
  const t = toEodhd(symbol);
  const ex = t.split('.').pop()!;
  const byEx: Record<string, string> = { US: 'USD', LSE: 'GBp', SW: 'CHF', TO: 'CAD', TSE: 'JPY', HK: 'HKD', ST: 'SEK', CO: 'DKK', OL: 'NOK' };
  if (ex === 'CC') return symbol.endsWith('-EUR') ? 'EUR' : 'USD';
  return byEx[ex] ?? 'EUR';
}

export function parseSplit(s: string): number {
  const [a, b] = s.split('/').map(Number);
  return a > 0 && b > 0 ? a / b : 1;
}

interface DivRow {
  date: string;
  value: number;
  unadjustedValue?: number;
  paymentDate?: string | null;
  currency?: string;
}

/**
 * @param spend reserves n API calls in the daily budget (throws when exhausted)
 * @param fundamentals /fundamentals (10 calls) + earnings calendar: not in the "EOD Historical" plan
 */
export function eodhd(apiKey: string, spend: (n: number) => Promise<void>, opts: { fundamentals?: boolean } = {}): MarketProvider {
  const get = async <T>(path: string, params: Record<string, string>, label: string, cost = 1): Promise<T> => {
    await spend(cost);
    return getJson<T>(`${BASE}${path}?${new URLSearchParams({ api_token: apiKey, fmt: 'json', ...params })}`, label);
  };
  const provider: MarketProvider = {
    name: 'EODHD',
    async eod(symbol, from) {
      const rows = await get<{ date: string; close: number }[]>(`/eod/${toEodhd(symbol)}`, { from, period: 'd' }, 'EODHD cours');
      if (!Array.isArray(rows)) throw new ProviderError(`EODHD : réponse inattendue pour ${symbol}`);
      return { currency: currencyOfSymbol(symbol), points: rows.filter((r) => r.close != null).map((r): Point => [r.date, r.close]) };
    },
    async dividends(symbol, from) {
      const rows = await get<DivRow[]>(`/div/${toEodhd(symbol)}`, { from }, 'EODHD dividendes');
      return (Array.isArray(rows) ? rows : []).map((d): Point => [d.date, d.unadjustedValue ?? d.value]);
    },
    async splits(symbol) {
      const rows = await get<{ date: string; split: string }[]>(`/splits/${toEodhd(symbol)}`, {}, 'EODHD splits');
      return (Array.isArray(rows) ? rows : []).map((s): Point => [s.date, parseSplit(s.split)]);
    },
    async quote(symbol) {
      const q = await get<{ close: number | 'NA'; change_p?: number | 'NA'; timestamp?: number }>(`/real-time/${toEodhd(symbol)}`, {}, 'EODHD cotation');
      if (typeof q.close !== 'number') throw new ProviderError(`EODHD : pas de cotation pour ${symbol}`, 404);
      return {
        symbol,
        price: q.close,
        currency: currencyOfSymbol(symbol),
        change_pct: typeof q.change_p === 'number' ? q.change_p : null,
        time: q.timestamp ? new Date(q.timestamp * 1000).toISOString() : undefined,
      } satisfies Quote;
    },
    async search(q) {
      const rows = await get<{ Code: string; Exchange: string; Name: string; Type: string; Currency: string }[]>(
        `/search/${encodeURIComponent(q)}`,
        { limit: '12' },
        'EODHD recherche',
      );
      return rows.map((r): SearchResult => ({ symbol: fromEodhd(r.Code, r.Exchange), name: r.Name, exchange: r.Exchange, type: r.Type, currency: r.Currency }));
    },
  };
  if (opts.fundamentals) {
    provider.profile = async (symbol, today): Promise<ProviderProfile> => {
      const t = toEodhd(symbol);
      const until = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
      const [g, earnings] = await Promise.all([
        get<Record<string, string | null>>(`/fundamentals/${t}`, { filter: 'General' }, 'EODHD fondamentaux', 10).catch(() => null),
        get<{ earnings?: { report_date: string }[] }>('/calendar/earnings', { symbols: t, from: today, to: until }, 'EODHD résultats').catch(() => null),
      ]);
      return {
        name: g?.Name ?? undefined,
        country: countryFr(g?.CountryName ?? null),
        sector: sectorFr(g?.Sector ?? null),
        isin: g?.ISIN ?? null,
        type: g?.Type ?? null,
        earnings: (earnings?.earnings ?? []).map((e) => e.report_date).filter((d) => d >= today),
      };
    };
  }
  return provider;
}
