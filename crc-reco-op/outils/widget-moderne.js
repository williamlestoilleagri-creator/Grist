/* =====================================================================
   6. GRILLE EXCEL MODERNISÉE (vierge ou remplie) – ExcelJS
   ===================================================================== */
const XL = { bf:"FF000091", bfSoft:"FFE3E3FD", gris:"FFF6F6F6", grisT:"FF666666", blanc:"FFFFFFFF", rouge:"FFCE0500", orangeSoft:"FFFFE9E6", bord:"FFDDDDDD" };
const XFONT = (o = {}) => ({ name:"Marianne", size:o.size || 10, bold:!!o.bold, italic:!!o.italic, color:{ argb:o.color || "FF161616" } });
const FILL = argb => ({ type:"pattern", pattern:"solid", fgColor:{ argb } });
const BORD = { top:{ style:"thin", color:{ argb:XL.bord } }, left:{ style:"thin", color:{ argb:XL.bord } }, bottom:{ style:"thin", color:{ argb:XL.bord } }, right:{ style:"thin", color:{ argb:XL.bord } } };
const LISTES = { "Oui/Non":["Oui", "Non", "Non conclusif", "Sans objet"], "Conforme/Non conforme":["Conforme", "Non conforme", "Non conclusif", "Sans objet"], "Montant + C/NC":["Conforme", "Non conforme", "Sans objet"] };
function nomFeuille(s){ return s.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31); }
function hauteur(textes){ // estimation de la hauteur d'une ligne à retour automatique
  let l = 1; for (const [t, w] of textes){ if (!t) continue; const n = String(t).split("\n").reduce((s, x) => s + Math.max(1, Math.ceil(x.length / (w * 1.15))), 0); l = Math.max(l, n); }
  return Math.min(409, Math.max(18, l * 13 + 6));
}
function xlVal(v, k){ if (v == null || v === "") return null; if (k === "date"){ const s = secToIso(v); return s ? new Date(s + "T00:00:00Z") : null; } if (k === "bool") return v ? "Oui" : "Non";
  if (k === "reflist") return refList(v).map(filNom).filter(Boolean).join(", "); return v; }
function enTete(ws, titre, sousTitre, cols){
  ws.getCell("A1").value = ws.__marker; ws.getColumn(1).hidden = true;
  ws.mergeCells(1, 2, 1, cols); const t = ws.getCell(1, 2); t.value = titre; t.font = XFONT({ size:13, bold:true, color:XL.blanc }); t.fill = FILL(XL.bf); t.alignment = { vertical:"middle", indent:1 };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 2, 2, cols); const s = ws.getCell(2, 2); s.value = sousTitre; s.font = XFONT({ size:9, italic:true, color:XL.grisT });
}
function ligneEntetes(ws, r, labels){ labels.forEach((l, i) => { const c = ws.getCell(r, i + 2); c.value = l; c.font = XFONT({ bold:true, color:XL.blanc, size:9 }); c.fill = FILL(XL.bf); c.alignment = { wrapText:true, vertical:"middle" }; c.border = BORD; });
  ws.getRow(r).height = 32; }
function validation(cell, liste){ cell.dataValidation = { type:"list", allowBlank:true, formulae:['"' + liste.join(",") + '"'], showErrorMessage:true, errorTitle:"Valeur non prévue", error:"Choisissez une valeur dans la liste." }; }

async function buildModerne(fid, cid){
  const wb = new ExcelJS.Workbook(); wb.creator = "Grist – Contrôle de reconnaissance des OP"; wb.created = new Date();
  const c = cid ? byId(T.CTRL, cid) : null, op = c ? byId(T.OP, c.OP) || {} : {};
  const fname = filNom(fid), drop = dropSheets(fid);
  const repDe = (pid, conv, prod) => cid ? rows(T.REP).find(r => r.Controle === cid && r.Point === pid && (r.Convention || 0) === conv && (r.Producteur || 0) === prod) : null;
  const logo = wb.addImage({ base64:FAM_LOGO, extension:"png" });

  /* --- feuille Contrôle */
  const ws = wb.addWorksheet("Contrôle", { views:[{ showGridLines:false }], properties:{ tabColor:{ argb:XL.bf } } });
  ws.columns = [{ width:4 }, { width:52 }, { width:62 }];
  ws.pageSetup = { orientation:"portrait", paperSize:9, fitToPage:true, fitToWidth:1, fitToHeight:0 };
  ws.getCell("A1").value = MARKER; ws.getColumn(1).hidden = true;
  ws.addImage(logo, { tl:{ col:2.62, row:0.15 }, ext:{ width:118, height:65 } });
  ws.getCell("B2").value = "RÉPUBLIQUE FRANÇAISE"; ws.getCell("B2").font = XFONT({ bold:true, size:11 });
  ws.getCell("B3").value = "Liberté · Égalité · Fraternité"; ws.getCell("B3").font = XFONT({ italic:true, size:8 });
  ws.getCell("B5").value = "Contrôle de reconnaissance des organisations de producteurs"; ws.getCell("B5").font = XFONT({ bold:true, size:16, color:XL.bf });
  ws.getCell("B6").value = `Grille de contrôle – filière ${fname}` + (c ? ` – ${ctrlLabel(c)}` : ""); ws.getCell("B6").font = XFONT({ size:11, color:XL.bf });
  ws.getCell("B7").value = "Version modernisée. Une feuille par thème ; les colonnes « Résultat » proposent une liste déroulante. Ce classeur se réimporte dans Grist (onglet « Importer un Excel »). Ne modifiez pas la colonne A masquée.";
  ws.getCell("B7").font = XFONT({ italic:true, size:9, color:XL.grisT }); ws.mergeCells("B7:C7"); ws.getCell("B7").alignment = { wrapText:true }; ws.getRow(7).height = 30;
  let r = 9;
  const section = t => { ws.mergeCells(r, 2, r, 3); const x = ws.getCell(r, 2); x.value = t; x.font = XFONT({ bold:true, color:XL.blanc }); x.fill = FILL(XL.bf); ws.getRow(r).height = 20; r++; };
  const champ = (key, label, val, k, opts) => { ws.getCell(r, 1).value = key; const a = ws.getCell(r, 2), b = ws.getCell(r, 3); a.value = label; a.font = XFONT({ bold:true, size:9 }); a.fill = FILL(XL.gris); a.border = BORD; a.alignment = { wrapText:true, vertical:"top" };
    b.value = val; b.font = XFONT(); b.border = BORD; b.alignment = { wrapText:true, vertical:"top" };
    if (k === "date") b.numFmt = "dd/mm/yyyy"; if (k === "num") b.numFmt = "#,##0"; if (k === "choice") validation(b, opts);
    ws.getRow(r).height = hauteur([[label, 52], [val, 62]]); r++; };
  section("Contrôle");
  champ("FILIERE", "Filière contrôlée", fname, "text");
  for (const [k, l, t, o] of CTRL_FIELDS) champ("CTRL." + k, l, xlVal(c && c[k], t), t, o);
  r++; section("Organisation de producteurs (fiche signalétique)");
  for (const [k, l, t, o] of OP_FIELDS) champ("OP." + k, l, xlVal(op[k], t), t, o);

  /* --- tableaux annexes */
  const annexes = [FILIALES_CFG, ...ANNEXES].filter(cfg => !(cfg.t === T.CAP && drop.has("4.1-K social et nb adh")));
  for (const cfg of annexes){
    const wa = wb.addWorksheet(MOD_SHEETS[cfg.t], { views:[{ state:"frozen", ySplit:5, showGridLines:false }] });
    wa.__marker = "#table:" + cfg.t; const n = cfg.cols.length + 1;
    wa.columns = [{ width:4 }, ...cfg.cols.map(([, , k]) => ({ width:k === "bool" || k === "pct" ? 12 : k === "date" ? 14 : 26 }))]; wa.getColumn(1).hidden = true;
    wa.pageSetup = { orientation:"landscape", paperSize:9, fitToPage:true, fitToWidth:1, fitToHeight:0 };
    enTete(wa, cfg.titre, `Correspond à : ${cfg.feuille}${cfg.t === T.CONV ? " · les check-lists sont dans les feuilles « Conv. … »" : ""}${cfg.t === T.PROD ? " · la check-list est dans la feuille « 13 Producteurs »" : ""}`, n);
    wa.getCell(4, 1).value = "#colonnes"; cfg.cols.forEach(([k], i) => wa.getCell(4, i + 2).value = k); wa.getRow(4).hidden = true;
    ligneEntetes(wa, 5, cfg.cols.map(x => x[1]));
    const link = cfg.link || "Controle", linkId = cfg.t === T.FILIALES ? op.id : cid;
    const recs = linkId ? rows(cfg.t).filter(x => x[link] === linkId) : [];
    const total = Math.max(recs.length + 5, 12);
    for (let i = 0; i < total; i++){
      const rec = recs[i] || {}, rr = 6 + i;
      cfg.cols.forEach(([k, , t, o], j) => { const cell = wa.getCell(rr, j + 2); cell.value = xlVal(rec[k], t); cell.border = BORD; cell.font = XFONT(); cell.alignment = { wrapText:true, vertical:"top" };
        if (t === "date") cell.numFmt = "dd/mm/yyyy"; if (t === "pct") cell.numFmt = "0%"; if (t === "num") cell.numFmt = "#,##0.##";
        if (t === "choice") validation(cell, o); if (t === "bool") validation(cell, ["Oui", "Non"]); });
    }
  }

  /* --- feuilles de critères */
  const feuillesCtrl = [...new Set(REF.filter(p => p.Portee === "Contrôle").map(p => p.Feuille))].filter(f => !drop.has(f));
  const COLS = ["N°", "Critère", "Type de réponse", "Résultat", "Avec quoi le contrôle a-t-il été fait ?", "Description du contrôle effectué", "Réponse rédigée", "Valeur au 01/01/n-1", "Valeur au 01/01/n", "Montant (€)", "Observation du contrôleur"];
  const WID = [6, 60, 14, 16, 30, 36, 34, 12, 12, 14, 40];
  const ecrireGrille = (wg, feuille, blocs) => {
    wg.columns = [{ width:4 }, ...WID.map(w => ({ width:w }))]; wg.getColumn(1).hidden = true;
    ligneEntetes(wg, 4, COLS);
    let rr = 5, utilise = { texte:false, n:false, montant:false };
    const ligneTitre = (t, fill, font) => { wg.mergeCells(rr, 2, rr, 12); const x = wg.getCell(rr, 2); x.value = t; x.fill = FILL(fill); x.font = font; x.alignment = { wrapText:true, vertical:"middle", indent:1 }; wg.getRow(rr).height = hauteur([[t, 230]]); rr++; };
    for (const b of blocs){
      if (b.marque){ wg.getCell(rr, 1).value = b.marque; const l = wg.getCell(rr, 2), v = wg.getCell(rr, 3); l.value = b.label; l.font = XFONT({ bold:true }); v.value = b.valeur || null; v.font = XFONT({ bold:true, color:XL.bf });
        v.border = BORD; v.fill = FILL(XL.bfSoft); wg.getRow(rr).height = 22; rr++;
        if (b.marque2){ wg.getCell(rr, 1).value = b.marque2; wg.getCell(rr, 2).value = b.label2; wg.getCell(rr, 2).font = XFONT({ bold:true, size:9 }); const v2 = wg.getCell(rr, 3); v2.value = b.valeur2 || null; v2.border = BORD; v2.font = XFONT(); rr++; } }
      const pts = REF.filter(p => p.Feuille === feuille && ((cid && repDe(p.id, b.conv || 0, b.prod || 0)) || !p.Retire && (p.Niveau === "Section" ? p.fils.includes(fid) : ["Question", "Sous-question"].includes(p.Niveau) ? p.fils.includes(fid) : p.Niveau === "Consigne" && (p.fils.length === 0 || p.fils.includes(fid)))
        ) && (b.portee ? p.Portee === b.portee : true) && (b.domaine ? (p.Niveau === "Section" || p.Niveau === "Consigne" || p.Domaine_convention === b.domaine) : true));
      for (const p of pts){
        if (p.Niveau === "Section"){ ligneTitre(one(p.Libelle), XL.bfSoft, XFONT({ bold:true, color:XL.bf })); continue; }
        if (p.Niveau === "Consigne"){ ligneTitre(one(p.Libelle), XL.gris, XFONT({ italic:true, size:9, color:"FF3A3A3A" })); continue; }
        const t = p.Type_reponse || "Oui/Non", rep = repDe(p.id, b.conv || 0, b.prod || 0) || {};
        const row = wg.getRow(rr); row.getCell(1).value = p.Code;
        const vals = [fmtNum(p.Num) || null, rep.Libelle || p.Libelle, t, rep.Resultat || null, rep.Avec_quoi || null, rep.Description || null, rep.Reponse_texte || null, rep.Valeur_n_1 ?? null, rep.Valeur_n ?? null, rep.Montant ?? null, rep.Observation || null];
        if (t === "Montant (calculé)"){ vals[2] = "Calcul automatique"; vals[3] = null; if (cid){ const tot = repsOf(cid).reduce((s, x) => { const q = REF_BY_ID.get(x.Point); return s + (q && q.Bloc_VPC === p.Bloc_VPC && q.Signe_VPC ? (+x.Montant || 0) * q.Signe_VPC : 0); }, 0); vals[9] = tot; } }
        vals.forEach((v, j) => { const cell = row.getCell(j + 2); cell.value = v; cell.border = BORD; cell.font = XFONT({ size:j === 2 ? 8 : 10, color:j === 2 ? XL.grisT : undefined, bold:j === 0 });
          cell.alignment = { wrapText:true, vertical:"top" }; });
        row.getCell(3).font = XFONT({ bold:p.Niveau === "Question" });
        if (LISTES[t]) validation(row.getCell(5), LISTES[t]); else if (t !== "Montant (calculé)") row.getCell(5).fill = FILL(XL.gris);
        if (t === "Valeur n-1 / n"){ utilise.n = true; row.getCell(9).numFmt = row.getCell(10).numFmt = "#,##0"; }
        if (["Texte", "Nombre", "Pourcentage"].includes(t)) utilise.texte = true;
        if (/^Montant/.test(t)){ utilise.montant = true; row.getCell(11).numFmt = "#,##0 €"; }
        row.height = hauteur([[vals[1], 60], [vals[5], 36], [vals[6], 34], [vals[10], 40]]);
        rr++;
      }
    }
    wg.getColumn(8).hidden = !utilise.texte; wg.getColumn(9).hidden = wg.getColumn(10).hidden = !utilise.n; wg.getColumn(11).hidden = !utilise.montant;
    if (rr > 5){
      wg.addConditionalFormatting({ ref:`E5:E${rr}`, rules:[{ type:"containsText", operator:"containsText", text:"Non conforme", style:{ font:{ color:{ argb:XL.rouge }, bold:true } } },
        { type:"cellIs", operator:"equal", formulae:['"Non"'], style:{ font:{ color:{ argb:XL.rouge }, bold:true } } }] });
      wg.addConditionalFormatting({ ref:`L5:L${rr}`, rules:[{ type:"expression", formulae:['AND(OR($E5="Non conforme",$E5="Non conclusif"),LEN($L5)=0)'], style:{ fill:{ type:"pattern", pattern:"solid", bgColor:{ argb:XL.orangeSoft } } } }] });
    }
    wg.pageSetup = { orientation:"landscape", paperSize:9, fitToPage:true, fitToWidth:1, fitToHeight:0, printTitlesRow:"4:4" };
  };
  for (const feuille of feuillesCtrl){
    const p0 = REF.find(p => p.Feuille === feuille && p.Portee === "Contrôle" && p.fils.includes(fid) && ["Question", "Sous-question"].includes(p.Niveau) && !p.Retire); if (!p0) continue;
    const wg = wb.addWorksheet(nomFeuille(`${p0.Onglet} ${p0.Titre_onglet}`), { views:[{ state:"frozen", ySplit:4, xSplit:3, showGridLines:false }] });
    wg.__marker = "#grille:" + feuille; enTete(wg, `Onglet ${p0.Onglet} – ${p0.Titre_onglet}`, `Feuille d'origine : ${feuille} · filière ${fname}`, 12);
    ecrireGrille(wg, feuille, [{ portee:"Contrôle" }]);
  }
  for (const d of DOMAINES){
    const feuille = DOMAINE_FEUILLE[d]; if (drop.has(feuille)) continue;
    const p0 = REF.find(p => p.Feuille === feuille && p.fils.includes(fid) && ["Question", "Sous-question"].includes(p.Niveau) && !p.Retire); if (!p0) continue;
    const convs = cid ? rows(T.CONV).filter(v => v.Controle === cid && v.Domaine === d) : [];
    const blocs = (convs.length ? convs : [{ id:0, Prestataire:"" }]).map(v => ({ marque:"#conv", label:"Prestataire :", valeur:v.Prestataire, conv:v.id, portee:"Convention", domaine:d }));
    const wg = wb.addWorksheet(nomFeuille(`${p0.Onglet} Conv. ${d}`), { views:[{ state:"frozen", ySplit:4, xSplit:3, showGridLines:false }] });
    wg.__marker = "#grille:" + feuille; enTete(wg, `Onglet ${p0.Onglet} – Convention d'externalisation « ${d} »`, `Feuille d'origine : ${feuille} · un bloc par prestataire (copiez le bloc pour en ajouter un)`, 12);
    ecrireGrille(wg, feuille, blocs);
  }
  if (!drop.has("13. Producteur 1") && REF.some(p => p.Portee === "Producteur" && p.fils.includes(fid) && !p.Retire)){
    const prods = cid ? rows(T.PROD).filter(v => v.Controle === cid) : [];
    const blocs = (prods.length ? prods : [{ id:0 }, { id:0 }, { id:0 }]).map(v => ({ marque:"#prod", label:"Producteur :", valeur:v.Nom, marque2:"#prod-produits", label2:"Produits (bulletin d'adhésion) :", valeur2:v.Produits_adhesion, prod:v.id, portee:"Producteur" }));
    const wg = wb.addWorksheet("13 Producteurs", { views:[{ state:"frozen", ySplit:4, xSplit:3, showGridLines:false }] });
    wg.__marker = "#grille:13. Producteur 1"; enTete(wg, "Onglet 13 – Contrôles en exploitation", "Feuilles d'origine : 13. Producteur 1, 2, 3 · un bloc par producteur contrôlé", 12);
    ecrireGrille(wg, "13. Producteur 1", blocs);
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
