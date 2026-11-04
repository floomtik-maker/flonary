import type { CalendarEvent, InstrumentProfile, PriceHistory } from './types';
import { addDays, daysBetween } from './series';

export interface UpcomingEvent extends CalendarEvent {
  name: string;
  /** Expected cash for the user's position, in EUR (dividends only) */
  expectedEUR?: number | null;
}

interface HeldPosition {
  symbol: string;
  name: string;
  quantity: number;
  currency: string;
}

/**
 * Merges announced events (profile) with dividend dates estimated from last year's
 * history (same date + 1 year) when nothing is announced yet.
 */
export function upcomingEvents(opts: {
  positions: HeldPosition[];
  histories: Record<string, PriceHistory | undefined>;
  profiles: Record<string, InstrumentProfile | undefined>;
  fxToEUR: (currency: string) => number;
  today: string;
  horizonDays?: number;
}): UpcomingEvent[] {
  const { positions, histories, profiles, fxToEUR, today, horizonDays = 365 } = opts;
  const end = addDays(today, horizonDays);
  const out: UpcomingEvent[] = [];

  for (const p of positions) {
    const announced = (profiles[p.symbol]?.events ?? []).filter((e) => e.date >= today && e.date <= end);
    const announcedDivDates = announced.filter((e) => e.kind === 'ex_dividend').map((e) => e.date);
    const lastDiv = histories[p.symbol]?.dividends?.at(-1);
    for (const e of announced) {
      const amount = e.amount ?? (e.kind !== 'earnings' ? lastDiv?.[1] : undefined) ?? null;
      out.push({
        ...e,
        name: p.name,
        amount,
        currency: e.currency ?? p.currency,
        expectedEUR: e.kind === 'ex_dividend' && amount ? amount * p.quantity * fxToEUR(p.currency) : null,
      });
    }
    {
      const divs = histories[p.symbol]?.dividends ?? [];
      const yearAgo = addDays(today, -365);
      for (const [d, amount] of divs) {
        if (d < addDays(yearAgo, -15)) continue;
        let next = addDays(d, 365);
        while (next < today) next = addDays(next, 365);
        if (next > end) continue;
        // skip if an actual dividend already happened close to that date
        if (divs.some(([d2]) => Math.abs(daysBetween(d2, next)) < 20)) continue;
        // already announced (exact date known)
        if (announcedDivDates.some((d2) => Math.abs(daysBetween(d2, next)) < 45)) continue;
        out.push({
          symbol: p.symbol,
          name: p.name,
          date: next,
          kind: 'ex_dividend',
          estimated: true,
          amount,
          currency: p.currency,
          expectedEUR: amount * p.quantity * fxToEUR(p.currency),
        });
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Trailing 12-month dividend per share and yield. */
export function dividendYield(history: PriceHistory | undefined, today: string): { ttm: number; yield: number } | null {
  if (!history?.dividends?.length || !history.points.length) return null;
  const since = addDays(today, -365);
  const ttm = history.dividends.filter(([d]) => d > since).reduce((s, [, v]) => s + v, 0);
  const price = history.points[history.points.length - 1][1];
  return { ttm, yield: price > 0 ? ttm / price : 0 };
}
