/**
 * Analyse de cohérence LOCALE, sans IA ni clé d'API : des règles transparentes exécutées sur ce poste.
 *  - calculs : un montant annoncé avec « donc », « reste », « total »… est recalculé à partir des montants cités avant ;
 *  - dates : un même sujet associé à deux mois différents ;
 *  - transcription : mots absents du dictionnaire français, répétitions anormales ;
 *  - audibilité : voix faible ou très faible par rapport au reste de la réunion ;
 *  - attribution : plusieurs personnes parlent en même temps.
 * Produit aussi un compte rendu de base (extraits, décisions, actions), à compléter par l'agent.
 */

// ------------------------------------------------------------------ outils de texte
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOTS_VIDES = new Set(("a au aux avec ce ces cet cette dans de des du elle elles en et eux il ils je la le les leur leurs lui ma mais me même mes moi mon ne nos notre nous on ou où par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous y est sont été être avoir avons avez ont fait faire faut donc alors aussi bien très plus moins tout tous toute toutes comme si oui non ça cela ceci celui celle ceux après avant entre chez sans sous vers encore déjà quand comment pourquoi parce puis voilà merci bonjour bon bonne quel quelle quels quelles peut peux pouvez pouvons pourra pourrait devons doit dois prévu prévus prévue était étaient sera seront serait vais va allons allez cest plutôt environ autre autres point").split(" "));
const MOTS_CHIFFRES = new Set("zéro deux trois quatre cinq six sept huit neuf onze douze treize quatorze quinze seize vingt trente quarante cinquante soixante cent cents mille million millions milliard milliards euro euros virgule".split(" "));
for (const m of [...MOTS_CHIFFRES, ...MOIS]) MOTS_VIDES.add(m);
const sansAccents = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const VERBES_GENERIQUES = new Set(["faire", "prépa", "prévoi", "pouvoi", "pourra", "devoir", "propos", "valide", "vérifi", "rappel", "signal", "voudra"]);

const normaliser = (t) => String(t || "").replace(/[  ]/g, " ").replace(/’/g, "'");
const radical = (mot) => mot.toLowerCase().normalize("NFC").slice(0, 6);
const phrases = (texte) => normaliser(texte).split(/(?<=[.!?…])\s+/).map((p) => p.trim()).filter(Boolean);
const motsDe = (texte) => normaliser(texte).match(/[\p{L}]+(?:-[\p{L}]+)*/gu) || [];
const motsUtiles = (texte) => motsDe(texte).map((m) => m.toLowerCase()).filter((m) => m.length >= 5 && !MOTS_VIDES.has(m));

// ------------------------------------------------------------------ nombres et montants
const UNITES = { zéro: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11,
  douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, quatrevingt: 80 };

/** Lit un nombre écrit en lettres (jusqu'à 999 999) à partir de la liste de mots ; renvoie [valeur, nombre de mots lus]. */
function lireNombreEnLettres(mots, i) {
  const valeurMot = (p) => (p in UNITES ? UNITES[p] : null);
  let total = 0, courant = 0, lus = 0, vu = false;
  while (i + lus < mots.length) {
    const brut = mots[i + lus].toLowerCase().replace(/quatre-vingts?/g, "quatrevingt");
    const parties = brut.split("-").filter((p) => p !== "et");
    const reconnu = parties.length && parties.every((p) => valeurMot(p) != null || ["cent", "cents", "mille"].includes(p));
    if (!reconnu) {
      if (brut === "et" && vu) { lus++; continue; }
      break;
    }
    for (const p of parties) {
      if (p === "cent" || p === "cents") courant = (courant || 1) * 100;
      else if (p === "mille") { total += (courant || 1) * 1000; courant = 0; }
      else courant += valeurMot(p);
    }
    vu = true; lus++;
  }
  return vu ? [total + courant, lus] : [null, 0];
}

const MULTIPLICATEURS = { mille: 1e3, million: 1e6, millions: 1e6, milliard: 1e9, milliards: 1e9 };

/**
 * Repère les nombres d'un texte. Chaque élément : { valeur, montant (bool), debut, fin (positions dans le texte) }.
 * Un « montant » porte une unité monétaire, un multiplicateur (millions…) ou des milliers séparés par des espaces.
 */
export function extraireNombres(texte) {
  texte = normaliser(texte);
  const resultats = [];
  const occupe = new Array(texte.length).fill(false);
  const marquer = (d, f) => { for (let k = d; k < f; k++) occupe[k] = true; };

  // 1. nombres en chiffres : « 2,4 millions d'euros », « 800 000 euros », « 3 »
  const reChiffres = /(\d{1,3}(?:[ .]\d{3})+|\d+)(?:,(\d+))?(\s*(?:millions?|milliards?|mille)\b)?(\s*(?:d'euros|euros?|€|k€|M€))?/gi;
  for (const m of texte.matchAll(reChiffres)) {
    const entier = m[1].replace(/[ .]/g, "");
    let valeur = parseFloat(entier + (m[2] ? "." + m[2] : ""));
    const mult = m[3] ? MULTIPLICATEURS[m[3].trim().toLowerCase()] : 1;
    valeur *= mult;
    if (/k€/i.test(m[4] || "")) valeur *= 1e3;
    if (/M€/.test(m[4] || "")) valeur *= 1e6;
    const annee = !m[3] && !m[4] && /^(19|20)\d\d$/.test(m[1]);
    const montant = !annee && (!!m[3] || !!m[4] || /[ .]\d{3}/.test(m[1]));
    resultats.push({ valeur, montant, debut: m.index, fin: m.index + m[0].length, texte: m[0] });
    marquer(m.index, m.index + m[0].length);
  }

  // 2. nombres en lettres : « un virgule neuf million d'euros », « trois chantiers »
  const reMots = /[\p{L}]+(?:-[\p{L}]+)*|'/gu;
  const jetons = [...texte.matchAll(reMots)].map((m) => ({ mot: m[0], debut: m.index, fin: m.index + m[0].length }));
  for (let i = 0; i < jetons.length; i++) {
    if (occupe[jetons[i].debut]) continue;
    const [v, lus] = lireNombreEnLettres(jetons.map((j) => j.mot), i);
    if (v == null) continue;
    let valeur = v, j = i + lus;
    if (jetons[j]?.mot.toLowerCase() === "virgule") {
      const [dec, lusDec] = lireNombreEnLettres(jetons.map((x) => x.mot), j + 1);
      if (dec != null) { valeur = parseFloat(`${v}.${dec}`); j += 1 + lusDec; }
    }
    let montant = false;
    const suivant = jetons[j]?.mot.toLowerCase();
    if (suivant && MULTIPLICATEURS[suivant] && suivant !== "mille") { valeur *= MULTIPLICATEURS[suivant]; montant = true; j++; }
    if (/^(euros?|d)$/.test(jetons[j]?.mot.toLowerCase() || "")) {
      montant = true;
      if (jetons[j].mot.toLowerCase() === "d" && /^euros?$/i.test(jetons[j + 2]?.mot || jetons[j + 1]?.mot || "")) j += jetons[j + 1]?.mot === "'" ? 3 : 2;
      else j++;
    }
    const fin = jetons[j - 1].fin;
    // « un » / « une » isolés sont des articles, pas des nombres
    if (!montant && lus === 1 && /^(un|une)$/i.test(jetons[i].mot)) continue;
    resultats.push({ valeur, montant, debut: jetons[i].debut, fin, texte: texte.slice(jetons[i].debut, fin) });
    i = j - 1;
  }
  return resultats.sort((a, b) => a.debut - b.debut);
}

export function formaterMontant(v) {
  const fr = (x, d = 0) => x.toLocaleString("fr-FR", { maximumFractionDigits: d }).replace(/ /g, " ");
  if (v >= 1e9) return `${fr(v / 1e9, 2)} milliard${v >= 2e9 ? "s" : ""} d'euros`;
  if (v >= 1e6) return `${fr(v / 1e6, 2)} million${v >= 2e6 ? "s" : ""} d'euros`;
  return `${fr(v)} euros`;
}

const MARQUEUR_CONCLUSION = /\b(donc|reste|restent|resterait|total|soit|au total|en tout|ce qui fait|ça fait|ce qui donne|ce qui représente)\b/i;

/** Recherche la combinaison de montants cités qui explique le mieux le montant annoncé. */
function verifierCalcul(annonce, contexte, obligatoires, comptes) {
  const candidats = [];
  const vals = contexte.map((c) => c.valeur);
  const ok = (expr, valeur, utilises) => {
    if (obligatoires.length && !obligatoires.some((o) => utilises.includes(o))) return;
    candidats.push({ expr, valeur, ecart: Math.abs(valeur - annonce) / annonce });
  };
  for (let a = 0; a < vals.length; a++) {
    for (const n of comptes) {
      ok(`${n} × ${formaterMontant(vals[a])}`, n * vals[a], [vals[a]]);
      for (let b = 0; b < vals.length; b++) if (b !== a) ok(`${n - 1} × ${formaterMontant(vals[a])} + ${formaterMontant(vals[b])}`, (n - 1) * vals[a] + vals[b], [vals[a], vals[b]]);
    }
    for (let b = 0; b < vals.length; b++) {
      if (b === a) continue;
      if (b > a) ok(`${formaterMontant(vals[a])} + ${formaterMontant(vals[b])}`, vals[a] + vals[b], [vals[a], vals[b]]);
      if (vals[a] > vals[b]) ok(`${formaterMontant(vals[a])} − ${formaterMontant(vals[b])}`, vals[a] - vals[b], [vals[a], vals[b]]);
      for (let c = b + 1; c < vals.length; c++) if (c !== a && b > a) ok(`${formaterMontant(vals[a])} + ${formaterMontant(vals[b])} + ${formaterMontant(vals[c])}`, vals[a] + vals[b] + vals[c], [vals[a], vals[b], vals[c]]);
    }
  }
  if (!obligatoires.length && vals.some((v) => Math.abs(v - annonce) / annonce < 0.005)) return null; // simple rappel d'un montant déjà cité
  if (!candidats.length) return null;
  candidats.sort((x, y) => x.ecart - y.ecart);
  if (candidats[0].ecart < 0.005) return null; // le calcul est juste
  const meilleur = candidats[0];
  return meilleur.ecart <= 0.35 ? meilleur : null;
}

// ------------------------------------------------------------------ analyse
export function analyserLocalement(reunion, dictionnaire) {
  // formes sans accent : un accent oublié par la transcription n'est pas une incohérence
  const dicoSansAccents = dictionnaire ? (dictionnaire._sansAccents ||= new Set([...dictionnaire].map(sansAccents))) : null;
  const segments = reunion.segments || [];
  const locs = reunion.locuteurs || {};
  const parSegment = {};
  const globales = [];
  const ajouter = (id, inc, penalite) => {
    const r = (parSegment[id] ||= { penalite: 0, plafond: 100, incoherences: [] });
    r.incoherences.push(inc);
    r.penalite += penalite.retrait || 0;
    if (penalite.plafond != null) r.plafond = Math.min(r.plafond, penalite.plafond);
  };

  const historiqueMontants = []; // { valeur, seg }
  const historiqueDates = new Map(); // radical -> [{ mois, seg }]

  segments.forEach((s, index) => {
    const texte = normaliser(s.texte);

    // --- audibilité
    if (s.niveau_db != null && s.niveau_db <= -18) {
      ajouter(s.id, { type: "transcription", description: `Voix très faible (${Math.round(s.niveau_db)} dB par rapport au reste de la réunion) : passage à peine audible, transcription à vérifier à l'écoute.`, suggestion: "" }, { retrait: 45 });
    } else if (s.niveau_db != null && s.niveau_db <= -9) {
      ajouter(s.id, { type: "transcription", description: `Voix faible (${Math.round(s.niveau_db)} dB par rapport au reste de la réunion) : transcription à vérifier.`, suggestion: "" }, { retrait: 20 });
    }

    // --- chevauchement
    if (s.chevauchement_s >= 0.5) {
      ajouter(s.id, { type: "attribution", description: `Plusieurs personnes parlent en même temps (${s.chevauchement_s} s) : vérifier à qui attribuer ce propos.`, suggestion: "" }, { retrait: 25 });
    }

    // --- répétitions anormales (erreur fréquente de la transcription automatique)
    const mots = motsDe(texte).map((m) => m.toLowerCase());
    for (let n = 2; n <= 4; n++) {
      const vus = new Map();
      for (let i = 0; i + n <= mots.length; i++) { const k = mots.slice(i, i + n).join(" "); vus.set(k, (vus.get(k) || 0) + 1); }
      const rep = [...vus.entries()].find(([, c]) => c >= 3);
      if (rep) { ajouter(s.id, { type: "transcription", description: `Répétition anormale de « ${rep[0]} » : transcription probablement erronée.`, suggestion: "" }, { retrait: 40 }); break; }
    }

    // --- mots inconnus du dictionnaire
    if (dictionnaire) {
      const inconnus = [];
      const brut = motsDe(texte);
      brut.forEach((m) => {
        const bas = m.toLowerCase();
        if (bas.length <= 2) return;
        const formes = [bas, ...bas.split("-")];
        if (formes.some((f) => dictionnaire.has(f) || dicoSansAccents.has(sansAccents(f)))) return;
        if (/^\p{Lu}/u.test(m)) return; // mot à majuscule absent du dictionnaire : nom propre probable
        if (!inconnus.includes(m)) inconnus.push(m);
      });
      if (inconnus.length) {
        ajouter(s.id, { type: "transcription", description: `Mot${inconnus.length > 1 ? "s" : ""} inconnu${inconnus.length > 1 ? "s" : ""} du dictionnaire : ${inconnus.map((m) => `« ${m} »`).join(", ")} — erreur de transcription possible.`, suggestion: "" }, { retrait: Math.min(30, 12 * inconnus.length) });
      }
    }

    // --- calculs
    const nombres = extraireNombres(texte);
    const montants = nombres.filter((n) => n.montant);
    const marqueur = MARQUEUR_CONCLUSION.exec(texte);
    if (marqueur && montants.length) {
      const annonce = montants.find((m) => m.debut > marqueur.index) || montants.at(-1);
      const autresIci = montants.filter((m) => m !== annonce && m.debut < annonce.debut).map((m) => m.valeur);
      const contexte = [...historiqueMontants.slice(-12).map((h) => ({ valeur: h.valeur })), ...autresIci.map((v) => ({ valeur: v }))]
        .filter((c, i, t) => c.valeur !== annonce.valeur || autresIci.length).filter((c, i, t) => t.findIndex((x) => x.valeur === c.valeur) === i);
      const comptes = new Set([2, 3]);
      for (const seg of segments.slice(Math.max(0, index - 8), index + 1)) {
        for (const n of extraireNombres(seg.texte)) if (!n.montant && Number.isInteger(n.valeur) && n.valeur >= 2 && n.valeur <= 20) comptes.add(n.valeur);
      }
      if (contexte.length >= 2 || autresIci.length) {
        const ecart = verifierCalcul(annonce.valeur, contexte, autresIci, [...comptes]);
        if (ecart) {
          const suggestion = texte.slice(0, annonce.debut) + formaterMontant(ecart.valeur) + texte.slice(annonce.fin);
          const desc = `Calcul à vérifier : ${formaterMontant(annonce.valeur)} annoncé, alors que ${ecart.expr} = ${formaterMontant(ecart.valeur)}.`;
          ajouter(s.id, { type: "chiffre_ou_date", description: desc, suggestion }, { plafond: 35 });
          const sources = historiqueMontants.filter((h) => ecart.expr.includes(formaterMontant(h.valeur))).map((h) => h.seg);
          globales.push({ description: desc, segments: [...new Set([...sources, s.id])], gravite: 65 });
        }
      }
    }
    for (const m of montants) historiqueMontants.push({ valeur: m.valeur, seg: s.id });

    // --- dates : un même sujet associé à des mois différents
    for (const p of phrases(texte)) {
      const motsP = motsDe(p);
      motsP.forEach((m, i) => {
        const mois = m.toLowerCase();
        if (!MOIS.includes(mois)) return;
        const cles = motsP.slice(Math.max(0, i - 6), i).map((x) => x.toLowerCase())
          .filter((x) => x.length >= 5 && !MOTS_VIDES.has(x) && !MOIS.includes(x)).map(radical).filter((r) => !VERBES_GENERIQUES.has(r));
        const conflits = [];
        for (const c of new Set(cles)) {
          const precedent = (historiqueDates.get(c) || []).at(-1);
          if (precedent && precedent.mois !== mois && precedent.seg !== s.id) conflits.push({ cle: c, ...precedent });
        }
        if (conflits.length) {
          const c = conflits[0];
          const desc = `Date différente de celle annoncée plus tôt pour le même sujet : « ${mois} » ici, « ${c.mois} » à l'intervention ${c.seg}.`;
          ajouter(s.id, { type: "contradiction", description: desc, suggestion: "" }, { plafond: conflits.length > 1 ? 40 : 55 });
          globales.push({ description: desc, segments: [c.seg, s.id], gravite: conflits.length > 1 ? 70 : 50 });
        }
        for (const c of new Set(cles)) {
          if (!historiqueDates.has(c)) historiqueDates.set(c, []);
          historiqueDates.get(c).push({ mois, seg: s.id });
        }
      });
    }
  });

  return {
    parSegment: Object.fromEntries(segments.map((s) => {
      const r = parSegment[s.id] || { penalite: 0, plafond: 100, incoherences: [] };
      return [s.id, { score: Math.max(0, Math.min(r.plafond, 100 - r.penalite)), incoherences: r.incoherences }];
    })),
    compteRendu: compteRenduDeBase(reunion),
    incoherencesGlobales: dedoublonner(globales),
  };
}

function dedoublonner(liste) {
  const vus = new Set();
  return liste.filter((g) => { const k = g.description; if (vus.has(k)) return false; vus.add(k); return true; });
}

// ------------------------------------------------------------------ compte rendu sans IA
const RE_DECISION = /\b(décision|décidé|décide|décidons|valid(?:é|ée|er|ons|ez)|adopt(?:é|ée|er)|arrêté|retenu|d'accord pour|on part sur|acté)\b/i;
const RE_ACTION = /\b(je (?:vais|vérifie|vérifierai|envoie|enverrai|prépare|préparerai|m'occupe|transmets|transmettrai|contacte|rédige)|(?:prépare|préparera|vérifiera|enverra|transmettra|organisera|contactera|rédigera)\b|il faudrait|il faut|à prévoir|pouvez-vous|pourriez-vous|merci de)/i;
const RE_ECHEANCE = new RegExp(`\\b(d'ici (?:la fin du mois|la fin de l'année|[^,.;]{1,25})|avant (?:la |le )?[^,.;]{1,30}|(?:en|pour|fin|début|mi-)\\s?(?:${MOIS.join("|")})|(?:lundi|mardi|mercredi|jeudi|vendredi)(?: prochain)?|la semaine prochaine|le mois prochain|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?)`, "i");

function compteRenduDeBase(reunion) {
  const locs = reunion.locuteurs || {};
  const segments = reunion.segments || [];
  const nom = (c) => (locs[c] || {}).nom || c;
  const duree = segments.length ? segments.at(-1).fin : 0;

  // sujets principaux : mots les plus fréquents (hors mots vides et verbes courants)
  const frequences = new Map(), formes = new Map();
  for (const s of segments) {
    for (const m of new Set(motsUtiles(s.texte))) {
      const r = radical(m);
      if (VERBES_GENERIQUES.has(r)) continue;
      frequences.set(r, (frequences.get(r) || 0) + 1);
      const f = formes.get(r) || new Map(); f.set(m, (f.get(m) || 0) + 1); formes.set(r, f);
    }
  }
  const sujets = [...frequences.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([r]) => [...formes.get(r).entries()].sort((a, b) => b[1] - a[1])[0][0]);

  const temps = new Map();
  for (const s of segments) temps.set(s.locuteur, (temps.get(s.locuteur) || 0) + (s.fin - s.debut));
  const participants = Object.keys(locs).map((c) => `${nom(c)} (${Math.round((temps.get(c) || 0) / 60 * 10) / 10} min de parole)`);

  const points = sujets.slice(0, 4).map((sujet) => {
    const r = radical(sujet);
    const extraits = [], ids = [];
    for (const s of segments) {
      for (const p of phrases(s.texte)) {
        if (extraits.length >= 3) break;
        if (motsUtiles(p).some((m) => radical(m) === r)) { extraits.push(`${nom(s.locuteur)} : « ${p} »`); if (!ids.includes(s.id)) ids.push(s.id); }
      }
    }
    return { titre: sujet.charAt(0).toUpperCase() + sujet.slice(1), contenu: extraits.join("\n"), segments: ids };
  });

  const decisions = [], actions = [];
  const prenoms = Object.entries(locs).flatMap(([code, l]) => String(l.nom || "").split(/\s+/).filter((x) => x.length >= 3 && !/^interlocuteur$|^\d+$/i.test(x)).map((x) => [x.toLowerCase(), l.nom]));
  for (const s of segments) {
    const liste = phrases(s.texte);
    for (let k = 0; k < liste.length; k++) {
      let p = liste[k];
      // « Décision : » suivi de la phrase qui la précise
      if (/^d[ée]cision\s*[.:]?$/i.test(p) && liste[k + 1]) { decisions.push(`${liste[k + 1]} (${nom(s.locuteur)})`); continue; }
      if (RE_DECISION.test(p) && motsDe(p).length >= 4) decisions.push(`${p} (${nom(s.locuteur)})`);
      if (RE_ACTION.test(p)) {
        const cite = prenoms.find(([pr]) => new RegExp(`\\b${pr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(p));
        const responsable = cite ? cite[1] : /\bje\b/i.test(p) ? nom(s.locuteur) : "À désigner";
        const echeance = (RE_ECHEANCE.exec(p) || [])[0] || "Non précisée";
        actions.push({ action: p, responsable, echeance });
      }
    }
  }

  const minutes = Math.max(1, Math.round(duree / 60));
  return {
    resume: `Compte rendu établi automatiquement sans IA, à relire et compléter.\n`
      + `Réunion « ${reunion.titre || "sans titre"} »${reunion.date_reunion ? ` du ${reunion.date_reunion}` : ""}, d'une durée d'environ ${minutes} min, `
      + `avec ${Object.keys(locs).length} participant(s) : ${participants.join(", ")}.`
      + (sujets.length ? `\nPrincipaux sujets abordés : ${sujets.join(", ")}.` : ""),
    points,
    decisions: [...new Set(decisions)].slice(0, 30),
    actions: actions.slice(0, 30),
    automatique: true,
  };
}
