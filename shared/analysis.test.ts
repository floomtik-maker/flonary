import { describe, expect, it } from 'vitest';
import { computeSignals, maxDrawdown, project, riskClass, rsi, sma, volatility } from './analysis';
import type { Point } from './types';

describe('analysis', () => {
  it('sma', () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });

  it('rsi extremes', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(up)).toBe(100);
    const down = Array.from({ length: 30 }, (_, i) => 100 - i);
    expect(rsi(down)).toBeCloseTo(0);
  });

  it('max drawdown', () => {
    expect(maxDrawdown([100, 120, 60, 130])).toBeCloseTo(-0.5);
  });

  it('volatility and risk class', () => {
    const flat = Array.from({ length: 60 }, () => 100);
    expect(volatility(flat)).toBe(0);
    expect(riskClass(0)).toBe(1);
    expect(riskClass(0.12)).toBe(4);
    expect(riskClass(0.28)).toBe(5);
    expect(riskClass(0.5)).toBe(6);
  });

  it('signals on a rising series', () => {
    const pts: Point[] = Array.from({ length: 260 }, (_, i) => [
      new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
      100 + i * 0.5 + Math.sin(i / 5) * 3,
    ]);
    const s = computeSignals(pts, 120)!;
    expect(s.trend).toBe('up');
    expect(s.entryZone[0]).toBeLessThanOrEqual(s.entryZone[1]);
    expect(s.exitZone[0]).toBeGreaterThan(s.price);
    expect(s.stop).toBeLessThan(s.support);
  });

  it('projection compounds monthly', () => {
    const p = project({ initial: 1000, monthly: 100, years: 1, annualReturn: 0, startDate: '2025-01-01' });
    expect(p).toHaveLength(13);
    expect(p.at(-1)!.value).toBeCloseTo(2200);
    const g = project({ initial: 1000, monthly: 0, years: 10, annualReturn: 0.07, startDate: '2025-01-01' });
    expect(g.at(-1)!.value).toBeCloseTo(1000 * 1.07 ** 10, 3);
  });
});
