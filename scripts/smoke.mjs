// End-to-end smoke test of the real app (not the demo).
// Prerequisites: `npm run build && npx wrangler dev` running on http://localhost:8787 with
// ALLOW_SIGNUP=true in .dev.vars, and Playwright available (`npx playwright install chromium`).
// Usage: node scripts/smoke.mjs [baseUrl]
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:8787';
const email = `smoke-${Date.now()}@example.com`;
const dir = mkdtempSync(join(tmpdir(), 'flonary-smoke-'));
const csv = join(dir, 'tr.csv');
writeFileSync(
  csv,
  'Date;Type;Value;Note;ISIN;Shares;Fees;Taxes\n2025-01-06;Buy;-500,00;Fonds test;FR0000000001;10;-1,00;\n2025-03-03;Sell;300,00;Fonds test;FR0000000001;5;-1,00;\n2025-04-01;Deposit;1000;;;;;\n',
);

const step = (m) => console.log('✓', m);
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(base);
await page.getByRole('button', { name: 'Créer un compte' }).click();
await page.getByLabel('E-mail').fill(email);
await page.getByLabel('Mot de passe').fill('motdepasse-solide');
await page.getByRole('button', { name: 'Créer mon compte' }).click();
await page.getByText('Bienvenue sur Flonary').waitFor();
step('inscription');

await page.getByRole('link', { name: '1. Créer mes comptes' }).click();
await page.getByRole('button', { name: 'Nouveau compte' }).click();
await page.getByLabel('Courtier / établissement').selectOption('trade_republic');
await page.getByLabel('Enveloppe').selectOption('PEA');
await page.getByLabel('Nom du compte').fill('TR PEA');
await page.getByRole('button', { name: 'Enregistrer' }).click();
await page.getByText('TR PEA').first().waitFor();
step('création de compte');

await page.goto(base + '/mouvements?new=1');
await page.getByPlaceholder(/Nom, ticker ou ISIN/).fill('AAPL');
await page.getByText('Utiliser « AAPL »').click();
await page.getByLabel('Date').fill('2025-02-03');
await page.getByLabel('Quantité').fill('3');
await page.getByLabel(/Prix unitaire/).fill('230');
await page.getByRole('button', { name: 'Enregistrer' }).click();
await page.getByText('3 × ').first().waitFor();
step('saisie manuelle d’un achat');

await page.goto(base + '/comptes?import=1');
await page.getByLabel('Fichier (.csv ou .xml)').setInputFiles(csv);
await page.getByText('Trade Republic (export pytr)').waitFor();
await page.getByRole('button', { name: /Importer 3 opération/ }).click();
await page.getByText(/3 opération\(s\) importée/).waitFor({ timeout: 20000 });
await page.getByRole('button', { name: 'Terminer' }).click();
step('import CSV');

// Re-import: duplicates must be skipped
await page.getByRole('button', { name: 'Importer un fichier' }).click();
await page.getByLabel('Fichier (.csv ou .xml)').setInputFiles(csv);
await page.getByRole('button', { name: /Importer 3 opération/ }).click();
await page.getByText(/0 opération\(s\) importée\(s\), 3 doublon/).waitFor({ timeout: 20000 });
await page.getByRole('button', { name: 'Terminer' }).click();
step('ré-import sans doublons');

await page.goto(base + '/');
await page.getByText('Valeur totale du portefeuille').waitFor();
const total = await page.locator('.hero-value').first().innerText();
step(`synthèse affichée (${total.trim()})`);

await page.goto(base + '/positions');
await page.getByText('Fonds test').first().waitFor();
step('positions');

if (errors.length) {
  console.error('Erreurs JS :', errors);
  process.exit(1);
}
await browser.close();
console.log('Smoke test OK');
