# =============================================================================
# Formules Grist corrigées — document « Agréments produits phytopharmaceutiques »
# Chaque bloc se colle dans la formule de la colonne indiquée (panneau de droite
# de Grist > Colonne > Formule). « Défaut » = formule de déclenchement
# (« Appliquer aux nouveaux enregistrements »).
# =============================================================================


# -----------------------------------------------------------------------------
# DATA_Agrement — une ligne par n° d'agrément (= n° d'approbation RESYTAL)
# -----------------------------------------------------------------------------

# NOUVELLE colonne  Ligne_RESYTAL   (type : Référence -> DATA_RESYTAL)
# Ligne RESYTAL de l'agrément. On cherche d'abord par n° d'agrément : une même
# entreprise peut avoir plusieurs approbations (14 SIREN dans l'export de
# Bretagne, ex. 445330236 : 2900032 « Agréé » et BR00166 « Archivé »).
r = DATA_RESYTAL.lookupOne(Approbation_N_approbation=$Numero_d_agrement)
if r:
  return r
lignes = DATA_RESYTAL.lookupRecords(Entreprise_SIREN_NUMAGRIN_ENT_=$SIREN,
                                    sort_by="-Approbation_Date_de_debut_du_statut_approbation")
for x in lignes:
  if x.Approbation_Statut_Approbation in ("Agréé", "Agréé provisoire"):
    return x
return lignes[0] if lignes else None


# Date_d_approbation_RESYTAL   (Date)
return $Ligne_RESYTAL.Approbation_Date_de_debut_du_statut_approbation or None


# NOUVELLE colonne  Statut_RESYTAL   (Choix)
return $Ligne_RESYTAL.Approbation_Statut_Approbation or None


# Date_de_fin_d_approbation   (Date)
# EDATE gère les fins de mois et les années bissextiles ; aucune erreur si la
# date RESYTAL est vide ; un agrément « Agréé provisoire » sans durée = 6 mois.
d = $Date_d_approbation_RESYTAL
if not d:
  return None
mois = {"Provisoire": 6, "3 ans": 36, "6 ans": 72}.get($Duree)
if mois is None and $Statut_RESYTAL == "Agréé provisoire":
  mois = 6
return EDATE(d, mois) if mois else None


# NOUVELLE colonne  Jours_restants   (Entier)
return ($Date_de_fin_d_approbation - TODAY()).days if $Date_de_fin_d_approbation else None


# NOUVELLE colonne  Echeance   (Choix : Échu / Moins de 3 mois / Moins de 6 mois / À jour)
j = $Jours_restants
if j is None:
  return None
if j < 0:
  return "Échu"
if j <= 90:
  return "Moins de 3 mois"
if j <= 180:
  return "Moins de 6 mois"
return "À jour"


# Nombre_d_agrement_par_SIREN   (Texte)
# DATA_RESYTAL contient une ligne par approbation × périmètre × unité d'activité :
# compter les lignes gonfle les chiffres. On compte chaque n° d'approbation une fois,
# et on n'oublie plus « Archivé » (965 lignes) ni « Refusé ».
from collections import Counter
statut_par_numero = {}
for r in DATA_RESYTAL.lookupRecords(Entreprise_SIREN_NUMAGRIN_ENT_=$SIREN):
  statut_par_numero[r.Approbation_N_approbation] = r.Approbation_Statut_Approbation
c = Counter(statut_par_numero.values())
ordre = ["Agréé", "Agréé provisoire", "Suspendu", "Retiré", "Archivé", "Refusé"]
res = ["%d %s" % (c[s], s) for s in ordre if c[s]]
res += ["%d %s" % (n, s) for s, n in c.items() if s not in ordre and s]
return ", ".join(res) or "Aucun agrément recensé"


# NOUVELLE colonne  Perimetre_RESYTAL   (Choix multiple) — toujours à jour
# (Perimetre2 reste la saisie de l'agent ; sa formule par défaut peut devenir :
#  return $Perimetre_RESYTAL)
lignes = DATA_RESYTAL.lookupRecords(Approbation_N_approbation=$Numero_d_agrement)
return sorted(set(l.Perimetre_approbation_Libelle for l in lignes
                  if l.Perimetre_approbation_Etat in ("Valide", "Valide provisoire")))


# Latitude / Longitude   (passer en Numérique : nécessaire au widget Carte)
v = $Ligne_RESYTAL.Geolocalisation_completee_Latitude
return float(v) if v else None
# (même formule avec Geolocalisation_completee_Longitude)


# NOUVELLE colonne  Type_logo   (Choix : Préfet / Préfecture) — colonne de DONNÉES
# Choisit le logo du courrier dans le widget Publipostage (onglet 2 > Logo >
# « Changer de logo selon une colonne »). Valeur par défaut :
return "Préfet"


# À SUPPRIMER (doublons ou vides) : Libelle_de_l_entreprise (= SIREN_Libelle2),
# Date_fin, EXEMPLE, SIREN_DATA_RESYTAL_Approbation_Statut_Approbation.


# -----------------------------------------------------------------------------
# DATA_Entreprise
# -----------------------------------------------------------------------------
# Les fiches sont désormais créées / complétées par le widget Import RESYTAL
# (adresse, code postal, bureau distributeur de l'export « Avec adresses »).
# Les formules par défaut restent utiles pour une fiche créée à la main.

# Défaut  Adresse
s = DATA_SRAL.lookupOne(SIREN2=rec.id)
return s.Adresse.strip() if s and s.Adresse else "Non renseigné"

# Défaut  Code_Postal   (DATA_SRAL.Code_Postal est numérique : 29800.0 -> "29800")
s = DATA_SRAL.lookupOne(SIREN2=rec.id)
return str(int(s.Code_Postal)).zfill(5) if s and s.Code_Postal else "Non renseigné"

# Défaut  Localite
s = DATA_SRAL.lookupOne(SIREN2=rec.id)
return s.Localite if s and s.Localite else "Non renseigné"

# Défaut  Contact   (l'ancienne formule plantait — IndexError — sans ligne DATA_SRAL)
s = DATA_SRAL.lookupOne(SIREN2=rec.id)
return s.Mail if s and s.Mail else "Non renseigné"

# DATA_RESYTAL_Entreprise_SIREN_NUMAGRIN_ENT_ : à remplacer par
#   Nb_lignes_RESYTAL   (Entier)
return len(DATA_RESYTAL.lookupRecords(Entreprise_SIREN_NUMAGRIN_ENT_=rec.id))


# -----------------------------------------------------------------------------
# DATA_Etablissement
# -----------------------------------------------------------------------------

# Défaut  SIREN   (Référence -> DATA_Entreprise)
# L'ancienne formule renvoyait un texte dans une colonne Référence : référence
# invalide (cellule rouge). Il faut renvoyer la ligne de DATA_Entreprise.
return DATA_Entreprise.lookupOne(SIREN=$SIRET[:9]) if $SIRET else None

# Statut_entreprise   (Choix) — l'ancienne formule plantait si SIRET vide
return $SIREN.Statut or None

# Latitude / Longitude : convertir les colonnes en Numérique (widget Carte).


# -----------------------------------------------------------------------------
# DATA_SRAL (tableau historique des agents)
# -----------------------------------------------------------------------------

# Défaut  SIREN2   (Référence -> DATA_Entreprise)
# BUG : SIRET est une Référence ; str($SIRET) vaut « DATA_Etablissement[12] »,
# donc str($SIRET)[0:9] donnait « DATA_Etab ». Il faut lire le n° SIRET de la fiche.
return DATA_Entreprise.lookupOne(SIREN=$SIRET.SIRET[:9]) if $SIRET else None

# Code_Postal : convertir la colonne en Texte (codes postaux = textes, pas des nombres).


# -----------------------------------------------------------------------------
# DATA_RESYTAL
# -----------------------------------------------------------------------------
# - Ne jamais saisir à la main : la table est réécrite à chaque import.
# - Etablissement_Departement_code_Insee_ETAB_ et
#   Unite_d_activite_Code_Insee_Commune_localisation_UA_ : passer en Texte
#   (les codes INSEE ne sont pas des nombres : 2A004, zéros de tête…).
# - SIRENRES (Référence -> DATA_SRAL) / SIRETRES : à supprimer, ou remplacer par :
#   Ligne_SRAL   (Référence -> DATA_SRAL)
return DATA_SRAL.lookupOne(N_Agrement=$Approbation_N_approbation)


# -----------------------------------------------------------------------------
# DATA_Evenements
# -----------------------------------------------------------------------------
# Piece_jointes est une colonne FORMULE (return None) : impossible d'y joindre un
# fichier. Colonne > « Actions de colonne » > « Convertir en colonne de données ».


# -----------------------------------------------------------------------------
# Evolution
# -----------------------------------------------------------------------------
# Statut : formule qui renvoie '' -> convertir en colonne de données (Choix :
# À étudier / En cours / Fait / Abandonné).
# Derniere_mise_a_jour et Derniere_mise_a_jour_par : formule de déclenchement
# « Appliquer aux nouveaux enregistrements » ET « Appliquer lors des modifications
# de » toutes les colonnes, sinon la date ne bouge jamais après la création :
NOW()          # Derniere_mise_a_jour
user.Name      # Derniere_mise_a_jour_par


# -----------------------------------------------------------------------------
# Tables à supprimer
# -----------------------------------------------------------------------------
# - Creer_une_entreprise : vide (colonnes A, B, C = None). Remplacée par un
#   Formulaire Grist sur DATA_Agrement / DATA_Entreprise.
# - Recherche : sa formule appelle rec.Numero_de_SIREN, colonne qui n'existe pas
#   (erreur). Une vue Fiche + un sélecteur lié la remplace.
# - Table_info / Table_modele : ancien publipostage HTML (format_map plante dès
#   qu'une accolade apparaît dans le CSS). Remplacé par le widget Publipostage.
