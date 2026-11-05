import type { Transaction } from '../../shared/types';

export interface IncomeMonth {
  /** First day of the month, YYYY-MM-01 */
  month: string;
  received: number;
  expected: number;
}

export interface IncomeSummary {
  /** Dividends received over the last 12 months (EUR) */
  trailing12m: number;
  /** Dividends expected over the next 12 months (EUR) */
  next12m: number;
  /** trailing12m / cost basis; null when nothing is invested */
  yieldOnCost: number | null;
  /** 12 past months (current month included) then the next 12 months */
  months: IncomeMonth[];
}

/** Shifts a YYYY-MM-01 month key by `n` months. */
export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
}

/**
 * Aggregates dividend income: received (DIVIDEND transactions, converted with `toEUR`)
 * over the trailing 12 months and expected (upcoming ex-dividend events) over the next 12.
 */
export function dividendIncome(opts: {
  transactions: Transaction[];
  /** Converts a transaction amount to EUR */
  toEUR: (t: Transaction) => number;
  events: { kind: string; date: string; expectedEUR?: number | null }[];
  /** Cost basis of the shares held, EUR */
  costBasis: number;
  today: string;
}): IncomeSummary {
  const { today } = opts;
  const current = today.slice(0, 7) + '-01';
  const first = addMonths(current, -11);
  const months: IncomeMonth[] = [];
  for (let i = -11; i <= 12; i++) months.push({ month: addMonths(current, i), received: 0, expected: 0 });
  const idx = new Map(months.map((m, i) => [m.month, i]));

  // Trailing 12 months = same day one year ago (exclusive) → today
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  let trailing12m = 0;
  for (const t of opts.transactions) {
    if (t.type !== 'DIVIDEND' || t.date > today) continue;
    const v = opts.toEUR(t);
    if (t.date > yearAgo) trailing12m += v;
    const k = t.date.slice(0, 7) + '-01';
    if (k >= first) months[idx.get(k)!].received += v;
  }

  const horizon = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  let next12m = 0;
  for (const e of opts.events) {
    if (e.kind !== 'ex_dividend' || !e.expectedEUR || e.date < today || e.date > horizon) continue;
    next12m += e.expectedEUR;
    const k = e.date.slice(0, 7) + '-01';
    const i = idx.get(k);
    if (i != null) months[i].expected += e.expectedEUR;
  }

  return { trailing12m, next12m, yieldOnCost: opts.costBasis > 0 ? trailing12m / opts.costBasis : null, months };
}
