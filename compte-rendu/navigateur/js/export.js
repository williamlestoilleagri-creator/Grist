/**
 * Téléchargement des documents, générés sur le poste.
 * Trois documents :
 *  - « compte-rendu »  : le compte rendu textuel, et rien d'autre ;
 *  - « verification »  : le compte rendu avec la vérification de cohérence et la transcription annotée ;
 *  - « transcription » : la transcription intégrale (heure, interlocuteur, propos).
 * Cinq formats : Word (.docx), PDF (.pdf), OpenDocument (.odt), texte (.txt), Markdown (.md).
 * Chaque document est décrit une fois (liste de blocs), puis rendu dans le format demandé.
 */
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType } from "../vendor/docx.js";
import { TYPES_INCOHERENCE, scoreSegment } from "./ia.js";

export const DOCUMENTS = {
  "compte-rendu": { nom: "Compte rendu", description: "Le texte du compte rendu uniquement : participants, synthèse, points abordés, décisions et actions." },
  verification: { nom: "Compte rendu avec vérification de cohérence", description: "Le compte rendu, la fiabilité, les incohérences non résolues et la transcription annotée avec le code couleur." },
  transcription: { nom: "Transcription", description: "Le texte intégral de la réunion : heure, interlocuteur et propos." },
};
export const FORMATS = {
  docx: { nom: "Word", extension: "docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  pdf: { nom: "PDF", extension: "pdf", type: "application/pdf" },
  odt: { nom: "OpenDocument (LibreOffice)", extension: "odt", type: "application/vnd.oasis.opendocument.text" },
  txt: { nom: "Texte brut", extension: "txt", type: "text/plain;charset=utf-8" },
  md: { nom: "Markdown", extension: "md", type: "text/markdown;charset=utf-8" },
};

// ------------------------------------------------------------------ outils
export function libelleScore(score) {
  if (score == null) return "Non analysé";
  if (score >= 85) return "Cohérent";
  if (score >= 60) return "À vérifier";
  if (score >= 35) return "Douteux";
  return "Incohérent";
}

/** Dégradé continu 0 % rouge → orange → jaune → 100 % vert (même formule que l'écran), en hexadécimal. */
export function couleurHex(score, clair = false) {
  if (score == null) return clair ? "EEEEEE" : "929292";
  const h = Math.max(0, Math.min(100, score)) * 1.2, s = 0.85, l = clair ? 0.92 : 0.42;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const hms = (s) => { s = Math.floor(s || 0); return [s / 3600, (s % 3600) / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":"); };
const nom = (r, c) => ((r.locuteurs || {})[c] || {}).nom || c;
const participants = (r) => Object.values(r.locuteurs || {}).map((l) => l.nom + (l.fonction ? ` (${l.fonction})` : "")).join(", ");
const ouvertes = (r) => (r.segments || []).flatMap((s) => (s.incoherences || []).filter((i) => i.statut === "ouverte").map((i) => [s, i]));
const globales = (r) => (r.incoherences_globales || []).filter((g) => g.statut === "ouverte");
const maintenant = () => new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
const dateLisible = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : d; };
const lignesDe = (t) => String(t || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);

// Blocs : { t: "marque" | "titre" | "h1" | "h2" | "p" | "liste" | "tableau" | "mention" }
const run = (texte, o = {}) => ({ texte: String(texte ?? ""), ...o });
const p = (...runs) => ({ t: "p", runs: runs.map((x) => (typeof x === "string" ? run(x) : x)) });

function blocsCompteRendu(r) {
  const cr = r.compte_rendu || {};
  const b = [{ t: "titre", texte: `Compte rendu — ${r.titre || "Réunion"}` }];
  if (r.date_reunion) b.push(p(run("Date : ", { gras: true }), dateLisible(r.date_reunion)));
  b.push(p(run("Participants : ", { gras: true }), participants(r)));
  if (lignesDe(cr.resume).length) b.push({ t: "h1", texte: "Synthèse" }, ...lignesDe(cr.resume).map((l) => p(l)));
  if ((cr.points || []).length) {
    b.push({ t: "h1", texte: "Points abordés" });
    for (const pt of cr.points) b.push({ t: "h2", texte: pt.titre || "Point" }, ...lignesDe(pt.contenu).map((l) => p(l)));
  }
  if ((cr.decisions || []).length) b.push({ t: "h1", texte: "Décisions" }, { t: "liste", items: cr.decisions });
  if ((cr.actions || []).length) {
    b.push({ t: "h1", texte: "Actions" }, { t: "liste", items: cr.actions.map((a) => {
      const precisions = [a.responsable && `responsable : ${a.responsable}`, a.echeance && `échéance : ${a.echeance}`].filter(Boolean).join(" ; ");
      return a.action + (precisions ? ` (${precisions})` : "");
    }) });
  }
  return b;
}

function blocsVerification(r) {
  const an = r.analyse;
  const b = [{ t: "marque" }, ...blocsCompteRendu(r)];
  b[1] = { t: "titre", texte: `Compte rendu et vérification de cohérence — ${r.titre || "Réunion"}` };
  b.push({ t: "h1", texte: "Vérification de cohérence" });
  if (an) {
    b.push(p(run("Fiabilité globale : ", { gras: true }), run(`${an.score_global ?? "–"} % — ${libelleScore(an.score_global)}`, { gras: true, couleur: couleurHex(an.score_global) }),
      ` (${an.locale ? "analyse locale sans IA" : ""}${an.locale && an.ia ? " + " : ""}${an.ia ? `IA : ${an.fournisseur}, ${an.modele}` : ""})`));
  }
  const g = globales(r), o = ouvertes(r);
  if (g.length || o.length) {
    b.push({ t: "h2", texte: "Incohérences rapportées non résolues" }, { t: "liste", items: [
      ...g.map((x) => `Entre les interventions ${x.segments.join(", ")} (gravité ${x.gravite} %) : ${x.description}`),
      ...o.map(([s, i]) => `${hms(s.debut)} — ${nom(r, s.locuteur)} (${TYPES_INCOHERENCE[i.type] || i.type}) : ${i.description}`),
    ] });
  } else b.push(p("Aucune incohérence non résolue."));
  b.push({ t: "h1", texte: "Annexe — transcription annotée", saut: true }, {
    t: "tableau", largeurs: [12, 18, 54, 16], entetes: ["Heure", "Interlocuteur", "Propos", "Fiabilité"],
    lignes: (r.segments || []).map((s) => { const sc = scoreSegment(s); return [hms(s.debut), nom(r, s.locuteur), s.texte, { texte: `${sc ?? "–"} % ${libelleScore(sc)}`, fond: couleurHex(sc, true) }]; }),
  });
  b.push({ t: "mention", texte: `Document généré le ${maintenant()} ; transcription et contrôles automatiques relus par un agent.` });
  return b;
}

function blocsTranscription(r) {
  const b = [{ t: "titre", texte: `Transcription — ${r.titre || "Réunion"}` }];
  if (r.date_reunion) b.push(p(run("Date : ", { gras: true }), dateLisible(r.date_reunion)));
  b.push(p(run("Participants : ", { gras: true }), participants(r)));
  b.push({ t: "h1", texte: "Propos" });
  for (const s of r.segments || []) b.push(p(run(`[${hms(s.debut)}] ${nom(r, s.locuteur)} : `, { gras: true }), s.texte));
  return b;
}

export function blocs(r, doc) {
  return doc === "verification" ? blocsVerification(r) : doc === "transcription" ? blocsTranscription(r) : blocsCompteRendu(r);
}

// ------------------------------------------------------------------ texte et Markdown
const texteRuns = (runs) => runs.map((x) => x.texte).join("");
const celluleTexte = (c) => (typeof c === "object" ? c.texte : String(c ?? ""));

function versTexte(liste) {
  const l = [];
  for (const b of liste) {
    if (b.t === "marque") l.push("RÉPUBLIQUE FRANÇAISE", "");
    else if (b.t === "titre") l.push(b.texte.toUpperCase(), "=".repeat(Math.min(80, b.texte.length)), "");
    else if (b.t === "h1") l.push("", b.texte, "-".repeat(Math.min(80, b.texte.length)), "");
    else if (b.t === "h2") l.push(b.texte, "");
    else if (b.t === "p" || b.t === "mention") l.push(b.runs ? texteRuns(b.runs) : b.texte, "");
    else if (b.t === "liste") l.push(...b.items.map((i) => `- ${i}`), "");
    else if (b.t === "tableau") l.push(b.entetes.join(" | "), ...b.lignes.map((r) => r.map(celluleTexte).join(" | ")), "");
  }
  return l.join("\r\n");
}

function versMarkdown(liste) {
  const md = (t) => String(t).replace(/([*_`|\\])/g, "\\$1");
  const runsMd = (runs) => runs.map((x) => (x.gras && x.texte.trim() ? `**${md(x.texte.trim())}** ` : md(x.texte))).join("").replace(/\s+$/, "");
  const l = [];
  for (const b of liste) {
    if (b.t === "marque") l.push("**RÉPUBLIQUE FRANÇAISE**", "");
    else if (b.t === "titre") l.push(`# ${md(b.texte)}`, "");
    else if (b.t === "h1") l.push(`## ${md(b.texte)}`, "");
    else if (b.t === "h2") l.push(`### ${md(b.texte)}`, "");
    else if (b.t === "p") l.push(runsMd(b.runs), "");
    else if (b.t === "mention") l.push(`_${md(b.texte)}_`, "");
    else if (b.t === "liste") l.push(...b.items.map((i) => `- ${md(i)}`), "");
    else if (b.t === "tableau") l.push(`| ${b.entetes.join(" | ")} |`, `|${b.entetes.map(() => "---").join("|")}|`, ...b.lignes.map((r) => `| ${r.map((c) => md(celluleTexte(c))).join(" | ")} |`), "");
  }
  return l.join("\n");
}

// ------------------------------------------------------------------ Word
async function versDocx(liste, titre) {
  const enfants = [];
  const runsDocx = (runs) => runs.map((x) => new TextRun({ text: x.texte, bold: x.gras, italics: x.italique, color: x.couleur }));
  for (const b of liste) {
    if (b.t === "marque") {
      enfants.push(new Paragraph({ children: [new TextRun({ text: "RÉPUBLIQUE", bold: true }), new TextRun({ text: "FRANÇAISE", bold: true, break: 1 }),
        new TextRun({ text: "Liberté", italics: true, break: 1 }), new TextRun({ text: "Égalité", italics: true, break: 1 }), new TextRun({ text: "Fraternité", italics: true, break: 1 })], spacing: { after: 300 } }));
    } else if (b.t === "titre") enfants.push(new Paragraph({ text: b.texte, heading: HeadingLevel.TITLE }));
    else if (b.t === "h1") enfants.push(new Paragraph({ text: b.texte, heading: HeadingLevel.HEADING_1, pageBreakBefore: !!b.saut }));
    else if (b.t === "h2") enfants.push(new Paragraph({ text: b.texte, heading: HeadingLevel.HEADING_2 }));
    else if (b.t === "p") enfants.push(new Paragraph({ children: runsDocx(b.runs), spacing: { after: 120 } }));
    else if (b.t === "mention") enfants.push(new Paragraph({ children: [new TextRun({ text: b.texte, italics: true, color: "666666", size: 18 })], spacing: { before: 240 } }));
    else if (b.t === "liste") enfants.push(...b.items.map((i) => new Paragraph({ text: i, bullet: { level: 0 } })));
    else if (b.t === "tableau") {
      const cellule = (c, entete = false) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: celluleTexte(c), bold: entete, size: 19 })], alignment: typeof c === "object" && c.fond ? AlignmentType.CENTER : undefined })],
        shading: entete ? { type: ShadingType.CLEAR, color: "auto", fill: "E3E3FD" } : typeof c === "object" && c.fond ? { type: ShadingType.CLEAR, color: "auto", fill: c.fond } : undefined,
      });
      enfants.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ tableHeader: true, children: b.entetes.map((e) => cellule(e, true)) }), ...b.lignes.map((r) => new TableRow({ children: r.map((c) => cellule(c)) }))] }));
    }
  }
  const doc = new Document({ creator: "Compte rendu de réunion", title: titre,
    styles: { default: { document: { run: { font: "Marianne", size: 21 } } } }, sections: [{ children: enfants }] });
  return Packer.toBlob(doc);
}

// ------------------------------------------------------------------ OpenDocument (.odt)
const xml = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Archive ZIP sans compression (suffisant pour un document OpenDocument). */
function zip(fichiers) {
  const table = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (d) => { let c = 0xffffffff; for (const o of d) c = table[(c ^ o) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const enc = new TextEncoder();
  const morceaux = [], central = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nomOctets = enc.encode(f.nom), donnees = typeof f.contenu === "string" ? enc.encode(f.contenu) : f.contenu, crc = crc32(donnees);
    const entete = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, donnees.length, 4], [22, donnees.length, 4], [26, nomOctets.length, 2], [28, 0, 2]]
      .forEach(([o, v, n]) => (n === 4 ? entete.setUint32(o, v, true) : entete.setUint16(o, v, true)));
    morceaux.push(new Uint8Array(entete.buffer), nomOctets, donnees);
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, donnees.length, 4], [24, donnees.length, 4], [28, nomOctets.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, decalage, 4]]
      .forEach(([o, v, n]) => (n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true)));
    central.push(new Uint8Array(c.buffer), nomOctets);
    decalage += 30 + nomOctets.length + donnees.length;
  }
  const tailleCentral = central.reduce((n, x) => n + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, fichiers.length, 2], [10, fichiers.length, 2], [12, tailleCentral, 4], [16, decalage, 4], [20, 0, 2]]
    .forEach(([o, v, n]) => (n === 4 ? fin.setUint32(o, v, true) : fin.setUint16(o, v, true)));
  return new Blob([...morceaux, ...central, new Uint8Array(fin.buffer)], { type: FORMATS.odt.type });
}

function versOdt(liste, titre) {
  const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"'
    .replace("urn:oasis:names:xmlns:xsl-fo-compatible:1.0", "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0");
  const fonds = new Map(); // couleur de cellule -> nom de style
  const styleCellule = (fond) => { if (!fonds.has(fond)) fonds.set(fond, `CF${fonds.size + 1}`); return fonds.get(fond); };
  const couleurs = new Map();
  const styleRun = (x) => {
    if (!x.gras && !x.italique && !x.couleur) return null;
    const cle = `${x.gras ? "g" : ""}${x.italique ? "i" : ""}${x.couleur || ""}`;
    if (!couleurs.has(cle)) couleurs.set(cle, { nom: `T${couleurs.size + 1}`, ...x });
    return couleurs.get(cle).nom;
  };
  const runsXml = (runs) => runs.map((x) => { const s = styleRun(x); return s ? `<text:span text:style-name="${s}">${xml(x.texte)}</text:span>` : xml(x.texte); }).join("");
  let corps = "";
  for (const b of liste) {
    if (b.t === "marque") corps += `<text:p text:style-name="Marque">RÉPUBLIQUE<text:line-break/>FRANÇAISE</text:p><text:p text:style-name="Devise">Liberté<text:line-break/>Égalité<text:line-break/>Fraternité</text:p>`;
    else if (b.t === "titre") corps += `<text:p text:style-name="Title">${xml(b.texte)}</text:p>`;
    else if (b.t === "h1") corps += `<text:h text:style-name="${b.saut ? "Titre1Saut" : "Heading_20_1"}" text:outline-level="1">${xml(b.texte)}</text:h>`;
    else if (b.t === "h2") corps += `<text:h text:style-name="Heading_20_2" text:outline-level="2">${xml(b.texte)}</text:h>`;
    else if (b.t === "p") corps += `<text:p text:style-name="Standard">${runsXml(b.runs)}</text:p>`;
    else if (b.t === "mention") corps += `<text:p text:style-name="Mention">${xml(b.texte)}</text:p>`;
    else if (b.t === "liste") corps += `<text:list text:style-name="Puces">${b.items.map((i) => `<text:list-item><text:p text:style-name="Standard">${xml(i)}</text:p></text:list-item>`).join("")}</text:list>`;
    else if (b.t === "tableau") {
      corps += `<table:table table:name="Tableau${corps.length}" table:style-name="Tab">${b.entetes.map(() => "<table:table-column/>").join("")}`
        + `<table:table-header-rows><table:table-row>${b.entetes.map((e) => `<table:table-cell table:style-name="Entete" office:value-type="string"><text:p text:style-name="Cellule"><text:span text:style-name="Gras">${xml(e)}</text:span></text:p></table:table-cell>`).join("")}</table:table-row></table:table-header-rows>`
        + b.lignes.map((r) => `<table:table-row>${r.map((c) => `<table:table-cell table:style-name="${typeof c === "object" && c.fond ? styleCellule(c.fond) : "Cell"}" office:value-type="string"><text:p text:style-name="Cellule">${xml(celluleTexte(c))}</text:p></table:table-cell>`).join("")}</table:table-row>`).join("")
        + "</table:table>";
    }
  }
  const auto = [...couleurs.values()].map((s) => `<style:style style:name="${s.nom}" style:family="text"><style:text-properties${s.gras ? ' fo:font-weight="bold"' : ""}${s.italique ? ' fo:font-style="italic"' : ""}${s.couleur ? ` fo:color="#${s.couleur}"` : ""}/></style:style>`).join("")
    + [...fonds.entries()].map(([f, n]) => `<style:style style:name="${n}" style:family="table-cell"><style:table-cell-properties fo:background-color="#${f}" fo:border="0.5pt solid #929292" fo:padding="0.08cm"/></style:style>`).join("");
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS}><office:font-face-decls><style:font-face style:name="Marianne" svg:font-family="Marianne, Arial, sans-serif"/></office:font-face-decls>`
    + `<office:automatic-styles><style:style style:name="Tab" style:family="table"><style:table-properties style:width="17cm" table:align="margins"/></style:style>`
    + `<style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:border="0.5pt solid #929292" fo:padding="0.08cm"/></style:style>`
    + `<style:style style:name="Entete" style:family="table-cell"><style:table-cell-properties fo:background-color="#E3E3FD" fo:border="0.5pt solid #929292" fo:padding="0.08cm"/></style:style>`
    + `<style:style style:name="Gras" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>`
    + `<style:style style:name="Titre1Saut" style:family="paragraph" style:parent-style-name="Heading_20_1"><style:paragraph-properties fo:break-before="page"/></style:style>`
    + `${auto}</office:automatic-styles><office:body><office:text>${corps}</office:text></office:body></office:document-content>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS}><office:font-face-decls><style:font-face style:name="Marianne" svg:font-family="Marianne, Arial, sans-serif"/></office:font-face-decls><office:styles>`
    + `<style:default-style style:family="paragraph"><style:text-properties style:font-name="Marianne" fo:font-size="10.5pt" fo:language="fr" fo:country="FR"/></style:default-style>`
    + `<style:style style:name="Standard" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.2cm" fo:line-height="130%"/></style:style>`
    + `<style:style style:name="Cellule" style:family="paragraph"><style:text-properties fo:font-size="9.5pt"/></style:style>`
    + `<style:style style:name="Title" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.4cm"/><style:text-properties fo:font-size="18pt" fo:font-weight="bold"/></style:style>`
    + `<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:default-outline-level="1"><style:paragraph-properties fo:margin-top="0.5cm" fo:margin-bottom="0.2cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="13pt" fo:font-weight="bold" fo:color="#000091"/></style:style>`
    + `<style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:default-outline-level="2"><style:paragraph-properties fo:margin-top="0.35cm" fo:margin-bottom="0.15cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="11pt" fo:font-weight="bold"/></style:style>`
    + `<style:style style:name="Marque" style:family="paragraph"><style:text-properties fo:font-size="11pt" fo:font-weight="bold"/></style:style>`
    + `<style:style style:name="Devise" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.5cm"/><style:text-properties fo:font-size="8pt" fo:font-style="italic"/></style:style>`
    + `<style:style style:name="Mention" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.4cm"/><style:text-properties fo:font-size="9pt" fo:font-style="italic" fo:color="#666666"/></style:style>`
    + `<text:list-style style:name="Puces"><text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="0.6cm" fo:text-indent="-0.4cm" fo:margin-left="0.6cm"/></style:list-level-properties></text:list-level-style-bullet></text:list-style>`
    + `</office:styles><office:automatic-styles><style:page-layout style:name="A4"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="1.8cm" fo:margin-bottom="1.8cm" fo:margin-left="2cm" fo:margin-right="2cm"/></style:page-layout></office:automatic-styles>`
    + `<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="A4"/></office:master-styles></office:document-styles>`;
  const meta = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${NS}><office:meta><dc:title>${xml(titre)}</dc:title><meta:generator>Compte rendu de réunion</meta:generator><dc:language>fr-FR</dc:language></office:meta></office:document-meta>`;
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">`
    + `<manifest:file-entry manifest:full-path="/" manifest:media-type="${FORMATS.odt.type}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>`
    + `<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>`;
  return zip([
    { nom: "mimetype", contenu: FORMATS.odt.type },
    { nom: "content.xml", contenu: content },
    { nom: "styles.xml", contenu: styles },
    { nom: "meta.xml", contenu: meta },
    { nom: "META-INF/manifest.xml", contenu: manifest },
  ]);
}

// ------------------------------------------------------------------ PDF
let polices = null;
async function chargerPolices() {
  if (polices) return polices;
  const lire = async (f) => {
    const octets = new Uint8Array(await (await fetch(new URL(`../vendor/polices/${f}`, import.meta.url))).arrayBuffer());
    let bin = "";
    for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  try {
    polices = { normal: await lire("Marianne-Regular.ttf"), bold: await lire("Marianne-Bold.ttf"), italic: await lire("Marianne-Regular_Italic.ttf") };
  } catch { polices = {}; } // à défaut, police Helvetica intégrée au PDF
  return polices;
}

async function versPdf(liste, titre) {
  const { jsPDF, autoTable } = await import("../vendor/jspdf.js");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const f = await chargerPolices();
  let police = "helvetica";
  if (f.normal) {
    doc.addFileToVFS("Marianne-Regular.ttf", f.normal); doc.addFont("Marianne-Regular.ttf", "Marianne", "normal");
    doc.addFileToVFS("Marianne-Bold.ttf", f.bold); doc.addFont("Marianne-Bold.ttf", "Marianne", "bold");
    doc.addFileToVFS("Marianne-Regular_Italic.ttf", f.italic); doc.addFont("Marianne-Regular_Italic.ttf", "Marianne", "italic");
    police = "Marianne";
  }
  doc.setProperties({ title: titre, creator: "Compte rendu de réunion", subject: titre });
  const M = 20, L = 210 - 2 * M, BAS = 297 - 18;
  let y = 20;
  const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const place = (h) => { if (y + h > BAS) { doc.addPage(); y = 20; } };

  /** Paragraphe avec passages en gras / couleur, retour à la ligne automatique. */
  const paragraphe = (runs, taille = 10.5, interligne = 5.2) => {
    doc.setFontSize(taille);
    const mots = [];
    for (const r of runs) for (const m of r.texte.split(/(\s+)/)) if (m) mots.push({ m, r });
    let ligne = [], largeur = 0;
    const style = (r) => (r.gras ? "bold" : r.italique ? "italic" : "normal");
    const vider = () => {
      place(interligne);
      let x = M;
      for (const { m, r } of ligne) {
        doc.setFont(police, style(r));
        doc.setTextColor(...(r.couleur ? rgb(r.couleur) : [22, 22, 22]));
        doc.text(m, x, y);
        x += doc.getTextWidth(m);
      }
      y += interligne; ligne = []; largeur = 0;
    };
    for (const w of mots) {
      doc.setFont(police, style(w.r));
      const lw = doc.getTextWidth(w.m);
      if (largeur + lw > L && ligne.length && !/^\s+$/.test(w.m)) { while (ligne.length && /^\s+$/.test(ligne.at(-1).m)) ligne.pop(); vider(); }
      if (!ligne.length && /^\s+$/.test(w.m)) continue;
      ligne.push(w); largeur += lw;
    }
    if (ligne.length) vider();
    doc.setTextColor(22, 22, 22);
  };

  for (const b of liste) {
    if (b.t === "marque") {
      doc.setFont(police, "bold"); doc.setFontSize(11); doc.setTextColor(22, 22, 22);
      doc.text(["RÉPUBLIQUE", "FRANÇAISE"], M, y);
      doc.setFont(police, "italic"); doc.setFontSize(7.5);
      doc.text(["Liberté", "Égalité", "Fraternité"], M + 30, y - 1);
      y += 14;
    } else if (b.t === "titre") {
      doc.setFont(police, "bold"); doc.setFontSize(17); doc.setTextColor(22, 22, 22);
      const l = doc.splitTextToSize(b.texte, L); place(l.length * 7.5 + 4); doc.text(l, M, y); y += l.length * 7.5 + 4;
    } else if (b.t === "h1" || b.t === "h2") {
      if (b.saut) { doc.addPage(); y = 20; } else y += b.t === "h1" ? 4 : 2;
      doc.setFont(police, "bold"); doc.setFontSize(b.t === "h1" ? 13 : 11);
      doc.setTextColor(...(b.t === "h1" ? [0, 0, 145] : [22, 22, 22]));
      const l = doc.splitTextToSize(b.texte, L); place(l.length * 6 + 8); doc.text(l, M, y); y += l.length * 6 + 1;
      doc.setTextColor(22, 22, 22);
    } else if (b.t === "p") { paragraphe(b.runs); y += 1.8; }
    else if (b.t === "mention") { y += 3; paragraphe([run(b.texte, { italique: true, couleur: "666666" })], 8.5, 4.2); }
    else if (b.t === "liste") {
      for (const i of b.items) {
        doc.setFont(police, "normal"); doc.setFontSize(10.5);
        const l = doc.splitTextToSize(i, L - 6);
        place(l.length * 5.2);
        doc.text("•", M + 1, y); doc.text(l, M + 6, y); y += l.length * 5.2 + 1.2;
      }
      y += 1.5;
    } else if (b.t === "tableau") {
      autoTable(doc, {
        startY: y, margin: { left: M, right: M, bottom: 18 },
        head: [b.entetes], body: b.lignes.map((r) => r.map(celluleTexte)),
        styles: { font: police, fontSize: 8.5, cellPadding: 1.6, lineColor: [146, 146, 146], lineWidth: 0.2, textColor: [22, 22, 22], valign: "top" },
        headStyles: { font: police, fontStyle: "bold", fillColor: [227, 227, 253], textColor: [22, 22, 22] },
        columnStyles: Object.fromEntries((b.largeurs || []).map((w, i) => [i, { cellWidth: (L * w) / 100 }])),
        didParseCell: (d) => {
          const c = d.section === "body" ? b.lignes[d.row.index][d.column.index] : null;
          if (c && typeof c === "object" && c.fond) { d.cell.styles.fillColor = rgb(c.fond); d.cell.styles.fontStyle = "bold"; d.cell.styles.halign = "center"; }
        },
      });
      y = doc.lastAutoTable.finalY + 5;
    }
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont(police, "normal"); doc.setFontSize(8); doc.setTextColor(102, 102, 102);
    doc.text(`${titre} — page ${i} / ${n}`, 105, 290, { align: "center" });
  }
  return doc.output("blob");
}

// ------------------------------------------------------------------ point d'entrée
export async function generer(r, doc, format) {
  const liste = blocs(r, doc);
  const titre = liste.find((b) => b.t === "titre")?.texte || "Compte rendu";
  if (format === "txt") return new Blob(["﻿" + versTexte(liste)], { type: FORMATS.txt.type });
  if (format === "md") return new Blob([versMarkdown(liste)], { type: FORMATS.md.type });
  if (format === "odt") return versOdt(liste, titre);
  if (format === "pdf") return versPdf(liste, titre);
  return versDocx(liste, titre);
}
