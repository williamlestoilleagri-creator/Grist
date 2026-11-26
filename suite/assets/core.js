/* Suite numérique de services — noyau commun (sans serveur).
 * Fournit : en-tête/pied DSFR, routeur, stockage local, formulaires, modales,
 * toasts, CSV, fichiers (IndexedDB), client API Grist, accès réseau avec proxy CORS.
 */
(function () {
  'use strict';
  const S = {};
  window.S = S;

  /* ---------- Utilitaires ---------- */
  S.uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  S.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  S.clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  S.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  S.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  S.norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  S.get = (obj, path) => String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  S.slug = (s) => S.norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  /** Construit un élément : S.h('div', {class:'x', onclick:fn}, 'texte', autreNoeud) */
  S.h = function (tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };
  const h = S.h;
  /** append qui ignore null/false */
  S.add = (el, ...kids) => { for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k))); return el; };
  S.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /* ---------- Dates ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  S.pad = pad;
  S.toDate = (d) => (d instanceof Date ? d : d ? new Date(d) : null);
  S.isoDate = (d) => { d = S.toDate(d); return d && !isNaN(d) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : ''; };
  S.isoDT = (d) => { d = S.toDate(d); return d && !isNaN(d) ? `${S.isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; };
  S.hm = (d) => { d = S.toDate(d); return d && !isNaN(d) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; };
  S.fmtDate = (d) => { d = S.toDate(d); return d && !isNaN(d) ? d.toLocaleDateString('fr-FR') : ''; };
  S.fmtDT = (d) => { d = S.toDate(d); return d && !isNaN(d) ? d.toLocaleDateString('fr-FR') + ' ' + S.hm(d) : ''; };
  S.fmtLong = (d) => { d = S.toDate(d); return d && !isNaN(d) ? d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  S.addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  S.startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  S.startOfWeek = (d) => { const x = S.startOfDay(d); const wd = (x.getDay() + 6) % 7; return S.addDays(x, -wd); };
  S.sameDay = (a, b) => S.isoDate(a) === S.isoDate(b);
  S.daysBetween = (a, b) => Math.round((S.startOfDay(b) - S.startOfDay(a)) / 86400000);
  S.weekNumber = (d) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - y0) / 86400000 + 1) / 7); };
  S.JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  S.MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  /** Ajoute n jours ouvrés (hors samedi/dimanche et jours fériés fixes) */
  S.addWorkDays = (d, n) => {
    let x = new Date(d); let k = 0;
    const feries = ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'];
    while (k < n) { x = S.addDays(x, 1); const wd = x.getDay(); if (wd && wd !== 6 && !feries.includes(S.isoDate(x).slice(5))) k++; }
    return x;
  };

  /* ---------- Stockage local ---------- */
  const LS = (() => { try { const k = '__s'; localStorage.setItem(k, 1); localStorage.removeItem(k); return localStorage; } catch (e) { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i], get length() { return Object.keys(m).length; } }; } })();
  S.ls = LS;
  S.load = (key, def) => { try { const v = LS.getItem('suite:' + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; } };
  S.save = (key, val) => { try { LS.setItem('suite:' + key, JSON.stringify(val)); } catch (e) { S.toast('Stockage du navigateur plein : exportez vos données puis supprimez des éléments.', 'error'); } };

  /** Base de collections pour une application : S.db('resa', ['salles','resas']) */
  S.db = function (app, collections) {
    const listeners = new Set();
    const cache = {};
    const key = (c) => `${app}:${c}`;
    const db = {
      app,
      collections,
      list(c) { if (!cache[c]) cache[c] = S.load(key(c), []); return cache[c]; },
      get(c, id) { return db.list(c).find((x) => x.id === id); },
      find(c, pred) { return db.list(c).filter(pred); },
      save(c, obj, silent) {
        const arr = db.list(c);
        if (!obj.id) obj.id = S.uid();
        obj.majLe = new Date().toISOString();
        if (!obj.creeLe) obj.creeLe = obj.majLe;
        const i = arr.findIndex((x) => x.id === obj.id);
        if (i >= 0) arr[i] = obj; else arr.push(obj);
        S.save(key(c), arr);
        if (!silent) listeners.forEach((f) => f(c, obj));
        return obj;
      },
      setAll(c, arr) { cache[c] = arr; S.save(key(c), arr); listeners.forEach((f) => f(c)); },
      remove(c, id) { const arr = db.list(c).filter((x) => x.id !== id); db.setAll(c, arr); },
      on(f) { listeners.add(f); return () => listeners.delete(f); },
      reload() { for (const c of collections) delete cache[c]; },
      dump() { const o = { app, version: 1, exporteLe: new Date().toISOString(), data: {} }; for (const c of collections) o.data[c] = db.list(c); return o; },
      restore(o, merge) {
        if (!o || !o.data) throw new Error('Fichier non reconnu');
        for (const c of collections) {
          if (!Array.isArray(o.data[c])) continue;
          if (merge) { const m = new Map(db.list(c).map((x) => [x.id, x])); o.data[c].forEach((x) => m.set(x.id, x)); db.setAll(c, [...m.values()]); }
          else db.setAll(c, o.data[c]);
        }
      },
      isEmpty() { return collections.every((c) => !db.list(c).length); },
    };
    // Synchronisation entre onglets
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith('suite:' + app + ':')) { const c = e.key.split(':')[2]; delete cache[c]; listeners.forEach((f) => f(c)); }
    });
    return db;
  };

  /* ---------- Paramètres de la suite ---------- */
  const DEF_SETTINGS = {
    marque: 'prefete',
    marqueTexte: '',
    entite: 'DRAAF Bretagne',
    entiteLongue: "Direction régionale de l'alimentation, de l'agriculture et de la forêt de Bretagne",
    adresse: '15 avenue de Cucillé, 35047 Rennes Cedex 9',
    agent: '',
    proxy: 'https://corsproxy.io/?url={url}',
    grist: { server: 'https://grist.numerique.gouv.fr', docId: '', apiKey: '' },
  };
  S.settings = () => { const s = Object.assign({}, DEF_SETTINGS, S.load('settings', {})); s.grist = Object.assign({}, DEF_SETTINGS.grist, s.grist || {}); return s; };
  S.setSettings = (s) => S.save('settings', s);
  S.MARQUES = {
    prefete: { label: 'Préfète de la région Bretagne', html: 'Préfète<br>de la région<br>Bretagne' },
    agriculture: { label: "Ministère de l'Agriculture et de la Souveraineté alimentaire", html: "Ministère<br>de l'agriculture<br>et de la souveraineté<br>alimentaire" },
    rf: { label: 'République française', html: 'République<br>française' },
    libre: { label: 'Texte libre', html: '' },
  };
  S.marqueHTML = () => { const s = S.settings(); if (s.marque === 'libre') return S.esc(s.marqueTexte || 'République française').replace(/\n/g, '<br>'); return (S.MARQUES[s.marque] || S.MARQUES.prefete).html; };
  S.marqueTexte = () => S.marqueHTML().replace(/<br>/g, ' ');

  /* ---------- Gabarit de page ---------- */
  S.APPS = [
    { id: 'automatisation', titre: 'Automatisation', desc: 'Scénarios Grist ↔ applications (mail, SMS, Tchap, carto, visio…)', icon: 'fr-icon-git-merge-line' },
    { id: 'circuits', titre: 'Circuits de travail', desc: 'Demandes, étapes, validations, délais', icon: 'fr-icon-git-branch-line' },
    { id: 'reservation', titre: 'Réservation de ressources', desc: 'Salles, véhicules, matériel', icon: 'fr-icon-calendar-event-line' },
    { id: 'veille', titre: 'Veille informationnelle', desc: 'Flux RSS et API, mots-clés, bulletins', icon: 'fr-icon-rss-line' },
    { id: 'cartographie', titre: 'Cartographie', desc: 'IGN, cadastre, RPG, WMS/WFS, Grist', icon: 'fr-icon-map-pin-2-line' },
    { id: 'courrier', titre: 'Courrier & parapheur', desc: 'Registre arrivée/départ, signature', icon: 'fr-icon-mail-line' },
    { id: 'crise', titre: 'Gestion de crise', desc: 'Main courante, astreintes, fiches réflexes', icon: 'fr-icon-alarm-warning-line' },
    { id: 'controles', titre: 'Contrôles terrain', desc: 'Grilles, visites, rapports, suites', icon: 'fr-icon-survey-line' },
    { id: 'actes', titre: 'Actes & publipostage', desc: 'Arrêtés, courriers, convocations', icon: 'fr-icon-draft-line' },
  ];

  /**
   * Initialise la page : S.init({ id, titre, sousTitre, nav:[{id,label}], full, render(route, params) })
   */
  S.init = function (cfg) {
    S.cfg = cfg;
    const root = cfg.root || '../';
    S.root = root;
    document.documentElement.setAttribute('data-fr-scheme', S.load('scheme', 'system'));
    document.title = (cfg.titre || 'Suite') + ' — ' + S.settings().entite;
    const s = S.settings();
    const body = document.body;
    body.prepend(
      h('div', { class: 'fr-skiplinks' }, h('nav', { class: 'fr-container', 'aria-label': 'Accès rapide' }, h('ul', { class: 'fr-skiplinks__list' },
        h('li', {}, h('a', { class: 'fr-link', href: '#contenu' }, 'Contenu')),
        h('li', {}, h('a', { class: 'fr-link', href: '#pied' }, 'Pied de page'))))),
      S.header(cfg, s, root),
    );
    let main = document.getElementById('contenu');
    if (!main) { main = h('main', { id: 'contenu', class: 's-main', role: 'main', tabindex: '-1' }); body.append(main); }
    if (!document.getElementById('view')) main.append(h('div', { class: cfg.full ? '' : 'fr-container fr-py-4w', id: 'view' }));
    if (cfg.full) body.classList.add('s-fullpage');
    body.append(S.footer(s, root), h('div', { class: 's-toasts', 'aria-live': 'polite', id: 's-toasts' }));
    if (cfg.full) {
      const setH = () => { const hd = document.querySelector('.fr-header'); if (hd) document.documentElement.style.setProperty('--s-head', hd.offsetHeight + 'px'); };
      setH(); window.addEventListener('resize', setH); setTimeout(setH, 300);
    }
    if (cfg.render) {
      const go = () => {
        const hash = location.hash.replace(/^#\/?/, '');
        const [route, ...params] = hash.split('/');
        const r = route || (cfg.nav && cfg.nav[0] && cfg.nav[0].id) || '';
        document.querySelectorAll('.fr-nav__link[data-route]').forEach((a) => { if (a.dataset.route === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
        const view = document.getElementById('view');
        try { cfg.render(r, params.map(decodeURIComponent), view); } catch (e) { console.error(e); S.toast('Erreur : ' + e.message, 'error'); }
        if (!cfg.full) window.scrollTo(0, 0);
      };
      window.addEventListener('hashchange', go);
      S.refresh = go;
      setTimeout(go, 0);
    }
  };
  S.go = (path) => { if (location.hash === '#/' + path) S.refresh && S.refresh(); else location.hash = '#/' + path; };

  S.header = function (cfg, s, root) {
    const tools = h('ul', { class: 'fr-btns-group' },
      (cfg.tools || []).map((t) => h('li', {}, h('button', { type: 'button', class: 'fr-btn ' + (t.icon || ''), onclick: t.onClick }, t.label))),
      cfg.db ? h('li', {}, h('button', { type: 'button', class: 'fr-btn fr-icon-save-line', onclick: () => S.dataModal(cfg.db, cfg.grist) }, 'Données')) : null,
      h('li', {}, h('button', { type: 'button', class: 'fr-btn fr-icon-settings-5-line', onclick: () => S.settingsModal() }, 'Paramètres')),
      root ? h('li', {}, h('a', { class: 'fr-btn fr-icon-layout-grid-line', href: root + 'index.html' }, 'Applications')) : null,
    );
    const nav = (cfg.nav || []).length ? h('nav', { class: 'fr-nav', id: 'navigation', role: 'navigation', 'aria-label': 'Menu principal' },
      h('ul', { class: 'fr-nav__list' }, cfg.nav.map((n) => h('li', { class: 'fr-nav__item' }, h('a', { class: 'fr-nav__link', href: '#/' + n.id, dataset: { route: n.id } }, n.label))))) : null;
    return h('header', { role: 'banner', class: 'fr-header' },
      h('div', { class: 'fr-header__body' }, h('div', { class: 'fr-container' }, h('div', { class: 'fr-header__body-row' },
        h('div', { class: 'fr-header__brand fr-enlarge-link' },
          h('div', { class: 'fr-header__brand-top' },
            h('div', { class: 'fr-header__logo' }, h('p', { class: 'fr-logo', html: S.marqueHTML() })),
            h('div', { class: 'fr-header__navbar' }, h('button', { class: 'fr-btn--menu fr-btn', 'data-fr-opened': 'false', 'aria-controls': 'menu-principal', 'aria-haspopup': 'menu', id: 'bouton-menu', title: 'Menu' }, 'Menu'))),
          h('div', { class: 'fr-header__service' },
            h('a', { href: cfg.home || '#/', title: 'Accueil — ' + (cfg.titre || '') }, h('p', { class: 'fr-header__service-title' }, cfg.titre || 'Suite numérique', cfg.beta ? h('span', { class: 'fr-badge fr-badge--sm fr-badge--green-menthe' }, 'BETA') : null)),
            h('p', { class: 'fr-header__service-tagline' }, s.entite + (cfg.sousTitre ? ' — ' + cfg.sousTitre : '')))),
        h('div', { class: 'fr-header__tools' }, h('div', { class: 'fr-header__tools-links' }, tools))))),
      h('div', { class: 'fr-header__menu fr-modal', id: 'menu-principal', 'aria-labelledby': 'bouton-menu' },
        h('div', { class: 'fr-container' },
          h('button', { class: 'fr-btn--close fr-btn', 'aria-controls': 'menu-principal', title: 'Fermer' }, 'Fermer'),
          h('div', { class: 'fr-header__menu-links' }),
          nav)));
  };

  S.footer = function (s, root) {
    return h('footer', { class: 'fr-footer', role: 'contentinfo', id: 'pied' },
      h('div', { class: 'fr-container' },
        h('div', { class: 'fr-footer__body' },
          h('div', { class: 'fr-footer__brand fr-enlarge-link' }, h('a', { href: (root || './') + 'index.html', title: 'Retour aux applications' }, h('p', { class: 'fr-logo', html: S.marqueHTML() }))),
          h('div', { class: 'fr-footer__content' },
            h('p', { class: 'fr-footer__content-desc' }, `${s.entiteLongue || s.entite}. Application sans serveur : vos données restent dans ce navigateur (export/import JSON, synchronisation Grist facultative).`),
            h('ul', { class: 'fr-footer__content-list' },
              ['info.gouv.fr', 'service-public.fr', 'legifrance.gouv.fr', 'data.gouv.fr'].map((d) => h('li', { class: 'fr-footer__content-item' }, h('a', { class: 'fr-footer__content-link', target: '_blank', rel: 'noopener', href: 'https://www.' + d.replace(/^www\./, '') }, d)))))),
        h('div', { class: 'fr-footer__bottom' },
          h('ul', { class: 'fr-footer__bottom-list' },
            h('li', { class: 'fr-footer__bottom-item' }, h('span', { class: 'fr-footer__bottom-link' }, 'Accessibilité : non conforme')),
            h('li', { class: 'fr-footer__bottom-item' }, h('a', { class: 'fr-footer__bottom-link', href: (root || './') + 'index.html#donnees' }, 'Données personnelles')),
            h('li', { class: 'fr-footer__bottom-item' }, h('button', { class: 'fr-footer__bottom-link fr-icon-theme-fill fr-btn--icon-left', onclick: S.themeModal }, "Paramètres d'affichage"))),
          h('div', { class: 'fr-footer__bottom-copy' }, h('p', {}, 'Sauf mention contraire, contenus sous ', h('a', { href: 'https://github.com/etalab/licence-ouverte/blob/master/LO.md', target: '_blank', rel: 'noopener' }, 'licence etalab-2.0'))))));
  };

  S.themeModal = function () {
    const cur = S.load('scheme', 'system');
    const opts = [['light', 'Thème clair'], ['dark', 'Thème sombre'], ['system', 'Système']];
    const fs = h('fieldset', { class: 'fr-fieldset' }, h('legend', { class: 'fr-fieldset__legend' }, 'Choisissez un thème'),
      opts.map(([v, l]) => h('div', { class: 'fr-fieldset__element' }, h('div', { class: 'fr-radio-group' },
        h('input', { type: 'radio', id: 'th-' + v, name: 'th', value: v, checked: v === cur }), h('label', { class: 'fr-label', for: 'th-' + v }, l)))));
    S.modal({ titre: "Paramètres d'affichage", taille: 'small', body: fs, actions: [{ label: 'Appliquer', primary: true, onClick: () => { const v = fs.querySelector('input:checked').value; S.save('scheme', v); document.documentElement.setAttribute('data-fr-scheme', v); } }] });
  };

  /* ---------- Modales, toasts, confirmations ---------- */
  S.modal = function ({ titre, body, actions = [], taille, onClose, fermer = 'Fermer' }) {
    const dlg = h('dialog', { class: 's-modal' + (taille ? ' s-modal--' + taille : ''), 'aria-labelledby': 'mt' });
    const close = () => { dlg.close(); dlg.remove(); onClose && onClose(); };
    const foot = h('div', { class: 's-modal__foot' });
    actions.forEach((a) => {
      foot.append(h('button', { type: 'button', class: 'fr-btn ' + (a.primary ? '' : 'fr-btn--secondary ') + (a.danger ? 'fr-btn--tertiary ' : '') + (a.icon ? a.icon + ' fr-btn--icon-left' : ''), onclick: async () => {
        try { const r = await a.onClick?.(close); if (r !== false) close(); } catch (e) { console.error(e); S.toast(e.message, 'error'); }
      } }, a.label));
    });
    S.add(dlg,
      h('div', { class: 's-modal__head' }, h('h1', { id: 'mt' }, titre), h('button', { class: 'fr-btn--close fr-btn', title: 'Fermer', type: 'button', onclick: close }, fermer)),
      h('div', { class: 's-modal__body' }, body),
      actions.length ? foot : null);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    document.body.append(dlg);
    dlg.showModal();
    const f = dlg.querySelector('.s-modal__body input, .s-modal__body select, .s-modal__body textarea');
    if (f) setTimeout(() => f.focus(), 30);
    return { close, el: dlg };
  };
  S.confirm = (msg, { titre = 'Confirmation', ok = 'Confirmer', danger } = {}) => new Promise((res) => {
    let done = false;
    S.modal({ titre, taille: 'small', body: h('p', {}, msg), onClose: () => { if (!done) res(false); }, actions: [{ label: 'Annuler', onClick: () => { done = true; res(false); } }, { label: ok, primary: true, onClick: () => { done = true; res(true); } }] });
  });
  S.prompt = (label, def = '', { titre = 'Saisie' } = {}) => new Promise((res) => {
    let done = false;
    const inp = h('input', { class: 'fr-input', value: def });
    S.modal({ titre, taille: 'small', body: h('div', { class: 'fr-input-group' }, h('label', { class: 'fr-label' }, label), inp), onClose: () => { if (!done) res(null); }, actions: [{ label: 'Annuler' }, { label: 'Valider', primary: true, onClick: () => { done = true; res(inp.value); } }] });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { done = true; res(inp.value); inp.closest('dialog').querySelector('.fr-btn--close').click(); } });
  });
  S.toast = function (msg, type = 'info', ms = 4500) {
    const box = document.getElementById('s-toasts') || document.body;
    const t = h('div', { class: `fr-alert fr-alert--${type === 'error' ? 'error' : type} fr-alert--sm`, role: 'status' }, h('p', {}, msg),
      h('button', { class: 'fr-btn--close fr-btn', title: 'Masquer', onclick: () => t.remove() }, 'Masquer'));
    box.append(t);
    setTimeout(() => t.remove(), ms);
  };
  S.badge = (txt, type = '', sm = true) => h('span', { class: `fr-badge ${sm ? 'fr-badge--sm' : ''} ${type ? 'fr-badge--' + type : ''} fr-badge--no-icon` }, txt);
  S.tag = (txt) => h('span', { class: 'fr-tag fr-tag--sm' }, txt);
  S.btn = (label, onClick, cls = '', icon = '') => h('button', { type: 'button', class: `fr-btn ${cls} ${icon ? icon + ' fr-btn--icon-left' : ''}`, onclick: onClick }, label);
  S.iconBtn = (title, icon, onClick, cls = 'fr-btn--tertiary-no-outline') => h('button', { type: 'button', class: `fr-btn fr-btn--sm ${cls} ${icon}`, title, 'aria-label': title, onclick: onClick }, title);
  S.alert = (titre, msg, type = 'info') => h('div', { class: `fr-alert fr-alert--${type} fr-mb-3w` }, titre ? h('h3', { class: 'fr-alert__title' }, titre) : null, msg ? h('p', {}, msg) : null);
  S.callout = (titre, ...txt) => h('div', { class: 'fr-callout fr-mb-3w' }, titre ? h('h3', { class: 'fr-callout__title' }, titre) : null, h('div', { class: 'fr-callout__text' }, ...txt));
  S.kpis = (items) => h('div', { class: 's-kpis' }, items.map((k) => h('div', { class: 's-kpi ' + (k.type || ''), onclick: k.onClick, style: k.onClick ? 'cursor:pointer' : '' }, h('div', { class: 'v' }, k.v), h('div', { class: 'l' }, k.l))));
  S.bar = (titre, ...actions) => h('div', { class: 's-bar' }, h('h1', { class: 'fr-h3' }, titre), h('div', { class: 's-bar__actions' }, ...actions));

  /* ---------- Formulaires ---------- */
  /**
   * fields : [{name,label,type,options,required,hint,placeholder,full,min,max,step,rows}]
   * types : text,textarea,number,date,time,datetime,select,multi,checkbox,color,email,tel,url,password,file,radio
   */
  S.form = function (fields, values = {}) {
    const el = h('div', { class: 's-form' });
    const inputs = {};
    const opts = (f) => (typeof f.options === 'function' ? f.options() : f.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
    for (const f of fields) {
      if (f.type === 'section') { el.append(h('h3', { class: 'fr-h6 s-full fr-mt-2w fr-mb-1w' }, f.label)); continue; }
      if (f.type === 'html') { el.append(h('div', { class: 's-full' }, f.html instanceof Node ? f.html : h('div', { html: f.html }))); continue; }
      const id = 'f-' + S.uid();
      const v = values[f.name] != null ? values[f.name] : f.default != null ? f.default : '';
      let wrap, inp;
      const label = h('label', { class: 'fr-label', for: id }, f.label, f.required ? ' *' : '', f.hint ? h('span', { class: 'fr-hint-text' }, f.hint) : null);
      if (f.type === 'checkbox') {
        inp = h('input', { type: 'checkbox', id, checked: !!v });
        wrap = h('div', { class: 'fr-checkbox-group' }, inp, label);
      } else if (f.type === 'multi') {
        const vals = Array.isArray(v) ? v : v ? String(v).split(',') : [];
        const boxes = opts(f).map((o) => { const cid = id + S.uid(); return h('div', { class: 'fr-checkbox-group fr-checkbox-group--sm' }, h('input', { type: 'checkbox', id: cid, value: o.value, checked: vals.includes(o.value) }), h('label', { class: 'fr-label', for: cid }, o.label)); });
        wrap = h('fieldset', { class: 'fr-fieldset' }, h('legend', { class: 'fr-fieldset__legend--regular fr-fieldset__legend' }, f.label), h('div', { class: 's-checks' }, boxes.length ? boxes : h('span', { class: 's-mention' }, 'Aucune option')));
        inp = { get value() { return [...wrap.querySelectorAll('input:checked')].map((x) => x.value); }, set value(a) { wrap.querySelectorAll('input').forEach((x) => { x.checked = (a || []).includes(x.value); }); } };
      } else if (f.type === 'select') {
        inp = h('select', { class: 'fr-select', id }, f.required ? null : h('option', { value: '' }, f.placeholder || '—'), opts(f).map((o) => h('option', { value: o.value, selected: String(o.value) === String(v) }, o.label)));
        wrap = h('div', { class: 'fr-select-group' }, label, inp);
      } else if (f.type === 'textarea') {
        inp = h('textarea', { class: 'fr-input', id, rows: f.rows || 4, placeholder: f.placeholder || '' }); inp.value = v;
        wrap = h('div', { class: 'fr-input-group' }, label, inp);
      } else {
        const t = { datetime: 'datetime-local' }[f.type] || f.type || 'text';
        inp = h('input', { class: 'fr-input', id, type: t, placeholder: f.placeholder || '', min: f.min, max: f.max, step: f.step, list: f.list });
        if (t === 'datetime-local' && v) inp.value = S.isoDT(v); else if (t !== 'file') inp.value = v;
        if (t === 'color') inp.style.height = '2.5rem';
        wrap = h('div', { class: 'fr-input-group' }, label, inp);
      }
      if (f.full || f.type === 'textarea' || f.type === 'multi') wrap.classList.add('s-full');
      if (f.onChange && inp.addEventListener) inp.addEventListener('change', () => f.onChange(inp.value, api));
      wrap.dataset.name = f.name;
      inputs[f.name] = { f, inp, wrap };
      el.append(wrap);
    }
    const api = {
      el,
      inputs,
      get() {
        const o = {};
        for (const [n, { f, inp }] of Object.entries(inputs)) {
          if (f.type === 'checkbox') o[n] = inp.checked;
          else if (f.type === 'number') o[n] = inp.value === '' ? null : Number(inp.value);
          else if (f.type === 'file') o[n] = inp.files;
          else o[n] = inp.value;
        }
        return o;
      },
      validate() {
        let ok = true;
        for (const { f, inp, wrap } of Object.values(inputs)) {
          wrap.classList.remove('fr-input-group--error', 'fr-select-group--error');
          wrap.querySelector('.fr-error-text')?.remove();
          const val = f.type === 'checkbox' ? inp.checked : inp.value;
          if (f.required && (val === '' || val == null || (Array.isArray(val) && !val.length))) {
            ok = false;
            wrap.classList.add(f.type === 'select' ? 'fr-select-group--error' : 'fr-input-group--error');
            wrap.append(h('p', { class: 'fr-error-text' }, 'Champ obligatoire'));
          }
        }
        if (!ok) el.querySelector('.fr-input-group--error input, .fr-input-group--error textarea, .fr-select-group--error select')?.focus();
        return ok;
      },
      set(n, val) { const x = inputs[n]; if (!x) return; if (x.f.type === 'checkbox') x.inp.checked = !!val; else x.inp.value = val; },
    };
    return api;
  };

  /** Modale formulaire : renvoie une promesse des valeurs ou null */
  S.formModal = (titre, fields, values = {}, { taille, extraActions = [], okLabel = 'Enregistrer' } = {}) => new Promise((res) => {
    const f = S.form(fields, values);
    let done = false;
    S.modal({ titre, body: f.el, taille, onClose: () => { if (!done) res(null); }, actions: [
      ...extraActions.map((a) => ({ ...a, onClick: async () => { done = true; await a.onClick(); res(null); } })),
      { label: 'Annuler' },
      { label: okLabel, primary: true, onClick: () => { if (!f.validate()) return false; done = true; res(Object.assign({}, values, f.get())); } },
    ] });
  });

  /* ---------- Tableaux ---------- */
  /** columns : [{key,label,render(row),class,sort}] */
  S.table = function (columns, rows, { onRow, empty = 'Aucun élément', caption, sortable = true } = {}) {
    let sortKey = null, dir = 1;
    const wrap = h('div', { class: 'fr-table fr-table--no-caption s-tablewrap' });
    const draw = () => {
      let data = rows.slice();
      if (sortKey) { const c = columns.find((x) => x.key === sortKey); const val = (r) => (c.sort ? c.sort(r) : r[sortKey]); data.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; }); }
      S.clear(wrap).append(h('table', {}, caption ? h('caption', {}, caption) : null,
        h('thead', {}, h('tr', {}, columns.map((c) => h('th', { scope: 'col', class: c.class || '', style: sortable && c.key ? 'cursor:pointer' : '', onclick: () => { if (!sortable || !c.key) return; dir = sortKey === c.key ? -dir : 1; sortKey = c.key; draw(); } }, c.label, sortKey === c.key ? (dir > 0 ? ' ▲' : ' ▼') : '')))),
        h('tbody', {}, data.length ? data.map((r) => h('tr', { class: onRow ? 's-click' : '', onclick: onRow ? (e) => { if (!e.target.closest('button,a,input,select')) onRow(r); } : null }, columns.map((c) => { const v = c.render ? c.render(r) : r[c.key]; return h('td', { class: c.class || '' }, v == null ? '' : v); })))
          : h('tr', {}, h('td', { colspan: columns.length, class: 's-mention' }, empty)))));
    };
    draw();
    return wrap;
  };

  S.search = (placeholder, onInput, value = '') => {
    const inp = h('input', { class: 'fr-input', type: 'search', placeholder, value });
    inp.addEventListener('input', S.debounce(() => onInput(inp.value), 200));
    return h('div', { class: 'fr-search-bar', role: 'search' }, h('label', { class: 'fr-label' }, placeholder), inp, h('button', { class: 'fr-btn', title: 'Rechercher', type: 'button', onclick: () => onInput(inp.value) }, 'Rechercher'));
  };
  S.select = (label, options, value, onChange) => {
    const sel = h('select', { class: 'fr-select', onchange: () => onChange(sel.value) }, options.map((o) => (typeof o === 'object' ? o : { value: o, label: o })).map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
    return h('div', { class: 'fr-select-group' }, h('label', { class: 'fr-label' }, label), sel);
  };
  S.segmented = (options, value, onChange, name = 'seg' + S.uid()) => h('fieldset', { class: 'fr-segmented fr-segmented--sm' }, h('legend', { class: 'fr-segmented__legend fr-sr-only' }, 'Vue'),
    h('div', { class: 'fr-segmented__elements' }, options.map((o) => { const id = name + o.value; return h('div', { class: 'fr-segmented__element' }, h('input', { type: 'radio', id, name, value: o.value, checked: o.value === value, onchange: () => onChange(o.value) }), h('label', { class: 'fr-label', for: id }, o.label)); })));

  /* ---------- Fichiers ---------- */
  S.download = (name, content, mime = 'text/plain;charset=utf-8') => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  S.pickFile = (accept = '*', multiple = false) => new Promise((res) => {
    const i = h('input', { type: 'file', accept, multiple, style: 'display:none' });
    i.addEventListener('change', () => { res(multiple ? [...i.files] : i.files[0] || null); i.remove(); });
    document.body.append(i); i.click();
  });
  S.readText = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
  S.readDataURL = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  S.toCSV = (rows, cols) => {
    cols = cols || [...new Set(rows.flatMap((r) => Object.keys(r)))].map((k) => ({ key: k, label: k }));
    const q = (v) => { if (v == null) return ''; if (typeof v === 'object') v = JSON.stringify(v); v = String(v); return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return '﻿' + [cols.map((c) => q(c.label)).join(';'), ...rows.map((r) => cols.map((c) => q(c.get ? c.get(r) : r[c.key])).join(';'))].join('\r\n');
  };
  S.parseCSV = (text) => {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    const head = rows.shift() || [];
    return rows.filter((r) => r.some((x) => x !== '')).map((r) => Object.fromEntries(head.map((k, i) => [k.trim(), r[i] ?? ''])));
  };
  S.ics = (events, nom = 'Calendrier') => {
    const f = (d) => { d = new Date(d); return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'; };
    const e = (s) => String(s || '').replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Suite numerique//FR', 'X-WR-CALNAME:' + e(nom),
      ...events.flatMap((ev) => ['BEGIN:VEVENT', 'UID:' + ev.id + '@suite', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(ev.debut), 'DTEND:' + f(ev.fin), 'SUMMARY:' + e(ev.titre), ev.lieu ? 'LOCATION:' + e(ev.lieu) : null, ev.desc ? 'DESCRIPTION:' + e(ev.desc) : null, 'END:VEVENT'].filter(Boolean)),
      'END:VCALENDAR'].join('\r\n');
  };

  /** Stockage de fichiers binaires (IndexedDB) */
  S.files = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('suite-fichiers', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('f', mode); const st = t.objectStore('f'); const r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
    return {
      async put(blob, id = S.uid('f')) { await tx('readwrite', (s) => s.put(blob, id)); return id; },
      get: (id) => tx('readonly', (s) => s.get(id)),
      del: (id) => tx('readwrite', (s) => s.delete(id)),
      async open(id, name) { const b = await S.files.get(id); if (!b) return S.toast('Fichier introuvable dans ce navigateur', 'warning'); const u = URL.createObjectURL(b); const a = h('a', { href: u, target: '_blank', download: name || '' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); },
    };
  })();

  /* ---------- Réseau ---------- */
  /** fetch avec repli automatique via un proxy CORS configurable */
  S.fetch = async function (url, opts = {}, { proxy = 'auto' } = {}) {
    const viaProxy = () => { const p = S.settings().proxy; if (!p) throw new Error('Accès direct refusé (CORS) et aucun proxy configuré'); return fetch(p.replace('{url}', encodeURIComponent(url)).replace('{rawurl}', url), opts); };
    if (proxy === true) return viaProxy();
    try { return await fetch(url, opts); }
    catch (e) { if (proxy === false) throw e; return viaProxy(); }
  };
  S.fetchJSON = async (url, opts, o) => { const r = await S.fetch(url, opts, o); if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} — ${(await r.text()).slice(0, 200)}`); return r.json(); };

  /** Géocodage (Géoplateforme IGN / Base Adresse Nationale) */
  S.geocode = async (q, limit = 5) => {
    const u = `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=${limit}`;
    let j;
    try { j = await S.fetchJSON(u, {}, { proxy: false }); }
    catch (e) { j = await S.fetchJSON(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=${limit}`, {}, { proxy: false }); }
    return (j.features || []).map((f) => ({ label: f.properties.label, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], score: f.properties.score, citycode: f.properties.citycode, city: f.properties.city, postcode: f.properties.postcode, type: f.properties.type }));
  };
  S.reverse = async (lat, lon) => {
    const j = await S.fetchJSON(`https://data.geopf.fr/geocodage/reverse?lat=${lat}&lon=${lon}&limit=1`, {}, { proxy: false });
    const f = (j.features || [])[0];
    return f ? { label: f.properties.label, citycode: f.properties.citycode, city: f.properties.city, postcode: f.properties.postcode } : null;
  };

  /* ---------- Client API Grist ---------- */
  S.grist = {
    conf: () => S.settings().grist,
    ok() { const c = S.grist.conf(); return !!(c.server && c.docId && c.apiKey); },
    async req(path, { method = 'GET', body, conf } = {}) {
      const c = conf || S.grist.conf();
      if (!c.server || !c.docId) throw new Error('Grist non configuré (Paramètres → Grist)');
      const url = c.server.replace(/\/+$/, '') + '/api/docs/' + encodeURIComponent(c.docId) + path;
      const r = await fetch(url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, c.apiKey ? { Authorization: 'Bearer ' + c.apiKey } : {}), body: body ? JSON.stringify(body) : undefined });
      const t = await r.text();
      if (!r.ok) throw new Error(`Grist ${r.status} : ${t.slice(0, 300)}`);
      return t ? JSON.parse(t) : {};
    },
    async tables(conf) { return (await S.grist.req('/tables', { conf })).tables.map((t) => t.id); },
    async columns(table, conf) { return (await S.grist.req(`/tables/${table}/columns`, { conf })).columns; },
    async records(table, { filter, sort, limit, conf } = {}) {
      const p = new URLSearchParams();
      if (filter) p.set('filter', typeof filter === 'string' ? filter : JSON.stringify(filter));
      if (sort) p.set('sort', sort);
      if (limit) p.set('limit', limit);
      const j = await S.grist.req(`/tables/${table}/records?${p}`, { conf });
      return j.records.map((r) => Object.assign({ id: r.id }, r.fields));
    },
    add: (table, recs, conf) => S.grist.req(`/tables/${table}/records`, { method: 'POST', body: { records: recs.map((f) => ({ fields: f })) }, conf }),
    update: (table, recs, conf) => S.grist.req(`/tables/${table}/records`, { method: 'PATCH', body: { records: recs.map(({ id, ...f }) => ({ id: Number(id), fields: f })) }, conf }),
    upsert: (table, recs, keys, conf) => S.grist.req(`/tables/${table}/records`, { method: 'PUT', body: { records: recs.map((f) => ({ require: Object.fromEntries(keys.map((k) => [k, f[k]])), fields: f })) }, conf }),
    remove: (table, ids, conf) => S.grist.req(`/tables/${table}/data/delete`, { method: 'POST', body: ids.map(Number), conf }),
    sql: async (q, conf) => { const j = await S.grist.req(`/sql?q=${encodeURIComponent(q)}`, { conf }); return j.records.map((r) => r.fields); },
    colId: (k) => { let c = String(k).replace(/[^A-Za-z0-9_]/g, '_'); if (!/^[A-Za-z]/.test(c)) c = 'c' + c; if (c === 'id') c = 'Uid'; return c; },
    async ensureTable(table, cols, conf) {
      const tables = await S.grist.tables(conf);
      if (!tables.includes(table)) {
        await S.grist.req('/tables', { method: 'POST', body: { tables: [{ id: table, columns: cols.map((c) => ({ id: c, fields: { label: c } })) }] }, conf });
        return;
      }
      const existing = (await S.grist.columns(table, conf)).map((c) => c.id);
      const miss = cols.filter((c) => !existing.includes(c));
      if (miss.length) await S.grist.req(`/tables/${table}/columns`, { method: 'POST', body: { columns: miss.map((c) => ({ id: c, fields: { label: c } })) }, conf });
    },
    /** Envoie une collection locale dans une table (mise à jour par Uid) */
    async push(table, items, conf) {
      if (!items.length) return 0;
      const keys = [...new Set(items.flatMap((o) => Object.keys(o)))];
      const map = Object.fromEntries(keys.map((k) => [k, S.grist.colId(k)]));
      await S.grist.ensureTable(table, Object.values(map), conf);
      const recs = items.map((o) => Object.fromEntries(keys.map((k) => { let v = o[k]; if (v != null && typeof v === 'object') v = JSON.stringify(v); return [map[k], v == null ? null : v]; })));
      for (let i = 0; i < recs.length; i += 200) await S.grist.upsert(table, recs.slice(i, i + 200), ['Uid'], conf);
      return recs.length;
    },
    async pull(table, conf) {
      const recs = await S.grist.records(table, { conf });
      return recs.filter((r) => r.Uid).map((r) => { const o = {}; for (const [k, v] of Object.entries(r)) { if (k === 'id' || k === 'manualSort') continue; let x = v; if (typeof x === 'string' && /^[[{]/.test(x)) { try { x = JSON.parse(x); } catch (e) { /* texte */ } } o[k === 'Uid' ? 'id' : k] = x; } return o; });
    },
  };

  /* ---------- Modale Données (export/import/Grist) ---------- */
  S.dataModal = function (db, gristTables) {
    const s = S.settings();
    const counts = h('ul', {}, db.collections.map((c) => h('li', {}, `${c} : ${db.list(c).length} élément(s)`)));
    const body = h('div', {},
      h('p', {}, 'Les données de cette application sont enregistrées ', h('strong', {}, 'uniquement dans ce navigateur'), '. Pensez à les exporter régulièrement ou à les synchroniser avec Grist.'),
      counts,
      h('h2', { class: 'fr-h6' }, 'Sauvegarde'),
      h('div', { class: 'fr-btns-group fr-btns-group--inline-sm fr-btns-group--icon-left' },
        S.btn('Exporter (JSON)', () => S.download(`${db.app}-${S.isoDate(new Date())}.json`, JSON.stringify(db.dump(), null, 1), 'application/json'), 'fr-btn--secondary', 'fr-icon-download-line'),
        S.btn('Importer (remplacer)', async () => { const f = await S.pickFile('.json'); if (!f) return; db.restore(JSON.parse(await S.readText(f))); S.toast('Données importées', 'success'); S.refresh && S.refresh(); }, 'fr-btn--secondary', 'fr-icon-upload-line'),
        S.btn('Importer (fusionner)', async () => { const f = await S.pickFile('.json'); if (!f) return; db.restore(JSON.parse(await S.readText(f)), true); S.toast('Données fusionnées', 'success'); S.refresh && S.refresh(); }, 'fr-btn--secondary', 'fr-icon-upload-line'),
        S.btn('Tout effacer', async () => { if (!(await S.confirm('Effacer toutes les données de cette application dans ce navigateur ?', { ok: 'Effacer' }))) return; db.collections.forEach((c) => db.setAll(c, [])); S.refresh && S.refresh(); }, 'fr-btn--tertiary', 'fr-icon-delete-line')),
    );
    if (gristTables) {
      const st = h('p', { class: 's-mention' }, S.grist.ok() ? `Document ${s.grist.docId} sur ${s.grist.server}` : 'Grist non configuré : renseignez-le dans Paramètres.');
      body.append(h('h2', { class: 'fr-h6' }, 'Synchronisation Grist'), st,
        h('p', { class: 's-small' }, 'Tables utilisées : ', Object.entries(gristTables).map(([c, t]) => `${c} → ${t}`).join(' · '), '. Les tables et colonnes manquantes sont créées ; la clé de rapprochement est la colonne Uid.'),
        h('div', { class: 'fr-btns-group fr-btns-group--inline-sm fr-btns-group--icon-left' },
          S.btn('Envoyer vers Grist', async () => {
            try { let n = 0; for (const [c, t] of Object.entries(gristTables)) n += await S.grist.push(t, db.list(c)); S.toast(`${n} enregistrement(s) envoyés vers Grist`, 'success'); } catch (e) { S.toast(e.message, 'error', 9000); }
          }, '', 'fr-icon-upload-2-line'),
          S.btn('Récupérer depuis Grist', async () => {
            try { const o = { data: {} }; for (const [c, t] of Object.entries(gristTables)) { try { o.data[c] = await S.grist.pull(t); } catch (e) { /* table absente */ } } db.restore(o, true); S.toast('Données Grist fusionnées', 'success'); S.refresh && S.refresh(); } catch (e) { S.toast(e.message, 'error', 9000); }
          }, 'fr-btn--secondary', 'fr-icon-download-2-line')));
    }
    S.modal({ titre: 'Données de l’application', body });
  };

  /* ---------- Paramètres ---------- */
  S.settingsModal = function () {
    const s = S.settings();
    const f = S.form([
      { type: 'section', label: 'Identité (bloc-marque DSFR)' },
      { name: 'marque', label: 'Bloc-marque', type: 'select', required: true, options: Object.entries(S.MARQUES).map(([v, m]) => ({ value: v, label: m.label })) },
      { name: 'marqueTexte', label: 'Texte libre du bloc-marque', hint: 'Si « Texte libre » ; un retour à la ligne par ligne', type: 'textarea', rows: 3 },
      { name: 'entite', label: 'Service (sous le titre)', required: true },
      { name: 'entiteLongue', label: 'Nom complet du service' },
      { name: 'adresse', label: 'Adresse postale', full: true },
      { name: 'agent', label: 'Votre nom (agent connecté)', hint: 'Utilisé pour l’historique, les attributions…' },
      { type: 'section', label: 'Grist' },
      { name: 'gserver', label: 'Serveur Grist', placeholder: 'https://grist.numerique.gouv.fr', hint: 'Ex. https://grist.numerique.gouv.fr ou https://docs.getgrist.com' },
      { name: 'gdoc', label: 'Identifiant du document', hint: 'Paramètres du document → ID du document' },
      { name: 'gkey', label: 'Clé API', type: 'password', hint: 'Profil → Clé API. Stockée dans ce navigateur uniquement.', full: true },
      { type: 'section', label: 'Réseau' },
      { name: 'proxy', label: 'Proxy CORS (flux RSS, API sans CORS)', full: true, hint: '{url} est remplacé par l’adresse encodée. Laisser vide pour désactiver. Les adresses transitent par ce service tiers : n’y faites pas passer de données sensibles.' },
    ], { ...s, gserver: s.grist.server, gdoc: s.grist.docId, gkey: s.grist.apiKey });
    const test = h('p', { class: 's-mention' });
    f.el.append(h('div', { class: 's-full' }, S.btn('Tester la connexion Grist', async () => {
      const v = f.get();
      test.textContent = 'Test en cours…';
      try { const t = await S.grist.tables({ server: v.gserver, docId: v.gdoc, apiKey: v.gkey }); test.textContent = '✔ Connexion réussie. Tables : ' + t.join(', '); }
      catch (e) { test.textContent = '✖ ' + e.message + ' (vérifiez l’URL, l’identifiant, la clé et que le serveur autorise les requêtes depuis ce site).'; }
    }, 'fr-btn--secondary fr-btn--sm', 'fr-icon-refresh-line'), test));
    S.modal({ titre: 'Paramètres de la suite', body: f.el, actions: [{ label: 'Annuler' }, { label: 'Enregistrer', primary: true, onClick: () => {
      if (!f.validate()) return false;
      const v = f.get();
      S.setSettings({ marque: v.marque, marqueTexte: v.marqueTexte, entite: v.entite, entiteLongue: v.entiteLongue, adresse: v.adresse, agent: v.agent, proxy: v.proxy, grist: { server: v.gserver, docId: v.gdoc, apiKey: v.gkey } });
      location.reload();
    } }] });
  };

  /** Nom de l'agent courant */
  S.me = () => S.settings().agent || 'Agent';

  /** Remplit un gabarit {{chemin.vers.valeur}} (sans évaluation de code) */
  S.fill = (tpl, data) => String(tpl || '').replace(/\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]+?)\s*)?\}\}/g, (m, k, filt) => {
    let v = S.get(data, k.trim());
    if (v == null) v = '';
    if (filt === 'date') v = S.fmtDate(v); else if (filt === 'long') v = S.fmtLong(v); else if (filt === 'maj') v = String(v).toUpperCase(); else if (filt === 'min') v = String(v).toLowerCase();
    return v;
  });

  /** Notification système (si autorisée) */
  S.notify = async (titre, body) => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission === 'granted') { new Notification(titre, { body, icon: S.root + 'assets/dsfr/favicon/favicon.svg' }); return true; }
    return false;
  };

  /** Données d'une autre application de la suite (même origine) */
  S.suite = (app, coll) => ({
    list: () => S.load(`${app}:${coll}`, []),
    add: (obj) => { const arr = S.load(`${app}:${coll}`, []); obj.id = obj.id || S.uid(); obj.creeLe = obj.majLe = new Date().toISOString(); arr.push(obj); S.save(`${app}:${coll}`, arr); return obj; },
  });
})();
