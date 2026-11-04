/**
 * Technical / risk analysis on a price series. Pure functions.
 * Nothing here is investment advice: the UI always shows a disclaimer.
 */
import type { Point } from './types';

export function sma(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

/** Wilder RSI */
export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

export function dailyReturns(values: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < values.length; i++) if (values[i - 1] > 0) r.push(values[i] / values[i - 1] - 1);
  return r;
}

/** Annualized volatility from daily returns (252 trading days). */
export function volatility(values: number[]): number | null {
  const r = dailyReturns(values);
  if (r.length < 20) return null;
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  const variance = r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/** Max drawdown (negative number, e.g. -0.25 for -25 %). */
export function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) mdd = Math.min(mdd, v / peak - 1);
  }
  return mdd;
}

/**
 * Risk class 1–7 from annualized volatility, using the PRIIPs market-risk bands
 * (the "SRI" 1–7 scale shown on European fund/ETF documents).
 */
export function riskClass(vol: number | null): number | null {
  if (vol == null) return null;
  const bands = [0.005, 0.05, 0.12, 0.2, 0.3, 0.8];
  let c = 1;
  for (const b of bands) if (vol >= b) c++;
  return c;
}

export const RISK_LABELS: Record<number, string> = {
  1: 'Très faible',
  2: 'Faible',
  3: 'Modéré',
  4: 'Moyen',
  5: 'Élevé',
  6: 'Très élevé',
  7: 'Extrême',
};

export type SignalTone = 'buy' | 'hold' | 'take_profit' | 'caution' | 'neutral';

export interface Signals {
  price: number;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  high52: number;
  low52: number;
  /** Support / resistance over ~3 months */
  support: number;
  resistance: number;
  volatility: number | null;
  maxDrawdown1y: number;
  risk: number | null;
  trend: 'up' | 'down' | 'flat';
  /** Suggested accumulation zone */
  entryZone: [number, number];
  /** Suggested profit-taking zone */
  exitZone: [number, number];
  /** Suggested protective stop */
  stop: number;
  tone: SignalTone;
  headline: string;
  reasons: string[];
}

/**
 * Builds simple, explainable entry/exit levels from the last year of closes.
 * Requires at least ~30 points; returns null otherwise.
 */
export function computeSignals(points: Point[], avgPrice?: number): Signals | null {
  if (points.length < 30) return null;
  const closes = points.map((p) => p[1]);
  const last = closes[closes.length - 1];
  const y = closes.slice(-252);
  const q = closes.slice(-63);
  const s50 = sma(closes, 50).at(-1) ?? null;
  const s200 = sma(closes, 200).at(-1) ?? null;
  const r = rsi(closes.slice(-200));
  const high52 = Math.max(...y);
  const low52 = Math.min(...y);
  const support = Math.min(...q);
  const resistance = Math.max(...q);
  const vol = volatility(y);
  const mdd = maxDrawdown(y);

  let trend: Signals['trend'] = 'flat';
  if (s200 != null && s50 != null) trend = last > s200 && s50 > s200 ? 'up' : last < s200 && s50 < s200 ? 'down' : 'flat';
  else if (s50 != null) trend = last > s50 ? 'up' : 'down';

  // Entry zone: between the recent support and the closest moving average below the price.
  const mas = [s50, s200].filter((v): v is number => v != null && v < last);
  const entryHigh = Math.max(support * 1.02, mas.length ? Math.max(...mas) : support * 1.05);
  const entryZone: [number, number] = [support, Math.min(entryHigh, last)];
  // Exit zone: recent resistance up to the 52-week high (or +1 vol above if we are at the highs).
  const exitLow = Math.max(resistance, last * 1.02);
  const exitHigh = Math.max(high52, exitLow * (1 + (vol ?? 0.2) / 4));
  const exitZone: [number, number] = [exitLow, exitHigh];
  const stop = support * 0.97;

  const reasons: string[] = [];
  let tone: SignalTone = 'neutral';
  let headline = 'Pas de signal particulier';
  const nearSupport = last <= support * 1.04;
  const nearHigh = last >= high52 * 0.97;

  if (trend === 'up') reasons.push('Tendance haussière (cours au-dessus de la moyenne 200 jours)');
  if (trend === 'down') reasons.push('Tendance baissière (cours sous la moyenne 200 jours)');
  if (r != null && r < 30) reasons.push(`RSI à ${r.toFixed(0)} : titre survendu`);
  if (r != null && r > 70) reasons.push(`RSI à ${r.toFixed(0)} : titre suracheté`);
  if (nearSupport) reasons.push('Cours proche de son support des 3 derniers mois');
  if (nearHigh) reasons.push('Cours proche de son plus haut sur 1 an');
  if (avgPrice && avgPrice > 0) {
    const pl = last / avgPrice - 1;
    reasons.push(`Vous êtes ${pl >= 0 ? 'en gain' : 'en perte'} de ${(pl * 100).toFixed(1)} % vs votre PRU`);
  }

  if ((r != null && r > 70) || (nearHigh && r != null && r > 60)) {
    tone = 'take_profit';
    headline = 'Zone de prise de bénéfices possible';
  } else if ((r != null && r < 35) || nearSupport) {
    tone = trend === 'down' ? 'caution' : 'buy';
    headline = trend === 'down' ? 'Survendu mais tendance baissière : prudence' : "Zone d'achat intéressante";
  } else if (trend === 'up') {
    tone = 'hold';
    headline = 'Tendance saine : conserver';
  } else if (trend === 'down') {
    tone = 'caution';
    headline = 'Tendance baissière : surveiller';
  }

  return {
    price: last,
    sma50: s50,
    sma200: s200,
    rsi14: r,
    high52,
    low52,
    support,
    resistance,
    volatility: vol,
    maxDrawdown1y: mdd,
    risk: riskClass(vol),
    trend,
    entryZone,
    exitZone,
    stop,
    tone,
    headline,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Projection (monthly investment simulator)

export interface ProjectionPoint {
  month: number;
  date: string;
  contributed: number;
  value: number;
  /** Pessimistic / optimistic bands (return −/+ 3 pts) */
  low: number;
  high: number;
}

export function project(opts: {
  initial: number;
  monthly: number;
  years: number;
  annualReturn: number;
  startDate: string;
}): ProjectionPoint[] {
  const { initial, monthly, years, annualReturn, startDate } = opts;
  const months = Math.round(years * 12);
  const rate = (a: number) => Math.pow(1 + a, 1 / 12) - 1;
  const r = rate(annualReturn);
  const rl = rate(annualReturn - 0.03);
  const rh = rate(annualReturn + 0.03);
  let v = initial;
  let lo = initial;
  let hi = initial;
  let c = initial;
  const start = new Date(startDate + 'T00:00:00Z');
  const out: ProjectionPoint[] = [{ month: 0, date: startDate, contributed: c, value: v, low: lo, high: hi }];
  for (let m = 1; m <= months; m++) {
    v = v * (1 + r) + monthly;
    lo = lo * (1 + rl) + monthly;
    hi = hi * (1 + rh) + monthly;
    c += monthly;
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + m);
    out.push({ month: m, date: d.toISOString().slice(0, 10), contributed: c, value: v, low: lo, high: hi });
  }
  return out;
}

/** Concentration: Herfindahl index on weights (0..1) and an "effective number of positions". */
export function concentration(weights: number[]): { hhi: number; effective: number } {
  const hhi = weights.reduce((s, w) => s + w * w, 0);
  return { hhi, effective: hhi > 0 ? 1 / hhi : 0 };
}
