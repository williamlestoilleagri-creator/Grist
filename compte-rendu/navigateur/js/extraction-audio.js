/**
 * Extraction de la piste son, sur le poste, quelle que soit la taille du fichier.
 *  - petits fichiers audio : décodage natif du navigateur ;
 *  - gros fichiers (vidéos, WAV de plusieurs heures, plusieurs Go) : FFmpeg (WebAssembly) lit le fichier
 *    PAR MORCEAUX, directement sur le disque, sans jamais le charger entièrement en mémoire,
 *    et n'en garde que le son en 16 kHz mono (≈ 115 Mo par heure).
 * Résultat : Int16Array (16 kHz, mono).
 */
import { FFmpeg } from "../vendor/ffmpeg/index.js";
import { TAUX } from "./moteur-audio.js";

const SEUIL_DECODAGE_NATIF = 300 * 1048576; // au-delà, extraction par morceaux avec FFmpeg
export const DUREE_MAX_H = 10;

async function decodageNatif(fichier) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: TAUX });
  try {
    const audio = await ctx.decodeAudioData(await fichier.arrayBuffer());
    const sortie = new Int16Array(audio.length);
    const canaux = [...Array(audio.numberOfChannels)].map((_, c) => audio.getChannelData(c));
    for (let i = 0; i < audio.length; i++) {
      let v = 0;
      for (const c of canaux) v += c[i];
      v /= canaux.length;
      sortie[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
    }
    return sortie;
  } finally { ctx.close(); }
}

async function extractionFFmpeg(fichier, progression) {
  const ffmpeg = new FFmpeg();
  const base = new URL("../vendor/", import.meta.url).href;
  await ffmpeg.load({
    coreURL: base + "ffmpeg-core/ffmpeg-core.js",
    wasmURL: base + "ffmpeg-core/ffmpeg-core.wasm",
    classWorkerURL: base + "ffmpeg/worker.js",
  });
  let duree = 0;
  ffmpeg.on("log", ({ message }) => {
    const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message);
    if (d) duree = +d[1] * 3600 + +d[2] * 60 + +d[3];
    const t = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message);
    if (t && duree) progression(Math.min(99, Math.round((100 * (+t[1] * 3600 + +t[2] * 60 + +t[3])) / duree)));
  });
  try {
    // le fichier est « monté » : FFmpeg le lit par morceaux, sans copie en mémoire
    await ffmpeg.createDir("/entree");
    await ffmpeg.mount("WORKERFS", { files: [fichier] }, "/entree");
    const code = await ffmpeg.exec(["-hide_banner", "-i", `/entree/${fichier.name}`, "-vn", "-sn", "-dn",
      "-ac", "1", "-ar", String(TAUX), "-f", "s16le", "-acodec", "pcm_s16le", "/son.pcm"]);
    if (code !== 0) throw new Error("Aucune piste son lisible dans ce fichier.");
    const donnees = await ffmpeg.readFile("/son.pcm");
    if (!donnees.length) throw new Error("Aucune piste son lisible dans ce fichier.");
    return new Int16Array(donnees.buffer, donnees.byteOffset, Math.floor(donnees.byteLength / 2));
  } finally {
    ffmpeg.terminate();
  }
}

export async function extraireAudio(fichier, progression = () => {}) {
  let audio = null;
  if (fichier.size <= SEUIL_DECODAGE_NATIF) {
    try { audio = await decodageNatif(fichier); } catch { audio = null; } // format non géré nativement : FFmpeg
  }
  if (!audio) audio = await extractionFFmpeg(fichier, progression);
  if (!audio.length) throw new Error("Aucun son dans ce fichier.");
  if (audio.length / TAUX > DUREE_MAX_H * 3600) {
    throw new Error(`Enregistrement trop long (${Math.round(audio.length / TAUX / 3600)} h) : la limite est de ${DUREE_MAX_H} h. Découpez-le en plusieurs parties.`);
  }
  return audio;
}

/** Fichier WAV 16 kHz mono (lecture dans l'application, sans conserver l'original volumineux). */
export function enWav(audio) {
  const entete = new DataView(new ArrayBuffer(44));
  const taille = audio.length * 2;
  const ecrire = (o, t) => [...t].forEach((c, i) => entete.setUint8(o + i, c.charCodeAt(0)));
  ecrire(0, "RIFF"); entete.setUint32(4, 36 + taille, true); ecrire(8, "WAVE"); ecrire(12, "fmt ");
  entete.setUint32(16, 16, true); entete.setUint16(20, 1, true); entete.setUint16(22, 1, true);
  entete.setUint32(24, TAUX, true); entete.setUint32(28, TAUX * 2, true); entete.setUint16(32, 2, true); entete.setUint16(34, 16, true);
  ecrire(36, "data"); entete.setUint32(40, taille, true);
  return new Blob([entete, audio], { type: "audio/wav" });
}
