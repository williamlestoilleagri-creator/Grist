# Widgets Grist DSFR — Aide canicule 2026 (démarche 155804)

Cinq widgets personnalisés pour le document Grist de l'aide canicule. Chaque fichier HTML est autonome : DSFR 1.12 et d3 viennent de jsDelivr, l'API Grist de `docs.getgrist.com`.

| Widget | Fichier | Table à lier | Accès à donner | Ce qu'il fait |
|---|---|---|---|---|
| 🚇 Plan de métro de l'instruction | `1-plan-de-metro.html` | `Demarche_155804_demandeurs` | Lecture de la table | Une ligne de métro par DDTM et une station par étape de `Etat_dossier`, avec la branche refus. Les halos grossissent avec le nombre de dossiers en attente, les bouchons pulsent en rouge. Un clic sur une station sélectionne ses dossiers. |
| ⏳ Simulateur d'arrêté + sablier | `2-simulateur-sablier.html` | `Demarche_155804_demandeurs` | Complet | Des curseurs sur Forfait, Bonus JA, assurance, AREA, transparence et limite GAEC. `Aide_demandee` est recalculé en direct (copie JS de la formule) et le sablier de l'enveloppe se remplit ou déborde. Le bouton « Forfait d'équilibre » trouve le forfait maximal qui tient dans l'enveloppe. « Appliquer » écrit les paramètres dans `Liste_Departement`. |
| 🛂 Passeport de contrôle | `3-passeport-tampons.html` | `Demarche_155804_demandeurs` | Lecture de la table | Le dossier sélectionné s'affiche comme un passeport. Sept tampons se posent : SIRENE, ISIS/PAC, SRAL, MSA, BODACC, Chorus/RIB, de minimis. Un grand visa « ÉLIGIBLE » apparaît si tout est conforme. Cliquer sur un tampon affiche les données sources. |
| 🕸️ La Toile des liens | `4-toile-des-liens.html` | `Demarche_155804_demandeurs` | Complet | Un graphe de forces où deux dossiers sont reliés s'ils partagent un IBAN, un SIRET, un PACAGE, un associé GAEC (via `DATA_ASSOCIES`) ou un e-mail. Les grappes sont classées par niveau de suspicion. |
| 📰 La Gazette de la DDTM | `5-gazette-ddtm.html` | `Demarche_155804_demandeurs` | Complet | Une une de journal générée à partir des données : gros titre choisi automatiquement, chiffre du jour, météo des départements, faits divers (anomalies), rubrique « Depuis votre dernière lecture ». Elle s'imprime en A4. |

## Installation dans Grist

**Option A — URL (recommandée)**
1. Hébergez le dossier `widgets/` en HTTPS, par exemple avec GitHub Pages : *Settings → Pages → Deploy from branch*.
2. Dans Grist : *Ajouter une vue → Personnalisé → URL personnalisée*. Collez par exemple `https://<compte>.github.io/<dépôt>/widgets/1-plan-de-metro.html`.
3. Choisissez la table `Demarche_155804_demandeurs` comme source.
4. Dans le panneau de droite, donnez l'accès demandé : « Lecture de la table » ou « Accès complet ».
5. Métro et Toile : pour filtrer une autre vue au clic, réglez cette autre vue sur *Sélectionner par → le widget*.

**Option B — Constructeur de widget.** Collez le contenu du fichier HTML dans le *Custom widget builder* de Grist. `demo-data.js` n'est pas nécessaire dans ce cas.

## Prévisualiser sans Grist

Ouvrez un fichier directement dans un navigateur servi en HTTP, par exemple `npx http-server widgets` puis `http://localhost:8080/1-plan-de-metro.html`. Hors iframe Grist, les widgets chargent `demo-data.js`, un jeu de 280 dossiers **fictifs**. On peut forcer ce mode avec `?demo=1`, et `?row=14` choisit le dossier affiché dans le passeport.

## Colonnes utilisées

Les widgets lisent les colonnes existantes, formules comprises : `Etat_dossier`, `dep2`, `Date_depot_FR`, `Eligible`, `Selectionne`, `Aide_demandee`, `Aide_accordee`, `Nb_parts`, `Minimis_recus`, `Minimis_en_cours`, `AREA_Audit`, `MRC`, `Nouvel_installe`, `Ruminants_DN`, `Date_dernier_installe`, `PACAGE_DN`, `PACAGE_via_SIRET`, `ADM_Ruminants`, `ADM_Autre_elevage`, `Lien_MSA`, `Titre_principal`, `Statut_BODACC`, `Details_BODACC`, `Etat_Chorus`, `DB_Tiers`, `Anomalie_RIB`, `Anomalie`, `Verif_associes`, `IBAN`, `usager_email`, `siret`, `naf`, `etat_administratif`…
Les autres tables lues sont `Liste_Departement`, `Liste_enveloppes`, `DATA_ASSOCIES`, `Demarche_155804_dossiers` et `Sync_metadata`.

Si une colonne est renommée, il faut adapter le widget.

## Anomalies repérées dans les formules du document

Relevées en écrivant les widgets. Le simulateur reproduit volontairement le comportement actuel.

1. **`Demarche_155804_champs.IBAN`** : il manque `return` devant `rec.IBAN_manuel`. Quand un IBAN manuel est saisi, la formule renvoie `None`.
2. **`Demarche_155804_demandeurs.MRC`** : la formule renvoie la chaîne `"True"` au lieu du booléen `True`, dans une colonne de type Bool.
3. **`Aide_demandee`, calcul du 56** : `if rec.Nouvel_installe:` est vrai aussi pour la valeur `"NON"`, ce qui donne le bonus JA à tous les dossiers ayant des données MSA. Le simulateur a un interrupteur « Bonus JA 56 : seulement si Nouvel installé = OUI » pour chiffrer l'écart.
4. **`Etat_Chorus`** : la dernière branche renvoie « Tiers OK » quand le tiers n'est **pas** trouvé dans `DATA_CHORUS`, et `None` sinon. À vérifier.
