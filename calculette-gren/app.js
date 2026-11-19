/* Calculette GREN — application (calcul de la dose d'azote, plan de fumure, comparaison).
   Code chargé par index.html. Aucune bibliothèque tierce hormis celles du dossier lib/. */
"use strict";
/* =========================================================================
   ÉTAT & PERSISTANCE
   ========================================================================= */
const KEY = "calculette-gren-v1";
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 10);
const harvestYear = () => { const d = new Date(); return d.getMonth() >= 7 ? d.getFullYear() + 1 : d.getFullYear(); };
function newState(){
  return { version:1, annee: harvestYear(), tab:"accueil", sel:null,
    exploitation:{pacage:"", raison:"", exploitant:"", adresse:"", departement:"22", commune:"", insee:"", sol:"limsain", sau:""},
    parcelles:[], campagnes:{}, ref: clone(REF_DEFAULT) };
}
/* Nettoyage de toute donnée venant de l'extérieur (fichier importé, serveur) :
   suppression des clés dangereuses (__proto__, constructor, prototype), profondeur et taille limitées. */
function nettoyer(v, prof = 0){
  if (prof > 12) return null;
  if (Array.isArray(v)) return v.slice(0, 5000).map(x => nettoyer(x, prof + 1));
  if (v && typeof v === "object") { const o = {};
    for (const k of Object.keys(v).slice(0, 2000)) { if (k === "__proto__" || k === "constructor" || k === "prototype") continue; o[k] = nettoyer(v[k], prof + 1); }
    return o; }
  if (typeof v === "string") return v.slice(0, 2000);
  return typeof v === "number" || typeof v === "boolean" || v === null ? v : null;
}
const estObjet = v => v && typeof v === "object" && !Array.isArray(v);
function migrate(s){
  s = nettoyer(s);
  if (!estObjet(s)) s = {};
  s.version = 1;
  s.ref = estObjet(s.ref) ? s.ref : clone(REF_DEFAULT);
  for (const k of Object.keys(REF_DEFAULT)) if (k !== "version" && !(k in s.ref) || (Array.isArray(REF_DEFAULT[k]) && !Array.isArray(s.ref[k]))) s.ref[k] = clone(REF_DEFAULT[k]);
  s.ref.params = Object.assign(clone(REF_DEFAULT.params), estObjet(s.ref.params) ? s.ref.params : {});
  s.exploitation = Object.assign(newState().exploitation, estObjet(s.exploitation) ? s.exploitation : {});
  for (const k of Object.keys(s.exploitation)) s.exploitation[k] = s.exploitation[k] == null ? "" : String(s.exploitation[k]);
  const idSur = v => /^[A-Za-z0-9_-]{1,40}$/.test(String(v ?? "")) ? String(v) : uid();
  s.parcelles = Array.isArray(s.parcelles) ? s.parcelles.filter(estObjet).map(p => ({...p, id:idSur(p.id)})) : [];
  s.campagnes = estObjet(s.campagnes) ? s.campagnes : {};
  for (const [y, c] of Object.entries(s.campagnes)) {
    if (!/^\d{4}$/.test(y) || !estObjet(c)) { delete s.campagnes[y]; continue; }
    c.cultures = estObjet(c.cultures) ? c.cultures : {};
    for (const k of Object.keys(c.cultures)) if (!/^[A-Za-z0-9_-]{1,40}$/.test(k) || !estObjet(c.cultures[k])) delete c.cultures[k];
    c.interventions = Array.isArray(c.interventions) ? c.interventions.filter(estObjet).map(i => ({...i, id:idSur(i.id), pid:String(i.pid ?? "")})) : [];
    c.groupes = Array.isArray(c.groupes) ? c.groupes.filter(g => estObjet(g) && Array.isArray(g.ids)).map(g => ({nom:String(g.nom ?? ""), ids:g.ids.map(String).filter(x => /^[A-Za-z0-9_-]{1,40}$/.test(x))})) : [];
  }
  s.references = Array.isArray(s.references) ? s.references.filter(r => estObjet(r) && Array.isArray(r.lignes)).map(r => ({...r, id:idSur(r.id), nom:String(r.nom ?? "")})) : [];
  s.sel = s.sel && /^[A-Za-z0-9_-]{1,40}$/.test(s.sel) ? s.sel : null;
  s.refSel = s.refSel && /^[A-Za-z0-9_-]{1,40}$/.test(s.refSel) ? s.refSel : null;
  s.tab = typeof s.tab === "string" ? s.tab : "accueil";
  s.comptesPrepares = Array.isArray(s.comptesPrepares) ? s.comptesPrepares.filter(c => estObjet(c) && typeof c.identifiant === "string") : [];
  s.annee = Number.isInteger(s.annee) && s.annee > 2000 && s.annee < 2100 ? s.annee : harvestYear();
  return s;
}

/* Conservation des données : soit sur l'appareil (stockage local du navigateur,
   gardé jusqu'à effacement), soit seulement le temps de la visite (effacé à la
   fermeture de l'onglet). Le choix lui-même est mémorisé sur l'appareil. */
const conserver = () => { try { return localStorage.getItem("gren-conserver") !== "0"; } catch(e){ return false; } };
function load(){
  for (const st of [() => localStorage, () => sessionStorage]) {
    try { const raw = st().getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s && s.version) return migrate(s); } } catch(e){}
  }
  return null;
}
let S = load() || newState();
let storageOK = true;
function save(){
  try {
    if (conserver()) { localStorage.setItem(KEY, JSON.stringify(S)); sessionStorage.removeItem(KEY); }
    else { sessionStorage.setItem(KEY, JSON.stringify(S)); localStorage.removeItem(KEY); }
    storageOK = true;
  } catch(e){ storageOK = false; }
}
function choisirConservation(oui){
  try { localStorage.setItem("gren-conserver", oui ? "1" : "0"); } catch(e){}
  save();
}
function effacerTout(){
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); sessionStorage.removeItem("gren-session"); } catch(e){}
  S = newState(); save();
  if (!conserver()) try { sessionStorage.removeItem(KEY); } catch(e){}
}

/* =========================================================================
   OUTILS
   ========================================================================= */
const $ = (s, r=document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".").replace(/\s/g,"")); return isFinite(n) ? n : 0; };
const fmt = (v, d=0) => (Math.round(v * 10**d) / 10**d).toLocaleString("fr-FR", {minimumFractionDigits:d, maximumFractionDigits:d});
const R = () => S.ref;
const byId = (arr, id) => arr.find(x => x.id === id);
const cultureById = id => byId(R().cultures, id);
const solById = id => byId(R().sols, id) || R().sols[0];
const precById = id => byId(R().precedents, id);
const effById = id => byId(R().effluents, id);
const minById = id => byId(R().mineraux, id);
const opts = (arr, sel, empty) => (empty !== undefined ? `<option value="">${esc(empty)}</option>` : "") +
  arr.map(o => `<option value="${esc(o.id)}" ${o.id === sel ? "selected" : ""}>${esc(o.nom)}</option>`).join("");
const ZONES = [{id:"standard",nom:"Standard"},{id:"ZAR",nom:"ZAR (zone d'actions renforcées)"},{id:"BV",nom:"Bassin versant en contentieux"}];
const zonePill = z => z === "ZAR" ? badge("ZAR", "error") : z === "BV" ? badge("BV contentieux", "warning") : badge("Standard");
const statutPill = s => s === "realise" ? badge("Réalisé", "success") : badge("Prévisionnel", "info");
const CAT_LABEL = {automne:"Culture d'automne", printemps:"Culture de printemps", prairie:"Prairie"};
const parcelLabel = p => p.nom ? `${p.nom}` : `Îlot ${p.ilot} · parc. ${p.num}`;
const parcelCode = p => `${S.exploitation.pacage || "PACAGE"}_${p.ilot || "?"}_${p.num || "?"}`;
const sau = () => num(S.exploitation.sau) || S.parcelles.reduce((a, p) => a + num(p.surface), 0);
const dept = p => (p && p.dept) || S.exploitation.departement || "22";

/* =========================================================================
   CAMPAGNES
   ========================================================================= */
function camp(y){ y = y || S.annee; return S.campagnes[y] || (S.campagnes[y] = {cultures:{}, interventions:[], groupes:[]}); }
function hasCamp(y){ return !!S.campagnes[y]; }
function entry(pid, y){
  y = y || S.annee; const c = camp(y);
  if (!c.cultures[pid]) {
    const prev = S.campagnes[y-1] && S.campagnes[y-1].cultures[pid];
    let prec = "";
    if (prev && prev.culture) {
      const pc = cultureById(prev.culture);
      prec = pc ? pc.prec : "";
      if (prev.precedent === "pr1") prec = "pr2"; else if (prev.precedent === "pr2") prec = "pr3";
    }
    c.cultures[pid] = {culture:"", precedent:prec, rdtMode:"ref", rdtLibre:"", rdtHist:"", rdtRealise:"",
      rshMode:"forfait", rshMesure:"", cipan:"aucune", cipanDate:"", paille:"", irrigation:false,
      pature:{jours:"", animaux:[]}, notes:""};
  }
  return c.cultures[pid];
}

/* =========================================================================
   MOTEUR DE CALCUL — MÉTHODE DU BILAN
   Dose = Besoin − (RSH + Mh + effet précédent + CIPAN + N org. efficace
          + arrière-effet + pâturage) ± corrections  → plafonnée
   ========================================================================= */
function periode(dateStr){
  const m = dateStr ? parseInt(dateStr.slice(5,7), 10) : 3;
  if (m >= 8 && m <= 11) return "Aut";
  if (m === 12 || m <= 2) return "Hiv";
  return "Pri";
}
const PER_LABEL = {Aut:"automne", Hiv:"fin d'hiver", Pri:"printemps"};
function olympic(arr){
  const v = arr.filter(x => x > 0).slice(0, 5);
  if (!v.length) return 0;
  if (v.length >= 3) { const s = [...v].sort((a,b) => a-b); s.shift(); s.pop(); return s.reduce((a,b)=>a+b,0) / s.length; }
  return v.reduce((a,b)=>a+b,0) / v.length;
}
function histValues(p, c, y){
  if (String(c.rdtHist || "").trim()) return String(c.rdtHist).split(/[;\s/]+/).map(num).filter(x => x > 0);
  // historique automatique : même culture, même type de sol, 5 campagnes précédentes, moyenne pondérée par la surface
  const out = [];
  for (let yy = y-1; yy >= y-5; yy--) {
    const cc = S.campagnes[yy]; if (!cc) continue;
    let s = 0, w = 0;
    for (const q of S.parcelles) {
      const e = cc.cultures[q.id];
      if (e && e.culture === c.culture && q.sol === p.sol && num(e.rdtRealise) > 0) { s += num(e.rdtRealise) * num(q.surface); w += num(q.surface); }
    }
    if (w > 0) out.push(s / w);
  }
  return out;
}
function rdtObjectif(p, c, cult, y){
  if (c.rdtMode === "libre") return {val:num(c.rdtLibre), src:"saisie libre"};
  if (c.rdtMode === "hist") { const h = histValues(p, c, y); return {val:olympic(h), src:`historique (${h.length} an${h.length>1?"s":""}${h.length>=3?", extrêmes exclus":""})`, hist:h}; }
  return {val:num(cult["rdt" + dept(p)]), src:`référence GREN ${DEPTS[dept(p)] || ""}`};
}
function orgItems(pid, y){
  const cc = S.campagnes[y]; if (!cc) return [];
  return cc.interventions.filter(i => i.pid === pid && i.type === "organique").map(i => {
    const e = effById(i.produit) || {nom:i.produit, n:0, keqAut:0, keqHiv:0, keqPri:0, arriere:0};
    const teneur = i.teneur !== "" && i.teneur != null ? num(i.teneur) : num(e.n);
    const per = periode(i.date);
    const nTot = num(i.qte) * teneur;
    const keq = num(e["keq" + per]);
    return {i, e, teneur, per, nTot, keq, nEff: nTot * keq, arr: nTot * num(e.arriere)};
  });
}
function mineralN(pid, y){
  const cc = S.campagnes[y]; if (!cc) return 0;
  return cc.interventions.filter(i => i.pid === pid && i.type === "mineral")
    .reduce((a, i) => a + num(i.qte) * num((minById(i.produit) || {teneur:0}).teneur) / 100, 0);
}
function patureN(p, c){
  const pa = c.pature || {}; const surf = num(p.surface);
  const ugb = (pa.animaux || []).reduce((a, x) => a + num(x.n) * num((byId(R().animaux, x.cat) || {ugb:0}).ugb), 0);
  const jours = num(pa.jours);
  if (!ugb || !jours || !surf) return {ugb, jours, nTot:0, nEff:0};
  const nTot = ugb * jours / 365 * num(R().params.nUGB) / surf;
  return {ugb, jours, nTot, nEff: nTot * num(R().params.keqPature)};
}
function calc(p, y){
  y = y || S.annee;
  const c = entry(p.id, y); const cult = cultureById(c.culture);
  if (!cult) return null;
  const P = R().params; const sol = solById(p.sol); const cat = cult.cat;
  const kAut = {automne:"Aut", printemps:"Pri", prairie:"Pra"}[cat];
  const rdt = rdtObjectif(p, c, cult, y);
  const forfait = cult.methode === "forfait";
  const besoinBrut = forfait ? num(cult.forfait) : rdt.val * num(cult.b);
  const rf = forfait ? 0 : num(cult.rf);
  const irrig = c.irrigation ? num(cult.irrig) : 0;
  const besoin = besoinBrut + rf + irrig;
  const rsh = forfait ? 0 : (c.rshMode === "mesure" ? num(c.rshMesure) : num(sol["rsh" + (kAut === "Aut" ? "Aut" : "Pri")]));
  const mh = forfait ? 0 : num(sol["mh" + kAut]);
  const prec = precById(c.precedent); const precEff = forfait ? 0 : num(prec ? prec.effet : 0);
  const cip = byId(R().cipan, c.cipan) || R().cipan[0];
  const cipPrecoce = c.cipanDate ? c.cipanDate.slice(5) < P.cipanLimite && c.cipanDate.slice(5) > "07-31" : false;
  const cipanEff = forfait ? 0 : num(cipPrecoce ? cip.precoce : cip.tardif);
  const org = orgItems(p.id, y);
  const nOrgEff = org.reduce((a, o) => a + o.nEff, 0);
  const nOrgTot = org.reduce((a, o) => a + o.nTot, 0);
  const arrItems = orgItems(p.id, y-1);
  const arriere = arrItems.length ? arrItems.reduce((a, o) => a + o.arr, 0) : num(c.arriereSaisi);
  const pat = patureN(p, c);
  const fournSol = rsh + mh + precEff + cipanEff;
  const fournOrg = nOrgEff + arriere + pat.nEff;
  const fournitures = fournSol + fournOrg;
  const corr = c.paille === "exportee" ? num(P.pailleExportee) : c.paille === "enfouie" ? num(P.pailleEnfouie) : 0;
  const doseCalc = Math.max(0, besoin - fournitures + corr);
  const plafond = num(cult.plafond);
  const dosePlaf = cult.plafond === "" || cult.plafond == null ? doseCalc : Math.min(doseCalc, plafond);
  const ar = num(P.arrondi) || 1;
  const doseFinale = Math.round(dosePlaf / ar) * ar;
  const minPrevu = mineralN(p.id, y);
  const nTotalHa = nOrgTot + pat.nTot + minPrevu;
  const trace = [
    `Culture : ${cult.nom} (${CAT_LABEL[cat]}) — méthode ${forfait ? "forfaitaire" : "du bilan"}`,
    forfait ? `Besoin forfaitaire GREN : ${fmt(besoinBrut)} kg N/ha`
            : `Besoin = rendement ${fmt(rdt.val,1)} ${cult.unite} × b ${cult.b} = ${fmt(besoinBrut)} kg N/ha (${rdt.src})`,
    rf ? `+ reliquat à la récolte (Rf) : ${fmt(rf)}` : "",
    irrig ? `+ majoration irrigation : ${fmt(irrig)}` : "",
    !forfait ? `− RSH ${c.rshMode === "mesure" ? "mesuré" : "forfaitaire (" + sol.nom + ")"} : ${fmt(rsh)}` : "",
    !forfait ? `− Minéralisation de l'humus Mh (${sol.nom}) : ${fmt(mh)}` : "",
    precEff ? `− Effet du précédent (${prec.nom}) : ${fmt(precEff)}` : "",
    cipanEff ? `− Couvert / CIPAN (${cip.nom}, destruction ${cipPrecoce ? "précoce" : "tardive"}) : ${fmt(cipanEff)}` : "",
    ...org.map(o => `− ${o.e.nom} ${fmt(num(o.i.qte),1)} ${o.e.unite || ""}/ha × ${fmt(o.teneur,1)} kg N × Keq ${o.keq} (${PER_LABEL[o.per]}) = ${fmt(o.nEff)}`),
    arriere ? `− Arrière-effet des apports organiques ${y-1} : ${fmt(arriere)}` : "",
    pat.nEff ? `− Restitutions au pâturage : ${fmt(pat.ugb,1)} UGB × ${pat.jours} j → ${fmt(pat.nTot)} kg N/ha × ${P.keqPature} = ${fmt(pat.nEff)}` : "",
    corr ? `${corr > 0 ? "+" : "−"} Correction résidus (paille ${c.paille === "exportee" ? "exportée" : "enfouie"}) : ${fmt(Math.abs(corr))}` : "",
    `= Dose calculée : ${fmt(doseCalc)} kg N/ha`,
    `Plafond GREN culture : ${cult.plafond === "" ? "—" : fmt(plafond)} → dose retenue ${fmt(dosePlaf)} → arrondie ${fmt(doseFinale)} kg N/ha`
  ].filter(Boolean);
  return {p, c, cult, sol, rdt, besoin, besoinBrut, rf, irrig, rsh, mh, precEff, prec, cipanEff, cip, org, nOrgEff, nOrgTot,
    arriere, pat, fournSol, fournOrg, fournitures, corr, doseCalc, plafond, dosePlaf, doseFinale, minPrevu, nTotalHa,
    reste: doseFinale - minPrevu, forfait, trace};
}

/* =========================================================================
   VERROUS RÉGLEMENTAIRES
   ========================================================================= */
function bilanOrga(y, extra){
  y = y || S.annee; const cc = camp(y); let tot = 0;
  for (const p of S.parcelles) {
    for (const o of orgItems(p.id, y)) tot += o.nTot * num(p.surface);
    const e = cc.cultures[p.id]; if (e) tot += patureN(p, e).nTot * num(p.surface);
  }
  if (extra) tot += extra;
  const s = sau();
  return {tot, sau:s, parHa: s ? tot / s : 0, plafond: num(R().params.plafondOrga)};
}
function inWindow(mmdd, d, f){ return d <= f ? (mmdd >= d && mmdd <= f) : (mmdd >= d || mmdd <= f); }
function checkCalendrier(p, date, type, cultId){
  const cult = cultureById(cultId); if (!cult || !date) return null;
  const mmdd = date.slice(5);
  const z = p.zone || "standard";
  const hit = R().calendrier.find(r => r.cat === cult.cat && r.type === type && (r.zone === "toutes" || r.zone === z) && inWindow(mmdd, r.debut, r.fin));
  return hit ? {rule:hit, cult} : null;
}
const fmtMMJJ = s => { const [m,d] = String(s).split("-"); return `${d}/${m}`; };
function zarAlerts(y){
  const out = [];
  for (const p of S.parcelles) {
    if (p.zone !== "ZAR" && p.zone !== "BV") continue;
    const r = calc(p, y); if (!r) continue;
    if (r.nTotalHa > num(R().params.plafondZAR)) out.push({p, r});
  }
  return out;
}

/* =========================================================================
   GROUPES DE PARCELLES (5 conditions)
   ========================================================================= */
function orgSignature(pid, y){
  const sig = yy => orgItems(pid, yy).map(o => `${o.e.id || o.i.produit}:${Math.round(num(o.i.qte))}`).sort().join("+") || "aucun";
  return `${sig(y)} | ${y-1}: ${sig(y-1)}`;
}
function groupKey(p, y){
  const c = entry(p.id, y); const cult = cultureById(c.culture); if (!cult) return null;
  const rdt = rdtObjectif(p, c, cult, y).val;
  return {sol:p.sol, culture:c.culture, precedent:c.precedent || "", org:orgSignature(p.id, y), zone:p.zone || "standard", rdt:Math.round(rdt * 10) / 10};
}
const keyStr = k => k ? [k.sol, k.culture, k.precedent, k.org, k.zone, k.rdt].join("§") : null;
function proposerGroupes(y){
  const map = new Map();
  for (const p of S.parcelles) {
    const k = groupKey(p, y); if (!k) continue;
    const ks = keyStr(k); if (!map.has(ks)) map.set(ks, {key:k, ids:[]}); map.get(ks).ids.push(p.id);
  }
  return [...map.values()];
}
function groupStatus(g, y){
  const keys = g.ids.map(id => { const p = byId(S.parcelles, id); return p ? keyStr(groupKey(p, y)) : null; });
  return keys.every(k => k && k === keys[0]);
}

if (window.top !== window.self) { try { window.top.location = window.location.href; } catch(e){ document.documentElement.innerHTML = ""; } throw new Error("Affichage dans un cadre refusé"); }

/* =========================================================================
   SERVEUR (facultatif) : annonce, maintenance, référentiel officiel, audience
   ========================================================================= */
const CFG = window.GREN_CONFIG || {};
const SRV = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
let PUB = {};
let SESSION = "";
try { SESSION = sessionStorage.getItem("gren-session") || ""; if (!SESSION) { SESSION = uid() + uid(); sessionStorage.setItem("gren-session", SESSION); } } catch(e) { SESSION = uid() + uid(); }
async function rpc(fn, args = {}){
  if (!SRV) return null;
  const r = await fetch(`${CFG.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {method:"POST",
    headers:{"apikey":CFG.SUPABASE_ANON_KEY, "Authorization":"Bearer " + CFG.SUPABASE_ANON_KEY, "Content-Type":"application/json"}, body:JSON.stringify(args)});
  if (!r.ok) throw new Error("HTTP " + r.status);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
function suivre(type, culture){
  if (!SRV) return;
  const w = innerWidth;
  rpc("suivre", {p_type:type, p_session:SESSION, p_departement:S.exploitation.departement || null, p_culture:culture || null,
    p_appareil: w < 768 ? "mobile" : w < 1100 ? "tablette" : "ordinateur"}).catch(() => {});
}
const migrateRef = ref => migrate({version:1, ref:clone(ref)}).ref;
async function syncServeur(){
  if (!SRV) return;
  try {
    PUB = await rpc("config_publique") || {};
    renderAnnonce();
    if (PUB.maintenance) { render(); return; }
    if (PUB.referentiel_version && S.refSource !== "perso" && S.refVersion !== PUB.referentiel_version) {
      const r = await rpc("referentiel_officiel");
      if (r && r.contenu && Array.isArray(r.contenu.cultures)) {
        S.ref = migrateRef(r.contenu); S.refVersion = r.version; S.refPublieLe = r.publie_le; save(); render();
        toast(`Référentiel GREN officiel (version ${r.version}) chargé.`);
      }
    }
  } catch(e) { /* hors ligne : on garde le référentiel local */ }
}
function renderAnnonce(){
  const el = $("#annonce"); if (!el) return;
  if (!PUB.annonce) { el.innerHTML = ""; return; }
  const t = {info:"fr-notice--info", warning:"fr-notice--warning", error:"fr-notice--alert", success:"fr-notice--info"}[PUB.annonce_niveau] || "fr-notice--info";
  el.innerHTML = `<div class="fr-notice ${t}"><div class="fr-container"><div class="fr-notice__body"><p><span class="fr-notice__title">${esc(PUB.annonce)}</span></p></div></div></div>`;
}

/* =========================================================================
   COMPOSANTS DSFR
   ========================================================================= */
let _nid = 0; const nid = () => "c" + (++_nid);
// Identifiant du champ : celui fourni dans les attributs (id="…"), sinon un identifiant généré
function idDe(attrs){ const m = /\bid="([^"]+)"/.exec(attrs || ""); return m ? [m[1], attrs.replace(m[0], "")] : [nid(), attrs]; }
const lbl = (label, hint) => `${label}${hint ? `<span class="fr-hint-text">${hint}</span>` : ""}`;
function fInput(label, attrs, value = "", {hint = "", type = "text", cls = ""} = {}){
  let id; [id, attrs] = idDe(attrs);
  return `<div class="fr-input-group ${cls}"><label class="fr-label" for="${id}">${lbl(label, hint)}</label><input class="fr-input" id="${id}" type="${type}" ${attrs} value="${esc(value)}"></div>`;
}
function fSelect(label, attrs, optionsHtml, {hint = "", cls = ""} = {}){
  let id; [id, attrs] = idDe(attrs);
  return `<div class="fr-select-group ${cls}"><label class="fr-label" for="${id}">${lbl(label, hint)}</label><select class="fr-select" id="${id}" ${attrs}>${optionsHtml}</select></div>`;
}
function fTextarea(label, attrs, value = "", hint = ""){
  const id = nid();
  return `<div class="fr-input-group"><label class="fr-label" for="${id}">${lbl(label, hint)}</label><textarea class="fr-input" id="${id}" ${attrs} rows="3">${esc(value)}</textarea></div>`;
}
function fRadios(legend, name, attr, items, cur, {hint = "", inline = true} = {}){
  const lid = nid();
  return `<fieldset class="fr-fieldset" aria-labelledby="${lid}"><legend class="fr-fieldset__legend--regular fr-fieldset__legend" id="${lid}">${lbl(legend, hint)}</legend>
    ${items.map(([v, l]) => { const id = nid(); return `<div class="fr-fieldset__element ${inline ? "fr-fieldset__element--inline" : ""}"><div class="fr-radio-group"><input type="radio" id="${id}" name="${name}" ${attr} value="${esc(v)}" ${String(v) === String(cur) ? "checked" : ""}><label class="fr-label" for="${id}">${l}</label></div></div>`; }).join("")}
  </fieldset>`;
}
function fToggle(label, attrs, checked, hint = ""){
  const id = nid();
  return `<div class="fr-toggle fr-toggle--label-left fr-mb-2w"><input type="checkbox" class="fr-toggle__input" id="${id}" ${attrs} ${checked ? "checked" : ""} aria-describedby="${id}-aide"><label class="fr-toggle__label" for="${id}" data-fr-checked-label="Oui" data-fr-unchecked-label="Non">${esc(label)}</label>${hint ? `<p class="fr-hint-text" id="${id}-aide">${hint}</p>` : ""}</div>`;
}
function fCheckbox(label, attrs, checked, hint = ""){
  const id = nid();
  return `<div class="fr-checkbox-group"><input type="checkbox" id="${id}" ${attrs} ${checked ? "checked" : ""}><label class="fr-label" for="${id}">${lbl(label, hint)}</label></div>`;
}
const table = (inner, caption = "") => `<div class="fr-table fr-table--bordered fr-table--no-caption"><div class="fr-table__wrapper"><div class="fr-table__container"><div class="fr-table__content"><table>${caption ? `<caption>${esc(caption)}</caption>` : ""}${inner}</table></div></div></div></div>`;
const alerte = (type, titre, texte) => `<div class="fr-alert fr-alert--${type} fr-alert--sm fr-mb-3w">${titre ? `<h3 class="fr-alert__title">${titre}</h3>` : ""}${texte ? `<p>${texte}</p>` : ""}</div>`;
const badge = (txt, type = "") => `<p class="fr-badge fr-badge--sm ${type ? "fr-badge--" + type : ""} fr-badge--no-icon">${esc(txt)}</p>`;
const btn = (label, attrs, {kind = "", icon = "", sm = false} = {}) =>
  `<button type="button" class="fr-btn ${kind ? "fr-btn--" + kind : ""} ${sm ? "fr-btn--sm" : ""} ${icon ? `fr-btn--icon-left fr-icon-${icon}` : ""}" ${attrs}>${label}</button>`;
const kpi = (v, l, err) => `<div class="gren-kpi ${err ? "err" : ""}"><div class="v">${v}</div><div class="l">${l}</div></div>`;

/* =========================================================================
   VUES
   ========================================================================= */
const TABS_BASE = [
  ["accueil","Accueil"],["exploitation","Mon exploitation"],["parcelles","Mes parcelles"],["campagne","Calcul des doses"],["groupes","Groupes"],
  ["interventions","Mes apports"],["exporter","Exporter et comparer"],["aide","Guide et aide"]
];
const TABS_ALIAS = {ppf:"exporter", comparer:"exporter", referentiel:"admin", guide:"aide"};
let TABS = TABS_BASE;
function campagneSwitch(){
  return `<div class="gren-campagne" role="group" aria-label="Campagne">
    ${btn("Campagne précédente", `data-act="yPrev" title="Campagne précédente"`, {kind:"tertiary-no-outline", icon:"arrow-left-s-line", sm:true}).replace(">Campagne précédente<", "><span class=\"fr-sr-only\">Campagne précédente</span><")}
    <strong>Campagne ${S.annee - 1}-${S.annee}</strong>
    ${btn("Campagne suivante", `data-act="yNext" title="Campagne suivante"`, {kind:"tertiary-no-outline", icon:"arrow-right-s-line", sm:true}).replace(">Campagne suivante<", "><span class=\"fr-sr-only\">Campagne suivante</span><")}
  </div>`;
}
const bar = (titre, withYear = true) => `<div class="gren-bar"><h1>${titre}</h1>${withYear ? campagneSwitch() : ""}</div>`;

/* ---------- Pédagogie : étapes, explications ---------- */
const ETAPES = [["exploitation","Mon exploitation"],["parcelles","Mes parcelles"],["campagne","Calcul des doses"],["interventions","Mes apports"],["exporter","Exporter et comparer"]];
function etape(tab){
  const i = ETAPES.findIndex(e => e[0] === tab); if (i < 0) return "";
  const suiv = ETAPES[i + 1];
  return `<div class="fr-stepper fr-mb-3w"><h2 class="fr-stepper__title">${ETAPES[i][1]}<span class="fr-stepper__state">Étape ${i + 1} sur ${ETAPES.length}</span></h2>
    <div class="fr-stepper__steps" data-fr-current-step="${i + 1}" data-fr-steps="${ETAPES.length}"></div>
    ${suiv ? `<p class="fr-stepper__details"><span class="fr-text--bold">Étape suivante :</span> ${suiv[1]}</p>` : `<p class="fr-stepper__details">Dernière étape</p>`}</div>`;
}
function suite(tab){
  const i = ETAPES.findIndex(e => e[0] === tab); const prec = ETAPES[i - 1], suiv = ETAPES[i + 1];
  return `<ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--icon-left fr-mt-4w gren-noprint">
    ${prec ? `<li><a class="fr-btn fr-btn--secondary fr-btn--icon-left fr-icon-arrow-left-s-line" href="#${prec[0]}" data-tab="${prec[0]}">Retour : ${prec[1]}</a></li>` : ""}
    ${suiv ? `<li><a class="fr-btn fr-btn--icon-right fr-icon-arrow-right-s-line" href="#${suiv[0]}" data-tab="${suiv[0]}">Étape suivante : ${suiv[1]}</a></li>` : ""}</ul>`;
}
const aQuoiSert = (texte) => `<div class="fr-callout fr-callout--blue-ecume fr-mb-3w"><p class="fr-callout__title fr-h6">À quoi sert cette page ?</p><p class="fr-callout__text fr-text--md">${texte}</p></div>`;

/* ---------- Où sont gardées mes données ---------- */
function blocDonnees(compact = false){
  const c = conserver();
  return `<section class="gren-panel" id="mes-donnees" aria-labelledby="titre-donnees"><h2 class="fr-h5" id="titre-donnees">Où sont gardées mes informations ?</h2>
    <ul class="fr-mb-2w">
      <li><strong>Uniquement dans ce navigateur, sur cet appareil</strong> (ce téléphone ou cet ordinateur).</li>
      <li><strong>Elles ne sont envoyées à personne</strong> : ni à la préfecture, ni à la DDTM, ni à l'équipe de la Calculette. Personne d'autre que vous ne peut les voir.</li>
      <li>Elles <strong>ne vous suivent pas</strong> sur un autre appareil ou un autre navigateur. Pour cela, enregistrez une copie (onglet <a href="#exporter" data-tab="exporter">Exporter et comparer</a>).</li>
      ${compact ? "" : `<li>Elles sont gardées grâce au stockage du navigateur, qui fonctionne comme un cookie mais <strong>ne quitte jamais votre appareil</strong>. Si vous videz les cookies et données de navigation, elles sont effacées.</li>`}
    </ul>
    ${fToggle("Garder mes informations sur cet appareil pour les retrouver déjà remplies à ma prochaine visite", 'data-act="conserver"', c,
      c ? "Activé : vos informations restent sur cet appareil jusqu'à ce que vous les effaciez." : "Désactivé : vos informations seront effacées dès que vous fermerez cet onglet ou ce navigateur.")}
    ${c ? "" : alerte("warning", "", "Mode sans conservation : pensez à télécharger vos résultats avant de fermer la page.")}
    ${btn("Effacer toutes mes informations maintenant", 'data-act="reset"', {kind:"secondary", icon:"delete-line"})}
  </section>`;
}

function render(){
  _nid = 0;
  TABS = adminConnecte() ? [...TABS_BASE, ["admin","Administration"]] : TABS_BASE;
  if (TABS_ALIAS[S.tab]) S.tab = TABS_ALIAS[S.tab];
  if (!TABS.some(t => t[0] === S.tab)) S.tab = "accueil";
  document.querySelectorAll("[data-marque]").forEach(el => el.innerHTML = (CFG.MARQUE || ["Préfète","de la région","Bretagne"]).map(esc).join("<br>"));
  $("#tabs").innerHTML = TABS.map(([k, l]) => `<li class="fr-nav__item"><a class="fr-nav__link" href="#${k}" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ""}>${l}</a></li>`).join("");
  const v = $("#view");
  if (PUB.maintenance) { v.innerHTML = `<h1>Maintenance en cours</h1>${alerte("info", "", esc(PUB.maintenance_message || "Le service est momentanément indisponible."))}`; return; }
  v.innerHTML = (storageOK ? "" : alerte("warning", "Votre navigateur bloque l'enregistrement", "Vos informations ne pourront pas être gardées : téléchargez vos résultats avant de fermer la page (onglet Exporter et comparer).")) + (VIEWS[S.tab] || VIEWS.accueil)();
  if (VIEWS[S.tab + "_after"]) VIEWS[S.tab + "_after"]();
  document.title = `${(TABS.find(t => t[0] === S.tab) || TABS[0])[1]} — Calculette GREN`;
}
function globalBanners(){
  let h = "";
  const b = bilanOrga();
  if (b.parHa > b.plafond) h += alerte("error", `Limite de ${b.plafond} kg d'azote organique par hectare dépassée`, `Vos apports de fumier, lisier et pâturage représentent ${fmt(b.parHa)} kg N par hectare de SAU (${fmt(b.tot)} kg N pour ${fmt(b.sau, 2)} ha). C'est au-dessus de la limite de la Directive Nitrates : réduisez les apports organiques prévus.`);
  const z = zarAlerts();
  if (z.length) h += alerte("warning", "Parcelles en zone renforcée : beaucoup d'azote prévu", `${z.map(x => `${esc(parcelLabel(x.p))} : ${fmt(x.r.nTotalHa)} kg N/ha`).join(" · ")}. Le seuil indiqué (${R().params.plafondZAR} kg N/ha) est indicatif : vérifiez les règles de votre zone auprès de la DDTM.`);
  return h;
}
const VIEWS = {};

/* ---------- Accueil ---------- */
VIEWS.accueil = () => {
  const y = S.annee; const n = S.parcelles.length; const calc_ = S.parcelles.filter(p => calc(p, y)).length;
  const entree = (num_, titre, texte, boutons) => `<div class="fr-col-12 fr-col-lg-4"><div class="gren-entree"><p class="gren-entree__num" aria-hidden="true">${num_}</p><h2 class="fr-h5">${titre}</h2><p>${texte}</p><div class="gren-entree__btns">${boutons}</div></div></div>`;
  return `<h1>Calculer ma dose d'azote et préparer mon plan de fumure</h1>
  <p class="fr-text--lead">La Calculette GREN calcule, parcelle par parcelle, la quantité d'azote à apporter à vos cultures selon les règles du GREN Bretagne, puis prépare votre <strong>plan prévisionnel de fumure</strong> à télécharger.</p>
  ${n ? `<div class="fr-callout fr-mb-4w"><h2 class="fr-callout__title fr-h5">Reprendre où vous en étiez</h2>
      <p class="fr-callout__text fr-text--md">${esc(S.exploitation.raison || "Mon exploitation")} · ${n} parcelle${n > 1 ? "s" : ""} · ${calc_} dose${calc_ > 1 ? "s" : ""} calculée${calc_ > 1 ? "s" : ""} pour la récolte ${y}.</p>
      <ul class="fr-btns-group fr-btns-group--inline-sm fr-btns-group--icon-left"><li><a class="fr-btn fr-btn--icon-right fr-icon-arrow-right-s-line" href="#campagne" data-tab="campagne">Continuer</a></li><li><a class="fr-btn fr-btn--secondary" href="#exporter" data-tab="exporter">Télécharger mes résultats</a></li></ul></div>` : ""}
  <h2 class="fr-h4">Comment voulez-vous commencer ?</h2>
  <div class="fr-grid-row fr-grid-row--gutters fr-mb-4w">
    ${entree("1", "Je saisis mes informations dans l'application", "L'application vous guide écran par écran : votre exploitation, vos parcelles, vos cultures, puis vos apports de fumier, lisier et engrais. Idéal sur téléphone comme sur ordinateur.",
      `<a class="fr-btn fr-btn--icon-right fr-icon-arrow-right-s-line" href="#exploitation" data-tab="exploitation">Commencer la saisie</a>`)}
    ${entree("2", "Je remplis un fichier Excel", "Téléchargez le modèle Excel, remplissez-le tranquillement sur votre ordinateur (des listes déroulantes vous aident), puis importez-le ici : tout est rempli d'un coup.",
      `${btn("Télécharger le modèle Excel", 'data-act="modele"', {icon:"download-line"})}${boutonFichier("Importer mon fichier Excel", "importModele", {kind:"secondary"})}`)}
    ${entree("3", "J'ai besoin d'aide pour trouver mes informations", "Où trouver votre numéro PACAGE, vos îlots et surfaces, votre type de sol, vos reliquats ou vos rendements ? Le guide vous explique tout, avec un lexique des termes techniques.",
      `<a class="fr-btn fr-btn--secondary fr-btn--icon-right fr-icon-arrow-right-s-line" href="#aide" data-tab="aide">Lire le guide</a>`)}
  </div>
  ${n ? "" : `<p>Vous voulez d'abord voir à quoi ressemble l'outil ? ${btn("Découvrir avec une exploitation d'exemple", 'data-act="demo"', {kind:"tertiary", sm:true})}</p>`}
  <section class="gren-panel"><h2 class="fr-h5">Ce dont vous aurez besoin</h2>
    <div class="fr-grid-row fr-grid-row--gutters">
      <div class="fr-col-12 fr-col-md-6"><ul class="fr-mb-0"><li>votre <strong>numéro PACAGE</strong> ;</li><li>la liste de vos <strong>îlots et parcelles</strong> avec leur surface (déclaration PAC) ;</li><li>la <strong>culture prévue</strong> et la <strong>culture de l'an dernier</strong> sur chaque parcelle ;</li></ul></div>
      <div class="fr-col-12 fr-col-md-6"><ul class="fr-mb-0"><li>si vous en avez : vos <strong>analyses de sol</strong> (reliquats sortie hiver) ;</li><li>vos <strong>épandages prévus</strong> : fumier, lisier, engrais (quantités et dates) ;</li><li>vos <strong>rendements</strong> des dernières années (facultatif).</li></ul></div>
    </div>
    <p class="gren-mention fr-mt-2w fr-mb-0">Temps estimé : 15 à 30 minutes la première année, quelques minutes les années suivantes (vos parcelles et votre historique sont repris).</p>
  </section>
  ${blocDonnees()}`;
};

/* ---------- Exploitation ---------- */
VIEWS.exploitation = () => {
  const e = S.exploitation;
  return `${bar("Mon exploitation", false)}${etape("exploitation")}
  ${aQuoiSert("Ces informations identifient votre exploitation sur le plan de fumure. Vous ne les remplissez <strong>qu'une seule fois</strong> : elles sont reprises automatiquement les années suivantes, tant que vous gardez vos informations sur cet appareil.")}
  <section class="gren-panel"><h2 class="fr-h4">Identité de l'exploitation</h2>
    <div class="fr-grid-row fr-grid-row--gutters">
      <div class="fr-col-12 fr-col-md-4">${fInput("N° PACAGE", 'data-e="pacage" inputmode="numeric" maxlength="9" autocomplete="off"', e.pacage, {hint:"9 chiffres, sur vos courriers PAC ou votre compte Telepac"})}</div>
      <div class="fr-col-12 fr-col-md-4">${fInput("Raison sociale", 'data-e="raison"', e.raison, {hint:"Nom de la société (GAEC, EARL…) ou votre nom"})}</div>
      <div class="fr-col-12 fr-col-md-4">${fInput("Exploitant ou exploitante", 'data-e="exploitant" autocomplete="name"', e.exploitant, {hint:"Personne responsable du plan de fumure"})}</div>
      <div class="fr-col-12 fr-col-md-8">${fInput("Adresse", 'data-e="adresse" autocomplete="street-address"', e.adresse, {hint:"Adresse du siège de l'exploitation"})}</div>
      <div class="fr-col-12 fr-col-md-4">${fSelect("Département", 'data-e="departement"', Object.entries(DEPTS).map(([k, v]) => `<option value="${k}" ${e.departement === k ? "selected" : ""}>${k} — ${v}</option>`).join(""), {hint:"Sert à choisir les rendements de référence"})}</div>
      <div class="fr-col-12 fr-col-md-4">${fInput("Commune du siège", 'data-e="commune" list="communes" autocomplete="off"', e.commune, {hint:"Tapez les premières lettres puis choisissez"})}<datalist id="communes"></datalist></div>
      <div class="fr-col-12 fr-col-md-4">${fSelect("Type de sol le plus courant", 'data-e="sol"', opts(R().sols, e.sol), {hint:"Proposé par défaut pour vos parcelles ; modifiable parcelle par parcelle"})}</div>
      <div class="fr-col-12 fr-col-md-4">${fInput("Surface agricole utile (SAU), en hectares", `data-e="sau" inputmode="decimal" placeholder="${fmt(S.parcelles.reduce((a, p) => a + num(p.surface), 0), 2)}"`, e.sau, {hint:"Facultatif : sinon, c'est la somme de vos parcelles"})}</div>
    </div>
    <p class="gren-mention fr-mt-2w fr-mb-0">La SAU sert à vérifier que vos apports de fumier et lisier ne dépassent pas ${R().params.plafondOrga} kg d'azote par hectare (Directive Nitrates).</p>
  </section>
  ${blocDonnees(true)}
  ${suite("exploitation")}`;
};
let communeTimer;
VIEWS.exploitation_after = () => {
  const inp = $('[data-e="commune"]'); if (!inp) return;
  inp.addEventListener("input", () => {
    clearTimeout(communeTimer); const q = inp.value.trim(); if (q.length < 2) return;
    communeTimer = setTimeout(async () => {
      try {
        const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&codeRegion=53&fields=nom,code,codeDepartement&limit=12`);
        const list = await r.json();
        $("#communes").innerHTML = (Array.isArray(list) ? list : []).slice(0, 12).map(c => `<option value="${esc(c.nom)} (${esc(c.codeDepartement)})">`).join("");
      } catch(e){}
    }, 250);
  });
};

/* ---------- Parcelles ---------- */
VIEWS.parcelles = () => {
  const ps = S.parcelles; const tot = ps.reduce((a, p) => a + num(p.surface), 0);
  return `${bar("Mes parcelles", false)}${etape("parcelles")}
  ${aQuoiSert("Listez ici les parcelles qui recevront de l'azote. Le numéro d'îlot et de parcelle sont ceux de votre <strong>déclaration PAC</strong>. Le type de sol compte : un sol riche en matière organique fournit plus d'azote, donc la dose à apporter baisse. Vos parcelles sont gardées d'une année sur l'autre.")}
  <section class="gren-panel">
    <div class="gren-bar fr-mb-2w"><h2 class="fr-h4 fr-mb-0">${ps.length} parcelle${ps.length > 1 ? "s" : ""} · ${fmt(tot, 2)} ha</h2>
      <ul class="fr-btns-group fr-btns-group--inline-sm fr-btns-group--icon-left fr-mb-0">
        <li>${btn("Ajouter une parcelle", 'data-act="addParcelle"', {icon:"add-line"})}</li>
        <li>${btn("Modèle Excel", 'data-act="modele"', {kind:"secondary", icon:"download-line"})}</li>
        <li>${boutonFichier("Importer le fichier Excel", "importModele", {kind:"secondary"})}</li></ul></div>
    ${ps.length ? `${SEL.size ? `<div class="gren-selbar gren-selbar--action" role="group" aria-label="Actions sur les parcelles cochées">
        <strong>${selection().length} parcelle${SEL.size > 1 ? "s" : ""} cochée${SEL.size > 1 ? "s" : ""} :</strong>
        <select class="fr-select gren-selbar__select" id="lotSol" aria-label="Type de sol pour les parcelles cochées"><option value="">Type de sol…</option>${opts(R().sols, "")}</select>
        <select class="fr-select gren-selbar__select" id="lotZone" aria-label="Zonage pour les parcelles cochées"><option value="">Zonage…</option>${opts(ZONES, "")}</select>
        <select class="fr-select gren-selbar__select" id="lotDept" aria-label="Département pour les parcelles cochées"><option value="">Département…</option>${Object.keys(DEPTS).map(k => `<option>${k}</option>`).join("")}</select>
        ${btn("Appliquer", 'data-act="lotAppliquer"', {sm:true, icon:"check-line"})}${btn("Supprimer", 'data-act="lotSupprimer"', {kind:"tertiary", sm:true, icon:"delete-line"})}${btn("Tout décocher", 'data-act="selAucune"', {kind:"tertiary-no-outline", sm:true})}
      </div>` : `<p class="gren-mention">Astuce : cochez plusieurs parcelles pour leur donner d'un coup le même type de sol ou le même zonage.</p>`}` + table(`<thead><tr><th scope="col">${caseCocher("cocheToutP", "Tout cocher", SEL.size && selection().length === ps.length, 'data-act="cocheTout"')}</th><th scope="col">Îlot</th><th scope="col">Parcelle</th><th scope="col">Nom (pour vous repérer)</th><th scope="col">Surface (ha)</th><th scope="col">Type de sol</th><th scope="col">Zonage</th><th scope="col">Dépt</th><th scope="col"><span class="fr-sr-only">Actions</span></th></tr></thead>
      <tbody>${ps.map(p => `<tr data-pid="${esc(p.id)}" class="${SEL.has(p.id) ? "gren-sel" : ""}">
        <td>${caseCocher("chp-" + esc(p.id), "Cocher " + esc(parcelLabel(p)), SEL.has(p.id), `data-coche="${esc(p.id)}"`)}</td>
        <td><input class="fr-input" aria-label="Numéro d'îlot" data-p="ilot" value="${esc(p.ilot)}" style="width:4.5rem"></td>
        <td><input class="fr-input" aria-label="Numéro de parcelle" data-p="num" value="${esc(p.num)}" style="width:4.5rem"></td>
        <td><input class="fr-input" aria-label="Nom de la parcelle" data-p="nom" value="${esc(p.nom)}" placeholder="ex. Grand champ"></td>
        <td><input class="fr-input" aria-label="Surface en hectares" data-p="surface" value="${esc(p.surface)}" inputmode="decimal" style="width:6rem"></td>
        <td><select class="fr-select" aria-label="Type de sol" data-p="sol">${opts(R().sols, p.sol)}</select></td>
        <td><select class="fr-select" aria-label="Zonage" data-p="zone">${opts(ZONES, p.zone || "standard")}</select></td>
        <td><select class="fr-select" aria-label="Département" data-p="dept">${Object.keys(DEPTS).map(k => `<option ${dept(p) === k ? "selected" : ""}>${k}</option>`).join("")}</select></td>
        <td>${btn("Supprimer", 'data-act="delParcelle" title="Supprimer la parcelle"', {kind:"tertiary-no-outline", icon:"delete-line", sm:true})}</td>
      </tr>`).join("")}</tbody>`) : `<p>Aucune parcelle pour l'instant. Cliquez sur « Ajouter une parcelle », ou remplissez le modèle Excel puis importez-le.</p>`}
  </section>
  <div class="fr-accordions-group fr-mb-3w">
    <section class="fr-accordion"><h3 class="fr-accordion__title"><button type="button" class="fr-accordion__btn" aria-expanded="false" aria-controls="acc-sol">Comment connaître mon type de sol ?</button></h3>
      <div class="fr-collapse" id="acc-sol"><p>Regardez vos <strong>analyses de terre</strong> (bulletin du laboratoire), demandez à votre technicien, ou consultez la carte des sols de Bretagne (portail « Sols de Bretagne »). À défaut, choisissez le type le plus proche de ce que vous connaissez de la parcelle : limon profond et sain, terre humide l'hiver (hydromorphe), sol sur schiste, sol sableux ou sur granite, sol argileux, ou sol très riche en matière organique.</p></div></section>
    <section class="fr-accordion"><h3 class="fr-accordion__title"><button type="button" class="fr-accordion__btn" aria-expanded="false" aria-controls="acc-zone">Que mettre dans « Zonage » ?</button></h3>
      <div class="fr-collapse" id="acc-zone"><p>Laissez <strong>« Standard »</strong> dans la plupart des cas. Choisissez « ZAR » si la parcelle est en <strong>zone d'actions renforcées</strong>, ou « Bassin versant en contentieux » si elle est dans un bassin concerné par un contentieux sur les nitrates : des règles plus strictes s'appliquent. En cas de doute, renseignez-vous auprès de la <strong>DDTM</strong> de votre département ou de votre mairie.</p></div></section>
  </div>
  ${suite("parcelles")}`;
};

/* ---------- Sélection de plusieurs parcelles (saisie groupée) ---------- */
let SEL = new Set();
const selection = () => { SEL = new Set([...SEL].filter(id => byId(S.parcelles, id))); return [...SEL]; };
const caseCocher = (id, label, coche, attrs) => `<div class="fr-checkbox-group fr-checkbox-group--sm gren-case"><input type="checkbox" id="${id}" ${attrs} ${coche ? "checked" : ""}><label class="fr-label" for="${id}"><span class="fr-sr-only">${label}</span></label></div>`;
function modeSaisie(){
  const m = S.modeSaisie === "groupe" ? "groupe" : "unite";
  const el = (v, l, ic) => { const id = nid(); return `<div class="fr-segmented__element"><input value="${v}" ${m === v ? "checked" : ""} type="radio" id="${id}" name="modeSaisie" data-act="modeSaisie"><label class="fr-icon-${ic} fr-label" for="${id}">${l}</label></div>`; };
  return `<fieldset class="fr-segmented fr-mb-3w"><legend class="fr-segmented__legend fr-segmented__legend--inline">Je remplis :</legend>
    <div class="fr-segmented__elements">${el("unite", "une parcelle à la fois", "file-text-line")}${el("groupe", "plusieurs parcelles en même temps", "list-unordered")}</div></fieldset>`;
}
function barreSelection(y){
  const ids = selection(); const groupes = camp(y).groupes || [];
  const cultures = [...new Set(S.parcelles.map(p => entry(p.id, y).culture).filter(Boolean))];
  return `<div class="gren-selbar">
    <span><strong>${ids.length}</strong> parcelle${ids.length > 1 ? "s" : ""} cochée${ids.length > 1 ? "s" : ""}</span>
    ${btn("Tout cocher", 'data-act="selTout"', {kind:"tertiary", sm:true})}${btn("Tout décocher", 'data-act="selAucune"', {kind:"tertiary", sm:true})}
    ${cultures.length ? `<select class="fr-select gren-selbar__select" aria-label="Cocher toutes les parcelles d'une culture" data-act="selCulture"><option value="">Cocher par culture…</option>${cultures.map(c => `<option value="${esc(c)}">${esc(cultureById(c)?.nom || c)}</option>`).join("")}</select>` : ""}
    ${groupes.length ? `<select class="fr-select gren-selbar__select" aria-label="Cocher les parcelles d'un groupe validé" data-act="selGroupe"><option value="">Cocher un groupe…</option>${groupes.map((g, i) => `<option value="${i}">${esc(g.nom)}</option>`).join("")}</select>` : ""}
  </div>`;
}
// Valeur commune à plusieurs parcelles, ou MIXTE si elles diffèrent
const MIXTE = "__mixte__";
function valeurCommune(ids, y, f){
  const v = ids.map(id => { const c = entry(id, y); return f === "irrigation" ? (c.irrigation ? "oui" : "non") : f === "pature.jours" ? (c.pature?.jours ?? "") : (c[f] ?? ""); });
  return v.every(x => String(x) === String(v[0])) ? v[0] : MIXTE;
}
function selectGroupe(label, f, options, ids, y, hint){
  const cur = valeurCommune(ids, y, f);
  return fSelect(label, `data-g="${f}"`, (cur === MIXTE ? `<option value="${MIXTE}" selected>— Différent selon les parcelles —</option>` : "") + options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`).join(""), {hint});
}
function inputGroupe(label, f, ids, y, {type = "text", hint = "", attrs = ""} = {}){
  const cur = valeurCommune(ids, y, f);
  return fInput(label, `data-g="${f}" ${attrs} ${cur === MIXTE ? 'placeholder="Différent selon les parcelles"' : ""}`, cur === MIXTE ? "" : cur, {type, hint});
}
function detailGroupe(y){
  const ids = selection();
  if (!ids.length) return `<section class="gren-panel" id="detail"><h2 class="fr-h4">Saisie groupée</h2>
    <p>Cochez à gauche les parcelles à remplir ensemble : par exemple toutes celles en blé, ou toutes celles qui reçoivent le même lisier.</p>
    <p class="gren-mention fr-mb-0">Ce que vous saisirez ici s'appliquera à <strong>toutes les parcelles cochées</strong>. Les autres ne changent pas.</p></section>`;
  const ps = ids.map(id => byId(S.parcelles, id));
  const surf = ps.reduce((a, p) => a + num(p.surface), 0);
  const cultCommune = valeurCommune(ids, y, "culture"); const cult = cultCommune !== MIXTE ? cultureById(cultCommune) : null;
  const sols = new Set(ps.map(p => p.sol)), zones = new Set(ps.map(p => p.zone || "standard"));
  const rdtMode = valeurCommune(ids, y, "rdtMode"), rshMode = valeurCommune(ids, y, "rshMode");
  const res = ps.map(p => ({p, r:calc(p, y)}));
  return `<section class="gren-panel" id="detail">
    <h2 class="fr-h4">Saisie groupée : ${ids.length} parcelle${ids.length > 1 ? "s" : ""} (${fmt(surf, 2)} ha)</h2>
    <p class="gren-mention">${ps.map(p => esc(parcelLabel(p))).join(" · ")}</p>
    ${alerte("info", "", "Chaque choix fait ici est appliqué <strong>tout de suite à toutes les parcelles cochées</strong>. Quand les parcelles ont des valeurs différentes, le champ indique « Différent selon les parcelles » : laissez-le ainsi pour ne rien changer.")}
    ${sols.size > 1 || zones.size > 1 ? alerte("warning", "", `Ces parcelles n'ont pas toutes le même ${sols.size > 1 ? "type de sol" : ""}${sols.size > 1 && zones.size > 1 ? " ni le même " : ""}${zones.size > 1 ? "zonage" : ""} : la dose sera calculée pour chacune et peut donc être différente.`) : ""}

    <h3 class="gren-section">1. Culture et rendement</h3>
    <div class="fr-grid-row fr-grid-row--gutters">
      <div class="fr-col-12 fr-col-md-6">${selectGroupe(`Culture récoltée en ${y}`, "culture", [["", "— Choisir —"], ...R().cultures.map(c => [c.id, c.nom])], ids, y)}</div>
      <div class="fr-col-12 fr-col-md-6">${selectGroupe("Culture précédente", "precedent", [["", "— Choisir —"], ...R().precedents.map(c => [c.id, c.nom])], ids, y)}</div>
      <div class="fr-col-12 fr-col-md-6">${selectGroupe("Rendement visé", "rdtMode", [["ref", "Valeur de référence GREN"], ["hist", "Moyenne de mes 5 dernières années"], ["libre", "Je saisis mon objectif"]], ids, y, "Plus le rendement visé est élevé, plus la culture a besoin d'azote")}</div>
      ${rdtMode === "libre" ? `<div class="fr-col-12 fr-col-md-6">${inputGroupe(`Mon objectif de rendement${cult ? ` (${esc(cult.unite)})` : ""}`, "rdtLibre", ids, y, {attrs:'inputmode="decimal"'})}</div>` : ""}
    </div>

    <h3 class="gren-section">2. Azote déjà disponible dans le sol</h3>
    <div class="fr-grid-row fr-grid-row--gutters">
      <div class="fr-col-12 fr-col-md-6">${selectGroupe("Reliquat sortie hiver", "rshMode", [["forfait", "Je n'ai pas d'analyse : valeur moyenne"], ["mesure", "J'ai une analyse de sol"]], ids, y)}</div>
      ${rshMode === "mesure" ? `<div class="fr-col-12 fr-col-md-6">${inputGroupe("Résultat de l'analyse (kg N/ha)", "rshMesure", ids, y, {attrs:'inputmode="decimal"', hint:"Le même résultat sera mis sur toutes les parcelles cochées"})}</div>` : ""}
      <div class="fr-col-12 fr-col-md-6">${selectGroupe("Couvert semé avant la culture", "cipan", R().cipan.map(c => [c.id, c.nom]), ids, y)}</div>
      <div class="fr-col-12 fr-col-md-6">${inputGroupe("Date de destruction du couvert", "cipanDate", ids, y, {type:"date"})}</div>
    </div>

    <h3 class="gren-section">3. Vos pratiques</h3>
    <div class="fr-grid-row fr-grid-row--gutters">
      <div class="fr-col-12 fr-col-md-6">${selectGroupe("Pailles de la culture précédente", "paille", [["", "Pas de paille"], ["exportee", "Récoltées (exportées)"], ["enfouie", "Laissées au champ (enfouies)"]], ids, y)}</div>
      <div class="fr-col-12 fr-col-md-6">${selectGroupe("Parcelles irriguées", "irrigation", [["non", "Non"], ["oui", "Oui"]], ids, y)}</div>
    </div>

    <h3 class="gren-section">4. Fumier, lisier et engrais</h3>
    <p class="gren-mention">Ajoute le même épandage (même produit, même quantité par hectare, même date) sur chacune des parcelles cochées.</p>
    ${btn(`Ajouter un épandage sur ces ${ids.length} parcelles`, 'data-act="addIntervSel"', {kind:"secondary", icon:"add-line", sm:true})}

    <h3 class="gren-section">Résultat pour chaque parcelle</h3>
    ${table(`<thead><tr><th scope="col">Parcelle</th><th scope="col" class="num">ha</th><th scope="col">Culture</th><th scope="col" class="num">Dose (kg N/ha)</th><th scope="col" class="num">Total (kg N)</th><th scope="col"></th></tr></thead>
      <tbody>${res.map(({p, r}) => `<tr><td><strong>${esc(parcelLabel(p))}</strong><br><span class="gren-mention">${esc(solById(p.sol).nom)}</span></td><td class="num">${fmt(num(p.surface), 2)}</td>
        <td>${r ? esc(r.cult.nom) : `<span class="gren-mention">à choisir</span>`}</td><td class="num"><strong>${r ? fmt(r.doseFinale) : "—"}</strong></td><td class="num">${r ? fmt(r.doseFinale * num(p.surface)) : "—"}</td>
        <td>${btn("Détail", `data-act="voirParcelle" data-pid="${esc(p.id)}"`, {kind:"tertiary-no-outline", sm:true})}</td></tr>`).join("")}
        <tr><th scope="row">Total</th><td class="num">${fmt(surf, 2)}</td><td></td><td></td><td class="num"><strong>${fmt(res.reduce((a, x) => a + (x.r ? x.r.doseFinale * num(x.p.surface) : 0), 0))}</strong></td><td></td></tr></tbody>`)}
    <p class="gren-mention fr-mb-0">Pour une particularité propre à une seule parcelle (rendement, analyse, animaux au pâturage, notes), cliquez sur « Détail » : vous passez en saisie parcelle par parcelle.</p>
  </section>`;
}
function appliquerGroupe(f, v){
  const ids = selection(); if (!ids.length || v === MIXTE) return;
  for (const id of ids) { const c = entry(id, S.annee);
    if (f === "irrigation") c.irrigation = v === "oui";
    else c[f] = v;
    if (f === "rdtLibre") c.rdtMode = "libre";
    if (f === "rshMesure") c.rshMode = "mesure"; }
  if (f === "culture" && v) suivre("calcul", v);
}

/* ---------- Calcul ---------- */
VIEWS.campagne = () => {
  if (!S.parcelles.length) return `${bar("Calcul des doses")}${etape("campagne")}${alerte("info", "Il faut d'abord vos parcelles", `Ajoutez vos parcelles dans <a href="#parcelles" data-tab="parcelles">Mes parcelles</a>, ou importez le modèle Excel depuis l'<a href="#accueil" data-tab="accueil">accueil</a>.`)}`;
  const y = S.annee; const isNew = !hasCamp(y);
  const rows = S.parcelles.map(p => ({p, c:entry(p.id, y), r:calc(p, y)}));
  if (isNew) { save(); suivre("nouvelle_campagne"); }
  if (!S.sel || !byId(S.parcelles, S.sel)) S.sel = S.parcelles[0].id;
  const sel = rows.find(x => x.p.id === S.sel);
  const groupe = S.modeSaisie === "groupe"; const sel_ = selection();
  const done = rows.filter(x => x.r);
  const totN = done.reduce((a, x) => a + x.r.doseFinale * num(x.p.surface), 0);
  const b = bilanOrga();
  return `${bar("Calcul des doses")}${etape("campagne")}
  ${aQuoiSert(`Pour chaque parcelle, choisissez la culture qui sera récoltée en ${y} et répondez aux questions. L'outil calcule alors la <strong>dose d'azote à apporter en engrais</strong> : ce dont la culture a besoin, moins ce que le sol, la culture précédente et vos effluents lui fournissent déjà. Les champs déjà remplis l'an dernier sont repris.`)}
  ${globalBanners()}
  <div class="gren-kpis">${kpi(`${done.length}/${rows.length}`, "parcelles calculées")}${kpi(fmt(totN) + " kg", "d'azote en engrais à prévoir sur l'exploitation")}${kpi(fmt(b.parHa) + " kg", `d'azote organique par hectare (limite ${b.plafond})`, b.parHa > b.plafond)}</div>
  ${modeSaisie()}
  <div class="gren-layout">
    <section class="gren-panel"><h2 class="fr-h4">Parcelles — récolte ${y}</h2>
      ${groupe ? barreSelection(y) : ""}
      ${table(`<thead><tr>${groupe ? `<th scope="col">${caseCocher("cocheTout", "Tout cocher", sel_.length === rows.length, 'data-act="cocheTout"')}</th>` : ""}<th scope="col">Parcelle</th><th scope="col" class="num">ha</th><th scope="col">Culture</th><th scope="col" class="num">Dose</th></tr></thead>
        <tbody>${rows.map(({p, c, r}) => groupe ? `<tr class="gren-click ${SEL.has(p.id) ? "gren-sel" : ""}" data-cochep="${esc(p.id)}">
          <td>${caseCocher("ch-" + esc(p.id), "Cocher " + esc(parcelLabel(p)), SEL.has(p.id), `data-coche="${esc(p.id)}"`)}</td>
          <td><strong>${esc(parcelLabel(p))}</strong><br><span class="gren-mention">${esc(solById(p.sol).nom)}</span> ${p.zone && p.zone !== "standard" ? zonePill(p.zone) : ""}</td>
          <td class="num">${fmt(num(p.surface), 2)}</td>
          <td>${c.culture ? esc(cultureById(c.culture)?.nom) : `<span class="gren-mention">à choisir</span>`}</td>
          <td class="num">${r ? `<strong>${fmt(r.doseFinale)}</strong>` : "—"}</td></tr>` : `<tr class="gren-click ${p.id === S.sel ? "gren-sel" : ""}" data-selp="${esc(p.id)}" tabindex="0" aria-selected="${p.id === S.sel}">
          <td><strong>${esc(parcelLabel(p))}</strong><br><span class="gren-mention">${esc(solById(p.sol).nom)}</span> ${p.zone && p.zone !== "standard" ? zonePill(p.zone) : ""}</td>
          <td class="num">${fmt(num(p.surface), 2)}</td>
          <td>${c.culture ? esc(cultureById(c.culture)?.nom) : `<span class="gren-mention">à choisir</span>`}</td>
          <td class="num">${r ? `<strong>${fmt(r.doseFinale)}</strong>` : "—"}</td></tr>`).join("")}</tbody>`)}
      <p class="gren-mention fr-mb-0">Doses en kilos d'azote par hectare (kg N/ha). ${groupe ? "<strong>Cochez les parcelles</strong> à remplir ensemble." : "<strong>Cliquez sur une parcelle</strong> pour la remplir."}</p>
    </section>
    <div>${groupe ? detailGroupe(y) : sel ? detail(sel.p, y) : ""}</div>
  </div>
  ${suite("campagne")}`;
};
function detail(p, y){
  const c = entry(p.id, y); const cult = cultureById(c.culture); const r = calc(p, y);
  const prevE = S.campagnes[y - 1] && S.campagnes[y - 1].cultures[p.id];
  const prevC = prevE && cultureById(prevE.culture);
  const hist = cult ? histValues(p, c, y) : [];
  const unite = cult ? cult.unite : "";
  const isPrairie = cult && cult.cat === "prairie";
  const bilanM = cult && cult.methode !== "forfait";
  const pa = c.pature || {animaux:[]};
  return `<section class="gren-panel" data-pid="${esc(p.id)}" id="detail">
    <div class="gren-bar fr-mb-1w"><h2 class="fr-h4 fr-mb-0">${esc(parcelLabel(p))} ${zonePill(p.zone || "standard")}</h2>
</div>
    <p class="gren-mention">Îlot ${esc(p.ilot)}, parcelle ${esc(p.num)} · ${fmt(num(p.surface), 2)} ha · ${esc(solById(p.sol).nom)}</p>

    <h3 class="gren-section">1. Culture et rendement</h3>
    <div class="fr-grid-row fr-grid-row--gutters">
      <div class="fr-col-12 fr-col-md-6">${fSelect(`Culture récoltée en ${y}`, 'data-c="culture"', opts(R().cultures, c.culture, "— Choisir —"), {hint:"La culture qui va recevoir l'azote"})}</div>
      <div class="fr-col-12 fr-col-md-6">${fSelect("Culture précédente (précédent)", 'data-c="precedent"', opts(R().precedents, c.precedent, "— Choisir —"), {hint: prevC ? `Repris de ${y - 1} : ${esc(prevC.nom)}` : "La culture récoltée l'an dernier : certaines (légumineuses, prairie retournée) laissent de l'azote"})}</div>
    </div>
    ${bilanM ? `
    ${fRadios("Rendement visé", "rdt" + p.id, 'data-c="rdtMode"', [["ref", `Valeur de référence GREN (${fmt(num(cult["rdt" + dept(p)]), 1)} ${unite})`], ["hist", "Moyenne de mes 5 dernières années"], ["libre", "Je saisis mon objectif"]], c.rdtMode, {hint:"Plus le rendement visé est élevé, plus la culture a besoin d'azote. Restez réaliste : la moyenne de vos dernières années est souvent le meilleur choix."})}
    <div class="fr-grid-row fr-grid-row--gutters">
      ${c.rdtMode === "hist" ? `<div class="fr-col-12 fr-col-md-6">${fInput(`Rendements des 5 dernières années (${unite})`, `data-c="rdtHist" placeholder="${hist.length ? esc(hist.map(v => fmt(v, 1)).join(" ; ")) + " (auto)" : "ex. 78 ; 82 ; 65 ; 80 ; 76"}"`, c.rdtHist, {hint: (String(c.rdtHist || "").trim() ? "Vos valeurs. " : hist.length ? "Repris de vos campagnes précédentes (même culture, même sol). " : "Séparez les valeurs par des points-virgules. ") + "L'année la plus haute et la plus basse sont écartées, puis la moyenne est faite."})}</div>` : ""}
      ${c.rdtMode === "libre" ? `<div class="fr-col-12 fr-col-md-6">${fInput(`Mon objectif de rendement (${unite})`, 'data-c="rdtLibre" inputmode="decimal"', c.rdtLibre)}</div>` : ""}
      <div class="fr-col-12 fr-col-md-6">${fInput(`Rendement réalisé ${y} (${unite})`, 'data-c="rdtRealise" inputmode="decimal" placeholder="après récolte"', c.rdtRealise, {hint:"À remplir après la récolte : il servira à calculer votre moyenne les années suivantes."})}</div>
    </div>` : cult ? `<p class="gren-mention">Pour cette culture, le GREN fixe une dose forfaitaire : pas besoin de rendement.</p>` : ""}

    ${cult ? `
    ${bilanM ? `
    <h3 class="gren-section">2. Azote déjà disponible dans le sol</h3>
    ${fRadios("Reliquat sortie hiver (azote présent dans le sol en fin d'hiver)", "rsh" + p.id, 'data-c="rshMode"', [["forfait", `Je n'ai pas d'analyse : valeur moyenne (${fmt(num(solById(p.sol)[cult.cat === "automne" ? "rshAut" : "rshPri"]))} kg N/ha)`], ["mesure", "J'ai une analyse de sol"]], c.rshMode === "mesure" ? "mesure" : "forfait", {hint:"Une analyse faite en fin d'hiver donne une dose plus juste qu'une valeur moyenne."})}
    ${c.rshMode === "mesure" ? `<div class="fr-grid-row"><div class="fr-col-12 fr-col-md-6">${fInput("Résultat de l'analyse (kg N/ha)", 'data-c="rshMesure" inputmode="decimal"', c.rshMesure, {hint:"Total d'azote minéral indiqué par le laboratoire, sur toute la profondeur analysée"})}</div></div>` : ""}
    <div class="fr-grid-row fr-grid-row--gutters">
      <div class="fr-col-12 fr-col-md-6">${fSelect("Couvert semé avant la culture", 'data-c="cipan"', opts(R().cipan, c.cipan), {hint:"Plante semée entre deux cultures (CIPAN : moutarde, phacélie…). Détruite, elle rend une partie de l'azote."})}</div>
      <div class="fr-col-12 fr-col-md-6">${fInput("Date de destruction du couvert", 'data-c="cipanDate"', c.cipanDate, {type:"date", hint:"Un couvert détruit tard (fin d'hiver) rend plus d'azote à la culture suivante"})}</div>
    </div>
    <h3 class="gren-section">3. Vos pratiques</h3>
    ${fRadios("Que sont devenues les pailles de la culture précédente ?", "pa" + p.id, 'data-c="paille"', [["", "Pas de paille"], ["exportee", "Récoltées (exportées)"], ["enfouie", "Laissées au champ (enfouies)"]], c.paille || "")}
    ${fCheckbox(`Parcelle irriguée${num(cult.irrig) ? ` (la culture a alors besoin de ${cult.irrig} kg N/ha en plus)` : ""}`, 'data-c="irrigation"', c.irrigation)}` : ""}

    <h3 class="gren-section">4. Fumier, lisier et autres effluents</h3>
    <p class="gren-mention">L'azote des effluents est compté en partie : seule la part disponible pour la culture est déduite (elle dépend du produit et de la date d'épandage).</p>
    ${r.org.length ? table(`<thead><tr><th scope="col">Date</th><th scope="col">Effluent</th><th scope="col" class="num">Qté/ha</th><th scope="col" class="num">N total</th><th scope="col" class="num">Part utile</th><th scope="col" class="num">Azote utile</th><th scope="col">Statut</th></tr></thead><tbody>
      ${r.org.map(o => `<tr><td>${esc(frDate(o.i.date))}</td><td>${esc(o.e.nom)}</td><td class="num">${fmt(num(o.i.qte), 1)} ${esc(o.e.unite || "")}</td><td class="num">${fmt(o.nTot)}</td><td class="num">${fmt(o.keq * 100)} %</td><td class="num"><strong>${fmt(o.nEff)}</strong></td><td>${statutPill(o.i.statut)}</td></tr>`).join("")}
    </tbody>`) : `<p class="gren-mention">Aucun épandage enregistré pour cette parcelle.</p>`}
    ${r.arriere ? `<p class="gren-mention">Les effluents épandus en ${y - 1} libèrent encore <strong>${fmt(r.arriere)} kg N/ha</strong> cette année (calculé automatiquement).</p>` : ""}
    ${btn("Ajouter un épandage", `data-act="addInterv" data-pid="${esc(p.id)}"`, {kind:"secondary", icon:"add-line", sm:true})}

    ${isPrairie ? `
    <h3 class="gren-section">5. Animaux au pâturage</h3>
    <p class="gren-mention">Les animaux qui pâturent laissent de l'azote sur la prairie. Indiquez le troupeau et le nombre de jours : l'outil convertit en UGB (unité gros bovin) et en azote.</p>
    ${(pa.animaux || []).length ? table(`<thead><tr><th scope="col">Catégorie</th><th scope="col">Nombre</th><th scope="col" class="num">UGB</th><th scope="col"><span class="fr-sr-only">Actions</span></th></tr></thead><tbody>
      ${pa.animaux.map((a, i) => `<tr><td><select class="fr-select" aria-label="Catégorie d'animaux" data-pat="cat" data-i="${i}">${opts(R().animaux, a.cat)}</select></td><td><input class="fr-input" aria-label="Nombre d'animaux" data-pat="n" data-i="${i}" value="${esc(a.n)}" inputmode="decimal" style="width:6rem"></td><td class="num">${fmt(num(a.n) * num((byId(R().animaux, a.cat) || {ugb:0}).ugb), 2)}</td><td>${btn("Retirer", `data-act="delAnimal" data-i="${i}"`, {kind:"tertiary-no-outline", icon:"delete-line", sm:true})}</td></tr>`).join("")}
    </tbody>`) : ""}
    <div class="fr-grid-row fr-grid-row--gutters fr-grid-row--bottom">
      <div class="fr-col-12 fr-col-md-4">${fInput("Nombre de jours de pâture sur la parcelle", 'data-c="pature.jours" inputmode="numeric"', pa.jours)}</div>
      <div class="fr-col-12 fr-col-md-8">${btn("Ajouter des animaux", 'data-act="addAnimal"', {kind:"secondary", icon:"add-line", sm:true})} <span class="gren-mention">${fmt(r.pat.ugb, 2)} UGB → ${fmt(r.pat.nTot)} kg N/ha restitués</span></div>
    </div>` : ""}

    <h3 class="gren-section">Résultat</h3>
    <p>La culture a besoin de <strong>${fmt(r.besoin)} kg</strong> d'azote par hectare. Le sol, la culture précédente${r.fournOrg ? " et vos effluents" : ""} en fournissent déjà <strong>${fmt(r.fournitures)} kg</strong>. ${r.doseFinale > 0 ? `Il reste donc <strong>${fmt(r.doseFinale)} kg/ha</strong> à apporter en engrais.` : "Vous n'avez donc <strong>pas besoin d'apporter d'engrais azoté</strong> sur cette parcelle."}</p>
    ${formulaBlocks(r)}
    ` : `<p class="fr-mt-2w">Choisissez la culture pour lancer le calcul.</p>`}
    <div class="fr-mt-3w">${fTextarea("Mes notes sur cette parcelle", 'data-c="notes"', c.notes, "Elles apparaissent dans le plan de fumure détaillé")}</div>
  </section>`;
}
const frDate = d => d ? d.split("-").reverse().join("/") : "";
function formulaBlocks(r){
  const b = (cls, v, l, s) => `<div class="gren-blk ${cls}"><div class="l">${l}</div><div class="v">${fmt(v)}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const op = o => `<div class="gren-op" aria-hidden="true">${o}</div>`;
  const parts = [b("need", r.besoin, "Besoins de la culture", r.forfait ? "forfait GREN" : `${fmt(r.rdt.val, 1)} ${esc(r.cult.unite)} × ${r.cult.b}${r.rf ? " + Rf " + r.rf : ""}${r.irrig ? " + irrig. " + r.irrig : ""}`)];
  if (!r.forfait) {
    parts.push(op("−"), b("sup", r.rsh, "Reliquat sortie hiver", r.c.rshMode === "mesure" ? "mesuré" : "forfait"));
    parts.push(op("−"), b("sup", r.mh, "Fourni par le sol", "selon le type de sol"));
    if (r.precEff) parts.push(op("−"), b("sup", r.precEff, "Effet précédent", esc(r.prec?.nom || "")));
    if (r.cipanEff) parts.push(op("−"), b("sup", r.cipanEff, "Couvert", ""));
  }
  if (r.nOrgEff) parts.push(op("−"), b("sup", r.nOrgEff, "Fumier, lisier…", `${r.org.length} apport(s)`));
  if (r.arriere) parts.push(op("−"), b("sup", r.arriere, "Effluents de l'an dernier", "effet restant"));
  if (r.pat.nEff) parts.push(op("−"), b("sup", r.pat.nEff, "Pâturage", `${fmt(r.pat.ugb, 1)} UGB`));
  if (r.corr) parts.push(op(r.corr > 0 ? "+" : "−"), b("cor", Math.abs(r.corr), "Correction résidus", r.c.paille === "exportee" ? "paille exportée" : "paille enfouie"));
  parts.push(op("="), b("res", r.doseCalc, "Dose calculée", "kg N/ha"));
  const capped = r.dosePlaf < r.doseCalc;
  return `<div class="gren-formula" role="group" aria-label="Formule du bilan">${parts.join("")}</div>
    <div class="gren-kpis fr-mt-2w fr-mb-0">
      ${kpi(fmt(r.fournitures), `Fournitures totales (sol ${fmt(r.fournSol)} · organique ${fmt(r.fournOrg)})`)}
      ${kpi(r.cult.plafond === "" ? "—" : fmt(r.plafond), `Plafond GREN — ${capped ? "dose plafonnée" : "non atteint"}`)}
      ${kpi(fmt(r.minPrevu), r.reste > 0 ? `Engrais minéral prévu — reste ${fmt(r.reste)}` : r.reste < 0 ? `Engrais minéral prévu — dépasse de ${fmt(-r.reste)}` : "Engrais minéral prévu — dose couverte", r.reste < 0)}
    </div>
    <div class="gren-dose"><span>Dose finale prévisionnelle</span><span class="d">${fmt(r.doseFinale)}</span><span>kg N/ha · soit ${fmt(r.doseFinale * num(r.p.surface))} kg N sur la parcelle</span></div>
    <section class="fr-accordion fr-mt-2w"><h3 class="fr-accordion__title"><button type="button" class="fr-accordion__btn" aria-expanded="false" aria-controls="acc-trace">Détail du calcul</button></h3>
      <div class="fr-collapse" id="acc-trace"><pre class="gren-trace">${esc(r.trace.join("\n"))}</pre></div></section>`;
}

/* ---------- Groupes ---------- */
VIEWS.groupes = () => {
  const y = S.annee; const cc = camp(y);
  const props = proposerGroupes(y); const validated = cc.groupes || [];
  const inValid = new Set(validated.flatMap(g => g.ids));
  const multi = props.filter(g => g.ids.length > 1);
  const noCult = S.parcelles.filter(p => !entry(p.id, y).culture);
  const crit = k => `<div class="gren-badges">${badge("Sol : " + solById(k.sol).nom)}${badge((cultureById(k.culture)?.nom || "") + " / " + (precById(k.precedent)?.nom || "précédent ?"))}${badge("Organique : " + k.org.replace(/([a-z]+):/g, (m, id) => effById(id) ? effById(id).nom + " " : m))}${zonePill(k.zone)}${badge("Rdt " + fmt(k.rdt, 1))}</div>`;
  const plist = ids => ids.map(id => byId(S.parcelles, id)).filter(Boolean);
  const gDose = ids => { const ps = plist(ids); const r = ps.length && calc(ps[0], y); return r ? fmt(r.doseFinale) : "—"; };
  const surf = ids => fmt(plist(ids).reduce((a, p) => a + num(p.surface), 0), 2);
  return `${bar("Groupes de parcelles")}
  <p class="fr-badge fr-badge--info fr-badge--no-icon fr-mb-2w">Étape facultative</p>
  ${aQuoiSert("Si plusieurs parcelles se ressemblent en tout point, elles reçoivent la même dose : l'outil propose de les <strong>regrouper</strong> pour que vous ayez moins de calculs à suivre et un plan de fumure plus court. Il ne regroupe que des parcelles qui ont : le même type de sol, la même culture et le même précédent, les mêmes épandages (cette année et l'an dernier), le même zonage (jamais une parcelle en ZAR avec une parcelle standard) et le même rendement visé.")}
  <section class="gren-panel"><h2 class="fr-h4">Groupes validés (${validated.length})</h2>
    ${validated.length ? validated.map((g, gi) => { const ok = groupStatus(g, y);
      return `<div class="gren-group ${ok ? "ok" : "ko"}">
        <div class="gren-bar fr-mb-1w"><h3 class="fr-h6 fr-mb-0">${esc(g.nom)} ${ok ? badge("Conforme", "success") : badge("N'est plus homogène", "error")}</h3>
          <span>Dose : <strong>${ok ? gDose(g.ids) : "—"}</strong> kg N/ha · ${surf(g.ids)} ha</span></div>
        ${ok ? "" : `<p class="fr-error-text">Une parcelle a changé (sol, culture, précédent, apports, zonage ou rendement) : dissolvez ce groupe et validez une nouvelle proposition.</p>`}
        <p class="gren-mention">${plist(g.ids).map(p => esc(parcelLabel(p))).join(" · ")}</p>
        <ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline-sm fr-btns-group--sm fr-mb-0"><li>${btn("Harmoniser les saisies", `data-act="harmo" data-g="${gi}"`, {kind:"secondary", sm:true})}</li><li>${btn("Dissoudre", `data-act="delGroupe" data-g="${gi}"`, {kind:"tertiary", sm:true})}</li></ul></div>`; }).join("") : `<p class="gren-mention">Aucun groupe validé pour la campagne ${y}.</p>`}
  </section>
  <section class="gren-panel"><h2 class="fr-h4">Propositions</h2>
    ${multi.length ? multi.map((g, i) => { const already = g.ids.every(id => inValid.has(id));
      return `<div class="gren-group">
        <div class="gren-bar fr-mb-1w"><h3 class="fr-h6 fr-mb-0">Groupe proposé ${i + 1} · ${g.ids.length} parcelles · ${surf(g.ids)} ha</h3><span>Dose : <strong>${gDose(g.ids)}</strong> kg N/ha</span></div>
        ${crit(g.key)}<p class="gren-mention">${plist(g.ids).map(p => esc(parcelLabel(p))).join(" · ")}</p>
        ${already ? badge("Déjà validé", "success") : btn("Valider ce groupe", `data-act="valGroupe" data-ids="${esc(g.ids.join(","))}"`, {sm:true, icon:"check-line"})}</div>`; }).join("")
      : `<p class="gren-mention">Aucun regroupement possible pour l'instant : vos parcelles diffèrent toutes sur au moins un point. Ce n'est pas un problème, chaque parcelle a sa propre dose.</p>`}
    ${noCult.length ? `<p class="gren-mention">${noCult.length} parcelle(s) sans culture renseignée ne sont pas analysées.</p>` : ""}
  </section>`;
};

/* ---------- Apports ---------- */
VIEWS.interventions = () => {
  const y = S.annee; const cc = camp(y);
  const list = [...cc.interventions].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const b = bilanOrga();
  return `${bar("Mes apports d'azote")}${etape("interventions")}
  ${aQuoiSert(`Notez ici vos épandages de <strong>fumier, lisier, compost</strong> (apports organiques) et d'<strong>engrais</strong> (apports minéraux) prévus pour la récolte ${y}. L'azote des effluents est déduit de la dose à apporter. À chaque saisie, l'outil vérifie que la date n'est pas dans une <strong>période d'interdiction d'épandage</strong> et que l'exploitation ne dépasse pas <strong>${b.plafond} kg d'azote organique par hectare</strong>. Passez le statut à « Réalisé » une fois l'épandage fait : cette liste vous sert de cahier d'enregistrement.`)}
  ${globalBanners()}
  <div class="gren-kpis">${kpi(fmt(b.parHa) + " kg", `d'azote organique par hectare de SAU (limite ${b.plafond})`, b.parHa > b.plafond)}${kpi(fmt(b.tot) + " kg", "d'azote organique au total (épandage et pâturage)")}${kpi(list.length, `apport${list.length > 1 ? "s" : ""} enregistré${list.length > 1 ? "s" : ""}`)}</div>
  <section class="gren-panel">
    <div class="gren-bar fr-mb-2w"><h2 class="fr-h4 fr-mb-0">Apports prévus et réalisés — récolte ${y}</h2>${btn("Ajouter un apport", 'data-act="addInterv"', {icon:"add-line"})}</div>
    ${list.length ? table(`<thead><tr><th scope="col">Date</th><th scope="col">Parcelle</th><th scope="col">Type</th><th scope="col">Produit</th><th scope="col" class="num">Qté/ha</th><th scope="col" class="num">N total/ha</th><th scope="col">Statut</th><th scope="col"><span class="fr-sr-only">Actions</span></th></tr></thead>
      <tbody>${list.map(i => { const p = byId(S.parcelles, i.pid); const isOrg = i.type === "organique";
        const prod = isOrg ? effById(i.produit) : minById(i.produit);
        const nha = isOrg ? num(i.qte) * (i.teneur !== "" && i.teneur != null ? num(i.teneur) : num(prod?.n)) : num(i.qte) * num(prod?.teneur) / 100;
        return `<tr data-iid="${esc(i.id)}"><td>${esc(frDate(i.date))}</td><td>${p ? esc(parcelLabel(p)) : "?"}</td><td>${isOrg ? "Organique" : "Minéral"}</td>
        <td>${esc(prod?.nom || i.produit)}</td><td class="num">${fmt(num(i.qte), 1)} ${isOrg ? esc(prod?.unite || "") : "kg"}</td><td class="num">${fmt(nha)}</td>
        <td><select class="fr-select" aria-label="Statut" data-i="statut"><option value="prev" ${i.statut !== "realise" ? "selected" : ""}>Prévisionnel</option><option value="realise" ${i.statut === "realise" ? "selected" : ""}>Réalisé</option></select></td>
        <td>${btn("Supprimer", 'data-act="delInterv"', {kind:"tertiary-no-outline", icon:"delete-line", sm:true})}</td></tr>`; }).join("")}</tbody>`) : `<p>Aucun apport pour l'instant. Si vous n'épandez ni effluent ni engrais avant le calcul, vous pouvez passer à l'étape suivante.</p>`}
  </section>
  ${suite("interventions")}`;
};
async function interventionForm(pidPreset, surSelection){
  const y = S.annee; const today = new Date().toISOString().slice(0, 10);
  const groups = camp(y).groupes || [];
  const d = $("#dlg"); d.className = "gren-modal";
  $("#dlgH").textContent = "Nouvel apport d'azote";
  $("#dlgB").innerHTML = `
    ${fSelect("Appliquer à", 'id="fCible"', (surSelection && SEL.size ? `<option value="sel" selected>Les ${selection().length} parcelles cochées</option>` : "") + S.parcelles.map(p => `<option value="p:${p.id}" ${p.id === pidPreset ? "selected" : ""}>Parcelle — ${esc(parcelLabel(p))}</option>`).join("") + groups.map((g, i) => `<option value="g:${i}">Groupe — ${esc(g.nom)} (${g.ids.length} parcelles)</option>`).join(""))}
    ${fRadios("Type de fertilisant", "fType", "", [["organique", "Organique"], ["mineral", "Minéral"]], "organique")}
    ${fSelect("Produit", 'id="fProd"', "")}
    <div class="fr-grid-row fr-grid-row--gutters"><div class="fr-col-12 fr-col-sm-6">${fInput("Date", 'id="fDate"', today, {type:"date"})}</div>
      <div class="fr-col-12 fr-col-sm-6"><div class="fr-input-group"><label class="fr-label" for="fQte" id="fQteL">Quantité / ha</label><input class="fr-input" id="fQte" inputmode="decimal"></div></div></div>
    <div id="fTenW">${fInput("Teneur en N (kg N / unité)", 'id="fTen" inputmode="decimal" placeholder="valeur GREN par défaut"', "", {hint:"Optionnel : valeur de votre analyse d'effluent"})}</div>
    ${fSelect("Statut", 'id="fStat"', `<option value="prev">Prévisionnel</option><option value="realise">Réalisé</option>`)}
    <div id="fMsg"></div>`;
  $("#dlgF").innerHTML = `${btn("Annuler", 'id="fCancel"', {kind:"secondary"})}${btn("Enregistrer", 'id="fOk"')}`;
  const fill = () => {
    const t = $('input[name="fType"]:checked').value;
    $("#fProd").innerHTML = t === "organique"
      ? R().effluents.map(e => `<option value="${e.id}">${esc(e.nom)} (type ${e.type}, ${e.n} kg N/${e.unite})</option>`).join("")
      : R().mineraux.map(m => `<option value="${m.id}">${esc(m.nom)}</option>`).join("");
    $("#fTenW").hidden = t !== "organique"; upd();
  };
  const upd = () => {
    const t = $('input[name="fType"]:checked').value; const e = t === "organique" ? effById($("#fProd").value) : null;
    $("#fQteL").textContent = t === "organique" ? `Quantité (${e ? e.unite : "t ou m³"} / ha)` : ($("#fProd").value === "nkg" ? "kg N / ha" : "kg de produit / ha");
  };
  d.querySelectorAll('input[name="fType"]').forEach(r => r.onchange = fill);
  $("#fProd").onchange = upd; fill();
  $("#fCancel").onclick = () => d.close();
  $("#fOk").onclick = async () => {
    const cible = $("#fCible").value; const type = $('input[name="fType"]:checked').value;
    const produit = $("#fProd").value; const date = $("#fDate").value; const qte = num($("#fQte").value);
    const teneur = type === "organique" ? $("#fTen").value.trim() : ""; const statut = $("#fStat").value;
    if (!date || qte <= 0) { $("#fMsg").innerHTML = alerte("warning", "", "Renseignez une date et une quantité."); return; }
    const pids = cible === "sel" ? selection() : cible.startsWith("g:") ? groups[+cible.slice(2)].ids : [cible.slice(2)];
    const typeProd = type === "organique" ? effById(produit).type : "III";
    for (const pid of pids) {
      const p = byId(S.parcelles, pid); const c = entry(pid, y);
      if (!c.culture) { $("#fMsg").innerHTML = alerte("warning", "", `Renseignez d'abord la culture de « ${esc(parcelLabel(p))} » : le calendrier en dépend.`); return; }
      const hit = checkCalendrier(p, date, typeProd, c.culture);
      if (hit) {
        d.close();
        await dialog({title:"Épandage interdit à cette date", block:true,
          body:`${alerte("error", "", `La date du <strong>${frDate(date)}</strong> se trouve dans la période d'interdiction d'épandage des fertilisants de <strong>type ${typeProd}</strong> sur ${esc(CAT_LABEL[hit.cult.cat].toLowerCase())} (${esc(hit.cult.nom)}) : du <strong>${fmtMMJJ(hit.rule.debut)}</strong> au <strong>${fmtMMJJ(hit.rule.fin)}</strong>${hit.rule.zone !== "toutes" ? ` (règle ${hit.rule.zone})` : ""}.`)}<p>Parcelle : ${esc(parcelLabel(p))}. L'intervention n'a pas été enregistrée.</p>`,
          buttons:[{label:"Compris"}]});
        return;
      }
    }
    if (type === "organique") {
      const e = effById(produit); const ten = teneur !== "" ? num(teneur) : num(e.n);
      const extra = pids.reduce((a, pid) => a + qte * ten * num(byId(S.parcelles, pid).surface), 0);
      const b = bilanOrga(y, extra);
      if (b.parHa > b.plafond) {
        d.close();
        await dialog({title:"Infraction réglementaire : plafond organique", block:true,
          body:`${alerte("error", "", `Avec cet apport, l'azote organique de l'exploitation atteindrait <strong>${fmt(b.parHa)} kg N/ha SAU</strong>, au-delà du plafond de <strong>${b.plafond} kg N/ha</strong> fixé par la Directive Nitrates.`)}<p>${fmt(b.tot)} kg N organique pour ${fmt(b.sau, 2)} ha. L'intervention n'a pas été enregistrée.</p>`,
          buttons:[{label:"Compris"}]});
        return;
      }
    }
    for (const pid of pids) camp(y).interventions.push({id:uid(), pid, date, type, produit, qte, teneur, statut});
    save(); d.close(); toast(`Apport enregistré${pids.length > 1 ? ` sur ${pids.length} parcelles` : ""}.`); render();
  };
  d.showModal();
}

/* ---------- PPF ---------- */
function ppfLines(y){
  const rows = S.parcelles.map(p => ({p, r:calc(p, y)}));
  const groups = camp(y).groupes || [];
  if (!S.ppfGroup || !groups.length) return rows;
  const used = new Set(); const lines = [];
  groups.forEach(g => { if (!groupStatus(g, y)) return; const ps = g.ids.map(id => rows.find(x => x.p.id === id)).filter(Boolean); if (!ps.length) return; ps.forEach(x => used.add(x.p.id));
    lines.push({p:{...ps[0].p, nom:g.nom, surface:ps.reduce((a, x) => a + num(x.p.surface), 0), _members:ps.map(x => parcelLabel(x.p)).join(", ")}, r:ps[0].r, members:ps}); });
  rows.forEach(x => { if (!used.has(x.p.id)) lines.push(x); });
  return lines;
}
const refLabel = () => S.refSource === "perso" ? "référentiel personnalisé" : S.refVersion ? `référentiel GREN officiel, version ${S.refVersion}` : "référentiel par défaut (indicatif)";

/* ---------- Comparer ---------- */
const normTxt = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const memeCulture = (a, b) => { a = normTxt(a); b = normTxt(b); return !a || !b || a === b || a.includes(b) || b.includes(a); };
function resultatsActuels(y){
  return S.parcelles.map(p => { const r = calc(p, y);
    return {code:parcelCode(p), ilot:String(p.ilot || ""), num:String(p.num || ""), nom:p.nom || "", surface:num(p.surface),
      culture:r ? r.cult.nom : "", rendement:r && !r.forfait ? Math.round(r.rdt.val * 10) / 10 : null, besoin:r ? Math.round(r.besoin) : null,
      fournitures:r ? Math.round(r.fournitures) : null, norg:r ? Math.round(r.nOrgEff) : null, dose:r ? r.doseFinale : null}; });
}
function matchLigne(p, lignes){
  const code = parcelCode(p);
  return lignes.find(l => l.code && l.code === code)
    || lignes.find(l => l.ilot !== "" && String(l.ilot) === String(p.ilot) && String(l.num || "1") === String(p.num || "1"))
    || (p.nom ? lignes.find(l => l.nom && normTxt(l.nom) === normTxt(p.nom)) : null);
}
function comparaison(ref, y){
  const act = resultatsActuels(y); const used = new Set();
  const rows = S.parcelles.map((p, i) => { const a = act[i]; const o = matchLigne(p, ref.lignes); if (o) used.add(o);
    const ecart = o && a.dose != null && o.dose != null ? a.dose - o.dose : null;
    return {p, a, o, ecart, ecartPct: ecart != null && o.dose ? ecart / o.dose * 100 : null}; });
  return {rows, orphelines: ref.lignes.filter(l => !used.has(l))};
}
function parseResultats(txt, nomFichier){
  txt = txt.replace(/^﻿/, "");
  const t = txt.trim();
  if (t.startsWith("{")) {
    const j = JSON.parse(t);
    if (j.type === "calculette-gren-resultats" && Array.isArray(j.lignes)) return {nom:j.nom || `Résultats ${j.annee || ""} (${nomFichier})`, lignes:j.lignes};
    if (j.version && j.parcelles && j.campagnes) { // sauvegarde complète de la Calculette
      const save = S; S = migrate(j); const y = save.annee in (j.campagnes || {}) ? save.annee : Math.max(...Object.keys(j.campagnes).map(Number));
      let lignes; try { lignes = resultatsActuels(y); } finally { S = save; }
      return {nom:`Copie ${j.exploitation?.raison || ""} — récolte ${y}`.replace("  ", " "), lignes};
    }
    throw new Error("fichier inconnu");
  }
  const rows = t.split(/\r?\n/).filter(l => l.trim());
  if (rows.length < 2) throw new Error("Fichier vide");
  const sep = [";", "\t", ","].map(s => [s, rows[0].split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const split = l => { const out = []; let cur = "", q = false; for (let i = 0; i < l.length; i++) { const ch = l[i];
    if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === sep && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); };
  const head = split(rows[0]).map(normTxt);
  const find = (...keys) => { for (const k of keys) { const i = head.findIndex(h => h === k); if (i >= 0) return i; } for (const k of keys) { const i = head.findIndex(h => h.includes(k)); if (i >= 0) return i; } return -1; };
  const ci = {code:find("identifiant", "id parcelle", "code"), ilot:find("ilot", "n ilot", "numero ilot"), num:find("parcelle", "n parcelle", "numero parcelle", "num"), nom:find("nom", "nom d usage", "libelle"),
    surface:find("surface ha", "surface"), culture:find("culture"), rendement:find("rendement objectif", "rendement", "rdt"), besoin:find("besoin"),
    dose:find("dose finale kg n ha", "dose finale", "dose retenue", "dose conseillee", "dose")};
  if (ci.dose < 0) throw new Error("aucune colonne « dose » trouvée");
  if (ci.code < 0 && ci.ilot < 0 && ci.nom < 0) throw new Error("il faut une colonne « îlot » ou « nom » pour reconnaître les parcelles");
  if (ci.num === ci.nom) ci.num = -1;
  const lignes = rows.slice(1).map(split).map(v => { const g = k => ci[k] >= 0 ? (v[ci[k]] || "") : ""; const n = k => g(k).trim() === "" ? null : num(g(k));
    return {code:g("code"), ilot:g("ilot"), num:g("num") || (g("ilot") ? "1" : ""), nom:g("nom"), surface:n("surface"), culture:g("culture"), rendement:n("rendement"), besoin:n("besoin"), dose:n("dose")}; })
    .filter(l => l.code || l.ilot || l.nom);
  return {nom:`Fichier « ${nomFichier.replace(/\.[^.]+$/, "")} »`, lignes};
}

/* =========================================================================
   EXCEL : modèle à remplir, import du modèle, exports en tableau
   ========================================================================= */
const MAX_TEXTE = 10 * 1024 * 1024;
const matchNom = (arr, v) => { const n = normTxt(v); if (!n) return "";
  const m = arr.find(o => normTxt(o.id) === n) || arr.find(o => normTxt(o.nom) === n) || arr.find(o => normTxt(o.nom).startsWith(n) || n.startsWith(normTxt(o.nom)))
    || arr.find(o => normTxt(o.nom).includes(n) || n.includes(normTxt(o.nom))); return m ? m.id : ""; };
const versTexte = v => v && typeof v === "object" && v.date ? v.date.split("-").reverse().join("/") : v == null ? "" : String(v);
function versDate(v){
  if (v && typeof v === "object" && v.date) return v.date;
  const t = String(v ?? "").trim(); let m;
  if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(t))) { const a = m[3].length === 2 ? "20" + m[3] : m[3]; return `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{5}$/.test(t)) return new Date(Math.round((+t - 25569) * 864e5)).toISOString().slice(0, 10);
  return "";
}
const ZONES_XL = ["Standard", "ZAR (zone d'actions renforcées)", "Bassin versant en contentieux"];
const PAILLES_XL = ["Pas de paille", "Récoltées (exportées)", "Laissées au champ (enfouies)"];
const enTete = t => ({v:t, s:1}), aRemplir = v => ({v:v ?? "", s:4}), cadre = v => ({v:v ?? "", s:5});
const nomFichier = base => `${base}_${(normTxt(S.exploitation.raison) || S.exploitation.pacage || "exploitation").replace(/ /g, "-")}_${S.annee}.xlsx`;
function telechargerBlob(blob, nom){ const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

/* Un seul format de classeur : le modèle à remplir. Avec avecRes, les résultats calculés sont ajoutés
   (colonnes grises « Résultat : … ») : le fichier reste réimportable et sert aussi à la comparaison. */
const enTeteRes = t => ({v:t, s:6}), resultat = v => ({v:v ?? "", s:7});
function classeurGREN(avecRes){
  const y = S.annee; const e = S.exploitation; const XL = window.XLSX_MINI;
  const L = {sols:R().sols.map(x => x.nom), zones:ZONES_XL, cultures:R().cultures.map(x => x.nom), precedents:R().precedents.map(x => x.nom), couverts:R().cipan.map(x => x.nom),
    pailles:PAILLES_XL, ouinon:["Oui", "Non"], types:["Organique", "Minéral"], produits:[...R().effluents.map(x => x.nom), ...R().mineraux.map(x => x.nom)], statuts:["Prévu", "Réalisé"],
    depts:Object.entries(DEPTS).map(([k, v]) => `${k} — ${v}`)};
  const cles = Object.keys(L); const lng = Math.max(...cles.map(k => L[k].length));
  const listes = {name:"Listes", cache:true, widths:cles.map(() => 34), rows:[cles.map(k => enTete(k)), ...Array.from({length:lng}, (_, i) => cles.map(k => L[k][i] ?? ""))]};
  const ref = k => { const c = XL.colName(cles.indexOf(k)); return `Listes!$${c}$2:$${c}$${L[k].length + 1}`; };
  const dSol = (solById(e.sol) || {}).nom || "";
  const exploitation = {name:"Exploitation", widths:[36, 40, 70], freeze:1, rows:[
    [enTete("Information"), enTete("Votre réponse"), enTete("Aide")],
    [cadre("Campagne (année de récolte)"), aRemplir(y), {v:"Année où les cultures seront récoltées. Exemple : " + y, s:3}],
    [cadre("N° PACAGE"), aRemplir(e.pacage), {v:"9 chiffres, sur vos courriers PAC ou votre compte Telepac", s:3}],
    [cadre("Raison sociale"), aRemplir(e.raison), {v:"Nom de la société (GAEC, EARL…) ou votre nom", s:3}],
    [cadre("Exploitant ou exploitante"), aRemplir(e.exploitant), {v:"Personne responsable du plan de fumure", s:3}],
    [cadre("Adresse"), aRemplir(e.adresse), {v:"Adresse du siège", s:3}],
    [cadre("Département"), aRemplir(e.departement ? `${e.departement} — ${DEPTS[e.departement] || ""}` : ""), {v:"Choisissez dans la liste (flèche dans la cellule)", s:3}],
    [cadre("Commune du siège"), aRemplir(e.commune), {v:"", s:3}],
    [cadre("Type de sol le plus courant"), aRemplir(dSol), {v:"Choisissez dans la liste. Utilisé quand une parcelle n'a pas de type de sol", s:3}],
    [cadre("SAU totale (ha) — facultatif"), aRemplir(e.sau), {v:"Laissez vide : la somme des parcelles sera utilisée", s:3}],
    ...(avecRes ? (() => { const b = bilanOrga(y); const tot = S.parcelles.reduce((a, p) => { const r = calc(p, y); return a + (r ? r.doseFinale * num(p.surface) : 0); }, 0);
      return [[""], [enTeteRes("Résultat"), enTeteRes("Valeur"), enTeteRes("Explication")],
        [cadre("Résultat : azote à apporter en engrais sur l'exploitation (kg N)"), resultat(Math.round(tot)), {v:"Somme, pour toutes les parcelles, de la dose finale × la surface", s:3}],
        [cadre("Résultat : azote organique par hectare de SAU (kg N/ha)"), resultat(Math.round(b.parHa)), {v:`Limite de la Directive Nitrates : ${b.plafond} kg N/ha — ${b.parHa > b.plafond ? "DÉPASSEMENT" : "conforme"}`, s:3}],
        [cadre("Résultat : référentiel utilisé"), resultat(refLabel()), {v:`Calculé le ${new Date().toLocaleDateString("fr-FR")} par la Calculette GREN`, s:3}]]; })() : [])],
    validations:[{ref:"B7", liste:ref("depts")}, {ref:"B9", liste:ref("sols")}]};
  const H = ["N° îlot", "N° parcelle", "Nom de la parcelle", "Surface (ha)", "Type de sol", "Zonage", `Culture récoltée en ${y}`, "Culture précédente",
    "Rendement visé (facultatif, en q/ha ou t MS/ha)", "Reliquat sortie hiver mesuré en kg N/ha (facultatif)", "Couvert avant la culture", "Date de destruction du couvert (jj/mm/aaaa)",
    "Pailles du précédent", "Irrigation (Oui / Non)", "Notes",
    "Animaux au pâturage, en nombre d'UGB (facultatif, prairies)", "Jours de pâture (facultatif)", "Effet des effluents de l'an dernier en kg N/ha (facultatif)"];
  const lignesP = S.parcelles.map(p => { const c = (S.campagnes[y] || {cultures:{}}).cultures[p.id] || {};
    const r = c.culture ? calc(p, y) : null; const pat = patureN(p, c);
    const rdtVise = c.rdtMode === "libre" && num(c.rdtLibre) ? num(c.rdtLibre) : c.rdtMode === "hist" && r && !r.forfait && r.rdt.val ? Math.round(r.rdt.val * 10) / 10 : "";
    return [aRemplir(p.ilot), aRemplir(p.num), aRemplir(p.nom), aRemplir(num(p.surface) || ""), aRemplir((solById(p.sol) || {}).nom), aRemplir(ZONES_XL[["standard","ZAR","BV"].indexOf(p.zone || "standard")]),
      aRemplir(cultureById(c.culture)?.nom || ""), aRemplir(precById(c.precedent)?.nom || ""), aRemplir(rdtVise),
      aRemplir(c.rshMode === "mesure" && c.rshMesure !== "" ? num(c.rshMesure) : ""), aRemplir((byId(R().cipan, c.cipan) || {}).nom || R().cipan[0].nom), aRemplir(c.cipanDate ? frDate(c.cipanDate) : ""),
      aRemplir(PAILLES_XL[["", "exportee", "enfouie"].indexOf(c.paille || "")] || PAILLES_XL[0]), aRemplir(c.irrigation ? "Oui" : "Non"), aRemplir(c.notes || ""),
      aRemplir(pat.ugb ? Math.round(pat.ugb * 100) / 100 : ""), aRemplir(pat.ugb && num(c.pature?.jours) ? num(c.pature.jours) : ""), aRemplir(r && r.arriere ? Math.round(r.arriere) : "")]; });
  const HR = ["Résultat : besoin de la culture (kg N/ha)", "Résultat : azote fourni par le sol, le précédent et le couvert (kg N/ha)", "Résultat : azote utile des effluents et du pâturage (kg N/ha)",
    "Résultat : plafond de la culture (kg N/ha)", "Résultat : dose finale (kg N/ha)", "Résultat : total pour la parcelle (kg N)", "Résultat : engrais déjà prévu (kg N/ha)"];
  if (avecRes) S.parcelles.forEach((p, i) => { const r = calc(p, y);
    lignesP[i].push(...(r ? [Math.round(r.besoin), Math.round(r.fournSol), Math.round(r.fournOrg), r.cult.plafond === "" ? "" : num(r.plafond), r.doseFinale, Math.round(r.doseFinale * num(p.surface)), Math.round(r.minPrevu)]
      : ["culture à choisir", "", "", "", "", "", ""]).map(resultat)); });
  const vides = Math.max(20, lignesP.length + 10) - lignesP.length;
  const parcelles = {name:"Parcelles", actif:true, widths:[10, 11, 24, 12, 30, 30, 34, 34, 22, 22, 34, 20, 28, 14, 30, 18, 14, 20, ...(avecRes ? [16, 20, 20, 16, 16, 16, 16] : [])], freeze:1,
    rows:[{h:avecRes ? 64 : 48, cells:[...H.map(enTete), ...(avecRes ? HR.map(enTeteRes) : [])]}, ...lignesP, ...Array.from({length:vides}, () => H.map(() => aRemplir("")))],
    validations:[["E", "sols"], ["F", "zones"], ["G", "cultures"], ["H", "precedents"], ["K", "couverts"], ["M", "pailles"], ["N", "ouinon"]].map(([c, k]) => ({ref:`${c}2:${c}400`, liste:ref(k)}))};
  const HA = ["N° îlot", "N° parcelle", "Date (jj/mm/aaaa)", "Type d'apport", "Produit", "Quantité par hectare", "Unité (pour information)", "Statut"];
  const lignesA = (S.campagnes[y]?.interventions || []).map(i => { const p = byId(S.parcelles, i.pid) || {}; const org = i.type === "organique"; const pr = org ? effById(i.produit) : minById(i.produit);
    const nha = org ? num(i.qte) * (i.teneur !== "" && i.teneur != null ? num(i.teneur) : num(pr?.n)) : num(i.qte) * num(pr?.teneur) / 100;
    return [aRemplir(p.ilot), aRemplir(p.num), aRemplir(frDate(i.date)), aRemplir(org ? "Organique" : "Minéral"), aRemplir(pr?.nom || ""), aRemplir(num(i.qte)), cadre(org ? (pr?.unite || "") : "kg de produit"), aRemplir(i.statut === "realise" ? "Réalisé" : "Prévu"), ...(avecRes ? [resultat(Math.round(nha))] : [])]; });
  const apports = {name:"Apports", widths:[10, 11, 18, 16, 36, 18, 22, 12, ...(avecRes ? [18] : [])], freeze:1,
    rows:[{h:avecRes ? 48 : 32, cells:[...HA.map(enTete), ...(avecRes ? [enTeteRes("Résultat : azote total apporté (kg N/ha)")] : [])]}, ...lignesA, ...Array.from({length:Math.max(20, lignesA.length + 10) - lignesA.length}, () => HA.map((_, k) => k === 6 ? cadre("") : aRemplir("")))],
    validations:[["D", "types"], ["E", "produits"], ["H", "statuts"]].map(([c, k]) => ({ref:`${c}2:${c}400`, liste:ref(k)}))};
  const T = s => ({v:s, s:3});
  const mode = {name:"Mode d'emploi", widths:[110], rows:[
    [{v:avecRes ? `Calculette GREN — mes résultats (campagne ${y - 1}-${y}), édités le ${new Date().toLocaleDateString("fr-FR")}` : `Calculette GREN — modèle à remplir (campagne ${y - 1}-${y})`, s:2}], [""],
    ...(avecRes ? [[T("Ce fichier contient vos informations ET vos résultats. Les colonnes grises « Résultat : … » (onglets Parcelles, Apports et Exploitation) sont calculées par la Calculette : modifiez plutôt les cellules jaunes, les résultats seront recalculés à l'import.")],
      [T("Vous pouvez : • le garder comme trace de votre plan de fumure ; • le modifier puis le réimporter (Accueil → « Importer mon fichier Excel ») ; • l'utiliser pour comparer avec de nouveaux résultats (Exporter et comparer → « J'ai un fichier de résultats »).")], [""]] : []),
    [T("1. Onglet « Exploitation » : remplissez les cellules jaunes (une seule fois, elles seront gardées les années suivantes).")],
    [T("2. Onglet « Parcelles » : une ligne par parcelle. Les colonnes Type de sol, Zonage, Cultures, Couvert, Pailles et Irrigation proposent une liste : cliquez dans la cellule puis sur la petite flèche.")],
    [T("   Colonnes facultatives en fin de ligne : animaux au pâturage (en UGB : 1 vache laitière = 1 UGB) et jours de pâture pour les prairies, effet des effluents épandus l'an dernier (laissez vide si vous utilisiez déjà la Calculette l'an dernier : il est calculé automatiquement).")],
    [T("3. Onglet « Apports » (facultatif) : vos épandages de fumier, lisier et engrais. Le n° d'îlot et de parcelle doivent être les mêmes que dans l'onglet Parcelles.")],
    [T("4. Enregistrez le fichier au format Excel (.xlsx), puis dans la Calculette : Accueil → « Importer mon fichier Excel ». Un résumé s'affiche avant tout changement.")], [""],
    [{v:"Conseils", s:2}],
    [T("• Ne modifiez pas les titres des colonnes et ne renommez pas les onglets.")],
    [T("• Laissez vide ce que vous ne savez pas : la Calculette utilise alors des valeurs moyennes (rendement de référence, reliquat moyen…). Vous pourrez compléter ensuite dans l'application.")],
    [T("• Les nombres à virgule s'écrivent avec une virgule (exemple : 4,5). Les dates au format jj/mm/aaaa.")],
    [T("• Les épandages à une date interdite ne sont pas importés : la Calculette vous les signale.")],
    [T("• Où trouver vos informations (PACAGE, îlots, type de sol, reliquats…) ? Voir « Guide et aide » dans la Calculette.")], [""],
    [T("Ce fichier reste sur votre ordinateur : la Calculette le lit dans votre navigateur et ne l'envoie à personne.")]]};
  return XL.ecrire([mode, exploitation, parcelles, apports, listes]);
}
function telechargerModele(){
  telechargerBlob(classeurGREN(false), nomFichier("Modele_Calculette-GREN"));
  toast("Modèle Excel téléchargé : ouvrez-le, remplissez les cellules jaunes, puis importez-le.");
}

async function importerModele(file){
  let sheets;
  try { sheets = await window.XLSX_MINI.lire(file); } catch(e){ toast("Fichier non lu : " + e.message + ".", true); return; }
  const feuille = n => { const k = Object.keys(sheets).find(x => normTxt(x) === n) || Object.keys(sheets).find(x => normTxt(x).includes(n)); return k ? sheets[k] : null; };
  const fP = feuille("parcelles");
  if (!fP) { await dialog({title:"Ce fichier ne suit pas le modèle", body:`<p>Il n'a pas d'onglet « Parcelles ». Téléchargez le modèle depuis l'accueil (« Télécharger le modèle Excel »), remplissez-le, puis importez-le.</p>`}); return; }
  const avert = []; const y0 = S.annee;
  // Exploitation
  const exp = {}; let annee = y0;
  for (const row of feuille("exploitation") || []) { const k = normTxt(versTexte(row[0])); const v = versTexte(row[1]).trim(); if (!k || !v || k.startsWith("resultat")) continue;
    if (k.includes("campagne")) { const a = parseInt(v, 10); if (a > 2000 && a < 2100) annee = a; }
    else if (k.includes("pacage")) exp.pacage = v.replace(/\D/g, "").slice(0, 9);
    else if (k.includes("raison")) exp.raison = v; else if (k.includes("exploitant")) exp.exploitant = v; else if (k.includes("adresse")) exp.adresse = v;
    else if (k.includes("departement")) { const d = (v.match(/\b(22|29|35|56)\b/) || [])[1]; if (d) exp.departement = d; else avert.push(`Département « ${v} » non reconnu (22, 29, 35 ou 56 attendu).`); }
    else if (k.includes("commune")) exp.commune = v;
    else if (k.includes("sol")) { const s_ = matchNom(R().sols, v); if (s_) exp.sol = s_; else avert.push(`Type de sol « ${v} » non reconnu dans l'onglet Exploitation.`); }
    else if (k.includes("sau")) exp.sau = String(num(v) || ""); }
  // Parcelles
  const head = (fP[0] || []).map(h => normTxt(versTexte(h)));
  const col = test => head.findIndex(test);
  const C = {ilot:col(h => h.includes("ilot")), nom:col(h => h.includes("nom")), num:col(h => !h.includes("nom") && (h === "n parcelle" || h.startsWith("n parcelle") || h === "parcelle" || h.includes("numero parcelle"))),
    surface:col(h => h.includes("surface")), sol:col(h => h.includes("type de sol") || h === "sol"), zone:col(h => h.includes("zonage") || h === "zone"),
    culture:col(h => h.startsWith("culture recoltee") || h === "culture"), precedent:col(h => h.includes("culture precedente") || h === "precedent"),
    rdt:col(h => h.includes("rendement")), rsh:col(h => h.includes("reliquat")), couvert:col(h => h.includes("couvert") && !h.includes("destruction")),
    date:col(h => h.includes("destruction")), paille:col(h => h.includes("paille")), irrig:col(h => h.includes("irrig")), notes:col(h => h.includes("note")),
    ugb:col(h => h.includes("ugb") && !h.startsWith("resultat")), jours:col(h => h.includes("jours de pature")), arr:col(h => h.includes("an dernier") && !h.startsWith("resultat"))};
  if (C.ilot < 0 && C.nom < 0) { await dialog({title:"Colonnes introuvables", body:`<p>L'onglet « Parcelles » doit garder les titres du modèle (N° îlot, N° parcelle, Nom de la parcelle…). Téléchargez un modèle neuf depuis l'accueil.</p>`}); return; }
  const parcelles = [];
  fP.slice(1).forEach((row, i) => { const g = k => C[k] >= 0 ? row[C[k]] : ""; const t = k => versTexte(g(k)).trim();
    if (!t("ilot") && !t("nom") && !t("surface")) return;
    const ligne = i + 2; const p = {ilot:t("ilot"), num:t("num") || "1", nom:t("nom"), surface:t("surface") ? String(num(t("surface"))) : ""};
    if (!p.surface || num(p.surface) <= 0) avert.push(`Ligne ${ligne} : surface manquante.`);
    p.sol = t("sol") ? matchNom(R().sols, t("sol")) : ""; if (t("sol") && !p.sol) avert.push(`Ligne ${ligne} : type de sol « ${t("sol")} » non reconnu (type de l'exploitation utilisé).`);
    const z = normTxt(t("zone")); p.zone = z.includes("zar") || z.includes("renforc") ? "ZAR" : z.includes("bassin") || z === "bv" ? "BV" : "standard";
    const c = {};
    if (t("culture")) { c.culture = matchNom(R().cultures, t("culture")); if (!c.culture) avert.push(`Ligne ${ligne} : culture « ${t("culture")} » non reconnue.`); }
    if (t("precedent")) { c.precedent = matchNom(R().precedents, t("precedent")); if (!c.precedent) avert.push(`Ligne ${ligne} : culture précédente « ${t("precedent")} » non reconnue.`); }
    if (num(t("rdt")) > 0) { c.rdtMode = "libre"; c.rdtLibre = String(num(t("rdt"))); } else c.rdtMode = "ref";
    if (t("rsh") !== "" && num(t("rsh")) >= 0 && /\d/.test(t("rsh"))) { c.rshMode = "mesure"; c.rshMesure = String(num(t("rsh"))); } else c.rshMode = "forfait";
    c.cipan = t("couvert") ? (matchNom(R().cipan, t("couvert")) || "aucune") : "aucune";
    c.cipanDate = versDate(g("date")); if (t("date") && !c.cipanDate) avert.push(`Ligne ${ligne} : date de destruction « ${t("date")} » illisible (jj/mm/aaaa attendu).`);
    const pa = normTxt(t("paille")); c.paille = pa.includes("export") || pa.includes("recolt") ? "exportee" : pa.includes("enfoui") || pa.includes("laiss") ? "enfouie" : "";
    c.irrigation = normTxt(t("irrig")) === "oui"; c.notes = t("notes");
    const ugb = num(t("ugb")); const ref1 = (R().animaux.find(a => num(a.ugb) === 1) || R().animaux[0] || {}).id;
    c.pature = ugb > 0 ? {jours:t("jours") ? String(num(t("jours"))) : "", animaux:[{cat:ref1, n:String(ugb)}]} : {jours:"", animaux:[]};
    c.arriereSaisi = t("arr") !== "" && /\d/.test(t("arr")) ? String(num(t("arr"))) : "";
    parcelles.push({p, c, ligne}); });
  if (!parcelles.length) { await dialog({title:"Aucune parcelle trouvée", body:`<p>L'onglet « Parcelles » est vide. Remplissez au moins une ligne (n° d'îlot ou nom, et surface).</p>`}); return; }
  // Apports
  const fA = feuille("apports"); const apports = [];
  if (fA && fA.length > 1) { const hA = (fA[0] || []).map(h => normTxt(versTexte(h)));
    const ca = test => hA.findIndex(test);
    const A_ = {ilot:ca(h => h.includes("ilot")), num:ca(h => h.includes("parcelle")), date:ca(h => h.startsWith("date")), type:ca(h => h.includes("type")), produit:ca(h => h.includes("produit")), qte:ca(h => h.includes("quantite")), statut:ca(h => h.includes("statut"))};
    fA.slice(1).forEach((row, i) => { const g = k => A_[k] >= 0 ? row[A_[k]] : ""; const t = k => versTexte(g(k)).trim(); const ligne = i + 2;
      if (!t("ilot") && !t("produit") && !t("qte")) return;
      const ty = normTxt(t("type")); const type = ty.includes("min") ? "mineral" : "organique";
      const produit = type === "organique" ? matchNom(R().effluents, t("produit")) : matchNom(R().mineraux, t("produit"));
      const date = versDate(g("date")); const qte = num(t("qte"));
      if (!produit) { avert.push(`Apports, ligne ${ligne} : produit « ${t("produit")} » non reconnu — apport ignoré.`); return; }
      if (!date) { avert.push(`Apports, ligne ${ligne} : date manquante ou illisible — apport ignoré.`); return; }
      if (qte <= 0) { avert.push(`Apports, ligne ${ligne} : quantité manquante — apport ignoré.`); return; }
      apports.push({ilot:t("ilot"), num:t("num") || "1", date, type, produit, qte, statut:normTxt(t("statut")).startsWith("real") ? "realise" : "prev", ligne}); }); }
  // Résumé avant import
  const cle = (i, n) => `${String(i).trim()}|${String(n || "1").trim()}`;
  const existants = new Map(S.parcelles.map(p => [cle(p.ilot, p.num), p]));
  const nNouv = parcelles.filter(x => !existants.has(cle(x.p.ilot, x.p.num)) && !(x.p.nom && S.parcelles.some(q => normTxt(q.nom) === normTxt(x.p.nom)))).length;
  const r = await dialog({title:"Importer ce fichier Excel ?", body:`
    <p>Le fichier contient :</p>
    <ul><li>Exploitation : <strong>${esc(exp.raison || S.exploitation.raison || "—")}</strong>${exp.pacage ? ` (PACAGE ${esc(exp.pacage)})` : ""}, campagne ${annee - 1}-${annee}</li>
      <li><strong>${parcelles.length}</strong> parcelle(s) : ${nNouv} nouvelle(s), ${parcelles.length - nNouv} déjà connue(s) qui seront mises à jour</li>
      <li><strong>${apports.length}</strong> apport(s) d'azote${apports.length ? " (ils remplaceront ceux déjà saisis pour cette campagne)" : ""}</li></ul>
    ${avert.length ? alerte("warning", `${avert.length} point(s) à vérifier`, avert.slice(0, 15).map(esc).join("<br>") + (avert.length > 15 ? "<br>…" : "")) : alerte("success", "", "Tout a été reconnu.")}
    <p class="gren-mention">Les parcelles déjà saisies qui ne sont pas dans le fichier sont conservées.</p>`,
    buttons:[{label:"Annuler", cls:"ghost", value:0}, {label:"Importer", value:1}]});
  if (r !== 1) return;
  // Application
  Object.assign(S.exploitation, exp); S.annee = annee;
  const cc = camp(annee); const ids = new Map();
  for (const {p, c} of parcelles) {
    let q = existants.get(cle(p.ilot, p.num)) || (p.nom ? S.parcelles.find(x => normTxt(x.nom) === normTxt(p.nom)) : null);
    if (!q) { q = {id:uid(), dept:S.exploitation.departement}; S.parcelles.push(q); }
    Object.assign(q, {ilot:p.ilot, num:p.num, nom:p.nom || q.nom || "", surface:p.surface, sol:p.sol || q.sol || S.exploitation.sol || "limsain", zone:p.zone});
    const e = entry(q.id, annee); for (const [k, v] of Object.entries(c)) if (v !== undefined) e[k] = v;
    ids.set(cle(q.ilot, q.num), q);
  }
  if (apports.length) {
    const ok = [], refus = [];
    for (const a of apports) { const q = ids.get(cle(a.ilot, a.num)) || existants.get(cle(a.ilot, a.num));
      if (!q) { refus.push(`ligne ${a.ligne} : parcelle îlot ${a.ilot} / ${a.num} inconnue`); continue; }
      const culture = entry(q.id, annee).culture;
      const tp = a.type === "organique" ? effById(a.produit).type : "III";
      const hit = culture ? checkCalendrier(q, a.date, tp, culture) : null;
      if (hit) { refus.push(`ligne ${a.ligne} (${frDate(a.date)}, ${esc(parcelLabel(q))}) : période d'interdiction d'épandage du ${fmtMMJJ(hit.rule.debut)} au ${fmtMMJJ(hit.rule.fin)}`); continue; }
      ok.push({id:uid(), pid:q.id, date:a.date, type:a.type, produit:a.produit, qte:a.qte, teneur:"", statut:a.statut}); }
    cc.interventions = ok;
    if (refus.length) setTimeout(() => dialog({title:`${refus.length} apport(s) non importé(s)`, body:alerte("warning", "", refus.map(esc).join("<br>")) + "<p>Corrigez la date dans le fichier ou saisissez ces apports dans « Mes apports ».</p>"}), 50);
  }
  save(); suivre("import_parcelles"); S.tab = "campagne"; S.sel = S.parcelles[0]?.id || null; render();
  toast(`Import terminé : ${parcelles.length} parcelle(s), ${cc.interventions.length} apport(s).`);
}

/* Lecture d'un tableau (CSV ou Excel) de résultats pour la comparaison */
function parseTableau(rows, nomFichier){
  rows = rows.map(r => (r || []).map(versTexte));
  let h = rows.slice(0, 20).findIndex(r => r.some(c => normTxt(c).includes("dose")) && r.some(c => /\b(ilot|nom|identifiant|parcelle)\b/.test(normTxt(c))));
  if (h < 0) throw new Error("aucune colonne « dose » trouvée");
  const head = rows[h].map(normTxt);
  const find = (...keys) => { for (const k of keys) { const i = head.findIndex(x => x === k); if (i >= 0) return i; } for (const k of keys) { const i = head.findIndex(x => x.includes(k)); if (i >= 0) return i; } return -1; };
  const ci = {code:find("identifiant", "id parcelle", "code"), ilot:find("ilot", "n ilot", "numero ilot"), nom:find("nom", "nom de la parcelle", "nom d usage", "libelle"),
    num:find("parcelle", "n parcelle", "numero parcelle", "num"), surface:find("surface ha", "surface"), culture:find("culture"), rendement:find("rendement vise", "rendement objectif", "rendement", "rdt"),
    besoin:find("besoin"), dose:find("dose finale kg n ha", "dose finale", "dose retenue", "dose conseillee", "dose")};
  if (ci.code < 0 && ci.ilot < 0 && ci.nom < 0) throw new Error("il faut une colonne « îlot » ou « nom » pour reconnaître les parcelles");
  if (ci.num === ci.nom) ci.num = head.findIndex((x, i) => i !== ci.nom && (x === "parcelle" || x.startsWith("n parcelle")));
  const lignes = rows.slice(h + 1).map(v => { const g = k => ci[k] >= 0 ? String(v[ci[k]] ?? "").trim() : ""; const n = k => g(k) === "" ? null : num(g(k));
    return {code:g("code"), ilot:g("ilot"), num:g("num") || (g("ilot") ? "1" : ""), nom:g("nom"), surface:n("surface"), culture:g("culture"), rendement:n("rendement"), besoin:n("besoin"), dose:n("dose")}; })
    .filter(l => (l.code || l.ilot || l.nom) && normTxt(l.ilot || l.nom) !== "total");
  return {nom:`Fichier « ${nomFichier.replace(/\.[^.]+$/, "")} »`, lignes};
}
async function lireResultats(file){
  if (file.size > MAX_TEXTE) throw new Error("fichier trop volumineux (10 Mo maximum)");
  const debut = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (debut[0] === 0x50 && debut[1] === 0x4B) { const sh = await window.XLSX_MINI.lire(file);
    const ligneTitre = r => (r || []).some(c => normTxt(versTexte(c)).includes("dose")) && (r || []).some(c => /\b(ilot|nom|identifiant|parcelle)\b/.test(normTxt(versTexte(c))));
    const noms = Object.keys(sh); const k = noms.find(n => (sh[n] || []).slice(0, 20).some(ligneTitre)) || noms.find(n => normTxt(n) === "parcelles") || noms[0];
    return parseTableau(sh[k] || [], file.name); }
  const txt = await file.text();
  return parseResultats(txt, file.name);
}

/* Exports en tableau Excel */
function exporterPPFxlsx(){
  telechargerBlob(classeurGREN(true), nomFichier("Resultats_Calculette-GREN"));
  suivre("export_csv"); toast("Résultats téléchargés au format du modèle Excel (colonnes grises « Résultat »).");
}
function exporterComparatifXlsx(){
  const y = S.annee; const ref = byId(S.references, S.refSel) || S.references[0]; const {rows} = comparaison(ref, y);
  const H = ["N° îlot", "N° parcelle", "Nom de la parcelle", "Surface (ha)", "Culture (autres résultats)", "Culture (mes résultats)", "Dose autres résultats (kg N/ha)", "Dose mes résultats (kg N/ha)", "Différence (kg N/ha)", "Différence (%)", "Différence pour la parcelle (kg N)"];
  const L = rows.map(({p, a, o, ecart, ecartPct}) => [p.ilot, p.num, p.nom, a.surface, o?.culture || "", a.culture, o?.dose ?? "", a.dose ?? "", ecart ?? "", ecartPct != null ? Math.round(ecartPct * 10) / 10 : "", ecart != null ? Math.round(ecart * a.surface) : ""].map(cadre));
  telechargerBlob(window.XLSX_MINI.ecrire([{name:"Comparaison", freeze:3, widths:[9, 10, 24, 10, 24, 24, 16, 16, 14, 12, 18], rows:[
    [{v:`Comparaison des doses d'azote — récolte ${y}`, s:2}], [`Comparé avec : ${ref.nom}`], {h:48, cells:H.map(enTete)}, ...L]}]), nomFichier("Comparaison"));
}

/* ---------- Exporter et comparer ---------- */
function apercuPPF(y){
  const e = S.exploitation; const lines = ppfLines(y); const b = bilanOrga();
  const totN = lines.reduce((a, x) => a + (x.r ? x.r.doseFinale * num(x.p.surface) : 0), 0);
  return `<div class="gren-ppf-meta">
      <div><strong>Exploitation :</strong> ${esc(e.raison || "—")}</div><div><strong>N° PACAGE :</strong> ${esc(e.pacage || "—")}</div>
      <div><strong>Exploitant·e :</strong> ${esc(e.exploitant || "—")}</div><div><strong>SAU :</strong> ${fmt(sau(), 2)} ha</div>
    </div>
    ${table(`<thead><tr><th scope="col">Parcelle</th><th scope="col" class="num">ha</th><th scope="col">Culture</th><th scope="col">Précédent</th><th scope="col" class="num">Rendement visé</th><th scope="col" class="num">Besoin</th><th scope="col" class="num">Fourni par le sol</th><th scope="col" class="num">Fourni par les effluents</th><th scope="col" class="num">Dose finale (kg N/ha)</th><th scope="col" class="num">Total (kg N)</th></tr></thead>
      <tbody>${lines.map(({p, r, members}) => !r ? `<tr><td>${esc(parcelLabel(p))}</td><td class="num">${fmt(num(p.surface), 2)}</td><td colspan="8" class="gren-mention">culture pas encore choisie</td></tr>` : `<tr>
        <td><strong>${esc(parcelLabel(p))}</strong>${members ? `<br><span class="gren-mention">${esc(p._members)}</span>` : ""}</td>
        <td class="num">${fmt(num(p.surface), 2)}</td><td>${esc(r.cult.nom)}</td><td>${esc(r.prec?.nom || "—")}</td>
        <td class="num">${r.forfait ? "forfait" : fmt(r.rdt.val, 1) + " " + esc(r.cult.unite)}</td>
        <td class="num">${fmt(r.besoin)}</td><td class="num">${fmt(r.fournSol)}</td><td class="num">${fmt(r.fournOrg)}</td>
        <td class="num"><strong>${fmt(r.doseFinale)}</strong></td><td class="num">${fmt(r.doseFinale * num(p.surface))}</td></tr>`).join("")}
        <tr><th scope="row">Total</th><td class="num"><strong>${fmt(lines.reduce((a, x) => a + num(x.p.surface), 0), 2)}</strong></td><td colspan="7"></td><td class="num"><strong>${fmt(totN)}</strong></td></tr></tbody>`)}
    <p class="fr-mb-0"><strong>Azote organique de l'exploitation :</strong> ${fmt(b.parHa)} kg N/ha (limite ${b.plafond}) — ${b.parHa > b.plafond ? badge("Dépassement", "error") : badge("Conforme", "success")}</p>`;
}
const choix = (titre, texte, bouton) => `<div class="fr-col-12 fr-col-md-6 fr-col-lg-4"><div class="gren-choix"><h3 class="fr-h6 fr-mb-1w">${titre}</h3><p class="fr-text--sm">${texte}</p>${bouton}</div></div>`;
const boutonFichier = (label, act, {kind = "", icon = "upload-line"} = {}) =>
  `<label class="fr-btn ${kind ? "fr-btn--" + kind : ""} fr-btn--icon-left fr-icon-${icon}">${label}<input type="file" data-act="${act}" hidden></label>`;
VIEWS.exporter = () => {
  const y = S.annee; S.references = S.references || [];
  const refs = S.references; const ref = byId(refs, S.refSel) || refs[0];
  const pret = S.parcelles.some(p => calc(p, y));
  return `${bar("Exporter et comparer")}${etape("exporter")}
  ${aQuoiSert("Téléchargez votre <strong>plan prévisionnel de fumure</strong> (document à garder sur l'exploitation et à présenter en cas de contrôle), comparez vos doses avec d'autres résultats, et mettez vos informations à l'abri.")}
  ${globalBanners()}

  <section class="gren-panel"><h2 class="fr-h4">1. Télécharger mes résultats</h2>
    ${pret ? `<div class="fr-grid-row fr-grid-row--gutters">
      ${choix("Plan de fumure", "Le document récapitulatif de la campagne, à garder ou à présenter lors d'un contrôle.", btn("Télécharger (PDF)", 'data-act="pdfPPF"', {icon:"download-line"}))}
      ${choix("Plan de fumure détaillé", "Le plan de fumure suivi d'une page de calcul pour chaque parcelle.", btn("Télécharger (PDF)", 'data-act="pdfPPFfiches"', {kind:"secondary", icon:"download-line"}))}
      ${choix("Mes résultats en Excel", "Le modèle Excel rempli avec vos informations et vos résultats (colonnes grises). Vous pouvez le modifier et le réimporter, ou le garder pour comparer l'an prochain.", btn("Télécharger (Excel)", 'data-act="xlsxPPF"', {kind:"secondary", icon:"download-line"}))}
    </div>
    ${(camp(y).groupes || []).length ? `<div class="fr-mt-2w">${fCheckbox("Regrouper les parcelles des groupes validés", 'data-act="ppfGroup"', S.ppfGroup)}</div>` : ""}
    <section class="fr-accordion fr-mt-2w"><h3 class="fr-accordion__title"><button type="button" class="fr-accordion__btn" aria-expanded="false" aria-controls="acc-apercu">Voir l'aperçu de mon plan de fumure</button></h3>
      <div class="fr-collapse" id="acc-apercu">${apercuPPF(y)}</div></section>`
    : `<p class="fr-mb-0">Choisissez d'abord la culture de vos parcelles dans <a href="#campagne" data-tab="campagne">Calcul des doses</a>.</p>`}
  </section>

  <section class="gren-panel"><h2 class="fr-h4">2. Comparer mes résultats</h2>
    <p>Comparez les doses que vous venez de calculer avec d'autres résultats : ceux d'une autre année, de votre technicien ou d'un autre outil.</p>
    <div class="fr-grid-row fr-grid-row--gutters">
      ${choix("J'ai un fichier de résultats", "Un fichier Excel avec une colonne « dose » et le n° d'îlot ou le nom de chaque parcelle (par exemple un plan de fumure téléchargé une autre année), ou une copie Calculette GREN.", boutonFichier("Choisir le fichier", "importResultats"))}
      ${choix("Je veux tester un changement", "Gardez vos résultats actuels de côté, modifiez vos saisies, puis revenez ici voir la différence.", btn("Garder mes résultats actuels", 'data-act="snapshot"', {kind:"secondary", icon:"add-line"}))}
    </div>
    ${ref ? comparatif(ref, y) : ""}
  </section>

  <section class="gren-panel"><h2 class="fr-h4">3. Mettre mes informations à l'abri ou changer d'appareil</h2>
    <p>Vos informations sont enregistrées <strong>uniquement sur cet appareil</strong>. Pour continuer sur un autre téléphone ou ordinateur, ou pour garder une sauvegarde : enregistrez une copie (un petit fichier « .gren »), puis sur l'autre appareil, cliquez sur « Reprendre mes informations depuis une copie ».</p>
    <ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline-md fr-mb-0">
      <li>${btn("Enregistrer une copie de mes informations", 'data-act="export"', {icon:"download-line"})}</li>
      <li>${boutonFichier("Reprendre mes informations depuis une copie", "import", {kind:"secondary"})}</li>
      <li>${btn("Télécharger mes informations en Excel", 'data-act="modele"', {kind:"tertiary", icon:"download-line"})}</li>
    </ul>
  </section>
  ${blocDonnees(true)}
  ${suite("exporter")}`;
};
function comparatif(ref, y){
  const refs = S.references;
  const {rows, orphelines} = comparaison(ref, y);
  const cmp = rows.filter(x => x.o && x.a.dose != null && x.o.dose != null);
  const sum = f => cmp.reduce((a, x) => a + f(x), 0);
  const totA = sum(x => x.a.dose * x.a.surface), totO = sum(x => x.o.dose * x.a.surface);
  const sign = v => v > 0 ? "+" + fmt(v) : v < 0 ? "−" + fmt(-v) : "0";
  const tendance = e => e == null ? "" : e >= 10 ? badge("En hausse", "warning") : e <= -10 ? badge("En baisse", "info") : badge("Proche", "success");
  return `<hr class="fr-mt-3w fr-pb-3w">
    <div class="fr-grid-row fr-grid-row--gutters fr-grid-row--bottom">
      <div class="fr-col-12 fr-col-md-8">${fSelect("Je compare mes résultats actuels avec", 'data-act="refSel"', refs.map(r => `<option value="${esc(r.id)}" ${r.id === ref.id ? "selected" : ""}>${esc(r.nom)}</option>`).join(""))}</div>
      <div class="fr-col-12 fr-col-md-4">${btn("Retirer cette comparaison", 'data-act="refDelete"', {kind:"tertiary", sm:true, icon:"delete-line"})}</div>
    </div>
    <div class="gren-kpis fr-mt-2w">
      ${kpi(fmt(totO) + " kg", "d'azote dans les autres résultats")}
      ${kpi(fmt(totA) + " kg", "d'azote dans mes résultats actuels")}
      ${kpi(sign(totA - totO) + " kg", "de différence")}
    </div>
    ${table(`<thead><tr><th scope="col">Parcelle</th><th scope="col">Culture</th><th scope="col" class="num">Autres résultats (kg N/ha)</th><th scope="col" class="num">Mes résultats (kg N/ha)</th><th scope="col" class="num">Différence</th><th scope="col"></th></tr></thead>
      <tbody>${rows.map(({p, a, o, ecart}) => `<tr>
        <td><strong>${esc(parcelLabel(p))}</strong> <span class="gren-mention">${fmt(a.surface, 2)} ha</span></td>
        <td>${o && o.culture && !memeCulture(o.culture, a.culture) ? `${esc(o.culture)} → <strong>${esc(a.culture || "?")}</strong>` : esc(a.culture || o?.culture || "—")}</td>
        <td class="num">${o && o.dose != null ? fmt(o.dose) : `<span class="gren-mention">absente</span>`}</td>
        <td class="num"><strong>${a.dose != null ? fmt(a.dose) : "—"}</strong></td>
        <td class="num"><strong>${ecart != null ? sign(ecart) : "—"}</strong></td>
        <td>${tendance(ecart)}</td></tr>`).join("")}</tbody>`)}
    ${orphelines.length ? alerte("warning", `${orphelines.length} ligne(s) du fichier n'ont pas été reconnues`, orphelines.slice(0, 10).map(l => esc(l.nom || l.code || `îlot ${l.ilot}`)).join(" · ") + ". Vérifiez que le numéro d'îlot et de parcelle, ou le nom de la parcelle, sont les mêmes que dans « Mes parcelles ».") : ""}
    <ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline-sm fr-mb-0">
      <li>${btn("Télécharger la comparaison (PDF)", 'data-act="pdfComparatif"', {kind:"secondary", sm:true, icon:"download-line"})}</li>
      <li>${btn("Télécharger la comparaison (Excel)", 'data-act="xlsxComparatif"', {kind:"tertiary", sm:true, icon:"download-line"})}</li></ul>`;
}

/* ---------- Administration : comptes de l'espace administrateur ----------
   Les comptes sont listés dans config.js (COMPTES_ADMIN) avec une empreinte PBKDF2-SHA-256
   du mot de passe (jamais le mot de passe lui-même). Vérification dans le navigateur :
   cela masque les réglages aux agriculteurs mais ne remplace pas le backoffice sécurisé. */
const ROLES_ADMIN = {superadmin:"Super-administrateur", admin:"Administrateur"};
const comptesAdmin = () => (Array.isArray(CFG.COMPTES_ADMIN) ? CFG.COMPTES_ADMIN : []).filter(c => c && c.identifiant && c.sel && c.empreinte);
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const deHex = h => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));
async function empreinteMdp(mdp, sel, iterations = 210000){
  if (!window.crypto || !crypto.subtle) throw new Error("Connexion impossible : ouvrez la Calculette par son adresse https.");
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(mdp), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({name:"PBKDF2", hash:"SHA-256", salt:deHex(sel), iterations}, k, 256));
}
function adminSession(){ try { return JSON.parse(sessionStorage.getItem("gren-admin-local") || "null"); } catch(e){ return null; } }
const adminConnecte = () => { const a = adminSession(); return !!(a && a.identifiant && comptesAdmin().some(c => c.identifiant === a.identifiant)); };
async function adminConnexion(){
  if (adminConnecte()) { aller("admin"); return; }
  let bloque = 0; try { bloque = +localStorage.getItem("gren-admin-bloque") || 0; } catch(e){}
  if (bloque > Date.now()) { await dialog({title:"Connexion bloquée", body:alerte("error", "", `Trop d'essais. Réessayez dans ${Math.ceil((bloque - Date.now()) / 60000)} minute(s).`)}); return; }
  const r = await dialog({title:"Espace administrateur", body:`<p class="gren-mention">Réservé aux personnes chargées de l'outil.</p>
      ${fInput("Identifiant", 'data-adm="id" autocomplete="username"')}${fInput("Mot de passe", 'data-adm="mdp" autocomplete="current-password"', "", {type:"password"})}`,
    buttons:[{label:"Annuler", cls:"ghost", value:0}, {label:"Se connecter", value:1}]});
  if (r !== 1) return;
  const id = (($('[data-adm="id"]') || {}).value || "").trim().toLowerCase(), mdp = ($('[data-adm="mdp"]') || {}).value || "";
  const compte = comptesAdmin().find(c => c.identifiant.toLowerCase() === id);
  let ok = false;
  try { ok = !!compte && await empreinteMdp(mdp, compte.sel, compte.iterations || 210000) === compte.empreinte; } catch(e){ toast(e.message, true); return; }
  if (ok) {
    try { sessionStorage.setItem("gren-admin-local", JSON.stringify({identifiant:compte.identifiant, nom:compte.nom || compte.identifiant, role:compte.role === "superadmin" ? "superadmin" : "admin"})); localStorage.removeItem("gren-admin-echecs"); } catch(e){}
    toast(`Bonjour ${compte.nom || compte.identifiant} : vous êtes connecté à l'espace administrateur.`); aller("admin"); return;
  }
  let n = 0; try { n = (+localStorage.getItem("gren-admin-echecs") || 0) + 1; localStorage.setItem("gren-admin-echecs", n); if (n >= 5) { localStorage.setItem("gren-admin-bloque", Date.now() + 15 * 60000); localStorage.removeItem("gren-admin-echecs"); } } catch(e){}
  if (SRV) rpc("echec_connexion", {p_email:"appli:" + id.slice(0, 60), p_motif:"mot_de_passe"}).catch(() => {});
  toast("Identifiant ou mot de passe incorrect.", true);
}
async function creerCompteAdmin(){
  const moi = adminSession(); if (!moi || moi.role !== "superadmin") { toast("Seul un super-administrateur peut créer des comptes.", true); return; }
  const r = await dialog({title:"Créer un compte administrateur", body:`
    ${fInput("Nom et prénom", 'data-nc="nom" autocomplete="off"')}
    ${fInput("Identifiant de connexion", 'data-nc="id" autocomplete="off"', "", {hint:"Par exemple prenom.nom — lettres, chiffres, point, tiret"})}
    ${fInput("Mot de passe", 'data-nc="mdp" autocomplete="new-password"', "", {type:"password", hint:"12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial"})}
    ${fInput("Confirmation du mot de passe", 'data-nc="mdp2" autocomplete="new-password"', "", {type:"password"})}
    ${fSelect("Rôle", 'data-nc="role"', `<option value="admin">Administrateur : référentiel</option><option value="superadmin">Super-administrateur : référentiel et création de comptes</option>`)}`,
    buttons:[{label:"Annuler", cls:"ghost", value:0}, {label:"Préparer le compte", value:1}]});
  if (r !== 1) return;
  const v = k => (($(`[data-nc="${k}"]`) || {}).value || "");
  const nom = v("nom").trim(), id = v("id").trim().toLowerCase(), mdp = v("mdp"), role = v("role") === "superadmin" ? "superadmin" : "admin";
  const err = !nom ? "Indiquez le nom." : !/^[a-z0-9._-]{3,40}$/.test(id) ? "Identifiant : 3 à 40 caractères parmi lettres minuscules, chiffres, point, tiret." :
    comptesAdmin().some(c => c.identifiant.toLowerCase() === id) ? "Cet identifiant existe déjà : choisissez-en un autre (pour changer un mot de passe, voir l'aide en bas de la page)." :
    !(mdp.length >= 12 && /[a-z]/.test(mdp) && /[A-Z]/.test(mdp) && /\d/.test(mdp) && /[^A-Za-z0-9]/.test(mdp)) ? "Mot de passe trop faible : 12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial." :
    mdp !== v("mdp2") ? "Les deux mots de passe ne correspondent pas." : "";
  if (err) { await dialog({title:"Compte non créé", body:alerte("error", "", esc(err))}); return; }
  const sel = hex(crypto.getRandomValues(new Uint8Array(16)));
  const compte = {identifiant:id, nom, role, iterations:210000, sel, empreinte:await empreinteMdp(mdp, sel)};
  const ligne = "    " + JSON.stringify(compte) + ",";
  S.comptesPrepares = [...(S.comptesPrepares || []).filter(c => c.identifiant !== id), compte]; save(); render();
  await dialog({title:"Compte prêt : dernière étape", body:`
    <p>Le compte <strong>${esc(id)}</strong> (${esc(ROLES_ADMIN[role])}) est prêt. Pour l'activer sur tous les appareils, ajoutez cette ligne dans le fichier <strong>config.js</strong>, dans la liste <code>COMPTES_ADMIN</code> :</p>
    <pre class="gren-trace" id="ligneCompte">${esc(ligne)}</pre>
    ${btn("Copier la ligne", 'data-act="copierLigne"', {kind:"secondary", sm:true, icon:"file-text-line"})}
    <ol class="fr-mt-2w"><li>Sur GitHub, ouvrez <a href="https://github.com/williamlestoilleagri-creator/Grist/edit/main/calculette-gren/config.js" target="_blank" rel="noopener">calculette-gren/config.js</a> (bouton crayon « Edit »).</li>
      <li>Collez la ligne sous <code>COMPTES_ADMIN: [</code>.</li><li>Cliquez sur « Commit changes… » puis « Commit changes ». Le compte fonctionne environ 2 minutes après.</li></ol>
    <p class="gren-mention">Cette ligne ne contient pas le mot de passe, seulement son empreinte chiffrée : vous pouvez la transmettre sans risque. Communiquez le mot de passe à la personne par un autre moyen (de vive voix, par téléphone).</p>`});
}
VIEWS.admin = () => { const moi = adminSession() || {}; const comptes = comptesAdmin(); const prepares = (S.comptesPrepares || []).filter(c => !comptes.some(k => k.identifiant === c.identifiant));
  return `${bar("Administration", false)}
  <p>Connecté en tant que <strong>${esc(moi.nom || moi.identifiant || "")}</strong> (${esc(ROLES_ADMIN[moi.role] || "")}). ${btn("Se déconnecter", 'data-act="adminDeconnexion"', {kind:"tertiary", sm:true, icon:"logout-box-r-line"})}</p>
  <section class="gren-panel"><div class="gren-bar"><h2 class="fr-h4 fr-mb-0">Comptes administrateurs</h2>${moi.role === "superadmin" ? btn("Créer un compte", 'data-act="creerCompte"', {icon:"add-line"}) : ""}</div>
    ${table(`<thead><tr><th scope="col">Nom</th><th scope="col">Identifiant</th><th scope="col">Rôle</th><th scope="col">État</th></tr></thead><tbody>
      ${comptes.map(c => `<tr><td>${esc(c.nom || "—")}${c.identifiant === moi.identifiant ? " " + badge("Vous", "info") : ""}</td><td>${esc(c.identifiant)}</td><td>${esc(ROLES_ADMIN[c.role] || ROLES_ADMIN.admin)}</td><td>${badge("Actif", "success")}</td></tr>`).join("")}
      ${prepares.map(c => `<tr><td>${esc(c.nom)}</td><td>${esc(c.identifiant)}</td><td>${esc(ROLES_ADMIN[c.role])}</td><td>${badge("À ajouter dans config.js", "warning")}</td></tr>`).join("")}</tbody>`)}
    <section class="fr-accordion"><h3 class="fr-accordion__title"><button type="button" class="fr-accordion__btn" aria-expanded="false" aria-controls="acc-comptes">Supprimer un compte, changer un mot de passe, limites</button></h3>
      <div class="fr-collapse" id="acc-comptes">
        <p><strong>Supprimer un compte</strong> : dans config.js, supprimez la ligne qui contient son identifiant, puis enregistrez (« Commit changes »).</p>
        <p><strong>Changer un mot de passe</strong> : supprimez la ligne du compte dans config.js, puis recréez le compte ici avec le même identifiant et le nouveau mot de passe.</p>
        <p class="fr-mb-0"><strong>Limites</strong> : ces comptes protègent l'accès à cet espace dans l'application, qui ne contient que des réglages valables sur l'appareil utilisé. La vérification se fait dans le navigateur et la liste des comptes est publique (les mots de passe y sont chiffrés, mais un mot de passe faible pourrait être deviné). Pour des comptes réellement sécurisés (stockés sur un serveur, avec double authentification et journal des connexions), utilisez le <strong>backoffice en ligne</strong> ci-dessous, rubrique « Administrateurs ».</p>
      </div></section>
  </section>
  <section class="gren-panel"><h2 class="fr-h4">Backoffice en ligne</h2>
    <p>Statistiques d'utilisation, connexions, suivi des attaques, gestion des accès administrateurs et <strong>publication du référentiel pour tous les utilisateurs</strong>.</p>
    ${SRV ? `<a class="fr-btn fr-btn--icon-left fr-icon-lock-line" href="admin/">Ouvrir le backoffice sécurisé</a>`
      : `${alerte("info", "Pas encore activé", "Le backoffice a besoin d'un serveur Supabase. Suivez le guide d'installation, puis renseignez son adresse dans config.js.")}
         <a class="fr-link fr-icon-arrow-right-line fr-link--icon-right" href="https://github.com/williamlestoilleagri-creator/Grist/blob/main/calculette-gren/supabase/INSTALLATION.md" target="_blank" rel="noopener">Guide d'installation du backoffice</a>`}
  </section>
  <section class="gren-panel"><h2 class="fr-h4">Référentiel GREN</h2>
    ${S.refSource === "perso" ? alerte("warning", "Référentiel modifié sur cet appareil", "Les modifications faites ici ne valent que pour ce navigateur. Pour les appliquer à tous les utilisateurs, publiez-les depuis le backoffice." + (SRV ? " " + btn("Revenir au référentiel officiel", 'data-act="refOfficiel"', {kind:"secondary", sm:true}) : ""))
      : S.refVersion ? alerte("success", `Référentiel officiel — version ${S.refVersion}`, `Publié le ${S.refPublieLe ? new Date(S.refPublieLe).toLocaleDateString("fr-FR") : "—"}.`)
      : alerte("warning", "Valeurs indicatives", "Les valeurs par défaut doivent être vérifiées au regard de l'arrêté référentiel GREN Bretagne et des arrêtés ZAR en vigueur.")}
    <ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline-md">
      <li>${btn("Télécharger le référentiel", 'data-act="exportRef"', {kind:"secondary", icon:"download-line"})}</li>
      <li>${boutonFichier("Charger un référentiel", "importRef", {kind:"secondary"})}</li>
      <li>${btn("Rétablir les valeurs par défaut", 'data-act="resetRef"', {kind:"tertiary", icon:"refresh-line"})}</li></ul>
    <h3 class="fr-h5 fr-mt-3w">Paramètres généraux</h3><div class="fr-grid-row fr-grid-row--gutters">
      ${PARAMS.map(([k, l]) => `<div class="fr-col-12 fr-col-md-6 fr-col-lg-3">${fInput(l, `data-param="${k}"`, R().params[k])}</div>`).join("")}</div>
    ${REF_TABLES.map(T => `<div class="gren-bar fr-mt-3w"><h3 class="fr-h5 fr-mb-0">${T.t}</h3>${btn("Ajouter une ligne", `data-act="refAdd" data-k="${T.k}"`, {kind:"secondary", sm:true, icon:"add-line"})}</div>
      ${table(`<thead><tr>${T.cols.map(c => `<th scope="col">${c[1]}</th>`).join("")}<th scope="col"><span class="fr-sr-only">Actions</span></th></tr></thead><tbody>
      ${R()[T.k].map((row, i) => `<tr>${T.cols.map(([f, l, ty]) => { const v = row[f] ?? ""; const al = `aria-label="${esc(l)}"`;
        if (Array.isArray(ty)) return `<td><select class="fr-select" ${al} data-ref="${T.k}" data-i="${i}" data-f="${f}">${ty.map(o => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select></td>`;
        if (ty === "prec") return `<td><select class="fr-select" ${al} data-ref="${T.k}" data-i="${i}" data-f="${f}">${opts(R().precedents, v, "—")}</select></td>`;
        return `<td><input class="fr-input" ${al} data-ref="${T.k}" data-i="${i}" data-f="${f}" data-t="${ty || ""}" value="${esc(v)}" style="${ty === "w" ? "min-width:14rem" : ty === "n" ? "width:5.5rem" : "width:7rem"}"></td>`;
      }).join("")}<td>${btn("Supprimer", `data-act="refDel" data-k="${T.k}" data-i="${i}"`, {kind:"tertiary-no-outline", icon:"delete-line", sm:true})}</td></tr>`).join("")}
      </tbody>`)}`).join("")}
  </section>
  ${btn("Se déconnecter de l'espace administrateur", 'data-act="adminDeconnexion"', {kind:"secondary", icon:"logout-box-r-line"})}`; };

/* ---------- Guide et aide ---------- */
const OU_TROUVER = [
  ["Numéro PACAGE", "C'est votre numéro d'exploitant pour la PAC (9 chiffres). Il figure sur vos courriers PAC et en haut de votre compte <strong>Telepac</strong>.", "Demandez-le à la DDTM de votre département."],
  ["Îlots, parcelles et surfaces", "Dans votre <strong>déclaration PAC</strong> : sur Telepac (registre parcellaire graphique) ou sur le récapitulatif PDF de votre déclaration. Reprenez les mêmes numéros d'îlot et de parcelle.", "Votre centre de gestion ou votre conseiller PAC peut vous fournir la liste."],
  ["Culture précédente", "La culture déclarée l'an dernier sur la parcelle (déclaration PAC de l'année précédente) ou votre cahier d'enregistrement.", "Après une première année dans la Calculette, elle est reprise automatiquement."],
  ["Type de sol", "Vos <strong>analyses de terre</strong> (bulletin du laboratoire), votre technicien, ou la carte des sols du site « Sols de Bretagne ».", "Choisissez le type qui ressemble le plus à votre terre ; vous pourrez corriger plus tard."],
  ["Zonage (ZAR, bassin versant)", "La <strong>DDTM</strong> de votre département et les arrêtés préfectoraux indiquent les communes et secteurs concernés. Votre mairie peut aussi vous renseigner.", "Laissez « Standard » si vous n'êtes pas concerné."],
  ["Rendements des années passées", "Votre cahier de plaine, vos <strong>bons de livraison</strong> (coopérative, négoce) ou vos pesées.", "Choisissez « Valeur de référence GREN » : l'outil utilise le rendement moyen de votre département."],
  ["Reliquat sortie hiver", "Une <strong>analyse de sol</strong> faite en fin d'hiver (février-mars) par un laboratoire : il indique la quantité d'azote minéral en kg N/ha.", "Choisissez « Je n'ai pas d'analyse » : une valeur moyenne selon votre type de sol est utilisée."],
  ["Épandages (fumier, lisier…)", "Votre <strong>plan d'épandage</strong> et votre cahier d'enregistrement pour les quantités. Pour la teneur en azote : une <strong>analyse d'effluent</strong> si vous en avez une.", "Sans analyse, la teneur moyenne du produit est utilisée."],
  ["Couvert avant la culture (CIPAN)", "Votre cahier d'enregistrement : espèce semée et date de destruction.", "Choisissez « Aucun couvert » s'il n'y en a pas eu."],
  ["Animaux au pâturage", "Votre registre d'élevage pour le nombre d'animaux, et votre calendrier de pâturage pour le nombre de jours.", "Une estimation suffit."]
];
const LEXIQUE = [
  ["Azote (N)", "Élément nutritif indispensable aux plantes. Les doses sont exprimées en kilos d'azote par hectare (kg N/ha)."],
  ["Méthode du bilan", "Calcul de la dose : ce dont la culture a besoin, moins ce que le sol, la culture précédente et les effluents lui fournissent déjà."],
  ["GREN", "Groupe régional d'expertise « nitrates » : il fixe en Bretagne les références (besoins des cultures, fournitures du sol…) utilisées par la Calculette."],
  ["PPF — plan prévisionnel de fumure", "Document qui prévoit, avant les premiers apports de printemps, la dose d'azote de chaque parcelle. Il doit être tenu à jour sur l'exploitation."],
  ["Directive Nitrates / PAR", "Règles européennes et régionales (programme d'actions régional) pour protéger l'eau des nitrates : calendrier d'épandage, limite de 170 kg N organique/ha…"],
  ["Reliquat sortie hiver (RSH)", "Azote minéral encore présent dans le sol à la fin de l'hiver, disponible pour la culture."],
  ["Minéralisation (Mh)", "Azote libéré naturellement par la matière organique du sol pendant la saison de culture."],
  ["Précédent", "Culture récoltée l'année d'avant sur la même parcelle."],
  ["CIPAN", "Culture intermédiaire piège à nitrates : couvert semé entre deux cultures pour retenir l'azote pendant l'hiver."],
  ["Dérobée", "Culture courte semée entre deux cultures principales et récoltée (ensilage, pâture…)."],
  ["Effluents d'élevage", "Fumier, lisier, fientes, compost… Ils contiennent de l'azote dont une partie seulement est utile à la culture."],
  ["Part utile (Keq)", "Pourcentage de l'azote d'un effluent réellement disponible pour la culture. Il dépend du produit et de la date d'épandage."],
  ["Arrière-effet", "Azote d'un effluent épandu l'année précédente, qui continue d'être libéré cette année."],
  ["Plafond", "Dose maximale autorisée par culture : la dose calculée ne peut pas la dépasser."],
  ["SAU", "Surface agricole utile de l'exploitation, en hectares."],
  ["UGB", "Unité gros bovin : permet de compter ensemble des animaux différents (une vache laitière = 1 UGB)."],
  ["ZAR", "Zone d'actions renforcées : secteur où des règles plus strictes s'appliquent pour protéger l'eau."],
  ["PACAGE", "Numéro d'identification de l'exploitation pour les aides de la PAC."]
];
VIEWS.aide = () => `${bar("Guide et aide", false)}
  <p class="fr-text--lead">Tout ce qu'il faut savoir pour remplir la Calculette et comprendre vos résultats.</p>
  <nav class="fr-summary fr-mb-4w" role="navigation" aria-labelledby="sommaire"><p class="fr-summary__title" id="sommaire">Sommaire</p><ol class="fr-summary__list">
    <li><a class="fr-summary__link" href="#g-etapes" data-ancre-local="g-etapes">Les étapes</a></li><li><a class="fr-summary__link" href="#g-trouver" data-ancre-local="g-trouver">Où trouver mes informations ?</a></li>
    <li><a class="fr-summary__link" href="#g-calcul" data-ancre-local="g-calcul">Comment est calculée la dose ?</a></li><li><a class="fr-summary__link" href="#g-excel" data-ancre-local="g-excel">Utiliser le modèle Excel</a></li>
    <li><a class="fr-summary__link" href="#g-lexique" data-ancre-local="g-lexique">Lexique</a></li><li><a class="fr-summary__link" href="#donnees" data-ancre-local="donnees">Mes informations et la confidentialité</a></li></ol></nav>
  <section class="gren-panel" id="g-etapes"><h2 class="fr-h4">Les étapes</h2>
  <ol>
    <li class="fr-mb-1w"><strong>Mon exploitation</strong> : numéro PACAGE, nom, commune. Une seule fois.</li>
    <li class="fr-mb-1w"><strong>Mes parcelles</strong> : îlots, parcelles, surfaces, type de sol. Gardées d'une année sur l'autre.</li>
    <li class="fr-mb-1w"><strong>Calcul des doses</strong> : pour chaque parcelle, la culture et quelques questions. La dose s'affiche aussitôt.</li>
    <li class="fr-mb-1w"><strong>Mes apports</strong> : vos épandages de fumier, lisier et engrais. L'outil vérifie les dates interdites et la limite de 170 kg d'azote organique par hectare.</li>
    <li class="fr-mb-1w"><strong>Exporter et comparer</strong> : votre plan de fumure en PDF ou en Excel, une comparaison avec d'autres résultats, une copie de vos informations.</li>
  </ol>
  <p class="fr-mb-0">L'étape « Groupes » est facultative. L'année suivante, passez à la campagne suivante avec la flèche <strong>›</strong> à côté de « Campagne » : parcelles, cultures précédentes et rendements sont repris.</p></section>
  <section class="gren-panel" id="g-trouver"><h2 class="fr-h4">Où trouver mes informations ?</h2>
    ${table(`<thead><tr><th scope="col">Information</th><th scope="col">Où la trouver</th><th scope="col">Si je ne l'ai pas</th></tr></thead><tbody>${OU_TROUVER.map(([a, b, c]) => `<tr><th scope="row">${a}</th><td>${b}</td><td>${c}</td></tr>`).join("")}</tbody>`)}
    <p class="gren-mention fr-mb-0">Vous pouvez aussi vous faire aider par votre technicien de la Chambre d'agriculture, de votre coopérative ou de votre centre de gestion.</p></section>
  <section class="gren-panel" id="g-calcul"><h2 class="fr-h4">Comment est calculée la dose ?</h2>
    <p>La dose d'azote à apporter en engrais = ce dont la culture a besoin, moins ce qu'elle trouve déjà :</p>
    <ul><li><strong>besoin de la culture</strong> : rendement visé × quantité d'azote nécessaire par quintal ou par tonne ;</li>
      <li>moins l'azote <strong>déjà dans le sol</strong> en sortie d'hiver ;</li><li>moins l'azote <strong>fourni par le sol</strong> au fil de la saison ;</li>
      <li>moins l'effet de la <strong>culture précédente</strong> et du <strong>couvert</strong> ;</li><li>moins la part utile de l'azote du <strong>fumier, du lisier</strong> et du pâturage.</li></ul>
    <p class="fr-mb-0">La dose ne peut pas dépasser le <strong>plafond</strong> fixé pour la culture. Le détail est visible sous chaque résultat (« Détail du calcul ») et dans le plan de fumure détaillé. Les valeurs de référence viennent du référentiel GREN Bretagne.</p></section>
  <section class="gren-panel" id="g-excel"><h2 class="fr-h4">Utiliser le modèle Excel</h2>
    <ol><li>Sur l'accueil, cliquez sur <strong>« Télécharger le modèle Excel »</strong>. S'il y a déjà des informations dans la Calculette, elles sont reprises dans le fichier.</li>
      <li>Ouvrez le fichier et remplissez les <strong>cellules jaunes</strong> des onglets Exploitation, Parcelles et (si vous le souhaitez) Apports. Les colonnes avec une flèche proposent une liste de choix.</li>
      <li>Enregistrez le fichier (format .xlsx), puis cliquez sur <strong>« Importer mon fichier Excel »</strong>. Un résumé s'affiche : vous confirmez avant tout changement.</li></ol>
    <p><strong>Un seul format pour tout</strong> : quand vous téléchargez « Mes résultats en Excel » (onglet Exporter et comparer), vous obtenez ce même modèle, rempli avec vos informations, plus des <strong>colonnes grises « Résultat : … »</strong> (besoin, azote fourni, dose finale, total). Ce fichier peut être gardé comme trace, modifié puis réimporté, ou utilisé l'an prochain pour comparer vos résultats.</p>
    <p class="fr-mb-0">${btn("Télécharger le modèle Excel", 'data-act="modele"', {kind:"secondary", sm:true, icon:"download-line"})}</p></section>
  <section class="gren-panel" id="g-lexique"><h2 class="fr-h4">Lexique</h2>
    <dl class="gren-lexique">${LEXIQUE.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl></section>
  <section class="gren-panel" id="donnees"><h2 class="fr-h4">Mes informations et la confidentialité</h2>
    <p>Les informations de votre exploitation (PACAGE, parcelles, apports, résultats) restent <strong>uniquement dans votre navigateur, sur votre appareil</strong>. Elles ne sont envoyées à personne : ni à la préfecture, ni à la DDTM, ni à l'équipe de la Calculette. Les fichiers Excel ou les copies que vous importez sont lus dans votre navigateur, sans être envoyés.</p>
    <p>Deux services extérieurs peuvent être appelés : la liste officielle des communes (<em>geo.api.gouv.fr</em>, quand vous tapez le nom de votre commune : seules les lettres tapées sont envoyées)${SRV ? ", et le serveur de la Calculette pour vérifier s'il y a un message d'information ou un nouveau référentiel" : ""}.</p>
    ${SRV ? `<p>Une mesure d'audience <strong>anonyme</strong> compte les visites et les calculs (département, culture, type d'appareil). Aucun nom, aucun numéro PACAGE et aucune adresse IP ne sont enregistrés.</p>` : ""}
    <p class="fr-mb-0">Vous pouvez choisir de ne pas garder vos informations et les effacer à tout moment : voir le bloc « Où sont gardées mes informations ? » sur l'accueil.</p></section>
  <section class="gren-panel" id="cookies"><h2 class="fr-h4">Gestion des cookies</h2>
    <p class="fr-mb-0">Ce site ne dépose <strong>aucun cookie</strong> et aucun traceur publicitaire. Pour garder vos informations, il utilise le <strong>stockage du navigateur</strong> : il fonctionne comme un cookie, mais son contenu n'est jamais envoyé sur Internet. Vous décidez de le garder ou non (accueil, « Garder mes informations sur cet appareil »), et il est effacé si vous videz les données de navigation.</p></section>
  <section class="gren-panel" id="mentions"><h2 class="fr-h4">Mentions légales</h2>
    <p>Éditeur : ${esc((CFG.MARQUE || ["Préfète","de la région","Bretagne"]).join(" "))}. ${CFG.CONTACT ? `Contact : ${esc(CFG.CONTACT)}.` : ""}</p>
    <p class="fr-mb-0">Outil d'aide à la décision, <strong>non réglementaire</strong>. Il ne remplace ni l'arrêté référentiel régional GREN Bretagne, ni le programme d'actions régional, ni les arrêtés ZAR, ni le conseil d'un technicien. Hébergement : GitHub Pages (GitHub Inc.)${SRV ? " ; statistiques et référentiel : Supabase" : ""}.</p></section>
  <section class="gren-panel" id="accessibilite"><h2 class="fr-h4">Accessibilité : non conforme</h2><p class="fr-mb-0">Ce service n'a pas encore fait l'objet d'un audit de conformité au RGAA. Il utilise le Système de Design de l'État (DSFR) afin de faciliter son accessibilité.</p></section>`;

/* =========================================================================
   PDF (jsPDF, police Marianne embarquée)
   ========================================================================= */
const loaded = {};
function loadScript(src){
  return loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error("Chargement impossible : " + src)); }; document.head.appendChild(s); }));
}
async function pdfDoc(orientation = "landscape"){
  await loadScript("lib/jspdf-4.2.1.umd.min.js");
  await loadScript("lib/jspdf-autotable-5.0.8.min.js");
  await loadScript("lib/marianne-pdf.js");
  const { jsPDF } = window.jspdf;
  const at = window.jspdf_autotable; if (at && at.applyPlugin) at.applyPlugin(jsPDF);
  const doc = new jsPDF({orientation, unit:"mm", format:"a4"});
  doc.addFileToVFS("Marianne-Regular.ttf", window.GREN_FONTS.Regular); doc.addFont("Marianne-Regular.ttf", "Marianne", "normal");
  doc.addFileToVFS("Marianne-Bold.ttf", window.GREN_FONTS.Bold); doc.addFont("Marianne-Bold.ttf", "Marianne", "bold");
  doc.setFont("Marianne", "normal");
  doc.setProperties({title:"Calculette GREN", creator:"Calculette GREN", author:(CFG.MARQUE || []).join(" ")});
  return doc;
}
function AT(doc, o){
  const at = window.jspdf_autotable;
  const base = {styles:{font:"Marianne", fontSize:8, cellPadding:1.6, lineColor:[221,221,221], lineWidth:.1, textColor:[22,22,22]},
    headStyles:{fillColor:[0,0,145], textColor:255, fontStyle:"bold"}, footStyles:{fillColor:[238,238,238], textColor:[22,22,22], fontStyle:"bold"},
    alternateRowStyles:{fillColor:[246,246,246]}, margin:{left:14, right:14, top:40, bottom:16}, didDrawPage: () => {}};
  const opt = Object.assign({}, base, o, {styles:Object.assign({}, base.styles, o.styles || {}), headStyles:Object.assign({}, base.headStyles, o.headStyles || {})});
  if (at && typeof at.autoTable === "function") at.autoTable(doc, opt);
  else if (at && typeof at.default === "function") at.default(doc, opt);
  else doc.autoTable(opt);
  return doc.lastAutoTable.finalY;
}
function pdfEntete(doc, titre, sousTitre){
  const W = doc.internal.pageSize.getWidth();
  const marque = (CFG.MARQUE || ["Préfète", "de la région", "Bretagne"]).map(s => s.toUpperCase());
  doc.setFillColor(0, 0, 145); doc.rect(14, 10, 5, 2, "F"); doc.setFillColor(225, 0, 15); doc.rect(24, 10, 5, 2, "F");
  doc.setDrawColor(200); doc.setLineWidth(.2); doc.rect(19, 10, 5, 2, "S");
  doc.setFont("Marianne", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  marque.forEach((l, i) => doc.text(l, 14, 17 + i * 3.9));
  doc.setFont("Marianne", "normal"); doc.setFontSize(6.5);
  ["Liberté", "Égalité", "Fraternité"].forEach((l, i) => doc.text(l, 14, 17 + marque.length * 3.9 + 1 + i * 2.6));
  doc.setFont("Marianne", "bold"); doc.setFontSize(14); doc.setTextColor(0, 0, 145);
  doc.text(titre, W - 14, 17, {align:"right"});
  doc.setFont("Marianne", "normal"); doc.setFontSize(9); doc.setTextColor(58, 58, 58);
  if (sousTitre) doc.text(sousTitre, W - 14, 22.5, {align:"right"});
  doc.text("Calculette GREN — " + new Date().toLocaleDateString("fr-FR"), W - 14, 27, {align:"right"});
  doc.setTextColor(22, 22, 22);
}
function pdfPied(doc){
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(221); doc.setLineWidth(.2); doc.line(14, H - 11, W - 14, H - 11);
    doc.setFont("Marianne", "normal"); doc.setFontSize(7); doc.setTextColor(102, 102, 102);
    doc.text("Calculette GREN — document d'aide à la décision, non réglementaire. Référentiel : " + refLabel() + ".", 14, H - 7);
    doc.text(`Page ${i} / ${n}`, W - 14, H - 7, {align:"right"});
  }
}
function pdfMeta(doc, y0){
  const e = S.exploitation;
  const items = [["Exploitation", e.raison], ["N° PACAGE", e.pacage], ["Exploitant·e", e.exploitant], ["Commune", e.commune], ["SAU", fmt(sau(), 2) + " ha"]];
  doc.setFontSize(8.5); let x = 14; const W = doc.internal.pageSize.getWidth();
  items.forEach(([k, v]) => { doc.setFont("Marianne", "bold"); const w = doc.getTextWidth(k + " : "); const t = String(v || "—");
    doc.setFont("Marianne", "normal"); const wt = doc.getTextWidth(t);
    if (x > 14 && x + w + wt > W - 14) { x = 14; y0 += 4.5; }
    doc.setFont("Marianne", "bold"); doc.text(k + " : ", x, y0); doc.setFont("Marianne", "normal"); doc.text(t, x + w, y0); x += w + wt + 8; });
  return y0 + 5;
}
const pdfNom = (base) => `${base}_${(S.exploitation.pacage || "exploitation")}_${S.annee}.pdf`;
function pdfPPFPages(doc, y){
  const lines = ppfLines(y); const b = bilanOrga(y);
  pdfEntete(doc, "Plan Prévisionnel de Fumure azotée", `Campagne ${y - 1}-${y}`);
  let cy = pdfMeta(doc, 42);
  const body = lines.map(({p, r, members}) => !r
    ? [parcelLabel(p) + "\n" + parcelCode(p), fmt(num(p.surface), 2), p.zone || "standard", {content:"culture non renseignée", colSpan:13, styles:{textColor:[102,102,102]}}]
    : [parcelLabel(p) + "\n" + (members ? p._members : parcelCode(p)), fmt(num(p.surface), 2), p.zone || "standard", r.cult.nom, r.prec?.nom || "—",
       r.forfait ? "forfait" : fmt(r.rdt.val, 1) + " " + r.cult.unite, fmt(r.besoin), fmt(r.rsh), fmt(r.mh), fmt(r.precEff + r.cipanEff + r.arriere + r.pat.nEff),
       fmt(r.nOrgEff), r.corr ? (r.corr > 0 ? "+" : "") + fmt(r.corr) : "0", fmt(r.doseCalc), r.cult.plafond === "" ? "—" : fmt(r.plafond),
       {content:fmt(r.doseFinale), styles:{fontStyle:"bold"}}, fmt(r.doseFinale * num(p.surface))]);
  const totN = lines.reduce((a, x) => a + (x.r ? x.r.doseFinale * num(x.p.surface) : 0), 0);
  const numCols = {}; for (let i = 5; i <= 15; i++) numCols[i] = {halign:"right"}; numCols[1] = {halign:"right"};
  cy = AT(doc, {startY:cy + 2,
    head:[["Parcelle / îlot", "ha", "Zone", "Culture", "Précédent", "Rdt obj.", "Besoin", "RSH", "Mh", "Autres fourn.", "N org. eff.", "Corr.", "Dose calc.", "Plafond", "Dose finale", "Total kg N"]],
    body, foot:[["Total", fmt(lines.reduce((a, x) => a + num(x.p.surface), 0), 2), "", "", "", "", "", "", "", "", "", "", "", "", "", fmt(totN)]],
    columnStyles:Object.assign({0:{cellWidth:42}}, numCols), footStyles:{halign:"right"}, showFoot:"lastPage"});
  const H = doc.internal.pageSize.getHeight();
  if (cy > H - 50) { doc.addPage("a4", "landscape"); cy = 20; }
  doc.setFontSize(9); doc.setFont("Marianne", "bold");
  doc.text(`Azote organique (épandu + pâturage) : ${fmt(b.tot)} kg N, soit ${fmt(b.parHa)} kg N/ha SAU (plafond ${b.plafond}) — ${b.parHa > b.plafond ? "NON CONFORME" : "conforme"}`, 14, cy + 7);
  doc.setFont("Marianne", "normal"); doc.setFontSize(7.5); doc.setTextColor(80, 80, 80);
  doc.text(doc.splitTextToSize("Doses en kg N/ha calculées par la méthode du bilan prévisionnel (besoins − fournitures du sol − azote organique efficace ± corrections), plafonnées par culture.", doc.internal.pageSize.getWidth() - 28), 14, cy + 12);
  doc.setTextColor(22, 22, 22); doc.setDrawColor(22); doc.setLineWidth(.3);
  const W = doc.internal.pageSize.getWidth(), mid = W / 2;
  doc.line(14, cy + 22, mid - 6, cy + 22); doc.line(mid + 6, cy + 22, W - 14, cy + 22);
  doc.setFontSize(8); doc.text("Date et signature de l'exploitant·e", 14, cy + 26); doc.text("Observations", mid + 6, cy + 26);
}
function pdfFichePage(doc, p, y){
  const r = calc(p, y); if (!r) return false;
  const c = r.c;
  pdfEntete(doc, "Fiche de calcul — dose d'azote", `${parcelLabel(p)} · récolte ${y}`);
  let cy = pdfMeta(doc, 42);
  cy = AT(doc, {startY:cy + 2, theme:"plain", styles:{fontSize:8.5}, columnStyles:{0:{fontStyle:"bold", cellWidth:48}, 2:{fontStyle:"bold", cellWidth:44}},
    body:[["Parcelle", `${parcelLabel(p)} (${parcelCode(p)})`, "Surface", fmt(num(p.surface), 2) + " ha"],
      ["Type de sol", solById(p.sol).nom, "Zonage", p.zone || "standard"],
      ["Culture", r.cult.nom, "Précédent", r.prec?.nom || "—"],
      ["Rendement objectif", r.forfait ? "forfait GREN" : `${fmt(r.rdt.val, 1)} ${r.cult.unite} (${r.rdt.src})`, "RSH", c.rshMode === "mesure" ? "analyse de sol" : "forfait"],
      ["Couvert / CIPAN", (byId(R().cipan, c.cipan) || {nom:"—"}).nom + (c.cipanDate ? ` — détruit le ${frDate(c.cipanDate)}` : ""), "Pailles / irrigation", `${c.paille === "exportee" ? "exportées" : c.paille === "enfouie" ? "enfouies" : "sans objet"} / ${c.irrigation ? "irriguée" : "non irriguée"}`]]});
  const L = [["Besoins de la culture" + (r.forfait ? " (forfait)" : ` (${fmt(r.rdt.val, 1)} × ${r.cult.b}${r.rf ? " + Rf " + r.rf : ""}${r.irrig ? " + irrigation " + r.irrig : ""})`), "", fmt(r.besoin)]];
  if (!r.forfait) { L.push(["Reliquat sortie hiver (RSH)", "−", fmt(r.rsh)], ["Minéralisation de l'humus (Mh)", "−", fmt(r.mh)]);
    if (r.precEff) L.push(["Effet du précédent", "−", fmt(r.precEff)]); if (r.cipanEff) L.push(["Couvert / CIPAN", "−", fmt(r.cipanEff)]); }
  r.org.forEach(o => L.push([`${o.e.nom} du ${frDate(o.i.date)} : ${fmt(num(o.i.qte), 1)} ${o.e.unite || ""}/ha × ${fmt(o.teneur, 1)} kg N × Keq ${fmt(o.keq, 2)}`, "−", fmt(o.nEff)]));
  if (r.arriere) L.push([`Arrière-effet des apports organiques ${y - 1}`, "−", fmt(r.arriere)]);
  if (r.pat.nEff) L.push([`Restitutions au pâturage (${fmt(r.pat.ugb, 1)} UGB × ${r.pat.jours} j)`, "−", fmt(r.pat.nEff)]);
  if (r.corr) L.push([`Correction résidus (paille ${c.paille === "exportee" ? "exportée" : "enfouie"})`, r.corr > 0 ? "+" : "−", fmt(Math.abs(r.corr))]);
  cy = AT(doc, {startY:cy + 4, head:[["Poste du bilan", "", "kg N/ha"]], body:L,
    foot:[["Dose calculée", "=", fmt(r.doseCalc)], [`Plafond GREN ${r.cult.nom}`, "", r.cult.plafond === "" ? "—" : fmt(r.plafond)], ["DOSE FINALE PRÉVISIONNELLE", "", fmt(r.doseFinale)]],
    columnStyles:{1:{halign:"center", cellWidth:10}, 2:{halign:"right", cellWidth:28}}, footStyles:{fillColor:[227,227,253], textColor:[0,0,145]}, styles:{fontSize:8.5}, showFoot:"lastPage"});
  doc.setFont("Marianne", "bold"); doc.setFontSize(10); doc.setTextColor(0, 0, 145);
  doc.text(`Soit ${fmt(r.doseFinale * num(p.surface))} kg N sur la parcelle · engrais minéral prévu : ${fmt(r.minPrevu)} kg N/ha${r.reste > 0 ? ` (reste à apporter : ${fmt(r.reste)})` : ""}`, 14, cy + 7);
  doc.setTextColor(22, 22, 22);
  if (c.notes) { doc.setFont("Marianne", "normal"); doc.setFontSize(8.5); doc.text(doc.splitTextToSize("Notes : " + c.notes, doc.internal.pageSize.getWidth() - 28), 14, cy + 14); }
  return true;
}
async function pdfAction(fn, nom){
  toast("Préparation du PDF…");
  try { const doc = await fn(); pdfPied(doc); doc.save(nom); toast("PDF téléchargé."); }
  catch(e){ console.error(e); toast("Le PDF n'a pas pu être créé : " + e.message, true); }
}
const pdfPPF = (fiches) => pdfAction(async () => {
  const doc = await pdfDoc("landscape"); const y = S.annee;
  pdfPPFPages(doc, y);
  if (fiches) for (const p of S.parcelles) { if (!calc(p, y)) continue; doc.addPage("a4", "portrait"); pdfFichePage(doc, p, y); }
  suivre("export_ppf"); return doc;
}, pdfNom(fiches ? "PPF_et_fiches" : "PPF"));
const pdfFiche = () => pdfAction(async () => {
  const doc = await pdfDoc("portrait"); const p = byId(S.parcelles, S.sel); pdfFichePage(doc, p, S.annee); suivre("export_ppf"); return doc;
}, pdfNom("Fiche_" + normTxt(parcelLabel(byId(S.parcelles, S.sel) || {})).replace(/ /g, "-")));
const pdfComparatif = () => pdfAction(async () => {
  const y = S.annee; const ref = byId(S.references, S.refSel) || S.references[0];
  const doc = await pdfDoc("landscape");
  pdfEntete(doc, "Comparatif des résultats", `Récolte ${y} · référence : ${ref.nom}`.slice(0, 110));
  let cy = pdfMeta(doc, 42);
  const {rows, orphelines} = comparaison(ref, y);
  const sign = v => v > 0 ? "+" + fmt(v) : v < 0 ? "−" + fmt(-v) : "0";
  const cmp = rows.filter(x => x.ecart != null);
  const totA = cmp.reduce((a, x) => a + x.a.dose * x.a.surface, 0), totO = cmp.reduce((a, x) => a + x.o.dose * x.a.surface, 0);
  const nc = {}; [1, 3, 4, 5, 6, 7, 8, 9].forEach(i => nc[i] = {halign:"right"});
  cy = AT(doc, {startY:cy + 2, head:[["Parcelle", "ha", "Culture (réf. → actuelle)", "Rdt réf.", "Rdt actuel", "Dose réf.", "Dose actuelle", "Écart kg N/ha", "Écart %", "Écart total kg N", "Tendance"]],
    body:rows.map(({p, a, o, ecart, ecartPct}) => [parcelLabel(p) + "\n" + a.code, fmt(a.surface, 2),
      o && o.culture && !memeCulture(o.culture, a.culture) ? `${o.culture} → ${a.culture || "?"}` : (a.culture || o?.culture || "—"),
      o && o.rendement != null ? fmt(o.rendement, 1) : "—", a.rendement != null ? fmt(a.rendement, 1) : "—",
      o && o.dose != null ? fmt(o.dose) : o ? "—" : "absente", a.dose != null ? fmt(a.dose) : "—",
      {content:ecart != null ? sign(ecart) : "—", styles:{fontStyle:"bold"}}, ecartPct != null ? (ecartPct > 0 ? "+" : ecartPct < 0 ? "−" : "") + fmt(Math.abs(ecartPct), 1) + " %" : "—",
      ecart != null ? sign(ecart * a.surface) : "—", ecart == null ? "" : ecart >= 10 ? "Hausse" : ecart <= -10 ? "Baisse" : "Stable"]),
    foot:[["Total comparé", "", "", "", "", fmt(totO), fmt(totA), "", "", sign(totA - totO), ""]], columnStyles:Object.assign({0:{cellWidth:46}}, nc), showFoot:"lastPage"});
  if (orphelines.length) { doc.setFontSize(8); doc.text(doc.splitTextToSize(`${orphelines.length} ligne(s) du fichier de référence sans parcelle correspondante : ` + orphelines.map(l => l.nom || l.code || `îlot ${l.ilot}`).join(", "), doc.internal.pageSize.getWidth() - 28), 14, cy + 7); }
  return doc;
}, pdfNom("Comparatif"));

/* =========================================================================
   UTILITAIRES D'INTERFACE
   ========================================================================= */
function toast(msg, err){
  document.querySelectorAll(".gren-toast").forEach(t => t.remove());
  const t = document.createElement("div"); t.className = "gren-toast fr-alert fr-alert--sm " + (err ? "fr-alert--error" : "fr-alert--success");
  t.setAttribute("role", err ? "alert" : "status"); t.innerHTML = `<p>${esc(msg)}</p>`; document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
}
function dialog({title, body, buttons = [{label:"OK"}], block = false}){
  const d = $("#dlg"); d.className = "gren-modal" + (block ? " block" : "");
  $("#dlgH").textContent = title; $("#dlgB").innerHTML = body; const f = $("#dlgF"); f.innerHTML = "";
  return new Promise(res => { let done = false;
    buttons.forEach((b, i) => { const el = document.createElement("button"); el.type = "button";
      el.className = "fr-btn" + (b.cls === "ghost" ? " fr-btn--secondary" : b.cls === "danger" ? " fr-btn--secondary" : "");
      el.textContent = b.label; el.onclick = () => { done = true; d.close(); res(b.value ?? i); }; f.appendChild(el); });
    d.onclose = () => { if (!done) res(null); }; d.showModal(); });
}
const confirmer = (title, body, ok = "Confirmer") => dialog({title, body:`<p>${body}</p>`, buttons:[{label:"Annuler", cls:"ghost", value:0}, {label:ok, value:1}]}).then(v => v === 1);
async function demander(title, label, value){
  const v = await dialog({title, body:fInput(label, 'data-dlg-input', value), buttons:[{label:"Annuler", cls:"ghost", value:0}, {label:"Valider", value:1}]});
  return v === 1 ? ($("[data-dlg-input]")?.value || "").trim() : null;
}
function aller(tab, ancre){
  S.tab = tab; save(); render();
  try { if (window.dsfr) window.dsfr($("#menu-principal")).modal.conceal(); } catch(e){}
  if (ancre) setTimeout(() => document.getElementById(ancre)?.scrollIntoView({behavior:"smooth"}), 50); else { window.scrollTo(0, 0); $("#contenu").focus({preventScroll:true}); }
}

/* =========================================================================
   ÉVÉNEMENTS
   ========================================================================= */
document.addEventListener("click", async ev => {
  const al = ev.target.closest("[data-ancre-local]"); if (al) { ev.preventDefault(); document.getElementById(al.dataset.ancreLocal)?.scrollIntoView({behavior:"smooth"}); return; }
  const t = ev.target.closest("[data-tab],[data-act],[data-selp],[data-cochep]"); if (!t) return;
  if (t.dataset.tab) { ev.preventDefault(); aller(t.dataset.tab, t.dataset.ancre); return; }
  if (t.dataset.cochep !== undefined) { if (!ev.target.closest("input,label,button,select")) { const id = t.dataset.cochep; SEL.has(id) ? SEL.delete(id) : SEL.add(id); const sy = scrollY; render(); scrollTo(0, sy); } return; }
  if (t.dataset.selp) { S.sel = t.dataset.selp; save(); render(); if (innerWidth < 992) $("#detail")?.scrollIntoView({behavior:"smooth"}); return; }
  if (t.tagName === "INPUT" || t.tagName === "SELECT") return;
  const a = t.dataset.act; ev.preventDefault(); const y = S.annee;
  switch (a) {
    case "yPrev": S.annee--; save(); render(); break;
    case "yNext": S.annee++; save(); render(); break;
    case "demo": if (S.parcelles.length && !await confirmer("Charger l'exemple ?", "Vos données actuelles seront remplacées.", "Remplacer")) return;
      S = demoState(); save(); render(); toast("Exemple chargé."); suivre("exemple"); break;
    case "reset": if (!await confirmer("Effacer toutes mes informations ?", "Votre exploitation, vos parcelles, vos calculs, vos apports et vos comparaisons seront <strong>définitivement effacés de cet appareil</strong>. Si vous voulez les garder, enregistrez d'abord une copie (onglet Exporter et comparer).", "Tout effacer")) return;
      effacerTout(); render(); toast("Toutes vos informations ont été effacées de cet appareil."); break;
    case "export": download(`Calculette-GREN_${(normTxt(S.exploitation.raison) || S.exploitation.pacage || "mes-donnees").replace(/ /g, "-")}_${new Date().toLocaleDateString("fr-FR").replace(/\//g, "-")}.gren`, JSON.stringify(S), "application/octet-stream"); toast("Copie enregistrée dans vos téléchargements."); suivre("export_sauvegarde"); break;
    case "adminOuvrir": adminConnexion(); break;
    case "creerCompte": creerCompteAdmin(); break;
    case "copierLigne": { const t_ = $("#ligneCompte")?.textContent || ""; try { await navigator.clipboard.writeText(t_.trim()); toast("Ligne copiée : collez-la dans config.js."); } catch(e){ toast("Copie impossible : sélectionnez la ligne à la main.", true); } break; }
    case "adminDeconnexion": try { sessionStorage.removeItem("gren-admin-local"); } catch(e){} toast("Déconnecté de l'espace administrateur."); aller("exploitation"); break;
    case "addParcelle": S.parcelles.push({id:uid(), ilot:String(S.parcelles.length + 1), num:"1", nom:"", surface:"", sol:S.exploitation.sol || "limsain", zone:"standard", dept:S.exploitation.departement}); save(); render(); break;
    case "delParcelle": { const pid = t.closest("tr").dataset.pid; const p = byId(S.parcelles, pid);
      if (!await confirmer("Supprimer la parcelle ?", `${esc(parcelLabel(p))} et ses données de campagne seront supprimées.`, "Supprimer")) return;
      S.parcelles = S.parcelles.filter(x => x.id !== pid);
      for (const c of Object.values(S.campagnes)) { delete c.cultures[pid]; c.interventions = c.interventions.filter(i => i.pid !== pid); c.groupes = (c.groupes || []).map(g => ({...g, ids:g.ids.filter(i => i !== pid)})).filter(g => g.ids.length > 1); }
      save(); render(); break; }
    case "modele": telechargerModele(); break;
    case "addInterv": interventionForm(t.dataset.pid || S.sel); break;
    case "addIntervSel": interventionForm(null, true); break;
    case "selTout": S.parcelles.forEach(p => SEL.add(p.id)); render(); break;
    case "selAucune": SEL.clear(); render(); break;
    case "voirParcelle": S.modeSaisie = "unite"; S.sel = t.dataset.pid; save(); render(); $("#detail")?.scrollIntoView({behavior:"smooth"}); break;
    case "lotAppliquer": { const ids = selection(); const so = $("#lotSol").value, zo = $("#lotZone").value, de = $("#lotDept").value;
      if (!so && !zo && !de) { toast("Choisissez d'abord un type de sol, un zonage ou un département.", true); break; }
      for (const id of ids) { const p = byId(S.parcelles, id); if (so) p.sol = so; if (zo) p.zone = zo; if (de) p.dept = de; }
      save(); render(); toast(`${ids.length} parcelle(s) modifiée(s).`); break; }
    case "lotSupprimer": { const ids = selection();
      if (!await confirmer(`Supprimer ${ids.length} parcelle(s) ?`, `${ids.map(id => esc(parcelLabel(byId(S.parcelles, id)))).join(", ")} et leurs données (cultures, apports) seront supprimées.`, "Supprimer")) return;
      S.parcelles = S.parcelles.filter(p => !SEL.has(p.id));
      for (const c of Object.values(S.campagnes)) { ids.forEach(id => delete c.cultures[id]); c.interventions = c.interventions.filter(i => !SEL.has(i.pid)); c.groupes = (c.groupes || []).map(g => ({...g, ids:g.ids.filter(i => !SEL.has(i))})).filter(g => g.ids.length > 1); }
      SEL.clear(); save(); render(); toast(`${ids.length} parcelle(s) supprimée(s).`); break; }
    case "delInterv": { const id = t.closest("tr").dataset.iid; camp(y).interventions = camp(y).interventions.filter(i => i.id !== id); save(); render(); break; }
    case "addAnimal": { const c = entry(S.sel, y); c.pature = c.pature || {jours:"", animaux:[]}; c.pature.animaux.push({cat:"vl", n:""}); save(); render(); break; }
    case "delAnimal": { const c = entry(S.sel, y); c.pature.animaux.splice(+t.dataset.i, 1); save(); render(); break; }
    case "valGroupe": { const ids = t.dataset.ids.split(","); const cc = camp(y); cc.groupes = (cc.groupes || []).map(g => ({...g, ids:g.ids.filter(i => !ids.includes(i))})).filter(g => g.ids.length > 1);
      const k = groupKey(byId(S.parcelles, ids[0]), y);
      cc.groupes.push({nom:`${cultureById(k.culture).nom} / ${precById(k.precedent)?.nom || "?"} — ${solById(k.sol).nom}${k.zone !== "standard" ? " — " + k.zone : ""}`, ids}); save(); render(); toast("Groupe validé."); break; }
    case "delGroupe": camp(y).groupes.splice(+t.dataset.g, 1); save(); render(); break;
    case "harmo": { const g = camp(y).groupes[+t.dataset.g]; const src = entry(g.ids[0], y);
      for (const id of g.ids.slice(1)) { const c = entry(id, y); for (const f of ["rdtMode","rdtLibre","rdtHist","rshMode","rshMesure","cipan","cipanDate","paille","irrigation"]) c[f] = clone(src[f]); }
      save(); render(); toast("Saisies alignées sur la première parcelle du groupe."); break; }
    case "print": window.print(); break;
    case "pdfPPF": pdfPPF(false); break;
    case "pdfPPFfiches": pdfPPF(true); break;
    case "pdfFiche": pdfFiche(); break;
    case "pdfComparatif": pdfComparatif(); break;
    case "xlsxPPF": exporterPPFxlsx(); break;
    case "xlsxComparatif": exporterComparatifXlsx(); break;
    case "snapshot": { const nom = await demander("Garder mes résultats actuels", "Nom pour les retrouver", `Mes résultats du ${new Date().toLocaleDateString("fr-FR")}`); if (!nom) return;
      S.references = S.references || []; const r = {id:uid(), nom, source:"instantane", date:new Date().toISOString(), annee:y, lignes:resultatsActuels(y)};
      S.references.unshift(r); S.refSel = r.id; save(); render(); toast("Résultats gardés. Modifiez vos saisies puis revenez ici pour comparer."); break; }
    case "refDelete": { const r = byId(S.references, S.refSel) || S.references[0]; if (!await confirmer("Retirer cette comparaison ?", esc(r.nom), "Retirer")) return;
      S.references = S.references.filter(x => x.id !== r.id); S.refSel = S.references[0]?.id; save(); render(); break; }
    case "exportRef": download("referentiel-gren.json", JSON.stringify(R(), null, 1), "application/json"); break;
    case "resetRef": if (!await confirmer("Rétablir le référentiel ?", "Vos modifications du référentiel seront perdues.", "Rétablir")) return;
      S.ref = clone(REF_DEFAULT); S.refSource = null; S.refVersion = null; save(); render(); syncServeur(); break;
    case "refOfficiel": S.refSource = null; S.refVersion = null; save(); syncServeur(); break;
    case "refAdd": { const T = REF_TABLES.find(x => x.k === t.dataset.k); const row = {}; T.cols.forEach(([f,, ty]) => row[f] = Array.isArray(ty) ? ty[0] : ty === "n" ? 0 : ""); if ("id" in row) row.id = uid().slice(0, 5); R()[T.k].push(row); S.refSource = "perso"; save(); render(); break; }
    case "refDel": R()[t.dataset.k].splice(+t.dataset.i, 1); S.refSource = "perso"; save(); render(); break;
  }
});
document.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.matches && ev.target.matches("tr[data-selp]")) ev.target.click(); });
document.addEventListener("change", ev => {
  const t = ev.target; const y = S.annee;
  if (t.dataset.e) { if (t.dataset.e === "pacage") t.value = t.value.replace(/\D/g, ""); S.exploitation[t.dataset.e] = t.value; save(); if (["sau","departement"].includes(t.dataset.e)) render(); return; }
  if (t.dataset.p) { const p = byId(S.parcelles, t.closest("tr").dataset.pid); p[t.dataset.p] = t.value; save(); render(); return; }
  if (t.dataset.c) {
    const c = entry(t.closest("[data-pid]").dataset.pid, y); const f = t.dataset.c;
    const v = t.type === "checkbox" ? t.checked : t.value;
    if (f.includes(".")) { const [a, b] = f.split("."); c[a] = c[a] || {}; c[a][b] = v; } else c[f] = v;
    if (f === "culture" && v) suivre("calcul", v);
    save(); const sy = scrollY; render(); scrollTo(0, sy); return;
  }
  if (t.dataset.pat) { const c = entry(S.sel, y); c.pature.animaux[+t.dataset.i][t.dataset.pat] = t.value; save(); render(); return; }
  if (t.dataset.i === "statut") { const it = camp(y).interventions.find(i => i.id === t.closest("tr").dataset.iid); it.statut = t.value; save(); render(); return; }
  if (t.dataset.param) { const k = t.dataset.param; R().params[k] = k === "cipanLimite" ? t.value : num(t.value); S.refSource = "perso"; save(); return; }
  if (t.dataset.ref) { const row = R()[t.dataset.ref][+t.dataset.i]; row[t.dataset.f] = t.dataset.t === "n" ? (t.value.trim() === "" ? "" : num(t.value)) : t.value; S.refSource = "perso"; save(); return; }
  if (t.id === "csvFile") { readFile(t, txt => $("#csvTxt").value = txt); return; }
  const a = t.dataset.act;
  if (a === "import") readFile(t, async txt => { let s;
      try { s = JSON.parse(txt.replace(/^\uFEFF/, "")); if (!s.version || !s.parcelles) throw 0; } catch(e){ toast("Ce fichier n'est pas une copie Calculette GREN.", true); return; }
      if (S.parcelles.length && !await confirmer("Reprendre cette copie ?", `Les informations actuelles de cet appareil seront remplacées par celles de la copie (${esc(String(s.exploitation?.raison || "exploitation"))}, ${Array.isArray(s.parcelles) ? s.parcelles.length : 0} parcelle(s)).`, "Remplacer")) return;
      S = migrate(s); save(); render(); toast("Vos données ont été reprises."); });
  if (a === "importRef") readFile(t, txt => { try { const r = JSON.parse(txt); if (!r.cultures) throw 0; S.ref = migrateRef(r); S.refSource = "perso"; save(); render(); toast("Référentiel importé."); } catch(e){ toast("Fichier invalide.", true); } });
  if (t.dataset.coche) { t.checked ? SEL.add(t.dataset.coche) : SEL.delete(t.dataset.coche); const sy = scrollY; render(); scrollTo(0, sy); return; }
  if (a === "cocheTout") { t.checked ? S.parcelles.forEach(p => SEL.add(p.id)) : SEL.clear(); render(); return; }
  if (a === "modeSaisie") { S.modeSaisie = t.value; save(); render(); return; }
  if (a === "selCulture" && t.value) { S.parcelles.forEach(p => { if (entry(p.id, y).culture === t.value) SEL.add(p.id); }); render(); return; }
  if (a === "selGroupe" && t.value !== "") { (camp(y).groupes[+t.value]?.ids || []).forEach(id => SEL.add(id)); render(); return; }
  if (t.dataset.g) { appliquerGroupe(t.dataset.g, t.value); save(); const sy = scrollY; render(); scrollTo(0, sy); return; }
  if (a === "conserver") { choisirConservation(t.checked); render(); toast(t.checked ? "Vos informations seront gardées sur cet appareil." : "Vos informations seront effacées à la fermeture de l'onglet."); return; }
  if (a === "importModele") { const f = t.files[0]; t.value = ""; if (f) importerModele(f); return; }
  if (a === "importResultats") { const f = t.files[0]; t.value = ""; if (!f) return; lireResultats(f).then(r => {
      try { if (!r.lignes.length) throw new Error("aucune ligne exploitable");
        S.references = S.references || []; const ref = {id:uid(), nom:r.nom, source:"fichier", date:new Date().toISOString(), annee:S.annee, lignes:r.lignes};
        S.references.unshift(ref); S.refSel = ref.id; save(); render(); toast(`Fichier lu : ${r.lignes.length} ligne(s). Voir la comparaison ci-dessous.`);
      } catch(e){ throw e; } }).catch(e => toast("Fichier non reconnu : " + (e.message || "format invalide") + ". Il faut un fichier Excel avec une colonne « dose » et le n° d'îlot ou le nom de chaque parcelle.", true)); return; }
  if (a === "refSel") { S.refSel = t.value; save(); render(); }
  if (a === "ppfGroup") { S.ppfGroup = t.checked; save(); render(); }
});
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (TABS.some(x => x[0] === h) && h !== S.tab) aller(h); });

/* =========================================================================
   IMPORT / EXPORT
   ========================================================================= */
function download(name, content, type){
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], {type})); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function readFile(input, cb){ const f = input.files[0]; input.value = ""; if (!f) return;
  if (f.size > 10 * 1024 * 1024) { toast("Fichier trop volumineux (10 Mo maximum).", true); return; }
  const r = new FileReader(); r.onload = () => cb(r.result); r.readAsText(f); }
function matchRef(arr, v){ v = String(v || "").trim().toLowerCase(); if (!v) return ""; const m = arr.find(o => o.id.toLowerCase() === v) || arr.find(o => o.nom.toLowerCase() === v) || arr.find(o => o.nom.toLowerCase().includes(v) || v.includes(o.nom.toLowerCase())); return m ? m.id : ""; }
/* =========================================================================
   EXEMPLE
   ========================================================================= */
function demoState(){
  const s = newState(); const y = s.annee;
  s.exploitation = {pacage:"022123456", raison:"GAEC de l'Exemple", exploitant:"Camille Exemple", adresse:"Lieu-dit Ker Exemple", departement:"22", commune:"Loudéac (22)", insee:"", sol:"limsain", sau:""};
  const P = (ilot, num, nom, surface, sol, zone) => ({id:uid(), ilot, num, nom, surface, sol, zone, dept:"22"});
  s.parcelles = [P("1","1","Grand champ",6.2,"limsain","standard"), P("1","2","Champ du milieu",4.8,"limsain","standard"),
    P("2","1","Les Landes",5.5,"schist","ZAR"), P("3","1","Le Vallon",3.1,"limhyd","standard"), P("4","1","Pré de la ferme",7.0,"limhyd","standard"), P("5","1","Derrière l'étable",4.0,"limsain","standard")];
  const [a, b, c, d, e, f] = s.parcelles.map(p => p.id);
  const mk = (cult, prec, extra={}) => Object.assign({culture:cult, precedent:prec, rdtMode:"ref", rdtLibre:"", rdtHist:"", rdtRealise:"", rshMode:"forfait", rshMesure:"", cipan:"aucune", cipanDate:"", paille:"", irrigation:false, pature:{jours:"", animaux:[]}, notes:""}, extra);
  s.campagnes[y-1] = {cultures:{
      [a]:mk("maie","cereale",{rdtRealise:14.8}), [b]:mk("maie","cereale",{rdtRealise:14.2}), [c]:mk("ble","maise",{rdtRealise:78}),
      [d]:mk("ble","maise",{rdtRealise:72}), [e]:mk("prpa","prairie",{pature:{jours:180, animaux:[{cat:"vl", n:30}]}}), [f]:mk("ble","colza",{rdtRealise:84})},
    interventions:[{id:uid(), pid:a, date:`${y-1}-04-10`, type:"organique", produit:"lisbov", qte:30, teneur:"", statut:"realise"},
      {id:uid(), pid:b, date:`${y-1}-04-10`, type:"organique", produit:"lisbov", qte:30, teneur:"", statut:"realise"}], groupes:[]};
  s.campagnes[y] = {cultures:{
      [a]:mk("ble","maise",{rdtMode:"hist", rdtHist:"80;84;66;79;81", paille:"exportee"}), [b]:mk("ble","maise",{rdtMode:"hist", rdtHist:"80;84;66;79;81", paille:"exportee"}),
      [c]:mk("maie","cereale",{cipan:"nonleg", cipanDate:`${y}-02-20`}), [d]:mk("maie","cereale",{cipan:"nonleg", cipanDate:`${y}-02-20`, rshMode:"mesure", rshMesure:"55"}),
      [e]:mk("prpa","prairie",{pature:{jours:200, animaux:[{cat:"vl", n:35},{cat:"g1", n:10}]}}), [f]:mk("orgh","cereale",{paille:"enfouie"})},
    interventions:[      {id:uid(), pid:d, date:`${y}-04-15`, type:"organique", produit:"lisporc", qte:35, teneur:"", statut:"prev"},
      {id:uid(), pid:a, date:`${y}-02-25`, type:"organique", produit:"lisbov", qte:25, teneur:"", statut:"prev"},
      {id:uid(), pid:b, date:`${y}-02-25`, type:"organique", produit:"lisbov", qte:25, teneur:"", statut:"prev"},
      {id:uid(), pid:a, date:`${y}-03-20`, type:"mineral", produit:"amo", qte:200, teneur:"", statut:"prev"}], groupes:[]};
  s.tab = "campagne"; s.sel = a;
  return s;
}


/* =========================================================================
   DÉMARRAGE
   ========================================================================= */
{ const h = location.hash.slice(1); if (TABS.some(x => x[0] === h)) S.tab = h; }
render();
suivre("visite");
syncServeur();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
