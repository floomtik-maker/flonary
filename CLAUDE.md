# Flonary — guide pour les agents IA (et les humains)

Appli web de suivi de portefeuille boursier multi-comptes, en français. Lis aussi `README.md` (usage, déploiement) et `docs/ROADMAP.md` (suite du travail).

## Ce que veut l'utilisateur (à respecter)

- **Interface simple** : peu d'informations par écran, seulement les plus utiles. Avant d'ajouter un chiffre ou un graphique, se demander s'il mérite sa place.
- **Les plus-values réalisées restent dans la performance** (cœur du produit, voir « Moteur » ci-dessous). Ne jamais casser ce comportement.
- Comptes réels : Interactive Brokers (CTO, actions US/EU), Trade Republic (PEA), PEE BNP Paribas (fonds non cotés).
- Avancer par étapes visibles : la démo (`npm run dev:demo`) doit toujours fonctionner.
- Textes de l'interface en français ; code et commentaires en anglais.

## Commandes

```bash
npm run dev:demo        # UI seule, données simulées (aucune config)
npm run dev             # UI (Vite :5173), proxy /api → wrangler dev :8787
npx wrangler dev        # Worker + assets + D1 locale (après npm run build)
npm run check           # tsc -b + vitest  ← à lancer avant chaque commit
npm run smoke           # e2e Playwright contre wrangler dev (scripts/smoke.mjs)
npm run build:demo      # démo en un seul fichier HTML (dist-demo/index.html)
npm run deploy          # build + migrations D1 distantes + wrangler deploy
```

## Architecture

```
shared/            Logique pure, sans I/O, testée (vitest). Utilisée par le front ET le worker.
  types.ts         Types du domaine (Transaction, Instrument, PriceHistory…)
  portfolio.ts     ★ Moteur : PRU, réalisé/latent, poche de liquidités, séries quotidiennes, TWR
  analysis.ts      SMA, RSI, volatilité, drawdown, risque 1–7 (bandes PRIIPs/SRI), signaux, projection
  calendar.ts      Événements à venir (annoncés + dividendes estimés à J+365)
  geo.ts           Pays/secteur en français, devinette par suffixe de ticker, régions
  importers/       Parseurs CSV générique, Trade Republic (pytr), IBKR Flex (XML/CSV)
src/               Front React 18 + react-router 6 + TanStack Query 5 + Recharts 2. CSS maison (src/styles.css, tokens clair/sombre).
  api/backend.ts   Interface `Backend` = tout ce dont l'UI a besoin
  api/http.ts      Implémentation réelle (fetch /api/*)
  demo/            Implémentation démo (données synthétiques déterministes, localStorage)
  lib/usePortfolio.ts  Charge données + cours + FX, lance le moteur (le calcul est fait côté client)
  pages/, components/
worker/            Cloudflare Worker (Hono) : /api/* ; les assets (dist/) sont servis par le binding ASSETS
  index.ts         Routes
  auth.ts          Comptes e-mail/mot de passe (PBKDF2), sessions en cookie HttpOnly (hash SHA-256 en base), CSRF par vérification d'Origin
  data.ts          Accès D1, validation, upsert + dédoublonnage par external_id
  market/          Fournisseurs de cours (EODHD, Twelve Data), FX BCE (Frankfurter), cache D1 stale-if-error
  connectors/ibkr.ts  Flex Web Service (SendRequest → GetStatement)
migrations/        SQL D1 (appliqué avec wrangler d1 migrations apply)
scripts/smoke.mjs  Test e2e
```

Flux : l'UI charge `/api/data` (comptes, opérations, instruments, valorisations manuelles), puis l'historique des cours et le FX, et calcule tout dans le navigateur avec `shared/portfolio.ts`. Le worker ne fait que stocker, authentifier et relayer les données de marché.

## Moteur (shared/portfolio.ts) — invariants

- Chaque compte a une **poche de liquidités en EUR**. Vente et dividende → la poche ; achat → payé par la poche d'abord, le reste = **versement implicite** (compte comme argent investi). DEPOSIT/WITHDRAWAL = flux explicites.
- `valeur totale = titres + poches` ; `gain = valeur − apports nets`. Une vente ne change donc pas le gain.
- PRU = prix moyen pondéré, frais d'achat inclus ; vente → réalisé = produit net − coût moyen.
- Conversion en EUR au taux du jour de l'opération (`fx_rate` de l'opération si fourni, sinon série BCE). Les cotations `GBp` (pence) sont divisées par 100.
- Les cours sont **bruts (non ajustés des splits)** ; les splits (`PriceHistory.splits`) multiplient les quantités détenues à leur date. Les opérations restent telles que le courtier les a données. Un nouveau fournisseur doit respecter cette convention (Twelve Data : `adjust=none`).
- Ordre dans une même journée : DEPOSIT, DIVIDEND, SELL, BUY, FEE, WITHDRAWAL (une vente suivie d'un rachat le même jour n'est pas de l'argent neuf).
- Toute modification du moteur → ajouter un test dans `shared/portfolio.test.ts`.

## Conventions

- Symboles internes au format Yahoo : `AAPL`, `MC.PA`, `ASML.AS`, `SAP.DE`, `VOD.L`, `BTC-USD`. Fonds non cotés : `manual:<slug>` (valorisés par `manual_prices`). Chaque fournisseur/importeur convertit vers ce format (`toEodhd`, `toTwelve`, `ibkrSymbol`).
- Dates ISO `YYYY-MM-DD` partout. Montants dans la devise de l'instrument, conversion EUR uniquement dans le moteur.
- Toute nouvelle méthode de `Backend` doit être implémentée dans `http.ts` **et** `demo/demoBackend.ts`.
- Toute requête D1 utilisateur est filtrée par `user_id`. D1 limite à 100 paramètres par requête : découper (voir `saveTransactions`) et utiliser `db.batch`.
- PBKDF2 est limité à 100 000 itérations dans Workers (ne pas augmenter).
- Pas de scraping de sites (Yahoo Finance & co.) : uniquement des API officielles avec clé. Ajouter un fournisseur = implémenter `MarketProvider` (`worker/market/types.ts`) et l'ajouter dans `providers()` (`worker/market/index.ts`).
- Ajouter un format d'import = parseur pur dans `shared/importers/` + test + branchement dans `src/components/ImportWizard.tsx`.
- Schéma : nouvelle migration `migrations/000N_xxx.sql` (ne jamais modifier une migration appliquée), puis `npm run db:migrate:local`.
- Graphiques : palette catégorielle fixe (`--series-1..8`), une seule échelle Y, infobulle au survol, légende dès 2 séries.

## Environnement

- `wrangler.toml` : base D1 `flonary` (compte Cloudflare de Guillaume, région WEUR), `ALLOW_SIGNUP="false"` (seul le premier compte peut s'inscrire).
- Mise en ligne pas à pas pour l'utilisateur (non-développeur) : `docs/MISE-EN-LIGNE.md`. Le guider avec ce document, étape par étape, en expliquant chaque commande avant de la lancer.
- EODHD : l'offre gratuite (20 appels/jour) ne sert qu'à tester ; l'offre « EOD Historical All-World » (19,99 $/mois) n'inclut ni `/fundamentals` (10 appels) ni le calendrier des résultats → désactivés par défaut (`EODHD_FUNDAMENTALS="false"`). Économiser les appels : tout passe par le cache D1 (`worker/market/cache.ts`).
- Secrets : `SECRETS_KEY` (chiffre les jetons IBKR en AES-GCM), `EODHD_API_KEY` et/ou `TWELVEDATA_API_KEY`. En local : `.dev.vars` (voir `.dev.vars.example`). La clé `demo` d'EODHD fonctionne pour quelques tickers US (AAPL, MSFT…) : pratique pour tester.
- La migration `0001_init.sql` est déjà appliquée sur la base distante.

## État au moment du transfert

Fonctionnel et testé : moteur (24 tests), API (inscription, CSRF, CRUD, import dédoublonné, cours EODHD, FX BCE), parcours e2e (`npm run smoke`). Démo publiée en un seul fichier HTML.
Pas encore fait / non vérifié : déploiement en production (nécessite `wrangler login` sur le compte Cloudflare), test réel du connecteur IBKR avec un vrai jeton, couverture Twelve Data hors US. Voir `docs/ROADMAP.md`.
