# Compte rendu de réunion

Application web (DSFR) qui, à partir de l'enregistrement d'une réunion prise avec **un micro unique** :

1. **transcrit** la parole (Whisper, exécuté sur le serveur) ;
2. **sépare et identifie les interlocuteurs** (diarisation pyannote, puis attribution des noms par l'agent après écoute d'un extrait) ;
3. **contrôle la cohérence** de chaque intervention avec le modèle d'IA choisi par **lien** (ex. `https://mistral.ai/fr/`, `https://claude.ai`) et rapporte les **incohérences** (contradictions, chiffres faux, erreurs de transcription probables, mauvaise attribution…) ;
4. permet de **corriger directement** : appliquer une correction proposée, modifier le texte, changer l'interlocuteur, marquer comme vérifié ;
5. rédige un **compte rendu** modifiable, exporté en Word (.docx) ou Markdown.

## Code couleur

Score de cohérence de 0 à 100 % sur un dégradé continu **vert (100 %) → jaune → orange → rouge (0 %)**,
toujours accompagné du pourcentage et d'un libellé (RGAA : la couleur n'est jamais seule porteuse d'information) :

| Score | Libellé |
|---|---|
| 85–100 % | Cohérent |
| 60–84 % | À vérifier |
| 35–59 % | Douteux |
| 0–34 % | Incohérent |

## Choix du modèle d'IA par lien

Le lien saisi sert seulement à **sélectionner un fournisseur référencé** ; il n'est jamais appelé tel quel (protection SSRF).

| Lien reconnu | Fournisseur | Variable de clé (serveur) | Hébergement |
|---|---|---|---|
| `mistral.ai`, `chat.mistral.ai`… | Mistral AI (`mistral-large-latest`) | `MISTRAL_API_KEY` | France / UE |
| `albert.api.etalab.gouv.fr`… | Albert (DINUM) | `ALBERT_API_KEY` | France — État |
| `claude.ai`, `anthropic.com`… | Claude (`claude-opus-5-5`) | `ANTHROPIC_API_KEY` | États-Unis : confirmation explicite exigée |
| `localhost`, `ollama.com` | Ollama local (si `CR_OLLAMA_ACTIF=1`) | — | Serveur interne |
| URL de `CR_URLS_IA_AUTORISEES` | API compatible OpenAI | `CR_CLE_PERSONNALISEE` | Déclaré par l'admin |

Les clés restent sur le serveur, jamais dans le navigateur. Seul le **texte** de la transcription est envoyé à l'IA, jamais l'audio.

## Installation

Prérequis : Python 3.10+, `ffmpeg`, idéalement un GPU NVIDIA (sinon la transcription est lente).

```bash
cd compte-rendu/backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
```

Essai sans modèle ni clé (données fictives) — sous Windows, double-cliquez simplement sur `lancer-demo.bat` ; sinon :

```bash
CR_DEMO=1 uvicorn app.main:app --port 8000
```

Production (exemple) :

```bash
export MISTRAL_API_KEY=...          # et/ou ALBERT_API_KEY, ANTHROPIC_API_KEY
export HF_TOKEN=...                 # 1er téléchargement du modèle pyannote uniquement
export CR_DATA_DIR=/var/lib/compte-rendu
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

À placer derrière un reverse proxy HTTPS avec authentification (ProConnect via oauth2-proxy, qui transmet l'identité dans `X-Forwarded-User`).
À défaut, `CR_JETON_ACCES` impose un jeton partagé minimal.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `CR_DATA_DIR` | `./donnees` | Base SQLite et fichiers audio |
| `CR_TAILLE_MAX_MO` | 500 | Taille maximale d'un enregistrement |
| `CR_RETENTION_AUDIO_JOURS` | 30 | Purge automatique de l'audio |
| `CR_RETENTION_REUNION_JOURS` | 365 | Purge automatique de la réunion |
| `CR_WHISPER_MODELE` | `large-v3` | Modèle de transcription |
| `CR_WHISPER_DEVICE` | `auto` | `cpu`, `cuda` ou `auto` |
| `CR_DIARISATION_MODELE` | `pyannote/speaker-diarization-3.1` | Séparation des voix |
| `CR_LIEN_IA_DEFAUT` | `https://mistral.ai/fr/` | IA proposée par défaut |
| `CR_URLS_IA_AUTORISEES` | — | Liste d'API compatibles OpenAI autorisées (séparées par des virgules) |
| `CR_OLLAMA_ACTIF` / `CR_OLLAMA_URL` | non / `http://localhost:11434/v1` | Modèle local |
| `MISTRAL_MODELE`, `ALBERT_MODELE`, `CLAUDE_MODELE`, `OLLAMA_MODELE` | — | Modèle par fournisseur |
| `CR_JETON_ACCES` | — | Jeton d'accès partagé |
| `CR_DEMO` | non | Mode démonstration |

## Architecture

```
compte-rendu/
├── backend/app/
│   ├── main.py           API FastAPI, en-têtes de sécurité, file de tâches (1 à la fois)
│   ├── transcription.py  ffmpeg → Whisper (mots horodatés) + pyannote → interventions par locuteur
│   ├── llm.py            Résolution lien → fournisseur, appels Mistral/Albert/Ollama (API OpenAI) et Claude (SDK Anthropic)
│   ├── analyse.py        Consignes, schémas JSON, découpage des longues réunions, scores
│   ├── export.py         Export .docx (Marianne, couleurs) et Markdown
│   ├── store.py          SQLite, journal d'audit, purge RGPD
│   └── demo.py           Données fictives
└── frontend/             HTML/CSS/JS sans dépendance, DSFR 1.15 embarqué (aucun CDN)
```

## Points de conformité déjà intégrés

- DSFR (en-tête, pied de page, composants, police Marianne), liens d'évitement, onglets accessibles au clavier, libellés sur tous les champs.
- Attestation d'information des participants obligatoire avant dépôt.
- Aucune empreinte vocale conservée ; noms saisis manuellement par réunion.
- Purge automatique, suppression manuelle de l'audio ou de la réunion, journal des actions.
- Historique de chaque correction (ancien texte, auteur, date).
- Consigne anti-injection dans les invites ; toutes les sorties de l'IA sont échappées côté interface.
- CSP stricte, `frame-ancestors 'none'`, `nosniff`, pas de cookie, pas de ressource externe.
