/* Veille informationnelle — flux RSS/Atom, API JSON, tables Grist ; mots-clés, alertes, favoris, bulletins */
(function () {
  'use strict';
  const h = S.h;
  const db = S.db('veille', ['sources', 'articles', 'motscles', 'bulletins']);
  const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=fr&gl=FR&ceid=FR:fr`;
  const CATALOGUE = [
    { nom: 'data.gouv.fr — jeux de données récents (API)', type: 'json', url: 'https://www.data.gouv.fr/api/1/datasets/?sort=-created&page_size=30', categorie: 'Open data', map: { chemin: 'data', titre: 'title', lien: 'page', date: 'created_at', resume: 'description' } },
    { nom: 'data.gouv.fr — réutilisations récentes (API)', type: 'json', url: 'https://www.data.gouv.fr/api/1/reuses/?sort=-created&page_size=20', categorie: 'Open data', map: { chemin: 'data', titre: 'title', lien: 'page', date: 'created_at', resume: 'description' } },
    { nom: 'Actualités : DRAAF Bretagne', type: 'rss', url: gnews('"DRAAF Bretagne"'), categorie: 'Presse' },
    { nom: 'Actualités : agriculture en Bretagne', type: 'rss', url: gnews('agriculture Bretagne'), categorie: 'Presse' },
    { nom: 'Actualités : politique agricole commune', type: 'rss', url: gnews('"politique agricole commune" OR PAC agriculteurs'), categorie: 'Presse' },
    { nom: 'Actualités : influenza aviaire', type: 'rss', url: gnews('"influenza aviaire" Bretagne'), categorie: 'Sanitaire' },
    { nom: 'Actualités : alimentation, sécurité sanitaire', type: 'rss', url: gnews('"sécurité sanitaire des aliments" OR "rappel conso"'), categorie: 'Sanitaire' },
    { nom: 'Actualités : forêt et filière bois', type: 'rss', url: gnews('forêt bois Bretagne'), categorie: 'Presse' },
    { nom: 'Ministère de l’Agriculture — actualités', type: 'rss', url: 'https://agriculture.gouv.fr/rss.xml', categorie: 'Institutionnel' },
    { nom: 'Vie-publique.fr — actualités', type: 'rss', url: 'https://www.vie-publique.fr/rss', categorie: 'Institutionnel' },
    { nom: 'Service-Public.fr — actualités professionnels', type: 'rss', url: 'https://www.service-public.fr/abonnements/rss/actu-actu-pro.rss', categorie: 'Institutionnel' },
    { nom: 'Rappel Conso — fiches de rappel (API)', type: 'json', url: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-espaces/records?order_by=date_publication%20desc&limit=30', categorie: 'Sanitaire', map: { chemin: 'results', titre: 'libelle', lien: 'lien_vers_la_fiche_rappel', date: 'date_publication', resume: 'motif_rappel' } },
  ];

  if (!S.load('veille:init')) {
    S.save('veille:init', 1);
    CATALOGUE.slice(0, 5).forEach((s) => db.save('sources', Object.assign({ actif: true }, s), true));
    [['Bretagne', '#000091', false], ['influenza', '#ce0500', true], ['PAC', '#18753c', false], ['Ecophyto', '#a558a0', false]].forEach(([terme, couleur, alerte]) => db.save('motscles', { terme, couleur, alerte }, true));
  }

  /* ---------- Récupération ---------- */
  const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
  const hash = (s) => { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); };
  function parseFeed(txt) {
    const doc = new DOMParser().parseFromString(txt, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Le contenu reçu n’est pas un flux RSS/Atom valide');
    const t = (el, sel) => { const x = el.getElementsByTagName(sel)[0]; return x ? x.textContent.trim() : ''; };
    return [...doc.querySelectorAll('item, entry')].map((el) => {
      const linkEl = [...el.getElementsByTagName('link')].find((l) => !l.getAttribute('rel') || l.getAttribute('rel') === 'alternate');
      const lien = (linkEl && (linkEl.getAttribute('href') || linkEl.textContent.trim())) || t(el, 'guid');
      return { titre: strip(t(el, 'title')), lien, date: t(el, 'pubDate') || t(el, 'published') || t(el, 'updated') || t(el, 'dc:date'), resume: strip(t(el, 'description') || t(el, 'summary') || t(el, 'content')).slice(0, 1200), guid: t(el, 'guid') || t(el, 'id') || lien };
    });
  }
  async function fetchSource(src) {
    let items = [];
    if (src.type === 'grist') {
      const m = src.map || {};
      const recs = await S.grist.records(src.url, { sort: m.date ? '-' + m.date : undefined, limit: 200 });
      items = recs.map((r) => ({ titre: String(r[m.titre || 'Titre'] ?? ''), lien: r[m.lien || 'Lien'] || '', date: r[m.date || 'Date'] ? (typeof r[m.date || 'Date'] === 'number' ? new Date(r[m.date || 'Date'] * 1000).toISOString() : r[m.date || 'Date']) : '', resume: strip(r[m.resume || 'Resume'] || ''), guid: 'g' + r.id }));
    } else {
      const r = await S.fetch(src.url, { headers: src.type === 'json' ? { Accept: 'application/json' } : {} });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      if (src.type === 'json') {
        const j = JSON.parse(txt); const m = src.map || {};
        const arr = m.chemin ? S.get(j, m.chemin) : Array.isArray(j) ? j : j.results || j.data || j.items || [];
        items = (arr || []).map((x) => ({ titre: strip(S.get(x, m.titre || 'title')), lien: S.get(x, m.lien || 'url') || '', date: S.get(x, m.date || 'date') || '', resume: strip(S.get(x, m.resume || 'description')).slice(0, 1200), guid: String(S.get(x, m.id || 'id') || S.get(x, m.lien || 'url') || S.get(x, m.titre || 'title')) }));
      } else items = parseFeed(txt);
    }
    return items.filter((x) => x.titre);
  }
  const mots = () => db.list('motscles');
  const match = (a) => mots().filter((m) => S.norm(a.titre + ' ' + a.resume).includes(S.norm(m.terme))).map((m) => m.terme);
  let busy = false;
  async function refresh(only, quiet) {
    if (busy) return; busy = true;
    const srcs = db.list('sources').filter((s) => s.actif !== false && (!only || s.id === only));
    let total = 0; const alertes = [];
    const existing = new Map(db.list('articles').map((a) => [a.id, a]));
    await Promise.all(srcs.map(async (s) => {
      try {
        const items = await fetchSource(s);
        let n = 0;
        for (const it of items) {
          const id = hash(s.id + '|' + it.guid);
          if (existing.has(id)) continue;
          const d = new Date(it.date);
          const a = { id, sourceId: s.id, source: s.nom, categorie: s.categorie || '', titre: it.titre, lien: it.lien, date: isNaN(d) ? new Date().toISOString() : d.toISOString(), resume: it.resume, lu: false, favori: false, creeLe: new Date().toISOString() };
          a.motsCles = match(a);
          existing.set(id, a); n++;
          if (a.motsCles.some((t) => mots().find((m) => m.terme === t)?.alerte)) alertes.push(a);
        }
        s.derniereMaj = new Date().toISOString(); s.erreur = ''; s.dernierNb = n; total += n;
      } catch (e) { s.erreur = e.message; s.derniereMaj = new Date().toISOString(); }
      db.save('sources', s, true);
    }));
    // Purge : 4000 articles max, favoris conservés
    let arr = [...existing.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    const fav = arr.filter((a) => a.favori || a.bulletin); arr = arr.filter((a) => !a.favori && !a.bulletin).slice(0, 4000 - fav.length).concat(fav);
    db.setAll('articles', arr);
    db.setAll('sources', db.list('sources'));
    busy = false;
    if (!quiet || total) S.toast(`${total} nouvel(s) article(s)`, total ? 'success' : 'info');
    if (alertes.length) { S.notify(`Veille : ${alertes.length} alerte(s)`, alertes.slice(0, 3).map((a) => a.titre).join('\n')); }
    S.refresh();
  }
  const auto = () => { const min = S.load('veille:auto', 30); if (min > 0) setTimeout(async () => { await refresh(null, true); auto(); }, min * 60000); };
  auto();

  /* ---------- Gabarit ---------- */
  document.head.append(h('style', {}, `
.vl-art{border-bottom:1px solid var(--border-default-grey);padding:1rem 0;display:grid;grid-template-columns:auto 1fr auto;gap:.75rem;align-items:start}
.vl-art.lu .vl-t{font-weight:400;color:var(--text-mention-grey)}
.vl-t{font-weight:700;font-size:1.05rem;line-height:1.4}
.vl-t a{background-image:none}
.vl-meta{font-size:.8rem;color:var(--text-mention-grey);margin:.25rem 0}
.vl-res{font-size:.875rem;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.vl-art mark{background:var(--background-contrast-yellow-tournesol);color:inherit;padding:0 .1rem}
.vl-act{display:flex;flex-direction:column;gap:.1rem}
.vl-sel{margin-top:.35rem}
`));
  S.init({
    titre: 'Veille informationnelle', sousTitre: 'Flux RSS, API, alertes', db,
    grist: { articles: 'Veille_articles', sources: 'Veille_sources', motscles: 'Veille_motscles' },
    tools: [{ label: 'Actualiser', icon: 'fr-icon-refresh-line', onClick: () => refresh() }],
    nav: [{ id: 'fil', label: 'Fil de veille' }, { id: 'sources', label: 'Sources' }, { id: 'motscles', label: 'Mots-clés & alertes' }, { id: 'bulletin', label: 'Bulletin' }, { id: 'stats', label: 'Statistiques' }],
    render(r, p, v) { S.clear(v); ({ fil, sources, motscles, bulletin, stats }[r] || fil)(v, ...p); },
  });
  if (!db.list('articles').length) setTimeout(() => refresh(null, true), 500);

  const highlight = (txt) => {
    let s = S.esc(txt);
    for (const m of mots()) { const t = S.esc(m.terme).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (t) s = s.replace(new RegExp(`(${t})`, 'gi'), '<mark>$1</mark>'); }
    return s;
  };

  /* ---------- Fil ---------- */
  function fil(v) {
    const st = S.load('veille:filtres', { q: '', source: '', cat: '', mot: '', etat: 'nonlus', periode: '30' });
    const zone = h('div');
    let page = 1;
    const draw = () => {
      S.save('veille:filtres', st);
      const lim = st.periode ? Date.now() - Number(st.periode) * 86400000 : 0;
      let arr = db.list('articles').filter((a) => (!st.source || a.sourceId === st.source) && (!st.cat || a.categorie === st.cat) && (!st.mot || (a.motsCles || []).includes(st.mot)) && (st.etat !== 'nonlus' || !a.lu) && (st.etat !== 'favoris' || a.favori) && (st.etat !== 'alertes' || (a.motsCles || []).length) && (!lim || new Date(a.date).getTime() >= lim));
      if (st.q) { const q = S.norm(st.q); arr = arr.filter((a) => S.norm(a.titre + ' ' + a.resume + ' ' + (a.note || '') + ' ' + (a.etiquettes || '')).includes(q)); }
      arr.sort((a, b) => (a.date < b.date ? 1 : -1));
      const shown = arr.slice(0, page * 50);
      S.add(S.clear(zone), 
        h('div', { class: 's-bar', style: 'margin-bottom:.5rem' }, h('p', { class: 's-mention fr-mb-0' }, `${arr.length} article(s)`),
          h('div', { class: 's-bar__actions' }, S.btn('Tout marquer comme lu', () => { arr.forEach((a) => { a.lu = true; }); db.setAll('articles', db.list('articles')); draw(); }, 'fr-btn--tertiary fr-btn--sm', 'fr-icon-check-line'),
            S.btn('Exporter CSV', () => S.download('veille.csv', S.toCSV(arr, [{ key: 'date', label: 'Date' }, { key: 'source', label: 'Source' }, { key: 'titre', label: 'Titre' }, { key: 'lien', label: 'Lien' }, { key: 'resume', label: 'Résumé' }, { key: 'motsCles', label: 'Mots-clés', get: (a) => (a.motsCles || []).join(', ') }, { key: 'note', label: 'Note' }])), 'fr-btn--tertiary fr-btn--sm', 'fr-icon-download-line'))),
        shown.length ? shown.map(article) : h('div', { class: 's-empty' }, db.list('sources').length ? 'Aucun article pour ces filtres. Cliquez sur « Actualiser » en haut de page.' : 'Ajoutez des sources pour commencer.'),
        arr.length > shown.length ? S.btn('Afficher plus', () => { page++; draw(); }, 'fr-btn--secondary fr-mt-2w') : null);
    };
    const article = (a) => {
      const el = h('div', { class: 'vl-art' + (a.lu ? ' lu' : '') },
        h('div', { class: 'fr-checkbox-group fr-checkbox-group--sm vl-sel', title: 'Ajouter au bulletin' }, h('input', { type: 'checkbox', id: 'b' + a.id, checked: !!a.bulletin, onchange: (e) => { a.bulletin = e.target.checked; db.save('articles', a, true); S.toast(a.bulletin ? 'Ajouté au bulletin' : 'Retiré du bulletin'); } }), h('label', { class: 'fr-label', for: 'b' + a.id }, h('span', { class: 'fr-sr-only' }, 'Bulletin'))),
        h('div', {},
          h('div', { class: 'vl-t' }, h('a', { href: a.lien, target: '_blank', rel: 'noopener', html: highlight(a.titre), onclick: () => { a.lu = true; db.save('articles', a, true); el.classList.add('lu'); } })),
          h('div', { class: 'vl-meta' }, `${a.source} · ${S.fmtDT(a.date)}`, a.categorie ? ' · ' + a.categorie : '', ' ', (a.motsCles || []).map((t) => { const m = mots().find((x) => x.terme === t); return h('span', { class: 'fr-badge fr-badge--sm fr-badge--no-icon fr-ml-1v', style: m ? { background: m.couleur, color: '#fff' } : {} }, t); })),
          a.resume ? h('p', { class: 'vl-res', html: highlight(a.resume) }) : null,
          a.note || a.etiquettes ? h('p', { class: 's-small fr-mt-1v fr-mb-0' }, a.etiquettes ? String(a.etiquettes).split(',').map((t) => S.tag(t.trim())) : null, a.note ? ' 📝 ' + a.note : '') : null),
        h('div', { class: 'vl-act' },
          S.iconBtn(a.favori ? 'Retirer des favoris' : 'Ajouter aux favoris', a.favori ? 'fr-icon-star-fill' : 'fr-icon-star-line', () => { a.favori = !a.favori; db.save('articles', a, true); draw(); }),
          S.iconBtn(a.lu ? 'Marquer non lu' : 'Marquer lu', a.lu ? 'fr-icon-eye-off-line' : 'fr-icon-eye-line', () => { a.lu = !a.lu; db.save('articles', a, true); draw(); }),
          S.iconBtn('Annoter', 'fr-icon-edit-line', async () => { const x = await S.formModal('Annoter', [{ name: 'etiquettes', label: 'Étiquettes (virgules)' }, { name: 'note', label: 'Note', type: 'textarea' }], a); if (x) { Object.assign(a, { etiquettes: x.etiquettes, note: x.note }); db.save('articles', a, true); draw(); } }),
          S.iconBtn('Transmettre par courriel', 'fr-icon-mail-line', () => { location.href = `mailto:?subject=${encodeURIComponent('[Veille] ' + a.titre)}&body=${encodeURIComponent(a.titre + '\n' + a.lien + '\n\n' + (a.resume || '').slice(0, 600) + (a.note ? '\n\nNote : ' + a.note : ''))}`; })));
      return el;
    };
    const srcs = db.list('sources');
    S.add(v,
      S.bar('Fil de veille', S.btn('Actualiser maintenant', () => refresh(), '', 'fr-icon-refresh-line')),
      h('div', { class: 's-toolbar' },
        S.search('Rechercher', (q) => { st.q = q; page = 1; draw(); }, st.q),
        S.select('Afficher', [{ value: 'nonlus', label: 'Non lus' }, { value: '', label: 'Tous' }, { value: 'alertes', label: 'Avec mot-clé' }, { value: 'favoris', label: 'Favoris' }], st.etat, (x) => { st.etat = x; page = 1; draw(); }),
        S.select('Source', [{ value: '', label: 'Toutes' }, ...srcs.map((s) => ({ value: s.id, label: s.nom }))], st.source, (x) => { st.source = x; page = 1; draw(); }),
        S.select('Catégorie', [{ value: '', label: 'Toutes' }, ...new Set(srcs.map((s) => s.categorie).filter(Boolean))], st.cat, (x) => { st.cat = x; page = 1; draw(); }),
        S.select('Mot-clé', [{ value: '', label: 'Tous' }, ...mots().map((m) => m.terme)], st.mot, (x) => { st.mot = x; page = 1; draw(); }),
        S.select('Période', [{ value: '1', label: '24 h' }, { value: '7', label: '7 jours' }, { value: '30', label: '30 jours' }, { value: '', label: 'Tout' }], st.periode, (x) => { st.periode = x; page = 1; draw(); })),
      srcs.some((s) => s.erreur) ? S.alert(null, 'Certaines sources sont en erreur : voir l’onglet Sources.', 'warning') : null,
      zone);
    draw();
  }

  /* ---------- Sources ---------- */
  const srcFields = [
    { name: 'nom', label: 'Nom', required: true },
    { name: 'type', label: 'Type', type: 'select', required: true, options: [{ value: 'rss', label: 'Flux RSS / Atom' }, { value: 'json', label: 'API JSON' }, { value: 'grist', label: 'Table Grist' }], default: 'rss' },
    { name: 'url', label: 'Adresse du flux / de l’API, ou nom de la table Grist', required: true, full: true },
    { name: 'categorie', label: 'Catégorie', list: 'cats' },
    { name: 'actif', label: 'Active', type: 'checkbox', default: true },
    { type: 'section', label: 'Correspondance des champs (API JSON / Grist)' },
    { name: 'm_chemin', label: 'Chemin de la liste', placeholder: 'data.results', hint: 'JSON : où se trouve le tableau d’éléments' },
    { name: 'm_titre', label: 'Champ titre', placeholder: 'title / Titre' },
    { name: 'm_lien', label: 'Champ lien', placeholder: 'url / Lien' },
    { name: 'm_date', label: 'Champ date', placeholder: 'date / Date' },
    { name: 'm_resume', label: 'Champ résumé', placeholder: 'description / Resume' },
    { name: 'm_id', label: 'Champ identifiant (facultatif)', placeholder: 'id' },
  ];
  async function editSource(s = {}) {
    const vals = Object.assign({}, s, Object.fromEntries(Object.entries(s.map || {}).map(([k, x]) => ['m_' + k, x])));
    const x = await S.formModal(s.id ? 'Modifier la source' : 'Nouvelle source', srcFields, vals, { taille: 'wide', extraActions: s.id ? [{ label: 'Supprimer (et ses articles)', onClick: () => { db.remove('sources', s.id); db.setAll('articles', db.list('articles').filter((a) => a.sourceId !== s.id || a.favori)); S.refresh(); } }] : [] });
    if (!x) return;
    const o = s.id ? s : {};
    Object.assign(o, { nom: x.nom, type: x.type, url: x.url.trim(), categorie: x.categorie, actif: x.actif, map: Object.fromEntries(Object.entries(x).filter(([k, val]) => k.startsWith('m_') && val).map(([k, val]) => [k.slice(2), val])) });
    db.save('sources', o);
    await refresh(o.id);
  }
  function sources(v) {
    const list = db.list('sources');
    S.add(v,
      S.bar('Sources', S.btn('Ajouter une source', () => editSource(), '', 'fr-icon-add-line'),
        S.btn('Recherche d’actualités', async () => { const q = await S.prompt('Mots recherchés (syntaxe Google Actualités : "expression exacte", OR, -exclure)', '', { titre: 'Créer une veille par recherche' }); if (q) { const s = db.save('sources', { nom: 'Actualités : ' + q, type: 'rss', url: gnews(q), categorie: 'Presse', actif: true }); refresh(s.id); } }, 'fr-btn--secondary', 'fr-icon-search-line'),
        S.btn('Importer OPML', async () => { const f = await S.pickFile('.opml,.xml'); if (!f) return; const doc = new DOMParser().parseFromString(await S.readText(f), 'text/xml'); let n = 0; doc.querySelectorAll('outline[xmlUrl]').forEach((o) => { db.save('sources', { nom: o.getAttribute('title') || o.getAttribute('text'), type: 'rss', url: o.getAttribute('xmlUrl'), categorie: o.parentElement?.getAttribute('text') || '', actif: true }, true); n++; }); db.setAll('sources', db.list('sources')); S.toast(n + ' source(s) importée(s)', 'success'); }, 'fr-btn--secondary', 'fr-icon-upload-line'),
        S.btn('Exporter OPML', () => { const cats = [...new Set(list.filter((s) => s.type === 'rss').map((s) => s.categorie || 'Sans catégorie'))]; S.download('veille.opml', `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>Veille ${S.esc(S.settings().entite)}</title></head><body>\n${cats.map((c) => `<outline text="${S.esc(c)}">\n${list.filter((s) => s.type === 'rss' && (s.categorie || 'Sans catégorie') === c).map((s) => `  <outline type="rss" text="${S.esc(s.nom)}" title="${S.esc(s.nom)}" xmlUrl="${S.esc(s.url)}"/>`).join('\n')}\n</outline>`).join('\n')}\n</body></opml>`, 'text/x-opml'); }, 'fr-btn--secondary', 'fr-icon-download-line')),
      h('div', { class: 's-toolbar' }, h('div', { class: 'fr-select-group' }, h('label', { class: 'fr-label' }, 'Actualisation automatique'), h('select', { class: 'fr-select', onchange: (e) => { S.save('veille:auto', Number(e.target.value)); S.toast('Pris en compte au prochain chargement'); } }, [[0, 'Désactivée'], [15, 'Toutes les 15 min'], [30, 'Toutes les 30 min'], [60, 'Toutes les heures'], [240, 'Toutes les 4 h']].map(([x, l]) => h('option', { value: x, selected: S.load('veille:auto', 30) === x }, l))))),
      S.table([
        { key: 'nom', label: 'Source', render: (s) => h('div', {}, h('strong', {}, s.nom), h('div', { class: 's-small s-mention', style: 'word-break:break-all' }, s.url)) },
        { key: 'type', label: 'Type', render: (s) => ({ rss: 'RSS', json: 'API', grist: 'Grist' }[s.type]) },
        { key: 'categorie', label: 'Catégorie' },
        { key: 'nb', label: 'Articles', class: 'num', render: (s) => db.list('articles').filter((a) => a.sourceId === s.id).length },
        { key: 'derniereMaj', label: 'Dernière lecture', render: (s) => (s.erreur ? h('span', {}, S.badge('Erreur', 'error'), h('div', { class: 's-small', style: 'color:var(--text-default-error)' }, s.erreur)) : s.derniereMaj ? S.fmtDT(s.derniereMaj) + ` (+${s.dernierNb ?? 0})` : '—') },
        { key: 'actif', label: 'Active', render: (s) => { const id = 'sa' + s.id; return h('div', { class: 'fr-toggle' }, h('input', { type: 'checkbox', class: 'fr-toggle__input', id, checked: s.actif !== false, onchange: (e) => { s.actif = e.target.checked; db.save('sources', s, true); } }), h('label', { class: 'fr-toggle__label', for: id }, h('span', { class: 'fr-sr-only' }, 'Active'))); } },
        { key: 'a', label: '', render: (s) => h('div', { class: 's-nowrap' }, S.iconBtn('Lire maintenant', 'fr-icon-refresh-line', () => refresh(s.id)), S.iconBtn('Supprimer', 'fr-icon-delete-line', async () => { if (await S.confirm(`Supprimer la source « ${s.nom} » et ses articles (hors favoris) ?`)) { db.remove('sources', s.id); db.setAll('articles', db.list('articles').filter((a) => a.sourceId !== s.id || a.favori)); S.refresh(); } })) },
      ], list, { onRow: editSource, empty: 'Aucune source.' }),
      h('h2', { class: 'fr-h5 fr-mt-4w' }, 'Catalogue de sources suggérées'),
      h('p', { class: 's-mention s-small' }, 'Les adresses des sites institutionnels peuvent évoluer : en cas d’erreur, vérifiez l’adresse du flux sur le site concerné. Les flux sans en-tête CORS passent par le proxy défini dans Paramètres.'),
      S.table([{ key: 'nom', label: 'Source' }, { key: 'categorie', label: 'Catégorie' }, { key: 'type', label: 'Type' }, { key: 'a', label: '', render: (c) => (list.some((s) => s.url === c.url) ? S.badge('Ajoutée', 'success') : S.btn('Ajouter', () => { const s = db.save('sources', Object.assign({ actif: true }, S.clone(c))); refresh(s.id); }, 'fr-btn--sm fr-btn--secondary')) }], CATALOGUE, { sortable: false }),
      h('datalist', { id: 'cats' }, [...new Set(list.map((s) => s.categorie).filter(Boolean))].map((c) => h('option', { value: c }))));
  }

  /* ---------- Mots-clés ---------- */
  function motscles(v) {
    const fields = [{ name: 'terme', label: 'Terme ou expression', required: true }, { name: 'couleur', label: 'Couleur', type: 'color', default: '#000091' }, { name: 'alerte', label: 'Alerte (notification sur ce poste)', type: 'checkbox' }];
    const recompute = () => { const all = db.list('articles'); all.forEach((a) => { a.motsCles = match(a); }); db.setAll('articles', all); };
    const edit = async (m = {}) => { const x = await S.formModal(m.id ? 'Modifier le mot-clé' : 'Nouveau mot-clé', fields, m, { extraActions: m.id ? [{ label: 'Supprimer', onClick: () => { db.remove('motscles', m.id); recompute(); S.refresh(); } }] : [] }); if (x) { db.save('motscles', x); recompute(); S.refresh(); } };
    const arts = db.list('articles');
    S.add(v, S.bar('Mots-clés & alertes', S.btn('Ajouter', () => edit(), '', 'fr-icon-add-line')),
      h('p', {}, 'Les mots-clés sont surlignés dans le fil et permettent de filtrer. Avec « alerte », une notification s’affiche sur ce poste dès qu’un nouvel article correspond (l’outil Automatisation peut aussi relayer ces alertes vers Tchap, un SMS ou un courriel).'),
      S.table([{ key: 'terme', label: 'Terme', render: (m) => h('span', { class: 'fr-badge fr-badge--no-icon', style: { background: m.couleur, color: '#fff' } }, m.terme) }, { key: 'alerte', label: 'Alerte', render: (m) => (m.alerte ? '🔔 Oui' : 'Non') }, { key: 'n', label: 'Articles (30 j)', class: 'num', render: (m) => arts.filter((a) => (a.motsCles || []).includes(m.terme) && Date.now() - new Date(a.date) < 30 * 86400000).length }, { key: 'v', label: '', render: (m) => h('a', { class: 'fr-link fr-link--sm', href: '#/fil', onclick: () => S.save('veille:filtres', Object.assign(S.load('veille:filtres', {}), { mot: m.terme, etat: '' })) }, 'Voir') }], mots(), { onRow: edit, empty: 'Aucun mot-clé.' }));
  }

  /* ---------- Bulletin ---------- */
  function bulletin(v) {
    const sel = db.list('articles').filter((a) => a.bulletin).sort((a, b) => (a.categorie + a.date < b.categorie + b.date ? -1 : 1));
    const opts = S.load('veille:bulletin', { titre: 'Bulletin de veille', intro: '', grouper: true });
    const f = S.form([{ name: 'titre', label: 'Titre', required: true }, { name: 'grouper', label: 'Regrouper par catégorie', type: 'checkbox' }, { name: 'intro', label: 'Éditorial / introduction', type: 'textarea', rows: 3 }], opts);
    const prev = h('iframe', { style: 'width:100%;height:70vh;border:1px solid var(--border-default-grey);background:#fff', title: 'Aperçu du bulletin' });
    const html = () => {
      const o = f.get(); S.save('veille:bulletin', o);
      const s = S.settings();
      const groups = o.grouper ? [...new Set(sel.map((a) => a.categorie || 'Divers'))] : [''];
      return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${S.esc(o.titre)}</title><style>body{font-family:Marianne,Arial,sans-serif;max-width:780px;margin:1.5rem auto;color:#161616;line-height:1.5;padding:0 1rem}.m{font-weight:700;text-transform:uppercase;font-size:13px;line-height:1.15}.m:before{content:"";display:block;width:38px;height:13px;background:linear-gradient(90deg,#000091 33%,#fff 33% 66%,#e1000f 66%);margin-bottom:6px}h1{color:#000091;font-size:26px;border-bottom:4px solid #000091;padding-bottom:.4rem;margin-top:1.5rem}h2{font-size:15px;text-transform:uppercase;letter-spacing:.04em;color:#000091;margin-top:2rem;border-bottom:1px solid #ddd}h3{font-size:16px;margin:1.1rem 0 .1rem}a{color:#000091}.d{color:#666;font-size:12px}.n{background:#f6f6f6;border-left:3px solid #000091;padding:.3rem .6rem;font-size:13px}</style></head><body>
<div class="m">${S.marqueHTML()}</div><p class="d">${S.esc(s.entiteLongue || s.entite)} — ${S.fmtLong(new Date())}</p><h1>${S.esc(o.titre)}</h1>${o.intro ? `<p>${S.esc(o.intro).replace(/\n/g, '<br>')}</p>` : ''}
${groups.map((g) => `${g ? `<h2>${S.esc(g)}</h2>` : ''}${sel.filter((a) => !o.grouper || (a.categorie || 'Divers') === g).map((a) => `<h3><a href="${S.esc(a.lien)}">${S.esc(a.titre)}</a></h3><div class="d">${S.esc(a.source)} — ${S.fmtDate(a.date)}</div>${a.resume ? `<p>${S.esc(a.resume.slice(0, 500))}${a.resume.length > 500 ? '…' : ''}</p>` : ''}${a.note ? `<p class="n">${S.esc(a.note)}</p>` : ''}`).join('\n')}`).join('\n')}
<p class="d" style="margin-top:2rem">${sel.length} article(s) sélectionné(s).</p></body></html>`;
    };
    const upd = () => { prev.srcdoc = html(); };
    f.el.addEventListener('input', S.debounce(upd, 300)); f.el.addEventListener('change', upd);
    S.add(v, S.bar('Bulletin de veille',
      S.btn('Imprimer / PDF', () => prev.contentWindow.print(), 'fr-btn--secondary', 'fr-icon-printer-line'),
      S.btn('Copier (pour un courriel)', async () => { try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html()], { type: 'text/html' }), 'text/plain': new Blob([sel.map((a) => `${a.titre}\n${a.lien}`).join('\n\n')], { type: 'text/plain' }) })]); S.toast('Bulletin copié : collez-le dans votre messagerie', 'success'); } catch (e) { S.toast('Copie impossible : utilisez « Télécharger »', 'warning'); } }, 'fr-btn--secondary', 'fr-icon-mail-line'),
      S.btn('Télécharger (.html)', () => { S.download(S.slug(f.get().titre) + '.html', html(), 'text/html'); db.save('bulletins', { titre: f.get().titre, date: new Date().toISOString(), nb: sel.length, html: html() }); }, 'fr-btn--secondary', 'fr-icon-download-line'),
      S.btn('Vider la sélection', async () => { if (await S.confirm('Retirer tous les articles du bulletin ?')) { db.list('articles').forEach((a) => { a.bulletin = false; }); db.setAll('articles', db.list('articles')); S.refresh(); } }, 'fr-btn--tertiary', 'fr-icon-delete-line')),
      sel.length ? null : S.alert('Sélection vide', 'Cochez des articles dans le fil de veille pour composer le bulletin.', 'info'),
      h('div', { class: 's-cols s-cols--side' }, h('div', {}, h('div', { class: 's-panel' }, f.el), h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, `Articles (${sel.length})`), h('ol', {}, sel.map((a) => h('li', { class: 's-small' }, a.titre, ' ', S.iconBtn('Retirer', 'fr-icon-close-line', () => { a.bulletin = false; db.save('articles', a, true); S.refresh(); }))))),
        db.list('bulletins').length ? h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, 'Bulletins archivés'), h('ul', {}, db.list('bulletins').slice(-10).reverse().map((b) => h('li', { class: 's-small' }, h('button', { class: 'fr-link fr-link--sm', onclick: () => S.download(S.slug(b.titre) + '.html', b.html, 'text/html') }, `${b.titre} — ${S.fmtDate(b.date)} (${b.nb})`))))) : null), prev));
    upd();
  }

  /* ---------- Statistiques ---------- */
  function stats(v) {
    const arts = db.list('articles');
    const days = [...Array(30)].map((_, i) => S.isoDate(S.addDays(new Date(), i - 29)));
    const per = days.map((d) => arts.filter((a) => S.isoDate(a.date) === d).length);
    const max = Math.max(1, ...per);
    const bySrc = db.list('sources').map((s) => [s.nom, arts.filter((a) => a.sourceId === s.id).length]).sort((a, b) => b[1] - a[1]);
    const mx2 = Math.max(1, ...bySrc.map((x) => x[1]));
    S.add(v, h('h1', { class: 'fr-h3' }, 'Statistiques'),
      S.kpis([{ v: arts.length, l: 'articles' }, { v: arts.filter((a) => !a.lu).length, l: 'non lus' }, { v: arts.filter((a) => a.favori).length, l: 'favoris' }, { v: arts.filter((a) => (a.motsCles || []).length).length, l: 'avec mot-clé' }, { v: db.list('sources').length, l: 'sources' }]),
      h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, 'Articles publiés par jour (30 jours)'),
        h('div', { style: 'display:flex;align-items:flex-end;gap:3px;height:160px', role: 'img', 'aria-label': 'Histogramme des articles par jour' }, per.map((n, i) => h('div', { title: `${S.fmtDate(days[i])} : ${n}`, style: { flex: 1, height: Math.max(2, (n / max) * 150) + 'px', background: 'var(--background-action-high-blue-france)' } }))),
        h('div', { class: 's-small s-mention', style: 'display:flex;justify-content:space-between' }, h('span', {}, S.fmtDate(days[0])), h('span', {}, S.fmtDate(days[29])))),
      h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, 'Par source'), bySrc.map(([n, c]) => h('div', { style: 'display:grid;grid-template-columns:minmax(10rem,22rem) 1fr 3rem;gap:.5rem;align-items:center;font-size:.8125rem;margin-bottom:.25rem' }, h('span', {}, n), h('div', { style: 'height:.75rem;background:var(--background-contrast-grey)' }, h('div', { style: { width: (c / mx2) * 100 + '%', height: '100%', background: 'var(--background-action-high-blue-france)' } })), h('span', { class: 'num' }, c)))));
  }
})();
