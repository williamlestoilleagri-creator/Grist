/**
 * Stockage local (IndexedDB) : les réunions, l'audio et les comptes rendus restent sur ce poste.
 * Purge automatique selon les durées de conservation choisies.
 */
const BASE = "compte-rendu-reunion";
const VERSION = 1;
let ouverture = null;

function base() {
  ouverture ??= new Promise((ok, ko) => {
    const req = indexedDB.open(BASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("reunions")) db.createObjectStore("reunions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("audio")) db.createObjectStore("audio");
      if (!db.objectStoreNames.contains("journal")) db.createObjectStore("journal", { autoIncrement: true }).createIndex("reunion", "reunion_id");
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
  return ouverture;
}

async function transaction(magasins, mode, fn) {
  const db = await base();
  return new Promise((ok, ko) => {
    const tx = db.transaction(magasins, mode);
    let resultat;
    Promise.resolve(fn(tx)).then((r) => { resultat = r; }, ko);
    tx.oncomplete = () => ok(resultat);
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error || new Error("Transaction annulée"));
  });
}
const req = (r) => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });

export const nouvelId = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""));

export async function enregistrer(reunion) {
  reunion.modifie_le = Date.now() / 1000;
  await transaction(["reunions"], "readwrite", (tx) => req(tx.objectStore("reunions").put(reunion)));
  return reunion;
}
export const lire = (id) => transaction(["reunions"], "readonly", (tx) => req(tx.objectStore("reunions").get(id)));
export async function lister() {
  const toutes = await transaction(["reunions"], "readonly", (tx) => req(tx.objectStore("reunions").getAll()));
  return toutes.sort((a, b) => b.cree_le - a.cree_le);
}
export const enregistrerAudio = (id, blob) => transaction(["audio"], "readwrite", (tx) => req(tx.objectStore("audio").put(blob, id)));
export const lireAudio = (id) => transaction(["audio"], "readonly", (tx) => req(tx.objectStore("audio").get(id)));
export const supprimerAudio = (id) => transaction(["audio"], "readwrite", (tx) => req(tx.objectStore("audio").delete(id)));

export async function supprimer(id) {
  await transaction(["reunions", "audio", "journal"], "readwrite", async (tx) => {
    tx.objectStore("reunions").delete(id);
    tx.objectStore("audio").delete(id);
    const index = tx.objectStore("journal").index("reunion");
    const cles = await req(index.getAllKeys(id));
    for (const c of cles) tx.objectStore("journal").delete(c);
  });
}

export const journaliser = (reunionId, action, detail = "") =>
  transaction(["journal"], "readwrite", (tx) => req(tx.objectStore("journal").add({ horodatage: Date.now() / 1000, reunion_id: reunionId, utilisateur: "ce poste", action, detail: String(detail).slice(0, 500) })));
export async function lireJournal(reunionId) {
  const lignes = await transaction(["journal"], "readonly", (tx) => req(tx.objectStore("journal").index("reunion").getAll(reunionId)));
  return lignes.sort((a, b) => b.horodatage - a.horodatage).slice(0, 200);
}

export async function purger(joursAudio, joursReunion) {
  const maintenant = Date.now() / 1000;
  let audio = 0, reunions = 0;
  for (const r of await lister()) {
    const age = (maintenant - r.cree_le) / 86400;
    if (age > joursReunion) { await supprimer(r.id); reunions++; }
    else if (age > joursAudio && r.audio_disponible) {
      await supprimerAudio(r.id); r.audio_disponible = false; await enregistrer(r);
      await journaliser(r.id, "purge_audio"); audio++;
    }
  }
  return { audio, reunions };
}

// ------------------------------------------------------------------ réglages (clés d'API comprises)
const REGLAGES = "cr-reglages";
const DEFAUT = { retentionAudio: 30, retentionReunion: 365, modeleTranscription: "equilibre", materiel: "auto", lienIa: "https://mistral.ai/fr/", hoteModeles: "" };

export function lireReglages() {
  try { return { ...DEFAUT, ...JSON.parse(localStorage.getItem(REGLAGES) || "{}") }; } catch { return { ...DEFAUT }; }
}
export function ecrireReglages(r) { try { localStorage.setItem(REGLAGES, JSON.stringify(r)); } catch { /* stockage indisponible */ } }

/** Les clés d'API restent sur ce poste : en mémoire de session par défaut, sur le poste si l'utilisateur le demande. */
export function lireCle(code) {
  try { return sessionStorage.getItem(`cr-cle-${code}`) || localStorage.getItem(`cr-cle-${code}`) || ""; } catch { return ""; }
}
export function ecrireCle(code, cle, memoriser) {
  try {
    sessionStorage.removeItem(`cr-cle-${code}`); localStorage.removeItem(`cr-cle-${code}`);
    if (cle) (memoriser ? localStorage : sessionStorage).setItem(`cr-cle-${code}`, cle);
  } catch { /* stockage indisponible */ }
}
export function cleMemorisee(code) { try { return !!localStorage.getItem(`cr-cle-${code}`); } catch { return false; } }
