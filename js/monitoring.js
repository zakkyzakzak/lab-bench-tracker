// Animal monitoring: weights, tumour size, treatments, doses and the Monitoring tab.

import { DAY, DB, S, V, dt, e, now, wkStart } from './core.js';
import { commit, dayKey } from './sync.js';
import { dty } from './protocols.js';
import { noProj, proj } from './runs.js';
import { anMk, anRec, animals } from './animals.js';
import { gtag, pGroups } from './plan.js';

/* repeats that have come due: a round is due for a sample once the round before it was done long enough ago */
/* ---------------- animal monitoring: weights, tumour size, treatments, doses ---------------- */
export const dayT = d => new Date(d + 'T12:00').getTime(), dayAdd = (d, n) => dayKey(dayT(d) + n * DAY);
export const obsDays = () => DB.obs.filter(o => o.proj === S.project).sort((a, b) => a.id < b.id ? -1 : 1);
const obDoc = (day, mk) => { let o = DB.obs.find(q => q.proj === S.project && q.id === day); if (!o && mk) DB.obs.push(o = { id: day, proj: S.project }); return o; };
const obOf = (day, a) => (obDoc(day) || {})[a];
export const tvol = o => o && o.v && o.v.length === 3 && o.v.every(x => x > 0) ? o.v[0] * o.v[1] * o.v[2] / 2 : null;      // length x width x height / 2
/* the most recent visit, on or before a day, where this animal has a weight ('w') or a full tumour measurement ('v') */
export function lastOb(a, f, day) { const L = obsDays(); for (let i = L.length - 1; i >= 0; i--) { if (day && L[i].id > day) continue; const o = L[i][a]; if (o && (f === 'w' ? o.w > 0 : tvol(o) != null)) return { day: L[i].id, o }; } return null; }
export const txCount = a => obsDays().filter(o => o[a] && o[a].tx === true).length;
const r2 = n => Math.round(n * 100) / 100;
function weekChange(a, day) { const now_ = obOf(day, a), prev = lastOb(a, 'w', dayAdd(day, -5)); if (!now_ || !(now_.w > 0) || !prev) return null; return { pct: (now_.w - prev.o.w) / prev.o.w * 100, from: prev }; }
/* what to draw up for this animal, from its group's drugs and its weight */
function doseLines(a, group, day) {
  const M = proj().mon, ags = ((M.groups || {})[group] || []).map(n => (M.agents || []).find(q => q.name === n)).filter(Boolean); if (!ags.length) return { lines: ['None'] };
  const today = obOf(day, a), w = today && today.w > 0 ? { day, o: today } : lastOb(a, 'w', day); if (!w) return { lines: ['No weight recorded yet'] };
  const g = w.o.w, lines = [], pool = ags.filter(q => !(q.fixed > 0));
  ags.filter(q => q.fixed > 0).forEach(q => lines.push(`${r2(q.per * g)} ${q.unit} ${q.name} in ${q.fixed} µL ${q.dil || 'diluent'}`));
  if (pool.length) { const sum = pool.reduce((s, q) => s + q.per * g, 0), tot = M.total || 0; lines.push(pool.map(q => `${r2(q.per * g)} ${q.unit} ${q.name}`).join(' + ') + (tot ? ` + ${r2(tot - sum)} µL ${pool[0].dil || 'diluent'} (to ${tot} µL)` : '')); }
  return { lines, w };
}
function obCells(a, day) {
  const o = obOf(day, a) || {}, v = tvol(o), ch = weekChange(a, day), al = proj().mon.alert || 15, prev = lastOb(a, 'w', dayAdd(day, -1)), odd = o.w > 0 && prev && (o.w > prev.o.w * 1.6 || o.w < prev.o.w * 0.6);
  return { vol: v != null ? String(Math.round(v * 10) / 10) : (o.vn ? e(o.vn) : ''), pct: ch ? `<span class="${Math.abs(ch.pct) > al ? 'err' : ''}">${ch.pct > 0 ? '+' : ''}${ch.pct.toFixed(1)}%</span>` : '', odd, prev };
}
export function obChange(el) {
  const a = el.dataset.an, f = el.dataset.f, day = S.monDay || dayKey(now()), doc = obDoc(day, true), o = doc[a] = doc[a] || {}, t = el.value.trim(), n = +t.replace(',', '.');
  if (f === 'w') { delete o.w; delete o.wn; if (t) { if (isFinite(n) && n > 0) o.w = n; else o.wn = t; } }
  else if (f === 'c') { if (t) o.c = t; else delete o.c; }
  else if (f === 'tx') { if (t === 'y') o.tx = true; else if (t === 'n') o.tx = false; else delete o.tx; }
  else { const i = +f.slice(1); o.v = o.v || [0, 0, 0]; if (i === 0) delete o.vn; if (t && !(isFinite(n) && n >= 0)) { if (i === 0) o.vn = t; o.v[i] = 0; } else o.v[i] = t ? n : 0; if (!o.v.some(x => x > 0)) delete o.v; }
  if (!Object.keys(o).length) delete doc[a];
  commit();
  const tr = el.closest('tr'), c = obCells(a, day); if (tr) { tr.querySelector('.ob-vol').innerHTML = c.vol; tr.querySelector('.ob-pct').innerHTML = c.pct; const wi = tr.querySelector('[data-f=w]'); wi.classList.toggle('odd', !!c.odd); wi.title = c.odd ? `Check this: the last weight was ${c.prev.o.w} g` : ''; }
}
function csvRows(text) { const rows = []; let row = [], cur = '', q = false; for (let i = 0; i < text.length; i++) { const ch = text[i]; if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; } else cur += ch; } if (cur || row.length) { row.push(cur); rows.push(row); } return rows; }
export function monImport(text, snap) {
  const rows = csvRows(text), hi = rows.findIndex(r => r.some(c => /mouse|animal/i.test(c)) && r.some(c => /weight/i.test(c))); if (hi < 0) throw new Error('it has no "Mouse ID" and "Weight" columns');
  const H = rows[hi].map(c => c.toLowerCase()), ci = re => H.findIndex(c => re.test(c)), C = { ts: ci(/timestamp/), d: H.findIndex(c => c.trim() === 'date'), m: ci(/mouse|animal/), w: ci(/weight/), v1: ci(/v1/), v2: ci(/v2/), v3: ci(/v3/), tx: ci(/treated/), end: ci(/terminat/), c: ci(/comment/) };
  const byNo = new Map(animals().map(a => [parseInt(a.id.replace(/\D/g, ''), 10), a.id])), pd = s => { s = String(s || '').trim(); let m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
  const num = s => { const n = +String(s || '').trim().replace(',', '.'); return String(s || '').trim() && isFinite(n) ? n : null; }, txt = s => String(s || '').trim();
  let done = 0, skip = 0; const days = new Set(), seen = new Set();
  for (const r of rows.slice(hi + 1)) {
    const a = byNo.get(parseInt(txt(r[C.m]).replace(/\D/g, ''), 10)); let day = pd(C.d >= 0 && txt(r[C.d]) ? r[C.d] : r[C.ts]); if (!txt(r[C.m])) continue; if (!a || !day) { skip++; continue; }
    if (snap) { const wd = new Date(day + 'T12:00').getDay(); if (wd === 2) day = dayAdd(day, -1); else if (wd === 4) day = dayAdd(day, 1); }
    const doc = obDoc(day, true), o = doc[a] = doc[a] || {}, w = txt(r[C.w]), v = [r[C.v1], r[C.v2], r[C.v3]].map(num), tx = txt(r[C.tx]).toLowerCase(), cm = txt(r[C.c]);
    if (w) { if (num(w) > 0) o.w = num(w); else o.wn = w; } if (v.some(x => x > 0)) o.v = v.map(x => x || 0); else if (txt(r[C.v1]) && num(r[C.v1]) == null) o.vn = txt(r[C.v1]);
    if (tx === 'yes') o.tx = true; else if (tx === 'no' && o.tx !== true) o.tx = false; if (cm) o.c = o.c && o.c !== cm ? o.c + '; ' + cm : cm;
    if (C.end >= 0 && txt(r[C.end]).toLowerCase() === 'yes') { const rec = anMk(a); if (!rec.end || rec.end < day) rec.end = day; }
    if (!Object.keys(o).length) delete doc[a]; done++; days.add(day); seen.add(a);
  }
  return `Imported ${done} rows for ${seen.size} animals over ${days.size} visit days${skip ? `; ${skip} rows skipped because the animal or the date could not be matched` : ''}.`;
}
V.monitor = () => {
  if (!proj()) return noProj(); const p = proj(), M = p.mon;
  if (!M || !M.on) return `<div class="card"><h2>Animal monitoring</h2><div class="hint">For studies with live animals: weights, tumour measurements, treatments and dose sheets for each visit. It is off for this study, and nothing is in it yet.</div>
    <ol class="sm" style="margin:0;padding-left:20px;display:grid;gap:4px"><li>Switch it on below.</li><li>Under <b>Setup and import</b>, type the drugs and tick which group gets which.</li><li>To bring in what you already recorded, open your sheet's raw data tab in Google Sheets, choose <b>File &gt; Download &gt; Comma-separated values (.csv)</b>, then choose that file under <b>Setup and import</b>. Mouse 7 in the sheet becomes ${e((animals().find(a => parseInt(a.id.replace(/\D/g, ''), 10) === 7) || animals()[0] || { id: 'M07' }).id)} here.</li></ol>
    <div class="line"><button class="btn pri" data-a="monOn">Switch on for ${e(p.name)}</button></div></div>`;
  const view = S.monView || 'entry', today = dayKey(now()), day = S.monDay || today, A = animals(), alive = a => { const r = anRec(a.id); return !(r && r.end && r.end < day); };
  const nav = `<div class="line"><div class="chips grow">${[['entry', 'Record a visit'], ['weeks', 'Weekly weights'], ['doses', 'Dose sheet'], ['status', 'Status'], ['setup', 'Setup and import']].map(([k, l]) => `<button class="chip ${view === k ? 'view' : ''}" data-a="monView" data-k="${k}">${l}</button>`).join('')}</div>${view === 'entry' || view === 'doses' ? `<button class="btn sm" data-a="monStep" data-n="-1" aria-label="Previous visit day">←</button><label class="fld" for="monDay">Day<input type="date" id="monDay" data-c="monDay" value="${day}" max="${today}"></label><button class="btn sm" data-a="monStep" data-n="1" aria-label="Next visit day" ${day >= today ? 'disabled' : ''}>→</button>` : ''}</div>`;
  let body = '';
  if (view === 'entry') {
    const row = a => { const o = obOf(day, a.id) || {}, c = obCells(a.id, day), rec = anRec(a.id), dead = !alive(a), pw = lastOb(a.id, 'w', dayAdd(day, -1)), inp = (f, v, w, ph) => `<input type="text" inputmode="decimal" data-c="ob" data-an="${e(a.id)}" data-f="${f}" value="${e(v ?? '')}" style="width:${w}px" ${ph ? `placeholder="${ph}"` : ''} aria-label="${f} for ${e(a.id)}" ${dead ? 'disabled' : ''}>`;
      return `<tr class="${dead ? 'gone' : ''}"><td class="mono">${e(a.id)}</td><td class="g">${gtag(a.group)}</td><td class="g">${pw ? pw.o.w + ' g <span class="muted">' + dt(dayT(pw.day)) + '</span>' : ''}</td>
       <td>${inp('w', o.w ?? o.wn, 70)}</td><td>${inp('v0', o.v ? o.v[0] || '' : o.vn, 60)}</td><td>${inp('v1', o.v ? o.v[1] || '' : '', 60)}</td><td>${inp('v2', o.v ? o.v[2] || '' : '', 60)}</td><td class="ob-vol">${c.vol}</td><td class="ob-pct">${c.pct}</td>
       <td><select data-c="ob" data-an="${e(a.id)}" data-f="tx" aria-label="Treated, ${e(a.id)}" ${dead ? 'disabled' : ''}><option value=""></option><option value="y" ${o.tx === true ? 'selected' : ''}>Yes</option><option value="n" ${o.tx === false ? 'selected' : ''}>No</option></select> <span class="muted sm">${txCount(a.id)}/${M.tx || 0}</span></td>
       <td style="text-align:left"><input type="text" data-c="ob" data-an="${e(a.id)}" data-f="c" value="${e(o.c || '')}" style="width:220px" aria-label="Comment for ${e(a.id)}" ${dead ? 'disabled' : ''}></td>
       <td>${rec && rec.end ? `<span class="sm muted">Ended ${dt(dayT(rec.end))}</span> <button class="lnk sm" data-a="anUnend" data-an="${e(a.id)}">undo</button>` : `<button class="btn sm" data-a="anEnd" data-an="${e(a.id)}">End</button>`}</td></tr>`; };
    body = `<div class="hint">Type what you measured for ${dty(dayT(day))}. Each box saves as you leave it. If an animal cannot be weighed or the tumour is too small to measure, type the reason in the box instead of a number.</div>
     <div class="scroll" style="max-height:72vh;overflow:auto"><table class="mx mon"><thead><tr><th>Animal</th><th>Group</th><th>Last weight</th><th>Weight (g)</th><th>Length</th><th>Width</th><th>Height (mm)</th><th>Volume (mm³)</th><th>In a week</th><th>Treated</th><th>Comment</th><th></th></tr></thead>
     <tbody>${A.filter(alive).map(row).join('')}${A.filter(a => !alive(a)).map(row).join('')}</tbody></table></div>`;
  } else if (view === 'weeks') {
    const L = obsDays(); if (!L.length) body = '<div class="hint">No visits recorded yet.</div>'; else {
      const w0 = wkStart(dayT(L[0].id)), w1 = wkStart(dayT(L[L.length - 1].id)), weeks = []; for (let w = w0; w <= w1 + DAY; w += 7 * DAY) weeks.push(wkStart(w + DAY / 2));
      const wOf = (a, w) => { let v = null; for (const o of L) { const t = dayT(o.id); if (t >= w && t < w + 7 * DAY && o[a] && o[a].w > 0) v = o[a].w; } return v; }, al = M.alert || 15;
      body = `<div class="hint">The last weight recorded in each week, and the change from the last week that has a weight. Changes of more than ${al}% are red.</div><div class="scroll" style="max-height:72vh;overflow:auto"><table class="mx"><thead><tr><th>Animal</th><th>Group</th>${weeks.map(w => `<th>${dt(w)}</th>`).join('')}</tr></thead><tbody>${A.map(a => { let prev = null; return `<tr><td class="mono">${e(a.id)}</td><td class="g">${gtag(a.group)}</td>${weeks.map(w => { const v = wOf(a.id, w); if (v == null) return '<td class="g"></td>'; const pc = prev ? (v - prev) / prev * 100 : null; prev = v; return `<td>${v}${pc != null ? ` <span class="sm ${Math.abs(pc) > al ? 'err' : 'muted'}">${pc > 0 ? '+' : ''}${pc.toFixed(1)}%</span>` : ''}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>`; }
  } else if (view === 'doses') {
    body = (M.agents || []).length ? `<div class="hint">What to draw up on ${dty(dayT(day))}, from each animal's group and weight. If it was not weighed that day, the last weight is used and the date is shown.</div><div class="scroll" style="max-height:72vh;overflow:auto"><table class="mx"><thead><tr><th>Animal</th><th>Group</th><th>Weight used</th><th>Treatments</th><th style="text-align:left">Draw up</th></tr></thead><tbody>${A.filter(alive).map(a => { const d = doseLines(a.id, a.group, day); return `<tr><td class="mono">${e(a.id)}</td><td class="g">${gtag(a.group)}</td><td>${d.w ? d.w.o.w + ' g' + (d.w.day !== day ? ' <span class="sm muted">from ' + dt(dayT(d.w.day)) + '</span>' : '') : ''}</td><td>${txCount(a.id)}/${M.tx || 0}</td><td style="text-align:left;white-space:normal">${d.lines.map(e).join('<br>')}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="hint">No drugs are set up yet. Add them under Setup and import, and tick which group gets which.</div>';
  } else if (view === 'status') {
    body = `<div class="scroll"><table class="mx"><thead><tr><th>Animal</th><th>Group</th><th>Status</th><th>Treatments</th><th>First treatment</th><th>Last weight</th><th>Last tumour volume</th></tr></thead><tbody>${A.map(a => { const r = anRec(a.id), n = txCount(a.id), ft = obsDays().find(o => o[a.id] && o[a.id].tx === true), lw = lastOb(a.id, 'w'), lv = lastOb(a.id, 'v'); return `<tr><td><button class="lnk mono" data-a="goAnimal" data-an="${e(a.id)}">${e(a.id)}</button></td><td class="g">${gtag(a.group)}</td><td>${r && r.end ? 'Ended ' + dt(dayT(r.end)) + (r.why ? ' · ' + e(r.why) : '') : 'Alive'}</td><td>${n} of ${M.tx || 0}${M.tx ? ' · ' + Math.max(0, M.tx - n) + ' left' : ''}</td><td>${ft ? dt(dayT(ft.id)) : ''}</td><td>${lw ? lw.o.w + ' g · ' + dt(dayT(lw.day)) : ''}</td><td>${lv ? Math.round(tvol(lv.o)) + ' mm³ · ' + dt(dayT(lv.day)) : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  } else {
    const G = pGroups(), ag = M.agents || [];
    body = `<div class="cols even"><div class="stack"><h3>Rules for this study</h3>
      <div class="rg"><label>Treatments planned per animal<input type="number" data-c="monCfg" data-f="tx" value="${M.tx || ''}" min="0"></label><label>Flag a weekly weight change above (%)<input type="number" data-c="monCfg" data-f="alert" value="${M.alert || ''}" min="0"></label><label>Make each mixed injection up to (µL)<input type="number" data-c="monCfg" data-f="total" value="${M.total || ''}" min="0"></label></div>
      <h3>Drugs and how much per gram of body weight</h3>
      ${ag.map((q, i) => `<div class="line agrow"><input type="text" data-c="monAg" data-i="${i}" data-f="name" value="${e(q.name)}" placeholder="Drug" style="flex:1 1 130px" aria-label="Drug name"><input type="number" data-c="monAg" data-i="${i}" data-f="per" value="${q.per || ''}" step="any" min="0" style="width:76px" aria-label="Amount per gram"><select data-c="monAg" data-i="${i}" data-f="unit" aria-label="Unit"><option ${q.unit === 'µL' ? 'selected' : ''}>µL</option><option ${q.unit === 'mg' ? 'selected' : ''}>mg</option></select><span class="sm muted">per g, in</span><input type="text" data-c="monAg" data-i="${i}" data-f="dil" value="${e(q.dil || '')}" placeholder="Diluent" style="width:96px" aria-label="Diluent"><input type="number" data-c="monAg" data-i="${i}" data-f="fixed" value="${q.fixed || ''}" min="0" style="width:76px" title="Fill in only if this drug is its own injection in a fixed volume of diluent, in µL. Leave empty to mix it into the made-up injection." aria-label="Fixed diluent volume in µL"><button class="btn sm" data-a="monAgDel" data-i="${i}">Remove</button></div>`).join('')}
      <div class="line"><button class="btn sm" data-a="monAgAdd">Add a drug</button><span class="sm muted">The last number is only for a drug given as its own injection in a fixed volume of diluent (µL).</span></div>
      ${ag.length && G.length ? `<h3>Which group gets which drug</h3><div class="scroll"><table class="mx"><thead><tr><th>Group</th>${ag.map(q => `<th>${e(q.name)}</th>`).join('')}</tr></thead><tbody>${G.map(g => `<tr><td>${gtag(g)}</td>${ag.map(q => `<td><input type="checkbox" data-c="monGrp" data-g="${e(g)}" data-n="${e(q.name)}" ${((M.groups || {})[g] || []).includes(q.name) ? 'checked' : ''} aria-label="${e(g + ' gets ' + q.name)}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}</div>
     <div class="stack"><h3>Bring in an existing sheet</h3><div class="hint">Export the sheet's raw data tab as CSV (File, Download, Comma-separated values) and choose it here. It needs columns for the mouse or animal number, weight, the three tumour measurements, treated, terminated and comments, plus a date or timestamp. Animals are matched by number: 7 in the sheet is ${e((A.find(a => parseInt(a.id.replace(/\\D/g, ''), 10) === 7) || A[0] || { id: 'M07' }).id)} here.</div>
      <label class="ck sm"><input type="checkbox" id="monSnap" checked> Move Tuesday visits to Monday and Thursday visits to Friday</label>
      <div class="line"><label class="btn" style="cursor:pointer">Choose the CSV file<input type="file" id="monFile" accept=".csv,text/csv" hidden></label></div>
      <div class="hint">Importing again does not double anything up: a row for the same animal and day is merged.</div>
      <h3>Switch off</h3><div class="line"><button class="btn sm" data-a="monOff">Switch monitoring off for this study</button></div></div></div>`;
  }
  return `<div class="stack"><div class="card">${nav}${body}</div></div>`;
};
