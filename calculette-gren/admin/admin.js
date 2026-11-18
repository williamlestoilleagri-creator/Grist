/* =============================================================================
   Calculette GREN — backoffice d'administration
   Authentification Supabase (mot de passe + double facteur TOTP obligatoire),
   droits vérifiés côté serveur (RLS), journalisation des connexions et attaques.
   ============================================================================= */
"use strict";
if (window.top !== window.self) { document.documentElement.innerHTML = ""; throw new Error("Affichage dans un cadre refusé"); }

const CFG = window.GREN_CONFIG || {};
const SRV = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
const sb = SRV ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:"implicit", storageKey:"gren-admin-auth"}}) : null;

/* ---------- utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = (v, d = 0) => (Math.round((+v || 0) * 10 ** d) / 10 ** d).toLocaleString("fr-FR", {minimumFractionDigits:d, maximumFractionDigits:d});
const dt = v => v ? new Date(v).toLocaleString("fr-FR", {dateStyle:"short", timeStyle:"medium"}) : "—";
const dj = v => v ? new Date(v).toLocaleDateString("fr-FR") : "—";
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 10);
const filtreTxt = s => String(s || "").replace(/[^\w@.\-:À-ÿ ]/g, "").trim().slice(0, 80);
let _n = 0; const nid = () => "a" + (++_n);
function idDe(attrs){ const m = /\bid="([^"]+)"/.exec(attrs || ""); return m ? [m[1], attrs.replace(m[0], "")] : [nid(), attrs]; }
const lbl = (l, h) => `${l}${h ? `<span class="fr-hint-text">${h}</span>` : ""}`;
function fInput(label, attrs, value = "", {hint = "", type = "text"} = {}){ let id; [id, attrs] = idDe(attrs);
  return `<div class="fr-input-group"><label class="fr-label" for="${id}">${lbl(label, hint)}</label><input class="fr-input" id="${id}" type="${type}" ${attrs} value="${esc(value)}"></div>`; }
function fSelect(label, attrs, options, {hint = ""} = {}){ let id; [id, attrs] = idDe(attrs);
  return `<div class="fr-select-group"><label class="fr-label" for="${id}">${lbl(label, hint)}</label><select class="fr-select" id="${id}" ${attrs}>${options}</select></div>`; }
function fTextarea(label, attrs, value = "", hint = ""){ let id; [id, attrs] = idDe(attrs);
  return `<div class="fr-input-group"><label class="fr-label" for="${id}">${lbl(label, hint)}</label><textarea class="fr-input" id="${id}" ${attrs} rows="3">${esc(value)}</textarea></div>`; }
const fToggle = (label, attrs, checked, hint = "") => { const id = nid();
  return `<div class="fr-toggle"><input type="checkbox" class="fr-toggle__input" id="${id}" ${attrs} ${checked ? "checked" : ""}><label class="fr-toggle__label" for="${id}" data-fr-checked-label="Activé" data-fr-unchecked-label="Désactivé">${esc(label)}</label>${hint ? `<p class="fr-hint-text">${hint}</p>` : ""}</div>`; };
const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`;
const table = inner => `<div class="fr-table fr-table--bordered fr-table--no-caption"><div class="fr-table__wrapper"><div class="fr-table__container"><div class="fr-table__content"><table>${inner}</table></div></div></div></div>`;
const alerte = (type, titre, texte) => `<div class="fr-alert fr-alert--${type} fr-alert--sm fr-mb-3w">${titre ? `<h3 class="fr-alert__title">${titre}</h3>` : ""}${texte ? `<p>${texte}</p>` : ""}</div>`;
const badge = (txt, type = "") => `<p class="fr-badge fr-badge--sm ${type ? "fr-badge--" + type : ""}">${esc(txt)}</p>`;
const btn = (label, attrs, {kind = "", icon = "", sm = false} = {}) => `<button type="button" class="fr-btn ${kind ? "fr-btn--" + kind : ""} ${sm ? "fr-btn--sm" : ""} ${icon ? "fr-btn--icon-left fr-icon-" + icon : ""}" ${attrs}>${label}</button>`;
const kpi = (v, l, al) => `<div class="gren-kpi ${al ? "alerte" : ""}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
function toast(msg, err){ document.querySelectorAll(".gren-toast").forEach(t => t.remove());
  const t = document.createElement("div"); t.className = "gren-toast fr-alert fr-alert--sm " + (err ? "fr-alert--error" : "fr-alert--success");
  t.setAttribute("role", err ? "alert" : "status"); t.innerHTML = `<p>${esc(msg)}</p>`; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); }
function dialog({title, body, buttons = [{label:"OK"}]}){
  const d = $("#dlg"); $("#dlgH").textContent = title; $("#dlgB").innerHTML = body; const f = $("#dlgF"); f.innerHTML = "";
  return new Promise(res => { let done = false;
    buttons.forEach((b, i) => { const el = document.createElement("button"); el.type = "button"; el.className = "fr-btn" + (b.secondaire ? " fr-btn--secondary" : "");
      el.textContent = b.label; el.onclick = () => { done = true; const vals = {}; d.querySelectorAll("[name]").forEach(x => vals[x.name] = x.type === "checkbox" ? x.checked : x.value); d.close(); res({choix:b.value ?? i, vals}); }; f.appendChild(el); });
    d.onclose = () => { if (!done) res({choix:null, vals:{}}); }; d.showModal(); });
}
const confirmer = async (title, body, ok = "Confirmer") => (await dialog({title, body:`<p>${body}</p>`, buttons:[{label:"Annuler", secondaire:true, value:0}, {label:ok, value:1}]})).choix === 1;
function download(name, content, type){ const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], {type})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function csv(name, head, rows){ const l = r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"); download(name, "﻿" + [head, ...rows].map(l).join("\r\n"), "text/csv"); }
function ua(s){ s = String(s || ""); if (!s) return "—";
  const nav = /Edg\//.test(s) ? "Edge" : /Firefox\//.test(s) ? "Firefox" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : /curl|python|wget|go-http|java|node|axios|okhttp/i.test(s) ? "Script / robot" : "Autre";
  const os = /Windows/.test(s) ? "Windows" : /Android/.test(s) ? "Android" : /iPhone|iPad/.test(s) ? "iOS" : /Mac OS/.test(s) ? "macOS" : /Linux/.test(s) ? "Linux" : "";
  return nav + (os ? " · " + os : ""); }
async function q(promise){ const {data, error} = await promise; if (error) throw error; return data; }

/* ---------- libellés ---------- */
const ROLES = {superadmin:"Super-administrateur", admin:"Administrateur", lecteur:"Lecteur (consultation)"};
const MOTIFS = {mot_de_passe:"Mot de passe incorrect", mfa:"Code de double authentification incorrect", verrouille:"Bloqué : trop d'échecs", ip_bloquee:"Adresse IP bloquée",
  robot:"Robot détecté", non_autorise:"Compte non autorisé", inscription_refusee:"Inscription refusée", mot_de_passe_ok:"Mot de passe correct (étape 1/2)",
  connecte:"Connexion réussie", deconnexion:"Déconnexion", deconnexion_inactivite:"Déconnexion (inactivité)"};
const TYPES_SECU = {force_brute:"Force brute sur les mots de passe", robot:"Robot détecté (champ piège)", tentative_ip_bloquee:"Tentative depuis une IP bloquée",
  ip_bloquee_auto:"IP bloquée automatiquement", attaque_distribuee:"Attaque distribuée sur un compte", echec_double_facteur:"Échec de double authentification",
  acces_refuse:"Accès refusé à un compte non administrateur", inscription_refusee:"Création de compte refusée", flood:"Trop de requêtes (flood)"};
const GRAVITES = {critique:["Critique","error"], haute:["Haute","warning"], moyenne:["Moyenne","new"], faible:["Faible","info"], info:["Info",""]};
const EVTS = {visite:"Visites", calcul:"Calculs", export_ppf:"Exports PDF", export_csv:"Exports CSV", export_sauvegarde:"Sauvegardes", import_parcelles:"Imports de parcelles", nouvelle_campagne:"Nouvelles campagnes", exemple:"Exemples chargés"};
const gravite = g => badge((GRAVITES[g] || [g])[0], (GRAVITES[g] || [])[1]);

/* ---------- état ---------- */
const A = {ecran:"chargement", section:"tableau", moi:null, email:"", recovery:false, msg:"", jours:30, stats:null,
  filtres:{conn:{succes:"", q:""}, secu:{gravite:"", type:"", traite:"non"}}, limite:{conn:100, secu:100, journal:100},
  refEdit:null, mfaEnroll:null, mfaEchecs:0};
const peutEcrire = () => A.moi && ["superadmin", "admin"].includes(A.moi.role);
const estSuper = () => A.moi && A.moi.role === "superadmin";

/* =============================================================================
   AUTHENTIFICATION
   ============================================================================= */
async function route(){
  if (!SRV) { A.ecran = "config"; return render(); }
  const {data:{session}} = await sb.auth.getSession();
  if (!session) { A.moi = null; A.ecran = A.ecran === "invitation" || A.ecran === "oubli" ? A.ecran : "connexion"; return render(); }
  A.email = session.user.email;
  let statut = null; try { statut = await q(sb.rpc("mon_statut")); } catch(e){}
  if (!statut || !statut.actif) {
    try { await sb.rpc("connexion_reussie", {p_etape:"mot_de_passe"}); } catch(e){}
    await sb.auth.signOut(); A.msg = "Ce compte n'est pas autorisé à accéder à l'administration."; A.ecran = "connexion"; return render();
  }
  A.moi = statut;
  const facteurs = (await sb.auth.mfa.listFactors()).data || {all:[], totp:[]};
  const verifies = (facteurs.totp || []).filter(f => f.status === "verified");
  if (!statut.mdp_defini && !verifies.length) { A.ecran = "motdepasse"; return render(); }
  const {data:aal} = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.currentLevel !== "aal2") { A.ecran = verifies.length ? "mfa" : "mfa_enrolement"; return render(); }
  if (A.recovery || !statut.mdp_defini) { A.ecran = "motdepasse"; return render(); }
  const cle = "gren-admin-log-" + session.user.id;
  if (!sessionStorage.getItem(cle)) { sessionStorage.setItem(cle, "1"); try { await sb.rpc("connexion_reussie", {p_etape:"mfa"}); } catch(e){} }
  A.ecran = "app"; render(); chargerSection();
}
async function deconnecter(motif = "deconnexion", message = ""){
  try { await sb.rpc("deconnexion", {p_motif:motif}); } catch(e){}
  Object.keys(sessionStorage).filter(k => k.startsWith("gren-admin-log-")).forEach(k => sessionStorage.removeItem(k));
  await sb.auth.signOut(); A.moi = null; A.msg = message; A.ecran = "connexion"; A.stats = null; render();
}
// Déconnexion automatique après inactivité
let derniereActivite = Date.now();
["click", "keydown", "mousemove", "touchstart", "scroll"].forEach(e => document.addEventListener(e, () => { derniereActivite = Date.now(); }, {passive:true}));
setInterval(() => { if (A.ecran === "app" && Date.now() - derniereActivite > (CFG.INACTIVITE_MINUTES || 30) * 60000) deconnecter("inactivite", "Vous avez été déconnecté après une période d'inactivité."); }, 30000);

const motDePasseValide = p => p.length >= 12 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);

const ECRANS = {};
ECRANS.config = () => `<div class="gren-auth"><h1>Backoffice non configuré</h1>
  ${alerte("info", "Serveur à connecter", "Le backoffice a besoin d'une base Supabase. Suivez le guide <strong>calculette-gren/supabase/INSTALLATION.md</strong> puis renseignez l'adresse du projet et la clé publique dans <strong>calculette-gren/config.js</strong>.")}</div>`;
ECRANS.connexion = () => `<div class="gren-auth"><h1>Connexion</h1>
  ${A.msg ? alerte("info", "", esc(A.msg)) : ""}
  <form id="fConnexion" class="gren-panel" novalidate autocomplete="on">
    ${fInput("Adresse électronique", 'id="cEmail" name="email" autocomplete="username" required', "", {type:"email"})}
    ${fInput("Mot de passe", 'id="cMdp" name="password" autocomplete="current-password" required', "", {type:"password"})}
    <div class="gren-piege" aria-hidden="true"><label for="cSite">Site web</label><input id="cSite" name="site" tabindex="-1" autocomplete="off"></div>
    <div id="cMsg"></div>
    <ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline-sm fr-mb-0"><li><button class="fr-btn" type="submit">Se connecter</button></li></ul>
  </form>
  <p class="fr-mb-1w"><a class="fr-link" href="#" data-act="ecranOubli">Mot de passe oublié ?</a></p>
  <p><a class="fr-link" href="#" data-act="ecranInvitation">Première connexion / j'ai reçu une invitation</a></p></div>`;
ECRANS.oubli = () => `<div class="gren-auth"><h1>Mot de passe oublié</h1>
  <form id="fOubli" class="gren-panel" novalidate>${fInput("Adresse électronique", 'id="oEmail" autocomplete="username" required', "", {type:"email"})}
    <div class="gren-piege" aria-hidden="true"><input id="oSite" tabindex="-1" autocomplete="off"></div><div id="oMsg"></div>
    <ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline-sm fr-mb-0"><li><button class="fr-btn" type="submit">Recevoir un lien</button></li><li>${btn("Retour", 'data-act="ecranConnexion"', {kind:"secondary"})}</li></ul></form></div>`;
ECRANS.invitation = () => `<div class="gren-auth"><h1>Première connexion</h1>
  <p>Saisissez l'adresse autorisée par le super-administrateur : vous recevrez un lien de connexion pour définir votre mot de passe puis activer la double authentification.</p>
  <form id="fInvitation" class="gren-panel" novalidate>${fInput("Adresse électronique", 'id="iEmail" autocomplete="username" required', "", {type:"email"})}
    <div class="gren-piege" aria-hidden="true"><input id="iSite" tabindex="-1" autocomplete="off"></div><div id="iMsg"></div>
    <ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline-sm fr-mb-0"><li><button class="fr-btn" type="submit">Recevoir le lien</button></li><li>${btn("Retour", 'data-act="ecranConnexion"', {kind:"secondary"})}</li></ul></form></div>`;
ECRANS.motdepasse = () => `<div class="gren-auth"><h1>${A.recovery ? "Nouveau mot de passe" : "Définir votre mot de passe"}</h1>
  <p class="gren-mention">Compte : ${esc(A.email)}</p>
  <form id="fMdp" class="gren-panel" novalidate>
    ${fInput("Mot de passe", 'id="mMdp" autocomplete="new-password" required', "", {type:"password", hint:"12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial."})}
    ${fInput("Confirmation", 'id="mMdp2" autocomplete="new-password" required', "", {type:"password"})}
    <div id="mMsg"></div>
    <ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline-sm fr-mb-0"><li><button class="fr-btn" type="submit">Enregistrer</button></li><li>${btn("Annuler", 'data-act="deconnexion"', {kind:"secondary"})}</li></ul></form></div>`;
ECRANS.mfa = () => `<div class="gren-auth"><h1>Double authentification</h1>
  <p>Saisissez le code à 6 chiffres affiché par votre application d'authentification.</p>
  <form id="fMfa" class="gren-panel" novalidate>${fInput("Code", 'id="fCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required')}
    <div id="fMsg"></div>
    <ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline-sm fr-mb-0"><li><button class="fr-btn" type="submit">Valider</button></li><li>${btn("Se déconnecter", 'data-act="deconnexion"', {kind:"secondary"})}</li></ul></form></div>`;
ECRANS.mfa_enrolement = () => { const e = A.mfaEnroll; return `<div class="gren-auth"><h1>Activer la double authentification</h1>
  <p>La double authentification est <strong>obligatoire</strong> pour accéder à l'administration. Installez une application d'authentification (par exemple FreeOTP, Aegis, Google Authenticator ou Microsoft Authenticator), scannez le QR code puis saisissez le code affiché.</p>
  <div class="gren-panel">${e ? `<div class="gren-qr"><img src="${esc(e.qr)}" alt="QR code à scanner avec l'application d'authentification"></div>
    <p class="fr-mt-2w gren-mention">Clé à saisir manuellement : <span class="mono">${esc(e.secret)}</span></p>
    <form id="fEnrol" novalidate>${fInput("Code à 6 chiffres", 'id="eCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required')}<div id="eMsg"></div>
    <ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline-sm fr-mb-0"><li><button class="fr-btn" type="submit">Activer</button></li><li>${btn("Se déconnecter", 'data-act="deconnexion"', {kind:"secondary"})}</li></ul></form>`
    : `<p>Préparation…</p>`}</div></div>`; };
ECRANS.app = () => {
  const items = [["tableau", "Tableau de bord", "dashboard-3-line"], ["utilisation", "Utilisation de l'appli", "line-chart-line"], ["connexions", "Connexions", "user-line"],
    ["securite", "Sécurité et attaques", "shield-line"], ["admins", "Administrateurs", "team-line"], ["referentiel", "Référentiel GREN", "database-line"],
    ["parametres", "Paramètres", "settings-5-line"], ["journal", "Journal d'administration", "file-text-line"], ["compte", "Mon compte", "account-circle-line"]];
  return `<div class="fr-grid-row fr-grid-row--gutters">
    <div class="fr-col-12 fr-col-md-3"><nav class="fr-sidemenu" role="navigation" aria-labelledby="sm-titre"><div class="fr-sidemenu__inner">
      <button class="fr-sidemenu__btn" aria-controls="sm-liste" aria-expanded="false">Menu de l'administration</button>
      <div class="fr-collapse" id="sm-liste"><div class="fr-sidemenu__title" id="sm-titre">Administration</div><ul class="fr-sidemenu__list">
      ${items.map(([k, l]) => `<li class="fr-sidemenu__item ${A.section === k ? "fr-sidemenu__item--active" : ""}"><a class="fr-sidemenu__link" href="#${k}" data-section="${k}" ${A.section === k ? 'aria-current="page"' : ""}>${l}</a></li>`).join("")}
      <li class="fr-sidemenu__item"><a class="fr-sidemenu__link" href="#" data-act="deconnexion">Se déconnecter</a></li>
      </ul></div></div></nav></div>
    <div class="fr-col-12 fr-col-md-9" id="section"><p>Chargement…</p></div></div>`;
};
function render(){
  _n = 0;
  document.querySelectorAll("[data-marque]").forEach(el => el.innerHTML = (CFG.MARQUE || ["Préfète", "de la région", "Bretagne"]).map(esc).join("<br>"));
  $("#outils").innerHTML = A.ecran === "app" && A.moi ? `<ul class="fr-btns-group fr-btns-group--icon-left">
    <li><span class="fr-btn fr-icon-account-circle-line fr-btn--icon-left" aria-disabled="true">${esc(A.moi.nom || A.email)} · ${esc(ROLES[A.moi.role] || A.moi.role)}</span></li>
    <li>${btn("Se déconnecter", 'data-act="deconnexion"', {icon:"logout-box-r-line"})}</li></ul>` : "";
  $("#view").innerHTML = (ECRANS[A.ecran] || (() => "<p>Chargement…</p>"))();
  if (A.ecran === "mfa_enrolement" && !A.mfaEnroll) preparerEnrolement();
  const f = $("#view input:not([type=hidden]):not([tabindex='-1'])"); if (f && A.ecran !== "app") f.focus();
}
async function preparerEnrolement(){
  try {
    const l = (await sb.auth.mfa.listFactors()).data;
    for (const f of (l.all || []).filter(f => f.status !== "verified")) await sb.auth.mfa.unenroll({factorId:f.id});
    const d = await q(sb.auth.mfa.enroll({factorType:"totp", friendlyName:"Calculette GREN " + new Date().toISOString().slice(0, 16)}));
    A.mfaEnroll = {id:d.id, qr:d.totp.qr_code, secret:d.totp.secret}; render();
  } catch(e){ $("#view").insertAdjacentHTML("beforeend", alerte("error", "Erreur", esc(e.message))); }
}
const messageDans = (sel, type, txt) => { const el = $(sel); if (el) el.innerHTML = alerte(type, "", txt); };
async function verifierAvant(email, piege){
  try { const r = await q(sb.rpc("avant_connexion", {p_email:email, p_piege:piege || ""})); return r; }
  catch(e){ return {autorise:false, message:"Service indisponible. Réessayez plus tard."}; }
}
document.addEventListener("submit", async ev => {
  ev.preventDefault(); const f = ev.target; const b = f.querySelector("button[type=submit]"); if (b) b.disabled = true;
  try {
    if (f.id === "fConnexion") {
      const email = $("#cEmail").value.trim().toLowerCase(), mdp = $("#cMdp").value;
      if (!email || !mdp) return messageDans("#cMsg", "warning", "Renseignez l'adresse et le mot de passe.");
      const v = await verifierAvant(email, $("#cSite").value); if (!v.autorise) return messageDans("#cMsg", "error", esc(v.message));
      const {error} = await sb.auth.signInWithPassword({email, password:mdp});
      if (error) { try { await sb.rpc("echec_connexion", {p_email:email, p_motif:"mot_de_passe"}); } catch(e){} return messageDans("#cMsg", "error", "Adresse ou mot de passe incorrect."); }
      try { await sb.rpc("connexion_reussie", {p_etape:"mot_de_passe"}); } catch(e){}
      A.msg = ""; A.mfaEchecs = 0; return route();
    }
    if (f.id === "fOubli" || f.id === "fInvitation") {
      const inv = f.id === "fInvitation"; const email = $(inv ? "#iEmail" : "#oEmail").value.trim().toLowerCase(); const m = inv ? "#iMsg" : "#oMsg";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return messageDans(m, "warning", "Adresse électronique invalide.");
      const v = await verifierAvant(email, $(inv ? "#iSite" : "#oSite").value); if (!v.autorise) return messageDans(m, "error", esc(v.message));
      const redirect = location.href.split("#")[0];
      const {error} = inv ? await sb.auth.signInWithOtp({email, options:{shouldCreateUser:true, emailRedirectTo:redirect}})
                          : await sb.auth.resetPasswordForEmail(email, {redirectTo:redirect});
      if (error && inv) { try { await sb.rpc("echec_connexion", {p_email:email, p_motif:"inscription_refusee"}); } catch(e){} }
      return messageDans(m, "success", "Si cette adresse est autorisée, un message contenant un lien vient de lui être envoyé. Pensez à vérifier les courriers indésirables.");
    }
    if (f.id === "fMdp") {
      const p = $("#mMdp").value, p2 = $("#mMdp2").value;
      if (!motDePasseValide(p)) return messageDans("#mMsg", "warning", "Le mot de passe doit contenir au moins 12 caractères, dont une majuscule, une minuscule, un chiffre et un caractère spécial.");
      if (p !== p2) return messageDans("#mMsg", "warning", "Les deux saisies ne correspondent pas.");
      const {error} = await sb.auth.updateUser({password:p});
      if (error) return messageDans("#mMsg", "error", esc(error.message));
      await sb.rpc("marquer_mdp_defini"); A.recovery = false; toast("Mot de passe enregistré."); return route();
    }
    if (f.id === "fMfa" || f.id === "fEnrol") {
      const enrol = f.id === "fEnrol"; const code = $(enrol ? "#eCode" : "#fCode").value.replace(/\s/g, ""); const m = enrol ? "#eMsg" : "#fMsg";
      if (!/^\d{6}$/.test(code)) return messageDans(m, "warning", "Le code comporte 6 chiffres.");
      const v = await verifierAvant(A.email, ""); if (!v.autorise) return messageDans(m, "error", esc(v.message));
      let factorId;
      if (enrol) factorId = A.mfaEnroll.id;
      else { const l = (await sb.auth.mfa.listFactors()).data; factorId = (l.totp || []).find(x => x.status === "verified")?.id; }
      const {error} = await sb.auth.mfa.challengeAndVerify({factorId, code});
      if (error) {
        try { await sb.rpc("echec_connexion", {p_email:A.email, p_motif:"mfa"}); } catch(e){}
        if (++A.mfaEchecs >= 5) return deconnecter("deconnexion", "Trop de codes incorrects : reconnectez-vous.");
        return messageDans(m, "error", "Code incorrect ou expiré.");
      }
      A.mfaEnroll = null; A.mfaEchecs = 0; return route();
    }
  } finally { if (b) b.disabled = false; }
});

/* =============================================================================
   SECTIONS
   ============================================================================= */
const S_ = {};
async function chargerSection(){
  const el = $("#section"); if (!el) return;
  el.innerHTML = `<p>Chargement…</p>`;
  try { el.innerHTML = await S_[A.section](); if (S_[A.section + "_apres"]) S_[A.section + "_apres"](); }
  catch(e){ console.error(e); el.innerHTML = alerte("error", "Erreur de chargement", esc(e.message || e)); }
}
const periode = () => `<div class="fr-select-group fr-mb-0" style="min-width:12rem">${`<label class="fr-label" for="pJours">Période</label><select class="fr-select" id="pJours" data-act="jours">${[[7, "7 derniers jours"], [30, "30 derniers jours"], [90, "90 derniers jours"], [365, "12 derniers mois"]].map(([v, l]) => opt(v, l, A.jours)).join("")}</select>`}</div>`;
async function stats(force){ if (!A.stats || force || A.stats._j !== A.jours) { A.stats = await q(sb.rpc("statistiques", {p_jours:A.jours})); A.stats._j = A.jours; } return A.stats; }

/* ---------- Graphiques (une série : pas de légende, le titre nomme la série) ---------- */
function joursPeriode(n){ const out = []; const d = new Date(); d.setHours(12, 0, 0, 0); for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); out.push(x.toISOString().slice(0, 10)); } return out; }
function barres(serie, cle, titre, {err = false, jours = A.jours} = {}){
  const map = new Map((serie || []).map(r => [String(r.jour).slice(0, 10), +r[cle] || 0]));
  let pts = joursPeriode(jours).map(j => ({j, v:map.get(j) || 0}));
  if (jours > 90) { const sem = new Map(); pts.forEach(p => { const d = new Date(p.j); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const k = d.toISOString().slice(0, 10); sem.set(k, (sem.get(k) || 0) + p.v); }); pts = [...sem].map(([j, v]) => ({j, v, sem:true})); }
  const W = 720, H = 200, ml = 36, mb = 22, mt = 8, w = W - ml - 4, h = H - mb - mt;
  const max = Math.max(1, ...pts.map(p => p.v)); const pas = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / pas) * pas;
  const bw = w / pts.length; const gap = Math.min(2, bw * .2);
  const ticks = [0, top / 2, top];
  const total = pts.reduce((a, p) => a + p.v, 0);
  const lab = p => (p.sem ? "Semaine du " : "") + new Date(p.j).toLocaleDateString("fr-FR", {day:"numeric", month:"short"});
  const step = Math.ceil(pts.length / 8);
  return `<figure class="fr-m-0" role="group" aria-label="${esc(titre)}"><svg class="gren-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titre)} : ${fmt(total)} au total sur la période">
    <g class="axis">${ticks.map(t => { const y = mt + h - t / top * h; return `<line class="grid" x1="${ml}" x2="${W}" y1="${y}" y2="${y}"/><text x="${ml - 6}" y="${y + 4}" text-anchor="end">${fmt(t)}</text>`; }).join("")}
    ${pts.map((p, i) => i % step === 0 ? `<text x="${ml + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(lab(p))}</text>` : "").join("")}</g>
    ${total ? pts.map((p, i) => { const bh = p.v / top * h; const x = ml + i * bw + gap / 2, y = mt + h - bh, r = Math.min(4, (bw - gap) / 2, bh);
      const path = bh > 0 ? `M${x},${mt + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - gap - r} Q${x + bw - gap},${y} ${x + bw - gap},${y + r} V${mt + h} Z` : "";
      return `<g class="col" data-tip="${esc(lab(p))} : ${fmt(p.v)}"><rect class="hit" x="${ml + i * bw}" y="${mt}" width="${bw}" height="${h}"/>${path ? `<path class="mark ${err ? "err" : ""}" d="${path}"/>` : ""}</g>`; }).join("")
      : `<text class="empty" x="${ml + w / 2}" y="${mt + h / 2}" text-anchor="middle">Aucune donnée sur la période</text>`}
  </svg></figure>`;
}
function hbarres(list, libelle = x => x){
  if (!list || !list.length) return `<p class="gren-mention">Aucune donnée sur la période.</p>`;
  const max = Math.max(...list.map(x => +x.n));
  return `<div class="gren-hbars">${list.map(x => `<div class="gren-hbar"><span>${esc(libelle(x.cle))}</span><div class="track"><div class="fill" style="width:${(+x.n / max * 100).toFixed(1)}%"></div></div><span class="val">${fmt(x.n)}</span></div>`).join("")}</div>`;
}
document.addEventListener("mousemove", e => { const g = e.target.closest && e.target.closest("[data-tip]"); const t = $("#tip");
  if (!g) { t.hidden = true; return; } t.textContent = g.dataset.tip; t.hidden = false;
  t.style.left = Math.min(e.clientX + 12, innerWidth - t.offsetWidth - 8) + "px"; t.style.top = (e.clientY - t.offsetHeight - 10) + "px"; });

/* ---------- Tableau de bord ---------- */
S_.tableau = async () => {
  const s = await stats(true);
  const derniers = await q(sb.from("securite").select("le,type,gravite,ip,email").order("le", {ascending:false}).limit(8));
  const t = s.totaux || {}, c = s.connexions || {};
  return `<div class="gren-bar"><h1>Tableau de bord</h1>${periode()}</div>
    ${s.securite_non_traites ? alerte("error", `${s.securite_non_traites} alerte(s) de sécurité haute ou critique non traitée(s)`, `<a href="#securite" data-section="securite">Voir les événements de sécurité</a>`) : ""}
    <div class="gren-kpis">${kpi(fmt(t.sessions), "utilisateurs (sessions)")}${kpi(fmt(t.visites), "visites")}${kpi(fmt(t.calculs), "calculs de dose")}${kpi(fmt(t.exports), "exports PPF / CSV")}</div>
    <div class="gren-kpis">${kpi(fmt(c.reussies), "connexions admin réussies")}${kpi(fmt(c.echecs), "tentatives échouées", c.echecs > 0)}${kpi(fmt(s.securite_24h), "alertes sécurité (24 h)", s.securite_24h > 0)}${kpi(fmt(s.ip_bloquees), "IP bloquées")}${kpi(`${fmt(s.admins?.actifs)}/${fmt(s.admins?.total)}`, "administrateurs actifs")}${kpi(s.referentiel ? "v" + s.referentiel.version : "—", "référentiel publié")}</div>
    <section class="gren-panel"><h2 class="fr-h5">Visites par jour</h2>${barres(s.par_jour, "visites", "Visites par jour")}</section>
    <section class="gren-panel"><h2 class="fr-h5">Événements de sécurité par jour</h2>${barres(s.securite_par_jour, "n", "Événements de sécurité par jour", {err:true})}</section>
    <section class="gren-panel"><div class="gren-bar"><h2 class="fr-h5">Derniers événements de sécurité</h2><a class="fr-link fr-icon-arrow-right-line fr-link--icon-right" href="#securite" data-section="securite">Tout voir</a></div>
      ${derniers.length ? table(`<thead><tr><th>Date</th><th>Gravité</th><th>Type</th><th>IP</th><th>Compte visé</th></tr></thead><tbody>${derniers.map(e => `<tr><td>${dt(e.le)}</td><td>${gravite(e.gravite)}</td><td>${esc(TYPES_SECU[e.type] || e.type)}</td><td class="mono">${esc(e.ip || "—")}</td><td>${esc(e.email || "—")}</td></tr>`).join("")}</tbody>`) : `<p class="gren-mention">Aucun événement de sécurité enregistré.</p>`}</section>`;
};

/* ---------- Utilisation ---------- */
S_.utilisation = async () => {
  const s = await stats();
  const nomCulture = id => (REF_DEFAULT.cultures.find(c => c.id === id) || {}).nom || id;
  return `<div class="gren-bar"><h1>Utilisation de l'application</h1>${periode()}</div>
    <p class="gren-mention">Mesure d'audience anonyme : aucune adresse IP, aucun nom ni numéro PACAGE n'est collecté.</p>
    <section class="gren-panel"><h2 class="fr-h5">Utilisateurs (sessions) par jour</h2>${barres(s.par_jour, "sessions", "Sessions par jour")}</section>
    <section class="gren-panel"><h2 class="fr-h5">Calculs de dose par jour</h2>${barres(s.par_jour, "calculs", "Calculs par jour")}</section>
    <div class="fr-grid-row fr-grid-row--gutters">
      <div class="fr-col-12 fr-col-lg-6"><section class="gren-panel"><h2 class="fr-h5">Utilisateurs par département</h2>${hbarres(s.par_departement, k => k === "?" ? "Non renseigné" : `${k} — ${DEPTS[k] || ""}`)}</section></div>
      <div class="fr-col-12 fr-col-lg-6"><section class="gren-panel"><h2 class="fr-h5">Appareils</h2>${hbarres(s.par_appareil, k => ({mobile:"Téléphone", tablette:"Tablette", ordinateur:"Ordinateur"}[k] || "Inconnu"))}</section></div>
      <div class="fr-col-12 fr-col-lg-6"><section class="gren-panel"><h2 class="fr-h5">Cultures calculées</h2>${hbarres(s.par_culture, nomCulture)}</section></div>
      <div class="fr-col-12 fr-col-lg-6"><section class="gren-panel"><h2 class="fr-h5">Actions</h2>${hbarres(s.par_type, k => EVTS[k] || k)}</section></div>
    </div>
    ${btn("Exporter les statistiques journalières (CSV)", 'data-act="csvStats"', {kind:"secondary", icon:"download-line"})}`;
};

/* ---------- Connexions ---------- */
S_.connexions = async () => {
  const f = A.filtres.conn;
  let rq = sb.from("connexions").select("*").order("le", {ascending:false}).limit(A.limite.conn);
  if (f.succes === "ok") rq = rq.eq("succes", true); if (f.succes === "ko") rq = rq.eq("succes", false);
  const qq = filtreTxt(f.q); if (qq) rq = rq.or(`email.ilike.%${qq}%,ip.ilike.%${qq}%`);
  const rows = await q(rq); A._conn = rows;
  let auth = []; try { auth = await q(sb.rpc("journal_auth", {p_limite:100})); } catch(e){}
  return `<div class="gren-bar"><h1>Connexions au backoffice</h1>${btn("Exporter (CSV)", 'data-act="csvConn"', {kind:"secondary", icon:"download-line", sm:true})}</div>
    <div class="gren-filters">${fSelect("Résultat", 'data-filtre="conn.succes"', opt("", "Toutes", f.succes) + opt("ok", "Réussies", f.succes) + opt("ko", "Échecs", f.succes))}
      ${fInput("Rechercher (adresse ou IP)", 'data-filtre="conn.q"', f.q)}</div>
    ${rows.length ? table(`<thead><tr><th>Date</th><th>Résultat</th><th>Compte</th><th>Adresse IP</th><th>Navigateur</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${dt(r.le)}</td><td>${r.succes ? badge(MOTIFS[r.motif] || r.motif, "success") : badge(MOTIFS[r.motif] || r.motif, "error")}</td><td>${esc(r.email || "—")}</td>
        <td class="mono">${esc(r.ip || "—")} ${r.ip && !r.succes && peutEcrire() ? btn("Bloquer", `data-act="bloquerIp" data-ip="${esc(r.ip)}"`, {kind:"tertiary-no-outline", sm:true, icon:"lock-line"}) : ""}</td>
        <td title="${esc(r.user_agent)}">${esc(ua(r.user_agent))}</td></tr>`).join("")}</tbody>`) : `<p class="gren-mention">Aucune connexion.</p>`}
    ${rows.length >= A.limite.conn ? btn("Afficher plus", 'data-act="plus" data-l="conn"', {kind:"secondary", sm:true}) : ""}
    <section class="gren-panel fr-mt-4w"><h2 class="fr-h5">Journal d'authentification Supabase</h2>
      <p class="gren-mention">Tenu par le serveur d'authentification lui-même : il fait foi, y compris si quelqu'un tente de contourner la page de connexion.</p>
      ${auth.length ? table(`<thead><tr><th>Date</th><th>Action</th><th>Compte</th><th>IP</th></tr></thead><tbody>${auth.map(a => `<tr><td>${dt(a.le)}</td><td>${esc(a.action)}</td><td>${esc(a.email || "—")}</td><td class="mono">${esc(a.ip || "—")}</td></tr>`).join("")}</tbody>`) : `<p class="gren-mention">Aucune entrée.</p>`}</section>`;
};

/* ---------- Sécurité ---------- */
S_.securite = async () => {
  const f = A.filtres.secu; const s = await stats();
  let rq = sb.from("securite").select("*").order("le", {ascending:false}).limit(A.limite.secu);
  if (f.gravite) rq = rq.eq("gravite", f.gravite); if (f.type) rq = rq.eq("type", f.type);
  if (f.traite === "non") rq = rq.eq("traite", false); if (f.traite === "oui") rq = rq.eq("traite", true);
  const rows = await q(rq); A._secu = rows;
  const ips = await q(sb.from("ip_bloquees").select("*").order("cree_le", {ascending:false}));
  const actives = ips.filter(i => !i.jusqu_a || new Date(i.jusqu_a) > new Date());
  return `<div class="gren-bar"><h1>Sécurité et attaques</h1>${periode()}</div>
    <div class="gren-kpis">${kpi(fmt(s.securite_24h), "événements (24 h)", s.securite_24h > 0)}${kpi(fmt(s.securite_non_traites), "alertes hautes / critiques non traitées", s.securite_non_traites > 0)}${kpi(fmt(actives.length), "IP bloquées actives")}${kpi(fmt(s.connexions?.echecs), "échecs de connexion sur la période")}</div>
    <div class="fr-grid-row fr-grid-row--gutters">
      <div class="fr-col-12 fr-col-lg-6"><section class="gren-panel"><h2 class="fr-h5">Types d'attaques sur la période</h2>${hbarres(s.securite_par_type, k => TYPES_SECU[k] || k)}</section></div>
      <div class="fr-col-12 fr-col-lg-6"><section class="gren-panel"><h2 class="fr-h5">Adresses IP les plus actives</h2>
        ${(s.ip_suspectes || []).length ? table(`<thead><tr><th>IP</th><th class="num">Événements</th><th>Dernier</th><th></th></tr></thead><tbody>${s.ip_suspectes.map(i => `<tr><td class="mono">${esc(i.cle)}</td><td class="num">${fmt(i.n)}</td><td>${dt(i.dernier)}</td><td>${peutEcrire() && !actives.some(a => a.ip === i.cle) ? btn("Bloquer", `data-act="bloquerIp" data-ip="${esc(i.cle)}"`, {kind:"tertiary-no-outline", sm:true, icon:"lock-line"}) : actives.some(a => a.ip === i.cle) ? badge("Bloquée", "error") : ""}</td></tr>`).join("")}</tbody>`) : `<p class="gren-mention">Aucune.</p>`}</section></div></div>
    <section class="gren-panel"><div class="gren-bar"><h2 class="fr-h5">Événements de sécurité</h2>
      <ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline-sm fr-btns-group--sm fr-mb-0">${peutEcrire() ? `<li>${btn("Marquer tout l'affichage comme traité", 'data-act="traiterTout"', {kind:"secondary", sm:true, icon:"check-line"})}</li>` : ""}<li>${btn("Exporter (CSV)", 'data-act="csvSecu"', {kind:"secondary", sm:true, icon:"download-line"})}</li></ul></div>
      <div class="gren-filters">${fSelect("Gravité", 'data-filtre="secu.gravite"', opt("", "Toutes", f.gravite) + Object.entries(GRAVITES).map(([k, v]) => opt(k, v[0], f.gravite)).join(""))}
        ${fSelect("Type", 'data-filtre="secu.type"', opt("", "Tous", f.type) + Object.entries(TYPES_SECU).map(([k, v]) => opt(k, v, f.type)).join(""))}
        ${fSelect("État", 'data-filtre="secu.traite"', opt("", "Tous", f.traite) + opt("non", "À traiter", f.traite) + opt("oui", "Traités", f.traite))}</div>
      ${rows.length ? table(`<thead><tr><th>Date</th><th>Gravité</th><th>Type</th><th>IP</th><th>Compte visé</th><th>Détails</th><th>État</th></tr></thead><tbody>
        ${rows.map(e => `<tr data-id="${e.id}"><td>${dt(e.le)}</td><td>${gravite(e.gravite)}</td><td>${esc(TYPES_SECU[e.type] || e.type)}</td>
          <td class="mono">${esc(e.ip || "—")}${e.ip && peutEcrire() && !actives.some(a => a.ip === e.ip) ? "<br>" + btn("Bloquer", `data-act="bloquerIp" data-ip="${esc(e.ip)}"`, {kind:"tertiary-no-outline", sm:true, icon:"lock-line"}) : ""}</td>
          <td>${esc(e.email || "—")}</td>
          <td class="gren-details">${e.details && Object.keys(e.details).length ? `<details><summary>Voir</summary><pre>${esc(JSON.stringify(e.details, null, 1))}</pre></details>` : "—"}</td>
          <td>${e.traite ? badge("Traité", "success") + `<br><span class="gren-mention">${esc(e.traite_par || "")}</span>` : peutEcrire() ? btn("Traiter", 'data-act="traiter"', {kind:"secondary", sm:true}) : badge("À traiter", "warning")}</td></tr>`).join("")}</tbody>`) : `<p class="gren-mention">Aucun événement pour ces filtres.</p>`}
      ${rows.length >= A.limite.secu ? btn("Afficher plus", 'data-act="plus" data-l="secu"', {kind:"secondary", sm:true}) : ""}</section>
    <section class="gren-panel"><div class="gren-bar"><h2 class="fr-h5">Adresses IP bloquées</h2>${peutEcrire() ? btn("Bloquer une adresse IP", 'data-act="bloquerIp"', {sm:true, icon:"lock-line"}) : ""}</div>
      ${ips.length ? table(`<thead><tr><th>IP</th><th>Motif</th><th>Jusqu'au</th><th>Origine</th><th>État</th><th></th></tr></thead><tbody>
        ${ips.map(i => { const act = !i.jusqu_a || new Date(i.jusqu_a) > new Date(); return `<tr><td class="mono">${esc(i.ip)}</td><td>${esc(i.motif || "—")}</td><td>${i.jusqu_a ? dt(i.jusqu_a) : "Définitif"}</td><td>${i.auto ? "Automatique" : esc(i.cree_par || "")}</td><td>${act ? badge("Active", "error") : badge("Expirée")}</td>
          <td>${peutEcrire() ? btn("Débloquer", `data-act="debloquerIp" data-ip="${esc(i.ip)}"`, {kind:"tertiary-no-outline", sm:true, icon:"lock-unlock-line"}) : ""}</td></tr>`; }).join("")}</tbody>`) : `<p class="gren-mention">Aucune adresse bloquée.</p>`}</section>
    ${alerte("info", "Ce que surveille le backoffice", "Tentatives de mot de passe et de code à deux facteurs, robots (champ piège invisible), tentatives depuis des IP bloquées, attaques distribuées sur un même compte, créations de compte non autorisées, connexions de comptes non administrateurs et excès de requêtes. Le blocage automatique d'une IP intervient au-delà du seuil défini dans les Paramètres. Les attaques réseau de bas niveau (déni de service) sont filtrées par les hébergeurs (GitHub Pages, Supabase).")}`;
};

/* ---------- Administrateurs ---------- */
S_.admins = async () => {
  const rows = await q(sb.from("admins").select("*").order("cree_le"));
  return `<div class="gren-bar"><h1>Administrateurs</h1>${estSuper() ? btn("Créer un accès", 'data-act="creerAdmin"', {icon:"add-line"}) : ""}</div>
    ${estSuper() ? "" : alerte("info", "", "Seul un super-administrateur peut créer ou modifier des accès.")}
    ${table(`<thead><tr><th>Nom</th><th>Adresse</th><th>Rôle</th><th>État</th><th>Compte</th><th>Dernière connexion</th>${estSuper() ? "<th><span class=\"fr-sr-only\">Actions</span></th>" : ""}</tr></thead><tbody>
      ${rows.map(a => `<tr data-email="${esc(a.email)}"><td>${esc(a.nom || "—")}${a.email === A.moi.email ? " " + badge("Vous", "info") : ""}</td><td>${esc(a.email)}</td>
        <td>${estSuper() && a.email !== A.moi.email ? `<select class="fr-select" aria-label="Rôle de ${esc(a.email)}" data-act="role">${Object.entries(ROLES).map(([k, v]) => opt(k, v, a.role)).join("")}</select>` : esc(ROLES[a.role] || a.role)}</td>
        <td>${a.actif ? badge("Actif", "success") : badge("Désactivé", "error")}</td>
        <td>${a.user_id ? (a.mdp_defini ? badge("Activé") : badge("Mot de passe à définir", "warning")) : badge("Invitation en attente", "new")}</td>
        <td>${dt(a.derniere_connexion)}</td>
        ${estSuper() ? `<td>${a.email !== A.moi.email ? `<ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline fr-btns-group--sm fr-mb-0">
          <li>${btn(a.actif ? "Désactiver" : "Réactiver", 'data-act="basculerAdmin"', {kind:"secondary", sm:true})}</li>
          ${!a.mdp_defini ? `<li>${btn("Envoyer l'invitation", 'data-act="inviter"', {kind:"secondary", sm:true, icon:"mail-line"})}</li>` : ""}
          <li>${btn("Supprimer", 'data-act="supprimerAdmin"', {kind:"tertiary-no-outline", sm:true, icon:"delete-line"})}</li></ul>` : ""}</td>` : ""}</tr>`).join("")}</tbody>`)}
    ${alerte("info", "Rôles", "<strong>Super-administrateur</strong> : tout, y compris la gestion des accès et la purge des journaux. <strong>Administrateur</strong> : référentiel, paramètres, traitement des alertes et blocage d'IP. <strong>Lecteur</strong> : consultation uniquement. La double authentification est obligatoire pour tous ; un compte désactivé perd immédiatement l'accès aux données.")}`;
};

/* ---------- Référentiel ---------- */
S_.referentiel = async () => {
  if (A.refEdit) return editeurReferentiel();
  const rows = await q(sb.from("referentiels").select("id,version,statut,commentaire,cree_le,cree_par,publie_le,publie_par").order("version", {ascending:false}));
  return `<div class="gren-bar"><h1>Référentiel GREN</h1>${peutEcrire() ? `<ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline-sm fr-mb-0"><li>${btn("Nouveau brouillon", 'data-act="nouveauRef"', {icon:"add-line", sm:true})}</li><li><label class="fr-btn fr-btn--secondary fr-btn--sm fr-btn--icon-left fr-icon-upload-line">Importer un JSON<input type="file" accept=".json" data-act="importRef" hidden></label></li></ul>` : ""}</div>
    <p>La version <strong>publiée</strong> est chargée automatiquement par l'application de tous les utilisateurs (sauf s'ils ont personnalisé leur référentiel localement). Les brouillons ne sont visibles qu'ici.</p>
    ${rows.length ? table(`<thead><tr><th>Version</th><th>Statut</th><th>Commentaire</th><th>Créée</th><th>Publiée</th><th><span class="fr-sr-only">Actions</span></th></tr></thead><tbody>
      ${rows.map(r => `<tr data-id="${r.id}"><td><strong>v${r.version}</strong></td><td>${r.statut === "publie" ? badge("Publiée", "success") : r.statut === "brouillon" ? badge("Brouillon", "new") : badge("Archivée")}</td>
        <td>${esc(r.commentaire || "—")}</td><td>${dj(r.cree_le)}<br><span class="gren-mention">${esc(r.cree_par || "")}</span></td><td>${r.publie_le ? dj(r.publie_le) + `<br><span class="gren-mention">${esc(r.publie_par || "")}</span>` : "—"}</td>
        <td><ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline fr-btns-group--sm fr-mb-0">
          <li>${btn(r.statut === "brouillon" && peutEcrire() ? "Modifier" : "Consulter", 'data-act="ouvrirRef"', {kind:"secondary", sm:true})}</li>
          ${peutEcrire() && r.statut === "brouillon" ? `<li>${btn("Publier", 'data-act="publierRef"', {sm:true})}</li><li>${btn("Supprimer", 'data-act="supprimerRef"', {kind:"tertiary-no-outline", sm:true, icon:"delete-line"})}</li>` : ""}
          ${peutEcrire() && r.statut !== "brouillon" ? `<li>${btn("Dupliquer", 'data-act="dupliquerRef"', {kind:"tertiary", sm:true})}</li>` : ""}
          <li>${btn("JSON", 'data-act="telechargerRef"', {kind:"tertiary-no-outline", sm:true, icon:"download-line"})}</li></ul></td></tr>`).join("")}</tbody>`)
      : alerte("info", "Aucun référentiel publié", "L'application utilise ses valeurs par défaut (indicatives). Créez un brouillon à partir de ces valeurs, corrigez-le d'après l'arrêté GREN en vigueur, puis publiez-le.")}`;
};
function editeurReferentiel(){
  const E = A.refEdit; const ro = !E.editable; const c = E.contenu;
  return `<div class="gren-bar"><h1>Référentiel v${E.version} ${ro ? badge("Lecture seule") : badge("Brouillon", "new")}</h1>
    <ul class="fr-btns-group fr-btns-group--icon-left fr-btns-group--inline-sm fr-mb-0">${ro ? "" : `<li>${btn("Enregistrer", 'data-act="enregistrerRef"', {icon:"check-line", sm:true})}</li><li>${btn("Enregistrer et publier", 'data-act="enregistrerPublierRef"', {kind:"secondary", sm:true})}</li>`}<li>${btn("Fermer", 'data-act="fermerRef"', {kind:"tertiary", sm:true})}</li></ul></div>
    ${ro ? "" : fInput("Commentaire de version", 'data-refcomm', E.commentaire || "", {hint:"Ex. : arrêté GREN du …, mise à jour des plafonds"})}
    <section class="gren-panel"><h2 class="fr-h5">Paramètres généraux</h2><div class="fr-grid-row fr-grid-row--gutters">
      ${PARAMS.map(([k, l]) => `<div class="fr-col-12 fr-col-md-6 fr-col-lg-4">${fInput(l, `data-rparam="${k}" ${ro ? "disabled" : ""}`, c.params[k])}</div>`).join("")}</div></section>
    ${REF_TABLES.map(T => `<section class="gren-panel"><div class="gren-bar"><h2 class="fr-h5">${T.t}</h2>${ro ? "" : btn("Ajouter une ligne", `data-act="refAjout" data-k="${T.k}"`, {kind:"secondary", sm:true, icon:"add-line"})}</div>
      ${table(`<thead><tr>${T.cols.map(x => `<th>${x[1]}</th>`).join("")}${ro ? "" : "<th></th>"}</tr></thead><tbody>${(c[T.k] || []).map((row, i) => `<tr>${T.cols.map(([f, l, ty]) => { const v = row[f] ?? ""; const at = `aria-label="${esc(l)}" data-rref="${T.k}" data-i="${i}" data-f="${f}" data-t="${ty || ""}" ${ro ? "disabled" : ""}`;
        if (Array.isArray(ty)) return `<td><select class="fr-select" ${at}>${ty.map(o => opt(o, o, v)).join("")}</select></td>`;
        if (ty === "prec") return `<td><select class="fr-select" ${at}>${opt("", "—", v)}${(c.precedents || []).map(p => opt(p.id, p.nom, v)).join("")}</select></td>`;
        return `<td><input class="fr-input" ${at} value="${esc(v)}" style="${ty === "w" ? "min-width:14rem" : ty === "n" ? "width:5.5rem" : "width:7rem"}"></td>`; }).join("")}
        ${ro ? "" : `<td>${btn("Supprimer", `data-act="refSuppr" data-k="${T.k}" data-i="${i}"`, {kind:"tertiary-no-outline", sm:true, icon:"delete-line"})}</td>`}</tr>`).join("")}</tbody>`)}</section>`).join("")}`;
}

/* ---------- Paramètres ---------- */
S_.parametres = async () => {
  const p = await q(sb.from("parametres").select("*").eq("id", 1).single()); A._param = p; const ro = !peutEcrire() ? "disabled" : "";
  return `<h1>Paramètres</h1>${ro ? alerte("info", "", "Consultation seule.") : ""}
    <form id="fParam" novalidate>
    <section class="gren-panel"><h2 class="fr-h5">Bandeau d'information de l'application</h2>
      ${fTextarea("Message affiché en haut de l'application", `name="annonce" maxlength="300" ${ro}`, p.annonce, "Laisser vide pour ne rien afficher.")}
      ${fSelect("Type", `name="annonce_niveau" ${ro}`, [["info", "Information"], ["warning", "Avertissement"], ["error", "Alerte"]].map(([k, l]) => opt(k, l, p.annonce_niveau)).join(""))}</section>
    <section class="gren-panel"><h2 class="fr-h5">Maintenance</h2>
      ${fToggle("Mettre l'application en maintenance", `name="maintenance" ${ro}`, p.maintenance, "Les utilisateurs voient uniquement le message ci-dessous.")}
      ${fTextarea("Message de maintenance", `name="maintenance_message" maxlength="300" ${ro}`, p.maintenance_message)}</section>
    <section class="gren-panel"><h2 class="fr-h5">Protection contre les attaques</h2><div class="fr-grid-row fr-grid-row--gutters">
      <div class="fr-col-12 fr-col-md-6">${fInput("Échecs avant blocage temporaire", `name="max_tentatives" type="number" min="3" max="50" ${ro}`, p.max_tentatives, {hint:"par adresse IP"})}</div>
      <div class="fr-col-12 fr-col-md-6">${fInput("Fenêtre et durée du blocage temporaire (minutes)", `name="fenetre_minutes" type="number" min="1" max="1440" ${ro}`, p.fenetre_minutes)}</div>
      <div class="fr-col-12 fr-col-md-6">${fInput("Échecs en 1 heure avant blocage automatique de l'IP", `name="blocage_ip_seuil" type="number" min="5" max="500" ${ro}`, p.blocage_ip_seuil)}</div>
      <div class="fr-col-12 fr-col-md-6">${fInput("Durée du blocage automatique (heures)", `name="blocage_ip_heures" type="number" min="1" max="8760" ${ro}`, p.blocage_ip_heures)}</div>
      <div class="fr-col-12 fr-col-md-6">${fInput("Requêtes maximum par minute et par IP", `name="max_requetes_minute" type="number" min="10" max="10000" ${ro}`, p.max_requetes_minute)}</div></div></section>
    <section class="gren-panel"><h2 class="fr-h5">Conservation des journaux</h2>
      ${fInput("Durée de conservation (jours)", `name="retention_jours" type="number" min="30" max="3650" ${ro}`, p.retention_jours, {hint:"La CNIL recommande de conserver les journaux de sécurité entre 6 mois et 1 an."})}
      ${estSuper() ? btn("Purger maintenant les données plus anciennes", 'data-act="purger"', {kind:"secondary", icon:"delete-line", sm:true}) : ""}</section>
    ${ro ? "" : `<button class="fr-btn" type="submit">Enregistrer les paramètres</button>`}
    <p class="gren-mention fr-mt-2w">Dernière modification : ${dt(p.modifie_le)} ${p.modifie_par ? "par " + esc(p.modifie_par) : ""}</p></form>`;
};
document.addEventListener("submit", async ev => {
  if (ev.target.id !== "fParam") return; ev.preventDefault();
  const f = ev.target; const v = {}; f.querySelectorAll("[name]").forEach(x => v[x.name] = x.type === "checkbox" ? x.checked : x.type === "number" ? +x.value : x.value);
  try { await q(sb.from("parametres").update(v).eq("id", 1)); toast("Paramètres enregistrés."); chargerSection(); }
  catch(e){ toast("Enregistrement impossible : " + e.message, true); }
});

/* ---------- Journal d'administration ---------- */
S_.journal = async () => {
  const rows = await q(sb.from("journal_admin").select("*").order("le", {ascending:false}).limit(A.limite.journal)); A._journal = rows;
  const act = {INSERT:"Création", UPDATE:"Modification", DELETE:"Suppression", PURGE:"Purge"};
  return `<div class="gren-bar"><h1>Journal d'administration</h1>${btn("Exporter (CSV)", 'data-act="csvJournal"', {kind:"secondary", sm:true, icon:"download-line"})}</div>
    <p class="gren-mention">Toutes les modifications des accès, du référentiel, des paramètres et des blocages d'IP sont enregistrées automatiquement par la base de données. Ce journal ne peut pas être modifié depuis le backoffice.</p>
    ${rows.length ? table(`<thead><tr><th>Date</th><th>Auteur</th><th>Action</th><th>Objet</th><th>Détails</th></tr></thead><tbody>${rows.map(r => `<tr><td>${dt(r.le)}</td><td>${esc(r.acteur)}</td><td>${esc(act[r.action] || r.action)}</td><td>${esc(r.cible || "")}</td>
      <td class="gren-details"><details><summary>Voir</summary><pre>${esc(JSON.stringify(r.details, null, 1))}</pre></details></td></tr>`).join("")}</tbody>`) : `<p class="gren-mention">Journal vide.</p>`}
    ${rows.length >= A.limite.journal ? btn("Afficher plus", 'data-act="plus" data-l="journal"', {kind:"secondary", sm:true}) : ""}`;
};

/* ---------- Mon compte ---------- */
S_.compte = async () => {
  const l = (await sb.auth.mfa.listFactors()).data || {};
  const fs = (l.all || []).filter(f => f.status === "verified");
  return `<h1>Mon compte</h1>
    <section class="gren-panel"><h2 class="fr-h5">Informations</h2><p class="fr-mb-0">${esc(A.moi.nom || "—")} · ${esc(A.email)} · ${esc(ROLES[A.moi.role])}</p></section>
    <section class="gren-panel"><h2 class="fr-h5">Mot de passe</h2>${btn("Changer mon mot de passe", 'data-act="changerMdp"', {kind:"secondary", icon:"lock-line"})}</section>
    <section class="gren-panel"><h2 class="fr-h5">Double authentification</h2>
      ${table(`<thead><tr><th>Appareil</th><th>Ajouté le</th></tr></thead><tbody>${fs.map(f => `<tr><td>${esc(f.friendly_name || "Application d'authentification")}</td><td>${dj(f.created_at)}</td></tr>`).join("")}</tbody>`)}
      <p class="gren-mention">En cas de perte du téléphone, un super-administrateur peut supprimer puis recréer votre accès.</p></section>
    <section class="gren-panel"><h2 class="fr-h5">Sessions</h2>${btn("Me déconnecter de tous les appareils", 'data-act="deconnexionGlobale"', {kind:"secondary", icon:"logout-box-r-line"})}</section>`;
};

/* =============================================================================
   ACTIONS
   ============================================================================= */
async function rafraichir(){ A.stats = null; await chargerSection(); }
document.addEventListener("click", async ev => {
  const t = ev.target.closest("[data-section],[data-act]"); if (!t) return;
  if (t.dataset.section) { ev.preventDefault(); A.section = t.dataset.section; A.refEdit = null; history.replaceState(null, "", "#" + A.section); render(); chargerSection(); scrollTo(0, 0); return; }
  if (t.tagName === "SELECT" || (t.tagName === "INPUT" && t.type !== "button")) return;
  const a = t.dataset.act; ev.preventDefault();
  const tr = t.closest("tr");
  try {
    switch (a) {
      case "ecranOubli": A.ecran = "oubli"; render(); break;
      case "ecranInvitation": A.ecran = "invitation"; render(); break;
      case "ecranConnexion": A.ecran = "connexion"; A.msg = ""; render(); break;
      case "deconnexion": await deconnecter(); break;
      case "deconnexionGlobale": if (await confirmer("Déconnexion générale", "Toutes vos sessions ouvertes seront fermées.", "Déconnecter")) { try { await sb.rpc("deconnexion", {p_motif:"deconnexion"}); } catch(e){} await sb.auth.signOut({scope:"global"}); A.ecran = "connexion"; render(); } break;
      case "changerMdp": A.recovery = true; A.ecran = "motdepasse"; render(); break;
      case "plus": A.limite[t.dataset.l] += 200; chargerSection(); break;
      case "csvStats": { const s = await stats(); csv(`statistiques_${A.jours}j.csv`, ["Jour", "Visites", "Calculs", "Exports", "Sessions"], (s.par_jour || []).map(r => [r.jour, r.visites, r.calculs, r.exports, r.sessions])); break; }
      case "csvConn": csv("connexions.csv", ["Date", "Succès", "Motif", "Compte", "IP", "Navigateur"], (A._conn || []).map(r => [r.le, r.succes ? "oui" : "non", MOTIFS[r.motif] || r.motif, r.email, r.ip, r.user_agent])); break;
      case "csvSecu": csv("securite.csv", ["Date", "Gravité", "Type", "IP", "Compte", "Détails", "Traité", "Traité par"], (A._secu || []).map(r => [r.le, r.gravite, TYPES_SECU[r.type] || r.type, r.ip, r.email, JSON.stringify(r.details), r.traite ? "oui" : "non", r.traite_par])); break;
      case "csvJournal": csv("journal_administration.csv", ["Date", "Auteur", "Action", "Objet", "Détails"], (A._journal || []).map(r => [r.le, r.acteur, r.action, r.cible, JSON.stringify(r.details)])); break;
      case "traiter": await q(sb.from("securite").update({traite:true, traite_par:A.email, traite_le:new Date().toISOString()}).eq("id", +tr.dataset.id)); rafraichir(); break;
      case "traiterTout": { const ids = (A._secu || []).filter(r => !r.traite).map(r => r.id); if (!ids.length) break;
        if (await confirmer("Marquer comme traités", `${ids.length} événement(s) affiché(s) seront marqués comme traités.`)) { await q(sb.from("securite").update({traite:true, traite_par:A.email, traite_le:new Date().toISOString()}).in("id", ids)); rafraichir(); } break; }
      case "bloquerIp": {
        const r = await dialog({title:"Bloquer une adresse IP", body:`${fInput("Adresse IP", 'name="ip"', t.dataset.ip || "")}${fInput("Motif", 'name="motif"', "Blocage manuel")}
          ${fSelect("Durée", 'name="duree"', [["1", "1 heure"], ["24", "24 heures"], ["168", "7 jours"], ["720", "30 jours"], ["0", "Définitif"]].map(([k, l]) => opt(k, l, "168")).join(""))}`,
          buttons:[{label:"Annuler", secondaire:true, value:0}, {label:"Bloquer", value:1}]});
        if (r.choix !== 1) break; const ip = r.vals.ip.trim(); if (!/^[0-9a-fA-F:.]{3,64}$/.test(ip)) { toast("Adresse IP invalide.", true); break; }
        const h = +r.vals.duree; await q(sb.from("ip_bloquees").upsert({ip, motif:r.vals.motif.slice(0, 200), jusqu_a:h ? new Date(Date.now() + h * 3600e3).toISOString() : null, auto:false, cree_par:A.email}));
        toast(`Adresse ${ip} bloquée.`); rafraichir(); break; }
      case "debloquerIp": if (await confirmer("Débloquer l'adresse", esc(t.dataset.ip), "Débloquer")) { await q(sb.from("ip_bloquees").delete().eq("ip", t.dataset.ip)); toast("Adresse débloquée."); rafraichir(); } break;
      case "creerAdmin": {
        const r = await dialog({title:"Créer un accès administrateur", body:`${fInput("Adresse électronique", 'name="email" autocomplete="off"', "", {type:"email"})}${fInput("Nom et prénom", 'name="nom" autocomplete="off"')}
          ${fSelect("Rôle", 'name="role"', Object.entries(ROLES).map(([k, v]) => opt(k, v, "admin")).join(""))}
          <div class="fr-checkbox-group fr-mt-2w"><input type="checkbox" id="cInv" name="inviter" checked><label class="fr-label" for="cInv">Envoyer immédiatement l'invitation par courriel</label></div>
          <p class="gren-mention fr-mt-2w">La personne recevra un lien pour définir son mot de passe et activer la double authentification. Seules les adresses créées ici peuvent ouvrir un compte.</p>`,
          buttons:[{label:"Annuler", secondaire:true, value:0}, {label:"Créer l'accès", value:1}]});
        if (r.choix !== 1) break; const email = r.vals.email.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Adresse électronique invalide.", true); break; }
        await q(sb.from("admins").insert({email, nom:r.vals.nom.trim().slice(0, 120), role:r.vals.role, cree_par:A.email}));
        if (r.vals.inviter) await envoyerInvitation(email);
        toast("Accès créé."); rafraichir(); break; }
      case "inviter": await envoyerInvitation(tr.dataset.email); break;
      case "basculerAdmin": { const email = tr.dataset.email; const row = await q(sb.from("admins").select("actif").eq("email", email).single());
        if (await confirmer(row.actif ? "Désactiver l'accès" : "Réactiver l'accès", esc(email), row.actif ? "Désactiver" : "Réactiver")) { await q(sb.from("admins").update({actif:!row.actif}).eq("email", email)); rafraichir(); } break; }
      case "supprimerAdmin": { const email = tr.dataset.email;
        if (await confirmer("Supprimer l'accès", `L'accès de ${esc(email)} sera supprimé. Le compte de connexion restera dans Supabase mais n'aura plus aucun droit.`, "Supprimer")) { await q(sb.from("admins").delete().eq("email", email)); toast("Accès supprimé."); rafraichir(); } break; }
      case "purger": if (await confirmer("Purger les journaux", "Les visites, connexions et événements de sécurité traités plus anciens que la durée de conservation seront définitivement supprimés.", "Purger")) {
        const r = await q(sb.rpc("purger_journaux")); toast(`Purge : ${r.evenements} visites, ${r.connexions} connexions, ${r.securite} événements supprimés.`); } break;
      // Référentiel
      case "nouveauRef": { const r = await dialog({title:"Nouveau brouillon", body:fSelect("Partir de", 'name="src"', opt("publie", "La version publiée (si elle existe)", "publie") + opt("defaut", "Les valeurs par défaut de l'application", "")), buttons:[{label:"Annuler", secondaire:true, value:0}, {label:"Créer", value:1}]});
        if (r.choix !== 1) break; let contenu = clone(REF_DEFAULT);
        if (r.vals.src === "publie") { const p = await q(sb.from("referentiels").select("contenu").eq("statut", "publie").maybeSingle()); if (p) contenu = p.contenu; }
        await creerBrouillon(contenu, r.vals.src === "publie" ? "Copie de la version publiée" : "Valeurs par défaut"); break; }
      case "dupliquerRef": { const p = await q(sb.from("referentiels").select("contenu,version").eq("id", +tr.dataset.id).single()); await creerBrouillon(p.contenu, `Copie de la v${p.version}`); break; }
      case "ouvrirRef": { const p = await q(sb.from("referentiels").select("*").eq("id", +tr.dataset.id).single());
        A.refEdit = {id:p.id, version:p.version, commentaire:p.commentaire, contenu:completerRef(p.contenu), editable:p.statut === "brouillon" && peutEcrire()}; chargerSection(); break; }
      case "fermerRef": A.refEdit = null; chargerSection(); break;
      case "publierRef": if (await confirmer("Publier cette version", "Elle remplacera la version publiée pour tous les utilisateurs de l'application.", "Publier")) { await q(sb.rpc("publier_referentiel", {p_id:+tr.dataset.id})); toast("Référentiel publié."); rafraichir(); } break;
      case "supprimerRef": if (await confirmer("Supprimer le brouillon", "Ce brouillon sera définitivement supprimé.", "Supprimer")) { await q(sb.from("referentiels").delete().eq("id", +tr.dataset.id)); rafraichir(); } break;
      case "telechargerRef": { const p = await q(sb.from("referentiels").select("contenu,version").eq("id", +tr.dataset.id).single()); download(`referentiel-gren-v${p.version}.json`, JSON.stringify(p.contenu, null, 1), "application/json"); break; }
      case "refAjout": { const T = REF_TABLES.find(x => x.k === t.dataset.k); const row = {}; T.cols.forEach(([f,, ty]) => row[f] = Array.isArray(ty) ? ty[0] : ty === "n" ? 0 : ""); if ("id" in row) row.id = uid().slice(0, 5); A.refEdit.contenu[T.k].push(row); chargerSection(); break; }
      case "refSuppr": A.refEdit.contenu[t.dataset.k].splice(+t.dataset.i, 1); chargerSection(); break;
      case "enregistrerRef": case "enregistrerPublierRef": {
        const E = A.refEdit; const comm = ($("[data-refcomm]") || {}).value || E.commentaire || "";
        const err = verifierRef(E.contenu); if (err) { toast(err, true); break; }
        await q(sb.from("referentiels").update({contenu:E.contenu, commentaire:comm.slice(0, 300)}).eq("id", E.id));
        if (a === "enregistrerPublierRef") { if (!await confirmer("Publier cette version", "Elle remplacera la version publiée pour tous les utilisateurs.", "Publier")) { toast("Brouillon enregistré."); break; } await q(sb.rpc("publier_referentiel", {p_id:E.id})); A.refEdit = null; toast("Référentiel enregistré et publié."); rafraichir(); }
        else toast("Brouillon enregistré.");
        break; }
    }
  } catch(e){ console.error(e); toast("Action impossible : " + (e.message || e), true); }
});
document.addEventListener("change", async ev => {
  const t = ev.target;
  if (t.dataset.act === "jours") { A.jours = +t.value; A.stats = null; chargerSection(); return; }
  if (t.dataset.filtre) { const [g, k] = t.dataset.filtre.split("."); A.filtres[g][k] = t.value; A.limite[g === "conn" ? "conn" : "secu"] = 100; chargerSection(); return; }
  if (t.dataset.act === "role") { const email = t.closest("tr").dataset.email;
    try { await q(sb.from("admins").update({role:t.value}).eq("email", email)); toast("Rôle modifié."); } catch(e){ toast("Modification impossible : " + e.message, true); } rafraichir(); return; }
  if (t.dataset.rparam && A.refEdit) { const k = t.dataset.rparam; A.refEdit.contenu.params[k] = k === "cipanLimite" ? t.value : (+String(t.value).replace(",", ".") || 0); return; }
  if (t.dataset.rref && A.refEdit) { const row = A.refEdit.contenu[t.dataset.rref][+t.dataset.i]; row[t.dataset.f] = t.dataset.t === "n" ? (t.value.trim() === "" ? "" : (+String(t.value).replace(",", ".") || 0)) : t.value; return; }
  if (t.dataset.act === "importRef") { const f = t.files[0]; if (!f) return; const txt = await f.text(); t.value = "";
    try { const r = JSON.parse(txt); const err = verifierRef(r); if (err) throw new Error(err); await creerBrouillon(r, "Import de " + f.name); } catch(e){ toast("Fichier invalide : " + e.message, true); } }
});
function completerRef(r){ const c = clone(r || {}); for (const k of Object.keys(REF_DEFAULT)) if (!(k in c)) c[k] = clone(REF_DEFAULT[k]); c.params = Object.assign(clone(REF_DEFAULT.params), c.params || {}); return c; }
function verifierRef(r){
  if (!r || typeof r !== "object") return "Contenu vide.";
  for (const k of ["cultures", "sols", "precedents", "effluents", "calendrier"]) if (!Array.isArray(r[k]) || (k !== "calendrier" && !r[k].length)) return `La table « ${k} » est absente ou vide.`;
  for (const k of ["cultures", "sols", "precedents", "effluents", "cipan", "mineraux", "animaux"]) { const ids = (r[k] || []).map(x => x.id); if (ids.some(x => !x)) return `Un code est vide dans « ${k} ».`; if (new Set(ids).size !== ids.length) return `Codes en double dans « ${k} ».`; }
  if (r.calendrier.some(x => !/^\d{2}-\d{2}$/.test(x.debut) || !/^\d{2}-\d{2}$/.test(x.fin))) return "Dates du calendrier au format MM-JJ attendu.";
  return "";
}
async function creerBrouillon(contenu, commentaire){
  const err = verifierRef(contenu); if (err) throw new Error(err);
  const der = await q(sb.from("referentiels").select("version").order("version", {ascending:false}).limit(1));
  const v = (der[0]?.version || 0) + 1;
  const r = await q(sb.from("referentiels").insert({version:v, contenu:completerRef(contenu), commentaire, cree_par:A.email, statut:"brouillon"}).select().single());
  A.refEdit = {id:r.id, version:r.version, commentaire:r.commentaire, contenu:r.contenu, editable:true}; toast(`Brouillon v${v} créé.`); chargerSection();
}
async function envoyerInvitation(email){
  const {error} = await sb.auth.signInWithOtp({email, options:{shouldCreateUser:true, emailRedirectTo:location.href.split("#")[0]}});
  if (error) toast("Envoi impossible : " + error.message, true); else toast(`Invitation envoyée à ${email}.`);
}

/* =============================================================================
   DÉMARRAGE
   ============================================================================= */
{ const h = location.hash.slice(1); if (["tableau", "utilisation", "connexions", "securite", "admins", "referentiel", "parametres", "journal", "compte"].includes(h)) A.section = h; }
if (SRV) sb.auth.onAuthStateChange((evt) => {
  if (evt === "PASSWORD_RECOVERY") { A.recovery = true; setTimeout(route, 0); }
  if (evt === "SIGNED_OUT" && A.ecran === "app") { A.ecran = "connexion"; render(); }
});
route();
