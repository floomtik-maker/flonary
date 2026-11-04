/**
 * Portfolio engine — pure functions, no I/O.
 *
 * KEY RULE (requested by the user): selling a position does NOT remove its gain from the
 * portfolio. Each account has a "cash pocket" in EUR:
 *   - SELL proceeds and DIVIDENDS go into the pocket,
 *   - BUYs are paid from the pocket first; only the shortfall counts as new money
 *     (an "implicit deposit"),
 *   - DEPOSIT / WITHDRAWAL are explicit external flows.
 * Total value = market value of holdings + cash pockets.
 * Performance = total value − net contributions (money actually put in).
 * So a +20 % realized gain stays in the value AND in the performance.
 *
 * Cost basis uses the weighted average cost method (PRU / PMP, French standard),
 * buy fees included. Everything is converted to EUR at the transaction date's FX rate.
 */
import { BASE_CURRENCY, type Instrument, type Point, type PriceHistory, type Quote, type Transaction, type TxType } from './types';
import { addDays, unionDates, valueAt, valueAtOrFirst } from './series';

export interface EngineInput {
  transactions: Transaction[];
  instruments: Record<string, Instrument>;
  /** Daily closes in the instrument currency */
  prices: Record<string, PriceHistory>;
  /** currency -> series of "EUR per 1 unit of currency" */
  fx: Record<string, Point[]>;
  /** Latest quotes (override the last close for "today") */
  quotes?: Record<string, Quote>;
  /** ISO date used as "today" */
  today: string;
}

export interface Position {
  symbol: string;
  name: string;
  currency: string;
  asset_class: Instrument['asset_class'];
  country: string | null;
  sector: string | null;
  accounts: string[];
  quantity: number;
  /** Average unit cost (PRU) in instrument currency, fees included */
  avgPrice: number;
  /** Cost basis of the shares still held, EUR */
  costEUR: number;
  /** Last price in instrument currency */
  price: number;
  valueEUR: number;
  unrealizedEUR: number;
  unrealizedPct: number;
  realizedEUR: number;
  dividendsEUR: number;
  /** unrealized + realized + dividends */
  totalGainEUR: number;
  weight: number;
  dayChangePct: number | null;
  closed: boolean;
  firstBuy: string | null;
}

export interface AccountSummary {
  account_id: string;
  valueEUR: number;
  cashEUR: number;
  contributionsEUR: number;
  gainEUR: number;
}

export interface SeriesPoint {
  date: string;
  value: number;
  contributions: number;
  /** value − contributions */
  gain: number;
  /** Time-weighted return index (starts at 1) */
  twr: number;
}

export interface Summary {
  totalValue: number;
  holdingsValue: number;
  cash: number;
  netContributions: number;
  totalGain: number;
  /** totalGain / netContributions (simple return on money invested) */
  totalGainPct: number;
  unrealized: number;
  realized: number;
  dividends: number;
  fees: number;
  dayChange: number;
}

export interface PortfolioResult {
  summary: Summary;
  positions: Position[];
  closedPositions: Position[];
  accounts: AccountSummary[];
  series: SeriesPoint[];
  warnings: string[];
}

const EPS = 1e-9;

/** Same-day processing order: money in first, then sales, then purchases. */
const DAY_ORDER: Record<TxType, number> = { DEPOSIT: 0, DIVIDEND: 1, SELL: 2, BUY: 3, FEE: 4, WITHDRAWAL: 5 };

export function sortTransactions(txs: Transaction[]): Transaction[] {
  return txs
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : DAY_ORDER[a.t.type] - DAY_ORDER[b.t.type] || a.i - b.i))
    .map((x) => x.t);
}

interface Lot {
  account_id: string;
  symbol: string;
  qty: number;
  costEUR: number;
  costLocal: number;
  realizedEUR: number;
  dividendsEUR: number;
  firstBuy: string | null;
  lastTradePrice: number;
}

class Ledger {
  lots = new Map<string, Lot>();
  cash = new Map<string, number>();
  contrib = new Map<string, number>();
  fees = 0;
  warnings: string[] = [];

  constructor(private fxAt: (ccy: string, date: string, tx?: Transaction) => number) {}

  lot(account_id: string, symbol: string): Lot {
    const key = account_id + '|' + symbol;
    let l = this.lots.get(key);
    if (!l) {
      l = { account_id, symbol, qty: 0, costEUR: 0, costLocal: 0, realizedEUR: 0, dividendsEUR: 0, firstBuy: null, lastTradePrice: 0 };
      this.lots.set(key, l);
    }
    return l;
  }

  private addCash(acc: string, eur: number) {
    this.cash.set(acc, (this.cash.get(acc) ?? 0) + eur);
  }
  private addContrib(acc: string, eur: number) {
    this.contrib.set(acc, (this.contrib.get(acc) ?? 0) + eur);
  }
  /** Pay from the pocket; any shortfall is an implicit deposit. Returns the implicit deposit amount. */
  private spend(acc: string, eur: number): number {
    const available = Math.max(0, this.cash.get(acc) ?? 0);
    const shortfall = Math.max(0, eur - available);
    if (shortfall > 0) this.addContrib(acc, shortfall);
    this.addCash(acc, shortfall - eur);
    return shortfall;
  }

  /** Applies a transaction. Returns the external flow (EUR) it generated (for TWR). */
  apply(tx: Transaction): number {
    const fx = this.fxAt(tx.currency, tx.date, tx);
    const acc = tx.account_id;
    switch (tx.type) {
      case 'DEPOSIT': {
        const eur = tx.amount * fx;
        this.addCash(acc, eur);
        this.addContrib(acc, eur);
        return eur;
      }
      case 'WITHDRAWAL': {
        const eur = tx.amount * fx;
        this.addCash(acc, -eur);
        this.addContrib(acc, -eur);
        return -eur;
      }
      case 'FEE': {
        const eur = tx.amount * fx;
        this.fees += eur;
        return this.spend(acc, eur);
      }
      case 'DIVIDEND': {
        const eur = tx.amount * fx;
        this.addCash(acc, eur);
        if (tx.symbol) this.lot(acc, tx.symbol).dividendsEUR += eur;
        return 0;
      }
      case 'BUY': {
        if (!tx.symbol) return 0;
        const l = this.lot(acc, tx.symbol);
        const local = tx.quantity * tx.price + (tx.fees || 0);
        const eur = local * fx;
        l.qty += tx.quantity;
        l.costLocal += local;
        l.costEUR += eur;
        l.lastTradePrice = tx.price;
        l.firstBuy ??= tx.date;
        this.fees += (tx.fees || 0) * fx;
        return this.spend(acc, eur);
      }
      case 'SELL': {
        if (!tx.symbol) return 0;
        const l = this.lot(acc, tx.symbol);
        let qty = tx.quantity;
        if (qty > l.qty + EPS) {
          this.warnings.push(`Vente de ${qty} ${tx.symbol} le ${tx.date} supérieure à la quantité détenue (${round(l.qty)}).`);
          qty = l.qty;
        }
        const share = l.qty > EPS ? qty / l.qty : 0;
        const costEUR = l.costEUR * share;
        const costLocal = l.costLocal * share;
        const proceedsEUR = (qty * tx.price - (tx.fees || 0)) * fx;
        l.realizedEUR += proceedsEUR - costEUR;
        l.qty -= qty;
        l.costEUR -= costEUR;
        l.costLocal -= costLocal;
        if (l.qty < EPS) {
          l.qty = 0;
          l.costEUR = 0;
          l.costLocal = 0;
        }
        l.lastTradePrice = tx.price;
        this.fees += (tx.fees || 0) * fx;
        this.addCash(acc, proceedsEUR);
        return 0;
      }
    }
  }

  /** Stock split: quantities are multiplied, total cost is unchanged. */
  split(symbol: string, ratio: number) {
    if (!(ratio > 0)) return;
    for (const l of this.lots.values()) {
      if (l.symbol !== symbol) continue;
      l.qty *= ratio;
      l.lastTradePrice /= ratio;
    }
  }

  totalContrib() {
    let s = 0;
    for (const v of this.contrib.values()) s += v;
    return s;
  }
  totalCash() {
    let s = 0;
    for (const v of this.cash.values()) s += v;
    return s;
  }
}

function round(n: number, d = 6) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function computePortfolio(input: EngineInput): PortfolioResult {
  const { instruments, prices, fx, quotes = {}, today } = input;
  const txs = sortTransactions(input.transactions.filter((t) => t.date <= today));
  const warnings: string[] = [];
  const missingFx = new Set<string>();

  const fxAt = (ccy: string, date: string, tx?: Transaction): number => {
    if (tx?.fx_rate && tx.fx_rate > 0) return tx.fx_rate;
    if (!ccy || ccy === BASE_CURRENCY) return 1;
    // GBp (pence) quotes: 1/100 of GBP
    if (ccy === 'GBp' || ccy === 'GBX') return (fxAt('GBP', date) ?? 1) / 100;
    const v = valueAtOrFirst(fx[ccy], date);
    if (v === undefined) {
      missingFx.add(ccy);
      return 1;
    }
    return v;
  };

  const currencyOf = (symbol: string) => instruments[symbol]?.currency ?? prices[symbol]?.currency ?? BASE_CURRENCY;

  // --- Daily series -------------------------------------------------------
  const ledger = new Ledger(fxAt);
  const series: SeriesPoint[] = [];
  if (txs.length > 0) {
    const start = txs[0].date;
    const priceDates = Object.values(prices).flatMap((h) => h.points.map((p) => p[0]));
    const dates = unionDates(
      priceDates.filter((d) => d >= start && d <= today),
      txs.map((t) => t.date),
      [today],
    );
    // Include the day before the first transaction as a zero point for nicer charts.
    const splitEvents = Object.values(prices)
      .flatMap((h) => (h.splits ?? []).map(([date, ratio]) => ({ date, ratio, symbol: h.symbol })))
      .filter((e) => e.date > start && e.date <= today)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    let si = 0;
    let i = 0;
    let prevValue = 0;
    let twr = 1;
    series.push({ date: addDays(start, -1), value: 0, contributions: 0, gain: 0, twr: 1 });
    for (const d of dates) {
      let flow = 0;
      // Splits take effect at the open of their date, before that day's trades.
      while (si < splitEvents.length && splitEvents[si].date <= d) {
        const e = splitEvents[si++];
        while (i < txs.length && txs[i].date < e.date) flow += ledger.apply(txs[i++]);
        ledger.split(e.symbol, e.ratio);
      }
      while (i < txs.length && txs[i].date <= d) flow += ledger.apply(txs[i++]);
      let holdings = 0;
      for (const l of ledger.lots.values()) {
        if (l.qty <= EPS) continue;
        const p = priceOn(l, d);
        holdings += l.qty * p * fxAt(currencyOf(l.symbol), d);
      }
      const value = holdings + ledger.totalCash();
      if (prevValue > EPS) {
        const r = (value - flow) / prevValue;
        if (Number.isFinite(r) && r > 0) twr *= r;
      }
      const contributions = ledger.totalContrib();
      series.push({ date: d, value, contributions, gain: value - contributions, twr });
      prevValue = value;
    }
  }

  function priceOn(l: Lot, d: string): number {
    if (d === today && quotes[l.symbol]?.price) return quotes[l.symbol].price;
    return valueAt(prices[l.symbol]?.points, d) ?? l.lastTradePrice;
  }

  // --- Positions (aggregated per symbol over accounts) ----------------------
  const bySymbol = new Map<string, Lot[]>();
  for (const l of ledger.lots.values()) {
    const arr = bySymbol.get(l.symbol) ?? [];
    arr.push(l);
    bySymbol.set(l.symbol, arr);
  }

  const all: Position[] = [];
  for (const [symbol, lots] of bySymbol) {
    const inst = instruments[symbol];
    const currency = currencyOf(symbol);
    const qty = lots.reduce((s, l) => s + l.qty, 0);
    const costEUR = lots.reduce((s, l) => s + l.costEUR, 0);
    const costLocal = lots.reduce((s, l) => s + l.costLocal, 0);
    const price = priceOn(lots[0], today);
    const valueEUR = qty * price * fxAt(currency, today);
    const realizedEUR = lots.reduce((s, l) => s + l.realizedEUR, 0);
    const dividendsEUR = lots.reduce((s, l) => s + l.dividendsEUR, 0);
    const unrealizedEUR = valueEUR - costEUR;
    const firstBuys = lots.map((l) => l.firstBuy).filter(Boolean) as string[];
    all.push({
      symbol,
      name: inst?.name ?? symbol,
      currency,
      asset_class: inst?.asset_class ?? 'other',
      country: inst?.country ?? null,
      sector: inst?.sector ?? null,
      accounts: [...new Set(lots.filter((l) => l.qty > EPS || l.realizedEUR || l.dividendsEUR).map((l) => l.account_id))],
      quantity: round(qty),
      avgPrice: qty > EPS ? costLocal / qty : 0,
      costEUR,
      price,
      valueEUR,
      unrealizedEUR,
      unrealizedPct: costEUR > EPS ? unrealizedEUR / costEUR : 0,
      realizedEUR,
      dividendsEUR,
      totalGainEUR: unrealizedEUR + realizedEUR + dividendsEUR,
      weight: 0,
      dayChangePct: quotes[symbol]?.change_pct ?? null,
      closed: qty <= EPS,
      firstBuy: firstBuys.sort()[0] ?? null,
    });
  }

  const holdingsValue = all.reduce((s, p) => s + p.valueEUR, 0);
  const cash = ledger.totalCash();
  const totalValue = holdingsValue + cash;
  for (const p of all) p.weight = totalValue > EPS ? p.valueEUR / totalValue : 0;

  const positions = all.filter((p) => !p.closed).sort((a, b) => b.valueEUR - a.valueEUR);
  const closedPositions = all.filter((p) => p.closed).sort((a, b) => b.realizedEUR - a.realizedEUR);

  // --- Accounts ---------------------------------------------------------------
  const accountIds = new Set<string>([...ledger.cash.keys(), ...ledger.contrib.keys()]);
  for (const l of ledger.lots.values()) accountIds.add(l.account_id);
  const accounts: AccountSummary[] = [...accountIds].map((account_id) => {
    let holdings = 0;
    for (const l of ledger.lots.values()) {
      if (l.account_id !== account_id || l.qty <= EPS) continue;
      holdings += l.qty * priceOn(l, today) * fxAt(currencyOf(l.symbol), today);
    }
    const cashEUR = ledger.cash.get(account_id) ?? 0;
    const contributionsEUR = ledger.contrib.get(account_id) ?? 0;
    const valueEUR = holdings + cashEUR;
    return { account_id, valueEUR, cashEUR, contributionsEUR, gainEUR: valueEUR - contributionsEUR };
  });

  const netContributions = ledger.totalContrib();
  const totalGain = totalValue - netContributions;
  const dayChange = positions.reduce((s, p) => {
    if (p.dayChangePct == null) return s;
    const prev = p.valueEUR / (1 + p.dayChangePct / 100);
    return s + (p.valueEUR - prev);
  }, 0);

  for (const c of missingFx) warnings.push(`Taux de change ${c}→EUR indisponible : valeurs ${c} non converties.`);
  warnings.push(...ledger.warnings);

  return {
    summary: {
      totalValue,
      holdingsValue,
      cash,
      netContributions,
      totalGain,
      totalGainPct: netContributions > EPS ? totalGain / netContributions : 0,
      unrealized: positions.reduce((s, p) => s + p.unrealizedEUR, 0),
      realized: all.reduce((s, p) => s + p.realizedEUR, 0),
      dividends: all.reduce((s, p) => s + p.dividendsEUR, 0),
      fees: ledger.fees,
      dayChange,
    },
    positions,
    closedPositions,
    accounts,
    series,
    warnings,
  };
}

export type PeriodKey = '1M' | '6M' | '1Y' | 'YTD' | 'ALL';

export interface PeriodPerformance {
  start: string;
  /** Change in (value − contributions) over the period, EUR */
  gain: number;
  /** Time-weighted return over the period */
  twrPct: number;
  points: SeriesPoint[];
}

export function periodStart(period: PeriodKey, today: string): string | null {
  const d = new Date(today + 'T00:00:00Z');
  switch (period) {
    case '1M':
      d.setUTCMonth(d.getUTCMonth() - 1);
      break;
    case '6M':
      d.setUTCMonth(d.getUTCMonth() - 6);
      break;
    case '1Y':
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      break;
    case 'YTD':
      return `${d.getUTCFullYear() - 1}-12-31`;
    case 'ALL':
      return null;
  }
  return d.toISOString().slice(0, 10);
}

export function periodPerformance(series: SeriesPoint[], period: PeriodKey, today: string): PeriodPerformance {
  if (series.length === 0) return { start: today, gain: 0, twrPct: 0, points: [] };
  const startDate = periodStart(period, today);
  let startIdx = 0;
  if (startDate) {
    // last point on or before startDate (so the period starts from a known value)
    for (let i = 0; i < series.length; i++) {
      if (series[i].date <= startDate) startIdx = i;
      else break;
    }
  }
  const points = series.slice(startIdx);
  const first = points[0];
  const last = points[points.length - 1];
  return {
    start: first.date,
    gain: last.gain - first.gain,
    twrPct: first.twr > 0 ? last.twr / first.twr - 1 : 0,
    points,
  };
}
