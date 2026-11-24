"""Export du compte rendu (Word .docx et Markdown)."""
from __future__ import annotations

import colorsys
import io
from datetime import datetime
from typing import Any

from .analyse import TYPES_INCOHERENCE, score_segment


def libelle_score(score: int | None) -> str:
    if score is None:
        return "Non analysé"
    if score >= 85:
        return "Cohérent"
    if score >= 60:
        return "À vérifier"
    if score >= 35:
        return "Douteux"
    return "Incohérent"


def couleur_score(score: int | None, clair: bool = False) -> str:
    """Dégradé continu 0 % rouge → orange → jaune → 100 % vert (même formule que l'interface)."""
    if score is None:
        return "EEEEEE" if clair else "929292"
    teinte = max(0, min(100, score)) * 1.2 / 360
    r, g, b = colorsys.hls_to_rgb(teinte, 0.92 if clair else 0.42, 0.85)
    return f"{round(r * 255):02X}{round(g * 255):02X}{round(b * 255):02X}"


def _hms(s: float) -> str:
    s = int(s or 0)
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"


def _nom(reunion: dict[str, Any], code: str) -> str:
    return ((reunion.get("locuteurs") or {}).get(code) or {}).get("nom") or code


def markdown(reunion: dict[str, Any]) -> str:
    cr = reunion.get("compte_rendu") or {}
    analyse = reunion.get("analyse") or {}
    l = [f"# Compte rendu — {reunion.get('titre') or 'Réunion'}", ""]
    if reunion.get("date_reunion"):
        l.append(f"**Date :** {reunion['date_reunion']}  ")
    l.append("**Participants :** " + ", ".join(
        v.get("nom") + (f" ({v['fonction']})" if v.get("fonction") else "") for v in (reunion.get("locuteurs") or {}).values()))
    if analyse:
        l.append(f"\n**Fiabilité globale :** {analyse.get('score_global')} % ({libelle_score(analyse.get('score_global'))}) — analyse par {analyse.get('fournisseur')}")
    l += ["", "## Synthèse", "", cr.get("resume", ""), ""]
    for p in cr.get("points", []):
        l += [f"### {p.get('titre')}", "", p.get("contenu", ""), ""]
    if cr.get("decisions"):
        l += ["## Décisions", ""] + [f"- {d}" for d in cr["decisions"]] + [""]
    if cr.get("actions"):
        l += ["## Actions", "", "| Action | Responsable | Échéance |", "|---|---|---|"]
        l += [f"| {a.get('action')} | {a.get('responsable')} | {a.get('echeance')} |" for a in cr["actions"]]
        l.append("")
    ouvertes = [(s, i) for s in reunion.get("segments", []) for i in s.get("incoherences", []) if i.get("statut") == "ouverte"]
    globales = [g for g in reunion.get("incoherences_globales", []) if g.get("statut") == "ouverte"]
    if ouvertes or globales:
        l += ["## Incohérences rapportées (non résolues)", ""]
        for g in globales:
            l.append(f"- **Entre interventions {', '.join(g.get('segments', []))}** (gravité {g.get('gravite')} %) : {g.get('description')}")
        for s, i in ouvertes:
            l.append(f"- **{_hms(s['debut'])} — {_nom(reunion, s['locuteur'])}** ({TYPES_INCOHERENCE.get(i['type'], i['type'])}) : {i['description']}")
        l.append("")
    l += ["## Annexe — transcription", ""]
    for s in reunion.get("segments", []):
        sc = score_segment(s)
        l.append(f"- `{_hms(s['debut'])}` **{_nom(reunion, s['locuteur'])}** [{sc if sc is not None else '–'} % · {libelle_score(sc)}] : {s['texte']}")
    l += ["", f"_Document généré le {datetime.now():%d/%m/%Y à %H:%M} avec assistance d'une IA ; relu et corrigé par un agent._"]
    return "\n".join(l)


def docx(reunion: dict[str, Any]) -> bytes:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Pt, RGBColor

    def ombrer(cellule, hexa: str) -> None:
        tc = cellule._tc.get_or_add_tcPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), hexa)
        tc.append(shd)

    cr = reunion.get("compte_rendu") or {}
    analyse = reunion.get("analyse") or {}
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Marianne"
    style.font.size = Pt(10.5)

    bloc = doc.add_paragraph()
    run = bloc.add_run("RÉPUBLIQUE\nFRANÇAISE")
    run.bold = True
    bloc.add_run("\nLiberté\nÉgalité\nFraternité").italic = True

    doc.add_heading(f"Compte rendu — {reunion.get('titre') or 'Réunion'}", 0)
    if reunion.get("date_reunion"):
        doc.add_paragraph(f"Date : {reunion['date_reunion']}")
    doc.add_paragraph("Participants : " + ", ".join(
        v.get("nom") + (f" ({v['fonction']})" if v.get("fonction") else "") for v in (reunion.get("locuteurs") or {}).values()))
    if analyse:
        sg = analyse.get("score_global")
        p = doc.add_paragraph()
        p.add_run("Fiabilité globale : ").bold = True
        r = p.add_run(f"{sg} % — {libelle_score(sg)}")
        r.bold = True
        r.font.color.rgb = RGBColor.from_string(couleur_score(sg))
        p.add_run(f" (analyse : {analyse.get('fournisseur')}, {analyse.get('modele')})")

    doc.add_heading("Synthèse", 1)
    doc.add_paragraph(cr.get("resume", ""))
    for pt in cr.get("points", []):
        doc.add_heading(pt.get("titre", ""), 2)
        doc.add_paragraph(pt.get("contenu", ""))
    if cr.get("decisions"):
        doc.add_heading("Décisions", 1)
        for d in cr["decisions"]:
            doc.add_paragraph(d, style="List Bullet")
    if cr.get("actions"):
        doc.add_heading("Actions", 1)
        t = doc.add_table(rows=1, cols=3)
        t.style = "Table Grid"
        for c, titre in zip(t.rows[0].cells, ("Action", "Responsable", "Échéance")):
            c.text = titre
        for a in cr["actions"]:
            cells = t.add_row().cells
            cells[0].text, cells[1].text, cells[2].text = a.get("action", ""), a.get("responsable", ""), a.get("echeance", "")

    ouvertes = [(s, i) for s in reunion.get("segments", []) for i in s.get("incoherences", []) if i.get("statut") == "ouverte"]
    globales = [g for g in reunion.get("incoherences_globales", []) if g.get("statut") == "ouverte"]
    if ouvertes or globales:
        doc.add_heading("Incohérences rapportées (non résolues)", 1)
        for g in globales:
            doc.add_paragraph(f"Entre les interventions {', '.join(g.get('segments', []))} (gravité {g.get('gravite')} %) : {g.get('description')}", style="List Bullet")
        for s, i in ouvertes:
            doc.add_paragraph(f"{_hms(s['debut'])} — {_nom(reunion, s['locuteur'])} ({TYPES_INCOHERENCE.get(i['type'], i['type'])}) : {i['description']}", style="List Bullet")

    doc.add_heading("Annexe — transcription", 1)
    t = doc.add_table(rows=1, cols=4)
    t.style = "Table Grid"
    for c, titre in zip(t.rows[0].cells, ("Heure", "Interlocuteur", "Propos", "Fiabilité")):
        c.text = titre
    for s in reunion.get("segments", []):
        sc = score_segment(s)
        cells = t.add_row().cells
        cells[0].text, cells[1].text, cells[2].text = _hms(s["debut"]), _nom(reunion, s["locuteur"]), s["texte"]
        cells[3].text = f"{sc if sc is not None else '–'} %\n{libelle_score(sc)}"
        ombrer(cells[3], couleur_score(sc, clair=True))
        cells[3].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph()
    doc.add_paragraph(f"Document généré le {datetime.now():%d/%m/%Y à %H:%M} avec l'assistance d'une IA ; relu et corrigé par un agent.").italic = True
    flux = io.BytesIO()
    doc.save(flux)
    return flux.getvalue()
