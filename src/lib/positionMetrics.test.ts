import { describe, expect, it } from 'vitest';
import type { PriceHistory } from '../../shared/types';
import { adjustedCloses, positionMetrics, priceChange } from './positionMetrics';

const hist = (points: [string, number][], extra: Partial<PriceHistory> = {}): PriceHistory => ({ symbol: 'X', currency: 'EUR', points, ...extra });

/** Daily closes growing 1 % a day from 2025-01-01, `n` days */
function growing(n: number, start = '2025-01-01'): [string, number][] {
  const out: [string, number][] = [];
  const d = new Date(start + 'T00:00:00Z');
  let v = 100;
  for (let i = 0; i < n; i++) {
    out.push([d.toISOString().slice(0, 10), v]);
    v *= 1.01;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe('priceChange', () => {
  const h = hist([
    ['2026-01-02', 100],
    ['2026-06-01', 120],
    ['2026-11-06', 150],
  ]);
  it('compares the last price with the close on or before the reference date', () => {
    expect(priceChange(h, 150, '2026-06-01')).toBeCloseTo(0.25);
    expect(priceChange(h, 150, '2026-08-01')).toBeCloseTo(0.25);
  });
  it('is null when the history starts after the reference date', () => {
    expect(priceChange(h, 150, '2025-11-08')).toBeNull();
  });
  it('is null without history or price', () => {
    expect(priceChange(undefined, 150, '2026-06-01')).toBeNull();
    expect(priceChange(h, 0, '2026-06-01')).toBeNull();
  });
  it('is not distorted by a split (raw closes are not adjusted)', () => {
    // 4-for-1 split on 2026-06-02: price falls from 120 to ~30, which is flat, not -75 %
    const s = hist(
      [
        ['2026-01-02', 100],
        ['2026-06-01', 120],
        ['2026-06-02', 30],
        ['2026-11-06', 33],
      ],
      { splits: [['2026-06-02', 4]] },
    );
    expect(priceChange(s, 33, '2026-06-01')).toBeCloseTo(0.1);
    expect(adjustedCloses(s)).toEqual([25, 30, 30, 33]);
  });
});

describe('positionMetrics', () => {
  const today = '2025-12-31';
  const base = { symbol: 'X', quantity: 10, price: 0, today, fxToEUR: (c: string) => (c === 'USD' ? 0.5 : 1) };

  it('computes windows, risk and income from a full history', () => {
    const points = growing(365);
    const price = points.at(-1)![1];
    const dividends: [string, number][] = [['2025-06-01', 1], ['2025-09-01', 1]];
    const m = positionMetrics({ ...base, price, history: hist(points, { dividends, currency: 'USD' }) });
    expect(m.w1).toBeGreaterThan(0.06);
    expect(m.m1).toBeGreaterThan(m.w1!);
    expect(m.ytd).not.toBeNull();
    expect(m.dividendPerShare).toBe(2);
    expect(m.yield).toBeCloseTo(2 / price);
    expect(m.incomeEUR).toBeCloseTo(2 * 10 * 0.5);
    expect(m.vol).toBeCloseTo(0, 5); // constant daily growth: no volatility
    expect(m.risk).toBe(1);
    expect(m.drawdown).toBe(0);
  });

  it('leaves long windows empty on a short history', () => {
    const points = growing(40, '2025-11-20');
    const m = positionMetrics({ ...base, price: points.at(-1)![1], history: hist(points) });
    expect(m.y1).toBeNull();
    expect(m.ytd).toBeNull();
    expect(m.yield).toBeNull();
  });

  it('gives no market statistics for manual valuations', () => {
    const m = positionMetrics({
      ...base,
      symbol: 'manual:pee',
      price: 120,
      history: hist([['2025-01-01', 100], ['2025-06-01', 110], ['2025-12-01', 120]]),
    });
    expect(m.y1).toBeCloseTo(0.2);
    expect(m.vol).toBeNull();
    expect(m.risk).toBeNull();
  });
});
