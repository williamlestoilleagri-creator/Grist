/* Traitement audio en arrière-plan (Web Worker) : la page reste utilisable pendant le calcul. */
import * as T from "../vendor/transformers.min.js";
import { traiterReunion } from "./moteur-audio.js";

// Moteur d'exécution des modèles servi depuis ce site (pas de CDN tiers)
T.env.backends.onnx.wasm.wasmPaths = new URL("../vendor/", import.meta.url).href;
T.env.allowLocalModels = false;
T.env.useBrowserCache = true; // modèles téléchargés une seule fois, puis conservés par le navigateur

async function choisirMateriel(prefere) {
  if (prefere === "wasm") return "wasm";
  try {
    if (self.navigator.gpu && (await self.navigator.gpu.requestAdapter())) return "webgpu";
  } catch { /* pas de carte graphique utilisable */ }
  return "wasm";
}

self.onmessage = async ({ data }) => {
  if (data.type !== "traiter") return;
  try {
    if (data.sourceModeles === "local") {
      // modèles hébergés avec l'application (dossier modeles/) : aucune connexion externe
      T.env.allowRemoteModels = false;
      T.env.allowLocalModels = true;
      // chemin sans le nom du serveur : avec une adresse complète, transformers.js ne vérifie pas
      // la présence des fichiers du tokenizer et la transcription échoue
      T.env.localModelPath = new URL("../modeles/", import.meta.url).pathname;
    }
    // calcul sur plusieurs cœurs quand la page est isolée (voir sw-isolation.js)
    if (self.crossOriginIsolated) T.env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(8, (self.navigator.hardwareConcurrency || 4) - 1));
    const device = await choisirMateriel(data.materiel);
    // modèle automatique : « équilibré » avec une carte graphique, « rapide » sur processeur
    const reprise = data.reprise || {};
    const modele = reprise.modele || (data.modele && data.modele !== "auto" ? data.modele : device === "webgpu" ? "equilibre" : "rapide");
    self.postMessage({ type: "info", device, modele, coeurs: self.crossOriginIsolated ? T.env.backends.onnx.wasm.numThreads : 1 });

    // progression des téléchargements de modèles
    const fichiers = new Map();
    const telechargement = (p) => {
      if (p.status === "progress" && p.file) {
        fichiers.set(p.name + "/" + p.file, { charge: p.loaded || 0, total: p.total || 0 });
        let charge = 0, total = 0;
        for (const f of fichiers.values()) { charge += f.charge; total += f.total; }
        self.postMessage({ type: "telechargement", charge, total });
      }
    };
    const pipelineOrigine = T.pipeline;
    const T2 = new Proxy(T, {
      get(cible, nom) {
        const valeur = cible[nom];
        if (nom === "pipeline") return (tache, modele, opts = {}) => pipelineOrigine(tache, modele, { ...opts, progress_callback: telechargement });
        if (valeur && typeof valeur.from_pretrained === "function") {
          return new Proxy(valeur, { get(c, n) { return n === "from_pretrained" ? (id, o = {}) => c.from_pretrained(id, { ...o, progress_callback: telechargement }) : c[n]; } });
        }
        return valeur;
      },
    });

    const resultat = await traiterReunion(T2, data.audio, {
      device, modele, nombre: data.nombre || null, langue: data.langue || "french",
    }, (p) => self.postMessage({ type: "progression", ...p }), reprise,
      (partiel) => self.postMessage({ type: "partiel", modele, ...partiel }));
    self.postMessage({ type: "termine", resultat });
  } catch (e) {
    self.postMessage({ type: "erreur", message: String(e && e.message || e) });
  }
};
