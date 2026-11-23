"""Stockage SQLite des réunions et du journal d'audit."""
from __future__ import annotations

import json
import shutil
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from typing import Any, Callable

from .config import settings

_verrou = threading.RLock()


def _connexion() -> sqlite3.Connection:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    cx = sqlite3.connect(settings.base_sqlite, timeout=30)
    cx.row_factory = sqlite3.Row
    return cx


def initialiser() -> None:
    settings.dossier_audio.mkdir(parents=True, exist_ok=True)
    with _connexion() as cx:
        cx.executescript(
            """
            CREATE TABLE IF NOT EXISTS reunions (
                id TEXT PRIMARY KEY,
                cree_le REAL NOT NULL,
                modifie_le REAL NOT NULL,
                donnees TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS journal (
                horodatage REAL NOT NULL,
                utilisateur TEXT,
                reunion_id TEXT,
                action TEXT NOT NULL,
                detail TEXT
            );
            """
        )


def nouvel_id() -> str:
    return uuid.uuid4().hex


def creer(donnees: dict[str, Any]) -> dict[str, Any]:
    maintenant = time.time()
    donnees.setdefault("id", nouvel_id())
    donnees["cree_le"] = maintenant
    donnees["modifie_le"] = maintenant
    with _verrou, _connexion() as cx:
        cx.execute(
            "INSERT INTO reunions(id, cree_le, modifie_le, donnees) VALUES (?,?,?,?)",
            (donnees["id"], maintenant, maintenant, json.dumps(donnees, ensure_ascii=False)),
        )
    return donnees


def lire(reunion_id: str) -> dict[str, Any] | None:
    with _connexion() as cx:
        ligne = cx.execute("SELECT donnees FROM reunions WHERE id=?", (reunion_id,)).fetchone()
    return json.loads(ligne["donnees"]) if ligne else None


def lister() -> list[dict[str, Any]]:
    with _connexion() as cx:
        lignes = cx.execute("SELECT donnees FROM reunions ORDER BY cree_le DESC").fetchall()
    resultat = []
    for ligne in lignes:
        d = json.loads(ligne["donnees"])
        resultat.append(
            {
                "id": d["id"],
                "titre": d.get("titre"),
                "date_reunion": d.get("date_reunion"),
                "cree_le": d.get("cree_le"),
                "statut": d.get("statut"),
                "score_global": (d.get("analyse") or {}).get("score_global"),
                "nb_locuteurs": len(d.get("locuteurs") or {}),
            }
        )
    return resultat


@contextmanager
def modifier(reunion_id: str):
    """Lecture-modification-écriture atomique (verrou global, suffisant pour un seul processus)."""
    with _verrou:
        d = lire(reunion_id)
        if d is None:
            raise KeyError(reunion_id)
        yield d
        d["modifie_le"] = time.time()
        with _connexion() as cx:
            cx.execute(
                "UPDATE reunions SET donnees=?, modifie_le=? WHERE id=?",
                (json.dumps(d, ensure_ascii=False), d["modifie_le"], reunion_id),
            )


def mettre_a_jour(reunion_id: str, fn: Callable[[dict[str, Any]], None]) -> None:
    with modifier(reunion_id) as d:
        fn(d)


def supprimer(reunion_id: str) -> None:
    with _verrou, _connexion() as cx:
        cx.execute("DELETE FROM reunions WHERE id=?", (reunion_id,))
    dossier = settings.dossier_audio / reunion_id
    if dossier.exists():
        shutil.rmtree(dossier, ignore_errors=True)


def journaliser(utilisateur: str | None, reunion_id: str | None, action: str, detail: str = "") -> None:
    with _connexion() as cx:
        cx.execute(
            "INSERT INTO journal(horodatage, utilisateur, reunion_id, action, detail) VALUES (?,?,?,?,?)",
            (time.time(), utilisateur, reunion_id, action, detail[:500]),
        )


def lire_journal(reunion_id: str) -> list[dict[str, Any]]:
    with _connexion() as cx:
        lignes = cx.execute(
            "SELECT horodatage, utilisateur, action, detail FROM journal WHERE reunion_id=? ORDER BY horodatage DESC LIMIT 200",
            (reunion_id,),
        ).fetchall()
    return [dict(l) for l in lignes]


def purger() -> dict[str, int]:
    """Applique les durées de conservation : audio puis réunions entières."""
    maintenant = time.time()
    limite_audio = maintenant - settings.retention_audio_jours * 86400
    limite_reunion = maintenant - settings.retention_reunion_jours * 86400
    nb_audio = nb_reunions = 0
    with _connexion() as cx:
        lignes = cx.execute("SELECT id, cree_le FROM reunions").fetchall()
    for ligne in lignes:
        if ligne["cree_le"] < limite_reunion:
            supprimer(ligne["id"])
            journaliser("systeme", ligne["id"], "purge_reunion")
            nb_reunions += 1
        elif ligne["cree_le"] < limite_audio:
            dossier = settings.dossier_audio / ligne["id"]
            if dossier.exists():
                shutil.rmtree(dossier, ignore_errors=True)
                mettre_a_jour(ligne["id"], lambda d: d.update(audio_disponible=False))
                journaliser("systeme", ligne["id"], "purge_audio")
                nb_audio += 1
    return {"audio": nb_audio, "reunions": nb_reunions}
