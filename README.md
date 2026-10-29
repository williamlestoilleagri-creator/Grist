# Widgets Grist

| Fichier | Description |
|---|---|
| `erp-sap.html` | ERP intégré « façon SAP » (ventes, achats, stocks, comptabilité) |
| `annuaire-adresses.html` | Annuaire d'adresses géocodées (BAN) |
| `grist-assistant-claude.html` | Assistant Claude |
| `prise-rdv-calendrier.html` | Prise de rendez-vous (calendrier) |
| `calendrier-prelevements.html` | **Calendrier des prélèvements** : fiches rendez-vous par exploitation, préleveurs et inspecteurs FranceAgriMer |
| `rdv/index.html` | Formulaire public de prise de rendez-vous |
| `duo.html` | **Duo** — interprète à deux écouteurs (ex. japonais ⇄ allemand) |

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

## Calendrier des prélèvements (`calendrier-prelevements.html`)

Charte DSFR (police Marianne, bleu France, bloc-marque). Gère une **fiche « Rendez-vous prélèvement » par exploitation**, enregistrée dans `RDV_Prelevements` à raison d'**une ligne par parcelle** (clé unique PACAGE-îlot-parcelle).

### Tables

| Table | Rôle |
|---|---|
| `DATA_RELIQUATCLEAN` (source, lecture) | Parcelles à prélever : clé `CLELAB`, n° dossier DN, PACAGE, exploitation, téléphone, e-mail, adresse, réponses de l'agriculteur (zones à éviter, fertilisation, prairie…) |
| `DATA_Parcelles_DEF` (source, lecture, facultatif) | Îlot, parcelle, surface, cultures 2024-2025, bassin, raison de la sélection, latitude / longitude (clé `CLE`) |
| `RDV_Prelevements` | `Cle_parcelle`*, `N_dossier_DN`, `Date_heure_appel_1/2/3`, `Statut` (Rdv pris, Injoignable, Refus, Faux numéro), `Presence_souhaitee_agriculteur`, `Culture_en_place`, `Absence_fertilisation_recente`, `Preleveur` (réf. `DATA_Preleveur`), `Date_RDV`, `Etiquette_prelevement`, `Commentaire`, `Inspecteur` (réf. `DATA_Inspecteur`), `Duree_min` ; formules `PACAGE`, `Code_dpt`, `Nom_exploitation` ; `Cree_le`, `Cree_par`, `Modifie_le` |
| `DATA_Preleveur` | Même structure que le fichier `CAMPAGNE_2026_Suivi_de_campagne_Reliquat-DATA_Preleveur.xlsx` : `Nom`, `Prenom`, `Organisme`, `Telephone`, `Email`, `Zone d'action` (`Zone_d_action`) — le fichier s'importe directement dans la table |
| `DATA_Inspecteur` | Nom, prénom, service, téléphone, e-mail, départements, actif |
| `DATA_Stockage` (fournie) | Lieux de stockage des échantillons : `Adresse`, `Ville`, `CP`, `Responsable`, `Organisme`, `Nombre_d_echantillons_stockes` ; `A_ete_controle`, `Date_de_controle`, `Inspecteur` calculés à partir des contrôles déclarés |
| `DATA_Controle_Stockage` | Un contrôle inopiné par ligne : `Lieu` (réf. `DATA_Stockage`), `Date_controle`, `Inspecteur` (réf. `DATA_Inspecteur`), `Nombre_d_echantillons_constates`, `Resultat` (Conforme, Avec réserves, Non conforme), `Constat` ; `Code_dpt` (formule, d'après le code postal du lieu), `Cree_le`, `Cree_par` |

### Mise en place

Widget personnalisé, accès **Accès complet au document**, lié à `RDV_Prelevements`. L'écran **Mise en place** liste les modifications avant de les appliquer :
- renomme `Preleveurs` → `DATA_Preleveur` et `Inspecteurs_FAM` → `DATA_Inspecteur` (données et références conservées), ou les crée ;
- aligne `DATA_Preleveur` sur le fichier de référence : `Departements` renommée en « Zone d'action », colonnes `Nom_complet` et `Actif` retirées ;
- crée `RDV_Prelevements`, ou ajoute les colonnes manquantes à la table existante (aucune colonne supprimée ni renommée), remplace les choix de `Statut` et calcule `Code_dpt` à partir de la clé parcelle (règles d'accès par département).

### Fonctions

- **Calendrier** mois / semaine / jour / liste ; couleur par préleveur ; plusieurs rendez-vous par jour. En vue mois, tous les rendez-vous du jour sont affichés directement (une ligne par exploitation, la case défile s'il y en a beaucoup).
- **Clic sur une journée** : rendez-vous regroupés **par exploitation** (toutes ses parcelles ensemble, avec l'heure de chaque parcelle si elles diffèrent).
- `Cle_parcelle` peut être un texte (PACAGE-îlot-parcelle) ou une **référence vers `DATA_Parcelles_DEF`** : le widget retrouve alors la clé `CLE` de la ligne référencée et les coordonnées de l'exploitation (Nom, Adresse, Commune, téléphone), et enregistre l'identifiant de la ligne.
- **Barre de gauche** : recherche d'une exploitation (nom, PACAGE, n° dossier, commune, clé) qui ouvre son rendez-vous ; liste dépliante des **préleveurs** (clic = uniquement ses rendez-vous, et le calendrier se place sur son prochain rendez-vous) ; **planning des inspecteurs** FranceAgriMer ; **feuille de route** imprimable du préleveur ou de l'inspecteur sélectionné sur la période affichée.
- **Fiche Rendez-vous prélèvement** : contact, 3 appels (bouton « maintenant »), statut, présence souhaitée, préleveur, date/heure du RDV, durée, inspecteur ; par parcelle : culture en place (préremplie avec la culture 2026), absence de fertilisation récente, étiquette, commentaire, et **infos préleveur** (surface, cultures, zones à éviter, fertilisation, prairie, liens Géoportail / itinéraire). Alerte de chevauchement d'horaires.
- **Espace inspecteur** : l'inspecteur choisit son nom (mémorisé sur son poste), voit les rendez-vous « Rdv pris » à venir (filtre période, ses départements, recherche) et clique sur **M'associer** ou **Me retirer** ; un rendez-vous déjà pris par un autre inspecteur ne peut pas être repris ; alerte si l'inspecteur a déjà un contrôle au même moment ; fiche de lecture avec lieu, contacts, préleveur et parcelles. Option « Page réservée aux inspecteurs » (Paramètres → options avancées) : n'affiche que l'espace inspecteur et le calendrier, sans modification des fiches.
- **Tableau de bord** : nombre de rendez-vous, rendez-vous inspectés (réalisés / prévus), taux d'inspection, préleveurs jamais inspectés ; par préleveur : inspections réalisées et prévues, taux, inspecteurs (avec le nombre de fois), dernière inspection, détail cliquable ; croisement préleveur × inspecteur ; filtres période et département ; export CSV.
- **Contrôles inopinés des lieux de stockage** : bouton « Déclarer un contrôle inopiné » (barre de gauche du calendrier et espace inspecteur) : lieu, date/heure, inspecteur, nombre d'échantillons constatés, résultat, constat ; les contrôles apparaissent dans le calendrier (hachures violettes), dans le planning de l'inspecteur et sa feuille de route ; l'espace inspecteur liste les lieux avec leur dernier contrôle (« Jamais contrôlé ») ; le tableau de bord compte les contrôles, les lieux contrôlés et les non-conformités.
- **Exploitations** : statut d'appel, nombre d'appels, rendez-vous ; filtres statut (dont « À appeler ») et département.
- **Préleveurs** / **Inspecteurs FranceAgriMer** : ajout, modification, désactivation, accès au planning.

Ouvert hors de Grist, le widget s'affiche en mode démonstration avec des données fictives.

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
