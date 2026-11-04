# Feuille de route

## Fait (v0.1)

- Moteur de performance avec poche de liquidités (gains réalisés conservés), PRU, TWR, splits, multi-devises.
- Synthèse, positions (ouvertes / vendues), fiche titre avec zones d'achat / sortie et risque.
- Mouvements : saisie, modification, suppression ; import CSV générique, Trade Republic (pytr), IBKR Flex CSV/XML, sans doublons.
- Connexion Interactive Brokers via Flex Web Service (jeton chiffré).
- Valorisation manuelle (fonds de PEE).
- Analyse : exposition (zones, pays, secteurs, actifs, devises, comptes), risque SRI 1–7, signaux, points d'attention.
- Calendrier dividendes / résultats ; simulateur d'investissement mensuel.
- Comptes utilisateurs, sauvegarde / restauration JSON, mode démo, PWA installable.

## À faire ensuite (par priorité)

1. **Mettre en ligne** : `wrangler login`, secrets, `npm run deploy` (voir README). Prendre une clé EODHD (l'offre gratuite est limitée à 20 requêtes/jour).
2. **Vérifier avec les vraies données** de l'utilisateur : synchro IBKR avec un vrai jeton, import d'un export Trade Republic réel, saisie du PEE. Ajuster les parseurs si les colonnes diffèrent (ajouter un test avec un extrait anonymisé).
3. **Mise à jour automatique** : Cron Trigger Cloudflare (`[triggers] crons` dans `wrangler.toml` + handler `scheduled`) pour synchroniser IBKR chaque nuit et préchauffer le cache des cours.
4. **Benchmark** sur la courbe de synthèse (ex. MSCI World via l'ETF CW8.PA) pour comparer sa performance.
5. **Exposition des ETF par transparence** (répartition réelle d'un MSCI World par pays/secteur) au lieu d'une zone unique.
6. **Fiscalité** : plus-values réalisées par année civile (aide à la déclaration 2074 pour le CTO), distinction PEA / CTO.
7. **Alertes** : notification (e-mail ou push) quand un titre entre dans sa zone d'achat ou de sortie, ou à l'approche d'un dividende.
8. **Crypto** : symboles `BTC-USD` déjà gérés par le moteur ; ajouter un import (Binance, Kraken) si besoin.
9. Sécurité : limiter les tentatives de connexion (table `login_attempts` ou Cloudflare Rate Limiting), réinitialisation de mot de passe par e-mail.

## Idées écartées (et pourquoi)

- **Scraping Yahoo Finance** : non officiel, contraire aux conditions d'utilisation et bloqué fréquemment. On utilise des API officielles avec clé.
- **Agrégateurs bancaires (Powens, Bridge…)** pour Trade Republic / BNP : payants et soumis à agrément ; l'import CSV couvre le besoin pour un usage personnel.
