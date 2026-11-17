import openpyxl, sys, csv, re
wb = openpyxl.load_workbook(sys.argv[1])
out = sys.argv[2]
SECT = ['fl','veau','horti','lait','lapin']
SECT_LABEL = {'fl':'F&L','veau':'Veau','horti':'Horticulture','lait':'Lait','lapin':'Lapin'}
# sheet -> (code onglet, titre, portee, domaine)
META = {
 "1-Activités et but de l'OP":("1","Activités et but de l'OP","Contrôle",""),
 "2-InfrastructuresMoyens humains":("2","Infrastructures et moyens humains","Contrôle",""),
 "3-STATUTS ET RI":("3","Statuts et règlement intérieur","Contrôle",""),
 "4-Fonctionnement démocratique":("4","Fonctionnement démocratique","Contrôle",""),
 "4.2-Fonct. démocratique GS":("4.2","Fonctionnement démocratique (groupe spécialisé)","Contrôle",""),
 "5-Les membres adhérents":("5","Les membres adhérents","Contrôle",""),
 "5.1-Les membres adhérents (UCA)":("5.1","Les membres adhérents (UCA)","Contrôle",""),
 "6-Connaissance de la production":("6","Connaissance de la production","Contrôle",""),
 "7-Règles d'apport et dérogation":("7","Respect de l'apport total et dérogations","Contrôle",""),
 "8-Respect du seuil minimal VPC":("8","Respect du seuil minimal de VPC","Contrôle",""),
 "9-Appui technique":("9","Appui technique","Contrôle",""),
 "9.1-Conventions d'extern":("9.x","Convention d'externalisation – Appui technique","Convention","Appui technique"),
 "10-Tri, stockage, conditinement":("10","Tri, stockage et conditionnement","Contrôle",""),
 "10.1-Conventions d'exter":("10.x","Convention d'externalisation – Tri, stockage, conditionnement","Convention","Tri, stockage, conditionnement"),
 "11-Agréage":("11","Agréage","Contrôle",""),
 "11.1-Autres conventions d'exter":("11.x","Convention d'externalisation – Agréage","Convention","Agréage"),
 "12-Mise sur le marché":("12","Mise en marché","Contrôle",""),
 "12.1-Autres conventions d'exter":("12.x","Convention d'externalisation – Mise en marché","Convention","Mise en marché"),
 "13. Producteur 1":("13","Contrôle en exploitation (producteur)","Producteur",""),
}
SKIP_START = ('critères','critere','les membres de l\'op au jour','produits')
rows=[]
def clean(s): return re.sub(r'\s+',' ',str(s).replace('\xa0',' ')).strip()
for ws in wb.worksheets:
    if ws.title not in META: continue
    code,titre,portee,domaine = META[ws.title]
    # find header row "Critères" to locate columns
    hdr=None
    for r in ws.iter_rows(min_row=1,max_row=8):
        for c in r:
            if isinstance(c.value,str) and clean(c.value).lower().startswith(('critères','les membres de l')):
                hdr=(c.row,c.column); break
        if hdr: break
    qcol = hdr[1] if hdr else 2
    ncol = qcol-1 if qcol>2 else 1
    # sector flag columns
    scols={}
    for c in ws[1]:
        if isinstance(c.value,str) and c.value.strip() in SECT: scols[c.column]=c.value.strip()
    # response-mode by header rows (OUI/NON, C/NC, dates)
    mode='Oui/Non'
    ordre=0; section=''; parent_num=''
    start = hdr[0] if hdr else 3
    for r in range(start, ws.max_row+1):
        v = ws.cell(r,qcol).value
        num = next((ws.cell(r,cc).value for cc in range(1,qcol) if isinstance(ws.cell(r,cc).value,(int,float))), None)
        if code=='7' and 33<=r<=40: continue
        if code=='12' and 6<=r<=12: continue
        # header row: update mode
        e = ws.cell(r,qcol+3).value
        if isinstance(v,str) and clean(v).lower().startswith(('critères','les membres de l')):
            e = clean(e or '').upper()
            mode = 'Conforme/Non conforme' if e=='C' else ('Valeur n-1 / n' if '01/01' in e else 'Oui/Non')
            continue
        if ws.title.startswith('5.1') and r==14: mode='Valeur n-1 / n'; continue
        if v is None or not clean(v): continue
        t = clean(v)
        if t.startswith('→') or t.lower().startswith('joindre') : 
                        # pièce à joindre -> stored as consigne on the onglet
            rows.append(dict(feuille=ws.title,ligne=r,onglet=code,titre_onglet=titre,portee=portee,domaine=domaine,ordre=None,num='',section=section,niveau='Consigne',libelle=t,type='Aucune',secteurs=''))
            continue
        is_section = bool(re.match(r'^(I|II|III|IV|V|VI|VII)\s*[-–.]',t)) or (t.lower().startswith('secteur ') and len(t)<45) or t.lower().startswith(('op avec','op sans','a- ','b- ','a) ','b) ','c) ','cas des op','achats extérieurs','respect de l’apport','respect de l\'apport'))
        if is_section and not (isinstance(num,(int,float))):
            section=t[:120]; parent_num=''
            if 'observations complémentaires' not in t.lower():
                rows.append(dict(feuille=ws.title,ligne=r,onglet=code,titre_onglet=titre,portee=portee,domaine=domaine,ordre=None,num='',section=section,niveau='Section',libelle=t,type='Aucune',secteurs=''))
            if 'observations complémentaires' in t.lower():
                rows.append(dict(feuille=ws.title,ligne=r,onglet=code,titre_onglet=titre,portee=portee,domaine=domaine,ordre=None,num='',section=section,niveau='Question',libelle=t,type='Texte',secteurs=''))
            continue
        n = '' if num is None or not str(num).strip() else str(num).strip()
        if isinstance(num,float) and num.is_integer(): n=str(int(num))
        niveau = 'Question' if n else 'Sous-question'
        if n: parent_num=n
        tl=t.lower()
        typ=mode
        if 'observations' in tl[:40] or tl.startswith(('retranscrire','relever','décrire','lister','si oui, répertorier','si oui, lister','si non, lister','si non, répertorier','si non, indiquer','si oui, préciser','si oui, indiquer','si oui, détailler','si oui, quel','si oui, quel','indiquer la raison','la raison sociale','le cas échéant, indiquer','quelle est','quelles sont','comment','nom du prestataire','précisez','préciser','observation :','point de vigilance','précision','remarque','description des produits','nom du producteur','identifier','période','pour info')):
            typ='Texte'
        if tl.startswith(('indiquer le nombre','indiquer le nombre total','dont ','si oui, préciser le nombre','si oui, indiquer le nombre')) and mode=='Valeur n-1 / n': typ='Valeur n-1 / n'
        elif tl.startswith(('si oui, préciser le nombre','si oui, indiquer le nombre','indiquer le nombre')): typ='Nombre'
        if tl.startswith(('la part en %',)): typ='Pourcentage'
        if tl.startswith(('point de vigilance','observation :','précision','remarque','pour info','définition')): typ='Aucune'; niveau='Consigne'
        if tl.startswith(('vente op','ajout','déduction','déduire','achat op','total vpc','producteur n°')) and code=='8': typ='Montant + C/NC'
        if tl.startswith('total vpc'): typ='Montant (calculé)'
        secs = [SECT_LABEL[s] for col,s in scols.items() if isinstance(ws.cell(r,col).value,str) and ws.cell(r,col).value.strip().lower()=='x']
        if code in ('8',): secs=['F&L','Horticulture']
        if code=='6':
            sl=section.lower()
            secs=['Veau','Horticulture','Lapin'] if 'autre' in sl else (['F&L'] if 'f&l' in sl else ['Lait'])
        rows.append(dict(feuille=ws.title,ligne=r,onglet=code,titre_onglet=titre,portee=portee,domaine=domaine,ordre=None,num=n if n else parent_num+'.'+'' ,section=section,niveau=niveau,libelle=t,type=typ,secteurs=', '.join(s for s in ['F&L','Veau','Horticulture','Lait','Lapin'] if s in secs)))
# fix numbering & order
def okey(c):
    p=[int(x) if x.isdigit() else 0 for x in c.replace('x','0').split('.')]
    return p
out_rows=[]; counters={}
for d in rows:
    k=(d['onglet'],d['portee'])
    counters[k]=counters.get(k,0)+1
    d['ordre']=counters[k]*10
    if d['niveau']!='Question' : 
        if d['num'].endswith('.'): d['num']=d['num'][:-1]
    out_rows.append(d)
# Codes
seen={}
for d in out_rows:
    base=f"{d['onglet']}-L{d['ligne']:02d}"
    d['code']=base
RANG={c:i+1 for i,c in enumerate(['1','2','3','4','4.2','5','5.1','6','7','8','9','9.x','10','10.x','11','11.x','12','12.x','13'])}
for d in out_rows:
    l=d['libelle'].lower(); d['bloc']=''; d['signe']=''
    if d['niveau'] in ('Consigne','Section'): d['type']='Aucune'
    if d['onglet']=='7' and l.startswith(('secteur fruits et légumes','secteur des f&l')): d['secteurs']='F&L'
    if l.startswith('si la prestation n') : d['type']='Texte'
    if l.startswith(('etablir la vpc','permettant d','contrôle du respect des dispositions statutaires')): d['type']='Aucune'; d['niveau']='Consigne'
    if d['onglet']=='12' and l.startswith(('catégorie de reconnaissance','seuil de vpc')): d['type']='Texte'
    if d['onglet']=='12' and l.startswith('nombre de clients'): d['type']='Nombre'
    if d['onglet']=='8' and d['type'].startswith('Montant'):
        sec=d['section']
        if sec.startswith('II - OP dont le CA'): d['bloc']='Ventes'
        elif sec.startswith('II - OP dont le total'): d['bloc']='Achats'
        if d['bloc'] and d['type']!='Montant (calculé)':
            d['signe']='-1' if l.startswith(('déduction','déduire')) else '1'
with open(out,'w',newline='',encoding='utf-8') as f:
    w=csv.writer(f)
    w.writerow(['Code','Onglet','Titre_onglet','Portee','Domaine_convention','Ordre','Num','Section','Niveau','Libelle','Type_reponse','Secteurs_concernes','Rang_onglet','Bloc_VPC','Signe_VPC','Feuille','Ligne'])
    for d in out_rows:
        w.writerow([d['code'],d['onglet'],d['titre_onglet'],d['portee'],d['domaine'],d['ordre'],d['num'],d['section'],d['niveau'],d['libelle'],d['type'],d['secteurs'],RANG[d['onglet']],d['bloc'],d['signe'],d['feuille'],d['ligne']])
print(len(out_rows))
