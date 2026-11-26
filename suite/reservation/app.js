/* Réservation de ressources (salles, véhicules, matériel) — planning, disponibilités, validation, affichage de porte */
(function () {
  'use strict';
  const h = S.h;
  const db = S.db('reservation', ['ressources', 'reservations']);
  const TYPES = ['Salle de réunion', 'Bureau partagé', 'Véhicule', 'Matériel'];
  const EQUIP = ['Écran / TV', 'Vidéoprojecteur', 'Visioconférence', 'Tableau blanc', 'Paperboard', 'Accès PMR', 'Climatisation', 'Sonorisation', 'Prises électriques', 'Badge parking'];
  const STAT = { demandee: ['En attente', 'warning'], confirmee: ['Confirmée', 'success'], annulee: ['Annulée', ''], refusee: ['Refusée', 'error'] };
  const H0 = 7, H1 = 20, SLOT = 22; // px par demi-heure

  if (!S.load('reservation:init')) {
    S.save('reservation:init', 1);
    const R = (nom, type, site, capacite, equipements, couleur, validation = false, description = '') => db.save('ressources', { nom, type, site, capacite, equipements, couleur, validation, description, actif: true, gestionnaire: 'Secrétariat' }, true);
    const rs = [
      R('Salle Vilaine', 'Salle de réunion', 'Rennes — Cucillé', 20, ['Écran / TV', 'Visioconférence', 'Tableau blanc', 'Accès PMR'], '#000091'),
      R('Salle Rance', 'Salle de réunion', 'Rennes — Cucillé', 8, ['Écran / TV', 'Paperboard'], '#18753c'),
      R('Salle Odet (amphithéâtre)', 'Salle de réunion', 'Rennes — Cucillé', 60, ['Vidéoprojecteur', 'Sonorisation', 'Visioconférence', 'Accès PMR'], '#a558a0', true, 'Réservation soumise à validation du secrétariat général.'),
      R('Bureau visio 1', 'Bureau partagé', 'Rennes — Cucillé', 2, ['Visioconférence', 'Écran / TV'], '#009081'),
      R('Renault Zoé — AB-123-CD', 'Véhicule', 'Rennes — Cucillé', 4, ['Badge parking'], '#ce614a', false, 'Électrique, autonomie ≈ 250 km. Carte de recharge dans la boîte à gants.'),
      R('Peugeot Partner — EF-456-GH', 'Véhicule', 'Rennes — Cucillé', 2, [], '#7f3e3b', true, 'Utilitaire : missions terrain et transport de matériel.'),
      R('Vidéoprojecteur portable', 'Matériel', 'Rennes — Cucillé', 0, [], '#c3992a'),
    ];
    const lun = S.startOfWeek(new Date());
    const at = (j, hh, mm = 0) => { const d = S.addDays(lun, j); d.setHours(hh, mm, 0, 0); return d.toISOString(); };
    [[0, 0, 9, 11, 'Comité de direction'], [0, 1, 14, 15.5, 'Point équipe SRAL'], [1, 0, 10, 12, 'Réunion PAC – DDTM'], [2, 2, 9, 17, 'Séminaire de service'], [2, 4, 8, 18, 'Mission contrôle Finistère'], [3, 1, 11, 12, 'Entretien'], [4, 0, 14, 16, 'COPIL Plan Ecophyto']].forEach(([j, r, a, b, t]) => db.save('reservations', { ressourceId: rs[r].id, titre: t, debut: at(j, Math.floor(a), (a % 1) * 60), fin: at(j, Math.floor(b), (b % 1) * 60), demandeur: 'Secrétariat', statut: 'confirmee', participants: '' }, true));
  }

  const res = () => db.list('ressources').filter((r) => r.actif !== false);
  const resOf = (b) => db.get('ressources', b.ressourceId) || { nom: '?', couleur: '#666' };
  const actives = () => db.list('reservations').filter((b) => b.statut !== 'annulee' && b.statut !== 'refusee');
  const overlap = (a0, a1, b0, b1) => new Date(a0) < new Date(b1) && new Date(b0) < new Date(a1);
  const conflits = (rid, debut, fin, exceptId) => actives().filter((b) => b.ressourceId === rid && b.id !== exceptId && overlap(debut, fin, b.debut, b.fin));
  const libre = (rid, debut, fin, exceptId) => !conflits(rid, debut, fin, exceptId).length;

  document.head.append(h('style', {}, `
.rs-grid{display:grid;border-top:1px solid var(--border-default-grey);border-left:1px solid var(--border-default-grey);min-width:40rem}
.rs-head{background:var(--background-alt-grey);font-weight:700;font-size:.8125rem;padding:.4rem;text-align:center;border-right:1px solid var(--border-default-grey);border-bottom:1px solid var(--border-default-grey);position:sticky;top:0;z-index:4}
.rs-head.today{background:var(--background-action-low-blue-france);color:var(--text-action-high-blue-france)}
.rs-times{position:relative;border-right:1px solid var(--border-default-grey)}
.rs-times span{position:absolute;right:.25rem;font-size:.7rem;color:var(--text-mention-grey);transform:translateY(-50%)}
.rs-col{position:relative;border-right:1px solid var(--border-default-grey);cursor:cell;background-image:repeating-linear-gradient(to bottom,var(--border-default-grey) 0 1px,transparent 1px ${SLOT * 2}px),repeating-linear-gradient(to bottom,transparent 0 ${SLOT}px,var(--background-alt-grey) ${SLOT}px ${SLOT + 1}px,transparent ${SLOT + 1}px ${SLOT * 2}px)}
.rs-col.weekend{background-color:var(--background-alt-grey)}
.rs-now{position:absolute;left:0;right:0;border-top:2px solid var(--border-plain-error);z-index:3;pointer-events:none}
.rs-door{min-height:70vh;display:flex;flex-direction:column;justify-content:center;padding:3rem;color:#fff}
.rs-door h1{color:#fff;font-size:3.5rem;line-height:1.1}
.rs-door .big{font-size:2rem;font-weight:700}
.rs-scroll{overflow:auto;max-height:calc(100vh - 16rem);border-bottom:1px solid var(--border-default-grey)}
`));

  S.init({
    titre: 'Réservation de ressources', sousTitre: 'Salles, véhicules, matériel', db,
    grist: { ressources: 'Resa_ressources', reservations: 'Resa_reservations' },
    nav: [{ id: 'planning', label: 'Planning' }, { id: 'dispo', label: 'Trouver un créneau' }, { id: 'mes', label: 'Mes réservations' }, { id: 'validation', label: 'À valider' }, { id: 'ressources', label: 'Ressources' }],
    render(route, p, v) {
      S.clear(v);
      document.body.classList.toggle('s-fullpage', route === 'porte');
      v.className = route === 'porte' ? '' : 'fr-container fr-py-4w';
      ({ planning, dispo, mes, validation, ressources, porte }[route] || planning)(v, ...p);
    },
  });

  /* ---------- Formulaire de réservation ---------- */
  async function editer(b = {}) {
    const isNew = !b.id;
    const d0 = b.debut ? new Date(b.debut) : (() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d; })();
    const d1 = b.fin ? new Date(b.fin) : new Date(d0.getTime() + 3600000);
    const fields = [
      { name: 'ressourceId', label: 'Ressource', type: 'select', required: true, options: res().map((r) => ({ value: r.id, label: `${r.nom} (${r.type}${r.capacite ? ', ' + r.capacite + ' pl.' : ''})` })) },
      { name: 'titre', label: 'Objet', required: true },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'hdebut', label: 'De', type: 'time', required: true, step: 900 },
      { name: 'datefin', label: 'Jusqu’au (si plusieurs jours)', type: 'date' },
      { name: 'hfin', label: 'À', type: 'time', required: true, step: 900 },
      { name: 'demandeur', label: 'Demandeur', required: true },
      { name: 'participants', label: 'Nombre de participants', type: 'number', min: 0 },
      { name: 'email', label: 'Courriel', type: 'email' },
      { name: 'telephone', label: 'Téléphone', type: 'tel' },
      { name: 'besoins', label: 'Besoins particuliers', type: 'multi', options: ['Installation en U', 'Installation théâtre', 'Café / accueil', 'Visio à préparer', 'Accueil de personnes extérieures', 'Clés / badge'] },
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2 },
      ...(isNew ? [{ type: 'section', label: 'Répétition' }, { name: 'repet', label: 'Répéter', type: 'select', options: [{ value: '', label: 'Non' }, { value: 'jour', label: 'Chaque jour ouvré' }, { value: 'semaine', label: 'Chaque semaine' }, { value: '2semaines', label: 'Toutes les 2 semaines' }, { value: 'mois', label: 'Chaque mois (même date)' }] }, { name: 'jusqua', label: 'Jusqu’au', type: 'date' }] : []),
    ];
    const vals = Object.assign({ demandeur: S.me() }, b, { date: S.isoDate(d0), hdebut: S.hm(d0), hfin: S.hm(d1), datefin: S.isoDate(d1) !== S.isoDate(d0) ? S.isoDate(d1) : '' });
    const extra = [];
    if (!isNew) {
      if (b.statut === 'demandee') extra.push({ label: 'Valider', onClick: () => statut(b, 'confirmee') });
      if (b.statut !== 'annulee') extra.push({ label: 'Annuler la réservation', onClick: () => statut(b, 'annulee') });
      extra.push({ label: 'Supprimer', onClick: () => { db.remove('reservations', b.id); S.refresh(); } });
    }
    const v = await S.formModal(isNew ? 'Nouvelle réservation' : 'Réservation', fields, vals, { taille: 'wide', extraActions: extra });
    if (!v) return;
    const debut = new Date(`${v.date}T${v.hdebut}`), fin = new Date(`${v.datefin || v.date}T${v.hfin}`);
    if (!(fin > debut)) return S.toast('L’heure de fin doit être postérieure au début', 'error');
    const r = db.get('ressources', v.ressourceId);
    if (r.capacite && v.participants > r.capacite) S.toast(`Attention : ${v.participants} participants pour ${r.capacite} places`, 'warning', 7000);
    const base = { ressourceId: v.ressourceId, titre: v.titre, demandeur: v.demandeur, participants: v.participants, email: v.email, telephone: v.telephone, besoins: v.besoins, commentaire: v.commentaire };
    const occ = [[debut, fin]];
    if (isNew && v.repet && v.jusqua) {
      const lim = new Date(v.jusqua + 'T23:59');
      let a = new Date(debut), z = new Date(fin), k = 0;
      while (k++ < 400) {
        if (v.repet === 'jour') { do { a = S.addDays(a, 1); z = S.addDays(z, 1); } while (a.getDay() === 0 || a.getDay() === 6); }
        else if (v.repet === 'semaine') { a = S.addDays(a, 7); z = S.addDays(z, 7); }
        else if (v.repet === '2semaines') { a = S.addDays(a, 14); z = S.addDays(z, 14); }
        else { a = new Date(a); a.setMonth(a.getMonth() + 1); z = new Date(z); z.setMonth(z.getMonth() + 1); }
        if (a > lim) break;
        occ.push([new Date(a), new Date(z)]);
      }
    }
    const serie = occ.length > 1 ? S.uid('r') : undefined;
    let ok = 0; const ko = [];
    for (const [a, z] of occ) {
      const c = conflits(v.ressourceId, a, z, b.id);
      if (c.length) { ko.push(`${S.fmtDT(a)} (occupé : ${c[0].titre})`); continue; }
      const o = isNew ? Object.assign({}, base, { serie }) : Object.assign(b, base);
      o.debut = a.toISOString(); o.fin = z.toISOString();
      if (isNew) o.statut = r.validation ? 'demandee' : 'confirmee';
      else if (r.validation && b.statut === 'confirmee' && (b.ressourceId !== v.ressourceId)) o.statut = 'demandee';
      db.save('reservations', o, true); ok++;
    }
    db.setAll('reservations', db.list('reservations'));
    if (ko.length) S.modal({ titre: 'Conflits', body: h('div', {}, h('p', {}, `${ok} réservation(s) enregistrée(s). Créneaux non réservés (ressource déjà occupée) :`), h('ul', {}, ko.map((x) => h('li', {}, x)))) });
    else S.toast(ok > 1 ? `${ok} réservations créées` : r.validation ? 'Demande enregistrée : en attente de validation' : 'Réservation confirmée', 'success');
    S.refresh();
  }
  const statut = (b, s) => { b.statut = s; b.traitePar = S.me(); b.traiteLe = new Date().toISOString(); db.save('reservations', b); S.toast('Réservation ' + STAT[s][0].toLowerCase(), 'success'); S.refresh(); };

  /* ---------- Planning ---------- */
  function planning(v) {
    const st = S.load('reservation:vue', { mode: 'semaine', date: S.isoDate(new Date()), type: '', site: '', rid: '' });
    const ref = new Date(st.date + 'T12:00');
    const sites = [...new Set(res().map((r) => r.site).filter(Boolean))];
    let rlist = res().filter((r) => (!st.type || r.type === st.type) && (!st.site || r.site === st.site));
    const save = () => { S.save('reservation:vue', st); S.refresh(); };
    const move = (n) => { const d = st.mode === 'jour' ? S.addDays(ref, n) : st.mode === 'semaine' ? S.addDays(ref, 7 * n) : new Date(ref.getFullYear(), ref.getMonth() + n, 1); st.date = S.isoDate(d); save(); };
    let titre;
    if (st.mode === 'jour') titre = S.fmtLong(ref);
    else if (st.mode === 'semaine') { const l = S.startOfWeek(ref); titre = `Semaine ${S.weekNumber(ref)} — du ${S.fmtDate(l)} au ${S.fmtDate(S.addDays(l, 6))}`; }
    else titre = S.MOIS[ref.getMonth()] + ' ' + ref.getFullYear();
    const pend = db.list('reservations').filter((b) => b.statut === 'demandee').length;
    S.add(v,
      S.bar('Planning', S.btn('Exporter (.ics)', () => S.download('reservations.ics', S.ics(actives().filter((b) => rlist.some((r) => r.id === b.ressourceId)).map((b) => ({ id: b.id, titre: `${b.titre} — ${resOf(b).nom}`, debut: b.debut, fin: b.fin, lieu: resOf(b).nom, desc: b.demandeur })), 'Réservations'), 'text/calendar'), 'fr-btn--secondary', 'fr-icon-calendar-event-line'), S.btn('Réserver', () => editer({ ressourceId: st.rid || undefined }), '', 'fr-icon-add-line')),
      pend ? h('div', { class: 'fr-notice fr-notice--info fr-mb-2w' }, h('div', { class: 'fr-container' }, h('div', { class: 'fr-notice__body' }, h('p', { class: 'fr-notice__title' }, `${pend} demande(s) en attente de validation. `, h('a', { href: '#/validation' }, 'Traiter'))))) : null,
      h('div', { class: 's-toolbar' },
        S.segmented([{ value: 'jour', label: 'Jour' }, { value: 'semaine', label: 'Semaine' }, { value: 'mois', label: 'Mois' }], st.mode, (m) => { st.mode = m; save(); }),
        h('div', { class: 'fr-btns-group fr-btns-group--inline-sm', style: 'margin:0' }, S.iconBtn('Précédent', 'fr-icon-arrow-left-s-line', () => move(-1), 'fr-btn--secondary'), S.btn('Aujourd’hui', () => { st.date = S.isoDate(new Date()); save(); }, 'fr-btn--secondary fr-btn--sm'), S.iconBtn('Suivant', 'fr-icon-arrow-right-s-line', () => move(1), 'fr-btn--secondary')),
        h('h2', { class: 'fr-h5', style: 'margin:0;flex:1' }, titre),
        S.select('Type', [{ value: '', label: 'Tous' }, ...TYPES], st.type, (x) => { st.type = x; st.rid = ''; save(); }),
        sites.length > 1 ? S.select('Site', [{ value: '', label: 'Tous' }, ...sites], st.site, (x) => { st.site = x; save(); }) : null,
        st.mode !== 'jour' ? S.select('Ressource', [{ value: '', label: 'Toutes' }, ...rlist.map((r) => ({ value: r.id, label: r.nom }))], st.rid, (x) => { st.rid = x; save(); }) : null),
    );
    if (st.mode !== 'jour' && st.rid) rlist = rlist.filter((r) => r.id === st.rid);
    const ids = new Set(rlist.map((r) => r.id));
    const bks = db.list('reservations').filter((b) => ids.has(b.ressourceId) && b.statut !== 'annulee' && b.statut !== 'refusee');
    if (st.mode === 'mois') return S.add(v, monthView(ref, bks));
    const cols = st.mode === 'jour' ? rlist.map((r) => ({ label: r.nom, sub: r.capacite ? r.capacite + ' pl.' : r.type, day: ref, rid: r.id, items: bks.filter((b) => b.ressourceId === r.id && S.sameDay(b.debut, ref)) }))
      : [...Array(7)].map((_, i) => { const d = S.addDays(S.startOfWeek(ref), i); return { label: S.JOURS[i].slice(0, 3) + '. ' + d.getDate(), day: d, rid: st.rid, weekend: i > 4, items: bks.filter((b) => S.sameDay(b.debut, d) || (new Date(b.debut) < S.startOfDay(d) && new Date(b.fin) > S.startOfDay(d))) }; });
    S.add(v, h('div', { class: 'rs-scroll' }, timeGrid(cols)), legende(rlist));
  }
  const legende = (rlist) => h('div', { class: 's-tags fr-mt-2w' }, rlist.map((r) => h('span', { class: 's-small fr-mr-2w' }, h('span', { class: 's-dot', style: { background: r.couleur } }), r.nom)), h('span', { class: 's-small' }, '▨ hachuré = en attente de validation'));

  function timeGrid(cols) {
    const height = (H1 - H0) * 2 * SLOT;
    const grid = h('div', { class: 'rs-grid', style: { gridTemplateColumns: `3.5rem repeat(${cols.length}, minmax(7rem, 1fr))` } });
    S.add(grid, h('div', { class: 'rs-head' }), ...cols.map((c) => h('div', { class: 'rs-head' + (S.sameDay(c.day, new Date()) && !c.rid ? ' today' : '') }, c.label, c.sub ? h('div', { class: 's-small s-mention', style: 'font-weight:400' }, c.sub) : null)));
    const times = h('div', { class: 'rs-times', style: { height: height + 'px' } });
    for (let hh = H0 + 1; hh < H1; hh++) S.add(times, h('span', { style: { top: (hh - H0) * 2 * SLOT + 'px' } }, hh + 'h'));
    S.add(grid, times);
    for (const c of cols) {
      const col = h('div', { class: 'rs-col' + (c.weekend ? ' weekend' : ''), style: { height: height + 'px' } });
      col.addEventListener('click', (e) => {
        if (e.target !== col) return;
        const y = e.offsetY; const mins = Math.floor(y / SLOT) * 30 + H0 * 60;
        const d = new Date(c.day); d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
        editer({ ressourceId: c.rid || undefined, debut: d.toISOString(), fin: new Date(d.getTime() + 3600000).toISOString() });
      });
      // couloirs pour les chevauchements
      const items = c.items.slice().sort((a, b) => (a.debut < b.debut ? -1 : 1));
      const lanes = [];
      items.forEach((b) => { let i = lanes.findIndex((end) => end <= b.debut); if (i < 0) { i = lanes.length; lanes.push(''); } lanes[i] = b.fin; b._lane = i; });
      const n = Math.max(1, lanes.length);
      for (const b of items) {
        const day0 = S.startOfDay(c.day);
        const s = Math.max(new Date(b.debut), new Date(day0.getTime() + H0 * 3600000)), e = Math.min(new Date(b.fin), new Date(day0.getTime() + H1 * 3600000));
        if (e <= s) continue;
        const top = ((s - day0) / 60000 - H0 * 60) / 30 * SLOT, hgt = Math.max(SLOT - 2, (e - s) / 60000 / 30 * SLOT - 2);
        const r = resOf(b);
        S.add(col, h('div', { class: 's-ev' + (b.statut === 'demandee' ? ' pending' : ''), style: { top: top + 'px', height: hgt + 'px', background: r.couleur, left: `calc(${(b._lane / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)`, right: 'auto' }, title: `${b.titre}\n${r.nom}\n${S.hm(b.debut)}–${S.hm(b.fin)} · ${b.demandeur}`, onclick: () => editer(b) },
          h('strong', {}, S.hm(b.debut) + ' ' + b.titre), h('div', {}, c.rid ? b.demandeur : r.nom)));
      }
      if (S.sameDay(c.day, new Date())) { const now = new Date(); const m = now.getHours() * 60 + now.getMinutes(); if (m > H0 * 60 && m < H1 * 60) S.add(col, h('div', { class: 'rs-now', style: { top: (m - H0 * 60) / 30 * SLOT + 'px' } })); }
      S.add(grid, col);
    }
    return grid;
  }
  function monthView(ref, bks) {
    const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const start = S.startOfWeek(first);
    const g = h('div', { class: 's-month' }, S.JOURS.map((j) => h('div', { class: 'h' }, j.slice(0, 3))));
    for (let i = 0; i < 42; i++) {
      const d = S.addDays(start, i);
      if (i >= 35 && d.getMonth() !== ref.getMonth()) break;
      const its = bks.filter((b) => S.sameDay(b.debut, d)).sort((a, b) => (a.debut < b.debut ? -1 : 1));
      S.add(g, h('div', { class: (d.getMonth() !== ref.getMonth() ? 'out ' : '') + (S.sameDay(d, new Date()) ? 'today' : ''), ondblclick: () => { const x = new Date(d); x.setHours(9); editer({ debut: x.toISOString(), fin: new Date(x.getTime() + 3600000).toISOString() }); } },
        h('span', { class: 'd' }, d.getDate()), its.slice(0, 5).map((b) => h('span', { class: 's-mev', style: { background: resOf(b).couleur, opacity: b.statut === 'demandee' ? 0.6 : 1 }, title: b.titre, onclick: () => editer(b) }, `${S.hm(b.debut)} ${resOf(b).nom.split(' ')[0]} · ${b.titre}`)), its.length > 5 ? h('span', { class: 's-small' }, `+${its.length - 5}`) : null));
    }
    return g;
  }

  /* ---------- Recherche de disponibilité ---------- */
  function dispo(v) {
    const now = new Date(); now.setMinutes(0, 0, 0); now.setHours(now.getHours() + 1);
    const f = S.form([
      { name: 'date', label: 'Date', type: 'date', required: true, default: S.isoDate(now) },
      { name: 'hdebut', label: 'De', type: 'time', required: true, default: S.hm(now) },
      { name: 'hfin', label: 'À', type: 'time', required: true, default: S.hm(new Date(now.getTime() + 3600000)) },
      { name: 'capacite', label: 'Nombre de personnes', type: 'number', min: 0 },
      { name: 'type', label: 'Type', type: 'select', options: TYPES },
      { name: 'equip', label: 'Équipements requis', type: 'multi', options: EQUIP },
    ]);
    const out = h('div');
    const go = () => {
      const x = f.get(); const a = new Date(`${x.date}T${x.hdebut}`), z = new Date(`${x.date}T${x.hfin}`);
      const cands = res().filter((r) => (!x.type || r.type === x.type) && (!x.capacite || (r.capacite || 0) >= x.capacite) && (x.equip || []).every((e) => (r.equipements || []).includes(e)));
      const ok = cands.filter((r) => libre(r.id, a, z));
      S.add(S.clear(out), h('h2', { class: 'fr-h5 fr-mt-3w' }, `${ok.length} ressource(s) disponible(s) le ${S.fmtDate(a)} de ${x.hdebut} à ${x.hfin}`),
        ok.length ? h('div', { class: 's-grid' }, ok.map((r) => h('div', { class: 'fr-card' }, h('div', { class: 'fr-card__body' }, h('div', { class: 'fr-card__content' },
          h('h3', { class: 'fr-card__title' }, h('span', { class: 's-dot', style: { background: r.couleur } }), r.nom),
          h('p', { class: 'fr-card__desc' }, `${r.type}${r.capacite ? ' · ' + r.capacite + ' places' : ''} · ${r.site || ''}`),
          h('div', { class: 'fr-card__start' }, h('div', { class: 's-tags' }, (r.equipements || []).map(S.tag))),
          r.validation ? h('p', { class: 'fr-card__detail fr-icon-lock-line' }, 'Soumis à validation') : null),
          h('div', { class: 'fr-card__footer' }, S.btn('Réserver', () => editer({ ressourceId: r.id, debut: a.toISOString(), fin: z.toISOString(), participants: x.capacite }), 'fr-btn--sm')))))) : S.alert('Aucune ressource libre', 'Essayez un autre créneau ou réduisez les critères.', 'warning'),
        cands.length > ok.length ? h('p', { class: 's-mention fr-mt-2w' }, 'Occupées sur ce créneau : ' + cands.filter((r) => !ok.includes(r)).map((r) => r.nom).join(', ')) : null);
    };
    S.add(v, h('h1', { class: 'fr-h3' }, 'Trouver un créneau'), h('div', { class: 's-panel' }, f.el, S.btn('Rechercher', go, '', 'fr-icon-search-line')), out);
    go();
  }

  /* ---------- Mes réservations / validation ---------- */
  const tableResa = (arr, extra) => S.table([
    { key: 'debut', label: 'Date', render: (b) => S.fmtDate(b.debut) + ' ' + S.hm(b.debut) + '–' + S.hm(b.fin) },
    { key: 'ressource', label: 'Ressource', render: (b) => h('span', {}, h('span', { class: 's-dot', style: { background: resOf(b).couleur } }), resOf(b).nom), sort: (b) => resOf(b).nom },
    { key: 'titre', label: 'Objet' }, { key: 'demandeur', label: 'Demandeur' },
    { key: 'statut', label: 'Statut', render: (b) => S.badge(...STAT[b.statut]) },
    ...(extra || []),
  ], arr, { onRow: editer, empty: 'Aucune réservation.' });
  function mes(v) {
    const now = new Date().toISOString();
    const arr = db.list('reservations').filter((b) => S.norm(b.demandeur) === S.norm(S.me())).sort((a, b) => (a.debut < b.debut ? -1 : 1));
    S.add(v, S.bar('Mes réservations', S.btn('Réserver', () => editer(), '', 'fr-icon-add-line')),
      S.settings().agent ? null : S.alert(null, 'Indiquez votre nom dans Paramètres pour retrouver vos réservations.', 'info'),
      h('h2', { class: 'fr-h5' }, 'À venir'), tableResa(arr.filter((b) => b.fin >= now && b.statut !== 'annulee'), [{ key: 'a', label: '', render: (b) => S.iconBtn('Annuler', 'fr-icon-close-line', () => statut(b, 'annulee')) }]),
      h('h2', { class: 'fr-h5' }, 'Passées ou annulées'), tableResa(arr.filter((b) => b.fin < now || b.statut === 'annulee').reverse().slice(0, 50)));
  }
  function validation(v) {
    const arr = db.list('reservations').filter((b) => b.statut === 'demandee').sort((a, b) => (a.debut < b.debut ? -1 : 1));
    S.add(v, h('h1', { class: 'fr-h3' }, 'Demandes à valider'), h('p', {}, 'Ressources soumises à validation (paramétrable dans Ressources).'),
      tableResa(arr, [{ key: 'a', label: 'Décision', render: (b) => h('div', { class: 's-nowrap' }, S.btn('Valider', () => statut(b, 'confirmee'), 'fr-btn--sm'), ' ', S.btn('Refuser', () => statut(b, 'refusee'), 'fr-btn--sm fr-btn--secondary')) }, { key: 'conf', label: 'Conflit', render: (b) => (conflits(b.ressourceId, b.debut, b.fin, b.id).length ? S.badge('Conflit', 'error') : '') }]));
  }

  /* ---------- Ressources ---------- */
  function ressources(v) {
    const fields = [
      { name: 'nom', label: 'Nom', required: true }, { name: 'type', label: 'Type', type: 'select', required: true, options: TYPES },
      { name: 'site', label: 'Site / bâtiment' }, { name: 'localisation', label: 'Étage, n° de bureau…' },
      { name: 'capacite', label: 'Capacité (places)', type: 'number', min: 0 }, { name: 'couleur', label: 'Couleur', type: 'color', default: '#000091' },
      { name: 'equipements', label: 'Équipements', type: 'multi', options: EQUIP },
      { name: 'validation', label: 'Réservation soumise à validation', type: 'checkbox' }, { name: 'actif', label: 'Réservable', type: 'checkbox', default: true },
      { name: 'gestionnaire', label: 'Gestionnaire' }, { name: 'description', label: 'Description, consignes', type: 'textarea' },
    ];
    const edit = async (r = {}) => { const x = await S.formModal(r.id ? 'Modifier la ressource' : 'Nouvelle ressource', fields, r, { taille: 'wide', extraActions: r.id ? [{ label: 'Supprimer', onClick: async () => { db.remove('ressources', r.id); S.refresh(); } }] : [] }); if (x) { db.save('ressources', x); S.refresh(); } };
    const week = S.startOfWeek(new Date()), wend = S.addDays(week, 5);
    S.add(v, S.bar('Ressources', S.btn('Ajouter', () => edit(), '', 'fr-icon-add-line')),
      S.table([
        { key: 'nom', label: 'Nom', render: (r) => h('span', {}, h('span', { class: 's-dot', style: { background: r.couleur } }), h('strong', {}, r.nom), r.actif === false ? ' (inactive)' : '') },
        { key: 'type', label: 'Type' }, { key: 'site', label: 'Site' }, { key: 'capacite', label: 'Places', class: 'num' },
        { key: 'equipements', label: 'Équipements', render: (r) => (r.equipements || []).join(', ') },
        { key: 'validation', label: 'Validation', render: (r) => (r.validation ? 'Oui' : 'Non') },
        { key: 'taux', label: 'Occupation semaine', class: 'num', render: (r) => { const mins = actives().filter((b) => b.ressourceId === r.id && overlap(b.debut, b.fin, week, wend)).reduce((s, b) => s + (Math.min(new Date(b.fin), wend) - Math.max(new Date(b.debut), week)) / 60000, 0); return Math.round((mins / (5 * 10 * 60)) * 100) + ' %'; } },
        { key: 'porte', label: 'Affichage', render: (r) => h('a', { href: '#/porte/' + r.id, class: 'fr-link fr-link--sm', target: '_blank' }, 'Écran de porte') },
      ], db.list('ressources'), { onRow: edit }));
  }

  /* ---------- Écran de porte ---------- */
  function porte(v, id) {
    const r = db.get('ressources', id);
    if (!r) return S.add(v, S.alert('Ressource introuvable', '', 'error'));
    const draw = () => {
      db.reload();
      const now = new Date();
      const today = actives().filter((b) => b.ressourceId === id && S.sameDay(b.debut, now)).sort((a, b) => (a.debut < b.debut ? -1 : 1));
      const cur = today.find((b) => new Date(b.debut) <= now && new Date(b.fin) > now);
      const next = today.filter((b) => new Date(b.debut) > now);
      S.add(S.clear(v), h('div', { class: 'rs-door', style: { background: cur ? '#ce0500' : '#18753c' } },
        h('p', { class: 'big' }, S.fmtLong(now) + ' — ' + S.hm(now)),
        h('h1', {}, r.nom),
        h('p', { class: 'big' }, cur ? `OCCUPÉE jusqu’à ${S.hm(cur.fin)} — ${cur.titre}` : next[0] ? `LIBRE jusqu’à ${S.hm(next[0].debut)}` : 'LIBRE toute la journée'),
        next.length ? h('div', { class: 'fr-mt-4w' }, h('p', { class: 'fr-text--lead', style: 'color:#fff' }, 'Prochaines réunions :'), h('ul', {}, next.slice(0, 5).map((b) => h('li', { class: 'fr-text--lead', style: 'color:#fff' }, `${S.hm(b.debut)}–${S.hm(b.fin)} · ${b.titre}`)))) : null));
    };
    draw();
    const t = setInterval(() => { if (!location.hash.startsWith('#/porte')) return clearInterval(t); draw(); }, 30000);
  }
})();
