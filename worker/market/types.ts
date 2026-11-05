import type { Point, Quote, SearchResult } from '../../shared/types';

export interface ProviderProfile {
  name?: string;
  country?: string | null;
  sector?: string | null;
  isin?: string | null;
  type?: string | null;
  earnings: string[];
}

/**
 * A market data source. Symbols are always in the app's internal format
 * (Yahoo-style tickers: AAPL, MC.PA, ASML.AS, SAP.DE, BTC-USD); each provider maps them.
 * Prices are RAW closes (not split-adjusted); dividends are raw amounts per share.
 */
export interface MarketProvider {
  name: string;
  eod(symbol: string, from: string): Promise<{ currency: string; points: Point[] }>;
  dividends(symbol: string, from: string): Promise<Point[]>;
  splits(symbol: string): Promise<Point[]>;
  quote(symbol: string): Promise<Quote>;
  search(q: string): Promise<SearchResult[]>;
  /** Optional, expensive: country / sector / next earnings dates */
  profile?(symbol: string, today: string): Promise<ProviderProfile>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export async function getJson<T>(url: string, label: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { accept: 'application/json', ...(init?.headers ?? {}) } });
  const text = await res.text();
  if (res.status === 402) throw new ProviderError(`${label} : quota du fournisseur épuisé pour aujourd'hui`, 503);
  if (!res.ok) throw new ProviderError(`${label} : HTTP ${res.status} ${text.slice(0, 120)}`, res.status === 404 ? 404 : 502);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError(`${label} : réponse invalide (${text.slice(0, 80)})`);
  }
}
