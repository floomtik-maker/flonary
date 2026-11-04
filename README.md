# Flonary

Appli web de suivi de portefeuille boursier : tous vos comptes (Interactive Brokers, Trade Republic, PEE BNP Paribas…) au même endroit, avec une performance qui **garde vos plus-values réalisées**.

- **Synthèse** : valeur totale, gain depuis le début, évolution sur 1 mois / 6 mois / YTD / 1 an / tout, argent investi vs valeur.
- **Positions** : quantité, PRU, cours, plus-value latente, poids ; positions vendues avec leur gain réalisé.
- **Fiche titre** : graphique avec PRU, moyennes mobiles 50/200 jours, zones d'achat et de prise de bénéfices, stop de protection, RSI, risque 1–7.
- **Mouvements** : achats, ventes, dividendes, versements, retraits, frais ; import CSV/XML sans doublons.
- **Analyse** : exposition par zone, pays, secteur, type d'actif, devise, compte ; risque du portefeuille ; signaux ; points d'attention.
- **Calendrier** : dividendes (annoncés ou estimés à partir de l'an dernier) et publications de résultats.
- **Projection** : simulateur d'investissement mensuel (intérêts composés, fourchette pessimiste/optimiste).
- **Connexion Interactive Brokers** (Flex Web Service) ; import Trade Republic (CSV) ; valorisation manuelle pour les fonds de PEE.
- Responsive (PC + mobile), installable sur l'écran d'accueil.

> ⚠️ Les signaux et zones d'achat/vente sont des indicateurs techniques automatiques, pas des conseils en investissement.

## La règle de calcul de la performance

Sur la plupart des agrégateurs, vendre une ligne en plus-value fait « disparaître » ce gain du portefeuille. Ici non :

- chaque compte a une **poche de liquidités** : le produit des ventes et les dividendes y restent ;
- un achat est d'abord payé avec cette poche ; seul le complément compte comme **argent nouveau investi** ;
- **valeur totale** = titres + poche ; **gain** = valeur totale − argent net investi.

Exemple : 1 000 € investis, revendus 1 200 € → valeur 1 200 €, gain +200 € (+20 %), qui restent dans la performance même si vous rachetez autre chose avec.

Les courbes de performance par période utilisent le rendement pondéré dans le temps (TWR), qui n'est pas faussé par vos versements. Le PRU suit la méthode du prix moyen pondéré (frais d'achat inclus), comme en France.

## Démarrer

Prérequis : Node.js 20+.

```bash
npm install
```

### Voir la démo (aucune configuration)

```bash
npm run dev:demo
```

Ouvre http://localhost:5173 avec un portefeuille fictif et des cours simulés. Les modifications restent dans le navigateur.

### Lancer l'appli complète en local

```bash
cp .dev.vars.example .dev.vars   # puis renseignez une clé de cours (voir plus bas)
npm run db:migrate:local
npm run build
npx wrangler dev                 # http://localhost:8787 (appli + API + base locale)
```

Pour développer l'interface avec rechargement à chaud, lancez en parallèle `npx wrangler dev` et `npm run dev` (Vite redirige `/api` vers le worker).

### Vérifier

```bash
npm run check    # types + tests unitaires
npm run smoke    # test de bout en bout (wrangler dev lancé + Playwright installé)
```

## Mise en ligne (Cloudflare)

L'appli tourne sur un **Cloudflare Worker** (gratuit pour un usage perso) avec une base **D1**. La base `flonary` existe déjà sur le compte Cloudflare de Guillaume (identifiant dans `wrangler.toml`) et son schéma est appliqué.

```bash
npx wrangler login
npx wrangler secret put SECRETS_KEY       # une longue chaîne aléatoire (chiffre les jetons des courtiers)
npx wrangler secret put EODHD_API_KEY     # clé de la source de cours (voir ci-dessous)
npm run deploy                            # build + migrations + déploiement
```

L'URL s'affiche à la fin (`https://flonary.<sous-domaine>.workers.dev`). Créez votre compte : **seul le premier compte peut s'inscrire** ; pour ouvrir les inscriptions, passez `ALLOW_SIGNUP` à `"true"` dans `wrangler.toml`.

Déploiement automatique : ajoutez les secrets `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` au dépôt GitHub ; chaque push sur `main` déploie (`.github/workflows/deploy.yml`).

### Changer de compte Cloudflare (transfert du projet)

```bash
npx wrangler login
npx wrangler d1 create flonary            # copiez le database_id affiché dans wrangler.toml
npm run db:migrate:remote
npx wrangler secret put SECRETS_KEY
npx wrangler secret put EODHD_API_KEY
npm run deploy
```

Les données d'un ancien déploiement se transfèrent avec **Comptes → Sauvegarde → Exporter / Restaurer**.

## Source des cours

Les cours viennent d'API officielles (pas de scraping) ; il faut au moins une clé :

| Variable | Fournisseur | Couverture | Gratuit |
|---|---|---|---|
| `EODHD_API_KEY` (recommandé) | [EODHD](https://eodhd.com) | Monde (US, Euronext, Xetra, LSE…), dividendes, splits, calendrier | 20 requêtes/jour, 1 an d'historique ; offre « EOD All World » ~20 €/mois pour un usage réel |
| `TWELVEDATA_API_KEY` | [Twelve Data](https://twelvedata.com) | Surtout US en gratuit | 800 requêtes/jour |

Les deux peuvent être configurées : EODHD est essayé d'abord, Twelve Data ensuite. Les réponses sont mises en cache dans D1 (6 h pour l'historique, 10 min pour les cours), et en cas de panne le dernier cours connu est utilisé. Les taux de change viennent de la BCE (Frankfurter, sans clé). Sans aucune clé, l'appli fonctionne quand même : chaque titre est valorisé à son dernier prix saisi.

Les tickers suivent la convention `AAPL`, `MC.PA` (Paris), `ASML.AS` (Amsterdam), `SAP.DE` (Xetra), `VOD.L` (Londres).

## Courtiers

- **Interactive Brokers** — *Comptes → Connecter Interactive Brokers*. Dans le Client Portal : créez une *Activity Flex Query* (sections **Trades** et **Cash Transactions**, format XML, période « Last 365 days »), activez le *Flex Web Service* et copiez le jeton + l'identifiant de requête. Le bouton *Synchroniser* importe les nouvelles opérations sans doublons. Vous pouvez aussi importer un relevé Flex en CSV/XML.
- **Trade Republic** — pas d'API officielle. Exportez vos transactions en CSV avec l'outil open source [pytr](https://github.com/pytr-org/pytr) (`pytr export_transactions`), puis *Importer un fichier*. Tout CSV avec des colonnes date / type / ticker ou ISIN / quantité / prix fonctionne aussi (colonnes ajustables à l'import).
- **PEE BNP Paribas** — les fonds d'épargne salariale ne sont pas cotés : saisissez vos versements en choisissant « Utiliser … comme support à valorisation manuelle », puis mettez à jour la valeur de la part dans la fiche du fonds.

## Pour continuer le développement

Tout est décrit dans [`CLAUDE.md`](CLAUDE.md) (architecture, conventions, pièges) et [`docs/ROADMAP.md`](docs/ROADMAP.md) (prochaines étapes).
