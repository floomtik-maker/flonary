/** Wealth-goal helpers (same monthly compounding convention as `project` in shared/analysis.ts). */

/** Whole months from `from` to `to` (ISO dates), never negative. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const m = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(0, m);
}

/**
 * Monthly investment needed to grow `current` into `target` in `months` months at `annualReturn`
 * (growth applied monthly, then the deposit). 0 when the current value already gets there.
 * Infinity when there is no time left and the target is not reached.
 */
export function requiredMonthly(current: number, target: number, months: number, annualReturn: number): number {
  if (months <= 0) return current >= target ? 0 : Infinity;
  const r = Math.pow(1 + annualReturn, 1 / 12) - 1;
  const growth = Math.pow(1 + r, months);
  const gap = target - current * growth;
  if (gap <= 0) return 0;
  const annuity = r === 0 ? months : (growth - 1) / r;
  return gap / annuity;
}

/** Share of the goal already reached, clamped to [0, 1]. */
export const goalProgress = (current: number, target: number) => (target > 0 ? Math.min(1, Math.max(0, current / target)) : 0);
