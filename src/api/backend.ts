import type {
  Account,
  Instrument,
  InstrumentProfile,
  Point,
  PriceHistory,
  Quote,
  SearchResult,
  Transaction,
} from '../../shared/types';

export interface User {
  id: string;
  email: string;
}

export interface UserData {
  accounts: Account[];
  transactions: Transaction[];
  instruments: Instrument[];
  /** symbol -> manual valuations (PEE funds, unlisted assets) */
  manualPrices: Record<string, Point[]>;
}

export interface Connection {
  id: string;
  provider: 'ibkr_flex';
  account_id: string;
  label: string;
  last_sync: string | null;
  last_status: string | null;
}

export interface SyncResult {
  imported: number;
  skipped: number;
  message?: string;
}

export interface MarketSettings {
  configured: boolean;
  /** 'env' = Worker secret (set by the host), 'app' = pasted in the app */
  source: 'env' | 'app' | 'demo' | null;
  plan: 'free' | 'paid';
}

/** Wealth goal (objectif de patrimoine) */
export interface Goal {
  target: number;
  date: string;
  monthly?: number;
}

/**
 * Everything the UI needs from the outside world. Two implementations:
 * - HttpBackend (src/api/http.ts): talks to the Cloudflare Worker (worker/).
 * - DemoBackend (src/demo/demoBackend.ts): in-browser, synthetic market data.
 */
export interface Backend {
  mode: 'live' | 'demo';
  me(): Promise<User | null>;
  login(email: string, password: string): Promise<User>;
  register(email: string, password: string): Promise<User>;
  logout(): Promise<void>;

  getData(): Promise<UserData>;
  saveAccount(a: Omit<Account, 'id'> & { id?: string }): Promise<Account>;
  deleteAccount(id: string): Promise<void>;
  /** Upsert (by id, and dedupe by external_id). Returns the number of new rows. */
  saveTransactions(txs: Transaction[]): Promise<{ inserted: number; skipped: number }>;
  deleteTransaction(id: string): Promise<void>;
  saveInstrument(i: Instrument): Promise<void>;
  saveManualPrice(symbol: string, date: string, price: number): Promise<void>;
  deleteManualPrice(symbol: string, date: string): Promise<void>;
  restore(data: UserData): Promise<void>;

  /** Daily history since `from` (raw closes + dividends + splits) */
  history(symbols: string[], from: string): Promise<Record<string, PriceHistory>>;
  quotes(symbols: string[]): Promise<Record<string, Quote>>;
  fx(currencies: string[], from: string): Promise<Record<string, Point[]>>;
  search(q: string): Promise<SearchResult[]>;
  profile(symbol: string): Promise<InstrumentProfile>;

  connections(): Promise<Connection[]>;
  saveConnection(c: { account_id: string; label: string; token: string; query_id: string }): Promise<Connection>;
  deleteConnection(id: string): Promise<void>;
  syncConnection(id: string): Promise<SyncResult>;

  /** Site-wide market-data key (never returned by the server) */
  marketSettings(): Promise<MarketSettings>;
  saveMarketSettings(s: { apiKey: string; paid: boolean }): Promise<MarketSettings>;
  goal(): Promise<Goal | null>;
  saveGoal(g: Goal): Promise<Goal>;
}
