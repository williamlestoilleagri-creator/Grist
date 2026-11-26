/* Automatisation — éditeur de scénarios par nœuds et moteur d'exécution (navigateur) */
(function () {
  'use strict';
  const h = S.h;
  const A = window.AUTO;
  const N = A.NODES;
  const db = S.db('automatisation', ['scenarios', 'identifiants', 'executions', 'etats']);
  const W = 220;
  const nodeH = (def) => Math.max(64, 28 + (def?.outputs?.length || 1) * 18);

  /* ================= Expressions ================= */
  const fnCache = new Map();
  A.evalExpr = (expr, scope) => {
    let f = fnCache.get(expr);
    if (!f) { f = new Function('$json', '$node', '$now', '$index', '$items', '$vars', 'S', `"use strict"; return (${expr});`); fnCache.set(expr, f); }
    return f(scope.$json, scope.$node, scope.$now, scope.$index, scope.$items, scope.$vars, S);
  };
  A.scope = (item, ctx, i = 0, items = []) => ({ $json: item || {}, $node: ctx?.nodeRef || (() => ({})), $now: new Date(), $index: i, $items: items, $vars: ctx?.vars || {} });
  A.resolve = (val, scope) => {
    if (typeof val !== 'string' || !val.includes('{{')) return val;
    const m = val.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
    try {
      if (m) return A.evalExpr(m[1], scope);
      return val.replace(/\{\{([\s\S]+?)\}\}/g, (_, e) => { const v = A.evalExpr(e, scope); return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v; });
    } catch (e) { throw new Error(`Expression invalide « ${val.slice(0, 60)} » : ${e.message}`); }
  };
  A.resolveParams = (params, item, ctx, i = 0, items = []) => {
    const sc = A.scope(item, ctx, i, items); const o = {};
    for (const [k, v] of Object.entries(params || {})) o[k] = A.resolve(v, sc);
    return o;
  };
  const deep = (v, sc) => (typeof v === 'string' ? A.resolve(v, sc) : Array.isArray(v) ? v.map((x) => deep(x, sc)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x, sc)])) : v);
  A.resolveJSON = (tpl, item, ctx) => {
    if (!tpl) return {};
    const sc = A.scope(item, ctx);
    try { return deep(JSON.parse(tpl), sc); } catch (e) {
      const t = A.resolve(tpl, sc);
      if (typeof t === 'object') return t;
      try { return JSON.parse(t); } catch (e2) { throw new Error('JSON invalide après résolution : ' + String(t).slice(0, 120)); }
    }
  };

  /* ================= Identifiants ================= */
  A.credOptions = () => db.list('identifiants').map((c) => ({ value: c.id, label: c.nom }));
  A.credSecret = (id) => (db.get('identifiants', id) || {}).secret || '';
  A.authHeaders = (id) => {
    const c = db.get('identifiants', id); if (!c) return {};
    if (c.type === 'bearer') return { Authorization: 'Bearer ' + c.secret };
    if (c.type === 'header') return { [c.entete || 'X-API-Key']: c.secret };
    if (c.type === 'basic') return { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent((c.utilisateur || '') + ':' + c.secret))) };
    return {};
  };

  /* ================= Moteur ================= */
  const running = new Set();
  const etatDe = (id) => db.get('etats', id) || { id, nodes: {} };
  const trunc = (items) => { const a = (items || []).slice(0, 25); let s = JSON.stringify(a); if (s.length > 40000) s = s.slice(0, 40000); try { return JSON.parse(s); } catch (e) { return [{ apercu: s.slice(0, 2000) + '…' }]; } };

  A.run = async function (sc, { test = false, items = null, mode = 'manuel' } = {}) {
    const trig = sc.nodes.find((n) => N[n.type]?.trigger);
    if (!trig) throw new Error('Le scénario n’a pas de déclencheur');
    if (running.has(sc.id)) throw new Error('Ce scénario est déjà en cours d’exécution');
    running.add(sc.id);
    const etat = etatDe(sc.id);
    const exec = { id: S.uid('x'), scenarioId: sc.id, scenarioNom: sc.nom, debut: new Date().toISOString(), mode, test, statut: 'en cours', etapes: [], journal: [] };
    const outputs = {};
    const ctx = {
      sc, test, exec, vars: {},
      state: (node) => (etat.nodes[node.id] = etat.nodes[node.id] || {}),
      log: (m) => exec.journal.push(`${S.hm(new Date())} ${m}`),
      nodeRef: (name) => { const arr = outputs[name] || []; return Object.assign({}, arr[0] || {}, { $all: arr, $count: arr.length }); },
    };
    const buffers = {};
    const queue = [{ node: trig, items: items || [] }];
    let guard = 0;
    try {
      while (queue.length) {
        if (++guard > 1000) throw new Error('Trop d’étapes (boucle ?)');
        const { node, items: inp } = queue.shift();
        const def = N[node.type];
        if (!def) throw new Error('Type de nœud inconnu : ' + node.type);
        if (node.desactive) { pushOut(node, { main: inp }); continue; }
        let input = inp, inputs = [inp];
        if (def.merge) {
          const need = sc.edges.filter((e) => e.to === node.id).length;
          const b = (buffers[node.id] = buffers[node.id] || []); b.push(inp);
          if (b.length < need) continue;
          inputs = b; input = b.flat();
        }
        const step = { nodeId: node.id, nom: node.nom, type: node.type, debut: Date.now(), entree: trunc(input), nbEntree: input.length };
        let out;
        if (!def.trigger && !input.length) { out = {}; step.ignore = true; }
        else {
          ctx.node = node;
          try {
            if (def.batch) out = await def.batch(input, node, ctx, inputs);
            else {
              const res = [];
              for (let i = 0; i < input.length; i++) {
                const p = A.resolveParams(node.params, input[i], ctx, i, input);
                const r = await def.each(input[i], p, ctx);
                if (r === undefined) res.push(input[i]); else if (Array.isArray(r)) res.push(...r); else if (r !== null) res.push(r);
              }
              out = res;
            }
          } catch (e) {
            step.erreur = e.message || String(e);
            if (node.continuer) out = input.map((x) => Object.assign({}, x, { $erreur: step.erreur }));
            else { step.ms = Date.now() - step.debut; exec.etapes.push(step); throw Object.assign(e, { nodeNom: node.nom }); }
          }
        }
        if (Array.isArray(out)) out = { [(def.outputs || ['main'])[0]]: out };
        out = out || {};
        step.ms = Date.now() - step.debut;
        step.sortie = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, trunc(v)]));
        step.nbSortie = Object.values(out).reduce((s, v) => s + (v?.length || 0), 0);
        exec.etapes.push(step);
        outputs[node.nom] = Object.values(out).flat();
        pushOut(node, out);
      }
      exec.statut = 'succès';
    } catch (e) {
      exec.statut = 'erreur';
      exec.erreur = (e.nodeNom ? `[${e.nodeNom}] ` : '') + (e.message || String(e));
    } finally {
      running.delete(sc.id);
      exec.fin = new Date().toISOString();
      exec.ms = new Date(exec.fin) - new Date(exec.debut);
      if (!test) { etat.dernierPassage = Date.now(); db.save('etats', etat, true); }
      const all = db.list('executions'); all.unshift(exec); db.setAll('executions', all.slice(0, 150));
    }
    return exec;

    function pushOut(node, out) {
      for (const e of sc.edges.filter((x) => x.from === node.id)) {
        const tgt = sc.nodes.find((n) => n.id === e.to);
        if (tgt) queue.push({ node: tgt, items: S.clone(out[e.port || 'main'] || []) });
      }
    }
  };

  /* ================= Planificateur ================= */
  const PLANIF = ['trigger.interval', 'trigger.grist', 'trigger.rss', 'trigger.veille'];
  const tick = async () => {
    for (const sc of db.list('scenarios').filter((s) => s.actif)) {
      const t = sc.nodes.find((n) => N[n.type]?.trigger);
      if (!t || !PLANIF.includes(t.type) || running.has(sc.id)) continue;
      const min = Math.max(1, Number(t.params.minutes) || 60);
      const et = etatDe(sc.id);
      if (et.dernierPassage && Date.now() - et.dernierPassage < min * 60000) continue;
      if (t.params.ouvres) { const d = new Date(); if (!d.getDay() || d.getDay() === 6 || d.getHours() < 8 || d.getHours() >= 19) continue; }
      try {
        const ex = await A.run(sc, { mode: 'planifié' });
        if (ex.statut === 'erreur') { S.toast(`« ${sc.nom} » : ${ex.erreur}`, 'error', 9000); }
        else if (ex.etapes.length > 1 && ex.etapes[0].nbSortie) S.toast(`« ${sc.nom} » exécuté (${ex.etapes[0].nbSortie} élément(s))`, 'success');
      } catch (e) { console.warn(e); }
      if (location.hash.startsWith('#/scenarios') || location.hash === '' || location.hash.startsWith('#/executions')) S.refresh();
    }
  };
  setInterval(tick, 30000);
  setTimeout(tick, 4000);

  /* ================= Modèles de départ ================= */
  const mk = (type, nom, x, y, params = {}) => ({ id: S.uid('n'), type, nom, x, y, params });
  const link = (a, b, port = 'main') => ({ id: S.uid('e'), from: a.id, to: b.id, port });
  A.MODELES = [
    () => { const a = mk('trigger.grist', 'Nouveaux sites', 60, 120, { table: 'Sites', minutes: 5 }), b = mk('geo.geocode', 'Géocoder', 340, 120, { adresse: '{{ $json.Adresse }}', min: 0.5 }), c = mk('logic.if', 'Trouvé ?', 620, 120, { mode: 'simple', champ: 'geocode', op: 'vrai' }), d = mk('grist.update', 'Écrire coordonnées', 900, 60, { table: 'Sites', id: '{{ $json.id }}', champs: '{"Latitude": "{{ $json.lat }}", "Longitude": "{{ $json.lon }}", "Code_INSEE": "{{ $json.codeInsee }}"}' }), e = mk('geo.carte', 'Carte des sites', 1180, 60, { couche: 'Sites Grist', titre: '{{ $json.Nom }}', couleur: '#000091', remplacer: false }), f = mk('chat.toast', 'Adresse introuvable', 900, 200, { message: 'Adresse non géocodée : {{ $json.Adresse }}', type: 'warning' });
      return { nom: 'Géocoder les nouvelles adresses Grist', description: 'Chaque nouvelle ligne de la table Sites est géocodée (IGN), ses coordonnées écrites dans Grist et le point ajouté à la carte.', nodes: [a, b, c, d, e, f], edges: [link(a, b), link(b, c), link(c, d, 'vrai'), link(d, e), link(c, f, 'faux')] }; },
    () => { const a = mk('trigger.rss', 'Flux ministère', 60, 120, { url: 'https://agriculture.gouv.fr/rss.xml', minutes: 60 }), b = mk('logic.filter', 'Concerne la Bretagne', 340, 120, { mode: 'expr', expr: '/bretagne|finist|morbihan|côtes-d|ille-et-vilaine/i.test($json.titre + " " + $json.resume)' }), c = mk('logic.template', 'Composer message', 620, 120, { texte: '📰 {{ $json.titre }}\n{{ $json.lien }}', champ: 'message' }), d = mk('chat.tchap', 'Salon veille Tchap', 900, 120, { serveur: 'https://matrix.agent.agriculture.tchap.gouv.fr', salon: '', message: '{{ $json.message }}' });
      return { nom: 'Veille RSS → salon Tchap', description: 'Relaie dans un salon Tchap les nouveaux articles mentionnant la Bretagne.', nodes: [a, b, c, d], edges: [link(a, b), link(b, c), link(c, d)] }; },
    () => { const a = mk('trigger.interval', 'Chaque matin', 60, 120, { minutes: 1440, ouvres: true }), b = mk('suite.reservations', 'Réservations du jour', 340, 120, { date: '{{ $now.toISOString().slice(0,10) }}', statut: 'confirmee' }), c = mk('logic.filter', 'Avec téléphone', 620, 120, { mode: 'simple', champ: 'telephone', op: "n'est pas vide" }), d = mk('tel.brevo', 'SMS de rappel', 900, 120, { numero: '{{ $json.telephone }}', emetteur: 'DRAAF', message: 'Rappel : {{ $json.ressource }} réservée aujourd’hui de {{ $json.heureDebut }} à {{ $json.heureFin }} ({{ $json.titre }}).' });
      return { nom: 'Rappel SMS des réservations du jour', description: 'Chaque jour ouvré, envoie un SMS de rappel aux personnes ayant réservé une salle ou un véhicule.', nodes: [a, b, c, d], edges: [link(a, b), link(b, c), link(c, d)] }; },
    () => { const a = mk('trigger.form', 'Saisie d’une sollicitation', 60, 140, { titre: 'Nouvelle sollicitation usager', champs: 'nom|Nom de l’usager|text\nemail|Courriel|email\ntitre|Objet|text\nservice|Service concerné|text' }), b = mk('suite.courrier', 'Registre courrier', 340, 140, { objet: '{{ $json.titre }}', correspondant: '{{ $json.nom }}', service: '{{ $json.service }}', canal: 'Courriel' }), c = mk('suite.demande', 'Ouvrir une demande', 620, 140, { titre: '{{ $json.titre }} ({{ $json.courrierNumero }})', description: 'Usager : {{ $json.nom }} — {{ $json.email }}', demandeur: S.me() }), d = mk('logic.date', 'Délai 2 mois', 900, 140, { date: '{{ $now.toISOString() }}', jours: 60, champ: 'delai' }), e = mk('mail.mailto', 'Accusé de réception', 1180, 140, { a: '{{ $json.email }}', objet: 'Accusé de réception — {{ $json.courrierNumero }}', corps: 'Madame, Monsieur,\n\nVotre demande « {{ $json.titre }} » a été enregistrée sous le numéro {{ $json.courrierNumero }} le {{ $now.toLocaleDateString("fr-FR") }}.\nEn l’absence de réponse au {{ $json.delaiFr }}, elle sera réputée rejetée (art. L231-4 du CRPA).\n\n' + S.settings().entite });
      return { nom: 'Sollicitation usager → courrier + demande + AR', description: 'Formulaire : enregistre le courrier, ouvre une demande dans Circuits et prépare l’accusé de réception.', nodes: [a, b, c, d, e], edges: [link(a, b), link(b, c), link(c, d), link(d, e)] }; },
    () => { const a = mk('trigger.manual', 'SIRET à vérifier', 60, 120, { donnees: '{"siret": "13002526500013"}' }), b = mk('contact.entreprise', 'Fiche entreprise', 340, 120, { q: '{{ $json.siret }}', max: 1, fusion: true }), c = mk('geo.cadastre', 'Parcelle du siège', 620, 120, {}), d = mk('suite.controle', 'Planifier un contrôle', 900, 60, { etablissement: '{{ $json.raisonSociale }}', siret: '{{ $json.siret }}', adresse: '{{ $json.adresse }}' }), e = mk('geo.carte', 'Sur la carte', 900, 200, { couche: 'Établissements', titre: '{{ $json.raisonSociale }}', couleur: '#e1000f', remplacer: false });
      return { nom: 'Établissement : fiche, parcelle, contrôle', description: 'À partir d’un SIRET : identité (API Entreprises), parcelle cadastrale, contrôle planifié et point sur la carte.', nodes: [a, b, c, d, e], edges: [link(a, b), link(b, c), link(c, d), link(c, e)] }; },
    () => { const a = mk('trigger.interval', 'Chaque lundi', 60, 120, { minutes: 10080, ouvres: true }), b = mk('suite.veille', 'Favoris de la semaine', 340, 120, { jours: 7, favoris: true }), c = mk('intranet.bulletin', 'Lettre de veille', 620, 120, { titre: 'Lettre de veille hebdomadaire', intro: 'Sélection des articles de la semaine.', champTitre: 'titre', champTexte: 'resume', champLien: 'lien' });
      return { nom: 'Lettre de veille hebdomadaire', description: 'Compile les favoris de la semaine de l’application Veille en une lettre d’information.', nodes: [a, b, c], edges: [link(a, b), link(b, c)] }; },
  ];
  const fromModel = (i) => { const m = A.MODELES[i](); return db.save('scenarios', { nom: m.nom, description: m.description, actif: false, nodes: m.nodes, edges: m.edges, vue: { x: 20, y: 20, z: 1 } }); };
  if (!db.list('scenarios').length && !S.load('automatisation:init')) { S.save('automatisation:init', 1); A.MODELES.forEach((_, i) => fromModel(i)); }

  /* ================= Styles de l'éditeur ================= */
  document.head.append(h('style', {}, `
.wf-canvas{position:absolute;inset:0;overflow:hidden;background-color:var(--background-alt-grey);background-image:radial-gradient(var(--border-default-grey) 1px,transparent 1px);background-size:20px 20px;cursor:grab;touch-action:none}
.wf-canvas.pan{cursor:grabbing}
.wf-world{position:absolute;left:0;top:0;transform-origin:0 0}
.wf-svg{position:absolute;left:0;top:0;overflow:visible;width:1px;height:1px}
.wf-edge{fill:none;stroke:var(--border-plain-grey);stroke-width:2}
.wf-edge.sel{stroke:var(--border-action-high-blue-france);stroke-width:3}
.wf-hit{fill:none;stroke:transparent;stroke-width:14;cursor:pointer}
.wf-elabel{font-size:11px;fill:var(--text-mention-grey)}
.wf-node{position:absolute;width:${W}px;background:var(--background-default-grey);border:1px solid var(--border-default-grey);border-left:6px solid #000091;box-shadow:0 1px 3px rgba(0,0,18,.16);cursor:move;user-select:none}
.wf-node.sel{outline:3px solid var(--border-action-high-blue-france);outline-offset:1px}
.wf-node.off{opacity:.5}
.wf-node .t{font-weight:700;font-size:.875rem;padding:.4rem .6rem 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wf-node .k{font-size:.72rem;color:var(--text-mention-grey);padding:0 .6rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wf-node .st{position:absolute;right:.4rem;bottom:.3rem;font-size:.68rem;font-weight:700;padding:0 .3rem}
.wf-node .st.ok{background:var(--background-contrast-success);color:var(--text-default-success)}
.wf-node .st.err{background:var(--background-contrast-error);color:var(--text-default-error)}
.wf-node .st.skip{background:var(--background-contrast-grey);color:var(--text-mention-grey)}
.wf-port{position:absolute;width:14px;height:14px;border-radius:50%;background:var(--background-default-grey);border:2px solid var(--border-action-high-blue-france);cursor:crosshair}
.wf-port.in{left:-9px}
.wf-port.out{right:-9px}
.wf-port:hover{background:var(--background-action-high-blue-france)}
.wf-plabel{position:absolute;right:10px;font-size:.65rem;color:var(--text-mention-grey);transform:translateY(-50%)}
.wf-trig{position:absolute;left:-1px;top:-1.3rem;font-size:.65rem;background:#18753c;color:#fff;padding:0 .35rem}
.wf-pal-item{display:block;width:100%;text-align:left;border:1px solid var(--border-default-grey);border-left:4px solid;background:var(--background-default-grey);padding:.35rem .5rem;margin-bottom:.35rem;font-size:.8125rem;cursor:grab}
.wf-pal-item:hover{background:var(--background-contrast-grey)}
.wf-pal-item small{display:block;color:var(--text-mention-grey);font-size:.7rem;line-height:1.1}
.wf-top{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;padding:.5rem 1rem;border-bottom:1px solid var(--border-default-grey);background:var(--background-default-grey)}
.wf-top .fr-input{width:22rem;max-width:100%;margin:0}
.wf-zoom{position:absolute;right:1rem;bottom:1rem;display:flex;gap:.25rem;z-index:3;background:var(--background-default-grey);box-shadow:0 1px 4px rgba(0,0,0,.2)}
.wf-chips{display:flex;flex-wrap:wrap;gap:.25rem;margin:.25rem 0 1rem}
.wf-chip{font-size:.7rem;padding:.1rem .4rem;border:1px solid var(--border-action-high-blue-france);color:var(--text-action-high-blue-france);background:var(--background-default-grey);cursor:pointer;font-family:ui-monospace,monospace}
.wf-chip:hover{background:var(--background-action-low-blue-france)}
.s-side--right .s-form textarea{font-family:ui-monospace,Menlo,monospace;font-size:.8rem}
.s-side--right .s-form{grid-template-columns:minmax(0,1fr)}
.wf-help{position:absolute;left:1rem;bottom:1rem;max-width:calc(100% - 10rem);font-size:.75rem;color:var(--text-mention-grey);background:var(--background-default-grey);padding:.25rem .5rem;z-index:3}
`));

  /* ================= Routeur ================= */
  S.init({
    titre: 'Automatisation', sousTitre: 'Scénarios Grist ↔ applications', full: true, db,
    nav: [{ id: 'scenarios', label: 'Scénarios' }, { id: 'executions', label: 'Exécutions' }, { id: 'identifiants', label: 'Identifiants' }, { id: 'aide', label: 'Aide & connecteurs' }],
    render(route, params, view) {
      document.body.classList.toggle('s-fullpage', route === 'editeur');
      S.clear(view);
      if (route === 'editeur') return editor(view, params[0]);
      const c = h('div', { class: 'fr-container fr-py-4w' }); view.append(c);
      if (route === 'executions') return executions(c);
      if (route === 'identifiants') return identifiants(c);
      if (route === 'aide') return aide(c);
      if (route === 'lancer') return lancer(c, params[0], params.slice(1).join('/'));
      return scenarios(c);
    },
  });

  /* ================= Liste des scénarios ================= */
  function scenarios(c) {
    const list = db.list('scenarios');
    const ex = db.list('executions');
    const actifs = list.filter((s) => s.actif).length;
    S.add(c,
      S.bar('Scénarios d’automatisation',
        S.btn('Nouveau scénario', () => { const sc = db.save('scenarios', { nom: 'Nouveau scénario', actif: false, nodes: [mk('trigger.manual', 'Déclenchement', 80, 160)], edges: [], vue: { x: 0, y: 0, z: 1 } }); S.go('editeur/' + sc.id); }, '', 'fr-icon-add-line'),
        S.btn('Depuis un modèle', modelesModal, 'fr-btn--secondary', 'fr-icon-file-add-line'),
        S.btn('Importer', async () => { const f = await S.pickFile('.json'); if (!f) return; const o = JSON.parse(await S.readText(f)); (Array.isArray(o) ? o : [o]).forEach((sc) => { delete sc.id; sc.actif = false; db.save('scenarios', sc); }); S.refresh(); S.toast('Scénario(s) importé(s)', 'success'); }, 'fr-btn--secondary', 'fr-icon-upload-line')),
      S.kpis([{ v: list.length, l: 'scénarios' }, { v: actifs, l: 'actifs (planifiés)', type: actifs ? 'ok' : '' }, { v: ex.filter((e) => S.sameDay(e.debut, new Date())).length, l: 'exécutions aujourd’hui' }, { v: ex.filter((e) => e.statut === 'erreur' && S.sameDay(e.debut, new Date())).length, l: 'erreurs aujourd’hui', type: ex.some((e) => e.statut === 'erreur' && S.sameDay(e.debut, new Date())) ? 'err' : '' }]),
      actifs ? S.alert(null, `Planificateur en marche : ${actifs} scénario(s) actif(s) s’exécutent automatiquement tant que cette page reste ouverte (onglet en arrière-plan accepté).`, 'info') : null,
      S.table([
        { key: 'nom', label: 'Scénario', render: (s) => h('div', {}, h('strong', {}, s.nom), s.description ? h('div', { class: 's-mention s-small' }, s.description) : null) },
        { key: 'trig', label: 'Déclencheur', render: (s) => { const t = s.nodes.find((n) => N[n.type]?.trigger); return t ? N[t.type].label + (t.params.minutes && PLANIF.includes(t.type) ? ` (${t.params.minutes} min)` : '') : '—'; } },
        { key: 'nb', label: 'Étapes', class: 'num', render: (s) => s.nodes.length },
        { key: 'last', label: 'Dernière exécution', render: (s) => { const e = ex.find((x) => x.scenarioId === s.id); return e ? h('span', {}, S.badge(e.statut, e.statut === 'erreur' ? 'error' : 'success'), ' ', S.fmtDT(e.debut)) : '—'; } },
        { key: 'actif', label: 'Actif', render: (s) => { const id = 'act' + s.id; return h('div', { class: 'fr-toggle' }, h('input', { type: 'checkbox', class: 'fr-toggle__input', id, checked: !!s.actif, onchange: (e) => { s.actif = e.target.checked; db.save('scenarios', s); S.toast(s.actif ? 'Scénario activé' : 'Scénario désactivé'); } }), h('label', { class: 'fr-toggle__label', for: id }, h('span', { class: 'fr-sr-only' }, 'Actif'))); } },
        { key: 'act', label: 'Actions', render: (s) => h('div', { class: 's-nowrap' },
          S.iconBtn('Exécuter', 'fr-icon-play-circle-line', async () => { const e = await A.run(s, { mode: 'manuel' }).catch((er) => S.toast(er.message, 'error')); if (e) { showExec(e); S.refresh(); } }),
          S.iconBtn('Dupliquer', 'fr-icon-file-add-line', () => { const x = S.clone(s); delete x.id; x.nom += ' (copie)'; x.actif = false; db.save('scenarios', x); S.refresh(); }),
          S.iconBtn('Exporter', 'fr-icon-download-line', () => S.download(S.slug(s.nom) + '.json', JSON.stringify(s, null, 2), 'application/json')),
          S.iconBtn('Supprimer', 'fr-icon-delete-line', async () => { if (await S.confirm(`Supprimer « ${s.nom} » ?`, { ok: 'Supprimer' })) { db.remove('scenarios', s.id); S.refresh(); } })) },
      ], list, { onRow: (s) => S.go('editeur/' + s.id), empty: 'Aucun scénario : créez-en un ou partez d’un modèle.' }),
    );
  }
  function modelesModal() {
    const body = h('div', { class: 's-grid' }, A.MODELES.map((m, i) => { const x = m(); return h('div', { class: 'fr-card fr-enlarge-button' }, h('div', { class: 'fr-card__body' }, h('div', { class: 'fr-card__content' },
      h('h3', { class: 'fr-card__title' }, h('button', { type: 'button', onclick: () => { const sc = fromModel(i); document.querySelector('dialog.s-modal .fr-btn--close').click(); S.go('editeur/' + sc.id); } }, x.nom)),
      h('p', { class: 'fr-card__desc' }, x.description),
      h('div', { class: 'fr-card__start' }, h('p', { class: 'fr-card__detail' }, x.nodes.map((n) => N[n.type].label).join(' → ')))))); }));
    S.modal({ titre: 'Partir d’un modèle', body, taille: 'wide' });
  }

  /* ================= Éditeur ================= */
  function editor(view, id) {
    const orig = db.get('scenarios', id);
    if (!orig) { view.append(h('div', { class: 'fr-container fr-py-4w' }, S.alert('Scénario introuvable', '', 'error'))); return; }
    const sc = S.clone(orig);
    sc.vue = sc.vue || { x: 0, y: 0, z: 1 };
    let sel = null; // {kind:'node'|'edge', id}
    let lastExec = db.list('executions').find((e) => e.scenarioId === sc.id);
    const save = S.debounce(() => db.save('scenarios', S.clone(sc), true), 300);

    // Barre supérieure
    const nameInp = h('input', { class: 'fr-input', value: sc.nom, 'aria-label': 'Nom du scénario', oninput: (e) => { sc.nom = e.target.value; save(); } });
    const actId = 'act-ed';
    const top = h('div', { class: 'wf-top' },
      h('a', { class: 'fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-arrow-left-line fr-btn--icon-left', href: '#/scenarios' }, 'Scénarios'),
      nameInp,
      h('div', { class: 'fr-toggle fr-ml-2w' }, h('input', { type: 'checkbox', class: 'fr-toggle__input', id: actId, checked: !!sc.actif, onchange: (e) => { sc.actif = e.target.checked; save(); } }), h('label', { class: 'fr-toggle__label', for: actId }, 'Actif')),
      h('span', { style: 'flex:1' }),
      S.btn('Tester', () => runTest(), 'fr-btn--sm', 'fr-icon-play-circle-line'),
      S.btn('Exporter', () => S.download(S.slug(sc.nom) + '.json', JSON.stringify(sc, null, 2), 'application/json'), 'fr-btn--sm fr-btn--secondary', 'fr-icon-download-line'),
    );

    // Palette
    const pal = h('div', { class: 's-side' });
    const palList = h('div');
    const drawPal = (q = '') => {
      S.clear(palList);
      for (const [cat, info] of Object.entries(A.CATS)) {
        const items = Object.entries(N).filter(([t, d]) => d.cat === cat && (!q || S.norm(d.label + ' ' + d.desc).includes(S.norm(q))));
        if (!items.length) continue;
        palList.append(h('p', { class: 's-sidetitle' }, info.label));
        items.forEach(([t, d]) => palList.append(h('button', { type: 'button', class: 'wf-pal-item', draggable: 'true', style: { borderLeftColor: info.color }, title: d.desc,
          ondragstart: (e) => e.dataTransfer.setData('text/wf-node', t),
          onclick: () => { const r = canvas.getBoundingClientRect(); addNode(t, (r.width / 2 - sc.vue.x) / sc.vue.z - W / 2 + Math.random() * 40, (r.height / 2 - sc.vue.y) / sc.vue.z - 32 + Math.random() * 40); } },
        d.label, h('small', {}, d.desc.slice(0, 70) + (d.desc.length > 70 ? '…' : '')))));
      }
    };
    const palSearch = h('input', { class: 'fr-input fr-mb-1w', type: 'search', placeholder: 'Rechercher un connecteur…', oninput: (e) => drawPal(e.target.value) });
    pal.append(palSearch, palList);
    drawPal();

    // Canevas
    const canvas = h('div', { class: 'wf-canvas', tabindex: '0', 'aria-label': 'Canevas du scénario' });
    const world = h('div', { class: 'wf-world' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('wf-svg');
    world.append(svg);
    canvas.append(world,
      h('div', { class: 'wf-zoom' },
        S.iconBtn('Zoom avant', 'fr-icon-zoom-in-line', () => zoom(1.2)),
        S.iconBtn('Zoom arrière', 'fr-icon-zoom-out-line', () => zoom(1 / 1.2)),
        S.iconBtn('Tout afficher', 'fr-icon-focus-3-line', fit)),
      h('div', { class: 'wf-help' }, 'Glisser un connecteur depuis la palette · relier une sortie (●) à une entrée · Suppr pour effacer · molette pour zoomer'));
    const center = h('div', { class: 's-center' }, canvas);
    const insp = h('div', { class: 's-side s-side--right' });
    view.append(top, h('div', { class: 's-work' }, pal, center, insp));
    const setH = () => { const hd = document.querySelector('.fr-header'); document.documentElement.style.setProperty('--s-head', (hd.offsetHeight + top.offsetHeight) + 'px'); };
    setH(); setTimeout(setH, 200);

    const applyView = () => { world.style.transform = `translate(${sc.vue.x}px,${sc.vue.y}px) scale(${sc.vue.z})`; };
    const zoom = (f, cx, cy) => {
      const r = canvas.getBoundingClientRect();
      cx = cx ?? r.width / 2; cy = cy ?? r.height / 2;
      const z = Math.min(2, Math.max(0.25, sc.vue.z * f));
      sc.vue.x = cx - (cx - sc.vue.x) * (z / sc.vue.z); sc.vue.y = cy - (cy - sc.vue.y) * (z / sc.vue.z); sc.vue.z = z;
      applyView(); save();
    };
    function fit() {
      if (!sc.nodes.length) return;
      const r = canvas.getBoundingClientRect();
      const x0 = Math.min(...sc.nodes.map((n) => n.x)) - 40, y0 = Math.min(...sc.nodes.map((n) => n.y)) - 40;
      const x1 = Math.max(...sc.nodes.map((n) => n.x + W)) + 40, y1 = Math.max(...sc.nodes.map((n) => n.y + 90)) + 40;
      const z = Math.min(1.2, Math.max(0.25, Math.min(r.width / (x1 - x0), r.height / (y1 - y0))));
      sc.vue = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z };
      applyView(); save();
    }
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    const toWorld = (cx, cy) => { const r = canvas.getBoundingClientRect(); return { x: (cx - r.left - sc.vue.x) / sc.vue.z, y: (cy - r.top - sc.vue.y) / sc.vue.z }; };

    // Glisser depuis la palette
    canvas.addEventListener('dragover', (e) => e.preventDefault());
    canvas.addEventListener('drop', (e) => { e.preventDefault(); const t = e.dataTransfer.getData('text/wf-node'); if (!t) return; const p = toWorld(e.clientX, e.clientY); addNode(t, p.x - W / 2, p.y - 30); });

    // Déplacement du fond
    canvas.addEventListener('pointerdown', (e) => {
      if (e.target !== canvas && e.target !== world && e.target !== svg) return;
      select(null);
      const sx = e.clientX, sy = e.clientY, ox = sc.vue.x, oy = sc.vue.y;
      canvas.classList.add('pan'); canvas.setPointerCapture(e.pointerId);
      const mv = (ev) => { sc.vue.x = ox + ev.clientX - sx; sc.vue.y = oy + ev.clientY - sy; applyView(); };
      const up = () => { canvas.classList.remove('pan'); canvas.removeEventListener('pointermove', mv); canvas.removeEventListener('pointerup', up); save(); };
      canvas.addEventListener('pointermove', mv); canvas.addEventListener('pointerup', up);
    });
    const onKey = (e) => {
      if (!document.body.contains(canvas)) return document.removeEventListener('keydown', onKey);
      if (/input|textarea|select/i.test(document.activeElement?.tagName) || document.querySelector('dialog[open]')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); delSel(); }
      if (e.key === 'd' && (e.ctrlKey || e.metaKey) && sel?.kind === 'node') { e.preventDefault(); dupNode(sel.id); }
    };
    document.addEventListener('keydown', onKey);

    const portPos = (n, kind, port) => {
      const def = N[n.type]; const hh = nodeH(def);
      if (kind === 'in') return { x: n.x, y: n.y + hh / 2 };
      const outs = def.outputs || ['main']; const i = Math.max(0, outs.indexOf(port || 'main'));
      return { x: n.x + W, y: n.y + (hh * (i + 1)) / (outs.length + 1) };
    };
    const curve = (a, b) => { const dx = Math.max(40, Math.abs(b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; };
    const nodeEls = {};

    function drawEdges() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      for (const e of sc.edges) {
        const a = sc.nodes.find((n) => n.id === e.from), b = sc.nodes.find((n) => n.id === e.to);
        if (!a || !b) continue;
        const d = curve(portPos(a, 'out', e.port), portPos(b, 'in'));
        const p = document.createElementNS(svg.namespaceURI, 'path'); p.setAttribute('d', d); p.setAttribute('class', 'wf-edge' + (sel?.kind === 'edge' && sel.id === e.id ? ' sel' : ''));
        const hit = document.createElementNS(svg.namespaceURI, 'path'); hit.setAttribute('d', d); hit.setAttribute('class', 'wf-hit');
        hit.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); select({ kind: 'edge', id: e.id }); });
        svg.append(p, hit);
        const st = lastExec?.etapes.find((s) => s.nodeId === a.id);
        if (st && st.sortie) {
          const n = (st.sortie[e.port || 'main'] || []).length;
          const pa = portPos(a, 'out', e.port), pb = portPos(b, 'in');
          const t = document.createElementNS(svg.namespaceURI, 'text'); t.setAttribute('x', (pa.x + pb.x) / 2); t.setAttribute('y', (pa.y + pb.y) / 2 - 6); t.setAttribute('class', 'wf-elabel'); t.setAttribute('text-anchor', 'middle');
          t.textContent = n + (n >= 25 ? '+' : '') + ' él.'; svg.append(t);
        }
      }
    }
    function drawNodes() {
      world.querySelectorAll('.wf-node').forEach((x) => x.remove()); for (const k in nodeEls) delete nodeEls[k];
      for (const n of sc.nodes) {
        const def = N[n.type] || { label: n.type, cat: 'logic' };
        const hh = nodeH(def);
        const st = lastExec?.etapes.find((s) => s.nodeId === n.id);
        const el = h('div', { class: 'wf-node' + (sel?.kind === 'node' && sel.id === n.id ? ' sel' : '') + (n.desactive ? ' off' : ''), style: { left: n.x + 'px', top: n.y + 'px', height: hh + 'px', borderLeftColor: A.CATS[def.cat]?.color } },
          def.trigger ? h('span', { class: 'wf-trig' }, 'DÉCLENCHEUR') : null,
          h('div', { class: 't' }, n.nom),
          h('div', { class: 'k' }, def.label),
          st ? h('span', { class: 'st ' + (st.erreur ? 'err' : st.ignore ? 'skip' : 'ok') }, st.erreur ? 'erreur' : st.ignore ? 'ignoré' : `${st.nbSortie} él. · ${st.ms} ms`) : null,
          def.trigger ? null : h('div', { class: 'wf-port in', style: { top: hh / 2 - 7 + 'px' }, title: 'Entrée' }),
          (def.outputs || ['main']).map((p, i, arr) => {
            const y = (hh * (i + 1)) / (arr.length + 1);
            const port = h('div', { class: 'wf-port out', style: { top: y - 7 + 'px' }, title: 'Sortie ' + (p === 'main' ? '' : p) });
            port.addEventListener('pointerdown', (e) => startLink(e, n, p));
            return [port, p !== 'main' ? h('span', { class: 'wf-plabel', style: { top: y + 'px' } }, p) : null];
          }));
        el.addEventListener('pointerdown', (e) => {
          if (e.target.classList.contains('wf-port')) return;
          e.stopPropagation(); select({ kind: 'node', id: n.id });
          const s0 = toWorld(e.clientX, e.clientY), ox = n.x, oy = n.y; let moved = false;
          el.setPointerCapture(e.pointerId);
          const mv = (ev) => { const p = toWorld(ev.clientX, ev.clientY); n.x = Math.round((ox + p.x - s0.x) / 10) * 10; n.y = Math.round((oy + p.y - s0.y) / 10) * 10; el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; moved = true; drawEdges(); };
          const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); if (moved) save(); };
          el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
        });
        nodeEls[n.id] = el;
        world.append(el);
      }
      drawEdges();
    }
    function startLink(e, n, port) {
      e.stopPropagation(); e.preventDefault();
      const tmp = document.createElementNS(svg.namespaceURI, 'path'); tmp.setAttribute('class', 'wf-edge sel'); svg.append(tmp);
      const a = portPos(n, 'out', port);
      const mv = (ev) => tmp.setAttribute('d', curve(a, toWorld(ev.clientX, ev.clientY)));
      const up = (ev) => {
        document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); tmp.remove();
        const tEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.wf-node');
        const tgt = tEl && sc.nodes.find((x) => nodeEls[x.id] === tEl);
        if (!tgt || tgt.id === n.id) return;
        if (N[tgt.type]?.trigger) return S.toast('Un déclencheur ne peut pas recevoir de connexion', 'warning');
        if (sc.edges.some((x) => x.from === n.id && x.to === tgt.id && (x.port || 'main') === port)) return;
        sc.edges.push({ id: S.uid('e'), from: n.id, to: tgt.id, port });
        save(); drawEdges();
      };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    }
    function addNode(type, x, y) {
      const def = N[type];
      if (def.trigger && sc.nodes.some((n) => N[n.type]?.trigger)) return S.toast('Un scénario ne comporte qu’un seul déclencheur : supprimez l’actuel d’abord.', 'warning');
      const params = {}; (def.fields || []).forEach((f) => { if (f.default != null) params[f.name] = f.default; });
      let nom = def.label, k = 2; while (sc.nodes.some((n) => n.nom === nom)) nom = def.label + ' ' + k++;
      const n = { id: S.uid('n'), type, nom, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10, params };
      // Relier automatiquement au nœud sélectionné
      if (sel?.kind === 'node' && !def.trigger) { const s0 = sc.nodes.find((z) => z.id === sel.id); if (s0) { sc.edges.push({ id: S.uid('e'), from: s0.id, to: n.id, port: (N[s0.type].outputs || ['main'])[0] }); if (Math.abs(n.x - s0.x) < W) { n.x = s0.x + W + 60; n.y = s0.y; } } }
      sc.nodes.push(n); save(); drawNodes(); select({ kind: 'node', id: n.id });
    }
    function dupNode(id) { const n = sc.nodes.find((x) => x.id === id); if (!n || N[n.type].trigger) return; const c = S.clone(n); c.id = S.uid('n'); c.nom += ' (copie)'; c.x += 30; c.y += 90; sc.nodes.push(c); save(); drawNodes(); select({ kind: 'node', id: c.id }); }
    function delSel() {
      if (!sel) return;
      if (sel.kind === 'node') { sc.nodes = sc.nodes.filter((n) => n.id !== sel.id); sc.edges = sc.edges.filter((e) => e.from !== sel.id && e.to !== sel.id); }
      else sc.edges = sc.edges.filter((e) => e.id !== sel.id);
      sel = null; save(); drawNodes(); drawInspector();
    }
    function select(s) { sel = s; Object.entries(nodeEls).forEach(([id, el]) => el.classList.toggle('sel', s?.kind === 'node' && s.id === id)); drawEdges(); drawInspector(); }

    // Inspecteur
    let lastFocus = null;
    function fieldChips(n) {
      const prevIds = sc.edges.filter((e) => e.to === n.id).map((e) => e.from);
      const keys = new Set();
      for (const pid of prevIds) { const st = lastExec?.etapes.find((s) => s.nodeId === pid); Object.values(st?.sortie || {}).flat().slice(0, 5).forEach((it) => Object.keys(it || {}).forEach((k) => keys.add(k))); }
      if (!keys.size) return h('p', { class: 's-mention s-small' }, 'Lancez « Tester » pour voir ici les champs disponibles en entrée. Syntaxe : {{ $json.champ }}');
      return h('div', {}, h('p', { class: 's-small fr-mb-0' }, 'Champs reçus (cliquer pour insérer dans le champ actif) :'),
        h('div', { class: 'wf-chips' }, [...keys].map((k) => h('button', { type: 'button', class: 'wf-chip', onmousedown: (e) => e.preventDefault(), onclick: () => insertAtCursor(`{{ $json${/^[A-Za-z_$][\w$]*$/.test(k) ? '.' + k : `[${JSON.stringify(k)}]`} }}`) }, k))));
    }
    function insertAtCursor(txt) {
      const el = lastFocus; if (!el || !document.body.contains(el)) return S.toast('Cliquez d’abord dans un champ du formulaire', 'info');
      const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
      el.value = el.value.slice(0, s) + txt + el.value.slice(e); el.focus(); el.selectionStart = el.selectionEnd = s + txt.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function drawInspector() {
      S.clear(insp);
      if (sel?.kind === 'edge') {
        S.add(insp, h('h2', { class: 'fr-h6' }, 'Connexion'), S.btn('Supprimer la connexion', delSel, 'fr-btn--secondary fr-btn--sm', 'fr-icon-delete-line'));
        return;
      }
      const n = sel?.kind === 'node' && sc.nodes.find((x) => x.id === sel.id);
      if (!n) return scenarioPanel();
      const def = N[n.type];
      S.add(insp, 
        h('p', { class: 's-sidetitle', style: { color: A.CATS[def.cat].color } }, A.CATS[def.cat].label),
        h('h2', { class: 'fr-h6 fr-mb-1w' }, def.label),
        h('p', { class: 's-small s-mention' }, def.desc),
        h('div', { class: 'fr-input-group' }, h('label', { class: 'fr-label' }, 'Nom de l’étape'), h('input', { class: 'fr-input', value: n.nom, oninput: (e) => { n.nom = e.target.value; save(); nodeEls[n.id].querySelector('.t').textContent = n.nom; } })),
        def.trigger ? null : fieldChips(n));
      const f = S.form(def.fields || [], n.params);
      const upd = () => { const v = f.get(); for (const fd of def.fields || []) if (fd.name && fd.type !== 'section' && fd.type !== 'html') n.params[fd.name] = v[fd.name]; save(); };
      f.el.addEventListener('input', upd); f.el.addEventListener('change', upd);
      f.el.addEventListener('focusin', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) lastFocus = e.target; });
      S.add(insp, f.el);
      const opt = (label, key) => { const id = 'o' + key + n.id; return h('div', { class: 'fr-checkbox-group fr-checkbox-group--sm fr-mb-1w' }, h('input', { type: 'checkbox', id, checked: !!n[key], onchange: (e) => { n[key] = e.target.checked; save(); drawNodes(); } }), h('label', { class: 'fr-label', for: id }, label)); };
      if (!def.trigger) S.add(insp, opt('Continuer en cas d’erreur (ajoute le champ $erreur)', 'continuer'), opt('Désactiver cette étape (laisse passer les données)', 'desactive'));
      S.add(insp, h('div', { class: 'fr-btns-group fr-btns-group--inline-sm fr-mt-2w' },
        def.trigger ? null : S.btn('Dupliquer', () => dupNode(n.id), 'fr-btn--secondary fr-btn--sm', 'fr-icon-file-add-line'),
        S.btn('Supprimer', delSel, 'fr-btn--tertiary fr-btn--sm', 'fr-icon-delete-line')));
      const st = lastExec?.etapes.find((s) => s.nodeId === n.id);
      if (st) {
        S.add(insp, h('h3', { class: 'fr-h6 fr-mt-3w' }, 'Dernier test'),
          st.erreur ? S.alert('Erreur', st.erreur, 'error') : h('p', { class: 's-small' }, `${st.nbEntree} élément(s) en entrée → ${st.nbSortie} en sortie, ${st.ms} ms`),
          h('details', {}, h('summary', {}, 'Entrée'), h('pre', { class: 's-pre' }, JSON.stringify(st.entree, null, 2))),
          h('details', { open: true }, h('summary', {}, 'Sortie'), h('pre', { class: 's-pre' }, JSON.stringify(Object.keys(st.sortie || {}).length === 1 ? Object.values(st.sortie)[0] : st.sortie, null, 2))));
      }
    }
    function scenarioPanel() {
      S.add(insp, h('h2', { class: 'fr-h6' }, 'Scénario'),
        h('div', { class: 'fr-input-group' }, h('label', { class: 'fr-label' }, 'Description'), h('textarea', { class: 'fr-input', rows: 3, oninput: (e) => { sc.description = e.target.value; save(); } }, sc.description || '')),
        h('p', { class: 's-small' }, `${sc.nodes.length} étape(s), ${sc.edges.length} connexion(s).`),
        h('p', { class: 's-small s-mention' }, 'Sélectionnez une étape pour la paramétrer. Cliquez sur un connecteur de la palette pour l’ajouter (il sera relié à l’étape sélectionnée).'));
      const t = sc.nodes.find((n) => N[n.type]?.trigger);
      if (t && t.type === 'trigger.manual') {
        const url = location.href.split('#')[0] + '#/lancer/' + sc.id + '/';
        S.add(insp, h('h3', { class: 'fr-h6' }, 'Lancer depuis Grist'), h('p', { class: 's-small' }, 'Colonne formule (type Texte, affichée en lien hypertexte) :'),
          h('pre', { class: 's-pre' }, `import json, urllib.parse\nreturn "${url}" + urllib.parse.quote(json.dumps({"id": $id, "nom": $Nom}))`),
          h('p', { class: 's-small s-mention' }, 'Un clic sur le lien ouvre cette page, qui demande confirmation puis exécute le scénario avec les données de la ligne.'));
      }
      if (lastExec) {
        S.add(insp, h('h3', { class: 'fr-h6 fr-mt-3w' }, 'Dernière exécution'),
          h('p', {}, S.badge(lastExec.statut, lastExec.statut === 'erreur' ? 'error' : 'success'), ' ', S.fmtDT(lastExec.debut), ` · ${lastExec.ms} ms`),
          lastExec.erreur ? S.alert(null, lastExec.erreur, 'error') : null,
          lastExec.journal?.length ? h('pre', { class: 's-pre' }, lastExec.journal.join('\n')) : null,
          S.btn('Détail', () => showExec(lastExec), 'fr-btn--secondary fr-btn--sm'));
      }
    }
    async function runTest() {
      db.save('scenarios', S.clone(sc), true);
      S.toast('Exécution du test…');
      try { lastExec = await A.run(sc, { test: true, mode: 'test' }); }
      catch (e) { return S.toast(e.message, 'error'); }
      S.toast(lastExec.statut === 'erreur' ? 'Erreur : ' + lastExec.erreur : `Test terminé en ${lastExec.ms} ms`, lastExec.statut === 'erreur' ? 'error' : 'success', 7000);
      drawNodes(); drawInspector();
    }

    applyView(); drawNodes(); drawInspector();
    setTimeout(fit, 60);
  }

  /* ================= Exécutions ================= */
  function showExec(e) {
    const body = h('div', {},
      h('p', {}, S.badge(e.statut, e.statut === 'erreur' ? 'error' : 'success'), ` ${S.fmtDT(e.debut)} — mode ${e.mode} — ${e.ms} ms`),
      e.erreur ? S.alert('Erreur', e.erreur, 'error') : null,
      e.journal?.length ? h('pre', { class: 's-pre fr-mb-2w' }, e.journal.join('\n')) : null,
      e.etapes.map((st, i) => h('details', { class: 'fr-mb-1w', open: !!st.erreur },
        h('summary', {}, `${i + 1}. ${st.nom} — `, st.erreur ? S.badge('erreur', 'error') : st.ignore ? S.badge('ignoré') : `${st.nbEntree ?? 0} → ${st.nbSortie} élément(s)`, ` (${st.ms} ms)`),
        st.erreur ? h('p', { class: 'fr-error-text' }, st.erreur) : null,
        h('div', { class: 's-cols' }, h('div', {}, h('p', { class: 's-small fr-mb-0' }, 'Entrée'), h('pre', { class: 's-pre' }, JSON.stringify(st.entree, null, 1))), h('div', {}, h('p', { class: 's-small fr-mb-0' }, 'Sortie'), h('pre', { class: 's-pre' }, JSON.stringify(st.sortie, null, 1)))))));
    S.modal({ titre: 'Exécution — ' + e.scenarioNom, body, taille: 'wide' });
  }
  function executions(c) {
    const list = db.list('executions');
    S.add(c, S.bar('Historique des exécutions', S.btn('Vider l’historique', async () => { if (await S.confirm('Supprimer tout l’historique des exécutions ?')) { db.setAll('executions', []); S.refresh(); } }, 'fr-btn--secondary', 'fr-icon-delete-line')),
      S.table([
        { key: 'debut', label: 'Date', render: (e) => S.fmtDT(e.debut) + ':' + S.pad(new Date(e.debut).getSeconds()) },
        { key: 'scenarioNom', label: 'Scénario' },
        { key: 'mode', label: 'Mode' },
        { key: 'statut', label: 'Statut', render: (e) => S.badge(e.statut, e.statut === 'erreur' ? 'error' : 'success') },
        { key: 'nb', label: 'Éléments déclenchés', class: 'num', render: (e) => e.etapes[0]?.nbSortie ?? 0 },
        { key: 'ms', label: 'Durée', class: 'num', render: (e) => e.ms + ' ms' },
        { key: 'erreur', label: 'Message', render: (e) => e.erreur || '' },
      ], list, { onRow: showExec, empty: 'Aucune exécution pour le moment.' }));
  }

  /* ================= Identifiants ================= */
  function identifiants(c) {
    const fields = [
      { name: 'nom', label: 'Nom', required: true, placeholder: 'Clé Brevo DRAAF' },
      { name: 'type', label: 'Type', type: 'select', required: true, options: [{ value: 'bearer', label: 'Jeton Bearer (Authorization: Bearer …)' }, { value: 'header', label: 'En-tête personnalisé (api-key, X-API-Key…)' }, { value: 'basic', label: 'Basique (utilisateur + mot de passe)' }, { value: 'secret', label: 'Secret brut (utilisé par certains nœuds)' }] },
      { name: 'entete', label: 'Nom de l’en-tête', placeholder: 'api-key', hint: 'Pour le type « En-tête personnalisé »' },
      { name: 'utilisateur', label: 'Utilisateur', hint: 'Pour le type « Basique »' },
      { name: 'secret', label: 'Jeton / clé / mot de passe', type: 'password', required: true, full: true },
      { name: 'note', label: 'Note', type: 'textarea', rows: 2 },
    ];
    const edit = async (x = {}) => { const v = await S.formModal(x.id ? 'Modifier l’identifiant' : 'Nouvel identifiant', fields, x, { extraActions: x.id ? [{ label: 'Supprimer', danger: true, onClick: () => { db.remove('identifiants', x.id); S.refresh(); } }] : [] }); if (v) { db.save('identifiants', v); S.refresh(); } };
    S.add(c, S.bar('Identifiants (clés API, jetons)', S.btn('Ajouter', () => edit(), '', 'fr-icon-add-line')),
      S.alert('Sécurité', 'Les identifiants sont stockés en clair dans ce navigateur (localStorage) et ne sont jamais inclus dans l’export d’un scénario. Utilisez des clés dédiées, à droits limités, et ce poste uniquement. L’export « Données » de l’application les inclut : protégez ce fichier.', 'warning'),
      S.table([{ key: 'nom', label: 'Nom' }, { key: 'type', label: 'Type' }, { key: 'entete', label: 'En-tête / utilisateur', render: (x) => x.entete || x.utilisateur || '' }, { key: 's', label: 'Secret', render: (x) => (x.secret ? '••••••' + String(x.secret).slice(-3) : '') }, { key: 'note', label: 'Note' }], db.list('identifiants'), { onRow: edit, empty: 'Aucun identifiant.' }));
  }

  /* ================= Lancement par lien ================= */
  async function lancer(c, id, data) {
    const sc = db.get('scenarios', id);
    if (!sc) return S.add(c, S.alert('Scénario introuvable', 'Le lien ne correspond à aucun scénario de ce navigateur.', 'error'));
    let item = {}; try { item = data ? JSON.parse(data) : {}; } catch (e) { item = { valeur: data }; }
    S.add(c, h('h1', { class: 'fr-h3' }, 'Lancer « ' + sc.nom + ' »'), h('p', {}, 'Données transmises :'), h('pre', { class: 's-pre fr-mb-3w' }, JSON.stringify(item, null, 2)));
    const res = h('div');
    S.add(c, h('div', { class: 'fr-btns-group fr-btns-group--inline' },
      S.btn('Confirmer l’exécution', async (e) => { e.target.disabled = true; const ex = await A.run(sc, { items: [item], mode: 'lien' }).catch((er) => ({ statut: 'erreur', erreur: er.message, etapes: [] })); S.add(res, ex.statut === 'erreur' ? S.alert('Échec', ex.erreur, 'error') : S.alert('Scénario exécuté', `${ex.etapes.length} étape(s) en ${ex.ms} ms.`, 'success')); if (ex.id) S.add(res, S.btn('Voir le détail', () => showExec(ex), 'fr-btn--secondary')); }, '', 'fr-icon-play-circle-line'),
      h('a', { class: 'fr-btn fr-btn--secondary', href: '#/scenarios' }, 'Annuler')), res);
  }

  /* ================= Aide ================= */
  function aide(c) {
    S.add(c, h('h1', { class: 'fr-h3' }, 'Aide et catalogue des connecteurs'),
      h('div', { class: 's-cols' },
        S.callout('Principe', h('p', {}, 'Un scénario part d’un déclencheur, puis chaque étape reçoit une liste d’éléments (objets JSON), les transforme et les transmet aux étapes reliées. Le bouton « Tester » exécute le scénario et affiche les données à chaque étape.')),
        S.callout('Expressions', h('p', {}, 'Dans tous les champs : ', h('code', {}, '{{ $json.nom }}'), ' (champ de l’élément), ', h('code', {}, '{{ $node("Étape").champ }}'), ' (sortie d’une autre étape), ', h('code', {}, '{{ $now.toLocaleDateString("fr-FR") }}'), ', ', h('code', {}, '{{ $index }}'), '. Le contenu entre accolades est du JavaScript : ', h('code', {}, '{{ $json.montant * 1.2 }}'), '.'))),
      h('div', { class: 's-cols' },
        S.callout('Planification', h('p', {}, 'Sans serveur, les scénarios planifiés (intervalle, nouvelles lignes Grist, RSS, veille) s’exécutent tant qu’un onglet de cette page reste ouvert, par exemple sur un poste dédié. Pour un fonctionnement 24 h/24, utilisez les webhooks natifs de Grist vers un service d’automatisation hébergé.')),
        S.callout('Accès aux API (CORS)', h('p', {}, 'Un navigateur ne peut appeler une API que si celle-ci l’autorise (CORS). Les API publiques de l’État (IGN, API Géo, Entreprises, Annuaire), Grist, ntfy et Matrix l’autorisent. Pour les autres, le nœud « Requête HTTP » peut passer par le proxy CORS défini dans les paramètres : n’y faites pas transiter de données sensibles.'))),
      h('h2', { class: 'fr-h4 fr-mt-4w' }, `Connecteurs disponibles (${Object.keys(N).length})`),
      Object.entries(A.CATS).map(([cat, info]) => [h('h3', { class: 'fr-h6 fr-mt-3w', style: { color: info.color } }, info.label),
        S.table([{ key: 'label', label: 'Connecteur' }, { key: 'desc', label: 'Description' }], Object.values(N).filter((d) => d.cat === cat), { sortable: false })]));
  }
})();
