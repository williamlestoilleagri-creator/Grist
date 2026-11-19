// Service worker : permet d'utiliser la calculette hors connexion (au champ).
// Le backoffice (admin/) et les appels au serveur ne sont jamais mis en cache.
const CACHE = "calculette-gren-v4";
const FILES = ["./", "index.html", "app.js", "config.js", "referentiel-defaut.js", "lib/xlsx-mini.js", "manifest.webmanifest",
  "dsfr/dsfr.min.css", "dsfr/icons.css", "dsfr/dsfr.module.min.js", "dsfr/dsfr.nomodule.min.js",
  "dsfr/fonts/Marianne-Regular.woff2", "dsfr/fonts/Marianne-Bold.woff2", "dsfr/fonts/Marianne-Medium.woff2", "dsfr/fonts/Marianne-Light.woff2",
  "dsfr/favicon/favicon.svg", "dsfr/favicon/apple-touch-icon.png",
  "lib/jspdf-4.2.1.umd.min.js", "lib/jspdf-autotable-5.0.8.min.js", "lib/marianne-pdf.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.includes("/admin/")) return;
  // Réseau d'abord (pour recevoir les mises à jour), cache en secours
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
