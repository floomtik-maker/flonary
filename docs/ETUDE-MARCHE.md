# Étude de marché — suivi de portefeuille pour particuliers français

*Novembre 2026. Synthèse courte : à qui s'adresse Flonary, ce qui les gêne, ce que font les concurrents, et quoi construire ensuite. Les prix des concurrents viennent souvent de sites tiers : à revérifier avant de les citer.*

## 1. Cible

**Petits et moyens patrimoines financiers (≈ 5 k€ – 300 k€)**, autonomes, souvent 25–50 ans, qui investissent eux-mêmes.

| Fait | Chiffre | Source |
|---|---|---|
| PEA ouverts fin 2025 | ≈ 7,3 M (+ 0,3 M PEA-PME), encours record ≈ 126,5 Md€ | Banque de France [1][2] |
| Intérêt pour les actions | 34 % des Français, plus haut niveau depuis 2017 | Baromètre AMF 2025 [3] |
| Infos avant d'investir | 11 % utilisent une IA, 6 % les réseaux sociaux, 4 % des influenceurs | Baromètre AMF 2025 [3] |
| Aversion au risque | 51 % des femmes et 31 % des hommes refusent tout risque | Édition spéciale AMF, mars 2026 [4] |
| Investisseurs actifs | Suivis chaque trimestre ; toujours très actifs au T3 2025 | Tableau de bord AMF [5] |

**Profil type** : 2 à 4 enveloppes chez 2 à 4 établissements. Par exemple un PEA chez Trade Republic, Boursorama ou Fortuneo ; un CTO chez IBKR ou Degiro pour les actions US ; une assurance-vie ; un PEE ou un PER d'entreprise (BNP, Amundi, Natixis) ; parfois de la crypto. Souvent en investissement programmé (DCA) sur des ETF World, avec quelques actions en direct.

## 2. Difficultés principales

| # | Difficulté | Ce qu'on observe |
|---|---|---|
| 1 | **Comptes éparpillés** | Chaque appli affiche sa propre « performance », calculée à sa façon. Le tableur reste le recours, mais c'est chronophage et source d'erreurs [6][7]. |
| 2 | **Ne pas connaître sa vraie performance** | Les ventes clôturées sortent du calcul, les apports sont mélangés aux gains et le TWR manque avec des versements mensuels. Sur le forum Finary : « tout ce qui était fermé disparaissait », « +50 % affiché alors que je suis à −5 % » [8][9][10]. Trade Republic ne calcule pas de rendement pondéré dans le temps [11]. |
| 3 | **Comportement** (acheter haut, vendre bas) | L'écart entre le rendement des fonds et celui des investisseurs est d'environ 1,2 pt/an sur 10 ans (Morningstar *Mind the Gap* 2025). DALBAR : 8,5 pts en 2024, 0,7 pt en 2025 [12][13]. |
| 4 | **Fiscalité** | PFU (hausse des prélèvements sociaux en 2026), règles du PEA (5 ans, plafond, éligibilité), 2074 pour les plus-values du CTO. Les courtiers étrangers (IBKR, Degiro) ne fournissent pas d'IFU français. |
| 5 | **Frais cachés ou dilués** | Frais d'ordre, de change (USD), frais de gestion de l'assurance-vie et du PEE. Agrégés, ils sont rarement visibles [14]. |
| 6 | **PEE et PER d'entreprise opaques** | Les fonds ne sont pas cotés, la valeur liquidative est publiée à la semaine et la synchronisation est peu fiable dans les agrégateurs. Les dates de déblocage sont mal suivies. |
| 7 | **Diversification mal perçue** | Un « World » contient environ 70 % d'actions US. Les recoupements entre ETF et actions en direct, l'exposition au dollar et la concentration sectorielle (tech) sont invisibles. |
| 8 | **Cash qui dort** | Dividendes et ventes laissés en espèces sur le compte, sans qu'on s'en rende compte. |
| 9 | **Discipline et objectifs** | Tenir son DCA, savoir si l'on est « dans les clous » pour un objectif (résidence principale, retraite). |
| 10 | **Trop d'informations** | Les applis multiplient les graphiques, les scores et les fils sociaux (Getquin, Moning). L'utilisateur cherche 3 chiffres justes, pas 30. |

## 3. Concurrence

| Outil | Prix (indicatif) | Points forts | Points faibles / spécificités FR |
|---|---|---|---|
| **Finary** (FR) | Gratuit limité ; Plus ≈ 120–150 €/an [15][16] | Agrégation automatique (banques, AV, crypto, immobilier), ergonomie, communauté | **Performance centrée sur le latent** : les plus-values réalisées disparaissent, la saisie manuelle de transactions n'est pas prioritaire [8][9][10]. Synchronisations instables. Payant pour l'essentiel. |
| **Moning** (FR) | Freemium, Pro payant [17] | Dividendes : calendrier, prévisions, score de sûreté | Orienté dividendes US. Synchronisation des courtiers limitée, dividendes manquants ou mal datés [17][18]. |
| **Getquin** (DE) | Gratuit ; Pro ≈ 5–6 €/mois [19][20] | Courtiers européens (dont Trade Republic), volet social | Réseau social bruyant. Peu de spécificités françaises (PEA, PEE). |
| **Snowball Analytics** | ≈ 8–10 $/mois [21] | Dividendes, TWR/IRR, plus de 50 courtiers | En anglais, rien de spécifique à la fiscalité française. |
| **Sharesight** (NZ) | Gratuit limité ; ≈ 12 $/mois et plus [22] | Référence pour la perf. avec dividendes et réalisé, rapports fiscaux | Rapports fiscaux pour AU/NZ/UK/US/CA, pas la France. Cher. |
| **Delta** (eToro) | Gratuit ; Pro ≈ 9–10 $/mois [20] | Crypto et actions, interface soignée | Analyse de performance superficielle, rien sur PEA/PEE. |
| **Kubera** | ≈ 150–250 $/an [20] | Patrimoine net multi-actifs, héritage numérique | Suivi de patrimoine, pas de PRU ni de performance fine. Cher. |
| **Wealthfolio** | Gratuit, open source (AGPL) [23] | Données locales, sans compte, import CSV | Bureau ou auto-hébergé. Données de marché et formats FR limités. |
| **Applis de courtiers** (Trade Republic, Boursorama…) | Gratuit | Données exactes du compte | Un seul compte à la fois. Performance basique, pas de TWR [11]. |
| **Tableur** | Gratuit | Contrôle total | Manuel, fragile, pas de cours automatiques [7]. |

**À retenir** : personne ne combine (a) une **performance juste** (réalisé + latent + dividendes, apports séparés, TWR), (b) les **enveloppes françaises** (PEA, CTO, PEE) et (c) une **interface minimale**. C'est la place de Flonary.

## 4. Opportunités pour Flonary (classées)

Impact : ★★★ fort, ★★ moyen, ★ faible. Effort : S < 1 j, M = quelques jours, L = plus d'une semaine.

### Déjà fait

| Fonctionnalité | Difficultés traitées |
|---|---|
| Performance juste : poche de liquidités, réalisé conservé, apports séparés, TWR, dividendes | 2 (cœur du produit) |
| Multi-comptes consolidés : import CSV, Trade Republic, IBKR Flex, saisie manuelle des fonds de PEE | 1, 6 |
| Exposition (pays, secteurs, devises) et risque SRI 1–7 | 7 |
| Zones d'achat et de sortie, signaux | 3 |
| Calendrier des dividendes ; simulateur d'investissement mensuel | 8, 9 |
| Gratuit, sans publicité, sans volet social | 10 |

### À faire (10 max, par priorité)

| # | Fonctionnalité / principe | Difficultés | Impact | Effort |
|---|---|---|---|---|
| 1 | **Une phrase de synthèse en tête** : « Vous avez versé X, vous avez Y, soit +Z € (+T %/an) », et rien d'autre au-dessus de la ligne de flottaison | 2, 10 | ★★★ | S |
| 2 | **Comparaison à un indice** (ETF World, ex. CW8.PA) sur la même période et avec les mêmes versements : « auriez-vous fait mieux avec un ETF World ? » | 2, 3 | ★★★ | M |
| 3 | **Récap fiscal annuel** : plus-values réalisées du CTO par année (aide à la 2074), dividendes bruts et retenue à la source, mention « PEA : rien à déclarer » | 4 | ★★★ | M |
| 4 | **Frais payés** : total par an et par compte (ordres, change, frais de gestion), en € et en % des encours | 5 | ★★ | S |
| 5 | **Dates clés des enveloppes** : 5 ans du PEA, déblocage du PEE (5 ans / cas anticipés), plafond de versement du PEA restant | 4, 6 | ★★ | S |
| 6 | **Alerte cash qui dort** : liquidités supérieures à X % ou présentes depuis plus de N jours dans un compte | 8 | ★★ | S |
| 7 | **Suivi du DCA** : versement mensuel prévu vs réalisé, mois manqués, projection vers l'objectif | 9 | ★★ | M |
| 8 | **Exposition des ETF par transparence** (US, tech, dollar réels) | 7 | ★★ | L |
| 9 | **Synchro sans effort** : IBKR chaque nuit, rappel mensuel « importez votre CSV Trade Republic » | 1 | ★★ | M |
| 10 | **Garde-fous comportementaux discrets** : à la vente, rappeler le PRU, la plus-value et la fiscalité ; après une forte baisse, afficher l'historique long terme plutôt que des alertes | 3 | ★ | S |

**Principes d'interface** (demande du propriétaire) : un chiffre clé par écran ; le détail à la demande (clic) ; pas de score, de fil social ni de notifications par défaut ; libellés en français courant (« argent versé », « gain »). Chaque nouvelle fonctionnalité doit remplacer un affichage existant ou se cacher derrière un clic.

## 5. Sources

1. Banque de France — Plan d'épargne en actions 2025 : https://www.banque-france.fr/fr/statistiques/epargne/plan-depargne-en-actions-2025
2. France Épargne — PEA, encours record 2025 : https://www.france-epargne.fr/news/pea-encours-record-de-1265-milliards-deuros-en-2025-malgre-la-hausse-des-prelevements-sociaux
3. AMF — Baromètre 2025 : https://www.amf-france.org/fr/actualites-publications/communiques/communiques-de-lamf/barometre-amf-2025-en-quete-dautonomie-les-francais-sont-nombreux-recourir-lintelligence ; rapport complet : https://www.amf-france.org/fr/actualites-publications/publications/rapports-etudes-et-analyses/barometre-amf-de-lepargne-et-de-linvestissement-2025
4. AMF — Édition spéciale femmes et investissement : https://www.amf-france.org/fr/actualites-publications/communiques/communiques-de-lamf/edition-speciale-du-barometre-amf-des-ecarts-marques-persistent-entre-les-femmes-et-les-hommes-en
5. AMF — Tableau de bord des investisseurs particuliers actifs n° 20 : https://www.amf-france.org/fr/actualites-publications/publications/observatoire-de-lepargne/tableau-de-bord-des-investisseurs-particuliers/tableau-de-bord-des-investisseurs-particuliers-actifs-ndeg20-octobre-2025
6. S'investir — Avis Finary : https://sinvestir.fr/test-finary
7. La Fabrique du Net — Alternatives à Finary : https://www.lafabriquedunet.fr/logiciels/alternatives/alternative-finary
8. Forum Finary — Transactions manuelles (plus-value réalisée) : https://community.finary.com/t/fonctionnalite-creer-transactions-manuelles-plus-value-realisee/1620?page=4
9. Forum Finary — Différencier apport et performance : https://community.finary.com/t/fonctionnalite-differencier-apport-et-performance/2454
10. Forum Finary — Mise à jour des calculs de la performance : https://community.finary.com/t/live-mise-a-jour-des-calculs-de-la-performance/12950 ; Problème suivi de performance : https://community.finary.com/t/probleme-suivi-de-performance/36121
11. Suivi Trade Republic (source commerciale) : https://trackinv.pages.dev/trade-republic-portfolio-tracker/
12. DALBAR QAIB 2026 : https://www.dalbar.com/PressReleases/doc/2026QAIBReportPressRelease.pdf
13. Morningstar *Mind the Gap*, synthèse : https://en.oninvest.com/article/mind-the-gap-why-funds-win-over-the-investors-who-invest-in-them
14. Forum Finary — Erreur de calcul des frais PER/AV : https://community.finary.com/t/erreur-de-calcul-des-frais-sur-per-et-av/16111
15. Signal Alpha — Avis Finary 2026 : https://signal-alpha.fr/avis-finary/
16. Finary Plus : https://finary.com/de/finary-plus
17. Moning (App Store) : https://apps.apple.com/FR/app/id1488720155 ; parrainage et avis : https://www.super-parrain.com/offres/banque/parrainage-moning
18. Forum Finary — Suivi des dividendes : https://community.finary.com/t/live-suivi-des-dividendes/773
19. Freenance — Avis Getquin 2026 : https://freenance.io/products/getquin-review-2026-portfolio-tracker-european-investors-app/
20. Freenance — Meilleurs outils de suivi en Europe 2026 : https://freenance.io/financial-tools/best-portfolio-trackers-2026/ ; AllInvestView : https://www.allinvestview.com/articles/best-portfolio-tracker/
21. Freenance — Avis Snowball Analytics 2026 : https://freenance.io/products/snowball-analytics-review-2026-portfolio-tracker-crypto-stocks-etf/
22. SpotSaaS — Snowball vs Sharesight : https://www.spotsaas.com/compare/snowball-analytics-vs-sharesight
23. Wealthfolio : https://github.com/afadil/wealthfolio
