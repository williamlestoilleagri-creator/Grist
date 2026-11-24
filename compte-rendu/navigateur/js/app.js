/* Compte rendu de réunion — version navigateur : tout le traitement s'effectue sur ce poste. */
import { api as apiLocale, demarrer } from "./api-locale.js";
import { demanderNotifications, veilleBloquee } from "./veille.js";

// Protection contre l'intégration dans un cadre d'un autre site (détournement de clic)
if (window.top !== window.self) {
  document.body.innerHTML = "<p>Pour votre sécurité, cette application ne peut pas être affichée dans un cadre.</p>";
  throw new Error("Affichage dans un cadre refusé");
}

(() => {
  const $app = document.getElementById("app");
  const etat = { config: null, reunion: null, onglet: "transcription", filtre: "tous", edition: null, minuteur: null,
                 ia: null, lienIa: "", audioUrl: null, audioPour: null };
  const EN_COURS = new Set(["en_attente", "transcription", "analyse"]);
  const STATUTS = {
    en_attente: ["En file d'attente", "info"], transcription: ["Transcription en cours", "info"],
    transcrit: ["Transcrit — à analyser", "new"], analyse: ["Analyse en cours", "info"],
    analyse_terminee: ["Analysé", "success"], erreur: ["Erreur", "error"],
  };
  const PALETTE = ["#000091", "#c9191e", "#18753c", "#b34000", "#6e445a", "#009099", "#716043", "#a558a0", "#3558a2", "#7d4e5b"];

  // ------------------------------------------------------------ utilitaires
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hms = (s) => { s = Math.floor(s || 0); return [s / 3600, (s % 3600) / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":"); };
  const dateFr = (ts) => ts ? new Date(ts * 1000).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "";

  /** Code couleur : 100 % vert → jaune → orange → 0 % rouge (teinte HSL 120° → 0°). */
  function couleurs(score) {
    if (score == null) return { trait: "#929292", fond: "#eeeeee", texte: "#3a3a3a" };
    const h = Math.max(0, Math.min(100, score)) * 1.2;
    return { trait: `hsl(${h} 85% 42%)`, fond: `hsl(${h} 85% 92%)`, texte: `hsl(${h} 90% 20%)` };
  }
  function libelle(score) {
    if (score == null) return "Non analysé";
    if (score >= 85) return "Cohérent";
    if (score >= 60) return "À vérifier";
    if (score >= 35) return "Douteux";
    return "Incohérent";
  }
  const varsCouleur = (score) => { const c = couleurs(score); return `--cr-trait:${c.trait};--cr-fond:${c.fond};--cr-texte:${c.texte}`; };
  const badgeScore = (score, prefixe = "") =>
    `<span class="cr-score" style="${varsCouleur(score)}">${esc(prefixe)}${score == null ? "–" : score + " %"} · ${libelle(score)}</span>`;
  const scoreSeg = (s) => (s.valide ? 100 : s.score);
  const couleurLocuteur = (code) => PALETTE[(parseInt(String(code).replace(/\D/g, ""), 10) - 1 || 0) % PALETTE.length];

  function notifier(message, type = "success") {
    const zone = document.getElementById("notifications");
    const el = document.createElement("div");
    el.className = `fr-alert fr-alert--${type} fr-alert--sm`;
    el.innerHTML = `<p>${esc(message)}</p>`;
    zone.appendChild(el);
    setTimeout(() => el.remove(), type === "error" ? 9000 : 4000);
  }

  const api = (methode, url, corps) => apiLocale(methode, url, corps);
  const pret = demarrer().catch(() => {});

  // ------------------------------------------------------------ routage
  async function router() {
    await pret; // le nettoyage du mode éphémère doit être terminé avant tout affichage
    clearTimeout(etat.minuteur);
    const h = location.hash || "#/";
    try {
      if (!etat.config) etat.config = await api("GET", "/api/config");
      const m = h.match(/^#\/reunion\/([0-9a-f]{32})/);
      if (m) {
        if (!etat.reunion || etat.reunion.id !== m[1]) { etat.onglet = "transcription"; etat.edition = null; etat.filtre = "tous"; }
        await chargerReunion(m[1]);
      } else if (h.startsWith("#/aide")) pageAide();
      else if (h.startsWith("#/reglages")) pageReglages();
      else await pageAccueil();
    } catch (e) {
      $app.innerHTML = `<div class="fr-alert fr-alert--error"><h2 class="fr-alert__title">Erreur</h2><p>${esc(e.message)}</p></div>`;
    }
  }
  window.addEventListener("hashchange", router);

  // ------------------------------------------------------------ accueil
  async function pageAccueil() {
    document.title = "Accueil — Compte rendu de réunion";
    const reunions = await api("GET", "/api/reunions");
    const c = etat.config;
    $app.innerHTML = `
      <h1>Compte rendu de réunion</h1>
      ${c.demo ? `<div class="fr-notice fr-notice--info fr-mb-3w"><div class="fr-container"><div class="fr-notice__body"><p class="fr-notice__title">Mode démonstration : la transcription et l'analyse sont fictives. Choisissez l'IA « Démonstration » pour tester.</p></div></div></div>` : ""}
      ${/\.github\.io$/i.test(location.hostname) ? `<div class="fr-alert fr-alert--warning fr-mb-3w"><h2 class="fr-alert__title">Adresse de démonstration</h2>
        <p>Cette adresse publique est partagée avec d'autres applications : utilisez-la pour essayer l'outil, pas pour de vraies réunions.
          Pour un usage en service, l'application doit être installée sur un serveur interne (voir le diagnostic de sécurité).</p></div>` : ""}
      <div class="fr-callout fr-icon-lock-line fr-mb-4w">
        <h2 class="fr-callout__title fr-h5">Tout se passe sur votre ordinateur</h2>
        <p class="fr-callout__text fr-text--md">L'enregistrement est transcrit et les voix sont séparées <strong>dans ce navigateur</strong> : l'audio n'est envoyé nulle part.
          Seul le texte est transmis à l'IA que vous choisissez pour l'analyse de cohérence. Les réunions sont conservées sur ce poste uniquement.</p>
        ${c.ephemere ? `<p class="fr-callout__text fr-text--md"><strong>Mode éphémère</strong> : rien n'est conservé. Tout est effacé à la fermeture du navigateur —
          <strong>téléchargez vos documents avant de fermer</strong>.</p>` : ""}
        <p class="cr-mention fr-mb-0">Première utilisation : les modèles (quelques centaines de Mo) sont ${c.deploiement.sourceModeles === "local" ? "chargés depuis le serveur de l'application" : "téléchargés une fois"} puis gardés par le navigateur.
          Navigateur conseillé : Chrome ou Edge récent. <a href="#/reglages">Réglages</a></p>
      </div>
      <div class="fr-grid-row fr-grid-row--gutters">
        <div class="fr-col-12 fr-col-lg-5">
          <form class="cr-panneau" id="form-nouvelle">
            <h2 class="fr-h4">Nouvelle réunion</h2>
            <div class="fr-upload-group fr-mb-3w">
              <label class="fr-label" for="fichier">Enregistrement audio
                <span class="fr-hint-text">Audio ou vidéo, sans limite de taille (seul le son est extrait, sur ce poste). Durée maximale : ${c.duree_max_h} h.
                  Formats : mp3, wav, m4a, ogg, flac, aac, mp4, mov, mkv, avi, webm…</span></label>
              <input class="fr-upload" type="file" id="fichier" name="fichier" accept="audio/*,video/*,.m4a,.opus,.mkv,.mts" required>
            </div>
            <div class="fr-input-group"><label class="fr-label" for="titre">Titre de la réunion</label>
              <input class="fr-input" id="titre" name="titre" maxlength="200" autocomplete="off"></div>
            <div class="fr-grid-row fr-grid-row--gutters">
              <div class="fr-col-6"><div class="fr-input-group"><label class="fr-label" for="date">Date</label>
                <input class="fr-input" type="date" id="date" name="date_reunion"></div></div>
              <div class="fr-col-6"><div class="fr-input-group"><label class="fr-label" for="nb">Nombre d'interlocuteurs
                <span class="fr-hint-text">Facultatif, améliore la séparation des voix</span></label>
                <input class="fr-input" type="number" min="1" max="30" id="nb" name="nb_locuteurs"></div></div>
            </div>
            <div class="fr-checkbox-group fr-mb-3w">
              <input type="checkbox" id="info" name="information_participants" value="true" required>
              <label class="fr-label" for="info">J'atteste que les participants ont été informés de l'enregistrement et de son traitement automatisé
                <span class="fr-hint-text">Obligation d'information (RGPD, art. 13). ${c.ephemere ? "Données effacées à la fermeture du navigateur." : `Audio conservé ${c.retention_audio_jours} jours, réunion ${c.retention_reunion_jours} jours.`}</span></label>
            </div>
            <button class="fr-btn fr-icon-upload-line fr-btn--icon-left" type="submit" id="btn-envoyer">Transcrire sur ce poste</button>
            <p class="fr-mention cr-mention fr-mt-2w" id="envoi-etat" aria-live="polite"></p>
          </form>
        </div>
        <div class="fr-col-12 fr-col-lg-7">
          <h2 class="fr-h4">Réunions</h2>
          ${reunions.length ? `
          <div class="fr-table fr-table--no-caption"><div class="fr-table__wrapper"><div class="fr-table__container"><div class="fr-table__content">
          <table><caption>Liste des réunions</caption>
            <thead><tr><th scope="col">Réunion</th><th scope="col">Statut</th><th scope="col">Fiabilité</th><th scope="col">Créée le</th></tr></thead>
            <tbody>${reunions.map((r) => `<tr>
              <td><a href="#/reunion/${r.id}">${esc(r.titre)}</a>${r.date_reunion ? `<br><span class="cr-mention">${esc(r.date_reunion)}</span>` : ""}</td>
              <td>${badgeStatut(r.statut)}</td>
              <td>${r.score_global != null ? badgeScore(r.score_global) : "–"}</td>
              <td>${dateFr(r.cree_le)}</td></tr>`).join("")}</tbody>
          </table></div></div></div></div>` : `<p>Aucune réunion pour le moment.</p>`}
        </div>
      </div>`;

    document.getElementById("form-nouvelle").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const donnees = new FormData(form);
      if (!donnees.get("nb_locuteurs")) donnees.delete("nb_locuteurs");
      demanderNotifications(); // pour prévenir à la fin du traitement, même en votre absence
      const bouton = document.getElementById("btn-envoyer");
      bouton.disabled = true;
      document.getElementById("envoi-etat").textContent = "Enregistrement du fichier…";
      try {
        const r = await api("POST", "/api/reunions", donnees);
        location.hash = `#/reunion/${r.id}`;
      } catch (err) {
        notifier(err.message, "error");
        document.getElementById("envoi-etat").textContent = "";
        bouton.disabled = false;
      }
    });
  }

  function badgeStatut(statut) {
    const [texte, type] = STATUTS[statut] || [statut, "info"];
    return `<p class="fr-badge fr-badge--sm fr-badge--${type}">${esc(texte)}</p>`;
  }

  // ------------------------------------------------------------ réunion
  async function chargerReunion(id) {
    etat.reunion = await api("GET", `/api/reunions/${id}`);
    afficherReunion();
    if (EN_COURS.has(etat.reunion.statut)) etat.minuteur = setTimeout(() => chargerReunion(id).catch(() => {}), 2000);
  }

  function statistiques(r) {
    const segs = r.segments || [];
    const ouvertes = segs.reduce((n, s) => n + (s.incoherences || []).filter((i) => i.statut === "ouverte").length, 0)
      + (r.incoherences_globales || []).filter((g) => g.statut === "ouverte").length;
    const aVerifier = segs.filter((s) => scoreSeg(s) != null && scoreSeg(s) < 85).length;
    return { ouvertes, aVerifier };
  }

  function afficherReunion() {
    const r = etat.reunion;
    const pctTitre = EN_COURS.has(r.statut) ? (/(\d+) %/.exec(r.progression || "") || [])[1] : null;
    document.title = pctTitre ? `${pctTitre} % · ${r.titre} — Compte rendu de réunion` : `${r.titre} — Compte rendu de réunion`;
    const { ouvertes, aVerifier } = statistiques(r);
    const enCours = EN_COURS.has(r.statut);
    const sg = r.analyse ? r.analyse.score_global : null;
    const onglets = [
      ["transcription", "Transcription", (r.segments || []).length],
      ["interlocuteurs", "Interlocuteurs", Object.keys(r.locuteurs || {}).length],
      ["incoherences", "Incohérences", ouvertes],
      ["compte-rendu", "Compte rendu", null],
      ["telecharger", "Télécharger", null],
      ["journal", "Journal", null],
    ];

    // préserver la saisie du lien IA entre deux rafraîchissements
    const champIa = document.getElementById("lien-ia");
    if (champIa) etat.lienIa = champIa.value;

    $app.innerHTML = `
      <nav role="navigation" class="fr-breadcrumb cr-noprint" aria-label="vous êtes ici :">
        <button class="fr-breadcrumb__button" aria-expanded="false" aria-controls="ariane">Voir le fil d'Ariane</button>
        <div class="fr-collapse" id="ariane"><ol class="fr-breadcrumb__list">
          <li><a class="fr-breadcrumb__link" href="#/">Accueil</a></li>
          <li><a class="fr-breadcrumb__link" aria-current="page">${esc(r.titre)}</a></li></ol></div>
      </nav>
      <div class="cr-barre">
        <div><h1 class="fr-h2">${esc(r.titre)}</h1>
          <p class="cr-mention fr-mb-0">${r.date_reunion ? `Réunion du ${esc(r.date_reunion)} · ` : ""}Créée le ${dateFr(r.cree_le)} ${r.duree ? `· Durée ${hms(r.duree)}` : ""}</p></div>
        <div>${badgeStatut(r.statut)}</div>
      </div>
      ${enCours ? `<div class="fr-alert fr-alert--info fr-mb-3w"><h2 class="fr-alert__title">Traitement en cours</h2><p>${esc(r.progression || "")}</p>
        <p class="cr-mention fr-mb-1w"><strong>Vous pouvez vous absenter</strong> : laissez l'ordinateur allumé, branché sur secteur, et cet onglet ouvert.
          ${veilleBloquee() ? "La mise en veille de l'écran est bloquée pendant le calcul. " : ""}Une notification vous préviendra à la fin.</p>
        <p class="cr-mention fr-mb-0">Le travail est sauvegardé minute par minute : si l'ordinateur se met en veille ou si la page est rechargée, il reprend là où il s'était arrêté.</p></div>` : ""}
      ${r.erreur ? `<div class="fr-alert fr-alert--error fr-mb-3w"><h2 class="fr-alert__title">Erreur</h2><p>${esc(r.erreur)}</p>
        ${!enCours && !(r.segments || []).length && r.audio_disponible ? `<button class="fr-btn fr-btn--sm fr-icon-refresh-line fr-btn--icon-left fr-mt-2w" data-action="reprendre">Reprendre la transcription</button>
          <p class="cr-mention fr-mt-1w">Le son déjà extrait est réutilisé ; le travail déjà fait est conservé.</p>` : ""}</div>` : ""}
      ${(r.segments || []).length ? `
      <div class="cr-grille">
        <div class="cr-kpi" style="${varsCouleur(sg)};border-left:.5rem solid var(--cr-trait)"><div class="v">${sg == null ? "–" : sg + " %"}</div><div class="l">Fiabilité globale · ${libelle(sg)}</div></div>
        <div class="cr-kpi"><div class="v">${Object.keys(r.locuteurs || {}).length}</div><div class="l">Interlocuteurs identifiés</div></div>
        <div class="cr-kpi"><div class="v">${aVerifier}</div><div class="l">Interventions sous 85 %</div></div>
        <div class="cr-kpi"><div class="v">${ouvertes}</div><div class="l">Incohérences non résolues</div></div>
      </div>
      ${panneauIa(r, enCours)}
      ${r.audio_disponible ? `<div class="cr-noprint"><audio id="lecteur" class="cr-audio" controls preload="none" aria-label="Enregistrement de la réunion"></audio></div>` : `<p class="cr-mention">L'enregistrement audio a été supprimé (durée de conservation).</p>`}
      <ul class="cr-onglets cr-noprint" role="tablist" aria-label="Sections de la réunion">
        ${onglets.map(([code, titre, n]) => `<li role="presentation"><button role="tab" id="onglet-${code}" aria-controls="panneau-${code}" aria-selected="${etat.onglet === code}" tabindex="${etat.onglet === code ? 0 : -1}" data-onglet="${code}">${titre}${n != null ? ` <span class="fr-badge fr-badge--sm fr-badge--no-icon">${n}</span>` : ""}</button></li>`).join("")}
      </ul>
      <div role="tabpanel" id="panneau-${etat.onglet}" aria-labelledby="onglet-${etat.onglet}" tabindex="0">${contenuOnglet(r)}</div>
      ` : ""}
      <div class="cr-zone-danger cr-noprint">
        <h2 class="fr-h5">Données de la réunion</h2>
        <p class="cr-mention">Droit à l'effacement : vous pouvez supprimer l'audio seul (la transcription est conservée) ou la réunion entière.</p>
        <div class="cr-segment__actions">
          ${r.audio_disponible ? `<button class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-delete-line fr-btn--icon-left" data-action="suppr-audio">Supprimer l'audio</button>` : ""}
          <button class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-delete-line fr-btn--icon-left" data-action="suppr-reunion">Supprimer la réunion</button>
        </div>
      </div>`;

    brancherAudio(r);
    if (!enCours && document.getElementById("lien-ia")) resoudreIa(document.getElementById("lien-ia").value);
  }

  // ------------------------------------------------------------ sélection de l'IA
  function panneauIa(r, enCours) {
    const c = etat.config;
    const lien = etat.lienIa || (r.analyse && r.analyse.ia && r.analyse.code) || c.lien_ia_defaut;
    const an = r.analyse || {};
    return `
      <section class="cr-panneau cr-noprint" aria-labelledby="titre-ia">
        <h2 class="fr-h5" id="titre-ia">Analyse de cohérence</h2>
        <p class="fr-mb-1w"><span class="fr-badge fr-badge--sm fr-badge--success fr-badge--no-icon">Sans IA · aucune donnée envoyée</span></p>
        <p>L'<strong>analyse locale</strong> est faite automatiquement sur ce poste : calculs et montants, dates contradictoires,
          mots inconnus (erreurs de transcription probables), voix faibles ou à peine audibles, personnes parlant en même temps.</p>
        <button class="fr-btn fr-btn--secondary fr-icon-refresh-line fr-btn--icon-left" data-action="analyse-locale" ${enCours ? "disabled" : ""}>Relancer l'analyse locale</button>
        <p class="cr-mention fr-mt-1w">${an.locale ? "Analyse locale effectuée." : "Analyse locale non encore effectuée."} À relancer après vos corrections de texte.${an.ia ? ` Analyse par IA effectuée : ${esc(an.fournisseur)} (${esc(an.modele)}).` : ""}</p>
        <details class="cr-option-ia fr-mt-3w" ${etat.iaOuverte ? "open" : ""}>
          <summary><strong>Aller plus loin avec une IA (optionnel)</strong> — analyse du sens des propos et rédaction du compte rendu</summary>
          <div class="fr-mt-2w">
            <div class="cr-ia">
              <div class="fr-input-group fr-mb-0">
                <label class="fr-label" for="lien-ia">Lien du modèle d'IA
                  <span class="fr-hint-text">Collez l'adresse du fournisseur, par exemple https://mistral.ai/fr/ ou https://claude.ai : le modèle référencé correspondant est sélectionné.</span></label>
                <input class="fr-input" id="lien-ia" type="url" inputmode="url" value="${esc(lien)}" autocomplete="off" spellcheck="false">
                <div class="cr-tags" aria-label="Modèles référencés">
                  ${c.fournisseurs.map((f) => `<button type="button" class="fr-tag fr-tag--sm" data-ia="${esc(f.code === "demo" ? "demo" : f.site)}">${esc(f.nom)}</button>`).join("")}
                </div>
              </div>
              <div class="fr-input-group fr-mb-0">
                <label class="fr-label" for="modele-ia">Modèle <span class="fr-hint-text">Facultatif : modèle par défaut du fournisseur</span></label>
                <input class="fr-input" id="modele-ia" autocomplete="off" spellcheck="false" placeholder="par défaut">
              </div>
            </div>
            <div id="ia-resolu" class="fr-mt-2w" aria-live="polite"></div>
            <button class="fr-btn fr-icon-refresh-line fr-btn--icon-left fr-mt-1w" data-action="analyser" ${enCours ? "disabled" : ""}>Lancer l'analyse par IA</button>
            <p class="cr-mention fr-mt-1w">Seul le texte est envoyé. Les remarques de l'IA s'ajoutent à celles de l'analyse locale ; le compte rendu rédigé par l'IA remplace le compte rendu de base.</p>
          </div>
        </details>
        <div class="cr-legende fr-mt-3w" aria-hidden="true">
          <div class="cr-legende__barre"></div>
          <div class="cr-legende__graduations"><span>0 % incohérent</span><span>35 % douteux</span><span>60 % à vérifier</span><span>85 % cohérent</span><span>100 %</span></div>
        </div>
        <p class="fr-sr-only">Échelle de fiabilité : moins de 35 % incohérent (rouge), de 35 à 59 % douteux (orange), de 60 à 84 % à vérifier (jaune), 85 % et plus cohérent (vert).</p>
      </section>`;
  }

  function formulaireCle(f) {
    return `
      <form class="fr-mb-2w" data-form-cle="${esc(f.code)}">
        <div class="fr-grid-row fr-grid-row--gutters fr-grid-row--bottom">
          <div class="fr-col-12 fr-col-md-6"><div class="fr-input-group fr-mb-0">
            <label class="fr-label" for="cle-${esc(f.code)}">Clé d'API ${esc(f.nom)}
              <span class="fr-hint-text">${f.configure ? "Une clé est enregistrée. Saisissez-en une autre pour la remplacer." : `À obtenir sur <a href="${esc(f.obtenir_cle)}" target="_blank" rel="noopener" title="${esc(f.obtenir_cle)} — nouvelle fenêtre">la console du fournisseur</a>.`}</span></label>
            <input class="fr-input" type="password" id="cle-${esc(f.code)}" name="cle" autocomplete="off" spellcheck="false" ${f.configure ? 'placeholder="••••••••"' : "required"}></div></div>
          <div class="fr-col-12 fr-col-md-6">
            ${f.memorisation_autorisee ? `<div class="fr-checkbox-group fr-checkbox-group--sm fr-mb-1w"><input type="checkbox" id="memo-${esc(f.code)}" name="memoriser" ${f.cle_memorisee ? "checked" : ""}>
              <label class="fr-label" for="memo-${esc(f.code)}">Mémoriser sur ce poste <span class="fr-hint-text">Sinon, effacée à la fermeture du navigateur</span></label></div>`
              : `<p class="cr-mention fr-mb-1w">La clé est effacée à la fermeture du navigateur.</p>`}
            <button class="fr-btn fr-btn--sm fr-btn--secondary" type="submit">Enregistrer la clé</button>
            ${f.configure ? `<button class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline" type="button" data-oublier-cle="${esc(f.code)}">Oublier la clé</button>` : ""}
          </div>
        </div>
        <p class="cr-mention fr-mt-1w fr-mb-0">La clé reste dans ce navigateur et n'est envoyée qu'à ${esc(f.nom)}.</p>
      </form>`;
  }

  let attenteIa = null;
  function resoudreIa(lien) {
    clearTimeout(attenteIa);
    attenteIa = setTimeout(async () => {
      const zone = document.getElementById("ia-resolu");
      if (!zone) return;
      try {
        const f = await api("POST", "/api/ia/resoudre", { lien });
        etat.ia = f;
        zone.innerHTML = `
          <p class="fr-mb-1w"><span class="fr-badge fr-badge--${f.configure ? "success" : "warning"} fr-badge--sm">${f.configure ? "Prêt" : "Clé d'API à saisir"}</span>
            <strong>${esc(f.nom)}</strong> · modèle <code>${esc(f.modele)}</code> · hébergement : ${esc(f.hebergement)}</p>
          ${f.cle_requise ? formulaireCle(f) : ""}
          ${f.code === "ollama" ? `<p class="cr-mention">Ollama doit être installé et lancé sur ce poste, avec la variable <code>OLLAMA_ORIGINS</code> autorisant ce site. Aucune donnée ne sort de l'ordinateur.</p>` : ""}
          ${f.hors_ue ? `
            <div class="fr-alert fr-alert--warning fr-alert--sm fr-mb-1w"><p>Ce fournisseur est hébergé hors de l'Union européenne : le texte de la réunion lui sera transmis. Vérifiez que l'analyse d'impact (AIPD) et votre DPO l'autorisent, et évitez les réunions contenant des informations sensibles ou classifiées.</p></div>
            <div class="fr-checkbox-group"><input type="checkbox" id="accepte-hors-ue"><label class="fr-label" for="accepte-hors-ue">Je confirme l'envoi de la transcription à ce fournisseur hors UE</label></div>` : ""}`;
      } catch (e) {
        etat.ia = null;
        zone.innerHTML = `<p class="fr-error-text">${esc(e.message)}</p>`;
      }
    }, 300);
  }

  // ------------------------------------------------------------ onglets
  function contenuOnglet(r) {
    switch (etat.onglet) {
      case "interlocuteurs": return ongletLocuteurs(r);
      case "incoherences": return ongletIncoherences(r);
      case "compte-rendu": return ongletCompteRendu(r);
      case "telecharger": return ongletTelecharger(r);
      case "journal": return ongletJournal(r);
      default: return ongletTranscription(r);
    }
  }

  function nomLoc(r, code) { return ((r.locuteurs || {})[code] || {}).nom || code; }

  function ongletTranscription(r) {
    let segs = r.segments || [];
    if (etat.filtre === "verifier") segs = segs.filter((s) => scoreSeg(s) != null && scoreSeg(s) < 85);
    if (etat.filtre === "ouvertes") segs = segs.filter((s) => (s.incoherences || []).some((i) => i.statut === "ouverte"));
    return `
      <div class="fr-select-group cr-noprint" style="max-width:24rem">
        <label class="fr-label" for="filtre">Afficher</label>
        <select class="fr-select" id="filtre">
          <option value="tous" ${etat.filtre === "tous" ? "selected" : ""}>Toutes les interventions</option>
          <option value="verifier" ${etat.filtre === "verifier" ? "selected" : ""}>Interventions sous 85 %</option>
          <option value="ouvertes" ${etat.filtre === "ouvertes" ? "selected" : ""}>Avec incohérence non résolue</option>
        </select>
      </div>
      ${segs.length ? segs.map((s) => carteSegment(r, s)).join("") : `<p>Aucune intervention ne correspond à ce filtre.</p>`}`;
  }

  function carteSegment(r, s) {
    const sc = scoreSeg(s);
    const enEdition = etat.edition === s.id;
    const options = Object.entries(r.locuteurs || {}).map(([code, l]) => `<option value="${esc(code)}" ${code === s.locuteur ? "selected" : ""}>${esc(l.nom)}</option>`).join("");
    return `
      <article class="cr-segment" id="seg-${esc(s.id)}" style="${varsCouleur(sc)}" aria-labelledby="seg-titre-${esc(s.id)}">
        <div class="cr-segment__tete">
          <h3 class="fr-sr-only" id="seg-titre-${esc(s.id)}">Intervention ${esc(s.id)} de ${esc(nomLoc(r, s.locuteur))} à ${hms(s.debut)}</h3>
          <button class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-play-circle-line fr-btn--icon-left cr-heure" data-lire="${s.debut}" ${r.audio_disponible ? "" : "disabled"} title="Écouter à partir de ${hms(s.debut)}">${hms(s.debut)}</button>
          <span><span class="cr-pastille" style="background:${couleurLocuteur(s.locuteur)}" aria-hidden="true"></span>
            <label class="fr-sr-only" for="loc-${esc(s.id)}">Interlocuteur</label>
            <select class="fr-select" id="loc-${esc(s.id)}" data-locuteur="${esc(s.id)}">${options}</select></span>
          ${badgeScore(sc, "Cohérence ")}
          ${s.confiance_audio != null && s.confiance_audio < 70 ? `<span class="fr-badge fr-badge--sm fr-badge--warning">Audio peu clair (${s.confiance_audio} %)</span>` : ""}
          ${s.corrige ? `<span class="fr-badge fr-badge--sm fr-badge--info">Corrigé</span>` : ""}
          ${s.valide ? `<span class="fr-badge fr-badge--sm fr-badge--success">Vérifié</span>` : ""}
        </div>
        ${enEdition ? `
          <div class="fr-input-group"><label class="fr-label" for="txt-${esc(s.id)}">Texte de l'intervention</label>
            <textarea class="fr-input" id="txt-${esc(s.id)}" rows="4">${esc(s.texte)}</textarea></div>
          <div class="cr-segment__actions">
            <button class="fr-btn fr-btn--sm fr-icon-check-line fr-btn--icon-left" data-enregistrer="${esc(s.id)}">Enregistrer</button>
            <button class="fr-btn fr-btn--sm fr-btn--secondary" data-annuler>Annuler</button>
          </div>` : `<p class="cr-segment__texte">${esc(s.texte)}</p>`}
        ${(s.incoherences || []).map((inc, i) => blocIncoherence(s, inc, i)).join("")}
        ${enEdition ? "" : `<div class="cr-segment__actions cr-noprint">
          <button class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-edit-line fr-btn--icon-left" data-editer="${esc(s.id)}">Corriger</button>
          <button class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-checkbox-circle-line fr-btn--icon-left" data-valider="${esc(s.id)}" data-valeur="${!s.valide}">${s.valide ? "Retirer la vérification" : "Marquer comme vérifié"}</button>
          ${(s.historique || []).length ? `<span class="cr-mention">${s.historique.length} modification(s) · dernière par ${esc(s.historique.at(-1).par)} le ${dateFr(s.historique.at(-1).le)}</span>` : ""}
        </div>`}
      </article>`;
  }

  function blocIncoherence(s, inc, i) {
    const types = etat.config.types_incoherence;
    const ouverte = inc.statut === "ouverte";
    const etiquettes = { corrigee: "Corrigée", ignoree: "Ignorée", resolue: "Résolue" };
    return `
      <div class="cr-incoherence ${ouverte ? "" : "cr-incoherence--fermee"}">
        <p><strong>Incohérence rapportée — ${esc(types[inc.type] || inc.type)}</strong> <span class="fr-badge fr-badge--sm fr-badge--no-icon ${inc.origine === "ia" ? "fr-badge--purple-glycine" : "fr-badge--green-emeraude"}">${inc.origine === "ia" ? "IA" : "Analyse locale"}</span>${ouverte ? "" : ` <span class="fr-badge fr-badge--sm">${etiquettes[inc.statut] || esc(inc.statut)}</span>`}</p>
        <p>${esc(inc.description)}</p>
        ${inc.suggestion && ouverte ? `<p class="cr-mention fr-mb-0">Correction proposée :</p><div class="cr-suggestion">${esc(inc.suggestion)}</div>` : ""}
        <div class="cr-segment__actions cr-noprint">
          ${ouverte ? `
            ${inc.suggestion ? `<button class="fr-btn fr-btn--sm fr-icon-check-line fr-btn--icon-left" data-inc="${esc(s.id)}" data-index="${i}" data-act="appliquer">Appliquer la correction</button>` : ""}
            <button class="fr-btn fr-btn--sm fr-btn--secondary" data-inc="${esc(s.id)}" data-index="${i}" data-act="resolue">Marquer résolue</button>
            <button class="fr-btn fr-btn--sm fr-btn--tertiary" data-inc="${esc(s.id)}" data-index="${i}" data-act="ignorer">Ignorer (propos fidèle)</button>`
          : `<button class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline" data-inc="${esc(s.id)}" data-index="${i}" data-act="rouvrir">Rouvrir</button>`}
        </div>
      </div>`;
  }

  function ongletLocuteurs(r) {
    const stats = {};
    for (const s of r.segments || []) {
      const st = (stats[s.locuteur] ||= { duree: 0, nb: 0, extrait: null });
      st.duree += (s.fin || 0) - (s.debut || 0); st.nb += 1;
      if (st.extrait == null && (s.fin - s.debut) > 3) st.extrait = s.debut;
    }
    return `
      <p>La séparation des voix attribue à chaque interlocuteur un libellé anonyme. Écoutez un extrait puis indiquez le nom de la personne.
        Pour corriger une attribution, changez l'interlocuteur directement sur l'intervention.</p>
      <p class="cr-mention">Aucune empreinte vocale n'est conservée : les noms sont saisis par vous pour cette réunion uniquement.</p>
      ${Object.entries(r.locuteurs || {}).map(([code, l]) => {
        const st = stats[code] || { duree: 0, nb: 0 };
        return `
        <form class="cr-panneau" data-form-locuteur="${esc(code)}">
          <div class="fr-grid-row fr-grid-row--gutters fr-grid-row--bottom">
            <div class="fr-col-12 fr-col-md-4"><div class="fr-input-group fr-mb-0">
              <label class="fr-label" for="nom-${esc(code)}"><span class="cr-pastille" style="background:${couleurLocuteur(code)}" aria-hidden="true"></span>Nom (${esc(code)})</label>
              <input class="fr-input" id="nom-${esc(code)}" name="nom" value="${esc(l.nom)}" maxlength="120" required></div></div>
            <div class="fr-col-12 fr-col-md-4"><div class="fr-input-group fr-mb-0">
              <label class="fr-label" for="fct-${esc(code)}">Fonction</label>
              <input class="fr-input" id="fct-${esc(code)}" name="fonction" value="${esc(l.fonction)}" maxlength="200"></div></div>
            <div class="fr-col-12 fr-col-md-4">
              <p class="cr-mention fr-mb-1w">${st.nb} intervention(s) · ${hms(st.duree)} de parole</p>
              <ul class="fr-btns-group fr-btns-group--inline fr-btns-group--sm fr-mb-0">
                <li><button class="fr-btn fr-btn--sm" type="submit">Enregistrer</button></li>
                ${st.extrait != null && r.audio_disponible ? `<li><button class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-play-circle-line fr-btn--icon-left" type="button" data-lire="${st.extrait}">Extrait</button></li>` : ""}
              </ul></div>
          </div>
        </form>`;
      }).join("")}
      <form class="cr-panneau" id="form-ajout-locuteur">
        <h3 class="fr-h6">Ajouter un interlocuteur manquant</h3>
        <div class="fr-grid-row fr-grid-row--gutters fr-grid-row--bottom">
          <div class="fr-col-12 fr-col-md-5"><div class="fr-input-group fr-mb-0"><label class="fr-label" for="nouveau-nom">Nom</label>
            <input class="fr-input" id="nouveau-nom" maxlength="120" required></div></div>
          <div class="fr-col-12 fr-col-md-5"><div class="fr-input-group fr-mb-0"><label class="fr-label" for="nouvelle-fct">Fonction</label>
            <input class="fr-input" id="nouvelle-fct" maxlength="200"></div></div>
          <div class="fr-col-12 fr-col-md-2"><button class="fr-btn fr-btn--secondary fr-icon-add-line fr-btn--icon-left" type="submit">Ajouter</button></div>
        </div>
      </form>`;
  }

  function ongletIncoherences(r) {
    const types = etat.config.types_incoherence;
    const globales = (r.incoherences_globales || []).map((g, i) => ({ g, i })).filter(({ g }) => g.statut === "ouverte");
    const locales = [];
    for (const s of r.segments || []) (s.incoherences || []).forEach((inc, i) => { if (inc.statut === "ouverte") locales.push({ s, inc, i }); });
    locales.sort((a, b) => (scoreSeg(a.s) ?? 100) - (scoreSeg(b.s) ?? 100));
    if (!r.analyse) return `<p>Lancez l'analyse de cohérence pour faire apparaître les incohérences rapportées.</p>`;
    if (!globales.length && !locales.length) return `<div class="fr-alert fr-alert--success"><p>Toutes les incohérences ont été traitées.</p></div>`;
    return `
      ${globales.length ? `<h2 class="fr-h5">Contradictions entre interventions</h2>
        ${globales.map(({ g, i }) => `
          <div class="cr-incoherence" style="${varsCouleur(100 - g.gravite)}">
            <p>${badgeScore(100 - g.gravite, "Fiabilité ")}</p>
            <p>${esc(g.description)}</p>
            <p class="cr-mention">Interventions : ${(g.segments || []).map((id) => `<a href="#seg-${esc(id)}" data-voir="${esc(id)}">${esc(id)}</a>`).join(", ")}</p>
            <div class="cr-segment__actions">
              <button class="fr-btn fr-btn--sm fr-btn--secondary" data-globale="${i}" data-act="resolue">Marquer résolue</button>
              <button class="fr-btn fr-btn--sm fr-btn--tertiary" data-globale="${i}" data-act="ignorer">Ignorer</button>
            </div>
          </div>`).join("")}` : ""}
      ${locales.length ? `<h2 class="fr-h5 fr-mt-4w">Incohérences par intervention (de la moins fiable à la plus fiable)</h2>
        <div class="fr-table"><div class="fr-table__wrapper"><div class="fr-table__container"><div class="fr-table__content">
        <table><caption class="fr-sr-only">Incohérences non résolues</caption>
          <thead><tr><th scope="col">Fiabilité</th><th scope="col">Heure</th><th scope="col">Interlocuteur</th><th scope="col">Type</th><th scope="col">Description</th><th scope="col">Action</th></tr></thead>
          <tbody>${locales.map(({ s, inc }) => `<tr>
            <td>${badgeScore(scoreSeg(s))}</td><td class="cr-num">${hms(s.debut)}</td><td>${esc(nomLoc(r, s.locuteur))}</td>
            <td>${esc(types[inc.type] || inc.type)}</td><td>${esc(inc.description)}</td>
            <td><button class="fr-btn fr-btn--sm fr-btn--tertiary" data-voir="${esc(s.id)}">Voir et corriger</button></td></tr>`).join("")}</tbody>
        </table></div></div></div></div>` : ""}`;
  }

  function ongletCompteRendu(r) {
    const cr = r.compte_rendu;
    if (!cr) return `<p>Le compte rendu de base sera établi après l'analyse locale.</p>`;
    return `
      <form class="cr-cr" id="form-cr">
        <div class="fr-alert fr-alert--info fr-alert--sm fr-mb-3w"><p>${cr.automatique
          ? "Compte rendu de base établi sans IA (extraits, décisions et actions repérés automatiquement) : complétez-le avant diffusion, ou utilisez l'option IA pour une rédaction complète."
          : "Texte rédigé par une IA : relisez-le et modifiez-le avant diffusion."} Les incohérences non résolues sont listées dans l'export.</p></div>
        <div class="fr-input-group"><label class="fr-label" for="cr-resume">Synthèse</label>
          <textarea class="fr-input" id="cr-resume" rows="5">${esc(cr.resume)}</textarea></div>
        <h2 class="fr-h5">Points abordés</h2>
        <div id="cr-points">${(cr.points || []).map((p, i) => blocPoint(p, i)).join("")}</div>
        <button type="button" class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-add-line fr-btn--icon-left fr-mb-3w" data-ajout="point">Ajouter un point</button>
        <h2 class="fr-h5">Décisions</h2>
        <div id="cr-decisions">${(cr.decisions || []).map((d, i) => ligneDecision(d, i)).join("")}</div>
        <button type="button" class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-add-line fr-btn--icon-left fr-mb-3w" data-ajout="decision">Ajouter une décision</button>
        <h2 class="fr-h5">Actions</h2>
        <div id="cr-actions">${(cr.actions || []).map((a, i) => ligneAction(a, i)).join("")}</div>
        <button type="button" class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-add-line fr-btn--icon-left fr-mb-3w" data-ajout="action">Ajouter une action</button>
        <ul class="fr-btns-group fr-btns-group--inline-md">
          <li><button class="fr-btn fr-icon-check-line fr-btn--icon-left" type="submit">Enregistrer le compte rendu</button></li>
          <li><button class="fr-btn fr-btn--secondary fr-icon-download-line fr-btn--icon-left" type="button" data-onglet="telecharger">Télécharger</button></li>
        </ul>
      </form>`;
  }
  const blocPoint = (p, i) => `
    <div class="cr-point" data-point>
      <div class="fr-input-group"><label class="fr-label" for="pt-t-${i}">Titre</label><input class="fr-input" id="pt-t-${i}" data-champ="titre" value="${esc(p.titre)}" maxlength="300"></div>
      <div class="fr-input-group fr-mb-1w"><label class="fr-label" for="pt-c-${i}">Contenu</label><textarea class="fr-input" id="pt-c-${i}" data-champ="contenu" rows="4">${esc(p.contenu)}</textarea></div>
      <input type="hidden" data-champ="segments" value="${esc((p.segments || []).join(","))}">
      <button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-delete-line fr-btn--icon-left" data-retirer>Retirer ce point</button>
    </div>`;
  const ligneDecision = (d, i) => `
    <div class="fr-input-group" data-decision><label class="fr-label" for="dec-${i}">Décision ${i + 1}</label>
      <div class="fr-input-wrap" style="display:flex;gap:.5rem"><input class="fr-input" id="dec-${i}" value="${esc(d)}" maxlength="5000">
      <button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-delete-line" title="Retirer la décision ${i + 1}" data-retirer>Retirer</button></div></div>`;
  const ligneAction = (a, i) => `
    <div class="fr-grid-row fr-grid-row--gutters fr-grid-row--bottom fr-mb-2w" data-action-cr>
      <div class="fr-col-12 fr-col-md-6"><label class="fr-label" for="ac-a-${i}">Action</label><input class="fr-input" id="ac-a-${i}" data-champ="action" value="${esc(a.action)}"></div>
      <div class="fr-col-6 fr-col-md-3"><label class="fr-label" for="ac-r-${i}">Responsable</label><input class="fr-input" id="ac-r-${i}" data-champ="responsable" value="${esc(a.responsable)}"></div>
      <div class="fr-col-4 fr-col-md-2"><label class="fr-label" for="ac-e-${i}">Échéance</label><input class="fr-input" id="ac-e-${i}" data-champ="echeance" value="${esc(a.echeance)}"></div>
      <div class="fr-col-2 fr-col-md-1"><button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-delete-line" title="Retirer l'action ${i + 1}" data-retirer>Retirer</button></div>
    </div>`;

  function ongletTelecharger(r) {
    const docs = { "compte-rendu": ["Compte rendu", "Le texte du compte rendu uniquement : participants, synthèse, points abordés, décisions et actions. Rien d'autre."],
      verification: ["Compte rendu avec vérification de cohérence", "Le compte rendu, la fiabilité, les incohérences non résolues et la transcription annotée avec le code couleur."],
      transcription: ["Transcription", "Le texte intégral de la réunion : heure, interlocuteur et propos."] };
    const formats = [["docx", "Word", ".docx"], ["pdf", "PDF", ".pdf"], ["odt", "OpenDocument", ".odt"], ["txt", "Texte", ".txt"], ["md", "Markdown", ".md"]];
    const choisi = etat.docExport || "compte-rendu";
    return `
      <fieldset class="fr-fieldset" aria-labelledby="titre-doc">
        <legend class="fr-fieldset__legend" id="titre-doc"><h2 class="fr-h5 fr-mb-0">1. Choisissez le document</h2></legend>
        ${Object.entries(docs).map(([code, [titre, desc]]) => `
          <div class="fr-fieldset__element"><div class="fr-radio-group fr-radio-rich">
            <input type="radio" id="doc-${code}" name="doc-export" value="${code}" ${choisi === code ? "checked" : ""}>
            <label class="fr-label" for="doc-${code}">${titre}<span class="fr-hint-text">${desc}</span></label>
          </div></div>`).join("")}
      </fieldset>
      <h2 class="fr-h5 fr-mt-3w">2. Téléchargez-le dans le format voulu</h2>
      <ul class="fr-btns-group fr-btns-group--inline-md fr-btns-group--icon-left">
        ${formats.map(([f, n, ext], i) => `<li><button class="fr-btn ${i ? "fr-btn--secondary" : ""} fr-icon-download-line" type="button" data-telecharger="${f}">${n} <span class="cr-mention-ext">(${ext})</span></button></li>`).join("")}
      </ul>
      <p class="cr-mention">Le fichier est créé sur ce poste et enregistré dans votre dossier Téléchargements. OpenDocument (.odt) s'ouvre avec LibreOffice et Word.</p>`;
  }

  function ongletJournal(r) {
    const libelles = { creation: "Dépôt de l'audio", transcription: "Transcription", analyse: "Analyse IA", correction: "Correction",
      renommage_locuteur: "Nom d'interlocuteur", ajout_locuteur: "Ajout d'interlocuteur", edition_compte_rendu: "Modification du compte rendu",
      export: "Export", analyse_locale: "Analyse locale (sans IA)", suppression_audio: "Suppression de l'audio", purge_audio: "Purge automatique de l'audio" };
    return `
      <p class="cr-mention">Traçabilité des actions réalisées sur cette réunion.</p>
      <div class="fr-table"><div class="fr-table__wrapper"><div class="fr-table__container"><div class="fr-table__content">
      <table><caption class="fr-sr-only">Journal des actions</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Utilisateur</th><th scope="col">Action</th><th scope="col">Détail</th></tr></thead>
        <tbody>${(r.journal || []).map((j) => `<tr><td>${dateFr(j.horodatage)}</td><td>${esc(j.utilisateur)}</td><td>${esc(libelles[j.action] || j.action)}</td><td>${esc(j.detail)}</td></tr>`).join("")}</tbody>
      </table></div></div></div></div>`;
  }

  // ------------------------------------------------------------ audio
  async function brancherAudio(r) {
    const lecteur = document.getElementById("lecteur");
    if (!lecteur) return;
    if (etat.audioPour !== r.id || (!etat.audioUrl && r.audio_disponible)) {
      if (etat.audioUrl) URL.revokeObjectURL(etat.audioUrl);
      etat.audioUrl = null; etat.audioPour = r.id;
      try { etat.audioUrl = URL.createObjectURL(await api("GET", `/api/reunions/${r.id}/audio`)); } catch { /* audio indisponible */ }
    }
    if (etat.audioUrl) lecteur.src = etat.audioUrl;
  }
  function lireA(t) {
    const lecteur = document.getElementById("lecteur");
    if (!lecteur) return;
    lecteur.currentTime = Math.max(0, Number(t) - 0.3);
    lecteur.play().catch(() => {});
  }

  // ------------------------------------------------------------ actions
  async function action(fn, succes) {
    try { await fn(); if (succes) notifier(succes); await chargerReunion(etat.reunion.id); } catch (e) { notifier(e.message, "error"); }
  }
  const base = () => `/api/reunions/${etat.reunion.id}`;

  function lireCompteRendu() {
    const champ = (el, nom) => el.querySelector(`[data-champ="${nom}"]`).value;
    return {
      resume: document.getElementById("cr-resume").value,
      points: [...document.querySelectorAll("[data-point]")].map((el) => ({ titre: champ(el, "titre"), contenu: champ(el, "contenu"), segments: champ(el, "segments").split(",").filter(Boolean) })),
      decisions: [...document.querySelectorAll("[data-decision] input")].map((el) => el.value).filter((v) => v.trim()),
      actions: [...document.querySelectorAll("[data-action-cr]")].map((el) => ({ action: champ(el, "action"), responsable: champ(el, "responsable"), echeance: champ(el, "echeance") })).filter((a) => a.action.trim()),
    };
  }

  $app.addEventListener("click", async (e) => {
    const b = e.target.closest("button, a[data-voir]");
    if (!b) return;
    const d = b.dataset;
    if (d.onglet) {
      if (etat.onglet === "compte-rendu" && document.getElementById("form-cr")) {
        try { await api("PUT", `${base()}/compte-rendu`, lireCompteRendu()); etat.reunion = await api("GET", base()); } catch (err) { notifier(err.message, "error"); }
      }
      etat.onglet = d.onglet; afficherReunion(); document.getElementById(`onglet-${d.onglet}`)?.focus(); return;
    }
    if (d.ia) { const champ = document.getElementById("lien-ia"); champ.value = d.ia; etat.lienIa = d.ia; resoudreIa(d.ia); return; }
    if (d.lire !== undefined) { lireA(d.lire); return; }
    if (d.voir) {
      e.preventDefault();
      etat.onglet = "transcription"; etat.filtre = "tous"; afficherReunion();
      const cible = document.getElementById(`seg-${d.voir}`);
      if (cible) { cible.classList.add("cr-focus"); cible.scrollIntoView({ block: "center" }); cible.setAttribute("tabindex", "-1"); cible.focus(); }
      return;
    }
    if (d.editer) { etat.edition = d.editer; afficherReunion(); document.getElementById(`txt-${d.editer}`).focus(); return; }
    if (d.annuler !== undefined) { etat.edition = null; afficherReunion(); return; }
    if (d.enregistrer) {
      const texte = document.getElementById(`txt-${d.enregistrer}`).value;
      etat.edition = null;
      return action(() => api("PATCH", `${base()}/segments/${d.enregistrer}`, { texte }), "Correction enregistrée.");
    }
    if (d.valider) return action(() => api("PATCH", `${base()}/segments/${d.valider}`, { valide: d.valeur === "true" }));
    if (d.inc) return action(() => api("POST", `${base()}/segments/${d.inc}/incoherences/${d.index}`, { action: d.act }),
      { appliquer: "Correction appliquée.", resolue: "Incohérence marquée résolue.", ignorer: "Incohérence ignorée.", rouvrir: "Incohérence rouverte." }[d.act]);
    if (d.globale) return action(() => api("POST", `${base()}/incoherences-globales/${d.globale}`, { action: d.act }), "Incohérence traitée.");
    if (d.retirer !== undefined) { b.closest("[data-point],[data-decision],[data-action-cr]").remove(); return; }
    if (d.ajout) {
      const n = Date.now();
      const zone = { point: "cr-points", decision: "cr-decisions", action: "cr-actions" }[d.ajout];
      const html = d.ajout === "point" ? blocPoint({ titre: "", contenu: "" }, n) : d.ajout === "decision" ? ligneDecision("", n) : ligneAction({ action: "", responsable: "", echeance: "" }, n);
      document.getElementById(zone).insertAdjacentHTML("beforeend", html);
      document.getElementById(zone).lastElementChild.querySelector("input,textarea").focus();
      return;
    }
    if (d.telecharger) {
      const doc = etat.docExport || "compte-rendu";
      b.disabled = true;
      try {
        const { blob, nom } = await api("GET", `${base()}/export?doc=${doc}&format=${d.telecharger}`);
        const lien = document.createElement("a");
        lien.href = URL.createObjectURL(blob);
        lien.download = nom;
        document.body.appendChild(lien); lien.click(); lien.remove();
        setTimeout(() => URL.revokeObjectURL(lien.href), 10000);
        notifier(`Fichier téléchargé : ${nom}`);
      } catch (err) { notifier(err.message, "error"); } finally { b.disabled = false; }
      return;
    }
    if (d.oublierCle) {
      await api("PUT", `/api/cles/${d.oublierCle}`, { cle: "" });
      notifier("Clé effacée de ce poste.");
      resoudreIa(document.getElementById("lien-ia").value);
      return;
    }
    if (d.action === "analyse-locale") {
      return action(() => api("POST", `${base()}/analyse`, { lien: "locale" }), "Analyse locale effectuée.");
    }
    if (d.action === "analyser") {
      const lien = document.getElementById("lien-ia").value.trim();
      const modele = document.getElementById("modele-ia").value.trim() || null;
      const accepte = document.getElementById("accepte-hors-ue");
      etat.lienIa = lien;
      return action(() => api("POST", `${base()}/analyse`, { lien, modele, accepte_hors_ue: !!(accepte && accepte.checked) }), "Analyse lancée.");
    }
    if (d.action === "reprendre") demanderNotifications();
    if (d.action === "reprendre") return action(() => api("POST", `${base()}/reprendre`), "Traitement relancé.");
    if (d.action === "tout-effacer") {
      if (!confirm("Effacer définitivement TOUTES les données de l'application sur ce poste ?")) return;
      try { await api("DELETE", "/api/tout"); etat.reunion = null; etat.config = await api("GET", "/api/config"); notifier("Toutes les données de ce poste ont été effacées."); location.hash = "#/"; } catch (err) { notifier(err.message, "error"); }
      return;
    }
    if (d.action === "suppr-audio") {
      if (!confirm("Supprimer définitivement l'enregistrement audio ? La transcription est conservée.")) return;
      return action(() => api("DELETE", `${base()}/audio`), "Audio supprimé.");
    }
    if (d.action === "suppr-reunion") {
      if (!confirm("Supprimer définitivement cette réunion, son audio, sa transcription et son compte rendu ?")) return;
      try { await api("DELETE", base()); notifier("Réunion supprimée."); etat.reunion = null; location.hash = "#/"; } catch (err) { notifier(err.message, "error"); }
    }
  });

  $app.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "doc-export") { etat.docExport = t.value; return; }
    if (t.id === "filtre") { etat.filtre = t.value; afficherReunion(); document.getElementById("filtre").focus(); }
    if (t.dataset.locuteur) action(() => api("PATCH", `${base()}/segments/${t.dataset.locuteur}`, { locuteur: t.value }), "Interlocuteur modifié.");
  });

  $app.addEventListener("toggle", (e) => { if (e.target.classList?.contains("cr-option-ia")) etat.iaOuverte = e.target.open; }, true);

  $app.addEventListener("input", (e) => { if (e.target.id === "lien-ia") { etat.lienIa = e.target.value; resoudreIa(e.target.value); } });

  $app.addEventListener("keydown", (e) => {
    // navigation clavier entre onglets (motif ARIA « tabs »)
    const tab = e.target.closest('[role="tab"]');
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    let i = tabs.indexOf(tab);
    i = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault(); tabs[i].click();
  });

  $app.addEventListener("submit", (e) => {
    const f = e.target;
    if (f.dataset.formLocuteur) {
      e.preventDefault();
      const code = f.dataset.formLocuteur;
      return action(() => api("PUT", `${base()}/locuteurs/${code}`, { nom: f.nom.value, fonction: f.fonction.value }), "Interlocuteur enregistré.");
    }
    if (f.id === "form-ajout-locuteur") {
      e.preventDefault();
      return action(() => api("POST", `${base()}/locuteurs`, { nom: document.getElementById("nouveau-nom").value, fonction: document.getElementById("nouvelle-fct").value }), "Interlocuteur ajouté.");
    }
    if (f.dataset.formCle) {
      e.preventDefault();
      const cle = f.cle.value.trim();
      if (!cle) return;
      api("PUT", `/api/cles/${f.dataset.formCle}`, { cle, memoriser: !!f.memoriser?.checked }).then(() => {
        notifier("Clé enregistrée.");
        resoudreIa(document.getElementById("lien-ia").value);
      });
      return;
    }
    if (f.id === "form-reglages") {
      e.preventDefault();
      const v = (n) => f.elements[n].value;
      api("PUT", "/api/reglages", {
        modeleTranscription: v("modele"), materiel: v("materiel"), lienIa: v("lien").trim() || "https://mistral.ai/fr/",
        ...(f.elements.retention_audio ? { retentionAudio: Math.max(1, parseInt(v("retention_audio"), 10) || 30), retentionReunion: Math.max(1, parseInt(v("retention_reunion"), 10) || 365) } : {}),
      }).then(async () => { etat.config = await api("GET", "/api/config"); notifier("Réglages enregistrés."); });
      return;
    }
    if (f.id === "form-cr") { e.preventDefault(); return action(() => api("PUT", `${base()}/compte-rendu`, lireCompteRendu()), "Compte rendu enregistré."); }
  });

  // ------------------------------------------------------------ aide / données personnelles
  function pageReglages() {
    document.title = "Réglages — Compte rendu de réunion";
    const c = etat.config, g = c.reglages;
    $app.innerHTML = `
      <h1>Réglages</h1>
      <form id="form-reglages" class="cr-panneau">
        <h2 class="fr-h5">Transcription</h2>
        <div class="fr-select-group"><label class="fr-label" for="modele">Modèle de transcription
          <span class="fr-hint-text">Plus le modèle est gros, plus la transcription est fidèle, mais lente et lourde à télécharger.</span></label>
          <select class="fr-select" id="modele" name="modele">${Object.entries(c.modeles_transcription).map(([k, m]) => `<option value="${k}" ${g.modeleTranscription === k ? "selected" : ""}>${esc(m.nom)}</option>`).join("")}</select></div>
        <div class="fr-select-group"><label class="fr-label" for="materiel">Calcul</label>
          <select class="fr-select" id="materiel" name="materiel">
            <option value="auto" ${g.materiel === "auto" ? "selected" : ""}>Automatique (carte graphique si disponible, conseillé)</option>
            <option value="wasm" ${g.materiel === "wasm" ? "selected" : ""}>Processeur uniquement (plus lent, plus compatible)</option>
          </select></div>
        <p class="cr-mention">Source des modèles (fixée par l'administrateur) : ${c.deploiement.sourceModeles === "local" ? "serveur de l'application, aucune connexion externe" : "huggingface.co (téléchargement des modèles uniquement, aucune donnée de réunion envoyée)"}.</p>
        <h2 class="fr-h5 fr-mt-4w">Intelligence artificielle</h2>
        <div class="fr-input-group"><label class="fr-label" for="lien">Lien de l'IA proposée par défaut</label>
          <input class="fr-input" id="lien" name="lien" value="${esc(g.lienIa)}"></div>
        <h2 class="fr-h5 fr-mt-4w">Conservation sur ce poste</h2>
        ${c.ephemere ? `<p><strong>Mode éphémère</strong> (fixé par l'administrateur) : rien n'est conservé, tout est effacé à la fermeture du navigateur.</p>` : `
        <div class="fr-grid-row fr-grid-row--gutters">
          <div class="fr-col-12 fr-col-md-6"><div class="fr-input-group"><label class="fr-label" for="retention_audio">Audio (jours)</label>
            <input class="fr-input" type="number" min="1" max="3650" id="retention_audio" name="retention_audio" value="${g.retentionAudio}"></div></div>
          <div class="fr-col-12 fr-col-md-6"><div class="fr-input-group"><label class="fr-label" for="retention_reunion">Transcription et compte rendu (jours)</label>
            <input class="fr-input" type="number" min="1" max="3650" id="retention_reunion" name="retention_reunion" value="${g.retentionReunion}"></div></div>
        </div>`}
        <button class="fr-btn" type="submit">Enregistrer les réglages</button>
      </form>
      <div class="cr-zone-danger">
        <h2 class="fr-h5">Effacer toutes les données de ce poste</h2>
        <p class="cr-mention">Supprime immédiatement toutes les réunions, enregistrements, transcriptions, comptes rendus, le journal, les réglages et les clés d'API conservés par l'application dans ce navigateur.</p>
        <button class="fr-btn fr-btn--secondary fr-icon-delete-line fr-btn--icon-left" type="button" data-action="tout-effacer">Tout effacer maintenant</button>
      </div>`;
  }

  function pageAide() {
    document.title = "Aide et données personnelles — Compte rendu de réunion";
    const c = etat.config;
    $app.innerHTML = `
      <h1>Aide et données personnelles</h1>
      <h2>Fonctionnement</h2>
      <ol>
        <li><strong>Dépôt</strong> : l'enregistrement est transcrit (Whisper) et les voix sont séparées (pyannote) <strong>dans votre navigateur</strong>. L'audio ne quitte pas l'ordinateur.</li>
        <li><strong>Interlocuteurs</strong> : écoutez un extrait de chaque voix et saisissez le nom correspondant.</li>
        <li><strong>Analyse locale, sans IA</strong> (automatique) : chaque intervention est notée de 0 à 100 % selon des contrôles faits sur le poste — calculs et montants, dates contradictoires, mots inconnus du dictionnaire, voix faibles, personnes parlant en même temps, répétitions anormales. Un compte rendu de base est établi.</li>
        <li><strong>IA (optionnelle)</strong> : pour analyser le sens des propos et rédiger le compte rendu, choisissez l'IA en collant le lien du fournisseur (ex. https://mistral.ai/fr/) et saisissez votre clé d'API. Seul le <em>texte</em> lui est envoyé.</li>
        <li><strong>Corrections</strong> : appliquez ou ignorez les corrections proposées, corrigez le texte et les attributions, puis exportez le compte rendu.</li>
      </ol>
      <h2>Code couleur</h2>
      <p>Chaque intervention porte un score de cohérence affiché en pourcentage et en libellé, sur un dégradé continu :</p>
      <ul>
        <li>${badgeScore(100)} à ${badgeScore(85)} : propos cohérent ;</li>
        <li>${badgeScore(84)} à ${badgeScore(60)} : à vérifier ;</li>
        <li>${badgeScore(59)} à ${badgeScore(35)} : douteux ;</li>
        <li>${badgeScore(34)} à ${badgeScore(0)} : incohérent.</li>
      </ul>
      <p>Une intervention marquée « vérifiée » par un agent compte pour 100 %.</p>
      <h2>Laisser tourner le traitement en votre absence</h2>
      <ul>
        <li>Laissez l'ordinateur <strong>allumé et branché sur secteur</strong>, et l'onglet de l'application ouvert. Vous pouvez verrouiller votre session.</li>
        <li>Pendant le calcul, l'application empêche la mise en veille de l'écran tant que l'onglet est affiché, et vous envoie une notification à la fin (si vous l'avez autorisée).</li>
        <li>Dans Chrome ou Edge, ajoutez l'adresse de l'application aux sites « toujours actifs » : Paramètres → Performances → Économiseur de mémoire → « Toujours garder ces sites actifs ».</li>
        <li>Si l'ordinateur se met malgré tout en veille, le traitement reprend tout seul au réveil, là où il s'était arrêté.</li>
        <li>Pour un traitement qui continue <strong>ordinateur éteint</strong>, il faut la version serveur de l'application, installée par votre service informatique.</li>
      </ul>
      <h2>Configuration conseillée</h2>
      <ul>
        <li>Chrome ou Edge récent ; une carte graphique accélère fortement le calcul.</li>
        <li>Environ 5 à 15 minutes de calcul pour 1 heure de réunion sur un ordinateur récent (davantage sur processeur seul).</li>
        <li>Gardez l'onglet ouvert pendant le traitement.</li>
      </ul>
      <h2 id="donnees">Données personnelles</h2>
      <p>Les enregistrements contiennent la voix et les propos des participants (données personnelles). Le responsable de traitement est l'administration qui utilise ce service ; contactez son délégué à la protection des données (DPO) pour exercer vos droits.</p>
      <ul>
        <li>Finalité : rédaction des comptes rendus de réunion. Les participants doivent être informés avant l'enregistrement.</li>
        <li>Aucun serveur ne reçoit l'audio, la transcription ni le compte rendu : tout est traité <strong>dans ce navigateur</strong>.</li>
        <li>${c.ephemere ? "<strong>Mode éphémère</strong> : les données ne sont gardées que pendant la session et sont effacées à la fermeture du navigateur." : "Les données sont conservées dans ce navigateur pendant les durées indiquées ci-dessous."}</li>
        <li>Aucune empreinte vocale n'est conservée ; les interlocuteurs sont nommés manuellement pour chaque réunion.</li>
        ${c.ephemere ? "" : `<li>Durées de conservation : audio ${c.retention_audio_jours} jours, transcription et compte rendu ${c.retention_reunion_jours} jours, puis suppression automatique.</li>`}
        <li>Suppression manuelle possible à tout moment (réunion, audio seul, ou « Tout effacer » dans les réglages).</li>
        <li>IA optionnelle (texte uniquement, jamais l'audio) : ${c.fournisseurs.filter((f) => f.code !== "demo").map((f) => `${esc(f.nom)} (${esc(f.hebergement)})`).join(", ") || "aucune autorisée sur ce déploiement"}.</li>
        <li>Les modèles de transcription sont ${c.deploiement.sourceModeles === "local" ? "fournis par le serveur de l'application" : "téléchargés depuis huggingface.co ; aucun son ni texte n'y est envoyé"}.</li>
      </ul>
      <h2 id="cookies">Cookies</h2>
      <p>Ce service ne dépose aucun cookie ni traceur. Les réglages et, si vous le demandez, vos clés d'API sont conservés dans le stockage local du navigateur.</p>
      <h2 id="accessibilite">Accessibilité</h2>
      <p>Ce service est conçu avec le Système de design de l'État (DSFR) selon le RGAA 4.1. Il n'a pas encore fait l'objet d'un audit de conformité.</p>`;
  }

  // Mode éphémère : prévenir avant de fermer si des réunions sont encore ouvertes
  window.addEventListener("beforeunload", (e) => {
    // calcul en cours (sauvegardé et repris automatiquement, mais interrompu) ou mode éphémère
    if (etat.reunion && (EN_COURS.has(etat.reunion.statut) || etat.config?.ephemere)) { e.preventDefault(); e.returnValue = ""; }
  });

  router();
})();
