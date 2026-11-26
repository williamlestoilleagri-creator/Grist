/* Gestion de crise — événements, main courante, actions, fiches réflexes, cellule, astreintes, annuaire, point de situation */
(function () {
  'use strict';
  const h = S.h;
  const db = S.db('crise', ['evenements', 'mc', 'contacts', 'astreintes', 'fiches']);
  const NIVEAUX = { veille: ['Veille', 'info', '#0063cb'], vigilance: ['Vigilance', 'new', '#b34000'], alerte: ['Alerte', 'warning', '#c3992a'], crise: ['Crise', 'error', '#ce0500'] };
  const CATS = { Information: 'info', 'Décision': 'success', Action: 'new', Alerte: 'error', 'Point de situation': 'warning', 'Appel entrant': '', 'Appel sortant': '' };
  const ROLES = ['Cadre d’astreinte', 'Agent d’astreinte SRAL', 'Direction', 'Communication'];
  const TYPES = ['Épizootie (santé animale)', 'Alerte sanitaire alimentaire', 'Santé des végétaux', 'Intempéries / événement climatique', 'Pollution / environnement', 'Incident industriel', 'Cybersécurité', 'Exercice', 'Autre'];

  if (!S.load('crise:init')) {
    S.save('crise:init', 1);
    const a = (texte, qui = '', delai = '') => ({ id: S.uid('a'), texte, qui, delai });
    [
      { titre: 'Suspicion d’influenza aviaire en élevage', type: 'Épizootie (santé animale)', actions: [a('Recueillir les informations : élevage, commune, effectifs, symptômes, vétérinaire sanitaire', 'Agent d’astreinte', 'H+0'), a('Informer la DDPP concernée et vérifier la mise sous APMS de l’élevage', 'Cadre d’astreinte', 'H+1'), a('Informer la direction et le préfet de région (cabinet)', 'Direction', 'H+1'), a('Prévenir la DGAL (mission des urgences sanitaires)', 'Cadre d’astreinte', 'H+2'), a('Recenser les élevages dans le rayon de 3 km / 10 km (carte)', 'SRAL', 'H+4'), a('Préparer les éléments de langage (communication)', 'Communication', 'H+4'), a('Programmer un point de situation avec les partenaires (DDPP, GDS, chambre)', 'Direction', 'J+1')] },
      { titre: 'Toxi-infection alimentaire collective (TIAC)', type: 'Alerte sanitaire alimentaire', actions: [a('Recueillir le signalement (ARS, établissement, nombre de malades, repas suspect)', 'Agent d’astreinte', 'H+0'), a('Faire consigner les denrées et plats témoins', 'DDPP', 'H+2'), a('Informer la direction et la DGAL', 'Cadre d’astreinte', 'H+2'), a('Coordonner l’enquête avec l’ARS', 'SRAL', 'J+1'), a('Suivre les résultats d’analyses et décider des mesures', 'Direction', 'J+2')] },
      { titre: 'Tempête / intempéries — impacts agricoles et forestiers', type: 'Intempéries / événement climatique', actions: [a('Activer la veille et suivre les bulletins Météo-France', 'Cadre d’astreinte', 'H+0'), a('Recenser les remontées des DDT(M) et de la chambre d’agriculture', 'SREAA', 'J+1'), a('Évaluer les dégâts forestiers (chablis) avec le CRPF et l’ONF', 'SERFOB', 'J+2'), a('Préparer la note de synthèse pour le préfet de région', 'Direction', 'J+2'), a('Étudier l’éligibilité aux dispositifs d’aide (calamités agricoles)', 'SREAA', 'J+7')] },
    ].forEach((f) => db.save('fiches', f, true));
    [['Préfecture de région — cabinet', 'Cabinet', 'Préfecture', 'Autorités'], ['DGAL — mission des urgences sanitaires', 'Permanence', 'Ministère', 'Ministère'], ['DDPP 35', 'Permanence', 'DDPP', 'Services départementaux'], ['DDPP 29', 'Permanence', 'DDPP', 'Services départementaux'], ['DDPP 22', 'Permanence', 'DDPP', 'Services départementaux'], ['DDPP 56', 'Permanence', 'DDPP', 'Services départementaux'], ['ARS Bretagne — veille sanitaire', 'Point focal régional', 'ARS', 'Partenaires'], ['Chambre régionale d’agriculture', 'Accueil', 'Chambre', 'Partenaires']].forEach(([nom, fonction, organisme, groupe]) => db.save('contacts', { nom, fonction, organisme, groupe, tel: '', mobile: '', email: '' }, true));
  }

  const evOuverts = () => db.list('evenements').filter((e) => e.statut !== 'clos').sort((a, b) => (a.debut < b.debut ? 1 : -1));
  const duree = (d0, d1 = new Date()) => { const m = Math.max(0, Math.floor((new Date(d1) - new Date(d0)) / 60000)); const j = Math.floor(m / 1440); return (j ? `J+${j} ` : '') + `${S.pad(Math.floor((m % 1440) / 60))}h${S.pad(m % 60)}`; };
  const nivBadge = (n) => h('span', { class: 'fr-badge fr-badge--no-icon', style: { background: NIVEAUX[n]?.[2], color: '#fff' } }, NIVEAUX[n]?.[0] || n);
  const lundi = (d) => S.isoDate(S.startOfWeek(d));
  const astreinte = (d = new Date()) => db.list('astreintes').filter((a) => a.semaine === lundi(d));
  const telLink = (t) => (t ? h('a', { class: 'fr-link', href: 'tel:' + String(t).replace(/[^\d+]/g, '') }, t) : '');

  S.init({
    titre: 'Gestion de crise', sousTitre: 'Main courante, astreintes, fiches réflexes', db,
    grist: { evenements: 'Crise_evenements', mc: 'Crise_main_courante', contacts: 'Crise_annuaire', astreintes: 'Crise_astreintes', fiches: 'Crise_fiches' },
    nav: [{ id: 'accueil', label: 'Situation' }, { id: 'annuaire', label: 'Annuaire' }, { id: 'astreintes', label: 'Astreintes' }, { id: 'fiches', label: 'Fiches réflexes' }, { id: 'archives', label: 'Événements clos' }],
    render(r, p, v) { S.clear(v); ({ accueil, ev, annuaire, astreintes, fiches, archives }[r] || accueil)(v, ...p); },
  });
  // Rafraîchissement multi-postes (autres onglets) et horloge
  setInterval(() => { const t = document.getElementById('cr-clock'); if (t) t.textContent = duree(t.dataset.d); }, 30000);

  /* ---------- Situation ---------- */
  function accueil(v) {
    const ouverts = evOuverts();
    const ast = astreinte();
    S.add(v,
      S.bar('Situation', S.btn('Ouvrir un événement', () => nouvelEv(), '', 'fr-icon-alarm-warning-line')),
      h('div', { class: 's-cols' },
        h('div', {},
          h('h2', { class: 'fr-h5' }, `Événements en cours (${ouverts.length})`),
          ouverts.length ? ouverts.map((e) => {
            const mc = db.list('mc').filter((m) => m.evenementId === e.id);
            const act = mc.filter((m) => m.suite && !m.faite);
            return h('div', { class: 'fr-card fr-enlarge-link fr-mb-2w', style: { borderLeft: '6px solid ' + NIVEAUX[e.niveau][2] } }, h('div', { class: 'fr-card__body' }, h('div', { class: 'fr-card__content' },
              h('h3', { class: 'fr-card__title' }, h('a', { href: '#/ev/' + e.id }, e.titre)),
              h('p', { class: 'fr-card__desc' }, [e.type, e.lieu, 'ouvert depuis ' + duree(e.debut)].filter(Boolean).join(' · ')),
              h('div', { class: 'fr-card__start' }, h('div', {}, nivBadge(e.niveau))),
              h('div', { class: 'fr-card__end' }, h('p', { class: 'fr-card__detail' }, `${mc.length} entrée(s) en main courante · ${act.length} action(s) en cours` + (mc.length ? ` · dernière : ${S.fmtDT(mc[mc.length - 1].date)}` : ''))))));
          }) : h('div', { class: 's-empty' }, 'Aucun événement en cours.')),
        h('div', {},
          h('div', { class: 's-panel' }, h('h2', { class: 'fr-h5' }, 'Astreinte de la semaine'),
            ast.length ? h('ul', { class: 'fr-raw-list' }, ROLES.map((r) => { const a = ast.find((x) => x.role === r); return a ? h('li', { class: 'fr-mb-1w' }, h('span', { class: 's-small s-mention' }, r), h('div', {}, h('strong', {}, a.personne), ' ', telLink(a.tel))) : null; })) : h('p', { class: 's-mention' }, 'Planning non renseigné pour cette semaine.'),
            h('a', { class: 'fr-link fr-icon-arrow-right-line fr-link--icon-right', href: '#/astreintes' }, 'Planning des astreintes')),
          h('div', { class: 's-panel' }, h('h2', { class: 'fr-h5' }, 'Numéros utiles'),
            h('ul', { class: 'fr-raw-list' }, db.list('contacts').filter((c) => c.tel || c.mobile).slice(0, 8).map((c) => h('li', { class: 'fr-mb-1w' }, h('strong', {}, c.nom), ' ', telLink(c.mobile || c.tel)))),
            h('a', { class: 'fr-link fr-icon-arrow-right-line fr-link--icon-right', href: '#/annuaire' }, 'Annuaire de crise')))));
  }
  async function nouvelEv(e = {}) {
    const x = await S.formModal(e.id ? 'Modifier l’événement' : 'Ouvrir un événement', [
      { name: 'titre', label: 'Intitulé', required: true, full: true },
      { name: 'type', label: 'Type', type: 'select', required: true, options: TYPES },
      { name: 'niveau', label: 'Niveau', type: 'select', required: true, options: Object.entries(NIVEAUX).map(([value, [label]]) => ({ value, label })), default: 'vigilance' },
      { name: 'debut', label: 'Début', type: 'datetime', required: true, default: S.isoDT(new Date()) },
      { name: 'lieu', label: 'Localisation (commune, département)' },
      { name: 'ficheId', label: 'Fiche réflexe', type: 'select', options: db.list('fiches').map((f) => ({ value: f.id, label: f.titre })) },
      { name: 'description', label: 'Description initiale', type: 'textarea' },
    ], e, { taille: 'wide' });
    if (!x) return;
    const isNew = !e.id;
    const o = Object.assign(e, x, { debut: new Date(x.debut).toISOString() });
    if (isNew) { o.statut = 'ouvert'; o.checklist = {}; o.cellule = []; }
    db.save('evenements', o);
    if (isNew) mc(o, { categorie: 'Information', message: `Ouverture de l’événement — niveau ${NIVEAUX[o.niveau][0]}.${o.description ? '\n' + o.description : ''}`, important: true });
    S.go('ev/' + o.id);
  }
  const mc = (e, o) => db.save('mc', Object.assign({ evenementId: e.id, date: new Date().toISOString(), auteur: S.me(), source: S.me() }, o));

  /* ---------- Événement ---------- */
  function ev(v, id, onglet = 'mc') {
    const e = db.get('evenements', id);
    if (!e) return S.add(v, S.alert('Événement introuvable', '', 'error'));
    const entries = db.list('mc').filter((m) => m.evenementId === e.id).sort((a, b) => (a.date < b.date ? 1 : -1));
    const tab = (k, l) => h('a', { class: 'fr-btn fr-btn--sm ' + (onglet === k ? '' : 'fr-btn--tertiary'), href: `#/ev/${e.id}/${k}`, 'aria-current': onglet === k ? 'page' : null }, l);
    const body = h('div', { class: 'fr-mt-2w' });
    S.add(v,
      h('nav', { class: 'fr-breadcrumb', 'aria-label': 'vous êtes ici :' }, h('ol', { class: 'fr-breadcrumb__list' }, h('li', {}, h('a', { class: 'fr-breadcrumb__link', href: '#/accueil' }, 'Situation')), h('li', {}, h('a', { class: 'fr-breadcrumb__link', 'aria-current': 'page' }, e.titre)))),
      h('div', { class: 's-bar' },
        h('div', {}, h('p', { class: 's-mention fr-mb-0' }, [e.type, e.lieu, 'ouvert le ' + S.fmtDT(e.debut)].filter(Boolean).join(' · ')), h('h1', { class: 'fr-h3 fr-mb-1w' }, e.titre),
          h('div', {}, nivBadge(e.niveau), ' ', e.statut === 'clos' ? S.badge('Clos le ' + S.fmtDT(e.fin)) : h('span', { class: 'fr-badge fr-badge--sm fr-badge--no-icon' }, '⏱ ', h('span', { id: 'cr-clock', dataset: { d: e.debut } }, duree(e.debut))))),
        h('div', { class: 's-bar__actions' },
          e.statut !== 'clos' ? S.select('Niveau', Object.entries(NIVEAUX).map(([value, [label]]) => ({ value, label })), e.niveau, (n) => { const old = e.niveau; e.niveau = n; db.save('evenements', e); mc(e, { categorie: 'Décision', message: `Changement de niveau : ${NIVEAUX[old][0]} → ${NIVEAUX[n][0]}`, important: true }); S.refresh(); }) : null,
          S.btn('Modifier', () => nouvelEv(e), 'fr-btn--tertiary', 'fr-icon-edit-line'),
          e.statut !== 'clos' ? S.btn('Clore', async () => { const m = await S.prompt('Bilan / motif de clôture', '', { titre: 'Clore l’événement' }); if (m === null) return; e.statut = 'clos'; e.fin = new Date().toISOString(); db.save('evenements', e); mc(e, { categorie: 'Décision', message: 'Clôture de l’événement. ' + m, important: true }); S.refresh(); }, 'fr-btn--secondary', 'fr-icon-close-line') : S.btn('Rouvrir', () => { e.statut = 'ouvert'; delete e.fin; db.save('evenements', e); mc(e, { categorie: 'Décision', message: 'Réouverture de l’événement', important: true }); S.refresh(); }, 'fr-btn--secondary', 'fr-icon-refresh-line'))),
      h('nav', { class: 'fr-btns-group fr-btns-group--inline-sm s-noprint', 'aria-label': 'Sections de l’événement', style: 'border-bottom:1px solid var(--border-default-grey);padding-bottom:.5rem' }, tab('mc', `Main courante (${entries.length})`), tab('actions', `Actions (${entries.filter((m) => m.suite && !m.faite).length})`), tab('fiche', 'Fiche réflexe'), tab('cellule', 'Cellule'), tab('sitrep', 'Point de situation')),
      body);
    ({ mc: ongletMC, actions: ongletActions, fiche: ongletFiche, cellule: ongletCellule, sitrep: ongletSitrep }[onglet] || ongletMC)(body, e, entries);
  }
  function ongletMC(b, e, entries) {
    const st = { cat: '', imp: false, q: '' };
    const cat = h('select', { class: 'fr-select', 'aria-label': 'Catégorie' }, Object.keys(CATS).map((c) => h('option', {}, c)));
    const src = h('input', { class: 'fr-input', placeholder: 'Source (qui informe ?)', value: '' });
    const msg = h('textarea', { class: 'fr-input', rows: 2, placeholder: 'Message — Ctrl+Entrée pour inscrire' });
    const imp = h('input', { type: 'checkbox', id: 'mc-imp' });
    const suite = h('input', { class: 'fr-input', placeholder: 'Suite à donner (crée une action)' });
    const resp = h('input', { class: 'fr-input', placeholder: 'Responsable de l’action' });
    const add = () => {
      if (!msg.value.trim()) return msg.focus();
      mc(e, { categorie: cat.value, source: src.value || S.me(), message: msg.value.trim(), important: imp.checked, suite: suite.value.trim(), responsable: resp.value.trim(), faite: false });
      S.refresh();
    };
    msg.addEventListener('keydown', (x) => { if (x.key === 'Enter' && (x.ctrlKey || x.metaKey)) add(); });
    const list = h('div');
    const draw = () => {
      const arr = entries.filter((m) => (!st.cat || m.categorie === st.cat) && (!st.imp || m.important) && (!st.q || S.norm(m.message + ' ' + m.source).includes(S.norm(st.q))));
      S.add(S.clear(list), h('ol', { class: 's-timeline' }, arr.map((m) => h('li', { class: m.important ? 'hi' : '' },
        h('time', {}, S.fmtDT(m.date) + ':' + S.pad(new Date(m.date).getSeconds()) + ' — ' + (m.source || '') + (m.auteur && m.auteur !== m.source ? ` (saisi par ${m.auteur})` : '')),
        h('div', {}, S.badge(m.categorie, CATS[m.categorie]), m.important ? ' ⚠️ ' : ' ', h('span', { style: 'white-space:pre-wrap' + (m.important ? ';font-weight:700' : '') }, m.message)),
        m.suite ? h('div', { class: 's-small fr-mt-1v' }, (m.faite ? '✅ ' : '➡️ ') + m.suite + (m.responsable ? ' — ' + m.responsable : '')) : null))));
    };
    S.add(b,
      e.statut !== 'clos' ? h('div', { class: 's-panel s-panel--alt s-noprint' },
        h('div', { style: 'display:grid;grid-template-columns:12rem 1fr;gap:.75rem' }, cat, src),
        h('div', { class: 'fr-mt-1w' }, msg),
        h('div', { style: 'display:grid;grid-template-columns:1fr 14rem;gap:.75rem', class: 'fr-mt-1w' }, suite, resp),
        h('div', { style: 'display:flex;gap:1rem;align-items:center;justify-content:space-between', class: 'fr-mt-1w' }, h('div', { class: 'fr-checkbox-group fr-checkbox-group--sm' }, imp, h('label', { class: 'fr-label', for: 'mc-imp' }, 'Important')), S.btn('Inscrire en main courante', add, '', 'fr-icon-add-line'))) : null,
      h('div', { class: 's-toolbar s-noprint' }, S.search('Rechercher', (q) => { st.q = q; draw(); }), S.select('Catégorie', [{ value: '', label: 'Toutes' }, ...Object.keys(CATS)], '', (x) => { st.cat = x; draw(); }),
        h('div', { class: 'fr-checkbox-group fr-checkbox-group--sm' }, h('input', { type: 'checkbox', id: 'f-imp', onchange: (x) => { st.imp = x.target.checked; draw(); } }), h('label', { class: 'fr-label', for: 'f-imp' }, 'Importants seulement')),
        S.btn('Exporter CSV', () => S.download('main-courante.csv', S.toCSV(entries.slice().reverse(), [{ key: 'date', label: 'Horodatage', get: (m) => S.fmtDT(m.date) }, { key: 'categorie', label: 'Catégorie' }, { key: 'source', label: 'Source' }, { key: 'message', label: 'Message' }, { key: 'important', label: 'Important', get: (m) => (m.important ? 'oui' : '') }, { key: 'suite', label: 'Suite à donner' }, { key: 'responsable', label: 'Responsable' }, { key: 'auteur', label: 'Saisi par' }])), 'fr-btn--secondary fr-btn--sm', 'fr-icon-download-line'),
        S.btn('Imprimer', () => print(), 'fr-btn--secondary fr-btn--sm', 'fr-icon-printer-line')),
      list);
    draw();
    setTimeout(() => msg.focus(), 50);
  }
  function ongletActions(b, e, entries) {
    const acts = entries.filter((m) => m.suite).sort((a, b2) => (a.faite - b2.faite) || (a.date < b2.date ? -1 : 1));
    S.add(b, S.btn('Nouvelle action', async () => { const x = await S.formModal('Nouvelle action', [{ name: 'suite', label: 'Action', required: true, full: true }, { name: 'responsable', label: 'Responsable' }, { name: 'echeance', label: 'Échéance', type: 'datetime' }], {}); if (x) { mc(e, { categorie: 'Action', message: 'Action décidée : ' + x.suite, suite: x.suite, responsable: x.responsable, echeance: x.echeance, faite: false }); S.refresh(); } }, 'fr-mb-2w', 'fr-icon-add-line'),
      S.table([
        { key: 'faite', label: 'Fait', render: (m) => { const id = 'af' + m.id; return h('div', { class: 'fr-checkbox-group fr-checkbox-group--sm' }, h('input', { type: 'checkbox', id, checked: !!m.faite, onchange: (x) => { m.faite = x.target.checked; m.faiteLe = new Date().toISOString(); db.save('mc', m, true); if (m.faite) mc(e, { categorie: 'Action', message: 'Action réalisée : ' + m.suite }); S.refresh(); } }), h('label', { class: 'fr-label', for: id }, h('span', { class: 'fr-sr-only' }, 'Fait'))); } },
        { key: 'suite', label: 'Action', render: (m) => h('span', { style: m.faite ? 'text-decoration:line-through;color:var(--text-mention-grey)' : '' }, m.suite) },
        { key: 'responsable', label: 'Responsable' },
        { key: 'echeance', label: 'Échéance', render: (m) => (m.echeance ? S.fmtDT(m.echeance) : '') },
        { key: 'date', label: 'Décidée le', render: (m) => S.fmtDT(m.date) },
      ], acts, { empty: 'Aucune action. Renseignez « Suite à donner » dans la main courante ou créez une action.' }));
  }
  function ongletFiche(b, e) {
    const f = db.get('fiches', e.ficheId);
    if (!f) return S.add(b, S.alert('Aucune fiche réflexe associée', 'Associez une fiche via « Modifier ».', 'info'), S.select('Associer une fiche', [{ value: '', label: '—' }, ...db.list('fiches').map((x) => ({ value: x.id, label: x.titre }))], '', (id) => { e.ficheId = id; db.save('evenements', e); S.refresh(); }));
    e.checklist = e.checklist || {};
    const done = f.actions.filter((a) => e.checklist[a.id]?.fait).length;
    S.add(b, h('h2', { class: 'fr-h5' }, f.titre),
      h('div', { class: 'fr-mb-2w' }, h('progress', { max: f.actions.length, value: done, style: 'width:100%;height:.75rem' }), h('p', { class: 's-small' }, `${done}/${f.actions.length} action(s) réalisée(s)`)),
      f.actions.map((a) => { const c = e.checklist[a.id] || {}; const id = 'ck' + a.id; return h('div', { class: 's-panel', style: 'padding:.75rem 1rem;margin-bottom:.5rem' },
        h('div', { class: 'fr-checkbox-group' }, h('input', { type: 'checkbox', id, checked: !!c.fait, onchange: (x) => { e.checklist[a.id] = { fait: x.target.checked, par: S.me(), date: new Date().toISOString() }; db.save('evenements', e, true); if (x.target.checked) mc(e, { categorie: 'Action', message: 'Fiche réflexe — réalisé : ' + a.texte }); S.refresh(); } }),
          h('label', { class: 'fr-label', for: id }, a.texte, h('span', { class: 'fr-hint-text' }, [a.qui, a.delai].filter(Boolean).join(' · ') + (c.fait ? ` — fait par ${c.par} le ${S.fmtDT(c.date)}` : ''))))); }));
  }
  function ongletCellule(b, e) {
    e.cellule = e.cellule || [];
    const membres = db.list('contacts').filter((c) => e.cellule.includes(c.id));
    const emails = membres.map((c) => c.email).filter(Boolean);
    S.add(b,
      h('div', { class: 'fr-btns-group fr-btns-group--inline-sm fr-btns-group--icon-left fr-mb-2w' },
        S.btn('Composer la cellule', async () => { const x = await S.formModal('Membres de la cellule', [{ name: 'm', label: 'Contacts', type: 'multi', options: db.list('contacts').map((c) => ({ value: c.id, label: `${c.nom}${c.organisme ? ' (' + c.organisme + ')' : ''}` })) }], { m: e.cellule }, { taille: 'wide' }); if (x) { e.cellule = x.m; db.save('evenements', e); S.refresh(); } }, '', 'fr-icon-team-line'),
        emails.length ? h('a', { class: 'fr-btn fr-btn--secondary fr-icon-mail-line', href: `mailto:${emails.join(',')}?subject=${encodeURIComponent('[' + NIVEAUX[e.niveau][0].toUpperCase() + '] ' + e.titre)}` }, 'Écrire à la cellule') : null,
        S.btn('Convocation visio', () => { const lien = 'https://visio.numerique.gouv.fr/' + S.slug(e.titre).slice(0, 25) + '-' + Math.random().toString(36).slice(2, 7); mc(e, { categorie: 'Information', message: 'Lien de visioconférence de la cellule : ' + lien }); navigator.clipboard?.writeText(lien); S.toast('Lien copié et inscrit en main courante', 'success'); S.refresh(); }, 'fr-btn--secondary', 'fr-icon-links-line')),
      S.table([{ key: 'nom', label: 'Nom' }, { key: 'fonction', label: 'Fonction' }, { key: 'organisme', label: 'Organisme' }, { key: 'tel', label: 'Téléphone', render: (c) => h('span', {}, telLink(c.tel), ' ', telLink(c.mobile)) }, { key: 'email', label: 'Courriel', render: (c) => (c.email ? h('a', { class: 'fr-link', href: 'mailto:' + c.email }, c.email) : '') }, { key: 'a', label: '', render: (c) => S.btn('Appel', () => { mc(e, { categorie: 'Appel sortant', message: 'Appel à ' + c.nom, source: S.me() }); if (c.mobile || c.tel) location.href = 'tel:' + String(c.mobile || c.tel).replace(/[^\d+]/g, ''); S.refresh(); }, 'fr-btn--sm fr-btn--tertiary') }], membres, { empty: 'Cellule non constituée.' }));
  }
  function ongletSitrep(b, e, entries) {
    const asc = entries.slice().reverse();
    const last = (cat) => asc.filter((m) => m.categorie === cat);
    const f = S.form([
      { name: 'situation', label: 'Situation générale', type: 'textarea', rows: 4, default: [e.description, ...last('Point de situation').slice(-1).map((m) => m.message)].filter(Boolean).join('\n') },
      { name: 'mesures', label: 'Mesures prises / décisions', type: 'textarea', rows: 4, default: last('Décision').map((m) => `- ${S.fmtDT(m.date)} : ${m.message}`).join('\n') },
      { name: 'actions', label: 'Actions en cours', type: 'textarea', rows: 4, default: entries.filter((m) => m.suite && !m.faite).map((m) => `- ${m.suite}${m.responsable ? ' (' + m.responsable + ')' : ''}`).join('\n') },
      { name: 'perspectives', label: 'Perspectives / points de vigilance', type: 'textarea', rows: 3 },
      { name: 'prochain', label: 'Prochain point de situation', type: 'datetime' },
      { name: 'diffusion', label: 'Diffusion (courriels)', default: db.list('contacts').filter((c) => (e.cellule || []).includes(c.id) && c.email).map((c) => c.email).join(', '), full: true },
    ]);
    const texte = () => { const x = f.get(); return `POINT DE SITUATION — ${e.titre.toUpperCase()}\n${S.settings().entite} — ${S.fmtLong(new Date())} à ${S.hm(new Date())}\nNiveau : ${NIVEAUX[e.niveau][0]} — Événement ouvert le ${S.fmtDT(e.debut)} (${duree(e.debut)})\n\n1. SITUATION\n${x.situation || '—'}\n\n2. MESURES PRISES\n${x.mesures || '—'}\n\n3. ACTIONS EN COURS\n${x.actions || '—'}\n\n4. PERSPECTIVES\n${x.perspectives || '—'}\n\nProchain point : ${x.prochain ? S.fmtDT(x.prochain) : 'à définir'}\nRédacteur : ${S.me()}`; };
    S.add(b, h('div', { class: 's-panel' }, f.el,
      h('div', { class: 'fr-btns-group fr-btns-group--inline-sm fr-btns-group--icon-left' },
        S.btn('Inscrire en main courante', () => { mc(e, { categorie: 'Point de situation', message: texte(), important: true }); S.toast('Point de situation inscrit', 'success'); S.go(`ev/${e.id}/mc`); }, '', 'fr-icon-add-line'),
        S.btn('Envoyer par courriel', () => { location.href = `mailto:${f.get().diffusion}?subject=${encodeURIComponent('Point de situation — ' + e.titre)}&body=${encodeURIComponent(texte())}`; }, 'fr-btn--secondary', 'fr-icon-mail-line'),
        S.btn('Copier', () => { navigator.clipboard?.writeText(texte()); S.toast('Copié', 'success'); }, 'fr-btn--secondary', 'fr-icon-file-text-line'),
        S.btn('Aperçu / impression', () => { const w = window.open('', '_blank'); if (w) { w.document.write(`<pre style="font-family:Marianne,Arial;white-space:pre-wrap;font-size:12pt;max-width:180mm;margin:auto">${S.esc(texte())}</pre>`); w.document.close(); w.print(); } }, 'fr-btn--secondary', 'fr-icon-printer-line'))));
  }

  /* ---------- Annuaire ---------- */
  function annuaire(v) {
    const fields = [{ name: 'nom', label: 'Nom', required: true }, { name: 'fonction', label: 'Fonction' }, { name: 'organisme', label: 'Organisme' }, { name: 'groupe', label: 'Groupe', list: 'grp' }, { name: 'tel', label: 'Téléphone fixe', type: 'tel' }, { name: 'mobile', label: 'Mobile / astreinte', type: 'tel' }, { name: 'email', label: 'Courriel', type: 'email' }, { name: 'notes', label: 'Notes (horaires, suppléant…)', type: 'textarea', rows: 2 }];
    const edit = async (c = {}) => { const x = await S.formModal(c.id ? 'Modifier le contact' : 'Nouveau contact', fields, c, { extraActions: c.id ? [{ label: 'Supprimer', onClick: () => { db.remove('contacts', c.id); S.refresh(); } }] : [] }); if (x) { db.save('contacts', x); S.refresh(); } };
    let q = '';
    const zone = h('div');
    const draw = () => {
      const arr = db.list('contacts').filter((c) => !q || S.norm(Object.values(c).join(' ')).includes(S.norm(q)));
      const groups = [...new Set(arr.map((c) => c.groupe || 'Autres'))].sort();
      S.add(S.clear(zone), groups.map((g) => [h('h2', { class: 'fr-h6 fr-mt-3w' }, g), S.table([{ key: 'nom', label: 'Nom', render: (c) => h('strong', {}, c.nom) }, { key: 'fonction', label: 'Fonction' }, { key: 'organisme', label: 'Organisme' }, { key: 'tel', label: 'Téléphone', render: (c) => telLink(c.tel) }, { key: 'mobile', label: 'Mobile', render: (c) => telLink(c.mobile) }, { key: 'email', label: 'Courriel', render: (c) => (c.email ? h('a', { class: 'fr-link', href: 'mailto:' + c.email }, c.email) : '') }, { key: 'notes', label: 'Notes' }], arr.filter((c) => (c.groupe || 'Autres') === g), { onRow: edit })]));
    };
    S.add(v, S.bar('Annuaire de crise', S.btn('Ajouter', () => edit(), '', 'fr-icon-add-line'),
      S.btn('Importer CSV', async () => { const f = await S.pickFile('.csv'); if (!f) return; const rows = S.parseCSV(await S.readText(f)); const k = (r, ...ns) => { const key = Object.keys(r).find((x) => ns.includes(S.norm(x))); return key ? r[key] : ''; }; rows.forEach((r) => db.save('contacts', { nom: k(r, 'nom', 'name'), fonction: k(r, 'fonction'), organisme: k(r, 'organisme', 'structure'), groupe: k(r, 'groupe'), tel: k(r, 'tel', 'telephone'), mobile: k(r, 'mobile', 'portable'), email: k(r, 'email', 'courriel', 'mail') }, true)); db.setAll('contacts', db.list('contacts')); S.toast(rows.length + ' contact(s) importé(s)', 'success'); S.refresh(); }, 'fr-btn--secondary', 'fr-icon-upload-line'),
      S.btn('Exporter vCard', () => S.download('annuaire-crise.vcf', db.list('contacts').map((c) => ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + c.nom, c.organisme ? 'ORG:' + c.organisme : '', c.fonction ? 'TITLE:' + c.fonction : '', c.tel ? 'TEL;TYPE=WORK:' + c.tel : '', c.mobile ? 'TEL;TYPE=CELL:' + c.mobile : '', c.email ? 'EMAIL:' + c.email : '', 'END:VCARD'].filter(Boolean).join('\r\n')).join('\r\n'), 'text/vcard'), 'fr-btn--secondary', 'fr-icon-download-line'),
      S.btn('Imprimer', () => print(), 'fr-btn--secondary', 'fr-icon-printer-line')),
      h('div', { class: 's-toolbar s-noprint' }, S.search('Rechercher un contact', (x) => { q = x; draw(); })), zone,
      h('datalist', { id: 'grp' }, [...new Set(db.list('contacts').map((c) => c.groupe).filter(Boolean))].map((g) => h('option', { value: g }))));
    draw();
  }

  /* ---------- Astreintes ---------- */
  function astreintes(v, depuis) {
    const start = S.startOfWeek(depuis ? new Date(depuis) : S.addDays(new Date(), -7));
    const weeks = [...Array(12)].map((_, i) => S.addDays(start, 7 * i));
    const cell = (w, role) => db.list('astreintes').find((a) => a.semaine === S.isoDate(w) && a.role === role);
    const personnes = [...new Set(db.list('astreintes').map((a) => a.personne).filter(Boolean))];
    const edit = async (w, role) => {
      const a = cell(w, role) || { semaine: S.isoDate(w), role };
      const x = await S.formModal(`${role} — semaine ${S.weekNumber(w)} (${S.fmtDate(w)})`, [{ name: 'personne', label: 'Personne', list: 'pers' }, { name: 'tel', label: 'Téléphone d’astreinte', type: 'tel' }, { name: 'remarque', label: 'Remarque' }, { name: 'repeter', label: 'Recopier sur les N semaines suivantes', type: 'number', min: 0, max: 12, default: 0 }], a, { extraActions: a.id ? [{ label: 'Vider', onClick: () => { db.remove('astreintes', a.id); S.refresh(); } }] : [] });
      if (!x) return;
      const n = Number(x.repeter) || 0; delete x.repeter;
      for (let i = 0; i <= n; i++) { const wk = S.isoDate(S.addDays(w, 7 * i)); const ex = db.list('astreintes').find((z) => z.semaine === wk && z.role === role); db.save('astreintes', Object.assign(ex || { semaine: wk, role }, { personne: x.personne, tel: x.tel, remarque: x.remarque }), true); }
      db.setAll('astreintes', db.list('astreintes')); S.refresh();
    };
    S.add(v, S.bar('Planning des astreintes',
      S.iconBtn('Semaines précédentes', 'fr-icon-arrow-left-s-line', () => S.go('astreintes/' + S.isoDate(S.addDays(start, -28))), 'fr-btn--secondary'),
      S.iconBtn('Semaines suivantes', 'fr-icon-arrow-right-s-line', () => S.go('astreintes/' + S.isoDate(S.addDays(start, 28))), 'fr-btn--secondary'),
      S.btn('Exporter CSV', () => S.download('astreintes.csv', S.toCSV(db.list('astreintes').sort((a, b) => (a.semaine < b.semaine ? -1 : 1)), [{ key: 'semaine', label: 'Semaine du' }, { key: 'role', label: 'Rôle' }, { key: 'personne', label: 'Personne' }, { key: 'tel', label: 'Téléphone' }, { key: 'remarque', label: 'Remarque' }])), 'fr-btn--secondary', 'fr-icon-download-line'),
      S.btn('Imprimer', () => print(), 'fr-btn--secondary', 'fr-icon-printer-line')),
      h('p', { class: 's-mention s-noprint' }, 'Cliquez sur une case pour l’affecter. La semaine en cours est surlignée.'),
      h('div', { class: 'fr-table s-tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Semaine'), ROLES.map((r) => h('th', {}, r)))),
        h('tbody', {}, weeks.map((w) => h('tr', { style: lundi(new Date()) === S.isoDate(w) ? 'background:var(--background-action-low-blue-france)' : '' },
          h('td', { class: 's-nowrap' }, h('strong', {}, 'S' + S.weekNumber(w)), h('div', { class: 's-small' }, `${S.fmtDate(w)} → ${S.fmtDate(S.addDays(w, 6))}`)),
          ROLES.map((r) => { const a = cell(w, r); return h('td', { class: 's-click', style: 'cursor:pointer', onclick: () => edit(w, r) }, a ? h('div', {}, h('strong', {}, a.personne), a.tel ? h('div', { class: 's-small' }, a.tel) : null, a.remarque ? h('div', { class: 's-small s-mention' }, a.remarque) : null) : h('span', { class: 's-mention' }, '+')); })))))),
      h('datalist', { id: 'pers' }, personnes.map((p) => h('option', { value: p }))));
  }

  /* ---------- Fiches réflexes ---------- */
  function fiches(v, id) {
    if (id) return ficheEdit(v, db.get('fiches', id));
    S.add(v, S.bar('Fiches réflexes', S.btn('Nouvelle fiche', () => { const f = db.save('fiches', { titre: 'Nouvelle fiche', type: 'Autre', actions: [] }); S.go('fiches/' + f.id); }, '', 'fr-icon-add-line')),
      h('div', { class: 's-grid' }, db.list('fiches').map((f) => h('div', { class: 'fr-card fr-enlarge-link' }, h('div', { class: 'fr-card__body' }, h('div', { class: 'fr-card__content' }, h('h2', { class: 'fr-card__title' }, h('a', { href: '#/fiches/' + f.id }, f.titre)), h('p', { class: 'fr-card__desc' }, `${f.type} · ${f.actions.length} action(s)`)))))));
  }
  function ficheEdit(v, f) {
    if (!f) return S.add(v, S.alert('Fiche introuvable', '', 'error'));
    const save = () => db.save('fiches', f, true);
    const head = S.form([{ name: 'titre', label: 'Titre', required: true }, { name: 'type', label: 'Type d’événement', type: 'select', options: TYPES }], f);
    head.el.addEventListener('input', () => { Object.assign(f, head.get()); save(); }); head.el.addEventListener('change', () => { Object.assign(f, head.get()); save(); });
    const list = h('div');
    const draw = () => S.add(S.clear(list), f.actions.map((a, i) => {
      const row = h('div', { style: 'display:grid;grid-template-columns:2rem 1fr 12rem 6rem auto;gap:.5rem;align-items:center;margin-bottom:.5rem' }, h('strong', {}, i + 1),
        h('input', { class: 'fr-input', value: a.texte, 'aria-label': 'Action', oninput: (e) => { a.texte = e.target.value; save(); } }),
        h('input', { class: 'fr-input', value: a.qui || '', placeholder: 'Qui', 'aria-label': 'Qui', oninput: (e) => { a.qui = e.target.value; save(); } }),
        h('input', { class: 'fr-input', value: a.delai || '', placeholder: 'H+1', 'aria-label': 'Délai', oninput: (e) => { a.delai = e.target.value; save(); } }),
        h('div', { class: 's-nowrap' }, S.iconBtn('Monter', 'fr-icon-arrow-up-line', () => { if (i) { [f.actions[i - 1], f.actions[i]] = [f.actions[i], f.actions[i - 1]]; save(); draw(); } }), S.iconBtn('Supprimer', 'fr-icon-delete-line', () => { f.actions.splice(i, 1); save(); draw(); })));
      return row;
    }));
    draw();
    S.add(v, h('nav', { class: 'fr-breadcrumb', 'aria-label': 'vous êtes ici :' }, h('ol', { class: 'fr-breadcrumb__list' }, h('li', {}, h('a', { class: 'fr-breadcrumb__link', href: '#/fiches' }, 'Fiches réflexes')), h('li', {}, h('a', { class: 'fr-breadcrumb__link', 'aria-current': 'page' }, f.titre)))),
      S.bar('Fiche réflexe', S.btn('Imprimer', () => print(), 'fr-btn--secondary', 'fr-icon-printer-line'), S.btn('Supprimer', async () => { if (await S.confirm('Supprimer cette fiche ?')) { db.remove('fiches', f.id); S.go('fiches'); } }, 'fr-btn--tertiary', 'fr-icon-delete-line')),
      h('div', { class: 's-panel' }, head.el), h('h2', { class: 'fr-h6' }, 'Actions'), list,
      S.btn('Ajouter une action', () => { f.actions.push({ id: S.uid('a'), texte: '', qui: '', delai: '' }); save(); draw(); }, 'fr-btn--secondary', 'fr-icon-add-line'));
  }

  /* ---------- Archives ---------- */
  function archives(v) {
    S.add(v, h('h1', { class: 'fr-h3' }, 'Événements clos'),
      S.table([{ key: 'titre', label: 'Événement' }, { key: 'type', label: 'Type' }, { key: 'niveau', label: 'Niveau max.', render: (e) => nivBadge(e.niveau) }, { key: 'debut', label: 'Début', render: (e) => S.fmtDT(e.debut) }, { key: 'fin', label: 'Fin', render: (e) => S.fmtDT(e.fin) }, { key: 'd', label: 'Durée', render: (e) => duree(e.debut, e.fin) }, { key: 'n', label: 'Entrées MC', class: 'num', render: (e) => db.list('mc').filter((m) => m.evenementId === e.id).length }],
        db.list('evenements').filter((e) => e.statut === 'clos').sort((a, b) => (a.debut < b.debut ? 1 : -1)), { onRow: (e) => S.go('ev/' + e.id), empty: 'Aucun événement clos.' }));
  }
})();
