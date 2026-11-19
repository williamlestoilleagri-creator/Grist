/* =====================================================================
   5. IMPORT D'UN FICHIER EXCEL REMPLI (grille d'origine ou modernisée)
   ===================================================================== */
const OP_MAP = [["N_OP", /^N°OP/i], ["Raison_sociale", /^Raison sociale OP/i], ["Marques", /^Marques/i], ["Statut_juridique", /^Statut juridique/i], ["SIRET", /^Numéro Siret/i],
  ["Adresse_siege", /^Adresse du Siège Social/i], ["Adresse_bureaux", /^Adresse du Siège effectif/i], ["Responsable_legal", /^Responsable légal/i], ["Contact", /^Personne à contacter/i],
  ["Telephone", /^Téléphone/i], ["Courriel", /^Courriel/i], ["AOP", /^Raison\(s\) sociale\(s\) AOP/i], ["Produits", /^Produits concernés/i],
  ["Categorie_reconnaissance", /^Catégorie\/Secteur/i], ["Production_ciblee", /production ciblée/i], ["Zone_reconnaissance", /^Zone de reconnaissance/i]];
const CTRL_MAP = [["PO_en_cours", /^PO en cours/i, "text"], ["Montant_FO", /^Montant d'aide/i, "num"], ["Date_dernier_controle", /^Date du dernier contrôle/i, "date"],
  ["Sanction_precedente", /type de sanction/i, "text"], ["Nb_adherents", /^Nombre d'adhérents/i, "num"], ["Montant_VPC", /^Montant VPC/i, "num"],
  ["Situation_entreprise", /^Consultation des sites|^Situation de l.entreprise/i, "text"]];
const SANS_OBJET = v => /^sans objet$/i.test(one(v));
function pctVal(v){ const n = num(v); return n == null ? null : (n > 1 ? n / 100 : n); }
function estProducteur(activite, nom){ const txt = ((activite || "") + " " + (nom || "")).toLowerCase(); if (/\b01\.?\d/.test(txt)) return true;
  return ["culture", "élevage", "elevage", "maraîch", "maraich", "arboricult", "viticult", "horticult", "exploitation agricole", "earl", "gaec", "scea", "producteur"].some(m => txt.includes(m)); }
function planVide(format){ return { format, op:{}, ctrl:{}, filiereNom:"", intervenants:[], filiales:[], conventions:[], producteurs:[], reps:[], capital:[], sondages:[], rendements:[], stades:[], nonReconnus:[] }; }
function resultatDe(code, p){ const cnc = /Conforme|C\/NC/.test(p.Type_reponse || "");
  return { OUI:cnc ? "Conforme" : "Oui", NON:cnc ? "Non conforme" : "Non", C:"Conforme", NC:"Non conforme" }[code] || null; }

/* rapprochement approché : libellé légèrement différent (accord, ponctuation, libellé modifié dans Grist) */
function rapprocher(feuille, texte, dejaPris){
  const mots = new Set(norm(texte).split(" ").filter(w => w.length > 2)); if (mots.size < 2) return null;
  const pris = new Set(dejaPris.map(x => x.p.id)); let best = null, score = 0;
  for (const p of REF){ if (p.Feuille !== feuille || !["Question", "Sous-question"].includes(p.Niveau) || pris.has(p.id)) continue;
    const m2 = new Set(norm(p.Libelle).split(" ").filter(w => w.length > 2)); let c = 0; for (const w of mots) if (m2.has(w)) c++;
    const sc = c / Math.max(mots.size, m2.size); if (sc > score){ score = sc; best = p; } }
  return score >= 0.6 ? best : null;
}
/* ---------- grille d'origine (export par filière) */
function champsEntete(wb){
  const out = {};
  for (const n of wb.SheetNames){ if (!/^(8|12)-/.test(n)) continue; const g = sheetGrid(wb.Sheets[n]);
    for (let r = 1; r <= Math.min(g.maxR, 20); r++){ const b = one(g.txt(r, 2)); if (!b) continue; let v = ""; for (let c = 3; c <= 8 && !v; c++) v = g.txt(r, c);
      if (!v) continue;
      if (/^Catégorie de reconnaissance/i.test(b) && !out.Categorie_VPC) out.Categorie_VPC = one(v);
      else if (/^Seuil de VPC/i.test(b) && out.Seuil_VPC == null) out.Seuil_VPC = num(v);
      else if (/^Lister les produits/i.test(b) && !out.Produits_VPC) out.Produits_VPC = one(v);
      else if (/^Chiffre d'affaires/i.test(b) && out.CA_reconnu == null) out.CA_reconnu = num(v);
      else if (/^Nombre de clients/i.test(b) && out.Nb_clients == null) out.Nb_clients = num(v); } }
  return out;
}
function analyserOrigine(wb){
  const D = parseControl(wb), P = planVide("origine");
  const fv = re => (D.fiche.find(x => re.test(x.label)) || {}).value || "";
  for (const [c, re] of OP_MAP){ const v = fv(re); if (v && !SANS_OBJET(v)) P.op[c] = one(v); }
  if (!P.op.Raison_sociale && D.cover.rs) P.op.Raison_sociale = one(D.cover.rs);
  if (!P.op.N_OP && D.cover.reco) P.op.N_OP = one(D.cover.reco);
  const arr = fv(/^Date de l.arrêté/i); if (arr){ P.op.Date_arrete = anyToSec(arr); P.op.Arretes_modificatifs = one(arr); }
  for (const [c, re, k] of CTRL_MAP){ const v = fv(re); if (!v) continue; P.ctrl[c] = k === "num" ? num(v) : k === "date" ? anyToSec(v) : one(v); }
  Object.assign(P.ctrl, champsEntete(wb));
  P.ctrl.N_demande = D.cover.demande || null; P.ctrl.Service_territorial = D.cover.service || null;
  P.ctrl.Date_debut = anyToSec(D.cover.du); P.ctrl.Date_fin = anyToSec(D.cover.au);
  P.filiereNom = one(D.cover.secteur || fv(/^Secteur concern/i));
  D.personnes.forEach(p => P.intervenants.push({ Role:"Personne rencontrée", Fonction_service:p.fonction || null, Nom:p.nom || null }));
  D.controleurs.forEach(p => P.intervenants.push({ Role:"Contrôleur", Fonction_service:p.fonction || null, Nom:p.nom || null }));
  D.filiales.forEach(f => P.filiales.push({ Raison_sociale:f.nom, Pct_participation:pctVal(f.pct), Objet:f.objet || null }));
  for (const og of D.onglets){
    const feuille = /^13\./.test(og.sheet) ? "13. Producteur 1" : og.sheet;
    let cible = P.reps;
    if (/^(9|10|11|12)\.1/.test(og.sheet)){ const cv = { Domaine:null, Prestataire:(D.conventions.find(x => x.sheet === og.sheet) || {}).nom || null, Fonction_signataire:null, reps:[] }; P.conventions.push(cv); cible = cv.reps; }
    if (/^13\./.test(og.sheet)){ const pr = D.producteurs.find(x => x.sheet === og.sheet) || {}; const pv = { Nom:pr.nom || null, Produits_adhesion:pr.produits || null, reps:[] }; P.producteurs.push(pv); cible = pv.reps; }
    for (const it of og.items){
      const p = REF_BY_TEXT.get(feuille + "|" + norm(it.critere)) || rapprocher(feuille, it.critere, cible);
      if (!p){ P.nonReconnus.push(`${og.sheet} : ${one(it.critere).slice(0, 90)}`); continue; }
      if (p.Type_reponse === "Montant (calculé)" || !["Question", "Sous-question"].includes(p.Niveau)) continue; // calculé par Grist, ou simple consigne
      const v = { Avec_quoi:it.avec || null, Description:it.desc || null, Observation:it.obs || null, Resultat:resultatDe(it.res, p) };
      if (it.type === "num"){ v.Valeur_n_1 = num(it.v1); v.Valeur_n = num(it.v2); }
      if (it.texte) v.Reponse_texte = it.texte;
      if (/^Montant/.test(p.Type_reponse || "") && it.desc){ const n = num(it.desc); if (n != null){ v.Montant = n; if (/^[\d\s.,€\u00a0]+$/.test(it.desc)) v.Description = null; } }
      cible.push({ p, v });
    }
    if (og.observations.length){ const p = REF.find(q => q.Feuille === feuille && /observations complémentaires/i.test(q.Libelle || "") && q.Niveau !== "Section");
      if (p) cible.push({ p, v:{ Reponse_texte:og.observations.join("\n") } }); }
  }
  for (const cv of P.conventions){ const q = cv.reps.find(x => x.p.Domaine_convention); cv.Domaine = q ? q.p.Domaine_convention : null; }
  P.conventions = P.conventions.filter(cv => cv.Prestataire || cv.reps.some(x => Object.values(x.v).some(Boolean)));
  P.producteurs = P.producteurs.filter(pv => pv.Nom || pv.reps.some(x => Object.values(x.v).some(Boolean)));
  D.capital.forEach(c => P.capital.push({ Adherent:c.adherent, Activite_principale:c.activite || null, Membres_personne_morale:c.membres || null, Pct_parts:pctVal(c.parts), Pct_voix:pctVal(c.voix), Producteur:estProducteur(c.activite, c.adherent) }));
  for (const s of D.sondages){ const mandat = /mandat/i.test(s.titre);
    for (const r of s.rows){ if (!r[0] && !r[1]) continue;
      P.sondages.push({ Type:mandat ? "Mandat" : "Bulletin d'adhésion", SIRET:r[0] || null, Nom_prenom:r[1] || null, Societe:r[2] || null, Critere_choix:r[3] || null,
        Date_adhesion:mandat ? null : anyToSec(r[4]), Mandat_present:mandat ? /^(oui|x|vrai|true|1|présent)/i.test(r[4] || "") : null, Resultat:/^nc$/i.test(r[5] || "") ? "NC" : /^c$/i.test(r[5] || "") ? "C" : null }); } }
  D.rendements.forEach(r => P.rendements.push({ Produit:r.produit, Annee:r.annee ? String(r.annee) : null, Departement:r.dept || null, Rendement_AGRESTE:isNaN(r.agreste) ? null : r.agreste, Rendement_OP:isNaN(r.op) ? null : r.op, Justification:r.justif || null }));
  D.stades.forEach(s => P.stades.push({ Stade:s.stade, Produits:s.produits || null, Pct_CA:pctVal(s.pct) }));
  return P;
}

/* ---------- grille modernisée */
const MOD_SHEETS = { [T.INT]:"Intervenants", [T.FILIALES]:"Filiales", [T.CONV]:"Conventions", [T.PROD]:"Producteurs", [T.CAP]:"Capital social", [T.SOND]:"Sondages", [T.REND]:"Rendements", [T.STADES]:"Stades mise en marché" };
const isModerne = wb => { const ws = wb.Sheets["Contrôle"]; return !!(ws && ws.A1 && ws.A1.v === MARKER); };
function convType(v, k){
  if (v == null || v === "") return null;
  if (k === "date") return anyToSec(v);
  if (k === "num") return num(v);
  if (k === "pct") return typeof v === "number" ? v : pctVal(v);
  if (k === "bool") return v === true || /^(oui|x|vrai|true|1)$/i.test(String(v).trim());
  if (k === "reflist"){ const noms = String(v).split(/[,;]/).map(s => s.trim()).filter(Boolean); return ["L", ...rows(T.FIL).filter(f => noms.includes(f.Nom)).map(f => f.id)]; }
  return one(v);
}
function analyserModerne(wb){
  const P = planVide("modernisée");
  const aoa = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header:1, raw:true, defval:null });
  const types = Object.fromEntries([...OP_FIELDS.map(f => ["OP." + f[0], f[2]]), ...CTRL_FIELDS.map(f => ["CTRL." + f[0], f[2]])]);
  for (const r of aoa("Contrôle")){ const k = r[0], v = r[2]; if (!k || typeof k !== "string") continue;
    if (k === "FILIERE") P.filiereNom = one(v);
    else if (types[k]){ const val = convType(v, types[k]); if (val != null) (k.startsWith("OP.") ? P.op : P.ctrl)[k.split(".")[1]] = val; } }
  const cfgs = Object.fromEntries([FILIALES_CFG, ...ANNEXES].map(c => [c.t, c]));
  for (const n of wb.SheetNames){
    const data = aoa(n), a1 = data[0] && data[0][0];
    if (typeof a1 !== "string") continue;
    if (a1.startsWith("#table:")){
      const t = a1.slice(7), cfg = cfgs[t]; if (!cfg) continue;
      const kr = data.findIndex(r => r[0] === "#colonnes"); if (kr < 0) continue;
      const keys = data[kr].slice(1), kt = Object.fromEntries(cfg.cols.map(c => [c[0], c[2]]));
      for (const r of data.slice(kr + 2)){ const rec = {}; keys.forEach((k, i) => { if (k && kt[k]) rec[k] = convType(r[i + 1], kt[k]); });
        if (!Object.values(rec).some(x => x != null && x !== false)) continue;
        const target = { [T.INT]:P.intervenants, [T.FILIALES]:P.filiales, [T.CAP]:P.capital, [T.SOND]:P.sondages, [T.REND]:P.rendements, [T.STADES]:P.stades }[t];
        if (t === T.CONV) P.conventions.push({ ...rec, reps:[] }); else if (t === T.PROD) P.producteurs.push({ ...rec, reps:[] }); else if (target) target.push(rec);
        if (t === T.CAP && rec.Producteur == null) rec.Producteur = estProducteur(rec.Activite_principale, rec.Adherent); }
    }
    if (a1.startsWith("#grille:")){
      let cible = P.reps, cur = null; const domaine = Object.keys(DOMAINE_FEUILLE).find(d => DOMAINE_FEUILLE[d] === a1.slice(8));
      for (const r of data.slice(1)){
        const a = r[0];
        if (a === "#conv"){ const nom = one(r[2]); cur = P.conventions.find(c => norm(c.Prestataire) === norm(nom) && (!c.Domaine || c.Domaine === domaine));
          if (!cur){ cur = { Domaine:domaine, Prestataire:nom || null, Fonction_signataire:null, reps:[] }; P.conventions.push(cur); } if (!cur.Domaine) cur.Domaine = domaine; cible = cur.reps; continue; }
        if (a === "#prod"){ const nom = one(r[2]); cur = P.producteurs.find(c => norm(c.Nom) === norm(nom));
          if (!cur){ cur = { Nom:nom || null, Produits_adhesion:null, reps:[] }; P.producteurs.push(cur); } cible = cur.reps; continue; }
        if (a === "#prod-produits"){ if (cur && r[2]) cur.Produits_adhesion = one(r[2]); continue; }
        const p = typeof a === "string" && REF_BY_CODE.get(a); if (!p) continue;
        if (p.Type_reponse === "Montant (calculé)") continue;
        const res = r[4] ? one(r[4]) : null;
        const v = { Resultat:["Oui", "Non", "Conforme", "Non conforme", "Non conclusif", "Sans objet"].includes(res) ? res : null, Avec_quoi:r[5] ? one(r[5]) : null,
          Description:r[6] ? clean(r[6]) : null, Reponse_texte:r[7] != null && r[7] !== "" ? clean(r[7]) : null, Valeur_n_1:num(r[8]), Valeur_n:num(r[9]), Montant:num(r[10]), Observation:r[11] ? clean(r[11]) : null };
        cible.push({ p, v });
      }
    }
  }
  for (const cv of P.conventions) for (const x of cv.reps) if (!cv.Domaine) cv.Domaine = x.p.Domaine_convention;
  const rempli = x => Object.values(x.v).some(v => v != null && v !== "");
  P.conventions = P.conventions.filter(cv => cv.Prestataire || cv.reps.some(rempli));
  P.producteurs = P.producteurs.filter(pv => pv.Nom || pv.reps.some(rempli));
  return P;
}

/* ---------- aperçu et exécution */
function opExistante(P){ const n = norm(P.op.N_OP || ""), rs = norm(P.op.Raison_sociale || "");
  return rows(T.OP).find(o => (n && norm(o.N_OP || "") === n) || (rs && norm(o.Raison_sociale || "") === rs)) || null; }
function renderImport(){
  const I = S.import; if (!I) return; const P = I.plan;
  const op = opExistante(P), fil = rows(T.FIL).find(f => norm(f.Nom) === norm(P.filiereNom));
  const nRep = P.reps.length + P.conventions.reduce((s, c) => s + c.reps.length, 0) + P.producteurs.reduce((s, c) => s + c.reps.length, 0);
  const nRemplis = [P.reps, ...P.conventions.map(c => c.reps), ...P.producteurs.map(c => c.reps)].flat().filter(x => Object.values(x.v).some(v => v != null && v !== "")).length;
  const doublon = fil && op && rows(T.CTRL).find(c => c.OP === op.id && c.Filiere === fil.id && c.Date_debut && c.Date_debut === P.ctrl.Date_debut);
  $("apercuImport").innerHTML = `
    <div class="fr-alert fr-alert--info fr-alert--sm fr-mb-2w"><p>Fichier <b>${esc(I.file.name)}</b> · format ${esc(P.format)}</p></div>
    <div class="fr-table fr-table--sm fr-table--no-caption"><table><caption>Contenu détecté</caption><tbody>
      <tr><th scope="row">Organisation de producteurs</th><td><b>${esc(P.op.Raison_sociale || "?")}</b> ${op ? '<span class="fr-badge fr-badge--sm fr-badge--info fr-badge--no-icon">déjà dans Grist : fiche complétée</span>' : '<span class="fr-badge fr-badge--sm fr-badge--new">nouvelle OP</span>'}</td></tr>
      <tr><th scope="row">Filière</th><td><select class="fr-select" id="iFil">${rows(T.FIL).map(f => `<option value="${f.id}" ${fil && fil.id === f.id ? "selected" : ""}>${esc(f.Nom)}</option>`).join("")}</select></td></tr>
      <tr><th scope="row">Dates du contrôle</th><td>${esc(secToFr(P.ctrl.Date_debut) || "?")} → ${esc(secToFr(P.ctrl.Date_fin) || "?")}</td></tr>
      <tr><th scope="row">Critères reconnus</th><td>${nRep} (dont ${nRemplis} renseignés)</td></tr>
      <tr><th scope="row">Conventions / producteurs</th><td>${P.conventions.length} / ${P.producteurs.length}</td></tr>
      <tr><th scope="row">Tableaux annexes</th><td>${P.intervenants.length} intervenants · ${P.filiales.length} filiales · ${P.capital.length} adhérents (capital) · ${P.sondages.length} sondages · ${P.rendements.length} rendements · ${P.stades.length} stades</td></tr>
    </tbody></table></div>
    ${P.nonReconnus.length ? `<div class="fr-alert fr-alert--warning fr-alert--sm fr-mb-2w"><p>${P.nonReconnus.length} critère(s) du fichier ne correspondent à aucun critère du référentiel et ne seront pas importés :</p><ul class="liste-mini">${P.nonReconnus.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}
    ${doublon ? `<div class="fr-alert fr-alert--warning fr-alert--sm fr-mb-2w"><p>Un contrôle de cette OP, pour cette filière et à cette date, existe déjà : « ${esc(ctrlLabel(doublon))} ». L'import en créera un second.</p></div>` : ""}
    <button class="fr-btn fr-btn--icon-left fr-icon-upload-line" id="bImporter">Importer dans Grist</button>`;
  $("bImporter").onclick = () => executerImport(+$("iFil").value);
}
async function joindreFichier(file){
  const tok = await grist.docApi.getAccessToken({ readOnly:false }); const fd = new FormData(); fd.append("upload", file, file.name);
  const r = await fetch(`${tok.baseUrl}/attachments?auth=${tok.token}`, { method:"POST", body:fd }); if (!r.ok) throw new Error("pièce jointe : " + r.status);
  const ids = await r.json(); return ids[0];
}
async function executerImport(fid){
  const I = S.import, P = I.plan; $("bImporter").disabled = true;
  try {
    let op = opExistante(P), opId;
    if (op){ const maj = {}; for (const [k, v] of Object.entries(P.op)) if (v != null && v !== "" && (op[k] == null || op[k] === "" || (Array.isArray(op[k]) && op[k].length < 2))) maj[k] = v;
      if (Object.keys(maj).length) await act([["UpdateRecord", T.OP, op.id, maj]]); opId = op.id; }
    else [opId] = await act([["AddRecord", T.OP, null, { ...P.op, Filieres_reconnues:P.op.Filieres_reconnues || ["L", fid] }]]);
    const [cid] = await act([["AddRecord", T.CTRL, null, { ...P.ctrl, OP:opId, Filiere:fid, Statut:P.ctrl.Statut || "À valider" }]]);
    try { const att = await joindreFichier(I.file); await act([["UpdateRecord", T.CTRL, cid, { Fichier_source:["L", att] }]]); }
    catch(e){ console.warn(e); toast("warning", "Le fichier n'a pas pu être joint au contrôle (" + esc(e.message) + "), les données sont importées."); }
    await bulkAdd(T.INT, P.intervenants.map(x => ({ ...x, Controle:cid })));
    if (!op || !rows(T.FILIALES).some(f => f.OP === opId)) await bulkAdd(T.FILIALES, P.filiales.map(x => ({ ...x, OP:opId })));
    await bulkAdd(T.CAP, P.capital.map(x => ({ ...x, Controle:cid })));
    await bulkAdd(T.SOND, P.sondages.map(x => ({ ...x, Controle:cid })));
    await bulkAdd(T.REND, P.rendements.map(x => ({ ...x, Controle:cid })));
    await bulkAdd(T.STADES, P.stades.map(x => ({ ...x, Controle:cid })));
    const reps = []; const rep = (x, conv, prod) => reps.push({ Controle:cid, Point:x.p.id, Convention:conv, Producteur:prod, Libelle:x.p.Libelle,
      ...Object.fromEntries(Object.entries(x.v).filter(([k, v]) => v != null && v !== "")) });
    P.reps.forEach(x => rep(x, 0, 0));
    for (const cv of P.conventions){ const [id] = await act([["AddRecord", T.CONV, null, { Controle:cid, Domaine:cv.Domaine, Prestataire:cv.Prestataire, Fonction_signataire:cv.Fonction_signataire || null }]]); cv.reps.forEach(x => rep(x, id, 0)); }
    for (const pv of P.producteurs){ const [id] = await act([["AddRecord", T.PROD, null, { Controle:cid, Nom:pv.Nom, Produits_adhesion:pv.Produits_adhesion || null, SIRET:pv.SIRET || null, Montant_rapprochement:pv.Montant_rapprochement ?? null }]]); pv.reps.forEach(x => rep(x, 0, id)); }
    const vus = new Set(); const uniques = reps.filter(r => { const k = `${r.Point}|${r.Convention}|${r.Producteur}`; if (vus.has(k)) return false; vus.add(k); return true; });
    await bulkAdd(T.REP, uniques);
    await reload(); const ajout = await genererGrille(cid);
    S.ctrlId = cid; S.groupe = null; S.import = null; $("fImport").value = ""; $("apercuImport").innerHTML = "";
    toast("success", `Import terminé : ${uniques.length} réponses${ajout ? ` (+ ${ajout} critères de la filière absents du fichier)` : ""}.`, 7000);
    setTab("saisie");
  } catch(e){ console.error(e); toast("error", "Import interrompu : " + esc(e.message), 0); $("bImporter").disabled = false; }
}
$("fImport").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  try { await reload(); const wb = XLSX.read(await f.arrayBuffer(), { type:"array" });
    S.import = { file:f, plan:isModerne(wb) ? analyserModerne(wb) : analyserOrigine(wb) }; renderImport(); }
  catch(err){ console.error(err); $("apercuImport").innerHTML = `<div class="fr-alert fr-alert--error"><p>Fichier illisible : ${esc(err.message)}</p></div>`; }
});
