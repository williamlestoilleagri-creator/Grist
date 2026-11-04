# Agréments produits phytopharmaceutiques (DRAAF Bretagne) — analyse du document Grist

## 1. Ce que fait le document

| Table | Rôle | Alimentation |
|---|---|---|
| `DATA_RESYTAL` | Copie de l'export RESYTAL « APP_002 … Agrément produits phytosanitaires » : **une ligne par approbation × périmètre × unité d'activité** | Import Excel |
| `DATA_SRAL` | Ancien tableau de suivi tenu par les agents (adresses, mails, dates de contrat et de certificat, courriers…) | Saisie manuelle (historique) |
| `DATA_Entreprise` (SIREN) / `DATA_Etablissement` (SIRET) | Fiches de référence ; adresse et contact repris de `DATA_SRAL` | Saisie et formules par défaut |
| `DATA_Agrement` | Dossier de suivi DRAAF d'un agrément : suivi par, contact DRAAF, contrat, certificat, durée, date d'envoi, date de fin calculée | Saisie agents + formules RESYTAL |
| `DATA_Evenements` | Journal des événements par entreprise (contrôle, courrier, rapport) | Saisie agents |
| `Modele_publipostage`, `Signature_Num` | Modèles de courrier et signatures du widget Publipostage | Widget |
| `Table_info`, `Table_modele` | Ancien publipostage en HTML (`format_map`) | Obsolète |
| `Evolution` | Demandes d'évolution du document | Saisie |
| `Creer_une_entreprise`, `Recherche` | Essais abandonnés | — |

Chiffres de l'export du 25/08/2026 : **2 759 lignes**, 1 299 n° d'approbation, 1 312 SIREN, 1 998 SIRET, 4 départements.
Statuts (en lignes) : 1 515 Agréé, 965 Archivé, 263 Retiré, 14 Agréé provisoire, 1 Refusé.
Clé unique vérifiée : **n° d'approbation + libellé du périmètre + identifiant UA** (aucun doublon). 14 entreprises ont plusieurs approbations.

## 2. Erreurs à corriger

Les formules corrigées sont dans [`agrements-phyto-formules.py`](agrements-phyto-formules.py).

| Gravité | Table.colonne | Problème |
|---|---|---|
| 🔴 | `DATA_SRAL.SIREN2` (défaut) | `str(rec.SIRET)[0:9]` : `SIRET` est une **Référence**, `str()` donne « DATA_Etablissement[12] », donc « DATA_Etab ». Aucun lien SRAL → entreprise : les adresses et contacts par défaut de `DATA_Entreprise` ne peuvent pas marcher. |
| 🔴 | `DATA_Etablissement.SIREN` (défaut) | Renvoie un texte dans une colonne Référence : référence invalide (cellule rouge). |
| 🔴 | `DATA_Agrement.Date_d_approbation_RESYTAL`, `Latitude`, `Longitude` | `lookupOne(SIREN)` prend **n'importe quelle** ligne de l'entreprise : avec deux approbations (ex. 445330236 : 2900032 « Agréé » en 2021, BR00166 « Archivé » en 2012), on peut obtenir la date de l'agrément archivé, et la date de fin est fausse. Il faut chercher par n° d'agrément. |
| 🔴 | `DATA_Agrement.Nombre_d_agrement_par_SIREN` | Compte des **lignes** RESYTAL (approbation × périmètre × UA) au lieu des approbations : un agrément sur 2 périmètres et 3 UA compte 6 fois. « Archivé » et « Refusé » ne sont pas comptés. |
| 🔴 | `DATA_Evenements.Piece_jointes` | Colonne **formule** (`return None`) : on ne peut rien y joindre. À convertir en colonne de données. |
| 🟠 | `DATA_Entreprise.Contact` (défaut) | La condition `…Mail[0]` plante (IndexError) quand il n'y a pas de ligne SRAL. |
| 🟠 | `DATA_Entreprise.Code_Postal` (défaut) | `DATA_SRAL.Code_Postal` est numérique : on obtient « 29800.0 ». |
| 🟠 | `DATA_Entreprise.DATA_RESYTAL_Entreprise_SIREN_NUMAGRIN_ENT_` | `[0]` plante sans ligne RESYTAL, et renvoie son propre SIREN. |
| 🟠 | `DATA_Agrement.Date_de_fin_d_approbation` | Erreur si la date RESYTAL est vide ; `DATE(… DAY)` donne le 1er mars au lieu du 28 février pour un agrément du 29 février. Utiliser `EDATE`. |
| 🟠 | `DATA_Etablissement.Statut_entreprise` | Plante si `SIRET` est vide ; recherche inutile (`$SIREN.Statut` suffit). |
| 🟠 | `Recherche.Libelle_de_l_entreprise` | Utilise `rec.Numero_de_SIREN`, qui n'existe pas. |
| 🟠 | `Table_info.Formule` | `format_map` plante dès qu'une accolade apparaît (CSS). Remplacé par le widget Publipostage. |
| 🟡 | `Evolution.Statut`, `Lien_de_la_table` | Formules qui renvoient `''` / `None` : impossible de saisir. |
| 🟡 | `Evolution.Derniere_mise_a_jour(_par)` | Calculées à la création seulement : il faut aussi « Appliquer lors des modifications ». |
| 🟡 | Types | Latitude / Longitude en Texte (le widget Carte veut du Numérique) ; codes INSEE et `DATA_SRAL.Code_Postal` en Numérique (doivent être des Textes). |
| 🟡 | Colonnes mortes | `DATA_Agrement` : `Date_fin`, `EXEMPLE`, `Libelle_de_l_entreprise` (= `SIREN_Libelle2`) ; `Table_modele` : `Type_de_courier`, `A`, `C` ; table `Creer_une_entreprise`. |

Qualité des données RESYTAL relevée dans l'export :
- 75 % des lignes sont géolocalisées au **centre de la commune** (origine `CO`) : sur la carte, plusieurs entreprises se superposent.
- 6 établissements ont des coordonnées hors de Bretagne (ex. DISTRIVERT, Plomodiern : 44,33 / 1,40, soit près de Montauban) : à signaler dans RESYTAL.

## 3. Organisation proposée

```
 RESYTAL (export Excel « Avec adresses »)
        │  widget Import RESYTAL : ajoute / met à jour / (supprime), une ligne par approbation × périmètre × UA
        ▼
 DATA_RESYTAL ──────► DATA_Entreprise (SIREN)  ◄── créées et complétées par l'import
   (miroir, jamais       DATA_Etablissement (SIRET)
    saisi à la main)        │
        │                   ▼
        └──────────► DATA_Agrement (1 ligne par n° d'agrément) ◄── saisie agents : suivi, contrat, certificat, durée
                            │                                        + formules RESYTAL (statut, date, périmètres, échéance)
                            ├── DATA_Evenements (contrôles, courriers, pièces jointes)
                            └── Publipostage (courriers signés DRAAF, logo Préfet / Préfecture)
 DATA_SRAL : historique gelé, consulté par la référence Ligne_SRAL.
```

Règles :
1. **Ce qui vient de RESYTAL ne se saisit pas dans Grist** (c'est écrasé au prochain import) ; les corrections se font dans RESYTAL.
2. **Ce qui est propre à la DRAAF se saisit dans `DATA_Agrement` et `DATA_Evenements`**, jamais dans `DATA_RESYTAL`.
3. `DATA_Agrement` se raccroche à RESYTAL par le **n° d'agrément**, pas par le SIREN.

## 4. Méthode de mise à jour (mensuelle ou avant une campagne de courriers)

1. Dans RESYTAL, lancer le rapport *APP_002 – Agrément produits phytopharmaceutiques – avec adresses* (Bretagne) et l'enregistrer en .xlsx, sans le modifier.
2. Dans Grist, page **Import RESYTAL** : déposer le fichier. La double ligne d'en-tête et la date d'extraction sont reconnues ; la correspondance des colonnes est retrouvée (elle est enregistrée dans le widget).
3. **Analyser les différences** : ajouts, modifications colonne par colonne (avant → après), lignes absentes, fiches entreprises et établissements à créer. Télécharger le rapport Excel si besoin.
4. **Importer**. Chaque import est tracé dans `Journal_import` (date, fichier, date d'extraction RESYTAL, compteurs, colonnes modifiées).
5. **Nouveaux dossiers** : relancer le widget avec la table `DATA_Agrement` comme destination, en n'associant que *N° approbation* → `Numero_d_agrement` et *SIREN* → `SIREN`, clé `Numero_d_agrement`, lignes absentes conservées. Les agréments manquants sont créés ; les colonnes saisies par les agents ne sont pas touchées.
6. Un export relancé deux fois de suite ne produit **aucune** modification : c'est le contrôle que tout s'est bien passé.

Première utilisation : cliquer sur « Créer les colonnes non associées » pour ajouter à `DATA_RESYTAL` les 9 colonnes d'adresse de l'export « Avec adresses » (adresses postales de l'entreprise et de l'établissement, codes postaux, bureaux distributeurs, code INSEE). Avec l'option « Créer les fiches manquantes et compléter les champs vides », les adresses « Non renseigné » de `DATA_Entreprise` sont remplacées par celles de RESYTAL.

Saisies manuelles des agents :
- **Formulaire Grist** (vue « Formulaire ») sur `DATA_Evenements` : contrôle, appel, courrier, avec pièces jointes — remplace `Creer_une_entreprise`.
- **Fiche** liée à la liste `DATA_Agrement` pour compléter le suivi (suivi par, contrat, certificat, durée, type de logo).
- Un tableur tenu hors de Grist (comme l'ancien tableau SRAL) peut aussi passer par le widget d'import : il fonctionne avec n'importe quelle table et n'importe quelle clé.

## 5. Widgets à prévoir

| Page | Widgets | Remarques |
|---|---|---|
| Import RESYTAL | Widget personnalisé `import-resytal.html` + table `Journal_import` | Accès complet au document |
| Agréments | Tableau `DATA_Agrement` → Fiche → Tableau `DATA_Evenements` (lié par SIREN) → Tableau `DATA_RESYTAL` (périmètres et UA de l'agrément) | Filtres enregistrés par département ou agent (`Suivi_par`) |
| Échéancier | Tableau `DATA_Agrement` filtré sur `Echeance` ≠ « À jour » + widget **Calendrier** sur `Date_de_fin_d_approbation` | Préparer les relances |
| Carte | Widget **Carte** sur `DATA_Etablissement` (Latitude / Longitude numériques, nom, commune) | 75 % des points au centre de la commune |
| Tableau de bord | Tables récapitulatives + **Graphiques** : agréments par statut, par département, par périmètre ; évolution des retraits | Compter les n° d'approbation, pas les lignes |
| Saisie | **Formulaire** Grist sur `DATA_Evenements` (et demande d'agrément) | Partageable aux agents sans accès complet |
| Courriers | Widget personnalisé `publipostage.html` lié à `DATA_Agrement` | Voir ci-dessous |
| Évolutions | Tableau `Evolution` (ou widget Kanban) | |

## 6. Publipostage : courriers signés DRAAF, logo Préfet / Préfecture

Ajouts au widget (le reste est inchangé) :
- **Onglet 2 > « Logo du courrier »** : les logos sont rangés dans une table `Logo_publipostage` (`Intitule`, `Logo`), créée au premier logo enregistré depuis le widget. Déposer par exemple « Préfet » (bloc-marque *Préfet de la région Bretagne*) et « Préfecture ».
- **Logo par dossier** : avec une colonne `Type_logo` (Choix : Préfet / Préfecture) dans `DATA_Agrement`, le widget prend pour chaque courrier le logo dont l'intitulé correspond à la valeur (« Préfecture du Finistère » trouve « Préfecture »). Sans colonne, c'est le logo par défaut.
- **Emplacement** : champ `{{LOGO}}` (bouton « Logo » de la barre d'outils, ou dans l'**en-tête d'un modèle Word**). Sans champ, le logo est placé en haut du courrier. Cela marche en Word, en PDF, avec ou sans modèle. Avec un modèle Word, l'en-tête n'existe qu'une fois par fichier : pour un logo différent par dossier, choisir « Un fichier par dossier ».
- **Signature** : formules de délégation DRAAF proposées dans le champ « Fonction » (« Pour le préfet de la région Bretagne et par délégation, le directeur régional de l'alimentation, de l'agriculture et de la forêt », etc.).
