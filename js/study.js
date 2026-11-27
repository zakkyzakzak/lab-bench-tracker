// Study screens: Timeline, Other projects, Overview with its bench session panel, and Experiments.

import * as B from '../backend.js';
import { DAY, DB, MIN, S, V, WK, dt, dur, e, flag, nameOf, now, sups, users } from './core.js';
import { SRV, byName, canon, commit } from './sync.js';
import { R, fmtV, needML, stock } from './reagents.js';
import { P, X, amt, cur, hands, info, lbl, leaves, maxW, timeTxt, tot, vname } from './protocols.js';
import { noProj, proj, projExps, runOf, sess, stOf } from './runs.js';
import { TS, mdlText, progHTML, tCard, tDone, tN, tName, tState, weekTargetMice } from './targets.js';
import { expCount, runRow } from './today.js';
import { gtag } from './plan.js';
import { palOf } from './render.js';

const xProg = (p, x) => { let d = 0, r = 0, n = 0; for (const m of p.samples) { const c = expCount(x, m.id); d += c.d; r += c.r; n += c.n; } return { name: x.name, d, r, n }; };
const pct = (d, n) => n ? Math.round(d / n * 100) : 0;
const pbar = q => `<div class="pg"><b class="sm">${e(q.name)}</b><span class="sm muted">${q.d} of ${q.n} done${q.r ? ' · ' + q.r + ' on the bench' : ''} · ${pct(q.d, q.n)}%</span><div class="bar two"><i style="width:${q.n ? q.d / q.n * 100 : 0}%"></i><u style="width:${q.n ? q.r / q.n * 100 : 0}%"></u></div></div>`;
V.timeline = () => {
  if (!proj()) return noProj();
  const p = proj(), xs = projExps().map(x => xProg(p, x)), all = xs.reduce((a, q) => ({ d: a.d + q.d, r: a.r + q.r, n: a.n + q.n }), { d: 0, r: 0, n: 0 });
  const ts = DB.targets.filter(t => t.proj === p.id && t.status !== 'change'), people = [...new Set([S.user, ...p.members.filter(u => !sups().includes(u)), ...ts.map(t => t.user)])];
  const weeks = Array.from({ length: 10 }, (_, i) => WK + (i - 3) * 7 * DAY), ST = { met: 'ok', open: 'info', proposed: '', missed: 'bad', explained: 'warn' };
  const cell = (u, w) => ts.filter(t => t.user === u && t.week === w).map(t => { const s = tState(t); return `<span class="flag ${ST[s] || ''}" title="${e(tName(t))} · ${e(TS[s][1])}">${tDone(t)}/${tN(t)}${s === 'proposed' ? ' · waiting' : ''}</span>`; }).join(' ');
  const act = DB.sessions.filter(s => s.proj === p.id && !s.doneAt && X(s.exp)), recent = DB.sessions.filter(s => s.proj === p.id && s.doneAt && s.doneAt > now() - 7 * DAY).sort((a, b) => b.doneAt - a.doneAt).slice(0, 12);
  const wk = ts.filter(t => t.week === WK).sort((a, b) => (b.user === S.user) - (a.user === S.user));
  return `<div class="cols"><div class="stack">
   <div class="card"><div class="line"><h2 class="grow">How far each experiment is</h2><span class="sm muted">${all.d} of ${all.n} runs done · ${pct(all.d, all.n)}%</span></div>
    ${all.n ? `<div class="bar two big"><i style="width:${all.d / all.n * 100}%"></i><u style="width:${all.r / all.n * 100}%"></u></div>` : ''}
    ${xs.filter(q => q.n).map(pbar).join('') || '<div class="hint">No sample has an experiment planned yet. Tick them under Study plan.</div>'}
    <div class="legend"><span><i style="background:var(--accent)"></i>done</span><span><i style="background:var(--warn)"></i>on the bench</span></div></div>
   <div class="card"><h2>Week by week</h2><div class="hint">Each number is samples done out of samples in that person's target for the week. You can see your teammates' targets here, but only they and Prof Kaur can change them.</div>
    <div class="scroll"><table class="mx tl"><thead><tr><th>Who</th>${weeks.map(w => `<th class="${w === WK ? 'now' : ''}">${dt(w)}${w === WK ? '<br><span class="sm">this week</span>' : ''}</th>`).join('')}</tr></thead>
     <tbody>${people.map(u => `<tr><td>${e(nameOf(u))}${u === S.user ? ' <span class="muted">(you)</span>' : ''}</td>${weeks.map(w => `<td class="${w === WK ? 'now' : ''}">${cell(u, w) || '<span class="muted">·</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
   ${progHTML()}
  </div><div class="stack">
   <div class="card"><h2>On the bench in this study</h2>${act.map(s => `<div class="line sm"><span class="grow"><b>${e(nameOf(s.by))}</b> · ${e(X(s.exp).name)} ${e(s.target)} · ${s.mice.length} sample${s.mice.length === 1 ? '' : 's'}</span><span class="muted">step ${s.stepIdx + 1} of ${s.steps.length}</span></div>`).join('') || '<div class="hint">Nobody has a session running.</div>'}</div>
   <div class="card"><h2>Finished in the last 7 days</h2>${recent.map(s => `<div class="line sm"><span class="grow"><b>${e(nameOf(s.by))}</b> · ${e(s.pname)} ${e(s.target)} × ${s.mice.length}</span><span class="muted">${dt(s.doneAt)}</span></div>`).join('') || '<div class="hint">Nothing finished this week yet.</div>'}</div>
   <div><h3 style="margin:2px 0 8px">This week's targets in ${e(p.name)}</h3><div class="stack">${wk.map(t => tCard(t)).join('') || '<div class="card hint">Nobody has a target for this week.</div>'}</div></div>
  </div></div>`;
};
V.others = () => {
  const mine = new Set(DB.projects.map(p => p.id)), L = DB.progress.slice().sort((a, b) => (mine.has(b.id) - mine.has(a.id)) || byName(a, b));
  if (!L.length) return '<div class="card"><h2>Other projects in the lab</h2><div class="hint">No project has shared its progress yet. A project appears here once one of its members has opened the tracker since this page was added.</div></div>';
  return `<div class="stack"><div class="card"><h2>Projects in the lab</h2><div class="hint">Everyone in the lab can see how far each project is: its name, who is in it, and the count of runs done per experiment. Samples, records and results stay inside each project.</div></div>
   <div class="cols even">${L.map(q => { const xs = (q.exps || []).filter(x => x.n), all = xs.reduce((a, x) => ({ d: a.d + x.d, r: a.r + (x.r || 0), n: a.n + x.n }), { d: 0, r: 0, n: 0 });
     return `<div class="card pcard" data-pal="${e(palOf(q))}"><div class="line"><h2 class="grow">${e(q.name)}</h2>${mine.has(q.id) ? flag('info', 'You are in this') : ''}</div>
      <div class="sm muted">${(q.members || []).map(nameOf).map(e).join(', ') || 'No members listed'} · ${q.samples || 0} samples · updated ${dt(q.at || now())}</div>
      ${all.n ? `<div class="line sm"><b class="grow">Overall</b><span class="muted">${all.d} of ${all.n} runs · ${pct(all.d, all.n)}%</span></div><div class="bar two big"><i style="width:${all.d / all.n * 100}%"></i><u style="width:${all.r / all.n * 100}%"></u></div>${xs.map(pbar).join('')}` : '<div class="hint">Nothing planned yet.</div>'}</div>`; }).join('')}</div></div>`;
};
/* each project's progress is kept as a small shared summary so the rest of the lab can see it without opening the project */
let progT = null;
export function syncProgress() {
  clearTimeout(progT); progT = setTimeout(() => {
    if (!S.ready || !S.fb) return; const ops = [];
    for (const p of DB.projects) { if (p.test) continue;   // a test study is not shown to the rest of the lab
      const v = { name: p.name, pal: palOf(p), members: p.members, samples: p.samples.length, exps: p.exps.map(X).filter(Boolean).map(x => xProg(p, x)) }, old = SRV.get('progress/' + p.id), o = old ? { name: old.name, pal: old.pal, members: old.members, samples: old.samples, exps: old.exps } : null;
      if (!o || canon(o) !== canon(v)) ops.push({ op: 'set', path: 'progress/' + p.id, data: { ...v, at: now(), by: S.user } }); }
    if (ops.length) B.commit(ops).catch(() => {});
  }, 2500);
}
export function dueList() {
  const out = [], day0 = t => new Date(t).setHours(0, 0, 0, 0);
  for (const x of projExps()) {
    if (!x.sched || !x.targets) continue;
    for (let k = 1; k < x.targets.length; k++) {
      const t = x.targets[k], pt = x.targets[k - 1], due = [], later = [];
      for (const m of proj().samples) { if (stOf(x.id, t, m.id) !== 'todo' || stOf(x.id, pt, m.id) !== 'done') continue; const at = day0(runOf(x.id, pt, m.id).doneAt) + (x.sched.days || 0) * DAY; (at <= now() ? due : later).push({ m: m.id, at }); }
      if (due.length || later.length) out.push({ x, t, due, later });
    }
  }
  return out;
}
export function dueCard() {
  const L = dueList(); if (!L.length) return '';
  return `<div class="card"><h2>Repeats</h2>${L.map(q => { const first = Math.min(...q.due.map(d => d.at)), next = Math.min(...q.later.map(d => d.at));
    return `<div class="line sm" style="flex-wrap:wrap"><span class="grow"><b>${e(q.x.name)} ${e(q.t)}</b><br>${q.due.length ? `<span style="color:var(--warn)">${q.due.length} sample${q.due.length === 1 ? '' : 's'} due${first < now() - DAY ? ' since ' + dt(first) : ' today'}</span>` : ''}${q.due.length && q.later.length ? ' · ' : ''}${q.later.length ? `<span class="muted">${q.later.length} more from ${dt(next)}</span>` : ''}</span>${q.due.length ? `<button class="btn sm pri" data-a="dueOpen" data-x="${q.x.id}" data-t="${e(q.t)}">Open</button>` : ''}</div>`; }).join('')}</div>`;
}
export function fitList(F, skip) {
  const out = [];
  DB.backlog.filter(b => !b.done && b.m <= F).forEach(b => out.push({ t: b.text, m: b.m, sub: 'Backlog task' }));
  for (const x of projExps()) {
    if (x.id === skip) continue; const p = P(x.proto); if (!p) continue; const steps = cur(leaves(p)[0]).steps;
    let left = 0; for (const m of proj().samples) for (const t of x.targets || ['']) if (stOf(x.id, t, m.id) === 'todo') left++; if (!left) continue;
    const T = tot(steps);
    if (T <= F) out.push({ t: x.name + ': the whole protocol', m: T, sub: left + ' runs still to do' });
    else { let b = 0, i = 0; while (i < steps.length && !(steps[i].w && steps[i].m >= 20)) { b += steps[i].m; i++; }
      if (b && b <= F && i < steps.length) out.push({ t: x.name + ': first part', m: b, sub: `Up to "${lbl(steps[i])}", which then runs hands-free for ${dur(steps[i].m)}` }); }
  }
  return out.sort((a, b) => b.m - a.m).slice(0, 7);
}
/* A protocol can name values to type in for each sample (for example A260/280 and yield). They are kept on the bench session. */
const pFields = pid => ((P(pid) || {}).fields || []).filter(f => f.n);
const resOf = (s, m, f) => ((s.res || {})[m] || {})[f];
export function resTable(s, only) {
  const fs = pFields(s.proto); if (!fs.length) return '';
  return `<div class="stack"><h3>Results to record</h3><div class="scroll"><table class="mx res"><thead><tr><th>Sample</th>${fs.map(f => `<th>${e(f.n)}${f.u ? ' <span class="muted">(' + e(f.u) + ')</span>' : ''}</th>`).join('')}</tr></thead>
   <tbody>${s.mice.filter(m => !only || m === only).map(m => `<tr><td class="mono">${e(m)}</td>${fs.map(f => `<td><input type="text" inputmode="decimal" data-c="res" data-id="${s.id}" data-m="${e(m)}" data-f="${e(f.n)}" value="${e(resOf(s, m, f.n) ?? '')}" aria-label="${e(f.n + ' for ' + m)}"></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="hint">Saved as you leave each box.</div></div>`;
}
export function resChange(el) { const s = sess(el.dataset.id); if (!s) return; s.res = s.res || {}; const r = s.res[el.dataset.m] = s.res[el.dataset.m] || {}, v = el.value.trim(); if (v === '') delete r[el.dataset.f]; else r[el.dataset.f] = isNaN(+v) ? v : +v; if (!Object.keys(r).length) delete s.res[el.dataset.m]; commit(); }
export function sessPanel(s) {
  return `<div class="card"><div class="line"><h2 class="grow">${e(X(s.exp).name)} ${e(s.target)}</h2><span class="flag info mono">${e(s.pname)} ${e(s.label)} rev ${s.rev}</span></div>
  <div class="sm muted">${s.mice.length} samples: ${e(s.mice.join(', '))} · started by ${e(users[s.by].name)}.${P(s.proto)?.ethics ? ' Ethics approval: ' + e(P(s.proto).ethics) + '.' : ''} These steps are a copy taken when the session started, so later protocol edits do not change this record.</div>
  <ol class="steps">${s.steps.map((stp, i) => {
    const c = i < s.stepIdx ? 'done' : i === s.stepIdx ? 'cur' : '';
    const notes = s.notes.filter(n => n.step === i).map(n => `<div class="dev">${n.mice === 'all' ? 'All samples' : e(n.mice.join(', '))}: ${e(n.text)}</div>`).join('');
    const need = needML(stp, s.mice.length), rg = R(stp.reagent); let b = '';
    if (c === 'cur') { if (stp.w && s.waitStart) b = `<span class="clock" data-until="${s.waitStart + stp.m * MIN}"></span><button class="btn sm pri" data-a="stepDone" data-id="${s.id}">Wait finished</button>`;
      else b = (stp.w ? `<button class="btn sm pri" data-a="startWait" data-id="${s.id}">Start timer</button>` : '') + `<button class="btn sm ${stp.w ? '' : 'pri'}" data-a="stepDone" data-id="${s.id}">Done</button>`; }
    return `<li class="${c}"><span class="n">${c === 'done' ? '✓' : i + 1}</span><div class="tx"><b>${e(stp.t)}</b><div class="sm muted">${e(timeTxt(stp))} · ${stp.w ? 'hands-free' : 'hands-on'}${need && rg ? ` · ${e(amt(stp))} · ${fmtV(need, stp.unit)} for this batch${stock(rg).low ? ' · <span class="err">' + e(rg.name) + ' is running low</span>' : ''}` : ''}</div>${info(stp, need && rg).map(t => `<div class="sm muted">${e(t)}</div>`).join('')}${stp.checks.filter(Boolean).map((ck, j) => `<label class="line sm"><input type="checkbox" data-c="tick" data-id="${s.id}" data-k="${i}|${j}" ${s.ticks[i + '|' + j] ? 'checked' : ''}> ${e(ck)}</label>`).join('')}${stp.note ? `<div class="sm muted">Comment: ${e(stp.note)}</div>` : ''}${notes}</div><div class="rt">${b}${c ? `<button class="btn sm" data-a="note" data-id="${s.id}" data-step="${i}">Note a deviation</button>` : ''}</div></li>`;
  }).join('')}</ol>${resTable(s)}</div>`;
}

V.overview = () => {
  if (!proj()) return noProj();
  const xs = projExps(), ms = proj().samples;
  if (!xs.length || !ms.length) return `<div class="card"><h2>${e(proj().name)}</h2><div class="hint">This study has no ${ms.length ? 'experiments' : 'samples'} yet. Add them under Study plan and the grid of every sample against every experiment appears here.</div><div class="line"><button class="btn pri" data-a="tab" data-k="plan">Open Study plan</button></div></div>`;
  const planned = m => xs.some(x => expCount(x, m.id).n), withX = ms.filter(planned), rest = ms.filter(m => !planned(m));   // samples with an experiment planned come first
  const rowOf = m => `<tr><td><button class="lnk mono" data-a="goMouse" data-m="${e(m.id)}">${e(m.id)}</button></td><td class="g">${gtag(m.group)}</td>${xs.map(x => {
    const c = expCount(x, m.id);
    if (!c.n) return '<td class="g" style="text-align:center">–</td>'; if (x.targets) return `<td class="${c.d === c.n ? 'done' : c.d || c.r ? 'part' : ''}">${c.d}/${c.n}</td>`; return `<td class="${c.d ? 'done' : c.r ? 'run' : ''}">${c.d ? '✓' : c.r ? '◔' : ''}</td>`;
  }).join('')}</tr>`;
  return `<div class="stack"><div class="legend"><span><i style="background:var(--ok-soft)"></i>done</span><span><i style="background:var(--warn-soft)"></i>on the bench or partly done</span><span><i style="background:var(--surface)"></i>to do</span><span>Click a sample for its record, or a column heading for that experiment.</span></div>
  <div class="scroll"><table class="mx"><thead><tr><th>Sample</th><th>Group</th>${xs.map(x => `<th><button class="lnk" data-a="goExp" data-x="${x.id}">${e(x.name)}</button></th>`).join('')}</tr>
  <tr><td>${withX.length} of ${ms.length} samples planned</td><td class="g">done</td>${xs.map(x => { let d = 0, n = 0; ms.forEach(m => { const c = expCount(x, m.id); d += c.d; n += c.n; }); return `<td>${d}/${n}</td>`; }).join('')}</tr></thead>
  <tbody>${withX.map(rowOf).join('')}${rest.length ? `<tr><td colspan="${xs.length + 2}" style="text-align:left;background:var(--sunk)"><button class="lnk" data-a="ovRest">${S.ovRest ? 'Hide' : 'Show'} the ${rest.length} sample${rest.length === 1 ? '' : 's'} with no experiment planned</button></td></tr>` + (S.ovRest ? rest.map(rowOf).join('') : '') : ''}</tbody></table></div></div>`;
};

V.exps = () => {
  if (!proj()) return noProj();
  const xs = projExps(), ms = proj().samples; let x = xs.find(q => q.id === S.selExp);
  const list = xs.map(q => { let d = 0; ms.forEach(m => d += expCount(q, m.id).d); let n = 0; ms.forEach(m => n += expCount(q, m.id).n); const p = P(q.proto);
    return `<button class="row ${x === q ? 'sel' : ''}" data-a="selExp" data-x="${q.id}"><span class="nm">${e(q.name)}</span><span class="meta">${dur(tot(cur(leaves(p)[0]).steps))} per batch${q.targets ? ' · ' + q.targets.length + ' targets' : ''}</span>${flag(n && d === n ? 'ok' : '', d + ' of ' + n)}</button>`; }).join('') || '<div class="hint" style="padding:12px">No experiments yet. Add them under Study plan.</div>';
  let det = '<div class="empty">Choose an experiment on the left to see every sample in it.</div>';
  if (x) {
    const p = P(x.proto), lv = leaves(p); if (x.targets && !x.targets.includes(S.selTarget)) S.selTarget = x.targets[0] || ''; const t = x.targets ? S.selTarget : '';
    const node = lv.find(n => n.id === S.variant) || lv[0], steps = cur(node).steps;
    const msx = ms.filter(m => stOf(x.id, t, m.id) !== 'na'), sts = msx.map(m => stOf(x.id, t, m.id)), d = sts.filter(s => s === 'done').length, r = sts.filter(s => s === 'run').length;
    [...S.picked].forEach(id => { if (stOf(x.id, t, id) !== 'todo') S.picked.delete(id); });
    det = `<div class="hdr"><button class="back" data-a="back">← All experiments</button><div class="name">${e(x.name)}${t ? ' <span class="mono">' + e(t) + '</span>' : ''}</div>
     <div class="who">Protocol: <button class="lnk" data-a="goProto" data-p="${p.id}">${e(p.name)} ${e(vname(p, node))} rev ${cur(node).n}</button> · ${dur(tot(steps))} in total · ${dur(hands(steps))} hands-on · longest hands-free stretch ${dur(maxW(steps))}<br>${mdlText(x.id)}</div>
     ${x.targets ? `<div class="chips">${x.targets.map(g => { const dd = ms.filter(m => stOf(x.id, g, m.id) === 'done').length, nn = ms.filter(m => stOf(x.id, g, m.id) !== 'na').length; return `<button class="chip ${nn && dd === nn ? 'done' : dd ? 'part' : ''} ${g === t ? 'view' : ''}" data-a="selT" data-t="${e(g)}">${e(g)} ${dd}/${nn}</button>`; }).join('')}</div>` : ''}</div>
    <div class="body"><div class="todo"><span><b>${d} of ${msx.length} done</b>${r ? ', ' + r + ' on the bench' : ''}. ${S.picked.size} ticked for the next session.</span>
      ${weekTargetMice(x.id, t).length ? `<button class="btn sm" data-a="pickT">Tick this week's target (${weekTargetMice(x.id, t).length})</button>` : ''}<button class="btn sm" data-a="pick25">Tick the next 25</button><button class="btn sm" data-a="pick0">Clear</button>
      ${lv.length > 1 ? `<select id="variant" data-c="variant" aria-label="Protocol variant">${lv.map(n => `<option value="${n.id}" ${n === node ? 'selected' : ''}>${e(vname(p, n))}</option>`).join('')}</select>` : ''}
      <button class="btn sm pri" data-a="start" ${S.picked.size ? '' : 'disabled'}>Start bench session (${S.picked.size})</button></div>
     ${msx.length ? '' : '<div class="hint">No samples are assigned to this yet. Tick them under Study plan.</div>'}<div class="list">${msx.map(m => runRow(x, t, m.id, `<span class="mono">${e(m.id)}</span> ${gtag(m.group)}`, stOf(x.id, t, m.id) === 'todo' ? `<input type="checkbox" data-c="pick" data-m="${e(m.id)}" aria-label="Tick ${e(m.id)}" ${S.picked.has(m.id) ? 'checked' : ''}>` : '')).join('')}</div></div>`;
  }
  return `<div class="split ${x ? 'has-sel' : ''}"><aside class="pane-list"><div class="rows">${list}</div></aside><main class="pane-detail">${det}</main></div>`;
};
