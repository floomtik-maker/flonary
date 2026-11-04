import type { Point } from './types';

/** Index of the last point whose date is <= `date`, or -1. Points must be sorted ascending. */
export function indexAtOrBefore(points: Point[], date: string): number {
  let lo = 0;
  let hi = points.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= date) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Forward-filled value at `date` (last known value on or before). Undefined when the series starts later. */
export function valueAt(points: Point[] | undefined, date: string): number | undefined {
  if (!points || points.length === 0) return undefined;
  const i = indexAtOrBefore(points, date);
  return i >= 0 ? points[i][1] : undefined;
}

/** Like valueAt but falls back to the first point when `date` is before the series (useful for FX). */
export function valueAtOrFirst(points: Point[] | undefined, date: string): number | undefined {
  if (!points || points.length === 0) return undefined;
  const i = indexAtOrBefore(points, date);
  return i >= 0 ? points[i][1] : points[0][1];
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toISODate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}

/** Sorted unique union of dates. */
export function unionDates(...lists: string[][]): string[] {
  const set = new Set<string>();
  for (const l of lists) for (const d of l) set.add(d);
  return [...set].sort();
}
