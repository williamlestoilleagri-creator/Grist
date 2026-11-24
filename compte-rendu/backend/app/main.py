"""API du service « Compte rendu de réunion »."""
from __future__ import annotations

import hmac
import logging
import re
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import analyse, export, llm, store, transcription
from .config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("compte-rendu")

EXTENSIONS_AUDIO = {".mp3", ".wav", ".m4a", ".ogg", ".opus", ".webm", ".flac", ".aac", ".mp4", ".wma"}
ID_VALIDE = re.compile(r"^[0-9a-f]{32}$")
FRONTEND = Path(__file__).resolve().parents[2] / "frontend"

# Une seule tâche lourde à la fois (transcription ou analyse) pour ne pas saturer le serveur.
_file_taches = ThreadPoolExecutor(max_workers=1, thread_name_prefix="tache")

app = FastAPI(title="Compte rendu de réunion", docs_url=None, redoc_url=None, openapi_url=None)


# ---------------------------------------------------------------- sécurité
@app.middleware("http")
async def entetes_securite(request: Request, call_next):
    reponse = await call_next(request)
    reponse.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "font-src 'self'; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; "
        "form-action 'self'; frame-ancestors 'none'"
    )
    reponse.headers["X-Content-Type-Options"] = "nosniff"
    reponse.headers["Referrer-Policy"] = "no-referrer"
    reponse.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    reponse.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    if request.url.path.startswith("/api/"):
        reponse.headers["Cache-Control"] = "no-store"
    return reponse


def utilisateur(request: Request) -> str:
    if settings.jeton_acces:
        fourni = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not hmac.compare_digest(fourni.encode(), settings.jeton_acces.encode()):
            raise HTTPException(401, "Authentification requise.")
    return (request.headers.get(settings.entete_utilisateur) or "agent")[:120]


def _id(reunion_id: str) -> str:
    if not ID_VALIDE.match(reunion_id):
        raise HTTPException(404, "Réunion introuvable.")
    return reunion_id


def _charger(reunion_id: str) -> dict[str, Any]:
    d = store.lire(_id(reunion_id))
    if d is None:
        raise HTTPException(404, "Réunion introuvable.")
    return d


def _segment(d: dict[str, Any], sid: str) -> dict[str, Any]:
    for s in d.get("segments", []):
        if s["id"] == sid:
            return s
    raise HTTPException(404, "Intervention introuvable.")


@app.on_event("startup")
def demarrage() -> None:
    store.initialiser()
    # Les tâches interrompues par un redémarrage sont marquées en erreur
    for r in store.lister():
        if r["statut"] in {"en_attente", "transcription", "analyse"}:
            store.mettre_a_jour(r["id"], lambda d: d.update(statut="erreur", erreur="Traitement interrompu par un redémarrage du serveur."))
    log.info("Purge de démarrage : %s", store.purger())

    def purge_periodique():
        while True:
            time.sleep(6 * 3600)
            try:
                log.info("Purge : %s", store.purger())
            except Exception:  # noqa: BLE001
                log.exception("Échec de la purge")

    threading.Thread(target=purge_periodique, daemon=True).start()


# ---------------------------------------------------------------- configuration et IA
@app.get("/api/config")
def config(u: str = Depends(utilisateur)):
    return {
        "demo": settings.demo,
        "taille_max_mo": settings.taille_max_mo,
        "retention_audio_jours": settings.retention_audio_jours,
        "retention_reunion_jours": settings.retention_reunion_jours,
        "lien_ia_defaut": settings.lien_ia_defaut,
        "fournisseurs": llm.catalogue_public(),
        "types_incoherence": analyse.TYPES_INCOHERENCE,
        "utilisateur": u,
    }


class Lien(BaseModel):
    lien: str = Field(max_length=300)


@app.post("/api/ia/resoudre")
def resoudre_ia(corps: Lien, u: str = Depends(utilisateur)):
    try:
        return llm.resoudre(corps.lien).public()
    except llm.ErreurIA as e:
        raise HTTPException(422, str(e)) from e


# ---------------------------------------------------------------- réunions
@app.get("/api/reunions")
def lister(u: str = Depends(utilisateur)):
    return store.lister()


@app.post("/api/reunions", status_code=201)
async def creer(
    fichier: UploadFile = File(...),
    titre: str = Form("", max_length=200),
    date_reunion: str = Form("", max_length=20),
    nb_locuteurs: int | None = Form(None, ge=1, le=30),
    information_participants: bool = Form(False),
    u: str = Depends(utilisateur),
):
    if not information_participants:
        raise HTTPException(422, "Vous devez attester que les participants ont été informés de l'enregistrement.")
    extension = Path(fichier.filename or "").suffix.lower()
    if extension not in EXTENSIONS_AUDIO:
        raise HTTPException(415, "Format non pris en charge. Formats acceptés : " + ", ".join(sorted(EXTENSIONS_AUDIO)))

    reunion_id = store.nouvel_id()
    dossier = settings.dossier_audio / reunion_id
    dossier.mkdir(parents=True)
    cible = dossier / f"original{extension}"
    taille, limite = 0, settings.taille_max_mo * 1024 * 1024
    with cible.open("wb") as sortie:
        while bloc := await fichier.read(1024 * 1024):
            taille += len(bloc)
            if taille > limite:
                sortie.close()
                store.supprimer(reunion_id)
                raise HTTPException(413, f"Fichier trop volumineux (maximum {settings.taille_max_mo} Mo).")
            sortie.write(bloc)

    store.creer({
        "id": reunion_id,
        "titre": titre.strip() or (fichier.filename or "Réunion")[:200],
        "date_reunion": date_reunion.strip(),
        "nb_locuteurs": nb_locuteurs,
        "statut": "en_attente",
        "progression": "En file d'attente",
        "audio": cible.name,
        "audio_disponible": True,
        "cree_par": u,
        "segments": [],
        "locuteurs": {},
    })
    store.journaliser(u, reunion_id, "creation", f"{fichier.filename} ({taille // 1024} Ko)")
    _file_taches.submit(_tache_transcription, reunion_id)
    return {"id": reunion_id}


def _progression(reunion_id: str):
    def maj(texte: str) -> None:
        store.mettre_a_jour(reunion_id, lambda d: d.update(progression=texte))
    return maj


def _tache_transcription(reunion_id: str) -> None:
    try:
        d = store.lire(reunion_id)
        store.mettre_a_jour(reunion_id, lambda d: d.update(statut="transcription"))
        resultat = transcription.transcrire(settings.dossier_audio / reunion_id / d["audio"], d.get("nb_locuteurs"), _progression(reunion_id))

        def enregistrer(d):
            d.update(resultat)
            d.update(statut="transcrit", progression="Transcription terminée", erreur=None)
        store.mettre_a_jour(reunion_id, enregistrer)
        store.journaliser("systeme", reunion_id, "transcription", f"{len(resultat['segments'])} interventions")
    except Exception as e:  # noqa: BLE001
        log.exception("Échec de la transcription %s", reunion_id)
        store.mettre_a_jour(reunion_id, lambda d: d.update(statut="erreur", erreur=f"Échec de la transcription : {e}"[:500]))


@app.get("/api/reunions/{reunion_id}")
def lire(reunion_id: str, u: str = Depends(utilisateur)):
    d = _charger(reunion_id)
    d["journal"] = store.lire_journal(reunion_id)
    return d


@app.get("/api/reunions/{reunion_id}/audio")
def audio(reunion_id: str, u: str = Depends(utilisateur)):
    d = _charger(reunion_id)
    chemin = settings.dossier_audio / reunion_id / d.get("audio", "")
    if not d.get("audio_disponible") or not chemin.is_file():
        raise HTTPException(404, "Audio supprimé (durée de conservation dépassée).")
    return FileResponse(chemin, headers={"Content-Disposition": "inline"})


@app.delete("/api/reunions/{reunion_id}", status_code=204)
def supprimer(reunion_id: str, u: str = Depends(utilisateur)):
    _charger(reunion_id)
    store.supprimer(reunion_id)
    store.journaliser(u, reunion_id, "suppression")
    return Response(status_code=204)


@app.delete("/api/reunions/{reunion_id}/audio", status_code=204)
def supprimer_audio(reunion_id: str, u: str = Depends(utilisateur)):
    _charger(reunion_id)
    for f in (settings.dossier_audio / reunion_id).glob("*"):
        f.unlink(missing_ok=True)
    store.mettre_a_jour(reunion_id, lambda d: d.update(audio_disponible=False))
    store.journaliser(u, reunion_id, "suppression_audio")
    return Response(status_code=204)


class Entete(BaseModel):
    titre: str | None = Field(None, max_length=200)
    date_reunion: str | None = Field(None, max_length=20)


@app.patch("/api/reunions/{reunion_id}")
def modifier_entete(reunion_id: str, corps: Entete, u: str = Depends(utilisateur)):
    _charger(reunion_id)
    with store.modifier(reunion_id) as d:
        for k, v in corps.model_dump(exclude_none=True).items():
            d[k] = v.strip()
    return {"ok": True}


class Locuteur(BaseModel):
    nom: str = Field(min_length=1, max_length=120)
    fonction: str = Field("", max_length=200)


@app.put("/api/reunions/{reunion_id}/locuteurs/{code}")
def renommer_locuteur(reunion_id: str, code: str, corps: Locuteur, u: str = Depends(utilisateur)):
    _charger(reunion_id)
    with store.modifier(reunion_id) as d:
        if code not in d.get("locuteurs", {}):
            raise HTTPException(404, "Interlocuteur introuvable.")
        d["locuteurs"][code] = {"nom": corps.nom.strip(), "fonction": corps.fonction.strip()}
    store.journaliser(u, reunion_id, "renommage_locuteur", f"{code} → {corps.nom}")
    return {"ok": True}


@app.post("/api/reunions/{reunion_id}/locuteurs", status_code=201)
def ajouter_locuteur(reunion_id: str, corps: Locuteur, u: str = Depends(utilisateur)):
    _charger(reunion_id)
    with store.modifier(reunion_id) as d:
        n = 1
        while f"L{n}" in d["locuteurs"]:
            n += 1
        code = f"L{n}"
        d["locuteurs"][code] = {"nom": corps.nom.strip(), "fonction": corps.fonction.strip()}
    store.journaliser(u, reunion_id, "ajout_locuteur", f"{code} : {corps.nom}")
    return {"code": code}


class CorrectionSegment(BaseModel):
    texte: str | None = Field(None, max_length=20000)
    locuteur: str | None = Field(None, max_length=10)
    valide: bool | None = None


def _historiser(seg: dict[str, Any], champ: str, ancien: Any, nouveau: Any, u: str) -> None:
    seg.setdefault("historique", []).append({"champ": champ, "ancien": ancien, "nouveau": nouveau, "par": u, "le": time.time()})


@app.patch("/api/reunions/{reunion_id}/segments/{sid}")
def corriger_segment(reunion_id: str, sid: str, corps: CorrectionSegment, u: str = Depends(utilisateur)):
    _charger(reunion_id)
    with store.modifier(reunion_id) as d:
        seg = _segment(d, sid)
        if corps.texte is not None and corps.texte.strip() != seg["texte"]:
            _historiser(seg, "texte", seg["texte"], corps.texte.strip(), u)
            seg["texte"] = corps.texte.strip()
            seg["corrige"] = True
        if corps.locuteur is not None and corps.locuteur != seg["locuteur"]:
            if corps.locuteur not in d["locuteurs"]:
                raise HTTPException(422, "Interlocuteur inconnu.")
            _historiser(seg, "locuteur", seg["locuteur"], corps.locuteur, u)
            seg["locuteur"] = corps.locuteur
        if corps.valide is not None:
            seg["valide"] = corps.valide
            if corps.valide:
                for inc in seg.get("incoherences", []):
                    if inc["statut"] == "ouverte":
                        inc["statut"] = "resolue"
        analyse.recalculer_score(d)
        resultat = seg
    store.journaliser(u, reunion_id, "correction", f"{sid} : {corps.model_dump(exclude_none=True)}"[:500])
    return resultat


class ActionIncoherence(BaseModel):
    action: Literal["appliquer", "ignorer", "resolue", "rouvrir"]


@app.post("/api/reunions/{reunion_id}/segments/{sid}/incoherences/{index}")
def traiter_incoherence(reunion_id: str, sid: str, index: int, corps: ActionIncoherence, u: str = Depends(utilisateur)):
    _charger(reunion_id)
    with store.modifier(reunion_id) as d:
        seg = _segment(d, sid)
        incs = seg.get("incoherences", [])
        if not 0 <= index < len(incs):
            raise HTTPException(404, "Incohérence introuvable.")
        inc = incs[index]
        if corps.action == "appliquer":
            if not inc.get("suggestion"):
                raise HTTPException(422, "Aucune correction proposée pour cette incohérence.")
            _historiser(seg, "texte", seg["texte"], inc["suggestion"], u)
            seg["texte"] = inc["suggestion"]
            seg["corrige"] = True
            inc["statut"] = "corrigee"
        elif corps.action == "rouvrir":
            inc["statut"] = "ouverte"
        else:
            inc["statut"] = "ignoree" if corps.action == "ignorer" else "resolue"
        if all(i["statut"] != "ouverte" for i in incs) and seg.get("score") is not None:
            seg["valide"] = True
        elif corps.action == "rouvrir":
            seg["valide"] = False
        analyse.recalculer_score(d)
        resultat = seg
    store.journaliser(u, reunion_id, f"incoherence_{corps.action}", f"{sid}#{index}")
    return resultat


@app.post("/api/reunions/{reunion_id}/incoherences-globales/{index}")
def traiter_incoherence_globale(reunion_id: str, index: int, corps: ActionIncoherence, u: str = Depends(utilisateur)):
    _charger(reunion_id)
    with store.modifier(reunion_id) as d:
        g = d.get("incoherences_globales", [])
        if not 0 <= index < len(g):
            raise HTTPException(404, "Incohérence introuvable.")
        g[index]["statut"] = {"rouvrir": "ouverte", "ignorer": "ignoree"}.get(corps.action, "resolue")
    store.journaliser(u, reunion_id, f"incoherence_globale_{corps.action}", str(index))
    return {"ok": True}


class DemandeAnalyse(BaseModel):
    lien: str = Field(max_length=300)
    modele: str | None = Field(None, max_length=100, pattern=r"^[\w.:/@-]+$")
    accepte_hors_ue: bool = False


@app.post("/api/reunions/{reunion_id}/analyse", status_code=202)
def lancer_analyse(reunion_id: str, corps: DemandeAnalyse, u: str = Depends(utilisateur)):
    d = _charger(reunion_id)
    if d["statut"] in {"en_attente", "transcription", "analyse"}:
        raise HTTPException(409, "Un traitement est déjà en cours.")
    if not d.get("segments"):
        raise HTTPException(409, "La transcription n'est pas disponible.")
    try:
        f = llm.resoudre(corps.lien)
    except llm.ErreurIA as e:
        raise HTTPException(422, str(e)) from e
    if f.hors_ue and not corps.accepte_hors_ue:
        raise HTTPException(422, f"{f.nom} est hébergé hors de l'Union européenne : confirmation explicite requise.")
    if not f.configure:
        raise HTTPException(422, f"{f.nom} n'est pas configuré sur le serveur (variable {f.cle_env}).")
    store.mettre_a_jour(reunion_id, lambda d: d.update(statut="analyse", progression=f"Analyse par {f.nom} en file d'attente", erreur=None))
    store.journaliser(u, reunion_id, "analyse", f"{f.nom} / {corps.modele or f.modele}")
    _file_taches.submit(_tache_analyse, reunion_id, f, corps.modele)
    return {"fournisseur": f.public()}


def _tache_analyse(reunion_id: str, f: llm.Fournisseur, modele: str | None) -> None:
    try:
        d = store.lire(reunion_id)
        resultat = analyse.analyser(d, f, modele, _progression(reunion_id))

        def enregistrer(d):
            analyse.appliquer(d, resultat, f, modele)
            d.update(statut="analyse_terminee", progression="Analyse terminée")
        store.mettre_a_jour(reunion_id, enregistrer)
    except Exception as e:  # noqa: BLE001
        log.exception("Échec de l'analyse %s", reunion_id)
        message = str(e) if isinstance(e, llm.ErreurIA) else "Erreur inattendue pendant l'analyse."
        store.mettre_a_jour(reunion_id, lambda d: d.update(statut="transcrit" if not d.get("analyse") else "analyse_terminee",
                                                          erreur=message, progression=""))


class CompteRendu(BaseModel):
    resume: str = Field("", max_length=50000)
    points: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    decisions: list[str] = Field(default_factory=list, max_length=200)
    actions: list[dict[str, Any]] = Field(default_factory=list, max_length=200)


@app.put("/api/reunions/{reunion_id}/compte-rendu")
def modifier_cr(reunion_id: str, corps: CompteRendu, u: str = Depends(utilisateur)):
    _charger(reunion_id)

    def propre(obj: dict[str, Any], champs: tuple[str, ...]) -> dict[str, Any]:
        return {c: str(obj.get(c, ""))[:20000] if c != "segments" else [str(x)[:10] for x in obj.get(c, [])][:50] for c in champs}

    with store.modifier(reunion_id) as d:
        d["compte_rendu"] = {
            "resume": corps.resume,
            "points": [propre(p, ("titre", "contenu", "segments")) for p in corps.points],
            "decisions": [x[:5000] for x in corps.decisions],
            "actions": [propre(a, ("action", "responsable", "echeance")) for a in corps.actions],
        }
    store.journaliser(u, reunion_id, "edition_compte_rendu")
    return {"ok": True}


@app.get("/api/reunions/{reunion_id}/export")
def exporter(reunion_id: str, format: Literal["docx", "md"] = "docx", u: str = Depends(utilisateur)):
    d = _charger(reunion_id)
    nom = re.sub(r"[^\w-]+", "-", d.get("titre") or "compte-rendu").strip("-")[:80] or "compte-rendu"
    nom_ascii = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode() or "compte-rendu"
    store.journaliser(u, reunion_id, "export", format)

    def disposition(ext: str) -> dict[str, str]:
        return {"Content-Disposition": f'attachment; filename="{nom_ascii}.{ext}"; filename*=UTF-8\'\'{quote(nom)}.{ext}'}

    if format == "md":
        return Response(export.markdown(d), media_type="text/markdown; charset=utf-8", headers=disposition("md"))
    return Response(export.docx(d), media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    headers=disposition("docx"))


@app.exception_handler(Exception)
async def erreur_generique(request: Request, exc: Exception):
    log.exception("Erreur non gérée")
    return JSONResponse({"detail": "Erreur interne."}, status_code=500)


app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="interface")
