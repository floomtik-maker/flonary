import { describe, expect, it } from 'vitest';
import { computeTax, envelopeOf } from './tax';
import type { Account, Transaction } from './types';

let n = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: String(++n), account_id: 'cto', date: '2026-01-01', type: 'BUY', symbol: 'AAA',
  quantity: 0, price: 0, fees: 0, amount: 0, currency: 'EUR', ...p,
});
const accounts: Account[] = [
  { id: 'cto', name: 'IBKR', broker: 'ibkr', kind: 'CTO' },
  { id: 'pea', name: 'TR', broker: 'trade_republic', kind: 'PEA' },
];

describe('computeTax', () => {
  it('computes realized gains with weighted-average cost, fees and PFU estimate', () => {
    const r = computeTax({
      accounts, fx: {}, today: '2026-11-05',
      transactions: [
        tx({ date: '2025-03-01', quantity: 10, price: 100, fees: 10 }), // cost 1010
        tx({ date: '2025-06-01', quantity: 10, price: 120, fees: 10 }), // cost 1210 → avg 111
        tx({ date: '2026-02-01', type: 'SELL', quantity: 10, price: 150, fees: 10 }), // 1490 − 1110 = 380
        tx({ date: '2026-03-01', type: 'BUY', symbol: 'BBB', quantity: 5, price: 100 }),
        tx({ date: '2026-04-01', type: 'SELL', symbol: 'BBB', quantity: 5, price: 80 }), // −100
        tx({ date: '2026-05-01', type: 'DIVIDEND', amount: 50 }),
        tx({ date: '2026-06-01', type: 'FEE', symbol: null, amount: 5 }),
      ],
    });
    const y = r.years.find((x) => x.year === 2026)!;
    expect(y.realized).toBeCloseTo(280);
    expect(y.gains).toBeCloseTo(380);
    expect(y.losses).toBeCloseTo(100);
    expect(y.dividends).toBeCloseTo(50);
    expect(y.fees).toBeCloseTo(15);
    expect(r.fees).toBeCloseTo(35);
    expect(r.invested).toBeCloseTo(1010 + 1210 + 500 + 5);
    expect(r.estimatedTax).toBeCloseTo((280 + 50) * 0.3);
    expect(r.realizedThisYear).toBeCloseTo(280);
  });

  it('PEA gains are not taxed while inside; net loss year gives 0 tax', () => {
    const r = computeTax({
      accounts, fx: {}, today: '2026-11-05',
      transactions: [
        tx({ account_id: 'pea', date: '2026-01-02', quantity: 1, price: 100 }),
        tx({ account_id: 'pea', date: '2026-02-02', type: 'SELL', quantity: 1, price: 300 }),
        tx({ date: '2026-01-02', symbol: 'CCC', quantity: 1, price: 100 }),
        tx({ date: '2026-02-02', type: 'SELL', symbol: 'CCC', quantity: 1, price: 50 }),
      ],
    });
    expect(r.realizedThisYear).toBeCloseTo(150);
    expect(r.taxableYears[0].realized).toBeCloseTo(-50);
    expect(r.estimatedTax).toBe(0);
  });

  it('converts with fx_rate or the FX series and handles splits', () => {
    const r = computeTax({
      accounts, fx: { USD: [['2026-01-01', 0.9], ['2026-06-01', 0.8]] }, today: '2026-11-05',
      prices: { AAA: { symbol: 'AAA', currency: 'USD', points: [], splits: [['2026-03-01', 2]] } },
      transactions: [
        tx({ date: '2026-01-05', quantity: 10, price: 100, currency: 'USD', fees: 1, fx_rate: 0.95 }), // 1001 × 0.95 = 950.95 EUR
        tx({ date: '2026-07-01', type: 'SELL', quantity: 20, price: 60, currency: 'USD' }), // 1200 × 0.8 = 960
      ],
    });
    expect(r.years[0].realized).toBeCloseTo(960 - 950.95);
    expect(r.fees).toBeCloseTo(0.95);
  });

  it('maps account kinds to envelopes', () => {
    expect(envelopeOf('PEA-PME')).toBe('PEA');
    expect(envelopeOf('pee')).toBe('PEE');
    expect(envelopeOf('PERCO')).toBe('PER');
    expect(envelopeOf('AV')).toBe('AV');
    expect(envelopeOf('')).toBe('CTO');
  });
});
