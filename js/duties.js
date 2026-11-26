// Lab duties and the monthly rota.

import { DB, S, V, allPeople, canLab, dt, e, flag, sups, users } from './core.js';

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
V.duties = () => {
  const k = mKey(S.dOff), dealt = !!DB.rota[k], now0 = S.dOff === 0, me = S.user, open = DB.requests.filter(r => !r.doneAt), cl = canLab();
  const people = us => us.map(u => flag(u === me ? 'ok' : 'info', u === me ? 'You' : users[u].name)).join(' ') || '<span class="sm muted">Nobody yet</span>';
  const reqLine = r => `<div class="line sm" style="border-top:1px solid var(--line);padding-top:6px"><span class="grow"><b>Request:</b> ${e(r.text)} <span class="muted">· ${e(users[r.by].name)}, ${dt(r.at)}</span></span><button class="btn sm" data-a="rqDone" data-id="${r.id}">Mark done</button></div>`;
  const rotated = DB.duties.filter(d => d.kind !== 'once');
  return `<div class="cols"><div class="stack"><div class="line"><h2 class="grow">Duties for ${mName(k)}</h2><select id="dOff" data-c="dOff" aria-label="Month">${[-1, 0, 1].map(o => `<option value="${o}" ${o === S.dOff ? 'selected' : ''}>${mName(mKey(o))}${o === 0 ? ' (now)' : ''}</option>`).join('')}</select></div>
   ${!DB.duties.length ? `<div class="card hint">No duties yet. ${cl ? 'Add the first one on the right.' : 'A supervisor or admin adds them.'}</div>` : ''}
   ${dealt || !rotated.length ? '' : `<div class="card"><div class="hint">${mName(k)} has not been dealt out yet.</div>${cl ? `<div class="line"><button class="btn pri" data-a="dDeal">Deal out ${mName(k)}</button></div>` : '<div class="hint">A supervisor or admin deals the duties out.</div>'}</div>`}
   ${DB.duties.filter(d => dealt || d.kind === 'once').map(d => {
    const hs = holders(d, k), log = DB.dutyLog.filter(l => l.duty === d.id && l.month === k), last = log[log.length - 1], mine = hs.includes(me), rq = now0 ? open.filter(r => r.duty === d.id) : [];
    return `<div class="card"><div class="line"><b class="grow">${e(d.name)}</b>${flag(...KIND[d.kind])}${d.people > 1 ? flag('', d.people + ' people') : ''}</div><div class="line">${people(hs)}</div>
      <div class="sm muted">${d.kind === 'once' ? (d.doneAt ? 'Done ' + dt(d.doneAt) : 'Not done yet. It is not part of the monthly rotation.') : log.length ? `Ticked ${log.length} time${log.length > 1 ? 's' : ''} this month, last on ${dt(last.at)} by ${e(users[last.by].name)}` : d.kind === 'asneeded' ? 'Done only when someone posts a request.' : 'Not ticked yet this month.'}</div>
      ${rq.map(reqLine).join('')}
      ${now0 && mine && !(d.kind === 'once' && d.doneAt) ? `<div class="line"><button class="btn sm pri" data-a="dTick" data-d="${d.id}">${d.kind === 'once' ? 'Mark done' : 'Tick: done today'}</button></div>` : ''}</div>`;
  }).join('')}
   ${now0 && open.filter(r => !r.duty).length ? `<div class="card"><b>General requests</b>${open.filter(r => !r.duty).map(reqLine).join('')}</div>` : ''}</div>
  <div class="stack"><div class="card"><h2>Post a request</h2><label class="sm" for="rqDuty">For which duty</label><select id="rqDuty"><option value="">General, anyone in the lab</option>${DB.duties.filter(d => !(d.kind === 'once' && d.doneAt)).map(d => `<option value="${d.id}" ${d.kind === 'asneeded' ? 'selected' : ''}>${e(d.name)}</option>`).join('')}</select>
    <label class="sm" for="rqText">What is needed</label><textarea id="rqText" rows="2" placeholder="e.g. tips are running low, please autoclave 4 boxes"></textarea>
    <div class="line"><button class="btn pri" data-a="rqPost">Post request</button><span class="err" id="rqErr"></span></div><div class="hint">It goes to whoever holds that duty this month and shows on the duty until someone marks it done.</div></div>
   ${cl ? `<div class="card"><h2>Add a duty</h2><div class="rg"><label>Name<input type="text" id="dyName" placeholder="e.g. Clean the water bath"></label><label>How often<select id="dyKind"><option value="monthly">Every month, rotated</option><option value="asneeded">As needed, rotated</option><option value="once">Once-off</option></select></label><label>People needed<input type="number" id="dyN" value="1" min="1" max="${Math.max(1, labPeople().length)}"></label></div>
    <div class="line"><button class="btn" data-a="dyAdd">Add duty</button><span class="err" id="dyErr"></span></div>
    <div class="hint">A rotated duty is dealt out now for this month and then joins each monthly deal. A once-off duty is dealt out once and closes when it is marked done.</div></div>` : ''}
   <div class="card"><h2>How the deal works</h2><div class="hint">Duties are dealt at random, but fairly: the person with the fewest duties gets the next one, and where it can be avoided nobody holds the same duty two months running. ${labPeople().length} ${labPeople().length === 1 ? 'person is' : 'people are'} in the rotation; supervisors are not. Supervisors and admins add duties and deal them out.</div>
    ${cl && dealt && S.dOff >= 0 ? `<div class="line"><button class="btn sm" data-a="dDeal">Deal ${mName(k)} again</button></div>` : ''}</div></div></div>`;
};
