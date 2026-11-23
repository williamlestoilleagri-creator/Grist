"""Génère une fausse réunion de test (voix de synthèse Piper) avec des passages plus ou moins audibles.

Usage : python generer_reunion_test.py <dossier_des_voix_piper> <dossier_de_sortie>
Voix utilisées (https://huggingface.co/rhasspy/piper-voices) : fr_FR-siwis-medium, fr_FR-tom-medium,
fr_FR-upmc-medium (jessica), fr_FR-gilles-low.
"""
from __future__ import annotations

import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice

TAUX = 22050

# Interlocuteurs : (fichier de voix, identifiant de locuteur éventuel, nom dans le corrigé)
VOIX = {
    "L1": ("fr_FR-siwis-medium", None, "Claire Martin, directrice (animatrice)"),
    "L2": ("fr_FR-tom-medium", None, "Paul Durand, responsable financier"),
    "L3": ("fr_FR-upmc-medium", 0, "Sophie Bernard, cheffe de projet travaux"),
    "L4": ("fr_FR-gilles-low", None, "Marc Petit, représentant des parents d'élèves"),
}

# Niveaux d'audibilité
NIVEAUX = {
    "clair": "voix proche du micro, nette",
    "faible": "voix éloignée du micro (-14 dB, étouffée)",
    "tres_faible": "voix très éloignée (-24 dB, étouffée), à peine audible",
    "bruit": "voix normale couverte par un bruit (papiers, chaises)",
    "chevauchement": "deux personnes parlent en même temps",
}

# (locuteur, niveau, texte, incohérence attendue ou "")
SCENARIO = [
    ("L1", "clair", "Bonjour à tous, merci d'être présents. L'ordre du jour porte sur le budget deux mille vingt-sept du programme de rénovation des écoles.", ""),
    ("L2", "clair", "Merci. Pour rappel, l'enveloppe votée est de deux virgule quatre millions d'euros, dont huit cent mille euros déjà engagés.", ""),
    ("L3", "clair", "Sur les huit écoles prévues, cinq chantiers sont terminés et trois restent à lancer au printemps.", ""),
    ("L1", "clair", "Très bien. Quel est le calendrier pour les trois écoles restantes ?", ""),
    ("L3", "faible", "Les appels d'offres partent en janvier, pour un démarrage des travaux en avril et une fin avant la rentrée de septembre.", "Imprécision : fin avant la rentrée annoncée pour les trois écoles, alors que Jules-Ferry est décalée ensuite."),
    ("L2", "clair", "Attention, il nous reste donc un virgule neuf million d'euros, ce qui couvre largement les trois chantiers.", "Chiffre faux : 2,4 M€ - 0,8 M€ = 1,6 M€ et non 1,9 M€."),
    ("L4", "tres_faible", "Je voudrais signaler que l'école Jules-Ferry a des problèmes d'amiante, ce qui va décaler le chantier.", "Passage à peine audible : vérifier la transcription."),
    ("L3", "clair", "C'est exact, le diagnostic amiante est attendu pour fin février. Le chantier ne pourra démarrer qu'en juin.", ""),
    ("L1", "bruit", "Donc les trois chantiers démarreront tous en avril comme prévu, parfait.", "Contradiction avec l'intervention précédente (Jules-Ferry en juin). Passage couvert par un bruit."),
    ("L4", "faible", "Il faudrait aussi prévoir une réunion avec les parents d'élèves pour les informer du calendrier des travaux d'été.", ""),
    ("L2", "clair", "Concernant le coût par école, nous sommes à environ trois cent mille euros par chantier, donc neuf cent mille euros pour les trois.", ""),
    ("L3", "chevauchement", "Plutôt quatre cent mille pour Jules-Ferry, à cause du désamiantage.", "Chevauchement de voix : attribution à vérifier ; contredit l'estimation de 900 000 € (soit environ 1 M€)."),
    ("L2", "clair", "Même avec quatre cent mille euros, le total reste de neuf cent mille euros, nous sommes donc dans l'enveloppe.", "Calcul faux : 300 000 + 300 000 + 400 000 = 1 000 000 €."),
    ("L4", "tres_faible", "Et les sanitaires de l'école Pasteur, ils sont prévus dans le programme ?", "Passage à peine audible."),
    ("L1", "clair", "Bonne question. Sophie, pouvez-vous vérifier et nous répondre avant la prochaine réunion ?", ""),
    ("L3", "clair", "Oui, je vérifie et je vous envoie une note d'ici la fin du mois.", ""),
    ("L2", "faible", "Je propose de valider le lancement des appels d'offres en janvier et de faire un point budgétaire en mars.", ""),
    ("L1", "clair", "D'accord. Décision : lancement des appels d'offres en janvier. Paul prépare le point budgétaire pour février. Merci à tous.", "Contradiction : le point budgétaire était proposé pour mars."),
]

_voix_chargees: dict[str, PiperVoice] = {}


def synthetiser(dossier: Path, locuteur: str, texte: str) -> np.ndarray:
    fichier, speaker_id, _ = VOIX[locuteur]
    if fichier not in _voix_chargees:
        _voix_chargees[fichier] = PiperVoice.load(str(dossier / f"{fichier}.onnx"))
    voix = _voix_chargees[fichier]
    morceaux = []
    for bloc in voix.synthesize(texte, **({"syn_config": _config(speaker_id)} if speaker_id is not None else {})):
        audio = bloc.audio_float_array
        if bloc.sample_rate != TAUX:
            x = np.linspace(0, len(audio), int(len(audio) * TAUX / bloc.sample_rate), endpoint=False)
            audio = np.interp(x, np.arange(len(audio)), audio)
        morceaux.append(audio.astype(np.float32))
    return np.concatenate(morceaux)


def _config(speaker_id: int):
    from piper import SynthesisConfig

    return SynthesisConfig(speaker_id=speaker_id)


def etouffer(x: np.ndarray, force: int) -> np.ndarray:
    """Simule l'éloignement : filtre passe-bas (moyenne glissante) et léger écho de salle."""
    noyau = np.ones(force) / force
    y = np.convolve(x, noyau, mode="same")
    echo = np.zeros_like(y)
    d = int(0.045 * TAUX)
    echo[d:] = 0.35 * y[:-d]
    return y + echo


def bruit_rose(n: int, rng: np.random.Generator) -> np.ndarray:
    blanc = rng.standard_normal(n)
    spectre = np.fft.rfft(blanc)
    f = np.arange(len(spectre))
    f[0] = 1
    rose = np.fft.irfft(spectre / np.sqrt(f), n)
    return rose / np.max(np.abs(rose))


def bruit_papiers(n: int, rng: np.random.Generator) -> np.ndarray:
    """Froissements de papier et chaise : salves de bruit blanc."""
    y = np.zeros(n)
    t = 0
    while t < n:
        longueur = int(rng.uniform(0.08, 0.35) * TAUX)
        fin = min(n, t + longueur)
        y[t:fin] = rng.standard_normal(fin - t) * np.hanning(fin - t) * rng.uniform(0.5, 1.0)
        t = fin + int(rng.uniform(0.05, 0.3) * TAUX)
    return y


def db(v: float) -> float:
    return 10 ** (v / 20)


def main(dossier_voix: Path, sortie: Path) -> None:
    rng = np.random.default_rng(2026)
    sortie.mkdir(parents=True, exist_ok=True)
    pistes, corrige = [], []
    t = 1.0
    for i, (loc, niveau, texte, incoherence) in enumerate(SCENARIO, start=1):
        voix = synthetiser(dossier_voix, loc, texte)
        voix = voix / (np.max(np.abs(voix)) or 1) * 0.6
        if niveau == "faible":
            voix = etouffer(voix, 6) * db(-14)
        elif niveau == "tres_faible":
            voix = etouffer(voix, 10) * db(-24)
        debut = t
        if niveau == "chevauchement":
            debut = t - 1.6  # commence avant la fin de l'intervention précédente
        pistes.append((debut, voix))
        if niveau == "bruit":
            pistes.append((debut + 0.3, bruit_papiers(len(voix) - int(0.6 * TAUX), rng) * 0.22))
        fin = debut + len(voix) / TAUX
        corrige.append((i, loc, niveau, debut, fin, texte, incoherence))
        t = fin + rng.uniform(0.5, 1.1)
    duree = t + 1.0

    n = int(duree * TAUX)
    mix = bruit_rose(n, rng) * db(-46)  # ventilation / bruit de salle constant
    for debut, piste in pistes:
        a = int(debut * TAUX)
        b = min(n, a + len(piste))
        mix[a:b] += piste[: b - a]
    mix = np.clip(mix / max(1.0, np.max(np.abs(mix)) / 0.95), -1, 1)

    wav = sortie / "reunion-test.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAUX)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "96k", str(sortie / "reunion-test.mp3")], check=True)
    wav.unlink()

    hms = lambda s: f"{int(s) // 60:02d}:{int(s) % 60:02d}"
    lignes = [
        "# Corrigé de la réunion de test",
        "",
        f"Fichier : `reunion-test.mp3` — durée {hms(duree)} — 4 interlocuteurs, voix de synthèse.",
        "",
        "## Interlocuteurs",
        "",
        *[f"- **{code}** : {nom}" for code, (_, _, nom) in VOIX.items()],
        "",
        "## Niveaux d'audibilité utilisés",
        "",
        *[f"- **{k}** : {v}" for k, v in NIVEAUX.items()],
        "",
        "## Transcription de référence",
        "",
        "| # | Début | Interlocuteur | Audibilité | Texte exact | Incohérence attendue |",
        "|---|---|---|---|---|---|",
        *[f"| {i} | {hms(d)} | {loc} | {niv} | {txt} | {inc or '—'} |" for i, loc, niv, d, f, txt, inc in corrige],
        "",
        "## Ce que l'application devrait faire",
        "",
        "- Trouver **4 interlocuteurs**. Les passages très faibles et le chevauchement sont les plus difficiles à attribuer.",
        "- Signaler en orange/rouge : le reste de 1,9 M€ (au lieu de 1,6 M€), le démarrage « tous en avril » (contredit par juin),",
        "  le total de 900 000 € (au lieu de 1 M€) et le point budgétaire « février » (au lieu de mars).",
        "- Les passages à peine audibles peuvent être mal transcrits : c'est normal, ils doivent ressortir comme « à vérifier ».",
    ]
    (sortie / "reunion-test-corrige.md").write_text("\n".join(lignes), encoding="utf-8")
    print(f"Durée : {hms(duree)}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
