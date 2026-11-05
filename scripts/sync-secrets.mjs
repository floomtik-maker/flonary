// Copies the app secrets present in the environment (e.g. GitHub Actions secrets) to the
// Cloudflare Worker. Empty / missing ones are left untouched on Cloudflare.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NAMES = ['EODHD_API_KEY', 'EODHD_DAILY_LIMIT', 'SECRETS_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ALLOWED_EMAILS'];
const secrets = Object.fromEntries(NAMES.filter((n) => process.env[n]?.trim()).map((n) => [n, process.env[n].trim()]));
if (Object.keys(secrets).length === 0) {
  console.log('No app secrets to sync.');
  process.exit(0);
}
const dir = mkdtempSync(join(tmpdir(), 'flonary-secrets-'));
const file = join(dir, 'secrets.json');
try {
  writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
  execFileSync('npx', ['wrangler', 'secret', 'bulk', file], { stdio: 'inherit' });
  console.log('Synced:', Object.keys(secrets).join(', '));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
