import { describe, expect, it } from 'vitest';
import { goalProgress, monthsBetween, requiredMonthly } from './goal';
import { project } from '../../shared/analysis';

describe('goal', () => {
  it('counts whole months', () => {
    expect(monthsBetween('2026-01-15', '2027-01-15')).toBe(12);
    expect(monthsBetween('2026-01-15', '2027-01-14')).toBe(11);
    expect(monthsBetween('2027-01-01', '2026-01-01')).toBe(0);
  });

  it('matches the projection engine', () => {
    const m = requiredMonthly(10_000, 100_000, 120, 0.07);
    const end = project({ initial: 10_000, monthly: m, years: 10, annualReturn: 0.07, startDate: '2026-01-01' }).at(-1)!;
    expect(end.value).toBeCloseTo(100_000, 0);
  });

  it('handles zero return, reached goals and no time left', () => {
    expect(requiredMonthly(0, 1200, 12, 0)).toBeCloseTo(100);
    expect(requiredMonthly(200_000, 100_000, 12, 0.05)).toBe(0);
    expect(requiredMonthly(10, 100, 0, 0.05)).toBe(Infinity);
    expect(goalProgress(50, 200)).toBe(0.25);
    expect(goalProgress(500, 200)).toBe(1);
  });
});
