// Lineages, for studies whose samples grow over time (organoids, cell lines): a founder sample, its passages,
// the stocks frozen along the way and the vials thawed again, shown as a tree or a table. Every passage is an
// ordinary sample (so it can be ticked for experiments and run on the bench) that also remembers where it came from.
//
// A sample in a lineage carries: line (the founder's name), p (passage number, 0 for the founder), from (the sample
// it was passaged from), at (the day it was made), on (true while it is in culture), thaw (true when it was grown
// from a thawed vial) and ev, its events: { k: 'fz' | 'th' | 'end', at, n, where, why, by }.

import { $, AFTER, DAY, DB, MIN, S, V, e, flag, isSup, newDraft, nid, now, toast } from './core.js';
import { dayKey } from './sync.js';
import { cur, dty, leaves, tot } from './protocols.js';
import { IDX, buildIdx, key, newSession, noProj, proj, projExps, runOf, stOf } from './runs.js';
import { expCount, runRow } from './today.js';
import { clean, gtag } from './plan.js';

/* ---------------- reading a lineage ---------------- */
export const linOn = () => !!(proj() && proj().lin);
const SS = () => proj().samples;
const smp = id => SS().find(m => m.id === id);
const kidsOf = id => SS().filter(m => m.from === id);
const dayT = d => new Date(d + 'T12:00').getTime();
const dOf = d => d ? dty(dayT(d)) : 'date not recorded';
const pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const evs = (m, k) => (m.ev || []).filter(q => q.k === k);
/* vials still in the freezer: everything frozen at this passage, less what has been thawed */
export const vials = m => Math.max(0, evs(m, 'fz').reduce((t, q) => t + (+q.n || 0), 0) - evs(m, 'th').reduce((t, q) => t + (+q.n || 0), 0));
const short = m => m.p && m.id.startsWith(m.line + '-') ? m.id.slice(m.line.length + 1) : m.id;
const cnt = m => projExps().reduce((a, x) => { const c = expCount(x, m.id); return { d: a.d + c.d, r: a.r + c.r, n: a.n + c.n }; }, { d: 0, r: 0, n: 0 });
const hasRuns = id => [...IDX.keys()].some(k => k.endsWith('|' + id));
export function lines() {
  const map = new Map();
  for (const m of SS()) { if (!m.line) continue; if (!map.has(m.line)) map.set(m.line, { id: m.line, root: null, nodes: [] }); const L = map.get(m.line); L.nodes.push(m); if (!m.from) L.root = m; }
  return [...map.values()].filter(L => L.root);
}
function ancestors(m) { const out = []; let q = smp(m.from), guard = 0; while (q && guard++ < 5000) { out.push(q); q = smp(q.from); } return out; }
function below(m) { let n = 0; const st = [m]; while (st.length) for (const k of kidsOf(st.pop().id)) { n++; st.push(k); } return n; }
function stat(L) {
  const s = { d: 0, r: 0, n: 0, v: 0, vAt: 0, on: [], far: 0 };
  for (const m of L.nodes) { const c = cnt(m), v = vials(m); s.d += c.d; s.r += c.r; s.n += c.n; s.v += v; if (v) s.vAt++; if (m.on) s.on.push(m); s.far = Math.max(s.far, m.p || 0); }
  return s;
}
/* the name offered for the next passage: T055-P4 after T055-P3. A second P4 (grown from a thawed P3 vial, when the
   first P4 already exists) becomes T055-P4b, and that letter is then kept down its branch: T055-P5b, T055-P6b. */
function nextName(m) {
  const sfx = (/-P\d+([a-z]*)$/.exec(m.id) || [])[1] || '', n = (m.p || 0) + 1, have = new Set(DB.projects.flatMap(p => p.samples.map(q => q.id))), first = `${m.line}-P${n}${sfx}`;
  if (!have.has(first)) return first;
  // a new branch takes the first letter no other branch of this founder has used
  const used = new Set(SS().filter(q => q.line === m.line).map(q => (/-P\d+([a-z]+)$/.exec(q.id) || [])[1]).filter(Boolean));
  for (const s of 'bcdefghijklmnopqrstuvwxyz') { const id = `${m.line}-P${n}${s}`; if (!used.has(s) && !have.has(id)) return id; }
  return `${m.line}-P${n}-${nid().slice(1, 4)}`;
}

/* ---------------- the tree ---------------- */
const NW = 150, NH = 62, GX = 34, GY = 16;
/* Where each passage sits: the first passage made from a culture carries on along the same row, and any other
   (a culture grown later from a thawed vial) starts a row of its own underneath. Long stretches where nothing was
   frozen, thawed or tested are folded into one box unless "every passage" is chosen. */
function place(L, all) {
  const cells = [], edges = [];
  const plain = m => !!m.from && !m.on && !(m.ev || []).length && m.id !== S.linNode && !cnt(m).n && kidsOf(m.id).length === 1;
  let rows = 0;
  const walk = (m0, col0, row, from0) => {
    // one row at a time, without recursion along the row: a line can be hundreds of passages long
    let m = m0, col = col0, from = from0; const side = [];
    while (m) {
      if (!all) { const run = []; let q = m; while (plain(q)) { run.push(q); q = kidsOf(q.id)[0]; }
        if (run.length >= 3) { const g = { gap: run, col, row }; cells.push(g); if (from) edges.push([from, g, run[0]]); from = g; m = q; col++; } }
      const c = { m, col, row }; cells.push(c); if (from) edges.push([from, c, m]);
      const ks = kidsOf(m.id); for (const k of ks.slice(1)) side.push([k, col + 1, c]);
      m = ks[0]; from = c; col++;
    }
    // side branches nearest the end of this row are placed first, so their connectors never cross a row in between
    for (let i = side.length - 1; i >= 0; i--) walk(side[i][0], side[i][1], ++rows, side[i][2]);
  };
  walk(L.root, 0, 0, null);
  return { cells, edges, cols: Math.max(...cells.map(c => c.col)) + 1, rows: rows + 1 };
}
const X0 = c => c.col * (NW + GX), Y0 = c => c.row * (NH + GY);
function nodeBox(c, sel) {
  if (c.gap) { const a = c.gap[0], b = c.gap[c.gap.length - 1];
    return `<button class="ln gap" data-a="linAll" style="left:${X0(c)}px;top:${Y0(c)}px" title="Show every passage"><b class="mono">${e(short(a))} to ${e(short(b))}</b><span>${c.gap.length} passages</span><span>nothing recorded</span></button>`; }
  const m = c.m, v = vials(m), k = cnt(m), ended = evs(m, 'end').length && !m.on, kids = kidsOf(m.id).length;
  const state = m.on ? 'In culture' : !m.from ? 'Founder sample' : ended ? 'Ended' : kids ? 'Passaged on' : v ? 'Frozen only' : 'Not in culture';
  return `<button class="ln ${m.on ? 'on' : ''} ${v ? 'fz' : ''} ${!m.on && m.from ? 'off' : ''} ${m.id === sel ? 'sel' : ''}" data-a="linNode" data-m="${e(m.id)}" style="left:${X0(c)}px;top:${Y0(c)}px" aria-pressed="${m.id === sel}">
    <b class="mono">${e(short(m))}</b><span class="st">${state}</span><span>${[v ? v + ' frozen' : '', k.n ? `${k.d}/${k.n} runs` : ''].filter(Boolean).join(' · ') || '&nbsp;'}</span></button>`;
}
function treeHTML(L, sel) {
  const T = place(L, S.linAll), W = T.cols * (NW + GX) - GX, H = T.rows * (NH + GY) - GY, folded = T.cells.some(c => c.gap);
  const paths = T.edges.map(([a, b, m]) => { const ax = X0(a) + NW, ay = Y0(a) + NH / 2, bx = X0(b), by = Y0(b) + NH / 2, mx = ax + GX / 2;
    return `<path class="${m.thaw ? 'thaw' : ''}" d="M${ax} ${ay}H${a.row === b.row ? bx : mx + 'V' + by + 'H' + bx}"/>${m.thaw ? `<text x="${bx + 2}" y="${Y0(b) - 4}">from a thawed vial</text>` : ''}`; }).join('');
  return `<div class="card"><div class="line"><h2 class="grow">Lineage tree</h2>${folded || S.linAll ? `<button class="btn sm" data-a="linAll">${S.linAll ? 'Fold the quiet stretches' : 'Show every passage'}</button>` : ''}</div>
    <div class="scroll ltwrap"><div class="ltree" style="width:${W}px;height:${H}px"><svg width="${W}" height="${H}" aria-hidden="true">${paths}</svg>${T.cells.map(c => nodeBox(c, sel)).join('')}</div></div>
    <div class="legend"><span><i style="background:var(--ok-soft);border-color:var(--ok)"></i>in culture now</span><span><i style="background:var(--surface);box-shadow:inset 4px 0 0 var(--accent)"></i>has frozen vials</span><span><i style="background:var(--sunk)"></i>passaged on or ended</span><span>A dashed line is a culture grown from a thawed vial. Click a passage for its record.</span></div></div>`;
}
/* the same lineage as a table: every passage against every experiment */
function tableHTML(L, sel) {
  const xs = projExps(), T = place(L, true), sums = xs.map(x => L.nodes.reduce((a, m) => { const c = expCount(x, m.id); return { d: a.d + c.d, n: a.n + c.n }; }, { d: 0, n: 0 }));
  const cell = (x, m) => { const k = expCount(x, m.id); if (!k.n) return '<td class="g" style="text-align:center">–</td>'; return x.targets ? `<td class="${k.d === k.n ? 'done' : k.d || k.r ? 'part' : ''}">${k.d}/${k.n}</td>` : `<td class="${k.d ? 'done' : k.r ? 'run' : ''}">${k.d ? '✓' : k.r ? '◔' : 'to do'}</td>`; };
  return `<div class="card"><h2>Every passage of ${e(L.id)}</h2><div class="scroll" style="max-height:60vh;overflow:auto"><table class="mx"><thead><tr><th>Passage</th><th>From</th><th>Made</th><th>State</th><th>Frozen</th>${xs.map(x => `<th>${e(x.name)}</th>`).join('')}</tr>
    <tr><td>All of ${e(L.id)}</td><td class="g" colspan="4">runs done under this lineage</td>${sums.map(t => `<td>${t.n ? t.d + '/' + t.n : '–'}</td>`).join('')}</tr></thead>
    <tbody>${T.cells.map(c => { const m = c.m, v = vials(m); return `<tr class="${m.id === sel ? 'lsel' : ''}"><td><button class="lnk mono" data-a="linNode" data-m="${e(m.id)}">${e(m.id)}</button></td><td class="g mono">${m.from ? e(short(smp(m.from) || { id: m.from })) + (m.thaw ? ' (thawed)' : '') : 'founder'}</td><td class="g">${m.at ? dty(dayT(m.at)) : ''}</td><td class="g">${m.on ? flag('ok', 'In culture') : evs(m, 'end').length ? 'Ended' : kidsOf(m.id).length ? 'Passaged on' : ''}</td><td>${v ? v + ' vial' + (v === 1 ? '' : 's') : ''}</td>${xs.map(x => cell(x, m)).join('')}</tr>`; }).join('')}</tbody></table></div>
    <div class="hint">A dash means that experiment is not planned on that passage. Click a passage for its record.</div></div>`;
}
/* everything done anywhere under the founder, experiment by experiment, with the passages it was done on */
function rollHTML(L) {
  const xs = projExps(), rows = xs.map(x => { let d = 0, r = 0, n = 0; const on = []; for (const m of L.nodes) { const c = expCount(x, m.id); if (!c.n) continue; d += c.d; r += c.r; n += c.n; on.push({ m, c }); } return { x, d, r, n, on }; }).filter(q => q.n);
  return `<div class="card"><h2>Experiments under ${e(L.id)}</h2><div class="hint">Every run on any passage counts towards ${e(L.id)} as a whole. Each run still belongs to the passage it was done on: a result for P3 is not a result for P33.</div>
    ${rows.map(q => `<div class="pg"><b class="sm">${e(q.x.name)}</b><span class="sm muted">${q.d} of ${pl(q.n, 'run')} done${q.r ? ' · ' + q.r + ' on the bench' : ''}</span><div class="bar two"><i style="width:${q.d / q.n * 100}%"></i><u style="width:${q.r / q.n * 100}%"></u></div>
      <div class="mcs cap">${q.on.map(o => `<button class="mc ${o.c.d === o.c.n ? 'done' : o.c.d || o.c.r ? 'run' : ''}" data-a="linNode" data-m="${e(o.m.id)}" title="${e(o.m.id)}: ${o.c.d} of ${o.c.n} done">${e(short(o.m))}${o.c.d === o.c.n ? ' ✓' : o.c.n > 1 ? ' ' + o.c.d + '/' + o.c.n : ' to do'}</button>`).join('')}</div></div>`).join('') || '<div class="hint">Nothing is planned on any passage yet. Choose a passage below and plan an experiment on it.</div>'}</div>`;
}
/* one passage: what it is, what happened to it, what can be done next, and its experiments */
function nodeHTML(m, L) {
  const xs = projExps(), par = smp(m.from), ks = kidsOf(m.id), v = vials(m), c = cnt(m), nm = nextName(m), under = below(m);
  const hist = [{ at: m.at, t: m.from ? `Passaged from ${m.from}${m.thaw ? ', grown from a thawed vial' : ''}` : 'Founder sample received' }]
    .concat((m.ev || []).map((q, i) => ({ at: q.at, i, t: q.k === 'fz' ? `Froze ${pl(q.n, 'vial')}${q.where ? ' · kept in ' + q.where : ''}` : q.k === 'th' ? `Thawed ${pl(q.n, 'vial')} and put back in culture` : `Culture ended${q.why ? ': ' + q.why : ''}` })))
    .concat(ks.map(k => ({ at: k.at, t: `Passaged on to ${k.id}`, to: k.id }))).sort((a, b) => (a.at || '') < (b.at || '') ? -1 : (a.at || '') > (b.at || '') ? 1 : 0);
  const mine = xs.flatMap(x => (x.targets || ['']).filter(t => stOf(x.id, t, m.id) !== 'na').map(t => ({ x, t })));
  const free = xs.flatMap(x => { const ts = (x.targets || ['']).filter(t => stOf(x.id, t, m.id) === 'na'); return (x.targets && ts.length > 1 ? [`<option value="${x.id}|*">${e(x.name)}: all ${ts.length}</option>`] : []).concat(ts.map(t => `<option value="${e(x.id + '|' + t)}">${e(x.name)}${t ? ': ' + e(t) : ''}</option>`)); });
  const old = ancestors(m).flatMap(a => xs.flatMap(x => (x.targets || ['']).map(t => ({ a, x, t, s: runOf(x.id, t, a.id) })).filter(q => q.s)));
  return `<div class="card lnode"><div class="line"><h2 class="grow"><span class="mono">${e(m.id)}</span></h2>${m.on ? flag('ok', 'In culture') : ''}${v ? flag('info', pl(v, 'vial') + ' frozen') : ''}${!m.from ? flag('', 'Founder sample') : !m.on && evs(m, 'end').length ? flag('', 'Ended') : !m.on && ks.length ? flag('', 'Passaged on') : ''}</div>
    <div class="sm muted">${m.from ? `Passage ${m.p} of ${e(L.id)} · from <button class="lnk mono" data-a="linNode" data-m="${e(m.from)}">${e(par ? par.id : m.from)}</button> · made ${dOf(m.at)}` : `Where ${e(L.id)} starts · received ${dOf(m.at)}`}${under ? ` · ${pl(under, 'later passage')} come${under === 1 ? 's' : ''} from it` : ''} · ${c.n ? `${c.d} of ${pl(c.n, 'run')} done on ${m.from ? 'this passage' : 'the founder sample itself'}` : `no experiments on ${m.from ? 'this passage' : 'the founder sample itself'}`}</div>
    <div class="line"><button class="btn ${m.on ? 'pri' : ''}" data-a="linPass" data-m="${e(m.id)}">Passage to ${e(nm)}</button><button class="btn" data-a="linFreeze" data-m="${e(m.id)}">Freeze a stock</button>${v ? `<button class="btn ${m.on ? '' : 'pri'}" data-a="linThaw" data-m="${e(m.id)}">Thaw a vial</button>` : ''}${m.on ? `<button class="btn" data-a="linEnd" data-m="${e(m.id)}">End this culture</button>` : ''}<span class="sp"></span>${!ks.length && !hasRuns(m.id) ? `<button class="btn sm" data-a="linDel" data-m="${e(m.id)}">Remove</button>` : ''}</div>
    ${!m.on && !v && m.from ? `<div class="hint">${e(m.id)} is not in culture and has no frozen vials, so normally nothing more is grown from it. Passage is still offered in case it was simply not recorded at the time.</div>` : ''}
    <div class="ti"><h3>What happened to it</h3>${hist.map(h => `<div class="line sm"><span class="mono muted" style="flex:0 0 96px">${h.at ? dty(dayT(h.at)) : 'no date'}</span><span class="grow">${h.to ? `Passaged on to <button class="lnk mono" data-a="linNode" data-m="${e(h.to)}">${e(h.to)}</button>` : e(h.t)}</span>${h.i != null ? `<button class="lnk sm" style="font-weight:400" data-a="linEvDel" data-m="${e(m.id)}" data-i="${h.i}">undo</button>` : ''}</div>`).join('')}</div>
    <div class="ti"><h3>Experiments on ${e(m.id)}</h3>
      ${mine.length ? `<div class="list">${mine.map(q => runRow(q.x, q.t, m.id, e(q.x.name) + (q.t ? ' <span class="mono">' + e(q.t) + '</span>' : ''), stOf(q.x.id, q.t, m.id) === 'todo' ? `<button class="btn sm pri" data-a="linRun" data-x="${q.x.id}" data-t="${e(q.t)}" data-m="${e(m.id)}" title="Opens Experiments with ${e(m.id)} ticked">Start</button>` : '')).join('')}</div>` : '<div class="hint">None yet.</div>'}
      ${xs.length ? (free.length ? `<div class="line"><label class="fld" for="lnPlan">Add an experiment</label><select id="lnPlan">${free.join('')}</select><button class="btn sm" data-a="linPlan" data-m="${e(m.id)}">Plan it on ${e(short(m))}</button></div>` : '<div class="hint">Every experiment in this study is already planned on this passage.</div>')
        : '<div class="hint">This study has no experiments yet. Add them from the lab protocols under Study plan, then plan them on a passage here.</div><div class="line"><button class="btn sm" data-a="tab" data-k="plan">Open Study plan</button></div>'}</div>
    ${old.length ? `<div class="ti"><h3>Done on earlier passages in this line</h3><div class="hint">For reference only. These belong to ${e(L.id)} as a whole, but they are not counted for ${e(m.id)}.</div>
      ${old.map(q => `<div class="line sm"><span class="grow"><button class="lnk mono" data-a="linNode" data-m="${e(q.a.id)}">${e(short(q.a))}</button> · ${e(q.x.name)}${q.t ? ' ' + e(q.t) : ''} · ${q.s.doneAt ? 'done ' + dty(q.s.doneAt) : 'on the bench'}</span><button class="btn sm" data-a="run" data-x="${q.x.id}" data-t="${e(q.t)}" data-m="${e(q.a.id)}">Open record</button></div>`).join('')}</div>` : ''}</div>`;
}

V.lineage = () => {
  if (!proj()) return noProj();
  const p = proj();
  if (!p.lin) return `<div class="card"><h2>Lineages</h2><div class="hint">For samples that grow over time, such as organoids and cell lines. A founder sample (say B055) is passaged into B055-P1, B055-P2 and so on; stocks are frozen along the way and can be thawed and grown again later. Each passage becomes its own sample as you record it, so the list of samples builds up while you work instead of being fixed at the start. It is off for ${e(p.name)}.</div>
    <div class="line"><button class="btn pri" data-a="linSwitch">Switch on lineages for ${e(p.name)}</button><button class="btn" data-a="linTest">See a test study with made-up samples</button></div></div>`;
  const Ls = lines(), q = (S.q || '').toLowerCase(), L = Ls.find(l => l.id === S.linSel), loose = SS().filter(m => !m.line);
  const list = Ls.filter(l => (l.id + ' ' + (l.root.group || '')).toLowerCase().includes(q)).map(l => { const s = stat(l);
    return `<button class="row ${L === l ? 'sel' : ''}" data-a="linSel" data-l="${e(l.id)}"><span class="nm mono">${e(l.id)}</span><span class="meta">${e(l.root.group || 'No group')} · ${s.far ? 'up to P' + s.far : 'not passaged yet'}${s.v ? ' · ' + pl(s.v, 'vial') : ''}</span>${s.on.length ? flag('ok', 'In culture') : s.v ? flag('info', 'Frozen') : l.nodes.length === 1 ? flag('', 'New') : flag('', 'Not held')}</button>`; }).join('')
    || `<div class="hint" style="padding:12px">${Ls.length ? 'Nothing matches.' : 'No founder samples yet. Add the first one below.'}</div>`;
  let det = '<div class="empty">Choose a founder sample on the left to see its lineage: every passage, what is frozen, and the experiments done along the way.</div>';
  if (L) {
    const s = stat(L); let m = L.nodes.find(n => n.id === S.linNode);
    if (!m) { m = s.on.slice().sort((a, b) => (b.p || 0) - (a.p || 0))[0] || L.root; S.linNode = m.id; }
    const table = S.linView === 'table';
    det = `<div class="hdr"><button class="back" data-a="back">← All founder samples</button><div class="name"><span class="mono">${e(L.id)}</span>${gtag(L.root.group)}</div>
      <div class="who">${e(p.name)} · ${pl(L.nodes.length - 1, 'passage')}${s.far ? ', furthest P' + s.far : ''} · ${s.on.length ? 'in culture: <span class="mono">' + s.on.map(n => e(short(n))).join(', ') + '</span>' : 'nothing in culture'} · ${s.v ? `${pl(s.v, 'vial')} frozen across ${pl(s.vAt, 'passage')}` : 'no frozen stock'} · ${s.d} of ${pl(s.n, 'run')} done</div>
      <div class="chips"><button class="chip ${table ? '' : 'view'}" data-a="linView" data-k="tree">Lineage tree</button><button class="chip ${table ? 'view' : ''}" data-a="linView" data-k="table">Table</button></div></div>
     <div class="body">${table ? tableHTML(L, m.id) : treeHTML(L, m.id)}${nodeHTML(m, L)}${rollHTML(L)}</div>`;
  }
  const today = dayKey(now());
  return `<div class="split ${L ? 'has-sel' : ''}"><aside class="pane-list"><div class="tools"><input type="search" id="q" placeholder="Search founder or group" aria-label="Search founder samples" value="${e(S.q)}" data-c="qAn"></div><div class="rows">${list}</div>
    <div class="tools" style="border-top:1px solid var(--line)"><b class="sm">Add a founder sample</b><div class="rg"><label>Name<input type="text" id="lfName" placeholder="e.g. B055"></label></div><div class="rg"><label>Group (optional)<input type="text" id="lfGroup" placeholder="e.g. colorectal"></label><label>Date received<input type="date" id="lfDay" value="${today}" max="${today}"></label></div>
      <div class="line"><button class="btn sm pri" data-a="linFounder">Add founder</button><span class="err" id="lfErr"></span></div>
      ${loose.length ? `<details class="sm"><summary>${pl(loose.length, 'sample')} in this study ${loose.length === 1 ? 'is' : 'are'} not in a lineage</summary><div class="stack" style="padding-top:6px;gap:4px">${loose.map(o => `<div class="line"><span class="mono grow">${e(o.id)}</span><button class="btn sm" data-a="linAdopt" data-m="${e(o.id)}">Make it a founder</button></div>`).join('')}</div></details>` : ''}</div></aside>
    <main class="pane-detail">${det}</main></div>`;
};
/* after choosing a lineage or making a passage, bring that passage into view in the tree */
AFTER.push(() => { if (!S.linJump) return; S.linJump = false; const n = document.querySelector('.ltree .ln.sel'), b = n && n.closest('.scroll'); if (b) b.scrollLeft = n.offsetLeft - b.clientWidth / 2 + n.offsetWidth / 2; });

/* ---------------- pop-up windows ---------------- */
export function linModal(md) {
  const m = proj() && smp(md.m), today = dayKey(now());
  if (!m) return '<h2>That passage is no longer in this study</h2><div class="foot"><button class="btn" data-a="close">Close</button></div>';
  const foot = (a, t) => `<div class="foot"><span class="err" id="mErr"></span><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="${a}">${t}</button></div>`;
  const day = (id, lab) => `<label>${lab}<input type="date" id="${id}" value="${today}" max="${today}"></label>`;
  if (md.type === 'linPass') { const sib = kidsOf(m.id).length;
    return `<h2>Passage <span class="mono">${e(m.id)}</span></h2><div class="hint">The new passage becomes its own sample in this study, so experiments can be planned on it straight away.</div>
      <div class="rg"><label>Name of the new passage<input type="text" id="lpName" value="${e(nextName(m))}"></label>${day('lpDay', 'Date passaged')}</div>
      ${sib ? `<div class="todo sm"><span>${e(m.id)} has already been passaged on to <span class="mono">${e(kidsOf(m.id).map(k => k.id).join(', '))}</span>, so this starts a separate branch. A letter is added to the name to keep the two apart; change it if your lab labels branches differently.</span></div>` : ''}
      <div class="pick"><label><input type="checkbox" id="lpKeep"> ${e(m.id)} also stays in culture</label></div>
      <div class="hint">Left unticked, ${e(m.id)} is recorded as passaged on. Any vials frozen from it stay in the freezer either way.</div>${foot('linPassSave', 'Add passage')}`; }
  if (md.type === 'linFreeze') return `<h2>Freeze a stock of <span class="mono">${e(m.id)}</span></h2>
      <div class="rg"><label>Number of vials<input type="number" id="lzN" min="1" step="1" value="4"></label>${day('lzDay', 'Date frozen')}</div>
      <label>Where they are kept (optional)<input type="text" id="lzWhere" placeholder="e.g. -80 freezer 2, rack B, box 4"></label>
      <div class="hint">${vials(m) ? `${pl(vials(m), 'vial')} of ${e(m.id)} ${vials(m) === 1 ? 'is' : 'are'} already frozen; these are added to that.` : 'The vials are counted down each time one is thawed.'}</div>${foot('linFreezeSave', 'Record the stock')}`;
  if (md.type === 'linThaw') return `<h2>Thaw <span class="mono">${e(m.id)}</span></h2><div class="hint">${pl(vials(m), 'vial')} in the freezer. Thawing puts ${e(m.id)} back in culture; work done on it is recorded on ${e(m.id)}, and its next passage starts a new branch of the tree.</div>
      <div class="rg"><label>Vials thawed<input type="number" id="ltN" min="1" max="${vials(m)}" step="1" value="1"></label>${day('ltDay', 'Date thawed')}</div>${foot('linThawSave', 'Record the thaw')}`;
  return `<h2>End the culture of <span class="mono">${e(m.id)}</span></h2><div class="rg">${day('leDay', 'Date')}<label>Reason<select id="leWhy"><option>No longer needed</option><option>Contamination</option><option>Stopped growing</option><option>All used in an experiment</option><option>Other</option></select></label></div>
      <label>Note (optional)<input type="text" id="leNote" placeholder="e.g. fungal growth seen on day 4"></label>
      <div class="hint">${e(m.id)} stays in the lineage with all its records. Frozen vials are not affected.</div>${foot('linEndSave', 'End the culture')}`;
}

/* ---------------- actions ---------------- */
const val = id => (document.getElementById(id)?.value || '').trim();
const mErr = t => { const el = $('#mErr'); if (el) el.textContent = t; return false; };
const goodDay = d => /^\d{4}-\d\d-\d\d$/.test(d) && d <= dayKey(now());
const taken = id => DB.projects.some(p => p.samples.some(m => m.id === id));
const openStudy = id => { S.project = id; S.selMouse = null; S.picked.clear(); S.draft = newDraft(); S.tpick = null; S.selExp = undefined; S.planX = ''; S.linSel = null; S.linNode = null; };
export const lineageActions = {
  linSwitch: () => { const p = proj(); if (!p) return false; p.lin = true; S.tab = 'lineage'; toast('Lineages are on for ' + p.name + '. Add the first founder sample on the left.'); },
  linGo: d => { S.tab = 'lineage'; S.linSel = d.l; S.linNode = d.m || null; S.linJump = true; S.q = ''; },
  linSel: d => { S.linSel = d.l; S.linNode = null; S.linJump = true; },
  linNode: d => { S.linNode = d.m; },
  linView: d => { S.linView = d.k; S.linJump = true; },
  linAll: () => { S.linAll = !S.linAll; S.linJump = true; },
  linFounder: () => {
    const id = clean(val('lfName')), day = val('lfDay'), bad = t => { $('#lfErr').textContent = t; return false; };
    if (!id) return bad('Give it a name.'); if (taken(id)) return bad('That name is already used by a sample in a study.'); if (day && !goodDay(day)) return bad('That date is in the future.');
    SS().push({ id, group: clean(val('lfGroup')), line: id, p: 0, from: '', at: day || '' }); S.linSel = id; S.linNode = id; S.linJump = true; toast(id + ' added as a founder sample.');
  },
  linAdopt: d => { const m = smp(d.m); if (!m || m.line) return false; Object.assign(m, { line: m.id, p: 0, from: '', at: m.at || '' }); S.linSel = m.id; S.linNode = m.id; },
  linPass: d => { S.modal = { type: 'linPass', m: d.m }; }, linFreeze: d => { S.modal = { type: 'linFreeze', m: d.m }; },
  linThaw: d => { S.modal = { type: 'linThaw', m: d.m }; }, linEnd: d => { S.modal = { type: 'linEnd', m: d.m }; },
  linPassSave: () => {
    const par = smp(S.modal.m), id = clean(val('lpName')), day = val('lpDay'); if (!par) return false;
    if (!id) return mErr('Give the new passage a name.'); if (taken(id)) return mErr('That name is already used by a sample in a study.'); if (!goodDay(day)) return mErr('Choose the date it was passaged, today or earlier.');
    const n = { id, group: par.group || '', line: par.line, p: (par.p || 0) + 1, from: par.id, at: day, on: true }; if (par.thawed) n.thaw = true;
    SS().push(n); if (!$('#lpKeep').checked) delete par.on; delete par.thawed;
    S.linNode = id; S.linJump = true; S.modal = null; toast(id + ' added. It is now a sample in this study.');
  },
  linFreezeSave: () => {
    const m = smp(S.modal.m), n = Math.round(+val('lzN')), day = val('lzDay'); if (!m) return false;
    if (!(n > 0) || n > 500) return mErr('Type how many vials were frozen.'); if (!goodDay(day)) return mErr('Choose the date they were frozen, today or earlier.');
    const ev = { k: 'fz', at: day, n, by: S.user }, w = clean(val('lzWhere')); if (w) ev.where = w; m.ev = [...(m.ev || []), ev]; S.modal = null; toast(`${pl(n, 'vial')} of ${m.id} recorded as frozen.`);
  },
  linThawSave: () => {
    const m = smp(S.modal.m), n = Math.round(+val('ltN')), day = val('ltDay'); if (!m) return false;
    if (!(n > 0) || n > vials(m)) return mErr(`There ${vials(m) === 1 ? 'is' : 'are'} ${pl(vials(m), 'vial')} to thaw.`); if (!goodDay(day)) return mErr('Choose the date it was thawed, today or earlier.');
    m.ev = [...(m.ev || []), { k: 'th', at: day, n, by: S.user }]; m.on = true; m.thawed = true; S.modal = null; toast(`${m.id} is back in culture. ${pl(vials(m), 'vial')} left in the freezer.`);
  },
  linEndSave: () => {
    const m = smp(S.modal.m), day = val('leDay'); if (!m) return false; if (!goodDay(day)) return mErr('Choose the date, today or earlier.');
    m.ev = [...(m.ev || []), { k: 'end', at: day, why: [val('leWhy'), clean(val('leNote'))].filter(Boolean).join(': '), by: S.user }]; delete m.on; delete m.thawed; S.modal = null; toast('The culture of ' + m.id + ' is recorded as ended.');
  },
  linEvDel: d => { const m = smp(d.m), q = m && (m.ev || [])[+d.i]; if (!q) return false; m.ev.splice(+d.i, 1); if (!m.ev.length) delete m.ev; if (q.k === 'th' && !evs(m, 'th').length) delete m.thawed; },
  linDel: d => {
    const p = proj(), m = smp(d.m); if (!m || kidsOf(m.id).length || hasRuns(m.id)) return false;
    p.samples = p.samples.filter(q => q !== m); [...DB.asg].forEach(k => { if (k.endsWith('|' + m.id) && projExps().some(x => k.startsWith(x.id + '|'))) DB.asg.delete(k); });
    S.linNode = m.from || null; if (!m.from) S.linSel = null;
  },
  linPlan: d => { const v = val('lnPlan'), i = v.indexOf('|'), x = projExps().find(q => q.id === v.slice(0, i)), t = v.slice(i + 1); if (!x || !smp(d.m)) return false;
    for (const g of t === '*' ? x.targets || [''] : [t]) if (stOf(x.id, g, d.m) === 'na') DB.asg.add(key(x.id, g, d.m)); toast(`${x.name} planned on ${d.m}.`); },
  linRun: d => { S.tab = 'exps'; S.selExp = d.x; S.selTarget = d.t || ''; S.variant = null; S.picked = new Set([d.m]); toast(d.m + ' is ticked. Tick any others for the same batch, then start the bench session.'); },
  linTest: () => { S.modal = null; const old = DB.projects.find(p => p.test); if (old) { openStudy(old.id); S.tab = 'lineage'; toast('Opened the test study that already exists.'); return; } testStudy(); },
};
export const lineageSure = {
  linDel: d => [`Remove ${d.m} from the lineage?`, 'It is taken out of the study and unticked from every experiment in the plan. Use this for a passage added by mistake.', 'Remove passage'],
  linEvDel: d => { const q = ((smp(d.m) || {}).ev || [])[+d.i] || {}; return ['Undo this entry?', `${q.k === 'fz' ? 'Freezing ' + pl(q.n, 'vial') : q.k === 'th' ? 'Thawing ' + pl(q.n, 'vial') : 'Ending the culture'} of ${d.m} is taken off the record.`, 'Undo entry']; },
};

/* ---------------- a test study with made-up samples ---------------- */
/* Everything in it is invented, and the names start with T so they can never clash with a real sample. It is marked
   as a test, which keeps it out of Other projects and out of the lab's Google Drive, and lets its members delete it. */
function testStudy() {
  const id = nid(), ss = [], ago = n => dayKey(now() - n * DAY), by = S.user;
  const add = (sid, line, p, from, d, group, extra) => { const m = { id: sid, group, line, p, from, at: ago(d), ...extra }; ss.push(m); return m; };
  const ev = (sid, k, d, o) => { const m = ss.find(q => q.id === sid); (m.ev = m.ev || []).push({ k, at: ago(d), by, ...o }); };
  // T055: a long line with stocks, a branch still growing from a thawed P3 vial, and a branch lost to contamination
  add('T055', 'T055', 0, '', 240, 'Colorectal');
  for (let i = 1; i <= 24; i++) add('T055-P' + i, 'T055', i, i > 1 ? 'T055-P' + (i - 1) : 'T055', 230 - (i - 1) * 9, 'Colorectal', i === 24 ? { on: true } : {});
  ev('T055-P2', 'fz', 216, { n: 6, where: '-80 freezer 2, rack B, box 4' }); ev('T055-P3', 'fz', 207, { n: 4, where: 'Liquid nitrogen, cane 12' }); ev('T055-P3', 'th', 60, { n: 1 });
  ev('T055-P10', 'fz', 144, { n: 4, where: 'Liquid nitrogen, cane 12' }); ev('T055-P10', 'th', 100, { n: 1 }); ev('T055-P20', 'fz', 54, { n: 6, where: '-80 freezer 2, rack B, box 5' });
  add('T055-P4b', 'T055', 4, 'T055-P3', 52, 'Colorectal', { thaw: true }); add('T055-P5b', 'T055', 5, 'T055-P4b', 44, 'Colorectal'); add('T055-P6b', 'T055', 6, 'T055-P5b', 36, 'Colorectal'); add('T055-P7b', 'T055', 7, 'T055-P6b', 28, 'Colorectal', { on: true });
  ev('T055-P5b', 'fz', 40, { n: 3, where: '-80 freezer 2, rack B, box 5' });
  add('T055-P11c', 'T055', 11, 'T055-P10', 93, 'Colorectal', { thaw: true }); add('T055-P12c', 'T055', 12, 'T055-P11c', 86, 'Colorectal'); ev('T055-P12c', 'end', 80, { why: 'Contamination: fungal growth seen on day 4' });
  // T061: a short line with one stock; T072: only just started
  add('T061', 'T061', 0, '', 70, 'Colorectal'); for (let i = 1; i <= 6; i++) add('T061-P' + i, 'T061', i, i > 1 ? 'T061-P' + (i - 1) : 'T061', 62 - (i - 1) * 9, 'Colorectal', i === 6 ? { on: true } : {});
  ev('T061-P2', 'fz', 48, { n: 4, where: '-80 freezer 2, rack C, box 1' });
  add('T072', 'T072', 0, '', 6, 'Breast'); add('T072-P1', 'T072', 1, 'T072', 2, 'Breast', { on: true });
  DB.projects.push({ id, name: 'Test: organoid lineages', desc: 'Made-up samples that show how lineages work. Safe to delete.', members: isSup() ? [] : [S.user], exps: [], samples: ss, lin: true, test: true, pal: 'purple', createdBy: S.user, createdAt: now() });
  // up to three experiments from the lab's own protocols, with a few made-up runs so the tree has something to show
  const pr = DB.projects[DB.projects.length - 1], ps = DB.protocols.filter(q => leaves(q)[0] && cur(leaves(q)[0]).steps.length).sort((a, b) => /cell|cultur|organoid/i.test(b.grp || '') - /cell|cultur|organoid/i.test(a.grp || '')).slice(0, 3);
  const xs = ps.map(q => { const x = { id: nid(), name: q.name, proto: q.id, proj: id }; DB.exps.push(x); pr.exps.push(x.id); return x; });
  const todo = (x, sid) => { if (x) DB.asg.add(key(x.id, '', sid)); };
  const done = (x, sid, d) => { if (!x) return; todo(x, sid); const n = leaves(ps[xs.indexOf(x)])[0], s = newSession(id, x.id, '', [sid], n.id, cur(n).n, by), t = now() - d * DAY; s.stepIdx = s.steps.length; s.doneAt = t; s.startedAt = t - tot(s.steps) * MIN; };
  done(xs[0], 'T055-P3', 205); done(xs[1], 'T055-P3', 204); done(xs[0], 'T055-P10', 140); done(xs[2], 'T055-P5b', 41); done(xs[0], 'T055-P7b', 20); todo(xs[1], 'T055-P7b');
  todo(xs[0], 'T055-P24'); todo(xs[1], 'T055-P24'); done(xs[0], 'T061-P2', 47); todo(xs[0], 'T061-P6');
  buildIdx(); openStudy(id); S.modal = null; S.tab = 'lineage'; S.linSel = 'T055'; S.linNode = 'T055-P7b'; S.linView = 'tree'; S.linAll = false; S.linJump = true;
  toast('Test study made. Everything in it is invented' + (xs.length ? '.' : '; the lab has no protocols with steps yet, so it has no experiments.'));
}
