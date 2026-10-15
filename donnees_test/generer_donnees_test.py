import random, datetime, unicodedata, re
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
random.seed(2026)

def slug(s): return re.sub(r'[^a-z0-9]+', '.', unicodedata.normalize('NFD', s).encode('ascii','ignore').decode().lower()).strip('.')
def luhn_ok(num):
    t = 0
    for i, d in enumerate(reversed(num)):
        d = int(d)
        if i % 2: d = d * 2 - 9 if d * 2 > 9 else d * 2
        t += d
    return t % 10 == 0
def siret():
    while True:
        siren = str(random.randint(30000000, 99999999)) + '0'
        siren = siren[:8]
        for c in '0123456789':
            if luhn_ok(siren + c): siren += c; break
        nic = '0001' + str(random.randint(0, 9))
        for _ in range(50):
            if luhn_ok(siren + nic): return siren + nic
            nic = '000' + str(random.randint(10, 99))
def rib_key(b, g, c):
    c2 = ''.join(str((ord(ch) - 55) % 9 + 1 if ch.isalpha() else ch) for ch in c)
    return 97 - ((89 * int(b) + 15 * int(g) + 3 * int(c2)) % 97)
def iban(b, g, c, k):
    bban = b + g + c + '%02d' % k
    num = ''.join(str(ord(ch) - 55) if ch.isalpha() else ch for ch in bban + 'FR00')
    return 'FR%02d' % (98 - int(num) % 97) + bban

BANQUES = [('Banque Agricole de l\'Ouest', '19806', 'BAOUFRPPXXX'), ('Crédit Mutuel des Landes d\'Armor', '15589', 'CMLAFR2BXXX'),
           ('Banque Populaire Terre & Mer', '13807', 'BPTMFRPPXXX'), ('Caisse Rurale de Cornouaille', '16006', 'CRCOFRP1XXX'),
           ('Banque Coopérative du Ponant', '12206', 'BCPOFRPPXXX')]
CDG = [('Armor Gestion Conseil', 'Le Guen', 'Annaïg', 22), ('Finistère Compta Agri', 'Kerbrat', 'Yannick', 29),
       ('Ille-et-Vilaine Agri Expertise', 'Rouxel', 'Sophie', 35), ('Morbihan Conseil Exploitations', 'Le Floch', 'Erwan', 56),
       ('Association de Gestion Rurale de Bretagne', 'Tanguy', 'Marie', 0)]
COMMUNES = {22: [('Plérin', '22190'), ('Lamballe-Armor', '22400'), ('Loudéac', '22600'), ('Paimpol', '22500'), ('Guingamp', '22200'), ('Dinan', '22100'), ('Plouguenast-Langast', '22150')],
            29: [('Landerneau', '29800'), ('Carhaix-Plouguer', '29270'), ('Quimperlé', '29300'), ('Saint-Pol-de-Léon', '29250'), ('Châteaulin', '29150'), ('Plabennec', '29860')],
            35: [('Vitré', '35500'), ('Fougères', '35300'), ('Redon', '35600'), ('Combourg', '35270'), ('Bain-de-Bretagne', '35470'), ('Montfort-sur-Meu', '35160')],
            56: [('Pontivy', '56300'), ('Ploërmel', '56800'), ('Questembert', '56230'), ('Locminé', '56500'), ('Evellys', '56500'), ('Sarzeau', '56370'), ('Guer', '56380')]}
DEPT = {22: 'Côtes-d\'Armor', 29: 'Finistère', 35: 'Ille-et-Vilaine', 56: 'Morbihan'}
VOIES = ['Lieu-dit Kerbras', 'Lieu-dit Le Clos Neuf', 'La Ville Hervé', 'Lieu-dit Kergoff', 'Route de Rennes', 'La Haute Touche', 'Lieu-dit Penhoat',
         'Le Bourg Neuf', 'Chemin de la Lande', 'Lieu-dit Kervenno', 'La Métairie', 'Lieu-dit Coët Rivaud', 'ZA de Kerivan', 'Route de la Gare', 'Lieu-dit Trégouët']
ACTIVITES = [  # thème, description, OTEX, SAU (min,max), cheptel
  ('Élevage laitier', 'Élevage de vaches laitières (Prim\'Holstein), production de lait livré en coopérative', 'Bovins lait', (60, 140), 'vaches laitières', (45, 110)),
  ('Élevage laitier bio', 'Élevage laitier en agriculture biologique, pâturage tournant, transformation en beurre et tomme', 'Bovins lait', (50, 100), 'vaches laitières', (30, 70)),
  ('Bovins viande', 'Naissage-engraissement de bovins Limousins, vente directe de colis de viande', 'Bovins viande', (40, 120), 'vaches allaitantes', (30, 80)),
  ('Porcin', 'Élevage porcin naisseur-engraisseur, fabrication d\'aliment à la ferme', 'Porcins', (30, 90), 'truies', (120, 400)),
  ('Volailles', 'Production de poulets de chair Label Rouge en bâtiments avec parcours', 'Volailles', (15, 45), 'places de volailles', (8000, 24000)),
  ('Maraîchage', 'Maraîchage diversifié sous serre et plein champ, vente en AMAP et sur les marchés', 'Maraîchage', (2, 12), '', (0, 0)),
  ('Légumes de plein champ', 'Production de choux-fleurs, artichauts et échalotes pour l\'expédition', 'Légumes', (25, 80), '', (0, 0)),
  ('Grandes cultures', 'Céréales (blé, orge), colza et maïs grain, stockage à la ferme', 'Grandes cultures', (80, 220), '', (0, 0)),
  ('Apiculture', 'Apiculture transhumante, production de miel de sarrasin et de châtaignier', 'Apiculture', (1, 5), 'ruches', (150, 600)),
  ('Arboriculture', 'Vergers de pommes à cidre, production de cidre et de jus AOP Cornouaille', 'Arboriculture', (10, 40), '', (0, 0)),
  ('Ovins / caprins', 'Élevage de chèvres laitières, fabrication de fromages fermiers', 'Caprins', (15, 40), 'chèvres', (60, 180)),
  ('Horticulture', 'Production de plants horticoles et de fleurs coupées sous serre', 'Horticulture', (1, 6), '', (0, 0)),
  ('Polyculture-élevage', 'Polyculture-élevage : vaches laitières et cultures de vente, méthanisation à la ferme', 'Polyculture-élevage', (90, 180), 'vaches laitières', (50, 90)),
]
FORMES = ['GAEC', 'EARL', 'SCEA', 'EI', 'EARL', 'GAEC', 'SAS']
NOMS = ['Le Gall', 'Le Bihan', 'Guillou', 'Le Roux', 'Morvan', 'Jaouen', 'Le Goff', 'Hamon', 'Riou', 'Le Corre', 'Cariou', 'Prigent', 'Le Moal',
        'Quéré', 'Thomas', 'Le Duff', 'Collet', 'Pichon', 'Lebreton', 'Gicquel', 'Briand', 'Lemoine', 'Ollivier', 'Glémarec', 'Daniel',
        'Le Meur', 'Rault', 'Hervé', 'Bouvier', 'Kerhervé', 'Jégou', 'Le Bras']
PRENOMS = ['Yann', 'Gwenaël', 'Maëlle', 'Ronan', 'Soazig', 'Loïc', 'Nolwenn', 'Erwan', 'Katell', 'Tanguy', 'Anne', 'Pierre', 'Morgane', 'Julien',
           'Élodie', 'Mathieu', 'Gaëlle', 'Thomas', 'Camille', 'Hervé', 'Isabelle', 'Kévin', 'Laëtitia', 'Nicolas', 'Sylvie', 'Mikaël', 'Aurélie', 'Brendan']
FINANCEMENTS = [('Aide à la conversion bio (FEADER)', 5000, 30000), ('PCAEA – modernisation des bâtiments', 15000, 90000), ('Dotation Jeunes Agriculteurs (DJA)', 15000, 45000),
                ('Plantation de haies – Breizh Bocage', 2000, 12000), ('Prêt bonifié installation', 20000, 120000), ('Calamités agricoles', 3000, 25000),
                ('Aide à la méthanisation', 40000, 200000), ('Mesure agroenvironnementale (MAEC)', 4000, 20000), ('Aucun', 0, 0)]
LABELS = ['', '', 'AB (Agriculture biologique)', 'HVE', 'Label Rouge', 'AOP', '']
STATUTS = ['Déposé', 'En instruction', 'Complet', 'Incomplet – pièces manquantes', 'Accordé', 'Payé', 'Refusé']
TEL_FIXE = lambda: '02 61 91 %02d %02d' % (random.randint(0, 99), random.randint(0, 99))   # plage ARCEP réservée à la fiction
TEL_MOB = lambda: '06 39 98 %02d %02d' % (random.randint(0, 99), random.randint(0, 99))

farms = []
used_names = set()
for i in range(32):
    act = ACTIVITES[i % len(ACTIVITES)] if i < len(ACTIVITES) else random.choice(ACTIVITES)
    dpt = [22, 29, 35, 56][i % 4]
    commune, cp = random.choice(COMMUNES[dpt])
    nom = NOMS[i % len(NOMS)]
    prenom = random.choice(PRENOMS)
    forme = random.choice(FORMES) if act[0] not in ('Apiculture', 'Horticulture') else random.choice(['EI', 'EARL'])
    if forme == 'GAEC':
        assoc_n, assoc_p = random.choice(NOMS), random.choice(PRENOMS)
        associe = f'{assoc_p} {assoc_n.upper()}'
        raison = f'GAEC {random.choice(["DU", "DE"])} {random.choice(["BOIS JOLI", "MOULIN", "KERBRAS", "PRAT", "HAUT CHEMIN", "VAL", "LANDES", "PENHOAT", "COAT", "PONT"])}'
    elif forme in ('EARL', 'SCEA', 'SAS'):
        associe = f'{random.choice(PRENOMS)} {nom.upper()}' if random.random() < 0.4 else ''
        raison = f'{forme} {nom.upper()}' + (random.choice(['', ' ET FILS', ' FRÈRES']) if forme != 'SAS' else ' AGRI')
    else:
        associe = ''
        raison = f'{prenom} {nom.upper()}'
    while raison in used_names: raison += ' 2'
    used_names.add(raison)
    sau = random.randint(*act[3]); chep = random.randint(*act[5]) if act[5][1] else ''
    b = random.choice(BANQUES); g = '%05d' % random.randint(100, 99999); c = '%011d' % random.randint(10**8, 10**11 - 1)
    k = rib_key(b[1], g, c)
    cdg = next(x for x in CDG if x[3] == dpt) if random.random() < 0.75 else CDG[4]
    fin = random.choice(FINANCEMENTS)
    install = datetime.date(random.randint(1990, 2024), random.randint(1, 12), random.randint(1, 28))
    farms.append(dict(
        dossier=f'{dpt}-2026-{100 + i * 7:04d}', raison=raison, forme=forme, nom=nom.upper(), prenom=prenom, associe=associe,
        adresse=random.choice(VOIES), cp=cp, commune=commune, dept=DEPT[dpt], code_dept=str(dpt), theme=act[0], desc=act[1], otex=act[2],
        sau=sau, cheptel=(f'{chep} {act[4]}' if chep else ''), label=random.choice(LABELS) if 'bio' not in act[0] else 'AB (Agriculture biologique)',
        installation=install, siret=siret(), pacage='0' + str(dpt) + '%06d' % random.randint(0, 999999),
        iban=iban(b[1], g, c, k), rib=f'{b[1]} {g} {c} {k:02d}', banque=b[0], bic=b[2],
        mail=f'{slug(prenom)}.{slug(nom)}@example.org', tel=TEL_FIXE(), mobile=TEL_MOB(),
        fin=fin[0], montant=(round(random.randint(fin[1], fin[2]) / 100) * 100 if fin[2] else 0), date_depot=datetime.date(2026, random.randint(1, 9), random.randint(1, 28)),
        statut=random.choice(STATUTS) if fin[2] else '', cdg=cdg[0], cdg_nom=cdg[1].upper(), cdg_prenom=cdg[2],
        cdg_mail=f'{slug(cdg[2])}.{slug(cdg[1])}@example.net', cdg_tel=TEL_FIXE(), observations=''))
# Cas de test : homonymes et données manquantes
farms[30]['raison'] = farms[3]['raison']; farms[30]['commune'], farms[30]['cp'] = 'Questembert', '56230'
farms[31]['mail'] = ''; farms[31]['observations'] = 'Adresse e-mail non communiquée (test mailing)'
farms[29]['mail'] = 'adresse-invalide'; farms[29]['observations'] = 'Adresse e-mail invalide (test mailing)'
farms[30]['observations'] = 'Homonyme de la ligne 5, autre SIRET (test des doublons)'

# --------- classeur
HEAD_FILL = PatternFill('solid', fgColor='000091'); HEAD_FONT = Font(name='Arial', bold=True, color='FFFFFF', size=10)
BODY_FONT = Font(name='Arial', size=10); thin = Side(style='thin', color='DDDDDD')
def write_sheet(ws, headers, rows, widths, formats=None):
    ws.append(headers)
    for r in rows: ws.append(r)
    for c in range(1, len(headers) + 1):
        h = ws.cell(row=1, column=c); h.fill = HEAD_FILL; h.font = HEAD_FONT; h.alignment = Alignment(wrap_text=True, vertical='center')
        ws.column_dimensions[get_column_letter(c)].width = widths[c - 1]
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.font = BODY_FONT; cell.border = Border(bottom=thin); cell.alignment = Alignment(vertical='top', wrap_text=False)
            if formats and cell.column in formats: cell.number_format = formats[cell.column]
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = 'C2'
    ws.auto_filter.ref = ws.dimensions
def readme(wb, title, lines):
    ws = wb.create_sheet('Lisez-moi')
    ws['A1'] = title; ws['A1'].font = Font(name='Arial', bold=True, size=13, color='000091')
    for i, l in enumerate(lines, start=3):
        ws.cell(row=i, column=1, value=l).font = Font(name='Arial', size=10, bold=l.endswith(':'))
    ws.column_dimensions['A'].width = 120

# Fichier 1 : exploitations
H1 = ['N° dossier', "Nom de l'exploitation", 'Forme juridique', "NOM DE L'EXPLOITANT", 'PRENOM', 'ASSOCIE', 'Adresse', 'Code postal', 'Commune',
      'Département', 'Code département', 'Thème', "Description de l'activité", 'OTEX (orientation)', 'SAU (ha)', 'Cheptel', 'Label / certification',
      "Date d'installation", 'SIRET', 'N° PACAGE', 'IBAN', 'RIB', 'BIC', 'BANQUE', 'MAIL', 'Téléphone fixe', 'Téléphone mobile',
      'FINANCEMENT', 'Montant demandé (€)', 'Date de dépôt', 'Statut du dossier', 'CENTRE DE GESTION', 'NOM RESPONSABLE CENTRE DE GESTION',
      'PRENOM RSP CDG', 'Mail centre de gestion', 'Téléphone centre de gestion', 'Observations']
R1 = [[f['dossier'], f['raison'], f['forme'], f['nom'], f['prenom'], f['associe'], f['adresse'], f['cp'], f['commune'], f['dept'], f['code_dept'],
       f['theme'], f['desc'], f['otex'], f['sau'], f['cheptel'], f['label'], f['installation'], f['siret'], f['pacage'], f['iban'], f['rib'], f['bic'],
       f['banque'], f['mail'], f['tel'], f['mobile'], f['fin'], f['montant'] or None, f['date_depot'] if f['montant'] else None, f['statut'],
       f['cdg'], f['cdg_nom'], f['cdg_prenom'], f['cdg_mail'], f['cdg_tel'], f['observations']] for f in farms]
W1 = [14, 30, 10, 18, 12, 22, 24, 9, 22, 16, 10, 20, 60, 18, 8, 22, 22, 12, 17, 12, 32, 30, 14, 32, 34, 15, 15, 36, 12, 12, 26, 38, 22, 14, 36, 15, 44]
wb = Workbook(); ws = wb.active; ws.title = 'Exploitations'
write_sheet(ws, H1, R1, W1, {15: '0', 18: 'DD/MM/YYYY', 29: '#,##0 "€"', 30: 'DD/MM/YYYY', 8: '@', 19: '@', 20: '@', 11: '@'})
readme(wb, 'Données de test — exploitations agricoles (FICTIVES)', [
  'Toutes les données de ce fichier sont fictives : noms, adresses, SIRET, IBAN, e-mails et téléphones ont été générés au hasard.',
  'Les SIRET respectent la clé de Luhn et les IBAN/RIB ont des clés valides, mais ne correspondent à aucune entreprise ni à aucun compte réel.',
  'Les e-mails utilisent les domaines réservés example.org / example.net : aucun message ne peut partir vers une vraie personne.',
  'Les téléphones sont dans les plages réservées à la fiction par l\'ARCEP (02 61 91 xx xx, 06 39 98 xx xx).',
  '',
  'Cas de test prévus :',
  '  • ligne 32 : même nom d\'exploitation que la ligne 5, autre SIRET et autre commune → badge « Doublon » / identifiant',
  '  • ligne 31 : e-mail invalide, ligne 33 : e-mail vide → dossiers écartés du mailing',
  '  • le SIRET relie ce fichier au fichier « Test_Dossiers_Financement » (table liée)',
  '',
  'Import dans Grist : Ajouter > Importer depuis un fichier, feuille « Exploitations ».'])
wb.save('/home/user/Grist/donnees_test/Test_Exploitations_agricoles.xlsx')

# Fichier 2 : dossiers de financement (plusieurs par exploitation, quelques exploitations absentes du fichier 1)
dossiers = []
n = 1
for f in farms[:28]:
    for _ in range(random.choice([1, 1, 1, 2, 2, 3])):
        fin = random.choice([x for x in FINANCEMENTS if x[2]])
        dep = datetime.date(random.choice([2025, 2026]), random.randint(1, 12 if True else 9), random.randint(1, 28))
        st = random.choice(STATUTS)
        mt = round(random.randint(fin[1], fin[2]) / 100) * 100
        dossiers.append([f'FIN-{f["code_dept"]}-{n:04d}', f['siret'], f['raison'], f['nom'], f['prenom'], f['adresse'], f['cp'], f['commune'], f['dept'], f['code_dept'],
                         fin[0], 'FEADER' if 'FEADER' in fin[0] or 'MAEC' in fin[0] else random.choice(['État', 'Région Bretagne', 'FEADER', 'État + Région']),
                         mt, round(mt * random.choice([0.4, 0.5, 0.6, 0.8]), -2) if st in ('Accordé', 'Payé') else None, dep, st,
                         dep + datetime.timedelta(days=random.randint(30, 120)) if st in ('Accordé', 'Payé', 'Refusé') else None,
                         f['banque'], f['iban'], f['mail'], f['cdg'], f'{f["cdg_prenom"]} {f["cdg_nom"]}',
                         random.choice(['A. Martin', 'C. Le Gall', 'S. Robin', 'P. Nédélec']), ''])
        n += 1
for k in range(4):   # demandeurs inconnus du fichier 1 (non reliés)
    dpt = random.choice([22, 29, 35, 56]); com, cp = random.choice(COMMUNES[dpt]); fin = random.choice([x for x in FINANCEMENTS if x[2]])
    nom = random.choice(NOMS).upper(); pre = random.choice(PRENOMS)
    dossiers.append([f'FIN-{dpt}-{n:04d}', siret(), f'EARL {nom}', nom, pre, random.choice(VOIES), cp, com, DEPT[dpt], str(dpt), fin[0], 'État', round(random.randint(fin[1], fin[2]) / 100) * 100,
                     None, datetime.date(2026, random.randint(1, 9), random.randint(1, 28)), 'Déposé', None, '', '', f'{slug(pre)}.{slug(nom)}@example.org', '', '', 'S. Robin',
                     'Demandeur absent du fichier des exploitations (test table liée)'])
    n += 1
H2 = ['N° dossier financement', 'SIRET', "Nom de l'exploitation", "NOM DE L'EXPLOITANT", 'PRENOM', 'Adresse', 'Code postal', 'Commune', 'Département', 'Code département',
      'FINANCEMENT', 'Financeur', 'Montant demandé (€)', 'Montant accordé (€)', 'Date de dépôt', 'Statut', 'Date de décision', 'BANQUE', 'IBAN', 'MAIL',
      'CENTRE DE GESTION', 'Responsable CDG', 'Instructeur', 'Observations']
W2 = [20, 17, 30, 18, 12, 24, 9, 22, 16, 10, 36, 16, 14, 14, 12, 26, 12, 32, 32, 34, 38, 22, 12, 44]
wb2 = Workbook(); ws2 = wb2.active; ws2.title = 'Dossiers_financement'
write_sheet(ws2, H2, dossiers, W2, {13: '#,##0 "€"', 14: '#,##0 "€"', 15: 'DD/MM/YYYY', 17: 'DD/MM/YYYY', 2: '@', 7: '@', 10: '@'})
readme(wb2, 'Données de test — dossiers de financement (FICTIVES)', [
  'Données entièrement fictives (voir le fichier des exploitations).',
  f'{len(dossiers)} dossiers : une exploitation peut avoir 1 à 3 dossiers ; les 4 derniers concernent des demandeurs absents du fichier des exploitations.',
  '',
  'Utilisation dans le widget Publipostage :',
  '  • table principale = Exploitations, table liée = Dossiers_financement, liaison par SIRET',
  '  • « Si plusieurs lignes » = « Toutes » pour lister tous les financements d\'une exploitation dans un même courrier',
  '  • ou l\'inverse : un courrier par dossier (table principale = Dossiers_financement) avec les coordonnées de l\'exploitation en table liée'])
wb2.save('/home/user/Grist/donnees_test/Test_Dossiers_financement.xlsx')
print(len(farms), len(dossiers))
