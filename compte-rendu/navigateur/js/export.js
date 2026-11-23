/* Export du compte rendu (Word .docx et Markdown), généré sur le poste. */
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType } from "../vendor/docx.js";
import { TYPES_INCOHERENCE, scoreSegment } from "./ia.js";

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

export function markdown(r) {
  const cr = r.compte_rendu || {}, an = r.analyse;
  const l = [`# Compte rendu — ${r.titre || "Réunion"}`, ""];
  if (r.date_reunion) l.push(`**Date :** ${r.date_reunion}  `);
  l.push(`**Participants :** ${participants(r)}`);
  if (an) l.push("", `**Fiabilité globale :** ${an.score_global} % (${libelleScore(an.score_global)}) — analyse par ${an.fournisseur}`);
  l.push("", "## Synthèse", "", cr.resume || "", "");
  for (const p of cr.points || []) l.push(`### ${p.titre}`, "", p.contenu, "");
  if ((cr.decisions || []).length) l.push("## Décisions", "", ...cr.decisions.map((d) => `- ${d}`), "");
  if ((cr.actions || []).length) {
    l.push("## Actions", "", "| Action | Responsable | Échéance |", "|---|---|---|", ...cr.actions.map((a) => `| ${a.action} | ${a.responsable} | ${a.echeance} |`), "");
  }
  if (ouvertes(r).length || globales(r).length) {
    l.push("## Incohérences rapportées (non résolues)", "");
    for (const g of globales(r)) l.push(`- **Entre interventions ${g.segments.join(", ")}** (gravité ${g.gravite} %) : ${g.description}`);
    for (const [s, i] of ouvertes(r)) l.push(`- **${hms(s.debut)} — ${nom(r, s.locuteur)}** (${TYPES_INCOHERENCE[i.type] || i.type}) : ${i.description}`);
    l.push("");
  }
  l.push("## Annexe — transcription", "");
  for (const s of r.segments || []) {
    const sc = scoreSegment(s);
    l.push(`- \`${hms(s.debut)}\` **${nom(r, s.locuteur)}** [${sc ?? "–"} % · ${libelleScore(sc)}] : ${s.texte}`);
  }
  l.push("", `_Document généré le ${maintenant()} avec l'assistance d'une IA ; relu et corrigé par un agent._`);
  return l.join("\n");
}

const para = (texte, opts = {}) => new Paragraph({ children: [new TextRun({ text: String(texte ?? ""), ...opts })] });
const titre = (texte, niveau) => new Paragraph({ text: texte, heading: niveau });
const cellule = (texte, options = {}) => new TableCell({
  children: String(texte ?? "").split("\n").map((t) => new Paragraph({ children: [new TextRun({ text: t, bold: options.gras })], alignment: options.centre ? AlignmentType.CENTER : undefined })),
  shading: options.fond ? { type: ShadingType.CLEAR, color: "auto", fill: options.fond } : undefined,
});
const tableau = (entetes, lignes) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [new TableRow({ tableHeader: true, children: entetes.map((e) => cellule(e, { gras: true, fond: "E3E3FD" })) }), ...lignes],
});

export async function docx(r) {
  const cr = r.compte_rendu || {}, an = r.analyse;
  const corps = [
    new Paragraph({ children: [new TextRun({ text: "RÉPUBLIQUE", bold: true }), new TextRun({ text: "FRANÇAISE", bold: true, break: 1 }),
      new TextRun({ text: "Liberté", italics: true, break: 1 }), new TextRun({ text: "Égalité", italics: true, break: 1 }), new TextRun({ text: "Fraternité", italics: true, break: 1 })] }),
    titre(`Compte rendu — ${r.titre || "Réunion"}`, HeadingLevel.TITLE),
  ];
  if (r.date_reunion) corps.push(para(`Date : ${r.date_reunion}`));
  corps.push(para(`Participants : ${participants(r)}`));
  if (an) {
    corps.push(new Paragraph({ children: [
      new TextRun({ text: "Fiabilité globale : ", bold: true }),
      new TextRun({ text: `${an.score_global} % — ${libelleScore(an.score_global)}`, bold: true, color: couleurHex(an.score_global) }),
      new TextRun({ text: ` (analyse : ${an.fournisseur}, ${an.modele})` }),
    ] }));
  }
  corps.push(titre("Synthèse", HeadingLevel.HEADING_1), para(cr.resume));
  for (const p of cr.points || []) corps.push(titre(p.titre, HeadingLevel.HEADING_2), para(p.contenu));
  if ((cr.decisions || []).length) {
    corps.push(titre("Décisions", HeadingLevel.HEADING_1), ...cr.decisions.map((d) => new Paragraph({ text: d, bullet: { level: 0 } })));
  }
  if ((cr.actions || []).length) {
    corps.push(titre("Actions", HeadingLevel.HEADING_1),
      tableau(["Action", "Responsable", "Échéance"], cr.actions.map((a) => new TableRow({ children: [cellule(a.action), cellule(a.responsable), cellule(a.echeance)] }))));
  }
  if (ouvertes(r).length || globales(r).length) {
    corps.push(titre("Incohérences rapportées (non résolues)", HeadingLevel.HEADING_1));
    for (const g of globales(r)) corps.push(new Paragraph({ text: `Entre les interventions ${g.segments.join(", ")} (gravité ${g.gravite} %) : ${g.description}`, bullet: { level: 0 } }));
    for (const [s, i] of ouvertes(r)) corps.push(new Paragraph({ text: `${hms(s.debut)} — ${nom(r, s.locuteur)} (${TYPES_INCOHERENCE[i.type] || i.type}) : ${i.description}`, bullet: { level: 0 } }));
  }
  corps.push(titre("Annexe — transcription", HeadingLevel.HEADING_1),
    tableau(["Heure", "Interlocuteur", "Propos", "Fiabilité"], (r.segments || []).map((s) => {
      const sc = scoreSegment(s);
      return new TableRow({ children: [cellule(hms(s.debut)), cellule(nom(r, s.locuteur)), cellule(s.texte),
        cellule(`${sc ?? "–"} %\n${libelleScore(sc)}`, { fond: couleurHex(sc, true), centre: true })] });
    })),
    para(""), para(`Document généré le ${maintenant()} avec l'assistance d'une IA ; relu et corrigé par un agent.`, { italics: true }));

  const doc = new Document({
    creator: "Compte rendu de réunion",
    title: `Compte rendu — ${r.titre || "Réunion"}`,
    styles: { default: { document: { run: { font: "Marianne", size: 21 } } } },
    sections: [{ children: corps }],
  });
  return Packer.toBlob(doc);
}

// ------------------------------------------------------------------ PDF (mise en page imprimable)
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lignes = (t) => esc(t).replace(/\n/g, "<br>");

/** Compte rendu au format HTML imprimable : le navigateur l'enregistre en PDF via « Imprimer → Enregistrer au format PDF ». */
export function html(r) {
  const cr = r.compte_rendu || {}, an = r.analyse;
  const sg = an ? an.score_global : null;
  const badge = (sc) => `<span class="imp-score" style="background:#${couleurHex(sc, true)};border-color:#${couleurHex(sc)}">${sc ?? "–"} % · ${libelleScore(sc)}</span>`;
  return `
    <div class="imp-entete">
      <p class="imp-marque">RÉPUBLIQUE<br>FRANÇAISE</p>
      <p class="imp-devise">Liberté<br>Égalité<br>Fraternité</p>
    </div>
    <h1>Compte rendu — ${esc(r.titre || "Réunion")}</h1>
    ${r.date_reunion ? `<p><strong>Date :</strong> ${esc(r.date_reunion)}</p>` : ""}
    <p><strong>Participants :</strong> ${esc(participants(r))}</p>
    ${an ? `<p><strong>Fiabilité globale :</strong> ${badge(sg)} <span class="imp-mention">(${esc(an.fournisseur)})</span></p>` : ""}
    <h2>Synthèse</h2>
    <p>${lignes(cr.resume)}</p>
    ${(cr.points || []).map((p) => `<h3>${esc(p.titre)}</h3><p>${lignes(p.contenu)}</p>`).join("")}
    ${(cr.decisions || []).length ? `<h2>Décisions</h2><ul>${cr.decisions.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
    ${(cr.actions || []).length ? `<h2>Actions</h2><table><thead><tr><th>Action</th><th>Responsable</th><th>Échéance</th></tr></thead><tbody>
      ${cr.actions.map((a) => `<tr><td>${esc(a.action)}</td><td>${esc(a.responsable)}</td><td>${esc(a.echeance)}</td></tr>`).join("")}</tbody></table>` : ""}
    ${ouvertes(r).length || globales(r).length ? `<h2>Incohérences rapportées (non résolues)</h2><ul>
      ${globales(r).map((g) => `<li><strong>Entre les interventions ${esc(g.segments.join(", "))}</strong> (gravité ${g.gravite} %) : ${esc(g.description)}</li>`).join("")}
      ${ouvertes(r).map(([s, i]) => `<li><strong>${hms(s.debut)} — ${esc(nom(r, s.locuteur))}</strong> (${esc(TYPES_INCOHERENCE[i.type] || i.type)}) : ${esc(i.description)}</li>`).join("")}</ul>` : ""}
    <h2 class="imp-saut">Annexe — transcription</h2>
    <table class="imp-transcription"><thead><tr><th>Heure</th><th>Interlocuteur</th><th>Propos</th><th>Fiabilité</th></tr></thead><tbody>
      ${(r.segments || []).map((s) => `<tr><td>${hms(s.debut)}</td><td>${esc(nom(r, s.locuteur))}</td><td>${esc(s.texte)}</td><td>${badge(scoreSegment(s))}</td></tr>`).join("")}
    </tbody></table>
    <p class="imp-mention">Document généré le ${maintenant()} avec l'assistance d'outils automatiques ; relu et corrigé par un agent.</p>`;
}
