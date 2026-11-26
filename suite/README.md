# Suite numérique de services (DSFR) — sans serveur

Neuf applications web au **Système de Design de l’État** (DSFR 1.15, police Marianne, bloc-marque « Préfète de la région Bretagne » / DRAAF Bretagne), en HTML/JS pur : **aucun serveur, aucune installation, aucune compilation**. Il suffit de publier le dossier `suite/` (GitHub Pages, intranet statique, ou même ouverture locale via un petit serveur).

Portail : `https://williamlestoilleagri-creator.github.io/Grist/suite/` (une fois la branche fusionnée dans `main`).

| Application | Dossier | En bref |
|---|---|---|
| **Automatisation** (type n8n) | `automatisation/` | Éditeur visuel de scénarios par nœuds, ~50 connecteurs : Grist (lire, ajouter, modifier, upsert, SQL, surveillance de nouvelles lignes), HTTP/REST, RSS, courriel (messagerie locale, Brevo, passerelle), SMS (Brevo, passerelle, Free), Tchap/Matrix, Mattermost/Slack/Teams, ntfy, notifications, Annuaire de l’administration, API Entreprises, vCard, géocodage IGN, cadastre, API Géo, visio (La Suite / Jitsi), invitations .ics, WordPress, lettre d’information, IA (Albert / compatible OpenAI) et interconnexion avec les 8 autres applications. Expressions `{{ $json.champ }}`, test pas à pas, historique, planification, lancement depuis un lien Grist. |
| **Circuits de travail** | `circuits/` | Demandes suivant des circuits paramétrables (validation / action / information), délais en jours ouvrés, « à traiter par moi », kanban, pièces jointes, historique, tableau de bord. |
| **Réservation de ressources** (type GLPI) | `reservation/` | Salles, véhicules, matériel : planning jour/semaine/mois, recherche de créneau libre par capacité et équipements, récurrences, détection de conflits, validation, export .ics, écran de porte de salle. |
| **Veille informationnelle** | `veille/` | Sources RSS/Atom, API JSON (avec correspondance des champs), tables Grist, recherches Google Actualités ; ajout/suppression, OPML, mots-clés surlignés et alertes, favoris, annotations, bulletin de veille (impression, copie pour courriel), statistiques. |
| **Cartographie** | `cartographie/` | Leaflet + Géoplateforme IGN (Plan IGN, photos aériennes, cadastre, RPG, limites, Natura 2000, forêts…), OSM, explorateur WMS (IGN, GéoBretagne, Sandre…), WFS, GeoJSON, ArcGIS, tables Grist ; recherche d’adresse, identification (adresse + parcelle + commune), mesures, dessin, import GeoJSON/CSV/KML/GPX, table attributaire, lien de partage. |
| **Courrier & parapheur** | `courrier/` | Registre chrono arrivée/départ/interne, attribution aux services, échéances, accusé de réception (mentions CRPA), fiche de circulation, réponse liée, parapheur (visas + signature), statistiques. |
| **Gestion de crise** | `crise/` | Événements par niveau, main courante horodatée, actions, fiches réflexes (check-lists), cellule de crise, point de situation, planning d’astreintes, annuaire de crise. |
| **Contrôles terrain** | `controles/` | Établissements (complétés via SIRET), grilles de contrôle, saisie sur tablette (photos, géolocalisation, signature), rapport imprimable, niveaux de résultat, suites et contre-visites, carte. |
| **Actes & publipostage** | `actes/` | Modèles (arrêté, courrier, convocation, mise en demeure, attestation, note) avec éditeur et variables `{{…}}`, aperçu A4, publipostage CSV / Grist / copier-coller, registre numéroté, export PDF et Word. |

## Principes communs (`assets/core.js`)

- **Données** : dans le navigateur (localStorage ; fichiers et photos dans IndexedDB). Chaque application a un bouton **Données** : export/import JSON, et **synchronisation Grist** (envoi/récupération, tables et colonnes créées automatiquement, clé `Uid`). Le portail permet de sauvegarder/restaurer toute la suite.
- **Paramètres** (partagés) : bloc-marque (Préfète de la région Bretagne, ministère de l’Agriculture, République française ou texte libre), service, adresse, nom de l’agent, connexion Grist (serveur, document, clé API — ex. `https://grist.numerique.gouv.fr`), proxy CORS pour les flux qui ne l’autorisent pas.
- **Interconnexion** : les applications partagent le même stockage (même origine). Exemples : l’automatisation crée des demandes, courriers, entrées de main courante, contrôles, points sur la carte ; un rapport de contrôle prépare la mise en demeure dans « Actes ».
- **DSFR** et **Leaflet** sont embarqués dans `assets/` (pas de CDN), thème clair/sombre, affichage mobile.

## Limites à connaître

- Sans serveur, les scénarios planifiés ne tournent que lorsqu’un onglet « Automatisation » est ouvert (poste dédié possible) et les données ne sont pas partagées entre agents, sauf via Grist ou export/import.
- Les API appelées depuis le navigateur doivent autoriser CORS (c’est le cas des API publiques de l’État, de Grist, Matrix, ntfy). Les autres passent par le proxy configurable : ne pas y faire transiter de données sensibles.
- Les identifiants (clés API) sont stockés en clair dans le navigateur : utiliser des clés dédiées à droits limités.
- Les grilles de contrôle, fiches réflexes et modèles d’actes fournis sont des **exemples** à valider par les services.
