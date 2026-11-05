// Generates the wrangler config used to build and deploy the friend's site (Worker
// `flonary-ami`) from his fork, see .github/workflows/deploy-ami.yml.
// The fork's own wrangler.toml is NEVER used: this config is the only one, so the fork
// cannot add bindings to other Workers / databases of the Cloudflare account.
//
//   node scripts/ami-wrangler-config.mjs --mode build  --main fork/worker/index.ts --out fork/ami.wrangler.json
//   node scripts/ami-wrangler-config.mjs --mode deploy --main site/out/index.js --assets site/dist \
//        [--migrations site/migrations] --out site/wrangler.json
//
// Paths are given relative to the current directory and written relative to the output file
// (wrangler resolves them from the config file's folder).
// compatibility_date / compatibility_flags are copied from this repo's wrangler.toml.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, relative, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AMI = {
  name: 'flonary-ami',
  databaseName: 'flonary-ami',
  databaseId: 'f98ead9a-bfe1-4dcd-a1f2-aed01096f405',
  crons: ['30 22 * * 1-5'],
  vars: { ALLOW_SIGNUP: 'true', EODHD_FUNDAMENTALS: 'false' },
};

/** Reads compatibility_date and compatibility_flags from a wrangler.toml text. */
export function readCompat(toml) {
  const date = toml.match(/^\s*compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  const flagsRaw = toml.match(/^\s*compatibility_flags\s*=\s*\[([^\]]*)\]/m)?.[1] ?? '';
  const flags = [...flagsRaw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('compatibility_date not found in wrangler.toml');
  return { date, flags };
}

/** Builds the config object. `rel` maps a cwd-relative path to a config-relative one. */
export function buildConfig({ mode, main, assets, migrations, compat }, rel = (p) => p) {
  if (mode !== 'build' && mode !== 'deploy') throw new Error('--mode must be build or deploy');
  if (!main) throw new Error('--main is required');
  const config = {
    name: AMI.name,
    main: rel(main),
    compatibility_date: compat.date,
    compatibility_flags: compat.flags,
  };
  if (mode === 'build') return config; // only used to bundle the worker (dry run), no bindings
  if (!assets) throw new Error('--assets is required in deploy mode');
  return {
    ...config,
    // The worker was bundled in the build job: upload it as is.
    no_bundle: true,
    find_additional_modules: true,
    base_dir: rel(dirname(main)),
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    workers_dev: true,
    assets: {
      directory: rel(assets),
      binding: 'ASSETS',
      not_found_handling: 'single-page-application',
      run_worker_first: ['/api/*'],
    },
    d1_databases: [
      {
        binding: 'DB',
        database_name: AMI.databaseName,
        database_id: AMI.databaseId,
        ...(migrations ? { migrations_dir: rel(migrations) } : {}),
      },
    ],
    vars: { ...AMI.vars },
    triggers: { crons: [...AMI.crons] },
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k.startsWith('--') || argv[i + 1] === undefined) throw new Error(`bad argument: ${k}`);
    out[k.slice(2)] = argv[i + 1];
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) throw new Error('--out is required');
  const here = dirname(fileURLToPath(import.meta.url));
  const compat = readCompat(readFileSync(join(here, '..', 'wrangler.toml'), 'utf8'));
  const outDir = dirname(resolve(args.out));
  const rel = (p) => {
    const r = relative(outDir, resolve(p)) || '.';
    return r.startsWith('.') ? r : `./${r}`;
  };
  if (args.migrations && !existsSync(args.migrations)) delete args.migrations;
  const config = buildConfig({ ...args, compat }, rel);
  writeFileSync(args.out, JSON.stringify(config, null, 2) + '\n');
  console.log(`Wrote ${args.out} (${args.mode})`);
}
