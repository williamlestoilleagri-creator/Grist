# Calculette GREN — diagnostic de sécurité

*Diagnostic réalisé le 19 novembre 2026 sur le code du dossier `calculette-gren/` (application, backoffice, base de données) et sur les pages voisines du dépôt `Grist` qui partagent la même adresse web.*

---

## En bref

| Question | Réponse |
|---|---|
| **Y a-t-il une porte dérobée (backdoor) ?** | **Non.** Aucun accès caché, aucun envoi de données dissimulé, aucun code obscurci. Méthode et preuves en partie 2. |
| **L'application se connecte-t-elle à des outils extérieurs ?** | **Deux seulement** : la liste officielle des communes (`geo.api.gouv.fr`) et, une fois activé, le serveur Supabase de la Calculette. Aucune publicité, aucun traceur, aucun CDN, aucun cookie. |
| **Les données des agriculteurs quittent-elles leur appareil ?** | **Non.** Elles restent dans le navigateur. Seule une mesure d'audience **anonyme** est envoyée si le serveur est activé. |
| **Y a-t-il des failles ?** | Pas de faille grave dans le code de la Calculette. **Un risque élevé vient de l'hébergement** (les autres pages du dépôt partagent la même adresse), plus plusieurs points moyens ou faibles détaillés en partie 4. |
| **Qu'est-ce qui a été corrigé pendant le diagnostic ?** | 6 failles corrigées et retestées : injection de code par un fichier importé, injection de formule dans les exports CSV, pollution de prototype, fichiers géants, absence de politique de sécurité (CSP), affichage dans un cadre. Liste en partie 5. |
| **Technologies concernées** | HTML, CSS, JavaScript (navigateur), SQL (PostgreSQL / Supabase). **Il n'y a ni PHP, ni Java, ni serveur applicatif** : aucune faille de ces langages ne peut concerner l'application. |

---

## 1. Ce qui compose l'application

| Élément | Rôle | Où ça tourne |
|---|---|---|
| `index.html`, `app.js` | application des agriculteurs | dans le navigateur de l'utilisateur |
| `lib/xlsx-mini.js` | lecture / écriture des fichiers Excel (écrit pour le projet, sans bibliothèque tierce) | navigateur |
| `config.js`, `referentiel-defaut.js` | réglages, valeurs GREN par défaut | navigateur |
| `sw.js` | fonctionnement hors connexion (cache des fichiers du site) | navigateur |
| `admin/` | backoffice | navigateur + Supabase |
| `supabase/schema.sql` | tables, droits d'accès, journaux, anti-attaque | base PostgreSQL hébergée par Supabase |
| `dsfr/` | Système de Design de l'État 1.15.3 (CSS, JS, police Marianne) | navigateur |
| `lib/jspdf…`, `lib/supabase…` | création des PDF, client Supabase | navigateur |
| Hébergement | GitHub Pages (fichiers statiques) | serveurs de GitHub |

Il n'existe **aucun code exécuté sur un serveur** en dehors des fonctions SQL de la base Supabase.

---

## 2. Recherche de porte dérobée et de connexions cachées

### Méthode
1. **Inventaire de tous les appels réseau** du code écrit pour la Calculette (`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `importScripts`, `postMessage`) et de toutes les adresses web citées.
2. **Recherche des fonctions dangereuses** : `eval`, `new Function`, `document.write`, chaînes de code passées à `setTimeout`, données encodées en base64.
3. **Vérification octet par octet** de chaque bibliothèque intégrée contre la version officielle publiée sur npm.
4. **Vérification du contenu encodé** : le seul bloc base64 (`lib/marianne-pdf.js`) a été décodé ; c'est la police Marianne, identique glyphe pour glyphe à celle du DSFR, sans aucun code.
5. **Recherche de secrets** (clés d'API, jetons, mots de passe, clés privées) dans **tout l'historique git** du dépôt.

### Résultats

| Contrôle | Résultat |
|---|---|
| Appels réseau de l'application | 2 : `geo.api.gouv.fr` (recherche de commune) et `<projet>.supabase.co` (si configuré) |
| Appels réseau du backoffice | `<projet>.supabase.co` uniquement |
| `eval`, `new Function`, `document.write` | aucun, ni dans le code du projet ni dans les bibliothèques |
| Bibliothèques intégrées | **identiques** aux versions officielles (empreintes ci-dessous) |
| Mesure d'audience | anonyme, vers Supabase uniquement, désactivée tant que le serveur n'est pas configuré |
| Cookies | aucun |
| Secrets dans l'historique git | aucun trouvé |
| Mot de passe écrit en dur | **oui, un seul, volontaire** : l'accès temporaire `admin` / `nimda` (voir faille M1) |

**Adresses citées par les bibliothèques mais jamais contactées** : jsPDF contient l'adresse d'un script `cdnjs.cloudflare.com`, utilisée seulement par un mode d'affichage du PDF (« pdfobjectnewwindow ») que la Calculette n'utilise pas. Le DSFR peut charger des images SVG **du site lui-même**. Les autres adresses sont des liens de documentation dans les commentaires (github.com, opensource.org…).

### Empreintes des bibliothèques (SHA-256, identiques aux paquets npm officiels)

| Fichier | Version | SHA-256 |
|---|---|---|
| `lib/jspdf-4.2.1.umd.min.js` | jsPDF 4.2.1 | `e6551fcdc32f09d6…` |
| `lib/jspdf-autotable-5.0.8.min.js` | jsPDF-AutoTable 5.0.8 | `a65dff2c6a8296b1…` |
| `lib/supabase-2.117.3.js` | supabase-js 2.117.3 | `d6a5c4414a5d4ce6…` |
| `dsfr/dsfr.min.css` | DSFR 1.15.3 | `80a1156635a7b4a0…` |
| `dsfr/dsfr.module.min.js` | DSFR 1.15.3 | `81374ec59f780945…` |
| `dsfr/dsfr.nomodule.min.js` | DSFR 1.15.3 | `195df7ea36f593b2…` |

Pour revérifier vous-même (dans un terminal, à la racine du dépôt) :

```bash
sha256sum calculette-gren/lib/*.js calculette-gren/dsfr/*.css calculette-gren/dsfr/*.js
```

**Failles connues** : `npm audit` sur les quatre bibliothèques aux versions utilisées → **0 vulnérabilité** au 19/11/2026.

---

## 3. Ce que voit chaque acteur

| Acteur | Ce qu'il peut voir ou faire |
|---|---|
| **L'agriculteur** | ses propres données, uniquement sur son appareil |
| **Une autre personne utilisant le même appareil / navigateur** | les données de l'agriculteur (elles ne sont pas chiffrées sur l'appareil) — voir M4 |
| **GitHub (hébergeur)** | l'adresse IP et le navigateur de chaque visiteur (journaux techniques de GitHub Pages), jamais les données saisies |
| **geo.api.gouv.fr (État)** | les lettres tapées dans « Commune » et l'adresse IP |
| **Supabase / l'administrateur** (si activé) | statistiques anonymes (type d'action, département, culture, type d'appareil) ; adresses IP **des personnes qui tentent de se connecter au backoffice** |
| **Un administrateur de la Calculette** | aucune donnée d'exploitation : elles ne sont jamais envoyées |

---

## 4. Failles et risques — classés par gravité

Échelle : **Élevé** = à traiter avant une mise en service officielle · **Moyen** = à traiter rapidement · **Faible** = à connaître · **Info** = sans action.

### E1 — Élevé — Adresse web partagée avec d'autres pages qui manipulent des clés et des scripts externes

**Constat.** GitHub Pages sert **toutes** les pages de ton compte depuis la même origine : `https://williamlestoilleagri-creator.github.io`. Pour le navigateur, la Calculette, son backoffice et les autres pages du dépôt (`duo.html`, `grist-assistant-claude.html`, `erp-sap.html`, `annuaire-adresses.html`, `prise-rdv-calendrier.html`, `rdv/`) partagent donc **le même espace de stockage** et se font mutuellement confiance. Or :
- `grist-assistant-claude.html` enregistre une **clé d'API Anthropic** dans ce stockage, et `duo.html` y garde ses réglages, dont une éventuelle **clé Google Cloud** ;
- `annuaire-adresses.html`, `erp-sap.html`, `grist-assistant-claude.html` et `prise-rdv-calendrier.html` chargent des scripts depuis des serveurs extérieurs (`docs.getgrist.com`, `cdnjs.cloudflare.com`) **sans contrôle d'intégrité** (`integrity=`).

**Conséquence.** Si l'un de ces serveurs extérieurs est piraté, ou si une seule de ces pages a une faille d'injection, un attaquant peut lire :
- les données des agriculteurs ;
- **la session d'un administrateur du backoffice** (jeton Supabase), ce qui lui permettrait d'agir à sa place tant que la session est valide ;
- les clés d'API des autres pages.

Le code de la Calculette n'y peut rien : c'est une question d'adresse web.

**Correction recommandée** (par ordre d'efficacité) :
1. Publier la Calculette sur **sa propre adresse** : un nom de domaine de l'administration (par exemple `calculette-gren.<service>.gouv.fr`, configurable dans GitHub Pages), ou un compte / une organisation GitHub dédiés. C'est la seule solution complète.
2. À défaut, retirer du même compte les pages qui stockent des clés ou chargent des scripts externes.
3. Ajouter un contrôle d'intégrité (`integrity="sha384-…" crossorigin="anonymous"`) aux scripts externes des autres pages, quand le serveur le permet (pas possible pour `grist-plugin-api.js`, qui change sans prévenir).

### M1 — Moyen — Accès « administrateur » temporaire écrit dans le code (`admin` / `nimda`)

**Constat.** L'identifiant et le mot de passe sont dans `config.js`, lisibles par **tout visiteur** qui affiche le code de la page. Le mot de passe `nimda` (« admin » à l'envers) figure aussi dans toutes les listes de mots de passe testés par les robots.

**Conséquence, limitée** : cet espace ne donne accès qu'au référentiel **local** (les modifications ne valent que sur l'appareil de la personne) et au lien vers le backoffice, qui a sa propre authentification. Personne ne peut modifier les résultats des autres. Le risque : une personne qui modifie le référentiel sur son propre appareil obtient des doses fausses, ou croit à tort qu'il existe un vrai contrôle d'accès.

**Correction** : supprimer cet accès dès que le backoffice sécurisé est activé et faire publier le référentiel par ce backoffice. En attendant, au moins changer le mot de passe dans `config.js`.

### M2 — Moyen (à vérifier) — Adresse IP potentiellement falsifiable dans le backoffice

**Constat.** Les fonctions SQL lisent l'adresse IP du visiteur dans les en-têtes transmis par Supabase (`cf-connecting-ip`, puis `x-real-ip`, puis la première adresse de `x-forwarded-for`). Si l'infrastructure de Supabase transmettait tel quel un en-tête `X-Forwarded-For` fourni par l'attaquant, celui-ci pourrait :
- contourner le blocage de son IP ;
- faire bloquer **l'IP d'un administrateur** en simulant des échecs de connexion à sa place.

**Vérification à faire une fois Supabase activé** (dans un terminal, en remplaçant les deux valeurs) :

```bash
curl -s -X POST "https://VOTRE-PROJET.supabase.co/rest/v1/rpc/echec_connexion" -H "apikey: VOTRE-CLE-ANON" -H "Content-Type: application/json" -H "X-Forwarded-For: 203.0.113.99" -d '{"p_email":"test-ip@exemple.fr"}'
```

Regarder ensuite, dans *Connexions* du backoffice, l'IP enregistrée pour `test-ip@exemple.fr` : si c'est `203.0.113.99`, l'en-tête est falsifiable. Dans ce cas, modifier `client_ip()` dans `schema.sql` pour ne garder que l'en-tête fiable, et le signaler.

### M3 — Moyen — Fonctions publiques de journalisation utilisables par n'importe qui

**Constat.** Pour enregistrer les tentatives de connexion et l'audience, quelques fonctions SQL sont appelables sans être connecté (`suivre`, `avant_connexion`, `echec_connexion`, `config_publique`, `referentiel_officiel`). Un attaquant peut donc :
- **fausser les statistiques** d'utilisation (fausses visites, faux calculs) ;
- remplir les journaux de faux événements de sécurité ;
- tenter de saturer la base (offre gratuite : 500 Mo).

**Atténuations en place** : limite de requêtes par minute et par adresse IP (réglable), champs tronqués, valeurs contrôlées, aucun accès en lecture, purge des anciens journaux.

**À faire** : traiter les statistiques comme indicatives, surveiller la taille de la base dans Supabase (*Reports*), purger régulièrement.

### M4 — Moyen — Données non chiffrées sur l'appareil et dans les copies `.gren`

**Constat.** Les données sont dans le stockage du navigateur, **en clair**. Toute personne ayant accès à la session de l'ordinateur ou du téléphone (ordinateur partagé, salle de formation, technicien) peut les lire. Les copies `.gren` et les fichiers Excel sont aussi lisibles par quiconque les reçoit.

**En place** : choix « Garder mes informations sur cet appareil » (désactivable : tout est effacé à la fermeture de l'onglet) et bouton « Effacer toutes mes informations ».

**Conseils aux utilisateurs** (déjà rappelés dans l'application) : désactiver la conservation sur un ordinateur partagé, ne pas envoyer les copies par messagerie non sécurisée. *Évolution possible* : chiffrer les copies avec un mot de passe choisi par l'utilisateur.

### F1 — Faible — Possibilité de deviner les adresses des administrateurs

**Constat.** La base refuse toute création de compte pour une adresse non autorisée. En appelant directement le service d'authentification de Supabase, un attaquant peut donc distinguer une adresse autorisée d'une adresse refusée. L'interface, elle, affiche toujours le même message.

**Correction possible** : désactiver les inscriptions dans Supabase et envoyer les invitations par une fonction serveur (Edge Function avec la clé `service_role`, jamais dans le navigateur).

### F2 — Faible — En-têtes de sécurité non maîtrisables sur GitHub Pages

GitHub Pages ne permet pas de choisir les en-têtes HTTP. Ce qui est en place malgré cela :
- **HTTPS forcé** : le domaine `github.io` est préchargé dans les navigateurs (HSTS) ;
- **politique de sécurité du contenu (CSP)** en balise `<meta>` dans l'application et le backoffice : seuls les scripts du site s'exécutent et les connexions sont limitées aux adresses listées ;
- **blocage de l'affichage dans un cadre** par script.

Ce qui manque : la directive `frame-ancestors` (impossible en `<meta>`), le signalement des violations de la CSP, et `Permissions-Policy`. Avec un nom de domaine propre et un hébergement maîtrisé (voir E1), ces en-têtes pourraient être ajoutés.

Si le projet Supabase utilise un **domaine personnalisé**, il faut l'ajouter à `connect-src` dans la CSP de `index.html` et de `admin/index.html`.

### F3 — Faible — Bibliothèques figées dans le dépôt

Les bibliothèques sont copiées dans le dépôt (aucun CDN, donc aucun risque de substitution à distance), mais **elles ne se mettent pas à jour toutes seules**. Versions plus récentes disponibles au 19/11/2026, sans correctif de sécurité : DSFR 1.15.4, jsPDF-AutoTable 5.0.9, supabase-js 2.119.1.

**À faire** : vérifier les avis de sécurité tous les trimestres (`npm audit` sur ces versions, ou abonnement aux alertes GitHub de chaque projet).

### F4 — Faible — Mode hors connexion (service worker)

Le service worker garde une copie des fichiers du site pour fonctionner au champ, sans réseau. Il demande toujours la version en ligne d'abord et ne met jamais en cache le backoffice ni les appels au serveur. Risque : seulement si quelqu'un obtient le droit de publier dans le dépôt (voir F6).

### F5 — Faible — Conformité et données personnelles

- GitHub et Supabase sont des **sociétés américaines**, soumises au *CLOUD Act*, même avec des serveurs en Europe. Pour un service officiel, faire valider l'hébergement par la DSI et le RSSI (éventuellement un hébergement qualifié SecNumCloud), et inscrire le traitement au **registre des traitements** (journaux de connexion du backoffice avec adresses IP, audience anonyme).
- La mesure d'audience est conçue pour l'exemption de consentement de la CNIL : anonyme, sans recoupement, sans cookie. La durée de conservation est réglable (1 an par défaut).
- Le DSFR, la police Marianne et le bloc-marque sont **réservés aux sites de l'État**.

### F6 — Faible mais déterminant — Sécurité des comptes qui contrôlent tout

La vraie « clé maîtresse » de l'application, ce sont **trois comptes** :
- **le compte GitHub** : quiconque peut publier dans le dépôt peut modifier l'application pour tous les utilisateurs ;
- **le compte Supabase propriétaire du projet** : il accède à toute la base sans passer par les règles de sécurité ;
- **la boîte mail du super-administrateur** : elle permet de réinitialiser son mot de passe.

**À faire** : double authentification sur les trois, protection de la branche `main` (relecture obligatoire avant fusion), relecture humaine des modifications avant de les fusionner.

### Info — Points vérifiés sans problème

- **Injection de code (XSS)** : toutes les données affichées passent par une fonction d'échappement. Attaque simulée avec des fichiers piégés (copie `.gren` et tableau CSV contenant du code dans chaque champ et dans les identifiants), en parcourant tous les écrans, PDF compris : **0 exécution, avec ou sans CSP**.
- **Injection SQL** : impossible côté application (pas de base) ; côté backoffice, uniquement des requêtes paramétrées et un filtre de recherche nettoyé.
- **Contrôle d'accès du backoffice** : testé sur un vrai PostgreSQL. Sans double authentification, aucune donnée n'est lisible. Un compte désactivé perd l'accès immédiatement. Un administrateur ne peut pas s'attribuer plus de droits. Le dernier super-administrateur ne peut pas être supprimé. Le journal d'administration ne peut pas être modifié depuis l'interface.
- **Fichiers Excel** : lus sans exécuter de formule ni de macro (les macros ne sont jamais lues). Fichiers limités à 10 Mo, contenu décompressé à 40 Mo (protection contre les « bombes zip »). Les fichiers produits ne contiennent que du texte et des nombres.
- **Redirections ouvertes, téléversement vers un serveur, exécution de commandes** : sans objet (aucun serveur applicatif).
- **CSS** : aucune donnée de l'utilisateur n'entre dans les styles, donc pas d'injection CSS possible. La CSP autorise les styles en ligne, nécessaires au DSFR : sans risque d'exécution de code.

---

## 5. Corrigé pendant ce diagnostic

| # | Faille | Correction | Vérification |
|---|---|---|---|
| 1 | **Injection de code par un fichier importé** : les identifiants internes d'une copie `.gren` étaient insérés dans la page sans échappement | identifiants contrôlés à l'import (lettres, chiffres, `-`, `_`), échappement ajouté partout | attaque simulée : 0 exécution |
| 2 | **Pollution de prototype** par une clé `__proto__` dans un fichier importé | nettoyage de toute donnée externe (clés dangereuses supprimées, profondeur et taille limitées) | testé |
| 3 | **Injection de formule** dans les exports CSV du backoffice (adresses et navigateurs saisis par des attaquants) | cellules commençant par `=`, `+`, `-` ou `@` neutralisées ; exports de l'application en vrai Excel, texte seul | — |
| 4 | **Fichiers géants** pouvant bloquer le navigateur | limites de 10 Mo par fichier et de 40 Mo après décompression | — |
| 5 | **Absence de politique de sécurité (CSP)** dans l'application | code déplacé dans `app.js`, CSP stricte (scripts du site uniquement, connexions limitées) | aucun blocage légitime ; PDF et Excel fonctionnent |
| 6 | **Affichage dans un cadre** (« clickjacking ») | blocage par script dans l'application (déjà présent dans le backoffice) | — |
| *(antérieur)* | Droits SQL : une valeur NULL accordait l'accès à `publier_referentiel` / `purger_journaux` | `coalesce(…, false)` | testé sur PostgreSQL |

---

## 6. Plan d'action recommandé

| Priorité | Action | Qui |
|---|---|---|
| 1 | Activer la **double authentification** sur GitHub, Supabase et la messagerie de l'administrateur ; **protéger la branche `main`** | toi |
| 2 | Publier la Calculette sur une **adresse dédiée** (domaine de l'administration ou compte GitHub dédié) — faille E1 | toi + DSI |
| 3 | Activer le backoffice, puis **supprimer l'accès `admin` / `nimda`** — faille M1 | toi (je peux faire la modification) |
| 4 | Faire le **test d'IP** de la faille M2 après activation de Supabase | toi (ou moi, avec l'adresse du projet) |
| 5 | Faire valider l'hébergement et inscrire le traitement au **registre** (DSI, RSSI, DPD) — F5 | administration |
| 6 | Revoir les autres pages du dépôt (`duo.html`, `grist-assistant-claude.html`…) : clés stockées, scripts externes | toi (je peux les auditer) |
| 7 | Tous les trimestres : vérifier les mises à jour de sécurité des bibliothèques — F3 | toi |

---

## 7. Limites de ce diagnostic

- C'est une **revue de code et des tests automatisés**, pas un test d'intrusion réalisé par un prestataire qualifié (PASSI). Pour un service officiel, un audit indépendant reste recommandé.
- Le service Supabase n'a pas pu être testé en conditions réelles : le schéma a été exécuté sur un vrai PostgreSQL avec une simulation de la partie authentification. Les points dépendant de l'infrastructure Supabase (M2, limites d'envoi d'e-mails, journal d'authentification) sont à vérifier après activation.
- Les autres pages du dépôt n'ont fait l'objet que d'un repérage (connexions externes, stockage de clés), pas d'un audit complet.
- Le code de la Calculette a été écrit avec l'assistance d'une IA (Claude). Les empreintes de la partie 2 permettent à un tiers de vérifier que les bibliothèques n'ont pas été modifiées ; le code du projet lui-même mérite une **relecture humaine** par un développeur de l'administration avant mise en production.
