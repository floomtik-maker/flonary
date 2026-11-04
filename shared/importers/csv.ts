/**
 * Generic CSV import with column auto-detection (FR/EN/DE headers), plus presets for
 * Interactive Brokers Flex CSV and Trade Republic exports (pytr format).
 */
import type { Transaction, TxType } from '../types';
import { ibkrDate, ibkrRecordsToTransactions, ibkrSymbol } from './ibkr';

export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const counts = [';', ',', '\t', '|'].map((d) => [d, first.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/** RFC4180-ish parser (quotes, escaped quotes, newlines in quotes). */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export type Field = 'date' | 'type' | 'symbol' | 'isin' | 'name' | 'quantity' | 'price' | 'fees' | 'amount' | 'currency' | 'id';

export const FIELD_LABELS: Record<Field, string> = {
  date: 'Date',
  type: 'Type (achat/vente…)',
  symbol: 'Ticker',
  isin: 'ISIN',
  name: 'Nom',
  quantity: 'Quantité',
  price: 'Prix unitaire',
  fees: 'Frais',
  amount: 'Montant',
  currency: 'Devise',
  id: 'Identifiant',
};

const SYNONYMS: Record<Field, string[]> = {
  date: ['date', 'tradedate', 'trade date', 'datum', 'date/time', 'datetime', "date d'opération", 'date operation', 'date de valeur'],
  type: ['type', 'sens', 'operation', 'opération', 'buy/sell', 'buysell', 'typ', 'action', 'side', 'transaction type'],
  symbol: ['symbol', 'ticker', 'symbole', 'code', 'mnémo', 'mnemo'],
  isin: ['isin', 'code isin'],
  name: ['name', 'nom', 'libellé', 'libelle', 'description', 'titre', 'instrument', 'produit', 'product'],
  quantity: ['quantity', 'quantité', 'quantite', 'qty', 'shares', 'stück', 'stuck', 'nombre', 'parts', 'nb parts'],
  price: ['price', 'prix', 'tradeprice', 'cours', 'prix unitaire', 'unit price', 'kurs', 't. price', 'valeur liquidative'],
  fees: ['fees', 'frais', 'commission', 'ibcommission', 'gebühren', 'gebuhren', 'comm/fee', 'courtage'],
  amount: ['amount', 'montant', 'value', 'wert', 'total', 'net amount', 'montant net'],
  currency: ['currency', 'devise', 'currencyprimary', 'währung', 'monnaie'],
  id: ['id', 'tradeid', 'transactionid', 'reference', 'référence'],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function detectMapping(headers: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  const h = headers.map(norm);
  for (const f of Object.keys(SYNONYMS) as Field[]) {
    const idx = h.findIndex((x) => SYNONYMS[f].includes(x));
    if (idx >= 0) map[f] = idx;
  }
  return map;
}

/** "1 234,56" / "1,234.56" / "-12,5 €" → number */
export function parseNumber(v: string | undefined): number {
  if (v == null) return NaN;
  let s = v.replace(/[^\d,.\-+eE]/g, '');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  return Number(s);
}

/** 2025-01-02 | 02/01/2025 | 02.01.2025 | 20250102 → ISO */
export function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return ibkrDate(t);
}

export function parseType(v: string | undefined, quantity: number, amount: number): TxType | null {
  const s = norm(v ?? '');
  if (/^(buy|achat|acheter|kauf|b|a|souscription|savings plan|plan d'investissement|versement libre investi)/.test(s) || s.includes('achat') || s === 'bot') return 'BUY';
  if (/^(sell|vente|vendre|verkauf|s|v|rachat|sld)/.test(s) || s.includes('vente')) return 'SELL';
  if (/(dividend|dividende|coupon|ausschüttung|distribution|interest|intérêt|zinsen)/.test(s)) return 'DIVIDEND';
  if (/(deposit|dépôt|depot|versement|virement entrant|einzahlung)/.test(s)) return 'DEPOSIT';
  if (/(withdraw|retrait|removal|auszahlung|virement sortant)/.test(s)) return 'WITHDRAWAL';
  if (/(fee|frais|gebühr|tax|impôt|taxe)/.test(s)) return 'FEE';
  if (!s && quantity) return quantity > 0 ? 'BUY' : 'SELL';
  if (!s && amount) return amount > 0 ? 'DEPOSIT' : 'WITHDRAWAL';
  return null;
}

export interface CsvRowResult {
  tx: Omit<Transaction, 'id' | 'account_id'> | null;
  /** ISIN to resolve into a ticker before saving, when no ticker column */
  isin?: string;
  name?: string;
  error?: string;
  line: number;
}

export function rowsToTransactions(rows: string[][], mapping: Partial<Record<Field, number>>, defaultCurrency = 'EUR'): CsvRowResult[] {
  const get = (r: string[], f: Field) => (mapping[f] != null ? r[mapping[f]!]?.trim() : undefined);
  return rows.map((r, i): CsvRowResult => {
    const line = i + 2;
    const date = parseDate(get(r, 'date'));
    if (!date) return { tx: null, line, error: 'date illisible' };
    const qtyRaw = parseNumber(get(r, 'quantity'));
    const amountRaw = parseNumber(get(r, 'amount'));
    const type = parseType(get(r, 'type'), qtyRaw || 0, amountRaw || 0);
    if (!type) return { tx: null, line, error: `type inconnu « ${get(r, 'type') ?? ''} »` };
    const isin = get(r, 'isin')?.toUpperCase() || undefined;
    const symbol = get(r, 'symbol') || null;
    const quantity = Math.abs(qtyRaw || 0);
    let price = Math.abs(parseNumber(get(r, 'price')) || 0);
    if (!price && quantity && amountRaw) price = Math.abs(amountRaw) / quantity;
    const fees = Math.abs(parseNumber(get(r, 'fees')) || 0);
    const currency = (get(r, 'currency') || defaultCurrency).toUpperCase();
    const trade = type === 'BUY' || type === 'SELL';
    if (trade && (!quantity || !price)) return { tx: null, line, error: 'quantité ou prix manquant' };
    if (trade && !symbol && !isin) return { tx: null, line, error: 'ticker ou ISIN manquant' };
    if (!trade && !Number.isFinite(amountRaw)) return { tx: null, line, error: 'montant manquant' };
    const id = get(r, 'id');
    return {
      line,
      isin,
      name: get(r, 'name'),
      tx: {
        date,
        type,
        symbol: symbol ?? (isin ? `isin:${isin}` : null),
        quantity: trade ? quantity : 0,
        price: trade ? price : 0,
        fees,
        amount: trade ? 0 : type === 'DIVIDEND' ? amountRaw : Math.abs(amountRaw),
        currency,
        fx_rate: currency === 'EUR' ? 1 : null,
        source: 'csv',
        external_id: id ? `csv:${id}` : `csv:${date}:${type}:${symbol ?? isin ?? ''}:${quantity}:${price}:${amountRaw || 0}`,
      },
    };
  });
}

/** IBKR Flex CSV: header row contains "TradeDate"/"Buy/Sell" etc. */
export function looksLikeIbkr(headers: string[]): boolean {
  const h = headers.map((x) => x.toLowerCase());
  return h.includes('tradeprice') || (h.includes('buy/sell') && h.includes('listingexchange'));
}

export function parseIbkrCsv(rows: string[][]) {
  const [header, ...data] = rows;
  const keys = header.map((h) => h.trim().toLowerCase());
  const recs = data.filter((r) => r.length === header.length && r.join('') !== header.join('')).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]])));
  const trades = recs.filter((r) => r['tradeprice'] !== undefined && r['tradeprice'] !== '');
  const cash = recs.filter((r) => r['tradeprice'] === undefined && r['amount'] !== undefined);
  return ibkrRecordsToTransactions(trades, cash);
}

export { ibkrSymbol };
