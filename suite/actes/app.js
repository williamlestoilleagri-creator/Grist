/* Actes & publipostage — modèles (arrêtés, courriers, convocations…), rédaction assistée, publipostage CSV/Grist, registre numéroté */
(function () {
  'use strict';
  const h = S.h;
  const db = S.db('actes', ['modeles', 'actes']);
  const TYPES = { 'Arrêté': 'ARR', Courrier: 'CR', Note: 'NOTE', Convocation: 'CONV', 'Mise en demeure': 'MED', Attestation: 'ATT', 'Décision': 'DEC' };

  if (!S.load('actes:init')) {
    S.save('actes:init', 1);
    const M = (nom, type, format, corps, extra = {}) => db.save('modeles', Object.assign({ nom, type, format, corps, signataire: 'Pour la préfète et par délégation,\nle directeur régional', lieu: 'Rennes' }, extra), true);
    M('Arrêté préfectoral', 'Arrêté', 'arrete', `<p style="text-align:center"><strong>ARRÊTÉ n° {{numero}}</strong><br>du {{date}}</p>
<p style="text-align:center"><strong>portant {{objet}}</strong></p>
<p style="text-align:center"><strong>LA PRÉFÈTE DE LA RÉGION BRETAGNE</strong></p>
<p><strong>VU</strong> {{vu_1}} ;</p>
<p><strong>VU</strong> {{vu_2}} ;</p>
<p><strong>CONSIDÉRANT</strong> {{considerant}} ;</p>
<p><strong>SUR</strong> proposition du directeur régional de l’alimentation, de l’agriculture et de la forêt ;</p>
<p style="text-align:center"><strong>ARRÊTE</strong></p>
<p><strong>Article 1er</strong> — {{article_1}}</p>
<p><strong>Article 2</strong> — {{article_2}}</p>
<p><strong>Article 3</strong> — Le présent arrêté peut faire l’objet d’un recours gracieux auprès de son auteur ou d’un recours contentieux devant le tribunal administratif de Rennes dans un délai de deux mois à compter de sa notification ou de sa publication. Le tribunal peut être saisi par l’application « Télérecours citoyens » accessible sur le site www.telerecours.fr.</p>
<p><strong>Article 4</strong> — Le secrétaire général pour les affaires régionales et le directeur régional de l’alimentation, de l’agriculture et de la forêt sont chargés, chacun en ce qui le concerne, de l’exécution du présent arrêté, qui sera publié au recueil des actes administratifs de la préfecture de la région Bretagne.</p>`, { signataire: 'La préfète de région' });
    M('Courrier simple', 'Courrier', 'courrier', `<p>{{civilite}},</p>
<p>{{corps}}</p>
<p>Je vous prie d’agréer, {{civilite}}, l’expression de mes salutations distinguées.</p>`);
    M('Convocation à une réunion', 'Convocation', 'courrier', `<p>{{civilite}},</p>
<p>J’ai l’honneur de vous convier à la réunion relative à <strong>{{objet_reunion}}</strong>, qui se tiendra le <strong>{{date_reunion}}</strong> à <strong>{{heure}}</strong>, {{lieu_reunion}}.</p>
<p>L’ordre du jour sera le suivant :</p>
<p>{{ordre_du_jour}}</p>
<p>Une participation à distance sera possible via le lien suivant : {{lien_visio}}</p>
<p>Je vous remercie de bien vouloir confirmer votre présence auprès de {{contact}}.</p>
<p>Je vous prie d’agréer, {{civilite}}, l’expression de mes salutations distinguées.</p>`);
    M('Mise en demeure (suite de contrôle)', 'Mise en demeure', 'courrier', `<p><strong>Lettre recommandée avec accusé de réception</strong></p>
<p>{{civilite}},</p>
<p>Lors du contrôle effectué le <strong>{{date_controle}}</strong> au sein de l’établissement <strong>{{etablissement}}</strong> ({{siret}}), situé {{adresse}}, l’inspecteur ({{inspecteur}}) a constaté les manquements suivants :</p>
<p>{{non_conformites}}</p>
<p>En conséquence, je vous mets en demeure de mettre votre établissement en conformité avec la réglementation <strong>au plus tard le {{delai}}</strong>.</p>
<p>À l’issue de ce délai, une nouvelle inspection sera réalisée. Si les manquements persistaient, je serais amené à prendre les mesures administratives prévues par la réglementation, sans préjudice des poursuites pénales encourues.</p>
<p>Conformément aux articles L. 121-1 et L. 122-1 du code des relations entre le public et l’administration, vous disposez d’un délai de quinze jours pour présenter vos observations écrites.</p>
<p>Je vous prie d’agréer, {{civilite}}, l’expression de mes salutations distinguées.</p>`);
    M('Attestation', 'Attestation', 'attestation', `<p style="text-align:center"><strong>ATTESTATION</strong></p>
<p>Je soussigné, {{signataire_nom}}, {{signataire_qualite}}, atteste que {{beneficiaire}} {{objet_attestation}}.</p>
<p>La présente attestation est délivrée pour servir et valoir ce que de droit.</p>`);
    M('Note à l’attention de', 'Note', 'note', `<p><strong>À l’attention de :</strong> {{destinataire_note}}</p>
<p><strong>Objet :</strong> {{objet}}</p>
<p><strong>Contexte</strong></p><p>{{contexte}}</p>
<p><strong>Analyse</strong></p><p>{{analyse}}</p>
<p><strong>Proposition</strong></p><p>{{proposition}}</p>`, { signataire: 'Le rédacteur' });
  }

  const vars = (m) => [...new Set([...(m.corps || '').matchAll(/\{\{\s*([\w.]+)\s*(?:\|[^}]*)?\}\}/g)].map((x) => x[1]))];
  const AUTO = ['numero', 'date'];
  const label = (v) => v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const numeroSuivant = (m, peek = true) => { const p = TYPES[m.type] || 'DOC'; const y = new Date().getFullYear(); const n = db.list('actes').filter((a) => String(a.numero).startsWith(`${p}-${y}-`)).length + 1; return `${p}-${y}-${String(n).padStart(3, '0')}`; };
  const fillHTML = (tpl, data) => tpl.replace(/\{\{\s*([\w.]+)\s*(?:\|\s*(\w+))?\s*\}\}/g, (m0, k, f) => { let v = S.get(data, k); if (v == null || v === '') return `<mark style="background:#fff3b0">[${S.esc(label(k))}]</mark>`; if (f === 'date') v = S.fmtDate(v); if (f === 'maj') v = String(v).toUpperCase(); return S.esc(v).replace(/\n/g, '<br>'); });

  /* ---------- Mise en page ---------- */
  function pageHTML(m, data) {
    const s = S.settings();
    const d = Object.assign({ date: S.fmtLong(new Date()).replace(/^\w+ /, ''), lieu: m.lieu || 'Rennes' }, data);
    const corps = fillHTML(m.corps || '', d);
    const dest = m.format === 'courrier' ? `<div class="dst">${S.esc(d.destinataire || '[Destinataire]')}<br>${S.esc(d.adresse_destinataire || '').replace(/\n/g, '<br>')}</div>` : '';
    const refs = m.format === 'courrier' || m.format === 'note' ? `<div class="refs">Nos réf. : ${S.esc(d.numero || '')}${d.vos_ref ? '<br>Vos réf. : ' + S.esc(d.vos_ref) : ''}<br>Affaire suivie par : ${S.esc(d.affaire_suivie_par || S.me())}${d.tel ? '<br>Tél. : ' + S.esc(d.tel) : ''}</div>` : '';
    const objet = m.format === 'courrier' && (d.objet || m.objet) ? `<p class="obj"><strong>Objet :</strong> ${S.esc(d.objet || m.objet)}</p>` : '';
    const lieuDate = m.format === 'arrete' ? '' : `<p class="ld">${S.esc(d.lieu)}, le ${S.esc(d.date)}</p>`;
    const sigLieu = m.format === 'arrete' ? `<p class="ld">Fait à ${S.esc(d.lieu)}, le ${S.esc(d.date)}</p>` : '';
    return `<section class="page"><header class="hd"><div class="mq"><div class="fl"></div><div class="mt">${S.marqueHTML()}</div><div class="dv">Liberté<br>Égalité<br>Fraternité</div></div><div class="ent">${S.esc(s.entiteLongue || s.entite)}</div></header>
${refs}${dest}${lieuDate}${objet}<div class="corps">${corps}</div>${sigLieu}<div class="sig">${S.esc(d.signataire || m.signataire || '').replace(/\n/g, '<br>')}<br><br><br>${S.esc(d.signataire_nom || '')}</div>
<footer class="ft">${S.esc(s.adresse || '')}</footer></section>`;
  }
  const PAGE_CSS = `@page{size:A4;margin:0}.page{width:210mm;min-height:297mm;padding:15mm 20mm 22mm;box-sizing:border-box;background:#fff;color:#161616;font-family:Marianne,Arial,sans-serif;font-size:10.5pt;line-height:1.45;position:relative;margin:0 auto 8mm;box-shadow:0 1px 6px rgba(0,0,0,.25);page-break-after:always}.page:last-child{page-break-after:auto}.hd{display:flex;justify-content:space-between;align-items:flex-start}.mq .fl{width:36px;height:13px;background:linear-gradient(90deg,#000091 33%,#fff 33% 66%,#e1000f 66%);border:1px solid #ddd}.mq .mt{font-weight:700;text-transform:uppercase;font-size:10pt;line-height:1.12;margin-top:4px}.mq .dv{font-style:italic;font-size:7pt;line-height:1.1;margin-top:3px}.ent{font-size:8.5pt;text-align:right;max-width:75mm;font-weight:700}.refs{font-size:8.5pt;margin-top:8mm}.dst{margin:6mm 0 0 95mm;min-height:22mm}.ld{text-align:right;margin:6mm 0}.obj{margin:4mm 0}.corps p{margin:0 0 3mm;text-align:justify}.sig{margin:10mm 0 0 95mm}.ft{position:absolute;left:20mm;right:20mm;bottom:9mm;font-size:7.5pt;color:#555;border-top:1px solid #ccc;padding-top:2mm}@media print{.page{box-shadow:none;margin:0}body{background:#fff}}`;
  const docHTML = (pages, titre) => `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${S.esc(titre)}</title><style>body{background:#eee;margin:0;padding:8mm 0}${PAGE_CSS}</style></head><body>${pages.join('\n')}</body></html>`;
  const ouvrir = (html) => { const w = window.open('', '_blank'); if (!w) return S.toast('Autorisez les fenêtres surgissantes', 'warning'); w.document.write(html + '<script>setTimeout(()=>print(),400)<\/script>'); w.document.close(); };
  const wordDoc = (pages, nom) => { const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Marianne,Arial;font-size:10.5pt}.mq .fl{display:none}.mt{font-weight:bold;text-transform:uppercase}.dst{margin-left:9cm}.ld,.ent{text-align:right}.sig{margin-left:9cm;margin-top:1cm}.ft{font-size:7.5pt;color:#555}.page{page-break-after:always}</style></head><body>${pages.join('<br clear=all style="page-break-before:always">')}</body></html>`; S.download(nom + '.doc', '﻿' + html, 'application/msword'); };

  document.head.append(h('style', {}, `${PAGE_CSS.replace(/@page\{[^}]*\}/, '')}
.ac-preview{background:var(--background-alt-grey);padding:1rem;overflow:auto;max-height:80vh;border:1px solid var(--border-default-grey)}
.ac-preview .page{transform-origin:top left}
.ac-editor{min-height:24rem;border:1px solid var(--border-default-grey);padding:1rem;background:#fff;color:#161616;font-family:Marianne,Arial;line-height:1.5}
.ac-editor:focus{outline:2px solid var(--border-action-high-blue-france)}
.ac-tb{display:flex;flex-wrap:wrap;gap:2px;border:1px solid var(--border-default-grey);border-bottom:0;padding:.25rem;background:var(--background-alt-grey)}
.ac-tb button{min-width:2rem;padding:.2rem .5rem;border:1px solid transparent;background:none;font-weight:700;cursor:pointer;color:var(--text-default-grey)}
.ac-tb button:hover{border-color:var(--border-default-grey);background:var(--background-default-grey)}
`));
  S.init({
    titre: 'Actes & publipostage', sousTitre: 'Arrêtés, courriers, convocations', db,
    grist: { modeles: 'Actes_modeles', actes: 'Actes_registre' },
    nav: [{ id: 'modeles', label: 'Modèles' }, { id: 'rediger', label: 'Rédiger' }, { id: 'publipostage', label: 'Publipostage' }, { id: 'registre', label: 'Registre des actes' }],
    render(r, p, v) { S.clear(v); ({ modeles, rediger, publipostage, registre, modele: editModele }[r] || modeles)(v, ...p); },
  });

  /* ---------- Modèles ---------- */
  function modeles(v) {
    S.add(v, S.bar('Modèles de documents', S.btn('Nouveau modèle', () => { const m = db.save('modeles', { nom: 'Nouveau modèle', type: 'Courrier', format: 'courrier', corps: '<p>{{civilite}},</p><p>…</p>', signataire: 'Le directeur régional', lieu: 'Rennes' }); S.go('modele/' + m.id); }, '', 'fr-icon-add-line')),
      h('p', {}, 'Les zones variables s’écrivent ', h('code', {}, '{{nom_de_la_variable}}'), ' ; elles deviennent automatiquement des champs à remplir ou des colonnes de publipostage. Variables automatiques : ', h('code', {}, '{{numero}}'), ', ', h('code', {}, '{{date}}'), '. Filtres : ', h('code', {}, '{{date_reunion|date}}'), ', ', h('code', {}, '{{nom|maj}}'), '.'),
      h('div', { class: 's-grid' }, db.list('modeles').map((m) => h('div', { class: 'fr-card' }, h('div', { class: 'fr-card__body' }, h('div', { class: 'fr-card__content' },
        h('h2', { class: 'fr-card__title' }, m.nom), h('p', { class: 'fr-card__desc' }, `${m.type} · ${vars(m).filter((x) => !AUTO.includes(x)).length} variable(s)`),
        h('div', { class: 'fr-card__start' }, h('div', { class: 's-tags' }, vars(m).slice(0, 8).map((x) => S.tag(x))))),
        h('div', { class: 'fr-card__footer' }, h('div', { class: 'fr-btns-group fr-btns-group--inline-sm' }, S.btn('Rédiger', () => S.go('rediger/' + m.id), 'fr-btn--sm'), S.btn('Publipostage', () => S.go('publipostage/' + m.id), 'fr-btn--sm fr-btn--secondary'), S.btn('Modifier', () => S.go('modele/' + m.id), 'fr-btn--sm fr-btn--tertiary'))))))));
  }
  function editModele(v, id) {
    const m = db.get('modeles', id); if (!m) return S.add(v, S.alert('Modèle introuvable', '', 'error'));
    const save = S.debounce(() => { db.save('modeles', m, true); prev(); chips(); }, 300);
    const f = S.form([{ name: 'nom', label: 'Nom du modèle', required: true }, { name: 'type', label: 'Type (numérotation)', type: 'select', required: true, options: Object.keys(TYPES) }, { name: 'format', label: 'Mise en page', type: 'select', required: true, options: [{ value: 'courrier', label: 'Courrier (destinataire, références, objet)' }, { value: 'arrete', label: 'Arrêté / décision' }, { value: 'note', label: 'Note interne' }, { value: 'attestation', label: 'Attestation' }] }, { name: 'objet', label: 'Objet par défaut' }, { name: 'lieu', label: 'Lieu' }, { name: 'signataire', label: 'Bloc signature', type: 'textarea', rows: 2 }], m);
    f.el.addEventListener('input', () => { Object.assign(m, f.get()); save(); }); f.el.addEventListener('change', () => { Object.assign(m, f.get()); save(); });
    const ed = h('div', { class: 'ac-editor', contenteditable: 'true', html: m.corps, 'aria-label': 'Corps du modèle', oninput: () => { m.corps = ed.innerHTML; save(); } });
    const cmd = (c, val) => { ed.focus(); document.execCommand(c, false, val); m.corps = ed.innerHTML; save(); };
    const tb = h('div', { class: 'ac-tb', role: 'toolbar' },
      [['G', 'bold'], ['I', 'italic'], ['S', 'underline']].map(([l, c]) => h('button', { type: 'button', title: c, onmousedown: (e) => e.preventDefault(), onclick: () => cmd(c) }, l)),
      h('button', { type: 'button', title: 'Liste', onmousedown: (e) => e.preventDefault(), onclick: () => cmd('insertUnorderedList') }, '• Liste'),
      h('button', { type: 'button', title: 'Centrer', onmousedown: (e) => e.preventDefault(), onclick: () => cmd('justifyCenter') }, 'Centrer'),
      h('button', { type: 'button', title: 'Justifier', onmousedown: (e) => e.preventDefault(), onclick: () => cmd('justifyFull') }, 'Justifier'),
      h('button', { type: 'button', title: 'Gauche', onmousedown: (e) => e.preventDefault(), onclick: () => cmd('justifyLeft') }, 'Gauche'),
      h('button', { type: 'button', onmousedown: (e) => e.preventDefault(), onclick: async () => { const n = await S.prompt('Nom de la variable (sans espace)', 'nom_du_champ'); if (n) cmd('insertText', `{{${S.slug(n)}}}`); } }, '+ Variable'),
      h('button', { type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => cmd('removeFormat') }, 'Effacer format'));
    const chipZone = h('div', { class: 's-tags' });
    const chips = () => S.add(S.clear(chipZone), vars(m).map((x) => S.tag(x)));
    const pv = h('div', { class: 'ac-preview' });
    const prev = () => { const d = {}; vars(m).forEach((x) => { d[x] = ''; }); d.numero = numeroSuivant(m); pv.innerHTML = pageHTML(m, Object.fromEntries(Object.entries(d).filter(([, x]) => x))); scale(pv); };
    S.add(v, h('nav', { class: 'fr-breadcrumb', 'aria-label': 'vous êtes ici :' }, h('ol', { class: 'fr-breadcrumb__list' }, h('li', {}, h('a', { class: 'fr-breadcrumb__link', href: '#/modeles' }, 'Modèles')), h('li', {}, h('a', { class: 'fr-breadcrumb__link', 'aria-current': 'page' }, m.nom)))),
      S.bar('Modifier le modèle', S.btn('Dupliquer', () => { const x = S.clone(m); delete x.id; x.nom += ' (copie)'; const n = db.save('modeles', x); S.go('modele/' + n.id); }, 'fr-btn--tertiary', 'fr-icon-file-add-line'), S.btn('Supprimer', async () => { if (await S.confirm('Supprimer ce modèle ?')) { db.remove('modeles', m.id); S.go('modeles'); } }, 'fr-btn--tertiary', 'fr-icon-delete-line'), S.btn('Rédiger avec ce modèle', () => { db.save('modeles', m); S.go('rediger/' + m.id); }, '', 'fr-icon-edit-line')),
      h('div', { class: 's-cols' }, h('div', {}, h('div', { class: 's-panel' }, f.el), h('label', { class: 'fr-label fr-mb-1w' }, 'Corps du document'), tb, ed, h('p', { class: 's-small fr-mt-1w' }, 'Variables détectées : '), chipZone), h('div', {}, h('p', { class: 's-small s-mention' }, 'Aperçu'), pv)));
    chips(); prev();
  }
  const scale = (pv) => setTimeout(() => { const p = pv.querySelector('.page'); if (!p) return; const k = Math.min(1, (pv.clientWidth - 32) / p.offsetWidth); pv.querySelectorAll('.page').forEach((x) => { x.style.transform = `scale(${k})`; x.style.marginBottom = `${-(1 - k) * x.offsetHeight + 16}px`; }); }, 0);

  /* ---------- Rédaction ---------- */
  function rediger(v, id) {
    const pre = S.load('actes:prefill', null);
    let m = db.get('modeles', id);
    if (!m && pre) m = db.list('modeles').find((x) => S.norm(x.nom).includes(S.norm(pre.modele || '')) || S.norm(x.type) === S.norm(pre.modele || '')) || db.list('modeles').find((x) => x.type === 'Mise en demeure');
    if (!m) return S.add(v, h('h1', { class: 'fr-h3' }, 'Rédiger un document'), h('p', {}, 'Choisissez un modèle :'), h('div', { class: 's-tags' }, db.list('modeles').map((x) => h('a', { class: 'fr-tag', href: '#/rediger/' + x.id }, x.nom))));
    const data = Object.assign({}, pre?.donnees || {});
    if (pre) { S.save('actes:prefill', null); if (data.contact && !data.destinataire) data.destinataire = data.contact + ' — ' + (data.etablissement || ''); if (data.adresse && !data.adresse_destinataire) data.adresse_destinataire = data.adresse; data.civilite = data.civilite || 'Madame, Monsieur'; }
    const vs = vars(m).filter((x) => !AUTO.includes(x));
    const extra = m.format === 'courrier' ? ['destinataire', 'adresse_destinataire', 'objet', 'vos_ref'] : [];
    const fields = [...new Set([...extra, ...vs])].map((x) => ({ name: x, label: label(x), type: /adresse|corps|non_conformites|ordre|considerant|article|contexte|analyse|proposition/.test(x) ? 'textarea' : /^date_/.test(x) && x !== 'date_controle' ? 'date' : 'text', rows: 3 }));
    fields.push({ name: 'signataire', label: 'Bloc signature', type: 'textarea', rows: 2, default: m.signataire }, { name: 'signataire_nom', label: 'Nom du signataire' });
    const f = S.form(fields, Object.assign({ objet: m.objet }, data));
    const pv = h('div', { class: 'ac-preview' });
    const numero = numeroSuivant(m);
    const cur = () => Object.assign({ numero }, Object.fromEntries(Object.entries(f.get()).map(([k, x]) => [k, /^date_/.test(k) && /^\d{4}-\d\d-\d\d$/.test(x) ? S.fmtDate(x) : x])));
    const prev = () => { pv.innerHTML = pageHTML(m, cur()); scale(pv); };
    f.el.addEventListener('input', S.debounce(prev, 200)); f.el.addEventListener('change', prev);
    const enregistrer = () => { const d = cur(); const a = db.save('actes', { numero: d.numero, modeleId: m.id, modele: m.nom, type: m.type, objet: d.objet || m.objet || m.nom, destinataire: d.destinataire || d.beneficiaire || d.destinataire_note || '', date: new Date().toISOString(), redacteur: S.me(), donnees: d, html: pageHTML(m, d) }); S.toast(`Enregistré au registre sous le n° ${a.numero}`, 'success'); return a; };
    S.add(v, S.bar('Rédiger : ' + m.nom,
      S.select('Modèle', db.list('modeles').map((x) => ({ value: x.id, label: x.nom })), m.id, (x) => S.go('rediger/' + x)),
      S.btn('Imprimer / PDF', () => ouvrir(docHTML([pageHTML(m, cur())], m.nom)), 'fr-btn--secondary', 'fr-icon-printer-line'),
      S.btn('Word (.doc)', () => wordDoc([pageHTML(m, cur())], S.slug(m.nom) + '-' + numero), 'fr-btn--secondary', 'fr-icon-file-text-line'),
      S.btn('Enregistrer au registre', () => { enregistrer(); S.go('registre'); }, '', 'fr-icon-save-line')),
      pre ? S.alert(null, 'Formulaire prérempli à partir du rapport de contrôle.', 'info') : null,
      h('div', { class: 's-cols' }, h('div', { class: 's-panel' }, h('p', { class: 's-small s-mention' }, `Numéro attribué à l’enregistrement : ${numero}`), f.el), pv));
    prev();
  }

  /* ---------- Publipostage ---------- */
  function publipostage(v, id) {
    const m = db.get('modeles', id) || db.list('modeles')[0];
    if (!m) return;
    let rows = S.load('actes:pp-rows', []);
    const vs = [...new Set([...(m.format === 'courrier' ? ['destinataire', 'adresse_destinataire', 'objet'] : []), ...vars(m).filter((x) => !AUTO.includes(x)), 'signataire_nom'])];
    let map = {};
    const zone = h('div');
    const autoMap = () => { const cols = Object.keys(rows[0] || {}); map = Object.fromEntries(vs.map((x) => [x, cols.find((c) => S.slug(c) === x) || cols.find((c) => S.slug(c).includes(x) || x.includes(S.slug(c))) || ''])); };
    const rowData = (r, i) => { const b = numeroSuivant(m).split('-'); b[2] = String(Number(b[2]) + i).padStart(3, '0'); const d = { numero: b.join('-'), signataire: m.signataire }; vs.forEach((x) => { if (map[x]) d[x] = r[map[x]]; }); return d; };
    const draw = () => {
      S.save('actes:pp-rows', rows.slice(0, 2000));
      if (!rows.length) return S.add(S.clear(zone), h('div', { class: 's-empty' }, 'Chargez des données : fichier CSV (séparateur ; ou ,), table Grist ou copier-coller depuis un tableur.'));
      const cols = Object.keys(rows[0]);
      const pv = h('div', { class: 'ac-preview' });
      let idx = 0;
      const show = () => { pv.innerHTML = pageHTML(m, rowData(rows[idx], idx)); scale(pv); nav.querySelector('span').textContent = ` ${idx + 1} / ${rows.length} `; };
      const nav = h('div', { class: 'fr-btns-group fr-btns-group--inline-sm' }, S.iconBtn('Précédent', 'fr-icon-arrow-left-s-line', () => { idx = (idx - 1 + rows.length) % rows.length; show(); }, 'fr-btn--secondary'), h('span', { class: 'fr-mx-1w' }), S.iconBtn('Suivant', 'fr-icon-arrow-right-s-line', () => { idx = (idx + 1) % rows.length; show(); }, 'fr-btn--secondary'));
      S.add(S.clear(zone),
        h('div', { class: 's-cols' },
          h('div', {},
            h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, `Correspondance (${rows.length} ligne(s))`),
              vs.map((x) => h('div', { class: 'fr-select-group', style: 'margin-bottom:.5rem' }, h('label', { class: 'fr-label' }, label(x)), h('select', { class: 'fr-select', onchange: (e) => { map[x] = e.target.value; show(); } }, h('option', { value: '' }, '— (laisser vide)'), cols.map((c) => h('option', { value: c, selected: map[x] === c }, c)))))),
            h('div', { class: 'fr-btns-group fr-btns-group--icon-left' },
              S.btn(`Imprimer les ${rows.length} documents`, () => ouvrir(docHTML(rows.map((r, i) => pageHTML(m, rowData(r, i))), m.nom)), '', 'fr-icon-printer-line'),
              S.btn('Télécharger en Word (.doc)', () => wordDoc(rows.map((r, i) => pageHTML(m, rowData(r, i))), S.slug(m.nom) + '-publipostage'), 'fr-btn--secondary', 'fr-icon-file-text-line'),
              S.btn('Enregistrer tous au registre', async () => { if (!(await S.confirm(`Attribuer ${rows.length} numéros et enregistrer au registre ?`))) return; rows.forEach((r, i) => { const d = rowData(r, i); d.numero = numeroSuivant(m); db.save('actes', { numero: d.numero, modeleId: m.id, modele: m.nom, type: m.type, objet: d.objet || m.nom, destinataire: d.destinataire || '', date: new Date().toISOString(), redacteur: S.me(), donnees: d, html: pageHTML(m, d) }, true); }); db.setAll('actes', db.list('actes')); S.toast(rows.length + ' acte(s) enregistré(s)', 'success'); }, 'fr-btn--secondary', 'fr-icon-save-line'),
              S.btn('Préparer les courriels (mailto)', () => { const col = cols.find((c) => /mail|courriel/i.test(c)); if (!col) return S.toast('Aucune colonne courriel dans les données', 'warning'); const r = rows[idx]; const d = rowData(r, idx); const txt = fillHTML(m.corps, d).replace(/<br>/g, '\n').replace(/<\/p>/g, '\n\n').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); location.href = `mailto:${r[col]}?subject=${encodeURIComponent(d.objet || m.nom)}&body=${encodeURIComponent(txt)}`; }, 'fr-btn--tertiary', 'fr-icon-mail-line'))),
          h('div', {}, nav, pv)));
      show();
    };
    const load = (arr) => { rows = arr.filter((r) => Object.values(r).some((x) => x !== '' && x != null)); autoMap(); draw(); S.toast(rows.length + ' ligne(s) chargée(s)', 'success'); };
    S.add(v, S.bar('Publipostage', S.select('Modèle', db.list('modeles').map((x) => ({ value: x.id, label: x.nom })), m.id, (x) => S.go('publipostage/' + x))),
      h('div', { class: 'fr-btns-group fr-btns-group--inline-sm fr-btns-group--icon-left fr-mb-2w' },
        S.btn('Fichier CSV', async () => { const f = await S.pickFile('.csv,.txt'); if (f) load(S.parseCSV(await S.readText(f))); }, 'fr-btn--secondary', 'fr-icon-upload-line'),
        S.btn('Table Grist', async () => { if (!S.grist.ok()) return S.toast('Configurez Grist dans Paramètres', 'warning'); let tables = []; try { tables = await S.grist.tables(); } catch (e) { return S.toast(e.message, 'error'); } const x = await S.formModal('Charger une table Grist', [{ name: 't', label: 'Table', type: 'select', required: true, options: tables }, { name: 'filtre', label: 'Filtre JSON (facultatif)', placeholder: '{"Statut": ["À envoyer"]}' }]); if (x) { try { load((await S.grist.records(x.t, { filter: x.filtre || undefined })).map(({ id, manualSort, ...r }) => r)); } catch (e) { S.toast(e.message, 'error'); } } }, 'fr-btn--secondary', 'fr-icon-database-line'),
        S.btn('Coller depuis un tableur', async () => { const x = await S.formModal('Coller les données', [{ name: 't', label: 'Collez ici les cellules copiées (première ligne = en-têtes)', type: 'textarea', rows: 10, required: true }]); if (x) load(S.parseCSV(x.t.replace(/\t/g, ';'))); }, 'fr-btn--secondary', 'fr-icon-file-text-line'),
        S.btn('Modèle CSV vide', () => S.download(S.slug(m.nom) + '-modele.csv', '﻿' + vs.join(';') + ';email\r\n'), 'fr-btn--tertiary', 'fr-icon-download-line')),
      zone);
    autoMap(); draw();
  }

  /* ---------- Registre ---------- */
  function registre(v) {
    let q = '';
    const zone = h('div');
    const draw = () => S.add(S.clear(zone), S.table([
      { key: 'numero', label: 'Numéro', class: 's-nowrap' }, { key: 'date', label: 'Date', render: (a) => S.fmtDate(a.date) }, { key: 'type', label: 'Type' }, { key: 'objet', label: 'Objet' }, { key: 'destinataire', label: 'Destinataire / bénéficiaire' }, { key: 'redacteur', label: 'Rédacteur' },
      { key: 'a', label: '', render: (a) => h('div', { class: 's-nowrap' }, S.iconBtn('Imprimer', 'fr-icon-printer-line', () => ouvrir(docHTML([a.html], a.numero))), S.iconBtn('Word', 'fr-icon-file-text-line', () => wordDoc([a.html], a.numero))) },
    ], db.list('actes').filter((a) => !q || S.norm(Object.values(a).filter((x) => typeof x === 'string' && x.length < 500).join(' ')).includes(S.norm(q))).sort((a, b) => (a.numero < b.numero ? 1 : -1)), { onRow: (a) => S.modal({ titre: a.numero + ' — ' + a.objet, taille: 'wide', body: (() => { const pv = h('div', { class: 'ac-preview', html: a.html }); scale(pv); return pv; })() }), empty: 'Aucun acte enregistré.' }));
    S.add(v, S.bar('Registre des actes', S.btn('Exporter CSV', () => S.download('registre-actes.csv', S.toCSV(db.list('actes'), [{ key: 'numero', label: 'Numéro' }, { key: 'date', label: 'Date', get: (a) => S.fmtDate(a.date) }, { key: 'type', label: 'Type' }, { key: 'modele', label: 'Modèle' }, { key: 'objet', label: 'Objet' }, { key: 'destinataire', label: 'Destinataire' }, { key: 'redacteur', label: 'Rédacteur' }])), 'fr-btn--secondary', 'fr-icon-download-line')),
      h('div', { class: 's-toolbar' }, S.search('Rechercher', (x) => { q = x; draw(); })), zone);
    draw();
  }
})();
