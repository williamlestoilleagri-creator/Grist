/* Courrier & parapheur — registre chrono arrivée/départ, attribution, accusé de réception, fiche de circulation, parapheur */
(function () {
  'use strict';
  const h = S.h;
  const db = S.db('courrier', ['courriers', 'services']);
  const CANAUX = ['Postal', 'Courriel', 'Formulaire en ligne', 'Recommandé AR', 'Remis en main propre', 'Télécopie', 'Plateforme (démarches simplifiées…)', 'Téléphone', 'Autre'];
  const ST_A = { enregistre: ['Enregistré', 'new'], attribue: ['Attribué', 'info'], traitement: ['En traitement', 'warning'], repondu: ['Répondu', 'success'], classe: ['Classé', ''] };
  const ST_D = { brouillon: ['Brouillon', 'new'], parapheur: ['Au parapheur', 'warning'], signe: ['Signé', 'info'], envoye: ['Envoyé', 'success'], refuse: ['Refusé au parapheur', 'error'] };
  const PRIO = { normale: 'Normale', urgente: 'Urgente', tres: 'Très urgente' };

  if (!S.load('courrier:init')) {
    S.save('courrier:init', 1);
    [['Direction', 'DIR', 'Directeur'], ['Secrétariat général', 'SG', 'Secrétaire général'], ['Service régional de l’alimentation', 'SRAL', 'Chef du SRAL'], ['Service régional de l’économie agricole', 'SREAA', 'Chef du SREAA'], ['Service régional de la forêt et du bois', 'SERFOB', 'Chef du SERFOB'], ['Service régional de la formation et du développement', 'SRFD', 'Chef du SRFD'], ['Service de l’information statistique et économique', 'SRISE', 'Chef du SRISE']].forEach(([nom, sigle, chef]) => db.save('services', { nom, sigle, chef, email: '' }, true));
  }
  const services = () => db.list('services');
  const svc = (sigle) => services().find((s) => s.sigle === sigle);
  const numero = (sens, date) => {
    const y = new Date(date || Date.now()).getFullYear(); const p = { arrivee: 'A', depart: 'D', interne: 'I' }[sens];
    const max = db.list('courriers').filter((c) => c.sens === sens && String(c.numero).startsWith(`${p}-${y}-`)).reduce((m, c) => Math.max(m, Number(String(c.numero).split('-')[2]) || 0), 0);
    return `${p}-${y}-${String(max + 1).padStart(5, '0')}`;
  };
  const histo = (c, action, commentaire = '') => { c.historique = c.historique || []; c.historique.push({ date: new Date().toISOString(), qui: S.me(), action, commentaire }); };
  const badge = (c) => S.badge(...((c.sens === 'depart' ? ST_D : ST_A)[c.statut] || [c.statut]));
  const enRetard = (c) => c.echeance && c.echeance < S.isoDate(new Date()) && ['enregistre', 'attribue', 'traitement'].includes(c.statut);
  const estMoi = (txt) => { const n = S.norm(txt); const me = S.norm(S.me()); if (!n) return false; if (n === me) return true; const s = services().find((x) => S.norm(x.chef) === n); return !!(s && S.norm(s.chef) === me) || n.includes(me); };
  const etapeCour = (c) => (c.parapheur?.etapes || []).find((e) => e.statut === 'en attente');

  S.init({
    titre: 'Courrier & parapheur', sousTitre: 'Registre, attribution, signature', db,
    grist: { courriers: 'Courrier_registre', services: 'Courrier_services' },
    nav: [{ id: 'accueil', label: 'Tableau de bord' }, { id: 'registre', label: 'Registre' }, { id: 'parapheur', label: 'Parapheur' }, { id: 'stats', label: 'Statistiques' }, { id: 'services', label: 'Services' }],
    render(r, p, v) { S.clear(v); ({ accueil, registre, parapheur, stats, services: servicesV, courrier: fiche }[r] || accueil)(v, ...p); },
  });

  /* ---------- Enregistrement ---------- */
  async function enregistrer(sens = 'arrivee', base = {}) {
    const isNew = !base.id;
    const fields = [
      { name: 'sens', label: 'Sens', type: 'select', required: true, options: [{ value: 'arrivee', label: 'Arrivée' }, { value: 'depart', label: 'Départ' }, { value: 'interne', label: 'Interne' }], default: sens },
      { name: 'date', label: sens === 'depart' ? 'Date du courrier' : 'Date de réception', type: 'date', required: true, default: S.isoDate(new Date()) },
      { name: 'objet', label: 'Objet', required: true, full: true },
      { name: 'correspondant', label: sens === 'depart' ? 'Destinataire' : 'Expéditeur', required: true },
      { name: 'correspondantType', label: 'Catégorie', type: 'select', options: ['Usager / particulier', 'Exploitant agricole', 'Entreprise', 'Association', 'Élu', 'Parlementaire', 'Préfecture', 'Ministère / administration centrale', 'Service déconcentré', 'Collectivité', 'Organisme professionnel', 'Autre'] },
      { name: 'adresse', label: 'Adresse / courriel du correspondant', type: 'textarea', rows: 2 },
      { name: 'canal', label: 'Canal', type: 'select', required: true, options: CANAUX, default: 'Postal' },
      { name: 'reference', label: 'Référence du correspondant' },
      { name: 'dateCourrier', label: 'Date figurant sur le courrier', type: 'date' },
      { name: 'service', label: 'Service attributaire', type: 'select', options: services().map((s) => ({ value: s.sigle, label: `${s.sigle} — ${s.nom}` })) },
      { name: 'agent', label: 'Agent chargé du dossier' },
      { name: 'copies', label: 'Copie(s) pour information', type: 'multi', options: services().map((s) => s.sigle) },
      { name: 'priorite', label: 'Priorité', type: 'select', required: true, options: Object.entries(PRIO).map(([value, label]) => ({ value, label })), default: 'normale' },
      { name: 'reponse', label: 'Réponse attendue', type: 'checkbox', default: sens === 'arrivee' },
      { name: 'echeance', label: 'Échéance de réponse', type: 'date', hint: 'Par défaut : 2 mois (silence vaut rejet / acceptation selon la procédure)' },
      { name: 'signataire', label: 'Signataire (départ)' },
      { name: 'confidentiel', label: 'Confidentiel', type: 'checkbox' },
      { name: 'classement', label: 'Dossier / cote de classement' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
    ];
    const vals = Object.assign({}, base, { date: base.dateRecu || base.dateEnvoi || S.isoDate(new Date()) });
    const v = await S.formModal(isNew ? 'Enregistrer un courrier' : 'Modifier ' + base.numero, fields, vals, { taille: 'wide' });
    if (!v) return null;
    const c = isNew ? { historique: [], pieces: [] } : base;
    const sensChange = !isNew && c.sens !== v.sens;
    Object.assign(c, v);
    if (v.sens === 'depart') { c.dateEnvoi = v.date; delete c.dateRecu; } else { c.dateRecu = v.date; delete c.dateEnvoi; }
    delete c.date;
    if (isNew || sensChange) c.numero = numero(c.sens, v.date);
    if (isNew) { c.statut = c.sens === 'depart' ? 'brouillon' : c.service ? 'attribue' : 'enregistre'; histo(c, 'Enregistrement'); if (c.service) histo(c, 'Attribué à ' + c.service + (c.agent ? ' / ' + c.agent : '')); }
    else histo(c, 'Modification');
    if (c.sens === 'arrivee' && c.reponse && !c.echeance) { const d = new Date(c.dateRecu); d.setMonth(d.getMonth() + 2); c.echeance = S.isoDate(d); }
    db.save('courriers', c);
    S.toast(`Courrier ${c.numero} enregistré`, 'success');
    S.go('courrier/' + c.id);
    return c;
  }

  /* ---------- Tableau de bord ---------- */
  function accueil(v) {
    const all = db.list('courriers');
    const today = S.isoDate(new Date());
    const arr = all.filter((c) => c.sens === 'arrivee');
    const aSigner = all.filter((c) => c.statut === 'parapheur' && estMoi(etapeCour(c)?.qui));
    const retard = all.filter(enRetard);
    S.add(v,
      S.bar('Tableau de bord', S.btn('Courrier arrivée', () => enregistrer('arrivee'), '', 'fr-icon-mail-line'), S.btn('Courrier départ', () => enregistrer('depart'), 'fr-btn--secondary', 'fr-icon-send-plane-line')),
      S.kpis([
        { v: arr.filter((c) => c.dateRecu === today).length, l: 'arrivés aujourd’hui' },
        { v: arr.filter((c) => c.statut === 'enregistre').length, l: 'à attribuer', type: arr.some((c) => c.statut === 'enregistre') ? 'warn' : 'ok', onClick: () => { S.save('courrier:f', { statut: 'enregistre', sens: 'arrivee' }); S.go('registre'); } },
        { v: arr.filter((c) => ['attribue', 'traitement'].includes(c.statut)).length, l: 'en traitement' },
        { v: retard.length, l: 'échéance dépassée', type: retard.length ? 'err' : 'ok', onClick: () => { S.save('courrier:f', { retard: true }); S.go('registre'); } },
        { v: aSigner.length, l: 'à mon parapheur', type: aSigner.length ? 'warn' : '', onClick: () => S.go('parapheur') },
      ]),
      h('div', { class: 's-cols' },
        h('div', { class: 's-panel' }, h('h2', { class: 'fr-h5' }, 'Échéances à venir et dépassées'), liste(all.filter((c) => c.echeance && ['enregistre', 'attribue', 'traitement'].includes(c.statut)).sort((a, b) => (a.echeance < b.echeance ? -1 : 1)).slice(0, 12), (c) => `échéance ${S.fmtDate(c.echeance)}`)),
        h('div', { class: 's-panel' }, h('h2', { class: 'fr-h5' }, 'Derniers enregistrements'), liste(all.slice().sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1)).slice(0, 12), (c) => `${c.sens === 'depart' ? 'à' : 'de'} ${c.correspondant}`))));
  }
  const liste = (arr, sub) => (arr.length ? h('ul', { class: 'fr-raw-list' }, arr.map((c) => h('li', { class: 'fr-mb-1w' }, h('a', { class: 'fr-link', href: '#/courrier/' + c.id }, `${c.numero} — ${c.objet}`), ' ', badge(c), enRetard(c) ? S.badge('Retard', 'error') : null, h('div', { class: 's-small s-mention' }, sub(c))))) : h('p', { class: 's-mention' }, 'Rien à afficher.'));

  /* ---------- Registre ---------- */
  function registre(v) {
    const st = Object.assign({ q: '', sens: '', statut: '', service: '', annee: String(new Date().getFullYear()), retard: false }, S.load('courrier:f', {}));
    const zone = h('div');
    let rows = [];
    const draw = () => {
      S.save('courrier:f', st);
      rows = db.list('courriers').filter((c) => (!st.sens || c.sens === st.sens) && (!st.statut || c.statut === st.statut) && (!st.service || c.service === st.service) && (!st.annee || String(c.numero).includes('-' + st.annee + '-')) && (!st.retard || enRetard(c)) && (!st.q || S.norm([c.numero, c.objet, c.correspondant, c.reference, c.agent, c.classement, c.notes].join(' ')).includes(S.norm(st.q))));
      rows.sort((a, b) => (a.numero < b.numero ? 1 : -1));
      S.add(S.clear(zone), h('p', { class: 's-mention' }, `${rows.length} courrier(s)`), S.table([
        { key: 'numero', label: 'N° chrono', class: 's-nowrap' },
        { key: 'date', label: 'Date', render: (c) => S.fmtDate(c.dateRecu || c.dateEnvoi), sort: (c) => c.dateRecu || c.dateEnvoi },
        { key: 'correspondant', label: 'Correspondant', render: (c) => h('span', {}, c.sens === 'depart' ? '→ ' : '← ', c.correspondant) },
        { key: 'objet', label: 'Objet', render: (c) => h('span', {}, c.confidentiel ? '🔒 ' : '', c.priorite !== 'normale' ? S.badge(PRIO[c.priorite], 'error') : null, ' ', c.objet) },
        { key: 'service', label: 'Service', render: (c) => [c.service, c.agent].filter(Boolean).join(' / ') },
        { key: 'echeance', label: 'Échéance', render: (c) => (c.echeance ? h('span', { style: enRetard(c) ? 'color:var(--text-default-error);font-weight:700' : '' }, S.fmtDate(c.echeance)) : '') },
        { key: 'statut', label: 'Statut', render: badge },
      ], rows, { onRow: (c) => S.go('courrier/' + c.id), empty: 'Aucun courrier.' }));
    };
    const annees = [...new Set(db.list('courriers').map((c) => String(c.numero).split('-')[1]).filter(Boolean)), String(new Date().getFullYear())].sort().reverse();
    S.add(v,
      S.bar('Registre du courrier', S.btn('Exporter CSV', () => S.download('registre-courrier.csv', S.toCSV(rows, [{ key: 'numero', label: 'Numéro' }, { key: 'sens', label: 'Sens' }, { key: 'd', label: 'Date', get: (c) => c.dateRecu || c.dateEnvoi }, { key: 'canal', label: 'Canal' }, { key: 'correspondant', label: 'Correspondant' }, { key: 'objet', label: 'Objet' }, { key: 'reference', label: 'Référence' }, { key: 'service', label: 'Service' }, { key: 'agent', label: 'Agent' }, { key: 'echeance', label: 'Échéance' }, { key: 'statut', label: 'Statut' }, { key: 'classement', label: 'Classement' }])), 'fr-btn--secondary', 'fr-icon-download-line'),
        S.btn('Imprimer le registre', () => print(), 'fr-btn--secondary', 'fr-icon-printer-line'),
        S.btn('Enregistrer', () => enregistrer(st.sens || 'arrivee'), '', 'fr-icon-add-line')),
      h('div', { class: 's-toolbar s-noprint' },
        S.search('Rechercher (n°, objet, correspondant…)', (q) => { st.q = q; draw(); }, st.q),
        S.select('Sens', [{ value: '', label: 'Tous' }, { value: 'arrivee', label: 'Arrivée' }, { value: 'depart', label: 'Départ' }, { value: 'interne', label: 'Interne' }], st.sens, (x) => { st.sens = x; st.statut = ''; draw(); }),
        S.select('Statut', [{ value: '', label: 'Tous' }, ...Object.entries({ ...ST_A, ...ST_D }).map(([k, [l]]) => ({ value: k, label: l }))], st.statut, (x) => { st.statut = x; draw(); }),
        S.select('Service', [{ value: '', label: 'Tous' }, ...services().map((s) => s.sigle)], st.service, (x) => { st.service = x; draw(); }),
        S.select('Année', [{ value: '', label: 'Toutes' }, ...annees], st.annee, (x) => { st.annee = x; draw(); }),
        h('div', { class: 'fr-checkbox-group fr-checkbox-group--sm' }, h('input', { type: 'checkbox', id: 'fret', checked: st.retard, onchange: (e) => { st.retard = e.target.checked; draw(); } }), h('label', { class: 'fr-label', for: 'fret' }, 'En retard'))),
      zone);
    draw();
  }

  /* ---------- Fiche courrier ---------- */
  function fiche(v, id) {
    const c = db.get('courriers', id);
    if (!c) return S.add(v, S.alert('Courrier introuvable', '', 'error'));
    const save = (msg) => { db.save('courriers', c); if (msg) S.toast(msg, 'success'); S.refresh(); };
    const lie = c.lienId ? db.get('courriers', c.lienId) : null;
    const reponses = db.list('courriers').filter((x) => x.lienId === c.id);
    const acts = [];
    if (c.sens !== 'depart') {
      acts.push(S.btn('Attribuer', async () => { const x = await S.formModal('Attribuer', [{ name: 'service', label: 'Service', type: 'select', required: true, options: services().map((s) => ({ value: s.sigle, label: s.nom })) }, { name: 'agent', label: 'Agent' }, { name: 'echeance', label: 'Échéance', type: 'date' }, { name: 'consigne', label: 'Consigne', type: 'textarea', rows: 2 }], c); if (x) { Object.assign(c, { service: x.service, agent: x.agent, echeance: x.echeance || c.echeance }); c.statut = 'attribue'; histo(c, `Attribué à ${x.service}${x.agent ? ' / ' + x.agent : ''}`, x.consigne); save('Courrier attribué'); } }, 'fr-btn--secondary', 'fr-icon-user-line'));
      if (['enregistre', 'attribue'].includes(c.statut)) acts.push(S.btn('Prendre en charge', () => { c.statut = 'traitement'; c.agent = c.agent || S.me(); histo(c, 'Pris en charge'); save(); }, 'fr-btn--secondary', 'fr-icon-check-line'));
      acts.push(S.btn('Rédiger la réponse', async () => { const r = { sens: 'depart', lienId: c.id, objet: 'Réponse : ' + c.objet, correspondant: c.correspondant, adresse: c.adresse, correspondantType: c.correspondantType, service: c.service, agent: c.agent || S.me(), reference: c.numero, classement: c.classement, canal: c.canal === 'Courriel' ? 'Courriel' : 'Postal', priorite: c.priorite }; await enregistrer('depart', r); }, '', 'fr-icon-send-plane-line'));
      acts.push(S.btn('Accusé de réception', () => accuse(c), 'fr-btn--secondary', 'fr-icon-file-text-line'));
      if (c.statut !== 'classe') acts.push(S.btn('Classer', async () => { const m = await S.prompt('Motif / cote de classement', c.classement || 'Sans suite', { titre: 'Classer' }); if (m !== null) { c.statut = 'classe'; c.classement = m; histo(c, 'Classé', m); save(); } }, 'fr-btn--tertiary', 'fr-icon-archive-line'));
    } else {
      if (['brouillon', 'refuse'].includes(c.statut)) acts.push(S.btn('Mettre au parapheur', () => mettreParapheur(c), '', 'fr-icon-draft-line'));
      if (c.statut === 'parapheur') acts.push(S.btn('Viser / signer', () => decider(c), '', 'fr-icon-edit-line'));
      if (c.statut === 'signe' || c.statut === 'brouillon') acts.push(S.btn('Marquer envoyé', () => { c.statut = 'envoye'; c.dateEnvoi = S.isoDate(new Date()); histo(c, 'Envoyé'); const a = lie; if (a && a.sens === 'arrivee') { a.statut = 'repondu'; histo(a, 'Réponse envoyée : ' + c.numero); db.save('courriers', a, true); } save('Courrier envoyé'); }, 'fr-btn--secondary', 'fr-icon-send-plane-line'));
    }
    acts.push(S.btn('Fiche de circulation', () => circulation(c), 'fr-btn--tertiary', 'fr-icon-printer-line'));
    const pieces = h('div');
    const drawPieces = () => S.add(S.clear(pieces), (c.pieces || []).length ? h('ul', {}, c.pieces.map((p) => h('li', {}, h('button', { class: 'fr-link', onclick: () => S.files.open(p.fid, p.nom) }, p.nom), h('span', { class: 's-small s-mention' }, ` ${Math.round(p.taille / 1024)} Ko`)))) : h('p', { class: 's-mention' }, 'Aucune pièce (courrier numérisé, réponse…).'));
    drawPieces();
    const com = h('textarea', { class: 'fr-input', rows: 2, placeholder: 'Annotation…' });
    S.add(v,
      h('nav', { class: 'fr-breadcrumb', 'aria-label': 'vous êtes ici :' }, h('ol', { class: 'fr-breadcrumb__list' }, h('li', {}, h('a', { class: 'fr-breadcrumb__link', href: '#/registre' }, 'Registre')), h('li', {}, h('a', { class: 'fr-breadcrumb__link', 'aria-current': 'page' }, c.numero)))),
      h('div', { class: 's-bar' }, h('div', {}, h('p', { class: 's-mention fr-mb-0' }, `${{ arrivee: 'Courrier arrivée', depart: 'Courrier départ', interne: 'Note interne' }[c.sens]} · ${c.numero}`), h('h1', { class: 'fr-h3 fr-mb-1w' }, c.confidentiel ? '🔒 ' : '', c.objet), h('div', {}, badge(c), ' ', c.priorite !== 'normale' ? S.badge(PRIO[c.priorite], 'error') : null, ' ', enRetard(c) ? S.badge('Échéance dépassée', 'error') : null)),
        h('div', { class: 's-bar__actions' }, S.btn('Modifier', () => enregistrer(c.sens, c), 'fr-btn--tertiary', 'fr-icon-edit-line'))),
      h('div', { class: 'fr-btns-group fr-btns-group--inline-sm fr-btns-group--icon-left fr-mb-2w' }, acts),
      c.parapheur?.etapes?.length ? h('div', { class: 's-panel s-panel--alt' }, h('h2', { class: 'fr-h6' }, 'Circuit de signature'), h('div', { class: 's-steps' }, c.parapheur.etapes.map((e) => h('span', { class: 's-step ' + (e === etapeCour(c) ? 'cur' : ['visé', 'signé'].includes(e.statut) ? 'done' : ''), title: e.commentaire || '' }, `${e.type === 'signature' ? '✍ Signature' : '✔ Visa'} : ${e.qui}${e.date ? ' — ' + S.fmtDT(e.date) : ''}${e.statut === 'refusé' ? ' (refusé)' : ''}`)))) : null,
      h('div', { class: 's-cols' },
        h('div', {},
          h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, 'Informations'),
            h('dl', {}, [[c.sens === 'depart' ? 'Destinataire' : 'Expéditeur', c.correspondant], ['Catégorie', c.correspondantType], ['Adresse', c.adresse], ['Canal', c.canal], [c.sens === 'depart' ? 'Date' : 'Reçu le', S.fmtDate(c.dateRecu || c.dateEnvoi)], ['Daté du', S.fmtDate(c.dateCourrier)], ['Référence', c.reference], ['Service', [c.service, c.agent].filter(Boolean).join(' / ')], ['Copies', (c.copies || []).join(', ')], ['Échéance', S.fmtDate(c.echeance)], ['Signataire', c.signataire], ['Classement', c.classement], ['Notes', c.notes]].filter(([, x]) => x).map(([k, x]) => h('div', { class: 'fr-mb-1w' }, h('dt', { class: 's-small s-mention' }, k), h('dd', { style: 'margin:0;white-space:pre-wrap' }, x)))),
            lie ? h('p', {}, 'En réponse à : ', h('a', { class: 'fr-link', href: '#/courrier/' + lie.id }, lie.numero + ' — ' + lie.objet)) : null,
            reponses.length ? h('p', {}, 'Réponse(s) : ', reponses.map((r) => h('a', { class: 'fr-link fr-mr-2w', href: '#/courrier/' + r.id }, r.numero + ' ', badge(r)))) : null),
          h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, 'Pièces'), pieces, S.btn('Joindre', async () => { const fs = await S.pickFile('*', true); for (const f of fs || []) { const fid = await S.files.put(f); c.pieces = c.pieces || []; c.pieces.push({ fid, nom: f.name, taille: f.size }); histo(c, 'Pièce jointe : ' + f.name); } db.save('courriers', c, true); drawPieces(); }, 'fr-btn--secondary fr-btn--sm', 'fr-icon-attachment-line'))),
        h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, 'Historique'), com, S.btn('Annoter', () => { if (com.value.trim()) { histo(c, 'Annotation', com.value.trim()); save(); } }, 'fr-btn--sm fr-mt-1w fr-mb-2w', 'fr-icon-chat-3-line'),
          h('ol', { class: 's-timeline' }, (c.historique || []).slice().reverse().map((x) => h('li', { class: /Refus/.test(x.action) ? 'hi' : '' }, h('time', {}, S.fmtDT(x.date) + ' — ' + x.qui), h('strong', {}, x.action), x.commentaire ? h('div', { style: 'white-space:pre-wrap' }, x.commentaire) : null))))),
      S.btn('Supprimer ce courrier', async () => { if (await S.confirm('Supprimer définitivement ce courrier du registre ? (préférez « Classer » pour conserver la traçabilité)', { ok: 'Supprimer' })) { db.remove('courriers', c.id); S.go('registre'); } }, 'fr-btn--tertiary-no-outline fr-btn--sm', 'fr-icon-delete-line'));
  }

  /* ---------- Parapheur ---------- */
  async function mettreParapheur(c) {
    const s = svc(c.service);
    const dir = svc('DIR');
    const x = await S.formModal('Circuit de visa et signature', [
      { name: 'v1', label: 'Visa 1', default: s?.chef || '' }, { name: 'v2', label: 'Visa 2 (facultatif)' }, { name: 'v3', label: 'Visa 3 (facultatif)' },
      { name: 'sig', label: 'Signataire', required: true, default: c.signataire || dir?.chef || 'Directeur' },
      { name: 'commentaire', label: 'Mot pour le parapheur', type: 'textarea', rows: 2 },
    ], {}, { okLabel: 'Envoyer au parapheur' });
    if (!x) return;
    c.parapheur = { etapes: [x.v1, x.v2, x.v3].filter(Boolean).map((qui) => ({ type: 'visa', qui, statut: 'en attente' })).concat([{ type: 'signature', qui: x.sig, statut: 'en attente' }]) };
    c.signataire = x.sig; c.statut = 'parapheur';
    histo(c, 'Mis au parapheur', x.commentaire);
    db.save('courriers', c); S.toast('Envoyé au parapheur', 'success'); S.refresh();
  }
  async function decider(c) {
    const e = etapeCour(c); if (!e) return;
    const com = h('textarea', { class: 'fr-input', rows: 3 });
    const go = (ok) => {
      e.statut = ok ? (e.type === 'signature' ? 'signé' : 'visé') : 'refusé'; e.date = new Date().toISOString(); e.par = S.me(); e.commentaire = com.value;
      if (!ok) { c.statut = 'refuse'; histo(c, `Refusé au parapheur (${e.type})`, com.value); }
      else { histo(c, e.type === 'signature' ? 'Signé' : 'Visé', com.value); if (!etapeCour(c)) { c.statut = 'signe'; c.signeLe = e.date; c.signePar = S.me(); } }
      db.save('courriers', c); S.toast(ok ? (e.type === 'signature' ? 'Signé' : 'Visé') : 'Refusé', ok ? 'success' : 'warning'); S.refresh();
    };
    S.modal({ titre: `${e.type === 'signature' ? 'Signature' : 'Visa'} — ${c.numero}`, body: h('div', {}, h('p', {}, h('strong', {}, c.objet)), h('p', { class: 's-small' }, `Étape attendue : ${e.type} par ${e.qui}. Vous agissez en tant que ${S.me()}.`), (c.pieces || []).length ? h('p', {}, 'Pièces : ', c.pieces.map((p) => h('button', { class: 'fr-link fr-mr-1w', onclick: () => S.files.open(p.fid, p.nom) }, p.nom))) : null, h('div', { class: 'fr-input-group' }, h('label', { class: 'fr-label' }, 'Commentaire (obligatoire en cas de refus)'), com)),
      actions: [{ label: 'Refuser', onClick: () => { if (!com.value.trim()) { S.toast('Indiquez le motif du refus', 'warning'); return false; } go(false); } }, { label: e.type === 'signature' ? 'Signer' : 'Viser', primary: true, onClick: () => go(true) }] });
  }
  function parapheur(v) {
    const all = db.list('courriers').filter((c) => c.statut === 'parapheur');
    const moi = all.filter((c) => estMoi(etapeCour(c)?.qui));
    const cols = [{ key: 'numero', label: 'N°' }, { key: 'objet', label: 'Objet' }, { key: 'correspondant', label: 'Destinataire' }, { key: 'service', label: 'Service' }, { key: 'etape', label: 'Étape', render: (c) => { const e = etapeCour(c); return e ? `${e.type === 'signature' ? '✍ Signature' : '✔ Visa'} — ${e.qui}` : ''; } }, { key: 'a', label: '', render: (c) => S.btn('Traiter', () => decider(c), 'fr-btn--sm') }];
    S.add(v, h('h1', { class: 'fr-h3' }, 'Parapheur'),
      S.settings().agent ? null : S.alert(null, 'Renseignez votre nom dans Paramètres pour voir les documents qui vous attendent.', 'info'),
      h('h2', { class: 'fr-h5' }, `À ma signature / mon visa (${moi.length})`), S.table(cols, moi, { onRow: (c) => S.go('courrier/' + c.id), empty: 'Aucun document en attente de votre part.' }),
      h('h2', { class: 'fr-h5 fr-mt-4w' }, `Tous les documents au parapheur (${all.length})`), S.table(cols, all, { onRow: (c) => S.go('courrier/' + c.id), empty: 'Parapheur vide.' }));
  }

  /* ---------- Documents imprimables ---------- */
  const pageHTML = (titre, corps) => {
    const s = S.settings();
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${S.esc(titre)}</title><style>@page{size:A4;margin:18mm}body{font-family:Marianne,Arial,sans-serif;font-size:11pt;color:#161616;line-height:1.45;max-width:180mm;margin:auto}.m{font-weight:700;text-transform:uppercase;font-size:10pt;line-height:1.15}.m:before{content:"";display:block;width:34px;height:12px;background:linear-gradient(90deg,#000091 33%,#fff 33% 66%,#e1000f 66%);margin-bottom:5px;border:1px solid #eee}.dv{font-style:italic;font-size:8pt;margin-top:2px}.ent{font-size:9pt;margin-top:10mm;font-weight:700}.ad{font-size:8.5pt;color:#444}.dst{margin:12mm 0 0 95mm}.ref{font-size:9pt;margin-top:10mm}h1{font-size:14pt;margin:8mm 0 4mm}table{width:100%;border-collapse:collapse;font-size:10pt}td,th{border:1px solid #888;padding:4px 6px;vertical-align:top;text-align:left}.sig{margin:14mm 0 0 95mm}.small{font-size:8.5pt;color:#444}</style></head><body><div class="m">${S.marqueHTML()}</div><div class="dv">Liberté<br>Égalité<br>Fraternité</div><div class="ent">${S.esc(s.entiteLongue || s.entite)}</div><div class="ad">${S.esc(s.adresse || '')}</div>${corps}<script>setTimeout(()=>print(),300)<\/script></body></html>`;
  };
  const ouvrir = (html) => { const w = window.open('', '_blank'); if (!w) return S.toast('Autorisez les fenêtres surgissantes', 'warning'); w.document.write(html); w.document.close(); };
  function accuse(c) {
    const s = S.settings(); const sv = svc(c.service);
    const silence = c.echeance ? S.fmtDate(c.echeance) : '';
    ouvrir(pageHTML('Accusé de réception ' + c.numero, `
<div class="dst">${S.esc(c.correspondant)}<br>${S.esc(c.adresse || '').replace(/\n/g, '<br>')}</div>
<p style="text-align:right;margin-top:8mm">Rennes, le ${S.fmtLong(new Date()).replace(/^\w+ /, '')}</p>
<div class="ref">Nos réf. : ${S.esc(c.numero)}${c.reference ? '<br>Vos réf. : ' + S.esc(c.reference) : ''}<br>Affaire suivie par : ${S.esc(c.agent || sv?.nom || s.entite)}</div>
<h1>Accusé de réception</h1>
<p>Madame, Monsieur,</p>
<p>J’accuse réception de votre ${c.canal === 'Courriel' ? 'message électronique' : 'courrier'}${c.dateCourrier ? ' du ' + S.fmtDate(c.dateCourrier) : ''}, reçu le ${S.fmtDate(c.dateRecu)}, relatif à : <strong>${S.esc(c.objet)}</strong>.</p>
<p>Votre demande a été enregistrée sous le numéro ${S.esc(c.numero)} et transmise ${sv ? 'au ' + S.esc(sv.nom) : 'au service compétent'}${sv?.email ? ' (' + S.esc(sv.email) + ')' : ''}, chargé de son instruction.</p>
${silence ? `<p>Conformément aux articles L. 112-3 et R. 112-5 du code des relations entre le public et l’administration, je vous informe qu’en l’absence de réponse de l’administration au ${silence}, votre demande pourra faire l’objet d’une décision implicite dans les conditions prévues par les textes applicables à cette procédure. Vous disposerez alors des voies et délais de recours de droit commun.</p>` : ''}
<p>Si votre demande est incomplète, le service vous indiquera les pièces manquantes ; le délai mentionné ci-dessus ne courra qu’à compter de leur réception.</p>
<p>Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.</p>
<div class="sig">Pour le directeur et par délégation,<br><br><br>${S.esc(S.me())}</div>`));
    histo(c, 'Accusé de réception édité'); db.save('courriers', c, true);
  }
  function circulation(c) {
    ouvrir(pageHTML('Fiche de circulation ' + c.numero, `
<h1>Fiche de circulation — ${S.esc(c.numero)}</h1>
<table><tr><th style="width:35%">Objet</th><td>${S.esc(c.objet)}</td></tr><tr><th>${c.sens === 'depart' ? 'Destinataire' : 'Expéditeur'}</th><td>${S.esc(c.correspondant)}</td></tr><tr><th>Date</th><td>${S.fmtDate(c.dateRecu || c.dateEnvoi)} (${S.esc(c.canal || '')})</td></tr><tr><th>Service / agent</th><td>${S.esc([c.service, c.agent].filter(Boolean).join(' / '))}</td></tr><tr><th>Copies</th><td>${S.esc((c.copies || []).join(', '))}</td></tr><tr><th>Échéance</th><td>${S.fmtDate(c.echeance)}</td></tr><tr><th>Priorité</th><td>${PRIO[c.priorite] || ''}</td></tr></table>
<h1>Circuit</h1>
<table><tr><th>Destinataire</th><th style="width:16%">Pour attribution</th><th style="width:16%">Pour information</th><th style="width:16%">Visa / date</th><th>Observations</th></tr>
${[...(c.parapheur?.etapes || []).map((e) => e.qui), ...services().map((s) => s.sigle)].slice(0, 12).map((x) => `<tr><td>${S.esc(x)}</td><td>${x === c.service ? '☒' : '☐'}</td><td>${(c.copies || []).includes(x) ? '☒' : '☐'}</td><td></td><td style="height:9mm"></td></tr>`).join('')}</table>
<h1>Annotations</h1><table><tr><td style="height:45mm">${(c.historique || []).filter((x) => x.commentaire).map((x) => `${S.fmtDate(x.date)} ${S.esc(x.qui)} : ${S.esc(x.commentaire)}`).join('<br>')}</td></tr></table>
<p class="small">Édité le ${S.fmtDT(new Date())} — ${S.esc(S.me())}</p>`));
  }

  /* ---------- Statistiques ---------- */
  function stats(v) {
    const all = db.list('courriers');
    const y = new Date().getFullYear();
    const mois = [...Array(12)].map((_, i) => `${y}-${S.pad(i + 1)}`);
    const nb = (sens, m) => all.filter((c) => c.sens === sens && (c.dateRecu || c.dateEnvoi || '').startsWith(m)).length;
    const max = Math.max(1, ...mois.flatMap((m) => [nb('arrivee', m), nb('depart', m)]));
    const delais = all.filter((c) => c.sens === 'depart' && c.lienId && c.statut === 'envoye').map((d) => { const a = db.get('courriers', d.lienId); return a ? S.daysBetween(a.dateRecu, d.dateEnvoi) : null; }).filter((x) => x != null);
    const parSvc = services().map((s) => [s.sigle, all.filter((c) => c.service === s.sigle && c.sens === 'arrivee').length, all.filter((c) => c.service === s.sigle && enRetard(c)).length]);
    S.add(v, h('h1', { class: 'fr-h3' }, 'Statistiques ' + y),
      S.kpis([{ v: all.filter((c) => c.sens === 'arrivee' && String(c.numero).includes('-' + y + '-')).length, l: 'courriers arrivés' }, { v: all.filter((c) => c.sens === 'depart' && String(c.numero).includes('-' + y + '-')).length, l: 'courriers départ' }, { v: delais.length ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length) + ' j' : '—', l: 'délai moyen de réponse' }, { v: delais.length ? Math.round((delais.filter((d) => d <= 15).length / delais.length) * 100) + ' %' : '—', l: 'réponses sous 15 jours' }, { v: all.filter(enRetard).length, l: 'en retard', type: all.some(enRetard) ? 'err' : 'ok' }]),
      h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, 'Volume mensuel'), h('div', { style: 'display:flex;gap:.5rem;align-items:flex-end;height:180px' }, mois.map((m, i) => h('div', { style: 'flex:1;display:flex;flex-direction:column;align-items:center;gap:2px' }, h('div', { style: 'display:flex;gap:2px;align-items:flex-end;height:150px' }, h('div', { title: 'Arrivée : ' + nb('arrivee', m), style: { width: '10px', height: (nb('arrivee', m) / max) * 150 + 'px', background: 'var(--background-action-high-blue-france)' } }), h('div', { title: 'Départ : ' + nb('depart', m), style: { width: '10px', height: (nb('depart', m) / max) * 150 + 'px', background: 'var(--background-flat-success)' } })), h('span', { class: 's-small' }, S.MOIS[i].slice(0, 3))))),
        h('p', { class: 's-small' }, h('span', { class: 's-dot', style: 'background:var(--background-action-high-blue-france)' }), 'Arrivée ', h('span', { class: 's-dot fr-ml-2w', style: 'background:var(--background-flat-success)' }), 'Départ')),
      h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, 'Par service'), S.table([{ key: '0', label: 'Service' }, { key: '1', label: 'Courriers attribués', class: 'num' }, { key: '2', label: 'En retard', class: 'num' }], parSvc.map(([a, b, c]) => ({ 0: a, 1: b, 2: c })))));
  }

  /* ---------- Services ---------- */
  function servicesV(v) {
    const fields = [{ name: 'sigle', label: 'Sigle', required: true }, { name: 'nom', label: 'Nom', required: true }, { name: 'chef', label: 'Chef de service (viseur par défaut)' }, { name: 'email', label: 'Courriel fonctionnel', type: 'email' }];
    const edit = async (s = {}) => { const x = await S.formModal(s.id ? 'Modifier le service' : 'Nouveau service', fields, s, { extraActions: s.id ? [{ label: 'Supprimer', onClick: () => { db.remove('services', s.id); S.refresh(); } }] : [] }); if (x) { db.save('services', x); S.refresh(); } };
    S.add(v, S.bar('Services', S.btn('Ajouter', () => edit(), '', 'fr-icon-add-line')), S.table([{ key: 'sigle', label: 'Sigle' }, { key: 'nom', label: 'Nom' }, { key: 'chef', label: 'Chef de service' }, { key: 'email', label: 'Courriel' }], services(), { onRow: edit }));
  }
})();
