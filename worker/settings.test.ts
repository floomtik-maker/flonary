import { describe, expect, it } from 'vitest';
import { canEditMarketKey, saveMarketSettings } from './settings';
import type { Env } from './env';

/** Minimal D1 stand-in: only answers `SELECT value FROM app_settings WHERE key = ?`. */
const fakeDb = (rows: Record<string, string>) =>
  ({
    prepare: () => ({ bind: (key: string) => ({ first: async () => (key in rows ? { value: rows[key] } : null), run: async () => ({}) }) }),
  }) as unknown as D1Database;

describe('site-wide market key ownership', () => {
  it('only the owner (or anyone while unowned) can edit', () => {
    expect(canEditMarketKey(null, 'u1')).toBe(true);
    expect(canEditMarketKey('u1', 'u1')).toBe(true);
    expect(canEditMarketKey('u1', 'u2')).toBe(false);
  });
  it('refuses another user replacing an existing key', async () => {
    const env = { DB: fakeDb({ eodhd_api_key: 'plain:abcd', eodhd_owner: 'owner' }) } as unknown as Env;
    await expect(saveMarketSettings(env, 'intruder', { apiKey: 'ZZZZ1234' })).rejects.toMatchObject({ status: 403 });
  });
});
