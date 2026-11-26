// Stored files for the lab map: room scans and photos.
// A file is kept in Firestore as numbered pieces of under 1 MB (blobs/<id>/parts/<n>), behind the same
// rules as every other lab record, so nothing about the lab's rooms is public.

import * as B from '../backend.js';
import { S, nid, now } from './core.js';

const PART = 900000;
const mem = new Map();    // id -> promise of the whole file, kept while the page is open
const urls = new Map();   // id -> promise of an address the page can show it from

async function pool(n, width, job) { let next = 0; const run = async () => { while (next < n) await job(next++); }; await Promise.all(Array.from({ length: Math.min(width, n) }, run)); }

/* a file this page already holds in full needs no download */
export const keepBlob = (id, u8) => { mem.set(id, Promise.resolve(u8)); };
/* store a file; resolves to the small record ({id, n, size}) that is saved on whatever the file belongs to */
export async function putBlob(u8, meta, onPart) {
  const id = nid(), n = Math.max(1, Math.ceil(u8.length / PART)), rec = { id, n, size: u8.length };
  await B.commit([{ op: 'set', path: 'blobs/' + id, data: { ...meta, size: u8.length, n, by: S.user, at: now() } }]);
  let done = 0;
  try { await pool(n, 3, async i => { await B.putBytes(`blobs/${id}/parts/${i}`, u8.subarray(i * PART, (i + 1) * PART)); if (onPart) onPart(++done, n); }); }
  catch (err) { dropBlob(rec); throw err; }
  keepBlob(id, u8);
  return rec;
}
export function getBlob(b, onPart) {
  if (!mem.has(b.id)) {
    const p = (async () => {
      const parts = new Array(b.n); let done = 0;
      await pool(b.n, 4, async i => { const d = await B.getBytes(`blobs/${b.id}/parts/${i}`); if (!d) throw new Error('part of the file is missing'); parts[i] = d; if (onPart) onPart(++done, b.n); });
      const out = new Uint8Array(parts.reduce((s, d) => s + d.length, 0)); let at = 0; for (const d of parts) { out.set(d, at); at += d.length; }
      return out;
    })();
    p.catch(() => mem.delete(b.id)); mem.set(b.id, p);
  }
  return mem.get(b.id);
}
export function blobUrl(b, type) {
  if (!urls.has(b.id)) { const p = getBlob(b).then(u8 => URL.createObjectURL(new Blob([u8], { type }))); p.catch(() => urls.delete(b.id)); urls.set(b.id, p); }
  return urls.get(b.id);
}
export function dropBlob(b) {
  mem.delete(b.id); urls.delete(b.id);
  const ops = [{ op: 'delete', path: 'blobs/' + b.id }]; for (let i = 0; i < b.n; i++) ops.push({ op: 'delete', path: `blobs/${b.id}/parts/${i}` });
  B.commit(ops).catch(() => {});
}
/* a photo from a phone is several megabytes; it is made smaller in the browser before it is stored */
export async function shrinkPhoto(file) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.8, 0.6, 0.4]) {
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    if (b && (b.size < 850000 || q === 0.4)) return new Uint8Array(await b.arrayBuffer());
  }
  throw new Error('the photo could not be read');
}
