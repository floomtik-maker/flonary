/**
 * Background sync of every broker connection (all users), for the cron and the
 * per-connection sync route. One failing connection never stops the others.
 */
import type { Env } from '../env';
import type { ParsedImport } from '../../shared/importers/ibkr';
import type { Instrument } from '../../shared/types';
import { guessCountry } from '../../shared/geo';
import { saveTransactions, upsertInstrument } from '../data';
import { unseal, uuid } from '../crypto';
import { syncIbkr } from './ibkr';

export interface ConnectionRow {
  id: string;
  user_id: string;
  account_id: string;
  provider: string;
  config: string;
}

/** Creates missing instruments (never overwrites user edits) and inserts new transactions, deduplicated by external_id. */
export async function importParsed(db: D1Database, userId: string, accountId: string, parsed: ParsedImport) {
  for (const [symbol, n] of Object.entries(parsed.names)) {
    const inst: Instrument = {
      symbol,
      name: n.name,
      currency: n.currency,
      asset_class: n.assetCategory === 'ETF' || /ETF|UCITS/i.test(n.name) ? 'etf' : 'stock',
      country: guessCountry(symbol, n.name),
      isin: n.isin && n.isin.length === 12 ? n.isin : null,
    };
    await upsertInstrument(db, userId, inst, false);
  }
  const res = await saveTransactions(
    db,
    userId,
    parsed.transactions.map((t) => ({ ...t, id: uuid(), account_id: accountId })),
  );
  const message = `${res.inserted} nouvelle(s) opération(s), ${res.skipped} déjà présente(s)`;
  return { ...res, message, warnings: parsed.warnings };
}

export async function setConnectionStatus(db: D1Database, id: string, status: string) {
  await db.prepare('UPDATE connections SET last_sync = ?, last_status = ? WHERE id = ?').bind(new Date().toISOString(), status.slice(0, 300), id).run();
}

/** Syncs one connection and records its status. Throws on failure (after recording it). */
export async function syncConnection(env: Env, conn: ConnectionRow, fetchParsed: typeof syncIbkr = syncIbkr) {
  try {
    if (conn.provider !== 'ibkr_flex') throw new Error(`fournisseur inconnu (${conn.provider})`);
    const { token, queryId } = JSON.parse(await unseal(conn.config, env.SECRETS_KEY)) as { token: string; queryId: string };
    const parsed = await fetchParsed(token, queryId);
    const res = await importParsed(env.DB, conn.user_id, conn.account_id, parsed);
    await setConnectionStatus(env.DB, conn.id, 'OK — ' + res.message);
    return res;
  } catch (e) {
    await setConnectionStatus(env.DB, conn.id, 'Erreur — ' + ((e as Error)?.message ?? String(e))).catch(() => {});
    throw e;
  }
}

export async function syncAllConnections(
  env: Env,
  opts: { delayMs?: number; fetchParsed?: typeof syncIbkr } = {},
): Promise<{ ok: number; failed: number }> {
  const { delayMs = 2000, fetchParsed = syncIbkr } = opts;
  let ok = 0;
  let failed = 0;
  let rows: ConnectionRow[] = [];
  try {
    rows = (await env.DB.prepare('SELECT id, user_id, account_id, provider, config FROM connections ORDER BY created_at').all<ConnectionRow>()).results;
  } catch (e) {
    console.error('syncAllConnections: cannot list connections', e);
    return { ok, failed };
  }
  for (let i = 0; i < rows.length; i++) {
    // IBKR Flex rate-limits per token/IP: run sequentially with a pause between connections
    if (i > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      await syncConnection(env, rows[i], fetchParsed);
      ok++;
    } catch (e) {
      failed++;
      console.error(`syncAllConnections: ${rows[i].id} failed`, (e as Error)?.message ?? e);
    }
  }
  return { ok, failed };
}
