/**
 * Moteur audio exécuté entièrement sur le poste de l'utilisateur :
 *  - séparation des voix : pyannote-segmentation-3.0 + empreinte WeSpeaker + regroupement (même principe que pyannote 3.1) ;
 *  - transcription : Whisper.
 * Aucun son ne quitte l'ordinateur. Les empreintes vocales ne servent qu'au calcul et ne sont jamais enregistrées.
 *
 * Le module reçoit la bibliothèque transformers.js en paramètre (T) : il fonctionne dans un Web Worker comme sous Node (tests).
 */

export const TAUX = 16000;

export const MODELES_TRANSCRIPTION = {
  // variantes « _timestamped » : horodatage de chaque mot, nécessaire pour attribuer les mots aux voix
  rapide: { id: "onnx-community/whisper-base_timestamped", nom: "Rapide (whisper-base, ~80 Mo)" },
  equilibre: { id: "onnx-community/whisper-small_timestamped", nom: "Équilibré (whisper-small, ~250 Mo)" },
  precis: { id: "onnx-community/whisper-large-v3-turbo_timestamped", nom: "Précis (whisper-large-v3-turbo, ~600 Mo, carte graphique conseillée)" },
};
export const MODELE_SEGMENTATION = "onnx-community/pyannote-segmentation-3.0";
export const MODELE_EMPREINTE = "onnx-community/wespeaker-voxceleb-resnet34-LM";

const FENETRE_S = 10; // le modèle de segmentation est entraîné sur des fenêtres de 10 s
const DUREE_MIN_EMPREINTE_S = 0.6;

// ------------------------------------------------------------------ outils
function cosinus(a, b) {
  let p = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { p += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return p / (Math.sqrt(na * nb) || 1);
}

/**
 * Regroupement hiérarchique ascendant (lien moyen, similarité cosinus).
 * S'arrête quand le nombre de groupes demandé est atteint, ou quand plus aucune paire ne dépasse le seuil.
 */
export function regrouper(empreintes, poids, { nombre = null, seuil = 0.5 } = {}) {
  let groupes = empreintes.map((_, i) => [i]);
  const sim = empreintes.map((a) => empreintes.map((b) => cosinus(a, b)));
  const simGroupes = (g1, g2) => {
    let s = 0, w = 0;
    for (const i of g1) for (const j of g2) { const p = poids[i] * poids[j]; s += sim[i][j] * p; w += p; }
    return s / (w || 1);
  };
  while (groupes.length > 1) {
    if (nombre && groupes.length <= nombre) break;
    let meilleur = -Infinity, bi = -1, bj = -1;
    for (let i = 0; i < groupes.length; i++) {
      for (let j = i + 1; j < groupes.length; j++) {
        const s = simGroupes(groupes[i], groupes[j]);
        if (s > meilleur) { meilleur = s; bi = i; bj = j; }
      }
    }
    if (!nombre && meilleur < seuil) break;
    groupes[bi] = groupes[bi].concat(groupes[bj]);
    groupes.splice(bj, 1);
  }
  // une « voix » qui ne parle presque pas est en général un fragment mal reconnu :
  // elle est rattachée à la voix principale la plus ressemblante
  if (!nombre && groupes.length > 1) {
    const duree = (g) => g.reduce((n, i) => n + poids[i], 0);
    const total = poids.reduce((a, b) => a + b, 0);
    const minimum = Math.max(2, 0.03 * total);
    const grands = groupes.filter((g) => duree(g) >= minimum);
    if (grands.length) {
      for (const petit of groupes.filter((g) => duree(g) < minimum)) {
        let cible = grands[0], meilleur = -Infinity;
        for (const g of grands) { const s = simGroupes(petit, g); if (s > meilleur) { meilleur = s; cible = g; } }
        cible.push(...petit);
      }
      groupes = grands;
    }
  }
  const etiquettes = new Array(empreintes.length);
  groupes.forEach((g, k) => g.forEach((i) => { etiquettes[i] = k; }));
  return etiquettes;
}

// ------------------------------------------------------------------ séparation des voix
export async function separerVoix(T, audio, options = {}, progression = () => {}) {
  const { device = "wasm", nombre = null, seuil = 0.5 } = options;
  const segProc = await T.AutoProcessor.from_pretrained(MODELE_SEGMENTATION);
  const segModele = await T.AutoModelForAudioFrameClassification.from_pretrained(MODELE_SEGMENTATION, { device, dtype: "fp32" });
  const empExtracteur = await T.AutoFeatureExtractor.from_pretrained(MODELE_EMPREINTE);
  const empModele = await T.AutoModel.from_pretrained(MODELE_EMPREINTE, { device, dtype: "fp32" });

  const taille = FENETRE_S * TAUX;
  const nbFenetres = Math.max(1, Math.ceil(audio.length / taille));
  const locaux = []; // { debut, fin, fenetre, local }
  const empreintes = [], poids = [], cles = [];

  for (let f = 0; f < nbFenetres; f++) {
    const decalage = f * taille;
    const fenetre = audio.subarray(decalage, Math.min(audio.length, decalage + taille));
    if (fenetre.length < TAUX * 0.5) continue;
    const entrees = await segProc(fenetre);
    const { logits } = await segModele(entrees);
    const resultats = segProc.post_process_speaker_diarization(logits, fenetre.length)[0];

    // id 0 = silence ; les autres identifiants sont des voix locales à la fenêtre
    const parLocal = new Map();
    for (const r of resultats) {
      const libelle = segModele.config.id2label?.[r.id] ?? String(r.id);
      if (r.id === 0 || /^no[-_ ]?speech|^silence/i.test(libelle)) continue;
      // les classes « chevauchement » (ex. « SPEAKER_0+SPEAKER_1 ») sont rattachées au premier locuteur
      const local = String(libelle).split("+")[0];
      const seg = { debut: decalage / TAUX + r.start, fin: decalage / TAUX + r.end, fenetre: f, local };
      locaux.push(seg);
      if (!parLocal.has(local)) parLocal.set(local, []);
      parLocal.get(local).push(seg);
    }

    for (const [local, segs] of parLocal) {
      const morceaux = segs.map((s) => audio.subarray(Math.floor(s.debut * TAUX), Math.ceil(s.fin * TAUX)));
      const longueur = morceaux.reduce((n, m) => n + m.length, 0);
      if (longueur < DUREE_MIN_EMPREINTE_S * TAUX) continue;
      const voix = new Float32Array(longueur);
      let o = 0;
      for (const m of morceaux) { voix.set(m, o); o += m.length; }
      const sortie = await empModele(await empExtracteur(voix));
      const tenseur = sortie.embeddings ?? sortie.last_hidden_state ?? Object.values(sortie)[0];
      empreintes.push(Array.from(tenseur.data));
      poids.push(longueur / TAUX);
      cles.push(`${f}|${local}`);
    }
    progression({ etape: "voix", fait: f + 1, total: nbFenetres });
  }

  if (!empreintes.length) return [];
  const etiquettes = regrouper(empreintes, poids, { nombre, seuil });
  const globalPour = new Map(cles.map((c, i) => [c, etiquettes[i]]));

  // voix trop brève pour une empreinte : rattachée à la voix globale la plus proche dans le temps
  const tours = locaux
    .map((s) => ({ ...s, voix: globalPour.get(`${s.fenetre}|${s.local}`) }))
    .sort((a, b) => a.debut - b.debut);
  for (let i = 0; i < tours.length; i++) {
    if (tours[i].voix !== undefined) continue;
    const avant = tours.slice(0, i).reverse().find((t) => t.voix !== undefined);
    const apres = tours.slice(i + 1).find((t) => t.voix !== undefined);
    tours[i].voix = (avant ?? apres)?.voix ?? 0;
  }

  // fusion des tours consécutifs d'une même voix
  const fusion = [];
  for (const t of tours) {
    const der = fusion.at(-1);
    if (der && der.voix === t.voix && t.debut - der.fin < 0.6) der.fin = Math.max(der.fin, t.fin);
    else fusion.push({ debut: t.debut, fin: t.fin, voix: t.voix });
  }
  return fusion;
}

// ------------------------------------------------------------------ transcription
export async function transcrire(T, audio, options = {}, progression = () => {}) {
  const { modele = "equilibre", device = "wasm", langue = "french" } = options;
  const choix = MODELES_TRANSCRIPTION[modele] ?? MODELES_TRANSCRIPTION.equilibre;
  const dtype = device === "webgpu"
    ? { encoder_model: "fp16", decoder_model_merged: "q4" }
    : { encoder_model: "q8", decoder_model_merged: "q8" };
  const asr = await T.pipeline("automatic-speech-recognition", choix.id, { device, dtype });

  // découpage en blocs de 5 min pour suivre l'avancement et limiter la mémoire
  const bloc = 300 * TAUX;
  const morceaux = [];
  const total = Math.ceil(audio.length / bloc);
  for (let b = 0; b < total; b++) {
    const debut = b * bloc;
    const extrait = audio.subarray(debut, Math.min(audio.length, debut + bloc));
    const res = await asr(extrait, { ...(langue ? { language: langue } : {}), task: "transcribe", return_timestamps: "word", chunk_length_s: 30, stride_length_s: 5 });
    for (const c of res.chunks ?? [{ text: res.text, timestamp: [0, extrait.length / TAUX] }]) {
      const [d, f] = c.timestamp;
      const texte = c.text || "";
      if (!texte.trim()) continue;
      morceaux.push({ debut: debut / TAUX + (d ?? 0), fin: debut / TAUX + (f ?? d ?? 0), texte });
    }
    progression({ etape: "texte", fait: b + 1, total });
  }
  return morceaux;
}

// ------------------------------------------------------------------ assemblage
function voixDominante(debut, fin, tours) {
  const duree = new Map();
  for (const t of tours) {
    const r = Math.min(fin, t.fin) - Math.max(debut, t.debut);
    if (r > 0) duree.set(t.voix, (duree.get(t.voix) || 0) + r);
  }
  if (duree.size) return [...duree.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const milieu = (debut + fin) / 2;
  let proche = null, ecart = Infinity;
  for (const t of tours) {
    const e = Math.min(Math.abs(milieu - t.debut), Math.abs(milieu - t.fin));
    if (e < ecart) { ecart = e; proche = t.voix; }
  }
  return proche ?? 0;
}

export function assembler(morceaux, tours) {
  // 1. voix de chaque morceau de texte
  const attribues = morceaux.map((m) => ({ ...m, voix: voixDominante(m.debut, m.fin, tours) }));
  // 2. numérotation des voix dans l'ordre de première prise de parole : L1, L2…
  const codes = new Map();
  for (const m of attribues) if (!codes.has(m.voix)) codes.set(m.voix, `L${codes.size + 1}`);
  // 3. regroupement des mots en interventions (changement de voix, pause > 2 s, ou phrase finie après 30 s)
  const segments = [];
  for (const m of attribues) {
    const code = codes.get(m.voix);
    const der = segments.at(-1);
    const finPhrase = der && /[.?!…]\s*$/.test(der.texte) && der.fin - der.debut > 30;
    if (der && der.locuteur === code && m.debut - der.fin < 2 && !finPhrase) {
      der.texte += m.texte; der.fin = m.fin;
    } else segments.push({ debut: m.debut, fin: m.fin, locuteur: code, texte: m.texte });
  }
  segments.forEach((s, i) => { s.id = `s${i + 1}`; s.texte = s.texte.replace(/\s+/g, " ").trim(); s.confiance_audio = null; });
  const locuteurs = {};
  for (const code of codes.values()) locuteurs[code] = { nom: `Interlocuteur ${code.slice(1)}`, fonction: "" };
  return { segments, locuteurs };
}

export async function traiterReunion(T, audio, options = {}, progression = () => {}) {
  progression({ etape: "voix", fait: 0, total: 1 });
  const tours = await separerVoix(T, audio, options, progression);
  progression({ etape: "texte", fait: 0, total: 1 });
  const morceaux = await transcrire(T, audio, options, progression);
  return { duree: audio.length / TAUX, ...assembler(morceaux, tours) };
}
