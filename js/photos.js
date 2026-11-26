// Photos on an animal's profile: upload to the study's Drive folder, the draw-around background remover,
// and the "Associated data" window that gathers everything recorded for one animal.

import * as B from '../backend.js';
import { $, DB, S, dt, e, flag, nameOf, nid, now, safeUrl, toast } from './core.js';
import { commit } from './sync.js';
import { render, softRender } from './render.js';
import { P, X } from './protocols.js';
import { fHas, key, proj, projExps, runOf, stOf } from './runs.js';
import { pGroups } from './plan.js';
import { anMkIn, anRec, animals } from './animals.js';
import { pickFiles, queueUpload, waitingFor } from './uploads.js';
import { driveUpload } from './lab.js';

const LOCAL = new Map();            // Drive file id -> the file itself, for photos opened or uploaded in this visit
const PIC = /^image\/(jpeg|png|webp|bmp|gif)$/i;
export const canUpload = () => !!(DB.lab && DB.lab.uploadUrl && proj());

/* ---------------- kinds of file ---------------- */
/* What a file is decides where it is stored and what can be done with it:
     tumour  a photo of this animal, in Animals/<animal>; its background can be removed
     graph   one file for whole groups, stored once in Graphs and shown on every animal of the groups tagged
     gel     a gel image, linked to an experiment for every sample that was on it (the same record a bench session's result file makes)
     other   anything else that belongs to this animal */
export const FKIND = { tumour: ['Tumour image', 'A photo of this animal\'s tumour. You can remove its background afterwards.'], graph: ['Graph', 'One file for whole groups. It is stored once, in a Graphs folder, and shows on the profile of every animal in the groups you tag.'],
  gel: ['Gel image', 'An RNA gel, for example. Tag every sample that was on the gel and it is linked to that experiment for each of them.'], other: ['Other file', 'Anything else that belongs to this animal.'] };
/* photos added before there were kinds are tumour images */
export const isTumour = f => !!f.img && !f.of && (!f.kind || f.kind === 'tumour');
const kindTag = f => f.of ? '' : f.kind && f.kind !== 'tumour' ? FKIND[f.kind] ? FKIND[f.kind][0] : '' : f.img ? 'Tumour image' : '';

/* ---------------- what the profile shows ---------------- */
export const addBtn = () => canUpload()
  ? `<button class="btn sm pri" data-a="phPick">Add photos or files</button>`
  : `<button class="btn sm" data-a="phNoDrive">Add photo or file</button>`;
const tile = (f, label) => `<a class="ph ${f.of ? 'cut' : ''}" href="${e(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer" title="${e(f.name)}: open the full file in Google Drive">${f.th ? `<img src="${e(f.th)}" alt="${e(label)}">` : `<span>${e(label)}</span>`}</a>`;
/* the two squares in the profile header: the newest photo, and its background-removed version */
export function photoSquares(rec) {
  const files = rec.files || [], j = files.map((f, i) => isTumour(f) ? i : -1).filter(i => i >= 0).pop();
  if (j == null) return `<div class="phs"><div class="ph none"><span>No photo yet</span></div><div class="ph none"><span>Background removed</span></div></div>`;
  const f = files[j], cut = files.filter(q => q.of && q.of === f.id).pop();
  return `<div class="phs">${tile(f, 'Photo')}${cut ? tile(cut, 'Background removed') : `<button class="ph none" data-a="phCut" data-j="${j}"><span>Remove the background</span></button>`}</div>`;
}
export const fileRow = (f, j) => `<div class="line sm">${f.img && f.th ? `<img class="phmini ${f.of ? 'cut' : ''}" src="${e(f.th)}" alt="">` : ''}<span class="grow">${safeUrl(f.url) ? `<a class="lnk" href="${e(f.url)}" target="_blank" rel="noopener noreferrer">${e(f.name)}</a>` : `<span class="mono">${e(f.name)}</span>`} <span class="muted">· ${dt(f.at)} · ${e(nameOf(f.by))}${f.w ? ` · ${f.w} × ${f.h} px` : ''}${f.of ? ' · background removed' : ''}${kindTag(f) ? ' · ' + kindTag(f) : ''}</span></span>${isTumour(f) ? `<button class="btn sm" data-a="phCut" data-j="${j}">Remove the background</button>` : ''}<button class="btn sm" data-a="anFileDel" data-j="${j}">Remove</button></div>`;

async function thumb(src, type) {
  const k = Math.min(1, 320 / Math.max(src.width, src.height)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.78);
}
/* thumbnails are kept with the animal's record so everyone sees them at once; stop adding them before the record gets too big */
const roomFor = (rec, th) => (rec.files || []).reduce((n, f) => n + (f.th ? f.th.length : 0), 0) + th.length < 600000;

/* where the uploads for one animal are counted, and the line on its profile while some are still on their way */
const spot = (pid, an) => pid + '|an|' + an;
export const waitLine = an => { const n = waitingFor(spot(S.project, an)) + waitingFor(S.project + '|shared'); return n ? `<div class="todo sm"><span>${n} upload${n === 1 ? ' is' : 's are'} still on ${n === 1 ? 'its' : 'their'} way to Google Drive for ${e(an)}. You can carry on; ${n === 1 ? 'it appears' : 'they appear'} here when done.</span></div>` : ''; };
/* a photo or file for an animal joins the waiting list; it is recorded on the animal when its turn has come and it is in Drive */
function sendToAnimal(pid, an, f, kind) {
  queueUpload(an + ': ' + f.name, spot(pid, an), async () => {
    let bmp = null; if (PIC.test(f.type)) { try { bmp = await createImageBitmap(f); } catch (_) { bmp = null; } }
    const j = await driveUpload(f, 'Animals/' + an, pid), item = { name: f.name, url: j.url, id: j.id, at: now(), by: S.user, kind: kind || 'other' };
    let th = ''; if (bmp) { item.img = true; item.w = bmp.width; item.h = bmp.height; th = await thumb(bmp, 'image/jpeg'); LOCAL.set(j.id, f); }
    const rec = anMkIn(pid, an); if (th && roomFor(rec, th)) item.th = th;          // looked up only now: the records may have been refreshed while this waited
    rec.files.push(item); commit(); softRender();
  });
}

/* ---------------- print size: carried from the photo into the cut-out ---------------- */
/* pixels per metre recorded in a JPEG or PNG, or null when the file does not say */
function density(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  try {
    if (u8[0] === 0x89 && u8[1] === 0x50) {                                  // PNG: look for a pHYs chunk
      for (let p = 8; p + 12 <= u8.length;) { const len = dv.getUint32(p), type = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]); if (type === 'pHYs') return u8[p + 16] === 1 ? dv.getUint32(p + 8) : null; if (type === 'IDAT') break; p += 12 + len; }
      return null;
    }
    if (u8[0] !== 0xFF || u8[1] !== 0xD8) return null;
    let jfif = null, exif = null;
    for (let p = 2; p + 4 <= u8.length && u8[p] === 0xFF;) {
      const mk = u8[p + 1], len = dv.getUint16(p + 2); if (mk === 0xDA) break;
      if (mk === 0xE0 && u8[p + 4] === 0x4A && u8[p + 5] === 0x46) { const unit = u8[p + 11], x = dv.getUint16(p + 12); if (x > 1 && unit === 1) jfif = x / 0.0254; else if (x > 1 && unit === 2) jfif = x * 100; }
      if (mk === 0xE1 && u8[p + 4] === 0x45 && u8[p + 5] === 0x78) {
        const t = p + 10, le = u8[t] === 0x49, u16 = o => dv.getUint16(t + o, le), u32 = o => dv.getUint32(t + o, le), ifd = u32(4), n = u16(ifd); let xr = 0, unit = 2;
        for (let i = 0; i < n; i++) { const o = ifd + 2 + i * 12, tag = u16(o); if (tag === 0x011A) { const ro = u32(o + 8), den = u32(ro + 4); xr = den ? u32(ro) / den : 0; } if (tag === 0x0128) unit = u16(o + 8); }
        if (xr > 1) exif = unit === 3 ? xr * 100 : xr / 0.0254;
      }
      p += 2 + len;
    }
    return exif || jfif;
  } catch (_) { return null; }
}
let CRC = null;
function crc32(u8) { if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } } let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
/* write the same pixels-per-metre into a PNG (a pHYs chunk straight after its header) */
function withPhys(png, ppm) {
  const chunk = new Uint8Array(21), dv = new DataView(chunk.buffer), v = Math.round(ppm);
  dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, v); dv.setUint32(12, v); chunk[16] = 1; dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(png.length + 21); out.set(png.subarray(0, 33)); out.set(chunk, 33); out.set(png.subarray(33), 54); return out;
}

/* ---------------- the background remover ---------------- */
async function original(f) {
  if (f.id && LOCAL.has(f.id)) return LOCAL.get(f.id);
  if (!f.id) throw new Error('this photo was added as a link, so the tracker cannot open it. Add it with "Add photo or file" instead');
  const r = await fetch(DB.lab.uploadUrl, { method: 'POST', body: JSON.stringify({ token: await B.idToken(), action: 'fetch', project: S.project, id: f.id }) }), j = await r.json();
  if (!j.ok) throw new Error(/empty/.test(j.error || '') ? 'the Drive script is an older version that cannot hand photos back. Update Drive.gs and deploy a new version (SETUP.md, section 7)' : (j.error || 'Drive did not send the photo'));
  const bin = atob(j.data), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const file = new File([u8], j.name || f.name, { type: j.type || 'image/jpeg' }); LOCAL.set(f.id, file); return file;
}
async function openCutter(an, j) {
  const rec = anRec(an), f = rec && rec.files[j]; if (!f) return;
  document.getElementById('cutter')?.remove();
  const box = document.createElement('div'); box.id = 'cutter';
  box.innerHTML = `<div class="cutdlg" role="dialog" aria-modal="true" aria-label="Remove the background"><div class="line"><h2 class="grow">Remove the background: ${e(f.name)}</h2><button class="btn sm" data-k="x">Cancel</button></div>
    <div class="hint" id="cutHint">Opening the photo at full size…</div>
    <div class="line" id="cutTools" hidden><button class="btn sm" data-k="out" aria-label="Zoom out">−</button><span class="sm mono" id="cutZoom"></span><button class="btn sm" data-k="in" aria-label="Zoom in">+</button><button class="btn sm" data-k="undo">Undo last point</button><button class="btn sm" data-k="clear">Start again</button><span class="sp"></span><button class="btn pri" data-k="save" disabled>Save the cut-out</button></div>
    <div class="cutwrap"><canvas id="cutCv"></canvas></div></div>`;
  document.body.append(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey, true); }, hint = t => { const h = box.querySelector('#cutHint'); if (h) h.textContent = t; };
  const onKey = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } }; document.addEventListener('keydown', onKey, true);
  box.addEventListener('click', ev => { const k = ev.target.dataset && ev.target.dataset.k; if (k === 'x') close(); });
  let file, bmp;
  try { file = await original(f); bmp = await createImageBitmap(file); } catch (err) { hint('The photo could not be opened: ' + (err.message || 'unknown reason') + '.'); return; }
  if (!document.body.contains(box)) return;
  const W = bmp.width, H = bmp.height, cv = box.querySelector('#cutCv'), ctx = cv.getContext('2d'), wrap = box.querySelector('.cutwrap');
  if (W * H > 200e6) { hint('This photo is too large for the browser to cut (' + W + ' × ' + H + ' pixels).'); return; }
  const fit = Math.min(1, (wrap.clientWidth - 4) / W, (Math.max(260, window.innerHeight * 0.62)) / H); let zoom = 1, pts = [], closed = false, drag = false, busy = false;
  const scale = () => fit * zoom;
  function draw() {
    const s = scale(), cw = Math.round(W * s), ch = Math.round(H * s), dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, cw, ch);
    const path = () => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0] * s, p[1] * s) : ctx.moveTo(p[0] * s, p[1] * s)); };
    if (closed) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cw, ch); pts.forEach((p, i) => i ? ctx.lineTo(p[0] * s, p[1] * s) : ctx.moveTo(p[0] * s, p[1] * s)); ctx.closePath(); ctx.fillStyle = 'rgba(8,20,22,.72)'; ctx.fill('evenodd'); ctx.restore(); }
    if (pts.length) { path(); if (closed) ctx.closePath(); ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      if (!closed) { const p = pts[0]; ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, 6, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke(); } }
    box.querySelector('#cutZoom').textContent = Math.round(s * 100) + '%'; box.querySelector('[data-k=save]').disabled = !closed || busy;
    hint(busy ? 'Making the cut-out at full size…' : closed ? 'The darkened part will be removed. Save the cut-out, or Start again to redraw.' : pts.length ? 'Keep clicking around the object, or hold the mouse down and trace it. Click the white dot (or double-click) to close the shape.' : 'Click around what you want to keep, or hold the mouse down and trace it. Zoom in with + for a tighter edge.');
  }
  const at = ev => { const r = cv.getBoundingClientRect(), s = scale(); return [Math.max(0, Math.min(W, (ev.clientX - r.left) / s)), Math.max(0, Math.min(H, (ev.clientY - r.top) / s))]; };
  const near = (a, b, px) => Math.hypot(a[0] - b[0], a[1] - b[1]) * scale() < px;
  cv.addEventListener('pointerdown', ev => { if (closed || busy || ev.button) return; const p = at(ev); if (pts.length >= 3 && near(p, pts[0], 12)) { closed = true; draw(); return; } pts.push(p); drag = true; cv.setPointerCapture(ev.pointerId); draw(); });
  cv.addEventListener('pointermove', ev => { if (!drag || closed) return; const p = at(ev); if (!near(p, pts[pts.length - 1], 5)) { pts.push(p); draw(); } });
  cv.addEventListener('pointerup', () => { if (drag && pts.length > 12 && near(pts[pts.length - 1], pts[0], 14)) closed = true; drag = false; draw(); });
  cv.addEventListener('dblclick', () => { if (!closed && pts.length >= 3) { closed = true; draw(); } });
  box.querySelector('#cutTools').hidden = false; draw();
  box.addEventListener('click', ev => {
    const k = ev.target.dataset && ev.target.dataset.k; if (!k || busy) return;
    if (k === 'in') zoom = Math.min(8, zoom * 1.5); if (k === 'out') zoom = Math.max(1, zoom / 1.5);
    if (k === 'undo') { if (closed) closed = false; else pts.pop(); } if (k === 'clear') { pts = []; closed = false; }
    if (k === 'save' && closed) { busy = true; draw(); save().then(close, err => { busy = false; draw(); hint('The cut-out could not be made: ' + (err.message || 'unknown reason') + '.'); }); return; }
    if (k !== 'x') draw();
  });
  async function save() {
    // Same number of pixels as the photo, nothing resized: only what is outside the shape becomes see-through.
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.clip(); x.drawImage(bmp, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); if (!blob) throw new Error('the browser could not make the picture');
    let png = new Uint8Array(await blob.arrayBuffer()); const ppm = density(new Uint8Array(await file.arrayBuffer())); if (ppm) png = withPhys(png, ppm);
    const name = f.name.replace(/\.[a-z0-9]+$/i, '') + ' (background removed).png', out = new File([png], name, { type: 'image/png' });
    let th = await thumb(c, 'image/webp'); if (!/^data:image\/webp/.test(th)) th = await thumb(c, 'image/png');
    // The picture is ready: the window closes now and the upload joins the waiting list, so the next animal need not wait for it.
    const pid = S.project;
    queueUpload(an + ': ' + name, spot(pid, an), async () => {
      const up = await driveUpload(out, 'Animals/' + an, pid), r2 = anMkIn(pid, an), item = { name, url: up.url, id: up.id, at: now(), by: S.user, img: true, w: W, h: H, of: f.id };
      if (roomFor(r2, th)) item.th = th; LOCAL.set(up.id, out); r2.files.push(item); commit(); softRender();
    });
    softRender(); toast('Cut-out made (' + W + ' × ' + H + ' pixels, the same as the photo). It is uploading in the background.');
  }
}

/* ---------------- associated data: everything recorded for one animal ---------------- */
export function anDataHTML(m) {
  const a = animals().find(q => q.id === m.an); if (!a) return '<h2>Associated data</h2><div class="hint">That animal is no longer in this study.</div>';
  const xs = projExps(), mine = new Set(a.samples.map(s => s.id)), rec = anRec(a.id) || { files: [] }, seen = new Set(), shared = [];
  const link = f => safeUrl(f.url) ? `<a class="lnk" href="${e(f.url)}" target="_blank" rel="noopener noreferrer">${e(f.name)}</a>` : `<span class="mono">${e(f.name)}</span>`;
  const blocks = a.samples.map(smp => {
    const rows = [];
    for (const x of xs) for (const t of x.targets || ['']) {
      const s = runOf(x.id, t, smp.id), k = key(x.id, t, smp.id), fs = DB.files.filter(f => fHas(f, k)); if (!s && !fs.length) continue;
      const res = s && s.res && s.res[smp.id] ? Object.entries(s.res[smp.id]) : [];
      fs.forEach(f => { if ((f.keys || []).length > 1 && !seen.has(f.id)) { seen.add(f.id); shared.push(f); } });
      rows.push(`<div class="ti"><div class="line sm"><b class="grow">${e(x.name)}${t ? ' ' + e(t) : ''}</b>${s ? flag(s.doneAt ? 'ok' : 'warn', s.doneAt ? 'Done ' + dt(s.doneAt) : 'On the bench') : flag('', 'Not run')}</div>
        ${res.length ? `<div class="sm">${res.map(([n, v]) => `<span class="mono">${e(n)}: <b>${e(v)}</b></span>`).join(' · ')}</div>` : ''}
        ${fs.map(f => `<div class="sm">${link(f)} <span class="muted">· ${dt(f.at)}${(f.keys || []).length > 1 ? ' · one file for ' + f.keys.length + ' samples' : ''}</span></div>`).join('')}</div>`);
    }
    return rows.length ? `<div class="card"><h3>${e(smp.id)}</h3>${rows.join('')}</div>` : '';
  }).filter(Boolean);
  const sharedHTML = shared.map(f => { const who = (f.keys || []).map(k => k.split('|').slice(2).join('|')), x = X((f.key || '').split('|')[0]); return `<div class="ti"><div class="sm">${link(f)} <span class="muted">· ${e(x ? x.name : '')} · ${dt(f.at)}</span></div><div class="mcs">${who.map(w => `<span class="mc ${mine.has(w) ? 'on' : ''}">${e(w)}</span>`).join('')}</div></div>`; }).join('');
  return `<h2>Associated data: ${e(a.id)}</h2><div class="hint">Everything recorded in the tracker for this animal's samples: runs, typed results and result files, including files that cover several samples at once.</div>
    ${shared.length ? `<div class="card"><h3>Files shared with other samples</h3><div class="hint">For example one gel with several lanes. This animal's samples are highlighted.</div>${sharedHTML}</div>` : ''}
    ${blocks.join('') || '<div class="hint">Nothing has been run or attached for this animal\'s samples yet.</div>'}
    ${(g => g.length ? `<div class="card"><h3>Graphs for ${e(a.group || 'all groups')}</h3>${g.map(f => `<div class="sm">${link(f)} <span class="muted">· ${e(tagTxt(f))} · ${dt(f.at)}</span></div>`).join('')}</div>` : '')(sharedFor(a).filter(f => f.kind === 'graph'))}
    ${rec.files.length ? `<div class="card"><h3>Photos and files of the animal</h3>${rec.files.map(f => `<div class="sm">${link(f)} <span class="muted">· ${dt(f.at)}${f.of ? ' · background removed' : ''}</span></div>`).join('')}</div>` : ''}
    <div class="foot"><button class="btn" data-a="close">Close</button></div>`;
}

/* ---------------- deleting the file itself from Google Drive, not just its link ---------------- */
const driveId = f => (f && (f.id && !/^i[a-z0-9]{12}$/.test(f.id) ? f.id : (/\/d\/([\w-]{10,})/.exec(f.url || '') || [])[1])) || '';
/* the file a "remove link" question is about, when it is one the tracker can delete from Drive */
export function drivePick(m) {
  if (!m || !canUpload()) return null;
  if (m.a === 'anFileDel') { const f = ((anRec(S.selAnimal) || {}).files || [])[+m.d.j]; return f && driveId(f) ? { f, id: driveId(f) } : null; }
  if (m.a === 'fileDel') { const f = DB.files.find(q => q.id === m.d.id); return f && driveId(f) ? { f, id: driveId(f) } : null; }
  return null;
}
const RED = 'style="background:var(--bad);border-color:var(--bad);color:#fff"';
/* the buttons of an "Are you sure?" window: for a Drive file, Remove link and Cancel on the left and a red Delete on the right */
export function sureFoot(m, yes) {
  if (m.red) return `<div class="foot"><button class="btn" data-a="sureNo">Cancel</button><button class="btn" ${RED} data-a="sureYes">${yes}</button></div>`;
  if (!drivePick(m)) return `<div class="foot"><button class="btn" data-a="sureNo">Cancel</button><button class="btn pri" data-a="sureYes">${yes}</button></div>`;
  return `<div class="hint">Remove link takes it off this page and leaves the file in Google Drive. Delete also puts the file itself in the Drive bin.</div>
     <div class="foot" style="justify-content:flex-start"><button class="btn pri" data-a="sureYes">${yes}</button><button class="btn" data-a="sureNo">Cancel</button><span class="sp"></span><button class="btn" ${RED} data-a="drvDel">Delete</button></div>`;
}
async function driveTrash(id) {
  const r = await fetch(DB.lab.uploadUrl, { method: 'POST', body: JSON.stringify({ token: await B.idToken(), action: 'trash', project: S.project, id }) }), j = await r.json();
  if (!j.ok) throw new Error(/empty/.test(j.error || '') ? 'the Drive script is an older version that cannot delete files. Update Drive.gs and deploy a new version (SETUP.md, section 7)' : (j.error || 'Drive refused'));
}

/* ---------------- graphs and gels: one file shown on many profiles ---------------- */
const fKeys = f => f.keys && f.keys.length ? f.keys : f.key ? [f.key] : [];
const sampleOf = k => String(k).split('|').slice(2).join('|');
const gelSamples = m => X(m.x) ? proj().samples.map(q => q.id).filter(q => stOf(m.x, m.t, q) !== 'na') : [];
function gelExp(m, xid) { const x = X(xid); if (!x) return; m.x = x.id; m.t = x.targets ? (x.targets.includes(m.t) ? m.t : x.targets[0] || '') : ''; const ok = gelSamples(m); m.ms = m.ms.filter(q => ok.includes(q)); if (!m.ms.length) m.ms = ok.filter(q => q.split(' ')[0] === m.an); }
/* the graphs tagged with this animal's group, and the gels that one of its samples was on */
export function sharedFor(a) {
  const mine = new Set(a.samples.map(q => q.id));
  return DB.files.filter(f => f.proj === S.project && (f.kind === 'graph' ? f.all || (f.groups || []).includes(a.group || '') : f.kind === 'gel' && fKeys(f).some(k => mine.has(sampleOf(k)))));
}
const tagTxt = f => f.kind === 'graph' ? (f.all ? 'all groups' : (f.groups || []).join(', ') || 'no group') : (() => { const ks = fKeys(f), x = X((ks[0] || '').split('|')[0]); return (x ? x.name + ((ks[0] || '').split('|')[1] ? ' ' + ks[0].split('|')[1] : '') + ': ' : '') + ks.length + ' sample' + (ks.length === 1 ? '' : 's'); })();
export function sharedHTML(a) {
  const L = sharedFor(a); if (!L.length) return '';
  return `<div class="ti"><h3>Graphs and gels that include ${e(a.id)}</h3><div class="hint">Each of these is one file, stored once and shown on every profile it is tagged with.</div>${L.map(f => `<div class="line sm">${f.th ? `<img class="phmini" src="${e(f.th)}" alt="">` : ''}<span class="grow">${safeUrl(f.url) ? `<a class="lnk" href="${e(f.url)}" target="_blank" rel="noopener noreferrer">${e(f.name)}</a>` : `<span class="mono">${e(f.name)}</span>`} <span class="muted">· ${f.kind === 'graph' ? 'Graph' : 'Gel image'} · ${e(tagTxt(f))} · ${dt(f.at)} · ${e(nameOf(f.by))}</span></span><button class="btn sm" data-a="afEdit" data-id="${f.id}">Change tags</button><button class="btn sm" data-a="fileDel" data-id="${f.id}">Remove</button></div>`).join('')}</div>`;
}
export function addFileHTML(m) {
  const a = animals().find(q => q.id === m.an), ed = m.edit ? DB.files.find(f => f.id === m.edit) : null, foot = (go, off) => `<div class="foot"><span class="err" id="mErr"></span><button class="btn" data-a="close">Cancel</button>${go ? `<button class="btn pri" data-a="afGo" ${off ? 'disabled' : ''}>${go}</button>` : ''}</div>`;
  if ((m.edit && !ed) || (!m.edit && !a)) return '<h2>Add photos or files</h2><div class="hint">That is no longer in this study.</div>' + foot('');
  let h = ed ? `<h2>Change tags: ${e(ed.name)}</h2>` : `<h2>Add photos or files: <span class="mono">${e(m.an)}</span></h2><div class="hint">First say what it is. That decides where it is stored and what you can do with it afterwards.</div>
    <div class="kinds">${Object.entries(FKIND).map(([k, v]) => `<button class="kind ${m.kind === k ? 'on' : ''}" data-a="afKind" data-k="${k}" aria-pressed="${m.kind === k}"><b>${v[0]}</b><span>${v[1]}</span></button>`).join('')}</div>`;
  const nameBox = what => `<label class="fld" style="display:grid;gap:2px">Name for it${ed ? '' : ' (optional; left empty, the file\'s own name is used)'}<input type="text" id="afNm" value="${e(m.nm != null ? m.nm : ed ? ed.name : '')}" placeholder="${what}"></label>`;
  if (m.kind === 'graph') {
    const gs = pGroups();
    h += `<h3>Which groups is this graph about?</h3><div class="mcs"><button class="mc ${m.all ? 'on' : ''}" data-a="afAll" aria-pressed="${!!m.all}">All groups</button>${gs.map(g => `<button class="mc ${!m.all && m.gs.includes(g) ? 'on' : ''}" data-a="afG" data-g="${e(g)}" aria-pressed="${!m.all && m.gs.includes(g)}">${e(g)}</button>`).join('')}</div>
      <div class="hint">${m.all ? 'It shows on the profile of every animal in this study, including ones added later.' : m.gs.length ? 'It shows on the profile of every animal in ' + e(m.gs.join(', ')) + ', including ones added to ' + (m.gs.length === 1 ? 'that group' : 'those groups') + ' later.' : 'Click the groups, or All groups.'} The file is kept once, in the study\'s Graphs folder.${gs.length ? '' : ' This study has no groups yet, so only All groups can be chosen.'}</div>${nameBox('e.g. Tumour volume over time')}`;
  }
  if (m.kind === 'gel') {
    const xs = projExps(), x = X(m.x), ok = gelSamples(m), an = a || { id: m.an, group: '' };
    h += !xs.length ? '<div class="todo sm"><span>This study has no experiments yet. Add the experiment under Study plan first, then the gel can be linked to it.</span></div>' : `<h3>Which experiment is the gel from?</h3><div class="mcs">${xs.map(q => `<button class="mc ${q.id === m.x ? 'on' : ''}" data-a="afX" data-x="${q.id}" aria-pressed="${q.id === m.x}">${e(q.name)}</button>`).join('')}</div>
      ${x && x.targets ? `<div class="mcs">${x.targets.map(t => `<button class="mc ${t === m.t ? 'on' : ''}" data-a="afT" data-t="${e(t)}" aria-pressed="${t === m.t}">${e(t)}</button>`).join('')}</div>` : ''}
      <h3>Which samples were on the gel? <span class="muted sm">${m.ms.length} ticked</span></h3>
      <div class="line sm"><button class="btn sm" data-a="afMs" data-k="mine">+ ${e(an.id)}'s samples</button>${an.group ? `<button class="btn sm" data-a="afMs" data-k="group">+ everything in ${e(an.group)}</button>` : ''}<button class="btn sm" data-a="afMs" data-k="all">All</button><button class="btn sm" data-a="afMs" data-k="none">Clear</button></div>
      <div class="mcs scroll" style="max-height:210px;overflow:auto">${ok.map(q => `<button class="mc ${m.ms.includes(q) ? 'on' : ''}" data-a="afM" data-m="${e(q)}" aria-pressed="${m.ms.includes(q)}">${e(q)}</button>`).join('') || '<span class="hint">No samples are planned on this experiment. Tick them under Study plan first.</span>'}</div>
      <div class="hint">The gel is linked to ${e(x ? x.name : 'the experiment')} for every sample ticked, exactly as if it had been added as a result file after the bench session. It shows in each sample's record and is exported once.</div>${nameBox('e.g. RNA gel, plate 2')}`;
  }
  if (m.kind === 'tumour') h += '<div class="hint">Stored in this animal\'s own folder. Choose one photo or several.</div>';
  if (m.kind === 'other') h += '<div class="hint">Stored in this animal\'s own folder, with no tags.</div>';
  return h + foot(ed ? 'Save tags' : m.kind ? 'Choose the file or files' : 'Choose the file or files', !m.kind);
}

/* what is typed as the name is kept while the groups or samples are being clicked */
document.addEventListener('input', ev => { if (ev.target.id === 'afNm' && S.modal && S.modal.type === 'addFile') S.modal.nm = ev.target.value; });

export const photoActions = {
  drvDel: () => { const m = S.modal, p = drivePick(m); if (!p) return false; const kids = m.a === 'anFileDel' ? ((anRec(S.selAnimal) || {}).files || []).filter(q => q.of && q.of === p.f.id).length : 0, n = (p.f.keys || []).length;
    S.modal = { type: 'sure', red: true, a: 'drvDelDo', d: { src: m.a, j: m.d.j, id: m.d.id, an: S.selAnimal, fid: p.id, name: p.f.name }, back: m.back || null,
      q: [`Delete ${p.f.name} from Google Drive?`, `The file itself goes to the Drive bin of whoever owns the study folder, and its link is removed here${n > 1 ? ' for all ' + n + ' samples it is linked to' : ''}. It can be restored from the bin for about 30 days, after which it is gone for good.${kids ? ' Its background-removed version is a separate file and is kept.' : ''}`, 'Delete the file'] }; },
  drvDelDo: d => {
    toast('Deleting ' + d.name + ' from Google Drive…');
    driveTrash(d.fid).then(() => {
      if (d.src === 'anFileDel') { const r = anRec(d.an); if (r) r.files = r.files.filter(q => driveId(q) !== d.fid); } else DB.files = DB.files.filter(q => q.id !== d.id);
      LOCAL.delete(d.fid); commit(); render(); toast(d.name + ' is in the Drive bin and its link is removed.');
    }, err => toast('It was not deleted: ' + (err.message || 'no answer from Drive') + '. The link is still here.'));
    return false;
  },
  phCut: d => { openCutter(S.selAnimal, +d.j); return false; },
  /* Add photos or files: first say what it is */
  phPick: () => { const a = animals().find(q => q.id === S.selAnimal); if (!a) return false; S.modal = { type: 'addFile', an: a.id, kind: '', all: false, gs: a.group ? [a.group] : [], x: '', t: '', ms: [] }; },
  afKind: d => { const m = S.modal; m.kind = d.k; if (d.k === 'gel' && !m.x) { const xs = projExps(), x = xs.find(q => /rna/i.test(q.name + ' ' + ((P(q.proto) || {}).name || ''))) || xs[0]; if (x) gelExp(m, x.id); } },
  afX: d => { gelExp(S.modal, d.x); }, afT: d => { const m = S.modal; m.t = d.t; m.ms = m.ms.filter(q => stOf(m.x, m.t, q) !== 'na'); },
  afG: d => { const m = S.modal; m.all = false; m.gs = m.gs.includes(d.g) ? m.gs.filter(g => g !== d.g) : [...m.gs, d.g]; }, afAll: () => { const m = S.modal; m.all = !m.all; },
  afM: d => { const m = S.modal; m.ms = m.ms.includes(d.m) ? m.ms.filter(q => q !== d.m) : [...m.ms, d.m]; },
  afMs: d => { const m = S.modal, ok = gelSamples(m), a = animals().find(q => q.id === m.an); m.ms = d.k === 'none' ? [] : d.k === 'all' ? ok : [...new Set(m.ms.concat(ok.filter(q => d.k === 'mine' ? q.split(' ')[0] === m.an : a && (proj().samples.find(z => z.id === q) || {}).group === a.group)))]; },
  afEdit: d => { const f = DB.files.find(q => q.id === d.id); if (!f) return false; const ks = fKeys(f), k0 = (ks[0] || '').split('|');
    S.modal = { type: 'addFile', an: S.selAnimal, edit: f.id, kind: f.kind === 'graph' ? 'graph' : 'gel', all: !!f.all, gs: [...(f.groups || [])], x: k0[0] || '', t: k0[1] || '', ms: ks.map(sampleOf) }; },
  afGo: () => {
    const m = S.modal, err = t => { const el = $('#mErr'); if (el) el.textContent = t; return false; }, pid = S.project, typed = ($('#afNm') ? $('#afNm').value : '').trim();
    if (!m || !m.kind) return err('Choose what it is first.');
    if (m.kind === 'graph' && !m.all && !m.gs.length) return err('Tag at least one group, or all groups.');
    if (m.kind === 'gel' && (!X(m.x) || !m.ms.length)) return err('Tick at least one sample that was on the gel.');
    const tags = rec => { if (m.kind === 'graph') { delete rec.groups; delete rec.all; if (m.all) rec.all = true; else rec.groups = [...m.gs]; } else { const ks = m.ms.map(q => key(m.x, m.t, q)); rec.key = ks[0]; if (ks.length > 1) rec.keys = ks; else delete rec.keys; } return rec; };
    if (m.edit) { const f = DB.files.find(q => q.id === m.edit); if (!f) { S.modal = null; return; } tags(f); if (typed) f.name = typed; S.modal = null; toast('Tags saved for ' + f.name + '.'); return; }
    const snap = { ...m, gs: [...m.gs], ms: [...m.ms] }, x = X(m.x);
    pickFiles(true, fs => {
      for (const file of fs) {
        if (m.kind === 'tumour' || m.kind === 'other') { sendToAnimal(pid, m.an, file, m.kind); continue; }
        const name = fs.length === 1 && typed ? typed : file.name;
        queueUpload((m.kind === 'graph' ? 'Graph: ' : 'Gel: ') + file.name, pid + '|shared', async () => {
          let th = ''; if (PIC.test(file.type)) { try { th = await thumb(await createImageBitmap(file), 'image/jpeg'); } catch (_) { th = ''; } }
          const j = await driveUpload(file, m.kind === 'graph' ? 'Graphs' : 'Results/' + ((x && x.name) || 'Experiment'), pid), rec = { id: nid(), proj: pid, kind: m.kind, name, url: j.url, did: j.id, at: now(), by: S.user };
          Object.assign(m, snap); tags(rec); if (th) rec.th = th; DB.files.push(rec); commit(); softRender();
        });
      }
      if (S.modal === m) S.modal = null; render();
    });
    return false;
  },
  phNoDrive: () => { toast('Uploads need Google Drive switched on for the lab: Lab and access, Google Drive. Until then, paste a link under "Or add a link".'); return false; },
  anData: d => { S.modal = { type: 'anData', an: d.an }; },
};
