/**
 * Domain types shared by the frontend (src/) and the API (worker/).
 * All monetary values shown to the user are in the base currency (EUR).
 */

export const BASE_CURRENCY = 'EUR';

export type TxType = 'BUY' | 'SELL' | 'DIVIDEND' | 'DEPOSIT' | 'WITHDRAWAL' | 'FEE';

export type AssetClass = 'stock' | 'etf' | 'fund' | 'crypto' | 'bond' | 'other';

export type Broker = 'ibkr' | 'trade_republic' | 'bnp_pee' | 'other';

export interface Account {
  id: string;
  name: string;
  broker: Broker;
  /** Envelope: CTO, PEA, PEE, AV (assurance-vie), CRYPTO… */
  kind: string;
  created_at?: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  type: TxType;
  /** Market symbol (Yahoo format, e.g. MC.PA, AAPL) or `manual:<id>` — null for cash movements */
  symbol: string | null;
  quantity: number;
  /** Unit price in `currency` (BUY/SELL) */
  price: number;
  /** Fees in `currency` */
  fees: number;
  /** Cash amount in `currency` for DIVIDEND / DEPOSIT / WITHDRAWAL / FEE */
  amount: number;
  currency: string;
  /**
   * Value of 1 unit of `currency` in EUR on `date`. Optional: when missing
   * the engine uses the historical FX series (or 1 for EUR).
   */
  fx_rate?: number | null;
  note?: string | null;
  source?: 'manual' | 'csv' | 'ibkr' | 'demo';
  external_id?: string | null;
}

export interface Instrument {
  symbol: string;
  name: string;
  currency: string;
  asset_class: AssetClass;
  /** Country of the issuer (ISO-ish name in French, e.g. "États-Unis"), or "Monde" for global ETFs */
  country?: string | null;
  sector?: string | null;
  isin?: string | null;
  /** Manual instruments (PEE funds…) have no market feed: valued from manual prices. */
  manual?: boolean;
}

/** [isoDate, value] */
export type Point = [string, number];

export interface PriceHistory {
  symbol: string;
  currency: string;
  /** Daily closes, ascending */
  points: Point[];
  /** Dividends per share [exDate, amount], ascending (same share basis as `points`) */
  dividends?: Point[];
  /**
   * Stock splits [date, ratio] (ratio = new shares per old share, e.g. 4 for a 4-for-1).
   * `points` are RAW closes (not split-adjusted): the engine multiplies held quantities
   * on the split date, so user transactions can stay exactly as the broker reported them.
   */
  splits?: Point[];
}

export interface Quote {
  symbol: string;
  price: number;
  currency: string;
  /** Change vs previous close, in % */
  change_pct?: number | null;
  time?: string;
}

export interface CalendarEvent {
  symbol: string;
  date: string;
  kind: 'earnings' | 'ex_dividend' | 'dividend_payment';
  /** True when the date is extrapolated from the past (not announced) */
  estimated?: boolean;
  /** Dividend per share, in instrument currency */
  amount?: number | null;
  currency?: string;
}

export interface InstrumentProfile {
  symbol: string;
  name?: string;
  country?: string | null;
  sector?: string | null;
  asset_class?: AssetClass;
  events: CalendarEvent[];
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
  currency?: string;
}
