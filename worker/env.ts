export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ALLOW_SIGNUP?: string;
  /** Encrypts broker tokens stored in D1 */
  SECRETS_KEY?: string;
  /** Market data providers (at least one recommended). EODHD is tried first. */
  EODHD_API_KEY?: string;
  TWELVEDATA_API_KEY?: string;
}
