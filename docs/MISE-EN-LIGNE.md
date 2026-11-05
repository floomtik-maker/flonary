# Mettre Flonary en ligne, pas à pas

Ce guide est écrit pour quelqu'un qui ne développe pas. Chaque étape dit **pourquoi** on la fait, **ce qu'il faut faire** et **ce qui va se passer**. Compter environ 20 minutes.

Coût : **0 €** pour l'hébergement (offre gratuite Cloudflare, aucune carte demandée). Seule la source des cours de bourse peut devenir payante (voir étape 2).

---

## Étape 0 — Préparer son ordinateur (une seule fois)

**Pourquoi** : les commandes de ce guide ont besoin de Node.js, un outil qui fait tourner les programmes JavaScript.

1. Aller sur https://nodejs.org
2. Cliquer sur le gros bouton vert **« Get Node.js »** puis **« Download Node.js (LTS) »** (la version « LTS » est la version stable).
3. Ouvrir le fichier téléchargé et suivre l'installation (« Continuer » / « Suivant » jusqu'au bout).
4. Ouvrir le **Terminal** (Mac : touche Cmd + Espace, taper « Terminal », Entrée).
5. Récupérer le projet et entrer dans son dossier (remplacer l'adresse par celle de **votre** dépôt GitHub) :

```bash
git clone https://github.com/VOTRE-COMPTE/flonary.git
```
```bash
cd flonary
```
```bash
npm install
```

**Ce qui se passe** : `git clone` copie le projet sur l'ordinateur ; `cd flonary` se place dans son dossier ; `npm install` télécharge les briques dont le projet a besoin (1 à 2 minutes, beaucoup de texte défile, c'est normal). Rien n'est encore mis en ligne.

---

## Étape 1 — Créer son compte Cloudflare (si on n'en a pas)

**Pourquoi** : Cloudflare héberge le site et sa base de données. L'offre gratuite suffit largement pour un usage personnel (100 000 visites de pages par jour).

1. Aller sur https://dash.cloudflare.com/sign-up
2. Saisir son e-mail et un mot de passe, cliquer sur **« Sign up »**.
3. Ouvrir l'e-mail de confirmation reçu de Cloudflare et cliquer sur le lien de vérification.

Aucune carte bancaire n'est demandée.

---

## Étape 2 — Obtenir sa clé pour les cours de bourse (EODHD)

**Pourquoi** : l'appli va chercher les cours des actions chez EODHD, un fournisseur officiel de données boursières. Il faut une « clé » (un mot de passe technique) pour avoir le droit de l'interroger. **Chacun utilise sa propre clé.**

### Combien ça coûte ?

| Offre | Prix | Appels par jour | Pour qui |
|---|---|---|---|
| **Free** | 0 €, **sans carte bancaire** | 20 (+ un bonus de bienvenue) | Essayer avec 3 à 5 titres |
| **EOD Historical All-World** | 19,99 $/mois (ou 199 $/an) | 100 000 | Usage réel, toutes les bourses du monde, 30 ans d'historique |

- L'appli consomme environ **2 à 3 appels par titre** à chaque mise à jour (cours, dividendes, divisions d'actions), et garde les résultats en mémoire plusieurs heures pour économiser. Avec l'offre gratuite, un portefeuille de 10 titres dépasse donc la limite dès le premier chargement.
- **Si la limite est dépassée** : EODHD refuse simplement les demandes suivantes jusqu'au lendemain (remise à zéro à minuit, heure de Londres). **Rien n'est facturé automatiquement.** Dans Flonary, les titres restent affichés à leur dernier cours connu.
- Conseil : commencer avec l'offre gratuite pour vérifier que tout marche, puis passer à « EOD Historical All-World » pour un vrai suivi.

### Créer la clé

1. Aller sur https://eodhd.com/register
2. Sous **« Sign up with »**, cliquer sur **« Google »** (ou **« GitHub »**) et se connecter avec ce compte. *(Si un formulaire e-mail + mot de passe est proposé, on peut aussi l'utiliser, puis confirmer via l'e-mail reçu.)* Aucune carte bancaire n'est demandée.
3. Une fois connecté, aller sur https://eodhd.com/cp/dashboard (le tableau de bord). La clé y est affichée sous le nom **« API token »** : une longue suite de lettres et de chiffres. Elle est aussi envoyée dans l'e-mail de bienvenue.
4. Copier cette clé (sélectionner, puis Cmd + C).
5. **Vérifier la clé** : coller cette adresse dans le navigateur en remplaçant `VOTRE_CLE` par la clé copiée :
   `https://eodhd.com/api/user?api_token=VOTRE_CLE&fmt=json`
   La page doit afficher les informations du compte (e-mail, nombre d'appels utilisés). Si elle affiche une erreur, la clé a été mal copiée.

*Le site d'EODHD évolue : si un libellé de bouton diffère légèrement, chercher l'équivalent le plus proche.*

### Passer à l'offre payante (plus tard)

1. Aller sur https://eodhd.com/pricing
2. Dans la colonne **« EOD Historical All-World »**, cliquer sur **« Sign up & Pay »** et payer par carte ou PayPal.
3. La clé ne change pas : rien à refaire dans Flonary.

---

## Étape 3 — Relier le Terminal à son compte Cloudflare

```bash
npx wrangler login
```

**Pourquoi** : `wrangler` est l'outil officiel de Cloudflare. Il doit être autorisé à agir sur votre compte pour y créer le site.

**Ce qui se passe** : une page Cloudflare s'ouvre dans le navigateur (se connecter si besoin) et demande d'autoriser Wrangler. Cliquer sur **« Allow »**. Le Terminal affiche ensuite « Successfully logged in ». Cette autorisation ne vaut que pour cet ordinateur.

---

## Étape 4 — Créer la base de données *(seulement si ce n'est pas déjà fait sur ce compte Cloudflare)*

> Guillaume : déjà fait sur ton compte, passe directement à l'étape 5.

```bash
npx wrangler d1 create flonary
```

**Pourquoi** : la base de données stocke vos comptes, vos opérations et vos réglages.

**Ce qui se passe** : Cloudflare crée une base vide et affiche un bloc de texte contenant `database_id = "…"`. Ouvrir le fichier `wrangler.toml` du projet et remplacer la valeur de `database_id` par celle affichée (ou demander à son agent IA de le faire). Puis :

```bash
npm run db:migrate:remote
```

**Ce qui se passe** : les tables de la base sont créées. Répondre **Y** (oui) si une confirmation est demandée.

---

## Étape 5 — Mettre le site en ligne

```bash
npm run deploy
```

**Pourquoi** : construit le site et l'envoie sur Cloudflare.

**Ce qui se passe** (environ 1 minute) :
- le site est préparé, puis la base est mise à jour si besoin (« No migrations to apply » est normal) ;
- la première fois sur un compte, Cloudflare peut demander de choisir un sous-domaine `workers.dev` : répondre **Y** et taper un nom (par ex. votre prénom) ;
- à la fin s'affiche l'adresse du site, du type `https://flonary.votre-nom.workers.dev`. **Notez-la.**

À ce stade, le site fonctionne mais sans les cours de bourse.

---

## Étape 6 — Donner au site ses deux secrets

Les secrets sont stockés chez Cloudflare, jamais dans le code. Après chaque commande, le Terminal affiche **« Enter a secret value: »** : coller la valeur puis Entrée. Le texte reste invisible pendant la saisie, c'est normal.

**a) La clé des cours de bourse** (celle de l'étape 2) :

```bash
npx wrangler secret put EODHD_API_KEY
```

**b) Une clé de chiffrement** qui protège vos accès courtier (Interactive Brokers) stockés dans la base. Générer une valeur au hasard avec :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copier la ligne affichée, puis :

```bash
npx wrangler secret put SECRETS_KEY
```

et coller la valeur. **Ne la changez plus ensuite** : sinon les connexions Interactive Brokers déjà enregistrées devront être refaites.

Chaque secret est pris en compte immédiatement, sans redéployer.

---

## Étape 7 — Créer son compte sur le site

1. Ouvrir l'adresse notée à l'étape 5.
2. Cliquer sur **« Créer un compte »**, saisir e-mail et mot de passe (10 caractères minimum).

**Important** : le premier compte créé est le seul autorisé ; les inscriptions sont ensuite fermées, donc personne d'autre ne peut créer de compte sur votre site. Faites-le tout de suite après le déploiement.

3. Dans **Comptes**, vérifier que l'encadré **« Source des cours »** affiche **« Actif · EODHD »**.

---

## Plus tard : mettre à jour le site

Après une modification du code (par vous ou votre agent IA) :

```bash
npm run deploy
```

Vos données ne sont pas touchées.
