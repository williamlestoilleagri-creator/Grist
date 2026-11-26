/* Contrôles terrain — établissements, grilles de contrôle, saisie sur tablette, rapport, suites administratives, carte */
(function () {
  'use strict';
  const h = S.h;
  const db = S.db('controles', ['grilles', 'controles', 'etablissements']);
  const VALS = { C: ['Conforme', 'success'], NC: ['Non conforme', 'error'], SO: ['Sans objet', ''], NE: ['Non évalué', 'new'] };
  const POIDS = { mineure: 1, majeure: 3, critique: 10 };
  const NIVEAUX = [['Très satisfaisant', '#18753c'], ['Satisfaisant', '#68a532'], ['À améliorer', '#c3992a'], ['À corriger de manière urgente', '#ce0500']];
  const SUITES = ['Aucune', 'Rappel à la réglementation', 'Avertissement', 'Mise en demeure', 'Procès-verbal', 'Fermeture / suspension', 'Contre-visite'];
  const ST = { planifie: ['Planifié', 'info'], encours: ['En cours', 'warning'], termine: ['Réalisé', 'success'], clos: ['Clos', ''] };

  if (!S.load('controles:init')) {
    S.save('controles:init', 1);
    const it = (lines) => lines.trim().split('\n').map((l) => { const [section, libelle, poids, ref] = l.split('|').map((x) => x.trim()); return { id: S.uid('i'), section, libelle, poids: poids || 'mineure', ref: ref || '' }; });
    db.save('grilles', { nom: 'Hygiène — restauration commerciale (extrait)', domaine: 'Sécurité sanitaire des aliments', items: it(`
Locaux|Locaux propres et en bon état d’entretien|majeure|Règlement (CE) n° 852/2004
Locaux|Séparation secteur propre / secteur souillé|majeure|Règlement (CE) n° 852/2004
Locaux|Lave-mains à commande non manuelle, savon, essuie-mains jetables|mineure|Règlement (CE) n° 852/2004
Chaîne du froid|Températures des enceintes froides conformes et relevées|critique|Arrêté du 21 décembre 2009
Chaîne du froid|Absence de denrées à DLC dépassée|critique|Règlement (CE) n° 852/2004
Traçabilité|Étiquetage et traçabilité des matières premières|majeure|Règlement (CE) n° 178/2002
Traçabilité|Information sur les allergènes disponible pour le consommateur|majeure|Règlement (UE) n° 1169/2011
Personnel|Tenue de travail propre et adaptée|mineure|Règlement (CE) n° 852/2004
Personnel|Formation à l’hygiène alimentaire d’au moins une personne|mineure|Code rural, art. L. 233-4
Maîtrise sanitaire|Plan de maîtrise sanitaire (PMS) établi et appliqué|majeure|Règlement (CE) n° 852/2004
Maîtrise sanitaire|Plan de lutte contre les nuisibles|mineure|Règlement (CE) n° 852/2004`) }, true);
    db.save('grilles', { nom: 'Bien-être animal en élevage (extrait)', domaine: 'Santé et protection animales', items: it(`
Registre|Registre d’élevage tenu à jour|majeure|Arrêté du 5 juin 2000
Registre|Traitements vétérinaires enregistrés|majeure|Arrêté du 5 juin 2000
Logement|Bâtiments permettant aux animaux de se coucher, se lever et se reposer|majeure|Directive 98/58/CE
Logement|Ventilation et éclairage adaptés|mineure|Directive 98/58/CE
Alimentation|Accès à l’eau et à une alimentation adaptée|critique|Directive 98/58/CE
Soins|Animaux malades ou blessés isolés et soignés|critique|Directive 98/58/CE
Soins|Inspection quotidienne des animaux|mineure|Directive 98/58/CE`) }, true);
    db.save('grilles', { nom: 'Distribution de produits phytopharmaceutiques (extrait)', domaine: 'Santé des végétaux', items: it(`
Agrément|Agrément de l’établissement en cours de validité|critique|Code rural, art. L. 254-1
Agrément|Certificats individuels (Certiphyto) des vendeurs|majeure|Code rural, art. L. 254-3
Stockage|Local de stockage fermé, ventilé et réservé|majeure|Arrêté du 4 août 2006
Stockage|Absence de produits retirés du marché|critique|Règlement (CE) n° 1107/2009
Vente|Conseil individualisé formalisé lors de la vente|majeure|Code rural, art. L. 254-7
Registre|Registre des ventes tenu à jour|mineure|Code rural`) }, true);
  }

  const grille = (c) => db.get('grilles', c.grilleId);
  const etab = (c) => db.get('etablissements', c.etablissementId) || { nom: c.etablissement || '?', siret: c.siret, adresse: c.adresse, lat: c.lat, lon: c.lon };
  function bilan(c) {
    const g = grille(c); if (!g) return { taux: null, nc: [], niveau: null, rep: 0, total: 0 };
    const rep = c.reponses || {};
    let pts = 0, max = 0; const nc = [];
    g.items.forEach((i) => { const r = rep[i.id]; const w = POIDS[i.poids] || 1; if (!r || r.val === 'SO' || r.val === 'NE') return; max += w; if (r.val === 'C') pts += w; else nc.push(i); });
    const niveau = !max ? null : nc.some((i) => i.poids === 'critique') ? 3 : nc.some((i) => i.poids === 'majeure') ? 2 : nc.length ? 1 : 0;
    return { taux: max ? Math.round((pts / max) * 100) : null, nc, niveau, rep: g.items.filter((i) => rep[i.id]?.val).length, total: g.items.length };
  }
  const nivBadge = (n) => (n == null ? '' : h('span', { class: 'fr-badge fr-badge--sm fr-badge--no-icon', style: { background: NIVEAUX[n][1], color: '#fff' } }, NIVEAUX[n][0]));

  document.head.append(h('style', {}, `
.ct-item{border:1px solid var(--border-default-grey);border-left:5px solid var(--border-default-grey);padding:.75rem 1rem;margin-bottom:.75rem;background:var(--background-default-grey)}
.ct-item.C{border-left-color:#18753c}.ct-item.NC{border-left-color:#ce0500}.ct-item.SO,.ct-item.NE{border-left-color:#929292}
.ct-vals{display:flex;flex-wrap:wrap;gap:.5rem;margin:.5rem 0}
.ct-vals button{min-width:7rem}
.ct-vals button[aria-pressed=true].C{background:#18753c;color:#fff}.ct-vals button[aria-pressed=true].NC{background:#ce0500;color:#fff}.ct-vals button[aria-pressed=true].SO,.ct-vals button[aria-pressed=true].NE{background:#666;color:#fff}
.ct-photos{display:flex;flex-wrap:wrap;gap:.5rem}.ct-photos img{width:96px;height:72px;object-fit:cover;border:1px solid var(--border-default-grey);cursor:pointer}
.ct-sig{border:1px dashed var(--border-plain-grey);background:#fff;touch-action:none;width:100%;max-width:480px;height:160px}
.ct-map{height:380px;border:1px solid var(--border-default-grey)}
.ct-sticky{position:sticky;top:0;z-index:10;background:var(--background-default-grey);padding:.5rem 0;border-bottom:1px solid var(--border-default-grey)}
`));
  S.init({
    titre: 'Contrôles terrain', sousTitre: 'Inspections, rapports, suites', db,
    grist: { controles: 'Controles', etablissements: 'Controles_etablissements', grilles: 'Controles_grilles' },
    nav: [{ id: 'accueil', label: 'Tableau de bord' }, { id: 'planning', label: 'Contrôles' }, { id: 'etab', label: 'Établissements' }, { id: 'suites', label: 'Suites' }, { id: 'grilles', label: 'Grilles' }],
    render(r, p, v) { S.clear(v); ({ accueil, planning, etab: etabV, suites, grilles, saisie, rapport }[r] || accueil)(v, ...p); },
  });

  /* ---------- Tableau de bord ---------- */
  function accueil(v) {
    const all = db.list('controles');
    const mois = S.isoDate(new Date()).slice(0, 7);
    const realises = all.filter((c) => ['termine', 'clos'].includes(c.statut));
    const taux = realises.map((c) => bilan(c).taux).filter((x) => x != null);
    const suitesEnCours = realises.filter((c) => c.suite && c.suite !== 'Aucune' && !c.suiteSoldee);
    const mapEl = h('div', { class: 'ct-map' });
    S.add(v,
      S.bar('Tableau de bord', S.btn('Planifier un contrôle', () => planifier(), '', 'fr-icon-add-line')),
      S.kpis([
        { v: all.filter((c) => c.statut === 'planifie').length, l: 'contrôles planifiés', onClick: () => S.go('planning') },
        { v: realises.filter((c) => (c.dateRealisee || '').startsWith(mois)).length, l: 'réalisés ce mois-ci' },
        { v: taux.length ? Math.round(taux.reduce((a, b) => a + b, 0) / taux.length) + ' %' : '—', l: 'taux de conformité moyen' },
        { v: realises.filter((c) => bilan(c).niveau === 3).length, l: 'non-conformités critiques', type: realises.some((c) => bilan(c).niveau === 3) ? 'err' : 'ok' },
        { v: suitesEnCours.length, l: 'suites en cours', type: suitesEnCours.length ? 'warn' : '', onClick: () => S.go('suites') },
      ]),
      h('div', { class: 's-cols' },
        h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, 'Carte des contrôles'), mapEl, h('div', { class: 's-tags fr-mt-1w' }, NIVEAUX.map(([n, c]) => h('span', { class: 's-small fr-mr-2w' }, h('span', { class: 's-dot', style: { background: c } }), n)), h('span', { class: 's-small' }, h('span', { class: 's-dot', style: 'background:#0063cb' }), 'Planifié'))),
        h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, 'Prochains contrôles'), (() => { const arr = all.filter((c) => c.statut === 'planifie' || c.statut === 'encours').sort((a, b) => ((a.datePrevue || '9') < (b.datePrevue || '9') ? -1 : 1)).slice(0, 10); return arr.length ? h('ul', { class: 'fr-raw-list' }, arr.map((c) => h('li', { class: 'fr-mb-1w' }, h('a', { class: 'fr-link', href: '#/saisie/' + c.id }, etab(c).nom), ' ', S.badge(...ST[c.statut]), h('div', { class: 's-small s-mention' }, `${c.datePrevue ? S.fmtDate(c.datePrevue) : 'date à fixer'} · ${grille(c)?.nom || 'grille à choisir'}`)))) : h('p', { class: 's-mention' }, 'Aucun contrôle planifié.'); })())));
    setTimeout(() => {
      const map = L.map(mapEl).setView([48.2, -2.9], 7);
      L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', { attribution: '© IGN', maxZoom: 19 }).addTo(map);
      const pts = [];
      all.forEach((c) => { const e = etab(c); if (e.lat == null || e.lon == null || isNaN(e.lat)) return; const b = bilan(c); const col = c.statut === 'planifie' ? '#0063cb' : b.niveau != null ? NIVEAUX[b.niveau][1] : '#666'; pts.push([e.lat, e.lon]); L.circleMarker([e.lat, e.lon], { radius: 8, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1 }).addTo(map).bindPopup(`<strong>${S.esc(e.nom)}</strong><br>${S.esc(grille(c)?.nom || '')}<br>${S.esc(ST[c.statut][0])} ${c.dateRealisee ? S.fmtDate(c.dateRealisee) : c.datePrevue ? S.fmtDate(c.datePrevue) : ''}${b.taux != null ? '<br>Conformité : ' + b.taux + ' %' : ''}<br><a href="#/${c.statut === 'planifie' ? 'saisie' : 'rapport'}/${c.id}">Ouvrir</a>`); });
      if (pts.length) map.fitBounds(pts, { maxZoom: 12, padding: [20, 20] });
    }, 50);
  }

  /* ---------- Établissements ---------- */
  async function editEtab(e = {}) {
    const fields = [
      { name: 'nom', label: 'Raison sociale / nom', required: true }, { name: 'siret', label: 'SIRET / SIREN / n° EDE / PACAGE' },
      { name: 'adresse', label: 'Adresse', full: true }, { name: 'activite', label: 'Activité' },
      { name: 'contact', label: 'Responsable / contact' }, { name: 'tel', label: 'Téléphone', type: 'tel' }, { name: 'email', label: 'Courriel', type: 'email' },
      { name: 'lat', label: 'Latitude', type: 'number', step: 'any' }, { name: 'lon', label: 'Longitude', type: 'number', step: 'any' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
    ];
    const f = S.form(fields, e);
    const info = h('p', { class: 's-small s-mention' });
    f.el.prepend(h('div', { class: 's-full fr-btns-group fr-btns-group--inline-sm fr-btns-group--icon-left' },
      S.btn('Compléter depuis le SIRET (API Entreprises)', async () => {
        const q = f.get().siret || f.get().nom; if (!q) return S.toast('Saisissez un SIRET ou un nom', 'info');
        info.textContent = 'Recherche…';
        try { const j = await S.fetchJSON(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=1`, {}, { proxy: false }); const r = j.results?.[0]; if (!r) { info.textContent = 'Aucun résultat'; return; }
          f.set('nom', r.nom_complet); f.set('siret', r.siege?.siret || r.siren); f.set('adresse', r.siege?.adresse || ''); f.set('activite', (r.activite_principale || '') + (r.libelle_activite_principale ? ' — ' + r.libelle_activite_principale : '')); if (r.siege?.latitude) { f.set('lat', r.siege.latitude); f.set('lon', r.siege.longitude); } if (r.dirigeants?.[0]) f.set('contact', [r.dirigeants[0].prenoms, r.dirigeants[0].nom].filter(Boolean).join(' ') || r.dirigeants[0].denomination || '');
          info.textContent = `✔ ${r.nom_complet} — ${r.etat_administratif === 'A' ? 'active' : 'cessée'}`; } catch (er) { info.textContent = 'API indisponible : ' + er.message; }
      }, 'fr-btn--secondary fr-btn--sm', 'fr-icon-search-line'),
      S.btn('Géocoder l’adresse', async () => { try { const r = (await S.geocode(f.get().adresse, 1))[0]; if (r) { f.set('lat', r.lat); f.set('lon', r.lon); info.textContent = '✔ ' + r.label; } else info.textContent = 'Adresse introuvable'; } catch (er) { info.textContent = er.message; } }, 'fr-btn--secondary fr-btn--sm', 'fr-icon-map-pin-2-line'),
      info));
    return new Promise((res) => {
      S.modal({ titre: e.id ? 'Modifier l’établissement' : 'Nouvel établissement', body: f.el, taille: 'wide', onClose: () => res(null), actions: [
        ...(e.id ? [{ label: 'Supprimer', onClick: () => { db.remove('etablissements', e.id); S.refresh(); } }] : []),
        { label: 'Annuler' },
        { label: 'Enregistrer', primary: true, onClick: () => { if (!f.validate()) return false; const o = db.save('etablissements', Object.assign(e, f.get())); res(o); S.refresh(); } }] });
    });
  }
  function etabV(v) {
    let q = '';
    const zone = h('div');
    const draw = () => S.add(S.clear(zone), S.table([
      { key: 'nom', label: 'Établissement', render: (e) => h('div', {}, h('strong', {}, e.nom), h('div', { class: 's-small s-mention' }, e.activite || '')) },
      { key: 'siret', label: 'Identifiant' }, { key: 'adresse', label: 'Adresse' },
      { key: 'n', label: 'Contrôles', class: 'num', render: (e) => db.list('controles').filter((c) => c.etablissementId === e.id).length },
      { key: 'der', label: 'Dernier résultat', render: (e) => { const c = db.list('controles').filter((x) => x.etablissementId === e.id && x.dateRealisee).sort((a, b) => (a.dateRealisee < b.dateRealisee ? 1 : -1))[0]; return c ? h('span', {}, nivBadge(bilan(c).niveau), ' ', S.fmtDate(c.dateRealisee)) : '—'; } },
      { key: 'a', label: '', render: (e) => S.btn('Planifier', () => planifier({ etablissementId: e.id }), 'fr-btn--sm fr-btn--secondary') },
    ], db.list('etablissements').filter((e) => !q || S.norm(Object.values(e).join(' ')).includes(S.norm(q))), { onRow: editEtab, empty: 'Aucun établissement.' }));
    S.add(v, S.bar('Établissements', S.btn('Importer CSV', async () => { const f = await S.pickFile('.csv'); if (!f) return; const rows = S.parseCSV(await S.readText(f)); const g = (r, ...ns) => { const k = Object.keys(r).find((x) => ns.includes(S.norm(x))); return k ? r[k] : ''; }; rows.forEach((r) => db.save('etablissements', { nom: g(r, 'nom', 'raison sociale', 'raison_sociale'), siret: g(r, 'siret', 'siren'), adresse: g(r, 'adresse'), activite: g(r, 'activite'), tel: g(r, 'tel', 'telephone'), email: g(r, 'email', 'courriel'), lat: Number(g(r, 'lat', 'latitude')) || undefined, lon: Number(g(r, 'lon', 'longitude')) || undefined }, true)); db.setAll('etablissements', db.list('etablissements')); S.toast(rows.length + ' établissement(s) importé(s)', 'success'); S.refresh(); }, 'fr-btn--secondary', 'fr-icon-upload-line'), S.btn('Ajouter', () => editEtab(), '', 'fr-icon-add-line')),
      h('div', { class: 's-toolbar' }, S.search('Rechercher', (x) => { q = x; draw(); })), zone);
    draw();
  }

  /* ---------- Planification ---------- */
  async function planifier(base = {}) {
    if (!db.list('etablissements').length && !base.etablissementId) { const e = await editEtab(); if (!e) return; base.etablissementId = e.id; }
    const x = await S.formModal(base.id ? 'Modifier le contrôle' : 'Planifier un contrôle', [
      { name: 'etablissementId', label: 'Établissement', type: 'select', required: true, options: db.list('etablissements').map((e) => ({ value: e.id, label: e.nom + (e.siret ? ' — ' + e.siret : '') })) },
      { name: 'grilleId', label: 'Grille de contrôle', type: 'select', required: true, options: db.list('grilles').map((g) => ({ value: g.id, label: g.nom })) },
      { name: 'datePrevue', label: 'Date prévue', type: 'date' },
      { name: 'inspecteur', label: 'Inspecteur', default: S.me() },
      { name: 'motif', label: 'Motif', type: 'select', options: ['Programmé', 'Suite à plainte', 'Suite à alerte', 'Contre-visite', 'Ciblé (analyse de risque)', 'Aléatoire'] },
      { name: 'inopine', label: 'Contrôle inopiné', type: 'checkbox' },
      { name: 'notes', label: 'Notes de préparation', type: 'textarea', rows: 2 },
    ], base, { extraActions: [{ label: 'Nouvel établissement…', onClick: async () => { const e = await editEtab(); if (e) planifier(Object.assign(base, { etablissementId: e.id })); } }] });
    if (!x) return;
    const c = Object.assign(base, x); if (!c.statut) c.statut = 'planifie'; c.reponses = c.reponses || {};
    db.save('controles', c); S.toast('Contrôle planifié', 'success'); S.refresh();
  }
  function planning(v) {
    const st = S.load('controles:f', { statut: '', grille: '', q: '' });
    const zone = h('div');
    const draw = () => {
      S.save('controles:f', st);
      const arr = db.list('controles').filter((c) => (!st.statut || c.statut === st.statut) && (!st.grille || c.grilleId === st.grille) && (!st.q || S.norm(etab(c).nom + ' ' + (c.inspecteur || '') + ' ' + (etab(c).adresse || '')).includes(S.norm(st.q)))).sort((a, b) => ((a.dateRealisee || a.datePrevue || '') < (b.dateRealisee || b.datePrevue || '') ? 1 : -1));
      S.add(S.clear(zone), S.table([
        { key: 'date', label: 'Date', render: (c) => S.fmtDate(c.dateRealisee || c.datePrevue) || 'à fixer', sort: (c) => c.dateRealisee || c.datePrevue || '' },
        { key: 'etab', label: 'Établissement', render: (c) => h('div', {}, h('strong', {}, etab(c).nom), h('div', { class: 's-small s-mention' }, etab(c).adresse || '')), sort: (c) => etab(c).nom },
        { key: 'grille', label: 'Grille', render: (c) => grille(c)?.nom || '—' },
        { key: 'inspecteur', label: 'Inspecteur' },
        { key: 'statut', label: 'Statut', render: (c) => S.badge(...ST[c.statut]) },
        { key: 'res', label: 'Résultat', render: (c) => { const b = bilan(c); return c.statut === 'planifie' ? '' : h('span', {}, nivBadge(b.niveau), b.taux != null ? ` ${b.taux} %` : ''); } },
        { key: 'a', label: '', render: (c) => h('div', { class: 's-nowrap' }, S.btn(c.statut === 'planifie' ? 'Démarrer' : 'Saisie', () => S.go('saisie/' + c.id), 'fr-btn--sm'), ' ', c.statut !== 'planifie' ? S.btn('Rapport', () => S.go('rapport/' + c.id), 'fr-btn--sm fr-btn--secondary') : S.iconBtn('Modifier', 'fr-icon-edit-line', () => planifier(c))) },
      ], arr, { empty: 'Aucun contrôle.' }));
    };
    S.add(v, S.bar('Contrôles', S.btn('Exporter CSV', () => S.download('controles.csv', S.toCSV(db.list('controles').map((c) => { const b = bilan(c); return { date: c.dateRealisee || c.datePrevue, etablissement: etab(c).nom, siret: etab(c).siret, grille: grille(c)?.nom, inspecteur: c.inspecteur, statut: c.statut, motif: c.motif, taux: b.taux, niveau: b.niveau != null ? NIVEAUX[b.niveau][0] : '', nonConformites: b.nc.length, suite: c.suite, delaiSuite: c.delaiSuite }; }))), 'fr-btn--secondary', 'fr-icon-download-line'), S.btn('Planifier', () => planifier(), '', 'fr-icon-add-line')),
      h('div', { class: 's-toolbar' }, S.search('Rechercher', (q) => { st.q = q; draw(); }, st.q),
        S.select('Statut', [{ value: '', label: 'Tous' }, ...Object.entries(ST).map(([k, [l]]) => ({ value: k, label: l }))], st.statut, (x) => { st.statut = x; draw(); }),
        S.select('Grille', [{ value: '', label: 'Toutes' }, ...db.list('grilles').map((g) => ({ value: g.id, label: g.nom }))], st.grille, (x) => { st.grille = x; draw(); })),
      zone);
    draw();
  }

  /* ---------- Saisie terrain ---------- */
  function saisie(v, id) {
    const c = db.get('controles', id);
    if (!c) return S.add(v, S.alert('Contrôle introuvable', '', 'error'));
    const g = grille(c); const e = etab(c);
    if (!g) return S.add(v, S.alert('Grille introuvable', 'Modifiez le contrôle pour choisir une grille.', 'error'), S.btn('Modifier', () => planifier(c)));
    if (c.statut === 'planifie') { c.statut = 'encours'; c.debut = new Date().toISOString(); c.dateRealisee = S.isoDate(new Date()); db.save('controles', c, true); }
    c.reponses = c.reponses || {};
    const save = S.debounce(() => db.save('controles', c, true), 300);
    const prog = h('progress', { max: g.items.length, style: 'width:100%;height:.6rem' });
    const progTxt = h('span', { class: 's-small' });
    const upd = () => { const b = bilan(c); prog.value = b.rep; progTxt.textContent = `${b.rep}/${b.total} points renseignés · ${b.nc.length} non-conformité(s)` + (b.taux != null ? ` · ${b.taux} % de conformité` : ''); };
    const sections = [...new Set(g.items.map((i) => i.section || 'Général'))];
    const item = (i) => {
      const r = c.reponses[i.id] = c.reponses[i.id] || {};
      const box = h('div', { class: 'ct-item ' + (r.val || '') });
      const photos = h('div', { class: 'ct-photos' });
      const drawPhotos = async () => { S.clear(photos); for (const fid of r.photos || []) { const b = await S.files.get(fid); if (b) { const u = URL.createObjectURL(b); photos.append(h('img', { src: u, alt: 'Photo', title: 'Cliquer pour agrandir / supprimer', onclick: () => S.modal({ titre: 'Photo', body: h('img', { src: u, style: 'max-width:100%' }), actions: [{ label: 'Supprimer la photo', onClick: async () => { await S.files.del(fid); r.photos = r.photos.filter((x) => x !== fid); save(); drawPhotos(); } }] }) })); } } };
      const vals = h('div', { class: 'ct-vals', role: 'group', 'aria-label': 'Évaluation' }, Object.entries(VALS).map(([k, [l]]) => h('button', { type: 'button', class: 'fr-btn fr-btn--sm fr-btn--secondary ' + k, 'aria-pressed': String(r.val === k), onclick: (ev) => { r.val = r.val === k ? '' : k; box.className = 'ct-item ' + (r.val || ''); vals.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget && !!r.val))); save(); upd(); } }, l)));
      const obs = h('textarea', { class: 'fr-input', rows: 2, placeholder: 'Observations, constats, mesures demandées…', oninput: (ev) => { r.obs = ev.target.value; save(); } }); obs.value = r.obs || '';
      const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', multiple: true, style: 'display:none', onchange: async (ev) => { for (const f of ev.target.files) { const fid = await S.files.put(await reduire(f)); r.photos = (r.photos || []).concat(fid); } save(); drawPhotos(); } });
      S.add(box, h('div', { style: 'display:flex;justify-content:space-between;gap:1rem' }, h('strong', {}, i.libelle), h('span', { class: 'fr-badge fr-badge--sm fr-badge--no-icon ' + (i.poids === 'critique' ? 'fr-badge--error' : i.poids === 'majeure' ? 'fr-badge--warning' : '') }, i.poids)),
        i.ref ? h('p', { class: 's-small s-mention fr-mb-0' }, 'Réf. : ' + i.ref) : null, vals, obs,
        h('div', { class: 'fr-mt-1w', style: 'display:flex;gap:1rem;align-items:center;flex-wrap:wrap' }, cam, S.btn('Photo', () => cam.click(), 'fr-btn--tertiary fr-btn--sm', 'fr-icon-camera-line'), photos));
      drawPhotos();
      return box;
    };
    // Signature
    const sig = h('canvas', { class: 'ct-sig', width: 480, height: 160, 'aria-label': 'Zone de signature' });
    setTimeout(() => {
      const ctx = sig.getContext('2d'); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#161616';
      if (c.signature) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0); im.src = c.signature; }
      let draw = false;
      const pos = (ev) => { const b = sig.getBoundingClientRect(); return [(ev.clientX - b.left) * (sig.width / b.width), (ev.clientY - b.top) * (sig.height / b.height)]; };
      sig.addEventListener('pointerdown', (ev) => { draw = true; sig.setPointerCapture(ev.pointerId); ctx.beginPath(); ctx.moveTo(...pos(ev)); });
      sig.addEventListener('pointermove', (ev) => { if (draw) { ctx.lineTo(...pos(ev)); ctx.stroke(); } });
      sig.addEventListener('pointerup', () => { draw = false; c.signature = sig.toDataURL('image/png'); save(); });
    }, 50);
    const fin = S.form([
      { name: 'presents', label: 'Personnes présentes', placeholder: 'Nom, qualité' },
      { name: 'constat', label: 'Constat général', type: 'textarea', rows: 3 },
      { name: 'suite', label: 'Suite proposée', type: 'select', options: SUITES },
      { name: 'delaiSuite', label: 'Délai de mise en conformité', type: 'date' },
      { name: 'signataire', label: 'Nom du signataire (exploitant / responsable)' },
    ], c);
    fin.el.addEventListener('input', () => { Object.assign(c, fin.get()); save(); }); fin.el.addEventListener('change', () => { Object.assign(c, fin.get()); save(); });
    const geo = h('span', { class: 's-small' }, c.geoloc ? `📍 ${c.geoloc.lat.toFixed(5)}, ${c.geoloc.lon.toFixed(5)} (±${c.geoloc.acc} m)` : '');
    S.add(v,
      h('div', { class: 'ct-sticky' }, h('div', { class: 's-bar', style: 'margin-bottom:.25rem' },
        h('div', {}, h('p', { class: 's-mention fr-mb-0' }, g.nom), h('h1', { class: 'fr-h4 fr-mb-0' }, e.nom)),
        h('div', { class: 's-bar__actions' }, S.btn('Géolocaliser', () => navigator.geolocation?.getCurrentPosition((p) => { c.geoloc = { lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }; if (e.id && (e.lat == null || e.lat === '')) { e.lat = c.geoloc.lat; e.lon = c.geoloc.lon; db.save('etablissements', e, true); } save(); geo.textContent = `📍 ${c.geoloc.lat.toFixed(5)}, ${c.geoloc.lon.toFixed(5)} (±${c.geoloc.acc} m)`; }, (er) => S.toast(er.message, 'warning'), { enableHighAccuracy: true }), 'fr-btn--tertiary fr-btn--sm', 'fr-icon-map-pin-2-line'), S.btn('Rapport', () => { db.save('controles', c, true); S.go('rapport/' + c.id); }, 'fr-btn--secondary fr-btn--sm', 'fr-icon-file-text-line'))),
        prog, progTxt, ' ', geo),
      h('p', { class: 's-small fr-mt-1w' }, [e.adresse, e.siret, e.contact, c.motif, c.inopine ? 'inopiné' : ''].filter(Boolean).join(' · ')),
      h('div', { class: 'fr-btns-group fr-btns-group--inline-sm fr-mb-2w' }, S.btn('Tout le reste conforme', () => { g.items.forEach((i) => { c.reponses[i.id] = c.reponses[i.id] || {}; if (!c.reponses[i.id].val) c.reponses[i.id].val = 'C'; }); db.save('controles', c, true); S.refresh(); }, 'fr-btn--tertiary fr-btn--sm', 'fr-icon-check-line')),
      sections.map((s) => [h('h2', { class: 'fr-h5 fr-mt-3w' }, s), g.items.filter((i) => (i.section || 'Général') === s).map(item)]),
      h('h2', { class: 'fr-h5 fr-mt-4w' }, 'Conclusion'), h('div', { class: 's-panel' }, fin.el,
        h('p', { class: 'fr-label fr-mt-2w' }, 'Signature du responsable de l’établissement'), sig,
        h('div', { class: 'fr-btns-group fr-btns-group--inline-sm fr-mt-1w' }, S.btn('Effacer la signature', () => { sig.getContext('2d').clearRect(0, 0, sig.width, sig.height); c.signature = ''; save(); }, 'fr-btn--tertiary fr-btn--sm'))),
      h('div', { class: 'fr-btns-group fr-btns-group--inline fr-btns-group--icon-left fr-mb-4w' },
        S.btn('Terminer le contrôle', () => { const b = bilan(c); if (b.rep < b.total && !confirm(`${b.total - b.rep} point(s) non renseigné(s). Terminer quand même ?`)) return; Object.assign(c, fin.get()); c.statut = 'termine'; c.fin = new Date().toISOString(); c.niveau = b.niveau != null ? NIVEAUX[b.niveau][0] : ''; c.taux = b.taux; db.save('controles', c); S.go('rapport/' + c.id); }, '', 'fr-icon-check-line')));
    upd();
  }
  async function reduire(file, max = 1600) {
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      return await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.8));
    } catch (e) { return file; }
  }

  /* ---------- Rapport ---------- */
  async function rapport(v, id) {
    const c = db.get('controles', id);
    if (!c) return S.add(v, S.alert('Contrôle introuvable', '', 'error'));
    const g = grille(c), e = etab(c), b = bilan(c), s = S.settings();
    const photoEls = async (r) => { const out = []; for (const fid of r?.photos || []) { const bl = await S.files.get(fid); if (bl) out.push(h('img', { src: URL.createObjectURL(bl), style: 'width:140px;height:105px;object-fit:cover;margin:2px;border:1px solid #ccc', alt: 'Photo' })); } return out; };
    const ncRows = [];
    for (const i of b.nc) ncRows.push(h('tr', {}, h('td', {}, i.section), h('td', {}, i.libelle, h('div', { class: 's-small s-mention' }, i.ref)), h('td', {}, i.poids), h('td', {}, c.reponses[i.id]?.obs || '', h('div', {}, await photoEls(c.reponses[i.id])))));
    S.add(v,
      h('div', { class: 's-bar s-noprint' }, h('a', { class: 'fr-link fr-icon-arrow-left-line fr-link--icon-left', href: '#/saisie/' + c.id }, 'Retour à la saisie'),
        h('div', { class: 's-bar__actions' },
          c.suite && c.suite !== 'Aucune' && !c.contreVisiteId ? S.btn('Programmer une contre-visite', () => { const cv = db.save('controles', { etablissementId: c.etablissementId, grilleId: c.grilleId, datePrevue: c.delaiSuite || S.isoDate(S.addDays(new Date(), 30)), inspecteur: c.inspecteur, motif: 'Contre-visite', statut: 'planifie', reponses: {}, origineId: c.id }); c.contreVisiteId = cv.id; db.save('controles', c); S.toast('Contre-visite planifiée', 'success'); S.refresh(); }, 'fr-btn--secondary', 'fr-icon-calendar-event-line') : null,
          S.btn('Courrier de suite (Actes)', () => { S.save('actes:prefill', { modele: c.suite, donnees: { etablissement: e.nom, siret: e.siret, adresse: e.adresse, contact: e.contact, date_controle: S.fmtDate(c.dateRealisee), grille: g?.nom, non_conformites: b.nc.map((i) => '- ' + i.libelle + (c.reponses[i.id]?.obs ? ' : ' + c.reponses[i.id].obs : '')).join('\n'), delai: S.fmtDate(c.delaiSuite), inspecteur: c.inspecteur, taux: b.taux } }); location.href = '../actes/index.html#/rediger'; }, 'fr-btn--secondary', 'fr-icon-draft-line'),
          S.btn('Imprimer / PDF', () => print(), '', 'fr-icon-printer-line'))),
      h('div', { class: 's-panel' },
        h('div', { style: 'display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap' }, h('div', {}, h('p', { class: 'fr-logo', html: S.marqueHTML(), style: 'font-size:.9rem' }), h('p', { class: 's-small fr-mt-1w' }, s.entiteLongue || s.entite)), h('div', { style: 'text-align:right' }, h('p', { class: 's-small' }, 'Rapport d’inspection', h('br'), `Réf. CTRL-${S.isoDate(c.dateRealisee || new Date()).replace(/-/g, '')}-${c.id.slice(-4).toUpperCase()}`))),
        h('h1', { class: 'fr-h3 fr-mt-3w' }, 'Rapport de contrôle — ' + e.nom),
        h('div', { class: 'fr-table' }, h('table', {}, h('tbody', {}, [['Établissement', `${e.nom}${e.siret ? ' — ' + e.siret : ''}`], ['Adresse', e.adresse], ['Activité', e.activite], ['Date du contrôle', S.fmtLong(c.dateRealisee) + (c.debut ? ` (${S.hm(c.debut)}${c.fin ? '–' + S.hm(c.fin) : ''})` : '')], ['Inspecteur', c.inspecteur], ['Motif', (c.motif || '') + (c.inopine ? ' (inopiné)' : '')], ['Grille', g?.nom], ['Personnes présentes', c.presents]].filter(([, x]) => x).map(([k, x]) => h('tr', {}, h('th', { scope: 'row', style: 'width:30%' }, k), h('td', {}, x)))))),
        h('h2', { class: 'fr-h5' }, 'Résultat'),
        h('p', { class: 'fr-text--lead' }, nivBadge(b.niveau), b.taux != null ? `  Taux de conformité : ${b.taux} %` : '', ` — ${b.nc.length} non-conformité(s) sur ${b.rep} point(s) évalué(s)`),
        c.constat ? h('p', { style: 'white-space:pre-wrap' }, c.constat) : null,
        b.nc.length ? [h('h2', { class: 'fr-h5' }, 'Non-conformités constatées'), h('div', { class: 'fr-table' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Section'), h('th', {}, 'Point de contrôle'), h('th', {}, 'Gravité'), h('th', {}, 'Constat'))), h('tbody', {}, ncRows)))] : null,
        h('h2', { class: 'fr-h5' }, 'Détail de la grille'),
        h('div', { class: 'fr-table' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Point'), h('th', {}, 'Évaluation'), h('th', {}, 'Observation'))), h('tbody', {}, (g?.items || []).map((i) => { const r = c.reponses[i.id] || {}; return h('tr', {}, h('td', {}, i.libelle), h('td', {}, r.val ? S.badge(...VALS[r.val]) : '—'), h('td', { class: 's-small' }, r.obs || '')); })))),
        h('h2', { class: 'fr-h5' }, 'Suites'),
        h('p', {}, h('strong', {}, c.suite || 'Aucune'), c.delaiSuite ? ` — mise en conformité attendue au plus tard le ${S.fmtDate(c.delaiSuite)}` : ''),
        h('div', { class: 's-cols fr-mt-4w' }, h('div', {}, h('p', { class: 's-small' }, 'L’inspecteur'), h('p', {}, c.inspecteur || '')), h('div', {}, h('p', { class: 's-small' }, 'Le responsable de l’établissement' + (c.signataire ? ' — ' + c.signataire : '')), c.signature ? h('img', { src: c.signature, alt: 'Signature', style: 'max-width:240px' }) : h('p', { class: 's-mention' }, '(non signé)'))),
        c.geoloc ? h('p', { class: 's-small s-mention fr-mt-2w' }, `Position relevée : ${c.geoloc.lat.toFixed(5)}, ${c.geoloc.lon.toFixed(5)}`) : null),
      h('div', { class: 'fr-btns-group fr-btns-group--inline-sm s-noprint' }, c.statut === 'termine' ? S.btn('Clore le dossier', () => { c.statut = 'clos'; db.save('controles', c); S.refresh(); }, 'fr-btn--secondary') : null, S.btn('Supprimer ce contrôle', async () => { if (await S.confirm('Supprimer ce contrôle et ses photos ?')) { for (const r of Object.values(c.reponses || {})) for (const f of r.photos || []) await S.files.del(f).catch(() => {}); db.remove('controles', c.id); S.go('planning'); } }, 'fr-btn--tertiary-no-outline', 'fr-icon-delete-line')));
  }

  /* ---------- Suites ---------- */
  function suites(v) {
    const arr = db.list('controles').filter((c) => c.suite && c.suite !== 'Aucune').sort((a, b) => ((a.delaiSuite || '9') < (b.delaiSuite || '9') ? -1 : 1));
    S.add(v, h('h1', { class: 'fr-h3' }, 'Suites administratives'),
      S.table([
        { key: 'etab', label: 'Établissement', render: (c) => etab(c).nom },
        { key: 'dateRealisee', label: 'Contrôle', render: (c) => S.fmtDate(c.dateRealisee) },
        { key: 'res', label: 'Résultat', render: (c) => nivBadge(bilan(c).niveau) },
        { key: 'suite', label: 'Suite' },
        { key: 'delaiSuite', label: 'Échéance', render: (c) => (c.delaiSuite ? h('span', { style: !c.suiteSoldee && c.delaiSuite < S.isoDate(new Date()) ? 'color:var(--text-default-error);font-weight:700' : '' }, S.fmtDate(c.delaiSuite)) : '') },
        { key: 'cv', label: 'Contre-visite', render: (c) => { const cv = db.get('controles', c.contreVisiteId); return cv ? h('a', { class: 'fr-link', href: '#/' + (cv.statut === 'planifie' ? 'saisie' : 'rapport') + '/' + cv.id }, ST[cv.statut][0] + (cv.dateRealisee ? ' ' + S.fmtDate(cv.dateRealisee) : '')) : '—'; } },
        { key: 'soldee', label: 'Soldée', render: (c) => { const idc = 'sd' + c.id; return h('div', { class: 'fr-checkbox-group fr-checkbox-group--sm' }, h('input', { type: 'checkbox', id: idc, checked: !!c.suiteSoldee, onchange: (x) => { c.suiteSoldee = x.target.checked; db.save('controles', c, true); } }), h('label', { class: 'fr-label', for: idc }, h('span', { class: 'fr-sr-only' }, 'Soldée'))); } },
      ], arr, { onRow: (c) => S.go('rapport/' + c.id), empty: 'Aucune suite en cours.' }));
  }

  /* ---------- Grilles ---------- */
  function grilles(v, id) {
    if (id) {
      const g = db.get('grilles', id); if (!g) return S.add(v, S.alert('Grille introuvable', '', 'error'));
      const f = S.form([{ name: 'nom', label: 'Nom', required: true }, { name: 'domaine', label: 'Domaine' }], g);
      const ta = h('textarea', { class: 'fr-input', rows: 18, style: 'font-family:ui-monospace,monospace;font-size:.8rem' }); ta.value = g.items.map((i) => [i.section, i.libelle, i.poids, i.ref].join(' | ')).join('\n');
      return S.add(v, h('nav', { class: 'fr-breadcrumb', 'aria-label': 'vous êtes ici :' }, h('ol', { class: 'fr-breadcrumb__list' }, h('li', {}, h('a', { class: 'fr-breadcrumb__link', href: '#/grilles' }, 'Grilles')), h('li', {}, h('a', { class: 'fr-breadcrumb__link', 'aria-current': 'page' }, g.nom)))),
        h('div', { class: 's-panel' }, f.el, h('div', { class: 'fr-input-group' }, h('label', { class: 'fr-label' }, 'Points de contrôle — un par ligne : section | libellé | gravité (mineure, majeure, critique) | référence', h('span', { class: 'fr-hint-text' }, 'Les points existants sont reconnus par leur libellé : les réponses déjà saisies sont conservées.')), ta),
          h('div', { class: 'fr-btns-group fr-btns-group--inline-sm' }, S.btn('Enregistrer', () => { if (!f.validate()) return; Object.assign(g, f.get()); const old = g.items; g.items = ta.value.split('\n').filter((l) => l.trim()).map((l) => { const [section, libelle, poids, ref] = l.split('|').map((x) => (x || '').trim()); const ex = old.find((o) => o.libelle === libelle); return { id: ex ? ex.id : S.uid('i'), section, libelle: libelle || section, poids: POIDS[poids] ? poids : 'mineure', ref: ref || '' }; }); db.save('grilles', g); S.toast('Grille enregistrée', 'success'); S.go('grilles'); }, '', 'fr-icon-check-line'),
            S.btn('Supprimer', async () => { if (db.list('controles').some((c) => c.grilleId === g.id)) return S.toast('Grille utilisée par des contrôles', 'warning'); if (await S.confirm('Supprimer cette grille ?')) { db.remove('grilles', g.id); S.go('grilles'); } }, 'fr-btn--tertiary', 'fr-icon-delete-line'))));
    }
    S.add(v, S.bar('Grilles de contrôle', S.btn('Nouvelle grille', () => { const g = db.save('grilles', { nom: 'Nouvelle grille', domaine: '', items: [] }); S.go('grilles/' + g.id); }, '', 'fr-icon-add-line')),
      S.alert(null, 'Les grilles fournies sont des extraits d’exemple : adaptez-les aux vademecum et instructions techniques en vigueur.', 'info'),
      S.table([{ key: 'nom', label: 'Grille' }, { key: 'domaine', label: 'Domaine' }, { key: 'n', label: 'Points', class: 'num', render: (g) => g.items.length }, { key: 'c', label: 'Critiques', class: 'num', render: (g) => g.items.filter((i) => i.poids === 'critique').length }, { key: 'u', label: 'Contrôles', class: 'num', render: (g) => db.list('controles').filter((c) => c.grilleId === g.id).length }, { key: 'a', label: '', render: (g) => S.iconBtn('Dupliquer', 'fr-icon-file-add-line', () => { const x = S.clone(g); delete x.id; x.nom += ' (copie)'; x.items.forEach((i) => { i.id = S.uid('i'); }); db.save('grilles', x); S.refresh(); }) }], db.list('grilles'), { onRow: (g) => S.go('grilles/' + g.id) }));
  }
})();
