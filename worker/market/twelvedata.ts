/**
 * Twelve Data (https://twelvedata.com) — official API. Free tier mainly covers US markets.
 * Docs: https://twelvedata.com/docs
 */
import type { Point, PriceHistory, Quote, SearchResult } from '../../shared/types';
import { countryFr, sectorFr } from '../../shared/geo';
import { getJson, ProviderError, type MarketProvider } from './types';

const BASE = 'https://api.twelvedata.com';
const MIC: Record<string, string> = { PA: 'XPAR', AS: 'XAMS', BR: 'XBRU', LS: 'XLIS', DE: 'XETR', L: 'XLON', MI: 'XMIL', MC: 'XMAD', SW: 'XSWX', TO: 'XTSE' };
const SUFFIX: Record<string, string> = Object.fromEntries(Object.entries(MIC).map(([k, v]) => [v, k]));

export function toTwelve(symbol: string): Record<string, string> {
  if (/-(USD|EUR)$/.test(symbol)) return { symbol: symbol.replace('-', '/') };
  const m = /^(.+)\.([A-Z]{1,3})$/.exec(symbol);
  if (!m || !MIC[m[2]]) return { symbol };
  return { symbol: m[1], mic_code: MIC[m[2]] };
}

interface TdError {
  status?: string;
  code?: number;
  message?: string;
}
function check<T extends TdError>(r: T, label: string): T {
  if (r.status === 'error') throw new ProviderError(`${label}: ${r.message ?? 'erreur'}`, r.code === 404 ? 404 : 502);
  return r;
}

export function twelveData(apiKey: string): MarketProvider {
  const url = (path: string, params: Record<string, string>) => `${BASE}${path}?${new URLSearchParams({ apikey: apiKey, ...params })}`;
  return {
    name: 'Twelve Data',
    async history(symbol, from) {
      const r = check(
        await getJson<TdError & { meta?: { currency?: string }; values?: { datetime: string; close: string }[] }>(
          url('/time_series', { ...toTwelve(symbol), interval: '1day', start_date: from, outputsize: '5000', adjust: 'none', order: 'ASC' }),
          'Twelve Data',
        ),
        'Twelve Data',
      );
      const points: Point[] = (r.values ?? []).map((v) => [v.datetime.slice(0, 10), Number(v.close)]);
      if (!points.length) throw new ProviderError(`Twelve Data: aucun cours pour ${symbol}`, 404);
      points.sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const [divs, splits] = await Promise.all([
        getJson<TdError & { dividends?: { ex_date: string; amount: number }[] }>(url('/dividends', { ...toTwelve(symbol), start_date: from }), 'TD div').catch(() => null),
        getJson<TdError & { splits?: { date: string; ratio: number }[] }>(url('/splits', { ...toTwelve(symbol), start_date: from }), 'TD splits').catch(() => null),
      ]);
      return {
        symbol,
        currency: r.meta?.currency ?? 'USD',
        points,
        dividends: (divs?.dividends ?? []).map((d): Point => [d.ex_date, d.amount]).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
        splits: (splits?.splits ?? []).map((s): Point => [s.date, s.ratio]),
      } satisfies PriceHistory;
    },
    async quote(symbol) {
      const r = check(
        await getJson<TdError & { close?: string; currency?: string; percent_change?: string; datetime?: string }>(url('/quote', toTwelve(symbol)), 'Twelve Data quote'),
        'Twelve Data quote',
      );
      if (!r.close) throw new ProviderError(`Twelve Data: pas de cotation pour ${symbol}`, 404);
      return { symbol, price: Number(r.close), currency: r.currency ?? 'USD', change_pct: r.percent_change ? Number(r.percent_change) : null, time: r.datetime } satisfies Quote;
    },
    async search(q) {
      const r = check(
        await getJson<TdError & { data?: { symbol: string; instrument_name: string; exchange: string; mic_code: string; currency: string; instrument_type: string }[] }>(
          url('/symbol_search', { symbol: q, outputsize: '12' }),
          'Twelve Data search',
        ),
        'Twelve Data search',
      );
      return (r.data ?? []).map(
        (d): SearchResult => ({
          symbol: SUFFIX[d.mic_code] ? `${d.symbol}.${SUFFIX[d.mic_code]}` : d.symbol,
          name: d.instrument_name,
          exchange: d.exchange,
          type: d.instrument_type,
          currency: d.currency,
        }),
      );
    },
    async profile(symbol) {
      const p = await getJson<TdError & { name?: string; country?: string; sector?: string; type?: string }>(url('/profile', toTwelve(symbol)), 'TD profile').catch(() => null);
      const ok = p && p.status !== 'error';
      return { name: ok ? p.name : undefined, country: ok ? countryFr(p.country) : null, sector: ok ? sectorFr(p.sector) : null, type: ok ? p.type : null, events: [] };
    },
  };
}
