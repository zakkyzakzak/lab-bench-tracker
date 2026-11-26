// The Today tab.

import { DB, MIN, S, V, WK, dt, dur, e, isSup, now } from './core.js';
import { fmtV, lowList, stock } from './reagents.js';
import { X } from './protocols.js';
import { fHas, key, runOf, stOf } from './runs.js';
import { dayOf, est, iName, tCard } from './targets.js';
import { dueCard, fitList, sessPanel } from './study.js';

/* ---------------- views ---------------- */
export function runRow(x, t, m, title, pk) {
  const s = runOf(x.id, t, m), k = !s ? 'idle' : s.doneAt ? 'ok' : 'wait';
  const nf = DB.files.filter(f => fHas(f, key(x.id, t, m))).length, nn = s ? s.notes.filter(n => n.mice === 'all' || n.mice.includes(m)).length : 0;
  const txt = !s ? 'To do' : s.doneAt ? `Done ${dt(s.doneAt)} · ${e(s.pname)} ${e(s.label)} rev ${s.rev}` : `On the bench · step ${s.stepIdx + 1} of ${s.steps.length}`;
  return `<div class="item"><span class="pk">${pk || ''}</span><span class="ic ${k}">${k === 'ok' ? '✓' : k === 'wait' ? '◔' : '○'}</span><span class="what">${title}</span><span class="state ${k}">${txt}${nn ? ` · ${nn} deviation${nn > 1 ? 's' : ''} noted` : ''}${nf ? ` · ${nf} result file${nf > 1 ? 's' : ''}` : ''}</span><span class="act"><button class="btn sm" data-a="run" data-x="${x.id}" data-t="${e(t || '')}" data-m="${e(m)}">Open record</button></span></div>`;
}
export function expCount(x, m) { const ts = x.targets || ['']; let d = 0, r = 0, n = 0; for (const t of ts) { const s = stOf(x.id, t, m); if (s === 'na') continue; n++; if (s === 'done') d++; else if (s === 'run') r++; } return { d, r, n }; }
V.today = () => {
  const act = DB.sessions.filter(s => !s.doneAt && X(s.exp));
  const open = act.find(s => s.id === S.openSession);
  const waits = act.filter(s => s.waitStart && s.steps[s.stepIdx].w).map(s => ({ s, left: s.steps[s.stepIdx].m - (now() - s.waitStart) / MIN })).sort((a, b) => b.left - a.left);
  const W = waits.find(q => q.left > 0), F = W ? Math.floor(W.left) : (S.freeMin ?? 60);     // a running hands-free step sets the free time by itself
  const fits = fitList(F, W?.s.exp), soon = act.map(s => ({ s, stp: s.steps[s.stepIdx] })).find(q => q.stp.w && !q.s.waitStart && q.stp.m >= 5);
  const tg = DB.targets.filter(t => t.week === WK && (isSup() || t.user === S.user));
  return `<div class="cols"><div class="stack">
   <div class="card"><h2>On the bench now</h2>${act.length ? `<div class="list">${act.map(s => { const stp = s.steps[s.stepIdx]; return `<div class="item"><span class="pk"></span><span class="ic wait">◔</span><span class="what">${e(X(s.exp).name)} ${e(s.target)} · ${s.mice.length} samples</span><span class="state">Step ${s.stepIdx + 1} of ${s.steps.length}: ${e(stp.t)}${s.waitStart ? ` · <span class="clock" data-until="${s.waitStart + stp.m * MIN}"></span>` : ''}</span><span class="act"><button class="btn sm ${open === s ? '' : 'pri'}" data-a="openSess" data-id="${s.id}">${open === s ? 'Open below' : 'Open'}</button></span></div>`; }).join('')}</div>` : '<div class="hint">Nothing is running. Go to Experiments, tick the samples and start a bench session.</div>'}</div>
   ${open ? sessPanel(open) : ''}
  </div><div class="stack">
   ${lowList().length ? `<div class="card" style="border-color:var(--bad)"><div class="line"><b class="grow">Reagents running low</b><button class="lnk" data-a="tab" data-k="reag">Open Reagents</button></div><div class="sm">${lowList().map(r => e(r.name) + ' (' + fmtV(stock(r).left, r.unit) + ' left)').join(' · ')}</div></div>` : ''}
   ${dueCard()}
   ${W ? `<div class="card waiting"><div class="line"><h2 class="grow">You have ${dur(F)} free</h2><span class="clock" data-until="${W.s.waitStart + W.s.steps[W.s.stepIdx].m * MIN}"></span></div>
    <div class="sm">${e(X(W.s.exp).name)} is hands-free: step ${W.s.stepIdx + 1}, ${e(W.s.steps[W.s.stepIdx].t)}. This fits before it needs you again:</div>
    ${fits.length ? fits.map(f => `<div class="fit"><b>${e(f.t)}</b><span class="m">${dur(f.m)}</span><span class="sub">${e(f.sub)}</span></div>`).join('') : '<div class="hint">Nothing outstanding fits in the time left.</div>'}</div>`
   : `<div class="card"><h2>What fits in a gap</h2>
    ${soon ? `<div class="sm">${e(X(soon.s.exp).name)} is at a hands-free step (${dur(soon.stp.m)}). Start its timer and this card fills in by itself.</div>` : '<div class="hint">When a step is running hands-free, this card shows what fits in the time left without you asking.</div>'}
    <div class="line"><label class="fld" for="freeMin">Or try a gap of</label><input type="number" id="freeMin" min="5" step="5" value="${F}" data-c="free" style="width:84px"><span class="sm muted">minutes</span></div>
    ${fits.length ? fits.map(f => `<div class="fit"><b>${e(f.t)}</b><span class="m">${dur(f.m)}</span><span class="sub">${e(f.sub)}</span></div>`).join('') : '<div class="hint">Nothing outstanding fits in that window.</div>'}</div>`}
   <div class="card"><h2>Backlog</h2>${DB.backlog.map(b => `<label class="line sm"><input type="checkbox" data-c="bl" data-id="${b.id}" ${b.done ? 'checked' : ''}><span class="grow" ${b.done ? 'style="text-decoration:line-through"' : ''}>${e(b.text)}</span><span class="mono">${dur(b.m)}</span><button class="lnk" data-a="blDel" data-id="${b.id}" aria-label="Remove this task">×</button></label>`).join('')}
    <div class="line"><input type="text" id="blText" class="grow" placeholder="Unfinished task, e.g. data analysis" aria-label="Backlog task"><input type="number" id="blMin" value="30" min="5" step="5" style="width:70px" aria-label="Minutes"><button class="btn sm" data-a="addBl">Add</button></div><div class="hint">Only you see your backlog.</div></div>
   ${(() => { const td = (new Date().getDay() + 6) % 7, rows = []; for (const t of tg) { if (t.user !== S.user || t.status !== 'agreed') continue; t.items.forEach((i, k) => { const todo = i.mice.filter(m => stOf(i.exp, i.target, m) === 'todo'), ms = todo.filter(m => dayOf(i, m) === td), ov = todo.filter(m => dayOf(i, m) >= 0 && dayOf(i, m) < td); if (ms.length) rows.push({ t, k, i, ms }); if (ov.length) rows.push({ t, k, i, ms: ov, late: true }); }); } rows.sort((a, b) => !!b.late - !!a.late);
     return rows.length ? `<div class="card"><h2>Planned for today</h2>${rows.map(r => `<div class="line sm"><span class="grow">${r.late ? '<span class="late">Carried over from earlier this week</span><br>' : ''}<b>${e(iName(r.i))}</b> × ${r.ms.length} · about ${dur(est(r.i.exp, r.ms.length))}<br><span class="mono muted">${e(r.ms.join(', '))}</span></span><button class="btn sm pri" data-a="tToday" data-id="${r.t.id}" data-k="${r.k}" ${r.late ? 'data-late="1"' : ''}>Tick these</button></div>`).join('')}<div class="hint">Tick these marks them in this week's target below; then press Start bench session there.</div></div>` : ''; })()}
   <div><h3 style="margin:2px 0 8px">This week's target</h3><div class="stack">${tg.length ? tg.map(t => tCard(t)).join('') : '<div class="card hint">No target agreed for this week. Propose one under Targets.</div>'}</div></div>
  </div></div>`;
};
