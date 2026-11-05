/**
 * CSV exports of French retail brokers → transactions.
 *
 * `detectBroker(headers)` recognises the file from its header row, `parseBrokerCsv(rows, format)`
 * converts it (rows[0] = header row) into the same `CsvRowResult[]` as `rowsToTransactions`.
 *
 * Provenance of each format (be honest about it — fix the spec when a real file disagrees):
 * - Degiro Transactions.csv / Account.csv: FR and EN headers as found in public sample files used
 *   by open-source importers (Portfolio Performance, degiro parsers). The unnamed columns
 *   (currency right after "Cours"/"Price", amount right after "Mouvements"/"Change") are a known
 *   quirk of these files. Newer EN exports name columns "Value EUR", "Total EUR", "AutoFX Fee":
 *   matched by prefix. → considered VERIFIED (not re-checked against a fresh 2026 export).
 * - Trade Republic official CSV export (web app, « Exporter les transactions », 2026): the
 *   existence of the export is documented (getquin, Blockpit help pages) but the column names
 *   were NOT found publicly → ASSUMED (snake_case EN names, as in pytr-like exports). The pytr
 *   format stays handled by shared/importers/csv.ts.
 * - Boursorama (« Mouvements » du compte titres / PEA), Fortuneo (historique des opérations
 *   bourse), Bourse Direct (historique des opérations), Saxo (Trades export): column names
 *   ASSUMED from the labels shown in each broker's web UI; no public sample found. Detection
 *   is therefore loose (synonyms, prefix match) and the generic CSV mapping remains the
 *   fallback in the import wizard.
 */
import type { TxType } from '../types';
import { parseDate, parseNumber, parseType, type CsvRowResult } from './csv';

export type BrokerFormat = 'degiro_transactions' | 'degiro_account' | 'trade_republic' | 'boursorama' | 'fortuneo' | 'bourse_direct' | 'saxo';

export const BROKER_LABELS: Record<BrokerFormat, string> = {
  degiro_transactions: 'Degiro (Transactions.csv)',
  degiro_account: 'Degiro (Account.csv — dividendes, versements, frais)',
  trade_republic: 'Trade Republic (export CSV officiel)',
  boursorama: 'Boursorama / BoursoBank',
  fortuneo: 'Fortuneo',
  bourse_direct: 'Bourse Direct',
  saxo: 'Saxo Banque',
};

/** Formats whose headers come from real sample files (others are best guesses). */
export const VERIFIED_FORMATS: BrokerFormat[] = ['degiro_transactions', 'degiro_account'];

type Col = 'date' | 'time' | 'type' | 'isin' | 'symbol' | 'name' | 'quantity' | 'price' | 'currency' | 'amount' | 'fees' | 'tax' | 'fx' | 'id';

interface Spec {
  /** Header synonyms per column (normalised: lower case, no accents). Exact match first, then prefix. */
  cols: Partial<Record<Col, string[]>>;
  /** Columns that must all be present to recognise the format. */
  required: Col[];
  /** Extra header that must be present (exact, normalised) — disambiguates similar formats. */
  marker?: string[];
}

const SPECS: Record<BrokerFormat, Spec> = {
  degiro_transactions: {
    cols: {
      date: ['date'],
      time: ['heure', 'time'],
      name: ['produit', 'product'],
      isin: ['code isin', 'isin'],
      quantity: ['quantite', 'quantity'],
      price: ['cours', 'price'],
      fees: ['frais de courtage', 'frais de transaction et/ou de tiers', 'transaction and/or third party fees', 'transaction costs', 'autofx fee'],
      fx: ['taux de change', 'exchange rate'],
      amount: ['montant negocie', 'total'],
      id: ['id ordre', 'order id'],
    },
    required: ['date', 'name', 'isin', 'quantity', 'price'],
    marker: ['lieu d\'execution', 'venue', 'place boursiere', 'reference exchange', 'bourse'],
  },
  degiro_account: {
    cols: {
      date: ['date'],
      time: ['heure', 'time'],
      name: ['produit', 'product'],
      isin: ['code isin', 'isin'],
      type: ['description'],
      fx: ['fx'],
      currency: ['mouvements', 'change'],
      id: ['id ordre', 'order id'],
    },
    required: ['date', 'type', 'currency'],
    marker: ['date de valeur', 'value date'],
  },
  trade_republic: {
    cols: {
      date: ['date', 'datetime'],
      type: ['type', 'category'],
      name: ['name', 'description'],
      isin: ['isin', 'symbol'],
      quantity: ['shares', 'quantity'],
      price: ['price'],
      amount: ['amount'],
      fees: ['fee', 'fees'],
      tax: ['tax', 'taxes'],
      currency: ['currency'],
      id: ['transaction_id', 'id'],
    },
    required: ['date', 'type', 'amount'],
    marker: ['transaction_id'],
  },
  boursorama: {
    cols: {
      date: ['date operation', 'date d\'operation', 'dateop', 'date'],
      type: ['operation', 'libelle operation', 'nature'],
      name: ['valeur', 'libelle', 'libelle valeur'],
      isin: ['code isin', 'isin'],
      quantity: ['quantite', 'qte'],
      price: ['cours', 'cours d\'execution', 'prix'],
      fees: ['frais', 'commission', 'courtage'],
      amount: ['montant net', 'montant'],
      currency: ['devise'],
    },
    required: ['date', 'type', 'quantity', 'amount'],
    marker: ['date valeur', 'date de valeur', 'dateval'],
  },
  fortuneo: {
    cols: {
      date: ['date'],
      type: ['operation'],
      name: ['libelle'],
      isin: ['code isin', 'isin'],
      quantity: ['qte', 'quantite'],
      price: ['prix d\'exe', 'prix d\'execution', 'cours'],
      fees: ['courtage', 'commission', 'frais'],
      amount: ['montant net', 'montant'],
      currency: ['devise'],
    },
    required: ['date', 'type', 'name', 'quantity'],
    marker: ['qte', 'prix d\'exe', 'montant brut'],
  },
  bourse_direct: {
    cols: {
      date: ['date d\'execution', 'date operation', 'date'],
      type: ['sens', 'operation', 'nature'],
      name: ['libelle', 'valeur'],
      isin: ['code isin', 'isin'],
      quantity: ['quantite', 'qte'],
      price: ['cours', 'cours d\'execution', 'prix'],
      fees: ['frais', 'courtage'],
      amount: ['montant net', 'net', 'montant'],
      currency: ['devise'],
    },
    required: ['date', 'type', 'quantity', 'isin'],
    marker: ['sens'],
  },
  saxo: {
    cols: {
      date: ['trade date', 'date de negociation', 'date'],
      type: ['buy/sell', 'achat/vente', 'event'],
      name: ['instrument', 'instrument description'],
      isin: ['instrument isin', 'isin'],
      symbol: ['instrument symbol'],
      quantity: ['quantity', 'quantite', 'amount'],
      price: ['price', 'prix'],
      fees: ['commission', 'total cost'],
      amount: ['booked amount', 'montant comptabilise'],
      currency: ['instrument currency', 'devise de l\'instrument'],
      id: ['trade id', 'id de transaction'],
    },
    required: ['date', 'type', 'quantity', 'price'],
    marker: ['trade id', 'instrument isin', 'booked amount'],
  },
};

// Order matters: most specific first.
const ORDER: BrokerFormat[] = ['degiro_account', 'degiro_transactions', 'trade_republic', 'saxo', 'fortuneo', 'boursorama', 'bourse_direct'];

const normH = (s: string) =>
  s
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ');

function mapColumns(headers: string[], spec: Spec): Partial<Record<Col, number>> {
  const h = headers.map(normH);
  const used = new Set<number>();
  const map: Partial<Record<Col, number>> = {};
  for (const col of Object.keys(spec.cols) as Col[]) {
    const syn = spec.cols[col]!;
    let idx = -1;
    for (const s of syn) {
      idx = h.findIndex((x, i) => !used.has(i) && x === s);
      if (idx >= 0) break;
    }
    if (idx < 0) for (const s of syn) {
      idx = h.findIndex((x, i) => !used.has(i) && x.length > 0 && x.startsWith(s + ' '));
      if (idx >= 0) break;
    }
    if (idx >= 0) {
      map[col] = idx;
      used.add(idx);
    }
  }
  return map;
}

/** All fee-like column indexes (Degiro has several, e.g. "AutoFX Fee" + "Transaction … fees EUR"). */
function feeColumns(headers: string[], spec: Spec): number[] {
  const syn = spec.cols.fees ?? [];
  return headers.map(normH).flatMap((x, i) => (syn.some((s) => x === s || x.startsWith(s + ' ')) ? [i] : []));
}

export function detectBroker(headers: string[]): BrokerFormat | null {
  const h = new Set(headers.map(normH));
  for (const f of ORDER) {
    const spec = SPECS[f];
    if (spec.marker && !spec.marker.some((m) => h.has(m))) continue;
    const map = mapColumns(headers, spec);
    if (spec.required.every((c) => map[c] != null)) return f;
  }
  return null;
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const cleanIsin = (v: string | undefined) => {
  const s = (v ?? '').trim().toUpperCase();
  return ISIN_RE.test(s) ? s : undefined;
};
const cur = (v: string | undefined, fallback = 'EUR') => {
  const s = (v ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(s) ? s : s === '€' ? 'EUR' : fallback;
};
const num = (v: string | undefined) => {
  const n = parseNumber(v);
  return Number.isFinite(n) ? n : 0;
};
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Rows include the header row (rows[0]). Line numbers are 1-based file lines. */
export function parseBrokerCsv(rows: string[][], format: BrokerFormat): CsvRowResult[] {
  const [headers, ...data] = rows;
  if (!headers) return [];
  if (format === 'degiro_account') return parseDegiroAccount(headers, data);
  const spec = SPECS[format];
  const map = mapColumns(headers, spec);
  const fees = feeColumns(headers, spec);
  const get = (r: string[], c: Col) => (map[c] != null ? r[map[c]!]?.trim() : undefined);
  const src = format.startsWith('degiro') ? 'degiro' : format;

  return data.map((r, i): CsvRowResult => {
    const line = i + 2;
    const date = parseDate(get(r, 'date'));
    if (!date) return { tx: null, line, error: 'date illisible' };
    const qtyRaw = num(get(r, 'quantity'));
    const amountRaw = num(get(r, 'amount'));
    const label = get(r, 'type');
    let type: TxType | null;
    if (format === 'degiro_transactions') type = qtyRaw < 0 ? 'SELL' : qtyRaw > 0 ? 'BUY' : null;
    else type = parseType(label, 0, 0);
    if (!type && format === 'trade_republic' && /(trade|order|execution|savings|saveback|round)/i.test(label ?? ''))
      type = qtyRaw < 0 || amountRaw > 0 ? 'SELL' : 'BUY';
    if (!type) return { tx: null, line, error: `type inconnu « ${label ?? ''} »` };

    const isin = cleanIsin(get(r, 'isin'));
    const symbol = get(r, 'symbol') || (isin ? `isin:${isin}` : null);
    const quantity = Math.abs(qtyRaw);
    let price = Math.abs(num(get(r, 'price')));
    if (!price && quantity && amountRaw) price = Math.abs(amountRaw) / quantity;

    // Degiro: instrument currency sits in the unnamed column right after "Cours"/"Price";
    // fees and totals are in EUR, "Taux de change" = units of instrument currency per EUR.
    let currency: string;
    let fx: number | null = null;
    if (format === 'degiro_transactions' && map.price != null) {
      currency = cur(r[map.price + 1]);
      const rate = num(get(r, 'fx'));
      fx = currency === 'EUR' ? 1 : rate > 0 ? 1 / rate : null;
    } else currency = cur(get(r, 'currency'));

    let feeSum = fees.reduce((s, idx) => s + Math.abs(num(r[idx])), 0);
    if (format === 'degiro_transactions' && currency !== 'EUR' && fx) feeSum = feeSum / fx; // EUR → instrument ccy
    const tax = Math.abs(num(get(r, 'tax')));

    const trade = type === 'BUY' || type === 'SELL';
    if (trade && (!quantity || !price)) return { tx: null, line, error: 'quantité ou prix manquant' };
    if (trade && !symbol) return { tx: null, line, error: 'ticker ou ISIN manquant' };
    if (!trade && !amountRaw) return { tx: null, line, error: 'montant manquant' };

    let amount = 0;
    if (type === 'DIVIDEND') amount = Math.abs(amountRaw) - tax;
    else if (!trade) amount = Math.abs(amountRaw);
    const id = get(r, 'id');
    return {
      line,
      isin,
      name: get(r, 'name'),
      tx: {
        date,
        type,
        symbol: trade || type === 'DIVIDEND' ? symbol : null,
        quantity: trade ? quantity : 0,
        price: trade ? r6(price) : 0,
        fees: r6(trade ? feeSum + tax : type === 'FEE' ? 0 : feeSum),
        amount: r6(amount),
        currency,
        fx_rate: currency === 'EUR' ? 1 : fx,
        source: 'csv',
        external_id: id
          ? `${src}:${id}${format === 'degiro_transactions' ? `:${date}:${get(r, 'time') ?? ''}:${qtyRaw}` : ''}`
          : `${src}:${date}:${type}:${symbol ?? ''}:${quantity}:${price}:${amountRaw}`,
      },
    };
  });
}

/**
 * Degiro Account.csv: cash movements. BUY/SELL lines are skipped (they come from Transactions.csv),
 * as are internal money-market sweeps and currency conversions.
 */
function parseDegiroAccount(headers: string[], data: string[][]): CsvRowResult[] {
  const map = mapColumns(headers, SPECS.degiro_account);
  const get = (r: string[], c: Col) => (map[c] != null ? r[map[c]!]?.trim() : undefined);
  return data.map((r, i): CsvRowResult => {
    const line = i + 2;
    const date = parseDate(get(r, 'date'));
    if (!date) return { tx: null, line, error: 'date illisible' };
    const desc = normH(get(r, 'type') ?? '');
    const currency = cur(get(r, 'currency'));
    const amount = num(map.currency != null ? r[map.currency + 1] : undefined);
    const isin = cleanIsin(get(r, 'isin'));
    const skip = (why: string): CsvRowResult => ({ tx: null, line, error: `ignoré (${why})` });

    let type: TxType | null = null;
    if (/^(achat|vente|buy|sell)\b/.test(desc)) return skip('voir Transactions.csv');
    if (/(change|conversion|fx (credit|debit|withdrawal)|operation de change|cash sweep|money market|fonds monetaire|transfert|transfer|reservation|flatex interest income|degiro cash sweep)/.test(desc) && !/dividend/.test(desc))
      return skip('mouvement interne');
    if (/(impots? sur dividende|dividend tax|retenue)/.test(desc)) type = 'DIVIDEND';
    else if (/dividend|coupon|remboursement de capital|capital return/.test(desc)) type = 'DIVIDEND';
    else if (/(depot|deposit|versement de fonds|ideal|sofort|virement)/.test(desc) && amount > 0) type = 'DEPOSIT';
    else if (/(retrait|withdrawal|processed flatex withdrawal)/.test(desc) || (/(virement|versement)/.test(desc) && amount < 0)) type = 'WITHDRAWAL';
    else if (/(frais|fee|costs|commission|taxe|tax)/.test(desc)) type = 'FEE';
    else if (/(interet|interest)/.test(desc)) type = amount >= 0 ? 'DIVIDEND' : 'FEE';
    if (!type) return { tx: null, line, error: `type inconnu « ${get(r, 'type') ?? ''} »` };
    if (!amount) return { tx: null, line, error: 'montant manquant' };

    const symbol = type === 'DIVIDEND' && isin ? `isin:${isin}` : null;
    return {
      line,
      isin: symbol ? isin : undefined,
      name: get(r, 'name') || undefined,
      tx: {
        date,
        type,
        symbol,
        quantity: 0,
        price: 0,
        fees: 0,
        // Dividend tax stays a negative DIVIDEND (same convention as IBKR withholding tax).
        amount: type === 'DIVIDEND' ? amount : Math.abs(amount),
        currency,
        fx_rate: currency === 'EUR' ? 1 : null,
        source: 'csv',
        external_id: `degiro:a:${date}:${get(r, 'time') ?? ''}:${type}:${isin ?? ''}:${amount}:${get(r, 'id') ?? ''}`,
      },
    };
  });
}
