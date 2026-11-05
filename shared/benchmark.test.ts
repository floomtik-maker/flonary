import { describe, expect, it } from 'vitest';
import { simulateBenchmark } from './benchmark';
import type { SeriesPoint } from './portfolio';

const pt = (date: string, value: number, contributions: number): SeriesPoint => ({ date, value, contributions, gain: value - contributions, twr: 1 });

describe('simulateBenchmark', () => {
  it('invests the same flows on the same dates', () => {
    const r = simulateBenchmark(
      [pt('2025-01-01', 1000, 1000), pt('2025-02-01', 1500, 1500), pt('2025-03-01', 1800, 1500)],
      [['2025-01-01', 100], ['2025-02-01', 125], ['2025-03-01', 150]],
    )!;
    // 10 units, then +4 units = 14 units × 150
    expect(r.series.map((s) => s.value)).toEqual([1000, 1750, 2100]);
    expect(r.finalValue).toBe(2100);
    expect(r.gain).toBe(600);
    expect(r.difference).toBe(-300);
  });

  it('sells units on withdrawals', () => {
    const r = simulateBenchmark(
      [pt('2025-01-01', 1000, 1000), pt('2025-02-01', 800, 500)],
      [['2025-01-01', 100], ['2025-02-01', 200]],
    )!;
    // 10 units → 2000 €, withdraw 500 € = 2.5 units → 7.5 × 200
    expect(r.finalValue).toBe(1500);
    expect(r.gain).toBe(1000);
  });

  it('forward-fills missing prices and uses the first price before the series', () => {
    const r = simulateBenchmark(
      [pt('2024-12-30', 1000, 1000), pt('2025-01-04', 1000, 1000), pt('2025-01-10', 1000, 1000)],
      [['2025-01-02', 100], ['2025-01-03', 110]],
    )!;
    expect(r.series.map((s) => s.value)).toEqual([1000, 1100, 1100]);
  });

  it('starts from the portfolio value when comparing a window', () => {
    const r = simulateBenchmark([pt('2025-06-01', 2000, 1000), pt('2025-07-01', 2000, 1000)], [['2025-06-01', 50], ['2025-07-01', 60]])!;
    expect(r.finalValue).toBeCloseTo(2400, 9);
    expect(r.gain).toBeCloseTo(400, 9);
  });

  it('returns null without prices', () => {
    expect(simulateBenchmark([pt('2025-01-01', 1, 1)], [])).toBeNull();
  });
});
