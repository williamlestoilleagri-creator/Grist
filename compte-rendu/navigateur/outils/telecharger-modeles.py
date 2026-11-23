#!/usr/bin/env python3
"""Télécharge les modèles dans navigateur/modeles/ pour un déploiement SANS connexion externe.

À lancer une fois sur le poste qui prépare le déploiement (accès à huggingface.co nécessaire),
puis copier le dossier « navigateur/ » complet (avec « modeles/ ») sur le serveur web interne,
et régler  sourceModeles: "local"  dans config.js.

Usage :
    python3 outils/telecharger-modeles.py                    # modèle « équilibré » (conseillé)
    python3 outils/telecharger-modeles.py rapide equilibre   # plusieurs niveaux
    python3 outils/telecharger-modeles.py --tous

Seule la bibliothèque standard de Python est utilisée.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

HF = "https://huggingface.co"
DOSSIER = Path(__file__).resolve().parents[1] / "modeles"

TRANSCRIPTION = {
    "rapide": "onnx-community/whisper-base_timestamped",
    "equilibre": "onnx-community/whisper-small_timestamped",
    "precis": "onnx-community/whisper-large-v3-turbo_timestamped",
}
VOIX = ["onnx-community/pyannote-segmentation-3.0", "onnx-community/wespeaker-voxceleb-resnet34-LM"]

# Fichiers ONNX réellement chargés par l'application (voir js/moteur-audio.js)
ONNX_WHISPER = {
    "onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx",  # processeur (q8)
    "onnx/encoder_model_fp16.onnx", "onnx/decoder_model_merged_q4.onnx",              # carte graphique
}
ONNX_VOIX = {"onnx/model.onnx"}


def fichiers_du_depot(depot: str) -> list[str]:
    with urllib.request.urlopen(f"{HF}/api/models/{depot}", timeout=60) as r:
        return [s["rfilename"] for s in json.load(r)["siblings"]]


def telecharger(depot: str, onnx_voulus: set[str]) -> None:
    for f in fichiers_du_depot(depot):
        racine_utile = "/" not in f and f.endswith((".json", ".txt"))
        if not (racine_utile or f in onnx_voulus or (f.endswith(".onnx_data") and f.replace("_data", "") in onnx_voulus)):
            continue
        cible = DOSSIER / depot / f
        if cible.exists() and cible.stat().st_size > 0:
            print(f"  déjà présent : {depot}/{f}")
            continue
        cible.parent.mkdir(parents=True, exist_ok=True)
        print(f"  téléchargement : {depot}/{f}")
        temporaire = cible.with_suffix(cible.suffix + ".part")
        with urllib.request.urlopen(f"{HF}/{depot}/resolve/main/{f}", timeout=600) as r, temporaire.open("wb") as sortie:
            while bloc := r.read(1 << 20):
                sortie.write(bloc)
        temporaire.rename(cible)


def main(args: list[str]) -> None:
    niveaux = list(TRANSCRIPTION) if "--tous" in args else [a for a in args if a in TRANSCRIPTION] or ["equilibre"]
    print(f"Dossier : {DOSSIER}")
    for depot in VOIX:
        print(f"Séparation des voix : {depot}")
        telecharger(depot, ONNX_VOIX)
    for n in niveaux:
        print(f"Transcription ({n}) : {TRANSCRIPTION[n]}")
        telecharger(TRANSCRIPTION[n], ONNX_WHISPER)
    taille = sum(f.stat().st_size for f in DOSSIER.rglob("*") if f.is_file())
    print(f"Terminé : {taille / 1e6:.0f} Mo. Réglez  sourceModeles: \"local\"  dans config.js.")


if __name__ == "__main__":
    main(sys.argv[1:])
