// Keeping DB in step with Firestore: listeners, who is online, rebuild() after every change
// from the server, and commit(), which writes only what an action changed.

import * as B from '../backend.js';
import { $, DB, MIN, S, followLink, dur, e, errMsg, isMember, isSup, seesAll, nameOf, newDraft, now } from './core.js';
import { P, X } from './protocols.js';
import { buildIdx, sess } from './runs.js';
import { syncProgress } from './study.js';
import { TABS, render, softRender } from './render.js';
import { syncEdit } from './actions.js';

/* ---------------- sync with Firestore ---------------- */
export const SRV = new Map();         // path -> data as last heard from Firestore
let BASE = new Map();          // path -> {field: canonical text} as of the last rebuild or commit
export const pending = new Set();     // listeners that have not answered yet
export let subs = [], dataSubs = [], dataMode = null; const projSubs = new Map();
export const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, q) => (o[q] = x[q], o), {}) : x);
export const clone = v => JSON.parse(JSON.stringify(v));
const blPath = () => 'users/' + S.fb.uid + '/private/backlog';

export function watch(key, path, isDoc, filter, before, retry) {
  pending.add(key);
  let off = null, dead = false, tries = 0;
  // A brand-new project's records can be asked for a moment before the server has the project
  // itself, which it refuses; those listeners try again instead of staying dead.
  const fail = err => {
    pending.delete(key);
    if (retry && !dead && tries++ < 6) { setTimeout(() => { if (!dead) go(); }, 1200 * tries); return; }
    if (key === 'lab') S.labErr = errMsg(err);
    rebuild();
  };
  const depth = path.split('/').length + 1;
  const go = () => {
    off = isDoc
      ? B.watchDoc(path, data => { if (data) SRV.set(path, data); else SRV.delete(path); pending.delete(key); rebuild(); }, fail)
      : B.watchCol(path, filter, map => {
        for (const k of [...SRV.keys()]) if (k.startsWith(path + '/') && k.split('/').length === depth) SRV.delete(k);
        for (const [id, data] of map) SRV.set(path + '/' + id, data);
        if (before) before();
        pending.delete(key); rebuild();
      }, fail);
  };
  go();
  return () => { dead = true; if (off) off(); };
}
function syncProjSubs() {
  const ids = new Set([...SRV.keys()].filter(k => k.startsWith('projects/') && k.split('/').length === 2).map(k => k.slice(9)));
  for (const [id, offs] of projSubs) if (!ids.has(id)) {
    offs.forEach(u => u()); projSubs.delete(id);
    for (const k of [...SRV.keys()]) if (k.startsWith('projects/' + id + '/')) SRV.delete(k);
    for (const k of [...pending]) if (k.startsWith('p:' + id + ':')) pending.delete(k);
  }
  for (const id of ids) if (!projSubs.has(id))
    projSubs.set(id, ['exps', 'sessions', 'targets', 'files', 'asg', 'obs', 'animals'].map(c => watch('p:' + id + ':' + c, 'projects/' + id + '/' + c, false, null, null, true)));
}
/* who has the site open: each open tab writes a small "here" note every few minutes */
let PRES = new Map(), presOff = null, presT = null;
const BEAT = 3 * MIN, ONLINE = 7 * MIN;
function beat() { if (S.fb && dataMode && !document.hidden) B.commit([{ op: 'set', path: 'presence/' + S.fb.uid, data: { email: S.user, at: now() } }]).catch(() => {}); }
/* a record of when each person had the site open, which only admins can read (Lab and access).
   One entry per stretch of use: it is extended every minute while the tab is in front of the person. */
let VISIT = null, visT = null, VIS = new Map(), visOff = null, visDay = null;
export const dayKey = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function visitTick(force) {
  if (!S.fb || !dataMode || (document.hidden && !force)) return;
  const t = now(); if (!VISIT || VISIT.uid !== S.fb.uid || t - VISIT.to > 5 * MIN) { if (force) return; VISIT = { uid: S.fb.uid, id: S.fb.uid + '-' + t, from: t }; }
  VISIT.to = t; B.commit([{ op: 'set', path: 'visits/' + VISIT.id, data: { email: S.user, day: dayKey(VISIT.from), from: VISIT.from, to: t } }]).catch(() => {});
}
function visitWatch(day) {
  if (visDay === day) return; if (visOff) visOff(); visDay = day; VIS = new Map();
  visOff = B.watchCol('visits', ['day', '==', day], m => { VIS = m; if (S.tab === 'lab') softRender(); }, () => {});
}
export function visitStop() { if (visOff) { visOff(); visOff = null; } visDay = null; VIS = new Map(); }
const hm = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export function visitCard() {
  const today = dayKey(now()), day = S.visDay || today;
  if (!S.visOn) return `<div class="card"><h2>Who was online, and when</h2><div class="hint">Only admins can see this. It shows the times each person had the tracker open.</div><div class="line"><button class="btn" data-a="visShow">Show</button></div></div>`;
  visitWatch(day);
  const by = new Map(); for (const v of VIS.values()) { if (!v.email || !v.from) continue; if (!by.has(v.email)) by.set(v.email, []); by.get(v.email).push([v.from, v.to || v.from]); }
  const rows = [...by].sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0]))).map(([em, a]) => {
    a.sort((x, y) => x[0] - y[0]); const m = []; for (const r of a) { const l = m[m.length - 1]; if (l && r[0] - l[1] <= MIN) l[1] = Math.max(l[1], r[1]); else m.push([...r]); }   // join stretches that touch or overlap (two tabs open at once)
    const tot = m.reduce((s, r) => s + Math.max(1, Math.round((r[1] - r[0]) / MIN)), 0);
    return `<div class="prow"><span class="nm">${e(nameOf(em))}</span><span class="sm" style="flex:3 1 260px">${m.map(r => { const n = Math.round((r[1] - r[0]) / MIN); return `<span class="mono">${hm(r[0])}${n ? ' to ' + hm(r[1]) : ''}</span> <span class="muted">(${n ? dur(n) : 'under a minute'})</span>`; }).join(', ')}</span><span class="sm muted">${dur(tot)} in all</span></div>`; });
  return `<div class="card"><div class="line"><h2 class="grow">Who was online, and when</h2><label class="fld" for="visDay">Day<input type="date" id="visDay" data-c="visDay" value="${day}" max="${today}"></label><button class="btn sm" data-a="visHide">Hide</button></div>
   <div class="hint">Only admins can see this. Times are when the tracker was open and in front of the person, to about a minute. Recording started when this feature was added.</div>
   ${rows.length ? `<div class="plist">${rows.join('')}</div>` : '<div class="hint">Nobody is recorded for this day.</div>'}</div>`;
}
export function leave() { visitTick(true); if (S.fb && dataMode) B.commit([{ op: 'delete', path: 'presence/' + S.fb.uid }]).catch(() => {}); }
export function onlineHTML() {
  const t = now(), seen = new Set(), who = [...PRES.values()].filter(p => p.email && t - p.at < ONLINE && !seen.has(p.email) && seen.add(p.email))
    .sort((a, b) => (b.email === S.user) - (a.email === S.user) || nameOf(a.email).localeCompare(nameOf(b.email)));
  if (!who.length) return '';
  const ini = n => n.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''), nm = p => nameOf(p.email) + (p.email === S.user ? ' (you)' : '');
  return who.slice(0, 8).map(p => `<span class="dot ${p.email === S.user ? 'me' : ''}" title="${e(nm(p))} is online" aria-label="${e(nm(p))}">${e(ini(nameOf(p.email)))}</span>`).join('')
    + (who.length > 8 ? `<span class="dot more" title="${e(who.slice(8).map(nm).join(', '))}">+${who.length - 8}</span>` : '');
}
function drawOnline() { const el = $('#online'); if (el) el.innerHTML = onlineHTML(); }
setInterval(drawOnline, MIN);
document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); visitTick(document.hidden); });
addEventListener('pagehide', leave);
function stopData() { clearInterval(presT); clearInterval(visT); visitStop(); if (presOff) { presOff(); presOff = null; } PRES = new Map(); dataSubs.forEach(u => u()); dataSubs = []; projSubs.forEach(o => o.forEach(u => u())); projSubs.clear(); dataMode = null;
  for (const k of [...SRV.keys()]) if (k !== 'config/lab') SRV.delete(k);
  for (const k of [...pending]) if (k !== 'lab') pending.delete(k); }
function startData(mode) {
  stopData(); dataMode = mode;
  dataSubs = [
    watch('projects', 'projects', false, mode === 'sup' ? null : ['members', 'array-contains', S.user], syncProjSubs),
    watch('users', 'users', false, null), watch('protocols', 'protocols', false, null), watch('reagents', 'reagents', false, null), watch('places', 'places', false, null), watch('items', 'items', false, null),
    watch('duties', 'duties', false, null), watch('rota', 'rota', false, null), watch('dutyLog', 'dutyLog', false, null),
    watch('dutyRequests', 'dutyRequests', false, null), watch('progress', 'progress', false, null), watch('notices', 'notices', false, ['to', '==', S.user]),
    watch('backlog', blPath(), true)];
  presOff = B.watchCol('presence', null, m => { PRES = m; drawOnline(); }, () => {});
  beat(); presT = setInterval(beat, BEAT);
  visitTick(); visT = setInterval(visitTick, MIN);
}
export function stopAll() { stopData(); subs.forEach(u => u()); subs = []; SRV.clear(); pending.clear(); BASE = new Map(); S.ready = false; S.labErr = null; }

function col(prefix) {
  const n = prefix.split('/').length + 1, out = [];
  for (const [k, v] of SRV) if (k.startsWith(prefix + '/') && k.split('/').length === n) out.push({ ...clone(v), id: k.slice(prefix.length + 1) });
  return out;
}
export const byName = (a, b) => String(a.name).localeCompare(String(b.name)), byAt = (a, b) => (a.at || 0) - (b.at || 0);
export function rebuild() {
  DB.lab = SRV.has('config/lab') ? clone(SRV.get('config/lab')) : null;
  const want = S.fb && isMember() ? (seesAll() ? 'sup' : 'mem') : null;
  if (want !== dataMode) { if (want) startData(want); else stopData(); }
  DB.projects = col('projects').map(p => ({ desc: '', ...p, members: p.members || [], exps: p.exps || [], samples: p.samples || [] })).sort(byName);
  DB.exps = []; DB.sessions = []; DB.targets = []; DB.files = []; DB.obs = []; DB.animals = []; DB.asg = new Set();
  for (const p of DB.projects) {
    const b = 'projects/' + p.id;
    col(b + '/exps').forEach(x => DB.exps.push({ ...x, proj: p.id }));
    col(b + '/sessions').forEach(s => DB.sessions.push({ ...s, proj: p.id, ticks: s.ticks || {}, notes: s.notes || [], steps: s.steps || [], mice: s.mice || [], res: s.res || {} }));
    col(b + '/obs').forEach(o => DB.obs.push({ ...o, proj: p.id })); col(b + '/animals').forEach(a => DB.animals.push({ ...a, proj: p.id, files: a.files || [] }));
    col(b + '/targets').forEach(t => DB.targets.push({ ...t, proj: p.id, items: t.items || [] }));
    col(b + '/files').forEach(f => DB.files.push({ ...f, proj: p.id }));
    col(b + '/asg').forEach(a => (a.k || []).forEach(k => DB.asg.add(a.id + '|' + k)));
  }
  DB.sessions.sort((a, b) => a.startedAt - b.startedAt); DB.files.sort(byAt);
  // a deleted protocol that studies still use is kept out of sight ("gone") so their records keep working
  const allP = col('protocols').sort(byName); DB.protocols = allP.filter(p => !p.deleted); DB.gone = allP.filter(p => p.deleted); DB.reagents = col('reagents').sort(byName);
  DB.places = col('places').sort(byName); DB.items = col('items').sort(byName);
  DB.duties = col('duties').sort((a, b) => byAt(a, b) || byName(a, b));
  DB.progress = col('progress'); DB.dutyLog = col('dutyLog').sort(byAt); DB.requests = col('dutyRequests').sort(byAt); DB.notices = col('notices').sort(byAt);
  DB.rota = {}; col('rota').forEach(r => DB.rota[r.id] = r.d || {});
  DB.backlog = S.fb && SRV.has(blPath()) ? clone(SRV.get(blPath()).items || []) : [];
  S.people = new Map(col('users').map(u => [u.email, u]));
  buildIdx(); const prev = BASE; BASE = snap();
  if (dataMode && !pending.size) S.ready = true;
  if (S.ready) { restoreState(); followLink(); syncProgress(); }          // once everything has loaded, go back to where this tab was before a refresh
  fixSel();
  // Our own writes echo back through the listeners: redraw only if something really changed.
  if (sigNow() === lastSig && sameSnap(prev, BASE)) return;
  softRender();
}
/* Where you are (tab, study, what is open, an unsaved protocol being built) is kept for this browser tab,
   so a refresh comes back to the same place. It is kept in the tab only and cleared on sign-out. */
const KEEP = ['monView', 'monDay', 'selAnimal', 'mAll', 'tab', 'project', 'selMouse', 'selExp', 'selTarget', 'selProto', 'selNode', 'viewRev', 'openSession', 'planX', 'planType', 'planGroup', 'planQ', 'dOff', 'q', 'variant', 'edit', 'visOn', 'visDay', 'place'];
let restored = false;
export const forgetPlace = () => { restored = false; };   // on sign-out
export function saveState() {
  if (!S.fb || !S.ready || !restored) return;
  try { syncEdit(); const o = { uid: S.fb.uid, picked: [...S.picked] }; for (const k of KEEP) if (S[k] !== undefined) o[k] = S[k]; sessionStorage.setItem('lbt-state', JSON.stringify(o)); } catch (_) {}
}
function restoreState() {
  if (restored) return; restored = true;
  try {
    const o = JSON.parse(sessionStorage.getItem('lbt-state') || 'null'); if (!o || o.uid !== S.fb.uid) return;
    for (const k of KEEP) if (k in o) S[k] = o[k];
    if (!TABS.some(t => t[0] === S.tab)) S.tab = 'today';
    S.picked = new Set(Array.isArray(o.picked) ? o.picked : []);
    if (S.edit && (!Array.isArray(S.edit.steps) || !S.selProto)) S.edit = null;
  } catch (_) {}
}
addEventListener('pagehide', saveState);
let lastSig = '';   // what the screen was last drawn from, apart from DB itself
export const markDrawn = () => { lastSig = sigNow(); };
const sigNow = () => canon([S.ready, pending.has('lab'), S.labErr, dataMode, S.fb === undefined ? 'starting' : S.fb ? S.fb.uid : 'signed out', [...S.people]]);
function sameSnap(a, b) {
  if (a.size !== b.size) return false;
  for (const [p, c] of a) { const d = b.get(p); if (!d) return false; for (const k in c) if (c[k] !== d[k]) return false; for (const k in d) if (!(k in c)) return false; }
  return true;
}
/* DB as the documents it should be stored as */
function docs() {
  const m = new Map(), put = (path, ent) => { const o = {}; for (const k in ent) if (k !== 'id' && ent[k] !== undefined) o[k] = ent[k]; m.set(path, o); };
  if (DB.lab) put('config/lab', DB.lab);
  const pids = new Set(DB.projects.map(p => p.id));
  for (const p of DB.projects) put('projects/' + p.id, p);
  for (const [name, list] of [['exps', DB.exps], ['sessions', DB.sessions], ['targets', DB.targets], ['files', DB.files], ['obs', DB.obs], ['animals', DB.animals]])
    for (const x of list) if (pids.has(x.proj)) put(`projects/${x.proj}/${name}/${x.id}`, x);
  const ag = {};
  for (const k of DB.asg) { const i = k.indexOf('|'), x = X(k.slice(0, i)); if (!x || !pids.has(x.proj)) continue; (ag[`projects/${x.proj}/asg/${x.id}`] ||= []).push(k.slice(i + 1)); }
  for (const k in ag) m.set(k, { k: ag[k].sort() });
  for (const [name, list] of [['protocols', [...DB.protocols, ...DB.gone]], ['reagents', DB.reagents], ['places', DB.places], ['items', DB.items], ['duties', DB.duties], ['dutyLog', DB.dutyLog], ['dutyRequests', DB.requests], ['notices', DB.notices]])
    for (const x of list) put(name + '/' + x.id, x);
  for (const k in DB.rota) m.set('rota/' + k, { d: DB.rota[k] });
  if (S.fb && (DB.backlog.length || SRV.has(blPath()))) m.set(blPath(), { items: DB.backlog });
  return m;
}
function snap() { const out = new Map(); for (const [p, o] of docs()) { const c = {}; for (const k in o) c[k] = canon(o[k]); out.set(p, c); } return out; }
/* write whatever the last action changed: new documents whole, changed documents field by field */
export function commit() {
  if (!S.fb) return;
  const cur = snap(), ops = [];
  for (const [p, c] of cur) {
    const b = BASE.get(p);
    if (!b) { const d = {}; for (const k in c) d[k] = JSON.parse(c[k]); ops.push({ op: 'set', path: p, data: d }); continue; }
    const d = {}; let ch = false;
    for (const k in c) if (c[k] !== b[k]) { d[k] = JSON.parse(c[k]); ch = true; }
    for (const k in b) if (!(k in c)) { d[k] = B.DEL; ch = true; }
    if (ch) ops.push({ op: 'update', path: p, data: d });
  }
  for (const p of BASE.keys()) if (!cur.has(p)) ops.push({ op: 'delete', path: p });
  BASE = cur;
  if (!ops.length) return;
  // Put the change into our copy of the server state straight away, so a listener answering
  // for some other collection in the meantime does not make the new record vanish for a moment.
  const undo = [];
  for (const o of ops) {
    undo.push([o.path, SRV.get(o.path)]);
    if (o.op === 'delete') SRV.delete(o.path);
    else if (o.op === 'set') SRV.set(o.path, o.data);
    else { const d = { ...(SRV.get(o.path) || {}) }; for (const k in o.data) { if (o.data[k] === B.DEL) delete d[k]; else d[k] = o.data[k]; } SRV.set(o.path, d); }
  }
  B.commit(ops).catch(async first => {
    // The changes are sent together, so one refused change stops them all. Try them again one at a time:
    // whatever can be saved is saved, and only what was really refused is put back and reported.
    const bad = [];
    for (let i = 0; i < ops.length; i++) { try { await B.commit([ops[i]]); } catch (err) { bad.push({ i, path: ops[i].path, op: ops[i].op, fields: ops[i].op === 'update' ? Object.keys(ops[i].data).join(', ') : '', code: (err && err.code) || '', msg: (err && err.message) || String(err) }); } }
    if (!bad.length) return;
    for (const b of bad) { const [path, v] = undo[b.i]; if (v === undefined) SRV.delete(path); else SRV.set(path, v); }
    S.fail = { at: now(), of: ops.length, bad: bad.slice(0, 8), more: Math.max(0, bad.length - 8), first: (first && first.code) || '' };
    console.error('Not saved', bad);
    lastSig = ''; rebuild(); render();
  });
}
function fixSel() {
  const vis = DB.projects;
  if (!vis.some(p => p.id === S.project)) { S.project = vis[0]?.id || null; S.selMouse = null; S.picked.clear(); S.draft = newDraft(); S.tpick = null; S.selExp = undefined; S.planX = ''; }
  if (S.selProto && !P(S.selProto)) { S.selProto = null; S.edit = null; }
  if (S.selExp && !X(S.selExp)) S.selExp = undefined;
  if (S.openSession && !sess(S.openSession)) S.openSession = null;
  if (S.tpick && !DB.targets.some(t => t.id === S.tpick.t)) S.tpick = null;
  const m = S.modal;
  if (m && ((m.type === 'note' && !sess(m.id)) || (m.type === 'run' && !X(m.x)) || (m.type === 'pre' && !(X(S.selExp) && S.picked.size)) || (['split', 'addVar', 'print', 'delProto'].includes(m.type) && !P(S.selProto)))) S.modal = null;
}
