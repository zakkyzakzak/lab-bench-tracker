// Writing the files an export hands over: Excel (.xlsx), Word (.docx), PowerPoint (.pptx) and zip.
// Nothing in this file knows about the lab's records; export.js decides what goes in.

/* The Word, PowerPoint and zip writers are only fetched the first time an export needs them. */
const LIBS = {
  zip: ['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'JSZip'],
  docx: ['https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js', 'docx'],
  pptx: ['https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js', 'PptxGenJS'],
};
const loading = {};
export function lib(k) {
  const [src, g] = LIBS[k]; if (window[g]) return Promise.resolve(window[g]);
  return loading[k] || (loading[k] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src;
    s.onload = () => window[g] ? res(window[g]) : rej(new Error('the file writer loaded but did not start'));
    s.onerror = () => { delete loading[k]; s.remove(); rej(new Error('the part of the site that writes this kind of file could not be loaded. Check the connection and try again')); };
    document.head.append(s);
  }));
}

export const fileSafe = s => String(s ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0, 90) || 'file';
export function saveBlob(blob, name) {
  const a = document.createElement('a'), url = URL.createObjectURL(blob); a.href = url; a.download = name; a.style.display = 'none';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 120000);
}
/* characters that are not allowed inside an Office file */
const clean = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
const xe = s => clean(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- Excel ---------------- */
/* sheets: [{ name, head: [text], rows: [[text | number | Date | null]] }]. Text is always stored as text, never as a formula. */
const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const serial = d => (d.getTime() - d.getTimezoneOffset() * 6e4) / 864e5 + 25569;
export async function xlsxBlob(sheets) {
  const Z = await lib('zip'), z = new Z(), used = new Set();
  const names = sheets.map((s, i) => { let n = clean(s.name).replace(/[\[\]:*?/\\']/g, ' ').trim().slice(0, 31) || 'Sheet' + (i + 1); while (used.has(n.toLowerCase())) n = n.slice(0, 28) + ' ' + (i + 1); used.add(n.toLowerCase()); return n; });
  const cell = (v, r, c, st) => {
    const ref = colName(c) + r;
    if (v == null || v === '') return '';
    if (v instanceof Date) return isNaN(v) ? '' : `<c r="${ref}" s="2"><v>${serial(v)}</v></c>`;
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${st ? ` s="${st}"` : ''}><v>${v}</v></c>`;
    if (typeof v === 'boolean') v = v ? 'Yes' : 'No';
    return `<c r="${ref}" t="inlineStr"${st ? ` s="${st}"` : ''}><is><t xml:space="preserve">${xe(String(v).slice(0, 32000))}</t></is></c>`;
  };
  sheets.forEach((s, i) => {
    const head = s.head || [], rows = s.rows || [], wd = head.map(h => String(h).length);
    for (const r of rows.slice(0, 400)) r.forEach((v, c) => { const n = v instanceof Date ? 17 : String(v ?? '').length; if (n > (wd[c] || 0)) wd[c] = n; });
    const cols = wd.length ? `<cols>${wd.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${Math.min(70, Math.max(8, (w || 0) + 2))}" customWidth="1"/>`).join('')}</cols>` : '';
    const body = [`<row r="1">${head.map((h, c) => cell(String(h), 1, c, 1)).join('')}</row>`];
    rows.forEach((r, k) => body.push(`<row r="${k + 2}">${r.map((v, c) => cell(v, k + 2, c, 0)).join('')}</row>`));
    z.file(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${body.join('')}</sheetData></worksheet>`);
  });
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xe(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  z.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\ mmm\\ yyyy\\ hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ---------------- Word ---------------- */
/* blocks, in order:
     { h: 1 | 2 | 3, t, brk }            a heading (brk: start it on a new page)
     { p: text or [run], sm, c }         a paragraph; a run is text or { t, b, i, c, url }
     { table: { head: [text], rows: [[cell]], w: [percent per column] } }   a cell is text, [run], or { lines: [text] }
     { img: { data: Uint8Array (JPEG), w, h } }   an image, already sized in pixels
     { brk: true }                       a page break */
export async function docxBlob(meta, blocks) {
  const D = await lib('docx'), { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun, ExternalHyperlink, PageBreak, AlignmentType, Footer, PageNumber, ShadingType } = D;
  const H = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
  const runs = (v, o = {}) => (Array.isArray(v) ? v : [v]).filter(r => r != null && r !== '').map(r => {
    const q = typeof r === 'object' ? r : { t: r }, tr = x => new TextRun({ text: clean(q.t), bold: q.b || o.b, italics: q.i, color: q.c || o.c, size: o.size, ...x });
    return q.url && /^https?:\/\//i.test(q.url) ? new ExternalHyperlink({ link: q.url, children: [tr({ style: 'Hyperlink' })] }) : tr();
  });
  const para = (v, o = {}) => new Paragraph({ children: runs(v, o), spacing: { after: o.tight ? 40 : 110 }, alignment: o.center ? AlignmentType.CENTER : undefined, keepNext: o.keep });
  const kids = [];
  for (const b of blocks) {
    if (b.h) kids.push(new Paragraph({ text: clean(b.t), heading: H[b.h], pageBreakBefore: !!b.brk, keepNext: true }));
    else if (b.table) {
      const { head, rows, w } = b.table, n = head.length, pc = i => ({ size: (w && w[i]) || Math.floor(100 / n), type: WidthType.PERCENTAGE });
      const mk = (cells, hd) => new TableRow({ tableHeader: hd, cantSplit: false, children: cells.slice(0, n).concat(Array(Math.max(0, n - cells.length)).fill('')).map((c, i) => new TableCell({ width: pc(i), margins: { top: 40, bottom: 40, left: 80, right: 80 }, shading: hd ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E8EEEE' } : undefined,
        children: (c && c.lines ? (c.lines.length ? c.lines : ['']) : [c]).map(line => para(line, { size: 18, b: hd, tight: true })) })) });
      kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [mk(head, true), ...rows.map(r => mk(r, false))] }), para('', { tight: true }));
    }
    else if (b.img) kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 110 }, children: [new ImageRun({ type: 'jpg', data: b.img.data, transformation: { width: b.img.w, height: b.img.h } })] }));
    else if (b.brk) kids.push(new Paragraph({ children: [new PageBreak()] }));
    else if (b.p != null) kids.push(para(b.p, { size: b.sm ? 18 : undefined, c: b.c, keep: b.keep }));
  }
  const doc = new Document({
    creator: clean(meta.by || 'Lab Bench Tracker'), title: clean(meta.title), description: 'Exported from Lab Bench Tracker',
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: clean(meta.foot || meta.title) + '   ·   page ', size: 16, color: '777777' }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '777777' })] })] }) },
      children: kids }],
  });
  return Packer.toBlob(doc);
}
/* the page is A4 with narrow margins: this is the room an image has, in pixels at 96 to the inch */
export const DOC_BOX = [650, 720];

/* ---------------- PowerPoint ---------------- */
/* slides: [{ title, sub, lines: [text], img: { data: Uint8Array (JPEG), w, h }, notes }] on a 13.33 x 7.5 inch slide */
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
export async function pptxBlob(meta, slides) {
  const P = await lib('pptx'), pp = new P(); pp.layout = 'LAYOUT_WIDE'; pp.title = clean(meta.title); pp.author = clean(meta.by || ''); pp.company = 'Lab Bench Tracker';
  for (const s of slides) {
    const sl = pp.addSlide(); let y = 0.3;
    sl.addText(clean(s.title), { x: 0.4, y, w: 12.5, h: 0.6, fontSize: s.big ? 28 : 20, bold: true, color: '14383B', fontFace: 'Calibri', fit: 'shrink' }); y += 0.65;
    if (s.sub) { const h = Math.min(1.5, 0.3 + 0.2 * Math.ceil(clean(s.sub).length / 150)); sl.addText(clean(s.sub), { x: 0.4, y, w: 12.5, h, fontSize: 11, color: '555555', fontFace: 'Calibri', valign: 'top', fit: 'shrink' }); y += h + 0.1; }
    if (s.img) { const bw = 12.5, bh = 7.3 - y, k = Math.min(bw / s.img.w, bh / s.img.h), w = s.img.w * k, h = s.img.h * k; sl.addImage({ data: 'image/jpeg;base64,' + b64(s.img.data), x: 0.4 + (bw - w) / 2, y, w, h }); }
    else if (s.lines && s.lines.length) sl.addText(s.lines.map(clean).join('\n'), { x: 0.4, y, w: 12.5, h: 7.2 - y, fontSize: 13, color: '222222', fontFace: 'Calibri', valign: 'top', fit: 'shrink' });
    if (s.notes) sl.addNotes(clean(s.notes));
  }
  return pp.write({ outputType: 'blob' });
}

/* ---------------- images ---------------- */
/* A copy small enough to sit in a document: at most `max` pixels on the long side, as a JPEG on white.
   Gives null when the browser cannot read the picture (a TIFF, for example). */
export async function shrink(blob, max = 1800) {
  let bmp; try { bmp = await createImageBitmap(blob); } catch (_) { return null; }
  try {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86)); if (!out) return null;
    return { data: new Uint8Array(await out.arrayBuffer()), pw: c.width, ph: c.height, ow: bmp.width, oh: bmp.height };
  } finally { if (bmp.close) bmp.close(); }
}
/* the same picture sized to fit a box, keeping its shape and never enlarged beyond its pixels */
export const fitBox = (im, [bw, bh]) => { const k = Math.min(1, bw / im.pw, bh / im.ph); return { data: im.data, w: Math.round(im.pw * k), h: Math.round(im.ph * k) }; };
export async function sha(blob) { try { const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); } catch (_) { return ''; } }
