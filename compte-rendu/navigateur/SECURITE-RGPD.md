# Diagnostic de sécurité et de conformité RGPD

**Application :** Compte rendu de réunion — version navigateur (`compte-rendu/navigateur/`)  
**Date du diagnostic :** 23 novembre 2026  
**Objet :** fournir au responsable de traitement, au délégué à la protection des données (DPO) et au responsable de la sécurité des systèmes d'information (RSSI) les éléments pour valider l'usage interne de l'application.

> Ce document est un **diagnostic technique**. Il ne vaut pas validation : la décision appartient au **responsable de traitement** (après avis du **DPO**) pour le RGPD, et à l'**autorité d'homologation** (après avis du **RSSI**) pour la sécurité. Il leur fournit les éléments vérifiés et les preuves pour décider.

---

## 1. Réponses directes

### 1.1 « Les données ne sont-elles pas stockées ? »

| Où ? | Stockage | Preuve |
|---|---|---|
| **Sur un serveur, sur Internet, chez un tiers** | **Aucun.** L'application n'a pas de serveur de données. L'audio, la transcription et le compte rendu ne quittent jamais le navigateur. | Capture réseau intégrale (§ 3.1) : aucun envoi de données, uniquement des téléchargements de fichiers de l'application. |
| **Sur le poste de l'utilisateur** | **Temporairement, pendant la session uniquement** (mode éphémère, réglage par défaut). Ce stockage est indispensable pour travailler (reprendre une réunion après un rechargement de page). **Tout est effacé à la fermeture du navigateur.** | Test d'effacement (§ 3.2) : données présentes pendant la session, **0 donnée** à l'ouverture suivante. |
| **Fichiers téléchargés** (.docx, .pdf…) | Dans le dossier Téléchargements, **sous la responsabilité de l'utilisateur**, comme tout document bureautique. | — |

Il n'est techniquement pas possible de traiter un enregistrement sans le garder en mémoire le temps du traitement. Le mode éphémère réduit cette conservation à la durée de la session.

### 1.2 « Puis-je mettre ce que je veux dans l'application ? »

| Contenu de la réunion | Mode local (sans IA externe) | Avec IA externe (option) |
|---|---|---|
| Réunion administrative courante, données personnelles ordinaires (noms, fonctions, propos) | **Oui**, après information des participants | Oui avec Mistral (UE), après accord du DPO |
| Données sensibles au sens de l'art. 9 RGPD (santé, opinions syndicales ou politiques, convictions…) | **Oui sous conditions** : AIPD réalisée, poste maîtrisé (§ 5.6) | **Non** : ne pas utiliser l'IA externe |
| Informations **Diffusion Restreinte** | **Non, sauf** si l'application est déployée sur un poste et un réseau homologués DR et validée par l'autorité d'homologation | **Non** |
| Informations **classifiées** (Secret, Très Secret — IGI 1300) | **Non** | **Non** |

Raison : un traitement local réduit fortement les risques, mais le niveau de confidentialité autorisé dépend du **poste et du réseau** sur lesquels l'application tourne, pas de l'application seule. L'application ne peut pas être « homologuée DR » par elle-même.

### 1.3 « Les éléments ne sont-ils accessibles que par l'utilisateur ? »

- **Vis-à-vis de l'extérieur, des autres agents et de l'éditeur : oui.** Il n'y a ni compte, ni serveur, ni base partagée. Personne d'autre, administrateur du site compris, ne peut voir les réunions d'un utilisateur.
- **Sur le poste lui-même : les données sont accessibles à toute personne qui utilise la même session Windows** (et donc le même profil de navigateur), ainsi qu'aux administrateurs du poste. C'est le cas de tout fichier enregistré sur un ordinateur. Mesures :
  - mode éphémère : rien ne subsiste après fermeture du navigateur ;
  - verrouillage de session obligatoire en cas d'absence (Windows + L) ;
  - chiffrement du disque (BitLocker), standard des postes de l'État ;
  - ne pas utiliser l'application sur un poste partagé sans session nominative.

### 1.4 Avis

**L'application peut être utilisée en interne pour des réunions administratives courantes**, sous réserve des conditions de la check-list (§ 8), notamment :
- **l'héberger sur un serveur interne à une adresse dédiée** : l'adresse actuelle (github.io) ne doit servir qu'aux démonstrations, car elle est partagée avec d'autres applications (§ 4) ;
- déployer la configuration recommandée ;
- informer les participants ;
- réaliser l'AIPD avec le DPO ;
- obtenir la décision d'homologation, proportionnée (démarche « homologation simplifiée » de l'ANSSI).

---

## 2. Architecture et flux de données

L'application est un **ensemble de fichiers statiques** (HTML, JavaScript, modèles). Le serveur web qui la distribue ne reçoit **aucune** donnée de réunion. Tout le traitement a lieu dans le navigateur de l'utilisateur.

| Donnée | Traitée où | Stockée où | Durée (mode éphémère) | Transmise à |
|---|---|---|---|---|
| Fichier déposé (audio ou vidéo, sans limite de taille) | Navigateur : seule la piste son est extraite, en lisant le fichier par morceaux | **Jamais copié** : lu sur le disque de l'utilisateur, puis abandonné | Durée de l'extraction | **Personne** |
| Son de la réunion (copie légère 16 kHz mono, ≈ 115 Mo par heure) | Navigateur (Web Worker) | IndexedDB du navigateur | Session | **Personne** |
| Empreintes vocales (séparation des voix) | Navigateur, en mémoire | **Jamais stockées** | Durée du calcul | **Personne** |
| Transcription, interlocuteurs, corrections | Navigateur | IndexedDB | Session | Personne. Exception : IA optionnelle, **texte seul** |
| Résultats de l'analyse de cohérence locale | Navigateur | IndexedDB | Session | Personne |
| Compte rendu | Navigateur | IndexedDB | Session | Personne |
| Journal des actions (traçabilité) | Navigateur | IndexedDB | Session | Personne |
| Réglages (modèle, calcul) | Navigateur | localStorage | Jusqu'à « Tout effacer » ou nouvelle session éphémère | Personne |
| Clé d'API d'une IA optionnelle | Navigateur | sessionStorage | Fermeture du navigateur | Uniquement au fournisseur concerné |
| Modèles de transcription (fichiers publics) | — | Cache du navigateur | Persistant (aucune donnée personnelle) | Téléchargés depuis le serveur interne ou huggingface.co |

### Connexions réseau possibles

| Destination | Quand | Contenu envoyé | Configuration |
|---|---|---|---|
| Serveur hébergeant l'application | Ouverture de la page | Rien (téléchargement des fichiers de l'application) | Toujours |
| huggingface.co (États-Unis) | Premier usage, si `sourceModeles: "huggingface"` | Rien (téléchargement des modèles). L'adresse IP du poste est visible. | **Supprimable** : `sourceModeles: "local"` |
| api.mistral.ai (France / UE) | Uniquement si l'utilisateur lance l'**IA optionnelle** Mistral | Texte de la transcription | Autorisée par défaut, désactivable |
| api.anthropic.com (États-Unis) | Uniquement si l'IA Claude est autorisée **et** lancée | Texte de la transcription | **Désactivée par défaut** |
| localhost:11434 (Ollama) | IA installée sur le poste | Texte, sans sortir du poste | Autorisée par défaut |

Toute autre destination est **bloquée par le navigateur** grâce à la politique de sécurité du contenu (CSP) déclarée dans `index.html`.

---

## 3. Preuves (tests reproductibles)

Le script `outils/preuve-securite.js` rejoue une utilisation complète dans un navigateur Chromium et trace **toutes** les requêtes réseau, celles de la page comme celles du calcul en arrière-plan. Il relève aussi le contenu du stockage local. Le RSSI peut le relancer lui-même (mode d'emploi en tête du script).

Scénario : ouverture de l'application, dépôt de `exemples/reunion-test.mp3` (2 minutes, 4 voix), transcription, séparation des voix, analyse de cohérence locale, tentative d'utiliser une IA hors UE, renommage d'un interlocuteur, téléchargement des 3 documents dans les 5 formats (15 fichiers), fermeture puis réouverture.

### 3.1 Capture réseau — configuration « tout interne » (navigateur sans accès à Internet)

Navigateur Chromium lancé **sans accès à Internet**, modèles hébergés avec l'application (`sourceModeles: "local"`), test du 23 novembre 2026 :

| Mesure | Résultat |
|---|---|
| Requêtes réseau émises (page + calcul en arrière-plan) | 92 |
| Serveurs contactés | **uniquement** le serveur de l'application (`127.0.0.1:8099` pendant le test) |
| Requêtes vers l'extérieur | **0** |
| Envois de données (requêtes autres que des téléchargements GET) | **0** |
| Tentative d'utiliser l'IA hors UE (claude.ai) | Refusée : « Claude (Anthropic) est désactivé par l'administrateur sur ce déploiement. » |
| Documents téléchargés (3 documents × 5 formats) | 15, générés sur le poste |
| Erreurs JavaScript | 0 |

**Configuration actuelle** (modèles téléchargés depuis huggingface.co, `sourceModeles: "huggingface"`) : 113 requêtes, dont 42 vers `huggingface.co` et son réseau de diffusion (`us.aws.cdn.hf.co`). **Toutes sont des téléchargements de modèles** (méthode GET). **Aucun envoi de données.** Seule l'adresse IP du poste est visible par Hugging Face, ce que supprime le mode `local`.

### 3.2 Stockage et effacement

| Contrôle | Pendant la session | Après fermeture de l'onglet et réouverture |
|---|---|---|
| Réunions | 1 | **0** |
| Enregistrements audio | 1 | **0** |
| Entrées du journal | 19 | **0** |
| Clés d'API conservées durablement (localStorage) | 0 | 0 |
| Cookies | 0 | 0 |

Le mode éphémère efface bien toutes les données à la nouvelle session. Si un autre onglet de l'application est encore ouvert, l'effacement attend sa fermeture, pour ne pas détruire un travail en cours.

### 3.3 Résistance à l'injection de code

Du code malveillant (`"><img src=x onerror="alert(1)"><script>alert(2)</script>`) a été saisi dans le titre, le nom d'un interlocuteur et le texte d'une intervention, puis tous les onglets ont été affichés.

Résultat : **0 alerte exécutée, 0 balise injectée**. Le code s'affiche comme du simple texte. Toutes les données affichées, y compris les réponses d'une IA, passent par une fonction d'échappement. Les exports échappent le texte selon le format (XML pour .odt, Markdown).

---

## 4. Analyse de sécurité

| Contrôle | Constat | Statut |
|---|---|---|
| Absence de serveur de données | Application 100 % statique, aucun envoi de données (preuve § 3.1) | ✅ |
| Politique de sécurité du contenu (CSP) | `default-src 'self'` ; scripts du seul site (`'wasm-unsafe-eval'` requis pour le calcul) ; connexions limitées à la liste du § 2 ; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` | ✅ |
| Styles en ligne (`'unsafe-inline'` pour les styles) | Nécessaire pour les couleurs dynamiques ; aucun script en ligne autorisé | ⚠️ Risque faible accepté |
| Intégration dans un cadre (détournement de clic) | Refusée par l'application ; `frame-ancestors 'none'` dans la configuration serveur fournie | ✅ (corrigé) |
| Bibliothèques tierces | **Toutes embarquées**, version figée, aucun CDN : transformers.js 4.3.2, onnxruntime-web, FFmpeg WebAssembly 0.12 (licence GPL, extraction du son), jsPDF 4.2.1, docx 9.16, SDK Anthropic 1.12, DSFR 1.15, dictionnaire français. Licences dans `vendor/` | ✅ |
| Mouchards, statistiques, cookies | Aucun cookie, aucun outil de mesure d'audience, aucune télémétrie (vérifié par analyse du code et capture réseau) | ✅ |
| Injection de code (XSS) | Échappement systématique, test négatif (§ 3.3) | ✅ |
| Injection de consignes à l'IA | Consigne explicite de traiter le texte comme une donnée ; réponses de l'IA affichées sans interprétation (échappées) ; l'IA ne peut déclencher aucune action | ✅ |
| Clés d'API (IA optionnelle) | Saisies par l'utilisateur, gardées en `sessionStorage` (effacées à la fermeture) ; mémorisation interdite par défaut ; envoyées uniquement au fournisseur concerné | ✅ |
| IA hors UE | **Désactivée par défaut** (`config.js`) ; si l'administrateur l'active, confirmation explicite exigée à chaque usage | ✅ (corrigé) |
| Réglages de sécurité | Fixés par l'administrateur dans `config.js` ; non modifiables depuis l'interface | ✅ (corrigé) |
| Traçabilité | Journal local des actions (dépôt, analyse, corrections, exports, suppressions) | ✅ |
| Intégrité des données | Historique de chaque correction (ancien texte, date) | ✅ |
| Hébergement actuel (GitHub Pages) | Code distribué par GitHub (Microsoft, États-Unis) : **aucune donnée de réunion n'y transite**, mais l'adresse IP du visiteur est journalisée par GitHub | ⚠️ **Héberger en interne** (§ 7) |
| **Adresse partagée avec d'autres applications** | Sur `williamlestoilleagri-creator.github.io`, toutes les pages du dépôt (ERP, assistant, calculette…) partagent la **même origine web**. Le navigateur leur donne donc accès au même stockage local : une faille dans l'une d'elles exposerait les réunions en cours | ❌ **Risque élevé dans l'hébergement actuel.** Supprimé par un hébergement sur une adresse **dédiée** à l'application (§ 8) |

---

## 5. Conformité RGPD

### 5.1 Qualification du traitement

| Élément | Analyse |
|---|---|
| **Responsable de traitement** | L'administration qui met l'application à disposition de ses agents (pas l'éditeur du code) |
| **Finalité** | Aide à la rédaction des comptes rendus de réunions de service |
| **Base légale** | Exécution d'une mission d'intérêt public (art. 6-1-e RGPD) |
| **Personnes concernées** | Participants aux réunions enregistrées |
| **Données** | Voix, propos tenus, noms et fonctions saisis par l'agent. Le cas échéant, données sensibles évoquées en réunion (§ 1.2) |
| **Destinataires** | L'agent rédacteur uniquement. Les destinataires du compte rendu final relèvent de la diffusion habituelle du service |
| **Sous-traitants** | **Aucun** en configuration « tout interne ». Si l'IA Mistral est autorisée : Mistral AI devient sous-traitant (contrat ou DPA à vérifier par le DPO) |
| **Transferts hors UE** | **Aucun** dans la configuration recommandée. Claude (États-Unis) est désactivé par défaut |

### 5.2 Voix et biométrie

La séparation des voix calcule des **empreintes vocales**, de manière temporaire, en mémoire, uniquement pour distinguer les voix **à l'intérieur d'un même enregistrement**.
- **Aucune empreinte n'est enregistrée** (vérifiable : le stockage ne contient que des textes et l'audio d'origine).
- **Aucune comparaison n'est faite avec une base de voix** : l'application ne « reconnaît » personne.
- Le nom des interlocuteurs est **saisi manuellement** par l'agent, après écoute.

Ce fonctionnement vise à **ne pas constituer un traitement de données biométriques à des fins d'identification** (art. 9 RGPD). La qualification définitive revient au DPO dans l'AIPD.

### 5.3 Principes

| Principe | Mise en œuvre |
|---|---|
| Minimisation | Ni compte, ni identifiant, ni adresse électronique. Aucune donnée collectée par l'éditeur. Pas de conservation des empreintes vocales. Les images des vidéos ne sont jamais traitées ni conservées : seule une copie légère du son l'est, pendant la session |
| Limitation de la conservation | Mode éphémère par défaut. Sinon, purge automatique configurable (audio 30 jours, réunion 365 jours) |
| Exactitude | Contrôle de cohérence, corrections, historique des modifications |
| Sécurité | § 4 ; aucune donnée hors du poste |
| Transparence | Attestation obligatoire d'information des participants avant tout dépôt ; page « Données personnelles » dans l'application ; modèle de mention (annexe A) |
| Droits des personnes | Accès, rectification, effacement : par l'agent qui détient la réunion (correction du texte, suppression de la réunion ou de l'audio, « Tout effacer ») |
| Protection dès la conception | Traitement local, aucune donnée par défaut hors du poste, IA optionnelle et encadrée |

### 5.4 Analyse d'impact (AIPD)

**Recommandée.** Le traitement combine un usage innovant (intelligence artificielle) et des données parfois sensibles selon les réunions. Les éléments des sections 2 à 5 alimentent directement l'outil **PIA de la CNIL**.

### 5.5 Registre des traitements

Une fiche prête à reporter figure en annexe B.

### 5.6 Poste de travail

L'application hérite de la sécurité du poste :
- session nominative ;
- verrouillage automatique ;
- disque chiffré ;
- navigateur à jour (Chrome, Edge ou Firefox récents).

---

## 6. Risques résiduels

| Risque | Vraisemblance | Mesures | Niveau résiduel |
|---|---|---|---|
| Accès aux réunions par une autre personne utilisant la même session du poste | Faible | Mode éphémère, verrouillage de session, chiffrement du disque | Faible |
| Oubli de télécharger le compte rendu avant de fermer (perte de travail) | Moyenne | Avertissement du navigateur avant fermeture, rappel sur l'accueil | Faible (désagrément, pas de fuite) |
| Envoi de texte sensible à une IA externe | Faible | IA optionnelle, hors UE désactivée, `iaAutorisees: []` possible | Nul si l'IA est désactivée |
| Fichiers exportés diffusés au-delà du nécessaire | Moyenne | Règles habituelles de gestion documentaire du service | Comme pour tout document |
| Compromission de la chaîne d'approvisionnement (bibliothèques) | Très faible | Bibliothèques embarquées et figées, aucun CDN, CSP | Très faible |
| Erreur de transcription reprise dans un compte rendu | Moyenne | Code couleur, analyse de cohérence, relecture humaine obligatoire | Faible |
| Exposition de l'adresse IP à GitHub ou Hugging Face | Certaine dans l'hébergement actuel | Hébergement interne + `sourceModeles: "local"` | **Nul** une fois corrigé |
| Lecture du stockage local par une autre page hébergée à la même adresse | Faible, mais impact élevé | Hébergement sur une adresse (sous-domaine) dédiée à l'application | **Élevé** sur github.io, **nul** sur adresse dédiée |

---

## 7. Corrections apportées lors de ce diagnostic

| Non-conformité constatée | Correction |
|---|---|
| Données conservées 30 jours (audio) et 365 jours (réunions) sur le poste | **Mode éphémère par défaut** : effacement automatique à la fermeture du navigateur ; bouton « Tout effacer maintenant » ; avertissement avant fermeture |
| Modèles téléchargés depuis un site américain ; le réglage « miroir interne » était bloqué par la CSP et ne fonctionnait pas | **Modèles hébergeables avec l'application** (`sourceModeles: "local"`, script `outils/telecharger-modeles.py`) : **zéro connexion externe**, prouvée (§ 3.1) |
| IA hors UE (Claude) disponible par défaut | **Désactivée par défaut** ; liste des IA autorisées fixée par l'administrateur |
| Clés d'API mémorisables durablement sur le poste | Mémorisation **interdite par défaut** (session uniquement) |
| Réglages de sécurité modifiables par l'utilisateur | Fichier de **configuration de déploiement** `config.js`, réservé à l'administrateur |
| Mode « modèles locaux » inopérant : la transcription échouait (défaut de la bibliothèque transformers.js avec un chemin donné sous forme d'adresse complète) | Chemin corrigé ; fonctionnement **vérifié sans Internet** (§ 3.1) |
| Démarrage : une réunion déposée pendant le contrôle des onglets (0,4 s) pouvait être effacée par le mode éphémère | L'interface attend la fin du nettoyage avant de s'afficher ; vérifié |
| Page intégrable dans un cadre d'un autre site | Affichage dans un cadre **refusé** ; en-têtes serveur fournis (`deploiement/nginx.conf`) |
| Hébergement sur GitHub Pages, à une adresse partagée avec d'autres applications | Configuration d'**hébergement interne sur une adresse dédiée** fournie. **Non corrigeable dans le code** : c'est une décision d'hébergement. **Ne pas utiliser l'adresse github.io pour de vraies réunions** |

---

## 8. Check-list de mise en service interne

**DSI / administrateur**
- [ ] Copier le dossier `navigateur/` sur un serveur web **interne**, à une **adresse dédiée** (exemple : `compte-rendu.intranet…`, configuration `deploiement/nginx.conf`). Aucune autre application ne doit être servie à la même adresse.
- [ ] Lancer `python3 outils/telecharger-modeles.py` puis régler `sourceModeles: "local"` dans `config.js`.
- [ ] Choisir les IA autorisées dans `config.js` : `[]` (aucune), `["ollama"]`, ou `["mistral", "ollama"]` après accord du DPO.
- [ ] Garder `conservation: "ephemere"` et `memoriserClesAutorise: false`.
- [ ] Relancer la preuve `outils/preuve-securite.js` sur le déploiement interne et joindre le résultat au dossier d'homologation.

**RSSI / autorité d'homologation**
- [ ] Vérifier la capture réseau et la CSP (§ 3 et 4).
- [ ] Prononcer l'homologation (démarche simplifiée proportionnée, application sans serveur de données).
- [ ] Fixer le niveau de sensibilité autorisé (§ 1.2). Par défaut, « non protégé » et données personnelles ordinaires.

**DPO / responsable de traitement**
- [ ] Inscrire le traitement au registre (annexe B).
- [ ] Réaliser l'AIPD (outil PIA de la CNIL) à partir des sections 2 à 6.
- [ ] Valider la mention d'information des participants (annexe A).
- [ ] Si Mistral est autorisé : vérifier le contrat ou DPA et la localisation des traitements.

**Utilisateurs**
- [ ] Informer les participants avant d'enregistrer (annexe A).
- [ ] Relire et corriger le compte rendu avant toute diffusion.
- [ ] Télécharger les documents avant de fermer le navigateur.
- [ ] Ne pas utiliser l'application pour des informations classifiées.

---

## Annexe A — Mention d'information des participants (modèle)

> « Cette réunion est enregistrée afin de faciliter la rédaction de son compte rendu. L'enregistrement est traité automatiquement sur le poste de [service], sans être transmis à un tiers, puis effacé. Le compte rendu sera relu par un agent avant diffusion. Responsable de traitement : [administration]. Base légale : mission d'intérêt public. Vous pouvez exercer vos droits d'accès, de rectification et d'opposition auprès de [contact] ou du délégué à la protection des données ([adresse DPO]), et introduire une réclamation auprès de la CNIL. Si vous ne souhaitez pas être enregistré, signalez-le avant le début de la réunion. »

## Annexe B — Fiche du registre des traitements (à compléter)

| Rubrique | Contenu |
|---|---|
| Nom du traitement | Aide à la rédaction des comptes rendus de réunion |
| Responsable / service | [administration / service] |
| Finalité | Transcrire les réunions de service, identifier les intervenants, contrôler la cohérence et rédiger le compte rendu |
| Base légale | Art. 6-1-e RGPD (mission d'intérêt public) |
| Catégories de personnes | Participants aux réunions |
| Catégories de données | Voix (traitement temporaire), propos, nom et fonction des intervenants |
| Données sensibles | Possibles selon l'objet de la réunion (voir AIPD) |
| Destinataires | Agent rédacteur ; destinataires habituels du compte rendu |
| Sous-traitants | Aucun (configuration interne) ; Mistral AI si l'IA optionnelle est autorisée |
| Transferts hors UE | Aucun |
| Durée de conservation | Session de travail (mode éphémère) ; compte rendu selon les règles d'archivage du service |
| Mesures de sécurité | Traitement local, aucune transmission, CSP, effacement automatique, poste sécurisé (voir diagnostic) |

## Annexe C — Relancer la preuve

```
cd compte-rendu/navigateur
python3 -m http.server 8099 --bind 127.0.0.1
node outils/preuve-securite.js http://127.0.0.1:8099/ ../exemples/reunion-test.mp3 local
```
