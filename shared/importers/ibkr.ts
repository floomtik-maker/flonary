/**
 * Interactive Brokers "Flex Query" parser (XML from the Flex Web Service, or CSV export).
 * Flex Web Service docs: https://www.interactivebrokers.com/campus/ibkr-api-page/flex-web-service/
 * The Flex Query must include the sections "Trades" and (optionally) "Cash Transactions".
 */
import type { Transaction } from '../types';

const EXCHANGE_SUFFIX: Record<string, string> = {
  SBF: 'PA',
  ENEXT: 'PA',
  AEB: 'AS',
  'ENEXT.BE': 'BR',
  IBIS: 'DE',
  IBIS2: 'DE',
  XETRA: 'DE',
  FWB: 'F',
  FWB2: 'F',
  LSE: 'L',
  LSEETF: 'L',
  BVME: 'MI',
  'BVME.ETF': 'MI',
  BM: 'MC',
  EBS: 'SW',
  SWX: 'SW',
  TSE: 'TO',
  SEHK: 'HK',
  SFB: 'ST',
  KFX: 'CO',
  OSE: 'OL',
};

/** IBKR symbol + listing exchange → internal (Yahoo-style) ticker */
export function ibkrSymbol(symbol: string, exchange?: string | null): string {
  const s = symbol.trim().replace(/\s+/g, '-');
  const ex = (exchange ?? '').toUpperCase();
  const suffix = EXCHANGE_SUFFIX[ex];
  return suffix ? `${s}.${suffix}` : s;
}

/** 20250102 | 2025-01-02 | 20250102;093000 | 2025-01-02, 09:30:00 → 2025-01-02 */
export function ibkrDate(v: string | undefined | null): string | null {
  if (!v) return null;
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(v.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function decode(s: string) {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** Minimal attribute extractor for self-closing XML tags (no DOMParser in Workers). */
export function xmlTags(xml: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const re = new RegExp(`<${tag}\\s([^>]*?)\\/?>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs: Record<string, string> = {};
    const ar = /([\w:.-]+)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(m[1]))) attrs[a[1]] = decode(a[2]);
    out.push(attrs);
  }
  return out;
}

export interface ParsedImport {
  transactions: Omit<Transaction, 'id' | 'account_id'>[];
  /** symbol → display name, for creating instruments */
  names: Record<string, { name: string; currency: string; isin?: string; assetCategory?: string }>;
  warnings: string[];
}

const num = (v: string | undefined) => {
  const n = Number((v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Normalized record, shared by the XML and CSV paths (keys are lower-cased attribute names). */
export function ibkrRecordsToTransactions(trades: Record<string, string>[], cash: Record<string, string>[]): ParsedImport {
  const result: ParsedImport = { transactions: [], names: {}, warnings: [] };
  const g = (r: Record<string, string>, ...keys: string[]) => {
    for (const k of keys) {
      const v = r[k.toLowerCase()];
      if (v !== undefined && v !== '') return v;
    }
    return undefined;
  };
  for (const r of trades) {
    const cat = (g(r, 'assetCategory', 'assetClass') ?? 'STK').toUpperCase();
    if (!['STK', 'ETF', 'FUND', 'CRYPTO'].includes(cat)) {
      result.warnings.push(`Opération ignorée (type ${cat} non géré) : ${g(r, 'symbol') ?? ''}`);
      continue;
    }
    const levelOfDetail = g(r, 'levelOfDetail');
    if (levelOfDetail && levelOfDetail.toUpperCase() !== 'EXECUTION') continue;
    const date = ibkrDate(g(r, 'tradeDate', 'dateTime', 'date/time'));
    const rawSymbol = g(r, 'symbol');
    if (!date || !rawSymbol) continue;
    const qty = num(g(r, 'quantity'));
    const side = (g(r, 'buySell', 'buy/sell') ?? (qty >= 0 ? 'BUY' : 'SELL')).toUpperCase();
    const symbol = ibkrSymbol(rawSymbol, g(r, 'listingExchange', 'exchange'));
    const currency = g(r, 'currency', 'currencyPrimary') ?? 'USD';
    result.names[symbol] ??= { name: g(r, 'description') ?? rawSymbol, currency, isin: g(r, 'isin'), assetCategory: cat };
    result.transactions.push({
      date,
      type: side.startsWith('S') ? 'SELL' : 'BUY',
      symbol,
      quantity: Math.abs(qty),
      price: num(g(r, 'tradePrice', 'price', 't. price')),
      fees: Math.abs(num(g(r, 'ibCommission', 'commission', 'comm/fee'))),
      amount: 0,
      currency,
      // fxRateToBase is only EUR-based when the IBKR account base currency is EUR
      fx_rate: g(r, 'currencyPrimary', 'currency') === 'EUR' ? 1 : null,
      source: 'ibkr',
      external_id: g(r, 'tradeID', 'transactionID', 'ibExecID') ? `ibkr:t:${g(r, 'tradeID', 'transactionID', 'ibExecID')}` : null,
    });
  }
  for (const r of cash) {
    const type = (g(r, 'type') ?? '').toLowerCase();
    const date = ibkrDate(g(r, 'dateTime', 'date', 'settleDate', 'reportDate'));
    const amount = num(g(r, 'amount'));
    const currency = g(r, 'currency', 'currencyPrimary') ?? 'USD';
    if (!date || !amount) continue;
    const rawSymbol = g(r, 'symbol');
    const symbol = rawSymbol ? ibkrSymbol(rawSymbol, g(r, 'listingExchange', 'exchange')) : null;
    let kind: Transaction['type'] | null = null;
    let value = amount;
    if (type.includes('dividend') || type.includes('payment in lieu')) kind = 'DIVIDEND';
    else if (type.includes('withholding')) kind = 'DIVIDEND'; // negative amount: tax withheld on dividends
    else if (type.includes('deposit') || type.includes('withdrawal')) {
      kind = amount >= 0 ? 'DEPOSIT' : 'WITHDRAWAL';
      value = Math.abs(amount);
    } else if (type.includes('interest')) kind = amount >= 0 ? 'DIVIDEND' : 'FEE';
    else if (type.includes('fee') || type.includes('commission')) kind = 'FEE';
    if (!kind) continue;
    if (kind === 'FEE') value = Math.abs(amount);
    const id = g(r, 'transactionID', 'tradeID');
    result.transactions.push({
      date,
      type: kind,
      symbol: kind === 'DIVIDEND' ? symbol : null,
      quantity: 0,
      price: 0,
      fees: 0,
      amount: value,
      currency,
      fx_rate: currency === 'EUR' ? 1 : null,
      source: 'ibkr',
      external_id: id ? `ibkr:c:${id}` : null,
      note: g(r, 'description') ?? null,
    });
  }
  return result;
}

const lowerKeys = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v]));

export function parseIbkrFlexXml(xml: string): ParsedImport {
  const trades = xmlTags(xml, 'Trade').map(lowerKeys);
  const cash = xmlTags(xml, 'CashTransaction').map(lowerKeys);
  return ibkrRecordsToTransactions(trades, cash);
}
