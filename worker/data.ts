/** User data access (D1). Every query is scoped by user_id. */
import type { Account, Instrument, Point, Transaction, TxType } from '../shared/types';
import { HttpError } from './auth';
import { uuid } from './crypto';

const TX_TYPES: TxType[] = ['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'FEE'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v: unknown, max: number, field: string, required = true): string | null => {
  if (v == null || v === '') {
    if (required) throw new HttpError(422, `Champ « ${field} » manquant`);
    return null;
  }
  if (typeof v !== 'string') throw new HttpError(422, `Champ « ${field} » invalide`);
  const s = v.trim();
  if (s.length > max) throw new HttpError(422, `Champ « ${field} » trop long`);
  return s;
};
const num = (v: unknown, field: string, def = 0): number => {
  if (v == null || v === '') return def;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new HttpError(422, `Champ « ${field} » invalide`);
  return n;
};

export function validateTransaction(t: Record<string, unknown>): Transaction {
  const type = t.type as TxType;
  if (!TX_TYPES.includes(type)) throw new HttpError(422, 'Type de transaction invalide');
  const date = str(t.date, 10, 'date')!;
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw new HttpError(422, 'Date invalide');
  const trade = type === 'BUY' || type === 'SELL';
  const symbol = str(t.symbol, 64, 'titre', trade || type === 'DIVIDEND' ? trade : false);
  const quantity = num(t.quantity, 'quantité');
  const price = num(t.price, 'prix');
  if (trade && (quantity <= 0 || price < 0)) throw new HttpError(422, 'Quantité et prix doivent être positifs');
  const fx = t.fx_rate == null || t.fx_rate === '' ? null : num(t.fx_rate, 'taux de change');
  if (fx != null && fx <= 0) throw new HttpError(422, 'Taux de change invalide');
  const currency = (str(t.currency, 3, 'devise') ?? 'EUR').toUpperCase();
  return {
    id: str(t.id, 64, 'id', false) ?? uuid(),
    account_id: str(t.account_id, 64, 'compte')!,
    date,
    type,
    symbol,
    quantity: trade ? quantity : 0,
    price: trade ? price : 0,
    fees: Math.abs(num(t.fees, 'frais')),
    amount: trade ? 0 : num(t.amount, 'montant'),
    currency: currency === 'GBP' && t.currency === 'GBp' ? 'GBp' : currency,
    fx_rate: fx,
    note: str(t.note, 300, 'note', false),
    source: (['manual', 'csv', 'ibkr', 'demo'].includes(t.source as string) ? t.source : 'manual') as Transaction['source'],
    external_id: str(t.external_id, 120, 'external_id', false),
  };
}

export function validateInstrument(i: Record<string, unknown>): Instrument {
  const classes = ['stock', 'etf', 'fund', 'crypto', 'bond', 'other'];
  return {
    symbol: str(i.symbol, 64, 'symbole')!,
    name: str(i.name, 120, 'nom')!,
    currency: str(i.currency, 3, 'devise')!,
    asset_class: (classes.includes(i.asset_class as string) ? i.asset_class : 'other') as Instrument['asset_class'],
    country: str(i.country, 60, 'pays', false),
    sector: str(i.sector, 60, 'secteur', false),
    isin: str(i.isin, 12, 'isin', false),
    manual: !!i.manual,
  };
}

export async function getUserData(db: D1Database, userId: string) {
  const [accounts, txs, instruments, prices] = await db.batch([
    db.prepare('SELECT id, name, broker, kind, created_at FROM accounts WHERE user_id = ? ORDER BY created_at').bind(userId),
    db
      .prepare(
        'SELECT id, account_id, date, type, symbol, quantity, price, fees, amount, currency, fx_rate, note, source, external_id FROM transactions WHERE user_id = ? ORDER BY date, created_at',
      )
      .bind(userId),
    db.prepare('SELECT symbol, name, currency, asset_class, country, sector, isin, manual FROM instruments WHERE user_id = ?').bind(userId),
    db.prepare('SELECT symbol, date, price FROM manual_prices WHERE user_id = ? ORDER BY date').bind(userId),
  ]);
  const manualPrices: Record<string, Point[]> = {};
  for (const r of prices.results as { symbol: string; date: string; price: number }[]) (manualPrices[r.symbol] ??= []).push([r.date, r.price]);
  return {
    accounts: accounts.results as unknown as Account[],
    transactions: txs.results as unknown as Transaction[],
    instruments: (instruments.results as (Omit<Instrument, 'manual'> & { manual: number })[]).map((i): Instrument => ({ ...i, manual: !!i.manual })),
    manualPrices,
  };
}

export async function assertAccount(db: D1Database, userId: string, accountId: string) {
  const a = await db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').bind(accountId, userId).first();
  if (!a) throw new HttpError(404, 'Compte introuvable');
}

/** Upsert transactions, skipping duplicates by external_id. */
export async function saveTransactions(db: D1Database, userId: string, raw: unknown[]): Promise<{ inserted: number; skipped: number }> {
  if (!Array.isArray(raw)) throw new HttpError(400, 'Liste de transactions attendue');
  if (raw.length > 5000) throw new HttpError(422, 'Maximum 5000 transactions par envoi');
  const txs = raw.map((r) => validateTransaction(r as Record<string, unknown>));
  const accountIds = [...new Set(txs.map((t) => t.account_id))];
  for (const a of accountIds) await assertAccount(db, userId, a);

  const ext = txs.map((t) => t.external_id).filter((x): x is string => !!x);
  const existing = new Set<string>();
  for (let i = 0; i < ext.length; i += 90) {
    const chunk = ext.slice(i, i + 90);
    const rows = await db
      .prepare(`SELECT id, external_id FROM transactions WHERE user_id = ? AND external_id IN (${chunk.map(() => '?').join(',')})`)
      .bind(userId, ...chunk)
      .all<{ id: string; external_id: string }>();
    for (const r of rows.results) existing.add(r.external_id + '|' + r.id);
  }
  const existingExt = new Set([...existing].map((x) => x.split('|')[0]));
  // (ids are client-generated UUIDs; an id owned by someone else fails on the primary key)
  const ownedIds = new Set<string>();
  const ids = txs.map((t) => t.id);
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows = await db
      .prepare(`SELECT id FROM transactions WHERE user_id = ? AND id IN (${chunk.map(() => '?').join(',')})`)
      .bind(userId, ...chunk)
      .all<{ id: string }>();
    for (const r of rows.results) ownedIds.add(r.id);
  }

  let inserted = 0;
  let skipped = 0;
  const stmts: D1PreparedStatement[] = [];
  const seenExt = new Set<string>();
  for (const t of txs) {
    const isUpdate = ownedIds.has(t.id);
    if (!isUpdate && t.external_id && (existingExt.has(t.external_id) || seenExt.has(t.external_id))) {
      skipped++;
      continue;
    }
    if (t.external_id) seenExt.add(t.external_id);
    if (isUpdate) {
      stmts.push(
        db
          .prepare(
            'UPDATE transactions SET account_id=?, date=?, type=?, symbol=?, quantity=?, price=?, fees=?, amount=?, currency=?, fx_rate=?, note=? WHERE id=? AND user_id=?',
          )
          .bind(t.account_id, t.date, t.type, t.symbol, t.quantity, t.price, t.fees, t.amount, t.currency, t.fx_rate ?? null, t.note ?? null, t.id, userId),
      );
    } else {
      inserted++;
      stmts.push(
        db
          .prepare(
            'INSERT INTO transactions (id, user_id, account_id, date, type, symbol, quantity, price, fees, amount, currency, fx_rate, note, source, external_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            t.id,
            userId,
            t.account_id,
            t.date,
            t.type,
            t.symbol,
            t.quantity,
            t.price,
            t.fees,
            t.amount,
            t.currency,
            t.fx_rate ?? null,
            t.note ?? null,
            t.source ?? 'manual',
            t.external_id ?? null,
          ),
      );
    }
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return { inserted, skipped };
}

export async function upsertInstrument(db: D1Database, userId: string, i: Instrument, overwrite = true) {
  const sql = overwrite
    ? 'INSERT INTO instruments (user_id, symbol, name, currency, asset_class, country, sector, isin, manual) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id, symbol) DO UPDATE SET name=excluded.name, currency=excluded.currency, asset_class=excluded.asset_class, country=excluded.country, sector=excluded.sector, isin=excluded.isin, manual=excluded.manual'
    : 'INSERT OR IGNORE INTO instruments (user_id, symbol, name, currency, asset_class, country, sector, isin, manual) VALUES (?,?,?,?,?,?,?,?,?)';
  await db
    .prepare(sql)
    .bind(userId, i.symbol, i.name, i.currency, i.asset_class, i.country ?? null, i.sector ?? null, i.isin ?? null, i.manual ? 1 : 0)
    .run();
}
