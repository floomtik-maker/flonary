import { describe, expect, it } from 'vitest';
import { addMonths, dividendIncome } from './income';
import type { Transaction } from '../../shared/types';

const div = (date: string, amount: number, currency = 'EUR', fx_rate?: number): Transaction => ({
  id: date + amount,
  account_id: 'a',
  date,
  type: 'DIVIDEND',
  symbol: 'X',
  quantity: 0,
  price: 0,
  fees: 0,
  amount,
  currency,
  fx_rate,
});
const toEUR = (t: Transaction) => t.amount * (t.fx_rate ?? 1);

describe('addMonths', () => {
  it('wraps years both ways', () => {
    expect(addMonths('2026-11-01', 2)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
    expect(addMonths('2026-11-01', -11)).toBe('2025-12-01');
  });
});

describe('dividendIncome', () => {
  const today = '2026-11-05';
  it('sums trailing and expected dividends, buckets by month', () => {
    const r = dividendIncome({
      transactions: [div('2025-11-05', 100), div('2025-11-06', 10), div('2026-03-15', 20, 'USD', 0.9), div('2026-11-01', 5), { ...div('2026-06-01', 999), type: 'DEPOSIT' }],
      toEUR,
      events: [
        { kind: 'ex_dividend', date: '2026-12-10', expectedEUR: 30 },
        { kind: 'dividend_payment', date: '2026-12-20', expectedEUR: 30 },
        { kind: 'earnings', date: '2027-01-10' },
        { kind: 'ex_dividend', date: '2027-11-05', expectedEUR: 7 },
        { kind: 'ex_dividend', date: '2027-12-01', expectedEUR: 1000 },
      ],
      costBasis: 1000,
      today,
    });
    expect(r.trailing12m).toBeCloseTo(10 + 18 + 5);
    expect(r.next12m).toBe(37);
    expect(r.yieldOnCost).toBeCloseTo(0.033);
    expect(r.months).toHaveLength(24);
    expect(r.months[0]).toEqual({ month: '2025-12-01', received: 0, expected: 0 });
    expect(r.months.find((m) => m.month === '2026-03-01')!.received).toBeCloseTo(18);
    expect(r.months.find((m) => m.month === '2026-11-01')!.received).toBe(5);
    expect(r.months.find((m) => m.month === '2026-12-01')!.expected).toBe(30);
    expect(r.months[23]).toEqual({ month: '2027-11-01', received: 0, expected: 7 });
  });
  it('has no yield without cost basis', () => {
    expect(dividendIncome({ transactions: [], toEUR, events: [], costBasis: 0, today }).yieldOnCost).toBeNull();
  });
});
