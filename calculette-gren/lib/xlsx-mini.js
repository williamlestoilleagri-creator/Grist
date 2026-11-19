/* =============================================================================
   xlsx-mini — lecture et écriture de classeurs Excel (.xlsx) sans bibliothèque tierce.
   Écrit pour la Calculette GREN. Écriture : archive ZIP non compressée + XML
   SpreadsheetML (cellules texte « inline », donc jamais de formule exécutée).
   Lecture : ZIP (stocké ou « deflate » via DecompressionStream du navigateur),
   XML analysé par DOMParser (aucun script exécuté). Tailles limitées contre les
   fichiers piégés (« bombes zip »).
   ============================================================================= */
(function(){
"use strict";
const MAX_FICHIER = 10 * 1024 * 1024;      // 10 Mo
const MAX_DECOMPRESSE = 40 * 1024 * 1024;  // 40 Mo au total après décompression
const enc = new TextEncoder();

/* ---------- CRC32 ---------- */
const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; }
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

/* ---------- ZIP (écriture, sans compression) ---------- */
function zip(files){
  const d = new Date(); const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = []; let offset = 0;
  for (const [name, content] of files) {
    const nm = enc.encode(name), data = typeof content === "string" ? enc.encode(content) : content, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, nm.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}

/* ---------- ZIP (lecture) ---------- */
async function unzip(buf, wanted){
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("ce fichier n'est pas un classeur Excel (.xlsx)");
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const out = {}; let total = 0;
  for (let n = 0; n < count && p + 46 <= u8.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (!wanted(name)) continue;
    total += usize; if (total > MAX_DECOMPRESSE) throw new Error("fichier trop volumineux une fois décompressé");
    const ln = dv.getUint16(lo + 26, true), le = dv.getUint16(lo + 28, true), start = lo + 30 + ln + le;
    const data = u8.subarray(start, start + csize);
    let bytes;
    if (method === 0) bytes = data;
    else if (method === 8) {
      if (typeof DecompressionStream === "undefined") throw new Error("navigateur trop ancien pour lire ce fichier : mettez-le à jour");
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      const reader = stream.getReader(); const chunks = []; let size = 0;
      for (;;) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > MAX_DECOMPRESSE) { reader.cancel(); throw new Error("fichier trop volumineux une fois décompressé"); } chunks.push(value); }
      bytes = new Uint8Array(size); let o = 0; for (const c of chunks) { bytes.set(c, o); o += c.length; }
    } else throw new Error("format de compression non pris en charge");
    out[name] = new TextDecoder().decode(bytes);
  }
  return out;
}

/* ---------- Écriture du classeur ---------- */
const xesc = v => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const colName = i => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
// Styles : 0 normal, 1 en-tête (blanc sur bleu), 2 titre, 3 texte long, 4 cellule à remplir (fond jaune pâle)
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF000091"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF555555"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF000091"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF8E1"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCCCCCC"/></left><right style="thin"><color rgb="FFCCCCCC"/></right><top style="thin"><color rgb="FFCCCCCC"/></top><bottom style="thin"><color rgb="FFCCCCCC"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
function sheetXml(sh){
  const rows = sh.rows || [];
  const cols = (sh.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const freeze = sh.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const data = rows.map((row, r) => `<row r="${r + 1}"${row.h ? ` ht="${row.h}" customHeight="1"` : ""}>${(row.cells || row).map((cell, c) => {
    if (cell == null || cell === "") return "";
    const o = typeof cell === "object" ? cell : {v:cell}; const ref = colName(c) + (r + 1); const s = o.s ? ` s="${o.s}"` : "";
    if (o.v === "" || o.v == null) return o.s ? `<c r="${ref}"${s}/>` : "";
    if (typeof o.v === "number" && isFinite(o.v)) return `<c r="${ref}"${s}><v>${o.v}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xesc(o.v)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const dv = (sh.validations || []).map(v => `<dataValidation type="list" allowBlank="1" showErrorMessage="${v.strict ? 1 : 0}" errorStyle="${v.strict ? "stop" : "warning"}" errorTitle="Valeur non reconnue" error="Choisissez une valeur dans la liste." sqref="${v.ref}"><formula1>${xesc(v.liste)}</formula1></dataValidation>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${freeze}${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${data}</sheetData>${dv ? `<dataValidations count="${sh.validations.length}">${dv}</dataValidations>` : ""}</worksheet>`;
}
function ecrire(sheets){
  const safe = n => String(n).replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31);
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="${Math.max(0, sheets.findIndex(s => s.actif))}"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xesc(safe(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"${s.cache ? ' state="hidden"' : ""}/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)])
  ];
  return zip(files);
}

/* ---------- Lecture du classeur ---------- */
const parseXml = t => { const d = new DOMParser().parseFromString(t, "application/xml"); if (d.getElementsByTagName("parsererror").length) throw new Error("classeur endommagé"); return d; };
const byLocal = (node, name) => Array.from(node.getElementsByTagNameNS("*", name));
async function lire(file){
  if (file.size > MAX_FICHIER) throw new Error("fichier trop volumineux (10 Mo maximum)");
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  if (!(u8[0] === 0x50 && u8[1] === 0x4B)) throw new Error("ce fichier n'est pas un classeur Excel (.xlsx)");
  const f = await unzip(buf, n => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(n) || n === "xl/styles.xml");
  if (!f["xl/workbook.xml"]) throw new Error("ce fichier n'est pas un classeur Excel (.xlsx)");
  const rels = {}; if (f["xl/_rels/workbook.xml.rels"]) byLocal(parseXml(f["xl/_rels/workbook.xml.rels"]), "Relationship").forEach(r => rels[r.getAttribute("Id")] = r.getAttribute("Target"));
  const shared = f["xl/sharedStrings.xml"] ? byLocal(parseXml(f["xl/sharedStrings.xml"]), "si").map(si => byLocal(si, "t").map(t => t.textContent).join("")) : [];
  // formats de date (pour convertir les numéros de série Excel)
  const dateStyles = new Set();
  if (f["xl/styles.xml"]) {
    const st = parseXml(f["xl/styles.xml"]); const custom = {};
    byLocal(st, "numFmt").forEach(n => custom[n.getAttribute("numFmtId")] = n.getAttribute("formatCode") || "");
    const xfs = byLocal(st, "cellXfs")[0]; if (xfs) Array.from(xfs.children).forEach((xf, i) => { const id = +xf.getAttribute("numFmtId");
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (custom[id] && /[dy]/i.test(custom[id].replace(/\[[^\]]*\]|"[^"]*"/g, "")))) dateStyles.add(i); });
  }
  const sheets = {};
  byLocal(parseXml(f["xl/workbook.xml"]), "sheet").forEach(s => {
    const rid = s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    let target = rels[rid] || ""; target = target.replace(/^\/?xl\//, "").replace(/^\//, ""); const xml = f["xl/" + target]; if (!xml) return;
    const rows = [];
    byLocal(parseXml(xml), "row").forEach(row => { const ri = +row.getAttribute("r") - 1 || rows.length; const arr = [];
      byLocal(row, "c").forEach((c, k) => { const ref = c.getAttribute("r"); const ci = ref ? colIndex(ref) : k; if (ci > 200) return;
        const t = c.getAttribute("t"); const v = byLocal(c, "v")[0]; let val = "";
        if (t === "s") val = shared[+(v && v.textContent)] ?? "";
        else if (t === "inlineStr") val = byLocal(c, "t").map(x => x.textContent).join("");
        else if (t === "b") val = v && v.textContent === "1" ? "Oui" : "Non";
        else if (t === "str" || t === "e") val = v ? v.textContent : "";
        else if (v) { const n = +v.textContent; val = dateStyles.has(+c.getAttribute("s")) && n > 0 && n < 100000 ? {date:new Date(Math.round((n - 25569) * 864e5)).toISOString().slice(0, 10)} : n; }
        arr[ci] = val; });
      if (ri < 5000) rows[ri] = arr; });
    sheets[s.getAttribute("name")] = Array.from(rows, r => r || []);
  });
  return sheets;
}

window.XLSX_MINI = {ecrire, lire, colName};
})();
