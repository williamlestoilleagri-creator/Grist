"""Configuration de l'application, lue uniquement depuis les variables d'environnement.

Aucune clé d'API n'est jamais envoyée au navigateur : elles restent côté serveur.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _bool(nom: str, defaut: bool = False) -> bool:
    return os.getenv(nom, str(defaut)).strip().lower() in {"1", "true", "oui", "yes", "on"}


def _liste(nom: str) -> list[str]:
    return [x.strip() for x in os.getenv(nom, "").split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    # Stockage
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("CR_DATA_DIR", "./donnees")).resolve())
    taille_max_mo: int = int(os.getenv("CR_TAILLE_MAX_MO", "500"))
    # Durées de conservation (RGPD - minimisation)
    retention_audio_jours: int = int(os.getenv("CR_RETENTION_AUDIO_JOURS", "30"))
    retention_reunion_jours: int = int(os.getenv("CR_RETENTION_REUNION_JOURS", "365"))

    # Mode démonstration : pas de modèle audio ni d'IA, données fictives
    demo: bool = _bool("CR_DEMO")

    # Transcription (faster-whisper) et séparation des voix (pyannote)
    whisper_modele: str = os.getenv("CR_WHISPER_MODELE", "large-v3")
    whisper_device: str = os.getenv("CR_WHISPER_DEVICE", "auto")  # auto | cpu | cuda
    whisper_compute: str = os.getenv("CR_WHISPER_COMPUTE", "default")
    diarisation_modele: str = os.getenv("CR_DIARISATION_MODELE", "pyannote/speaker-diarization-3.1")
    hf_token: str | None = os.getenv("HF_TOKEN")  # uniquement pour le 1er téléchargement du modèle

    # Accès : jeton partagé minimal (à remplacer par ProConnect derrière un proxy)
    jeton_acces: str | None = os.getenv("CR_JETON_ACCES")
    # En-tête posé par le reverse proxy d'authentification (ex. oauth2-proxy + ProConnect)
    entete_utilisateur: str = os.getenv("CR_ENTETE_UTILISATEUR", "X-Forwarded-User")

    # IA : fournisseur par défaut et URL compatibles OpenAI autorisées (anti-SSRF)
    lien_ia_defaut: str = os.getenv("CR_LIEN_IA_DEFAUT", "https://mistral.ai/fr/")
    urls_ia_autorisees: list[str] = field(default_factory=lambda: _liste("CR_URLS_IA_AUTORISEES"))
    ollama_actif: bool = _bool("CR_OLLAMA_ACTIF")
    ollama_url: str = os.getenv("CR_OLLAMA_URL", "http://localhost:11434/v1")
    delai_ia_s: float = float(os.getenv("CR_DELAI_IA_S", "600"))

    @property
    def dossier_audio(self) -> Path:
        return self.data_dir / "audio"

    @property
    def base_sqlite(self) -> Path:
        return self.data_dir / "comptes-rendus.sqlite3"


settings = Settings()
