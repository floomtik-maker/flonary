export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** "false" closes registrations (default: open) */
  ALLOW_SIGNUP?: string;
  /** Optional comma-separated list of e-mails allowed to sign up */
  ALLOWED_EMAILS?: string;
  /** Optional "Sign in with Google" (OAuth client from Google Cloud Console) */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Encrypts broker tokens stored in D1 */
  SECRETS_KEY?: string;
  /** Market data (https://eodhd.com) */
  EODHD_API_KEY?: string;
  /** Daily EODHD call allowance: 20 on the free plan (default), 100000 on paid plans */
  EODHD_DAILY_LIMIT?: string;
  /** "true" when the EODHD plan includes Fundamentals + corporate calendar (country, sector, earnings dates) */
  EODHD_FUNDAMENTALS?: string;
}
