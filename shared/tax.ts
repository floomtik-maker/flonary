/**
 * Tax & fees summary (pure). Realized gains use the same weighted-average
 * cost method as shared/portfolio.ts (fees included in cost, sale fees
 * deducted from proceeds), converted to EUR at the transaction date.
 *
 * French rules are simplified and the result is an ESTIMATE:
 *  - CTO / CRYPTO: PFU 30 % (12,8 % IR + 17,2 % PS) on the year's net
 *    realized gains (losses of the year offset gains, floored at 0) + dividends.
 *  - PEA / PEE / PER / AV: 0 € while money stays inside the envelope.
 */
import { BASE_CURRENCY, type Account, type PriceHistory, type Transaction } from './types';
import { sortTransactions } from './portfolio';
import { valueAtOrFirst } from './series';

export const PFU_RATE = 0.3;
export const SOCIAL_RATE = 0.172;

export type Envelope = 'CTO' | 'PEA' | 'PEE' | 'PER' | 'AV' | 'CRYPTO' | 'OTHER';

export function envelopeOf(kind: string | undefined | null): Envelope {
  const k = (kind ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  if (k.startsWith('PEA')) return 'PEA';
  if (k === 'PEE') return 'PEE';
  if (k.startsWith('PER')) return 'PER';
  if (k === 'AV' || k.startsWith('ASSURANCE')) return 'AV';
  if (k.startsWith('CRYPTO')) return 'CRYPTO';
  if (k === 'CTO' || k === '') return 'CTO';
  return 'OTHER';
}

/** Envelopes taxed every year on realized gains and dividends. */
export function isTaxableEachYear(env: Envelope): boolean {
  return env === 'CTO' || env === 'CRYPTO' || env === 'OTHER';
}

export interface YearRow {
  year: number;
  /** Realized gains net of realized losses (EUR) */
  realized: number;
  gains: number;
  losses: number;
  dividends: number;
  fees: number;
}

export interface AccountTax {
  account_id: string;
  envelope: Envelope;
  years: YearRow[];
  fees: number;
  /** Gross amount invested (purchases incl. fees + FEE), EUR */
  invested: number;
}

export interface TaxSummary {
  accounts: AccountTax[];
  /** All accounts combined, sorted by year descending */
  years: YearRow[];
  /** Taxable envelopes only (CTO…), for the tax return (2074 / 3VG) */
  taxableYears: YearRow[];
  fees: number;
  invested: number;
  feesPct: number;
  currentYear: number;
  /** Estimated tax for the current year (EUR) */
  estimatedTax: number;
  realizedThisYear: number;
}

export interface TaxInput {
  transactions: Transaction[];
  accounts: Account[];
  fx: Record<string, [string, number][]>;
  today: string;
  /** Optional: split events, to keep quantities consistent with the engine */
  prices?: Record<string, PriceHistory>;
}

const EPS = 1e-9;

function emptyYear(year: number): YearRow {
  return { year, realized: 0, gains: 0, losses: 0, dividends: 0, fees: 0 };
}

export function computeTax(input: TaxInput): TaxSummary {
  const { fx, today } = input;
  const fxAt = (ccy: string, date: string, tx?: Transaction): number => {
    if (tx?.fx_rate && tx.fx_rate > 0) return tx.fx_rate;
    if (!ccy || ccy === BASE_CURRENCY) return 1;
    if (ccy === 'GBp' || ccy === 'GBX') return fxAt('GBP', date) / 100;
    return valueAtOrFirst(fx[ccy], date) ?? 1;
  };
  const envOf = new Map(input.accounts.map((a) => [a.id, envelopeOf(a.kind)]));
  const txs = sortTransactions(input.transactions.filter((t) => t.date <= today));
  const splits = Object.values(input.prices ?? {})
    .flatMap((h) => (h.splits ?? []).map(([date, ratio]) => ({ date, ratio, symbol: h.symbol })))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const lots = new Map<string, { qty: number; cost: number }>();
  const accs = new Map<string, { years: Map<number, YearRow>; fees: number; invested: number }>();
  const acc = (id: string) => {
    let a = accs.get(id);
    if (!a) accs.set(id, (a = { years: new Map(), fees: 0, invested: 0 }));
    return a;
  };
  const yr = (id: string, date: string) => {
    const y = Number(date.slice(0, 4));
    const a = acc(id);
    let r = a.years.get(y);
    if (!r) a.years.set(y, (r = emptyYear(y)));
    return r;
  };

  let si = 0;
  for (const tx of txs) {
    while (si < splits.length && splits[si].date <= tx.date) {
      const s = splits[si++];
      if (!(s.ratio > 0)) continue;
      for (const [k, l] of lots) if (k.endsWith('|' + s.symbol)) l.qty *= s.ratio;
    }
    const fx = fxAt(tx.currency, tx.date, tx);
    const a = acc(tx.account_id);
    const key = tx.account_id + '|' + tx.symbol;
    switch (tx.type) {
      case 'FEE': {
        const eur = tx.amount * fx;
        a.fees += eur;
        a.invested += eur;
        yr(tx.account_id, tx.date).fees += eur;
        break;
      }
      case 'DIVIDEND':
        yr(tx.account_id, tx.date).dividends += tx.amount * fx;
        break;
      case 'BUY': {
        if (!tx.symbol) break;
        const feeEur = (tx.fees || 0) * fx;
        const eur = (tx.quantity * tx.price + (tx.fees || 0)) * fx;
        const l = lots.get(key) ?? { qty: 0, cost: 0 };
        l.qty += tx.quantity;
        l.cost += eur;
        lots.set(key, l);
        a.fees += feeEur;
        a.invested += eur;
        yr(tx.account_id, tx.date).fees += feeEur;
        break;
      }
      case 'SELL': {
        if (!tx.symbol) break;
        const l = lots.get(key) ?? { qty: 0, cost: 0 };
        const qty = Math.min(tx.quantity, l.qty);
        const share = l.qty > EPS ? qty / l.qty : 0;
        const cost = l.cost * share;
        const feeEur = (tx.fees || 0) * fx;
        const pnl = (qty * tx.price - (tx.fees || 0)) * fx - cost;
        l.qty -= qty;
        l.cost -= cost;
        if (l.qty < EPS) l.qty = l.cost = 0;
        lots.set(key, l);
        const r = yr(tx.account_id, tx.date);
        r.realized += pnl;
        if (pnl >= 0) r.gains += pnl;
        else r.losses += -pnl;
        r.fees += feeEur;
        a.fees += feeEur;
        break;
      }
    }
  }

  const byYearDesc = (m: Iterable<YearRow>) => [...m].sort((x, y) => y.year - x.year);
  const merge = (rows: YearRow[]) => {
    const m = new Map<number, YearRow>();
    for (const r of rows) {
      const t = m.get(r.year) ?? emptyYear(r.year);
      t.realized += r.realized;
      t.gains += r.gains;
      t.losses += r.losses;
      t.dividends += r.dividends;
      t.fees += r.fees;
      m.set(r.year, t);
    }
    return byYearDesc(m.values());
  };

  const accounts: AccountTax[] = [...accs.entries()].map(([id, a]) => ({
    account_id: id,
    envelope: envOf.get(id) ?? 'CTO',
    years: byYearDesc(a.years.values()),
    fees: a.fees,
    invested: a.invested,
  }));
  const currentYear = Number(today.slice(0, 4));
  const taxableYears = merge(accounts.filter((a) => isTaxableEachYear(a.envelope)).flatMap((a) => a.years));
  const cur = taxableYears.find((r) => r.year === currentYear);
  const estimatedTax = cur ? (Math.max(0, cur.realized) + Math.max(0, cur.dividends)) * PFU_RATE : 0;
  const years = merge(accounts.flatMap((a) => a.years));
  const fees = accounts.reduce((s, a) => s + a.fees, 0);
  const invested = accounts.reduce((s, a) => s + a.invested, 0);
  return {
    accounts,
    years,
    taxableYears,
    fees,
    invested,
    feesPct: invested > 0 ? fees / invested : 0,
    currentYear,
    estimatedTax,
    realizedThisYear: years.find((r) => r.year === currentYear)?.realized ?? 0,
  };
}
