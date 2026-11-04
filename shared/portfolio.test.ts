import { describe, expect, it } from 'vitest';
import { computePortfolio, periodPerformance, sortTransactions } from './portfolio';
import type { Instrument, Transaction } from './types';

let n = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: String(++n),
  account_id: 'a1',
  date: '2025-01-02',
  type: 'BUY',
  symbol: 'AAA',
  quantity: 0,
  price: 0,
  fees: 0,
  amount: 0,
  currency: 'EUR',
  ...p,
});

const instruments: Record<string, Instrument> = {
  AAA: { symbol: 'AAA', name: 'Alpha', currency: 'EUR', asset_class: 'stock', country: 'France' },
  BBB: { symbol: 'BBB', name: 'Beta', currency: 'EUR', asset_class: 'stock', country: 'France' },
  USD1: { symbol: 'USD1', name: 'Yankee', currency: 'USD', asset_class: 'stock', country: 'États-Unis' },
};

describe('computePortfolio', () => {
  it('computes PRU and unrealized gain with fees in cost basis', () => {
    const r = computePortfolio({
      transactions: [
        tx({ date: '2025-01-02', quantity: 10, price: 100, fees: 2 }),
        tx({ date: '2025-02-03', quantity: 10, price: 120 }),
      ],
      instruments,
      prices: { AAA: { symbol: 'AAA', currency: 'EUR', points: [['2025-03-01', 130]] } },
      fx: {},
      today: '2025-03-01',
    });
    const p = r.positions[0];
    expect(p.quantity).toBe(20);
    expect(p.avgPrice).toBeCloseTo(110.1, 6);
    expect(p.valueEUR).toBeCloseTo(2600);
    expect(p.unrealizedEUR).toBeCloseTo(2600 - 2202);
    expect(r.summary.netContributions).toBeCloseTo(2202);
    expect(r.summary.totalGain).toBeCloseTo(398);
  });

  it('keeps realized gains in value and performance after a sale (cash pocket)', () => {
    const r = computePortfolio({
      transactions: [
        tx({ date: '2025-01-02', quantity: 10, price: 100 }),
        tx({ date: '2025-06-02', type: 'SELL', quantity: 10, price: 120 }),
      ],
      instruments,
      prices: { AAA: { symbol: 'AAA', currency: 'EUR', points: [['2025-06-02', 120], ['2025-07-01', 50]] } },
      fx: {},
      today: '2025-07-01',
    });
    expect(r.positions).toHaveLength(0);
    expect(r.closedPositions[0].realizedEUR).toBeCloseTo(200);
    // 1000 invested, sold for 1200: the +20 % stays in the portfolio
    expect(r.summary.totalValue).toBeCloseTo(1200);
    expect(r.summary.cash).toBeCloseTo(1200);
    expect(r.summary.totalGain).toBeCloseTo(200);
    expect(r.summary.totalGainPct).toBeCloseTo(0.2);
    expect(r.summary.realized).toBeCloseTo(200);
  });

  it('reinvesting sale proceeds does not count as new money', () => {
    const r = computePortfolio({
      transactions: [
        tx({ date: '2025-01-02', quantity: 10, price: 100 }),
        tx({ date: '2025-06-02', type: 'SELL', quantity: 10, price: 120 }),
        tx({ date: '2025-06-02', symbol: 'BBB', quantity: 15, price: 100 }),
      ],
      instruments,
      prices: {
        AAA: { symbol: 'AAA', currency: 'EUR', points: [['2025-06-02', 120]] },
        BBB: { symbol: 'BBB', currency: 'EUR', points: [['2025-06-02', 100], ['2025-07-01', 110]] },
      },
      fx: {},
      today: '2025-07-01',
    });
    // 1200 from the sale + 300 of new money
    expect(r.summary.netContributions).toBeCloseTo(1300);
    expect(r.summary.cash).toBeCloseTo(0);
    expect(r.summary.totalValue).toBeCloseTo(1650);
    expect(r.summary.totalGain).toBeCloseTo(350); // 200 realized + 150 unrealized
    expect(r.summary.realized).toBeCloseTo(200);
    expect(r.summary.unrealized).toBeCloseTo(150);
  });

  it('partial sale uses average cost', () => {
    const r = computePortfolio({
      transactions: [
        tx({ date: '2025-01-02', quantity: 10, price: 100 }),
        tx({ date: '2025-02-02', quantity: 10, price: 200 }),
        tx({ date: '2025-03-02', type: 'SELL', quantity: 5, price: 180 }),
      ],
      instruments,
      prices: { AAA: { symbol: 'AAA', currency: 'EUR', points: [['2025-03-02', 180]] } },
      fx: {},
      today: '2025-03-02',
    });
    const p = r.positions[0];
    expect(p.quantity).toBe(15);
    expect(p.avgPrice).toBeCloseTo(150);
    expect(p.realizedEUR).toBeCloseTo(5 * 30);
  });

  it('converts foreign currencies at the transaction date rate', () => {
    const r = computePortfolio({
      transactions: [tx({ date: '2025-01-02', symbol: 'USD1', quantity: 10, price: 100, currency: 'USD' })],
      instruments,
      prices: { USD1: { symbol: 'USD1', currency: 'USD', points: [['2025-01-02', 100], ['2025-03-01', 100]] } },
      fx: { USD: [['2025-01-02', 0.9], ['2025-03-01', 1.0]] },
      today: '2025-03-01',
    });
    expect(r.summary.netContributions).toBeCloseTo(900);
    expect(r.summary.totalValue).toBeCloseTo(1000);
    expect(r.positions[0].unrealizedEUR).toBeCloseTo(100); // pure FX gain
  });

  it('dividends, deposits and withdrawals', () => {
    const r = computePortfolio({
      transactions: [
        tx({ date: '2025-01-01', type: 'DEPOSIT', symbol: null, amount: 2000 }),
        tx({ date: '2025-01-02', quantity: 10, price: 100 }),
        tx({ date: '2025-04-02', type: 'DIVIDEND', amount: 30 }),
        tx({ date: '2025-05-02', type: 'WITHDRAWAL', symbol: null, amount: 500 }),
      ],
      instruments,
      prices: { AAA: { symbol: 'AAA', currency: 'EUR', points: [['2025-06-01', 100]] } },
      fx: {},
      today: '2025-06-01',
    });
    expect(r.summary.netContributions).toBeCloseTo(1500);
    expect(r.summary.cash).toBeCloseTo(530);
    expect(r.summary.totalValue).toBeCloseTo(1530);
    expect(r.summary.dividends).toBeCloseTo(30);
    expect(r.summary.totalGain).toBeCloseTo(30);
  });

  it('warns when selling more than held', () => {
    const r = computePortfolio({
      transactions: [tx({ quantity: 1, price: 10 }), tx({ date: '2025-01-03', type: 'SELL', quantity: 2, price: 10 })],
      instruments,
      prices: {},
      fx: {},
      today: '2025-02-01',
    });
    expect(r.warnings.length).toBe(1);
    expect(r.closedPositions[0].quantity).toBe(0);
  });

  it('time-weighted return ignores contributions', () => {
    const r = computePortfolio({
      transactions: [
        tx({ date: '2025-01-02', quantity: 10, price: 100 }),
        // price doubles, then a big new contribution at the high
        tx({ date: '2025-02-03', quantity: 100, price: 200 }),
      ],
      instruments,
      prices: { AAA: { symbol: 'AAA', currency: 'EUR', points: [['2025-01-02', 100], ['2025-02-03', 200], ['2025-03-03', 200]] } },
      fx: {},
      today: '2025-03-03',
    });
    const last = r.series[r.series.length - 1];
    expect(last.twr).toBeCloseTo(2);
    const perf = periodPerformance(r.series, 'ALL', '2025-03-03');
    expect(perf.twrPct).toBeCloseTo(1);
    expect(perf.gain).toBeCloseTo(1000);
  });

  it('sorts same-day transactions: sells before buys', () => {
    const s = sortTransactions([
      tx({ date: '2025-01-02', type: 'BUY' }),
      tx({ date: '2025-01-02', type: 'SELL' }),
      tx({ date: '2025-01-01', type: 'DEPOSIT' }),
    ]);
    expect(s.map((t) => t.type)).toEqual(['DEPOSIT', 'SELL', 'BUY']);
  });
});
