// Photos on an animal's profile: upload to the study's Drive folder, the draw-around background remover,
// and the "Associated data" window that gathers everything recorded for one animal.

import * as B from '../backend.js';
import { $, DB, S, dt, e, flag, nameOf, now, safeUrl, toast } from './core.js';
import { commit } from './sync.js';
import { render } from './render.js';
import { X } from './protocols.js';
import { fHas, key, proj, projExps, runOf } from './runs.js';
import { anMk, anRec, animals } from './animals.js';
import { driveUpload } from './lab.js';

const LOCAL = new Map();            // Drive file id -> the file itself, for photos opened or uploaded in this visit
const PIC = /^image\/(jpeg|png|webp|bmp|gif)$/i;
export const canUpload = () => !!(DB.lab && DB.lab.uploadUrl && proj());

/* ---------------- what the profile shows ---------------- */
export const addBtn = () => canUpload()
  ? `<label class="btn sm pri" style="cursor:pointer">Add photo or file<input type="file" id="phUp" hidden></label>`
  : `<button class="btn sm" data-a="phNoDrive">Add photo or file</button>`;
const tile = (f, label) => `<a class="ph ${f.of ? 'cut' : ''}" href="${e(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer" title="${e(f.name)}: open the full file in Google Drive">${f.th ? `<img src="${e(f.th)}" alt="${e(label)}">` : `<span>${e(label)}</span>`}</a>`;
/* the two squares in the profile header: the newest photo, and its background-removed version */
export function photoSquares(rec) {
  const files = rec.files || [], j = files.map((f, i) => f.img && !f.of ? i : -1).filter(i => i >= 0).pop();
  if (j == null) return `<div class="phs"><div class="ph none"><span>No photo yet</span></div><div class="ph none"><span>Background removed</span></div></div>`;
  const f = files[j], cut = files.filter(q => q.of && q.of === f.id).pop();
  return `<div class="phs">${tile(f, 'Photo')}${cut ? tile(cut, 'Background removed') : `<button class="ph none" data-a="phCut" data-j="${j}"><span>Remove the background</span></button>`}</div>`;
}
export const fileRow = (f, j) => `<div class="line sm">${f.img && f.th ? `<img class="phmini ${f.of ? 'cut' : ''}" src="${e(f.th)}" alt="">` : ''}<span class="grow">${safeUrl(f.url) ? `<a class="lnk" href="${e(f.url)}" target="_blank" rel="noopener noreferrer">${e(f.name)}</a>` : `<span class="mono">${e(f.name)}</span>`} <span class="muted">· ${dt(f.at)} · ${e(nameOf(f.by))}${f.w ? ` · ${f.w} × ${f.h} px` : ''}${f.of ? ' · background removed' : ''}</span></span>${f.img && !f.of ? `<button class="btn sm" data-a="phCut" data-j="${j}">Remove the background</button>` : ''}<button class="btn sm" data-a="anFileDel" data-j="${j}">Remove</button></div>`;

async function thumb(src, type) {
  const k = Math.min(1, 320 / Math.max(src.width, src.height)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.78);
}
/* thumbnails are kept with the animal's record so everyone sees them at once; stop adding them before the record gets too big */
const roomFor = (rec, th) => (rec.files || []).reduce((n, f) => n + (f.th ? f.th.length : 0), 0) + th.length < 600000;

document.addEventListener('change', ev => {
  const el = ev.target; if (el.id !== 'phUp') return;
  const f = el.files && el.files[0], an = S.selAnimal; if (!f || !an) return;
  toast('Uploading ' + f.name + ' to Google Drive…');
  (async () => {
    const pic = PIC.test(f.type); let bmp = null; if (pic) { try { bmp = await createImageBitmap(f); } catch (_) { bmp = null; } }
    const j = await driveUpload(f, 'Animals/' + an), rec = anMk(an), item = { name: f.name, url: j.url, id: j.id, at: now(), by: S.user };
    if (bmp) { item.img = true; item.w = bmp.width; item.h = bmp.height; const th = await thumb(bmp, 'image/jpeg'); if (roomFor(rec, th)) item.th = th; LOCAL.set(j.id, f); }
    rec.files.push(item); commit(); render(); toast(f.name + ' is in the Drive folder for ' + an + '.');
  })().catch(err => toast('The upload did not work: ' + (err.message || 'no answer from Drive') + '.'));
});

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
    hint(busy ? 'Saving at full size and uploading…' : closed ? 'The darkened part will be removed. Save the cut-out, or Start again to redraw.' : pts.length ? 'Keep clicking around the object, or hold the mouse down and trace it. Click the white dot (or double-click) to close the shape.' : 'Click around what you want to keep, or hold the mouse down and trace it. Zoom in with + for a tighter edge.');
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
    if (k === 'save' && closed) { busy = true; draw(); save().then(close, err => { busy = false; draw(); hint('It could not be saved: ' + (err.message || 'unknown reason') + '.'); }); return; }
    if (k !== 'x') draw();
  });
  async function save() {
    // Same number of pixels as the photo, nothing resized: only what is outside the shape becomes see-through.
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.clip(); x.drawImage(bmp, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); if (!blob) throw new Error('the browser could not make the picture');
    let png = new Uint8Array(await blob.arrayBuffer()); const ppm = density(new Uint8Array(await file.arrayBuffer())); if (ppm) png = withPhys(png, ppm);
    const name = f.name.replace(/\.[a-z0-9]+$/i, '') + ' (background removed).png', out = new File([png], name, { type: 'image/png' });
    const up = await driveUpload(out, 'Animals/' + an), r2 = anMk(an), item = { name, url: up.url, id: up.id, at: now(), by: S.user, img: true, w: W, h: H, of: f.id };
    let th = await thumb(c, 'image/webp'); if (!/^data:image\/webp/.test(th)) th = await thumb(c, 'image/png'); if (roomFor(r2, th)) item.th = th;
    LOCAL.set(up.id, out); r2.files.push(item); commit(); render(); toast('Saved next to the photo in Google Drive: ' + W + ' × ' + H + ' pixels, the same as the original.');
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
    ${rec.files.length ? `<div class="card"><h3>Photos and files of the animal</h3>${rec.files.map(f => `<div class="sm">${link(f)} <span class="muted">· ${dt(f.at)}${f.of ? ' · background removed' : ''}</span></div>`).join('')}</div>` : ''}
    <div class="foot"><button class="btn" data-a="close">Close</button></div>`;
}

export const photoActions = {
  phCut: d => { openCutter(S.selAnimal, +d.j); return false; },
  phNoDrive: () => { toast('Uploads need Google Drive switched on for the lab: Lab and access, Google Drive. Until then, paste a link under "Or add a link".'); return false; },
  anData: d => { S.modal = { type: 'anData', an: d.an }; },
};
