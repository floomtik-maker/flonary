import type { Point } from './types';
import type { SeriesPoint } from './portfolio';
import { valueAtOrFirst } from './series';

/** Default comparison: Amundi MSCI World (EUR, Euronext Paris). */
export const BENCHMARK_SYMBOL = 'CW8.PA';
export const BENCHMARK_LABEL = 'ETF Monde';

export interface BenchmarkPoint {
  date: string;
  /** Value of the simulated benchmark investment (EUR) */
  value: number;
}

export interface BenchmarkResult {
  series: BenchmarkPoint[];
  /** Final value of the simulated investment */
  finalValue: number;
  /** finalValue − money invested over the window */
  gain: number;
  /** Portfolio final value − benchmark final value (> 0 = the portfolio did better) */
  difference: number;
}

/**
 * Simulates investing the portfolio's external cash flows into the benchmark on the same dates.
 * The first point's portfolio value is the initial investment (so any window of the series
 * can be compared); afterwards each change of `contributions` is a flow (withdrawals sell units).
 * Benchmark prices (EUR, raw closes) are forward-filled; before the first price, the first price is used.
 */
export function simulateBenchmark(points: SeriesPoint[], prices: Point[] | undefined): BenchmarkResult | null {
  if (!points.length || !prices?.length) return null;
  let units = 0;
  let prevContrib = points[0].contributions;
  const series: BenchmarkPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const price = valueAtOrFirst(prices, p.date);
    if (!price || price <= 0) return null;
    const flow = i === 0 ? p.value : p.contributions - prevContrib;
    prevContrib = p.contributions;
    units += flow / price;
    // Withdrawing more than the benchmark holds empties it (cannot go negative)
    if (units < 0) units = 0;
    series.push({ date: p.date, value: units * price });
  }
  const first = points[0];
  const last = points[points.length - 1];
  const invested = first.value + (last.contributions - first.contributions);
  const finalValue = series[series.length - 1].value;
  return { series, finalValue, gain: finalValue - invested, difference: last.value - finalValue };
}
