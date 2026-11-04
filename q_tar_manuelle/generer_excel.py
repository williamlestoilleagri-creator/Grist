"""Génère Q_TAR_MANUELLE.xlsx avec les types de colonnes alignés sur Q_QUADHYDRO."""
import re
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

COLONNES = """Date Controleur Preleveur Prestataire Cle_PACAGE_ilot_parcelle
Q1_Exploitant_e_invite_e_a_assister_aux_prelevements
Q2_Attitude_positive_avec_l_exploitant_e_ecoute_calme_
Q3_Explication_de_la_procedure
Q4_Prise_de_renseignements_etat_parcelle_absence_de_fertilisation_recente_etc_
Q5_Parcelle_ilot_et_culture_verifies
Q6_Nature_du_couvert_renseignee
Q7_Evitement_fourrieres_bas_de_pente_fumieres_30_m_du_talus_
Q8_Extremites_de_diagonale_geolocalisees_tracables_GPS_
Q9_Espacement_et_repartition_reguliere_des_sondages
Q10_Sol_ressuye_absence_de_pluie_battante_et_flaques
Q11_Profondeur_maximale_et_obstacle_justifies_si_horizon_manquant
Q12_Realisation_de_12_forages_minimum
Q13_Forages_espaces_de_5_m_environ
Q14_Aucune_terre_melangee_entre_horizons
Q15_Sonde_graduee_reperes_tous_les_30_cm
Q16_Nettoyage_de_l_outil_entre_chaque_sondage
Q17_Seaux_propres_distincts_par_horizon_sans_antecedent_engrais
Q18_Homogeneisation_suffisante_et_retrait_cailloux_mottes_selon_procedure
Q19_Mise_en_sachet_coherence_sachets_horizons_conforme
Q20_Etiquetage_complet_exploitation_ilot_date_horizon_
Q21_Validation_scan_codes_barres_de_chaque_sachet
Q22_Gouge_tariere_adaptee_extraction_sur_30_cm_par_operation
Q23_Materiel_d_homogeneisation
Q24_Extraction_sans_perte_excessive_de_terre_ni_contamination_des_parois
Q25_Terre_recuperee_directement_dans_le_seau_correspondant_sans_contact_avec_le_sol
Q26_Mise_immediate_en_glaciere_4_C_
Q27_Glaciere_equipee_de_pains_de_glace_et_thermometre
Q28_Acheminement_congelation_temperature_traces
Q29_Remplissage_de_la_fiche_de_renseignements
Q30_Respect_du_planning_ponctualite_facilement_joignable_
Observations_complementaires Signature_du_controleur""".split()

# Ordre réel de la table : chaque question Qn est suivie de sa justification
ordre = []
for c in COLONNES:
    ordre.append(c)
    if re.match(r"^Q\d+_", c):
        ordre.append(c + "_Justification_observations")
for i in range(1, 13):
    ordre += [f"Sondage_{i}_0_30_cm_preleve_profondeur_controlee",
              f"Sondage_{i}_30_60_cm_preleve_si_accessible",
              f"Sondage_{i}_60_90_cm_preleve_si_accessible",
              f"Sondage_{i}_Commentaires"]


def type_grist(col):
    """Même règle que Q_QUADHYDRO."""
    fixes = {
        "Date": "Date",
        "Controleur": "Ref:DATA_Inspecteur",
        "Preleveur": "Ref:DATA_Preleveur",
        "Prestataire": "Choice",
        "Cle_PACAGE_ilot_parcelle": "Ref:DATA_RELIQUATCLEAN",
        "Observations_complementaires": "Text",
        "Signature_du_controleur": "Any",          # identique à Q_QUADHYDRO
        "Q6_Nature_du_couvert_renseignee": "Text",  # Text dans Q_QUADHYDRO
    }
    if col in fixes:
        return fixes[col]
    if col.endswith("_Justification_observations") or col.endswith("_Commentaires"):
        return "Text"
    return "Choice"    # Qn_..., Sondage_n_0_30 / 30_60 / 60_90


wb = Workbook()
ws = wb.active
ws.title = "Q_TAR_MANUELLE"
entete = Font(bold=True, color="FFFFFF")
fill = PatternFill("solid", fgColor="1F6F43")
for j, col in enumerate(ordre, 1):
    c = ws.cell(row=1, column=j, value=col)
    c.font, c.fill = entete, fill
    c.alignment = Alignment(wrap_text=True, vertical="top")
    lettre = get_column_letter(j)
    ws.column_dimensions[lettre].width = 14 if col == "Date" else 28
    fmt = "DD/MM/YYYY" if type_grist(col) == "Date" else "@"
    for r in range(2, 502):  # format de cellule appliqué sur 500 lignes
        ws.cell(row=r, column=j).number_format = fmt
ws.freeze_panes = "A2"

ws2 = wb.create_sheet("Types_Grist")
ws2.append(["Colonne", "Type Grist"])
for c in ws2[1]:
    c.font, c.fill = entete, fill
for col in ordre:
    ws2.append([col, type_grist(col)])
ws2.column_dimensions["A"].width = 90
ws2.column_dimensions["B"].width = 26
ws2.freeze_panes = "A2"

wb.save("Q_TAR_MANUELLE.xlsx")
print(len(ordre), "colonnes")
from collections import Counter
print(Counter(type_grist(c) for c in ordre))
