"""Assemble le widget « Contrôle de reconnaissance des OP » (un seul fichier HTML à coller dans Grist).
Usage : python3 build_widget.py <logo_franceagrimer.png>"""
import base64, os, sys
ICI = os.path.dirname(os.path.abspath(__file__)); RACINE = os.path.abspath(os.path.join(ICI, "..", ".."))
lire = lambda p: open(p, encoding="utf-8").read()
src = lire(os.path.join(ICI, "widget-controle.src.html"))
rapport = lire(os.path.join(RACINE, "rapport-controle.html"))
grille = lire(os.path.join(RACINE, "grille-filiere-excel.html"))
def tranche(txt, debut, fin):
    a = txt.index(debut); b = txt.index(fin, a); return txt[a:b]
r = tranche(rapport, "/* =====================================================================\n   1. LECTURE DU FICHIER", "/* =====================================================================\n   5. INTERFACE")
g = tranche(grille, "/* ================================================== transformation du classeur */", "/* ==================================================================== Grist */")
# adaptations du rapport aux résultats Grist et au logo FranceAgriMer
rep = [
 ('({ OUI:"Oui", NON:"Non", C:"Conforme", NC:"Non conforme" })', '({ OUI:"Oui", NON:"Non", C:"Conforme", NC:"Non conforme", NCL:"Non conclusif", SO:"Sans objet" })'),
 ('<div class="emetteur">', '<div class="emetteur"><img src="${FAM_LOGO}" alt="FranceAgriMer" style="height:17mm;display:block;margin:0 0 2mm auto">'),
 ('new TableCell({ borders:noB(d), children:[P([T(D.cover.service || "Service territorial", { bold:true })], { align:AlignmentType.RIGHT, after:0 }),',
  'new TableCell({ borders:noB(d), children:[new Paragraph({ alignment:AlignmentType.RIGHT, children:[new ImageRun({ type:"png", data:b64ToBytes(FAM_LOGO), transformation:{ width:120, height:66 } })] }), P([T(D.cover.service || "Service territorial", { bold:true })], { align:AlignmentType.RIGHT, after:0 }),'),
]
for a, b in rep:
    assert a in r, a[:60]; r = r.replace(a, b)
logo = "data:image/png;base64," + base64.b64encode(open(sys.argv[1], "rb").read()).decode()
out = (src.replace("@@IMPORT@@", lire(os.path.join(ICI, "widget-import.js")))
          .replace("@@EXCEL_MODERNE@@", lire(os.path.join(ICI, "widget-moderne.js")))
          .replace("@@RAPPORT@@", r).replace("@@GRILLE@@", g).replace("@@FAM_LOGO@@", logo))
assert "@@" not in out
open(os.path.join(RACINE, "controle-op.html"), "w", encoding="utf-8").write(out)
print("controle-op.html :", len(out) // 1024, "Ko")
