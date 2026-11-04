# Q_TAR_MANUELLE – types de colonnes alignés sur Q_QUADHYDRO

- `Q_TAR_MANUELLE.xlsx` : feuille `Q_TAR_MANUELLE` (115 en-têtes, vides) + feuille `Types_Grist` (colonne → type).
- `generer_excel.py` : régénère l'Excel.
- `appliquer_types_grist.py` : applique les types **et les listes de choix** de Q_QUADHYDRO via l'API Grist.

Un fichier Excel ne peut pas transporter les types Grist Choice / Référence :
Grist les devine à l'import (Date, Numérique, Texte…). Utiliser le script API, ou
importer l'Excel *dans la table existante* une fois les types posés.
