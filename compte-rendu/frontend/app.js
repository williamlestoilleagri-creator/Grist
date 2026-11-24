/* Compte rendu de réunion — interface (JavaScript sans dépendance, compatible CSP stricte). */
"use strict";

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
  const lireStockage = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
  const ecrireStockage = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* navigation privée */ } };

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

  async function api(methode, url, corps, brut = false) {
    const entetes = {};
    const jeton = lireStockage("cr-jeton");
    if (jeton) entetes.Authorization = `Bearer ${jeton}`;
    const options = { method: methode, headers: entetes };
    if (corps instanceof FormData) options.body = corps;
    else if (corps !== undefined) { entetes["Content-Type"] = "application/json"; options.body = JSON.stringify(corps); }
    const r = await fetch(url, options);
    if (r.status === 401) { ecrireStockage("cr-jeton", null); afficherJeton(); throw new Error("Authentification requise."); }
    if (brut) { if (!r.ok) throw new Error(`Erreur ${r.status}`); return r; }
    const texte = await r.text();
    const donnees = texte ? JSON.parse(texte) : null;
    if (!r.ok) {
      const d = donnees && donnees.detail;
      throw new Error(Array.isArray(d) ? d.map((x) => x.msg).join(" ; ") : d || `Erreur ${r.status}`);
    }
    return donnees;
  }

  function afficherJeton() {
    $app.innerHTML = `
      <div class="fr-grid-row fr-grid-row--center"><div class="fr-col-12 fr-col-md-6 cr-panneau">
        <h1 class="fr-h3">Accès protégé</h1>
        <form id="form-jeton">
          <div class="fr-input-group"><label class="fr-label" for="jeton">Jeton d'accès fourni par l'administrateur</label>
            <input class="fr-input" type="password" id="jeton" autocomplete="off" required></div>
          <button class="fr-btn" type="submit">Accéder</button>
        </form></div></div>`;
    document.getElementById("form-jeton").addEventListener("submit", (e) => {
      e.preventDefault(); ecrireStockage("cr-jeton", document.getElementById("jeton").value.trim()); router();
    });
  }

  // ------------------------------------------------------------ routage
  async function router() {
    clearTimeout(etat.minuteur);
    const h = location.hash || "#/";
    try {
      if (!etat.config) etat.config = await api("GET", "/api/config");
      const m = h.match(/^#\/reunion\/([0-9a-f]{32})/);
      if (m) {
        if (!etat.reunion || etat.reunion.id !== m[1]) { etat.onglet = "transcription"; etat.edition = null; etat.filtre = "tous"; }
        await chargerReunion(m[1]);
      } else if (h.startsWith("#/aide")) pageAide();
      else await pageAccueil();
    } catch (e) {
      if (e.message !== "Authentification requise.") $app.innerHTML = `<div class="fr-alert fr-alert--error"><h2 class="fr-alert__title">Erreur</h2><p>${esc(e.message)}</p></div>`;
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
      ${c.demo ? `<div class="fr-notice fr-notice--info fr-mb-3w"><div class="fr-container"><div class="fr-notice__body"><p class="fr-notice__title">Mode démonstration : la transcription et l'analyse sont fictives. Choisissez l'IA « demo » pour tester.</p></div></div></div>` : ""}
      <div class="fr-grid-row fr-grid-row--gutters">
        <div class="fr-col-12 fr-col-lg-5">
          <form class="cr-panneau" id="form-nouvelle">
            <h2 class="fr-h4">Nouvelle réunion</h2>
            <div class="fr-upload-group fr-mb-3w">
              <label class="fr-label" for="fichier">Enregistrement audio
                <span class="fr-hint-text">Taille maximale : ${c.taille_max_mo} Mo. Formats : mp3, wav, m4a, ogg, opus, webm, flac, aac, mp4.</span></label>
              <input class="fr-upload" type="file" id="fichier" name="fichier" accept="audio/*,video/mp4,.m4a,.opus" required>
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
                <span class="fr-hint-text">Obligation d'information (RGPD, art. 13). Audio conservé ${c.retention_audio_jours} jours, réunion ${c.retention_reunion_jours} jours.</span></label>
            </div>
            <button class="fr-btn fr-icon-upload-line fr-btn--icon-left" type="submit" id="btn-envoyer">Transcrire la réunion</button>
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
      const bouton = document.getElementById("btn-envoyer");
      bouton.disabled = true;
      document.getElementById("envoi-etat").textContent = "Envoi du fichier en cours…";
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
    document.title = `${r.titre} — Compte rendu de réunion`;
    const { ouvertes, aVerifier } = statistiques(r);
    const enCours = EN_COURS.has(r.statut);
    const sg = r.analyse ? r.analyse.score_global : null;
    const onglets = [
      ["transcription", "Transcription", (r.segments || []).length],
      ["interlocuteurs", "Interlocuteurs", Object.keys(r.locuteurs || {}).length],
      ["incoherences", "Incohérences", ouvertes],
      ["compte-rendu", "Compte rendu", null],
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
        <p class="cr-mention">Vous pouvez quitter cette page : le traitement continue sur le serveur.</p></div>` : ""}
      ${r.erreur ? `<div class="fr-alert fr-alert--error fr-mb-3w"><h2 class="fr-alert__title">Erreur</h2><p>${esc(r.erreur)}</p></div>` : ""}
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
    const lien = etat.lienIa || (r.analyse && r.analyse.code) || c.lien_ia_defaut;
    return `
      <section class="cr-panneau cr-noprint" aria-labelledby="titre-ia">
        <h2 class="fr-h5" id="titre-ia">Analyse de cohérence par IA</h2>
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
        <div class="fr-mt-2w">
          <button class="fr-btn fr-icon-refresh-line fr-btn--icon-left" data-action="analyser" ${enCours ? "disabled" : ""}>${r.analyse ? "Relancer l'analyse" : "Analyser la cohérence et rédiger le compte rendu"}</button>
          ${r.analyse ? `<p class="cr-mention fr-mt-1w">Dernière analyse : ${esc(r.analyse.fournisseur)} (${esc(r.analyse.modele)}). Relancer remplace les scores et le compte rendu, mais conserve vos corrections de texte.</p>` : ""}
        </div>
        <div class="cr-legende" aria-hidden="true">
          <div class="cr-legende__barre"></div>
          <div class="cr-legende__graduations"><span>0 % incohérent</span><span>35 % douteux</span><span>60 % à vérifier</span><span>85 % cohérent</span><span>100 %</span></div>
        </div>
        <p class="fr-sr-only">Échelle de fiabilité : moins de 35 % incohérent (rouge), de 35 à 59 % douteux (orange), de 60 à 84 % à vérifier (jaune), 85 % et plus cohérent (vert).</p>
      </section>`;
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
          <p class="fr-mb-1w"><span class="fr-badge fr-badge--${f.configure ? "success" : "warning"} fr-badge--sm">${f.configure ? "Disponible" : "Non configuré"}</span>
            <strong>${esc(f.nom)}</strong> · modèle <code>${esc(f.modele)}</code> · hébergement : ${esc(f.hebergement)}</p>
          ${f.configure ? "" : `<p class="cr-mention">L'administrateur doit définir la variable <code>${esc(f.cle_attendue)}</code> sur le serveur.</p>`}
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
        <p><strong>Incohérence rapportée — ${esc(types[inc.type] || inc.type)}</strong>${ouverte ? "" : ` <span class="fr-badge fr-badge--sm">${etiquettes[inc.statut] || esc(inc.statut)}</span>`}</p>
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
    if (!cr) return `<p>Le compte rendu sera rédigé lors de l'analyse par l'IA.</p>`;
    return `
      <form class="cr-cr" id="form-cr">
        <div class="fr-alert fr-alert--info fr-alert--sm fr-mb-3w"><p>Texte rédigé par une IA : relisez-le et modifiez-le avant diffusion. Les incohérences non résolues sont listées dans l'export.</p></div>
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
          <li><button class="fr-btn fr-btn--secondary fr-icon-download-line fr-btn--icon-left" type="button" data-export="docx">Exporter en Word (.docx)</button></li>
          <li><button class="fr-btn fr-btn--tertiary fr-icon-download-line fr-btn--icon-left" type="button" data-export="md">Exporter en Markdown</button></li>
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

  function ongletJournal(r) {
    const libelles = { creation: "Dépôt de l'audio", transcription: "Transcription", analyse: "Analyse IA", correction: "Correction",
      renommage_locuteur: "Nom d'interlocuteur", ajout_locuteur: "Ajout d'interlocuteur", edition_compte_rendu: "Modification du compte rendu",
      export: "Export", suppression_audio: "Suppression de l'audio", purge_audio: "Purge automatique de l'audio" };
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
    if (!lireStockage("cr-jeton")) { lecteur.src = `/api/reunions/${r.id}/audio`; return; }
    // avec un jeton, l'audio est récupéré via fetch (l'élément <audio> ne peut pas envoyer d'en-tête)
    if (etat.audioPour !== r.id) {
      if (etat.audioUrl) URL.revokeObjectURL(etat.audioUrl);
      etat.audioUrl = null; etat.audioPour = r.id;
      try { etat.audioUrl = URL.createObjectURL(await (await api("GET", `/api/reunions/${r.id}/audio`, undefined, true)).blob()); } catch { /* audio indisponible */ }
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
    if (d.onglet) { etat.onglet = d.onglet; afficherReunion(); document.getElementById(`onglet-${d.onglet}`).focus(); return; }
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
    if (d.export) {
      try {
        // enregistre d'abord les modifications en cours
        await api("PUT", `${base()}/compte-rendu`, lireCompteRendu());
        const r = await api("GET", `${base()}/export?format=${d.export}`, undefined, true);
        const lien = document.createElement("a");
        lien.href = URL.createObjectURL(await r.blob());
        const cd = r.headers.get("Content-Disposition") || "";
        const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cd);
        lien.download = utf8 ? decodeURIComponent(utf8[1]) : ((/filename="([^"]+)"/.exec(cd) || [])[1] || `compte-rendu.${d.export}`);
        document.body.appendChild(lien); lien.click(); lien.remove();
        setTimeout(() => URL.revokeObjectURL(lien.href), 10000);
      } catch (err) { notifier(err.message, "error"); }
      return;
    }
    if (d.action === "analyser") {
      const lien = document.getElementById("lien-ia").value.trim();
      const modele = document.getElementById("modele-ia").value.trim() || null;
      const accepte = document.getElementById("accepte-hors-ue");
      etat.lienIa = lien;
      return action(() => api("POST", `${base()}/analyse`, { lien, modele, accepte_hors_ue: !!(accepte && accepte.checked) }), "Analyse lancée.");
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
    if (t.id === "filtre") { etat.filtre = t.value; afficherReunion(); document.getElementById("filtre").focus(); }
    if (t.dataset.locuteur) action(() => api("PATCH", `${base()}/segments/${t.dataset.locuteur}`, { locuteur: t.value }), "Interlocuteur modifié.");
  });

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
    if (f.id === "form-cr") { e.preventDefault(); return action(() => api("PUT", `${base()}/compte-rendu`, lireCompteRendu()), "Compte rendu enregistré."); }
  });

  // ------------------------------------------------------------ aide / données personnelles
  function pageAide() {
    document.title = "Aide et données personnelles — Compte rendu de réunion";
    const c = etat.config;
    $app.innerHTML = `
      <h1>Aide et données personnelles</h1>
      <h2>Fonctionnement</h2>
      <ol>
        <li><strong>Dépôt</strong> : l'enregistrement est transcrit sur le serveur de l'administration (Whisper) et les voix sont séparées (pyannote). L'audio ne quitte pas le serveur.</li>
        <li><strong>Interlocuteurs</strong> : écoutez un extrait de chaque voix et saisissez le nom correspondant.</li>
        <li><strong>Analyse</strong> : choisissez l'IA en collant le lien du fournisseur (ex. https://mistral.ai/fr/). Seul le <em>texte</em> de la transcription lui est envoyé. Elle note chaque intervention de 0 à 100 % et rapporte les incohérences.</li>
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
      <h2 id="donnees">Données personnelles</h2>
      <p>Les enregistrements contiennent la voix et les propos des participants (données personnelles). Le responsable de traitement est l'administration qui exploite ce service ; contactez son délégué à la protection des données (DPO) pour exercer vos droits.</p>
      <ul>
        <li>Finalité : rédaction des comptes rendus de réunion. Base légale : mission d'intérêt public (RGPD, art. 6-1-e).</li>
        <li>Les participants doivent être informés avant l'enregistrement.</li>
        <li>Aucune empreinte vocale n'est conservée ; les interlocuteurs sont nommés manuellement pour chaque réunion.</li>
        <li>Durées de conservation : audio ${c.retention_audio_jours} jours, transcription et compte rendu ${c.retention_reunion_jours} jours, puis suppression automatique. Suppression manuelle possible à tout moment.</li>
        <li>Fournisseurs d'IA : ${c.fournisseurs.map((f) => `${esc(f.nom)} (${esc(f.hebergement)})`).join(", ")}.</li>
      </ul>
      <h2 id="cookies">Cookies</h2>
      <p>Ce service ne dépose aucun cookie ni traceur. Seul le jeton d'accès éventuel est conservé dans la session du navigateur.</p>
      <h2 id="accessibilite">Accessibilité</h2>
      <p>Ce service est conçu avec le Système de design de l'État (DSFR) selon le RGAA 4.1. Il n'a pas encore fait l'objet d'un audit de conformité.</p>`;
  }

  router();
})();
