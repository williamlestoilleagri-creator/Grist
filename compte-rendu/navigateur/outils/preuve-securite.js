/**
 * Preuve de sécurité reproductible : trace TOUTES les requêtes réseau du navigateur pendant
 * une utilisation complète, puis contrôle le stockage local et son effacement.
 *
 * Prérequis : Node.js et Playwright (npm i playwright ; npx playwright install chromium).
 * Usage :
 *   1. servir le dossier navigateur/ :   python3 -m http.server 8099 --bind 127.0.0.1
 *   2. node outils/preuve-securite.js http://127.0.0.1:8099/ chemin/vers/reunion.mp3 [local|huggingface]
 *
 * Le navigateur est lancé SANS accès à Internet en mode « local » : toute tentative de connexion
 * externe apparaîtrait dans le rapport (et échouerait).
 */
const { chromium } = require("playwright");

(async () => {
  const [url = "http://127.0.0.1:8099/", audio, source = "local"] = process.argv.slice(2);
  if (!audio) { console.error("Usage : node outils/preuve-securite.js <url> <fichier audio> [local|huggingface]"); process.exit(2); }
  const origine = new URL(url).origin;
  const options = {};
  if (source === "huggingface" && process.env.HTTPS_PROXY) options.proxy = { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" };
  const navigateur = await chromium.launch(options);
  const contexte = await navigateur.newContext({ acceptDownloads: true });

  // Configuration de déploiement testée (mode éphémère, IA hors UE désactivée)
  await contexte.route("**/config.js", (r) => r.fulfill({ contentType: "application/javascript", body:
    `window.CR_CONFIG = Object.freeze({ conservation: "ephemere", sourceModeles: "${source}", iaAutorisees: ["mistral", "ollama"], memoriserClesAutorise: false });` }));

  const requetes = [];
  contexte.on("request", (r) => requetes.push({ methode: r.method(), url: r.url(), corps: r.postData() ? r.postData().length : 0 }));
  const erreurs = [];
  const page = await contexte.newPage();
  page.on("pageerror", (e) => erreurs.push(e.message));

  const etape = (t) => console.log(`- ${t}`);
  etape("ouverture de l'application");
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem("cr-reglages", JSON.stringify({ modeleTranscription: "rapide", materiel: "wasm" })));
  await page.goto(url + "#/");
  await page.waitForSelector("#form-nouvelle");

  etape("dépôt et transcription de la réunion");
  await page.setInputFiles("#fichier", audio);
  await page.fill("#titre", "Réunion de test sécurité");
  await page.check("#info", { force: true });
  await page.click("#btn-envoyer");
  await page.waitForSelector('button[data-action="analyse-locale"]', { timeout: 30 * 60 * 1000 });
  await page.waitForTimeout(1500);

  etape("tentative d'utilisation d'une IA hors UE (doit être refusée)");
  await page.click(".cr-option-ia summary");
  await page.fill("#lien-ia", "https://claude.ai");
  await page.waitForTimeout(800);
  const refusHorsUE = (await page.innerText("#ia-resolu")).trim();

  etape("corrections et téléchargements");
  await page.click("#onglet-interlocuteurs");
  await page.fill("#nom-L1", "Personne Test");
  await page.click('form[data-form-locuteur="L1"] button[type=submit]');
  await page.waitForTimeout(500);
  await page.click("#onglet-telecharger");
  const fichiers = [];
  for (const doc of ["compte-rendu", "verification", "transcription"]) {
    await page.check(`#doc-${doc}`, { force: true });
    for (const f of ["docx", "pdf", "odt", "txt", "md"]) {
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click(`button[data-telecharger="${f}"]`)]);
      fichiers.push(`${doc}.${f}`); await dl.path();
    }
  }

  const contenuStockage = async (p) => p.evaluate(async () => {
    const db = await new Promise((ok) => { const r = indexedDB.open("compte-rendu-reunion"); r.onsuccess = () => ok(r.result); });
    const compter = (n) => new Promise((ok) => { const r = db.transaction(n).objectStore(n).count(); r.onsuccess = () => ok(r.result); });
    const res = { reunions: await compter("reunions"), audio: await compter("audio"), journal: await compter("journal"),
      cles_localStorage: Object.keys(localStorage).filter((k) => k.startsWith("cr-cle-")).length, cookies: document.cookie.length };
    db.close(); return res;
  });
  etape("contrôle du stockage pendant la session");
  const pendant = await contenuStockage(page);

  etape("fermeture de l'onglet puis nouvelle session (mode éphémère)");
  await page.close();
  const page2 = await contexte.newPage();
  await page2.goto(url);
  await page2.waitForSelector("#form-nouvelle");
  await page2.waitForTimeout(800);
  const apres = await contenuStockage(page2);

  const externes = requetes.filter((r) => !r.url.startsWith(origine) && !r.url.startsWith("blob:") && !r.url.startsWith("data:"));
  const envois = requetes.filter((r) => r.methode !== "GET");
  const rapport = {
    date: new Date().toISOString(), source_des_modeles: source,
    requetes_total: requetes.length,
    hotes_contactes: [...new Set(requetes.filter((r) => /^https?:/.test(r.url)).map((r) => new URL(r.url).host))],
    requetes_externes: externes.length,
    requetes_externes_methodes: [...new Set(externes.map((r) => r.methode))],
    envois_de_donnees_non_GET: envois.map((r) => `${r.methode} ${r.url} (${r.corps} octets)`),
    refus_ia_hors_ue: refusHorsUE,
    fichiers_telecharges: fichiers.length,
    stockage_pendant_la_session: pendant,
    stockage_apres_nouvelle_session: apres,
    erreurs_javascript: erreurs,
  };
  console.log(JSON.stringify(rapport, null, 2));
  await navigateur.close();
})();
