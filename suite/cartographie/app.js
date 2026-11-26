/* Cartographie — fonds IGN/OSM, couches WMS/WMTS/WFS/GeoJSON/ArcGIS/Grist, dessin, mesure, identification, cadastre */
(function () {
  'use strict';
  const h = S.h;
  const db = S.db('cartographie', ['couches']);
  const GEOPF = (layer, fmt = 'image/png', style = 'normal') => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=${encodeURIComponent(style)}&FORMAT=${fmt}&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
  const IGN = '© IGN – Géoplateforme';
  const FONDS = {
    planign: { nom: 'Plan IGN', url: GEOPF('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2'), attr: IGN, max: 19 },
    ortho: { nom: 'Photographies aériennes', url: GEOPF('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'), attr: IGN, max: 20 },
    osm: { nom: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© contributeurs OpenStreetMap', max: 19 },
    osmfr: { nom: 'OpenStreetMap France', url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', attr: '© OpenStreetMap France', max: 20 },
    aucun: { nom: 'Aucun fond', url: '', attr: '' },
  };
  const CATALOGUE = [
    { nom: 'Parcelles cadastrales', type: 'xyz', url: GEOPF('CADASTRALPARCELS.PARCELLAIRE_EXPRESS', 'image/png', 'PCI vecteur'), attr: IGN, opacite: 1, groupe: 'Foncier' },
    { nom: 'Registre parcellaire graphique (RPG)', type: 'xyz', url: GEOPF('LANDUSE.AGRICULTURE.LATEST'), attr: IGN, opacite: 0.7, groupe: 'Agriculture' },
    { nom: 'Limites administratives', type: 'xyz', url: GEOPF('LIMITES_ADMINISTRATIVES_EXPRESS.LATEST'), attr: IGN, opacite: 1, groupe: 'Administratif' },
    { nom: 'Forêts publiques', type: 'xyz', url: GEOPF('FORETS.PUBLIQUES'), attr: IGN + ' / ONF', opacite: 0.6, groupe: 'Forêt & nature' },
    { nom: 'Natura 2000 — directive Habitats', type: 'xyz', url: GEOPF('PROTECTEDAREAS.SIC'), attr: IGN, opacite: 0.6, groupe: 'Forêt & nature' },
    { nom: 'Natura 2000 — directive Oiseaux', type: 'xyz', url: GEOPF('PROTECTEDAREAS.ZPS'), attr: IGN, opacite: 0.6, groupe: 'Forêt & nature' },
    { nom: 'Courbes de niveau', type: 'xyz', url: GEOPF('ELEVATION.CONTOUR.LINE'), attr: IGN, opacite: 0.8, groupe: 'Relief & eau' },
    { nom: 'Réseau hydrographique', type: 'xyz', url: GEOPF('HYDROGRAPHY.HYDROGRAPHY'), attr: IGN, opacite: 1, groupe: 'Relief & eau' },
    { nom: 'Communes (WFS Géoplateforme)', type: 'wfs', url: 'https://data.geopf.fr/wfs/ows', typename: 'ADMINEXPRESS-COG-CARTO.LATEST:commune', minZoom: 10, couleur: '#000091', groupe: 'Administratif' },
  ];
  const WMS_SERVICES = [
    { nom: 'Géoplateforme IGN — raster', url: 'https://data.geopf.fr/wms-r/wms' },
    { nom: 'Géoplateforme IGN — vecteur', url: 'https://data.geopf.fr/wms-v/ows' },
    { nom: 'GéoBretagne', url: 'https://geobretagne.fr/geoserver/ows' },
    { nom: 'Sandre (eau)', url: 'https://services.sandre.eaufrance.fr/geo/sandre' },
  ];

  if (!S.load('cartographie:init')) {
    S.save('cartographie:init', 1);
    if (!db.list('couches').some((c) => c.type === 'geojson-local' && c.nom === 'Mes dessins')) db.save('couches', { nom: 'Mes dessins', type: 'geojson-local', visible: true, couleur: '#e1000f', data: { type: 'FeatureCollection', features: [] } }, true);
    db.save('couches', Object.assign({ visible: false }, CATALOGUE[0]), true);
    db.save('couches', Object.assign({ visible: false }, CATALOGUE[1]), true);
  }

  document.head.append(h('style', {}, `
#map{position:absolute;inset:0;background:var(--background-alt-grey)}
.leaflet-container{font-family:Marianne,arial,sans-serif}
.cg-layer{display:grid;grid-template-columns:auto 1fr auto;gap:.35rem;align-items:center;padding:.35rem 0;border-bottom:1px solid var(--border-default-grey);font-size:.8125rem}
.cg-layer .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.cg-layer.err .n{color:var(--text-default-error)}
.cg-tools{position:absolute;top:.75rem;left:3.5rem;right:.75rem;z-index:500;display:flex;flex-wrap:wrap;gap:.5rem;align-items:flex-start;pointer-events:none}
.cg-tools>*{pointer-events:auto}
.cg-search{background:var(--background-default-grey);box-shadow:0 2px 6px rgba(0,0,18,.25);width:min(26rem,100%)}
.cg-search input{margin:0}
.cg-results{max-height:16rem;overflow:auto}
.cg-results button{display:block;width:100%;text-align:left;padding:.4rem .75rem;font-size:.8125rem;border-top:1px solid var(--border-default-grey);background:var(--background-default-grey)}
.cg-results button:hover{background:var(--background-contrast-grey)}
.cg-btns{display:flex;gap:2px;background:var(--background-default-grey);box-shadow:0 2px 6px rgba(0,0,18,.25)}
.cg-btns .fr-btn[aria-pressed=true]{background:var(--background-action-high-blue-france);color:var(--text-inverted-blue-france)}
.cg-status{position:absolute;bottom:1.5rem;left:50%;transform:translateX(-50%);z-index:500;background:var(--background-action-high-blue-france);color:#fff;padding:.4rem .9rem;font-size:.8125rem;box-shadow:0 2px 6px rgba(0,0,0,.3)}
.cg-pop table{font-size:.75rem;border-collapse:collapse}
.cg-pop td{padding:1px 6px 1px 0;vertical-align:top;border-bottom:1px solid #eee;max-width:16rem;word-break:break-word}
.cg-pop td:first-child{color:#666;white-space:nowrap}
.cg-pop h4{font-size:.9rem;margin:0 0 .35rem}
.cg-attr{position:absolute;left:0;right:0;bottom:0;height:38%;z-index:600;background:var(--background-default-grey);border-top:2px solid var(--border-action-high-blue-france);overflow:auto;padding:.5rem 1rem}
@media print{.s-side,.cg-tools,.cg-attr,.fr-header,.leaflet-control-zoom{display:none!important}.s-work{height:100vh!important}}
`));

  S.init({ titre: 'Cartographie', sousTitre: 'Fonds IGN, couches métier, Grist', full: true, db, grist: { couches: 'Carto_couches' } });
  document.body.classList.add('s-fullpage');
  const view = document.getElementById('view');
  const side = h('div', { class: 's-side' });
  const mapEl = h('div', { id: 'map' });
  const center = h('div', { class: 's-center' }, mapEl);
  view.append(h('div', { class: 's-work' }, side, center));

  /* ---------- Carte ---------- */
  const etat = S.load('cartographie:etat', { lat: 48.2, lon: -2.9, z: 8, fond: 'planign' });
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get('lat')) Object.assign(etat, { lat: +hp.get('lat'), lon: +hp.get('lon'), z: +hp.get('z') || etat.z, fond: hp.get('fond') || etat.fond });
  const map = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView([etat.lat, etat.lon], etat.z);
  L.control.scale({ imperial: false }).addTo(map);
  setTimeout(() => map.invalidateSize(), 300);
  window.addEventListener('resize', () => map.invalidateSize());
  let fondLayer = null;
  const setFond = (k) => {
    if (fondLayer) map.removeLayer(fondLayer);
    const f = FONDS[k] || FONDS.planign; etat.fond = k;
    fondLayer = f.url ? L.tileLayer(f.url, { attribution: f.attr, maxZoom: f.max || 19, maxNativeZoom: f.max || 19, subdomains: 'abc' }).addTo(map) : null;
    if (fondLayer) fondLayer.bringToBack();
    saveEtat();
  };
  const saveEtat = S.debounce(() => { const c = map.getCenter(); Object.assign(etat, { lat: +c.lat.toFixed(5), lon: +c.lng.toFixed(5), z: map.getZoom() }); S.save('cartographie:etat', etat); }, 300);
  map.on('moveend', saveEtat);

  /* ---------- Couches ---------- */
  const leaf = {}; // id -> couche Leaflet
  const esc = S.esc;
  const popupHTML = (props, titre) => {
    const p = Object.assign({}, props); delete p.couleur;
    const t = titre || p.titre || p.nom || p.name || p.Nom || p.libelle || '';
    return `<div class="cg-pop">${t ? `<h4>${esc(t)}</h4>` : ''}<table>${Object.entries(p).filter(([k, v]) => v !== '' && v != null && typeof v !== 'object' && !/^(titre)$/.test(k)).slice(0, 30).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${/^https?:\/\//.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">lien</a>` : esc(v)}</td></tr>`).join('')}</table></div>`;
  };
  const geoLayer = (c, data) => L.geoJSON(data, {
    style: (f) => ({ color: f.properties?.couleur || c.couleur || '#000091', weight: 2, fillOpacity: 0.2 }),
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: f.properties?.couleur || c.couleur || '#000091', fillOpacity: 0.95 }),
    onEachFeature: (f, l) => { l.bindPopup(() => popupHTML(f.properties || {}, f.properties?.[c.champTitre])); if (c.type === 'geojson-local') l.on('contextmenu', () => editFeature(c, f)); },
  });
  async function buildLayer(c) {
    c.erreur = '';
    switch (c.type) {
      case 'xyz': return L.tileLayer(c.url, { attribution: c.attr || '', opacity: c.opacite ?? 1, maxZoom: 20, subdomains: 'abc' }).on('tileerror', () => { c.erreur = 'Tuiles indisponibles'; });
      case 'wms': return L.tileLayer.wms(c.url, { layers: c.layers, format: c.format || 'image/png', transparent: true, version: c.version || '1.3.0', opacity: c.opacite ?? 1, attribution: c.attr || '', styles: c.styles || '' });
      case 'geojson-local': return geoLayer(c, c.data || { type: 'FeatureCollection', features: [] });
      case 'geojson': { const r = await S.fetch(c.url); return geoLayer(c, await r.json()); }
      case 'arcgis': { const u = c.url.replace(/\/$/, '') + `/query?where=${encodeURIComponent(c.where || '1=1')}&outFields=*&outSR=4326&f=geojson&resultRecordCount=${c.max || 2000}`; const r = await S.fetch(u); return geoLayer(c, await r.json()); }
      case 'wfs': {
        const g = geoLayer(c, { type: 'FeatureCollection', features: [] });
        const load = async () => {
          if (!map.hasLayer(g)) return;
          if (map.getZoom() < (c.minZoom || 0)) { g.clearLayers(); return; }
          const b = map.getBounds();
          const u = `${c.url}${c.url.includes('?') ? '&' : '?'}SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${encodeURIComponent(c.typename)}&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&COUNT=${c.max || 1000}&BBOX=${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()},urn:ogc:def:crs:EPSG::4326`;
          try { const r = await S.fetch(u); const j = await r.json(); g.clearLayers(); g.addData(j); c.erreur = ''; } catch (e) { c.erreur = e.message; drawSide(); }
        };
        g._load = load;
        map.on('moveend', S.debounce(load, 400));
        setTimeout(load, 50);
        return g;
      }
      case 'grist': {
        const recs = await S.grist.records(c.table);
        const feats = [];
        for (const r of recs) {
          let lat = Number(r[c.colLat]), lon = Number(r[c.colLon]);
          if ((isNaN(lat) || !r[c.colLat]) && c.colAdresse && r[c.colAdresse] && feats.length < 200) { try { const g = (await S.geocode(r[c.colAdresse], 1))[0]; if (g) { lat = g.lat; lon = g.lon; } } catch (e) { /* ignore */ } }
          if (!isNaN(lat) && !isNaN(lon) && lat && lon) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: Object.assign({ titre: r[c.champTitre] }, r) });
        }
        return geoLayer(c, { type: 'FeatureCollection', features: feats });
      }
      default: throw new Error('Type de couche inconnu');
    }
  }
  async function syncLayers() {
    const cs = db.list('couches');
    for (const id of Object.keys(leaf)) if (!cs.some((c) => c.id === id)) { map.removeLayer(leaf[id]); delete leaf[id]; }
    for (const c of cs) {
      if (c.visible && !leaf[c.id]) {
        try { leaf[c.id] = await buildLayer(c); leaf[c.id].addTo(map); if (leaf[c.id]._load) leaf[c.id]._load(); }
        catch (e) { c.erreur = e.message; S.toast(`« ${c.nom} » : ${e.message}`, 'error', 8000); }
      } else if (!c.visible && leaf[c.id]) { map.removeLayer(leaf[c.id]); delete leaf[c.id]; }
    }
    // ordre : la première de la liste au-dessus
    [...cs].reverse().forEach((c) => { const l = leaf[c.id]; if (l && l.bringToFront) l.bringToFront(); });
    drawSide();
  }
  const rebuild = (c) => { if (leaf[c.id]) { map.removeLayer(leaf[c.id]); delete leaf[c.id]; } return syncLayers(); };
  db.on((coll) => { if (coll === 'couches') { /* modifications externes (automatisation) */ } });
  window.addEventListener('storage', (e) => { if (e.key === 'suite:cartographie:couches') { db.reload(); Object.keys(leaf).forEach((id) => { map.removeLayer(leaf[id]); delete leaf[id]; }); syncLayers(); S.toast('Couches mises à jour depuis une autre application'); } });

  /* ---------- Panneau latéral ---------- */
  function drawSide() {
    const cs = db.list('couches');
    S.clear(side);
    S.add(side,
      h('p', { class: 's-sidetitle' }, 'Fond de carte'),
      h('div', { class: 'fr-select-group fr-mb-2w' }, h('select', { class: 'fr-select', 'aria-label': 'Fond de carte', onchange: (e) => setFond(e.target.value) }, Object.entries(FONDS).map(([k, f]) => h('option', { value: k, selected: k === etat.fond }, f.nom)))),
      h('p', { class: 's-sidetitle' }, `Couches (${cs.length})`),
      cs.length ? cs.map((c, i) => {
        const id = 'cl' + c.id;
        const n = c.type.startsWith('geojson') || c.type === 'grist' || c.type === 'wfs' || c.type === 'arcgis' ? (leaf[c.id]?.getLayers ? leaf[c.id].getLayers().length : null) : null;
        return h('div', { class: 'cg-layer' + (c.erreur ? ' err' : '') },
          h('div', { class: 'fr-checkbox-group fr-checkbox-group--sm' }, h('input', { type: 'checkbox', id, checked: !!c.visible, onchange: (e) => { c.visible = e.target.checked; db.save('couches', c, true); syncLayers(); } }), h('label', { class: 'fr-label', for: id }, h('span', { class: 'fr-sr-only' }, 'Afficher'))),
          h('span', { class: 'n', title: c.erreur || c.nom, onclick: () => layerMenu(c, i) }, h('span', { class: 's-dot', style: { background: c.couleur || 'var(--border-plain-grey)' } }), c.nom, n != null && c.visible ? h('span', { class: 's-mention' }, ` (${n})`) : null),
          S.iconBtn('Options', 'fr-icon-more-line', () => layerMenu(c, i)));
      }) : h('p', { class: 's-mention s-small' }, 'Aucune couche.'),
      h('div', { class: 'fr-btns-group fr-btns-group--sm fr-btns-group--icon-left fr-mt-2w' },
        S.btn('Ajouter une couche', addLayerModal, 'fr-btn--sm', 'fr-icon-add-line'),
        S.btn('Importer un fichier', importFile, 'fr-btn--sm fr-btn--secondary', 'fr-icon-upload-line'),
        S.btn('Contour de commune', communeContour, 'fr-btn--sm fr-btn--secondary', 'fr-icon-map-pin-2-line')),
      h('p', { class: 's-sidetitle fr-mt-2w' }, 'Vue'),
      h('div', { class: 'fr-btns-group fr-btns-group--sm fr-btns-group--icon-left' },
        S.btn('Copier le lien de cette vue', () => { const c = map.getCenter(); const u = location.href.split('#')[0] + `#lat=${c.lat.toFixed(5)}&lon=${c.lng.toFixed(5)}&z=${map.getZoom()}&fond=${etat.fond}`; navigator.clipboard?.writeText(u); S.toast('Lien copié', 'success'); }, 'fr-btn--sm fr-btn--tertiary', 'fr-icon-links-line'),
        S.btn('Imprimer la carte', () => print(), 'fr-btn--sm fr-btn--tertiary', 'fr-icon-printer-line')),
      h('p', { class: 's-small s-mention fr-mt-2w' }, 'Astuce : clic droit sur un dessin pour le modifier. Les couches envoyées par l’outil Automatisation apparaissent ici automatiquement.'));
  }
  function layerMenu(c, i) {
    const cs = db.list('couches');
    const isVec = ['geojson-local', 'geojson', 'grist', 'wfs', 'arcgis'].includes(c.type);
    const f = S.form([
      { name: 'nom', label: 'Nom', required: true },
      { name: 'couleur', label: 'Couleur', type: 'color', default: '#000091' },
      ...(['xyz', 'wms'].includes(c.type) ? [{ name: 'opacite', label: 'Opacité (0 à 1)', type: 'number', min: 0, max: 1, step: 0.1 }] : []),
      ...(isVec ? [{ name: 'champTitre', label: 'Champ utilisé comme titre' }] : []),
      ...(c.type === 'wfs' ? [{ name: 'minZoom', label: 'Zoom minimal d’affichage', type: 'number' }] : []),
    ], c);
    S.modal({ titre: 'Couche : ' + c.nom, body: h('div', {}, c.erreur ? S.alert('Erreur', c.erreur, 'error') : null, h('p', { class: 's-small s-mention', style: 'word-break:break-all' }, `Type : ${c.type}${c.url ? ' — ' + c.url : ''}${c.layers ? ' — ' + c.layers : ''}${c.table ? ' — table ' + c.table : ''}`), f.el,
      h('div', { class: 'fr-btns-group fr-btns-group--inline-sm fr-btns-group--icon-left' },
        isVec ? S.btn('Zoomer sur la couche', () => { const l = leaf[c.id]; if (l?.getBounds && l.getLayers().length) map.fitBounds(l.getBounds(), { maxZoom: 16 }); }, 'fr-btn--secondary fr-btn--sm', 'fr-icon-zoom-in-line') : null,
        isVec ? S.btn('Table attributaire', () => { document.querySelector('dialog.s-modal .fr-btn--close').click(); attrTable(c); }, 'fr-btn--secondary fr-btn--sm', 'fr-icon-table-line') : null,
        isVec ? S.btn('Exporter GeoJSON', () => { const l = leaf[c.id]; const gj = c.type === 'geojson-local' ? c.data : l ? l.toGeoJSON() : null; if (gj) S.download(S.slug(c.nom) + '.geojson', JSON.stringify(gj), 'application/geo+json'); }, 'fr-btn--secondary fr-btn--sm', 'fr-icon-download-line') : null,
        i > 0 ? S.btn('Monter', () => { const a = db.list('couches'); [a[i - 1], a[i]] = [a[i], a[i - 1]]; db.setAll('couches', a); syncLayers(); }, 'fr-btn--tertiary fr-btn--sm', 'fr-icon-arrow-up-line') : null,
        i < cs.length - 1 ? S.btn('Descendre', () => { const a = db.list('couches'); [a[i + 1], a[i]] = [a[i], a[i + 1]]; db.setAll('couches', a); syncLayers(); }, 'fr-btn--tertiary fr-btn--sm', 'fr-icon-arrow-down-line') : null,
        S.btn('Recharger', () => rebuild(c), 'fr-btn--tertiary fr-btn--sm', 'fr-icon-refresh-line'))),
    actions: [{ label: 'Supprimer la couche', onClick: async () => { if (!(await S.confirm(`Supprimer « ${c.nom} » ?`))) return false; if (leaf[c.id]) map.removeLayer(leaf[c.id]); delete leaf[c.id]; db.remove('couches', c.id); drawSide(); } }, { label: 'Enregistrer', primary: true, onClick: () => { Object.assign(c, f.get()); db.save('couches', c, true); rebuild(c); } }] });
  }

  /* ---------- Ajout de couches ---------- */
  function addLayerModal() {
    const tabs = [
      ['Catalogue', () => h('div', {}, h('p', { class: 's-small' }, 'Couches de la Géoplateforme IGN prêtes à l’emploi :'), S.table([{ key: 'nom', label: 'Couche' }, { key: 'groupe', label: 'Thème' }, { key: 'a', label: '', render: (x) => S.btn('Ajouter', () => { db.save('couches', Object.assign({ visible: true }, S.clone(x)), true); db.setAll('couches', db.list('couches')); syncLayers(); S.toast('Couche ajoutée', 'success'); }, 'fr-btn--sm fr-btn--secondary') }], CATALOGUE, { sortable: false }))],
      ['Service WMS', wmsTab],
      ['Tuiles / WMTS', () => formTab([{ name: 'nom', label: 'Nom', required: true }, { name: 'url', label: 'Modèle d’URL des tuiles', required: true, full: true, placeholder: 'https://…/{z}/{x}/{y}.png', hint: 'Pour une couche WMTS de la Géoplateforme, indiquez seulement le nom technique (ex. LANDUSE.AGRICULTURE.LATEST)' }, { name: 'attr', label: 'Attribution' }, { name: 'opacite', label: 'Opacité', type: 'number', default: 1, step: 0.1 }], (v) => ({ type: 'xyz', nom: v.nom, url: /^https?:/.test(v.url) ? v.url : GEOPF(v.url.trim()), attr: v.attr || IGN, opacite: v.opacite }))],
      ['WFS', () => formTab([{ name: 'nom', label: 'Nom', required: true }, { name: 'url', label: 'URL du service WFS', required: true, default: 'https://data.geopf.fr/wfs/ows', full: true }, { name: 'typename', label: 'Nom de la couche (typeName)', required: true, placeholder: 'ADMINEXPRESS-COG-CARTO.LATEST:commune' }, { name: 'minZoom', label: 'Zoom minimal', type: 'number', default: 12 }, { name: 'couleur', label: 'Couleur', type: 'color', default: '#000091' }], (v) => ({ type: 'wfs', ...v }))],
      ['GeoJSON / ArcGIS', () => formTab([{ name: 'nom', label: 'Nom', required: true }, { name: 'type', label: 'Type', type: 'select', required: true, options: [{ value: 'geojson', label: 'Fichier GeoJSON en ligne / API GeoJSON' }, { value: 'arcgis', label: 'ArcGIS FeatureServer / MapServer (couche)' }], default: 'geojson' }, { name: 'url', label: 'URL', required: true, full: true, hint: 'ArcGIS : URL de la couche, ex. https://…/FeatureServer/0' }, { name: 'where', label: 'Filtre ArcGIS (where)', default: '1=1' }, { name: 'couleur', label: 'Couleur', type: 'color', default: '#000091' }, { name: 'champTitre', label: 'Champ titre' }], (v) => v)],
      ['Table Grist', () => formTab([{ name: 'nom', label: 'Nom', required: true }, { name: 'table', label: 'Table Grist', required: true }, { name: 'colLat', label: 'Colonne latitude', default: 'Latitude' }, { name: 'colLon', label: 'Colonne longitude', default: 'Longitude' }, { name: 'colAdresse', label: 'Ou colonne adresse (géocodée à la volée, 200 max)' }, { name: 'champTitre', label: 'Colonne titre', default: 'Nom' }, { name: 'couleur', label: 'Couleur', type: 'color', default: '#18753c' }], (v) => ({ type: 'grist', ...v }), S.grist.ok() ? null : S.alert(null, 'Configurez d’abord la connexion Grist dans Paramètres.', 'warning'))],
    ];
    const body = h('div');
    const nav = h('div', { class: 'fr-btns-group fr-btns-group--inline-sm fr-mb-2w' });
    const content = h('div');
    const show = (i) => { nav.querySelectorAll('button').forEach((b, j) => { b.className = 'fr-btn fr-btn--sm ' + (i === j ? '' : 'fr-btn--tertiary'); }); S.add(S.clear(content), tabs[i][1]()); };
    tabs.forEach(([t], i) => nav.append(h('button', { type: 'button', onclick: () => show(i) }, t)));
    body.append(nav, content);
    const m = S.modal({ titre: 'Ajouter une couche', body, taille: 'wide' });
    show(0);
    function formTab(fields, toCouche, pre) {
      const f = S.form(fields);
      return h('div', {}, pre, f.el, S.btn('Ajouter la couche', () => { if (!f.validate()) return; const c = Object.assign({ visible: true }, toCouche(f.get())); db.save('couches', c); syncLayers(); m.close(); S.toast('Couche ajoutée', 'success'); }, '', 'fr-icon-add-line'));
    }
    function wmsTab() {
      const url = h('input', { class: 'fr-input', value: WMS_SERVICES[0].url });
      const list = h('div');
      const explore = async () => {
        S.add(S.clear(list), h('p', { class: 's-mention' }, 'Lecture des capacités…'));
        try {
          const u = url.value.trim(); const r = await S.fetch(u + (u.includes('?') ? '&' : '?') + 'SERVICE=WMS&REQUEST=GetCapabilities');
          const doc = new DOMParser().parseFromString(await r.text(), 'text/xml');
          const layers = [...doc.getElementsByTagName('Layer')].map((l) => { const n = [...l.children].find((x) => x.tagName === 'Name'); const t = [...l.children].find((x) => x.tagName === 'Title'); const a = [...l.children].find((x) => x.tagName === 'Abstract'); return n ? { name: n.textContent, title: t?.textContent || n.textContent, abs: a?.textContent || '' } : null; }).filter(Boolean);
          let q = '';
          const tbl = h('div');
          const draw = () => S.add(S.clear(tbl), h('p', { class: 's-mention' }, `${layers.length} couche(s)`), S.table([{ key: 'title', label: 'Couche', render: (x) => h('div', {}, x.title, h('div', { class: 's-small s-mention' }, x.name)) }, { key: 'a', label: '', render: (x) => S.btn('Ajouter', () => { db.save('couches', { type: 'wms', nom: x.title, url: u, layers: x.name, visible: true, opacite: 0.8 }); syncLayers(); S.toast('Couche ajoutée : ' + x.title, 'success'); }, 'fr-btn--sm fr-btn--secondary') }], layers.filter((x) => !q || S.norm(x.title + ' ' + x.name + ' ' + x.abs).includes(S.norm(q))).slice(0, 200), { sortable: false }));
          S.add(S.clear(list), S.search('Filtrer les couches', (x) => { q = x; draw(); }), tbl); draw();
        } catch (e) { S.add(S.clear(list), S.alert('Échec', e.message, 'error')); }
      };
      return h('div', {}, h('div', { class: 's-tags fr-mb-1w' }, WMS_SERVICES.map((s) => h('button', { type: 'button', class: 'fr-tag fr-tag--sm', onclick: () => { url.value = s.url; explore(); } }, s.nom))),
        h('div', { class: 'fr-input-group' }, h('label', { class: 'fr-label' }, 'URL du service WMS'), url), S.btn('Explorer le service', explore, 'fr-btn--sm', 'fr-icon-search-line'), list);
    }
  }
  async function importFile() {
    const f = await S.pickFile('.geojson,.json,.csv,.kml,.gpx'); if (!f) return;
    const txt = await S.readText(f); let gj;
    try {
      if (/\.csv$/i.test(f.name)) {
        const rows = S.parseCSV(txt); const k = Object.keys(rows[0] || {});
        const la = k.find((x) => /^(lat|latitude|y)$/i.test(x)), lo = k.find((x) => /^(lon|lng|long|longitude|x)$/i.test(x));
        if (!la || !lo) throw new Error('Colonnes latitude/longitude introuvables (lat, lon…)');
        gj = { type: 'FeatureCollection', features: rows.filter((r) => r[la] && r[lo]).map((r) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [parseFloat(String(r[lo]).replace(',', '.')), parseFloat(String(r[la]).replace(',', '.'))] }, properties: r })) };
      } else if (/\.(kml|gpx)$/i.test(f.name)) gj = xmlToGeoJSON(txt);
      else gj = JSON.parse(txt);
      if (gj.type === 'Feature') gj = { type: 'FeatureCollection', features: [gj] };
      if (!gj.features) throw new Error('GeoJSON non reconnu');
      if (JSON.stringify(gj).length > 3e6) throw new Error('Fichier trop volumineux pour le stockage du navigateur (3 Mo max)');
      const c = db.save('couches', { nom: f.name.replace(/\.\w+$/, ''), type: 'geojson-local', visible: true, couleur: '#a558a0', data: gj });
      await syncLayers();
      if (leaf[c.id]?.getLayers().length) map.fitBounds(leaf[c.id].getBounds(), { maxZoom: 16 });
      S.toast(`${gj.features.length} objet(s) importé(s)`, 'success');
    } catch (e) { S.toast('Import impossible : ' + e.message, 'error', 8000); }
  }
  function xmlToGeoJSON(txt) {
    const doc = new DOMParser().parseFromString(txt, 'text/xml');
    const coords = (s) => s.trim().split(/\s+/).map((p) => p.split(',').slice(0, 2).map(Number));
    const feats = [];
    doc.querySelectorAll('Placemark').forEach((pm) => {
      const props = { nom: pm.querySelector('name')?.textContent || '', description: (pm.querySelector('description')?.textContent || '').replace(/<[^>]+>/g, ' ') };
      const pt = pm.querySelector('Point coordinates'), ls = pm.querySelector('LineString coordinates'), pg = pm.querySelector('Polygon outerBoundaryIs coordinates, Polygon coordinates');
      if (pt) feats.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: coords(pt.textContent)[0] } });
      else if (ls) feats.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords(ls.textContent) } });
      else if (pg) feats.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [coords(pg.textContent)] } });
    });
    doc.querySelectorAll('wpt').forEach((w) => feats.push({ type: 'Feature', properties: { nom: w.querySelector('name')?.textContent || '' }, geometry: { type: 'Point', coordinates: [+w.getAttribute('lon'), +w.getAttribute('lat')] } }));
    doc.querySelectorAll('trk').forEach((t) => feats.push({ type: 'Feature', properties: { nom: t.querySelector('name')?.textContent || 'Trace' }, geometry: { type: 'LineString', coordinates: [...t.querySelectorAll('trkpt')].map((p) => [+p.getAttribute('lon'), +p.getAttribute('lat')]) } }));
    return { type: 'FeatureCollection', features: feats };
  }
  async function communeContour() {
    const q = await S.prompt('Nom ou code INSEE de la commune', '', { titre: 'Contour de commune' }); if (!q) return;
    try {
      const j = await S.fetchJSON(`https://geo.api.gouv.fr/communes?${/^\d[\dAB]\d{3}$/i.test(q.trim()) ? 'code' : 'nom'}=${encodeURIComponent(q.trim())}&fields=nom,code,population,codeDepartement,contour&format=geojson&geometry=contour&limit=5`, {}, { proxy: false });
      if (!j.features?.length) return S.toast('Commune introuvable', 'warning');
      const c = db.save('couches', { nom: 'Commune : ' + j.features.map((f) => f.properties.nom).join(', '), type: 'geojson-local', visible: true, couleur: '#000091', data: j });
      await syncLayers(); map.fitBounds(leaf[c.id].getBounds());
    } catch (e) { S.toast(e.message, 'error'); }
  }

  /* ---------- Table attributaire ---------- */
  let attrEl = null;
  function attrTable(c) {
    attrEl?.remove();
    const l = leaf[c.id]; if (!l) return S.toast('Affichez la couche d’abord', 'info');
    const feats = l.getLayers();
    const rows = feats.map((x, i) => Object.assign({ _i: i }, x.feature?.properties || {}));
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== '_i' && k !== 'couleur').slice(0, 12);
    attrEl = h('div', { class: 'cg-attr' },
      h('div', { class: 's-bar', style: 'margin-bottom:.5rem' }, h('h2', { class: 'fr-h6' }, `${c.nom} — ${rows.length} objet(s)`),
        h('div', { class: 's-bar__actions' }, S.btn('CSV', () => S.download(S.slug(c.nom) + '.csv', S.toCSV(rows.map(({ _i, ...r }) => r))), 'fr-btn--sm fr-btn--secondary', 'fr-icon-download-line'), S.iconBtn('Fermer', 'fr-icon-close-line', () => { attrEl.remove(); attrEl = null; }))),
      S.table(keys.map((k) => ({ key: k, label: k, render: (r) => (typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]) })), rows, { onRow: (r) => { const x = feats[r._i]; if (x.getBounds) map.fitBounds(x.getBounds(), { maxZoom: 17 }); else map.setView(x.getLatLng(), Math.max(map.getZoom(), 16)); x.openPopup(); } }));
    center.append(attrEl);
  }

  /* ---------- Outils : recherche, identification, mesure, dessin ---------- */
  const status = h('div', { class: 'cg-status', hidden: true });
  const results = h('div', { class: 'cg-results' });
  const search = h('input', { class: 'fr-input', type: 'search', placeholder: 'Rechercher une adresse, un lieu, une commune…', 'aria-label': 'Rechercher une adresse' });
  let searchMarker = null;
  search.addEventListener('input', S.debounce(async () => {
    const q = search.value.trim(); S.clear(results); if (q.length < 3) return;
    const coord = q.match(/^\s*(-?\d+[.,]\d+)\s*[,; ]\s*(-?\d+[.,]\d+)\s*$/);
    if (coord) { const la = +coord[1].replace(',', '.'), lo = +coord[2].replace(',', '.'); results.append(h('button', { type: 'button', onclick: () => goTo(la, lo, 'Coordonnées ' + q) }, `📍 Aller aux coordonnées ${la}, ${lo}`)); return; }
    try { (await S.geocode(q, 6)).forEach((r) => results.append(h('button', { type: 'button', onclick: () => goTo(r.lat, r.lon, r.label, r.type) }, r.label, h('span', { class: 's-mention' }, ' — ' + (r.type || ''))))); }
    catch (e) { results.append(h('p', { class: 's-small fr-p-1w' }, 'Géocodage indisponible : ' + e.message)); }
  }, 300));
  const goTo = (lat, lon, label, type) => {
    S.clear(results); search.value = label;
    map.setView([lat, lon], type === 'municipality' ? 13 : type === 'street' ? 16 : 17);
    if (searchMarker) map.removeLayer(searchMarker);
    searchMarker = L.circleMarker([lat, lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#e1000f', fillOpacity: 1 }).addTo(map).bindPopup(`<div class="cg-pop"><h4>${esc(label)}</h4><p>${lat.toFixed(6)}, ${lon.toFixed(6)}</p><button class="fr-btn fr-btn--sm" id="cg-keep">Ajouter à « Mes dessins »</button></div>`).openPopup();
    setTimeout(() => document.getElementById('cg-keep')?.addEventListener('click', () => { addFeature({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { nom: label } }); map.closePopup(); }), 50);
  };
  let tool = null; let tmp = null; let pts = [];
  const btns = {};
  const setTool = (t) => {
    tool = tool === t ? null : t; pts = [];
    if (tmp) { map.removeLayer(tmp); tmp = null; }
    Object.entries(btns).forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === tool)));
    mapEl.style.cursor = tool ? 'crosshair' : '';
    map.doubleClickZoom[tool && tool !== 'info' && tool !== 'point' ? 'disable' : 'enable']();
    status.hidden = !tool;
    status.textContent = { info: 'Cliquez sur la carte pour identifier le lieu (adresse, parcelle, commune). Échap pour quitter.', distance: 'Cliquez pour placer les points, double-clic pour terminer.', surface: 'Cliquez pour dessiner le polygone, double-clic pour terminer.', point: 'Cliquez pour placer un point.', ligne: 'Cliquez pour tracer, double-clic pour terminer.', polygone: 'Cliquez pour tracer, double-clic pour terminer.' }[tool] || '';
  };
  const tb = (k, title, icon) => (btns[k] = h('button', { type: 'button', class: `fr-btn fr-btn--sm fr-btn--tertiary-no-outline ${icon}`, title, 'aria-pressed': 'false', onclick: () => setTool(k) }, title));
  center.append(h('div', { class: 'cg-tools' },
    h('div', { class: 'cg-search' }, search, results),
    h('div', { class: 'cg-btns', role: 'toolbar', 'aria-label': 'Outils' },
      tb('info', 'Identifier un lieu', 'fr-icon-information-line'), tb('distance', 'Mesurer une distance', 'fr-icon-ruler-line'), tb('surface', 'Mesurer une surface', 'fr-icon-shapes-line'),
      tb('point', 'Dessiner un point', 'fr-icon-map-pin-2-line'), tb('ligne', 'Dessiner une ligne', 'fr-icon-pencil-line'), tb('polygone', 'Dessiner un polygone', 'fr-icon-edit-box-line'),
      h('button', { type: 'button', class: 'fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-focus-3-line', title: 'Me localiser', onclick: () => map.locate({ setView: true, maxZoom: 16 }) }, 'Me localiser'))),
  status);
  map.on('locationfound', (e) => L.circleMarker(e.latlng, { radius: 8, color: '#fff', weight: 3, fillColor: '#0063cb', fillOpacity: 1 }).addTo(map).bindPopup('Vous êtes ici (± ' + Math.round(e.accuracy) + ' m)').openPopup());
  map.on('locationerror', (e) => S.toast('Localisation impossible : ' + e.message, 'warning'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tool) setTool(null); });

  const fmtLen = (m) => (m > 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m');
  const fmtArea = (a) => (a > 1e6 ? (a / 1e6).toFixed(3) + ' km²' : a > 1e4 ? (a / 1e4).toFixed(2) + ' ha' : Math.round(a) + ' m²');
  const lineLen = (ll) => ll.reduce((s, p, i) => (i ? s + ll[i - 1].distanceTo(p) : 0), 0);
  const area = (ll) => { // aire géodésique approchée (formule sphérique)
    const R = 6378137, r = Math.PI / 180; let a = 0;
    for (let i = 0; i < ll.length; i++) { const p1 = ll[i], p2 = ll[(i + 1) % ll.length]; a += (p2.lng - p1.lng) * r * (2 + Math.sin(p1.lat * r) + Math.sin(p2.lat * r)); }
    return Math.abs((a * R * R) / 2);
  };
  map.on('click', async (e) => {
    if (!tool) return;
    if (tool === 'info') return identify(e.latlng);
    if (tool === 'point') { addFeature({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.latlng.lng, e.latlng.lat] }, properties: { nom: 'Point' } }, true); return; }
    pts.push(e.latlng);
    if (tmp) map.removeLayer(tmp);
    tmp = (tool === 'surface' || tool === 'polygone' ? L.polygon(pts, { color: '#e1000f', dashArray: '4' }) : L.polyline(pts, { color: '#e1000f', dashArray: '4' })).addTo(map);
    if (tool === 'distance') status.textContent = 'Distance : ' + fmtLen(lineLen(pts)) + ' — double-clic pour terminer';
    if (tool === 'surface' && pts.length > 2) status.textContent = `Surface : ${fmtArea(area(pts))} · périmètre ${fmtLen(lineLen([...pts, pts[0]]))} — double-clic pour terminer`;
  });
  map.on('dblclick', () => {
    if (!tool || !['distance', 'surface', 'ligne', 'polygone'].includes(tool)) return;
    const p = pts.slice(); // le double-clic ajoute deux clics identiques
    const uniq = p.filter((x, i) => !i || !x.equals(p[i - 1]));
    if (tool === 'distance') { L.polyline(uniq, { color: '#e1000f' }).addTo(map).bindPopup('Distance : ' + fmtLen(lineLen(uniq))).openPopup(); }
    else if (tool === 'surface') { if (uniq.length > 2) L.polygon(uniq, { color: '#e1000f' }).addTo(map).bindPopup(`Surface : ${fmtArea(area(uniq))}<br>Périmètre : ${fmtLen(lineLen([...uniq, uniq[0]]))}`).openPopup(); }
    else if (tool === 'ligne' && uniq.length > 1) addFeature({ type: 'Feature', geometry: { type: 'LineString', coordinates: uniq.map((x) => [x.lng, x.lat]) }, properties: { nom: 'Ligne', longueur: fmtLen(lineLen(uniq)) } }, true);
    else if (tool === 'polygone' && uniq.length > 2) addFeature({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...uniq, uniq[0]].map((x) => [x.lng, x.lat])] }, properties: { nom: 'Zone', surface: fmtArea(area(uniq)) } }, true);
    const t = tool; setTool(null); if (t === 'ligne' || t === 'polygone') setTool(t);
  });
  async function identify(ll) {
    const pop = L.popup().setLatLng(ll).setContent('<div class="cg-pop">Recherche…</div>').openOn(map);
    const parts = [`<h4>${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}</h4>`];
    const [adr, parc, com] = await Promise.allSettled([
      S.reverse(ll.lat, ll.lng),
      S.fetchJSON(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [ll.lng, ll.lat] }))}`, {}, { proxy: false }),
      S.fetchJSON(`https://geo.api.gouv.fr/communes?lat=${ll.lat}&lon=${ll.lng}&fields=nom,code,population,departement,epci`, {}, { proxy: false }),
    ]);
    const rows = [];
    if (adr.status === 'fulfilled' && adr.value) rows.push(['Adresse', adr.value.label]);
    if (com.status === 'fulfilled' && com.value[0]) { const c = com.value[0]; rows.push(['Commune', `${c.nom} (${c.code})`], ['Département', c.departement?.nom || ''], ['EPCI', c.epci?.nom || ''], ['Population', c.population]); }
    let parcGeo = null;
    if (parc.status === 'fulfilled' && parc.value.features?.[0]) { const p = parc.value.features[0]; parcGeo = p; rows.push(['Parcelle', `${p.properties.section} ${p.properties.numero}`], ['Identifiant', p.properties.idu], ['Contenance', p.properties.contenance ? p.properties.contenance + ' m²' : '']); }
    if (!rows.length) rows.push(['Info', 'Services d’identification injoignables']);
    parts.push(`<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`);
    parts.push(`<p style="margin:.4rem 0 0"><a href="https://www.geoportail.gouv.fr/carte?c=${ll.lng},${ll.lat}&z=17" target="_blank" rel="noopener">Ouvrir dans le Géoportail</a>${parcGeo ? ' · <a href="#" id="cg-parc">Garder la parcelle</a>' : ''}</p>`);
    pop.setContent('<div class="cg-pop">' + parts.join('') + '</div>');
    if (parcGeo) setTimeout(() => document.getElementById('cg-parc')?.addEventListener('click', (e) => { e.preventDefault(); addFeature({ type: 'Feature', geometry: parcGeo.geometry, properties: { nom: 'Parcelle ' + parcGeo.properties.idu, section: parcGeo.properties.section, numero: parcGeo.properties.numero, contenance: parcGeo.properties.contenance, commune: parcGeo.properties.nom_com } }); map.closePopup(); }), 50);
  }
  function dessins() {
    let c = db.list('couches').find((x) => x.type === 'geojson-local' && x.nom === 'Mes dessins');
    if (!c) c = db.save('couches', { nom: 'Mes dessins', type: 'geojson-local', visible: true, couleur: '#e1000f', data: { type: 'FeatureCollection', features: [] } });
    return c;
  }
  async function addFeature(f, ask) {
    const c = dessins();
    if (ask) { const v = await S.formModal('Nouvel objet', [{ name: 'nom', label: 'Nom', required: true }, { name: 'description', label: 'Description', type: 'textarea', rows: 2 }, { name: 'couleur', label: 'Couleur', type: 'color', default: c.couleur }], f.properties); if (!v) return; Object.assign(f.properties, v); }
    f.properties.creeLe = new Date().toISOString();
    c.data.features.push(f); c.visible = true;
    db.save('couches', c, true); rebuild(c);
  }
  async function editFeature(c, f) {
    const v = await S.formModal('Modifier l’objet', [{ name: 'nom', label: 'Nom', required: true }, { name: 'description', label: 'Description', type: 'textarea', rows: 2 }, { name: 'couleur', label: 'Couleur', type: 'color', default: c.couleur }], f.properties, { extraActions: [{ label: 'Supprimer l’objet', onClick: () => { c.data.features = c.data.features.filter((x) => x !== f); db.save('couches', c, true); rebuild(c); } }] });
    if (v) { Object.assign(f.properties, v); db.save('couches', c, true); rebuild(c); }
  }

  setFond(etat.fond);
  syncLayers();
})();
