# Mettre Flonary en ligne, pas à pas

Guide pour quelqu'un qui ne développe pas. **Aucune commande à taper** : tout se fait dans le navigateur, sur Cloudflare (l'hébergeur) et GitHub (là où est le code). Ensuite, chaque modification poussée sur la branche `main` met le site à jour automatiquement.

Coût : **0 €**. L'offre gratuite de Cloudflare suffit largement (100 000 pages vues par jour) et ne demande pas de carte bancaire.

> **Ami de Guillaume** : l'hébergement est déjà prêt pour toi sur le compte Cloudflare de Guillaume. Fais seulement la partie B (ton agent IA te guidera). La partie A est pour Guillaume. Si un jour tu veux ton propre hébergement, voir la partie D.

---

## A. Côté Guillaume (propriétaire du compte Cloudflare) — une seule fois

### A1. Créer une clé d'accès Cloudflare (« API token »)

**Pourquoi** : GitHub doit avoir le droit de publier le site sur ton compte Cloudflare. Cette clé lui donne ce droit, limité aux Workers (le site) et à D1 (la base de données).

1. Ouvre https://dash.cloudflare.com/profile/api-tokens
2. Clique sur le bouton bleu **« Create Token »**.
3. Sur la ligne du modèle **« Edit Cloudflare Workers »**, clique sur **« Use template »** (à droite).
4. Dans la section **« Permissions »**, clique sur **« + Add more »**, puis choisis dans les trois menus : **Account** → **D1** → **Edit**.
5. Section **« Account Resources »** : **Include** → ton compte.
6. Section **« Zone Resources »** : **Include** → **All zones**.
7. En bas, clique sur **« Continue to summary »**, puis sur **« Create Token »**.
8. **Copie la clé affichée** et garde-la dans une note : Cloudflare ne la montrera plus. Tu la colleras dans GitHub (étape A3) et tu la donneras à ton ami par message privé.

### A2. Trouver l'identifiant de ton compte Cloudflare (« Account ID »)

1. Ouvre https://dash.cloudflare.com et clique sur ton compte si on te le demande.
2. Regarde l'adresse dans la barre du navigateur : `https://dash.cloudflare.com/` **`xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`** `/home`. Les 32 caractères au milieu sont l'**Account ID**. Copie-les.

### A3. Donner ces informations à GitHub

1. Ouvre https://github.com/guillaumeast/flonary/settings/secrets/actions
2. Clique sur le bouton vert **« New repository secret »**.
3. **Name** : `CLOUDFLARE_API_TOKEN`. **Secret** : colle la clé de l'étape A1. Clique sur **« Add secret »**.
4. Recommence avec **Name** `CLOUDFLARE_ACCOUNT_ID` et l'identifiant de l'étape A2.
5. Recommence avec **Name** `SECRETS_KEY` et, comme valeur, **40 caractères tapés au hasard** (lettres et chiffres). Cette valeur chiffre les accès courtier stockés dans la base. Ne la change plus ensuite.
6. Ajoute la clé des cours de bourse (voir la partie C) de la même façon.

### A4. Lancer la première mise en ligne

1. Ouvre https://github.com/guillaumeast/flonary/actions/workflows/deploy.yml
2. À droite, clique sur **« Run workflow »**, puis sur le bouton vert **« Run workflow »** dans le petit menu.
3. Attends 2 à 3 minutes : une coche verte apparaît. (Croix rouge : clique dessus, puis sur l'étape en rouge pour voir l'erreur, et montre-la à ton agent IA.)
4. Le site est en ligne sur **https://flonary.guillaume-astesana.workers.dev**

Ensuite, chaque push sur `main` remet le site à jour tout seul.

### A5. Créer ton compte sur le site

Ouvre l'adresse, clique sur **« Créer un compte »**. **Chacun crée son propre compte et ne voit que ses propres données.** Pour réserver le site à certaines personnes, ajoute dans GitHub un secret `ALLOWED_EMAILS` contenant les e-mails autorisés séparés par des virgules (par ex. `moi@gmail.com,ami@gmail.com`), puis relance l'étape A4.

---

## B. Côté ami (fork) — la version de l'ami, hébergée chez Guillaume

L'ami a sa propre copie du code (un « fork ») et son propre site, avec sa propre base de données. Les deux versions évoluent indépendamment. La base de l'ami (`flonary-ami`) est **déjà créée** sur le Cloudflare de Guillaume.

1. **Activer les automatisations du fork.** GitHub les désactive sur les forks. Ouvre l'onglet **« Actions »** de ton fork et clique sur le bouton vert **« I understand my workflows, go ahead and enable them »**.
2. **Pointer vers ton site et ta base.** Dans `wrangler.toml` (ton agent IA peut le faire), remplace :
   - `name = "flonary"` par `name = "flonary-ami"`
   - `database_name = "flonary"` par `database_name = "flonary-ami"`
   - le `database_id` par `f98ead9a-bfe1-4dcd-a1f2-aed01096f405`
3. **Ajouter les secrets** dans ton fork : onglet **« Settings »** → menu de gauche **« Secrets and variables »** → **« Actions »** → **« New repository secret »**. Ajoute :
   - `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` : demande-les à Guillaume ;
   - `SECRETS_KEY` : 40 caractères tapés au hasard ;
   - ta propre clé de cours de bourse (partie C).
4. **Publier** : pousse le changement de l'étape 2 sur `main` (ton agent le fait). Le site se met en ligne en 2 à 3 minutes, sur **https://flonary-ami.guillaume-astesana.workers.dev**
5. Ouvre l'adresse et clique sur **« Créer un compte »**.

---

## C. La clé pour les cours de bourse

**Pourquoi** : l'appli récupère les cours chez un fournisseur officiel de données boursières, qui demande une « clé » (un mot de passe technique). **Chacun utilise la sienne.**

**Le plus simple : la coller directement dans l'appli.** Connecte-toi au site, ouvre **Comptes**, carte **« Source des cours »**, colle la clé dans **« Clé EODHD »** (coche « J'ai l'offre payante » si c'est le cas) puis **« Enregistrer »**. Flonary vérifie la clé auprès d'EODHD et l'enregistre chiffrée : rien à faire dans GitHub ni Cloudflare. La clé vaut pour tout le site (tous ses utilisateurs).

*Autre possibilité (pour les techniciens)* : la mettre dans les secrets GitHub (étapes A3 ou B3, voir l'étape 5 ci-dessous) ; elle est alors prioritaire sur celle collée dans l'appli.

### Ce qu'il faut savoir

Après une recherche approfondie, **aucune source gratuite et légale ne couvre correctement les bourses européennes** (Paris, Amsterdam, Francfort). Les alternatives sont limitées aux actions américaines, ou interdisent l'affichage dans une appli. Flonary utilise donc **EODHD**, qui couvre toutes les bourses, en économisant au maximum les appels.

| Offre EODHD | Prix | Ce que ça donne dans Flonary |
|---|---|---|
| **Free** | 0 €, **sans carte bancaire** | 20 appels par jour. Cours mis à jour **chaque soir**, historique limité à 1 an. Confortable jusqu'à **une quinzaine de titres**. |
| **EOD Historical All-World** | **199 $/an** (≈ 16,60 $/mois) ou 19,99 $/mois | Illimité en pratique (100 000 appels/jour), 30 ans d'historique, cours **en journée** (différés de 15 min). |

- **Coût en appels** : un titre ajouté coûte 3 appels la première fois (cours, dividendes, divisions d'actions), puis 1 appel par soir. Le site garde tout en mémoire, partagé entre ses utilisateurs : recharger la page ne coûte rien.
- **Quota dépassé ?** EODHD refuse simplement les demandes suivantes jusqu'à minuit (heure de Londres). **Rien n'est facturé.** Flonary affiche le dernier cours connu et rattrape le soir suivant.
- La **recherche par code ISIN** (utilisée par les imports Trade Republic) est gratuite et ne consomme pas d'appels.

### Créer la clé (gratuit)

1. Ouvre https://eodhd.com/register
2. Sous **« Sign up with »**, clique sur **« Google »** (ou **« GitHub »**) et connecte-toi avec ce compte. Aucune carte bancaire n'est demandée.
3. Une fois connecté, ouvre https://eodhd.com/cp/dashboard : la clé est affichée sous le nom **« API token »** (une longue suite de lettres et de chiffres). Elle arrive aussi dans l'e-mail de bienvenue.
4. **Vérifie la clé** : ouvre `https://eodhd.com/api/user?api_token=TA_CLE&fmt=json` en remplaçant `TA_CLE`. La page doit afficher les infos de ton compte. Si elle affiche une erreur, la clé est mal copiée.
5. Colle-la dans l'appli (**Comptes** → **Source des cours**) — c'est terminé. *Ou*, version technique : dans GitHub (**Settings** → **Secrets and variables** → **Actions** → **New repository secret**) : **Name** `EODHD_API_KEY`, **Secret** = la clé → **« Add secret »**.
6. Seulement si tu as utilisé GitHub : relance la mise en ligne (étape A4, ou pousse n'importe quel changement sur `main`).

*Le site d'EODHD évolue : si un libellé diffère légèrement, cherche l'équivalent le plus proche.*

### Passer à l'offre payante (plus tard)

1. Ouvre https://eodhd.com/pricing
2. Dans la colonne **« EOD Historical All-World »**, choisis l'annuel ou le mensuel et clique sur **« Sign up & Pay »** (carte ou PayPal). La clé ne change pas.
3. Dans l'appli : **Comptes** → **Source des cours** → **« Changer la clé »**, recolle la clé et coche **« J'ai l'offre payante »**. *Ou*, si la clé est dans GitHub : dans les secrets GitHub, ajoute **Name** `EODHD_DAILY_LIMIT`, **Secret** `100000`, puis relance la mise en ligne. Flonary active alors les cours en journée.

---

## D. (Optionnel) Ajouter « Continuer avec Google »

**Pourquoi** : se connecter en un clic avec son compte Google au lieu d'un mot de passe. C'est facultatif : l'inscription par e-mail marche sans ça. Environ 10 minutes, une fois par site.

1. Ouvre https://console.cloud.google.com/projectcreate. **Project name** : `Flonary`, puis **« Create »**.
2. Ouvre https://console.cloud.google.com/auth/overview (vérifie en haut que le projet « Flonary » est sélectionné) et clique sur **« Get started »** :
   - **App name** : `Flonary` ; **User support email** : ton e-mail ; **« Next »** ;
   - **Audience** : **External** ; **« Next »** ;
   - **Contact information** : ton e-mail ; **« Next »** ;
   - coche l'acceptation des conditions, puis **« Create »**.
3. Ouvre https://console.cloud.google.com/auth/audience et clique sur **« Publish app »**, puis **« Confirm »**. Sans ça, seuls les « test users » peuvent se connecter.
4. Ouvre https://console.cloud.google.com/auth/clients et clique sur **« + Create client »** :
   - **Application type** : **Web application** ; **Name** : `Flonary` ;
   - **Authorized redirect URIs** → **« + Add URI »** → colle l'adresse du site suivie de `/api/auth/google/callback`, par exemple
     `https://flonary.guillaume-astesana.workers.dev/api/auth/google/callback`
     (et, pour le site de l'ami, ajoute aussi `https://flonary-ami.guillaume-astesana.workers.dev/api/auth/google/callback`) ;
   - clique sur **« Create »**.
5. Une fenêtre affiche le **Client ID** et le **Client secret**. Copie-les dans les secrets GitHub sous les noms `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`, puis relance le déploiement. Un même client Google peut servir aux deux sites.

*Les écrans Google évoluent : si un libellé diffère légèrement, cherche l'équivalent le plus proche.*

---

## E. (Optionnel) Héberger sur son propre compte Cloudflare

1. Créer un compte : https://dash.cloudflare.com/sign-up → e-mail + mot de passe → **« Sign up »** → cliquer sur le lien reçu par e-mail.
2. Créer la base : https://dash.cloudflare.com → menu de gauche **« Storage & databases »** → **« D1 SQL database »** → **« Create Database »** → nom `flonary` → **« Create »**. Copier le **Database ID** affiché.
3. Mettre ce `database_id` et `name = "flonary"` dans `wrangler.toml`.
4. Refaire les étapes A1 à A4 avec son propre compte et son propre dépôt. La base est remplie automatiquement au premier déploiement.
5. Pour récupérer ses données de l'ancien site : **Comptes → Sauvegarde → Exporter** sur l'ancien, **Restaurer** sur le nouveau.
