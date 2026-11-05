// End-to-end smoke test of the feature pages (real app, not the demo).
// Prerequisites: `npm run build && npx wrangler d1 migrations apply DB --local && npx wrangler dev`
// on http://localhost:8787 (with a .dev.vars copied from .dev.vars.example), Playwright available.
// Usage: node scripts/smoke-features.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:8787';
const email = `smoke-feat-${Date.now()}@example.com`;
const TICKER = 'AAPL';
const OPEN_TICKER = 'MSFT'; // kept open so Analyse/Projection have something to show

const step = (m) => console.log('✓', m);
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await page.goto(base);
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill('motdepasse-solide');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.getByText('Bienvenue sur Flonary').waitFor();
  step('inscription');

  await page.goto(base + '/comptes');
  await page.getByRole('button', { name: 'Nouveau compte' }).click();
  await page.getByLabel('Courtier / établissement').selectOption('ibkr');
  await page.getByLabel('Enveloppe').selectOption('CTO');
  await page.getByLabel('Nom du compte').fill('IBKR CTO');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('IBKR CTO').first().waitFor();
  step('création de compte');

  const addTrade = async (kind, date, qty, price, ticker = TICKER) => {
    await page.goto(base + '/mouvements?new=1');
    if (kind === 'SELL') await page.getByRole('tab', { name: 'Vente' }).click();
    await page.getByPlaceholder(/Nom, ticker ou ISIN/).fill(ticker);
    await page.getByText(`Utiliser « ${ticker} »`).click();
    await page.getByLabel('Date').fill(date);
    await page.getByLabel('Quantité').fill(String(qty));
    await page.getByLabel(/Prix unitaire/).fill(String(price));
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText(`${qty} × `).first().waitFor();
  };
  await addTrade('BUY', '2025-01-06', 3, 200);
  await addTrade('BUY', '2025-02-03', 2, 230);
  step('2 achats');
  await addTrade('SELL', '2025-04-01', 5, 210);
  step('1 vente (position soldée)');
  await addTrade('BUY', '2025-03-03', 4, 400, OPEN_TICKER);
  step('position ouverte (autre titre)');

  await page.goto(base + '/positions');
  await page.getByRole('heading', { name: 'Positions' }).waitFor();
  await page.getByRole('tab', { name: /Vendues \(1\)/ }).click();
  await page.getByText(TICKER).first().waitFor();
  step('position vendue sous « Vendues »');

  for (const [path, title] of [
    ['/analyse', 'Analyse'],
    ['/projection', 'Projection'],
    ['/calendrier', 'Calendrier'],
  ]) {
    await page.goto(base + path);
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    step(`page ${title}`);
  }

  await page.goto(base + '/comptes');
  await page.getByText('Source des cours').waitFor();
  step('Comptes : « Source des cours »');
} catch (e) {
  await page.screenshot({ path: 'smoke-features-failure.png', fullPage: true }).catch(() => {});
  console.error('Échec :', e.message, '(capture : smoke-features-failure.png)');
  if (errors.length) console.error('Erreurs JS :', errors);
  await browser.close();
  process.exit(1);
}

if (errors.length) {
  console.error('Erreurs JS :', errors);
  process.exit(1);
}
await browser.close();
console.log('Smoke test (fonctionnalités) OK');
