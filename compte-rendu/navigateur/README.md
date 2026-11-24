# Compte rendu de réunion — version navigateur (sans installation)

Même application que la version serveur, mais **tout s'exécute dans le navigateur** :
aucun Python, aucun serveur à installer. Il suffit d'ouvrir la page.

- **Fichiers acceptés** : audio ou vidéo (mp3, wav, m4a, mp4, mov, mkv, avi…), **sans limite de taille** — testé avec une vidéo de 4,46 Go. Seule la piste son est extraite (FFmpeg WebAssembly), en lisant le fichier par morceaux, sans le charger en mémoire ni le copier. Durée maximale : 10 h.
- **Transcription** : Whisper (versions horodatées mot à mot), exécuté sur le poste (carte graphique via WebGPU si disponible, sinon processeur).
- **Interlocuteurs** : segmentation pyannote 3.0 + empreinte vocale WeSpeaker + regroupement, même principe que pyannote 3.1.
  Les empreintes ne servent qu'au calcul et ne sont jamais enregistrées.
- **Contrôle de cohérence SANS IA** (automatique, aucune donnée envoyée) : règles exécutées sur le poste
  - calculs : un montant annoncé avec « donc », « reste », « total »… est recalculé à partir des montants cités avant
    (ex. « il reste 1,9 M€ » alors que 2,4 M€ − 800 000 € = 1,6 M€), avec la phrase corrigée proposée ;
  - dates : un même sujet associé à deux mois différents (ex. point budgétaire en mars puis en février) ;
  - mots absents du dictionnaire français (erreur de transcription probable), répétitions anormales ;
  - voix faible ou à peine audible (niveau sonore mesuré), personnes parlant en même temps.
  Un compte rendu de base (participants, sujets, extraits, décisions, actions) est établi sans IA.
- **IA en option** : pour analyser le sens des propos et rédiger le compte rendu, choisie par lien. Seul le **texte** lui est envoyé ;
  ses remarques s'ajoutent à celles de l'analyse locale.
- **Stockage** : réunions, audio et comptes rendus dans le navigateur (IndexedDB), avec purge automatique.
- **Onglet « Télécharger »** : trois documents — le **compte rendu** (texte seul), le **compte rendu avec vérification de cohérence**, la **transcription** — en Word (.docx), PDF (.pdf, police Marianne), OpenDocument (.odt), texte (.txt) ou Markdown (.md), générés sur le poste.

## Sécurité et RGPD

Diagnostic complet, preuves et check-list de mise en service : **[SECURITE-RGPD.md](SECURITE-RGPD.md)** (version PDF : `SECURITE-RGPD.pdf`).
Réglages de déploiement (conservation, IA autorisées, source des modèles) : **`config.js`**, réservé à l'administrateur.

## Utilisation

1. Ouvrir `index.html` via un serveur web (GitHub Pages, serveur interne…). Ouvrir le fichier directement depuis le disque (`file://`) ne fonctionne pas.
2. Déposer l'enregistrement, cocher l'information des participants, cliquer sur « Transcrire sur ce poste ».
   Au premier usage, les modèles sont téléchargés une fois (≈ 140 Mo en mode rapide, ≈ 350 Mo en équilibré), puis conservés par le navigateur.
3. L'analyse locale s'affiche aussitôt (couleurs, incohérences). Nommer les interlocuteurs, corriger, relancer l'analyse locale, exporter (.docx ou Markdown).
4. Facultatif : ouvrir « Aller plus loin avec une IA », choisir l'IA par son lien et saisir la clé d'API.

Mode démonstration (sans modèle ni clé) : ajouter `?demo` à l'adresse.

## IA disponibles depuis le navigateur

| Lien | Fournisseur | Clé | Hébergement |
|---|---|---|---|
| `https://mistral.ai/fr/` | Mistral AI | clé personnelle (console.mistral.ai) | France / UE |
| `https://claude.ai` | Claude (Anthropic) | clé personnelle (console.anthropic.com) | États-Unis : confirmation exigée |
| `http://localhost:11434` | Ollama sur le poste | aucune | Poste (aucun envoi) — lancer Ollama avec `OLLAMA_ORIGINS` autorisant le site |

**Albert (DINUM)** n'accepte pas les appels directs depuis un navigateur : utiliser la version serveur (`../backend`).

## Performances indicatives

| Poste | 1 h de réunion |
|---|---|
| Carte graphique récente (WebGPU, Chrome/Edge) | ≈ 5 à 15 min |
| Processeur seul | ≈ 30 min à 2 h selon le processeur (modèle « rapide » conseillé) |

L'onglet doit rester ouvert pendant le traitement.

## Tests réalisés

- Séparation des voix sur un enregistrement de test à 3 voix (5 prises de parole) : 3 voix trouvées, 97,8 % du temps de parole correctement attribué.
- Transcription française exacte sur un extrait de référence.
- Parcours complet dans Chromium (téléchargement des modèles, transcription, analyse, corrections, export Word) sans erreur.
- Réunion de test `../exemples/reunion-test.mp3` (2 min, 4 voix, passages faibles et bruités), **sans clé ni IA** :
  4 interlocuteurs trouvés ; 2 calculs faux et la contradiction de dates détectés avec la bonne correction ;
  voix faibles, chevauchement et mots mal transcrits signalés. La 4ᵉ erreur volontaire, couverte par un bruit, n'a pas été transcrite.
- À valider sur de vraies réunions en français de longue durée.

## Contenu

```
navigateur/
├── index.html            Page DSFR, politique de sécurité (CSP) limitée aux destinations nécessaires
├── js/
│   ├── app.js            Interface
│   ├── api-locale.js     Fonctions de l'application (équivalent local de l'API serveur)
│   ├── worker-audio.js   Calcul audio en arrière-plan
│   ├── moteur-audio.js   Séparation des voix + transcription
│   ├── analyse-locale.js Contrôle de cohérence sans IA (calculs, dates, dictionnaire, audibilité) et compte rendu de base
│   ├── ia.js             IA optionnelle : choix par lien, consignes, fusion avec l'analyse locale
│   ├── export.js         Export Word / Markdown
│   ├── stockage.js       IndexedDB, réglages, clés, purge
│   └── demo.js           Données fictives
├── vendor/               transformers.js 4.3.2, onnxruntime-web, SDK Anthropic, docx, jsPDF, polices Marianne (TTF), dictionnaire français (embarqués, aucun CDN)
└── dsfr/                 Système de design de l'État 1.15
```

Les modèles sont téléchargés depuis Hugging Face. Pour une administration souhaitant ne dépendre d'aucun site tiers,
une copie des modèles peut être hébergée en interne et déclarée dans **Réglages → Miroir interne des modèles**
(et ajoutée à la CSP de `index.html`).
