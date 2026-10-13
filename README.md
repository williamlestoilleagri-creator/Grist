# Widgets Grist

| Fichier | Description |
|---|---|
| `erp-sap.html` | ERP intégré « façon SAP » (ventes, achats, stocks, comptabilité) |
| `infographies-dsfr.html` | Studio d'infographies DSFR (63 modèles, bloc-marque Préfet / Préfète) |
| `annuaire-adresses.html` | Annuaire d'adresses géocodées (BAN) |
| `grist-assistant-claude.html` | Assistant Claude |

## ERP « façon SAP » (`erp-sap.html`)

Charte graphique de l'État (DSFR) : police Marianne, bleu France, bloc-marque « République française » (désactivable dans SPRO).

### Installation dans Grist

1. Ajoutez une vue **Widget personnalisé** à une page de votre document.
2. Renseignez l'URL du fichier publié (par exemple via GitHub Pages) — ou collez le contenu du fichier dans le **Custom Widget Builder** de Grist.
3. Dans le panneau du widget, réglez **Accès** sur **Accès complet au document**.
4. Au premier lancement, un écran d'accueil propose :
   - **Créer les tables standard** (`ERP_Partenaires`, `ERP_Articles`, `ERP_Documents`, `ERP_Lignes`, `ERP_Mouvements`, `ERP_Ecritures`, `ERP_Parametres`) ;
   - **Utiliser mes propres tables** : écran d'association pré-rempli par détection automatique ;
   - **Explorer mes tables** (SE16N).

Ouvert directement dans un navigateur (hors Grist), le widget passe en **mode démo local** (données stockées dans le navigateur).

### Brancher l'ERP sur vos tables (SE11)

- Chaque objet de l'ERP (partenaires, articles, documents, lignes, mouvements, écritures, paramètres) est associé à **une table de votre choix**, chaque champ à **une colonne de votre choix**, à une colonne à créer, ou « Non utilisé ».
- Détection automatique par noms (ex. `Raison_sociale` → Nom, `Mail` → E-mail, `Actif` → Inactif inversé).
- Conversions automatiques : texte ↔ nombre, dates en texte, cases à cocher inversées, **liens par Référence Grist ou par texte** (code / numéro / nom).
- Les colonnes **formule** sont lues mais jamais écrites ; les totaux et montants réglés non associés sont recalculés.
- Modules facultatifs : sans table de mouvements → pas de stocks ; sans table d'écritures → pas de comptabilité ; sans table de paramètres → réglages dans les options du widget.
- La configuration est enregistrée dans les **options du widget** (bouton « Open configuration » de Grist) ; export / import JSON pour la réutiliser dans un autre document.

### Explorateur de tables (SE16N)

Toutes les tables du document : recherche, tri, ajout, modification via formulaire typé (dates, listes de choix, références), suppression multiple, export CSV et copie vers un tableur.

### Aide intégrée

- **Infobulles** sur les boutons, indicateurs, en-têtes de colonnes, statuts et champs (icône ?).
- **F1** : aide contextuelle de la page (procédure, comptes passés, tables Grist concernées).
- **?** : liste des raccourcis clavier.

| Raccourci | Action |
|---|---|
| `Ctrl+K` | Barre de transaction |
| `Alt+N` / `Alt+E` / `Alt+S` / `Alt+V` | Créer / modifier / enregistrer / valider (étape suivante) |
| `Alt+L` / `Alt+P` / `Alt+D` / `Alt+X` | Ajouter un poste / imprimer / dupliquer / exporter |
| `Alt+H` / `Alt+←` / `Alt+M` / `Alt+R` | Accueil / retour / menu / actualiser |
| `/` | Rechercher dans la liste |

### Codes transaction

| Module | Codes |
|---|---|
| Ventes | `VA21`/`VA25` devis · `VA01`/`VA05` commandes · `VF01`/`VF05` factures · `XD01`/`XD03` clients · `FBL5N` postes ouverts |
| Achats | `ME21N`/`ME2N` commandes d'achat · `MIRO`/`MIR5` factures fournisseurs · `XK01`/`XK03` fournisseurs · `FBL1N` |
| Stocks | `MM01`/`MM60` articles · `MMBE` stocks · `MB51` mouvements · `MB1C` saisie · `MI01` inventaire |
| Finance | `FB03` journal · `FB50` écriture d'OD · `F.01` balance · `FAGLL03` grand livre |
| Données | `SE11` tables et colonnes · `SE16N` explorateur · `SPRO` paramétrage · `SMEN` tableau de bord |

### Paramétrage (SPRO)

Structure (en-tête des documents, IBAN, mentions), devise, TVA et délai par défaut, listes d'unités / taux de TVA / modes de règlement, préfixes de numérotation, comptes comptables utilisés par les écritures automatiques.

### Flux de documents

- **Ventes** : devis → commande → livraison (sortie de stock au CMP) → facture (411 / 70x / 44571) → encaissement (512 / 411).
- **Achats** : commande → réception (entrée de stock) → facture (60x / 44566 / 401) → paiement (401 / 512).
- Proposition de réapprovisionnement depuis `MMBE`, impression des devis, confirmations et factures.

## Studio infographies DSFR (`infographies-dsfr.html`)

Générateur d'infographies à la charte de l'État : police Marianne, couleurs DSFR, pictogrammes officiels DSFR, bloc-marque **Préfet / Préfète** (région Bretagne, Côtes-d'Armor, Finistère, Ille-et-Vilaine, Morbihan ou saisie libre) ou « République française ».

### Installation

Widget personnalisé Grist, accès **Accès complet au document**. Hors de Grist, le fichier s'ouvre en **mode démonstration** (données fictives).

### 63 modèles en 7 familles

| Famille | Modèles |
|---|---|
| Chiffres clés | chiffre choc, bandeau 3 chiffres, mosaïque 6 chiffres, évolutions ▲▼, mini-courbes, jauge d'objectif, anneaux, « 1 sur N », avant/après, tableau de bord |
| Comparer & classer | classement, colonnes, groupées, empilées, 100 %, podium, sucettes, haltères, pictogrammes proportionnels, bulles, tableau de classement |
| Répartitions | anneau, camembert, demi-anneau, gaufre, treemap, barre 100 %, hémicycle, pyramide des âges, entonnoir |
| Évolutions & temps | courbe, aire, courbes comparées, cascade, pente, calendrier thermique, saisonnalité, frise |
| Territoires & cartes | Bretagne, France (départements / régions), symboles proportionnels, communes (geo.api.gouv.fr), fiche territoire (rangs), tuiles départementales, carte + chiffres |
| Institutionnel | mosaïque des missions, fonctions, étapes, cycle, organigramme, FAQ, à faire / à éviter, matrice de règles, dépliant 3 volets, message clé |
| Analyses avancées | matrice de chaleur, radar, nuage de points, nuage de mots, Sankey, réalisé / objectif, tableau |

### Données

- Chaque emplacement est relié à **une table**, des **colonnes**, un **calcul** (nombre, somme, moyenne, médiane, min, max, distincts, % vrai…), des **filtres**, une **comparaison** (tendance, part, ratio, écart, évolution, formule A/B) et une **mise en forme** (unité, décimales, k/M/Md).
- Regroupements par date (année, trimestre, mois, semaine…), tri, top N + « Autres », % du total, cumul, base 100, ratio par catégorie (÷ population, pour 1 000…).
- **Formules par ligne** : `$Montant / $Population * 1000`, `si($Note >= 4; 1; 0)`.
- **Saisie manuelle** possible pour chaque emplacement.
- **Identifier les données** : chaque élément de l'affiche affiche sa provenance ; un clic ouvre son réglage. Numérotation ①②③ et notes de pied de page en option.
- Textes dynamiques : `**mise en avant**`, `{k1}`, `{s1:top}`, `{s1:total}`, `{date}`, `{signature}`.

### Formats et exports

A4 portrait / paysage, dépliant A3, carré, story, 16:9, bannière, page web. Export **PNG** haute définition, **PDF**, impression, **texte alternatif** et transcription (onglet Accessibilité, contrôles de contraste), données **CSV**. Les infographies sont enregistrées dans les options du widget (« Mes infographies »).
