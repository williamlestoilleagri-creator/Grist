/*
 * Isolation de la page (en-têtes COOP / COEP) quand le serveur ne peut pas les envoyer (ex. GitHub Pages).
 * Seul effet : autoriser le calcul sur PLUSIEURS cœurs du processeur (transcription bien plus rapide).
 * Ce script ne met rien en cache, ne lit aucune donnée et ne contacte aucun serveur :
 * il ajoute seulement deux en-têtes aux fichiers de l'application elle-même.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const requete = e.request;
  if (new URL(requete.url).origin !== self.location.origin) return; // autres sites : non concernés
  if (requete.cache === "only-if-cached" && requete.mode !== "same-origin") return;
  e.respondWith(fetch(requete).then((reponse) => {
    if (reponse.status === 0 || reponse.type === "opaqueredirect") return reponse;
    const entetes = new Headers(reponse.headers);
    entetes.set("Cross-Origin-Opener-Policy", "same-origin");
    entetes.set("Cross-Origin-Embedder-Policy", "require-corp");
    entetes.set("Cross-Origin-Resource-Policy", "same-origin");
    return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: entetes });
  }));
});
