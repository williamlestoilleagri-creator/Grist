# Compte rendu de réunion — version navigateur (sans installation)

Même application que la version serveur, mais **tout s'exécute dans le navigateur** :
aucun Python, aucun serveur à installer. Il suffit d'ouvrir la page.

- **Transcription** : Whisper (versions horodatées mot à mot), exécuté sur le poste (carte graphique via WebGPU si disponible, sinon processeur).
- **Interlocuteurs** : segmentation pyannote 3.0 + empreinte vocale WeSpeaker + regroupement, même principe que pyannote 3.1.
  Les empreintes ne servent qu'au calcul et ne sont jamais enregistrées.
- **Cohérence et compte rendu** : IA choisie par lien. Seul le **texte** lui est envoyé.
- **Stockage** : réunions, audio et comptes rendus dans le navigateur (IndexedDB), avec purge automatique.

## Utilisation

1. Ouvrir `index.html` via un serveur web (GitHub Pages, serveur interne…). Ouvrir le fichier directement depuis le disque (`file://`) ne fonctionne pas.
2. Déposer l'enregistrement, cocher l'information des participants, cliquer sur « Transcrire sur ce poste ».
   Au premier usage, les modèles sont téléchargés une fois (≈ 140 Mo en mode rapide, ≈ 350 Mo en équilibré), puis conservés par le navigateur.
3. Nommer les interlocuteurs, choisir l'IA par son lien, saisir la clé d'API, analyser, corriger, exporter (.docx ou Markdown).

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
| Processeur seul | ≈ 30 à 60 min (modèle « rapide » conseillé) |

L'onglet doit rester ouvert pendant le traitement.

## Tests réalisés

- Séparation des voix sur un enregistrement de test à 3 voix (5 prises de parole) : 3 voix trouvées, 97,8 % du temps de parole correctement attribué.
- Transcription française exacte sur un extrait de référence.
- Parcours complet dans Chromium (téléchargement des modèles, transcription, analyse, corrections, export Word) sans erreur.
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
│   ├── ia.js             Choix de l'IA par lien, consignes, analyse de cohérence
│   ├── export.js         Export Word / Markdown
│   ├── stockage.js       IndexedDB, réglages, clés, purge
│   └── demo.js           Données fictives
├── vendor/               transformers.js 4.3.2, onnxruntime-web, SDK Anthropic, docx (embarqués, aucun CDN)
└── dsfr/                 Système de design de l'État 1.15
```

Les modèles sont téléchargés depuis Hugging Face. Pour une administration souhaitant ne dépendre d'aucun site tiers,
une copie des modèles peut être hébergée en interne et déclarée dans **Réglages → Miroir interne des modèles**
(et ajoutée à la CSP de `index.html`).
