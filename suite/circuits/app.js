/* Circuits de travail — gestion de demandes suivant des circuits d'étapes (validation, action, information) */
(function () {
  'use strict';
  const h = S.h;
  const db = S.db('circuits', ['modeles', 'demandes', 'agents']);
  const PRIO = { basse: ['Basse', ''], normale: ['Normale', 'info'], haute: ['Haute', 'warning'], urgente: ['Urgente', 'error'] };
  const STATUTS = { 'en cours': ['En cours', 'info'], 'terminée': ['Terminée', 'success'], 'refusée': ['Refusée', 'error'], 'abandonnée': ['Abandonnée', ''], brouillon: ['Brouillon', 'new'] };
  const TYPES = { validation: 'Validation (valider / refuser)', action: 'Action à réaliser', information: 'Pour information' };

  /* ---------- Données de démarrage ---------- */
  if (!S.load('circuits:init')) {
    S.save('circuits:init', 1);
    if (!db.list('agents').length) [['Secrétariat', 'SG', 'Secrétariat'], ['Chef de service', 'SRAL', 'Chef de service'], ['Directeur adjoint', 'Direction', 'Direction'], ['Directeur', 'Direction', 'Direction'], ['Gestionnaire RH', 'SG', 'RH'], ['Gestionnaire budgétaire', 'SG', 'Budget']].forEach(([nom, service, roles]) => db.save('agents', { nom, service, roles, email: '' }, true));
    const et = (nom, type, responsable, delaiJours, consigne = '') => ({ id: S.uid('s'), nom, type, responsable, delaiJours, consigne });
    [
      { nom: 'Courrier sortant à la signature', couleur: '#000091', description: 'Rédaction, visa du chef de service, signature de la direction, envoi.', etapes: [et('Rédaction', 'action', 'Secrétariat', 3, 'Rédiger le projet et joindre le fichier.'), et('Visa chef de service', 'validation', 'Chef de service', 2), et('Signature direction', 'validation', 'Directeur', 3), et('Envoi et archivage', 'action', 'Secrétariat', 1, 'Numéroter, envoyer, classer.')], champs: [{ name: 'destinataire', label: 'Destinataire', type: 'text' }, { name: 'refCourrier', label: 'Réf. courrier arrivée', type: 'text' }] },
      { nom: 'Demande d’achat', couleur: '#18753c', description: 'Expression du besoin, validation budgétaire, engagement, service fait.', etapes: [et('Expression du besoin', 'action', 'Demandeur', 2), et('Validation chef de service', 'validation', 'Chef de service', 3), et('Contrôle budgétaire (Chorus)', 'validation', 'Gestionnaire budgétaire', 5, 'Vérifier les crédits et créer l’engagement juridique.'), et('Réception / service fait', 'action', 'Demandeur', 30), et('Information de la direction', 'information', 'Directeur adjoint', 5)], champs: [{ name: 'montant', label: 'Montant TTC (€)', type: 'number' }, { name: 'fournisseur', label: 'Fournisseur', type: 'text' }, { name: 'imputation', label: 'Imputation (programme/activité)', type: 'text' }] },
      { nom: 'Ordre de mission', couleur: '#a558a0', description: 'Déplacement d’un agent : validation hiérarchique et RH.', etapes: [et('Demande', 'action', 'Demandeur', 1), et('Avis du chef de service', 'validation', 'Chef de service', 2), et('Validation RH / frais', 'validation', 'Gestionnaire RH', 3)], champs: [{ name: 'lieu', label: 'Lieu de mission', type: 'text' }, { name: 'dateDepart', label: 'Départ', type: 'date' }, { name: 'dateRetour', label: 'Retour', type: 'date' }, { name: 'transport', label: 'Moyen de transport', type: 'text' }] },
      { nom: 'Instruction d’un dossier d’aide', couleur: '#c3992a', description: 'Réception, complétude, instruction, comité, décision, paiement.', etapes: [et('Réception et accusé', 'action', 'Secrétariat', 5), et('Contrôle de complétude', 'validation', 'Chef de service', 15, 'En cas de pièce manquante : refuser avec motif = demande de complément.'), et('Instruction technique', 'action', 'Chef de service', 30), et('Avis du comité', 'validation', 'Directeur adjoint', 20), et('Décision attributive', 'validation', 'Directeur', 10), et('Mise en paiement', 'action', 'Gestionnaire budgétaire', 15)], champs: [{ name: 'beneficiaire', label: 'Bénéficiaire', type: 'text' }, { name: 'siret', label: 'SIRET / PACAGE', type: 'text' }, { name: 'montantDemande', label: 'Montant demandé (€)', type: 'number' }, { name: 'dispositif', label: 'Dispositif', type: 'text' }] },
    ].forEach((m) => db.save('modeles', m, true));
  }

  /* ---------- Fonctions métier ---------- */
  const modele = (d) => db.get('modeles', d.modeleId) || { nom: 'Demande libre', couleur: '#666', etapes: [{ id: 'x', nom: 'Traitement', type: 'action', responsable: d.demandeur || S.me(), delaiJours: 7 }], champs: [] };
  const etapeCour = (d) => modele(d).etapes[d.etape];
  const moi = () => { const a = db.list('agents').find((x) => S.norm(x.nom) === S.norm(S.me())); return [S.me(), ...(a ? String(a.roles || '').split(',').map((r) => r.trim()) : [])].map(S.norm); };
  const estAMoi = (d) => d.statut === 'en cours' && moi().includes(S.norm(d.assigne));
  const enRetard = (d) => d.statut === 'en cours' && ((d.echeanceEtape && d.echeanceEtape < S.isoDate(new Date())) || (d.echeance && d.echeance < S.isoDate(new Date())));
  const numero = () => { const y = new Date().getFullYear(); const n = db.list('demandes').filter((d) => String(d.numero || '').startsWith('D' + y)).length + 1; return `D${y}-${String(n).padStart(4, '0')}`; };
  const histo = (d, action, commentaire = '') => { d.historique = d.historique || []; d.historique.push({ date: new Date().toISOString(), qui: S.me(), action, commentaire, etape: etapeCour(d)?.nom }); };
  const entrerEtape = (d, i) => {
    const m = modele(d);
    d.etape = i;
    const e = m.etapes[i];
    if (!e) { d.statut = 'terminée'; d.termineeLe = new Date().toISOString(); d.assigne = ''; d.echeanceEtape = ''; return; }
    d.assigne = e.responsable === 'Demandeur' ? d.demandeur : e.responsable;
    d.echeanceEtape = e.delaiJours ? S.isoDate(S.addWorkDays(new Date(), Number(e.delaiJours))) : '';
    d.entreeEtapeLe = new Date().toISOString();
  };
  const normalise = (d) => { if (!d.numero) d.numero = numero(); if (!d.historique) d.historique = []; if (d.etape == null) d.etape = 0; if (!d.assigne && d.statut === 'en cours') entrerEtape(d, d.etape); return d; };
  db.list('demandes').forEach((d) => { if (!d.numero || (!d.assigne && d.statut === 'en cours')) db.save('demandes', normalise(d), true); });

  const agir = async (d, action) => {
    const e = etapeCour(d);
    let com = '';
    if (action === 'refuser' || action === 'renvoyer' || action === 'abandonner') {
      com = await S.prompt(action === 'refuser' ? 'Motif du refus' : action === 'renvoyer' ? 'Motif du renvoi' : 'Motif de l’abandon', '', { titre: 'Commentaire' });
      if (com === null) return;
    }
    if (action === 'valider' || action === 'fait' || action === 'lu') { histo(d, { valider: 'Validé', fait: 'Réalisé', lu: 'Pris connaissance' }[action], com); entrerEtape(d, d.etape + 1); if (d.statut === 'terminée') histo(d, 'Circuit terminé'); }
    else if (action === 'refuser') { histo(d, 'Refusé', com); d.statut = 'refusée'; d.assigne = ''; }
    else if (action === 'renvoyer') { histo(d, 'Renvoyé à l’étape précédente', com); entrerEtape(d, Math.max(0, d.etape - 1)); }
    else if (action === 'abandonner') { histo(d, 'Abandonné', com); d.statut = 'abandonnée'; d.assigne = ''; }
    else if (action === 'rouvrir') { d.statut = 'en cours'; entrerEtape(d, Math.min(d.etape, modele(d).etapes.length - 1)); histo(d, 'Rouvert'); }
    db.save('demandes', d);
    S.toast('Demande ' + d.numero + ' mise à jour', 'success');
    S.refresh();
    void e;
  };

  /* ---------- Gabarit ---------- */
  S.init({
    titre: 'Circuits de travail', sousTitre: 'Demandes, validations, délais', db,
    grist: { modeles: 'Circuits_modeles', demandes: 'Circuits_demandes', agents: 'Circuits_agents' },
    nav: [{ id: 'tableau', label: 'Tableau de bord' }, { id: 'demandes', label: 'Demandes' }, { id: 'kanban', label: 'Tableau kanban' }, { id: 'modeles', label: 'Circuits' }, { id: 'agents', label: 'Agents & rôles' }],
    render(route, params, v) {
      S.clear(v);
      ({ tableau, demandes, kanban, modeles: modelesV, modele: modeleEdit, demande: demandeV, agents }[route] || tableau)(v, ...params);
    },
  });

  const statutBadge = (d) => S.badge(...STATUTS[d.statut] || [d.statut]);
  const prioBadge = (d) => (d.priorite && d.priorite !== 'normale' ? S.badge(...PRIO[d.priorite]) : null);
  const etapesBar = (d) => { const m = modele(d); return h('div', { class: 's-steps' }, m.etapes.map((e, i) => h('span', { class: 's-step ' + (d.statut === 'terminée' || i < d.etape ? 'done' : i === d.etape && d.statut === 'en cours' ? 'cur' : ''), title: e.responsable }, `${i + 1}. ${e.nom}`))); };

  /* ---------- Tableau de bord ---------- */
  function tableau(v) {
    const all = db.list('demandes');
    const cours = all.filter((d) => d.statut === 'en cours');
    const amoi = cours.filter(estAMoi);
    const retard = cours.filter(enRetard);
    const mois = S.isoDate(new Date()).slice(0, 7);
    const term = all.filter((d) => d.statut === 'terminée' && (d.termineeLe || '').startsWith(mois));
    const durees = all.filter((d) => d.statut === 'terminée' && d.termineeLe).map((d) => S.daysBetween(d.creeLe, d.termineeLe));
    S.add(v,
      S.bar('Tableau de bord', S.btn('Nouvelle demande', () => nouvelle(), '', 'fr-icon-add-line')),
      S.settings().agent ? null : S.alert('Qui êtes-vous ?', 'Renseignez votre nom dans Paramètres (et vos rôles dans « Agents & rôles ») pour voir les demandes qui vous sont attribuées.', 'info'),
      S.kpis([
        { v: amoi.length, l: 'à traiter par moi', type: amoi.length ? 'warn' : 'ok', onClick: () => S.go('demandes/moi') },
        { v: cours.length, l: 'demandes en cours', onClick: () => S.go('demandes') },
        { v: retard.length, l: 'en retard', type: retard.length ? 'err' : 'ok', onClick: () => S.go('demandes/retard') },
        { v: term.length, l: 'terminées ce mois-ci' },
        { v: durees.length ? Math.round(durees.reduce((a, b) => a + b, 0) / durees.length) + ' j' : '—', l: 'délai moyen de traitement' },
      ]),
      h('div', { class: 's-cols' },
        h('div', { class: 's-panel' }, h('h2', { class: 'fr-h5' }, 'À traiter par moi'), listeCourte(amoi, 'Rien à traiter. 🎉')),
        h('div', { class: 's-panel' }, h('h2', { class: 'fr-h5' }, 'En retard'), listeCourte(retard, 'Aucune demande en retard.'))),
      h('div', { class: 's-panel' }, h('h2', { class: 'fr-h5' }, 'Charge par circuit et par étape'),
        db.list('modeles').map((m) => {
          const ds = cours.filter((d) => d.modeleId === m.id);
          const max = Math.max(1, ...m.etapes.map((_, i) => ds.filter((d) => d.etape === i).length));
          return h('div', { class: 'fr-mb-2w' }, h('h3', { class: 'fr-h6 fr-mb-1w' }, h('span', { class: 's-dot', style: { background: m.couleur } }), m.nom, ` (${ds.length})`),
            m.etapes.map((e, i) => { const n = ds.filter((d) => d.etape === i).length; return h('div', { style: 'display:grid;grid-template-columns:14rem 1fr 2rem;gap:.5rem;align-items:center;font-size:.8125rem' }, h('span', {}, e.nom), h('div', { style: { height: '.75rem', background: 'var(--background-contrast-grey)' } }, h('div', { style: { width: (n / max) * 100 + '%', height: '100%', background: m.couleur } })), h('span', { class: 'num' }, n)); }));
        })));
  }
  const listeCourte = (arr, vide) => (arr.length ? h('ul', { class: 'fr-raw-list' }, arr.slice(0, 12).map((d) => h('li', { class: 'fr-mb-1w' }, h('a', { href: '#/demande/' + d.id, class: 'fr-link' }, d.numero + ' — ' + d.titre), ' ', prioBadge(d), h('div', { class: 's-small s-mention' }, (etapeCour(d)?.nom || '') + (d.echeanceEtape ? ' · échéance ' + S.fmtDate(d.echeanceEtape) : ''))))) : h('p', { class: 's-mention' }, vide));

  /* ---------- Liste ---------- */
  function demandes(v, preset) {
    const st = S.load('circuits:filtres', { q: '', modele: '', statut: 'en cours', vue: '' });
    if (preset) { st.vue = preset; st.statut = 'en cours'; }
    const zone = h('div');
    const draw = () => {
      S.save('circuits:filtres', st);
      let arr = db.list('demandes').slice();
      if (st.modele) arr = arr.filter((d) => d.modeleId === st.modele);
      if (st.statut) arr = arr.filter((d) => d.statut === st.statut);
      if (st.vue === 'moi') arr = arr.filter(estAMoi);
      if (st.vue === 'retard') arr = arr.filter(enRetard);
      if (st.vue === 'mes') arr = arr.filter((d) => S.norm(d.demandeur) === S.norm(S.me()));
      if (st.q) arr = arr.filter((d) => S.norm([d.numero, d.titre, d.description, d.demandeur, d.assigne, JSON.stringify(d.donnees || {})].join(' ')).includes(S.norm(st.q)));
      arr.sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1));
      S.clear(zone).append(h('p', { class: 's-mention' }, `${arr.length} demande(s)`), S.table([
        { key: 'numero', label: 'N°', class: 's-nowrap' },
        { key: 'titre', label: 'Objet', render: (d) => h('div', {}, h('strong', {}, d.titre), ' ', prioBadge(d), h('div', { class: 's-small s-mention' }, modele(d).nom)) },
        { key: 'etape', label: 'Étape', render: (d) => (d.statut === 'en cours' ? `${d.etape + 1}/${modele(d).etapes.length} · ${etapeCour(d)?.nom}` : '—') },
        { key: 'assigne', label: 'Chez', render: (d) => d.assigne || '—' },
        { key: 'echeanceEtape', label: 'Échéance', render: (d) => (d.echeanceEtape ? h('span', { class: enRetard(d) ? 'fr-text-default--error' : '', style: enRetard(d) ? 'color:var(--text-default-error);font-weight:700' : '' }, S.fmtDate(d.echeanceEtape)) : '—') },
        { key: 'statut', label: 'Statut', render: statutBadge },
        { key: 'demandeur', label: 'Demandeur' },
      ], arr, { onRow: (d) => S.go('demande/' + d.id) }));
    };
    S.add(v,
      S.bar('Demandes', S.btn('Exporter CSV', () => S.download('demandes.csv', S.toCSV(db.list('demandes').map((d) => ({ numero: d.numero, titre: d.titre, circuit: modele(d).nom, etape: etapeCour(d)?.nom || '', statut: d.statut, assigne: d.assigne, demandeur: d.demandeur, priorite: d.priorite, echeance: d.echeance, echeanceEtape: d.echeanceEtape, creeLe: d.creeLe, ...(d.donnees || {}) })))), 'fr-btn--secondary', 'fr-icon-download-line'), S.btn('Nouvelle demande', () => nouvelle(), '', 'fr-icon-add-line')),
      h('div', { class: 's-toolbar' },
        S.search('Rechercher', (q) => { st.q = q; draw(); }, st.q),
        S.select('Circuit', [{ value: '', label: 'Tous' }, ...db.list('modeles').map((m) => ({ value: m.id, label: m.nom }))], st.modele, (x) => { st.modele = x; draw(); }),
        S.select('Statut', [{ value: '', label: 'Tous' }, ...Object.entries(STATUTS).map(([k, [l]]) => ({ value: k, label: l }))], st.statut, (x) => { st.statut = x; draw(); }),
        S.select('Vue', [{ value: '', label: 'Toutes' }, { value: 'moi', label: 'À traiter par moi' }, { value: 'mes', label: 'Mes demandes' }, { value: 'retard', label: 'En retard' }], st.vue, (x) => { st.vue = x; draw(); })),
      zone);
    draw();
  }

  /* ---------- Kanban ---------- */
  function kanban(v, mid) {
    const mods = db.list('modeles');
    mid = mid || S.load('circuits:kanban', mods[0]?.id);
    const m = db.get('modeles', mid) || mods[0];
    if (!m) return S.add(v, S.alert('Aucun circuit', 'Créez un circuit d’abord.', 'info'));
    S.save('circuits:kanban', m.id);
    const ds = db.list('demandes').filter((d) => d.modeleId === m.id && (d.statut === 'en cours' || (d.statut === 'terminée' && S.daysBetween(d.termineeLe || d.majLe, new Date()) < 30)));
    const cols = [...m.etapes.map((e, i) => ({ i, nom: e.nom, sub: e.responsable, items: ds.filter((d) => d.statut === 'en cours' && d.etape === i) })), { i: m.etapes.length, nom: 'Terminées (30 j)', sub: '', items: ds.filter((d) => d.statut === 'terminée') }];
    S.add(v,
      S.bar('Tableau kanban', S.select('Circuit', mods.map((x) => ({ value: x.id, label: x.nom })), m.id, (x) => S.go('kanban/' + x)), S.btn('Nouvelle demande', () => nouvelle(m.id), '', 'fr-icon-add-line')),
      h('p', { class: 's-mention s-small' }, 'Glissez une carte vers l’étape suivante pour valider, vers une étape antérieure pour renvoyer.'),
      h('div', { class: 's-kanban' }, cols.map((c) => {
        const col = h('div', { class: 's-kcol', ondragover: (e) => { e.preventDefault(); col.classList.add('s-drop'); }, ondragleave: () => col.classList.remove('s-drop'),
          ondrop: async (e) => {
            col.classList.remove('s-drop');
            const d = db.get('demandes', e.dataTransfer.getData('text/plain')); if (!d || d.etape === c.i) return;
            if (d.statut === 'terminée' && c.i < m.etapes.length) { d.statut = 'en cours'; histo(d, 'Rouvert'); }
            const avance = c.i > d.etape;
            if (!(await S.confirm(`${avance ? 'Faire avancer' : 'Renvoyer'} la demande ${d.numero} vers « ${c.nom} » ?`))) return;
            histo(d, avance ? `Avancé de « ${etapeCour(d)?.nom} » à « ${c.nom} »` : `Renvoyé à « ${c.nom} »`);
            entrerEtape(d, c.i); if (d.statut === 'terminée') histo(d, 'Circuit terminé');
            db.save('demandes', d); S.refresh();
          } },
        h('h3', {}, h('span', {}, c.nom, c.sub ? h('div', { class: 's-small s-mention', style: 'font-weight:400' }, c.sub) : null), S.badge(String(c.items.length))),
        h('div', { class: 's-kcards' }, c.items.map((d) => h('div', { class: 's-kcard' + (enRetard(d) ? ' late' : ''), draggable: 'true', style: { borderLeftColor: enRetard(d) ? '' : m.couleur }, ondragstart: (e) => e.dataTransfer.setData('text/plain', d.id), onclick: () => S.go('demande/' + d.id) },
          h('strong', {}, d.titre), h('span', { class: 's-mention s-small' }, d.numero + (d.assigne ? ' · ' + d.assigne : '')), h('div', {}, prioBadge(d), d.echeanceEtape ? h('span', { class: 's-small' }, ' ⏱ ' + S.fmtDate(d.echeanceEtape)) : null)))));
        return col;
      })));
  }

  /* ---------- Création / édition ---------- */
  async function nouvelle(modeleId, base = {}) {
    const mods = db.list('modeles');
    let mid = modeleId;
    if (!mid) {
      const v = await S.formModal('Nouvelle demande', [{ name: 'modeleId', label: 'Circuit', type: 'select', required: true, options: [...mods.map((m) => ({ value: m.id, label: m.nom })), { value: 'libre', label: 'Demande libre (sans circuit)' }] }], {}, { okLabel: 'Continuer' });
      if (!v) return; mid = v.modeleId === 'libre' ? '' : v.modeleId;
    }
    const m = db.get('modeles', mid);
    const fields = [
      { name: 'titre', label: 'Objet', required: true, full: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'demandeur', label: 'Demandeur', required: true, default: S.me(), list: 'agents-list' },
      { name: 'priorite', label: 'Priorité', type: 'select', required: true, options: Object.entries(PRIO).map(([k, [l]]) => ({ value: k, label: l })), default: 'normale' },
      { name: 'echeance', label: 'Échéance globale', type: 'date' },
      { name: 'etiquettes', label: 'Étiquettes (séparées par des virgules)' },
      ...(m?.champs?.length ? [{ type: 'section', label: 'Informations propres au circuit « ' + m.nom + ' »' }, ...m.champs.map((c) => ({ ...c, name: 'd_' + c.name }))] : []),
    ];
    const vals = Object.assign({}, base, Object.fromEntries(Object.entries(base.donnees || {}).map(([k, x]) => ['d_' + k, x])));
    const v = await S.formModal((base.id ? 'Modifier ' : 'Nouvelle demande — ') + (m?.nom || 'demande libre'), fields, vals, { taille: 'wide' });
    if (!v) return;
    const d = base.id ? base : { modeleId: mid || '', statut: 'en cours', etape: 0, historique: [], pieces: [] };
    Object.assign(d, { titre: v.titre, description: v.description, demandeur: v.demandeur, priorite: v.priorite, echeance: v.echeance, etiquettes: v.etiquettes });
    d.donnees = Object.assign({}, d.donnees || {}, Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith('d_')).map(([k, x]) => [k.slice(2), x])));
    if (!base.id) { d.numero = numero(); entrerEtape(d, 0); histo(d, 'Création'); } else histo(d, 'Modification');
    db.save('demandes', d);
    S.go('demande/' + d.id);
  }
  // Liste d'agents pour l'autocomplétion
  document.body.append(h('datalist', { id: 'agents-list' }, db.list('agents').map((a) => h('option', { value: a.nom }))));

  /* ---------- Fiche demande ---------- */
  function demandeV(v, id) {
    const d = db.get('demandes', id);
    if (!d) return S.add(v, S.alert('Demande introuvable', '', 'error'));
    const m = modele(d), e = etapeCour(d);
    const actions = [];
    if (d.statut === 'en cours' && e) {
      if (e.type === 'validation') actions.push(S.btn('Valider', () => agir(d, 'valider'), '', 'fr-icon-check-line'), S.btn('Refuser', () => agir(d, 'refuser'), 'fr-btn--secondary', 'fr-icon-close-line'));
      else if (e.type === 'information') actions.push(S.btn('Pris connaissance', () => agir(d, 'lu'), '', 'fr-icon-eye-line'));
      else actions.push(S.btn('Marquer comme réalisé', () => agir(d, 'fait'), '', 'fr-icon-check-line'));
      if (d.etape > 0) actions.push(S.btn('Renvoyer', () => agir(d, 'renvoyer'), 'fr-btn--secondary', 'fr-icon-arrow-go-back-line'));
      actions.push(S.btn('Réattribuer', async () => { const n = await S.prompt('Nouvelle personne ou rôle en charge', d.assigne); if (n) { histo(d, 'Réattribué à ' + n); d.assigne = n; db.save('demandes', d); S.refresh(); } }, 'fr-btn--tertiary', 'fr-icon-user-line'));
      actions.push(S.btn('Abandonner', () => agir(d, 'abandonner'), 'fr-btn--tertiary', 'fr-icon-delete-line'));
    } else actions.push(S.btn('Rouvrir', () => agir(d, 'rouvrir'), 'fr-btn--secondary', 'fr-icon-refresh-line'));
    const com = h('textarea', { class: 'fr-input', rows: 2, placeholder: 'Ajouter un commentaire…' });
    const pieces = h('div');
    const drawPieces = () => S.clear(pieces).append((d.pieces || []).length ? h('ul', {}, d.pieces.map((p) => h('li', {}, h('button', { class: 'fr-link', onclick: () => S.files.open(p.fid, p.nom) }, p.nom), h('span', { class: 's-mention s-small' }, ` (${Math.round(p.taille / 1024)} Ko, ${S.fmtDate(p.date)})`), ' ', S.iconBtn('Retirer', 'fr-icon-delete-line', async () => { await S.files.del(p.fid); d.pieces = d.pieces.filter((x) => x !== p); histo(d, 'Pièce retirée : ' + p.nom); db.save('demandes', d); drawPieces(); })))) : h('p', { class: 's-mention' }, 'Aucune pièce jointe.'));
    drawPieces();
    S.add(v,
      h('nav', { class: 'fr-breadcrumb s-noprint', 'aria-label': 'vous êtes ici :' }, h('ol', { class: 'fr-breadcrumb__list' }, h('li', {}, h('a', { class: 'fr-breadcrumb__link', href: '#/demandes' }, 'Demandes')), h('li', {}, h('a', { class: 'fr-breadcrumb__link', 'aria-current': 'page' }, d.numero)))),
      h('div', { class: 's-bar' }, h('div', {}, h('p', { class: 's-mention fr-mb-0' }, m.nom + ' · ' + d.numero), h('h1', { class: 'fr-h3 fr-mb-1w' }, d.titre), h('div', {}, statutBadge(d), ' ', prioBadge(d), ' ', (d.etiquettes ? String(d.etiquettes).split(',').map((t) => S.tag(t.trim())) : []))),
        h('div', { class: 's-bar__actions s-noprint' }, S.btn('Modifier', () => nouvelle(d.modeleId, d), 'fr-btn--tertiary', 'fr-icon-edit-line'), S.btn('Imprimer', () => print(), 'fr-btn--tertiary', 'fr-icon-printer-line'))),
      etapesBar(d),
      d.statut === 'en cours' && e ? h('div', { class: 'fr-callout fr-mt-2w ' + (enRetard(d) ? 'fr-callout--pink-tuile' : '') },
        h('h2', { class: 'fr-callout__title fr-h6' }, `Étape ${d.etape + 1} : ${e.nom}`),
        h('p', { class: 'fr-callout__text fr-text--sm' }, `${TYPES[e.type]} — en charge : `, h('strong', {}, d.assigne || '—'), d.echeanceEtape ? ` — échéance ${S.fmtDate(d.echeanceEtape)}` : '', enRetard(d) ? ' (en retard)' : ''),
        e.consigne ? h('p', { class: 'fr-text--sm' }, '📌 ' + e.consigne) : null,
        h('div', { class: 'fr-btns-group fr-btns-group--inline-sm fr-btns-group--icon-left s-noprint' }, actions)) : h('div', { class: 'fr-btns-group fr-btns-group--inline-sm fr-btns-group--icon-left fr-mt-2w s-noprint' }, actions),
      h('div', { class: 's-cols fr-mt-3w' },
        h('div', {},
          h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, 'Informations'),
            h('dl', {}, [['Demandeur', d.demandeur], ['Créée le', S.fmtDT(d.creeLe)], ['Échéance globale', S.fmtDate(d.echeance)], ...(m.champs || []).map((c) => [c.label, c.type === 'date' ? S.fmtDate(d.donnees?.[c.name]) : d.donnees?.[c.name]]), ...Object.entries(d.donnees || {}).filter(([k]) => !(m.champs || []).some((c) => c.name === k)).map(([k, x]) => [k, x])].filter(([, x]) => x !== '' && x != null).map(([k, x]) => h('div', { class: 'fr-mb-1w' }, h('dt', { class: 's-small s-mention' }, k), h('dd', { style: 'margin:0' }, String(x))))),
            d.description ? h('p', { style: 'white-space:pre-wrap' }, d.description) : null),
          h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, 'Pièces jointes'), pieces,
            S.btn('Joindre un fichier', async () => { const fs = await S.pickFile('*', true); for (const f of fs || []) { const fid = await S.files.put(f); d.pieces = d.pieces || []; d.pieces.push({ fid, nom: f.name, taille: f.size, date: new Date().toISOString() }); histo(d, 'Pièce jointe : ' + f.name); } db.save('demandes', d); drawPieces(); }, 'fr-btn--secondary fr-btn--sm s-noprint', 'fr-icon-attachment-line'),
            h('p', { class: 's-small s-mention fr-mt-1w' }, 'Les fichiers restent dans ce navigateur (non inclus dans l’export JSON).'))),
        h('div', { class: 's-panel' }, h('h2', { class: 'fr-h6' }, 'Historique et commentaires'),
          h('div', { class: 's-noprint fr-mb-2w' }, com, S.btn('Commenter', () => { if (!com.value.trim()) return; histo(d, 'Commentaire', com.value.trim()); db.save('demandes', d); S.refresh(); }, 'fr-btn--sm fr-mt-1w', 'fr-icon-chat-3-line')),
          h('ol', { class: 's-timeline' }, (d.historique || []).slice().reverse().map((x) => h('li', { class: /Refus|Abandon/.test(x.action) ? 'hi' : '' }, h('time', {}, S.fmtDT(x.date) + ' — ' + x.qui + (x.etape ? ' — ' + x.etape : '')), h('strong', {}, x.action), x.commentaire ? h('div', { style: 'white-space:pre-wrap' }, x.commentaire) : null))))),
      h('div', { class: 's-noprint' }, S.btn('Supprimer la demande', async () => { if (await S.confirm('Supprimer définitivement cette demande ?', { ok: 'Supprimer' })) { for (const p of d.pieces || []) await S.files.del(p.fid).catch(() => {}); db.remove('demandes', d.id); S.go('demandes'); } }, 'fr-btn--tertiary-no-outline fr-btn--sm', 'fr-icon-delete-line')));
  }

  /* ---------- Modèles de circuits ---------- */
  function modelesV(v) {
    S.add(v, S.bar('Circuits', S.btn('Nouveau circuit', () => { const m = db.save('modeles', { nom: 'Nouveau circuit', couleur: '#000091', etapes: [{ id: S.uid('s'), nom: 'Traitement', type: 'action', responsable: 'Demandeur', delaiJours: 5 }], champs: [] }); S.go('modele/' + m.id); }, '', 'fr-icon-add-line')),
      h('div', { class: 's-grid' }, db.list('modeles').map((m) => h('div', { class: 'fr-card fr-enlarge-link' }, h('div', { class: 'fr-card__body' }, h('div', { class: 'fr-card__content' },
        h('h2', { class: 'fr-card__title' }, h('a', { href: '#/modele/' + m.id }, m.nom)),
        h('p', { class: 'fr-card__desc' }, m.description || ''),
        h('div', { class: 'fr-card__start' }, h('p', { class: 'fr-card__detail' }, h('span', { class: 's-dot', style: { background: m.couleur } }), `${m.etapes.length} étape(s) · ${db.list('demandes').filter((d) => d.modeleId === m.id && d.statut === 'en cours').length} en cours`)),
        h('div', { class: 'fr-card__end' }, h('p', { class: 'fr-card__detail' }, m.etapes.map((e) => e.nom).join(' → ')))))))));
  }
  function modeleEdit(v, id) {
    const m = db.get('modeles', id);
    if (!m) return S.add(v, S.alert('Circuit introuvable', '', 'error'));
    const save = () => { db.save('modeles', m, true); };
    const head = S.form([{ name: 'nom', label: 'Nom du circuit', required: true }, { name: 'couleur', label: 'Couleur', type: 'color' }, { name: 'description', label: 'Description', type: 'textarea', rows: 2 }], m);
    head.el.addEventListener('input', () => { Object.assign(m, head.get()); save(); });
    const steps = h('div');
    const drawSteps = () => {
      S.clear(steps);
      m.etapes.forEach((e, i) => {
        const f = S.form([{ name: 'nom', label: 'Nom de l’étape', required: true }, { name: 'type', label: 'Type', type: 'select', required: true, options: Object.entries(TYPES).map(([k, l]) => ({ value: k, label: l })) }, { name: 'responsable', label: 'Responsable (agent, rôle ou « Demandeur »)', list: 'roles-list' }, { name: 'delaiJours', label: 'Délai (jours ouvrés)', type: 'number', min: 0 }, { name: 'consigne', label: 'Consigne', type: 'textarea', rows: 2 }], e);
        f.el.addEventListener('input', () => { Object.assign(e, f.get()); save(); });
        f.el.addEventListener('change', () => { Object.assign(e, f.get()); save(); });
        steps.append(h('div', { class: 's-panel s-panel--alt' }, h('div', { class: 's-bar', style: 'margin-bottom:.5rem' }, h('h3', { class: 'fr-h6' }, `Étape ${i + 1}`),
          h('div', { class: 's-bar__actions' }, S.iconBtn('Monter', 'fr-icon-arrow-up-line', () => { if (i) { [m.etapes[i - 1], m.etapes[i]] = [m.etapes[i], m.etapes[i - 1]]; save(); drawSteps(); } }), S.iconBtn('Descendre', 'fr-icon-arrow-down-line', () => { if (i < m.etapes.length - 1) { [m.etapes[i + 1], m.etapes[i]] = [m.etapes[i], m.etapes[i + 1]]; save(); drawSteps(); } }), S.iconBtn('Supprimer', 'fr-icon-delete-line', () => { if (m.etapes.length > 1) { m.etapes.splice(i, 1); save(); drawSteps(); } }))), f.el));
      });
    };
    drawSteps();
    const champs = h('textarea', { class: 'fr-input', rows: 5, oninput: (e) => { m.champs = e.target.value.split('\n').filter((l) => l.trim()).map((l) => { const [name, label, type] = l.split('|').map((x) => x.trim()); return { name: S.slug(name) || 'champ', label: label || name, type: type || 'text' }; }); save(); } });
    champs.value = (m.champs || []).map((c) => `${c.name}|${c.label}|${c.type}`).join('\n');
    S.add(v,
      h('nav', { class: 'fr-breadcrumb', 'aria-label': 'vous êtes ici :' }, h('ol', { class: 'fr-breadcrumb__list' }, h('li', {}, h('a', { class: 'fr-breadcrumb__link', href: '#/modeles' }, 'Circuits')), h('li', {}, h('a', { class: 'fr-breadcrumb__link', 'aria-current': 'page' }, m.nom)))),
      S.bar('Paramétrage du circuit', S.btn('Supprimer le circuit', async () => { if (db.list('demandes').some((d) => d.modeleId === m.id)) return S.toast('Des demandes utilisent ce circuit', 'warning'); if (await S.confirm('Supprimer ce circuit ?')) { db.remove('modeles', m.id); S.go('modeles'); } }, 'fr-btn--tertiary', 'fr-icon-delete-line'), S.btn('Terminé', () => { db.save('modeles', m); S.go('modeles'); }, '', 'fr-icon-check-line')),
      h('div', { class: 's-panel' }, head.el),
      h('h2', { class: 'fr-h5' }, 'Étapes'), steps, S.btn('Ajouter une étape', () => { m.etapes.push({ id: S.uid('s'), nom: 'Nouvelle étape', type: 'validation', responsable: '', delaiJours: 5 }); save(); drawSteps(); }, 'fr-btn--secondary fr-mb-4w', 'fr-icon-add-line'),
      h('h2', { class: 'fr-h5' }, 'Champs du formulaire de demande'),
      h('div', { class: 'fr-input-group' }, h('label', { class: 'fr-label' }, 'Un champ par ligne : nom|libellé|type', h('span', { class: 'fr-hint-text' }, 'Types : text, number, date, email, tel, textarea')), champs),
      h('datalist', { id: 'roles-list' }, ['Demandeur', ...new Set(db.list('agents').flatMap((a) => [a.nom, ...String(a.roles || '').split(',').map((r) => r.trim())]).values())].filter(Boolean).map((r) => h('option', { value: r }))));
  }

  /* ---------- Agents ---------- */
  function agents(v) {
    const fields = [{ name: 'nom', label: 'Nom', required: true }, { name: 'service', label: 'Service' }, { name: 'roles', label: 'Rôles (séparés par des virgules)', hint: 'Ex. Chef de service, Budget' }, { name: 'email', label: 'Courriel', type: 'email' }, { name: 'tel', label: 'Téléphone', type: 'tel' }, { name: 'suppleant', label: 'Suppléant' }];
    const edit = async (a = {}) => { const r = await S.formModal(a.id ? 'Modifier l’agent' : 'Nouvel agent', fields, a, { extraActions: a.id ? [{ label: 'Supprimer', onClick: () => { db.remove('agents', a.id); S.refresh(); } }] : [] }); if (r) { db.save('agents', r); S.refresh(); } };
    S.add(v, S.bar('Agents & rôles', S.btn('Ajouter', () => edit(), '', 'fr-icon-add-line')),
      h('p', {}, 'Les étapes des circuits sont confiées à un agent ou à un rôle. Un agent voit dans « À traiter par moi » les demandes attribuées à son nom ou à l’un de ses rôles.'),
      S.table([{ key: 'nom', label: 'Nom' }, { key: 'service', label: 'Service' }, { key: 'roles', label: 'Rôles' }, { key: 'email', label: 'Courriel' }, { key: 'suppleant', label: 'Suppléant' }, { key: 'charge', label: 'Demandes en charge', class: 'num', render: (a) => db.list('demandes').filter((d) => d.statut === 'en cours' && [a.nom, ...String(a.roles || '').split(',').map((r) => r.trim())].map(S.norm).includes(S.norm(d.assigne))).length }], db.list('agents'), { onRow: edit }));
  }
})();
