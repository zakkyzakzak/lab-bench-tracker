// Lab duties and who holds them each month.

import { $, DB, S, V, allPeople, canLab, dt, e, flag, nameOf, nid, now, safeUrl, sups, toast, users } from './core.js';
import { notice } from './runs.js';
import { driveUpload } from './lab.js';
import { render } from './render.js';

/* ---------------- lab duties ---------------- */
export const labPeople = () => allPeople().filter(u => !sups().includes(u));
export const mKey = off => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
export const mName = k => new Date(k + '-01T12:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const KIND = { monthly: ['info', 'Every month'], asneeded: ['warn', 'As needed'], once: ['', 'Once-off'] };
/* fair shuffle: fewest duties first, then anyone who did not hold this duty last month, then chance */
export function deal(k, prevK) {
  const load = {}, out = {}, prev = DB.rota[prevK] || {}; labPeople().forEach(u => load[u] = 0);
  for (const d of DB.duties.filter(d => d.kind !== 'once').sort((a, b) => b.people - a.people)) { const c = labPeople().map(u => ({ u, s: load[u] * 10 + ((prev[d.id] || []).includes(u) ? 5 : 0) + Math.random() })).sort((a, b) => a.s - b.s).slice(0, d.people).map(q => q.u); out[d.id] = c; c.forEach(u => load[u]++); }
  DB.rota[k] = out;
}
export const holders = (d, k) => d.kind === 'once' ? d.who || [] : (DB.rota[k] || {})[d.id] || [];
const hasRota = k => Object.values(DB.rota[k] || {}).some(a => a && a.length);
const fileLink = f => safeUrl(f.url) ? `<a class="lnk" href="${e(f.url)}" target="_blank" rel="noopener noreferrer">${e(f.name)}</a>` : `<span class="mono">${e(f.name)}</span>`;
V.duties = () => {
  const k = mKey(S.dOff), now0 = S.dOff === 0, me = S.user, open = DB.requests.filter(r => !r.doneAt), cl = canLab(), prevK = mKey(S.dOff - 1);
  const people = us => us.map(u => flag(u === me ? 'ok' : 'info', u === me ? 'You' : users[u].name)).join(' ') || '<span class="sm muted">Nobody yet</span>';
  const reqLine = r => `<div class="line sm" style="border-top:1px solid var(--line);padding-top:6px"><span class="grow"><b>Request:</b> ${e(r.text)} <span class="muted">· ${e(users[r.by].name)}, ${dt(r.at)}</span></span><button class="btn sm" data-a="rqDone" data-id="${r.id}">Mark done</button></div>`;
  const rotated = DB.duties.filter(d => d.kind !== 'once');
  return `<div class="cols"><div class="stack"><div class="line"><h2 class="grow">Duties for ${mName(k)}</h2><select id="dOff" data-c="dOff" aria-label="Month">${[-1, 0, 1].map(o => `<option value="${o}" ${o === S.dOff ? 'selected' : ''}>${mName(mKey(o))}${o === 0 ? ' (now)' : ''}</option>`).join('')}</select></div>
   ${!DB.duties.length ? `<div class="card hint">No duties yet. ${cl ? 'Add the first one on the right.' : 'A supervisor or admin adds them.'}</div>` : ''}
   ${rotated.length && !hasRota(k) ? `<div class="card"><div class="hint">Nobody has been put on a duty for ${mName(k)} yet.${cl ? ' Press Edit on a duty to choose who does it, or start from one of these:' : ' A supervisor or admin does that.'}</div>${cl ? `<div class="line">${hasRota(prevK) ? `<button class="btn pri" data-a="dCopy">Same people as ${mName(prevK)}</button>` : ''}<button class="btn" data-a="dDeal">Deal out at random</button></div>` : ''}</div>` : ''}
   ${DB.duties.map(d => {
    const hs = holders(d, k), log = DB.dutyLog.filter(l => l.duty === d.id && l.month === k), last = log[log.length - 1], mine = hs.includes(me), rq = now0 ? open.filter(r => r.duty === d.id) : [], fs = d.files || [];
    return `<div class="card"><div class="line"><b class="grow">${e(d.name)}</b>${flag(...KIND[d.kind])}${d.people > 1 ? flag('', d.people + ' people') : ''}${cl ? `<button class="btn sm" data-a="dyEdit" data-d="${d.id}">Edit</button>` : ''}</div><div class="line">${people(hs)}</div>
      <div class="sm muted">${d.kind === 'once' ? (d.doneAt ? 'Done ' + dt(d.doneAt) : 'Not done yet. It is not part of the monthly list.') : log.length ? `Ticked ${log.length} time${log.length > 1 ? 's' : ''} this month, last on ${dt(last.at)} by ${e(users[last.by].name)}` : d.kind === 'asneeded' ? 'Done only when someone posts a request.' : 'Not ticked yet this month.'}</div>
      ${d.how || fs.length ? `<details class="sm"><summary>How to do it</summary><div class="stack" style="padding-top:6px;gap:6px">${d.how ? `<div style="white-space:pre-wrap">${e(d.how)}</div>` : ''}${fs.map(f => `<div>${fileLink(f)}</div>`).join('')}</div></details>` : ''}
      ${rq.map(reqLine).join('')}
      ${now0 && mine && !(d.kind === 'once' && d.doneAt) ? `<div class="line"><button class="btn sm pri" data-a="dTick" data-d="${d.id}">${d.kind === 'once' ? 'Mark done' : 'Tick: done today'}</button></div>` : ''}</div>`;
  }).join('')}
   ${now0 && open.filter(r => !r.duty).length ? `<div class="card"><b>General requests</b>${open.filter(r => !r.duty).map(reqLine).join('')}</div>` : ''}</div>
  <div class="stack"><div class="card"><h2>Post a request</h2><label class="sm" for="rqDuty">For which duty</label><select id="rqDuty"><option value="">General, anyone in the lab</option>${DB.duties.filter(d => !(d.kind === 'once' && d.doneAt)).map(d => `<option value="${d.id}" ${d.kind === 'asneeded' ? 'selected' : ''}>${e(d.name)}</option>`).join('')}</select>
    <label class="sm" for="rqText">What is needed</label><textarea id="rqText" rows="2" placeholder="e.g. tips are running low, please autoclave 4 boxes"></textarea>
    <div class="line"><button class="btn pri" data-a="rqPost">Post request</button><span class="err" id="rqErr"></span></div><div class="hint">It goes to whoever holds that duty this month and shows on the duty until someone marks it done.</div></div>
   ${cl ? `<div class="card"><h2>Add a duty</h2><label>Name<input type="text" id="dyName" placeholder="e.g. Clean the water bath"></label>
    <div class="line"><button class="btn" data-a="dyAdd">Add duty</button><span class="err" id="dyErr"></span></div>
    <div class="hint">You then choose how often it is done, who does it, and any instructions or files.</div></div>
   <div class="card"><h2>Who does what</h2><div class="hint">People are put on duties by hand: press <b>Edit</b> on a duty and tick who has it for the month you are looking at. A new month can start from the month before.</div>
    <div class="line">${hasRota(prevK) ? `<button class="btn sm" data-a="dCopy">Use the same people as ${mName(prevK)}</button>` : ''}<button class="btn sm" data-a="dDeal">Deal ${mName(k)} out at random instead</button></div>
    <div class="hint">Dealing at random shares the duties fairly among the ${labPeople().length} people who are not supervisors and avoids giving anyone the same duty two months running. It replaces whoever is on the duties for ${mName(k)}.</div></div>` : `<div class="card"><h2>Who does what</h2><div class="hint">A supervisor or admin puts people on the duties for each month.</div></div>`}</div></div>`;
};

/* ---------------- editing one duty ---------------- */
const v = id => (($('#' + id) || {}).value || '').trim();
/* keep what is typed in the window when it has to be redrawn (a file added or removed) */
function dutySync() {
  const m = S.modal; if (!m || m.type !== 'duty' || !$('#dyeName')) return;
  m.f = { name: v('dyeName'), kind: v('dyeKind'), people: Math.max(1, +v('dyeN') || 1), how: ($('#dyeHow') || {}).value || '', who: [...document.querySelectorAll('.dyeWho:checked')].map(c => c.value), files: m.f.files };
}
export function dutyModal(m) {
  const d = DB.duties.find(q => q.id === m.id); if (!d) return '<h2>Lab duty</h2><div class="hint">That duty no longer exists.</div><div class="foot"><button class="btn" data-a="close">Close</button></div>';
  const f = m.f, once = f.kind === 'once', up = !!(DB.lab && DB.lab.uploadUrl);
  return `<h2>${m.fresh ? 'New lab duty' : 'Edit lab duty'}</h2>
    <label>Name<input type="text" id="dyeName" value="${e(f.name)}"></label>
    <div class="rg"><label>How often<select id="dyeKind">${[['monthly', 'Every month'], ['asneeded', 'As needed (when someone asks)'], ['once', 'Once-off']].map(([k, l]) => `<option value="${k}" ${f.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>People needed<input type="number" id="dyeN" value="${f.people}" min="1"></label></div>
    <label>${once ? 'Who does it' : 'Who has it in ' + mName(m.k)}</label>
    <div class="pick">${allPeople().map(u => `<label><input type="checkbox" class="dyeWho" value="${e(u)}" ${f.who.includes(u) ? 'checked' : ''}> ${e(nameOf(u))}</label>`).join('') || '<span class="hint">Nobody is in the lab yet.</span>'}</div>
    <label>Instructions (optional)<textarea id="dyeHow" rows="5" placeholder="Leave empty for a duty that needs no explaining. Otherwise: the steps, where things are kept, who to phone…">${e(f.how)}</textarea></label>
    <label>Files (optional)</label>
    ${f.files.map((x, j) => `<div class="line sm"><span class="grow">${fileLink(x)}</span><button class="btn sm" data-a="dyeFileDel" data-j="${j}">Remove</button></div>`).join('') || '<div class="hint">No files. A form, a photo of the dial, a supplier\'s sheet…</div>'}
    <div class="rg"><label>File name<input type="text" id="dyeFName" placeholder="e.g. Waste collection form"></label><label>Link to the file<input type="url" id="dyeFUrl" placeholder="https://…"></label></div>
    <div class="line"><button class="btn sm" data-a="dyeFileAdd">Add link</button>${up ? `<label class="btn sm" style="cursor:pointer">Upload a file<input type="file" id="dyeUp" hidden></label>` : ''}<span class="err" id="mErr"></span></div>
    <div class="hint">Instructions and files show on the duty under "How to do it". A duty with neither shows just its name and who has it.</div>
    <div class="foot" style="justify-content:flex-start"><button class="btn pri" data-a="dyeSave">Save</button><button class="btn" data-a="${m.fresh ? 'dyeCancelNew' : 'close'}">Cancel</button><span class="sp"></span>${m.fresh ? '' : `<button class="btn" style="background:var(--bad);border-color:var(--bad);color:#fff" data-a="dyDel" data-d="${d.id}">Delete this duty</button>`}</div>`;
}
const openDuty = (d, fresh) => { const k = mKey(S.dOff); S.modal = { type: 'duty', id: d.id, k, fresh: !!fresh, f: { name: d.name, kind: d.kind, people: d.people || 1, how: d.how || '', who: [...holders(d, k)], files: (d.files || []).map(x => ({ ...x })) } }; };
const dropDuty = id => { DB.duties = DB.duties.filter(q => q.id !== id); for (const k in DB.rota) if (DB.rota[k] && id in DB.rota[k]) { const o = { ...DB.rota[k] }; delete o[id]; DB.rota[k] = o; } DB.requests.forEach(r => { if (r.duty === id) r.duty = ''; }); };

document.addEventListener('change', ev => {
  const el = ev.target; if (el.id !== 'dyeUp') return; const f = el.files && el.files[0], m = S.modal; if (!f || !m || m.type !== 'duty') return;
  dutySync(); toast('Uploading ' + f.name + '…');
  driveUpload(f, 'Lab duties', '@lab').then(j => { const cur = S.modal; if (!cur || cur.type !== 'duty' || cur.id !== m.id) return; dutySync(); cur.f.files.push({ name: v('dyeFName') || f.name, url: j.url }); render(); toast(f.name + ' is in the lab\'s Drive folder. Press Save to keep it on the duty.'); },
    err => toast('The upload did not work: ' + (err.message || 'no answer from Drive') + '.'));
});

export const dutyActions = {
  dyAdd: () => { if (!canLab()) return false; const nm = v('dyName'); if (!nm) { $('#dyErr').textContent = 'Give the duty a name.'; return false; } const d = { id: nid(), name: nm, kind: 'monthly', people: 1, at: now() }; DB.duties.push(d); openDuty(d, true); },
  dyEdit: d => { const dy = DB.duties.find(q => q.id === d.d); if (!dy || !canLab()) return false; openDuty(dy); },
  dyeCancelNew: () => { const m = S.modal; if (m && m.type === 'duty') dropDuty(m.id); S.modal = null; },
  dyeFileAdd: () => { dutySync(); const name = v('dyeFName'), url = v('dyeFUrl'), err = t => { $('#mErr').textContent = t; return false; }; if (!name) return err('Give the file a name.'); if (!safeUrl(url)) return err('The link must start with https://'); S.modal.f.files.push({ name, url }); },
  dyeFileDel: d => { dutySync(); S.modal.f.files.splice(+d.j, 1); },
  dyeSave: () => {
    dutySync(); const m = S.modal, d = DB.duties.find(q => q.id === m.id), f = m.f; if (!d || !canLab()) return false; if (!f.name) { $('#mErr').textContent = 'Give the duty a name.'; return false; }
    const before = holders(d, m.k), was = d.kind;
    d.name = f.name; d.kind = f.kind; d.people = f.people; if (f.how.trim()) d.how = f.how.trim(); else delete d.how; if (f.files.length) d.files = f.files; else delete d.files;
    if (f.kind === 'once') { d.who = f.who; if (was !== 'once') d.doneAt = null; for (const k in DB.rota) if (DB.rota[k] && d.id in DB.rota[k]) { const o = { ...DB.rota[k] }; delete o[d.id]; DB.rota[k] = o; } }
    else { delete d.who; delete d.doneAt; DB.rota[m.k] = { ...(DB.rota[m.k] || {}), [d.id]: f.who }; }
    f.who.filter(u => !before.includes(u)).forEach(u => notice(u, f.kind === 'once' ? `You have a lab duty: ${d.name}.` : `You have the lab duty "${d.name}" for ${mName(m.k)}.`));
    S.modal = null; toast(d.name + ' saved.');
  },
  dyDel: d => { dropDuty(d.d); S.modal = null; toast('Duty deleted.'); },
  dCopy: () => { if (!canLab()) return false; const k = mKey(S.dOff), prev = DB.rota[mKey(S.dOff - 1)] || {}, out = { ...(DB.rota[k] || {}) }; for (const d of DB.duties) if (d.kind !== 'once' && prev[d.id] && !(out[d.id] || []).length) out[d.id] = [...prev[d.id]]; DB.rota[k] = out; toast(mName(k) + ' now has the same people as ' + mName(mKey(S.dOff - 1)) + '. Edit any duty to change them.'); },
  dDeal: () => { if (!canLab()) return false; const k = mKey(S.dOff); deal(k, mKey(S.dOff - 1)); toast(mName(k) + ' dealt out at random.'); },
};
export const dutySure = {
  dyDel: d => [`Delete the duty "${(DB.duties.find(q => q.id === d.d) || {}).name || ''}"?`, 'It is removed from every month, with its instructions and file links. Requests posted for it become general requests. This cannot be undone.', 'Delete duty'],
  dDeal: () => [`Deal ${mName(mKey(S.dOff))} out at random?`, 'This replaces whoever is on the duties for that month now.', 'Deal at random'],
};
