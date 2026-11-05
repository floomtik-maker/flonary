// Copies the app secrets present in the environment (e.g. GitHub Actions secrets) to the
// Cloudflare Worker. Empty / missing ones are left untouched on Cloudflare.
//   node scripts/sync-secrets.mjs                       → Worker from wrangler.toml (deploy.yml)
//   node scripts/sync-secrets.mjs --config wrangler.json → Worker from that config (deploy-ami.yml)
// WRANGLER_PKG (e.g. "wrangler@4.157.0") runs a pinned wrangler instead of the local one.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const configIdx = process.argv.indexOf('--config');
const config = configIdx > 0 ? process.argv[configIdx + 1] : undefined;
if (configIdx > 0 && !config) throw new Error('--config needs a file');
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
  const pkg = process.env.WRANGLER_PKG?.trim();
  const args = [...(pkg ? ['--yes', pkg] : ['wrangler']), 'secret', 'bulk', file, ...(config ? ['--config', config] : [])];
  execFileSync('npx', args, { stdio: 'inherit' });
  console.log('Synced:', Object.keys(secrets).join(', '));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
