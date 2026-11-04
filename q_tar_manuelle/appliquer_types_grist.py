"""Applique à Q_TAR_MANUELLE les types (et listes de choix) de Q_QUADHYDRO via l'API Grist.

Usage :
  export GRIST_URL="https://<votre-grist>"      # ex. https://grist.numerique.gouv.fr
  export GRIST_DOC="<id du document>"
  export GRIST_KEY="<clé API>"                   # Profil > Clé API
  python3 appliquer_types_grist.py              # ajouter --dry-run pour simuler
"""
import json, os, sys, urllib.request
from generer_excel import ordre, type_grist

URL, DOC, KEY = os.environ["GRIST_URL"].rstrip("/"), os.environ["GRIST_DOC"], os.environ["GRIST_KEY"]
DRY = "--dry-run" in sys.argv


def api(method, path, body=None):
    req = urllib.request.Request(
        f"{URL}/api/docs/{DOC}{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or "null")


src = {c["id"]: c["fields"] for c in api("GET", "/tables/Q_QUADHYDRO/columns")["columns"]}
dst = {c["id"] for c in api("GET", "/tables/Q_TAR_MANUELLE/columns")["columns"]}

# Colonnes modèles pour les questions propres à la tarière manuelle (absentes de Q_QUADHYDRO)
MODELE_Q = src.get("Q1_Exploitant_e_invite_e_a_assister_aux_prelevements", {})
MODELE_SONDAGE = src.get("Sondage_1_0_30_cm_preleve_profondeur_controlee", {})

maj = []
for col in ordre:
    if col not in dst:
        print("⚠ absente de Q_TAR_MANUELLE :", col)
        continue
    t = type_grist(col)
    modele = src.get(col) or (MODELE_SONDAGE if col.startswith("Sondage_") else MODELE_Q if t == "Choice" else {})
    fields = {"type": t}
    if modele.get("type") == t and modele.get("widgetOptions"):
        fields["widgetOptions"] = modele["widgetOptions"]   # liste de choix, couleurs, format date…
    if t.startswith("Ref:") and modele.get("visibleCol"):
        # visibleCol est un id de colonne de la table cible, identique pour les deux tables
        fields["visibleCol"] = modele["visibleCol"]
    maj.append({"id": col, "fields": fields})

print(f"{len(maj)} colonnes à mettre à jour")
if DRY:
    print(json.dumps(maj, ensure_ascii=False, indent=1))
else:
    api("PATCH", "/tables/Q_TAR_MANUELLE/columns", {"columns": maj})
    print("✔ Types appliqués")
