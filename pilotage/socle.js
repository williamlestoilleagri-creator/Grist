/* ==========================================================================
   Pilotage de projets – socle commun des widgets Grist
   - lecture de la structure du document et détection automatique
     des tables / colonnes (projets, tâches, jalons, équipe, temps…)
   - écran de configuration partagé (association rôles ↔ colonnes)
   - lecture normalisée des données et écriture typée
   - mode démonstration hors de Grist (données fictives en mémoire)
   ========================================================================== */
(function () {
  'use strict';
  const P = window.Pilotage = {};
  const SCRIPT_URL = document.currentScript ? document.currentScript.src : '';

  /* ------------------------------------------------------------------ */
  /* Utilitaires                                                         */
  /* ------------------------------------------------------------------ */
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const pad = n => String(n).padStart(2, '0');
  P.norm = norm; P.esc = esc;

  P.$ = (sel, root) => (root || document).querySelector(sel);
  P.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  P.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  P.uniq = a => Array.from(new Set(a));
  P.somme = a => a.reduce((s, x) => s + (Number(x) || 0), 0);
  P.fmtNb = (n, dec) => n == null || isNaN(n) ? '–' : Number(n).toLocaleString('fr-FR', {maximumFractionDigits: dec == null ? 1 : dec});
  P.fmtPct = n => n == null || isNaN(n) ? '–' : Math.round(n * 100) + ' %';
  P.fmtEuro = n => n == null || isNaN(n) ? '–' : Number(n).toLocaleString('fr-FR', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0});

  /* ----- Dates (toujours à minuit, heure locale) ----- */
  P.today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  P.jour = d => d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
  P.addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  P.addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), 28));
  P.diffDays = (a, b) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) -
    Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 864e5);
  P.iso = d => d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
  P.fromIso = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  P.fmtDate = d => d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
  P.fmtDateCourt = d => d ? d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'}) : '';
  P.fmtDateLong = d => d ? d.toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}) : '';
  P.fmtDateHeure = d => d ? d.toLocaleString('fr-FR', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '';
  P.lundi = d => { const j = (d.getDay() + 6) % 7; return P.addDays(P.jour(d), -j); };
  P.semaineIso = d => {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const n = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - n + 3);
    const p = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((t - p) / 864e5 - 3 + ((p.getUTCDay() + 6) % 7)) / 7);
  };
  P.parseDateTexte = s => {
    if (!s) return null;
    s = String(s).trim();
    let m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(s);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]); }
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  };
  /* Jours fériés en France métropolitaine */
  const feriesCache = {};
  P.feries = annee => {
    if (feriesCache[annee]) return feriesCache[annee];
    const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
    const paques = new Date(annee, mois - 1, jour);
    const liste = [[0, 1], [4, 1], [4, 8], [6, 14], [7, 15], [10, 1], [10, 11], [11, 25]].map(([mo, j]) => new Date(annee, mo, j));
    liste.push(P.addDays(paques, 1), P.addDays(paques, 39), P.addDays(paques, 50));
    return (feriesCache[annee] = new Set(liste.map(P.iso)));
  };
  P.estOuvre = d => { const j = d.getDay(); return j !== 0 && j !== 6 && !P.feries(d.getFullYear()).has(P.iso(d)); };
  P.joursOuvres = (debut, fin) => { const r = []; for (let d = P.jour(debut); d <= fin; d = P.addDays(d, 1)) if (P.estOuvre(d)) r.push(d); return r; };
  P.relatif = n => {
    if (n == null) return '';
    if (n === 0) return "aujourd'hui";
    if (n === 1) return 'demain';
    if (n === -1) return 'hier';
    return n > 0 ? `dans ${n} j` : `il y a ${-n} j`;
  };

  /* ----- Sémantique métier (statuts, priorités, rôles) ----- */
  P.estAbandon = s => /abandon|annul/i.test(s || '');
  P.estTermine = s => /termin|fait\b|clos|ferm|done|achev|livr|realis|réalis|valid/i.test(s || '') && !P.estAbandon(s);
  P.estClos = s => P.estTermine(s) || P.estAbandon(s);
  P.estAttente = s => /attente|bloqu|suspend/i.test(s || '');
  P.estPause = s => /pause|suspend|gel/i.test(s || '');
  P.estEnCours = s => /cours|progress|demarr|démarr/i.test(s || '');
  P.rangPriorite = p => {
    const s = norm(p);
    if (!s) return 9;
    const m = /p(\d)/.exec(s); if (m) return +m[1];
    if (/critique|urgent|tres/.test(s)) return 1;
    if (/haut|forte|eleve/.test(s)) return 2;
    if (/normal|moyen/.test(s)) return 3;
    if (/bas|faible/.test(s)) return 4;
    const d = /(\d)/.exec(s); return d ? +d[1] : 9;
  };
  P.lettreRole = r => { const m = /[RACI]/.exec(String(r || '').toUpperCase().replace(/^[^A-Z]*/, '')); return m ? m[0] : ''; };

  /** Urgence d'une tâche (mêmes règles que la formule Grist) */
  P.urgence = t => {
    if (P.estClos(t.statut)) return {code: 'clos', libelle: '⚪ Clos', rang: 9, classe: ''};
    if (!t.echeance) return {code: 'sans', libelle: '⚪ Sans échéance', rang: 4, classe: ''};
    const j = P.diffDays(t.echeance, P.today());
    if (j < 0) return {code: 'retard', libelle: '🔴 En retard', rang: 0, classe: 'err', jours: j};
    if (j <= 7 || P.rangPriorite(t.priorite) === 1) return {code: 'urgent', libelle: '🟠 Urgent', rang: 1, classe: 'warn', jours: j};
    if (j <= 30) return {code: 'surveiller', libelle: '🟡 À surveiller', rang: 2, classe: 'jaune', jours: j};
    return {code: 'ok', libelle: '🟢 Dans les temps', rang: 3, classe: 'ok', jours: j};
  };
  /** Avancement d'une tâche borné entre 0 et 1 */
  P.avancement = t => {
    if (P.estTermine(t.statut)) return 1;
    const a = Number(t.avancement); return isNaN(a) ? 0 : Math.max(0, Math.min(1, a > 1.0001 && a <= 100 ? a / 100 : a));
  };

  /* Indicateurs d'un projet calculés à partir des tâches et des temps */
  P.tachesDuProjet = id => P.liste('tache').filter(t => t.projet === id);
  P.avancementProjet = id => {
    const t = P.tachesDuProjet(id).filter(x => !P.estAbandon(x.statut));
    if (!t.length) return 0;
    const poids = t.map(x => Math.max(x.charge || 0, 0) || 1);
    return t.reduce((s, x, i) => s + poids[i] * P.avancement(x), 0) / P.somme(poids);
  };
  P.chargeReelleProjet = id => P.somme(P.liste('temps').filter(x => x.projet === id || (x.tache && (P.get('tache', x.tache) || {}).projet === id && !x.projet)).map(x => x.duree));
  P.chargePlanifieeProjet = id => P.somme(P.tachesDuProjet(id).map(t => Math.max(t.charge || 0, 0)));
  P.santeProjet = p => {
    if (P.estClos(p.phase)) return {l: '⚪ Clos', c: '', rang: 5};
    if (P.estPause(p.phase)) return {l: '⏸️ En pause', c: '', rang: 4};
    const retards = P.tachesDuProjet(p.id).filter(t => P.urgence(t).code === 'retard').length;
    const j = p.fin ? P.diffDays(p.fin, P.today()) : null;
    if (retards || (j != null && j < 0)) return {l: '⛈️ Critique', c: 'err', rang: 0};
    if (p.charge && P.chargeReelleProjet(p.id) > p.charge) return {l: '🌧️ Charge dépassée', c: 'warn', rang: 1};
    if (j != null && j <= 15 && P.avancementProjet(p.id) < .8) return {l: '🌥️ Tendu', c: 'jaune', rang: 2};
    return {l: '☀️ OK', c: 'ok', rang: 3};
  };

  /* ------------------------------------------------------------------ */
  /* Catalogue des entités métier et de leurs champs                     */
  /* kind : texte | nombre | date | datetime | bool | choix | choix_multi */
  /*        | ref:<entité> | refs:<entité>                                 */
  /* ------------------------------------------------------------------ */
  const E = P.ENTITES = {
    projet: {libelle: 'Projets', tables: ['projets', 'projet', 'portefeuille'], champs: {
      titre: {l: 'Intitulé', k: 'texte', req: true, syn: ['intitule', 'titre', 'nom', 'libelle', 'projet', 'nomduprojet', 'name']},
      code: {l: 'Code', k: 'texte', syn: ['code', 'reference', 'ref', 'numero']},
      domaine: {l: 'Domaine', k: 'choix', syn: ['domaine', 'pole', 'categorie', 'thematique']},
      phase: {l: 'Phase / statut', k: 'choix', ecrit: true, syn: ['phase', 'statut', 'etat', 'status', 'avancementphase']},
      priorite: {l: 'Priorité', k: 'choix', syn: ['priorite', 'priority', 'importance']},
      chefs: {l: 'Chef(s) de projet', k: 'refs:agent', syn: ['chargedemission', 'chefdeprojet', 'chefsdeprojet', 'responsable', 'pilote', 'referent', 'chef']},
      debut: {l: 'Date de début', k: 'date', syn: ['datededebut', 'datedebut', 'debut', 'start', 'lancement']},
      fin: {l: 'Deadline', k: 'date', syn: ['deadline', 'datefinprevue', 'datedefinprevue', 'echeance', 'datedefin', 'datefin', 'fin', 'delai']},
      fin_reelle: {l: 'Date de fin réelle', k: 'date', syn: ['datedefinreelle', 'datefinreelle', 'finreelle', 'cloture']},
      charge: {l: 'Charge estimée (J/H)', k: 'nombre', syn: ['chargeestimee', 'chargeestimeejh', 'charge', 'chargejh', 'jourshomme']},
      objectifs: {l: 'Objectifs', k: 'texte', syn: ['objectifs', 'objectif', 'but']},
      criteres: {l: 'Critères de réussite', k: 'texte', syn: ['criteresdereussite', 'objectifderealisation', 'objectifrealisation', 'criteres', 'indicateurs']},
      description: {l: 'Description', k: 'texte', syn: ['description', 'contexte', 'details']},
      contraintes: {l: 'Contraintes', k: 'texte', syn: ['contraintes', 'contrainte']},
      risques: {l: 'Risques', k: 'texte', syn: ['risques', 'risque']},
      formation: {l: 'Besoins de formation', k: 'texte', syn: ['besoindeformation', 'besoinsdeformation', 'formation']},
      parties: {l: 'Parties prenantes', k: 'refs:partie', syn: ['partieprenantes', 'partiesprenantes', 'partieprenante', 'services', 'beneficiaires']},
      prestataires: {l: 'Prestataires', k: 'refs:prestataire', syn: ['prestataires', 'prestataire', 'fournisseurs']},
      budget: {l: 'Budget prévu', k: 'nombre', syn: ['budgetprevu', 'budget']},
    }},
    tache: {libelle: 'Tâches', tables: ['taches', 'tache', 'todolist', 'todo', 'actions', 'action', 'tasks'], champs: {
      titre: {l: 'Intitulé de la tâche', k: 'texte', req: true, syn: ['action', 'intitule', 'titre', 'tache', 'libelle', 'nom', 'task']},
      projet: {l: 'Projet', k: 'ref:projet', syn: ['projet', 'project', 'dossier']},
      jalon: {l: 'Jalon', k: 'ref:jalon', syn: ['jalon', 'milestone', 'etape']},
      responsable: {l: 'Responsable', k: 'ref:agent', syn: ['responsable', 'piloteaction', 'pilote', 'assigne', 'porteur', 'agent']},
      appuis: {l: 'Appuis', k: 'refs:agent', syn: ['appuis', 'appuiaction', 'appui', 'contributeurs', 'participants']},
      statut: {l: 'Statut', k: 'choix', ecrit: true, syn: ['statut', 'etat', 'status']},
      priorite: {l: 'Priorité', k: 'choix', syn: ['priorite', 'priority', 'importance']},
      debut: {l: 'Date de début', k: 'date', syn: ['datededebut', 'datedebut', 'debut', 'start']},
      echeance: {l: 'Échéance', k: 'date', syn: ['echeance', 'dateecheance', 'datelimite', 'deadline', 'datedefin', 'fin']},
      fin_reelle: {l: 'Date de fin réelle', k: 'date', syn: ['datedefinreelle', 'datefinreelle', 'finreelle', 'realiseele']},
      charge: {l: 'Charge estimée (J/H)', k: 'nombre', syn: ['chargeestimee', 'chargeestimeejh', 'charge', 'chargejh', 'jourshomme', 'duree']},
      avancement: {l: 'Avancement', k: 'nombre', syn: ['avancement', 'progression', 'pourcentage', 'progress']},
      details: {l: 'Détails', k: 'texte', syn: ['details', 'detailsdelaction', 'description', 'commentaire']},
      suites: {l: 'Suites données', k: 'texte', syn: ['suitedonnees', 'suitesdonnees', 'suites', 'suivi']},
      theme: {l: 'Thème', k: 'refs:theme', syn: ['theme', 'themes', 'categorie']},
      prestataire: {l: 'Prestataire', k: 'ref:prestataire', syn: ['prestataire', 'fournisseur']},
      maj: {l: 'Dernière mise à jour', k: 'datetime', syn: ['dernieremiseajour', 'dernieremaj', 'majle', 'modifiele', 'updated']},
      cree_le: {l: 'Créé le', k: 'datetime', syn: ['creele', 'datecreation', 'datedecreation', 'created']},
    }},
    jalon: {libelle: 'Jalons', tables: ['jalons', 'jalon', 'milestones', 'etapes'], champs: {
      titre: {l: 'Intitulé du jalon', k: 'texte', req: true, syn: ['jalon', 'libelle', 'intitule', 'titre', 'nom']},
      projet: {l: 'Projet', k: 'ref:projet', syn: ['projet']},
      date: {l: 'Date prévue', k: 'date', syn: ['dateprevue', 'date', 'echeance']},
      atteint: {l: 'Atteint', k: 'bool', syn: ['atteint', 'fait', 'valide', 'realise']},
      date_reelle: {l: 'Date réelle', k: 'date', syn: ['datereelle', 'datedereelle', 'realisele']},
    }},
    agent: {libelle: 'Équipe', tables: ['equipe', 'intervenants', 'agents', 'personnes', 'membres', 'interne', 'acteurs', 'collaborateurs'], champs: {
      nom_complet: {l: 'Nom affiché', k: 'texte', syn: ['nomcomplet', 'nomprenom', 'prenomnom', 'acteurs', 'acteurtrice', 'agent', 'personne', 'identite']},
      prenom: {l: 'Prénom', k: 'texte', syn: ['prenom', 'firstname']},
      nom: {l: 'Nom', k: 'texte', syn: ['nom', 'lastname', 'name']},
      mail: {l: 'Mail', k: 'texte', syn: ['mail', 'email', 'courriel', 'adressemail']},
      fonction: {l: 'Fonction', k: 'choix_multi', syn: ['fonction', 'fonctions', 'poste', 'role']},
      service: {l: 'Service', k: 'texte', syn: ['service', 'structure', 'unite']},
    }},
    temps: {libelle: 'Temps passés', tables: ['temps', 'saisietemps', 'feuilledetemps', 'activite', 'activites', 'timesheet', 'imputations'], champs: {
      date: {l: 'Date', k: 'date', req: true, syn: ['date', 'jour']},
      agent: {l: 'Agent', k: 'ref:agent', syn: ['agent', 'personne', 'collaborateur', 'utilisateur']},
      duree: {l: 'Durée (J/H)', k: 'nombre', req: true, syn: ['dureejh', 'duree', 'temps', 'jours', 'charge']},
      type: {l: "Type d'activité", k: 'choix', syn: ['typeactivite', 'typedactivite', 'activite', 'type', 'nature']},
      tache: {l: 'Tâche', k: 'ref:tache', syn: ['tache', 'action']},
      projet: {l: 'Projet', k: 'ref:projet', syn: ['projet']},
      commentaire: {l: 'Commentaire', k: 'texte', syn: ['commentaires', 'commentaire', 'description']},
    }},
    role: {libelle: 'Rôles (RACI)', tables: ['rolesprojet', 'roles', 'raci', 'affectations'], champs: {
      projet: {l: 'Projet', k: 'ref:projet', req: true, syn: ['projet']},
      personne: {l: 'Personne', k: 'ref:agent', req: true, syn: ['personne', 'agent', 'membre', 'acteur']},
      role: {l: 'Rôle (R/A/C/I)', k: 'choix', req: true, syn: ['role', 'raci', 'fonction']},
      part: {l: 'Temps consacré', k: 'nombre', syn: ['tempsconsacre', 'parttemps', 'part', 'pourcentage']},
      commentaire: {l: 'Commentaire', k: 'texte', syn: ['commentaire', 'commentaires']},
    }},
    prestataire: {libelle: 'Prestataires', tables: ['prestataires', 'prestataire', 'fournisseurs', 'titulaires'], champs: {
      nom: {l: 'Raison sociale', k: 'texte', req: true, syn: ['raisonsociale', 'libelle', 'nom', 'societe', 'entreprise']},
      type: {l: 'Type de relation', k: 'choix', syn: ['typerelation', 'typederelation', 'relation', 'type']},
      marche: {l: 'Réf. marché / contrat', k: 'texte', syn: ['marcheref', 'refmarche', 'referencemarche', 'marche', 'contrat', 'numero']},
      debut: {l: 'Début de contrat', k: 'date', syn: ['debutdecontrat', 'datedebutcontrat', 'debutcontrat', 'debut']},
      fin: {l: 'Fin de contrat', k: 'date', syn: ['findecontrat', 'datefincontrat', 'fincontrat', 'echeance', 'fin']},
      montant: {l: 'Montant', k: 'nombre', syn: ['montantdumarche', 'montantmarche', 'montant']},
      specialite: {l: 'Spécialité', k: 'choix_multi', syn: ['specialite', 'specialites', 'domaine']},
      representant: {l: 'Représentant', k: 'texte', syn: ['representant', 'contact', 'interlocuteur']},
      mail: {l: 'Mail', k: 'texte', syn: ['mail', 'email', 'courriel']},
      telephone: {l: 'Téléphone', k: 'texte', syn: ['telephone', 'tel', 'phone']},
    }},
    sous_tache: {libelle: 'Sous-tâches', tables: ['soustaches', 'soustache', 'checklist', 'checklists', 'subtasks'], creable: true, champs: {
      tache: {l: 'Tâche parente', k: 'ref:tache', req: true, syn: ['tache', 'parent', 'action']},
      libelle: {l: 'Libellé', k: 'texte', req: true, syn: ['libelle', 'intitule', 'titre', 'nom']},
      fait: {l: 'Fait', k: 'bool', req: true, syn: ['fait', 'termine', 'coche', 'done', 'realise']},
      ordre: {l: 'Ordre', k: 'nombre', syn: ['ordre', 'position', 'rang']},
      responsable: {l: 'Responsable', k: 'ref:agent', syn: ['responsable', 'agent', 'pilote']},
      echeance: {l: 'Échéance', k: 'date', syn: ['echeance', 'date', 'datelimite']},
    }},
    partie: {libelle: 'Parties prenantes', tables: ['partieprenantes', 'partiesprenantes', 'services'], champs: {
      nom: {l: 'Libellé', k: 'texte', req: true, syn: ['service', 'nom', 'libelle', 'intitule']},
    }},
    theme: {libelle: 'Thèmes', tables: ['themes', 'theme', 'categories'], champs: {
      nom: {l: 'Libellé', k: 'texte', req: true, syn: ['liste', 'theme', 'libelle', 'nom', 'intitule']},
    }},
    tuto: {libelle: 'Modes d’emploi', tables: ['tutos', 'tuto', 'modesdemploi', 'modedemploi', 'tutoriels', 'aide', 'documentation'], creable: true, champs: {
      cle: {l: 'Widget concerné (clé)', k: 'texte', req: true, syn: ['widget', 'cle', 'identifiant', 'code']},
      titre: {l: 'Titre', k: 'texte', req: true, syn: ['titre', 'intitule', 'nom']},
      contenu: {l: 'Contenu (HTML)', k: 'texte', req: true, syn: ['contenu', 'texte', 'corps', 'html']},
      ordre: {l: 'Ordre', k: 'nombre', syn: ['ordre', 'position', 'rang']},
      maj: {l: 'Mis à jour le', k: 'datetime', syn: ['misajourle', 'dernieremiseajour', 'majle', 'modifiele']},
      maj_par: {l: 'Mis à jour par', k: 'texte', syn: ['misajourpar', 'dernieremiseajourpar', 'majpar', 'modifiepar']},
    }},
  };
  /* Structure créée automatiquement pour les entités « créables » */
  P.STRUCTURES = {
    tuto: {table: 'DATA_Tutos', besoin: [], cols: () => [
      {id: 'Widget', type: 'Text', champ: 'cle'},
      {id: 'Titre', type: 'Text', champ: 'titre'},
      {id: 'Contenu', type: 'Text', champ: 'contenu'},
      {id: 'Ordre', type: 'Numeric', champ: 'ordre'},
      {id: 'Mis_a_jour_le', type: 'DateTime:Europe/Paris', champ: 'maj', declencheur: 'NOW()'},
      {id: 'Mis_a_jour_par', type: 'Text', champ: 'maj_par', declencheur: 'user.Name'},
    ]},
    sous_tache: {table: 'DATA_Sous_taches', besoin: ['tache'], cols: (cible) => [
      {id: 'Tache', type: 'Ref:' + cible.tache, champ: 'tache'},
      {id: 'Libelle', type: 'Text', champ: 'libelle'},
      {id: 'Fait', type: 'Bool', champ: 'fait'},
      {id: 'Ordre', type: 'Numeric', champ: 'ordre'},
      {id: 'Responsable', type: cible.agent ? 'Ref:' + cible.agent : 'Text', champ: 'responsable'},
      {id: 'Echeance', type: 'Date', champ: 'echeance'},
    ]},
  };

  const baseKind = k => k.split(':')[0];
  const cibleKind = k => k.split(':')[1];

  /* Compatibilité type de colonne Grist ↔ nature du champ */
  function compat(kind, type) {
    const t = (type || 'Any').split(':')[0];
    const k = baseKind(kind);
    const table = {
      texte: ['Text', 'Choice', 'Any'],
      nombre: ['Numeric', 'Int'],
      date: ['Date', 'DateTime', 'Text'],
      datetime: ['DateTime', 'Date'],
      bool: ['Bool'],
      choix: ['Choice', 'Text'],
      choix_multi: ['ChoiceList', 'Choice', 'Text', 'RefList', 'Ref'],
      ref: ['Ref', 'RefList', 'Text', 'Choice'],
      refs: ['RefList', 'Ref', 'ChoiceList', 'Text', 'Choice'],
    }[k] || [];
    const i = table.indexOf(t);
    return i < 0 ? 0 : (i === 0 ? 3 : 2);
  }

  /* ------------------------------------------------------------------ */
  /* Accès aux données : Grist ou démonstration                          */
  /* ------------------------------------------------------------------ */
  const enGrist = () => typeof window.grist !== 'undefined' && window.self !== window.top;

  function schemaDepuisMeta(T, C) {
    const tables = {};
    const colParRef = {};
    T.id.forEach((id, i) => {
      const tid = T.tableId[i];
      if (!tid || /^GristHidden_/.test(tid) || (T.summarySourceTable && T.summarySourceTable[i]) || /^_grist/.test(tid)) return;
      tables[id] = {id: tid, cols: []};
    });
    C.id.forEach((id, i) => {
      const t = tables[C.parentId[i]];
      const colId = C.colId[i];
      colParRef[id] = {colId, parent: C.parentId[i]};
      if (!t || colId === 'manualSort' || /^gristHelper_/.test(colId)) return;
      t.cols.push({ref: id, colId, label: (C.label && C.label[i]) || colId, type: C.type[i] || 'Any',
        isFormula: !!C.isFormula[i], formula: (C.formula && C.formula[i]) || '', widgetOptions: (C.widgetOptions && C.widgetOptions[i]) || '',
        visibleColRef: (C.visibleCol && C.visibleCol[i]) || 0});
    });
    const res = {};
    Object.values(tables).forEach(t => {
      t.cols.forEach(c => { const v = colParRef[c.visibleColRef]; c.visibleCol = v ? v.colId : ''; });
      res[t.id] = t;
    });
    return res;
  }

  const GristBackend = {
    nom: 'grist',
    async init(onChange, onCurseur) {
      let optsRecues = false;
      this.options = null;
      const premieresOptions = new Promise(res => {
        grist.onOptions(opts => {
          this.options = opts || null;
          if (!optsRecues) { optsRecues = true; res(); } else onChange('options');
        });
        setTimeout(res, 2500);
      });
      const pret = {requiredAccess: 'full', allowSelectBy: false, onEditOptions: () => P.ouvrirConfig()};
      if (P.cfg.colonnes) pret.columns = P.cfg.colonnes; // colonnes choisies dans le panneau de droite de Grist
      grist.ready(pret);
      grist.onRecords((recs, mappings) => {
        if (P.cfg.colonnes) P.L.recevoir(recs || [], mappings || null);
        if (P.cfg.surLignes) P.cfg.surLignes(recs || [], mappings || null);
        onChange(P.cfg.colonnes ? 'force' : 'records');
      }, {keepEncoded: true, expandRefs: false});
      grist.onRecord(async rec => {
        if (!rec) return;
        let tableId = null;
        try { tableId = await (grist.selectedTable || grist.getTable()).getTableId(); } catch (e) { /* ignoré */ }
        onCurseur(tableId, rec.id);
      });
      await premieresOptions;
    },
    async schema() {
      const T = await grist.docApi.fetchTable('_grist_Tables');
      const C = await grist.docApi.fetchTable('_grist_Tables_column');
      return schemaDepuisMeta(T, C);
    },
    fetch: t => grist.docApi.fetchTable(t),
    apply: a => grist.docApi.applyUserActions(a),
    async docName() { try { return await grist.docApi.getDocName(); } catch (e) { return 'document'; } },
    async setOptions(o) { await grist.setOptions(o); this.options = o; },
    getOptions() { return this.options; },
  };

  /* Base de démonstration : mêmes formats que Grist (colonnes, dates en secondes…) */
  const CLE_DEMO = 'pilotage-demo-v3';
  const DemoBackend = {
    nom: 'demo',
    async init(onChange) {
      if (!window.PILOTAGE_DEMO) await chargerScript(new URL('demo-data.js', SCRIPT_URL || location.href).href);
      let base = null;
      try { base = JSON.parse(localStorage.getItem(CLE_DEMO) || 'null'); } catch (e) { /* ignoré */ }
      this.base = base || window.PILOTAGE_DEMO.construire();
      try { this.options = JSON.parse(localStorage.getItem(CLE_DEMO + ':opts:' + P.cfg.id) || 'null'); } catch (e) { this.options = null; }
      window.addEventListener('storage', ev => {
        if (ev.key === CLE_DEMO && ev.newValue) { this.base = JSON.parse(ev.newValue); onChange('records'); }
      });
    },
    sauver() { try { localStorage.setItem(CLE_DEMO, JSON.stringify(this.base)); } catch (e) { /* ignoré */ } },
    reinitialiser() { localStorage.removeItem(CLE_DEMO); this.base = window.PILOTAGE_DEMO.construire(); },
    async schema() {
      const res = {};
      Object.entries(this.base.tables).forEach(([tid, t]) => {
        res[tid] = {id: tid, cols: Object.entries(t.cols).map(([colId, c]) => ({colId, label: c.label || colId, type: c.type,
          isFormula: !!c.formule, formula: c.formule ? 'calculée' : '', widgetOptions: c.choix ? JSON.stringify({choices: c.choix}) : '',
          visibleCol: c.visible || ''}))};
      });
      return res;
    },
    async fetch(tid) {
      const t = this.base.tables[tid];
      if (!t) throw new Error('Table inconnue : ' + tid);
      const out = {id: t.rows.map(r => r.id)};
      Object.entries(t.cols).forEach(([c, def]) => {
        out[c] = t.rows.map(r => def.formule ? window.PILOTAGE_DEMO.formule(this.base, tid, c, r) : (r[c] === undefined ? null : r[c]));
      });
      return out;
    },
    async apply(actions) {
      const ret = [];
      for (const a of actions) {
        const [op, tid] = a;
        const t = this.base.tables[tid];
        if (op === 'AddTable') {
          this.base.tables[tid] = {cols: {}, rows: [], next: 1};
          a[2].forEach(c => { this.base.tables[tid].cols[c.id] = {type: c.type}; });
          ret.push({table_id: tid}); continue;
        }
        if (!t) throw new Error('Table inconnue : ' + tid);
        const nouveau = vals => { const id = t.next++; const r = {id}; Object.assign(r, vals); t.rows.push(r); return id; };
        if (op === 'AddRecord') ret.push(nouveau(a[3]));
        else if (op === 'BulkAddRecord') {
          const ids = a[2].map((_, i) => { const v = {}; Object.keys(a[3]).forEach(c => { v[c] = a[3][c][i]; }); return nouveau(v); });
          ret.push(ids);
        } else if (op === 'UpdateRecord') { const r = t.rows.find(x => x.id === a[2]); if (r) Object.assign(r, a[3]); ret.push(null); }
        else if (op === 'BulkUpdateRecord') {
          a[2].forEach((id, i) => { const r = t.rows.find(x => x.id === id); if (r) Object.keys(a[3]).forEach(c => { r[c] = a[3][c][i]; }); });
          ret.push(null);
        } else if (op === 'RemoveRecord') { t.rows = t.rows.filter(x => x.id !== a[2]); ret.push(null); }
        else if (op === 'BulkRemoveRecord') { const s = new Set(a[2]); t.rows = t.rows.filter(x => !s.has(x.id)); ret.push(null); }
        else ret.push(null);
      }
      this.sauver();
      return {retValues: ret};
    },
    async docName() { return 'Démonstration'; },
    async setOptions(o) { this.options = o; localStorage.setItem(CLE_DEMO + ':opts:' + P.cfg.id, JSON.stringify(o)); },
    getOptions() { return this.options; },
  };

  function chargerScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Impossible de charger ' + src)); document.head.appendChild(s); });
  }

  /* ------------------------------------------------------------------ */
  /* Détection automatique                                               */
  /* ------------------------------------------------------------------ */
  function nomTableNorm(tid) { return norm(tid).replace(/^data/, '').replace(/^tbl/, ''); }

  function scoreChamp(def, col) {
    const n1 = norm(col.colId), n2 = norm(col.label);
    let s = 0;
    def.syn.forEach((syn, i) => {
      const bonus = Math.max(0, 3 - i * 0.15);
      if (n1 === syn || n2 === syn) s = Math.max(s, 10 + bonus);
      else if (syn.length > 3 && (n1.startsWith(syn) || n2.startsWith(syn))) s = Math.max(s, 6 + bonus);
      else if (syn.length > 4 && (n1.includes(syn) || n2.includes(syn))) s = Math.max(s, 4 + bonus);
    });
    if (!s) return 0;
    const c = compat(def.k, col.type);
    if (!c) return 0;
    s += c;
    if (col.isFormula && col.formula && def.ecrit) s -= 3;
    return s;
  }

  function detecterChamps(entite, table) {
    const defs = E[entite].champs;
    const cand = [];
    Object.entries(defs).forEach(([ch, def]) => table.cols.forEach(col => { const s = scoreChamp(def, col); if (s > 0) cand.push({ch, col: col.colId, s}); }));
    cand.sort((a, b) => b.s - a.s);
    const pris = new Set(), res = {};
    cand.forEach(c => { if (res[c.ch] || pris.has(c.col)) return; res[c.ch] = c.col; pris.add(c.col); });
    return res;
  }

  P.detecter = function (schema, entites) {
    const tous = Object.keys(E);
    const scores = [];
    tous.forEach(ent => Object.values(schema).forEach(t => {
      const n = nomTableNorm(t.id);
      let s = 0;
      E[ent].tables.forEach((syn, i) => { if (n === syn) s = Math.max(s, 20 - i * .2); else if (n.startsWith(syn) || n.endsWith(syn)) s = Math.max(s, 12 - i * .2); });
      const ch = detecterChamps(ent, t);
      const reqOk = Object.entries(E[ent].champs).filter(([, d]) => d.req).every(([k]) => ch[k]);
      if (!reqOk) return;
      s += Object.keys(ch).length * 0.8;
      if (s >= 10) scores.push({ent, table: t.id, s});
    }));
    scores.sort((a, b) => b.s - a.s);
    const map = {}, prises = new Set();
    scores.forEach(x => { if (map[x.ent] || prises.has(x.table)) return; map[x.ent] = {table: x.table, champs: {}}; prises.add(x.table); });
    // Affinage par les références : la colonne « Projet » d'une tâche pointe sur la table des projets, etc.
    for (let passe = 0; passe < 2; passe++) {
      Object.entries(map).forEach(([ent, m]) => {
        const t = schema[m.table];
        const ch = detecterChamps(ent, t);
        Object.entries(ch).forEach(([k, colId]) => {
          const kind = E[ent].champs[k].k;
          const cible = cibleKind(kind);
          const col = t.cols.find(c => c.colId === colId);
          const refT = /^Ref(List)?:/.test(col.type) ? col.type.split(':')[1] : null;
          if (cible && refT && schema[refT] && (!map[cible] || map[cible].table !== refT)) {
            if (!map[cible]) { map[cible] = {table: refT, champs: {}}; prises.add(refT); }
            else if (!Object.values(map).some(x => x.table === refT)) map[cible].table = refT;
          }
        });
      });
    }
    Object.entries(map).forEach(([ent, m]) => {
      m.champs = detecterChamps(ent, schema[m.table]);
      // Libellé d'une table auxiliaire : colonne affichée par les références
      if ((ent === 'partie' || ent === 'theme') && !m.champs.nom) {
        const t = schema[m.table]; const c = t.cols.find(x => x.type === 'Text');
        if (c) m.champs.nom = c.colId;
      }
    });
    if (entites) Object.keys(map).forEach(k => { if (!entites.includes(k) && !dependances(entites).includes(k)) delete map[k]; });
    return map;
  };

  function dependances(entites) {
    const res = new Set(entites);
    let change = true;
    while (change) {
      change = false;
      Array.from(res).forEach(ent => Object.values(E[ent].champs).forEach(d => { const c = cibleKind(d.k); if (c && !res.has(c)) { res.add(c); change = true; } }));
    }
    return Array.from(res);
  }

  /* ------------------------------------------------------------------ */
  /* Lecture et normalisation                                            */
  /* ------------------------------------------------------------------ */
  const estListe = v => Array.isArray(v) && v[0] === 'L';
  const dateDepuisGrist = (v, type) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      const d = new Date(v * 1000);
      return /^DateTime/.test(type) ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    if (typeof v === 'string') return P.parseDateTexte(v);
    return null;
  };

  function lireValeur(v, kind, col) {
    const k = baseKind(kind);
    const type = col.type || 'Any';
    if (Array.isArray(v) && v[0] === 'E') v = null; // valeur en erreur
    switch (k) {
      case 'texte': if (estListe(v)) return v.slice(1).join(', '); return v == null ? '' : String(v);
      case 'nombre': { if (v == null || v === '') return null; if (typeof v === 'number') return v; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
      case 'date': return dateDepuisGrist(v, type);
      case 'datetime': return typeof v === 'number' ? new Date(v * 1000) : (typeof v === 'string' ? P.parseDateTexte(v) : null);
      case 'bool': return v === true || v === 1 || /^(oui|true|vrai|x|1)$/i.test(String(v || ''));
      case 'choix': if (estListe(v)) return v[1] || ''; return v == null ? '' : String(v);
      case 'choix_multi': if (estListe(v)) return v.slice(1).map(String); if (v == null || v === '') return []; return String(v).split(/\s*[,;]\s*/).filter(Boolean);
      case 'ref': {
        if (/^Ref:/.test(type)) return v || null;
        if (/^RefList:/.test(type)) return estListe(v) && v.length > 1 ? v[1] : null;
        return v ? {texte: String(v)} : null;
      }
      case 'refs': {
        if (/^RefList:/.test(type)) return estListe(v) ? v.slice(1) : [];
        if (/^Ref:/.test(type)) return v ? [v] : [];
        if (estListe(v)) return v.slice(1).map(x => ({texte: String(x)}));
        return v ? String(v).split(/\s*[,;]\s*/).filter(Boolean).map(x => ({texte: x})) : [];
      }
    }
    return v;
  }

  /* ------------------------------------------------------------------ */
  /* Contexte d'exécution                                                */
  /* ------------------------------------------------------------------ */
  const etat = {schema: null, mapping: null, donnees: {}, index: {}, signature: '', backend: null, reglages: {}, docName: ''};
  P.etat = etat;

  P.colonne = (ent, ch) => {
    const m = etat.mapping && etat.mapping[ent];
    if (!m || !m.champs[ch] || !etat.schema[m.table]) return null;
    return etat.schema[m.table].cols.find(c => c.colId === m.champs[ch]) || null;
  };
  P.a = (ent, ch) => !!P.colonne(ent, ch);
  P.modifiable = (ent, ch) => { const c = P.colonne(ent, ch); return !!c && !(c.isFormula && c.formula); };
  P.aDeclencheur = (ent, ch) => { const c = P.colonne(ent, ch); return !!c && !c.isFormula && !!c.formula; };
  P.choix = (ent, ch) => {
    const c = P.colonne(ent, ch);
    let l = [];
    if (c) { try { l = JSON.parse(c.widgetOptions || '{}').choices || []; } catch (e) { l = []; } }
    if (!l.length && etat.donnees[ent]) l = P.uniq(etat.donnees[ent].flatMap(r => Array.isArray(r[ch]) ? r[ch] : [r[ch]]).filter(x => x && typeof x === 'string')).sort();
    return l;
  };
  P.table = ent => etat.mapping && etat.mapping[ent] ? etat.mapping[ent].table : null;
  P.liste = ent => etat.donnees[ent] || [];
  P.get = (ent, id) => (etat.index[ent] && etat.index[ent].get(id)) || null;
  P.libelle = (ent, id) => {
    if (id == null) return '';
    if (typeof id === 'object' && id.texte) return id.texte;
    const r = P.get(ent, id);
    if (!r) return '';
    return r._libelle || '';
  };
  P.libelles = (ent, ids) => (ids || []).map(id => P.libelle(ent, id)).filter(Boolean);
  P.choixStatut = (ent, ch, test) => P.choix(ent, ch).find(test) || '';

  function libelleDe(ent, r) {
    switch (ent) {
      case 'agent': return r.nom_complet || [r.prenom, r.nom].filter(Boolean).join(' ') || r.mail || ('#' + r.id);
      case 'prestataire': case 'partie': case 'theme': return r.nom || ('#' + r.id);
      case 'role': return [P.libelle('agent', r.personne), P.lettreRole(r.role)].filter(Boolean).join(' – ');
      case 'sous_tache': return r.libelle;
      case 'temps': return P.fmtDate(r.date);
      default: return r.titre || r.code || ('#' + r.id);
    }
  }

  async function chargerDonnees() {
    const brut = {};
    const tables = P.uniq(Object.values(etat.mapping).map(m => m.table)).filter(t => etat.schema[t]);
    await Promise.all(tables.map(async t => { brut[t] = await etat.backend.fetch(t); }));
    const sig = JSON.stringify(brut);
    const change = sig !== etat.signature;
    etat.signature = sig;
    if (!change) return false;
    const donnees = {}, index = {};
    Object.entries(etat.mapping).forEach(([ent, m]) => {
      const raw = brut[m.table];
      if (!raw || !E[ent]) return;
      const cols = etat.schema[m.table].cols;
      const lignes = raw.id.map((id, i) => {
        const r = {id, _raw: {}};
        Object.entries(E[ent].champs).forEach(([ch, def]) => {
          const colId = m.champs[ch];
          const col = colId && cols.find(c => c.colId === colId);
          r[ch] = col ? lireValeur(raw[colId] ? raw[colId][i] : null, def.k, col) : (baseKind(def.k) === 'refs' || baseKind(def.k) === 'choix_multi' ? [] : null);
        });
        Object.keys(raw).forEach(c => { r._raw[c] = raw[c][i]; });
        return r;
      });
      donnees[ent] = lignes;
      index[ent] = new Map(lignes.map(r => [r.id, r]));
    });
    etat.donnees = donnees; etat.index = index;
    // Libellés puis résolution des références saisies en texte
    Object.entries(donnees).forEach(([ent, l]) => l.forEach(r => { if (ent !== 'role') r._libelle = libelleDe(ent, r); }));
    const parTexte = {};
    const chercher = (cible, txt) => {
      if (!donnees[cible]) return txt;
      if (!parTexte[cible]) { parTexte[cible] = new Map(); donnees[cible].forEach(x => { parTexte[cible].set(norm(x._libelle), x.id); if (x.code) parTexte[cible].set(norm(x.code), x.id); }); }
      return parTexte[cible].get(norm(txt.texte)) || txt;
    };
    Object.entries(donnees).forEach(([ent, l]) => Object.entries(E[ent].champs).forEach(([ch, def]) => {
      const cible = cibleKind(def.k); if (!cible) return;
      l.forEach(r => {
        if (baseKind(def.k) === 'ref' && r[ch] && typeof r[ch] === 'object') r[ch] = chercher(cible, r[ch]);
        if (baseKind(def.k) === 'refs') r[ch] = r[ch].map(x => typeof x === 'object' ? chercher(cible, x) : x);
      });
    }));
    (donnees.role || []).forEach(r => { r._libelle = libelleDe('role', r); });
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Écriture                                                            */
  /* ------------------------------------------------------------------ */
  function versGrist(val, kind, col) {
    const k = baseKind(kind), type = col.type || 'Any', t = type.split(':')[0];
    if (val === undefined) return undefined;
    switch (k) {
      case 'date': case 'datetime': {
        if (!val) return null;
        if (t === 'Date') return Date.UTC(val.getFullYear(), val.getMonth(), val.getDate()) / 1000;
        if (t === 'DateTime') return val.getTime() / 1000;
        return P.fmtDate(val);
      }
      case 'nombre': return val === '' || val == null || isNaN(val) ? null : Number(val);
      case 'bool': return !!val;
      case 'choix_multi': { const a = Array.isArray(val) ? val : (val ? [val] : []); return t === 'ChoiceList' ? (a.length ? ['L', ...a] : null) : a.join(', '); }
      case 'ref': {
        const cible = cibleKind(kind);
        if (t === 'Ref') return val || 0;
        if (t === 'RefList') return val ? ['L', val] : null;
        return val ? P.libelle(cible, val) : '';
      }
      case 'refs': {
        const cible = cibleKind(kind); const a = (val || []).filter(x => typeof x === 'number');
        if (t === 'RefList') return a.length ? ['L', ...a] : null;
        if (t === 'Ref') return a[0] || 0;
        const noms = a.map(id => P.libelle(cible, id));
        return t === 'ChoiceList' ? (noms.length ? ['L', ...noms] : null) : noms.join(', ');
      }
      default: return val == null ? '' : String(val);
    }
  }

  P.valeursGrist = (ent, vals) => {
    const out = {}; const ignores = [];
    Object.entries(vals).forEach(([ch, v]) => {
      const def = E[ent].champs[ch]; const col = P.colonne(ent, ch);
      if (!def || !col) return;
      if (col.isFormula && col.formula) { ignores.push(def.l); return; }
      const g = versGrist(v, def.k, col);
      if (g !== undefined) out[col.colId] = g;
    });
    return {out, ignores};
  };
  P.actionAjout = (ent, vals) => ['AddRecord', P.table(ent), null, P.valeursGrist(ent, vals).out];
  P.actionMaj = (ent, id, vals) => ['UpdateRecord', P.table(ent), id, P.valeursGrist(ent, vals).out];
  P.actionSuppr = (ent, id) => ['RemoveRecord', P.table(ent), id];

  P.appliquer = async (actions, message) => {
    actions = actions.filter(a => a && a[1] && (a[0] !== 'UpdateRecord' || Object.keys(a[3]).length));
    if (!actions.length) return [];
    try {
      const r = await etat.backend.apply(actions);
      if (message) P.toast(message, 'ok');
      await P.rafraichir(true);
      return (r && r.retValues) || r || [];
    } catch (e) {
      console.error(e);
      P.toast('Échec de l’enregistrement : ' + (e.message || e), 'err');
      throw e;
    }
  };
  P.ajouter = async (ent, vals, message) => (await P.appliquer([P.actionAjout(ent, vals)], message))[0];
  P.modifier = (ent, id, vals, message) => P.appliquer([P.actionMaj(ent, id, vals)], message);
  P.supprimer = (ent, id, message) => P.appliquer([P.actionSuppr(ent, id)], message);

  /* Création d'une table manquante (ex. sous-tâches) */
  P.creerStructure = async ent => {
    const st = P.STRUCTURES[ent]; if (!st) return;
    const cibles = {tache: P.table('tache'), agent: P.table('agent')};
    if ((st.besoin || []).includes('tache') && !cibles.tache) { P.toast('Associez d’abord la table des tâches.', 'warn'); return; }
    let nom = st.table; let i = 2;
    while (etat.schema[nom]) nom = st.table + '_' + i++;
    const cols = st.cols(cibles);
    // Colonnes « déclencheur » (formule recalculée à chaque modification de la ligne) : meilleur effort
    const avecDecl = cols.map(c => c.declencheur ? {id: c.id, type: c.type, isFormula: false, formula: c.declencheur, recalcWhen: 2} : {id: c.id, type: c.type, isFormula: false});
    try { await etat.backend.apply([['AddTable', nom, avecDecl]]); }
    catch (e) { console.warn('Formules déclencheurs refusées, création simple', e); await etat.backend.apply([['AddTable', nom, cols.map(c => ({id: c.id, type: c.type, isFormula: false}))]]); }
    etat.schema = await etat.backend.schema();
    // Colonne affichée des références (« Montrer la colonne ») : meilleur effort
    if (etat.backend.nom === 'grist') {
      try {
        const t = etat.schema[nom];
        const acts = [];
        cols.filter(c => /^Ref:/.test(c.type)).forEach(c => {
          const cibleT = c.type.split(':')[1];
          const ent2 = Object.keys(cibles).find(k => cibles[k] === cibleT);
          const vis = ent2 === 'tache' ? (etat.mapping.tache || {}).champs.titre : ((etat.mapping.agent || {}).champs.nom_complet || (etat.mapping.agent || {}).champs.nom);
          const colRef = (t.cols.find(x => x.colId === c.id) || {}).ref;
          const visRef = (etat.schema[cibleT].cols.find(x => x.colId === vis) || {}).ref;
          if (colRef && visRef) acts.push(['SetDisplayFormula', nom, null, colRef, `$${c.id}.${vis}`], ['UpdateRecord', '_grist_Tables_column', colRef, {visibleCol: visRef}]);
        });
        if (acts.length) await etat.backend.apply(acts);
      } catch (e) { console.warn('Colonne affichée non réglée', e); }
    }
    etat.mapping[ent] = {table: nom, champs: Object.fromEntries(cols.map(c => [c.champ, c.id]))};
    await P.enregistrerConfig();
    P.toast(`Table ${nom} créée.`, 'ok');
    await P.rafraichir(true);
  };

  /* ------------------------------------------------------------------ */
  /* Configuration (enregistrée dans les options du widget)              */
  /* ------------------------------------------------------------------ */
  const cleLocale = () => 'pilotage-mapping:' + etat.docName;
  P.enregistrerConfig = async () => {
    const o = Object.assign({}, etat.backend.getOptions() || {}, {mapping: etat.mapping, reglages: etat.reglages, version: 1});
    try { await etat.backend.setOptions(o); } catch (e) { P.toast('Réglages non enregistrés dans Grist (droits insuffisants ?) : conservés pour cette session.', 'warn'); }
    try { localStorage.setItem(cleLocale(), JSON.stringify(etat.mapping)); } catch (e) { /* ignoré */ }
  };
  P.reglage = (cle, defaut) => etat.reglages[cle] === undefined ? defaut : etat.reglages[cle];
  P.setReglage = async (cle, val) => { etat.reglages[cle] = val; await P.enregistrerConfig(); };

  function mappingValide(m) {
    if (!m) return false;
    return Object.values(m).every(x => x && etat.schema[x.table]);
  }

  P.manquants = () => {
    const res = [];
    (P.cfg.entites || []).forEach(ent => {
      const opt = (P.cfg.optionnelles || []).includes(ent);
      const m = etat.mapping[ent];
      if (!m) { if (!opt) res.push(`Table « ${E[ent].libelle} » non trouvée`); return; }
      (P.cfg.champsRequis && P.cfg.champsRequis[ent] || Object.entries(E[ent].champs).filter(([, d]) => d.req).map(([k]) => k))
        .forEach(ch => { if (!m.champs[ch]) res.push(`${E[ent].libelle} : colonne « ${E[ent].champs[ch].l} » non associée`); });
    });
    return res;
  };

  P.ouvrirConfig = (onglet) => {
    const ents = P.cfg.entitesSeules ? (P.cfg.entites || []) : dependances(P.cfg.entites || []);
    const tablesOpts = Object.keys(etat.schema).sort();
    const corps = document.createElement('div');
    const onglets = [['reglages', 'Réglages']].concat(P.cfg.ressource ? [['ressource', 'Table ressource']] : [], aideIntegree ? [['aide', 'Mode d’emploi']] : []);
    corps.innerHTML = `${onglets.length > 1 ? `<div class="pl-onglets" role="tablist">${onglets.map(([k, l]) => `<button type="button" role="tab" data-onglet="${k}" aria-selected="${k === (onglet || 'reglages')}">${l}</button>`).join('')}</div>` : ''}
      <div data-panneau="ressource" class="pl-panneau hidden">${P.cfg.ressource ? htmlRessource() : ''}</div>
      <div data-panneau="aide" class="pl-panneau pl-aide hidden"></div>
      <div data-panneau="reglages" class="pl-panneau">
      ${ents.length ? `<p class="muted small" style="margin:0">Le widget s'adapte à la structure de votre document : choisissez pour chaque élément la table et les colonnes à utiliser.
      La détection automatique propose une association à partir des noms. Les colonnes calculées (formules) sont lues mais jamais modifiées.</p>
      <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec sm" data-act="auto">Détection automatique</button></div>`
      : `<p class="muted small" style="margin:0">${P.cfg.texteConfig || 'Les colonnes utilisées se choisissent dans le panneau de droite de Grist (onglet « Widget »).'}</p>`}
      <div id="cfg-ents" style="display:flex;flex-direction:column;gap:8px"></div>
      ${P.cfg.reglagesHtml ? `<div class="carte"><h3>Réglages du widget</h3><div id="cfg-reglages">${P.cfg.reglagesHtml()}</div></div>` : ''}
      <div class="carte"><h3>Affichage</h3><label class="case"><input type="checkbox" id="cfg-marque" ${P.reglage('marque', true) ? 'checked' : ''}> Afficher le bloc-marque « République française »</label></div></div>`;
    const montrer = k => {
      P.$$('[data-onglet]', corps).forEach(b => b.setAttribute('aria-selected', b.dataset.onglet === k));
      P.$$('[data-panneau]', corps).forEach(d => d.classList.toggle('hidden', d.dataset.panneau !== k));
      if (k === 'aide') contenuAide().then(a => { const z = P.$('[data-panneau=aide]', corps); z.innerHTML = a.html; nettoyerAide(z); });
    };
    montrer(onglet || 'reglages');
    corps.addEventListener('click', async e => {
      const o = e.target.closest('[data-onglet]'); if (o) { montrer(o.dataset.onglet); return; }
      const b = e.target.closest('button[data-act^=ress]'); if (!b) return;
      if (b.dataset.act === 'ress-csv') { P.telechargerRessource(P.cfg.ressource); return; }
      b.disabled = true;
      try { const nom = await P.creerRessource(P.cfg.ressource, b.dataset.act === 'ress-creer-ex'); P.toast(`Table « ${nom} » créée. Choisissez-la comme données du widget, puis associez les colonnes.`, 'ok'); }
      catch (err) { P.toast('Création impossible : ' + (err.message || err), 'err'); }
      b.disabled = false;
    });
    const travail = JSON.parse(JSON.stringify(etat.mapping || {}));
    const dessiner = () => {
      const zone = corps.querySelector('#cfg-ents');
      zone.innerHTML = ents.map(ent => {
        const m = travail[ent] || {table: '', champs: {}};
        const t = etat.schema[m.table];
        const principal = (P.cfg.entites || []).includes(ent);
        const champs = Object.entries(E[ent].champs).filter(([ch]) => principal || ch === 'titre' || ch === 'nom' || ch === 'nom_complet' || ch === 'prenom');
        return `<details class="cfg-ent" ${principal ? 'open' : ''}><summary>${esc(E[ent].libelle)} ${t ? `<span class="badge ok">${esc(m.table)}</span>` : '<span class="badge warn">non associée</span>'}${principal ? '' : ' <span class="muted small">(table liée)</span>'}</summary>
          <div>
            <label>Table</label>
            <select class="in sm" data-ent="${ent}" data-role="table"><option value="">— Aucune —</option>${tablesOpts.map(x => `<option ${x === m.table ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
            ${!t && E[ent].creable ? `<span></span><button class="btn sec sm" data-act="creer" data-ent="${ent}">Créer la table ${esc(P.STRUCTURES[ent].table)}</button>` : ''}
            ${t ? champs.map(([ch, def]) => `<label class="${def.req ? 'req' : ''}" title="${esc(def.k)}">${esc(def.l)}</label>
              <select class="in sm" data-ent="${ent}" data-ch="${ch}"><option value="">— Non utilisé —</option>${t.cols.slice().sort((a, b) => compat(def.k, b.type) - compat(def.k, a.type)).map(c => `<option value="${esc(c.colId)}" ${m.champs[ch] === c.colId ? 'selected' : ''}>${esc(c.label)} (${esc(c.colId)} · ${esc(c.type)}${c.isFormula && c.formula ? ' · formule' : ''})${compat(def.k, c.type) ? '' : ' ⚠'}</option>`).join('')}</select>`).join('') : ''}
          </div></details>`;
      }).join('');
    };
    dessiner();
    corps.addEventListener('change', e => {
      const s = e.target;
      if (s.dataset.role === 'table') {
        const ent = s.dataset.ent;
        if (!s.value) delete travail[ent];
        else travail[ent] = {table: s.value, champs: detecterChamps(ent, etat.schema[s.value])};
        dessiner();
      } else if (s.dataset.ch) {
        const m = travail[s.dataset.ent];
        if (s.value) m.champs[s.dataset.ch] = s.value; else delete m.champs[s.dataset.ch];
      }
    });
    corps.addEventListener('click', async e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      if (b.dataset.act === 'auto') { const d = P.detecter(etat.schema); ents.forEach(k => { if (d[k]) travail[k] = d[k]; else delete travail[k]; }); dessiner(); }
      if (b.dataset.act === 'creer') { etat.mapping = travail; fermer(); await P.creerStructure(b.dataset.ent); }
    });
    const fermer = P.modale({titre: 'Paramètres du widget', contenu: corps, large: true, boutons: [
      {libelle: 'Annuler', classe: 'ter'},
      {libelle: 'Enregistrer', classe: 'pri', action: async () => {
        etat.mapping = travail;
        etat.reglages.marque = corps.querySelector('#cfg-marque').checked;
        if (P.cfg.lireReglages) P.cfg.lireReglages(corps.querySelector('#cfg-reglages'), etat.reglages);
        await P.enregistrerConfig();
        etat.signature = '';
        await P.rafraichir(true);
        P.toast('Paramètres enregistrés.', 'ok');
      }},
    ]});
  };

  /* ------------------------------------------------------------------ */
  /* Interface commune                                                   */
  /* ------------------------------------------------------------------ */
  P.ICONES = {
    reglages: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1l9.5 5.5v11L12 23l-9.5-5.5v-11L12 1zm0 2.3L4.5 7.65v8.7L12 20.7l7.5-4.35v-8.7L12 3.3zM12 16a4 4 0 110-8 4 4 0 010 8zm0-2a2 2 0 100-4 2 2 0 000 4z"/></svg>',
    actualiser: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.46 4.43A9.95 9.95 0 0112 2c5.52 0 10 4.48 10 10 0 2.14-.67 4.12-1.81 5.74L17 12h3A8 8 0 006.46 6.12l-1-1.69zm13.08 15.14A9.95 9.95 0 0112 22C6.48 22 2 17.52 2 12c0-2.14.67-4.12 1.81-5.74L7 12H4a8 8 0 0013.54 5.88l1 1.69z"/></svg>',
    imprimer: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19H3a1 1 0 01-1-1V8a1 1 0 011-1h3V3a1 1 0 011-1h10a1 1 0 011 1v4h3a1 1 0 011 1v10a1 1 0 01-1 1h-3v2a1 1 0 01-1 1H7a1 1 0 01-1-1v-2zm0-2v-1a1 1 0 011-1h10a1 1 0 011 1v1h2V9H4v8h2zM8 4v3h8V4H8zm0 13v3h8v-3H8zm-3-7h3v2H5v-2z"/></svg>',
    copier: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 6V3a1 1 0 011-1h12a1 1 0 011 1v14a1 1 0 01-1 1h-3v3c0 .55-.45 1-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1h3zM5 8v12h10V8H5zm4-4v2h8v10h2V4H9z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
    fermer: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 10.59l4.95-4.95 1.41 1.41L13.41 12l4.95 4.95-1.41 1.41L12 13.41l-4.95 4.95-1.41-1.41L10.59 12 5.64 7.05l1.41-1.41L12 10.59z"/></svg>',
    modifier: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.76 3.83l3.41 3.41-11 11H5.76v-3.41l11-11zm0 2.83l-9 9v.58h.59l9-9-.59-.58zM4 21h16v2H4v-2z"/></svg>',
    supprimer: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 6h5v2h-2v13a1 1 0 01-1 1H5a1 1 0 01-1-1V8H2V6h5V3a1 1 0 011-1h8a1 1 0 011 1v3zm1 2H6v12h12V8zM9 11h2v6H9v-6zm4 0h2v6h-2v-6zM9 4v2h6V4H9z"/></svg>',
    gauche: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.83 12l4.95 4.95-1.41 1.41L8 12l6.37-6.36 1.41 1.41L10.83 12z"/></svg>',
    droite: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.17 12L8.22 7.05l1.41-1.41L16 12l-6.37 6.36-1.41-1.41L13.17 12z"/></svg>',
    glisser: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm6 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM9 13.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm6 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM9 22a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm6 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>',
  };
  P.ic = n => P.ICONES[n] || '';

  P.toast = (msg, type) => {
    let z = P.$('.pl-toasts'); if (!z) { z = document.createElement('div'); z.className = 'pl-toasts'; z.setAttribute('role', 'status'); document.body.appendChild(z); }
    const t = document.createElement('div'); t.className = 'pl-toast ' + (type || ''); t.textContent = msg; z.appendChild(t);
    setTimeout(() => t.remove(), type === 'err' ? 8000 : 3500);
  };

  P.modale = ({titre, contenu, boutons, large, surFermeture}) => {
    const voile = document.createElement('div'); voile.className = 'pl-voile';
    voile.innerHTML = `<div class="pl-modale ${large ? 'large' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titre)}">
      <header><h2>${esc(titre)}</h2><button class="btn ic ter sm" data-fermer title="Fermer">${P.ic('fermer')}<span class="sr">Fermer</span></button></header>
      <div class="contenu"></div><footer></footer></div>`;
    const c = voile.querySelector('.contenu');
    if (typeof contenu === 'string') c.innerHTML = contenu; else c.appendChild(contenu);
    const pied = voile.querySelector('footer');
    const fermer = () => { voile.remove(); document.removeEventListener('keydown', clavier); if (surFermeture) surFermeture(); };
    const clavier = e => { if (e.key === 'Escape') fermer(); };
    (boutons || []).forEach(b => {
      const el = document.createElement('button'); el.className = 'btn ' + (b.classe || 'sec'); el.textContent = b.libelle;
      el.addEventListener('click', async () => {
        if (b.action) { el.disabled = true; try { const r = await b.action(c); if (r === false) { el.disabled = false; return; } } catch (e) { el.disabled = false; return; } }
        fermer();
      });
      pied.appendChild(el);
    });
    if (!pied.children.length) pied.remove();
    voile.querySelector('[data-fermer]').addEventListener('click', fermer);
    voile.addEventListener('mousedown', e => { if (e.target === voile) fermer(); });
    document.addEventListener('keydown', clavier);
    document.body.appendChild(voile);
    const f = c.querySelector('input,select,textarea'); if (f) setTimeout(() => f.focus(), 30);
    return fermer;
  };
  P.confirmer = (message, libelle) => new Promise(res => {
    let ok = false;
    P.modale({titre: 'Confirmation', contenu: `<p style="margin:0">${esc(message)}</p>`, surFermeture: () => res(ok), boutons: [
      {libelle: 'Annuler', classe: 'ter'}, {libelle: libelle || 'Confirmer', classe: 'pri', action: () => { ok = true; }}]});
  });

  /* Infobulle simple : attribut data-bulle */
  let bulle;
  document.addEventListener('mouseover', e => {
    const el = e.target.closest && e.target.closest('[data-bulle]');
    if (!el) { if (bulle) bulle.remove(); bulle = null; return; }
    if (!bulle) { bulle = document.createElement('div'); bulle.className = 'pl-bulle'; document.body.appendChild(bulle); }
    bulle.innerHTML = el.getAttribute('data-bulle');
    const r = el.getBoundingClientRect(); const bw = bulle.offsetWidth, bh = bulle.offsetHeight;
    let x = Math.min(window.innerWidth - bw - 6, Math.max(6, r.left + r.width / 2 - bw / 2));
    let y = r.top - bh - 6; if (y < 4) y = r.bottom + 6;
    bulle.style.left = x + 'px'; bulle.style.top = y + 'px';
  });

  /* Champ de formulaire générique d'après le catalogue */
  P.champFormulaire = (ent, ch, valeur, opts) => {
    opts = opts || {};
    const def = E[ent].champs[ch]; const col = P.colonne(ent, ch);
    if (!def || !col) return '';
    const id = `f-${ent}-${ch}`;
    const ro = col.isFormula && col.formula;
    const k = baseKind(def.k);
    const lbl = `<label for="${id}">${esc(opts.libelle || def.l)}${def.req ? ' <span style="color:var(--error)">*</span>' : ''}</label>`;
    let input;
    if (ro) input = `<div class="in" style="background:var(--alt);box-shadow:none">${esc(Array.isArray(valeur) ? valeur.join(', ') : (valeur instanceof Date ? P.fmtDate(valeur) : (valeur ?? '')))}</div><span class="aide">Valeur calculée par une formule</span>`;
    else if (k === 'texte' && opts.long) input = `<textarea class="in" id="${id}" data-ch="${ch}">${esc(valeur || '')}</textarea>`;
    else if (k === 'texte') input = `<input class="in" id="${id}" data-ch="${ch}" value="${esc(valeur || '')}">`;
    else if (k === 'nombre') input = `<input class="in" id="${id}" data-ch="${ch}" type="number" step="any" value="${valeur ?? ''}">`;
    else if (k === 'date' || k === 'datetime') input = `<input class="in" id="${id}" data-ch="${ch}" type="date" value="${valeur ? P.iso(valeur) : ''}">`;
    else if (k === 'bool') input = `<label class="case"><input type="checkbox" id="${id}" data-ch="${ch}" ${valeur ? 'checked' : ''}> Oui</label>`;
    else if (k === 'choix') {
      const l = P.choix(ent, ch); if (valeur && !l.includes(valeur)) l.push(valeur);
      input = `<select class="in" id="${id}" data-ch="${ch}"><option value=""></option>${l.map(x => `<option ${x === valeur ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    } else if (k === 'choix_multi') {
      const l = P.choix(ent, ch); const v = valeur || [];
      input = `<div class="multi" data-ch="${ch}" data-multi="txt" style="display:flex;flex-wrap:wrap;gap:4px">${l.map(x => `<button type="button" class="tag" aria-pressed="${v.includes(x)}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
    } else if (k === 'ref' || k === 'refs') {
      const cible = cibleKind(def.k);
      const l = P.liste(cible).slice().sort((a, b) => a._libelle.localeCompare(b._libelle, 'fr'));
      if (k === 'ref') input = `<select class="in" id="${id}" data-ch="${ch}" data-num="1"><option value=""></option>${l.map(x => `<option value="${x.id}" ${x.id === valeur ? 'selected' : ''}>${esc(x._libelle)}</option>`).join('')}</select>`;
      else { const v = (valeur || []); input = `<div class="multi" data-ch="${ch}" data-multi="ids" style="display:flex;flex-wrap:wrap;gap:4px">${l.map(x => `<button type="button" class="tag" aria-pressed="${v.includes(x.id)}" data-v="${x.id}">${esc(x._libelle)}</button>`).join('') || '<span class="muted small">Aucun élément</span>'}</div>`; }
    }
    return `<div class="champ ${opts.large ? 'large' : ''}">${lbl}${input}</div>`;
  };
  /* Lecture d'un formulaire construit avec champFormulaire */
  P.lireFormulaire = (ent, racine) => {
    const vals = {};
    racine.querySelectorAll('[data-ch]').forEach(el => {
      const ch = el.dataset.ch; const def = E[ent].champs[ch]; if (!def) return;
      const k = baseKind(def.k);
      if (el.dataset.multi) { const v = Array.from(el.querySelectorAll('[aria-pressed=true]')).map(b => b.dataset.v); vals[ch] = el.dataset.multi === 'ids' ? v.map(Number) : v; }
      else if (el.type === 'checkbox') vals[ch] = el.checked;
      else if (k === 'date' || k === 'datetime') vals[ch] = P.fromIso(el.value);
      else if (k === 'nombre') vals[ch] = el.value === '' ? null : Number(el.value);
      else if (el.dataset.num) vals[ch] = el.value ? Number(el.value) : null;
      else vals[ch] = el.value;
    });
    return vals;
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('.multi .tag'); if (!b) return;
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  });

  /* ------------------------------------------------------------------ */
  /* Colonnes choisies dans le panneau de droite de Grist (widgets « v2 ») */
  /* ------------------------------------------------------------------ */
  const L = P.L = {tableId: null, mapping: null, ids: null, recs: [], refs: {}};
  function normaliserValeur(v) {
    if (v == null) return v;
    if (v instanceof Date) return v.getTime() / 1000;
    if (Array.isArray(v)) {
      if (v[0] === 'L' || v[0] === 'E') return v;
      if (v[0] === 'R' && v.length === 3) return v[2];
      if (v[0] === 'r' && v.length === 3) return ['L', ...(v[2] || [])];
      if (v[0] === 'd' || v[0] === 'D') return v[1];
      return ['L', ...v.map(x => (x && typeof x === 'object') ? (x.rowId ?? x.id ?? x) : x)];
    }
    if (typeof v === 'object') {
      if (Array.isArray(v.rowIds)) return ['L', ...v.rowIds];
      if (v.rowId != null) return v.rowId;
      if (typeof v.id === 'number') return v.id;
    }
    return v;
  }
  L.recevoir = (recs, mapping) => {
    L.mapping = mapping || null;
    L.ids = recs.map(r => r.id);
    L.recs = recs.map(r => { const o = {}; Object.keys(r).forEach(k => { o[k] = k === 'id' ? r[k] : normaliserValeur(r[k]); }); return o; });
  };
  L.col = nom => { const id = L.mapping && L.mapping[nom]; const t = etat.schema && etat.schema[L.tableId]; return id && t ? t.cols.find(c => c.colId === id) || null : null; };
  L.a = nom => !!L.col(nom);
  L.ecrivable = nom => { const c = L.col(nom); return !!c && !(c.isFormula && c.formula); };
  L.manquants = () => (P.cfg.colonnes || []).filter(c => !c.optional && !(L.mapping && L.mapping[c.name]));
  L.charger = async () => {
    if (etat.backend.nom === 'demo') {
      const d = P.cfg.demo; L.tableId = d.table; L.mapping = d.mapping;
      const raw = await etat.backend.fetch(d.table);
      L.recs = raw.id.map((id, i) => { const r = {id}; Object.keys(raw).forEach(k => { r[k] = raw[k][i]; }); return r; });
    } else {
      if (!L.tableId) { try { L.tableId = await grist.selectedTable.getTableId(); } catch (e) { L.tableId = null; } }
      if (L.tableId && L.ids) {
        try {
          const raw = await etat.backend.fetch(L.tableId); const index = new Map(raw.id.map((id, i) => [id, i]));
          L.recs = L.ids.map(id => { const i = index.get(id); const o = {id}; if (i != null) Object.keys(raw).forEach(k => { o[k] = raw[k][i]; }); return o; });
        } catch (e) { console.warn('Relecture brute impossible', e); }
      }
    }
    // Libellés des colonnes de référence
    const refs = (P.cfg.colonnes || []).map(c => L.col(c.name)).filter(c => c && /^Ref(List)?:/.test(c.type));
    await Promise.all(refs.map(async c => {
      const cible = c.type.split(':')[1]; const t = etat.schema[cible]; if (!t) return;
      const vis = c.visibleCol || (t.cols.find(x => x.type === 'Text') || {}).colId;
      const raw = await etat.backend.fetch(cible);
      L.refs[c.colId] = new Map(raw.id.map((id, i) => [id, vis && raw[vis] ? String(raw[vis][i] ?? '') : '#' + id]));
    }));
  };
  L.brut = (nom, r) => { const c = L.col(nom); return c ? r[c.colId] : undefined; };
  L.texte = (nom, r) => {
    const c = L.col(nom); if (!c) return '';
    const v = r[c.colId];
    if (v == null || v === '' || (Array.isArray(v) && v[0] === 'E')) return '';
    if (/^Ref:/.test(c.type)) return typeof v === 'string' ? v : v ? (L.refs[c.colId] && L.refs[c.colId].get(v)) || '' : '';
    if (/^RefList:/.test(c.type)) return Array.isArray(v) ? v.slice(1).map(id => (L.refs[c.colId] && L.refs[c.colId].get(id)) || '').filter(Boolean).join(', ') : String(v);
    if (Array.isArray(v) && v[0] === 'L') return v.slice(1).join(', ');
    if (/^Date/.test(c.type) && typeof v === 'number') return P.fmtDate(L.date(nom, r));
    if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
    return String(v);
  };
  L.date = (nom, r) => {
    const c = L.col(nom); if (!c) return null; const v = r[c.colId];
    if (typeof v === 'number') { const d = new Date(v * 1000); return /^DateTime/.test(c.type) ? P.jour(d) : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
    if (typeof v === 'string') return P.parseDateTexte(v);
    return null;
  };
  L.instant = (nom, r) => { const c = L.col(nom); if (!c) return null; const v = r[c.colId]; return typeof v === 'number' ? new Date(v * 1000) : (typeof v === 'string' ? P.parseDateTexte(v) : null); };
  L.nombre = (nom, r) => { const c = L.col(nom); if (!c) return null; const v = r[c.colId]; if (typeof v === 'number') return v; const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
  L.bool = (nom, r) => { const c = L.col(nom); if (!c) return false; const v = r[c.colId]; return v === true || v === 1 || /^(oui|true|vrai|x)$/i.test(String(v || '')); };
  L.options = nom => { const c = L.col(nom); if (!c) return {}; try { return JSON.parse(c.widgetOptions || '{}'); } catch (e) { return {}; } };
  L.choix = nom => { const l = L.options(nom).choices || []; return l.length ? l : P.uniq(L.recs.map(r => L.texte(nom, r)).filter(Boolean)).sort(); };
  L.echelle = nom => { const c = L.col(nom); if (!c) return 1; return L.recs.some(r => typeof r[c.colId] === 'number' && r[c.colId] > 1.5) ? 100 : 1; };
  L.fraction = (nom, r) => { const v = L.nombre(nom, r); return v == null ? null : Math.max(0, Math.min(1, v / L.echelle(nom))); };
  L.valeur = (nom, v) => {
    const c = L.col(nom); if (!c) return undefined; const t = c.type.split(':')[0];
    if (v instanceof Date) return t === 'DateTime' ? v.getTime() / 1000 : t === 'Date' ? Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) / 1000 : P.fmtDate(v);
    if (v === null || v === '') return t === 'Ref' ? 0 : null;
    return v;
  };
  L.actionMaj = (id, vals) => { const o = {}; Object.entries(vals).forEach(([n, v]) => { if (L.ecrivable(n)) { const g = L.valeur(n, v); if (g !== undefined) o[L.col(n).colId] = g; } }); return Object.keys(o).length ? ['UpdateRecord', L.tableId, id, o] : null; };
  L.actionAjout = vals => { const o = {}; Object.entries(vals).forEach(([n, v]) => { if (L.ecrivable(n)) { const g = L.valeur(n, v); if (g !== undefined) o[L.col(n).colId] = g; } }); return ['AddRecord', L.tableId, null, o]; };
  L.ecrire = (id, vals, msg) => P.appliquer([L.actionMaj(id, vals)], msg);
  L.couleur = (nom, valeur) => {
    if (!valeur) return null; const o = L.options(nom); const opt = (o.choiceOptions || {})[valeur];
    if (opt && opt.fillColor) return {fond: opt.fillColor, texte: opt.textColor || null};
    const i = (o.choices || []).indexOf(valeur);
    const pal = ['#000091', '#6a6af4', '#009081', '#c08c65', '#a558a0', '#417dc4', '#d1335b', '#5e2a2b', '#3a3a3a', '#716043'];
    return {fond: pal[(i >= 0 ? i : [...valeur].reduce((s, ch) => s + ch.charCodeAt(0), 0)) % pal.length]};
  };
  /* Formulaire générique d'après le type des colonnes associées */
  L.champForm = (nom, r, opts) => {
    opts = opts || {};
    const c = L.col(nom); if (!c) return '';
    const id = 'lf-' + nom, lab = esc(opts.libelle || L.titreColonne(nom)), t = c.type.split(':')[0];
    const cls = 'champ' + (opts.large ? ' large' : '');
    if (!L.ecrivable(nom)) return `<div class="${cls}"><span class="lbl">${lab}</span><div class="in" style="background:var(--alt);box-shadow:none">${esc(r ? L.texte(nom, r) : '') || '–'}</div><span class="aide">Valeur calculée par une formule</span></div>`;
    const v = r ? r[c.colId] : null;
    let input;
    if (t === 'Date' || t === 'DateTime') { const d = r ? L.date(nom, r) : null; input = `<input class="in" type="date" id="${id}" data-l="${nom}" data-t="date" value="${d ? P.iso(d) : ''}">`; }
    else if (t === 'Numeric' || t === 'Int') input = `<input class="in" type="number" step="any" id="${id}" data-l="${nom}" data-t="num" value="${typeof v === 'number' ? v : ''}">`;
    else if (t === 'Bool') input = `<label class="case"><input type="checkbox" id="${id}" data-l="${nom}" data-t="bool" ${v ? 'checked' : ''}> Oui</label>`;
    else if (t === 'Choice') { const l = L.choix(nom).slice(); const cur = r ? L.texte(nom, r) : ''; if (cur && !l.includes(cur)) l.push(cur); input = `<select class="in" id="${id}" data-l="${nom}" data-t="txt"><option value=""></option>${l.map(x => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`; }
    else if (t === 'ChoiceList') { const cur = Array.isArray(v) ? v.slice(1) : []; input = `<div class="multi" data-l="${nom}" data-t="choices" style="display:flex;flex-wrap:wrap;gap:6px">${P.uniq(L.choix(nom).concat(cur)).map(x => `<button type="button" class="tag" aria-pressed="${cur.includes(x)}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`; }
    else if (t === 'Ref' || t === 'RefList') {
      const m = L.refs[c.colId] || new Map(); const l = Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'fr'));
      if (t === 'Ref') input = `<select class="in" id="${id}" data-l="${nom}" data-t="ref"><option value=""></option>${l.map(([k, x]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
      else { const cur = Array.isArray(v) ? v.slice(1) : []; input = `<div class="multi" data-l="${nom}" data-t="refs" style="display:flex;flex-wrap:wrap;gap:6px">${l.map(([k, x]) => `<button type="button" class="tag" aria-pressed="${cur.includes(k)}" data-v="${k}">${esc(x)}</button>`).join('') || '<span class="muted small">Aucun élément</span>'}</div>`; }
    } else if (opts.long) input = `<textarea class="in" id="${id}" data-l="${nom}" data-t="txt" rows="3">${esc(r ? L.texte(nom, r) : '')}</textarea>`;
    else input = `<input class="in" id="${id}" data-l="${nom}" data-t="txt" value="${esc(r ? L.texte(nom, r) : '')}">`;
    return `<div class="${cls}"><label for="${id}">${lab}</label>${input}</div>`;
  };
  L.lireForm = el => {
    const vals = {};
    el.querySelectorAll('[data-l]').forEach(x => {
      const nom = x.dataset.l, t = x.dataset.t;
      if (t === 'date') vals[nom] = P.fromIso(x.value);
      else if (t === 'num') vals[nom] = x.value === '' ? null : Number(x.value);
      else if (t === 'bool') vals[nom] = x.checked;
      else if (t === 'ref') vals[nom] = x.value ? Number(x.value) : 0;
      else if (t === 'refs' || t === 'choices') { const l = Array.from(x.querySelectorAll('[aria-pressed=true]')).map(b => t === 'refs' ? Number(b.dataset.v) : b.dataset.v); vals[nom] = l.length ? ['L', ...l] : null; }
      else vals[nom] = x.value;
    });
    return vals;
  };
  L.titreColonne = nom => ((P.cfg.colonnes || []).find(c => c.name === nom) || {}).title || nom;

  /* ------------------------------------------------------------------ */
  /* Tables ressources (modèles de tables prêts à l'emploi)              */
  /* ------------------------------------------------------------------ */
  const CH = (l, couleurs) => JSON.stringify({choices: l, choiceOptions: Object.fromEntries(l.map((x, i) => [x, {fillColor: couleurs[i], textColor: '#FFFFFF'}]))});
  P.RESSOURCES = {
    taches: {
      nom: 'Taches', libelle: 'Tâches',
      description: 'Une ligne par tâche : intitulé, projet, responsable, statut, priorité, dates, avancement, charge et suivi. Les dates de création et de mise à jour se remplissent seules.',
      colonnes: [
        {id: 'Intitule', label: 'Intitulé', type: 'Text'},
        {id: 'Projet', label: 'Projet', type: 'Text'},
        {id: 'Responsable', label: 'Responsable', type: 'Text'},
        {id: 'Statut', label: 'Statut', type: 'Choice', widgetOptions: CH(['À faire', 'En cours', 'En attente', 'Terminé', 'Abandonné'], ['#6A6AF4', '#000091', '#C3592D', '#18753C', '#929292'])},
        {id: 'Priorite', label: 'Priorité', type: 'Choice', widgetOptions: CH(['P1 – Critique', 'P2 – Haute', 'P3 – Normale', 'P4 – Basse'], ['#CE0500', '#C3592D', '#0063CB', '#929292'])},
        {id: 'Date_debut', label: 'Date de début', type: 'Date', widgetOptions: JSON.stringify({dateFormat: 'DD/MM/YYYY'})},
        {id: 'Echeance', label: 'Échéance', type: 'Date', widgetOptions: JSON.stringify({dateFormat: 'DD/MM/YYYY'})},
        {id: 'Date_realisation', label: 'Date de réalisation', type: 'Date', widgetOptions: JSON.stringify({dateFormat: 'DD/MM/YYYY'})},
        {id: 'Avancement', label: 'Avancement', type: 'Numeric', widgetOptions: JSON.stringify({numMode: 'percent'})},
        {id: 'Charge', label: 'Charge (jours)', type: 'Numeric'},
        {id: 'Jalon', label: 'Jalon', type: 'Bool'},
        {id: 'Suites', label: 'Suites données', type: 'Text', widgetOptions: JSON.stringify({wrap: true})},
        {id: 'Cree_le', label: 'Créé le', type: 'DateTime:Europe/Paris', declencheur: 'NOW()', surCreation: true},
        {id: 'Mis_a_jour_le', label: 'Mis à jour le', type: 'DateTime:Europe/Paris', declencheur: 'NOW()'},
        {id: 'Mis_a_jour_par', label: 'Mis à jour par', type: 'Text', declencheur: 'user.Name'},
      ],
      exemples: [
        {Intitule: 'Rédiger le cahier des charges', Projet: 'Projet A', Responsable: 'Agent 1', Statut: 'Terminé', Priorite: 'P2 – Haute', Date_debut: -30, Echeance: -15, Date_realisation: -16, Avancement: 1, Charge: 3, Jalon: false, Suites: 'Validé en comité'},
        {Intitule: 'Consulter les fournisseurs', Projet: 'Projet A', Responsable: 'Agent 2', Statut: 'En cours', Priorite: 'P2 – Haute', Date_debut: -10, Echeance: 5, Avancement: 0.4, Charge: 4, Jalon: false, Suites: ''},
        {Intitule: 'Choix du fournisseur', Projet: 'Projet A', Responsable: 'Agent 1', Statut: 'À faire', Priorite: 'P1 – Critique', Date_debut: 12, Echeance: 12, Avancement: 0, Charge: 0.5, Jalon: true, Suites: ''},
        {Intitule: 'Préparer la réunion de lancement', Projet: 'Projet B', Responsable: 'Agent 3', Statut: 'En attente', Priorite: 'P3 – Normale', Date_debut: -8, Echeance: -2, Avancement: 0.5, Charge: 1, Jalon: false, Suites: 'En attente des disponibilités'},
        {Intitule: 'Former les utilisateurs', Projet: 'Projet B', Responsable: 'Agent 2', Statut: 'À faire', Priorite: 'P3 – Normale', Date_debut: 20, Echeance: 40, Avancement: 0, Charge: 5, Jalon: false, Suites: ''},
      ],
    },
  };
  P.RESSOURCES.projets = {
    nom: 'Projets', libelle: 'Projets',
    description: 'Une ligne par projet : code, intitulé, domaine, phase, priorité, chef de projet, calendrier, charge, budget et contenu (objectifs, critères de réussite, contraintes, risques…).',
    colonnes: [
      {id: 'Code', label: 'Code', type: 'Text'},
      {id: 'Intitule', label: 'Intitulé', type: 'Text'},
      {id: 'Domaine', label: 'Domaine', type: 'Choice', widgetOptions: CH(['Domaine 1', 'Domaine 2', 'Transverse'], ['#000091', '#009081', '#A558A0'])},
      {id: 'Phase', label: 'Phase', type: 'Choice', widgetOptions: CH(['À cadrer', 'En cours', 'En pause', 'Terminé', 'Abandonné'], ['#6A6AF4', '#000091', '#C3592D', '#18753C', '#929292'])},
      {id: 'Priorite', label: 'Priorité', type: 'Choice', widgetOptions: CH(['P1 – Critique', 'P2 – Haute', 'P3 – Normale', 'P4 – Basse'], ['#CE0500', '#C3592D', '#0063CB', '#929292'])},
      {id: 'Chef_de_projet', label: 'Chef de projet', type: 'Text'},
      {id: 'Date_debut', label: 'Date de début', type: 'Date', widgetOptions: JSON.stringify({dateFormat: 'DD/MM/YYYY'})},
      {id: 'Deadline', label: 'Deadline', type: 'Date', widgetOptions: JSON.stringify({dateFormat: 'DD/MM/YYYY'})},
      {id: 'Date_fin_reelle', label: 'Date de fin réelle', type: 'Date', widgetOptions: JSON.stringify({dateFormat: 'DD/MM/YYYY'})},
      {id: 'Charge_estimee', label: 'Charge estimée (jours)', type: 'Numeric'},
      {id: 'Budget', label: 'Budget prévu', type: 'Numeric', widgetOptions: JSON.stringify({numMode: 'currency', currency: 'EUR'})},
      {id: 'Objectifs', label: 'Objectifs', type: 'Text', widgetOptions: JSON.stringify({wrap: true})},
      {id: 'Criteres', label: 'Critères de réussite', type: 'Text', widgetOptions: JSON.stringify({wrap: true})},
      {id: 'Description', label: 'Description', type: 'Text', widgetOptions: JSON.stringify({wrap: true})},
      {id: 'Contraintes', label: 'Contraintes', type: 'Text', widgetOptions: JSON.stringify({wrap: true})},
      {id: 'Risques', label: 'Risques', type: 'Text', widgetOptions: JSON.stringify({wrap: true})},
      {id: 'Parties_prenantes', label: 'Parties prenantes', type: 'Text'},
      {id: 'Prestataires', label: 'Prestataires', type: 'Text'},
    ],
    exemples: [
      {Code: 'PRJ-01', Intitule: 'Projet A', Domaine: 'Domaine 1', Phase: 'En cours', Priorite: 'P2 – Haute', Chef_de_projet: 'Agent 1', Date_debut: -40, Deadline: 30, Charge_estimee: 20, Budget: 15000, Objectifs: 'Remplacer l’équipement en fin de vie', Criteres: 'Mise en service sans interruption', Description: 'Achat, installation et mise en service', Contraintes: 'Intervention hors heures ouvrées', Risques: 'Retard de livraison', Parties_prenantes: 'Direction, Service A', Prestataires: 'Entreprise X'},
      {Code: 'PRJ-02', Intitule: 'Projet B', Domaine: 'Domaine 2', Phase: 'À cadrer', Priorite: 'P3 – Normale', Chef_de_projet: 'Agent 3', Date_debut: 10, Deadline: 120, Charge_estimee: 12, Objectifs: 'Former les équipes au nouvel outil', Criteres: '90 % des agents formés', Parties_prenantes: 'Tous les services'},
    ],
  };
  const jourDecale = n => { const d = P.addDays(P.today(), n); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000; };
  function valeurExemple(col, v) { if (v == null) return null; if (col.type === 'Date') return jourDecale(v); return v; }

  P.creerRessource = async (cle, avecExemples) => {
    const R = P.RESSOURCES[cle]; let nom = R.nom; let i = 2;
    while (etat.schema[nom]) nom = R.nom + '_' + i++;
    const def = c => {
      const o = {id: c.id, type: c.type, isFormula: false, label: c.label};
      if (c.widgetOptions) o.widgetOptions = c.widgetOptions;
      if (c.declencheur) { o.formula = c.declencheur; o.recalcWhen = c.surCreation ? 0 : 2; if (c.surCreation) o.recalcDeps = ['L']; }
      return o;
    };
    try { await etat.backend.apply([['AddTable', nom, R.colonnes.map(def)]]); }
    catch (e) {
      console.warn('Création avec options refusée, création simple', e);
      await etat.backend.apply([['AddTable', nom, R.colonnes.map(c => ({id: c.id, type: c.type, isFormula: false}))]]);
      try { await etat.backend.apply(R.colonnes.map(c => ['ModifyColumn', nom, c.id, Object.assign({label: c.label}, c.widgetOptions ? {widgetOptions: c.widgetOptions} : {})])); } catch (e2) { /* ignoré */ }
    }
    if (avecExemples && R.exemples) {
      const cols = R.colonnes.filter(c => !c.declencheur);
      const vals = {}; cols.forEach(c => { vals[c.id] = R.exemples.map(x => valeurExemple(c, x[c.id])); });
      await etat.backend.apply([['BulkAddRecord', nom, R.exemples.map(() => null), vals]]);
    }
    etat.schema = await etat.backend.schema();
    return nom;
  };
  P.telechargerRessource = cle => {
    const R = P.RESSOURCES[cle]; const cols = R.colonnes.filter(c => !c.declencheur);
    const cell = (c, v) => { if (v == null) return ''; if (c.type === 'Date') return P.fmtDate(P.addDays(P.today(), v)); if (c.type === 'Bool') return v ? 'oui' : 'non'; if (c.type === 'Numeric') return String(v).replace('.', ','); return String(v); };
    const lignes = [cols.map(c => c.label), ...(R.exemples || []).map(x => cols.map(c => cell(c, x[c.id])))];
    const csv = lignes.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8'}));
    a.download = `modele-${R.nom.toLowerCase()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  function htmlRessource() {
    const R = P.RESSOURCES[P.cfg.ressource]; if (!R) return '<p class="muted">Ce widget n’a pas de table ressource.</p>';
    const util = (P.cfg.colonnes || []);
    return `<p style="margin:0">Pour utiliser ce widget dans un autre document ou un autre type de projet, partez d’une <strong>table ressource</strong> prête à l’emploi : <strong>${esc(R.libelle)}</strong>.</p>
      <p class="muted small" style="margin:0">${esc(R.description)}</p>
      <div style="overflow-x:auto"><table class="tab"><thead><tr><th>Colonne</th><th>Type</th><th>Sert pour</th></tr></thead><tbody>
      ${R.colonnes.map(c => { const u = util.filter(x => (x.ressource || []).includes(c.id)).map(x => x.title); return `<tr><td>${esc(c.label)}</td><td class="small muted">${esc({Text: 'Texte', Choice: 'Choix', Date: 'Date', Numeric: 'Nombre', Bool: 'Case à cocher'}[c.type.split(':')[0]] || 'Date et heure')}${c.declencheur ? ' · automatique' : ''}</td><td class="small">${esc(u.join(', ') || '–')}</td></tr>`; }).join('')}</tbody></table></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn pri sm" data-act="ress-creer">Créer la table dans ce document</button>
        <button class="btn sec sm" data-act="ress-creer-ex">Créer avec des exemples</button>
        <button class="btn ter sm" data-act="ress-csv">Télécharger le modèle (CSV)</button></div>
      <div class="alerte"><strong>Ensuite :</strong> dans le panneau de droite de Grist, onglet <strong>Widget</strong>, choisissez la nouvelle table comme <strong>données du widget</strong>, puis associez chaque colonne du widget à la colonne du même nom.</div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Aide intégrée : mode d'emploi du widget                              */
  /* ------------------------------------------------------------------ */
  let aideIntegree = '';
  async function contenuAide() {
    // Version modifiée par l'équipe (table des modes d'emploi), sinon version d'origine
    try {
      const d = P.detecter(etat.schema, ['tuto']);
      if (d.tuto && d.tuto.champs.cle && d.tuto.champs.contenu) {
        const raw = await etat.backend.fetch(d.tuto.table);
        const i = (raw[d.tuto.champs.cle] || []).findIndex(v => v === P.cfg.id);
        if (i >= 0 && raw[d.tuto.champs.contenu][i]) return {html: raw[d.tuto.champs.contenu][i], source: d.tuto.table};
      }
    } catch (e) { /* ignoré */ }
    return {html: aideIntegree, source: null};
  }
  function nettoyerAide(el) {
    el.querySelectorAll('script,style,iframe,object,embed').forEach(x => x.parentNode.removeChild(x));
    el.querySelectorAll('*').forEach(x => Array.from(x.attributes).forEach(at => { if (/^on/i.test(at.name) || (at.name === 'href' && /^\s*javascript:/i.test(at.value))) x.removeAttribute(at.name); }));
  }
  P.ouvrirAide = async () => {
    const a = await contenuAide();
    const div = document.createElement('div'); div.className = 'pl-aide';
    div.innerHTML = (a.html || '<p class="muted">Aucun mode d’emploi pour ce widget.</p>') +
      `<p class="small muted" style="margin:0">${a.source ? `Texte issu de la table ${esc(a.source)}, modifiable avec le widget « Mode d’emploi ».` : 'Mode d’emploi d’origine. Pour l’adapter à votre équipe, utilisez le widget « Mode d’emploi ».'}</p>`;
    nettoyerAide(div);
    P.modale({titre: 'Mode d’emploi · ' + P.cfg.titre, contenu: div, large: true});
  };

  /* ------------------------------------------------------------------ */
  /* Démarrage                                                           */
  /* ------------------------------------------------------------------ */
  let curseurCb = null;
  P.surCurseur = cb => { curseurCb = cb; };

  P.rafraichir = async (force) => {
    if (!etat.mapping) return;
    try {
      if (force) etat.signature = '';
      if (P.cfg.colonnes) await L.charger();
      const change = await chargerDonnees();
      if (change || force) dessinerApp();
    } catch (e) { console.error(e); afficherErreur(e); }
  };

  function afficherErreur(e) {
    P.$('#pl-corps').innerHTML = `<div class="alerte err"><strong>Erreur :</strong> ${esc(e.message || e)}</div>`;
  }

  function dessinerApp() {
    P.$('.pl-marque').classList.toggle('hidden', !P.reglage('marque', true));
    const manq = P.manquants();
    const corps = P.$('#pl-corps');
    const manqL = P.cfg.colonnes && etat.backend.nom !== 'demo' ? L.manquants() : [];
    if (manqL.length) {
      corps.innerHTML = `<div class="carte" style="max-width:760px;margin:24px auto"><h2>Choisissez les colonnes du widget</h2>
        <ol class="pl-etapes"><li>Ouvrez le <strong>panneau de droite</strong> de Grist, onglet <strong>Widget</strong>.</li>
        <li>Associez au minimum : ${manqL.map(c => `<strong>${esc(c.title)}</strong>`).join(', ')}.</li>
        <li>Complétez les colonnes facultatives pour profiter de toutes les fonctions.</li></ol>
        <p class="muted small">Pas encore de table adaptée ? Ouvrez les paramètres (⚙), onglet <strong>Table ressource</strong>, pour en créer une en un clic.</p>
        <button class="btn sec sm" id="pl-cfg-go">Ouvrir les paramètres</button></div>`;
      P.$('#pl-cfg-go').addEventListener('click', () => P.ouvrirConfig('ressource'));
      return;
    }
    if (manq.length) {
      corps.innerHTML = `<div class="alerte warn" style="max-width:720px"><strong>Configuration à compléter</strong>
        <ul style="margin:6px 0">${manq.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
        <button class="btn pri sm" id="pl-cfg-go">Ouvrir les paramètres</button></div>`;
      P.$('#pl-cfg-go').addEventListener('click', P.ouvrirConfig);
      return;
    }
    try { P.cfg.rendu(corps); } catch (e) { console.error(e); afficherErreur(e); }
  }

  /**
   * Point d'entrée d'un widget.
   * cfg = {id, titre, sousTitre, entites:[...], optionnelles:[...], champsRequis:{ent:[...]},
   *        outils(html), init(), rendu(conteneur), reglagesHtml(), lireReglages(el, reglages)}
   */
  P.demarrer = async cfg => {
    P.cfg = cfg;
    document.title = cfg.titre;
    const modele = document.getElementById('pl-aide'); aideIntegree = modele ? modele.textContent : '';
    document.body.innerHTML = `<div class="pl-app">
      <header class="pl-entete">
        <div class="pl-marque"><p class="fr-logo fr-logo--sm" style="margin:0">République<br>française</p></div>
        <div class="pl-titre"><h1>${esc(cfg.titre)}</h1><p id="pl-sous-titre">${esc(cfg.sousTitre || '')}</p></div>
        <div class="pl-outils"><div id="pl-outils" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;justify-content:flex-end"></div>
          ${aideIntegree || cfg.aide !== false ? `<button class="btn ter ic" id="pl-aide-btn" data-bulle="Mode d’emploi"><span aria-hidden="true" style="font-weight:700;font-size:1.05rem;width:1rem;text-align:center">?</span><span class="sr">Mode d’emploi</span></button>` : ''}
          <button class="btn ter ic" id="pl-actualiser" data-bulle="Actualiser les données">${P.ic('actualiser')}<span class="sr">Actualiser</span></button>
          <button class="btn ter ic" id="pl-config" data-bulle="Paramètres : tables, colonnes et réglages">${P.ic('reglages')}<span class="sr">Paramètres</span></button>
        </div>
      </header>
      <div id="pl-demo" class="pl-demo hidden"></div>
      <main class="pl-corps" id="pl-corps"><p class="muted">Chargement…</p></main>
    </div>`;
    P.$('#pl-actualiser').addEventListener('click', () => P.rafraichir(true));
    P.$('#pl-config').addEventListener('click', () => P.ouvrirConfig());
    if (P.$('#pl-aide-btn')) P.$('#pl-aide-btn').addEventListener('click', () => P.ouvrirAide());
    try {
      etat.backend = enGrist() ? GristBackend : DemoBackend;
      const surChange = P.debounce(type => { if (type === 'options') { lireOptions(); P.rafraichir(true); } else P.rafraichir(type === 'force'); }, 300);
      await etat.backend.init(surChange, (tableId, rowId) => { if (curseurCb) curseurCb(tableId, rowId); });
      if (etat.backend.nom === 'demo') {
        const d = P.$('#pl-demo'); d.classList.remove('hidden');
        d.innerHTML = `<span><strong>Mode démonstration</strong> : données fictives enregistrées dans ce navigateur. Dans Grist, le widget utilise vos tables.</span><button id="pl-reset">Réinitialiser les données</button>`;
        P.$('#pl-reset').addEventListener('click', async () => { etat.backend.reinitialiser(); etat.schema = await etat.backend.schema(); P.rafraichir(true); });
      }
      etat.docName = await etat.backend.docName();
      etat.schema = await etat.backend.schema();
      lireOptions();
      if (cfg.init) await cfg.init();
      if (cfg.outils) { P.$('#pl-outils').innerHTML = cfg.outils(); if (cfg.surOutils) cfg.surOutils(P.$('#pl-outils')); }
      await P.rafraichir(true);
      setInterval(() => { if (!document.hidden && !P.$('.pl-voile')) P.rafraichir(false); }, 20000);
    } catch (e) { console.error(e); afficherErreur(e); }
  };

  function lireOptions() {
    const o = etat.backend.getOptions() || {};
    etat.reglages = o.reglages || etat.reglages || {};
    if (P.cfg.sansDetection) { etat.mapping = {}; return; }
    let m = o.mapping;
    if (!mappingValide(m)) {
      let local = null; try { local = JSON.parse(localStorage.getItem(cleLocale()) || 'null'); } catch (e) { /* ignoré */ }
      m = mappingValide(local) ? local : P.detecter(etat.schema);
    }
    // Entités nouvellement requises : complétées par détection
    const auto = P.detecter(etat.schema);
    dependances(P.cfg.entites || []).forEach(k => { if (!m[k] && auto[k]) m[k] = auto[k]; });
    etat.mapping = m;
  }
})();
