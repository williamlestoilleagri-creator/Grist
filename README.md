# Widgets Grist

| Fichier | Description |
|---|---|
| `erp-sap.html` | ERP intégré « façon SAP » (ventes, achats, stocks, comptabilité) |
| `annuaire-adresses.html` | Annuaire d'adresses géocodées (BAN) |
| `grist-assistant-claude.html` | Assistant Claude |
| `prise-rdv-calendrier.html` | Prise de rendez-vous (calendrier) |
| `rdv/index.html` | Formulaire public de prise de rendez-vous |
| `duo.html` | **Duo** — interprète à deux écouteurs (ex. japonais ⇄ allemand) |
| `copier-coordonnees.html` | Fiche de rendez-vous + bouton « Copier les coordonnées » (latitude, longitude) |
| `carte-prelevement.html` | Carte DSFR des prélèvements : regroupement par commune, liste des exploitations, fiche RDV complète, recherche par identifiant, copie GPS |
| `lieux-dits.html` | Lieux-dits autour de la parcelle sélectionnée (d’après latitude / longitude), sur simple bouton |

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

## Duo — interprète à deux écouteurs (`duo.html`)

Deux personnes, deux langues, une paire d'écouteurs sans fil : chacune porte un écouteur.

- **Écouteur gauche** (par défaut 🇯🇵 japonais) : entend en japonais la traduction de ce que dit l'allemand.
- **Écouteur droit** (par défaut 🇩🇪 allemand) : entend en allemand la traduction de ce que dit le japonais.

### Utilisation

1. Ouvrez `duo.html` sur le téléphone (Chrome sur Android, Safari sur iPhone) — via GitHub Pages ou tout hébergement HTTPS (le micro exige HTTPS).
2. Dans **Réglages**, renseignez une **clé API Google Cloud** (APIs *Text-to-Speech* et, si voulu, *Cloud Translation* activées) : c'est elle qui permet d'envoyer la voix dans **un seul écouteur**. Testez avec « Tester gauche / droite ».
3. Chacun appuie sur son gros bouton (« 話す » / « Sprechen »), parle, et la traduction part dans l'oreille de l'autre. Un clavier est aussi disponible.
4. « Face à face » retourne le panneau de gauche pour poser le téléphone entre les deux personnes.

### Moteurs

| Rôle | Options |
|---|---|
| Reconnaissance vocale | Web Speech API du navigateur |
| Traduction | MyMemory (gratuit, sans clé) · Google Cloud Translation · Claude (clé Anthropic, tient compte du contexte) |
| Voix | Google Text-to-Speech (routage gauche/droite) · voix du navigateur (gratuit, deux oreilles) |

Langues proposées : japonais, allemand, français, anglais, espagnol, italien, portugais, chinois, coréen.

### Historique et registre

- Chaque échange est enregistré (heure, locuteur, original, traduction) dans le navigateur.
- **Registre** : liste des conversations, recherche plein texte dans tous les échanges, réécoute, reprise d'une conversation, renommage, suppression.
- Export par conversation en **TXT**, **CSV** (Excel) ou **JSON** ; export / import global en JSON pour sauvegarder ou changer d'appareil.

> Astuce : gardez le micro du téléphone actif. Si le système bascule sur le micro des écouteurs Bluetooth, certains appareils passent en mode « appel » mono et la séparation gauche/droite est perdue.
