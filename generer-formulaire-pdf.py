#!/usr/bin/env python3
"""Génère formulaire-rdv.pdf : formulaire PDF remplissable de demande de rendez-vous.

Champs créés (lus par widget-import-rdv.html) :
  nom, prenom, structure
  date_01 … date_NN   (format jj/mm/aaaa, calendrier dans Acrobat / Firefox)
  heure_01 … heure_NN (liste modifiable : 07h00 … 20h00)

Dépendances : pip install reportlab pypdf
Usage       : python3 generer-formulaire-pdf.py [sortie.pdf]
"""
import io
import sys

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, NameObject, TextStringObject, BooleanObject

OUT = sys.argv[1] if len(sys.argv) > 1 else "formulaire-rdv.pdf"

PRIMARY = HexColor("#000091")
PRIMARY_SOFT = HexColor("#E5E5FB")
ACCENT = HexColor("#C9184A")
INK = HexColor("#1B1B1E")
INK_SOFT = HexColor("#65656B")
BORDER = HexColor("#C9C7BE")
FIELD_BG = HexColor("#F5F4F0")

W, H = A4
M = 36  # marge

HOURS = [f"{h:02d}h{m:02d}" for h in range(7, 21) for m in (0, 30) if not (h == 20 and m == 30)]

# créneaux par page : (lignes par colonne)
ROWS_P1 = 19
ROWS_P2 = 28
TOTAL = 2 * ROWS_P1 + 2 * ROWS_P2

date_fields = []


def header(c, title, subtitle):
    c.setFillColor(PRIMARY)
    c.rect(0, H - 92, W, 92, stroke=0, fill=1)
    c.setFillColor(ACCENT)
    c.rect(0, H - 96, W, 4, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(M, H - 30, "PRISE DE RENDEZ-VOUS")
    c.setFont("Times-Bold", 26)
    c.drawString(M, H - 58, title)
    c.setFont("Helvetica", 9.5)
    c.drawString(M, H - 76, subtitle)
    # cercles décoratifs
    c.setStrokeColor(HexColor("#2B2BB0"))
    c.setLineWidth(14)
    c.circle(W - 40, H - 20, 46, stroke=1, fill=0)
    c.setLineWidth(6)
    c.circle(W - 110, H - 80, 18, stroke=1, fill=0)


def section(c, y, num, label, hint=None):
    c.setFillColor(PRIMARY)
    c.roundRect(M, y - 3, 22, 15, 3, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawCentredString(M + 11, y + 1, num)
    c.setFillColor(INK)
    c.setFont("Times-Bold", 15)
    c.drawString(M + 30, y, label)
    if hint:
        c.setFillColor(INK_SOFT)
        c.setFont("Helvetica", 8.5)
        c.drawString(M + 30, y - 14, hint)


def text_field(c, name, label, x, y, w, tooltip):
    c.setFillColor(INK_SOFT)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x, y + 26, label.upper())
    c.acroForm.textfield(
        name=name, tooltip=tooltip, x=x, y=y, width=w, height=22,
        borderColor=BORDER, fillColor=FIELD_BG, textColor=INK, borderWidth=1,
        fontName="Helvetica", fontSize=11, forceBorder=True,
    )


def calendar_icon(c, x, y):
    c.setStrokeColor(PRIMARY)
    c.setFillColor(white)
    c.setLineWidth(0.9)
    c.roundRect(x, y, 11, 10, 1.5, stroke=1, fill=1)
    c.setFillColor(PRIMARY)
    c.rect(x, y + 7, 11, 3, stroke=0, fill=1)
    c.setLineWidth(1.2)
    c.line(x + 3, y + 9, x + 3, y + 12)
    c.line(x + 8, y + 9, x + 8, y + 12)
    for i in range(3):
        for j in range(2):
            c.rect(x + 2 + i * 2.8, y + 1.8 + j * 2.6, 1.4, 1.4, stroke=0, fill=1)


def slot_column(c, x, y_top, first, rows):
    col_w = (W - 2 * M - 20) / 2
    c.setFillColor(INK_SOFT)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(x + 24, y_top + 4, "DATE  (cliquez sur le champ)")
    c.drawString(x + 24 + 128, y_top + 4, "HEURE")
    row_h = 25
    for r in range(rows):
        i = first + r
        y = y_top - 22 - r * row_h
        if r % 2 == 0:
            c.setFillColor(HexColor("#FAFAF7"))
            c.rect(x, y - 3, col_w, row_h - 1, stroke=0, fill=1)
        c.setFillColor(PRIMARY)
        c.setFont("Helvetica-Bold", 8)
        c.drawRightString(x + 17, y + 6, f"{i:02d}")
        calendar_icon(c, x + 24, y + 4)
        dname = f"date_{i:02d}"
        c.acroForm.textfield(
            name=dname, tooltip=f"Créneau {i} - date (jj/mm/aaaa)",
            x=x + 40, y=y, width=104, height=19,
            borderColor=BORDER, fillColor=white, textColor=INK, borderWidth=1,
            fontName="Helvetica", fontSize=10, forceBorder=True, maxlen=10,
        )
        date_fields.append(dname)
        c.acroForm.choice(
            name=f"heure_{i:02d}", tooltip=f"Créneau {i} - heure",
            value=" ", options=[" "] + HOURS, fieldFlags="combo edit",
            x=x + 152, y=y, width=col_w - 158, height=19,
            borderColor=BORDER, fillColor=white, textColor=INK, borderWidth=1,
            fontName="Helvetica", fontSize=10, forceBorder=True,
        )


def footer(c, page, pages):
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.6)
    c.line(M, 44, W - M, 44)
    c.setFillColor(INK_SOFT)
    c.setFont("Helvetica", 7.5)
    c.drawString(M, 32, "Enregistrez ce PDF une fois rempli, puis renvoyez-le tel quel par mail. "
                        "Il sera importé automatiquement dans Grist.")
    c.drawRightString(W - M, 32, f"{page} / {pages}")


def build_base():
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle("Demande de rendez-vous")
    c.setSubject("Formulaire de prise de rendez-vous")
    col_w = (W - 2 * M - 20) / 2

    # ---------------- Page 1 ----------------
    header(c, "Demande de rendez-vous",
           "Remplissez vos coordonnées puis indiquez autant de créneaux que vous le souhaitez.")

    y = H - 132
    section(c, y, "01", "Vous")
    y -= 52
    fw = (W - 2 * M - 24) / 3
    text_field(c, "nom", "Nom", M, y, fw, "Nom")
    text_field(c, "prenom", "Prénom", M + fw + 12, y, fw, "Prénom")
    text_field(c, "structure", "Structure", M + 2 * (fw + 12), y, fw, "Structure")

    y -= 46
    section(c, y, "02", "Vos disponibilités",
            "Cliquez sur une date pour ouvrir le calendrier, puis choisissez l'heure dans la liste "
            "(ou tapez-la, ex. 13h15).")

    # encadré conseil
    by = y - 50
    c.setFillColor(PRIMARY_SOFT)
    c.roundRect(M, by, W - 2 * M, 26, 6, stroke=0, fill=1)
    c.setFillColor(PRIMARY)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(M + 10, by + 10, "Astuce :")
    c.setFont("Helvetica", 8.5)
    c.drawString(M + 50, by + 10, f"{TOTAL} créneaux disponibles sur 2 pages. Besoin de plus ? "
                                  "Remplissez un second exemplaire du formulaire.")

    y_top = by - 22
    slot_column(c, M, y_top, 1, ROWS_P1)
    slot_column(c, M + col_w + 20, y_top, 1 + ROWS_P1, ROWS_P1)
    footer(c, 1, 2)
    c.showPage()

    # ---------------- Page 2 ----------------
    c.setFillColor(PRIMARY)
    c.rect(0, H - 50, W, 50, stroke=0, fill=1)
    c.setFillColor(ACCENT)
    c.rect(0, H - 53, W, 3, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("Times-Bold", 17)
    c.drawString(M, H - 32, "Créneaux supplémentaires")
    y_top = H - 84
    start = 2 * ROWS_P1 + 1
    slot_column(c, M, y_top, start, ROWS_P2)
    slot_column(c, M + col_w + 20, y_top, start + ROWS_P2, ROWS_P2)
    footer(c, 2, 2)
    c.showPage()
    c.save()
    return buf.getvalue()


def js(code):
    return DictionaryObject({
        NameObject("/S"): NameObject("/JavaScript"),
        NameObject("/JS"): TextStringObject(code),
    })


def add_date_behaviour(pdf_bytes):
    """Ajoute le format date Acrobat (=> sélecteur de calendrier) sur les champs date_XX."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()
    writer.append(reader)
    wanted = set(date_fields)
    for page in writer.pages:
        for annot in page.get("/Annots", []) or []:
            a = annot.get_object()
            if a.get("/T") in wanted:
                a[NameObject("/AA")] = DictionaryObject({
                    NameObject("/F"): js('AFDate_FormatEx("dd/mm/yyyy");'),
                    NameObject("/K"): js('AFDate_KeystrokeEx("dd/mm/yyyy");'),
                })
    writer._root_object["/AcroForm"][NameObject("/NeedAppearances")] = BooleanObject(True)
    writer.add_metadata({"/Title": "Demande de rendez-vous"})
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


if __name__ == "__main__":
    data = add_date_behaviour(build_base())
    with open(OUT, "wb") as f:
        f.write(data)
    print(f"{OUT} : {TOTAL} créneaux, {len(data) // 1024} Ko")
