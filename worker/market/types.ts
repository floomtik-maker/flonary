import type { CalendarEvent, PriceHistory, Quote, SearchResult } from '../../shared/types';

export interface ProviderProfile {
  name?: string;
  country?: string | null;
  sector?: string | null;
  isin?: string | null;
  type?: string | null;
  events: CalendarEvent[];
}

/**
 * A market data source. Symbols are always in the app's internal format
 * (Yahoo-style tickers: AAPL, MC.PA, ASML.AS, SAP.DE, BTC-USD); each provider maps them.
 * `history` returns RAW closes (not split-adjusted) plus splits and dividends.
 */
export interface MarketProvider {
  name: string;
  history(symbol: string, from: string): Promise<PriceHistory>;
  quote(symbol: string): Promise<Quote>;
  search(q: string): Promise<SearchResult[]>;
  profile(symbol: string, today: string): Promise<ProviderProfile>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export async function getJson<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new ProviderError(`${label}: HTTP ${res.status} ${text.slice(0, 120)}`, res.status === 404 ? 404 : 502);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError(`${label}: réponse invalide (${text.slice(0, 80)})`);
  }
}
