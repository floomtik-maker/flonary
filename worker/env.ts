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
  /** Market data providers (at least one recommended). EODHD is tried first. */
  EODHD_API_KEY?: string;
  /** "true" when the EODHD plan includes Fundamentals + corporate calendar (country, sector, earnings dates) */
  EODHD_FUNDAMENTALS?: string;
  TWELVEDATA_API_KEY?: string;
}
