/**
 * Flonary API — Cloudflare Worker (Hono). Static assets (the React app) are served by
 * the Workers assets binding; only /api/* reaches this code (see wrangler.toml).
 */
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { currentUser, HttpError, login, logout, register, requireUser, sameOrigin, type AppEnv } from './auth';
import { getUserData, saveTransactions, upsertInstrument, validateInstrument, assertAccount } from './data';
import { getFx, getHistories, getQuotes, profile, providers, search } from './market';
import { ProviderError } from './market/types';
import { seal, unseal, uuid } from './crypto';
import { syncIbkr } from './connectors/ibkr';
import { googleCallback, googleEnabled, googleStart } from './google';
import { guessCountry } from '../shared/geo';
import type { Instrument } from '../shared/types';

const app = new Hono<AppEnv>().basePath('/api');

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  if (err instanceof ProviderError) return c.json({ error: err.message }, err.status as ContentfulStatusCode);
  console.error(err);
  return c.json({ error: 'Erreur interne' }, 500);
});

app.use('*', sameOrigin);
app.use('*', async (c, next) => {
  await next();
  c.header('cache-control', 'no-store');
  c.header('x-content-type-options', 'nosniff');
});

const body = async <T = Record<string, unknown>>(c: { req: { json: () => Promise<unknown> } }): Promise<T> => {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new HttpError(400, 'Corps JSON invalide');
  }
};

// ---------------------------------------------------------------- health
app.get('/health', (c) =>
  c.json({ ok: true, providers: providers(c.env).map((p) => p.name), google: googleEnabled(c), signup: c.env.ALLOW_SIGNUP !== 'false' }),
);

// ---------------------------------------------------------------- auth
app.post('/auth/register', async (c) => {
  const b = await body(c);
  return c.json(await register(c, b.email, b.password));
});
app.post('/auth/login', async (c) => {
  const b = await body(c);
  return c.json(await login(c, b.email, b.password));
});
app.get('/auth/google', (c) => googleStart(c));
app.get('/auth/google/callback', (c) => googleCallback(c));
app.post('/auth/logout', async (c) => {
  await logout(c);
  return c.json({ ok: true });
});
app.get('/auth/me', async (c) => {
  const u = await currentUser(c);
  if (!u) return c.json({ error: 'Non connecté' }, 401);
  return c.json(u);
});

// Everything below requires a session
const api = new Hono<AppEnv>();
api.use('*', requireUser);

api.get('/data', async (c) => c.json(await getUserData(c.env.DB, c.var.userId)));

// ---------------------------------------------------------------- accounts
api.post('/accounts', async (c) => {
  const b = await body(c);
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
  if (!name) throw new HttpError(422, 'Nom du compte requis');
  const broker = ['ibkr', 'trade_republic', 'bnp_pee', 'other'].includes(b.broker as string) ? (b.broker as string) : 'other';
  const kind = typeof b.kind === 'string' && b.kind.trim() ? b.kind.trim().slice(0, 20).toUpperCase() : 'CTO';
  const userId = c.var.userId;
  if (typeof b.id === 'string' && b.id) {
    const r = await c.env.DB.prepare('UPDATE accounts SET name=?, broker=?, kind=? WHERE id=? AND user_id=?').bind(name, broker, kind, b.id, userId).run();
    if (!r.meta.changes) throw new HttpError(404, 'Compte introuvable');
    return c.json({ id: b.id, name, broker, kind });
  }
  const id = uuid();
  await c.env.DB.prepare('INSERT INTO accounts (id, user_id, name, broker, kind) VALUES (?,?,?,?,?)').bind(id, userId, name, broker, kind).run();
  return c.json({ id, name, broker, kind });
});
api.delete('/accounts/:id', async (c) => {
  const id = c.req.param('id');
  await assertAccount(c.env.DB, c.var.userId, id);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM transactions WHERE account_id = ? AND user_id = ?').bind(id, c.var.userId),
    c.env.DB.prepare('DELETE FROM connections WHERE account_id = ? AND user_id = ?').bind(id, c.var.userId),
    c.env.DB.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').bind(id, c.var.userId),
  ]);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- transactions
api.post('/transactions', async (c) => {
  const b = await body<{ transactions: unknown[] }>(c);
  return c.json(await saveTransactions(c.env.DB, c.var.userId, b.transactions));
});
api.delete('/transactions/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.var.userId).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- instruments & manual prices
api.put('/instruments', async (c) => {
  const i = validateInstrument(await body(c));
  await upsertInstrument(c.env.DB, c.var.userId, i);
  return c.json(i);
});
api.post('/manual-prices', async (c) => {
  const b = await body(c);
  const symbol = typeof b.symbol === 'string' ? b.symbol.slice(0, 64) : '';
  const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : '';
  const price = Number(b.price);
  if (!symbol || !date || !(price > 0)) throw new HttpError(422, 'Date et valeur positive requises');
  await c.env.DB.prepare('INSERT INTO manual_prices (user_id, symbol, date, price) VALUES (?,?,?,?) ON CONFLICT(user_id, symbol, date) DO UPDATE SET price=excluded.price')
    .bind(c.var.userId, symbol, date, price)
    .run();
  return c.json({ ok: true });
});
api.delete('/manual-prices', async (c) => {
  await c.env.DB.prepare('DELETE FROM manual_prices WHERE user_id = ? AND symbol = ? AND date = ?').bind(c.var.userId, c.req.query('symbol') ?? '', c.req.query('date') ?? '').run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- backup restore (replaces everything)
api.post('/restore', async (c) => {
  const b = await body<{ accounts?: unknown[]; transactions?: unknown[]; instruments?: unknown[]; manualPrices?: Record<string, [string, number][]> }>(c);
  if (!Array.isArray(b.accounts) || !Array.isArray(b.transactions)) throw new HttpError(422, 'Fichier de sauvegarde invalide');
  const db = c.env.DB;
  const userId = c.var.userId;
  await db.batch([
    db.prepare('DELETE FROM transactions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM connections WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM accounts WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM instruments WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM manual_prices WHERE user_id = ?').bind(userId),
  ]);
  const idMap = new Map<string, string>();
  const accStmts = (b.accounts as Record<string, string>[]).map((a) => {
    const id = uuid();
    idMap.set(a.id, id);
    return db.prepare('INSERT INTO accounts (id, user_id, name, broker, kind) VALUES (?,?,?,?,?)').bind(id, userId, String(a.name ?? 'Compte').slice(0, 80), a.broker ?? 'other', a.kind ?? 'CTO');
  });
  if (accStmts.length) await db.batch(accStmts);
  const txs = (b.transactions as Record<string, unknown>[])
    .filter((t) => idMap.has(t.account_id as string))
    .map((t) => ({ ...t, id: uuid(), account_id: idMap.get(t.account_id as string) }));
  await saveTransactions(db, userId, txs);
  for (const i of b.instruments ?? []) await upsertInstrument(db, userId, validateInstrument(i as Record<string, unknown>));
  const mp: D1PreparedStatement[] = [];
  for (const [symbol, pts] of Object.entries(b.manualPrices ?? {}))
    for (const [d, p] of pts) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && p > 0) mp.push(db.prepare('INSERT OR REPLACE INTO manual_prices (user_id, symbol, date, price) VALUES (?,?,?,?)').bind(userId, symbol, d, p));
  for (let i = 0; i < mp.length; i += 100) await db.batch(mp.slice(i, i + 100));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- market data
api.get('/market/history', async (c) => {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('from') ?? '') ? c.req.query('from')! : '2015-01-01';
  const { data, errors } = await getHistories(c.env, c.req.query('symbols') ?? null, from);
  if (Object.keys(data).length === 0 && Object.keys(errors).length > 0) {
    const first = Object.values(errors)[0];
    throw new ProviderError(first, first.includes('Aucune source') ? 503 : 502);
  }
  return c.json(data);
});
api.get('/market/quotes', async (c) => c.json(await getQuotes(c.env, c.req.query('symbols') ?? null)));
api.get('/market/fx', async (c) => {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('from') ?? '') ? c.req.query('from')! : '2015-01-01';
  return c.json(await getFx(c.env, c.req.query('currencies') ?? null, from));
});
api.get('/market/search', async (c) => c.json(await search(c.env, c.req.query('q') ?? '')));
api.get('/market/profile', async (c) => {
  const symbol = c.req.query('symbol') ?? '';
  if (!symbol) throw new HttpError(400, 'symbol requis');
  return c.json(await profile(c.env, symbol));
});

// ---------------------------------------------------------------- broker connections
api.get('/connections', async (c) => {
  const rows = await c.env.DB.prepare('SELECT id, provider, account_id, label, last_sync, last_status FROM connections WHERE user_id = ? ORDER BY created_at').bind(c.var.userId).all();
  return c.json(rows.results);
});
api.post('/connections', async (c) => {
  const b = await body(c);
  const accountId = String(b.account_id ?? '');
  await assertAccount(c.env.DB, c.var.userId, accountId);
  const token = String(b.token ?? '').trim();
  const queryId = String(b.query_id ?? '').trim();
  if (!/^\d{6,30}$/.test(token) || !/^\d{3,15}$/.test(queryId)) throw new HttpError(422, 'Jeton (chiffres) et identifiant de requête Flex requis');
  const id = uuid();
  const label = String(b.label ?? 'Interactive Brokers').slice(0, 80);
  const config = await seal(JSON.stringify({ token, queryId }), c.env.SECRETS_KEY);
  await c.env.DB.prepare('INSERT INTO connections (id, user_id, account_id, provider, label, config) VALUES (?,?,?,?,?,?)').bind(id, c.var.userId, accountId, 'ibkr_flex', label, config).run();
  return c.json({ id, provider: 'ibkr_flex', account_id: accountId, label, last_sync: null, last_status: null });
});
api.delete('/connections/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM connections WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.var.userId).run();
  return c.json({ ok: true });
});
api.post('/connections/:id/sync', async (c) => {
  const userId = c.var.userId;
  const conn = await c.env.DB.prepare('SELECT id, account_id, provider, config FROM connections WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), userId)
    .first<{ id: string; account_id: string; provider: string; config: string }>();
  if (!conn) throw new HttpError(404, 'Connexion introuvable');
  const setStatus = (s: string) =>
    c.env.DB.prepare('UPDATE connections SET last_sync = ?, last_status = ? WHERE id = ?').bind(new Date().toISOString(), s.slice(0, 300), conn.id).run();
  try {
    const { token, queryId } = JSON.parse(await unseal(conn.config, c.env.SECRETS_KEY)) as { token: string; queryId: string };
    const parsed = await syncIbkr(token, queryId);
    for (const [symbol, n] of Object.entries(parsed.names)) {
      const inst: Instrument = {
        symbol,
        name: n.name,
        currency: n.currency,
        asset_class: n.assetCategory === 'ETF' || /ETF|UCITS/i.test(n.name) ? 'etf' : 'stock',
        country: guessCountry(symbol, n.name),
        isin: n.isin && n.isin.length === 12 ? n.isin : null,
      };
      await upsertInstrument(c.env.DB, userId, inst, false);
    }
    const res = await saveTransactions(
      c.env.DB,
      userId,
      parsed.transactions.map((t) => ({ ...t, id: uuid(), account_id: conn.account_id })),
    );
    const msg = `${res.inserted} nouvelle(s) opération(s), ${res.skipped} déjà présente(s)`;
    await setStatus('OK — ' + msg);
    return c.json({ ...res, message: [msg, ...parsed.warnings.slice(0, 3)].join(' · ') });
  } catch (e) {
    await setStatus('Erreur — ' + (e as Error).message);
    throw new HttpError(502, (e as Error).message);
  }
});

app.route('/', api);

export default app;
