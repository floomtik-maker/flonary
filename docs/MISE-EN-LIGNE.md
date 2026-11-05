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

**Pourquoi** : l'appli récupère les cours chez un fournisseur officiel de données boursières, qui demande une « clé » (un mot de passe technique). **Chacun utilise la sienne.** Elle se colle dans les secrets GitHub (étapes A3 ou B3) : le site la récupère au prochain déploiement.

<!-- PRICE-PROVIDER-SECTION -->

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
