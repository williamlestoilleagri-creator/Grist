# Trame Grist – Compte-rendu de contrôle de reconnaissance des OP

Source : `CRC_RECO_OP - Base données GRIST.xlsx` (29 onglets).

## 1. Principe : passer d'un classeur « formulaire » à une base

Dans l'Excel, chaque contrôle est une **copie complète du classeur**. Chaque question est une ligne mise en forme. Les onglets « à dupliquer » (9.1, 10.1, 11.1, 12.1, Producteur 1/2/3) sont recopiés à la main.

Dans Grist, on sépare **la grille**, qui ne change pas, et **les réponses**, qui changent à chaque contrôle :

| Excel | Grist |
|---|---|
| Les questions des onglets 1 à 13 | Table **Referentiel** (336 lignes, saisie une seule fois) |
| Les colonnes OUI / NON / Avec quoi / Description / Observation | Table **Reponses** : une ligne par contrôle × point |
| Page de garde + fiche signalétique | Tables **OP**, **Controles**, **Intervenants**, **Filiales** |
| Onglets 9.1 / 10.1 / 11.1 / 12.1 « à dupliquer » | Table **Conventions** (autant de lignes que de prestataires) |
| Onglets 13. Producteur 1, 2, 3… | Table **Producteurs_controles** (nombre illimité) |
| Tableaux annexes (4.1, sondages, rendements, stades) | Une table chacun |
| Croix « fl / veau / horti / lait / lapin » | Colonne **Secteurs_concernes** du référentiel, qui sert de filtre |

Avantages : un nouveau contrôle se crée en un clic, on suit l'avancement, on consolide les résultats de tous les contrôles, et une modification de la grille se fait à un seul endroit.

## 2. Schéma des tables

```
OP ──< Controles ──< Reponses >── Referentiel
 │        ├──< Intervenants        ▲
 └─< Filiales  ├──< Conventions ───┘ (Reponses.Convention)
          ├──< Producteurs_controles ─┘ (Reponses.Producteur)
          ├──< Capital_social   (4.1)
          ├──< Sondage_bulletins (CTRL Bulletin adhésion)
          ├──< Sondage_mandats   (CTRL MANDATS)
          ├──< Rendements        (7 – tableau AGRESTE)
          ├──< Stades_mise_en_marche (12)
          └──< Pieces_jointes    (« Joindre systématiquement… »)
```

### OP — Fiche signalétique (partie stable)
N° OP, Raison sociale, **Forme** (SCA / UCA / Pas SCA), **Secteur** (F&L, Veau, Horticulture, Lait, Lapin), marques, statut juridique, SIRET, adresses, responsable légal, contact, téléphone, courriel, AOP, produits, champ de reconnaissance, date de l'arrêté, catégorie, production ciblée, zone, date du dernier contrôle FAM, sanction.
Formule : `Nb_controles = len(Controles.lookupRecords(OP=$id))`

### Filiales
OP (réf.), raison sociale, % participation, objet.

### Controles — Page de garde et données d'un contrôle
- Saisie : OP (réf.), N° de demande, service territorial, dates du / au, **Secteur**, **Multi_secteurs** (active l'onglet 4.2), statut (En préparation / En cours / À valider / Validé), PO en cours, montant FO, nb d'adhérents, montant VPC, situation de l'entreprise, schéma fonctionnel (pièce jointe, onglet 2.1).
- En-tête onglets 8 et 12 : transfert de propriété (case à cocher), seuil VPC, produits VPC, CA reconnu, nb de clients.
- Formules :
  - `Intitule` : « Raison sociale – date »
  - `Nb_points`, `Nb_a_renseigner`, `Nb_obs_manquantes`, `Nb_anomalies`, `Avancement` (%)
  - `VPC_ventes` / `VPC_achats` : somme des montants de l'onglet 8 avec leur signe (+ ajout / − déduction), remplace le « Total VPC contrôlée »
  - `Seuil_VPC_respecte` : VPC contrôlée ≥ seuil
  - `Pct_parts_producteurs` / `Pct_voix_producteurs` : issus de l'onglet 4.1, à comparer au seuil de 75 % (F&L et horticulture)
  - `Bouton_grille` : génère la grille (voir § 4)

### Intervenants
Contrôle (réf.), rôle (Personne rencontrée / Contrôleur), fonction ou service, nom et prénom.

### Referentiel — la grille (fichier `referentiel_points_controle.csv`)

| Colonne | Contenu |
|---|---|
| Code | ex. `7-L16` (onglet + ligne Excel d'origine, stable) |
| Onglet, Titre_onglet, Rang_onglet | rattachement et tri (1 → 13) |
| Portee | **Contrôle** (onglets 1 à 12), **Convention** (9.x à 12.x), **Producteur** (13) |
| Domaine_convention | Appui technique / Tri-stockage-conditionnement / Agréage / Mise en marché |
| Num, Section, Niveau | numéro Excel, section (I-, II-…), Question / Sous-question / Consigne |
| Libelle | texte intégral du critère |
| Type_reponse | Oui/Non, Conforme/Non conforme, Texte, Nombre, Pourcentage, Valeur n-1 / n, Montant + C/NC, Montant (calculé), Aucune |
| Secteurs_concernes | liste de choix ; vide = tous les secteurs |
| Bloc_VPC, Signe_VPC | pour le calcul automatique de la VPC (onglet 8) |
| Actif | décocher pour retirer un point sans le supprimer |
| Filieres_verifiees | case à cocher une fois la colonne Secteurs_concernes qualifiée |
| Feuille, Ligne | position du critère dans l'Excel d'origine (utilisée par le futur widget d'export) |

Répartition : 50 titres de section, 226 questions, 89 sous-questions, 21 consignes (« Joindre… », « Point de vigilance… »). Les règles par feuille entière (4.1, 4.2, 5/5.1, 8, feuilles à dupliquer) sont dans `onglets.csv`.

### Reponses — cœur de la saisie
- Liens : Contrôle, Point (réf. Referentiel), Convention *ou* Producteur (si le point en dépend).
- Affichés par formule : Onglet, Ordre_global, N°, Section, Critère, Type.
- Saisie (reprend les colonnes de l'Excel) :
  - **Avec quoi le contrôle a-t-il été fait ?** (liste multiple : entretien, statuts, RI, PV d'AG, comptabilité, INFOGREFFE…)
  - **Description du contrôle effectué**
  - **Réponse** : Oui / Non / Non conclusif / Sans objet / Conforme / Non conforme
  - Valeur au 01/01/n-1 et au 01/01/n (onglets 5 et 5.1), Montant (onglet 8), Réponse rédigée
  - **Observation du contrôleur**
- `Statut` (formule) : `À renseigner`, `Observation obligatoire` (réponse Non / NC sans observation, conformément à la mention de l'Excel), `OK`, `—` (consigne).

### Tables annexes
| Table | Onglet Excel | Colonnes |
|---|---|---|
| Conventions | 9.1, 10.1, 11.1, 12.1 | Contrôle, Domaine, Prestataire, Fonction du signataire, Document, bouton check-list, nb anomalies |
| Producteurs_controles | 13. Producteur n | Contrôle, Nom, SIRET, produits du bulletin, bouton check-list, montant rapproché |
| Capital_social | 4.1 | Adhérent, producteur ?, activité SIRENE, membres de la personne morale, % parts, % voix |
| Sondage_bulletins | CTRL Bulletin adhésion | SIRET, nom-prénom, société, critère de choix, date début d'adhésion, C/NC |
| Sondage_mandats | CTRL MANDATS | SIRET, nom-prénom, société, critère de choix, présence d'un mandat, C/NC |
| Rendements | 7 (question 15) | Produit, année, département, rendement AGRESTE, rendement OP, **Variation** `=(OP−AGRESTE)/AGRESTE`, justification |
| Stades_mise_en_marche | 12 | Stade (Vrac, Brut de cueille, Conditionné, Destiné à la transformation, Transformé, Autres), produits, % CA |
| Pieces_jointes | toutes les mentions « Joindre… » | Onglet, type de pièce, fichier, commentaire |

## 3. Pages et vues à monter

1. **Contrôles** : tableau des contrôles (intitulé, statut, avancement, anomalies), avec à côté une **fiche** du contrôle sélectionné, le widget **Bouton d'action** (colonne `Bouton_grille`) et la liste des intervenants.
2. **Fiche OP** : liste des OP, fiche détaillée, filiales et historique des contrôles.
3. **Grille de contrôle** : sélecteur de contrôle, puis tableau `Reponses` lié, **trié par Ordre_global** et filtré par onglet. Ajouter une fiche (Carte) de la ligne sélectionnée pour lire le critère en entier.
   Astuce : créer une page par grand bloc (1 à 4, 5 à 8, 9 à 12) avec un filtre sur `Onglet`.
4. **Conventions** : conventions du contrôle, bouton check-list, puis les réponses liées à la convention.
5. **Contrôles en exploitation** : producteurs, bouton check-list, puis les réponses liées.
6. **Annexes** : capital social, sondages des bulletins et des mandats, rendements, stades de mise en marché, pièces jointes, chacun lié au contrôle sélectionné.
7. **Synthèse** : tableau récapitulatif de `Reponses` groupé par *Controle × Onglet* (nb Oui / Non / NC, observations manquantes), et un graphique de l'avancement.
8. **Référentiel** (administration) : la grille, modifiable uniquement par les administrateurs.

## 4. Génération automatique de la grille (bouton)

Grist ne crée pas de lignes tout seul. On utilise donc le widget officiel **« Action Button »** (Ajouter une vue → Widget personnalisé → *Action Button*, accès complet au document, colonne = `Bouton_grille`).

La formule `Bouton_grille` de `Controles` sélectionne les points :
- de portée « Contrôle », actifs, hors consignes et titres de section ;
- applicables au secteur du contrôle ;
- 4.2 seulement si `Multi_secteurs` est coché ; 5.1 à la place de 5 si l'OP est une **UCA** ;
- qui ne sont pas déjà présents (le bouton peut être relancé sans créer de doublons).

Elle renvoie une action `BulkAddRecord` sur `Reponses`. Les boutons de `Conventions` et `Producteurs_controles` fonctionnent de la même façon, avec la check-list de leur domaine.

## 5. Règles d'accès conseillées
- **Referentiel** : lecture seule, sauf pour les administrateurs.
- **Controles / Reponses** : un contrôleur ne modifie que les contrôles où il figure dans `Intervenants` (règle sur `user.Email`, avec une colonne Email à ajouter dans Intervenants).
- Statut « Validé » : verrouiller la modification des réponses (`rec.Controle.Statut == "Validé"` → refuser la mise à jour).

## 6. Mise en œuvre pas à pas

1. Créer un document Grist vide.
2. **Option automatique** : lancer `outils/creer_document_grist.py` (crée les 14 tables, les formules et importe les 336 points) :
   ```bash
   GRIST_API_KEY=<votre clé> python3 outils/creer_document_grist.py --server https://<votre-instance-grist> --doc <ID du document>
   ```
   **Option manuelle** : créer les tables du § 2, puis importer `referentiel_points_controle.csv` dans `Referentiel` (Ajouter → Importer depuis un fichier).
3. Pour chaque colonne Référence, choisir la colonne affichée : `OP` → Raison_sociale, `Controle` → Intitule, `Point` → Code, `Convention` → Prestataire, `Producteur` → Nom_producteur.
4. Monter les pages du § 3 et ajouter les widgets Action Button.
5. Tester sur un contrôle fictif : créer l'OP, créer le contrôle, cliquer « Générer la grille », renseigner quelques points et vérifier le statut et l'avancement.
6. Relire le référentiel : le classement automatique (type de réponse, secteurs) est à vérifier à la marge, notamment les points marqués « à revoir » dans l'Excel (voir § 7).
7. Mettre en place les règles d'accès.

## 7. Points ouverts relevés dans l'Excel
- Mentions « A REVOIR » / « à revoir » : onglet 3 n° 15 (lait), 5.1 n° 4, 11 n° 8 et sa sous-question, 8 n° 6 et 10 (« Juste F&L ? »), 8 n° 11 (« 609 ou 709 ? »).
- La numérotation de l'onglet 2 saute le n° 4.
- La page de garde contient des choix de mise en page (SCA / pas SCA, fl / veau…) : ils sont repris par les colonnes Forme et Secteur.
- La sortie « compte-rendu » imprimable n'est pas native dans Grist. Il faudra un widget personnalisé d'impression (à développer dans ce dépôt, comme les autres widgets) ou un export.

## 8. Mettre à jour le référentiel si l'Excel évolue
```bash
python3 -I outils/extraire_referentiel.py "<fichier.xlsx>" referentiel_points_controle.csv
```
(nécessite `openpyxl`)
