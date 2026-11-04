/** D1-backed cache with stale-if-error: if the provider fails, the last value is served. */
export async function cached<T>(db: D1Database, key: string, ttlMs: number, load: () => Promise<T>, isFresh?: (v: T) => boolean): Promise<T> {
  const row = await db.prepare('SELECT value, fetched_at FROM market_cache WHERE key = ?').bind(key).first<{ value: string; fetched_at: number }>();
  const value = row ? (JSON.parse(row.value) as T) : null;
  if (row && Date.now() - row.fetched_at < ttlMs && (!isFresh || isFresh(value as T))) return value as T;
  try {
    const fresh = await load();
    await db
      .prepare('INSERT INTO market_cache (key, value, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at')
      .bind(key, JSON.stringify(fresh), Date.now())
      .run();
    return fresh;
  } catch (e) {
    if (value != null) return value;
    throw e;
  }
}
