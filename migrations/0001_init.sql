-- Flonary schema (Cloudflare D1 / SQLite)

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,       -- base64 PBKDF2-SHA256
  password_salt TEXT NOT NULL,       -- base64
  password_iterations INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,               -- SHA-256 of the cookie token (the raw token is never stored)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  broker TEXT NOT NULL DEFAULT 'other',  -- ibkr | trade_republic | bnp_pee | other
  kind TEXT NOT NULL DEFAULT 'CTO',      -- CTO | PEA | PEE | AV | CRYPTO …
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_accounts_user ON accounts(user_id);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,                 -- YYYY-MM-DD
  type TEXT NOT NULL,                 -- BUY | SELL | DIVIDEND | DEPOSIT | WITHDRAWAL | FEE
  symbol TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  price REAL NOT NULL DEFAULT 0,
  fees REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  fx_rate REAL,                       -- EUR per 1 unit of currency at `date` (optional)
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT,                   -- broker id, used to deduplicate imports
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tx_user ON transactions(user_id, date);
CREATE UNIQUE INDEX idx_tx_external ON transactions(user_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE instruments (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  asset_class TEXT NOT NULL DEFAULT 'stock',
  country TEXT,
  sector TEXT,
  isin TEXT,
  manual INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, symbol)
);

CREATE TABLE manual_prices (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  price REAL NOT NULL,
  PRIMARY KEY (user_id, symbol, date)
);

CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,             -- ibkr_flex
  label TEXT NOT NULL,
  config TEXT NOT NULL,               -- JSON, encrypted with SECRETS_KEY (AES-GCM) when set
  last_sync TEXT,
  last_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Shared cache for market data (prices, FX, profiles). Not user data.
CREATE TABLE market_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  fetched_at INTEGER NOT NULL         -- unix ms
);
