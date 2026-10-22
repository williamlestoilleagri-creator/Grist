# Widgets Grist

| Fichier | Description |
|---|---|
| `erp-sap.html` | ERP intégré « façon SAP » (ventes, achats, stocks, comptabilité) |
| `annuaire-adresses.html` | Annuaire d'adresses géocodées (BAN) |
| `grist-assistant-claude.html` | Assistant Claude |
| `import-infbud.html` | Import des extractions Chorus (INF-BUD) vers la table `DATA_INFBUD` |

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

## Import des extractions Chorus (`import-infbud.html`)

Charte DSFR, police Marianne. Intègre une ou plusieurs restitutions Chorus (INF-BUD-41, INF-BUD-53…) dans la table Grist **`DATA_INFBUD`**, au format données (une ligne = un enregistrement).

### Installation

1. Ajoutez une vue **Widget personnalisé**, renseignez l'URL du fichier publié (ou collez son contenu dans le Custom Widget Builder).
2. Réglez **Accès** sur **Accès complet au document**.
3. Déposez un ou plusieurs fichiers (`.xls`, `.xlsx`, `.csv`, `.htm`…), contrôlez l'aperçu, puis cliquez sur **Importer**.

### Mise en données automatique

- Retrait du titre du rapport et des lignes de filtres, des **lignes et colonnes vides**, des en-têtes répétés et des commentaires.
- En-têtes sur plusieurs lignes fusionnés en un seul nom : `Consommation AE` + `EUR` → **Consommation AE (EUR)** ; la paire code / libellé Chorus devient `Centre financier` et `Centre financier (libellé)`.
- Lecture des exports Chorus « page web » enregistrés en `.xls` (MHTML / HTML), en plus des vrais fichiers Excel.
- Montants au format Chorus convertis en nombres (`8 452 103`, `1 234,56`, `500-`) ; codes conservés en texte (zéros initiaux préservés) ; dates `jj.mm.aaaa` en dates Grist.
- Options : exclure les lignes de totaux (« Résultat », « Total »…), recopier les libellés d'axe masqués par Chorus, colonnes de traçabilité (fichier source, onglet, rapport, date d'import).
- La première ligne de données est détectée automatiquement et peut être corrigée fichier par fichier.

### Écriture dans Grist

- Chaque fichier est aiguillé selon le numéro du rapport lu dans son titre :

  | Rapport | Table | Clé unique par défaut |
  |---|---|---|
  | INF-BUD-41 | `DATA_INFBUD41` | Référentiel de programmation (une ligne par référentiel) |
  | INF-BUD-53 | `INFBUD53` | Toutes les colonnes d'axe (une ligne par année / fournisseur / EJ / référentiel) |
  | Autre INF-BUD-xx | `DATA_INFBUDxx` | Référentiel de programmation |

  `INFBUD53` a une structure fixe, dans cet ordre : **Année**, **N° fournisseur**, **Nom fournisseur**, **N° EJ**, **Référentiel de programmation**, **Libellé référentiel**, **Montant engagé (EUR)**, **Montant payé (EUR)**, puis la traçabilité. Les lignes « Résultat » (sous-totaux) sont exclues et « # » (non affecté) devient vide. Les autres colonnes de l'export sont ignorées.
  **Regroupement des lignes** (au choix, par table, mémorisé dans les options du widget) : détail (une ligne par année × fournisseur × EJ × référentiel), une ligne par **N° EJ**, par fournisseur ou par référentiel (montants additionnés), ou aucun regroupement. Les dépenses sans EJ (« # ») ne sont pas perdues : elles sont regroupées sur les autres axes.
  Le nom de table et la clé sont modifiables dans « Tables de destination ».
- **À l'ouverture du widget**, `DATA_INFBUD41` et `INFBUD53` sont créées si elles n'existent pas, avec leur structure standard et les colonnes de traçabilité.
- **À l'import**, chaque table est mise à jour : une ligne dont la clé existe déjà est mise à jour, les autres sont ajoutées ; les colonnes manquantes sont ajoutées (correspondance par libellé), les colonnes formule ne sont jamais écrites ; les lignes en double ou sans clé déjà présentes sont supprimées. Les doublons d'un même fichier sont fusionnés (montants additionnés).
- Sans clé unique, les lignes issues des mêmes fichiers sont remplacées. Option : vider les tables concernées puis importer.
- Hors Grist, le widget fonctionne en aperçu et permet de télécharger le résultat en CSV.
