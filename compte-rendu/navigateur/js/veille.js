/**
 * Pour que le calcul continue quand l'utilisateur n'est pas devant son poste :
 *  - empêche la mise en veille de l'écran (et donc du poste) tant que l'onglet est affiché (Screen Wake Lock) ;
 *  - signale au navigateur qu'un travail est en cours (Web Locks), ce qui le dissuade de mettre l'onglet en sommeil ;
 *  - prévient par une notification à la fin du traitement (sans le titre ni le contenu de la réunion) ;
 * Si le poste se met malgré tout en veille, la reprise automatique repart là où le calcul s'était arrêté.
 */
let actif = false;
let verrouEcran = null;
let libererTravail = null;

async function demanderEcran() {
  if (!actif || verrouEcran || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try {
    verrouEcran = await navigator.wakeLock.request("screen");
    verrouEcran.addEventListener("release", () => { verrouEcran = null; });
  } catch { /* refusé (batterie faible, navigateur) : le calcul continue tant que le poste reste éveillé */ }
}

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") demanderEcran(); });

export function maintenirEveille(oui) {
  if (oui === actif) return;
  actif = oui;
  if (oui) {
    if (navigator.locks && !libererTravail) {
      navigator.locks.request("cr-traitement-en-cours", () => new Promise((fin) => { if (actif) libererTravail = fin; else fin(); })).catch(() => {});
    }
    demanderEcran();
  } else {
    libererTravail?.(); libererTravail = null;
    verrouEcran?.release().catch(() => {}); verrouEcran = null;
  }
}

export const veilleBloquee = () => !!verrouEcran;

/** À appeler lors d'un clic (le navigateur n'accepte la demande qu'après une action de l'utilisateur). */
export async function demanderNotifications() {
  if (!("Notification" in window) || Notification.permission !== "default") return;
  try { await Notification.requestPermission(); } catch { /* refusé */ }
}

/** Notification volontairement générique : ni titre ni contenu de réunion (affichable sur l'écran verrouillé). */
export function notifierFin(reussi) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification("Compte rendu de réunion", {
      body: reussi ? "Le traitement de votre réunion est terminé." : "Le traitement de votre réunion s'est interrompu : ouvrez l'application.",
      icon: new URL("../dsfr/favicon/favicon.svg", import.meta.url).href,
      tag: "cr-traitement",
    });
  } catch { /* notifications indisponibles */ }
}
