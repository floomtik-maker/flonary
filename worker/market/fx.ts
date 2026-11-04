/**
 * FX rates from the European Central Bank via Frankfurter (https://frankfurter.dev) — free, no key.
 * Returns "EUR per 1 unit of currency" series.
 */
import type { Point } from '../../shared/types';
import { getJson } from './types';

export async function fxSeries(currency: string, from: string, to: string): Promise<Point[]> {
  if (currency === 'EUR') return [];
  const r = await getJson<{ rates: Record<string, { EUR: number }> }>(
    `https://api.frankfurter.dev/v1/${from}..${to}?base=${encodeURIComponent(currency)}&symbols=EUR`,
    'Frankfurter (BCE)',
  );
  return Object.entries(r.rates)
    .map(([d, v]): Point => [d, v.EUR])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
