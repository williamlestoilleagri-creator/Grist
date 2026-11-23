/* Données fictives : tester l'application sans modèle ni clé d'IA. */
const SEGMENTS = [
  ["L1", "Bonjour à tous, merci d'être présents. L'ordre du jour porte sur le budget 2027 du programme de rénovation des écoles."],
  ["L2", "Merci. Pour rappel, l'enveloppe votée est de 2,4 millions d'euros, dont 800 000 euros déjà engagés."],
  ["L3", "Sur les huit écoles prévues, cinq chantiers sont terminés et trois restent à lancer au printemps."],
  ["L1", "Très bien. Quel est le calendrier pour les trois écoles restantes ?"],
  ["L3", "Les appels d'offres partent en janvier, pour un démarrage des travaux en avril et une fin avant la rentrée de septembre."],
  ["L2", "Attention, il nous reste donc 1,9 million d'euros, ce qui couvre largement les trois chantiers."],
  ["L4", "Je voudrais signaler que l'école Jules-Ferry a des problèmes d'amiante, ce qui va décaler le chantier."],
  ["L3", "C'est exact, le diagnostic amiante est attendu pour fin février. Le chantier ne pourra démarrer qu'en juin."],
  ["L1", "Donc les trois chantiers démarreront tous en avril comme prévu, parfait."],
  ["L4", "Il faudrait aussi prévoir la réunion des parents d'élèves pour les informer du calendrier des travaux du chaud."],
  ["L2", "Je propose de valider le lancement des appels d'offres et de faire un point budgétaire en mars."],
  ["L1", "D'accord. Décision : lancement des appels d'offres en janvier. Madame Laurent prépare le point budgétaire pour mars."],
];

const ANALYSE = {
  s6: [40, [{ type: "chiffre_ou_date", description: "2,4 M€ - 0,8 M€ engagés = 1,6 M€ restants, et non 1,9 M€.",
    suggestion: "Attention, il nous reste donc 1,6 million d'euros, ce qui couvre largement les trois chantiers." }]],
  s9: [20, [{ type: "contradiction", description: "Contredit l'intervention s8 : le chantier Jules-Ferry ne pourra démarrer qu'en juin.",
    suggestion: "Donc deux chantiers démarreront en avril et celui de Jules-Ferry en juin." }]],
  s10: [72, [{ type: "transcription", description: "« travaux du chaud » est probablement une erreur de transcription (« travaux d'été » ?).",
    suggestion: "Il faudrait aussi prévoir la réunion des parents d'élèves pour les informer du calendrier des travaux d'été." }]],
  s5: [80, [{ type: "imprecision", description: "Fin avant la rentrée annoncée pour les trois écoles, alors que Jules-Ferry est ensuite décalée (s8).", suggestion: "" }]],
};

export function transcriptionDemo() {
  let t = 0;
  const segments = SEGMENTS.map(([locuteur, texte], i) => {
    const duree = Math.max(4, texte.length / 14);
    const s = { id: `s${i + 1}`, debut: t, fin: t + duree, locuteur, texte, confiance_audio: null };
    t += duree + 0.6;
    return s;
  });
  const locuteurs = Object.fromEntries(["L1", "L2", "L3", "L4"].map((c) => [c, { nom: `Interlocuteur ${c.slice(1)}`, fonction: "" }]));
  return { duree: t, segments, locuteurs };
}

export function analyseDemo(r) {
  const nom = (c) => (r.locuteurs[c] || {}).nom || c;
  const parSegment = {};
  for (const s of r.segments) {
    const [score, incoherences] = ANALYSE[s.id] || [96, []];
    parSegment[s.id] = { score, incoherences };
  }
  return {
    parSegment,
    compteRendu: {
      resume: `La réunion, animée par ${nom("L1")}, a porté sur le budget 2027 du programme de rénovation des écoles. Cinq chantiers sur huit sont achevés ; les trois restants seront lancés au printemps, dont celui de l'école Jules-Ferry, décalé en raison d'un diagnostic amiante.`,
      points: [
        { titre: "Situation budgétaire", contenu: `${nom("L2")} rappelle une enveloppe de 2,4 M€ dont 800 000 € engagés. Le montant restant annoncé en séance (1,9 M€) est incohérent avec ces chiffres (1,6 M€).`, segments: ["s2", "s6"] },
        { titre: "Avancement des chantiers", contenu: `${nom("L3")} indique que cinq chantiers sont terminés ; les appels d'offres des trois restants partiront en janvier.`, segments: ["s3", "s5"] },
        { titre: "École Jules-Ferry", contenu: `${nom("L4")} signale la présence d'amiante. Le diagnostic est attendu fin février et le chantier ne pourra démarrer qu'en juin.`, segments: ["s7", "s8"] },
      ],
      decisions: ["Lancement des appels d'offres en janvier."],
      actions: [
        { action: "Préparer un point budgétaire", responsable: "Mme Laurent", echeance: "Mars" },
        { action: "Organiser une réunion d'information des parents d'élèves", responsable: "Non désigné", echeance: "Non précisée" },
      ],
    },
    incoherencesGlobales: [
      { description: "Le démarrage simultané des trois chantiers en avril (s9) est incompatible avec le décalage de Jules-Ferry à juin (s8).", segments: ["s8", "s9"], gravite: 80 },
      { description: "Montant restant : 1,9 M€ annoncé (s6) au lieu de 1,6 M€ d'après les chiffres de s2.", segments: ["s2", "s6"], gravite: 65 },
    ],
  };
}
