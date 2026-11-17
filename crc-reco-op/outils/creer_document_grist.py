#!/usr/bin/env python3
"""
Crée la structure du document Grist « CRC Reco OP » via l'API REST de Grist,
puis importe le référentiel des points de contrôle.

Usage :
    python3 creer_document_grist.py --dry-run                 # affiche ce qui serait envoyé
    GRIST_API_KEY=xxx python3 creer_document_grist.py \
        --server https://grist.numerique.gouv.fr --doc <ID_DU_DOCUMENT>

Pré-requis : un document Grist VIDE déjà créé (l'ID se trouve dans l'URL du document
ou dans Paramètres du document > API). La clé API se trouve dans Profil > Clé API.
Aucune dépendance externe (bibliothèque standard Python 3.8+).
"""
import argparse, csv, json, os, sys, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
CSV_REFERENTIEL = os.path.join(ICI, "..", "referentiel_points_controle.csv")

SECTEURS = ["F&L", "Veau", "Horticulture", "Lait", "Lapin"]
REPONSES = ["Oui", "Non", "Non conclusif", "Sans objet", "Conforme", "Non conforme"]
SOURCES = ["Entretien avec le représentant", "Statuts", "Règlement intérieur", "PV d'AG",
           "Registre des assemblées", "Liste des adhérents", "Bulletins d'adhésion",
           "Comptabilité / liasse fiscale", "Grand livre / balance", "Conventions",
           "Fiches de paie / organigramme", "INFOGREFFE / PAPPERS", "Plaquette / site internet",
           "Procédure écrite de l'OP", "Visite des installations", "Autre"]


def col(id_, type_="Text", label=None, formula=None, choices=None, **opts):
    f = {"label": label or id_.replace("_", " "), "type": type_}
    if formula is not None:
        f["isFormula"] = True
        f["formula"] = formula
    wo = dict(opts)
    if choices:
        wo["choices"] = choices
    if wo:
        f["widgetOptions"] = json.dumps(wo, ensure_ascii=False)
    return {"id": id_, "fields": f}


# --------------------------------------------------------------------------- formules
F_BOUTON_GRILLE = '''# Génère les lignes de la grille pour ce contrôle (bouton d'action)
pts = []
for p in Referentiel.lookupRecords(Portee="Contrôle", sort_by="Ordre_global"):
  if p.Niveau in ("Consigne", "Section") or not p.Actif:
    continue
  if p.Secteurs_concernes and $Secteur not in p.Secteurs_concernes:
    continue
  if p.Onglet == "4.2" and not $Multi_secteurs:
    continue
  if p.Onglet == "5.1" and $OP.Forme != "UCA":
    continue
  if p.Onglet == "5" and $OP.Forme == "UCA":
    continue
  pts.append(p.id)
deja = set(r.Point.id for r in Reponses.lookupRecords(Controle=$id))
ids = [i for i in pts if i not in deja]
n = len(ids)
return {
  "button": "Générer la grille (%d points)" % n if n else "Grille à jour",
  "description": "Crée une ligne de réponse par point de contrôle applicable",
  "actions": [["BulkAddRecord", "Reponses", [None] * n,
               {"Controle": [$id] * n, "Point": ids}]] if n else [],
}'''

F_BOUTON_CONVENTION = '''pts = [p.id for p in Referentiel.lookupRecords(Portee="Convention", Domaine_convention=$Domaine, sort_by="Ordre")
       if p.Niveau not in ("Consigne", "Section") and p.Actif]
deja = set(r.Point.id for r in Reponses.lookupRecords(Convention=$id))
ids = [i for i in pts if i not in deja]
n = len(ids)
return {
  "button": "Générer la check-list (%d points)" % n if n else "Check-list à jour",
  "actions": [["BulkAddRecord", "Reponses", [None] * n,
               {"Controle": [$Controle.id] * n, "Convention": [$id] * n, "Point": ids}]] if n else [],
}'''

F_BOUTON_PRODUCTEUR = '''pts = [p.id for p in Referentiel.lookupRecords(Portee="Producteur", sort_by="Ordre") if p.Niveau not in ("Consigne", "Section") and p.Actif]
deja = set(r.Point.id for r in Reponses.lookupRecords(Producteur=$id))
ids = [i for i in pts if i not in deja]
n = len(ids)
return {
  "button": "Générer la check-list (%d points)" % n if n else "Check-list à jour",
  "actions": [["BulkAddRecord", "Reponses", [None] * n,
               {"Controle": [$Controle.id] * n, "Producteur": [$id] * n, "Point": ids}]] if n else [],
}'''

F_STATUT = '''t = $Point.Type_reponse
if t == "Aucune":
  return "—"
renseigne = bool($Reponse or $Texte or $Montant or $Valeur_n or $Valeur_n_1)
if not renseigne:
  return "À renseigner"
if $Reponse in ("Non", "Non conclusif", "Non conforme") and not $Observation:
  return "Observation obligatoire"
return "OK"'''

F_VPC = '''lignes = Reponses.lookupRecords(Controle=$id)
return SUM(r.Montant * (r.Point.Signe_VPC or 0) for r in lignes if r.Point.Bloc_VPC == "%s")'''

# --------------------------------------------------------------------------- tables
TABLES = [
    {"id": "OP", "columns": [
        col("N_OP", label="N° OP"),
        col("Raison_sociale"),
        col("Forme", "Choice", choices=["SCA", "UCA", "Pas SCA"]),
        col("Secteur", "Choice", choices=SECTEURS),
        col("Marques_commerciales"),
        col("Statut_juridique"),
        col("SIRET", label="N° SIRET"),
        col("Adresse_siege_social"),
        col("Adresse_bureaux", label="Adresse siège effectif des bureaux"),
        col("Responsable_legal", label="Responsable légal (fonction)"),
        col("Contact", label="Personne à contacter"),
        col("Telephone", label="Téléphone"),
        col("Courriel"),
        col("AOP", label="Raison(s) sociale(s) AOP"),
        col("Produits_concernes"),
        col("Champ_reconnaissance", label="Champ d'application de la reconnaissance"),
        col("Date_arrete", "Date", label="Date de l'arrêté de reconnaissance"),
        col("Arretes_modificatifs"),
        col("Categorie_reconnaissance", label="Catégorie / secteur de reconnaissance"),
        col("Production_ciblee"),
        col("Zone_reconnaissance", label="Zone géographique de reconnaissance"),
        col("Date_dernier_controle_FAM", "Date", label="Date du dernier contrôle FAM"),
        col("Sanction_dernier_controle", label="Sanction appliquée et suite"),
        col("Nb_controles", "Int", formula="len(Controles.lookupRecords(OP=$id))", label="Nb contrôles"),
    ]},
    {"id": "Filiales", "columns": [
        col("OP", "Ref:OP"),
        col("Raison_sociale"),
        col("Pct_participation", "Numeric", label="% participation", numMode="percent"),
        col("Objet"),
    ]},
    {"id": "Controles", "columns": [
        col("OP", "Ref:OP"),
        col("Intitule", formula='"%s – %s" % ($OP.Raison_sociale or "?", $Date_debut.strftime("%d/%m/%Y") if $Date_debut else "date ?")', label="Intitulé"),
        col("N_demande", label="N° de demande de contrôle"),
        col("Service_territorial"),
        col("Date_debut", "Date", label="Contrôle du"),
        col("Date_fin", "Date", label="au"),
        col("Secteur", "Choice", choices=SECTEURS),
        col("Multi_secteurs", "Bool", label="Société multi-secteurs (onglet 4.2)"),
        col("Statut", "Choice", choices=["En préparation", "En cours", "À valider", "Validé"]),
        col("PO_en_cours", label="Programme opérationnel en cours"),
        col("Montant_aide_FO", "Numeric", label="Montant d'aide prévisionnel FO", numMode="currency", currency="EUR"),
        col("Nb_adherents_declare", "Int", label="Nombre d'adhérents (fiche)"),
        col("Montant_VPC_declare", "Numeric", label="Montant VPC (fiche)", numMode="currency", currency="EUR"),
        col("Situation_entreprise", label="Situation (INFOGREFFE / PAPPERS…)"),
        col("Schema_fonctionnel", "Attachments", label="Schéma fonctionnel (onglet 2.1)"),
        # Onglet 8 / 12 – données d'en-tête
        col("Transfert_propriete", "Bool", label="OP avec transfert de propriété"),
        col("Seuil_VPC", "Numeric", numMode="currency", currency="EUR"),
        col("Produits_VPC", label="Produits constituant la VPC"),
        col("CA_reconnu", "Numeric", label="CA des produits reconnus (dernier exercice)", numMode="currency", currency="EUR"),
        col("Nb_clients", "Int", label="Nombre de clients"),
        # Indicateurs
        col("Bouton_grille", "Any", formula=F_BOUTON_GRILLE, label="Bouton grille"),
        col("Nb_points", "Int", formula='len(Reponses.lookupRecords(Controle=$id))'),
        col("Nb_a_renseigner", "Int", formula='len(Reponses.lookupRecords(Controle=$id, Statut="À renseigner"))', label="Nb à renseigner"),
        col("Nb_obs_manquantes", "Int", formula='len(Reponses.lookupRecords(Controle=$id, Statut="Observation obligatoire"))', label="Nb observations manquantes"),
        col("Nb_anomalies", "Int", formula='len([r for r in Reponses.lookupRecords(Controle=$id) if r.Reponse in ("Non", "Non conforme")])'),
        col("Avancement", "Numeric", formula='1 - $Nb_a_renseigner / float($Nb_points) if $Nb_points else 0', numMode="percent"),
        col("VPC_ventes", "Numeric", formula=F_VPC % "Ventes", label="VPC contrôlée (ventes)", numMode="currency", currency="EUR"),
        col("VPC_achats", "Numeric", formula=F_VPC % "Achats", label="VPC contrôlée (achats)", numMode="currency", currency="EUR"),
        col("Seuil_VPC_respecte", "Any", formula='None if not $Seuil_VPC else max($VPC_ventes, $VPC_achats) >= $Seuil_VPC', label="Seuil VPC respecté ?"),
        col("Pct_parts_producteurs", "Numeric", formula='SUM(c.Pct_parts for c in Capital_social.lookupRecords(Controle=$id) if c.Producteur)', label="% parts détenues par les producteurs", numMode="percent"),
        col("Pct_voix_producteurs", "Numeric", formula='SUM(c.Pct_voix for c in Capital_social.lookupRecords(Controle=$id) if c.Producteur)', label="% voix détenues par les producteurs", numMode="percent"),
    ]},
    {"id": "Intervenants", "columns": [
        col("Controle", "Ref:Controles", label="Contrôle"),
        col("Role", "Choice", choices=["Personne rencontrée", "Contrôleur"], label="Rôle"),
        col("Fonction_service", label="Fonction / service territorial"),
        col("Nom_prenom", label="Nom et prénom"),
    ]},
    {"id": "Referentiel", "columns": [
        col("Code"),
        col("Onglet"),
        col("Titre_onglet"),
        col("Rang_onglet", "Int"),
        col("Portee", "Choice", choices=["Contrôle", "Convention", "Producteur"], label="Portée"),
        col("Domaine_convention", "Choice", choices=["Appui technique", "Tri, stockage, conditionnement", "Agréage", "Mise en marché"]),
        col("Ordre", "Int"),
        col("Ordre_global", "Int", formula="$Rang_onglet * 10000 + $Ordre"),
        col("Num", label="N°"),
        col("Section"),
        col("Niveau", "Choice", choices=["Section", "Question", "Sous-question", "Consigne"]),
        col("Libelle", label="Libellé"),
        col("Type_reponse", "Choice", choices=["Oui/Non", "Conforme/Non conforme", "Texte", "Nombre", "Pourcentage",
                                                 "Valeur n-1 / n", "Montant + C/NC", "Montant (calculé)", "Aucune"], label="Type de réponse"),
        col("Secteurs_concernes", "ChoiceList", choices=SECTEURS, label="Secteurs concernés (vide = tous)"),
        col("Bloc_VPC", "Choice", choices=["Ventes", "Achats"]),
        col("Signe_VPC", "Int"),
        col("Actif", "Bool"),
        col("Filieres_verifiees", "Bool", label="Filières vérifiées"),
        col("Feuille", label="Feuille Excel d'origine"),
        col("Ligne", "Int", label="Ligne Excel d'origine"),
    ]},
    {"id": "Conventions", "columns": [
        col("Controle", "Ref:Controles", label="Contrôle"),
        col("Domaine", "Choice", choices=["Appui technique", "Tri, stockage, conditionnement", "Agréage", "Mise en marché"]),
        col("Prestataire"),
        col("Fonction_signataire"),
        col("Document", "Attachments", label="Convention (PDF)"),
        col("Bouton_checklist", "Any", formula=F_BOUTON_CONVENTION, label="Bouton check-list"),
        col("Nb_anomalies", "Int", formula='len([r for r in Reponses.lookupRecords(Convention=$id) if r.Reponse in ("Non", "Non conforme")])'),
    ]},
    {"id": "Producteurs_controles", "columns": [
        col("Controle", "Ref:Controles", label="Contrôle"),
        col("Nom_producteur"),
        col("SIRET"),
        col("Produits_adhesion", label="Produits (bulletin d'adhésion)"),
        col("Bouton_checklist", "Any", formula=F_BOUTON_PRODUCTEUR, label="Bouton check-list"),
        col("Montant_rapprochement", "Numeric", label="Montant rapproché (onglet 8)", numMode="currency", currency="EUR"),
        col("Nb_anomalies", "Int", formula='len([r for r in Reponses.lookupRecords(Producteur=$id) if r.Reponse in ("Non", "Non conforme")])'),
    ]},
    {"id": "Reponses", "columns": [
        col("Controle", "Ref:Controles", label="Contrôle"),
        col("Point", "Ref:Referentiel", label="Point de contrôle"),
        col("Convention", "Ref:Conventions"),
        col("Producteur", "Ref:Producteurs_controles"),
        col("Onglet", formula="$Point.Onglet"),
        col("Ordre_global", "Int", formula="$Point.Ordre_global"),
        col("Num", formula="$Point.Num", label="N°"),
        col("Section", formula="$Point.Section"),
        col("Libelle", formula="$Point.Libelle", label="Critère"),
        col("Type_reponse", formula="$Point.Type_reponse", label="Type"),
        col("Avec_quoi", "ChoiceList", choices=SOURCES, label="Avec quoi le contrôle a-t-il été fait ?"),
        col("Description", label="Description du contrôle effectué"),
        col("Reponse", "Choice", choices=REPONSES, label="Réponse"),
        col("Valeur_n_1", "Numeric", label="Valeur au 01/01/n-1"),
        col("Valeur_n", "Numeric", label="Valeur au 01/01/n"),
        col("Montant", "Numeric", numMode="currency", currency="EUR"),
        col("Texte", label="Réponse rédigée"),
        col("Observation", label="Observation du contrôleur"),
        col("Statut", formula=F_STATUT),
    ]},
    {"id": "Capital_social", "columns": [  # onglet 4.1
        col("Controle", "Ref:Controles", label="Contrôle"),
        col("Adherent", label="Adhérent (personne physique ou morale)"),
        col("Producteur", "Bool", label="Membre producteur ?"),
        col("Activite_principale", label="Activité principale (SIRENE)"),
        col("Membres_personne_morale", label="Membres de la personne morale"),
        col("Pct_parts", "Numeric", label="% parts sociales", numMode="percent"),
        col("Pct_voix", "Numeric", label="% voix (statuts)", numMode="percent"),
    ]},
    {"id": "Sondage_bulletins", "columns": [  # CTRL Bulletin adhésion
        col("Controle", "Ref:Controles", label="Contrôle"),
        col("SIRET"), col("Nom_prenom"), col("Societe", label="Société"),
        col("Critere_choix", label="Critère de choix"),
        col("Date_debut_adhesion", "Date"),
        col("Resultat", "Choice", choices=["C", "NC"], label="C / NC"),
        col("Observation"),
    ]},
    {"id": "Sondage_mandats", "columns": [  # CTRL MANDATS
        col("Controle", "Ref:Controles", label="Contrôle"),
        col("SIRET"), col("Nom_prenom"), col("Societe", label="Société"),
        col("Critere_choix", label="Critère de choix"),
        col("Mandat_present", "Bool", label="Présence d'un mandat"),
        col("Resultat", "Choice", choices=["C", "NC"], label="C / NC"),
        col("Observation"),
    ]},
    {"id": "Rendements", "columns": [  # onglet 7, question 15
        col("Controle", "Ref:Controles", label="Contrôle"),
        col("Produit"), col("Annee", "Int", label="Année"), col("Departement", label="Département"),
        col("Rendement_AGRESTE", "Numeric"), col("Rendement_OP", "Numeric"),
        col("Variation", "Numeric", formula="($Rendement_OP - $Rendement_AGRESTE) / $Rendement_AGRESTE if $Rendement_AGRESTE else None",
            label="Variation du rendement", numMode="percent"),
        col("Justification_OP", label="Justifications de l'OP"),
    ]},
    {"id": "Stades_mise_en_marche", "columns": [  # onglet 12
        col("Controle", "Ref:Controles", label="Contrôle"),
        col("Stade", "Choice", choices=["Vrac", "Brut de cueille", "Conditionné", "Destiné à la transformation", "Transformé", "Autres"],
            label="Stade du produit sorti OP"),
        col("Produits"),
        col("Pct_CA", "Numeric", label="% CA", numMode="percent"),
    ]},
    {"id": "Pieces_jointes", "columns": [
        col("Controle", "Ref:Controles", label="Contrôle"),
        col("Onglet"),
        col("Type_piece", "Choice", choices=["Statuts", "Règlement intérieur", "Modèle de bulletin d'adhésion",
                                               "Procédure de contrôle de l'apport", "Modèle de mandat", "PV d'AG",
                                               "Justificatif d'activité", "Convention", "Autre"], label="Type de pièce"),
        col("Fichier", "Attachments"),
        col("Commentaire"),
    ]},
]


def charger_referentiel():
    recs = []
    with open(CSV_REFERENTIEL, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            secs = [s.strip() for s in r["Secteurs_concernes"].split(",") if s.strip()]
            recs.append({"fields": {
                "Code": r["Code"], "Onglet": r["Onglet"], "Titre_onglet": r["Titre_onglet"],
                "Rang_onglet": int(r["Rang_onglet"]), "Portee": r["Portee"],
                "Domaine_convention": r["Domaine_convention"], "Ordre": int(r["Ordre"]),
                "Num": r["Num"], "Section": r["Section"], "Niveau": r["Niveau"],
                "Libelle": r["Libelle"], "Type_reponse": r["Type_reponse"],
                "Secteurs_concernes": ["L"] + secs if secs else None,
                "Bloc_VPC": r["Bloc_VPC"], "Signe_VPC": int(r["Signe_VPC"]) if r["Signe_VPC"] else None,
                "Actif": True, "Feuille": r["Feuille"], "Ligne": int(r["Ligne"]),
            }})
    return recs


def appel(server, doc, key, method, path, body):
    url = "%s/api/docs/%s%s" % (server.rstrip("/"), doc, path)
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method=method,
                                 headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read() or b"{}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", default="https://docs.getgrist.com")
    ap.add_argument("--doc", help="ID du document Grist (vide)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    refs = charger_referentiel()
    if a.dry_run:
        print(json.dumps({"tables": TABLES}, ensure_ascii=False, indent=1)[:4000], "...")
        print("\n%d tables, %d points de référentiel" % (len(TABLES), len(refs)))
        return
    key = os.environ.get("GRIST_API_KEY")
    if not (key and a.doc):
        sys.exit("Renseignez --doc et la variable d'environnement GRIST_API_KEY (ou utilisez --dry-run).")
    print("Création des tables…")
    appel(a.server, a.doc, key, "POST", "/tables", {"tables": TABLES})
    print("Import du référentiel (%d points)…" % len(refs))
    for i in range(0, len(refs), 200):
        appel(a.server, a.doc, key, "POST", "/tables/Referentiel/records", {"records": refs[i:i + 200]})
    print("Terminé. Suivez la partie « Pages et vues » de TRAME_GRIST.md pour monter l'interface.")


if __name__ == "__main__":
    main()
