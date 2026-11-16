# Widgets de pilotage de projets (Grist · charte de l'État)

Huit widgets personnalisés pour suivre les projets du pôle dans Grist, à la charte de l'État (DSFR, police Marianne, bloc-marque).

| Fichier | Widget |
|---|---|
| `revue-hebdo.html` | Revue hebdomadaire : réalisé, retards, à venir, jalons, temps déclarés, notes ; impression et copie pour un mail |
| `fiche-projet.html` | Fiche projet sur une page et saisie d'un nouveau projet (avec jalons et rôles initiaux) |
| `capacite-charge.html` | Capacité et charge : carte de chaleur agent × semaine, réalisé passé, réaffectation des tâches |
| `gantt.html` | Gantt projets / tâches / jalons, replanification par glisser-déposer |
| `saisie-express.html` | Saisie d'une tâche en une ligne de texte (`@responsable #projet vendredi !2 ~1 *thème`) |
| `sous-taches.html` | Sous-tâches à cocher ; crée sa table si elle n'existe pas ; met à jour l'avancement |
| `raci.html` | Matrice RACI éditable avec contrôles |
| `echeancier-contrats.html` | Échéancier des marchés et contrats, alertes de renouvellement, export CSV |

Fichiers communs : `socle.js` (détection de la structure, lecture/écriture, configuration), `socle.css` (charte DSFR), `demo-data.js` (données fictives du mode démonstration).

## Installation dans Grist

1. Publier le dossier `pilotage/` sur une adresse web (par exemple GitHub Pages : `https://<compte>.github.io/Grist/pilotage/`).
2. Dans Grist : **Ajouter → Ajouter un widget à la page → Personnalisé**, choisir **une table** comme source de données (par exemple `DATA_Taches`), puis **Saisir une URL personnalisée** : l'adresse du widget, par exemple `…/pilotage/gantt.html`.
3. Dans le panneau de droite du widget : **Accès → Accès complet au document**.
4. Au premier affichage, le widget détecte vos tables et colonnes. Le bouton ⚙ (ou « Ouvrir la configuration » de Grist) permet de vérifier ou corriger l'association ; elle est enregistrée dans les options du widget.

Pour que **Fiche projet** suive la ligne sélectionnée d'une table Projets (ou **Sous-tâches** celle d'une table Tâches) : choisir cette table comme données du widget et régler **Sélectionner par** sur le widget de la table.

## Interopérabilité

Les widgets ne dépendent pas de noms de tables figés. Chacun s'appuie sur des **rôles** (table des projets, colonne échéance, colonne responsable…) reconnus à partir des noms usuels (`Echeance`, `dateEcheance`, `Deadline`, `Pilote_action`, `Responsable`…) et des références entre tables. Les références peuvent être des colonnes Référence, Liste de références ou du simple texte. Les colonnes calculées sont lues mais jamais modifiées. Les indicateurs absents du document (urgence, avancement d'un projet, santé) sont recalculés par le widget avec les mêmes règles que les formules du document.

## Mode démonstration

Ouvert hors de Grist (directement dans un navigateur), chaque widget fonctionne avec des données fictives enregistrées dans le navigateur ; le lien « Réinitialiser les données » les remet à zéro.
