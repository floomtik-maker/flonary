import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncAllConnections } from './sync-all';
import { seal } from '../crypto';
import type { Env } from '../env';
import { fetchFlexStatement } from './ibkr';
import { parseIbkrFlexXml } from '../../shared/importers/ibkr';

const FLEX = `<FlexQueryResponse queryName="flonary" type="AF"><FlexStatements count="1"><FlexStatement accountId="U123">
<Trades>
<Trade accountId="U123" currency="USD" assetCategory="STK" symbol="AAPL" description="APPLE INC" isin="US0378331005" listingExchange="NASDAQ" tradeID="111" tradeDate="20250102" quantity="10" tradePrice="185.5" ibCommission="-1" buySell="BUY" />
<Trade accountId="U123" currency="EUR" assetCategory="STK" symbol="MC" description="LVMH MOET HENNESSY" listingExchange="SBF" tradeID="112" tradeDate="2025-03-05" quantity="-2" tradePrice="700" ibCommission="-3" buySell="SELL" />
</Trades>
<CashTransactions>
<CashTransaction currency="EUR" dateTime="20250101" amount="5000" type="Deposits/Withdrawals" transactionID="902" />
</CashTransactions>
</FlexStatement></FlexStatements></FlexQueryResponse>`;

type Row = Record<string, unknown>;

/** Minimal in-memory D1: understands only the statements used by the sync path. */
function fakeD1() {
  const t = { accounts: [] as Row[], connections: [] as Row[], transactions: [] as Row[], instruments: [] as Row[] };
  const exec = (sql: string, a: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT id, user_id, account_id, provider, config FROM connections')) return { rows: t.connections };
    if (s.startsWith('SELECT id FROM accounts')) return { rows: t.accounts.filter((r) => r.id === a[0] && r.user_id === a[1]) };
    if (s.startsWith('SELECT id, external_id FROM transactions'))
      return { rows: t.transactions.filter((r) => r.user_id === a[0] && a.slice(1).includes(r.external_id)) };
    if (s.startsWith('SELECT id FROM transactions')) return { rows: t.transactions.filter((r) => r.user_id === a[0] && a.slice(1).includes(r.id)) };
    if (s.startsWith('INSERT OR IGNORE INTO instruments')) {
      if (!t.instruments.some((r) => r.user_id === a[0] && r.symbol === a[1])) t.instruments.push({ user_id: a[0], symbol: a[1], name: a[2], currency: a[3], asset_class: a[4], isin: a[7] });
      return { rows: [] };
    }
    if (s.startsWith('INSERT INTO transactions')) {
      const cols = ['id', 'user_id', 'account_id', 'date', 'type', 'symbol', 'quantity', 'price', 'fees', 'amount', 'currency', 'fx_rate', 'note', 'source', 'external_id'];
      t.transactions.push(Object.fromEntries(cols.map((c, i) => [c, a[i]])));
      return { rows: [] };
    }
    if (s.startsWith('UPDATE connections SET last_sync')) {
      const c = t.connections.find((r) => r.id === a[2]);
      if (c) Object.assign(c, { last_sync: a[0], last_status: a[1] });
      return { rows: [] };
    }
    throw new Error('fakeD1: unsupported SQL ' + s);
  };
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind: (...a: unknown[]) => ((args = a), stmt),
      first: async () => exec(sql, args).rows[0] ?? null,
      all: async () => ({ results: exec(sql, args).rows, success: true }),
      run: async () => (exec(sql, args), { success: true }),
    };
    return stmt;
  };
  const db = { prepare, batch: async (stmts: { run: () => Promise<unknown> }[]) => Promise.all(stmts.map((s) => s.run())) };
  return { db: db as unknown as D1Database, t };
}

function mockIbkrFetch(failToken?: string) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/SendRequest')) {
      if (url.searchParams.get('t') === failToken)
        return new Response('<FlexStatementResponse><Status>Fail</Status><ErrorCode>1012</ErrorCode><ErrorMessage>Token has expired.</ErrorMessage></FlexStatementResponse>');
      return new Response('<FlexStatementResponse><Status>Success</Status><ReferenceCode>42</ReferenceCode></FlexStatementResponse>');
    }
    return new Response(FLEX);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function setup(secret = 'k') {
  const { db, t } = fakeD1();
  const env = { DB: db, SECRETS_KEY: secret } as unknown as Env;
  for (const [user, acc, conn, token] of [
    ['u1', 'a1', 'c1', '111111'],
    ['u2', 'a2', 'c2', '222222'],
  ]) {
    t.accounts.push({ id: acc, user_id: user });
    t.connections.push({ id: conn, user_id: user, account_id: acc, provider: 'ibkr_flex', config: await seal(JSON.stringify({ token, queryId: '9999' }), secret) });
  }
  return { env, t };
}

async function run(env: Env) {
  // real syncIbkr flow against the mocked fetch, without IBKR's 3 s polling wait
  return syncAllConnections(env, { delayMs: 1, fetchParsed: async (tk, q) => parseIbkrFlexXml(await fetchFlexStatement(tk, q, { waitMs: 0 })) });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('syncAllConnections', () => {
  it('imports every connection, per user, and is idempotent', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { env, t } = await setup();
    mockIbkrFetch();
    expect(await run(env)).toEqual({ ok: 2, failed: 0 });
    expect(t.transactions).toHaveLength(6);
    expect(t.transactions.filter((r) => r.user_id === 'u1').every((r) => r.account_id === 'a1')).toBe(true);
    expect(t.instruments.map((r) => `${r.user_id}:${r.symbol}`).sort()).toEqual(['u1:AAPL', 'u1:MC.PA', 'u2:AAPL', 'u2:MC.PA']);
    expect(t.connections[0].last_status).toMatch(/^OK — 3 nouvelle/);

    expect(await run(env)).toEqual({ ok: 2, failed: 0 });
    expect(t.transactions).toHaveLength(6);
    expect(t.connections[1].last_status).toMatch(/0 nouvelle\(s\) opération\(s\), 3 déjà présente/);
  });

  it('keeps going when one connection fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { env, t } = await setup();
    mockIbkrFetch('111111');
    expect(await run(env)).toEqual({ ok: 1, failed: 1 });
    expect(t.connections[0].last_status).toContain('Token has expired');
    expect(String(t.connections[0].last_status)).toMatch(/^Erreur/);
    expect(t.transactions.every((r) => r.user_id === 'u2')).toBe(true);
    expect(t.transactions).toHaveLength(3);
  });

  it('records an error when the config cannot be decrypted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { env, t } = await setup();
    (env as { SECRETS_KEY?: string }).SECRETS_KEY = 'wrong';
    mockIbkrFetch();
    expect(await run(env)).toEqual({ ok: 0, failed: 2 });
    expect(String(t.connections[1].last_status)).toMatch(/^Erreur/);
  });
});
