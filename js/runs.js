// Runs and bench sessions, the index of what has been done, and which studies this account sees.

import { DB, S, nid, now, sups } from './core.js';
import { P, PR, X, cur, lbl, vname } from './protocols.js';

export let IDX = new Map();

/* ---------------- runs ---------------- */
export const key = (x, t, m) => x + '|' + (t || '') + '|' + m;
export const fHas = (f, k) => f.key === k || (f.keys || []).includes(k);
export function buildIdx() { IDX = new Map(); for (const s of DB.sessions) for (const m of s.mice) IDX.set(key(s.exp, s.target, m), s); }
export const runOf = (x, t, m) => IDX.get(key(x, t, m));
export const stOf = (x, t, m) => { const s = runOf(x, t, m); return s ? (s.doneAt ? 'done' : 'run') : DB.asg.has(key(x, t, m)) ? 'todo' : 'na'; };
export const sess = id => DB.sessions.find(s => s.id === id);
export function newSession(projId, exp, target, mice, nodeId, revN, by) {
  const x = X(exp), p = P(x.proto), n = p.nodes.find(q => q.id === nodeId), r = n.revs.find(q => q.n === revN) || cur(n);
  const s = { id: nid(), proj: projId, exp, target: target || '', mice, proto: p.id, node: n.id, pname: p.name, label: vname(p, n), rev: r.n, steps: r.steps.map(q => { const z = { ...q, reagent: q.reagent === '@target' ? (x.treag && x.treag[target]) || '' : q.reagent, checks: [...q.checks], more: (q.more || []).map(y => ({ ...y })), prog: { n: (q.prog && q.prog.n) || 0, stages: ((q.prog && q.prog.stages) || []).map(y => ({ ...y })) }, outs: [...(q.outs || [])] }; z.t = lbl(z); return z; }), ticks: {}, res: {}, stepIdx: 0, waitStart: null, notes: [], startedAt: now(), doneAt: null, by };
  DB.sessions.push(s); return s;
}

/* ---------------- access ---------------- */
export const visProj = () => DB.projects;
export const proj = () => PR(S.project);
export const projExps = () => proj() ? proj().exps.map(X).filter(Boolean) : [];
export const notice = (to, text) => { if (to && to !== S.user) DB.notices.push({ id: nid(), to, at: now(), text, by: S.user, mailedAt: null }); };
/* mailedAt stays null until the lab's mail sheet has emailed the notice */
export const inbox = () => DB.notices.filter(n => n.to === S.user && !n.cleared);
export const tm = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const noticeSup = text => sups().forEach(u => notice(u, text));
export const noProj = () => `<div class="card"><h2>No study yet</h2><div class="hint">A study holds your samples, the experiments planned on them and your weekly targets. Create one to get started.</div><div class="line"><button class="btn pri" data-a="newStudy">New study</button></div></div>`;
