"""Données fictives pour tester l'interface sans modèle audio ni clé d'IA (CR_DEMO=1)."""
from __future__ import annotations

from typing import Any

_SEGMENTS = [
    ("L1", "Bonjour à tous, merci d'être présents. L'ordre du jour porte sur le budget 2027 du programme de rénovation des écoles."),
    ("L2", "Merci. Pour rappel, l'enveloppe votée est de 2,4 millions d'euros, dont 800 000 euros déjà engagés."),
    ("L3", "Sur les huit écoles prévues, cinq chantiers sont terminés et trois restent à lancer au printemps."),
    ("L1", "Très bien. Quel est le calendrier pour les trois écoles restantes ?"),
    ("L3", "Les appels d'offres partent en janvier, pour un démarrage des travaux en avril et une fin avant la rentrée de septembre."),
    ("L2", "Attention, il nous reste donc 1,9 million d'euros, ce qui couvre largement les trois chantiers."),
    ("L4", "Je voudrais signaler que l'école Jules-Ferry a des problèmes d'amiante, ce qui va décaler le chantier."),
    ("L3", "C'est exact, le diagnostic amiante est attendu pour fin février. Le chantier ne pourra démarrer qu'en juin."),
    ("L1", "Donc les trois chantiers démarreront tous en avril comme prévu, parfait."),
    ("L4", "Il faudrait aussi prévoir la réunion des parents d'élèves pour les informer du calendrier des travaux du chaud."),
    ("L2", "Je propose de valider le lancement des appels d'offres et de faire un point budgétaire en mars."),
    ("L1", "D'accord. Décision : lancement des appels d'offres en janvier. Madame Laurent prépare le point budgétaire pour mars."),
]

_ANALYSE = {
    "s6": (40, [{"type": "chiffre_ou_date", "description": "2,4 M€ - 0,8 M€ engagés = 1,6 M€ restants, et non 1,9 M€.",
                  "suggestion": "Attention, il nous reste donc 1,6 million d'euros, ce qui couvre largement les trois chantiers."}]),
    "s9": (20, [{"type": "contradiction", "description": "Contredit l'intervention s8 : le chantier Jules-Ferry ne pourra démarrer qu'en juin.",
                  "suggestion": "Donc deux chantiers démarreront en avril et celui de Jules-Ferry en juin."}]),
    "s10": (72, [{"type": "transcription", "description": "« travaux du chaud » est probablement une erreur de transcription (« travaux d'été » ?).",
                   "suggestion": "Il faudrait aussi prévoir la réunion des parents d'élèves pour les informer du calendrier des travaux d'été."}]),
    "s5": (80, [{"type": "imprecision", "description": "Fin avant la rentrée annoncée pour les trois écoles, alors que Jules-Ferry est ensuite décalée (s8).",
                  "suggestion": ""}]),
}


def transcription_demo() -> dict[str, Any]:
    segments, t = [], 0.0
    for i, (loc, texte) in enumerate(_SEGMENTS, start=1):
        duree = max(4.0, len(texte) / 14)
        segments.append({"id": f"s{i}", "debut": t, "fin": t + duree, "locuteur": loc, "texte": texte,
                         "confiance_audio": 62 if i == 10 else 91})
        t += duree + 0.6
    locuteurs = {code: {"nom": f"Interlocuteur {code[1:]}", "fonction": ""} for code in ("L1", "L2", "L3", "L4")}
    return {"duree": t, "segments": segments, "locuteurs": locuteurs}


def analyse_demo(reunion: dict[str, Any]) -> dict[str, Any]:
    par_segment = {}
    for seg in reunion["segments"]:
        score, inc = _ANALYSE.get(seg["id"], (96, []))
        par_segment[seg["id"]] = {"score": score, "incoherences": inc}
    noms = {k: v.get("nom") for k, v in (reunion.get("locuteurs") or {}).items()}
    return {
        "par_segment": par_segment,
        "compte_rendu": {
            "resume": f"La réunion, animée par {noms.get('L1')}, a porté sur le budget 2027 du programme de rénovation des écoles. "
                      "Cinq chantiers sur huit sont achevés ; les trois restants seront lancés au printemps, dont celui de "
                      "l'école Jules-Ferry, décalé en raison d'un diagnostic amiante.",
            "points": [
                {"titre": "Situation budgétaire", "contenu": f"{noms.get('L2')} rappelle une enveloppe de 2,4 M€ dont 800 000 € engagés. "
                 "Le montant restant annoncé en séance (1,9 M€) est incohérent avec ces chiffres (1,6 M€).", "segments": ["s2", "s6"]},
                {"titre": "Avancement des chantiers", "contenu": f"{noms.get('L3')} indique que cinq chantiers sont terminés ; "
                 "les appels d'offres des trois restants partiront en janvier.", "segments": ["s3", "s5"]},
                {"titre": "École Jules-Ferry", "contenu": f"{noms.get('L4')} signale la présence d'amiante. Le diagnostic est attendu "
                 "fin février et le chantier ne pourra démarrer qu'en juin.", "segments": ["s7", "s8"]},
            ],
            "decisions": ["Lancement des appels d'offres en janvier."],
            "actions": [
                {"action": "Préparer un point budgétaire", "responsable": "Mme Laurent", "echeance": "Mars"},
                {"action": "Organiser une réunion d'information des parents d'élèves", "responsable": "Non désigné", "echeance": "Non précisée"},
            ],
        },
        "incoherences_globales": [
            {"description": "Le démarrage simultané des trois chantiers en avril (s9) est incompatible avec le décalage de Jules-Ferry à juin (s8).",
             "segments": ["s8", "s9"], "gravite": 80},
            {"description": "Montant restant : 1,9 M€ annoncé (s6) au lieu de 1,6 M€ d'après les chiffres de s2.",
             "segments": ["s2", "s6"], "gravite": 65},
        ],
    }
