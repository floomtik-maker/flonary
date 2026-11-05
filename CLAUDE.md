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
  market/          EODHD (budget d'appels quotidien, historique incrémental, cron du soir), OpenFIGI (ISIN → ticker, gratuit), FX BCE (Frankfurter)
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
- Les cours sont **bruts (non ajustés des splits)** ; les splits (`PriceHistory.splits`) multiplient les quantités détenues à leur date. Les opérations restent telles que le courtier les a données. Un nouveau fournisseur doit respecter cette convention.
- Ordre dans une même journée : DEPOSIT, DIVIDEND, SELL, BUY, FEE, WITHDRAWAL (une vente suivie d'un rachat le même jour n'est pas de l'argent neuf).
- Toute modification du moteur → ajouter un test dans `shared/portfolio.test.ts`.

## Conventions

- Symboles internes au format Yahoo : `AAPL`, `MC.PA`, `ASML.AS`, `SAP.DE`, `VOD.L`, `BTC-USD`. Fonds non cotés : `manual:<slug>` (valorisés par `manual_prices`). Chaque fournisseur/importeur convertit vers ce format (`toEodhd`, `pickListing` pour OpenFIGI, `ibkrSymbol`).
- Dates ISO `YYYY-MM-DD` partout. Montants dans la devise de l'instrument, conversion EUR uniquement dans le moteur.
- Toute nouvelle méthode de `Backend` doit être implémentée dans `http.ts` **et** `demo/demoBackend.ts`.
- Toute requête D1 utilisateur est filtrée par `user_id`. D1 limite à 100 paramètres par requête : découper (voir `saveTransactions`) et utiliser `db.batch`.
- PBKDF2 est limité à 100 000 itérations dans Workers (ne pas augmenter).
- Pas de scraping de sites (Yahoo Finance, Stooq…) : uniquement des API officielles dont les conditions autorisent l'affichage. Recherche faite en nov. 2026 : aucune API gratuite ne couvre Euronext/Xetra correctement (Twelve Data gratuit = US et usage production interdit ; Tiingo/Massive/Alpaca = US ; Alpha Vantage = 25 appels/j et 100 j d'historique). D'où EODHD + budget d'appels. Piste : ajouter Massive (ex-Polygon, gratuit, US, 1 appel « grouped daily » pour tous les titres US) pour économiser les appels EODHD sur les titres américains. Ajouter un fournisseur = implémenter `MarketProvider` (`worker/market/types.ts`) et le brancher dans `provider()` (`worker/market/index.ts`).
- **Chaque appel EODHD passe par `spend()`** (`worker/market/budget.ts`) : ne jamais appeler l'API sans réserver le budget. Offre gratuite = 20 appels/jour pour tout le site.
- Ajouter un format d'import = parseur pur dans `shared/importers/` + test + branchement dans `src/components/ImportWizard.tsx`.
- Schéma : nouvelle migration `migrations/000N_xxx.sql` (ne jamais modifier une migration appliquée), puis `npm run db:migrate:local`.
- Graphiques : palette catégorielle fixe (`--series-1..8`), une seule échelle Y, infobulle au survol, légende dès 2 séries.

## Environnement

- Hébergement : compte Cloudflare de Guillaume (gratuit). Site de Guillaume = Worker `flonary` + base D1 `flonary` (https://flonary.guillaume-astesana.workers.dev). Site de l'ami = Worker `flonary-ami` + base D1 `flonary-ami` (id `f98ead9a-bfe1-4dcd-a1f2-aed01096f405`, schéma déjà appliqué) → https://flonary-ami.guillaume-astesana.workers.dev. Le nom du Worker et la base viennent de `wrangler.toml`.
- **Déploiement** : automatique à chaque push sur `main` via `.github/workflows/deploy.yml`, qui lit les secrets GitHub (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, puis `EODHD_API_KEY`, `SECRETS_KEY`, etc. recopiés vers le Worker par `scripts/sync-secrets.mjs`). Aucun terminal requis pour l'utilisateur.
- Comptes : inscription ouverte et volontairement simple, à garder ainsi (l'utilisateur veut pouvoir partager le lien sans rien configurer ; chaque utilisateur ne voit que ses données), `ALLOWED_EMAILS` pour restreindre, `ALLOW_SIGNUP="false"` pour fermer. Connexion Google optionnelle (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `worker/google.ts`).
- Mise en ligne pas à pas pour l'utilisateur (non-développeur) : `docs/MISE-EN-LIGNE.md`. Le guider avec ce document, étape par étape, en expliquant chaque commande avant de la lancer.
- EODHD : gratuit = 20 appels/jour (≈ 15 titres, cours du soir, 1 an d'historique) ; payant « EOD Historical All-World » 199 $/an → secret `EODHD_DAILY_LIMIT=100000` (active les cours en journée). `/fundamentals` (10 appels) et le calendrier des résultats ne sont pas inclus → désactivés par défaut (`EODHD_FUNDAMENTALS="false"`).
- Secrets : `SECRETS_KEY` (chiffre les jetons IBKR en AES-GCM), `EODHD_API_KEY`, `EODHD_DAILY_LIMIT`. En local : `.dev.vars` (voir `.dev.vars.example`). La clé `demo` d'EODHD fonctionne pour quelques tickers US (AAPL, MSFT…) : pratique pour tester.
- La migration `0001_init.sql` est déjà appliquée sur les deux bases distantes.

## État au moment du transfert

Fonctionnel et testé : moteur + marché (29 tests), API (inscription, CSRF, CRUD, import dédoublonné, cours EODHD, FX BCE), parcours e2e (`npm run smoke`). Démo publiée en un seul fichier HTML.
Pas encore fait / non vérifié : premier déploiement en production (Guillaume doit ajouter les secrets GitHub, voir docs/MISE-EN-LIGNE.md partie A), test réel du connecteur IBKR avec un vrai jeton, connexion Google avec de vrais identifiants, cours européens avec une vraie clé EODHD (la clé `demo` ne couvre que quelques titres US). Voir `docs/ROADMAP.md`.
