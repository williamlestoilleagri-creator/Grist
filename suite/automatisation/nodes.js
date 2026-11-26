/* Catalogue des nœuds de l'outil d'automatisation.
 * Chaque nœud : { cat, label, desc, fields, outputs, trigger, each(item,p,ctx) | batch(items,node,ctx) }
 * - each : appelé pour chaque élément, paramètres déjà résolus ({{ expressions }}).
 *   Renvoie un objet (1 élément), un tableau (n éléments), null (élément supprimé) ou undefined (inchangé).
 * - batch : reçoit tous les éléments et le nœud brut ; renvoie un tableau ou {port: tableau}.
 */
(function () {
  'use strict';
  const A = (window.AUTO = window.AUTO || {});

  A.CATS = {
    trigger: { label: 'Déclencheurs', color: '#18753c' },
    grist: { label: 'Grist', color: '#000091' },
    logic: { label: 'Logique & données', color: '#7f3e3b' },
    http: { label: 'Web & API', color: '#3a3a3a' },
    mail: { label: 'Messagerie', color: '#a558a0' },
    tel: { label: 'Téléphone & SMS', color: '#ce614a' },
    chat: { label: 'Messagerie instantanée & notifications', color: '#009081' },
    contact: { label: 'Contacts & annuaires', color: '#c3992a' },
    geo: { label: 'Cartographie', color: '#417dc4' },
    visio: { label: 'Visio & agenda', color: '#6a6af4' },
    intranet: { label: 'Communication & intranet', color: '#8d533e' },
    suite: { label: 'Applications de la suite', color: '#e1000f' },
    ia: { label: 'Intelligence artificielle', color: '#5e2a2b' },
  };

  const credField = (hint) => ({ name: 'cred', label: 'Identifiant', type: 'select', options: () => A.credOptions(), hint: hint || 'Défini dans l’onglet Identifiants' });
  const json = (v, def) => { if (v == null || v === '') return def; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch (e) { throw new Error('JSON invalide : ' + String(v).slice(0, 80)); } };
  const num = (v, d) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v));
  const asList = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean));
  const http = async (url, opt = {}, proxy) => {
    const r = await S.fetch(url, opt, { proxy: proxy === 'oui' ? true : proxy === 'non' ? false : 'auto' });
    const txt = await r.text();
    let data = txt; try { data = JSON.parse(txt); } catch (e) { /* texte */ }
    if (!r.ok) throw new Error(`HTTP ${r.status} : ${txt.slice(0, 300)}`);
    return { status: r.status, data, headers: Object.fromEntries(r.headers.entries()) };
  };
  A.http = http;
  const gconf = (p) => (p.gserver || p.gdoc || p.gkey ? Object.assign({}, S.settings().grist, p.gserver ? { server: p.gserver } : {}, p.gdoc ? { docId: p.gdoc } : {}, p.gkey ? { apiKey: A.credSecret(p.gkey) } : {}) : undefined);
  const gristConn = [
    { type: 'section', label: 'Connexion (facultatif : sinon celle des paramètres de la suite)' },
    { name: 'gserver', label: 'Serveur Grist' }, { name: 'gdoc', label: 'Document' },
    { name: 'gkey', label: 'Identifiant (clé API)', type: 'select', options: () => A.credOptions() },
  ];
  const cmp = (a, op, b) => {
    const n = (x) => (x !== '' && x != null && !isNaN(Number(x)) ? Number(x) : x);
    switch (op) {
      case '=': return String(a) === String(b);
      case '≠': return String(a) !== String(b);
      case '>': return n(a) > n(b);
      case '≥': return n(a) >= n(b);
      case '<': return n(a) < n(b);
      case '≤': return n(a) <= n(b);
      case 'contient': return S.norm(a).includes(S.norm(b));
      case 'ne contient pas': return !S.norm(a).includes(S.norm(b));
      case 'commence par': return S.norm(a).startsWith(S.norm(b));
      case 'est vide': return a == null || a === '' || (Array.isArray(a) && !a.length);
      case "n'est pas vide": return !(a == null || a === '' || (Array.isArray(a) && !a.length));
      case 'vrai': return !!a && a !== 'false' && a !== '0';
      case 'expression régulière': return new RegExp(b, 'i').test(String(a));
      default: return false;
    }
  };
  const condFields = [
    { name: 'mode', label: 'Type de condition', type: 'select', required: true, options: [{ value: 'simple', label: 'Comparaison simple' }, { value: 'expr', label: 'Expression JavaScript' }], default: 'simple' },
    { name: 'champ', label: 'Valeur à tester', placeholder: '{{ $json.statut }}', hint: 'Expression ou nom de champ' },
    { name: 'op', label: 'Opérateur', type: 'select', required: true, options: ['=', '≠', '>', '≥', '<', '≤', 'contient', 'ne contient pas', 'commence par', 'est vide', "n'est pas vide", 'vrai', 'expression régulière'], default: '=' },
    { name: 'valeur', label: 'Valeur de comparaison' },
    { name: 'expr', label: 'Expression (mode JavaScript)', type: 'textarea', rows: 2, placeholder: '$json.montant > 1000 && $json.urgent', full: true },
  ];
  const testCond = (item, p, ctx) => {
    if (p.mode === 'expr') return !!A.evalExpr(p.expr, A.scope(item, ctx));
    const raw = String((ctx.node && ctx.node.params.champ) || '');
    const a = raw && !/\{\{/.test(raw) && raw in item ? item[raw] : p.champ;
    return cmp(a, p.op, p.valeur);
  };
  const parseFeed = (xml) => {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const t = (el, sel) => { const x = el.querySelector(sel); return x ? x.textContent.trim() : ''; };
    const items = [...doc.querySelectorAll('item, entry')];
    return items.map((el) => ({
      titre: t(el, 'title'),
      lien: t(el, 'link') || el.querySelector('link')?.getAttribute('href') || '',
      date: t(el, 'pubDate') || t(el, 'updated') || t(el, 'published') || t(el, 'date'),
      resume: (t(el, 'description') || t(el, 'summary') || t(el, 'content')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000),
      guid: t(el, 'guid') || t(el, 'id') || t(el, 'link'),
      source: t(doc, 'channel > title') || t(doc, 'feed > title'),
    }));
  };
  A.parseFeed = parseFeed;

  A.NODES = {
    /* ---------------- Déclencheurs ---------------- */
    'trigger.manual': { cat: 'trigger', label: 'Déclenchement manuel', trigger: true, desc: 'Lance le scénario avec le bouton « Exécuter » ou via un lien (voir Aide).', fields: [{ name: 'donnees', label: 'Données initiales (JSON, facultatif)', type: 'textarea', placeholder: '{"nom": "Test"}' }],
      batch: async (items, node) => (items.length ? items : [json(node.params.donnees, {}) || {}]) },
    'trigger.form': { cat: 'trigger', label: 'Formulaire de saisie', trigger: true, desc: 'Affiche un formulaire au lancement ; les valeurs saisies deviennent l’élément de départ.', fields: [{ name: 'titre', label: 'Titre du formulaire', default: 'Saisie' }, { name: 'champs', label: 'Champs (un par ligne : nom|libellé|type)', type: 'textarea', placeholder: 'nom|Nom de l’usager|text\nemail|Courriel|email\ndate|Date du rendez-vous|date', hint: 'Types : text, email, tel, date, number, textarea' }],
      batch: async (items, node) => {
        if (items.length) return items;
        const fields = String(node.params.champs || '').split('\n').filter((l) => l.trim()).map((l) => { const [name, label, type] = l.split('|').map((x) => x.trim()); return { name, label: label || name, type: type || 'text' }; });
        const v = await S.formModal(node.params.titre || 'Saisie', fields, {}, { okLabel: 'Lancer' });
        if (!v) throw new Error('Saisie annulée');
        return [v];
      } },
    'trigger.interval': { cat: 'trigger', label: 'Planification', trigger: true, desc: 'Exécute le scénario à intervalle régulier tant que l’onglet Automatisation est ouvert et le scénario actif.', fields: [{ name: 'minutes', label: 'Toutes les (minutes)', type: 'number', default: 60, min: 1 }, { name: 'ouvres', label: 'Uniquement les jours ouvrés, 8h-19h', type: 'checkbox' }],
      batch: async (items) => (items.length ? items : [{ declencheLe: new Date().toISOString() }]) },
    'trigger.grist': { cat: 'trigger', label: 'Nouvelles lignes Grist', trigger: true, desc: 'Surveille une table et ne transmet que les lignes apparues depuis la dernière exécution (identifiant croissant).', fields: [{ name: 'table', label: 'Table', required: true }, { name: 'minutes', label: 'Vérifier toutes les (minutes)', type: 'number', default: 5, min: 1 }, { name: 'initial', label: 'Au premier passage, traiter aussi les lignes existantes', type: 'checkbox' }, ...gristConn],
      batch: async (items, node, ctx) => {
        if (items.length) return items;
        const st = ctx.state(node);
        const recs = await S.grist.records(node.params.table, { conf: gconf(node.params) });
        const max = recs.reduce((m, r) => Math.max(m, r.id), 0);
        if (st.dernierId == null && !node.params.initial) { st.dernierId = max; if (!ctx.test) return []; }
        const nouv = ctx.test && st.dernierId != null && !recs.some((r) => r.id > st.dernierId) ? recs.slice(-1) : recs.filter((r) => r.id > (st.dernierId || 0));
        if (!ctx.test) st.dernierId = max;
        return nouv;
      } },
    'trigger.rss': { cat: 'trigger', label: 'Nouveaux articles RSS', trigger: true, desc: 'Transmet les articles d’un flux RSS/Atom non encore vus.', fields: [{ name: 'url', label: 'Adresse du flux', required: true, full: true }, { name: 'minutes', label: 'Vérifier toutes les (minutes)', type: 'number', default: 30, min: 5 }],
      batch: async (items, node, ctx) => {
        if (items.length) return items;
        const st = ctx.state(node);
        const r = await S.fetch(node.params.url);
        const arts = parseFeed(await r.text());
        const vus = new Set(st.vus || []);
        const nouv = arts.filter((a) => !vus.has(a.guid));
        if (!ctx.test) st.vus = arts.map((a) => a.guid).concat(st.vus || []).slice(0, 500);
        return ctx.test && !nouv.length ? arts.slice(0, 1) : nouv;
      } },
    'trigger.veille': { cat: 'trigger', label: 'Alerte de veille', trigger: true, desc: 'Nouveaux articles de l’application Veille contenant un mot-clé surveillé.', fields: [{ name: 'motcle', label: 'Mot-clé (vide = tous les mots-clés surveillés)' }, { name: 'minutes', label: 'Vérifier toutes les (minutes)', type: 'number', default: 30, min: 5 }],
      batch: async (items, node, ctx) => {
        if (items.length) return items;
        const st = ctx.state(node);
        const arts = S.suite('veille', 'articles').list().filter((a) => (node.params.motcle ? S.norm(a.titre + ' ' + a.resume).includes(S.norm(node.params.motcle)) : (a.motsCles || []).length));
        const vus = new Set(st.vus || []);
        const nouv = arts.filter((a) => !vus.has(a.id));
        if (!ctx.test) st.vus = arts.map((a) => a.id).slice(0, 1000);
        return (ctx.test && !nouv.length ? arts.slice(0, 1) : nouv).map((a) => ({ titre: a.titre, lien: a.lien, date: a.date, resume: a.resume, source: a.source, motsCles: a.motsCles }));
      } },

    /* ---------------- Grist ---------------- */
    'grist.list': { cat: 'grist', label: 'Lire des enregistrements', desc: 'Lit les lignes d’une table (un élément par ligne).', fields: [{ name: 'table', label: 'Table', required: true }, { name: 'filtre', label: 'Filtre (JSON)', placeholder: '{"Statut": ["À traiter"]}', hint: 'Format Grist : colonne → liste de valeurs acceptées' }, { name: 'tri', label: 'Tri', placeholder: '-Date,Nom' }, { name: 'limite', label: 'Nombre maximum', type: 'number' }, ...gristConn],
      batch: async (items, node, ctx) => {
        const src = items.length ? items : [{}];
        const out = [];
        for (const it of src) {
          const p = A.resolveParams(node.params, it, ctx);
          out.push(...(await S.grist.records(p.table, { filter: p.filtre ? json(p.filtre) : undefined, sort: p.tri || undefined, limit: p.limite || undefined, conf: gconf(p) })));
        }
        return out;
      } },
    'grist.sql': { cat: 'grist', label: 'Requête SQL', desc: 'Exécute une requête SELECT en lecture seule sur le document.', fields: [{ name: 'q', label: 'Requête', type: 'textarea', required: true, placeholder: 'SELECT * FROM Contacts WHERE Ville = \'Rennes\'' }, ...gristConn],
      batch: async (items, node, ctx) => { const p = A.resolveParams(node.params, items[0] || {}, ctx); return S.grist.sql(p.q, gconf(p)); } },
    'grist.add': { cat: 'grist', label: 'Ajouter des lignes', desc: 'Ajoute une ligne par élément.', fields: [{ name: 'table', label: 'Table', required: true }, { name: 'champs', label: 'Colonnes (JSON)', type: 'textarea', placeholder: '{"Nom": "{{ $json.nom }}", "Date": "{{ $now.toISOString().slice(0,10) }}"}', hint: 'Vide = toutes les données de l’élément' }, ...gristConn],
      batch: async (items, node, ctx) => {
        const recs = items.map((it) => { const p = A.resolveParams(node.params, it, ctx); return p.champs ? A.resolveJSON(node.params.champs, it, ctx) : A.flat(it); });
        const p = A.resolveParams(node.params, items[0] || {}, ctx);
        const r = await S.grist.add(p.table, recs, gconf(p));
        return items.map((it, i) => Object.assign({}, it, { gristId: r.records?.[i]?.id }));
      } },
    'grist.update': { cat: 'grist', label: 'Modifier des lignes', desc: 'Modifie la ligne désignée par son identifiant.', fields: [{ name: 'table', label: 'Table', required: true }, { name: 'id', label: 'Identifiant de ligne', default: '{{ $json.id }}', required: true }, { name: 'champs', label: 'Colonnes à modifier (JSON)', type: 'textarea', required: true, placeholder: '{"Statut": "Traité"}' }, ...gristConn],
      batch: async (items, node, ctx) => {
        const recs = items.map((it) => { const p = A.resolveParams(node.params, it, ctx); return Object.assign({ id: p.id }, A.resolveJSON(node.params.champs, it, ctx)); });
        const p = A.resolveParams(node.params, items[0] || {}, ctx);
        await S.grist.update(p.table, recs, gconf(p));
        return items;
      } },
    'grist.upsert': { cat: 'grist', label: 'Ajouter ou mettre à jour', desc: 'Met à jour la ligne dont la clé correspond, sinon l’ajoute.', fields: [{ name: 'table', label: 'Table', required: true }, { name: 'cles', label: 'Colonne(s) clé', required: true, placeholder: 'Email' }, { name: 'champs', label: 'Colonnes (JSON)', type: 'textarea', placeholder: '{"Email": "{{ $json.email }}", "Nom": "{{ $json.nom }}"}' }, ...gristConn],
      batch: async (items, node, ctx) => {
        const recs = items.map((it) => (node.params.champs ? A.resolveJSON(node.params.champs, it, ctx) : A.flat(it)));
        const p = A.resolveParams(node.params, items[0] || {}, ctx);
        await S.grist.upsert(p.table, recs, asList(p.cles), gconf(p));
        return items;
      } },
    'grist.delete': { cat: 'grist', label: 'Supprimer des lignes', desc: 'Supprime les lignes désignées.', fields: [{ name: 'table', label: 'Table', required: true }, { name: 'id', label: 'Identifiant de ligne', default: '{{ $json.id }}', required: true }, ...gristConn],
      batch: async (items, node, ctx) => { const p = A.resolveParams(node.params, items[0] || {}, ctx); await S.grist.remove(p.table, items.map((it) => A.resolveParams(node.params, it, ctx).id), gconf(p)); return items; } },

    /* ---------------- Logique ---------------- */
    'logic.if': { cat: 'logic', label: 'Condition (si… alors)', desc: 'Oriente chaque élément vers la sortie « vrai » ou « faux ».', outputs: ['vrai', 'faux'], fields: condFields,
      batch: async (items, node, ctx) => { const o = { vrai: [], faux: [] }; items.forEach((it) => { const p = A.resolveParams(node.params, it, ctx); (testCond(it, p, ctx) ? o.vrai : o.faux).push(it); }); return o; } },
    'logic.switch': { cat: 'logic', label: 'Aiguillage (selon valeur)', desc: 'Oriente selon la valeur d’un champ vers 3 sorties + « autre ».', outputs: ['1', '2', '3', 'autre'], fields: [{ name: 'champ', label: 'Valeur', required: true, placeholder: '{{ $json.priorite }}' }, { name: 'v1', label: 'Valeur sortie 1' }, { name: 'v2', label: 'Valeur sortie 2' }, { name: 'v3', label: 'Valeur sortie 3' }],
      batch: async (items, node, ctx) => { const o = { 1: [], 2: [], 3: [], autre: [] }; items.forEach((it) => { const p = A.resolveParams(node.params, it, ctx); const v = String(p.champ); (v === String(p.v1) ? o[1] : v === String(p.v2) ? o[2] : v === String(p.v3) ? o[3] : o.autre).push(it); }); return o; } },
    'logic.filter': { cat: 'logic', label: 'Filtrer', desc: 'Ne garde que les éléments qui respectent la condition.', fields: condFields,
      each: (it, p, ctx) => { return testCond(it, p, ctx) ? it : null; } },
    'logic.set': { cat: 'logic', label: 'Définir des champs', desc: 'Ajoute ou remplace des champs de chaque élément.', fields: [{ name: 'champs', label: 'Champs (JSON)', type: 'textarea', required: true, placeholder: '{"nomComplet": "{{ $json.prenom }} {{ $json.nom }}", "traite": true}' }, { name: 'seul', label: 'Ne garder que ces champs', type: 'checkbox' }],
      batch: async (items, node, ctx) => items.map((it) => { const v = A.resolveJSON(node.params.champs, it, ctx); return node.params.seul ? v : Object.assign({}, it, v); }) },
    'logic.rename': { cat: 'logic', label: 'Renommer / mapper des champs', desc: 'Correspondance ancien nom → nouveau nom (une par ligne : ancien=nouveau).', fields: [{ name: 'map', label: 'Correspondances', type: 'textarea', placeholder: 'Nom_complet=nom\nCourriel=email' }],
      each: (it, p) => { const o = Object.assign({}, it); String(p.map || '').split('\n').forEach((l) => { const [a, b] = l.split('=').map((x) => x && x.trim()); if (a && b && a in o) { o[b] = o[a]; delete o[a]; } }); return o; } },
    'logic.code': { cat: 'logic', label: 'Code JavaScript', desc: 'Transforme librement la liste « items ». Doit renvoyer un tableau d’objets.', fields: [{ name: 'code', label: 'Code', type: 'textarea', rows: 10, required: true, default: '// items : tableau des éléments reçus\n// $node("Nom") : sortie d’un autre nœud ; S : utilitaires de la suite\nreturn items.map(item => ({ ...item, traiteLe: new Date().toISOString() }));' }],
      batch: async (items, node, ctx) => { const fn = new Function('items', '$node', 'S', '$vars', `return (async () => { ${node.params.code} })();`); const r = await fn(S.clone(items), ctx.nodeRef, S, ctx.vars); if (!Array.isArray(r)) throw new Error('Le code doit renvoyer un tableau'); return r.map((x) => (x && typeof x === 'object' ? x : { valeur: x })); } },
    'logic.split': { cat: 'logic', label: 'Éclater une liste', desc: 'Crée un élément par entrée d’un champ tableau.', fields: [{ name: 'champ', label: 'Champ tableau', required: true, placeholder: 'destinataires' }, { name: 'garder', label: 'Conserver les autres champs', type: 'checkbox', default: true }],
      each: (it, p) => { let arr = S.get(it, p.champ); if (typeof arr === 'string') arr = asList(arr); if (!Array.isArray(arr)) return []; return arr.map((v) => Object.assign(p.garder ? Object.assign({}, it) : {}, v && typeof v === 'object' ? v : { valeur: v })); } },
    'logic.aggregate': { cat: 'logic', label: 'Regrouper', desc: 'Regroupe tous les éléments en un seul (liste + nombre), éventuellement par champ.', fields: [{ name: 'par', label: 'Regrouper par (champ, facultatif)' }, { name: 'texte', label: 'Ligne de texte par élément (facultatif)', placeholder: '- {{ $json.titre }} ({{ $json.lien }})', hint: 'Produit un champ « texte » concaténé' }],
      batch: async (items, node, ctx) => {
        const groups = {};
        items.forEach((it) => { const k = node.params.par ? String(S.get(it, node.params.par)) : '_'; (groups[k] = groups[k] || []).push(it); });
        return Object.entries(groups).map(([k, arr]) => ({ groupe: node.params.par ? k : undefined, nombre: arr.length, elements: arr, texte: node.params.texte ? arr.map((it) => A.resolve(node.params.texte, A.scope(it, ctx))).join('\n') : undefined }));
      } },
    'logic.sort': { cat: 'logic', label: 'Trier', desc: 'Trie les éléments selon un champ.', fields: [{ name: 'champ', label: 'Champ', required: true }, { name: 'ordre', label: 'Ordre', type: 'select', required: true, options: ['croissant', 'décroissant'], default: 'croissant' }],
      batch: async (items, node) => { const k = node.params.champ, d = node.params.ordre === 'décroissant' ? -1 : 1; return items.slice().sort((a, b) => (S.get(a, k) > S.get(b, k) ? d : S.get(a, k) < S.get(b, k) ? -d : 0)); } },
    'logic.limit': { cat: 'logic', label: 'Limiter', desc: 'Ne garde que les N premiers éléments.', fields: [{ name: 'n', label: 'Nombre', type: 'number', default: 10 }],
      batch: async (items, node) => items.slice(0, num(node.params.n, 10)) },
    'logic.dedupe': { cat: 'logic', label: 'Dédoublonner', desc: 'Supprime les doublons selon un champ (ou l’élément entier).', fields: [{ name: 'champ', label: 'Champ (facultatif)' }, { name: 'memoire', label: 'Mémoriser entre exécutions (ne traiter qu’une fois)', type: 'checkbox' }],
      batch: async (items, node, ctx) => {
        const st = ctx.state(node); const vus = new Set(node.params.memoire ? st.vus || [] : []);
        const out = items.filter((it) => { const k = node.params.champ ? String(S.get(it, node.params.champ)) : JSON.stringify(it); if (vus.has(k)) return false; vus.add(k); return true; });
        if (node.params.memoire && !ctx.test) st.vus = [...vus].slice(-2000);
        return out;
      } },
    'logic.wait': { cat: 'logic', label: 'Attendre', desc: 'Marque une pause (secondes).', fields: [{ name: 's', label: 'Durée (secondes)', type: 'number', default: 2 }],
      batch: async (items, node) => { await S.sleep(num(node.params.s, 2) * 1000); return items; } },
    'logic.merge': { cat: 'logic', label: 'Fusionner', desc: 'Attend toutes ses entrées puis les réunit (concaténation ou combinaison par position).', merge: true, fields: [{ name: 'mode', label: 'Mode', type: 'select', required: true, options: [{ value: 'concat', label: 'Mettre bout à bout' }, { value: 'pos', label: 'Combiner par position' }], default: 'concat' }],
      batch: async (items, node, ctx, inputs) => {
        if (node.params.mode !== 'pos') return items;
        const n = Math.max(...inputs.map((x) => x.length)); const out = [];
        for (let i = 0; i < n; i++) out.push(Object.assign({}, ...inputs.map((x) => x[i] || {})));
        return out;
      } },
    'logic.date': { cat: 'logic', label: 'Dates', desc: 'Calcule une date (ajout de jours ouvrés, formatage).', fields: [{ name: 'date', label: 'Date de départ', default: '{{ $now.toISOString() }}' }, { name: 'jours', label: 'Ajouter (jours)', type: 'number', default: 0 }, { name: 'ouvres', label: 'Jours ouvrés', type: 'checkbox' }, { name: 'champ', label: 'Champ résultat', default: 'date' }],
      each: (it, p) => { const d0 = new Date(p.date); const d = p.ouvres ? S.addWorkDays(d0, num(p.jours, 0)) : S.addDays(d0, num(p.jours, 0)); return Object.assign({}, it, { [p.champ || 'date']: S.isoDate(d), [(p.champ || 'date') + 'Fr']: S.fmtDate(d), [(p.champ || 'date') + 'Long']: S.fmtLong(d) }); } },
    'logic.template': { cat: 'logic', label: 'Composer un texte', desc: 'Produit un texte (message, corps de courriel…) à partir d’un gabarit.', fields: [{ name: 'texte', label: 'Gabarit', type: 'textarea', rows: 8, required: true, placeholder: 'Bonjour {{ $json.nom }},\n\nVotre demande n°{{ $json.id }} a bien été enregistrée.' }, { name: 'champ', label: 'Champ résultat', default: 'texte' }],
      each: (it, p) => Object.assign({}, it, { [p.champ || 'texte']: p.texte }) },
    'logic.stop': { cat: 'logic', label: 'Arrêter avec erreur', desc: 'Interrompt le scénario si des éléments arrivent ici.', fields: [{ name: 'message', label: 'Message', default: 'Arrêt demandé' }],
      each: (it, p) => { throw new Error(p.message); } },

    /* ---------------- Web & API ---------------- */
    'http.request': { cat: 'http', label: 'Requête HTTP', desc: 'Appelle n’importe quelle API REST.', fields: [{ name: 'methode', label: 'Méthode', type: 'select', required: true, options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' }, { name: 'url', label: 'URL', required: true, full: true }, { name: 'entetes', label: 'En-têtes (JSON)', type: 'textarea', rows: 2, placeholder: '{"Accept": "application/json"}' }, { name: 'corps', label: 'Corps (JSON ou texte)', type: 'textarea', rows: 4 }, credField(), { name: 'proxy', label: 'Proxy CORS', type: 'select', required: true, options: ['auto', 'oui', 'non'], default: 'auto' }, { name: 'sortie', label: 'Résultat', type: 'select', required: true, options: [{ value: 'champ', label: 'Ajouter dans le champ « reponse »' }, { value: 'remplacer', label: 'Remplacer l’élément par la réponse' }, { value: 'eclater', label: 'Un élément par entrée (si la réponse est une liste)' }], default: 'champ' }, { name: 'chemin', label: 'Chemin dans la réponse (facultatif)', placeholder: 'data.results' }],
      each: async (it, p) => {
        const headers = Object.assign({}, A.authHeaders(p.cred), json(p.entetes, {}));
        let body;
        if (p.corps && p.methode !== 'GET') { body = p.corps; if (!headers['Content-Type'] && /^\s*[[{]/.test(body)) headers['Content-Type'] = 'application/json'; }
        const r = await http(p.url, { method: p.methode, headers, body }, p.proxy);
        let d = p.chemin ? S.get(r.data, p.chemin) : r.data;
        if (p.sortie === 'remplacer') return d && typeof d === 'object' && !Array.isArray(d) ? d : { reponse: d };
        if (p.sortie === 'eclater') return (Array.isArray(d) ? d : [d]).map((x) => (x && typeof x === 'object' ? x : { valeur: x }));
        return Object.assign({}, it, { reponse: d, statutHttp: r.status });
      } },
    'http.rss': { cat: 'http', label: 'Lire un flux RSS', desc: 'Récupère les articles d’un flux RSS ou Atom.', fields: [{ name: 'url', label: 'Adresse du flux', required: true, full: true }, { name: 'max', label: 'Nombre maximum', type: 'number', default: 20 }],
      batch: async (items, node, ctx) => { const p = A.resolveParams(node.params, items[0] || {}, ctx); const r = await S.fetch(p.url); return parseFeed(await r.text()).slice(0, num(p.max, 20)); } },
    'http.webhook': { cat: 'http', label: 'Envoyer un webhook', desc: 'Envoie l’élément (ou un JSON) en POST à une adresse.', fields: [{ name: 'url', label: 'URL', required: true, full: true }, { name: 'corps', label: 'Corps JSON (vide = élément entier)', type: 'textarea' }, credField()],
      each: async (it, p, ctx) => { const body = p.corps ? JSON.stringify(A.resolveJSON(ctx.node.params.corps, it, ctx)) : JSON.stringify(it); const r = await http(p.url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, A.authHeaders(p.cred)), body }, 'non'); return Object.assign({}, it, { reponseWebhook: r.data }); } },
    'http.csv': { cat: 'http', label: 'Télécharger en CSV', desc: 'Produit un fichier CSV (séparateur ;) des éléments.', fields: [{ name: 'nom', label: 'Nom du fichier', default: 'export.csv' }],
      batch: async (items, node, ctx) => { if (!ctx.test || true) S.download(node.params.nom || 'export.csv', S.toCSV(items.map(A.flat)), 'text/csv;charset=utf-8'); return items; } },
    'http.json': { cat: 'http', label: 'Télécharger en JSON', desc: 'Produit un fichier JSON des éléments.', fields: [{ name: 'nom', label: 'Nom du fichier', default: 'export.json' }],
      batch: async (items, node) => { S.download(node.params.nom || 'export.json', JSON.stringify(items, null, 2), 'application/json'); return items; } },

    /* ---------------- Messagerie ---------------- */
    'mail.mailto': { cat: 'mail', label: 'Préparer un courriel (logiciel de messagerie)', desc: 'Ouvre un brouillon dans la messagerie du poste (Outlook, Thunderbird…). Aucune clé nécessaire.', fields: [{ name: 'a', label: 'Destinataire(s)', required: true }, { name: 'cc', label: 'Copie' }, { name: 'objet', label: 'Objet', required: true, full: true }, { name: 'corps', label: 'Message', type: 'textarea', rows: 6 }],
      each: (it, p) => { const u = `mailto:${encodeURIComponent(p.a).replace(/%40/g, '@').replace(/%2C/g, ',')}?subject=${encodeURIComponent(p.objet)}${p.cc ? '&cc=' + encodeURIComponent(p.cc) : ''}&body=${encodeURIComponent(p.corps || '')}`; window.open(u, '_blank'); return Object.assign({}, it, { lienMail: u }); } },
    'mail.brevo': { cat: 'mail', label: 'Courriel via Brevo (API)', desc: 'Envoi transactionnel via l’API Brevo (identifiant : en-tête « api-key »).', fields: [credField('Type « En-tête » avec le nom api-key'), { name: 'deNom', label: 'Nom de l’expéditeur', default: S.settings().entite }, { name: 'deMail', label: 'Adresse de l’expéditeur', required: true }, { name: 'a', label: 'Destinataire(s)', required: true }, { name: 'objet', label: 'Objet', required: true, full: true }, { name: 'corps', label: 'Message (HTML autorisé)', type: 'textarea', rows: 6 }],
      each: async (it, p) => { const r = await http('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, A.authHeaders(p.cred)), body: JSON.stringify({ sender: { name: p.deNom, email: p.deMail }, to: asList(p.a).map((email) => ({ email })), subject: p.objet, htmlContent: /<[a-z]/i.test(p.corps) ? p.corps : '<p>' + S.esc(p.corps).replace(/\n/g, '<br>') + '</p>' }) }); return Object.assign({}, it, { envoiMail: r.data }); } },
    'mail.api': { cat: 'mail', label: 'Courriel via passerelle HTTP', desc: 'Pour une passerelle d’envoi interne ou un service (Mailjet, SendGrid…) : corps JSON libre.', fields: [{ name: 'url', label: 'URL de la passerelle', required: true, full: true }, credField(), { name: 'corps', label: 'Corps JSON', type: 'textarea', rows: 6, required: true, placeholder: '{"to": "{{ $json.email }}", "subject": "…", "text": "…"}' }],
      each: async (it, p, ctx) => { const r = await http(p.url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, A.authHeaders(p.cred)), body: JSON.stringify(A.resolveJSON(ctx.node.params.corps, it, ctx)) }); return Object.assign({}, it, { envoiMail: r.data }); } },

    /* ---------------- Téléphone & SMS ---------------- */
    'tel.brevo': { cat: 'tel', label: 'SMS via Brevo', desc: 'Envoi de SMS transactionnel (numéro au format international 33…).', fields: [credField('En-tête api-key'), { name: 'emetteur', label: 'Émetteur (11 caractères max)', default: 'DRAAF' }, { name: 'numero', label: 'Numéro', required: true, default: '{{ $json.telephone }}' }, { name: 'message', label: 'Message', type: 'textarea', required: true }],
      each: async (it, p) => { const tel = A.telIntl(p.numero); const r = await http('https://api.brevo.com/v3/transactionalSMS/sms', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, A.authHeaders(p.cred)), body: JSON.stringify({ sender: p.emetteur, recipient: tel, content: p.message, type: 'transactional' }) }); return Object.assign({}, it, { envoiSms: r.data }); } },
    'tel.gateway': { cat: 'tel', label: 'SMS via passerelle HTTP', desc: 'Passerelle SMS interne ou opérateur : l’URL peut contenir {{ }} (numéro, message).', fields: [{ name: 'methode', label: 'Méthode', type: 'select', required: true, options: ['GET', 'POST'], default: 'POST' }, { name: 'url', label: 'URL', required: true, full: true, placeholder: 'https://sms.exemple.gouv.fr/send?to={{ $json.telephone }}' }, credField(), { name: 'corps', label: 'Corps (POST)', type: 'textarea', placeholder: '{"to": "{{ $json.telephone }}", "text": "Rappel : …"}' }],
      each: async (it, p) => { const r = await http(p.url, { method: p.methode, headers: Object.assign({ 'Content-Type': 'application/json' }, A.authHeaders(p.cred)), body: p.methode === 'POST' ? p.corps : undefined }); return Object.assign({}, it, { envoiSms: r.data }); } },
    'tel.free': { cat: 'tel', label: 'SMS à soi-même (Free Mobile)', desc: 'Notification SMS personnelle via l’option gratuite de Free Mobile.', fields: [{ name: 'user', label: 'Identifiant', required: true }, { name: 'cred', label: 'Clé (identifiant de type Jeton)', type: 'select', options: () => A.credOptions() }, { name: 'message', label: 'Message', type: 'textarea', required: true }],
      each: async (it, p) => { await http(`https://smsapi.free-mobile.fr/sendmsg?user=${encodeURIComponent(p.user)}&pass=${encodeURIComponent(A.credSecret(p.cred))}&msg=${encodeURIComponent(p.message)}`, {}, 'auto'); return it; } },
    'tel.call': { cat: 'tel', label: 'Lien d’appel téléphonique', desc: 'Ajoute un lien tel: cliquable (et l’ouvre si demandé, pour softphone ou mobile).', fields: [{ name: 'numero', label: 'Numéro', required: true, default: '{{ $json.telephone }}' }, { name: 'ouvrir', label: 'Ouvrir immédiatement (1er élément)', type: 'checkbox' }],
      each: (it, p, ctx) => { const n = String(p.numero).replace(/[^\d+]/g, ''); const u = 'tel:' + n; if (p.ouvrir && !ctx.ouvert) { ctx.ouvert = true; location.href = u; } return Object.assign({}, it, { lienTel: u, telephoneNormalise: A.telIntl(n) }); } },

    /* ---------------- Messagerie instantanée & notifications ---------------- */
    'chat.tchap': { cat: 'chat', label: 'Message Tchap / Matrix', desc: 'Publie dans un salon Tchap (protocole Matrix). Identifiant : jeton d’accès du compte robot.', fields: [{ name: 'serveur', label: 'Serveur Matrix', required: true, default: 'https://matrix.agent.agriculture.tchap.gouv.fr', full: true }, credField('Type « Jeton Bearer » : jeton d’accès Matrix'), { name: 'salon', label: 'Identifiant du salon', required: true, placeholder: '!abcdef:agent.agriculture.tchap.gouv.fr' }, { name: 'message', label: 'Message', type: 'textarea', required: true }],
      each: async (it, p) => { const txn = S.uid('t'); const r = await http(`${p.serveur.replace(/\/$/, '')}/_matrix/client/v3/rooms/${encodeURIComponent(p.salon)}/send/m.room.message/${txn}`, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, A.authHeaders(p.cred)), body: JSON.stringify({ msgtype: 'm.text', body: p.message }) }, 'non'); return Object.assign({}, it, { tchap: r.data }); } },
    'chat.webhook': { cat: 'chat', label: 'Mattermost / Slack / Teams / Discord', desc: 'Message via un « webhook entrant » de l’outil de discussion.', fields: [{ name: 'outil', label: 'Outil', type: 'select', required: true, options: ['Mattermost', 'Slack', 'Rocket.Chat', 'Microsoft Teams', 'Discord', 'Google Chat'], default: 'Mattermost' }, { name: 'url', label: 'URL du webhook', required: true, full: true }, { name: 'message', label: 'Message', type: 'textarea', required: true }],
      each: async (it, p) => { const body = p.outil === 'Discord' ? { content: p.message } : { text: p.message }; await http(p.url, { method: 'POST', headers: { 'Content-Type': p.outil === 'Microsoft Teams' || p.outil === 'Google Chat' ? 'application/json' : 'application/json' }, body: JSON.stringify(body) }, 'non'); return it; } },
    'chat.ntfy': { cat: 'chat', label: 'Notification mobile (ntfy)', desc: 'Notification poussée sur téléphone via ntfy (service public ou serveur interne).', fields: [{ name: 'serveur', label: 'Serveur', default: 'https://ntfy.sh', required: true }, { name: 'sujet', label: 'Sujet (topic)', required: true }, { name: 'titre', label: 'Titre' }, { name: 'message', label: 'Message', type: 'textarea', required: true }, { name: 'priorite', label: 'Priorité', type: 'select', required: true, options: ['1', '2', '3', '4', '5'], default: '3' }, { name: 'lien', label: 'Lien au clic' }, credField()],
      each: async (it, p) => { const headers = Object.assign({ Priority: p.priorite }, A.authHeaders(p.cred)); if (p.titre) headers.Title = A.ascii(p.titre); if (p.lien) headers.Click = p.lien; await http(`${p.serveur.replace(/\/$/, '')}/${encodeURIComponent(p.sujet)}`, { method: 'POST', headers, body: p.message }, 'non'); return it; } },
    'chat.browser': { cat: 'chat', label: 'Notification du poste', desc: 'Notification système sur ce poste (autorisation demandée la 1re fois).', fields: [{ name: 'titre', label: 'Titre', required: true }, { name: 'message', label: 'Message', type: 'textarea' }],
      each: async (it, p) => { const ok = await S.notify(p.titre, p.message); if (!ok) S.toast(p.titre + ' — ' + (p.message || ''), 'info', 8000); return it; } },
    'chat.toast': { cat: 'chat', label: 'Message à l’écran', desc: 'Affiche un bandeau dans l’application.', fields: [{ name: 'message', label: 'Message', required: true }, { name: 'type', label: 'Type', type: 'select', required: true, options: ['info', 'success', 'warning', 'error'], default: 'info' }],
      each: (it, p) => { S.toast(p.message, p.type); return it; } },

    /* ---------------- Contacts & annuaires ---------------- */
    'contact.annuaire': { cat: 'contact', label: 'Annuaire de l’administration', desc: 'Recherche un service public (Service-Public.fr) : adresse, téléphone, courriel, site.', fields: [{ name: 'q', label: 'Recherche', required: true, placeholder: 'DDTM Ille-et-Vilaine' }, { name: 'max', label: 'Nombre maximum', type: 'number', default: 5 }],
      each: async (it, p) => {
        const u = `https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records?where=${encodeURIComponent('"' + p.q.replace(/"/g, '') + '"')}&limit=${num(p.max, 5)}`;
        const j = (await http(u)).data;
        const pj = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return v; } };
        return (j.results || []).map((r) => { const ad = (pj(r.adresse) || [])[0] || {}; const tel = (pj(r.telephone) || [])[0] || {}; const site = (pj(r.site_internet) || [])[0] || {};
          return { nom: r.nom, adresse: [ad.numero_voie, ad.complement1, ad.code_postal, ad.nom_commune].filter(Boolean).join(' '), telephone: tel.valeur || '', email: r.adresse_courriel || '', site: site.valeur || '', lat: ad.latitude ? Number(ad.latitude) : undefined, lon: ad.longitude ? Number(ad.longitude) : undefined, siret: r.siret || '', source: 'Annuaire de l’administration' }; });
      } },
    'contact.entreprise': { cat: 'contact', label: 'Recherche d’entreprises (SIREN/SIRET)', desc: 'API Recherche d’entreprises : raison sociale, adresse, NAF, dirigeants, coordonnées.', fields: [{ name: 'q', label: 'Nom, SIREN ou SIRET', required: true, default: '{{ $json.siret }}' }, { name: 'max', label: 'Nombre maximum', type: 'number', default: 1 }, { name: 'fusion', label: 'Fusionner avec l’élément d’origine', type: 'checkbox', default: true }],
      each: async (it, p) => {
        const j = (await http(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(p.q)}&per_page=${num(p.max, 1)}`)).data;
        const res = (j.results || []).map((r) => ({ siren: r.siren, siret: r.siege?.siret, raisonSociale: r.nom_complet, naf: r.activite_principale, adresse: r.siege?.adresse, codePostal: r.siege?.code_postal, commune: r.siege?.libelle_commune, lat: Number(r.siege?.latitude) || undefined, lon: Number(r.siege?.longitude) || undefined, etat: r.etat_administratif, dirigeants: (r.dirigeants || []).map((d) => [d.prenoms, d.nom, d.denomination].filter(Boolean).join(' ')).join(', '), effectif: r.tranche_effectif_salarie }));
        if (p.fusion) return res.length ? res.map((x) => Object.assign({}, it, x)) : Object.assign({}, it, { entrepriseTrouvee: false });
        return res;
      } },
    'contact.vcard': { cat: 'contact', label: 'Fiche contact (vCard)', desc: 'Produit une vCard par élément et télécharge un fichier .vcf importable dans Outlook ou un téléphone.', fields: [{ name: 'nom', label: 'Nom', required: true, default: '{{ $json.nom }}' }, { name: 'org', label: 'Organisation', default: '{{ $json.organisation }}' }, { name: 'tel', label: 'Téléphone', default: '{{ $json.telephone }}' }, { name: 'email', label: 'Courriel', default: '{{ $json.email }}' }, { name: 'adresse', label: 'Adresse', default: '{{ $json.adresse }}' }, { name: 'fichier', label: 'Télécharger le fichier .vcf', type: 'checkbox', default: true }],
      batch: async (items, node, ctx) => {
        const out = items.map((it) => { const p = A.resolveParams(node.params, it, ctx); const v = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + p.nom, 'N:' + p.nom + ';;;;', p.org ? 'ORG:' + p.org : '', p.tel ? 'TEL;TYPE=WORK,VOICE:' + p.tel : '', p.email ? 'EMAIL;TYPE=WORK:' + p.email : '', p.adresse ? 'ADR;TYPE=WORK:;;' + p.adresse + ';;;;' : '', 'END:VCARD'].filter(Boolean).join('\r\n'); return Object.assign({}, it, { vcard: v }); });
        if (node.params.fichier) S.download('contacts.vcf', out.map((x) => x.vcard).join('\r\n'), 'text/vcard');
        return out;
      } },
    'contact.crise': { cat: 'contact', label: 'Ajouter à l’annuaire de crise', desc: 'Crée un contact dans l’application Gestion de crise.', fields: [{ name: 'nom', label: 'Nom', required: true, default: '{{ $json.nom }}' }, { name: 'fonction', label: 'Fonction / organisme', default: '{{ $json.organisation }}' }, { name: 'tel', label: 'Téléphone', default: '{{ $json.telephone }}' }, { name: 'email', label: 'Courriel', default: '{{ $json.email }}' }, { name: 'groupe', label: 'Groupe', default: 'Partenaires' }],
      each: (it, p) => { const c = S.suite('crise', 'contacts').add({ nom: p.nom, fonction: p.fonction, tel: p.tel, email: p.email, groupe: p.groupe }); return Object.assign({}, it, { contactId: c.id }); } },

    /* ---------------- Cartographie ---------------- */
    'geo.geocode': { cat: 'geo', label: 'Géocoder une adresse', desc: 'Géoplateforme IGN / Base Adresse Nationale : ajoute lat, lon, code INSEE, score.', fields: [{ name: 'adresse', label: 'Adresse', required: true, default: '{{ $json.adresse }}' }, { name: 'min', label: 'Score minimal (0-1)', type: 'number', default: 0.4, step: 0.05 }],
      each: async (it, p) => { const r = (await S.geocode(p.adresse, 1))[0]; if (!r || r.score < num(p.min, 0)) return Object.assign({}, it, { geocode: false }); return Object.assign({}, it, { lat: r.lat, lon: r.lon, adresseNormalisee: r.label, codeInsee: r.citycode, commune: r.city, codePostal: r.postcode, scoreGeocodage: Math.round(r.score * 100) / 100, geocode: true }); } },
    'geo.reverse': { cat: 'geo', label: 'Adresse d’un point', desc: 'Géocodage inverse : adresse la plus proche des coordonnées.', fields: [{ name: 'lat', label: 'Latitude', required: true, default: '{{ $json.lat }}' }, { name: 'lon', label: 'Longitude', required: true, default: '{{ $json.lon }}' }],
      each: async (it, p) => { const r = await S.reverse(p.lat, p.lon); return Object.assign({}, it, r ? { adresse: r.label, codeInsee: r.citycode, commune: r.city, codePostal: r.postcode } : {}); } },
    'geo.commune': { cat: 'geo', label: 'Informations commune', desc: 'API Géo : population, département, EPCI, région, centre.', fields: [{ name: 'code', label: 'Code INSEE', placeholder: '{{ $json.codeInsee }}' }, { name: 'nom', label: 'ou nom de commune' }],
      each: async (it, p) => { const q = p.code ? `code=${encodeURIComponent(p.code)}` : `nom=${encodeURIComponent(p.nom)}`; const j = (await http(`https://geo.api.gouv.fr/communes?${q}&fields=nom,code,codesPostaux,population,surface,departement,region,epci,centre&limit=1`)).data; const c = j[0]; if (!c) return Object.assign({}, it, { communeTrouvee: false }); return Object.assign({}, it, { commune: c.nom, codeInsee: c.code, codesPostaux: c.codesPostaux, population: c.population, departement: c.departement?.nom, codeDepartement: c.departement?.code, region: c.region?.nom, epci: c.epci?.nom, latCommune: c.centre?.coordinates[1], lonCommune: c.centre?.coordinates[0] }); } },
    'geo.cadastre': { cat: 'geo', label: 'Parcelle cadastrale d’un point', desc: 'API Carto IGN : section, numéro, contenance de la parcelle sous le point.', fields: [{ name: 'lat', label: 'Latitude', required: true, default: '{{ $json.lat }}' }, { name: 'lon', label: 'Longitude', required: true, default: '{{ $json.lon }}' }],
      each: async (it, p) => { const g = JSON.stringify({ type: 'Point', coordinates: [Number(p.lon), Number(p.lat)] }); const j = (await http(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(g)}`)).data; const f = (j.features || [])[0]; return Object.assign({}, it, f ? { parcelle: f.properties.idu, section: f.properties.section, numeroParcelle: f.properties.numero, contenance: f.properties.contenance, communeParcelle: f.properties.nom_com } : { parcelle: null }); } },
    'geo.distance': { cat: 'geo', label: 'Distance entre deux points', desc: 'Distance à vol d’oiseau (km).', fields: [{ name: 'lat1', label: 'Latitude 1', default: '{{ $json.lat }}' }, { name: 'lon1', label: 'Longitude 1', default: '{{ $json.lon }}' }, { name: 'lat2', label: 'Latitude 2', placeholder: '48.1113' }, { name: 'lon2', label: 'Longitude 2', placeholder: '-1.6800' }, { name: 'max', label: 'Ne garder que si ≤ (km, facultatif)', type: 'number' }],
      each: (it, p) => { const R = 6371, r = Math.PI / 180; const dLa = (p.lat2 - p.lat1) * r, dLo = (p.lon2 - p.lon1) * r; const a = Math.sin(dLa / 2) ** 2 + Math.cos(p.lat1 * r) * Math.cos(p.lat2 * r) * Math.sin(dLo / 2) ** 2; const d = Math.round(2 * R * Math.asin(Math.sqrt(a)) * 100) / 100; if (p.max !== '' && p.max != null && d > Number(p.max)) return null; return Object.assign({}, it, { distanceKm: d }); } },
    'geo.carte': { cat: 'geo', label: 'Afficher sur la carte', desc: 'Envoie les éléments géolocalisés (lat/lon) dans une couche de l’application Cartographie.', fields: [{ name: 'couche', label: 'Nom de la couche', required: true, default: 'Automatisation' }, { name: 'titre', label: 'Titre des points', default: '{{ $json.nom }}' }, { name: 'couleur', label: 'Couleur', type: 'color', default: '#000091' }, { name: 'remplacer', label: 'Remplacer le contenu de la couche', type: 'checkbox', default: true }],
      batch: async (items, node, ctx) => {
        const feats = items.filter((it) => it.lat != null && it.lon != null && !isNaN(it.lat)).map((it) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [Number(it.lon), Number(it.lat)] }, properties: Object.assign({}, A.flat(it), { titre: A.resolveParams({ t: node.params.titre }, it, ctx).t }) }));
        const layers = S.load('cartographie:couches', []);
        let l = layers.find((x) => x.nom === node.params.couche && x.type === 'geojson-local');
        if (!l) { l = { id: S.uid(), nom: node.params.couche, type: 'geojson-local', visible: true, couleur: node.params.couleur, data: { type: 'FeatureCollection', features: [] } }; layers.push(l); }
        l.couleur = node.params.couleur || l.couleur;
        l.data.features = node.params.remplacer ? feats : l.data.features.concat(feats);
        l.majLe = new Date().toISOString();
        S.save('cartographie:couches', layers);
        ctx.log(`${feats.length} point(s) envoyés dans la couche « ${l.nom} »`);
        return items;
      } },

    /* ---------------- Visio & agenda ---------------- */
    'visio.link': { cat: 'visio', label: 'Créer une salle de visioconférence', desc: 'Génère un lien de réunion (Visio de l’État, Jitsi, BigBlueButton, URL personnalisée).', fields: [{ name: 'service', label: 'Service', type: 'select', required: true, options: [{ value: 'https://visio.numerique.gouv.fr/', label: 'Visio (La Suite numérique)' }, { value: 'https://webconf.numerique.gouv.fr/', label: 'Webconf de l’État' }, { value: 'https://meet.jit.si/', label: 'Jitsi Meet (public)' }, { value: 'perso', label: 'Adresse personnalisée' }], default: 'https://visio.numerique.gouv.fr/' }, { name: 'base', label: 'Adresse personnalisée (préfixe)' }, { name: 'nom', label: 'Nom de la réunion', default: '{{ $json.titre }}' }],
      each: (it, p) => { const base = p.service === 'perso' ? p.base : p.service; const salle = (S.slug(p.nom || 'reunion').slice(0, 30) || 'reunion') + '-' + Math.random().toString(36).slice(2, 8); return Object.assign({}, it, { lienVisio: base.replace(/\/?$/, '/') + salle }); } },
    'visio.ics': { cat: 'visio', label: 'Invitation agenda (.ics)', desc: 'Produit une invitation importable dans Outlook / Thunderbird / agenda.', fields: [{ name: 'titre', label: 'Titre', required: true, default: '{{ $json.titre }}' }, { name: 'debut', label: 'Début', required: true, placeholder: '{{ $json.date }}T10:00' }, { name: 'duree', label: 'Durée (minutes)', type: 'number', default: 60 }, { name: 'lieu', label: 'Lieu / lien', default: '{{ $json.lienVisio }}' }, { name: 'desc', label: 'Description', type: 'textarea' }, { name: 'fichier', label: 'Télécharger le fichier', type: 'checkbox', default: true }],
      batch: async (items, node, ctx) => { const evs = items.map((it) => { const p = A.resolveParams(node.params, it, ctx); const d = new Date(p.debut); return { id: S.uid(), titre: p.titre, debut: d, fin: new Date(d.getTime() + num(p.duree, 60) * 60000), lieu: p.lieu, desc: p.desc }; }); const ics = S.ics(evs, 'Invitations'); if (node.params.fichier) S.download('invitation.ics', ics, 'text/calendar'); return items.map((it, i) => Object.assign({}, it, { ics: S.ics([evs[i]]) })); } },

    /* ---------------- Communication & intranet ---------------- */
    'intranet.wordpress': { cat: 'intranet', label: 'Publier un article (WordPress)', desc: 'Crée un article via l’API REST WordPress (identifiant : Basique avec mot de passe d’application).', fields: [{ name: 'site', label: 'Adresse du site', required: true, placeholder: 'https://intranet.exemple.fr' }, credField('Type « Basique »'), { name: 'titre', label: 'Titre', required: true, default: '{{ $json.titre }}' }, { name: 'contenu', label: 'Contenu (HTML)', type: 'textarea', rows: 6 }, { name: 'statut', label: 'Statut', type: 'select', required: true, options: [{ value: 'draft', label: 'Brouillon' }, { value: 'publish', label: 'Publié' }], default: 'draft' }],
      each: async (it, p) => { const r = await http(p.site.replace(/\/$/, '') + '/wp-json/wp/v2/posts', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, A.authHeaders(p.cred)), body: JSON.stringify({ title: p.titre, content: p.contenu, status: p.statut }) }); return Object.assign({}, it, { articleId: r.data.id, articleLien: r.data.link }); } },
    'intranet.rss': { cat: 'intranet', label: 'Générer un flux RSS', desc: 'Produit un fichier RSS 2.0 (à déposer sur l’intranet) à partir des éléments.', fields: [{ name: 'titre', label: 'Titre du flux', required: true }, { name: 'lienSite', label: 'Lien du site' }, { name: 'champTitre', label: 'Champ titre', default: 'titre' }, { name: 'champLien', label: 'Champ lien', default: 'lien' }, { name: 'champResume', label: 'Champ résumé', default: 'resume' }],
      batch: async (items, node) => { const p = node.params; const x = (s) => S.esc(s); const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${x(p.titre)}</title><link>${x(p.lienSite || '')}</link><description>${x(p.titre)}</description>\n${items.map((it) => `<item><title>${x(S.get(it, p.champTitre))}</title><link>${x(S.get(it, p.champLien))}</link><guid>${x(S.get(it, p.champLien) || S.uid())}</guid><description>${x(S.get(it, p.champResume))}</description><pubDate>${new Date(it.date || Date.now()).toUTCString()}</pubDate></item>`).join('\n')}\n</channel></rss>`; S.download('flux.xml', rss, 'application/rss+xml'); return items; } },
    'intranet.bulletin': { cat: 'intranet', label: 'Lettre d’information (HTML)', desc: 'Met en forme les éléments en lettre d’information DSFR, prête à copier dans un courriel ou à imprimer.', fields: [{ name: 'titre', label: 'Titre', required: true, default: 'Lettre d’information' }, { name: 'intro', label: 'Introduction', type: 'textarea' }, { name: 'champTitre', label: 'Champ titre', default: 'titre' }, { name: 'champTexte', label: 'Champ texte', default: 'resume' }, { name: 'champLien', label: 'Champ lien', default: 'lien' }],
      batch: async (items, node) => { const p = node.params; const html = A.bulletinHTML(p.titre, p.intro, items.map((it) => ({ titre: S.get(it, p.champTitre), texte: S.get(it, p.champTexte), lien: S.get(it, p.champLien) }))); const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); } return [{ html, nombre: items.length }]; } },

    /* ---------------- Applications de la suite ---------------- */
    'suite.demande': { cat: 'suite', label: 'Créer une demande (Circuits)', desc: 'Ouvre une demande dans l’application Circuits de travail.', fields: [{ name: 'titre', label: 'Titre', required: true, default: '{{ $json.titre }}' }, { name: 'description', label: 'Description', type: 'textarea' }, { name: 'circuit', label: 'Nom du circuit (facultatif)' }, { name: 'demandeur', label: 'Demandeur', default: S.me() }, { name: 'echeance', label: 'Échéance (AAAA-MM-JJ)' }],
      each: (it, p) => { const circ = S.suite('circuits', 'modeles').list().find((m) => S.norm(m.nom) === S.norm(p.circuit)); const d = S.suite('circuits', 'demandes').add({ titre: p.titre, description: p.description, modeleId: circ ? circ.id : '', etape: 0, statut: 'en cours', demandeur: p.demandeur, echeance: p.echeance, priorite: 'normale', donnees: A.flat(it), historique: [{ date: new Date().toISOString(), qui: 'Automatisation', action: 'Création automatique' }] }); return Object.assign({}, it, { demandeId: d.id }); } },
    'suite.courrier': { cat: 'suite', label: 'Enregistrer un courrier', desc: 'Ajoute un courrier « arrivée » au registre de l’application Courrier.', fields: [{ name: 'objet', label: 'Objet', required: true, default: '{{ $json.titre }}' }, { name: 'correspondant', label: 'Expéditeur', default: '{{ $json.nom }}' }, { name: 'service', label: 'Service attributaire' }, { name: 'canal', label: 'Canal', type: 'select', required: true, options: ['Courriel', 'Postal', 'Formulaire en ligne', 'Téléphone', 'Autre'], default: 'Courriel' }],
      each: (it, p) => { const arr = S.suite('courrier', 'courriers').list(); const y = new Date().getFullYear(); const n = arr.filter((c) => c.sens === 'arrivee' && String(c.numero || '').includes('-' + y + '-')).length + 1; const c = S.suite('courrier', 'courriers').add({ sens: 'arrivee', numero: `A-${y}-${String(n).padStart(5, '0')}`, objet: p.objet, correspondant: p.correspondant, service: p.service, canal: p.canal, dateRecu: S.isoDate(new Date()), statut: 'enregistre', priorite: 'normale', historique: [{ date: new Date().toISOString(), qui: 'Automatisation', action: 'Enregistrement automatique' }] }); return Object.assign({}, it, { courrierNumero: c.numero }); } },
    'suite.maincourante': { cat: 'suite', label: 'Inscrire en main courante', desc: 'Ajoute une entrée horodatée à l’événement de crise en cours.', fields: [{ name: 'message', label: 'Message', type: 'textarea', required: true }, { name: 'source', label: 'Source', default: 'Automatisation' }, { name: 'categorie', label: 'Catégorie', type: 'select', required: true, options: ['Information', 'Décision', 'Action', 'Alerte', 'Point de situation'], default: 'Information' }, { name: 'important', label: 'Important', type: 'checkbox' }],
      each: (it, p) => { const evs = S.suite('crise', 'evenements').list().filter((e) => e.statut !== 'clos'); const ev = evs.sort((a, b) => (a.debut < b.debut ? 1 : -1))[0]; if (!ev) throw new Error('Aucun événement de crise ouvert dans l’application Gestion de crise'); S.suite('crise', 'mc').add({ evenementId: ev.id, date: new Date().toISOString(), source: p.source, categorie: p.categorie, message: p.message, important: !!p.important, auteur: 'Automatisation' }); return it; } },
    'suite.reservations': { cat: 'suite', label: 'Lire les réservations', desc: 'Réservations de l’application Réservation pour une date.', fields: [{ name: 'date', label: 'Date (AAAA-MM-JJ)', default: '{{ $now.toISOString().slice(0,10) }}' }, { name: 'statut', label: 'Statut', type: 'select', options: ['confirmee', 'demandee', 'annulee'] }],
      batch: async (items, node, ctx) => { const p = A.resolveParams(node.params, items[0] || {}, ctx); const res = S.suite('reservation', 'ressources').list(); return S.suite('reservation', 'reservations').list().filter((r) => S.isoDate(r.debut) === p.date && (!p.statut || r.statut === p.statut)).map((r) => { const x = res.find((z) => z.id === r.ressourceId) || {}; return { titre: r.titre, ressource: x.nom, site: x.site, debut: r.debut, fin: r.fin, heureDebut: S.hm(r.debut), heureFin: S.hm(r.fin), demandeur: r.demandeur, email: r.email, telephone: r.telephone, statut: r.statut, participants: r.participants }; }); } },
    'suite.veille': { cat: 'suite', label: 'Lire les articles de veille', desc: 'Articles de l’application Veille (filtrés par mot-clé, période, favoris).', fields: [{ name: 'motcle', label: 'Mot-clé' }, { name: 'jours', label: 'Des N derniers jours', type: 'number', default: 7 }, { name: 'favoris', label: 'Favoris uniquement', type: 'checkbox' }],
      batch: async (items, node) => { const p = node.params; const lim = Date.now() - num(p.jours, 7) * 86400000; return S.suite('veille', 'articles').list().filter((a) => new Date(a.date || a.creeLe).getTime() >= lim && (!p.favoris || a.favori) && (!p.motcle || S.norm(a.titre + ' ' + a.resume).includes(S.norm(p.motcle)))).map((a) => ({ titre: a.titre, lien: a.lien, date: a.date, resume: a.resume, source: a.source, favori: !!a.favori })); } },
    'suite.controle': { cat: 'suite', label: 'Planifier un contrôle', desc: 'Crée un contrôle à réaliser dans l’application Contrôles terrain.', fields: [{ name: 'etablissement', label: 'Établissement', required: true, default: '{{ $json.raisonSociale }}' }, { name: 'siret', label: 'SIRET', default: '{{ $json.siret }}' }, { name: 'adresse', label: 'Adresse', default: '{{ $json.adresse }}' }, { name: 'date', label: 'Date prévue (AAAA-MM-JJ)' }, { name: 'grille', label: 'Nom de la grille (facultatif)' }],
      each: (it, p) => { const g = S.suite('controles', 'grilles').list().find((x) => S.norm(x.nom) === S.norm(p.grille)); const c = S.suite('controles', 'controles').add({ etablissement: p.etablissement, siret: p.siret, adresse: p.adresse, lat: it.lat, lon: it.lon, datePrevue: p.date, grilleId: g ? g.id : '', statut: 'planifie', reponses: {} }); return Object.assign({}, it, { controleId: c.id }); } },

    /* ---------------- IA ---------------- */
    'ia.chat': { cat: 'ia', label: 'Assistant IA (API compatible OpenAI)', desc: 'Résumé, classement, rédaction… via Albert (DINUM), Mistral ou tout service compatible.', fields: [{ name: 'base', label: 'Adresse de l’API', required: true, default: 'https://albert.api.etalab.gouv.fr/v1', full: true }, credField('Type « Jeton Bearer »'), { name: 'modele', label: 'Modèle', required: true, default: 'albert-large' }, { name: 'systeme', label: 'Consigne système', type: 'textarea', rows: 2, default: 'Tu es un assistant de l’administration française. Réponds en français, de façon concise et factuelle.' }, { name: 'prompt', label: 'Demande', type: 'textarea', rows: 5, required: true, placeholder: 'Résume en 2 phrases : {{ $json.resume }}' }, { name: 'champ', label: 'Champ résultat', default: 'reponseIA' }, { name: 'json', label: 'Réponse attendue en JSON', type: 'checkbox' }],
      each: async (it, p) => { const r = await http(p.base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, A.authHeaders(p.cred)), body: JSON.stringify({ model: p.modele, messages: [{ role: 'system', content: p.systeme || '' }, { role: 'user', content: p.prompt }], temperature: 0.2 }) }, 'non'); let t = r.data.choices?.[0]?.message?.content || ''; if (p.json) { try { t = JSON.parse(t.replace(/^```(json)?|```$/g, '').trim()); } catch (e) { /* texte brut */ } } return Object.assign({}, it, { [p.champ || 'reponseIA']: t }); } },

    /* ---------------- Débogage ---------------- */
    'logic.debug': { cat: 'logic', label: 'Point d’observation', desc: 'Ne modifie rien : permet d’inspecter les données à cet endroit.', fields: [{ name: 'note', label: 'Note' }],
      batch: async (items) => items },
  };

  A.telIntl = (n) => { n = String(n || '').replace(/[^\d+]/g, ''); if (n.startsWith('+')) return n.slice(1); if (n.startsWith('00')) return n.slice(2); if (n.startsWith('0')) return '33' + n.slice(1); return n; };
  A.ascii = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');
  A.flat = (o) => { const r = {}; for (const [k, v] of Object.entries(o || {})) r[k] = v != null && typeof v === 'object' ? JSON.stringify(v) : v; return r; };
  A.bulletinHTML = (titre, intro, arts) => {
    const s = S.settings();
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${S.esc(titre)}</title><style>body{font-family:Marianne,Arial,sans-serif;max-width:760px;margin:2rem auto;color:#161616;line-height:1.5;padding:0 1rem}.m{font-weight:700;text-transform:uppercase;font-size:14px;line-height:1.1;border-left:0;margin-bottom:1rem}.m:before{content:"";display:block;width:40px;height:14px;background:linear-gradient(90deg,#000091 33%,#fff 33% 66%,#e1000f 66%);margin-bottom:6px}h1{color:#000091;font-size:28px;border-bottom:4px solid #000091;padding-bottom:.5rem}h2{font-size:18px;margin:1.5rem 0 .25rem}a{color:#000091}.d{color:#666;font-size:13px}</style></head><body><div class="m">${S.marqueHTML()}</div><div class="d">${S.esc(s.entite)} — ${S.fmtLong(new Date())}</div><h1>${S.esc(titre)}</h1>${intro ? `<p>${S.esc(intro)}</p>` : ''}${arts.map((a) => `<h2>${a.lien ? `<a href="${S.esc(a.lien)}">${S.esc(a.titre)}</a>` : S.esc(a.titre)}</h2>${a.texte ? `<p>${S.esc(a.texte)}</p>` : ''}`).join('')}</body></html>`;
  };
})();
