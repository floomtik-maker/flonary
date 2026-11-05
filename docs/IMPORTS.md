# Importer ses opérations depuis son courtier

Flonary reconnaît automatiquement le fichier à partir de sa première ligne (en-têtes). Les titres sans ticker sont identifiés par leur ISIN. Si un format n'est pas reconnu, l'import CSV générique permet d'associer les colonnes à la main.

Formats « vérifiés » = structure tirée de vrais fichiers ; « supposés » = déduits de l'interface du courtier, à confirmer avec un vrai export (signalez tout écart).

## Degiro (vérifié)
Site web → **Boîte de réception** (ou **Activité**) → **Transactions** → choisir la période → **Exporter** → **CSV** : donne `Transactions.csv` (achats/ventes).
Puis **Activité** → **Relevé de compte** → période → **Exporter** → **CSV** : donne `Account.csv` (versements, dividendes, impôts, frais). Importer les deux fichiers ; les achats/ventes d'`Account.csv` sont ignorés.

## Trade Republic (supposé pour l'export officiel)
Application web → **Profil** → **Relevés / Documents** → **Export des transactions** → choisir les dates → **Créer** puis télécharger le CSV.
L'export `pytr` (outil communautaire) reste aussi accepté par l'import CSV.

## Boursorama / BoursoBank (supposé)
Espace client → **Bourse** → compte titres ou PEA → **Mouvements** → choisir la période → **Rechercher** → icône **Exporter** → **CSV**.

## Fortuneo (supposé)
Espace client → **Bourse** → **Historique des opérations** → période → **Télécharger** (CSV). Ce fichier ne contient pas d'ISIN : ajouter une colonne « Code ISIN » si possible, sinon passer par l'import générique.

## Bourse Direct (supposé)
Espace client → **Mon portefeuille** → **Historique des opérations** → période → **Exporter** (CSV/Excel, enregistrer en CSV).

## Saxo Banque (supposé)
SaxoTraderGO → **Compte** → **Rapports** → **Transactions** (ou **Opérations clôturées**) → période → **Exporter** → Excel, puis enregistrer en CSV.
