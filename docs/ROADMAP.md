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

1. **Mettre en ligne** : secrets GitHub + Actions (docs/MISE-EN-LIGNE.md). Clé EODHD gratuite pour commencer.
2. **Vérifier avec les vraies données** de l'utilisateur : synchro IBKR avec un vrai jeton, import d'un export Trade Republic réel, saisie du PEE. Ajuster les parseurs si les colonnes diffèrent (ajouter un test avec un extrait anonymisé).
3. **Synchro IBKR nocturne** : le cron du soir rafraîchit déjà les cours ; y ajouter la synchronisation des connexions Interactive Brokers.
4. **Économiser EODHD sur les titres US** : fournisseur Massive (ex-Polygon, gratuit, 5 appels/min, endpoint « grouped daily » = tous les cours US en 1 appel, `adjusted=false`).
5. **Benchmark** sur la courbe de synthèse (ex. MSCI World via l'ETF CW8.PA) pour comparer sa performance.
6. **Exposition des ETF par transparence** (répartition réelle d'un MSCI World par pays/secteur) au lieu d'une zone unique.
7. **Fiscalité** : plus-values réalisées par année civile (aide à la déclaration 2074 pour le CTO), distinction PEA / CTO.
8. **Alertes** : notification (e-mail ou push) quand un titre entre dans sa zone d'achat ou de sortie, ou à l'approche d'un dividende.
9. **Crypto** : symboles `BTC-USD` déjà gérés par le moteur ; ajouter un import (Binance, Kraken) si besoin.
10. Sécurité : limiter les tentatives de connexion (table `login_attempts` ou Cloudflare Rate Limiting), réinitialisation de mot de passe par e-mail.

## Idées écartées (et pourquoi)

- **Scraping Yahoo Finance / Stooq** : non officiel, contraire aux conditions d'utilisation. On utilise des API officielles avec clé.
- **Twelve Data, Tiingo gratuits** : leurs conditions interdisent l'affichage / la production (vérifié nov. 2026) ; Twelve Data gratuit ne couvre que les US.
- **Agrégateurs bancaires (Powens, Bridge…)** pour Trade Republic / BNP : payants et soumis à agrément ; l'import CSV couvre le besoin pour un usage personnel.

## Prochaines fonctionnalités recommandées (étude de marché)

Voir [docs/ETUDE-MARCHE.md](ETUDE-MARCHE.md) (difficultés des particuliers, concurrents, priorités). En bref :

1. Phrase de synthèse unique en tête (versé → valeur → gain, %/an).
2. Comparaison à un ETF World avec les mêmes versements (rejoint le point 5).
3. Récap fiscal annuel : plus-values du CTO pour la 2074, dividendes (rejoint le point 7).
4. Total des frais payés par an et par compte.
5. Dates clés des enveloppes (5 ans du PEA, déblocage du PEE, plafond restant du PEA) et alerte « cash qui dort ».
