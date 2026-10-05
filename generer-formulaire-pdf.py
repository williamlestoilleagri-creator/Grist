#!/usr/bin/env python3
"""Génère formulaire-rdv.pdf : formulaire PDF remplissable de demande de rendez-vous,
mis en forme selon le Système de Design de l'État (DSFR) : police Marianne, couleurs,
champs de saisie, indicateur d'étapes et mise en exergue.

Champs créés (lus par widget-import-rdv.html) :
  nom, prenom, structure
  date_01 … date_NN   (format jj/mm/aaaa, calendrier dans Acrobat)
  heure_01 … heure_NN (liste modifiable : 07h00 … 20h00)

Les lignes de créneaux apparaissent une à une (JavaScript Acrobat / Firefox) ;
les lecteurs sans JavaScript affichent toutes les lignes.

Dépendances : pip install reportlab pypdf
Polices     : fonts/Marianne-*.ttf (issues du paquet @gouvfr/dsfr)
Usage       : python3 generer-formulaire-pdf.py [sortie.pdf]
"""
import io
import os
import sys

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (ArrayObject, BooleanObject, DictionaryObject, NameObject,
                           NumberObject, TextStringObject)

OUT = sys.argv[1] if len(sys.argv) > 1 else "formulaire-rdv.pdf"

# ------------------------------------------------------------------
# Personnalisation
# ------------------------------------------------------------------
TITRE = "Demande de rendez-vous"
# Bloc-marque de l'État : réservé aux services de l'État. Laisser vide sinon.
# Exemple : ["Ministère", "de l'Agriculture", "et de la Souveraineté", "alimentaire"]
BLOC_MARQUE = []
# Nom du service affiché dans l'en-tête (facultatif)
SERVICE = ""

# ------------------------------------------------------------------
# Jetons DSFR
# ------------------------------------------------------------------
BLUE_FRANCE = HexColor("#000091")        # --blue-france-sun-113-625
BLUE_ECUME = HexColor("#6A6AF4")         # --border-default-blue-france (callout)
GREY_50 = HexColor("#161616")            # --text-title-grey
GREY_200 = HexColor("#3A3A3A")           # --border-plain-grey (soulignement des champs)
GREY_425 = HexColor("#666666")           # --text-mention-grey
GREY_900 = HexColor("#DDDDDD")           # --border-default-grey
GREY_950 = HexColor("#EEEEEE")           # --background-contrast-grey (fond des champs)

FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
for style in ("Regular", "Medium", "Bold", "Light"):
    pdfmetrics.registerFont(TTFont(f"Marianne-{style}", os.path.join(FONT_DIR, f"Marianne-{style}.ttf")))
F_REG, F_MED, F_BOLD = "Marianne-Regular", "Marianne-Medium", "Marianne-Bold"
# Les champs de formulaire PDF ne peuvent utiliser que les polices standard :
# Helvetica (équivalent d'Arial, police de repli officielle du DSFR).
F_FIELD, F_FIELD_BOLD = "Helvetica", "Helvetica-Bold"

W, H = A4
M = 40           # marge
GAP = 24         # espace entre colonnes de créneaux
ROW_H = 26
FIELD_H = 20

HOURS = [f"{h:02d}h{m:02d}" for h in range(7, 21) for m in (0, 30) if not (h == 20 and m == 30)]

date_fields = []
columns = []             # premier numéro de créneau de chaque colonne
label_fields_align = {}  # champs libellés à aligner (2 = droite)


# ------------------------------------------------------------------
# Composants
# ------------------------------------------------------------------
def header(c, compact=False):
    """En-tête façon fr-header : fond blanc, filet et ombre portée."""
    top = H - 28
    x = M
    base = top - 52
    if BLOC_MARQUE and not compact:
        c.setFillColor(GREY_50)
        c.setFont(F_BOLD, 10.5)
        c.drawString(x, top - 4, "RÉPUBLIQUE")
        c.drawString(x, top - 16, "FRANÇAISE")
        c.setFont("Helvetica-Oblique", 6.5)
        for k, word in enumerate(("Liberté", "Égalité", "Fraternité")):
            c.drawString(x, top - 27 - 8 * k, word)
        c.setFont(F_BOLD, 8)
        yy = top - 56
        for line in BLOC_MARQUE:
            c.drawString(x, yy, line.upper())
            yy -= 9.5
        x += 150
        c.setStrokeColor(GREY_900)
        c.setLineWidth(0.6)
        c.line(x - 18, top + 2, x - 18, yy + 6)
        base = min(base, yy - 4)

    if compact:
        c.setFillColor(GREY_50)
        c.setFont(F_BOLD, 14)
        c.drawString(M, top - 12, TITRE)
        c.setFillColor(GREY_425)
        c.setFont(F_REG, 9)
        c.drawRightString(W - M, top - 12, "Suite des créneaux")
        base = top - 30
    else:
        c.setFillColor(GREY_50)
        c.setFont(F_BOLD, 22)
        c.drawString(x, top - 20, TITRE)
        c.setFillColor(GREY_425)
        c.setFont(F_REG, 10)
        c.drawString(x, top - 36, SERVICE or "Formulaire de prise de rendez-vous")

    # filet bas d'en-tête + ombre légère (comme le fr-header)
    for i, col in enumerate(("#DDDDDD", "#EBEBEB", "#F4F4F4")):
        c.setStrokeColor(HexColor(col))
        c.setLineWidth(1)
        c.line(0, base - i, W, base - i)
    return base


def callout(c, y, title, text_lines):
    """Mise en exergue fr-callout : fond gris contrasté, barre bleue à gauche."""
    h = 30 + 13 * len(text_lines)
    c.setFillColor(GREY_950)
    c.rect(M, y - h, W - 2 * M, h, stroke=0, fill=1)
    c.setFillColor(BLUE_ECUME)
    c.rect(M, y - h, 4, h, stroke=0, fill=1)
    c.setFillColor(GREY_50)
    c.setFont(F_BOLD, 11)
    c.drawString(M + 18, y - 19, title)
    c.setFont(F_REG, 9)
    yy = y - 34
    for line in text_lines:
        c.drawString(M + 18, yy, line)
        yy -= 13
    return y - h


def stepper(c, y, step, total, title, next_title=None):
    """Indicateur d'étapes fr-stepper."""
    c.setFillColor(GREY_425)
    c.setFont(F_REG, 9)
    c.drawString(M, y, f"Étape {step} sur {total}")
    c.setFillColor(GREY_50)
    c.setFont(F_BOLD, 15)
    c.drawString(M, y - 19, title)
    bar_y = y - 32
    seg = (W - 2 * M - 6 * (total - 1)) / total
    for i in range(total):
        c.setFillColor(BLUE_FRANCE if i < step else GREY_950)
        c.rect(M + i * (seg + 6), bar_y, seg, 6, stroke=0, fill=1)
    if next_title:
        c.setFillColor(GREY_425)
        c.setFont(F_BOLD, 8)
        c.drawString(M, bar_y - 13, "Étape suivante :")
        c.setFont(F_REG, 8)
        c.drawString(M + pdfmetrics.stringWidth("Étape suivante : ", F_BOLD, 8), bar_y - 13, next_title)
        return bar_y - 13
    return bar_y


def dsfr_field_kwargs(size=10.5):
    """Champ fr-input : fond gris, soulignement gris foncé de 2 pt."""
    return dict(
        fillColor=GREY_950, borderColor=GREY_200, borderWidth=2, borderStyle="underlined",
        textColor=GREY_50, fontName=F_FIELD, fontSize=size,
    )


def input_group(c, name, label, hint, x, y, w):
    c.setFillColor(GREY_50)
    c.setFont(F_REG, 10)
    c.drawString(x, y + FIELD_H + 20, label)
    c.setFillColor(GREY_425)
    c.setFont(F_REG, 7.5)
    c.drawString(x, y + FIELD_H + 8, hint)
    c.acroForm.textfield(name=name, tooltip=label, x=x, y=y, width=w, height=FIELD_H + 2,
                         **dsfr_field_kwargs(11))


def label_field(c, name, value, x, y, w, h, size, color, bold=False, align=0):
    """Texte sous forme de champ en lecture seule, pour pouvoir le masquer / l'afficher."""
    c.acroForm.textfield(
        name=name, value=value, x=x, y=y, width=w, height=h,
        borderWidth=0, borderColor=white, fillColor=white, textColor=color,
        fontName=F_FIELD_BOLD if bold else F_FIELD, fontSize=size, fieldFlags="readOnly",
    )
    if align:
        label_fields_align[name] = align


def slot_column(c, x, y_top, first, rows):
    col_w = (W - 2 * M - GAP) / 2
    date_x, date_w = x + 30, 112
    hour_x = date_x + date_w + 10
    hour_w = col_w - (hour_x - x)
    columns.append(first)
    label_field(c, f"entete_d_{first:02d}", "Date (jj/mm/aaaa)", date_x - 2, y_top - 2, date_w + 4, 12, 8, GREY_425)
    label_field(c, f"entete_h_{first:02d}", "Heure", hour_x - 2, y_top - 2, hour_w, 12, 8, GREY_425)
    for r in range(rows):
        i = first + r
        y = y_top - 24 - r * ROW_H
        label_field(c, f"num_{i:02d}", f"{i:02d}", x, y + 1, 26, FIELD_H - 2, 9, BLUE_FRANCE, bold=True, align=2)
        dname = f"date_{i:02d}"
        c.acroForm.textfield(
            name=dname, tooltip=f"Créneau {i} - date (jj/mm/aaaa)",
            x=date_x, y=y, width=date_w, height=FIELD_H, maxlen=10, **dsfr_field_kwargs(),
        )
        date_fields.append(dname)
        c.acroForm.choice(
            name=f"heure_{i:02d}", tooltip=f"Créneau {i} - heure",
            value=" ", options=[" "] + HOURS, fieldFlags="combo edit",
            x=hour_x, y=y, width=hour_w, height=FIELD_H, **dsfr_field_kwargs(),
        )


def rows_fitting(y_top, y_min):
    return int((y_top - 24 - y_min) // ROW_H) + 1


def footer(c, page, pages):
    c.setStrokeColor(BLUE_FRANCE)
    c.setLineWidth(2)
    c.line(M, 52, W - M, 52)
    c.setFillColor(GREY_425)
    c.setFont(F_REG, 7.5)
    c.drawString(M, 38, "Enregistrez ce PDF une fois rempli, puis renvoyez-le tel quel par courriel.")
    c.drawString(M, 28, "Vos réponses seront importées automatiquement.")
    c.setFont(F_MED, 7.5)
    c.drawRightString(W - M, 38, f"Page {page} sur {pages}")


# ------------------------------------------------------------------
# Document
# ------------------------------------------------------------------
TOTAL = 0


def build_base():
    global TOTAL
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(TITRE)
    c.setSubject("Formulaire de prise de rendez-vous")
    col_w = (W - 2 * M - GAP) / 2
    y_min = 72

    # ---------------- Page 1 ----------------
    y = header(c) - 22
    y = callout(c, y, "Comment remplir ce formulaire ?", [
        "1. Indiquez vos coordonnées.",
        "2. Cliquez sur une date pour ouvrir le calendrier, puis choisissez l'heure dans la liste (ou tapez-la, ex. 13h15).",
        "     Une nouvelle ligne apparaît dès que vous remplissez la précédente.",
        "3. Enregistrez le PDF et renvoyez-le par courriel.",
    ]) - 26

    y = stepper(c, y, 1, 2, "Vos coordonnées", "Vos disponibilités") - 22
    fw = (W - 2 * M - 2 * 16) / 3
    fy = y - FIELD_H - 26
    input_group(c, "nom", "Nom", "Votre nom de famille", M, fy, fw)
    input_group(c, "prenom", "Prénom", "Votre prénom", M + fw + 16, fy, fw)
    input_group(c, "structure", "Structure", "Organisme, entreprise, association…", M + 2 * (fw + 16), fy, fw)

    y = fy - 30
    y = stepper(c, y, 2, 2, "Vos disponibilités") - 22

    rows1 = rows_fitting(y, y_min)
    slot_column(c, M, y, 1, rows1)
    slot_column(c, M + col_w + GAP, y, 1 + rows1, rows1)
    footer(c, 1, 2)
    c.showPage()

    # ---------------- Page 2 ----------------
    y = header(c, compact=True) - 30
    rows2 = rows_fitting(y, y_min)
    start = 2 * rows1 + 1
    slot_column(c, M, y, start, rows2)
    slot_column(c, M + col_w + GAP, y, start + rows2, rows2)
    footer(c, 2, 2)
    # champ technique invisible : son calcul relance l'affichage des lignes à chaque saisie
    c.acroForm.textfield(name="_maj", x=0, y=0, width=1, height=1, borderWidth=0, fieldFlags="readOnly")
    c.showPage()
    c.save()
    TOTAL = 2 * rows1 + 2 * rows2
    return buf.getvalue()


def js(code):
    return DictionaryObject({
        NameObject("/S"): NameObject("/JavaScript"),
        NameObject("/JS"): TextStringObject(code),
    })


DOC_JS = """
var RDV_TOTAL = %(total)d;
var RDV_COLONNES = %(cols)s;
function rdvPad(i) { return (i < 10 ? "0" : "") + i; }
function rdvVoir(doc, nom, visible) {
  var f = doc.getField(nom);
  if (f) f.display = visible ? display.visible : display.hidden;
}
function rdvLignes(doc) {
  var dernier = 0, i;
  for (i = 1; i <= RDV_TOTAL; i++) {
    var d = doc.getField("date_" + rdvPad(i)), h = doc.getField("heure_" + rdvPad(i));
    var vd = d ? String(d.valueAsString).replace(/\\s/g, "") : "";
    var vh = h ? String(h.valueAsString).replace(/\\s/g, "") : "";
    if (vd !== "" || vh !== "") dernier = i;
  }
  for (i = 1; i <= RDV_TOTAL; i++) {
    var v = i <= dernier + 1;
    rdvVoir(doc, "num_" + rdvPad(i), v);
    rdvVoir(doc, "date_" + rdvPad(i), v);
    rdvVoir(doc, "heure_" + rdvPad(i), v);
  }
  for (i = 0; i < RDV_COLONNES.length; i++) {
    var c = RDV_COLONNES[i], vc = c <= dernier + 1;
    rdvVoir(doc, "entete_d_" + rdvPad(c), vc);
    rdvVoir(doc, "entete_h_" + rdvPad(c), vc);
  }
}
rdvLignes(this);
"""


def add_behaviour(pdf_bytes):
    """Format date Acrobat (=> calendrier) + affichage progressif des lignes."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()
    writer.append(reader)
    wanted = set(date_fields)
    calc_ref = None
    for page in writer.pages:
        for annot in page.get("/Annots", []) or []:
            a = annot.get_object()
            name = a.get("/T")
            if name in wanted:
                a[NameObject("/AA")] = DictionaryObject({
                    NameObject("/F"): js('AFDate_FormatEx("dd/mm/yyyy");'),
                    NameObject("/K"): js('AFDate_KeystrokeEx("dd/mm/yyyy");'),
                })
            elif name in label_fields_align:
                a[NameObject("/Q")] = NumberObject(label_fields_align[name])
            elif name == "_maj":
                a[NameObject("/F")] = NumberObject(2)  # annotation masquée
                a[NameObject("/AA")] = DictionaryObject({NameObject("/C"): js("rdvLignes(this);")})
                calc_ref = annot
    acro = writer._root_object["/AcroForm"]
    acro[NameObject("/NeedAppearances")] = BooleanObject(True)
    if calc_ref is not None:
        acro[NameObject("/CO")] = ArrayObject([calc_ref])
    # script document : s'exécute à l'ouverture et masque les lignes vides
    # (les lecteurs sans JavaScript affichent simplement toutes les lignes)
    writer.add_js(DOC_JS % {"total": TOTAL, "cols": "[" + ",".join(str(c) for c in columns) + "]"})
    writer.add_metadata({"/Title": TITRE})
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


if __name__ == "__main__":
    data = add_behaviour(build_base())
    with open(OUT, "wb") as f:
        f.write(data)
    print(f"{OUT} : {TOTAL} créneaux, {len(data) // 1024} Ko")
