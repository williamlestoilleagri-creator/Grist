"""Construit les modes d'emploi et les versions autonomes des widgets.

Usage : python3 pilotage/tutos/construire.py
Sources : pilotage/tutos/src/<widget>.html (contenu) et pilotage/tutos/img/<widget>.jpg (capture).
1. pilotage/tutos/<widget>.html : mode d'emploi autonome (style DSFR inclus) ;
2. pilotage/mode-emploi.html : les modes d'emploi y sont intégrés comme modèles d'origine ;
3. pilotage/autonomes/*.html : chaque widget en un seul fichier (CSS, socle et données de démo inclus).
"""
import base64
import json
import pathlib
import re

ICI = pathlib.Path(__file__).resolve().parent
CSS = (ICI.parent / "socle.css").read_text(encoding="utf-8")

STYLE_TUTO = """
  .tuto{max-width:880px;margin:0 auto;padding:24px 16px 48px;display:flex;flex-direction:column;gap:22px}
  .tuto h2{font-size:1.35rem;margin-bottom:8px}
  .tuto p,.tuto li{font-size:.95rem;line-height:1.6}
  .tuto .chapo{font-size:1.1rem;color:var(--title);margin:0}
  .tuto figure{margin:0;border:1px solid var(--border);box-shadow:var(--shadow)}
  .tuto figure img{display:block;width:100%;height:auto}
  .tuto figcaption{font-size:.8rem;color:var(--mention);padding:6px 10px;border-top:1px solid var(--border);background:var(--alt)}
  .etapes{counter-reset:e;list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
  .etapes li{counter-increment:e;display:flex;gap:12px;align-items:flex-start}
  .etapes li::before{content:counter(e);flex:0 0 32px;height:32px;border-radius:50%;background:var(--bf);color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center}
  .blocs{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
  .blocs div{border:1px solid var(--border);border-left:4px solid var(--bf);padding:10px 12px;font-size:.88rem}
  .blocs strong{display:block;color:var(--title);margin-bottom:2px}
  .encart{border-left:4px solid var(--bf);background:var(--bf-975);padding:12px 16px}
  .encart.astuce{border-color:var(--success);background:var(--success-soft)}
  .encart.attention{border-color:var(--warning);background:var(--warning-bg)}
  .encart p{margin:0}
  .encart strong:first-child{display:block;margin-bottom:4px}
  .pied{font-size:.8rem;color:var(--mention);border-top:1px solid var(--border);padding-top:10px}
"""

GABARIT = """<!DOCTYPE html>
<html lang="fr" data-fr-scheme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{titre} – mode d’emploi</title>
<style>
{css}
{style}
</style>
</head>
<body>
<header class="pl-entete"><div class="pl-marque"><p class="fr-logo fr-logo--sm" style="margin:0">République<br>française</p></div>
  <div class="pl-titre"><h1>{titre}</h1><p>Mode d’emploi · Pilotage des projets du pôle SSI / Logistique</p></div></header>
<main class="tuto">
{contenu}
</main>
</body>
</html>
"""


def lire_sources():
    for src in sorted((ICI / "src").glob("*.html")):
        texte = src.read_text(encoding="utf-8")
        premiere, contenu = texte.split("\n", 1)
        yield src.stem, premiere.replace("<!-- titre:", "").replace("-->", "").strip(), contenu


def integrer_modeles():
    """Intègre les modes d'emploi (sans les captures) dans le widget « Mode d'emploi »."""
    modeles = {}
    for cle, titre, contenu in lire_sources():
        sans_capture = re.sub(r"<figure>.*?</figure>\s*", "", contenu, flags=re.S).strip()
        modeles[cle] = {"titre": titre, "contenu": sans_capture}
    cible = ICI.parent / "mode-emploi.html"
    html = cible.read_text(encoding="utf-8")
    js = json.dumps(modeles, ensure_ascii=False).replace("</", "<\\/")
    html = re.sub(r"/\*MODELES\*/.*?/\*FIN_MODELES\*/", lambda m: "/*MODELES*/" + js + "/*FIN_MODELES*/", html, flags=re.S)
    cible.write_text(html, encoding="utf-8")
    print("mode-emploi.html :", len(modeles), "modèle(s) intégré(s)")


def construire_autonomes():
    """Un fichier HTML par widget, sans dépendance locale."""
    racine = ICI.parent
    css = (racine / "socle.css").read_text(encoding="utf-8")
    socle = (racine / "socle.js").read_text(encoding="utf-8")
    demo = (racine / "demo-data.js").read_text(encoding="utf-8")
    sortie = racine / "autonomes"
    sortie.mkdir(exist_ok=True)
    for f in sorted(racine.glob("*.html")):
        s = f.read_text(encoding="utf-8")
        s = s.replace('<link rel="stylesheet" href="socle.css">', "<style>\n" + css + "\n</style>")
        s = s.replace('<script src="socle.js"></script>', "<script>\n" + demo + "\n</script>\n<script>\n" + socle + "\n</script>")
        (sortie / f.name).write_text(s, encoding="utf-8")
    print("autonomes/ :", len(list(sortie.glob("*.html"))), "fichier(s)")


def construire():
    for src in sorted((ICI / "src").glob("*.html")):
        texte = src.read_text(encoding="utf-8")
        premiere, contenu = texte.split("\n", 1)
        titre = premiere.replace("<!-- titre:", "").replace("-->", "").strip()
        img = ICI / "img" / (src.stem + ".jpg")
        if img.exists():
            donnees = base64.b64encode(img.read_bytes()).decode()
            contenu = contenu.replace("{{CAPTURE}}", "data:image/jpeg;base64," + donnees)
        sortie = ICI / (src.stem + ".html")
        sortie.write_text(GABARIT.format(titre=titre, css=CSS, style=STYLE_TUTO, contenu=contenu), encoding="utf-8")
        print(sortie.name, sortie.stat().st_size // 1024, "Ko")


if __name__ == "__main__":
    construire()
    integrer_modeles()
    construire_autonomes()
