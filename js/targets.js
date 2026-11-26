// Weekly targets: claiming, time estimates, the week load and the Targets tab.

import { DAY, DB, MIN, S, V, WK, dt, dur, e, flag, isSup, nameOf, now, sups, users, wkLabel } from './core.js';
import { P, PR, X, cur, hands, leaves, tot } from './protocols.js';
import { noProj, proj, projExps, runOf, stOf } from './runs.js';

/* ---------------- targets and time estimates ---------------- */
export const iName = i => (X(i.exp)?.name || 'Removed experiment') + (i.target ? ' ' + i.target : '');
export const tN = t => t.items.reduce((a, i) => a + i.mice.length, 0);
export const tName = t => t.items.map(i => iName(i) + ' × ' + i.mice.length).join(', ');
const inWk = (s, w) => s && s.doneAt && s.doneAt >= w && s.doneAt < w + 7 * DAY;
export const tDone = t => t.items.reduce((a, i) => a + i.mice.filter(m => inWk(runOf(i.exp, i.target, m), t.week)).length, 0);
export function tState(t) { if (t.status !== 'agreed') return t.status; if (tDone(t) >= tN(t)) return 'met'; if (now() >= t.week + 7 * DAY) return t.excuse ? 'explained' : 'missed'; return 'open'; }
/* who already has this run in a target of their own (and has not done it yet) */
export const claimOf = (x, t, m) => { if (stOf(x, t, m) !== 'todo') return null; const q = DB.targets.find(q => q.user !== S.user && q.status !== 'change' && q.items.some(i => i.exp === x && i.target === t && i.mice.includes(m))); return q ? q.user : null; };
const first = em => nameOf(em).split(/[\s@.]/)[0];
export const lockFor = u => DB.targets.find(t => t.user === u && tState(t) === 'missed');
export const TS = { proposed: ['info', 'Waiting for Prof Kaur'], change: ['warn', 'Change requested'], met: ['ok', 'Met'], missed: ['bad', 'Missed, no explanation yet'], explained: ['warn', 'Missed, explained'], open: ['info', 'In progress'] };
/* Batch time = protocol time for one sample + b minutes for each extra sample.
   b is fitted from how long finished sessions really took; with no sessions it is a first guess. */
function model(xid) {
  const x = X(xid), p = x && P(x.proto); if (!p) return { a: 0, b: 0, k: 0 };
  const steps = cur(leaves(p)[0]).steps, a = tot(steps); let num = 0, den = 0, k = 0;
  for (const s of DB.sessions) { if (s.proto !== x.proto || !s.doneAt || s.mice.length < 2) continue; const d = (s.doneAt - s.startedAt) / MIN; if (d < a * .5) continue; k++; num += (d - a) * (s.mice.length - 1); den += (s.mice.length - 1) ** 2; }
  return { a, b: k ? Math.max(0, num / den) : hands(steps) * .05, k };
}
export const est = (xid, n) => { if (!n) return 0; const m = model(xid); return m.a + m.b * (n - 1); };
export const mdlText = id => { const m = model(id); return `${e(X(id)?.name || '')}: ${dur(m.a)} for one sample, each extra adds about ${m.b.toFixed(1)} min (${m.k ? 'learned from ' + m.k + ' finished session' + (m.k > 1 ? 's' : '') : 'first guess, no sessions yet'})`; };
export const DAYN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const dayOf = (i, m) => { const d = (i.d || {})[m]; return d >= 0 && d < 7 ? d : -1; };
export const day0 = () => new Date().setHours(0, 0, 0, 0);
/* which day of that week today is: -1 while the week is still to come, 7 once it is over */
export const todayIdx = week => week > WK ? -1 : week < WK ? 7 : (new Date().getDay() + 6) % 7;
/* samples of one experiment already in a target of mine from this week on (and not done): sample -> week */
const myPlanned = (x, g) => { const m = new Map(); for (const t of DB.targets) if (t.user === S.user && t.status !== 'change' && t.week >= WK) for (const i of t.items) if (i.exp === x && i.target === g) for (const q of i.mice) if (stOf(x, g, q) !== 'done') m.set(q, t.week); return m; };
/* Hours per day for a week. Samples the person has placed on a day count on that day; the rest are packed
   into whatever room is left from Monday to Friday. */
function weekLoad(user, week, extra) {
  const its = DB.targets.filter(t => t.user === user && t.week === week && t.status !== 'change').flatMap(t => t.items).concat(extra || []);
  const days = [0, 0, 0, 0, 0, 0, 0], rest = []; let over = false, placed = 0;
  for (const i of its) { const by = {}; let un = 0; for (const m of i.mice) { const d = dayOf(i, m); if (d < 0) un++; else by[d] = (by[d] || 0) + 1; } for (const d in by) { days[d] += est(i.exp, by[d]); placed += by[d]; } if (un) rest.push(est(i.exp, un)); }
  for (const m of rest.sort((a, b) => b - a)) { let d = days.findIndex((x, k) => k < 5 && x + m <= 360); if (d < 0) { d = days.indexOf(Math.min(...days.slice(0, 5))); over = true; } days[d] += m; }
  if (days.some(x => x > 360)) over = true;
  return { days, over, total: days.reduce((a, b) => a + b, 0), placed, loose: rest.length };
}
function loadHTML(L) { return `<div class="days">${L.days.map((m, i) => i > 4 && !m ? '' : `<div class="${m > 360 ? 'ov' : ''}"><span>${DAYN[i]}</span><div class="bar"><i style="width:${Math.min(100, m / 360 * 100)}%"></i></div><span class="mono">${m ? dur(m) : 'free'}</span></div>`).join('')}</div>`; }
/* the days of one target: what is placed on each and how much of it is done, and buttons to put the clicked samples there */
function daysHTML(t, ro) {
  const sel = S.tpick && S.tpick.t === t.id && S.tpick.set.size ? S.tpick : null, td = todayIdx(t.week), un = t.items.reduce((a, i) => a + i.mice.filter(m => dayOf(i, m) < 0 && stOf(i.exp, i.target, m) !== 'done').length, 0);
  return `<div class="ti"><div class="sm"><b>Day by day</b> <span class="muted">${ro ? 'The days these samples were planned for, and what has been done.' : sel ? `${sel.set.size} clicked: now choose the day.` : 'Click samples above, then the day you will do them. Whatever is not placed is spread over the week for you.'}</span></div>
   <div class="dgrid">${DAYN.map((n, d) => { const rows = t.items.map(i => { const ms = i.mice.filter(m => dayOf(i, m) === d); return ms.length ? { i, ms, dn: ms.filter(m => stOf(i.exp, i.target, m) === 'done').length } : null; }).filter(Boolean), left = rows.reduce((a, r) => a + r.ms.length - r.dn, 0), mins = rows.reduce((a, r) => a + est(r.i.exp, r.ms.length), 0), late = left && d < td;
     return d > 4 && !rows.length && !sel ? '' : `<button class="dcol ${d === td ? 'now' : ''} ${mins > 360 ? 'ov' : ''}" data-a="tDay" data-id="${t.id}" data-d="${d}" ${sel ? '' : 'disabled'}><b>${n} ${new Date(t.week + d * DAY).getDate()}</b>${rows.map(r => `<span>${e(iName(r.i))} × ${r.ms.length}${r.dn ? ` · ${r.dn === r.ms.length ? 'done ✓' : r.dn + ' done'}` : ''}</span>`).join('') || '<span class="muted">nothing placed</span>'}${late ? `<span class="late">${left} not done on the day</span>` : mins && left ? `<span class="mono">${dur(mins)}</span>` : ''}</button>`; }).join('')}</div>
   <div class="line sm">${un ? `<span class="muted grow">${un} not placed on a day yet</span>` : '<span class="muted grow">Everything is placed on a day.</span>'}${sel ? `<button class="btn sm" data-a="tDay" data-id="${t.id}" data-d="-1">Take the clicked ones off their day</button>` : ''}</div></div>`;
}
const overMsg = 'At least one day needs more than 6 hours at the bench.';
export function tCard(t, act) {
  const d = tDone(t), n = tN(t), s = tState(t), own = t.user === S.user, canRun = own && t.status === 'agreed' && t.week <= WK, canPick = own && t.status !== 'change' && s !== 'met', L = own && t.week >= WK && weekLoad(t.user, t.week);
  return `<div class="card"><div class="line"><b class="grow">Week of ${wkLabel(t.week)}</b>${flag(...TS[s])}</div>
  <div class="sm muted">${e(users[t.user].name)} · ${e(PR(t.proj)?.name || '')} · ${d} of ${n} done</div>
  <div class="bar"><i style="width:${n ? Math.min(100, d / n * 100) : 0}%"></i></div>
  ${t.items.map((i, k) => {
    const pk = S.tpick && S.tpick.t === t.id && S.tpick.k === k ? S.tpick.set : null;
    return `<div class="ti"><div class="line"><b class="grow sm">${e(iName(i))} · ${i.mice.length} samples</b>${own ? `<span class="sm muted">about ${dur(est(i.exp, i.mice.length))} as one batch</span>` : ''}</div>
    <div class="mcs">${i.mice.map(m => { const st = stOf(i.exp, i.target, m), dd = dayOf(i, m), tag = dd >= 0 ? ` <span class="dtag">${DAYN[dd]}</span>` : ''; return st === 'todo' && canPick ? `<button class="mc ${pk && pk.has(m) ? 'on' : ''}" data-a="tpick" data-id="${t.id}" data-k="${k}" data-m="${e(m)}" aria-pressed="${!!(pk && pk.has(m))}">${e(m)}${tag}</button>` : `<span class="mc ${st}">${e(m)}${st === 'done' ? ' ✓' : st === 'run' ? ' ◔' : tag}</span>`; }).join('')}</div>
    ${pk && pk.size && canRun ? `<div class="line"><button class="btn sm pri" data-a="tstart">Start bench session with these ${pk.size}</button><span class="sm muted">about ${dur(est(i.exp, pk.size))}</span></div>` : ''}
    ${(() => { if (!own || s === 'met' || t.status === 'change') return ''; const mates = (PR(t.proj)?.members || []).filter(u => u !== S.user && !sups().includes(u)), todo = i.mice.filter(m => stOf(i.exp, i.target, m) === 'todo'), n = pk && pk.size ? pk.size : todo.length; if (!mates.length || !todo.length) return '';
      return `<div class="line sm"><span class="muted">Hand ${pk && pk.size ? 'the ' + n + ' clicked' : n === 1 ? 'the 1 not started' : 'all ' + n + ' not started'} to</span><select id="ho${t.id}_${k}" aria-label="Teammate to hand over to">${mates.map(u => `<option value="${e(u)}">${e(nameOf(u))}</option>`).join('')}</select><button class="btn sm" data-a="handOver" data-id="${t.id}" data-k="${k}">Hand over</button></div>`; })()}</div>`;
  }).join('')}
  ${canRun && d < n ? '<div class="hint">Click the samples you are doing now, then start the session. The others stay on the plan for another day.</div>' : ''}
  ${canPick && d < n ? daysHTML(t) : t.items.some(i => i.d && Object.keys(i.d).length) ? daysHTML(t, true) : ''}
  ${L ? `<div class="ti"><div class="sm"><b>Does the week fit?</b> <span class="muted">Only you see this. Batches packed into days of 6 hours.</span></div>${loadHTML(L)}${L.over ? `<div class="err">${overMsg}${t.override ? ' You chose to go ahead anyway.' : ''}</div>` : ''}</div>` : ''}
  ${t.note ? `<div class="sm"><b>Prof Kaur:</b> ${e(t.note)}</div>` : ''}
  ${t.excuse ? `<div class="sm"><b>What happened:</b> ${e(t.excuse.what)}<br><b>Why the target was missed:</b> ${e(t.excuse.why)}<br><b>Plan:</b> ${e(t.excuse.plan)}</div>` : ''}${act || ''}</div>`;
}
/* Per experiment, across every planned week: done so far against where the plan says you should be today.
   Past weeks count in full, the current week pro rata over its five working days, future weeks not yet. */
export function progHTML() {
  const sup = isSup(), M = new Map(), el = Math.min(1, (now() - WK) / (5 * DAY));
  for (const t of DB.targets) {
    if (t.status === 'change' || !(sup || t.user === S.user)) continue; const td = todayIdx(t.week);
    // a sample placed on a day is expected once that day is over; one with no day counts pro rata over the week
    const f = (i, m) => { const d = dayOf(i, m); return t.week < WK ? 1 : t.week > WK ? 0 : d < 0 ? el : d < td ? 1 : 0; };
    for (const i of t.items) {
      const k = t.user + '|' + i.exp + '|' + i.target; let r = M.get(k); if (!r) M.set(k, r = { name: (sup ? users[t.user].name + ': ' : '') + iName(i), n: 0, d: 0, x: 0, last: 0 });
      r.n += i.mice.length; r.x += i.mice.reduce((a, m) => a + f(i, m), 0); r.d += i.mice.filter(m => stOf(i.exp, i.target, m) === 'done').length; r.last = Math.max(r.last, t.week);
    }
  }
  if (!M.size) return '';
  return `<div class="card"><h2>Progress against the plan</h2><div class="hint">One bar per experiment, across every week planned so far. The dark line is where the plan says you should be today: samples placed on a day count once that day is over.</div>${[...M.values()].filter(r => r.n).map(r => {
    const k = r.d < Math.floor(r.x) ? 'bad' : r.d > Math.ceil(r.x) ? 'ok' : '';
    return `<div class="pg"><b class="sm">${e(r.name)}</b>${flag(k, k === 'bad' ? 'Behind' : k === 'ok' ? 'Ahead' : 'On track')}<div class="bar pos ${k}"><i style="width:${r.d / r.n * 100}%"></i><b style="left:${Math.min(99.5, r.x / r.n * 100)}%"></b></div><span class="cap sm muted">${r.d} of ${r.n} planned samples done · ${Math.round(r.x)} expected by today · plan runs to ${dt(r.last + 6 * DAY)}</span></div>`;
  }).join('')}</div>`;
}
export const weekTargetMice = (x, t) => DB.targets.filter(q => q.user === S.user && q.week === WK && q.status === 'agreed').flatMap(q => q.items).filter(i => i.exp === x && i.target === t).flatMap(i => i.mice).filter(m => stOf(x, t, m) === 'todo');

V.targets = () => {
  const sup = isSup(), ts = DB.targets.filter(t => sup || t.user === S.user);
  if (!sup && !proj()) return noProj();
  const card = t => tCard(t, sup && t.status === 'proposed' ? `<div class="line"><input type="text" id="tn${t.id}" class="grow" placeholder="Comment (needed if you ask for a change)" aria-label="Comment"><button class="btn sm pri" data-a="agree" data-id="${t.id}">Agree</button><button class="btn sm" data-a="change" data-id="${t.id}">Ask for a change</button></div>` : !sup && (t.status === 'proposed' || t.status === 'change') ? `<div class="line"><button class="btn sm" data-a="delT" data-id="${t.id}">Withdraw</button></div>` : '');
  const up = ts.filter(t => t.week >= WK).sort((a, b) => a.week - b.week), past = ts.filter(t => t.week < WK).sort((a, b) => b.week - a.week);
  let right = '<div class="card"><h2>Your part</h2><div class="hint">Lab members plan each week by picking the exact samples per experiment. Nothing counts until you agree it. If an agreed week is missed, the member cannot carry on in the tracker until they send you what happened, why, and their plan. That lands in your inbox.</div></div>';
  if (!sup && !projExps().length) right = '<div class="card hint">This study has no experiments yet. Add them under Study plan first.</div>'; else if (!sup) {
    const D = S.draft, opts = projExps().flatMap(x => (x.targets || ['']).map(t => x.id + '|' + t)); if (!opts.includes(D.exp)) { D.exp = opts[0] || '|'; D.pick.clear(); }
    const [dx, dg] = D.exp.split('|'), planned = new Set(D.items.filter(i => i.exp === dx && i.target === dg).flatMap(i => i.mice)), mine = myPlanned(dx, dg);
    const shown = [D.week, D.week + 7 * DAY], weeks = [...new Set(shown.concat(D.items.map(i => i.week)))].sort((a, b) => a - b), Ls = weeks.map(w => weekLoad(S.user, w, D.items.filter(i => i.week === w))), over = Ls.some(L => L.over), t0 = day0();
    /* one day of the two weeks: what is already in a target of yours (grey), what this plan adds (bold), and the hours */
    const cell = (w, d) => {
      const rows = []; for (const t of DB.targets) if (t.user === S.user && t.week === w && t.status !== 'change') for (const i of t.items) { const n = i.mice.filter(m => dayOf(i, m) === d && stOf(i.exp, i.target, m) !== 'done').length; if (n) rows.push({ i, n }); }
      for (const i of D.items) if (i.week === w) { const n = i.mice.filter(m => dayOf(i, m) === d).length; if (n) rows.push({ i, n, nw: true }); }
      const mins = rows.reduce((a, r) => a + est(r.i.exp, r.n), 0), past = w + d * DAY < t0;
      if (d > 4 && !rows.length && !D.pick.size) return '';
      return `<button class="dcol ${w + d * DAY === t0 ? 'now' : ''} ${mins > 360 ? 'ov' : ''} ${past ? 'past' : ''}" data-a="dDay" data-w="${w}" data-d="${d}" ${D.pick.size && !past ? '' : 'disabled'}><b>${DAYN[d]} ${new Date(w + d * DAY).getDate()}</b>${rows.map(r => `<span class="${r.nw ? 'nw' : 'muted'}">${e(iName(r.i))} × ${r.n}</span>`).join('') || `<span class="muted">${past ? 'passed' : 'free'}</span>`}${mins ? `<span class="mono">${dur(mins)}</span>` : ''}</button>`;
    };
    right = `<div class="card"><h2>Plan the next two weeks, day by day</h2>
     <label class="fld" for="dWk">Two weeks starting<select id="dWk" data-c="dWk">${Array.from({ length: 26 }, (_, i) => WK + i * 7 * DAY).map(w => `<option value="${w}" ${w === D.week ? 'selected' : ''}>${wkLabel(w)}${w === WK ? ' (this week)' : ''}</option>`).join('')}</select></label>
     <h3>1. Pick an experiment, then click the samples</h3>
     <select id="dExp" data-c="dExp" aria-label="Experiment">${opts.map(o => { const [a, b] = o.split('|'); return `<option value="${e(o)}" ${o === D.exp ? 'selected' : ''}>${e(X(a).name)}${b ? ' ' + e(b) : ''}</option>`; }).join('')}</select>
     <div class="mcs">${proj().samples.filter(m => stOf(dx, dg, m.id) !== 'na').map(m => { const st = planned.has(m.id) ? 'plan' : stOf(dx, dg, m.id); const cl = st === 'todo' && claimOf(dx, dg, m.id); if (cl) return `<span class="mc claimed" title="Already in ${e(nameOf(cl))}'s target. They can hand it over from their Targets page.">${e(m.id)} · ${e(first(cl))}</span>`;
       if (st === 'todo' && mine.has(m.id)) return `<span class="mc plan" title="Already in your target for the week of ${e(wkLabel(mine.get(m.id)))}. Move it to another day on that target's card.">${e(m.id)}</span>`;
       return st === 'todo' ? `<button class="mc ${D.pick.has(m.id) ? 'on' : ''}" data-a="dPick" data-m="${e(m.id)}" aria-pressed="${D.pick.has(m.id)}">${e(m.id)}</button>` : `<span class="mc ${st}">${e(m.id)}${st === 'done' ? ' ✓' : ''}</span>`; }).join('') || '<span class="hint">No samples are assigned to this experiment yet. Tick them under Study plan.</span>'}</div>
     <div class="line"><button class="btn sm" data-a="dNext">Next 25 to do</button><button class="btn sm" data-a="dClear">Clear</button><span class="sm muted grow">${D.pick.size} picked${D.pick.size ? ', about ' + dur(est(dx, D.pick.size)) + ' as one batch' : ''}</span></div>
     <div class="hint">Green is already done, amber is on the bench or already planned. Grey with a name is already in a teammate's target: only they can hand it over.</div>
     <h3>2. Click the day you will do them</h3>
     ${shown.map(w => `<div class="sm"><b>${w === WK ? 'This week' : w === WK + 7 * DAY ? 'Next week' : 'Week of ' + dt(w)}</b> <span class="muted">${wkLabel(w)}</span></div><div class="dgrid">${DAYN.map((_, d) => cell(w, d)).join('')}</div>
      <div class="line sm"><button class="btn sm" data-a="dDay" data-w="${w}" data-d="-1" ${D.pick.size && w + 7 * DAY > t0 ? '' : 'disabled'}>No fixed day in this week</button>${(() => { const n = D.items.filter(i => i.week === w).reduce((a, i) => a + i.mice.filter(m => dayOf(i, m) < 0).length, 0); return n ? `<span class="muted">${n} in this plan with no fixed day; they are spread over the week for you</span>` : ''; })()}</div>`).join('')}
     <div class="hint">${D.pick.size ? `${D.pick.size} clicked: now choose the day.` : 'Each day shows what you already have planned (grey) and what this plan adds. To split one experiment over several days, click some samples and a day, then the next samples and another day.'}</div>
     <h3>3. Check the plan and send it</h3>
     ${weeks.map(w => { const its = D.items.map((i, k) => ({ i, k })).filter(q => q.i.week === w); if (!its.length) return '';
       return `<div class="sm"><b>Week of ${wkLabel(w)}</b></div>` + [0, 1, 2, 3, 4, 5, 6, -1].flatMap(d => its.map(({ i, k }) => { const ms = i.mice.filter(m => dayOf(i, m) === d); return ms.length ? `<div class="line sm"><span class="dtag">${d < 0 ? 'Any day' : DAYN[d] + ' ' + new Date(w + d * DAY).getDate()}</span><span class="grow"><b>${e(iName(i))}</b> · <span class="mono">${e(ms.join(', '))}</span> · about ${dur(est(i.exp, ms.length))}</span><button class="btn sm" data-a="dDel" data-i="${k}" data-d="${d}">Remove</button></div>` : ''; })).join(''); }).join('') || '<div class="hint">Nothing added yet. You can add several experiments, on as many days as you like.</div>'}
     ${weeks.map((w, k) => !Ls[k].total ? '' : `<div class="sm"><b>Does ${w === WK ? 'this week' : 'the week of ' + dt(w)} fit?</b> <span class="muted">Only you see this${D.items.some(i => i.week === w) ? '' : '; it is what you already have planned'}.</span></div>${loadHTML(Ls[k])}`).join('')}
     <div class="hint">${[...new Set(D.items.map(i => i.exp).concat(dx))].filter(X).map(mdlText).join('<br>')}</div>
     ${over ? `<div class="todo sm"><span><b>${overMsg}</b> Move something to another day, or go ahead anyway.</span><label class="line"><input type="checkbox" id="dOver" data-c="dOver" ${D.override ? 'checked' : ''}> Go ahead anyway</label></div>` : ''}
     <button class="btn pri" data-a="propose" ${D.items.length && (!over || D.override) ? '' : 'disabled'}>Send to Prof Kaur for agreement</button>
     <div class="hint">Each week is sent as its own target, with its days. After it is agreed you can still move samples to another day on the target's card.</div></div>
    <div class="card"><h2>Next 6 months</h2><div class="hint">Estimated bench hours per planned week. Click a week to plan it and the week after.</div>
     <div class="wks">${Array.from({ length: 27 }, (_, i) => WK + i * 7 * DAY).map(w => { const l = weekLoad(S.user, w); return `<button class="wk ${l.total ? 'has' : ''} ${l.over ? 'ov' : ''} ${shown.includes(w) ? 'sel' : ''}" data-a="dWkSet" data-w="${w}"><b>${dt(w)}</b>${l.total ? dur(l.total) : 'free'}</button>`; }).join('')}</div></div>`;
  }
  return `<div class="cols"><div class="stack">${progHTML()}${up.map(card).join('') || '<div class="card hint">Nothing planned from this week on.</div>'}${past.length ? '<h3>Earlier weeks</h3>' + past.map(card).join('') : ''}${(() => { if (sup || !proj()) return ''; const o = DB.targets.filter(t => t.proj === S.project && t.user !== S.user && t.status !== 'change' && t.week >= WK - 7 * DAY).sort((a, b) => a.week - b.week); return o.length ? '<h3>Teammates in this study</h3><div class="hint">You can see these, including ones still waiting for Prof Kaur, but only their owner can change them.</div>' + o.map(t => tCard(t)).join('') : ''; })()}</div><div class="stack">${right}</div></div>`;
};
