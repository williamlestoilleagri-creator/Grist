/*
 * Jeu de données fictif pour prévisualiser les widgets hors de Grist.
 * Il reprend les noms de colonnes du document "Aide canicule 2026" (démarche 155804).
 * Chargé uniquement quand la page n'est pas affichée dans un iframe Grist (ou avec ?demo=1).
 * Aucune donnée réelle : noms, SIRET, IBAN et PACAGE sont générés aléatoirement.
 */
(function () {
  'use strict';

  // PRNG déterministe : la démo est identique à chaque chargement.
  var seed = 20260925;
  function rnd() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function chance(p) { return rnd() < p; }
  function digits(n) { var s = ''; for (var i = 0; i < n; i++) s += Math.floor(rnd() * 10); return s; }
  function weighted(pairs) {
    var total = pairs.reduce(function (a, p) { return a + p[1]; }, 0), r = rnd() * total;
    for (var i = 0; i < pairs.length; i++) { r -= pairs[i][1]; if (r <= 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }
  function epoch(y, m, d) { return Date.UTC(y, m - 1, d) / 1000; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var DEPS = {
    '22': { nom: "22 - Côtes-d'Armor", villes: [['Lamballe-Armor', '22400', '22093'], ['Loudéac', '22600', '22136'], ['Guingamp', '22200', '22070'], ['Dinan', '22100', '22050'], ['Paimpol', '22500', '22162']] },
    '29': { nom: '29 - Finistère', villes: [['Landerneau', '29800', '29103'], ['Châteaulin', '29150', '29026'], ['Carhaix-Plouguer', '29270', '29024'], ['Quimperlé', '29300', '29233'], ['Morlaix', '29600', '29151']] },
    '35': { nom: '35 - Ille-et-Vilaine', villes: [['Vitré', '35500', '35360'], ['Redon', '35600', '35236'], ['Fougères', '35300', '35115'], ['Janzé', '35150', '35136'], ['Montfort-sur-Meu', '35160', '35188']] },
    '56': { nom: '56 - Morbihan', villes: [['Pontivy', '56300', '56178'], ['Ploërmel', '56800', '56165'], ['Locminé', '56500', '56117'], ['Questembert', '56230', '56184'], ['Josselin', '56120', '56091']] }
  };

  var NOMS = ['LE GALL', 'LE BRIS', 'GUILLOU', 'TANGUY', 'LE ROUX', 'MORVAN', 'KERBRAT', 'LE CORRE', 'JAOUEN', 'ROLLAND',
    'PRIGENT', 'LE MOAL', 'HERVÉ', 'CARIOU', 'LE GOFF', 'MADEC', 'COLLET', 'OLLIVIER', 'LE BIHAN', 'NICOLAS', 'DANIEL', 'RIOU',
    'CADIOU', 'LE MEUR', 'QUÉRÉ', 'BOTHOREL', 'GUÉGUEN', 'LE DU', 'PERSON', 'KERMARREC'];
  var LIEUX = ['DE KERHUEL', 'DU MOULIN NEUF', 'DE LA LANDE', 'DES TROIS CHÊNES', 'DE PENHOAT', 'DU BOIS JOLI', 'DE KERVÉGAN',
    'DES GENÊTS', 'DE LA VALLÉE', 'DU CLOS FLEURI', 'DE TRÉVIDY', 'DES AJONCS', 'DE LA FONTAINE', 'DE KERLOC\'H'];
  var PRODS = [
    ['élevage ruminants (bovins, ovins, caprins)', 40],
    ['élevage (autres)', 15],
    ['maraichage (hors abri)', 12],
    ['légumes de plein champ (hors abri)', 12],
    ['autres productions végétales, grandes cultures', 14],
    ['production de petits fruits', 5],
    ['autre', 2]
  ];
  var NAF = { ruminants: ['01.41Z', 'Élevage de vaches laitières'], autres: ['01.46Z', 'Élevage de porcins'],
    legumes: ['01.13Z', 'Culture de légumes, de melons, de racines et de tubercules'], cultures: ['01.11Z', 'Culture de céréales'],
    fruits: ['01.25Z', 'Culture d\'autres fruits d\'arbres ou d\'arbustes'], mixte: ['01.50Z', 'Culture et élevage associés'] };

  // Étapes de Etat_dossier, pondérées par département pour créer des bouchons crédibles.
  var ETAPES = [
    'En attente des données MSA', 'Éligibilité à instruire', 'Passer le dossier en instruction dans DN', 'Priorité à instruire',
    'Retour banque à renseigner', 'En attente de sélection pour paiement', 'Enveloppe à renseigner', 'Données de paiement à rechercher',
    "Montant de l'aide à renseigner", 'Accepter le dossier dans DN', 'Traitement terminé',
    'Motivation de refus à indiquer', "Signaler le refus à l'usager sur la DN", '__refuse'
  ];
  var POIDS = {
    '22': [6, 10, 4, 5, 6, 12, 3, 5, 2, 4, 30, 2, 2, 9],
    '29': [4, 6, 3, 3, 5, 8, 2, 4, 3, 6, 42, 1, 1, 12],
    '35': [3, 7, 5, 4, 38, 9, 2, 3, 1, 3, 14, 3, 3, 5],
    '56': [22, 14, 6, 6, 4, 6, 2, 3, 2, 3, 18, 2, 4, 8]
  };
  var PARAMS = {
    '22': { Forfait: 1500, Bonus_JA: 500, Transparence_GAEC: true, Limite_NB_GAEC: 3, Bonus_assurance: 500, Bonus_AREA: 500 },
    '29': { Forfait: 2000, Bonus_JA: 1000, Transparence_GAEC: true, Limite_NB_GAEC: 0, Bonus_assurance: 0, Bonus_AREA: 1000 },
    '35': { Forfait: 1800, Bonus_JA: 700, Transparence_GAEC: false, Limite_NB_GAEC: 0, Bonus_assurance: 300, Bonus_AREA: 700 },
    '56': { Forfait: 1600, Bonus_JA: 800, Transparence_GAEC: true, Limite_NB_GAEC: 2, Bonus_assurance: 0, Bonus_AREA: 600 }
  };
  var ENVELOPPES = {
    '22': [['Enveloppe initiale', 220000], ['Complément FAC', 60000]],
    '29': [['Enveloppe initiale', 260000]],
    '35': [['Enveloppe initiale', 180000], ['Réserve comité', 40000]],
    '56': [['Enveloppe initiale', 190000]]
  };

  function aideDemandee(r, p) {
    var nb = !p.Transparence_GAEC ? 1 : (p.Limite_NB_GAEC ? Math.min(r.Nb_parts, p.Limite_NB_GAEC) : r.Nb_parts);
    var seuil = Math.max(0, 50000 * r.Nb_parts - r.Minimis_recus - r.Minimis_en_cours);
    var area = r.AREA_Audit ? 1 : 0;
    if (r.dep2 === '56') {
      var ja = 0;
      if (r.Nouvel_installe) ja = p.Bonus_JA * (r.Ruminants_DN ? 2 : 1);
      return Math.min(p.Forfait * nb + ja + area * p.Bonus_AREA, seuil);
    }
    return Math.min(nb * p.Forfait + (r.Nouvel_installe === 'OUI' ? p.Bonus_JA : 0) + (r.MRC ? p.Bonus_assurance : 0) + area * p.Bonus_AREA, 10000, seuil);
  }

  var demandeurs = [], dossiers = [], associes = [];
  var mandataire = ['contact@cer-bretagne-demo.fr', 'dossiers@agc-cotes-demo.fr'];
  var depKeys = Object.keys(DEPS);
  var N = 280;

  for (var i = 0; i < N; i++) {
    var id = i + 1;
    var dep = depKeys[i % 4];
    var v = pick(DEPS[dep].villes);
    var prod = weighted(PRODS);
    var gaec = chance(0.28);
    var nom = pick(NOMS);
    var forme = gaec ? 'GAEC' : weighted([['EARL', 4], ['Entreprise individuelle', 5], ['SCEA', 1]]);
    var raison = forme === 'Entreprise individuelle' ? nom + ' ' + pick(['Yann', 'Marie', 'Erwan', 'Gaëlle', 'Loïc', 'Anne', 'Tristan', 'Soazig'])
      : forme + ' ' + pick(LIEUX);
    var ruminants = prod.indexOf('ruminants') >= 0 || (chance(0.15) && prod.indexOf('élevage') >= 0);
    var autresElev = prod.indexOf('élevage (autres)') >= 0;
    var legumes = prod.indexOf('légumes') >= 0;
    var naf = ruminants ? NAF.ruminants : autresElev ? NAF.autres : legumes || prod.indexOf('maraichage') >= 0 ? NAF.legumes
      : prod.indexOf('fruits') >= 0 ? NAF.fruits : chance(0.5) ? NAF.cultures : NAF.mixte;
    if (chance(0.03)) naf = ['46.21Z', 'Commerce de gros de céréales'];
    var pacage = '0' + dep + digits(6);
    var siret = digits(14);
    var nbParts = gaec ? 2 + Math.floor(rnd() * 3) : 1;
    var etape = weighted(ETAPES.map(function (e, k) { return [e, POIDS[dep][k]]; }));
    var refuse = etape === '__refuse';
    var avantMSA = etape === 'En attente des données MSA';
    var idxEtape = ETAPES.indexOf(etape);
    var selectionne = !refuse && idxEtape >= 6 && idxEtape <= 10;
    var nouvelInst = avantMSA ? null : (chance(0.22) ? 'OUI' : 'NON');
    var jDepot = Math.floor(rnd() * 70); // dépôts sur ~10 semaines avant le 25/09/2026
    var depot = new Date(Date.UTC(2026, 6, 15) + jDepot * 86400000 + Math.floor(rnd() * 10 + 8) * 3600000);
    var etatDN = refuse || etape === "Signaler le refus à l'usager sur la DN" ? (refuse ? 'refuse' : 'en_instruction')
      : etape === 'Traitement terminé' ? 'accepte'
      : etape === 'Passer le dossier en instruction dans DN' || idxEtape <= 1 ? 'en_construction' : 'en_instruction';
    var eligible = idxEtape <= 1 ? '' : (refuse || idxEtape >= 11) ? 'Non' : 'Oui';
    var bodacc = chance(0.6);
    var statutBodacc = !bodacc ? 'Non contrôlé' : weighted([['Aucune procédure', 88], ['Sauvegarde / RJ sans plan', 3], ['Plan arrêté', 4], ['Liquidation judiciaire', 2], ['Procédure clôturée', 3]]);
    var admRum = chance(0.2) ? 'Pas de correspondance' : (chance(0.06) ? !ruminants : ruminants);
    var admAutre = admRum === 'Pas de correspondance' ? admRum : (chance(0.05) ? !autresElev : autresElev);
    var pacageSiret = chance(0.06) ? '0' + dep + digits(6) : pacage;
    var anomalie = [];
    if (pacageSiret !== pacage) anomalie.push('PACAGE différents entre DN et ISIS');
    if (naf[0].slice(0, 2) !== '01') anomalie.push('Code NAF non agricole');
    if (admRum !== 'Pas de correspondance' && admRum !== ruminants) anomalie.push("L'activité Ruminants diffère dans la DN et le SRAL");
    if (admAutre !== 'Pas de correspondance' && admAutre !== autresElev) anomalie.push("L'activité Autres élevage diffère dans la DN et le SRAL");
    var ribKo = chance(0.05);
    var minRecus = chance(0.5) ? Math.round(rnd() * 12000) : 0;
    if (chance(0.03)) minRecus = 48500 * nbParts;
    var etatChorus = !selectionne && dep !== '35' && dep !== '56' ? "En attente d'instruction"
      : etape === 'Données de paiement à rechercher' ? pick(['En attente des pièces comptables', 'En attente de saisie sous Chorus Formulaire', 'Renseignez le numéro de Tiers fourni par Chorus'])
      : selectionne ? 'Tiers OK' : 'En attente des pièces comptables';
    var r = {
      id: id,
      dossier_number: String(24000000 + Math.floor(rnd() * 900000)),
      raison_sociale: raison, siret: siret, siren: siret.slice(0, 9), naf: naf[0], libelle_naf: naf[1],
      etat_administratif: chance(0.02) ? 'Fermé' : 'Actif', forme_juridique: forme,
      date_creation: epoch(1985 + Math.floor(rnd() * 40), 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27)),
      ville: v[0], code_postal: v[1], code_insee_ville: v[2], code_departement: dep, dep2: dep, Departement_DN: DEPS[dep].nom,
      usager_email: chance(0.08) ? pick(mandataire) : (nom.toLowerCase().replace(/[^a-z]/g, '') + '.' + digits(3) + '@exemple.fr'),
      PACAGE_DN: pacage, PACAGE_via_SIRET: pacageSiret, Libelle_PAC_via_PACAGE: raison, SAUtot: Math.round((12 + rnd() * 160) * 10) / 10,
      Siret_si_PACAGE_differents: pacageSiret !== pacage ? digits(14) : null,
      Productions_principales: prod, Ruminants_DN: ruminants, DN_Autres_elevages: autresElev, Legumes_DN: legumes,
      Maraichage: prod.indexOf('maraichage') >= 0, ADM_Ruminants: admRum, ADM_Autre_elevage: admAutre,
      Lien_MSA: avantMSA ? 0 : id, Donnees_MSA: avantMSA ? 'En attente des données MSA' : 'Données MSA fournies',
      Titre_principal: avantMSA ? null : (chance(0.9) ? 'OUI' : 'NON'),
      Nouvel_installe: nouvelInst,
      Date_dernier_installe: nouvelInst === 'OUI' ? epoch(2021 + Math.floor(rnd() * 5), 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27)) : null,
      Echeancier_de_paiement_sur_2026: avantMSA ? null : (chance(0.15) ? 'OUI' : 'NON'),
      Prise_en_charge_de_cotisations_sociales: avantMSA ? null : (chance(0.1) ? 'OUI' : 'NON'),
      BODACC: bodacc, Statut_BODACC: statutBodacc,
      Details_BODACC: statutBodacc === 'Aucune procédure' ? 'Aucune procédure collective trouvée au BODACC'
        : statutBodacc === 'Non contrôlé' ? '' : '2025-11-04 — ' + statutBodacc,
      Etat_Chorus: etatChorus, DB_Tiers: etatChorus === 'Tiers OK' ? 'Tiers présent dans la base Chorus' : 'Tiers non présent dans la base Chorus',
      Chorus: chance(0.4) ? 'Tiers existant sur Chorus' : 'Tiers a créer', Anomalie_RIB: ribKo,
      IBAN: 'FR76 ' + [digits(4), digits(4), digits(4), digits(4), digits(4), digits(3)].join(' '),
      Minimis_recus: minRecus, Minimis_en_cours: chance(0.15) ? Math.round(rnd() * 4000) : 0,
      Nb_parts: nbParts, GAEC: gaec, AREA_Audit: chance(0.12), AREA: false, MRC: chance(0.35),
      Selectionne: selectionne, Eligible: eligible,
      Motif_refus: refuse || etape === "Signaler le refus à l'usager sur la DN" ? pick(['Code NAF non éligible', 'Pertes insuffisantes', 'Exploitation en liquidation', 'Dossier incomplet']) : '',
      Etat_DN: etatDN, Etat_dossier: refuse ? null : etape,
      Date_depot_FR: pad(depot.getUTCDate()) + '/' + pad(depot.getUTCMonth() + 1) + '/' + depot.getUTCFullYear() + ' ' + pad(depot.getUTCHours()) + 'h',
      Anomalie: anomalie, Anomalie_RIB_: ribKo,
      Verif_associes: '', Hors_NAF: naf[0].slice(0, 2) !== '01', Prioritaire: idxEtape > 3 && !refuse ? pick(['P1', 'P2', 'P3']) : '',
      Enveloppe: 0, Aide_accordee: 0, Aide_demandee: 0
    };
    r.Minimis = r.Minimis_recus + r.Minimis_en_cours;
    r.AREA = r.AREA_Audit || chance(0.05);
    r.Aide_demandee = aideDemandee(r, PARAMS[dep]);
    if (selectionne && etape !== "Montant de l'aide à renseigner") r.Aide_accordee = r.Aide_demandee;
    demandeurs.push(r);
    dossiers.push({
      id: id, dossier_number: r.dossier_number, state: etatDN, date_depot: depot.toISOString(),
      date_traitement: etatDN === 'accepte' || etatDN === 'refuse' ? new Date(depot.getTime() + (5 + Math.floor(rnd() * 40)) * 86400000).toISOString() : ''
    });
  }

  // Quelques liens à débusquer dans la Toile : IBAN partagés, SIRET/PACAGE en double, associés GAEC communs.
  function copy(field, from, to) { demandeurs[to][field] = demandeurs[from][field]; }
  copy('IBAN', 3, 57); copy('IBAN', 3, 190);
  copy('IBAN', 18, 101);
  copy('IBAN', 44, 212);
  copy('siret', 70, 71); demandeurs[71].raison_sociale = demandeurs[70].raison_sociale;
  copy('PACAGE_DN', 120, 164);
  copy('usager_email', 57, 90);
  [3, 57, 190, 18, 101, 44, 212, 70, 71, 120, 164].forEach(function (k) {
    demandeurs[k].Anomalie = demandeurs[k].Anomalie.concat(k === 70 || k === 71 ? ['Plusieurs DN pour le même SIRET'] : k === 120 || k === 164 ? ['Plusieurs DN pour le même PACAGE'] : []);
  });
  var aid = 1;
  var gaecs = demandeurs.filter(function (d) { return d.GAEC; });
  gaecs.forEach(function (g) {
    for (var k = 0; k < g.Nb_parts; k++) associes.push({ id: aid++, Pacage: g.PACAGE_DN, Pacage_enfant: '0' + g.dep2 + digits(6) });
  });
  // Un même associé déclaré dans deux GAEC différents (x3).
  [[0, 5], [8, 13], [20, 27]].forEach(function (p) {
    if (!gaecs[p[0]] || !gaecs[p[1]]) return;
    var partage = associes.filter(function (a) { return a.Pacage === gaecs[p[0]].PACAGE_DN; })[0];
    associes.push({ id: aid++, Pacage: gaecs[p[1]].PACAGE_DN, Pacage_enfant: partage.Pacage_enfant });
    gaecs[p[0]].Verif_associes = gaecs[p[1]].Verif_associes = 'Plusieurs DN (' + gaecs[p[0]].dossier_number + ', ' + gaecs[p[1]].dossier_number + ') pour un même associé ' + partage.Pacage_enfant;
  });

  var enveloppes = [], eid = 1;
  var departements = depKeys.map(function (d, k) {
    var mine = demandeurs.filter(function (r) { return r.dep2 === d; });
    var envIds = [];
    ENVELOPPES[d].forEach(function (e) { envIds.push(eid); enveloppes.push({ id: eid++, dep: d, libelle: e[0], montant: e[1], montant_accorde: 0, montant_demande: 0 }); });
    mine.forEach(function (r) {
      if (r.Selectionne) {
        r.Enveloppe = envIds[r.Etat_dossier === 'Enveloppe à renseigner' ? -1 : Math.floor(rnd() * envIds.length)] || 0;
        var e = enveloppes.filter(function (x) { return x.id === r.Enveloppe; })[0];
        if (e) { e.montant_accorde += r.Aide_accordee; e.montant_demande += r.Aide_demandee; }
      }
    });
    var glob = ENVELOPPES[d].reduce(function (a, e) { return a + e[1]; }, 0);
    var acc = mine.reduce(function (a, r) { return a + r.Aide_accordee; }, 0);
    var dem = mine.reduce(function (a, r) { return a + r.Aide_demandee; }, 0);
    var p = PARAMS[d];
    return {
      id: k + 1, code_dep: d, Forfait: p.Forfait, Bonus_JA: p.Bonus_JA, Transparence_GAEC: p.Transparence_GAEC,
      Limite_NB_GAEC: p.Limite_NB_GAEC, Bonus_assurance: p.Bonus_assurance, Bonus_AREA: p.Bonus_AREA,
      Enveloppe_globale: glob, Montants_accordes: acc, Montants_demandes: dem, Taux_de_consommation: glob ? acc / glob : null,
      DN_deposee: mine.length
    };
  });

  window.DemoData = {
    tables: {
      Demarche_155804_demandeurs: demandeurs,
      Demarche_155804_dossiers: dossiers,
      DATA_ASSOCIES: associes,
      Liste_Departement: departements,
      Liste_enveloppes: enveloppes,
      Sync_metadata: [{ id: 1, demarche_number: '155804', last_sync_at: '2026-09-25T12:32:00Z', last_sync_status: 'success' }]
    }
  };
})();
