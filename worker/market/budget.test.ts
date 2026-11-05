import { describe, expect, it } from 'vitest';
import { newSymbolCap, spendNewSymbol } from './budget';
import type { Env } from '../env';

/** In-memory stand-in for the two market_cache statements used by spendNewSymbol. */
function fakeDb() {
  const rows = new Map<string, number>();
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        run: async () => {
          if (!rows.has(args[0] as string)) rows.set(args[0] as string, 0);
          return {};
        },
        first: async () => {
          const [key, cap] = args as [string, number];
          const v = (rows.get(key) ?? 0) + 1;
          if (!sql.startsWith('UPDATE') || v > cap) return null;
          rows.set(key, v);
          return { value: String(v) };
        },
      }),
    }),
  } as unknown as D1Database;
}

describe('per-user new-symbol cap', () => {
  it('is half the daily budget, at least 5', () => {
    expect(newSymbolCap({} as Env)).toBe(10);
    expect(newSymbolCap({ EODHD_DAILY_LIMIT: '4' } as Env)).toBe(5);
    expect(newSymbolCap({ EODHD_DAILY_LIMIT: '100000' } as Env)).toBe(50000);
  });
  it('stops one user at the cap without affecting others', async () => {
    const env = { DB: fakeDb() } as unknown as Env;
    for (let i = 0; i < 10; i++) await spendNewSymbol(env, 'a');
    await expect(spendNewSymbol(env, 'a')).rejects.toMatchObject({ status: 429 });
    await expect(spendNewSymbol(env, 'b')).resolves.toBeUndefined();
  });
});
