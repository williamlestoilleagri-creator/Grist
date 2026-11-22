"""Sélection du modèle d'IA à partir d'un lien (ex. https://mistral.ai/fr/ ou https://claude.ai).

Le lien saisi sert uniquement à *choisir* un fournisseur référencé : il n'est jamais
appelé tel quel. Seules les adresses d'API inscrites ici ou dans
CR_URLS_IA_AUTORISEES peuvent être contactées (protection contre la SSRF).
Les clés d'API sont lues côté serveur dans les variables d'environnement.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

from .config import settings


class ErreurIA(RuntimeError):
    pass


@dataclass(frozen=True)
class Fournisseur:
    code: str
    nom: str
    protocole: str  # "anthropic" | "openai" (API compatible OpenAI : Mistral, Albert, Ollama…)
    base_url: str
    modele: str
    cle_env: str | None
    hebergement: str
    hors_ue: bool
    domaines: tuple[str, ...]
    site: str

    @property
    def cle(self) -> str | None:
        return os.getenv(self.cle_env) if self.cle_env else None

    @property
    def configure(self) -> bool:
        return self.code in {"demo", "ollama"} or bool(self.cle)

    def public(self) -> dict[str, Any]:
        d = asdict(self)
        d.pop("cle_env")
        d["configure"] = self.configure
        d["cle_attendue"] = self.cle_env
        return d


def _catalogue() -> dict[str, Fournisseur]:
    f = {
        "mistral": Fournisseur(
            code="mistral", nom="Mistral AI", protocole="openai",
            base_url="https://api.mistral.ai/v1",
            modele=os.getenv("MISTRAL_MODELE", "mistral-large-latest"),
            cle_env="MISTRAL_API_KEY", hebergement="France / Union européenne", hors_ue=False,
            domaines=("mistral.ai", "chat.mistral.ai", "console.mistral.ai", "api.mistral.ai"),
            site="https://mistral.ai/fr/",
        ),
        "albert": Fournisseur(
            code="albert", nom="Albert (DINUM)", protocole="openai",
            base_url=os.getenv("ALBERT_URL", "https://albert.api.etalab.gouv.fr/v1"),
            modele=os.getenv("ALBERT_MODELE", "albert-large"),
            cle_env="ALBERT_API_KEY", hebergement="France - infrastructure de l'État", hors_ue=False,
            domaines=("albert.api.etalab.gouv.fr", "albert.etalab.gouv.fr", "etalab.gouv.fr", "albert.numerique.gouv.fr"),
            site="https://albert.sites.beta.gouv.fr/",
        ),
        "claude": Fournisseur(
            code="claude", nom="Claude (Anthropic)", protocole="anthropic",
            base_url="https://api.anthropic.com",
            modele=os.getenv("CLAUDE_MODELE", "claude-opus-5-5"),
            cle_env="ANTHROPIC_API_KEY", hebergement="États-Unis (hors UE)", hors_ue=True,
            domaines=("claude.ai", "claude.com", "anthropic.com", "api.anthropic.com", "console.anthropic.com"),
            site="https://claude.ai",
        ),
    }
    if settings.ollama_actif:
        f["ollama"] = Fournisseur(
            code="ollama", nom="Ollama (modèle local)", protocole="openai",
            base_url=settings.ollama_url, modele=os.getenv("OLLAMA_MODELE", "mistral-small3.2"),
            cle_env=None, hebergement="Serveur interne", hors_ue=False,
            domaines=("ollama.com", "ollama.ai", "localhost", "127.0.0.1"),
            site="https://ollama.com",
        )
    if settings.demo:
        f["demo"] = Fournisseur(
            code="demo", nom="Démonstration (sans IA)", protocole="demo", base_url="", modele="demo",
            cle_env=None, hebergement="Local", hors_ue=False, domaines=("demo",), site="demo",
        )
    return f


def catalogue_public() -> list[dict[str, Any]]:
    return [f.public() for f in _catalogue().values()]


def _hote(lien: str) -> str:
    lien = lien.strip()
    if not re.match(r"^[a-z]+://", lien, re.I):
        lien = "https://" + lien
    return (urlparse(lien).hostname or "").lower()


def resoudre(lien: str | None) -> Fournisseur:
    """Associe un lien saisi par l'utilisateur à un fournisseur référencé."""
    lien = (lien or settings.lien_ia_defaut).strip()
    if len(lien) > 300:
        raise ErreurIA("Lien trop long.")
    catalogue = _catalogue()
    mot = lien.lower()
    if mot in catalogue:
        return catalogue[mot]
    hote = _hote(lien)
    for fournisseur in catalogue.values():
        if any(hote == d or hote.endswith("." + d) for d in fournisseur.domaines):
            return fournisseur
    # API compatible OpenAI explicitement autorisée par l'administrateur
    for autorisee in settings.urls_ia_autorisees:
        if lien.rstrip("/").startswith(autorisee.rstrip("/")):
            return Fournisseur(
                code="personnalise", nom=f"API personnalisée ({_hote(autorisee)})", protocole="openai",
                base_url=autorisee.rstrip("/"), modele=os.getenv("CR_MODELE_PERSONNALISE", "default"),
                cle_env="CR_CLE_PERSONNALISEE", hebergement="Déclaré par l'administrateur", hors_ue=False,
                domaines=(_hote(autorisee),), site=autorisee,
            )
    noms = ", ".join(f.nom for f in catalogue.values())
    raise ErreurIA(f"Aucun modèle d'IA référencé pour « {hote or lien} ». Modèles disponibles : {noms}.")


def extraire_json(texte: str) -> Any:
    texte = texte.strip()
    texte = re.sub(r"^```(?:json)?\s*|\s*```$", "", texte)
    try:
        return json.loads(texte)
    except json.JSONDecodeError:
        debut, fin = texte.find("{"), texte.rfind("}")
        if debut >= 0 and fin > debut:
            return json.loads(texte[debut : fin + 1])
        raise ErreurIA("La réponse du modèle n'est pas un JSON exploitable.")


def appeler(f: Fournisseur, systeme: str, message: str, schema: dict[str, Any], modele: str | None = None) -> Any:
    """Appelle le modèle et renvoie l'objet JSON produit."""
    modele = modele or f.modele
    if not f.configure:
        raise ErreurIA(f"{f.nom} n'est pas configuré : l'administrateur doit définir la variable {f.cle_env} sur le serveur.")
    if f.protocole == "anthropic":
        return _appeler_claude(f, systeme, message, schema, modele)
    if f.protocole == "openai":
        return _appeler_openai(f, systeme, message, modele)
    raise ErreurIA("Protocole inconnu.")


def _appeler_claude(f: Fournisseur, systeme: str, message: str, schema: dict[str, Any], modele: str) -> Any:
    import anthropic

    client = anthropic.Anthropic(api_key=f.cle, timeout=settings.delai_ia_s)
    try:
        with client.beta.messages.stream(
            model=modele,
            max_tokens=64000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",  # repli automatique si le modèle décline la requête
            output_config={"effort": "high", "format": {"type": "json_schema", "schema": schema}},
            system=systeme,
            messages=[{"role": "user", "content": message}],
        ) as flux:
            reponse = flux.get_final_message()
    except anthropic.AuthenticationError as e:
        raise ErreurIA("Clé d'API Claude refusée.") from e
    except anthropic.RateLimitError as e:
        raise ErreurIA("Quota de l'API Claude atteint, réessayez plus tard.") from e
    except anthropic.APIStatusError as e:
        raise ErreurIA(f"Erreur de l'API Claude ({e.status_code}).") from e
    except anthropic.APIConnectionError as e:
        raise ErreurIA("Impossible de joindre l'API Claude.") from e
    if reponse.stop_reason == "refusal":
        raise ErreurIA("Le modèle a refusé de traiter ce contenu.")
    if reponse.stop_reason == "max_tokens":
        raise ErreurIA("Réponse du modèle tronquée (réunion trop longue).")
    texte = "".join(b.text for b in reponse.content if b.type == "text")
    return extraire_json(texte)


def _appeler_openai(f: Fournisseur, systeme: str, message: str, modele: str) -> Any:
    entetes = {"Content-Type": "application/json"}
    if f.cle:
        entetes["Authorization"] = f"Bearer {f.cle}"
    corps: dict[str, Any] = {
        "model": modele,
        "messages": [{"role": "system", "content": systeme}, {"role": "user", "content": message}],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }
    try:
        with httpx.Client(timeout=settings.delai_ia_s, follow_redirects=False) as client:
            r = client.post(f"{f.base_url}/chat/completions", headers=entetes, json=corps)
            if r.status_code == 400 and "response_format" in r.text:
                corps.pop("response_format")
                r = client.post(f"{f.base_url}/chat/completions", headers=entetes, json=corps)
    except httpx.HTTPError as e:
        raise ErreurIA(f"Impossible de joindre {f.nom}.") from e
    if r.status_code in (401, 403):
        raise ErreurIA(f"Clé d'API {f.nom} refusée.")
    if r.status_code == 429:
        raise ErreurIA(f"Quota {f.nom} atteint, réessayez plus tard.")
    if r.status_code >= 400:
        raise ErreurIA(f"Erreur de {f.nom} ({r.status_code}).")
    try:
        texte = r.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as e:
        raise ErreurIA(f"Réponse inattendue de {f.nom}.") from e
    return extraire_json(texte)
