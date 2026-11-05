/**
 * EODHD (https://eodhd.com) — official API, global coverage (US, Euronext, Xetra, LSE…).
 * Docs: https://eodhd.com/financial-apis/
 */
import type { CalendarEvent, Point, PriceHistory, Quote, SearchResult } from '../../shared/types';
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

interface EodRow {
  date: string;
  close: number;
}
interface DivRow {
  date: string;
  value: number;
  unadjustedValue?: number;
  paymentDate?: string | null;
  currency?: string;
}
interface SplitRow {
  date: string;
  split: string;
}

export function parseSplit(s: string): number {
  const [a, b] = s.split('/').map(Number);
  return a > 0 && b > 0 ? a / b : 1;
}

/**
 * `fundamentals` enables /fundamentals (country, sector — costs 10 calls) and /calendar/earnings.
 * Neither is included in the "EOD Historical All-World" plan, so they are off by default
 * (country is then guessed from the ticker suffix and earnings dates are not shown).
 */
export function eodhd(apiKey: string, opts: { fundamentals?: boolean } = {}): MarketProvider {
  const url = (path: string, params: Record<string, string> = {}) =>
    `${BASE}${path}?${new URLSearchParams({ api_token: apiKey, fmt: 'json', ...params })}`;

  async function currencyOf(sym: string): Promise<string> {
    // The EOD endpoint has no currency field: infer from the exchange.
    const ex = sym.split('.').pop()!;
    const byEx: Record<string, string> = { US: 'USD', LSE: 'GBp', SW: 'CHF', TO: 'CAD', TSE: 'JPY', HK: 'HKD', ST: 'SEK', CO: 'DKK', OL: 'NOK', CC: sym.includes('-EUR') ? 'EUR' : 'USD' };
    return byEx[ex] ?? 'EUR';
  }

  return {
    name: 'EODHD',
    async history(symbol, from) {
      const t = toEodhd(symbol);
      const [rows, divs, splits] = await Promise.all([
        getJson<EodRow[]>(url(`/eod/${t}`, { from, period: 'd' }), 'EODHD eod'),
        getJson<DivRow[]>(url(`/div/${t}`, { from }), 'EODHD div').catch(() => [] as DivRow[]),
        getJson<SplitRow[]>(url(`/splits/${t}`, { from }), 'EODHD splits').catch(() => [] as SplitRow[]),
      ]);
      if (!Array.isArray(rows) || rows.length === 0) throw new ProviderError(`EODHD: aucun cours pour ${symbol}`, 404);
      const points: Point[] = rows.filter((r) => r.close != null).map((r) => [r.date, r.close]);
      const dividends: Point[] = (Array.isArray(divs) ? divs : []).map((d) => [d.date, d.unadjustedValue ?? d.value]);
      const sp: Point[] = (Array.isArray(splits) ? splits : []).map((s) => [s.date, parseSplit(s.split)]);
      return { symbol, currency: await currencyOf(t), points, dividends, splits: sp } satisfies PriceHistory;
    },
    async quote(symbol) {
      const t = toEodhd(symbol);
      const q = await getJson<{ close: number | 'NA'; previousClose?: number; change_p?: number | 'NA'; timestamp?: number }>(url(`/real-time/${t}`), 'EODHD quote');
      if (typeof q.close !== 'number') throw new ProviderError(`EODHD: pas de cotation pour ${symbol}`, 404);
      return {
        symbol,
        price: q.close,
        currency: await currencyOf(t),
        change_pct: typeof q.change_p === 'number' ? q.change_p : null,
        time: q.timestamp ? new Date(q.timestamp * 1000).toISOString() : undefined,
      } satisfies Quote;
    },
    async search(q) {
      const rows = await getJson<{ Code: string; Exchange: string; Name: string; Type: string; Currency: string; ISIN?: string }[]>(
        url(`/search/${encodeURIComponent(q)}`, { limit: '12' }),
        'EODHD search',
      );
      return rows.map(
        (r): SearchResult => ({ symbol: fromEodhd(r.Code, r.Exchange), name: r.Name, exchange: r.Exchange, type: r.Type, currency: r.Currency }),
      );
    },
    async profile(symbol, today) {
      const t = toEodhd(symbol);
      const events: CalendarEvent[] = [];
      const until = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
      const [general, earnings, divs] = await Promise.all([
        opts.fundamentals
          ? getJson<Record<string, string | null>>(url(`/fundamentals/${t}`, { filter: 'General' }), 'EODHD fundamentals').catch(() => null)
          : Promise.resolve(null),
        opts.fundamentals
          ? getJson<{ earnings?: { report_date: string }[] }>(url('/calendar/earnings', { symbols: t, from: today, to: until }), 'EODHD earnings').catch(() => null)
          : Promise.resolve(null),
        getJson<DivRow[]>(url(`/div/${t}`, { from: today }), 'EODHD div').catch(() => [] as DivRow[]),
      ]);
      for (const e of earnings?.earnings ?? []) if (e.report_date >= today) events.push({ symbol, date: e.report_date, kind: 'earnings' });
      for (const d of Array.isArray(divs) ? divs : []) {
        if (d.date >= today) events.push({ symbol, date: d.date, kind: 'ex_dividend', amount: d.unadjustedValue ?? d.value, currency: d.currency });
        if (d.paymentDate && d.paymentDate >= today)
          events.push({ symbol, date: d.paymentDate, kind: 'dividend_payment', amount: d.unadjustedValue ?? d.value, currency: d.currency });
      }
      const g = general && typeof general === 'object' && !Array.isArray(general) ? general : null;
      return {
        name: g?.Name ?? undefined,
        country: countryFr(g?.CountryName ?? null),
        sector: sectorFr(g?.Sector ?? null),
        isin: g?.ISIN ?? null,
        type: g?.Type ?? null,
        events,
      } satisfies ProviderProfile;
    },
  };
}
