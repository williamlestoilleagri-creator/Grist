"""Transcription (faster-whisper) et séparation des voix / diarisation (pyannote).

Tout s'exécute localement sur le serveur : l'audio ne quitte jamais l'infrastructure.
Les empreintes vocales calculées par pyannote ne sont PAS conservées : seuls les
libellés anonymes (« Locuteur 1 »…) et les horodatages sont stockés.
"""
from __future__ import annotations

import logging
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable

from .config import settings

log = logging.getLogger(__name__)

Progression = Callable[[str], None]


def convertir_wav(source: Path) -> Path:
    """Convertit en WAV 16 kHz mono (format attendu par les deux modèles)."""
    cible = source.with_name("audio-16k.wav")
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg est requis sur le serveur pour lire les fichiers audio.")
    subprocess.run(
        ["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", str(source), "-ac", "1", "-ar", "16000", str(cible)],
        check=True,
        timeout=3600,
    )
    return cible


@lru_cache(maxsize=1)
def _whisper():
    from faster_whisper import WhisperModel  # import tardif : dépendance lourde

    return WhisperModel(settings.whisper_modele, device=settings.whisper_device, compute_type=settings.whisper_compute)


@lru_cache(maxsize=1)
def _pyannote():
    import torch
    from pyannote.audio import Pipeline

    try:
        pipeline = Pipeline.from_pretrained(settings.diarisation_modele, token=settings.hf_token)
    except TypeError:  # pyannote < 4
        pipeline = Pipeline.from_pretrained(settings.diarisation_modele, use_auth_token=settings.hf_token)
    if torch.cuda.is_available():
        pipeline.to(torch.device("cuda"))
    return pipeline


def _diariser(wav: Path, nb_locuteurs: int | None) -> list[tuple[float, float, str]]:
    options: dict[str, Any] = {}
    if nb_locuteurs:
        options["num_speakers"] = nb_locuteurs
    sortie = _pyannote()(str(wav), **options)
    annotation = getattr(sortie, "speaker_diarization", sortie)  # pyannote 4 renvoie un objet enveloppe
    return [(tour.start, tour.end, locuteur) for tour, _, locuteur in annotation.itertracks(yield_label=True)]


def _locuteur_pour(debut: float, fin: float, tours: list[tuple[float, float, str]]) -> str | None:
    meilleur, recouvrement_max = None, 0.0
    for t_debut, t_fin, locuteur in tours:
        recouvrement = min(fin, t_fin) - max(debut, t_debut)
        if recouvrement > recouvrement_max:
            meilleur, recouvrement_max = locuteur, recouvrement
    if meilleur is None:  # mot dans un silence de la diarisation : tour le plus proche
        milieu = (debut + fin) / 2
        proche = min(tours, key=lambda t: min(abs(milieu - t[0]), abs(milieu - t[1])), default=None)
        meilleur = proche[2] if proche else None
    return meilleur


def _regrouper(mots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Regroupe les mots consécutifs d'un même locuteur en interventions."""
    segments: list[dict[str, Any]] = []
    for mot in mots:
        courant = segments[-1] if segments else None
        nouveau = (
            courant is None
            or courant["locuteur"] != mot["locuteur"]
            or mot["debut"] - courant["fin"] > 2.0
            or (courant["texte"].rstrip().endswith((".", "?", "!")) and courant["fin"] - courant["debut"] > 30)
        )
        if nouveau:
            segments.append({"debut": mot["debut"], "fin": mot["fin"], "locuteur": mot["locuteur"], "texte": "", "_probas": []})
            courant = segments[-1]
        courant["texte"] += mot["texte"]
        courant["fin"] = mot["fin"]
        courant["_probas"].append(mot["proba"])
    for i, s in enumerate(segments, start=1):
        probas = s.pop("_probas")
        s["id"] = f"s{i}"
        s["texte"] = s["texte"].strip()
        s["confiance_audio"] = round(100 * sum(probas) / len(probas)) if probas else None
    return segments


def _libelles(segments: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Renomme SPEAKER_00… en L1, L2… dans l'ordre de première prise de parole."""
    correspondance: dict[str, str] = {}
    for s in segments:
        brut = s["locuteur"] or "INCONNU"
        if brut not in correspondance:
            correspondance[brut] = f"L{len(correspondance) + 1}"
        s["locuteur"] = correspondance[brut]
    return {
        code: {"nom": f"Interlocuteur {code[1:]}", "fonction": ""}
        for code in correspondance.values()
    }


def transcrire(source: Path, nb_locuteurs: int | None, progression: Progression) -> dict[str, Any]:
    if settings.demo:
        from .demo import transcription_demo

        progression("Mode démonstration : transcription fictive")
        return transcription_demo()

    progression("Conversion de l'audio")
    wav = convertir_wav(source)

    progression("Transcription de la parole (Whisper)")
    morceaux, info = _whisper().transcribe(str(wav), language="fr", word_timestamps=True, vad_filter=True)
    mots_bruts = []
    for morceau in morceaux:
        for mot in morceau.words or []:
            mots_bruts.append({"debut": mot.start, "fin": mot.end, "texte": mot.word, "proba": mot.probability})
        progression(f"Transcription : {int(morceau.end // 60)} min traitées sur {int(info.duration // 60)} min")

    progression("Identification des interlocuteurs (pyannote)")
    tours = _diariser(wav, nb_locuteurs)
    for mot in mots_bruts:
        mot["locuteur"] = _locuteur_pour(mot["debut"], mot["fin"], tours)

    segments = _regrouper(mots_bruts)
    locuteurs = _libelles(segments)
    wav.unlink(missing_ok=True)
    return {"duree": info.duration, "segments": segments, "locuteurs": locuteurs}
