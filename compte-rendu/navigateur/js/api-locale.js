/**
 * « API » locale : mêmes fonctions que la version serveur, mais exécutées dans le navigateur.
 * Les données restent sur ce poste (IndexedDB) ; seul le texte part vers l'IA choisie.
 */
import * as stockage from "./stockage.js";
import * as ia from "./ia.js";
import * as exporter from "./export.js";
import { analyserLocalement, compteRenduDeBase } from "./analyse-locale.js";
import { extraireAudio, enWav, DUREE_MAX_H } from "./extraction-audio.js";
import { MODELES_TRANSCRIPTION, TAUX } from "./moteur-audio.js";

export class ErreurApi extends Error {}
const erreur = (m) => { throw new ErreurApi(m); };

const EXTENSIONS = [".mp3", ".wav", ".m4a", ".ogg", ".opus", ".webm", ".flac", ".aac", ".wma", ".amr", ".aiff", ".aif",
  ".mp4", ".m4v", ".mov", ".mkv", ".avi", ".wmv", ".mpg", ".mpeg", ".ts", ".mts", ".3gp"];
const fichiersADeposer = new Map(); // fichiers d'origine, gardés en mémoire le temps de l'extraction du son
const enCours = new Map(); // traitements actifs dans cet onglet

export const demo = new URLSearchParams(location.search).has("demo");
export const CONFIG = { conservation: "ephemere", sourceModeles: "huggingface", iaAutorisees: ["mistral", "ollama"], memoriserClesAutorise: false, ...(self.CR_CONFIG || {}) };
export const ephemere = CONFIG.conservation !== "duree";

const ANALYSE_LOCALE = { code: "locale", nom: "Analyse locale (sans IA)", modele: "règles", horsUE: false };
let dictionnaire = null;
async function chargerDictionnaire() {
  if (dictionnaire) return dictionnaire;
  try {
    const r = await fetch(new URL("../vendor/mots-fr.txt", import.meta.url));
    dictionnaire = new Set((await r.text()).split("\n"));
  } catch { dictionnaire = null; } // sans dictionnaire, les autres contrôles restent actifs
  return dictionnaire;
}

async function analyseLocale(id) {
  const dico = await chargerDictionnaire();
  await maj(id, (r) => {
    ia.appliquer(r, analyserLocalement(r, dico), ANALYSE_LOCALE, null);
    Object.assign(r, { statut: "analyse_terminee", progression: "Analyse locale terminée", erreur: null });
  });
  await stockage.journaliser(id, "analyse_locale");
}

// ------------------------------------------------------------------ traitements de fond
async function maj(id, fn) {
  const r = await stockage.lire(id);
  if (!r) return null;
  fn(r);
  return stockage.enregistrer(r);
}

async function lancerTranscription(id) {
  const reglages = stockage.lireReglages();
  enCours.set(id, "transcription");
  try {
    await maj(id, (r) => Object.assign(r, { statut: "transcription", progression: "Lecture de l'audio" }));
    const r0 = await stockage.lire(id);
    let resultat;
    if (demo) {
      const { transcriptionDemo } = await import("./demo.js");
      await new Promise((ok) => setTimeout(ok, 800));
      resultat = transcriptionDemo();
    } else {
      const fichier = fichiersADeposer.get(id);
      if (!fichier) throw new Error("le fichier d'origine n'est plus disponible : déposez-le à nouveau.");
      await maj(id, (r) => { r.progression = "Extraction du son"; });
      let derniereExtraction = 0;
      const audio = await extraireAudio(fichier, (pct) => {
        if (Date.now() - derniereExtraction < 700) return;
        derniereExtraction = Date.now();
        maj(id, (r) => { r.progression = `Extraction du son : ${pct} %`; });
      });
      fichiersADeposer.delete(id);
      // seule une copie légère du son est conservée (16 kHz mono), pour l'écoute dans l'application
      await stockage.enregistrerAudio(id, enWav(audio));
      await maj(id, (r) => { r.duree = audio.length / TAUX; r.audio_disponible = true; });
      resultat = await new Promise((ok, ko) => {
        const worker = new Worker(new URL("./worker-audio.js", import.meta.url), { type: "module" });
        let materiel = "", derniere = 0;
        let derniereEtape = "";
        const signaler = (texte, etape = "") => {
          const t = Date.now();
          if (t - derniere < 700 && etape === derniereEtape) return; // limite les écritures, sauf changement d'étape
          derniereEtape = etape;
          derniere = t;
          maj(id, (r) => { r.progression = texte; });
        };
        worker.onmessage = ({ data }) => {
          if (data.type === "info") materiel = data.device === "webgpu" ? "carte graphique" : "processeur";
          if (data.type === "telechargement" && data.total) {
            signaler(`Chargement des modèles (téléchargés une seule fois) : ${Math.round(data.charge / 1048576)} / ${Math.round(data.total / 1048576)} Mo`);
          }
          if (data.type === "progression") {
            signaler(data.etape === "voix"
              ? `Identification des interlocuteurs (${materiel}) : ${Math.round(100 * data.fait / data.total)} %`
              : `Transcription de la parole (${materiel}) : ${Math.round(100 * data.fait / data.total)} %`, data.etape);
          }
          if (data.type === "termine") { worker.terminate(); ok(data.resultat); }
          if (data.type === "erreur") { worker.terminate(); ko(new Error(data.message)); }
        };
        worker.onerror = (e) => { worker.terminate(); ko(new Error(e.message || "Erreur du module audio.")); };
        worker.postMessage({ type: "traiter", audio, modele: reglages.modeleTranscription, materiel: reglages.materiel,
          nombre: r0.nb_locuteurs, sourceModeles: CONFIG.sourceModeles }, [audio.buffer]);
      });
    }
    await maj(id, (r) => Object.assign(r, resultat, { statut: "analyse", progression: "Analyse de cohérence locale…", erreur: null }));
    await stockage.journaliser(id, "transcription", `${resultat.segments.length} interventions`);
    try { await analyseLocale(id); } // contrôle de cohérence sans IA, immédiat
    catch (e) { console.error(e); await maj(id, (r) => Object.assign(r, { statut: "transcrit", erreur: `Analyse locale impossible : ${e.message}`, progression: "" })); }
  } catch (e) {
    console.error(e);
    await maj(id, (r) => Object.assign(r, { statut: "erreur", erreur: `Échec de la transcription : ${e.message}`.slice(0, 500) }));
  } finally { enCours.delete(id); }
}

async function lancerAnalyse(id, f, modele) {
  enCours.set(id, "analyse");
  try {
    const r = await stockage.lire(id);
    const resultat = await ia.analyser(r, f, stockage.lireCle(f.code), modele, (texte) => maj(id, (x) => { x.progression = texte; }));
    await maj(id, (x) => { ia.appliquer(x, resultat, f, modele); Object.assign(x, { statut: "analyse_terminee", progression: "Analyse terminée", erreur: null }); });
  } catch (e) {
    console.error(e);
    const message = e instanceof ia.ErreurIA ? e.message : `Erreur pendant l'analyse : ${e.message}`;
    await maj(id, (x) => Object.assign(x, { statut: x.analyse ? "analyse_terminee" : "transcrit", erreur: message, progression: "" }));
  } finally { enCours.delete(id); }
}

/** Au chargement : un traitement interrompu (onglet fermé) est signalé, et la purge est appliquée. */
export async function demarrer() {
  if (ephemere) await stockage.nettoyerSiNouvelleSession();
  const reglages = stockage.lireReglages();
  for (const r of await stockage.lister()) {
    if (["en_attente", "transcription", "analyse"].includes(r.statut) && !enCours.has(r.id)) {
      r.statut = r.segments?.length ? (r.analyse ? "analyse_terminee" : "transcrit") : "erreur";
      r.erreur = "Le traitement a été interrompu (onglet fermé ou rechargé). Relancez-le.";
      await stockage.enregistrer(r);
    }
  }
  return ephemere ? null : stockage.purger(reglages.retentionAudio, reglages.retentionReunion);
}

// ------------------------------------------------------------------ routes
function fournisseurPublic(f) {
  return { code: f.code, nom: f.nom, site: f.site, hebergement: f.hebergement, hors_ue: f.horsUE, modele: f.modele,
    cle_requise: f.cle, configure: !f.cle || !!stockage.lireCle(f.code), cle_memorisee: stockage.cleMemorisee(f.code), obtenir_cle: f.obtenirCle,
    memorisation_autorisee: !!CONFIG.memoriserClesAutorise };
}

function segment(r, sid) {
  const s = (r.segments || []).find((x) => x.id === sid);
  if (!s) erreur("Intervention introuvable.");
  return s;
}
const historiser = (s, champ, ancien, nouveau) => (s.historique ||= []).push({ champ, ancien, nouveau, par: "ce poste", le: Date.now() / 1000 });

async function charger(id) {
  const r = await stockage.lire(id);
  if (!r) erreur("Réunion introuvable.");
  return r;
}

export async function api(methode, url, corps) {
  const [chemin, requete] = url.split("?");
  const p = chemin.replace(/^\/api\//, "").split("/");
  const reglages = stockage.lireReglages();

  if (methode === "GET" && chemin === "/api/config") {
    const fournisseurs = Object.values(ia.FOURNISSEURS).filter((f) => (f.code !== "demo" || demo) && ia.autorise(f.code)).map(fournisseurPublic);
    return { demo, duree_max_h: DUREE_MAX_H, retention_audio_jours: reglages.retentionAudio, retention_reunion_jours: reglages.retentionReunion,
      lien_ia_defaut: demo ? "demo" : reglages.lienIa, fournisseurs, types_incoherence: ia.TYPES_INCOHERENCE, utilisateur: "ce poste",
      modeles_transcription: MODELES_TRANSCRIPTION, reglages, deploiement: CONFIG, ephemere };
  }
  if (methode === "DELETE" && chemin === "/api/tout") { await stockage.toutEffacer(); return null; }
  if (methode === "PUT" && chemin === "/api/reglages") { stockage.ecrireReglages({ ...reglages, ...corps }); return { ok: true }; }
  if (methode === "PUT" && p[0] === "cles") { stockage.ecrireCle(p[1], (corps.cle || "").trim(), !!corps.memoriser); return { ok: true }; }
  if (methode === "POST" && chemin === "/api/ia/resoudre") {
    try { return fournisseurPublic(ia.resoudre(corps.lien)); } catch (e) { erreur(e.message); }
  }

  if (p[0] !== "reunions") erreur("Action inconnue.");
  if (p.length === 1) {
    if (methode === "GET") {
      return (await stockage.lister()).map((r) => ({ id: r.id, titre: r.titre, date_reunion: r.date_reunion, cree_le: r.cree_le, statut: r.statut,
        score_global: r.analyse?.score_global ?? null, nb_locuteurs: Object.keys(r.locuteurs || {}).length }));
    }
    if (methode === "POST") {
      const fichier = corps.get("fichier");
      if (!corps.get("information_participants")) erreur("Vous devez attester que les participants ont été informés de l'enregistrement.");
      if (!fichier || !fichier.size) erreur("Choisissez un fichier audio.");
      const ext = (fichier.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
      if (!EXTENSIONS.includes(ext)) erreur("Format non pris en charge. Formats acceptés : " + EXTENSIONS.join(", "));
      // pas de limite de taille : seule la piste son est extraite (limite de durée : voir extraction-audio.js)
      const id = stockage.nouvelId();
      const nb = parseInt(corps.get("nb_locuteurs"), 10);
      fichiersADeposer.set(id, fichier);
      await stockage.enregistrer({ id, titre: String(corps.get("titre") || "").trim().slice(0, 200) || fichier.name.slice(0, 200),
        date_reunion: String(corps.get("date_reunion") || ""), nb_locuteurs: nb >= 1 && nb <= 30 ? nb : null, statut: "en_attente",
        progression: "Préparation", audio_disponible: false, fichier_origine: { nom: fichier.name.slice(0, 200), taille: fichier.size }, cree_le: Date.now() / 1000, segments: [], locuteurs: {} });
      await stockage.journaliser(id, "creation", `${fichier.name} (${Math.round(fichier.size / 1024)} Ko)`);
      lancerTranscription(id);
      return { id };
    }
  }

  const id = p[1];
  if (!/^[0-9a-f]{32}$/.test(id || "")) erreur("Réunion introuvable.");
  const r = await charger(id);
  const action = p[2];

  if (!action) {
    if (methode === "GET") { r.journal = await stockage.lireJournal(id); return r; }
    if (methode === "DELETE") { await stockage.supprimer(id); return null; }
  }
  if (action === "audio") {
    if (methode === "GET") {
      const blob = r.audio_disponible && (await stockage.lireAudio(id));
      if (!blob) erreur("Audio supprimé (durée de conservation dépassée).");
      return blob;
    }
    if (methode === "DELETE") {
      await stockage.supprimerAudio(id); r.audio_disponible = false; await stockage.enregistrer(r);
      await stockage.journaliser(id, "suppression_audio"); return null;
    }
  }
  if (action === "locuteurs") {
    const nom = String(corps.nom || "").trim().slice(0, 120), fonction = String(corps.fonction || "").trim().slice(0, 200);
    if (!nom) erreur("Le nom est obligatoire.");
    if (methode === "PUT") {
      if (!r.locuteurs[p[3]]) erreur("Interlocuteur introuvable.");
      r.locuteurs[p[3]] = { nom, fonction };
      if (r.compte_rendu?.automatique) r.compte_rendu = compteRenduDeBase(r); // le compte rendu de base reprend les noms
      await stockage.enregistrer(r);
      await stockage.journaliser(id, "renommage_locuteur", `${p[3]} → ${nom}`); return { ok: true };
    }
    if (methode === "POST") {
      let n = 1; while (r.locuteurs[`L${n}`]) n++;
      r.locuteurs[`L${n}`] = { nom, fonction }; await stockage.enregistrer(r);
      await stockage.journaliser(id, "ajout_locuteur", `L${n} : ${nom}`); return { code: `L${n}` };
    }
  }
  if (action === "segments" && p[4] === "incoherences") {
    const s = segment(r, p[3]);
    const incs = s.incoherences || [];
    const inc = incs[parseInt(p[5], 10)] || erreur("Incohérence introuvable.");
    if (corps.action === "appliquer") {
      if (!inc.suggestion) erreur("Aucune correction proposée pour cette incohérence.");
      historiser(s, "texte", s.texte, inc.suggestion); s.texte = inc.suggestion; s.corrige = true; inc.statut = "corrigee";
    } else if (corps.action === "rouvrir") inc.statut = "ouverte";
    else inc.statut = corps.action === "ignorer" ? "ignoree" : "resolue";
    if (incs.every((i) => i.statut !== "ouverte") && s.score != null) s.valide = true;
    else if (corps.action === "rouvrir") s.valide = false;
    ia.recalculerScore(r); await stockage.enregistrer(r);
    await stockage.journaliser(id, `incoherence_${corps.action}`, `${s.id}#${p[5]}`); return s;
  }
  if (action === "segments" && methode === "PATCH") {
    const s = segment(r, p[3]);
    if (corps.texte != null && corps.texte.trim() !== s.texte) {
      historiser(s, "texte", s.texte, corps.texte.trim().slice(0, 20000)); s.texte = corps.texte.trim().slice(0, 20000); s.corrige = true;
    }
    if (corps.locuteur != null && corps.locuteur !== s.locuteur) {
      if (!r.locuteurs[corps.locuteur]) erreur("Interlocuteur inconnu.");
      historiser(s, "locuteur", s.locuteur, corps.locuteur); s.locuteur = corps.locuteur;
    }
    if (corps.valide != null) {
      s.valide = !!corps.valide;
      if (s.valide) for (const i of s.incoherences || []) if (i.statut === "ouverte") i.statut = "resolue";
    }
    ia.recalculerScore(r); await stockage.enregistrer(r);
    await stockage.journaliser(id, "correction", `${s.id} : ${JSON.stringify(corps)}`); return s;
  }
  if (action === "incoherences-globales") {
    const g = (r.incoherences_globales || [])[parseInt(p[3], 10)] || erreur("Incohérence introuvable.");
    g.statut = { rouvrir: "ouverte", ignorer: "ignoree" }[corps.action] || "resolue";
    await stockage.enregistrer(r); await stockage.journaliser(id, `incoherence_globale_${corps.action}`, p[3]); return { ok: true };
  }
  if (action === "analyse" && methode === "POST") {
    if (enCours.has(id) || ["en_attente", "transcription", "analyse"].includes(r.statut)) erreur("Un traitement est déjà en cours.");
    if (!r.segments?.length) erreur("La transcription n'est pas disponible.");
    if (corps.lien === "locale") { await analyseLocale(id); return { fournisseur: { nom: ANALYSE_LOCALE.nom } }; }
    let f;
    try { f = ia.resoudre(corps.lien); } catch (e) { erreur(e.message); }
    if (f.horsUE && !corps.accepte_hors_ue) erreur(`${f.nom} est hébergé hors de l'Union européenne : confirmation explicite requise.`);
    if (f.cle && !stockage.lireCle(f.code)) erreur(`Saisissez votre clé d'API ${f.nom}.`);
    const modele = corps.modele && /^[\w.:/@-]{1,100}$/.test(corps.modele) ? corps.modele : null;
    Object.assign(r, { statut: "analyse", progression: `Analyse par ${f.nom}`, erreur: null });
    await stockage.enregistrer(r);
    await stockage.journaliser(id, "analyse", `${f.nom} / ${modele || f.modele}`);
    lancerAnalyse(id, f, modele);
    return { fournisseur: fournisseurPublic(f) };
  }
  if (action === "compte-rendu" && methode === "PUT") {
    const t = (v, n) => String(v ?? "").slice(0, n);
    r.compte_rendu = {
      resume: t(corps.resume, 50000),
      points: (corps.points || []).slice(0, 200).map((x) => ({ titre: t(x.titre, 300), contenu: t(x.contenu, 20000), segments: (x.segments || []).slice(0, 50).map((y) => t(y, 10)) })),
      decisions: (corps.decisions || []).slice(0, 200).map((x) => t(x, 5000)),
      actions: (corps.actions || []).slice(0, 200).map((x) => ({ action: t(x.action, 5000), responsable: t(x.responsable, 300), echeance: t(x.echeance, 100) })),
    };
    await stockage.enregistrer(r); await stockage.journaliser(id, "edition_compte_rendu"); return { ok: true };
  }
  if (action === "export" && methode === "GET") {
    const q = new URLSearchParams(requete);
    const doc = exporter.DOCUMENTS[q.get("doc")] ? q.get("doc") : "compte-rendu";
    const format = exporter.FORMATS[q.get("format")] ? q.get("format") : "docx";
    await stockage.journaliser(id, "export", `${exporter.DOCUMENTS[doc].nom} (${format})`);
    const base = (r.titre || "reunion").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-|-$/g, "").slice(0, 70) || "reunion";
    const suffixe = { "compte-rendu": "compte-rendu", verification: "compte-rendu-verification", transcription: "transcription" }[doc];
    return { blob: await exporter.generer(r, doc, format), nom: `${base}_${suffixe}.${exporter.FORMATS[format].extension}` };
  }
  erreur("Action inconnue.");
}
