// Samples and animals: the Samples tab and each animal's profile.

import { DB, S, V, dt, e, flag, nameOf, safeUrl } from './core.js';
import { dty } from './protocols.js';
import { noProj, proj, projExps, stOf } from './runs.js';
import { expCount, runRow } from './today.js';
import { dayT, lastOb, tvol, txCount } from './monitoring.js';
import { gtag, sType } from './plan.js';
import { addBtn, fileRow, photoSquares } from './photos.js';

export function mouseRows() {
  const ms = proj().samples.filter(m => (m.id + ' ' + m.group).toLowerCase().includes(S.q.toLowerCase())), xs = projExps(); const gs = [...new Set(ms.map(m => m.group))];
  return gs.map(g => { const r = ms.filter(m => m.group === g); return `<div class="grp"><span>${e(g || 'No group')}</span><span>${r.length}</span></div>` + r.map(m => {
    let d = 0, n = 0, run = 0; xs.forEach(x => { const c = expCount(x, m.id); d += c.d; n += c.n; run += c.r; });
    return `<button class="row ${S.selMouse === m.id ? 'sel' : ''}" data-a="selMouse" data-m="${e(m.id)}"><span class="nm mono">${e(m.id)}</span><span class="meta">${e(m.group)}</span>${run ? flag('warn', 'On the bench') : (n ? flag(d === n ? 'ok' : '', d + ' of ' + n) : flag('', 'Held'))}</button>`;
  }).join(''); }).join('') || `<div class="hint" style="padding:12px">${proj().samples.length ? 'No sample matches.' : 'No samples yet. Add them under Study plan.'}</div>`;
}
const anId = sid => String(sid).split(' ')[0];
export function animals() { const m = new Map(); for (const s of proj().samples) { const a = anId(s.id); if (!m.has(a)) m.set(a, { id: a, group: s.group, samples: [] }); m.get(a).samples.push(s); } return [...m.values()]; }
export const anRec = a => DB.animals.find(q => q.proj === S.project && q.id === a);
export const anMk = a => { let r = anRec(a); if (!r) DB.animals.push(r = { id: a, proj: S.project, files: [] }); return r; };
const byAnimal = () => !S.mAll && animals().length < proj().samples.length;
const mToggle = () => animals().length < proj().samples.length ? `<div class="chips"><button class="chip ${byAnimal() ? 'view' : ''}" data-a="mBy" data-k="">By animal or donor</button><button class="chip ${byAnimal() ? '' : 'view'}" data-a="mBy" data-k="1">Every sample</button></div>` : '';
/* shown wherever a file can be attached: uploads go to the study's Google Drive folder once that is switched on */
export const upBtn = id => DB.lab && DB.lab.uploadUrl && proj() ? `<label class="btn sm" style="cursor:pointer">Upload a file<input type="file" id="${id}" hidden></label>` : '';
function animalView() {
  const xs = projExps(), L = animals().filter(a => (a.id + ' ' + a.group).toLowerCase().includes((S.q || '').toLowerCase())), a = animals().find(q => q.id === S.selAnimal);
  const cnt = an => { let d = 0, n = 0, r = 0; an.samples.forEach(m => xs.forEach(x => { const c = expCount(x, m.id); d += c.d; n += c.n; r += c.r; })); return { d, n, r }; };
  const list = L.map(an => { const c = cnt(an), rec = anRec(an.id); return `<button class="row ${S.selAnimal === an.id ? 'sel' : ''}" data-a="selAnimal" data-an="${e(an.id)}"><span class="nm mono">${e(an.id)}</span><span class="meta">${e(an.group || 'No group')} · ${an.samples.length} sample${an.samples.length === 1 ? '' : 's'}</span>${rec && rec.end ? flag('', 'Ended') : c.r ? flag('warn', 'On the bench') : c.n ? flag(c.d === c.n ? 'ok' : '', c.d + ' of ' + c.n) : flag('', 'Stored')}</button>`; }).join('') || '<div class="hint" style="padding:12px">Nothing matches.</div>';
  let det = '<div class="empty">Choose an animal or donor on the left to see its profile: photos, the samples taken from it, and how far each experiment is.</div>';
  if (a) {
    const c = cnt(a), rec = anRec(a.id) || { files: [] }, mon = proj().mon && proj().mon.on, lw = mon && lastOb(a.id, 'w'), lv = mon && lastOb(a.id, 'v');
    det = `<div class="hdr"><button class="back" data-a="back">← All animals</button><div class="anhead"><div class="stack" style="gap:6px"><div class="name"><span class="mono">${e(a.id)}</span>${gtag(a.group)}${rec.end ? flag('', 'Ended ' + dty(new Date(rec.end + 'T12:00').getTime())) : ''}</div>
      <div class="who">${e(proj().name)} · ${a.samples.length} sample${a.samples.length === 1 ? '' : 's'} · ${c.d} of ${c.n} runs done${rec.end && rec.why ? ' · ' + e(rec.why) : ''}</div>
      ${mon ? `<div class="who">${lw ? 'Last weight ' + lw.o.w + ' g on ' + dty(dayT(lw.day)) : 'No weight recorded'}${lv ? ' · last tumour volume ' + Math.round(tvol(lv.o)) + ' mm³ on ' + dty(dayT(lv.day)) : ''} · ${txCount(a.id)} of ${proj().mon.tx || 0} treatments · <button class="lnk" data-a="tab" data-k="monitor">Open Monitoring</button></div>` : ''}
      <div class="line"><button class="btn sm" data-a="anData" data-an="${e(a.id)}">Associated data</button></div></div>${photoSquares(rec)}</div></div>
     <div class="body">
      <div class="card"><div class="line"><h2 class="grow">Photos and files</h2>${addBtn()}</div>
       ${rec.files.map(fileRow).join('') || '<div class="hint">No photos or files yet. Add photo or file puts it in this animal\'s folder in the study\'s Google Drive and links it here.</div>'}
       <details class="sm"><summary>Or add a link to a file that is already somewhere else</summary><div class="stack" style="padding-top:8px"><div class="rg"><label>Name<input type="text" id="afName" placeholder="e.g. tumour at harvest"></label><label>Link to the file<input type="url" id="afUrl" placeholder="https://drive.google.com/…"></label></div>
       <div class="line"><button class="btn sm" data-a="anFileAdd">Add link</button><span class="err" id="afErr"></span></div></div></details></div>
      <div class="card"><h2>Samples from ${e(a.id)}</h2>${xs.length ? `<div class="scroll"><table class="mx"><thead><tr><th>Sample</th>${xs.map(x => `<th>${e(x.name)}</th>`).join('')}</tr></thead><tbody>${a.samples.map(m => `<tr><td><button class="lnk mono" data-a="goMouse" data-m="${e(m.id)}">${e(sType(m.id) || m.id)}</button></td>${xs.map(x => { const k = expCount(x, m.id); if (!k.n) return '<td class="g" style="text-align:center">–</td>'; return x.targets ? `<td class="${k.d === k.n ? 'done' : k.d || k.r ? 'part' : ''}">${k.d}/${k.n}</td>` : `<td class="${k.d ? 'done' : k.r ? 'run' : ''}">${k.d ? '✓' : k.r ? '◔' : 'to do'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div><div class="hint">Click a sample for its full record. A dash means that experiment is not planned on that sample.</div>` : a.samples.map(m => `<div class="sm mono">${e(m.id)}</div>`).join('')}</div></div>`;
  }
  return `<div class="split ${a ? 'has-sel' : ''}"><aside class="pane-list"><div class="tools">${mToggle()}<input type="search" id="q" placeholder="Search animal or group" aria-label="Search animals" value="${e(S.q)}" data-c="qAn"></div><div class="rows">${list}</div></aside><main class="pane-detail">${det}</main></div>`;
}
V.mice = () => {
  if (!proj()) return noProj();
  if (byAnimal()) return animalView();
  const m = proj().samples.find(q => q.id === S.selMouse), xs = projExps(); let det = '<div class="empty">Choose a sample on the left to see every experiment for it.</div>';
  if (m) {
    let d = 0, n = 0; const cs = xs.map(x => { const c = expCount(x, m.id); d += c.d; n += c.n; return c; });
    det = `<div class="hdr"><button class="back" data-a="back">← All samples</button><div class="name"><span class="mono">${e(m.id)}</span>${gtag(m.group)}</div><div class="who">${e(proj().name)} · ${d} of ${n} runs done</div>
     <div class="chips">${xs.map((x, i) => !cs[i].n ? '' : `<button class="chip ${cs[i].d === cs[i].n ? 'done' : cs[i].d || cs[i].r ? 'part' : ''} ${S.mx === x.id ? 'view' : ''}" data-a="mx" data-x="${x.id}">${e(x.name)}${x.targets ? ' ' + cs[i].d + '/' + cs[i].n : ''}</button>`).join('')}</div></div>
    <div class="body">${n ? '' : '<div class="hint">Nothing is planned on this sample. It is recorded as held, for example in storage.</div>'}${xs.map((x, i) => { const c = cs[i]; if (!c.n) return ''; return `<details class="stage" ${S.mx === x.id || c.r || (!x.targets && !S.mx) ? 'open' : ''}><summary>${e(x.name)} ${c.d === c.n ? flag('ok', 'done') : c.r ? flag('warn', 'on the bench') : ''}<span class="cnt">${c.d} of ${c.n}</span></summary>${(x.targets || ['']).filter(t => stOf(x.id, t, m.id) !== 'na').map(t => runRow(x, t, m.id, e(t || x.name))).join('')}</details>`; }).join('')}</div>`;
  }
  return `<div class="split ${m ? 'has-sel' : ''}"><aside class="pane-list"><div class="tools">${mToggle()}<input type="search" id="q" placeholder="Search sample or group" aria-label="Search samples" value="${e(S.q)}" data-i="q"></div><div class="rows" id="rows">${mouseRows()}</div></aside><main class="pane-detail">${det}</main></div>`;
};
