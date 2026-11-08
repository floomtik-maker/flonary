// Per-position figures shown in the Positions table views (performance, dividends, risk).
// Pure display helpers: they never feed back into the portfolio engine (shared/portfolio.ts).
import type { PriceHistory } from '../../shared/types';
import { addDays, addMonths, indexAtOrBefore } from '../../shared/series';
import { maxDrawdown, riskClass, volatility } from '../../shared/analysis';
import { dividendYield } from '../../shared/calendar';

export interface PositionMetrics {
  /** Price change (ratio, 0.05 = +5 %) over each window; null when the history is too short */
  w1: number | null;
  m1: number | null;
  ytd: number | null;
  y1: number | null;
  /** Trailing 12-month dividend yield (ratio) and dividend per share (instrument currency) */
  yield: number | null;
  dividendPerShare: number | null;
  /** Estimated next-12-month income in EUR (trailing dividends × shares held) */
  incomeEUR: number | null;
  /** Annualized volatility over ~1 year (ratio) and PRIIPs-style risk class 1–7 */
  vol: number | null;
  risk: number | null;
  /** Max drawdown over ~1 year (negative ratio) */
  drawdown: number | null;
}

const EMPTY: PositionMetrics = { w1: null, m1: null, ytd: null, y1: null, yield: null, dividendPerShare: null, incomeEUR: null, vol: null, risk: null, drawdown: null };

/** Product of the split ratios taking effect after `date` (raw closes before a split must be divided by it). */
function splitFactorAfter(history: PriceHistory, date: string): number {
  return (history.splits ?? []).reduce((f, [d, ratio]) => (d > date && ratio > 0 ? f * ratio : f), 1);
}

/** Closes made comparable across splits (the history stores raw, non-adjusted closes). */
export function adjustedCloses(history: PriceHistory): number[] {
  return history.points.map(([d, v]) => v / splitFactorAfter(history, d));
}

/**
 * Price change from `from` to `last`. Null when the history does not reach back to `from`
 * (tolerance of one week for weekends/holidays at the start of the series).
 */
export function priceChange(history: PriceHistory | undefined, last: number, from: string): number | null {
  const pts = history?.points;
  if (!history || !pts?.length || !(last > 0)) return null;
  if (pts[0][0] > addDays(from, 7)) return null;
  // Within the tolerance the series may start a few days after `from`: use its first close
  const i = Math.max(0, indexAtOrBefore(pts, from));
  const ref = pts[i][1] / splitFactorAfter(history, pts[i][0]);
  return ref > 0 ? last / ref - 1 : null;
}

export function positionMetrics(opts: {
  symbol: string;
  quantity: number;
  /** Last price in the instrument currency (live quote or last close) */
  price: number;
  history: PriceHistory | undefined;
  today: string;
  fxToEUR: (currency: string) => number;
}): PositionMetrics {
  const { symbol, quantity, price, history, today, fxToEUR } = opts;
  if (!history || history.points.length === 0) return { ...EMPTY };
  const manual = symbol.startsWith('manual:');
  const year = Number(today.slice(0, 4));

  const out: PositionMetrics = {
    ...EMPTY,
    w1: priceChange(history, price, addDays(today, -7)),
    m1: priceChange(history, price, addMonths(today, -1)),
    ytd: priceChange(history, price, `${year - 1}-12-31`),
    y1: priceChange(history, price, addMonths(today, -12)),
  };
  // Manual valuations are sparse and irregular: no market statistics for them
  if (manual) return out;

  const dy = dividendYield(history, today);
  if (dy && dy.ttm > 0) {
    out.yield = dy.yield;
    out.dividendPerShare = dy.ttm;
    out.incomeEUR = dy.ttm * quantity * fxToEUR(history.currency);
  }
  const closes = adjustedCloses(history).slice(-252);
  out.vol = volatility(closes);
  out.risk = riskClass(out.vol);
  out.drawdown = closes.length >= 20 ? maxDrawdown(closes) : null;
  return out;
}
