// Lab Bench Tracker: the full app.
// Everything on screen is drawn from DB, an in-memory copy of what this account may read in
// Firestore. Actions change DB, then commit() works out what changed and writes only that.
// No lab data lives in this repository: all records are in Firestore behind firestore.rules.

import * as B from './backend.js';
import { LAB_OWNER } from './config.js';

const $ = s => document.querySelector(s);
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const low = s => String(s || '').trim().toLowerCase();
const WITS = /@(students\.)?wits\.ac\.za$/i;
const DAY = 864e5, MIN = 6e4, now = () => Date.now();
function wkStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
const WK = wkStart(now());
const dur = m => { m = Math.max(0, Math.round(m)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''); };
const dt = t => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const wkLabel = w => dt(w) + ' to ' + dt(w + 6 * DAY);
const flag = (k, t) => `<span class="flag ${k}">${e(t)}</span>`;
const nid = () => 'i' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const safeUrl = u => /^https?:\/\//i.test(u) ? u : '';
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => el.hidden = true, 4200); }
const errMsg = err => (err && err.code === 'permission-denied') ? 'Not allowed: your account does not have permission for that.' : (err && err.message) || String(err);

/* ---------------- state ---------------- */
const DB = { lab: null, projects: [], exps: [], sessions: [], files: [], targets: [], asg: new Set(), protocols: [], reagents: [], duties: [], rota: {}, dutyLog: [], requests: [], notices: [], backlog: [] };
const S = { fb: null, user: '', ready: false, labErr: null, people: new Map(), tab: 'today', project: null, selMouse: null, mx: null, selExp: undefined, selTarget: '', picked: new Set(), selProto: null, selNode: null, viewRev: null, edit: null, openSession: null, freeMin: null, q: '', modal: null, variant: null, tpick: null, draft: null, planX: '', dOff: 0, addT: new Set(), addG: '', smOpen: false };
let IDX = new Map();
const newDraft = () => ({ week: WK + 7 * DAY, items: [], pick: new Set(), exp: '', override: false }); S.draft = newDraft();

/* ---------------- people and roles ---------------- */
const sups = () => DB.lab?.supervisors || [], admins = () => DB.lab?.admins || [];
const isSup = () => sups().includes(S.user);
const isAdmin = () => admins().includes(S.user);
const isMember = () => !!DB.lab && (isSup() || isAdmin() || (DB.lab.members || []).includes(S.user));
const canLab = () => isSup() || isAdmin();
const nameOf = em => S.people.get(em)?.name || em;
const roleOf = em => sups().includes(em) ? 'Supervisor' : admins().includes(em) ? 'Admin' : 'Member';
const allPeople = () => [...new Set([...sups(), ...admins(), ...(DB.lab?.members || [])])].sort();
/* users[email] gives a name for anyone, including people who have not signed in yet */
const users = new Proxy({}, { get: (_, em) => ({ name: nameOf(em), role: roleOf(em), sup: sups().includes(em) }) });

/* ---------------- sync with Firestore ---------------- */
const SRV = new Map();         // path -> data as last heard from Firestore
let BASE = new Map();          // path -> {field: canonical text} as of the last rebuild or commit
const pending = new Set();     // listeners that have not answered yet
let subs = [], dataSubs = [], dataMode = null; const projSubs = new Map();
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, q) => (o[q] = x[q], o), {}) : x);
const clone = v => JSON.parse(JSON.stringify(v));
const blPath = () => 'users/' + S.fb.uid + '/private/backlog';

function watch(key, path, isDoc, filter, before, retry) {
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
    projSubs.set(id, ['exps', 'sessions', 'targets', 'files', 'asg'].map(c => watch('p:' + id + ':' + c, 'projects/' + id + '/' + c, false, null, null, true)));
}
/* who has the site open: each open tab writes a small "here" note every few minutes */
let PRES = new Map(), presOff = null, presT = null;
const BEAT = 3 * MIN, ONLINE = 7 * MIN;
function beat() { if (S.fb && dataMode && !document.hidden) B.commit([{ op: 'set', path: 'presence/' + S.fb.uid, data: { email: S.user, at: now() } }]).catch(() => {}); }
function leave() { if (S.fb && dataMode) B.commit([{ op: 'delete', path: 'presence/' + S.fb.uid }]).catch(() => {}); }
function onlineHTML() {
  const t = now(), seen = new Set(), who = [...PRES.values()].filter(p => p.email && t - p.at < ONLINE && !seen.has(p.email) && seen.add(p.email))
    .sort((a, b) => (b.email === S.user) - (a.email === S.user) || nameOf(a.email).localeCompare(nameOf(b.email)));
  if (!who.length) return '';
  const ini = n => n.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''), nm = p => nameOf(p.email) + (p.email === S.user ? ' (you)' : '');
  return who.slice(0, 8).map(p => `<span class="dot ${p.email === S.user ? 'me' : ''}" title="${e(nm(p))} is online" aria-label="${e(nm(p))}">${e(ini(nameOf(p.email)))}</span>`).join('')
    + (who.length > 8 ? `<span class="dot more" title="${e(who.slice(8).map(nm).join(', '))}">+${who.length - 8}</span>` : '');
}
function drawOnline() { const el = $('#online'); if (el) el.innerHTML = onlineHTML(); }
setInterval(drawOnline, MIN);
document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
addEventListener('pagehide', leave);
function stopData() { clearInterval(presT); if (presOff) { presOff(); presOff = null; } PRES = new Map(); dataSubs.forEach(u => u()); dataSubs = []; projSubs.forEach(o => o.forEach(u => u())); projSubs.clear(); dataMode = null;
  for (const k of [...SRV.keys()]) if (k !== 'config/lab') SRV.delete(k);
  for (const k of [...pending]) if (k !== 'lab') pending.delete(k); }
function startData(mode) {
  stopData(); dataMode = mode;
  dataSubs = [
    watch('projects', 'projects', false, mode === 'sup' ? null : ['members', 'array-contains', S.user], syncProjSubs),
    watch('users', 'users', false, null), watch('protocols', 'protocols', false, null), watch('reagents', 'reagents', false, null),
    watch('duties', 'duties', false, null), watch('rota', 'rota', false, null), watch('dutyLog', 'dutyLog', false, null),
    watch('dutyRequests', 'dutyRequests', false, null), watch('notices', 'notices', false, ['to', '==', S.user]),
    watch('backlog', blPath(), true)];
  presOff = B.watchCol('presence', null, m => { PRES = m; drawOnline(); }, () => {});
  beat(); presT = setInterval(beat, BEAT);
}
function stopAll() { stopData(); subs.forEach(u => u()); subs = []; SRV.clear(); pending.clear(); BASE = new Map(); S.ready = false; S.labErr = null; }

function col(prefix) {
  const n = prefix.split('/').length + 1, out = [];
  for (const [k, v] of SRV) if (k.startsWith(prefix + '/') && k.split('/').length === n) out.push({ ...clone(v), id: k.slice(prefix.length + 1) });
  return out;
}
const byName = (a, b) => String(a.name).localeCompare(String(b.name)), byAt = (a, b) => (a.at || 0) - (b.at || 0);
function rebuild() {
  DB.lab = SRV.has('config/lab') ? clone(SRV.get('config/lab')) : null;
  const want = S.fb && isMember() ? (isSup() ? 'sup' : 'mem') : null;
  if (want !== dataMode) { if (want) startData(want); else stopData(); }
  DB.projects = col('projects').map(p => ({ desc: '', ...p, members: p.members || [], exps: p.exps || [], samples: p.samples || [] })).sort(byName);
  DB.exps = []; DB.sessions = []; DB.targets = []; DB.files = []; DB.asg = new Set();
  for (const p of DB.projects) {
    const b = 'projects/' + p.id;
    col(b + '/exps').forEach(x => DB.exps.push({ ...x, proj: p.id }));
    col(b + '/sessions').forEach(s => DB.sessions.push({ ...s, proj: p.id, ticks: s.ticks || {}, notes: s.notes || [], steps: s.steps || [], mice: s.mice || [] }));
    col(b + '/targets').forEach(t => DB.targets.push({ ...t, proj: p.id, items: t.items || [] }));
    col(b + '/files').forEach(f => DB.files.push({ ...f, proj: p.id }));
    col(b + '/asg').forEach(a => (a.k || []).forEach(k => DB.asg.add(a.id + '|' + k)));
  }
  DB.sessions.sort((a, b) => a.startedAt - b.startedAt); DB.files.sort(byAt);
  DB.protocols = col('protocols').sort(byName); DB.reagents = col('reagents').sort(byName);
  DB.duties = col('duties').sort((a, b) => byAt(a, b) || byName(a, b));
  DB.dutyLog = col('dutyLog').sort(byAt); DB.requests = col('dutyRequests').sort(byAt); DB.notices = col('notices').sort(byAt);
  DB.rota = {}; col('rota').forEach(r => DB.rota[r.id] = r.d || {});
  DB.backlog = S.fb && SRV.has(blPath()) ? clone(SRV.get(blPath()).items || []) : [];
  S.people = new Map(col('users').map(u => [u.email, u]));
  buildIdx(); const prev = BASE; BASE = snap();
  if (dataMode && !pending.size) S.ready = true;
  fixSel();
  // Our own writes echo back through the listeners: redraw only if something really changed.
  if (sigNow() === lastSig && sameSnap(prev, BASE)) return;
  softRender();
}
let lastSig = '';   // what the screen was last drawn from, apart from DB itself
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
  for (const [name, list] of [['exps', DB.exps], ['sessions', DB.sessions], ['targets', DB.targets], ['files', DB.files]])
    for (const x of list) if (pids.has(x.proj)) put(`projects/${x.proj}/${name}/${x.id}`, x);
  const ag = {};
  for (const k of DB.asg) { const i = k.indexOf('|'), x = X(k.slice(0, i)); if (!x || !pids.has(x.proj)) continue; (ag[`projects/${x.proj}/asg/${x.id}`] ||= []).push(k.slice(i + 1)); }
  for (const k in ag) m.set(k, { k: ag[k].sort() });
  for (const [name, list] of [['protocols', DB.protocols], ['reagents', DB.reagents], ['duties', DB.duties], ['dutyLog', DB.dutyLog], ['dutyRequests', DB.requests], ['notices', DB.notices]])
    for (const x of list) put(name + '/' + x.id, x);
  for (const k in DB.rota) m.set('rota/' + k, { d: DB.rota[k] });
  if (S.fb && (DB.backlog.length || SRV.has(blPath()))) m.set(blPath(), { items: DB.backlog });
  return m;
}
function snap() { const out = new Map(); for (const [p, o] of docs()) { const c = {}; for (const k in o) c[k] = canon(o[k]); out.set(p, c); } return out; }
/* write whatever the last action changed: new documents whole, changed documents field by field */
function commit() {
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
  B.commit(ops).catch(err => {
    toast(errMsg(err));
    for (const [path, v] of undo) { if (v === undefined) SRV.delete(path); else SRV.set(path, v); }
    lastSig = ''; rebuild();
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
  if (m && ((m.type === 'note' && !sess(m.id)) || (m.type === 'run' && !X(m.x)) || (m.type === 'pre' && !(X(S.selExp) && S.picked.size)) || (['split', 'addVar', 'print'].includes(m.type) && !P(S.selProto)))) S.modal = null;
}

/* ---------------- step blocks and reagents ---------------- */
const KINDS = ['Mount', 'Image / view', 'Storage', 'Thaw', 'Fix', 'Centrifuge', 'Collect / label', 'Custom'];
const mkRev = (n, at, by, note, steps) => ({ n, at, by, note, steps });
const plog = (p, text) => { (p.log = p.log || []).push({ at: now(), by: S.user, text }); };   // changes that are not a new revision: renames, reagent links
const R = id => DB.reagents.find(r => r.id === id);
/* a step's reagent is one from the lab list, or ('@name') a name typed in the builder that can be linked to the list later */
const typed = s => s.reagent === '@name' ? (s.rname || '').trim() : '';
const rnm = s => typed(s) || (R(s.reagent) ? R(s.reagent).name : '');
const lbl = s => s.t || (s.type === 'wash' ? `Wash ${s.reps}×${s.vol ? ' in ' + s.vol + ' ' + s.unit : ''}${rnm(s) ? ' ' + rnm(s) : ''}` : s.type === 'inc' ? 'Incubate' + (rnm(s) ? ' in ' + rnm(s) : '') : s.kind + (rnm(s) ? ' with ' + rnm(s) : ''));
const rn = s => s.reagent === '@target' ? 'of the reagent linked to the gene or protein' : rnm(s);
const typedNames = p => { const m = new Map(); for (const n of p.nodes) for (const r of n.revs) for (const q of r.steps) { const t = typed(q); if (t && !m.has(low(t))) m.set(low(t), t); } return [...m.values()]; };
const amt = s => s.vol && rn(s) ? `${s.vol} ${s.unit}${s.type === 'wash' && s.reps > 1 ? ' × ' + s.reps : ''} ${rn(s)}, per ${s.per}` : '';
const blank = (type, kind) => ({ type, kind: kind || 'Custom', t: '', m: type === 'wash' ? 15 : type === 'inc' ? 60 : 10, w: type === 'inc', reagent: '', rname: '', vol: type === 'wash' ? 5 : 0, unit: 'mL', reps: type === 'wash' ? 3 : 1, each: 5, per: 'sample', checks: [], note: '' });
const toML = (v, u) => u === 'µL' ? v / 1000 : v;
const fmtV = (ml, u) => u === 'µL' ? Math.round(ml * 1000) + ' µL' : (Math.round(ml * 10) / 10) + ' mL';
const needML = (q, n) => q.vol && q.reagent ? toML(q.vol, q.unit) * (q.type === 'wash' ? q.reps : 1) * (q.per === 'batch' ? 1 : n) : 0;
/* stock is never typed in: it is bottles bought minus what every finished step has drawn (kept as "used" on the reagent) */
function stock(r) { const tot = toML(r.bottles * r.per, r.unit), left = Math.max(0, tot - (r.used || 0)); return { tot, left, low: left <= toML(r.low, r.unit) }; }
const lowList = () => DB.reagents.filter(r => stock(r).low);
const inProj = q => !!proj() && projExps().some(x => x.proto === q.id);
const usedIn = q => DB.projects.filter(pr => pr.exps.some(id => X(id)?.proto === q.id)).map(pr => pr.name).join(', ') || 'no project yet';
const stepLi = (s, i) => `<li><span class="n">${i + 1}</span><div class="tx"><b>${e(lbl(s))}</b>${amt(s) ? `<div class="sm muted">${e(amt(s))}</div>` : ''}${typed(s) ? `<div class="sm muted">${e(typed(s))} is not linked to the reagent list yet, so its stock is not counted.</div>` : ''}${s.checks.filter(Boolean).map(c => `<div class="sm">☐ ${e(c)}</div>`).join('')}${s.note ? `<div class="sm muted">Comment: ${e(s.note)}</div>` : ''}</div><div class="rt sm muted">${dur(s.m)} · ${s.w ? 'hands-free' : 'hands-on'}</div></li>`;
const prevHTML = steps => steps.length ? `<div class="sm muted">${dur(tot(steps))} in total · ${dur(hands(steps))} hands-on</div><ol class="steps">${steps.map(stepLi).join('')}</ol>` : '<div class="hint">Nothing yet. Add the first block on the left.</div>';
function blkHTML(s, i) {
  const sel = (f, opts, v) => `<select data-f="${f}">${opts.map(o => `<option value="${e(o[0])}" ${o[0] === v ? 'selected' : ''}>${e(o[1])}</option>`).join('')}</select>`;
  return `<div class="blk ${s.type}" data-i="${i}"><div class="line"><b class="grow">Step ${i + 1} · ${s.type === 'wash' ? 'Wash' : s.type === 'inc' ? 'Incubation' : 'Other'}</b><button class="btn sm" data-a="edUp" data-i="${i}" aria-label="Move step up" ${i ? '' : 'disabled'}>↑</button><button class="btn sm" data-a="edDown" data-i="${i}" aria-label="Move step down">↓</button><button class="btn sm" data-a="edDel" data-i="${i}">Remove</button></div>
   <input type="text" data-f="t" value="${e(s.t)}" placeholder="Description (optional). Left empty, it is written from the choices below." aria-label="Description">
   <div class="bf">${s.type === 'other' ? `<label>Kind${sel('kind', KINDS.map(k => [k, k]), s.kind)}</label>` : ''}
    <label>Reagent${sel('reagent', [['', 'None'], ['@name', 'Not in the list: type its name'], ['@target', 'Depends on the gene or protein']].concat(DB.reagents.map(r => [r.id, r.name])), s.reagent)}</label>
    ${s.reagent === '@name' ? `<label>Reagent name<input type="text" data-f="rname" value="${e(s.rname || '')}" placeholder="e.g. PBS" list="rgNames"></label>` : ''}
    <label>Amount<input type="number" data-f="vol" value="${s.vol || ''}" min="0" step="any"></label><label>Unit${sel('unit', [['mL', 'mL'], ['µL', 'µL']], s.unit)}</label>
    <label>Per${sel('per', [['sample', 'sample'], ['batch', 'batch']], s.per)}</label>
    ${s.type === 'wash' ? `<label>Times<input type="number" data-f="reps" value="${s.reps}" min="1"></label><label>Min per wash<input type="number" data-f="each" value="${s.each}" min="0" step="any"></label>`
      : `<label>Minutes<input type="number" data-f="m" value="${s.m}" min="0"></label><label class="ck"><input type="checkbox" data-f="w" ${s.w ? 'checked' : ''}> Hands-free</label>`}</div>
   ${s.checks.map((c, j) => `<div class="line"><span aria-hidden="true">☐</span><input type="text" data-f="chk" class="grow" value="${e(c)}" placeholder="What to tick off, e.g. kept in the dark" aria-label="Check box text"><button class="btn sm" data-a="ckDel" data-i="${i}" data-j="${j}">Remove</button></div>`).join('')}
   <div class="line"><button class="btn sm" data-a="ckAdd" data-i="${i}">Add a check box</button><input type="text" data-f="note" class="grow" value="${e(s.note)}" placeholder="Comment for whoever runs this step (optional)" aria-label="Comment"></div></div>`;
}
function builderHTML(p, n) {
  const E = S.edit, first = !cur(n).steps.length;
  return `<div class="bld"><div class="stack"><h3>Build ${e(p.name)} ${e(vname(p, n))}</h3><div class="hint">${first ? 'Add the blocks in the order they are done at the bench.' : `Saving makes rev ${cur(n).n + 1}. Runs already done keep rev ${cur(n).n} and earlier exactly as they were performed.`}</div>
   <label class="sm" for="edName"><b>Protocol name</b></label><input type="text" id="edName" value="${e(E.name)}">
   <datalist id="rgNames">${DB.reagents.map(r => `<option value="${e(r.name)}">`).join('')}</datalist>
   ${preHTML(p)}
   <div id="edRows" class="stack">${E.steps.map(blkHTML).join('')}</div>
   <div class="addrow"><b>Step ${E.steps.length + 1}</b><button class="btn sm" data-a="edAdd" data-t="wash">Add wash</button><button class="btn sm" data-a="edAdd" data-t="inc">Add incubation</button><select id="addOther" data-c="addOther" aria-label="Add another kind of step"><option value="">Add other…</option>${KINDS.map(k => `<option>${e(k)}</option>`).join('')}</select></div>
   ${first ? '' : `<label class="sm" for="edNote"><b>What changed and why</b> (required, kept in the history)</label><input type="text" id="edNote" value="${e(E.note)}">`}
   <div class="line"><button class="btn pri" data-a="edSave">Save as rev ${first ? 1 : cur(n).n + 1}</button><button class="btn" data-a="edCancel">Cancel</button><span class="err" id="edErr"></span></div></div>
  <div class="stack"><h3>How it will look at the bench</h3><div id="prev" class="stack">${prevHTML(E.steps)}</div></div></div>`;
}

/* ---------------- protocol versions ---------------- */
const P = id => DB.protocols.find(p => p.id === id), X = id => DB.exps.find(x => x.id === id), PR = id => DB.projects.find(p => p.id === id);
const kids = (p, id) => p.nodes.filter(n => n.parent === id);
const isLeaf = (p, n) => !kids(p, n.id).length;
const leaves = p => p.nodes.filter(n => isLeaf(p, n));
function path(p, n) { const a = []; while (n) { a.unshift(kids(p, n.parent).indexOf(n) + 1); n = p.nodes.find(x => x.id === n.parent); } return a; }
const depth = p => Math.max(...p.nodes.map(n => path(p, n).length));
/* V1.<variant>.<sub-variant>; a variant that is not subdivided gets .0 so every number has the same length */
function vlabel(p, n) { if (p.nodes.length === 1) return 'V1.0'; const a = path(p, n); if (isLeaf(p, n)) while (a.length < depth(p)) a.push(0); return 'V1.' + a.join('.'); }
const vname = (p, n) => vlabel(p, n) + (n.name === 'Standard' ? '' : ' ' + n.name);
const cur = n => n.revs[n.revs.length - 1];
const tot = s => s.reduce((a, x) => a + x.m, 0), hands = s => s.reduce((a, x) => a + (x.w ? 0 : x.m), 0), maxW = s => Math.max(0, ...s.filter(x => x.w).map(x => x.m));
/* what a protocol starts from: "reliant" needs a processed sample from an earlier protocol, "initial" is one that others start from, "entire" runs start to end on its own */
const srcs = p => p.rel ? (p.from || []).map(P).filter(Boolean) : [];
const feeds = p => DB.protocols.filter(q => srcs(q).includes(p));
const relies = (q, p, seen = new Set()) => q === p || (!seen.has(q) && (seen.add(q), srcs(q).some(x => relies(x, p, seen))));
const ptype = p => p.rel ? 'Reliant' : feeds(p).length ? 'Initial' : 'Entire';
const names = a => a.map(q => q.name).join(', ');
const ptypeLine = p => p.rel ? `Reliant protocol: needs a processed sample from ${srcs(p).length ? names(srcs(p)) : 'an earlier protocol (not chosen yet)'}${feeds(p).length ? ', and leads into ' + names(feeds(p)) : ''}` : feeds(p).length ? `Initial protocol: leads into ${names(feeds(p))}` : 'Entire protocol: runs from start to end on its own';
/* has the earlier protocol been done for this sample: a finished session in the study, or a note that it was done before */
const priorOf = (pr, q, m) => (pr.prior || {})[q.id + '|' + m];
const doneSess = (pr, q, m) => DB.sessions.find(s => s.proj === pr.id && s.proto === q.id && s.doneAt && s.mice.includes(m));
const lacking = (x, mice) => { const ss = srcs(P(x.proto)), pr = PR(x.proj); return ss.length ? mice.filter(m => !ss.some(q => doneSess(pr, q, m) || priorOf(pr, q, m))) : []; };
const dty = t => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
function preLine(x, m) {
  const pr = PR(x.proj), ss = srcs(P(x.proto)); if (!ss.length) return '';
  return `<div class="sm muted">Previous step: ${ss.map(q => { const s = doneSess(pr, q, m), k = priorOf(pr, q, m); return e(q.name) + (s ? ' done ' + dty(s.doneAt) : k ? ` recorded as already done${k.at ? ' on ' + dty(k.at) : ', date not known'} (by ${e(users[k.by].name)})` : ' not recorded'); }).join(' · ')}</div>`;
}
/* reagents typed by name in this protocol, each with a way to tie it to the lab's reagent list afterwards */
function linkHTML(p) {
  const names = typedNames(p); if (!names.length) return '';
  return `<div class="card" style="margin:12px 0"><h3>Reagents typed by name</h3><div class="hint">These are not in the lab's reagent list yet, so no stock is counted for them. Link each one to the list when it is there.</div>
   ${names.map((t, i) => { const hit = DB.reagents.find(r => low(r.name) === low(t)); return `<div class="line" style="flex-wrap:wrap"><b class="grow">${e(t)}</b>${DB.reagents.length ? `<select id="lk${i}" aria-label="Reagent to link ${e(t)} to">${DB.reagents.map(r => `<option value="${r.id}" ${r === hit ? 'selected' : ''}>${e(r.name)}</option>`).join('')}</select><button class="btn sm ${hit ? 'pri' : ''}" data-a="rgLink" data-n="${e(t)}" data-sel="lk${i}">Link</button>` : ''}${hit ? '' : `<button class="btn sm" data-a="rgFromName" data-n="${e(t)}">Add to the reagent list</button>`}</div>`; }).join('')}</div>`;
}
function preHTML(p) {
  const opts = DB.protocols.filter(q => !relies(q, p)), from = p.from || [];
  return `<div class="addrow" style="flex-wrap:wrap"><label class="ck"><input type="checkbox" data-c="preOn" ${p.rel ? 'checked' : ''}> <b>Required from previous step</b></label><span class="sm muted">${p.rel ? 'This protocol starts from a sample that another protocol has already processed.' : 'Tick this if the protocol needs a sample that another protocol has already processed, for example sections from FFPE.'}</span>
   ${p.rel ? `<div class="stack" style="flex-basis:100%"><div class="sm"><b>Which protocol does the sample come from?</b></div>${opts.length ? `<div class="line" style="flex-wrap:wrap">${opts.map(q => `<label class="ck sm"><input type="checkbox" data-c="preFrom" data-p="${q.id}" ${from.includes(q.id) ? 'checked' : ''}> ${e(q.name)}</label>`).join('')}</div>` : '<div class="hint">There is no other protocol to choose yet. Create the earlier protocol, then come back and tick it here.</div>'}<div class="sm muted">This applies to every variant and is saved as soon as you tick it.</div></div>` : ''}</div>`;
}
function walk(p, parent, out = []) { for (const n of kids(p, parent)) { out.push(n); walk(p, n.id, out); } return out; }

/* ---------------- runs ---------------- */
const key = (x, t, m) => x + '|' + (t || '') + '|' + m;
function buildIdx() { IDX = new Map(); for (const s of DB.sessions) for (const m of s.mice) IDX.set(key(s.exp, s.target, m), s); }
const runOf = (x, t, m) => IDX.get(key(x, t, m));
const stOf = (x, t, m) => { const s = runOf(x, t, m); return s ? (s.doneAt ? 'done' : 'run') : DB.asg.has(key(x, t, m)) ? 'todo' : 'na'; };
const sess = id => DB.sessions.find(s => s.id === id);
function newSession(projId, exp, target, mice, nodeId, revN, by) {
  const x = X(exp), p = P(x.proto), n = p.nodes.find(q => q.id === nodeId), r = n.revs.find(q => q.n === revN) || cur(n);
  const s = { id: nid(), proj: projId, exp, target: target || '', mice, proto: p.id, node: n.id, pname: p.name, label: vname(p, n), rev: r.n, steps: r.steps.map(q => { const z = { ...q, reagent: q.reagent === '@target' ? (x.treag && x.treag[target]) || '' : q.reagent, checks: [...q.checks] }; z.t = lbl(z); return z; }), ticks: {}, stepIdx: 0, waitStart: null, notes: [], startedAt: now(), doneAt: null, by };
  DB.sessions.push(s); return s;
}

/* ---------------- access ---------------- */
const visProj = () => DB.projects;
const proj = () => PR(S.project);
const projExps = () => proj() ? proj().exps.map(X).filter(Boolean) : [];
const notice = (to, text) => { if (to && to !== S.user) DB.notices.push({ id: nid(), to, at: now(), text, by: S.user, mailedAt: null }); };
/* mailedAt stays null until the lab's mail sheet has emailed the notice */
const inbox = () => DB.notices.filter(n => n.to === S.user && !n.cleared);
const tm = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const noticeSup = text => sups().forEach(u => notice(u, text));
const noProj = () => `<div class="card"><h2>No study yet</h2><div class="hint">A study holds your samples, the experiments planned on them and your weekly targets. Create one to get started.</div><div class="line"><button class="btn pri" data-a="newStudy">New study</button></div></div>`;

/* ---------------- targets and time estimates ---------------- */
const iName = i => (X(i.exp)?.name || 'Removed experiment') + (i.target ? ' ' + i.target : '');
const tN = t => t.items.reduce((a, i) => a + i.mice.length, 0);
const tName = t => t.items.map(i => iName(i) + ' × ' + i.mice.length).join(', ');
const inWk = (s, w) => s && s.doneAt && s.doneAt >= w && s.doneAt < w + 7 * DAY;
const tDone = t => t.items.reduce((a, i) => a + i.mice.filter(m => inWk(runOf(i.exp, i.target, m), t.week)).length, 0);
function tState(t) { if (t.status !== 'agreed') return t.status; if (tDone(t) >= tN(t)) return 'met'; if (now() >= t.week + 7 * DAY) return t.excuse ? 'explained' : 'missed'; return 'open'; }
const lockFor = u => DB.targets.find(t => t.user === u && tState(t) === 'missed');
const TS = { proposed: ['info', 'Waiting for Prof Kaur'], change: ['warn', 'Change requested'], met: ['ok', 'Met'], missed: ['bad', 'Missed, no explanation yet'], explained: ['warn', 'Missed, explained'], open: ['info', 'In progress'] };
/* Batch time = protocol time for one sample + b minutes for each extra sample.
   b is fitted from how long finished sessions really took; with no sessions it is a first guess. */
function model(xid) {
  const x = X(xid), p = x && P(x.proto); if (!p) return { a: 0, b: 0, k: 0 };
  const steps = cur(leaves(p)[0]).steps, a = tot(steps); let num = 0, den = 0, k = 0;
  for (const s of DB.sessions) { if (s.proto !== x.proto || !s.doneAt || s.mice.length < 2) continue; const d = (s.doneAt - s.startedAt) / MIN; if (d < a * .5) continue; k++; num += (d - a) * (s.mice.length - 1); den += (s.mice.length - 1) ** 2; }
  return { a, b: k ? Math.max(0, num / den) : hands(steps) * .05, k };
}
const est = (xid, n) => { if (!n) return 0; const m = model(xid); return m.a + m.b * (n - 1); };
const mdlText = id => { const m = model(id); return `${e(X(id)?.name || '')}: ${dur(m.a)} for one sample, each extra adds about ${m.b.toFixed(1)} min (${m.k ? 'learned from ' + m.k + ' finished session' + (m.k > 1 ? 's' : '') : 'first guess, no sessions yet'})`; };
function weekLoad(user, week, extra) {
  const its = DB.targets.filter(t => t.user === user && t.week === week && t.status !== 'change').flatMap(t => t.items).concat(extra || []);
  const bs = its.map(i => est(i.exp, i.mice.length)).sort((a, b) => b - a), days = [0, 0, 0, 0, 0]; let over = false;
  for (const m of bs) { let d = days.findIndex(x => x + m <= 360); if (d < 0) { d = days.indexOf(Math.min(...days)); over = true; } days[d] += m; }
  return { days, over, total: bs.reduce((a, b) => a + b, 0) };
}
function loadHTML(L) { const N = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']; return `<div class="days">${L.days.map((m, i) => `<div class="${m > 360 ? 'ov' : ''}"><span>${N[i]}</span><div class="bar"><i style="width:${Math.min(100, m / 360 * 100)}%"></i></div><span class="mono">${m ? dur(m) : 'free'}</span></div>`).join('')}</div>`; }
const overMsg = 'At least one day needs more than 6 hours at the bench.';
function tCard(t, act) {
  const d = tDone(t), n = tN(t), s = tState(t), own = t.user === S.user, canRun = own && t.status === 'agreed' && t.week <= WK, L = own && t.week >= WK && weekLoad(t.user, t.week);
  return `<div class="card"><div class="line"><b class="grow">Week of ${wkLabel(t.week)}</b>${flag(...TS[s])}</div>
  <div class="sm muted">${e(users[t.user].name)} · ${e(PR(t.proj)?.name || '')} · ${d} of ${n} done</div>
  <div class="bar"><i style="width:${n ? Math.min(100, d / n * 100) : 0}%"></i></div>
  ${t.items.map((i, k) => {
    const pk = S.tpick && S.tpick.t === t.id && S.tpick.k === k ? S.tpick.set : null;
    return `<div class="ti"><div class="line"><b class="grow sm">${e(iName(i))} · ${i.mice.length} samples</b>${own ? `<span class="sm muted">about ${dur(est(i.exp, i.mice.length))} as one batch</span>` : ''}</div>
    <div class="mcs">${i.mice.map(m => { const st = stOf(i.exp, i.target, m); return st === 'todo' && canRun ? `<button class="mc ${pk && pk.has(m) ? 'on' : ''}" data-a="tpick" data-id="${t.id}" data-k="${k}" data-m="${e(m)}" aria-pressed="${!!(pk && pk.has(m))}">${e(m)}</button>` : `<span class="mc ${st}">${e(m)}${st === 'done' ? ' ✓' : st === 'run' ? ' ◔' : ''}</span>`; }).join('')}</div>
    ${pk && pk.size ? `<div class="line"><button class="btn sm pri" data-a="tstart">Start bench session with these ${pk.size}</button><span class="sm muted">about ${dur(est(i.exp, pk.size))}</span></div>` : ''}</div>`;
  }).join('')}
  ${canRun && d < n ? '<div class="hint">Click the samples you are doing now, then start the session. The others stay on the plan for another day.</div>' : ''}
  ${L ? `<div class="ti"><div class="sm"><b>Does the week fit?</b> <span class="muted">Only you see this. Batches packed into days of 6 hours.</span></div>${loadHTML(L)}${L.over ? `<div class="err">${overMsg}${t.override ? ' You chose to go ahead anyway.' : ''}</div>` : ''}</div>` : ''}
  ${t.note ? `<div class="sm"><b>Prof Kaur:</b> ${e(t.note)}</div>` : ''}
  ${t.excuse ? `<div class="sm"><b>What happened:</b> ${e(t.excuse.what)}<br><b>Why the target was missed:</b> ${e(t.excuse.why)}<br><b>Plan:</b> ${e(t.excuse.plan)}</div>` : ''}${act || ''}</div>`;
}
/* Per experiment, across every planned week: done so far against where the plan says you should be today.
   Past weeks count in full, the current week pro rata over its five working days, future weeks not yet. */
function progHTML() {
  const sup = isSup(), M = new Map(), el = Math.min(1, (now() - WK) / (5 * DAY));
  for (const t of DB.targets) {
    if (t.status === 'change' || !(sup || t.user === S.user)) continue; const f = t.week < WK ? 1 : t.week === WK ? el : 0;
    for (const i of t.items) {
      const k = t.user + '|' + i.exp + '|' + i.target; let r = M.get(k); if (!r) M.set(k, r = { name: (sup ? users[t.user].name + ': ' : '') + iName(i), n: 0, d: 0, x: 0, last: 0 });
      r.n += i.mice.length; r.x += i.mice.length * f; r.d += i.mice.filter(m => stOf(i.exp, i.target, m) === 'done').length; r.last = Math.max(r.last, t.week);
    }
  }
  if (!M.size) return '';
  return `<div class="card"><h2>Progress against the plan</h2><div class="hint">One bar per experiment, across every week planned so far. The dark line is where the plan says you should be today.</div>${[...M.values()].filter(r => r.n).map(r => {
    const k = r.d < Math.floor(r.x) ? 'bad' : r.d > Math.ceil(r.x) ? 'ok' : '';
    return `<div class="pg"><b class="sm">${e(r.name)}</b>${flag(k, k === 'bad' ? 'Behind' : k === 'ok' ? 'Ahead' : 'On track')}<div class="bar pos ${k}"><i style="width:${r.d / r.n * 100}%"></i><b style="left:${Math.min(99.5, r.x / r.n * 100)}%"></b></div><span class="cap sm muted">${r.d} of ${r.n} planned samples done · ${Math.round(r.x)} expected by today · plan runs to ${dt(r.last + 6 * DAY)}</span></div>`;
  }).join('')}</div>`;
}
const weekTargetMice = (x, t) => DB.targets.filter(q => q.user === S.user && q.week === WK && q.status === 'agreed').flatMap(q => q.items).filter(i => i.exp === x && i.target === t).flatMap(i => i.mice).filter(m => stOf(x, t, m) === 'todo');

/* ---------------- views ---------------- */
function runRow(x, t, m, title, pk) {
  const s = runOf(x.id, t, m), k = !s ? 'todo' : s.doneAt ? 'ok' : 'wait';
  const nf = DB.files.filter(f => f.key === key(x.id, t, m)).length, nn = s ? s.notes.filter(n => n.mice === 'all' || n.mice.includes(m)).length : 0;
  const txt = !s ? 'To do' : s.doneAt ? `Done ${dt(s.doneAt)} · ${e(s.pname)} ${e(s.label)} rev ${s.rev}` : `On the bench · step ${s.stepIdx + 1} of ${s.steps.length}`;
  return `<div class="item"><span class="pk">${pk || ''}</span><span class="ic ${k}">${k === 'ok' ? '✓' : k === 'wait' ? '◔' : '○'}</span><span class="what">${title}</span><span class="state ${k}">${txt}${nn ? ` · ${nn} deviation${nn > 1 ? 's' : ''} noted` : ''}${nf ? ` · ${nf} result file${nf > 1 ? 's' : ''}` : ''}</span><span class="act"><button class="btn sm" data-a="run" data-x="${x.id}" data-t="${e(t || '')}" data-m="${e(m)}">Open record</button></span></div>`;
}
function expCount(x, m) { const ts = x.targets || ['']; let d = 0, r = 0, n = 0; for (const t of ts) { const s = stOf(x.id, t, m); if (s === 'na') continue; n++; if (s === 'done') d++; else if (s === 'run') r++; } return { d, r, n }; }

const V = {};
V.today = () => {
  const act = DB.sessions.filter(s => !s.doneAt && X(s.exp));
  const open = act.find(s => s.id === S.openSession);
  const waits = act.filter(s => s.waitStart && s.steps[s.stepIdx].w).map(s => ({ s, left: s.steps[s.stepIdx].m - (now() - s.waitStart) / MIN })).sort((a, b) => b.left - a.left);
  const F = S.freeMin ?? (waits[0] ? Math.max(0, Math.round(waits[0].left)) : 60);
  const fits = fitList(F, waits[0]?.s.exp);
  const tg = DB.targets.filter(t => t.week === WK && (isSup() || t.user === S.user));
  return `<div class="cols"><div class="stack">
   <div class="card"><h2>On the bench now</h2>${act.length ? `<div class="list">${act.map(s => { const stp = s.steps[s.stepIdx]; return `<div class="item"><span class="pk"></span><span class="ic wait">◔</span><span class="what">${e(X(s.exp).name)} ${e(s.target)} · ${s.mice.length} samples</span><span class="state">Step ${s.stepIdx + 1} of ${s.steps.length}: ${e(stp.t)}${s.waitStart ? ` · <span class="clock" data-until="${s.waitStart + stp.m * MIN}"></span>` : ''}</span><span class="act"><button class="btn sm ${open === s ? '' : 'pri'}" data-a="openSess" data-id="${s.id}">${open === s ? 'Open below' : 'Open'}</button></span></div>`; }).join('')}</div>` : '<div class="hint">Nothing is running. Go to Experiments, tick the samples and start a bench session.</div>'}</div>
   ${open ? sessPanel(open) : ''}
  </div><div class="stack">
   ${lowList().length ? `<div class="card" style="border-color:var(--bad)"><div class="line"><b class="grow">Reagents running low</b><button class="lnk" data-a="tab" data-k="reag">Open Reagents</button></div><div class="sm">${lowList().map(r => e(r.name) + ' (' + fmtV(stock(r).left, r.unit) + ' left)').join(' · ')}</div></div>` : ''}
   <div class="card"><h2>What fits while you wait</h2>
    <div class="line"><label class="fld" for="freeMin">Free time</label><input type="number" id="freeMin" min="5" step="5" value="${F}" data-c="free" style="width:84px"><span class="sm muted">minutes${waits[0] && S.freeMin == null ? `, taken from the ${e(X(waits[0].s.exp).name)} incubation` : ''}</span></div>
    ${fits.length ? fits.map(f => `<div class="fit"><b>${e(f.t)}</b><span class="m">${dur(f.m)}</span><span class="sub">${e(f.sub)}</span></div>`).join('') : '<div class="hint">Nothing outstanding fits in that window.</div>'}</div>
   <div class="card"><h2>Backlog</h2>${DB.backlog.map(b => `<label class="line sm"><input type="checkbox" data-c="bl" data-id="${b.id}" ${b.done ? 'checked' : ''}><span class="grow" ${b.done ? 'style="text-decoration:line-through"' : ''}>${e(b.text)}</span><span class="mono">${dur(b.m)}</span><button class="lnk" data-a="blDel" data-id="${b.id}" aria-label="Remove this task">×</button></label>`).join('')}
    <div class="line"><input type="text" id="blText" class="grow" placeholder="Unfinished task, e.g. data analysis" aria-label="Backlog task"><input type="number" id="blMin" value="30" min="5" step="5" style="width:70px" aria-label="Minutes"><button class="btn sm" data-a="addBl">Add</button></div><div class="hint">Only you see your backlog.</div></div>
   <div><h3 style="margin:2px 0 8px">This week's target</h3><div class="stack">${tg.length ? tg.map(t => tCard(t)).join('') : '<div class="card hint">No target agreed for this week. Propose one under Targets.</div>'}</div></div>
  </div></div>`;
};
function fitList(F, skip) {
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
function sessPanel(s) {
  return `<div class="card"><div class="line"><h2 class="grow">${e(X(s.exp).name)} ${e(s.target)}</h2><span class="flag info mono">${e(s.pname)} ${e(s.label)} rev ${s.rev}</span></div>
  <div class="sm muted">${s.mice.length} samples: ${e(s.mice.join(', '))} · started by ${e(users[s.by].name)}. These steps are a copy taken when the session started, so later protocol edits do not change this record.</div>
  <ol class="steps">${s.steps.map((stp, i) => {
    const c = i < s.stepIdx ? 'done' : i === s.stepIdx ? 'cur' : '';
    const notes = s.notes.filter(n => n.step === i).map(n => `<div class="dev">${n.mice === 'all' ? 'All samples' : e(n.mice.join(', '))}: ${e(n.text)}</div>`).join('');
    const need = needML(stp, s.mice.length), rg = R(stp.reagent); let b = '';
    if (c === 'cur') { if (stp.w && s.waitStart) b = `<span class="clock" data-until="${s.waitStart + stp.m * MIN}"></span><button class="btn sm pri" data-a="stepDone" data-id="${s.id}">Wait finished</button>`;
      else b = (stp.w ? `<button class="btn sm pri" data-a="startWait" data-id="${s.id}">Start timer</button>` : '') + `<button class="btn sm ${stp.w ? '' : 'pri'}" data-a="stepDone" data-id="${s.id}">Done</button>`; }
    return `<li class="${c}"><span class="n">${c === 'done' ? '✓' : i + 1}</span><div class="tx"><b>${e(stp.t)}</b><div class="sm muted">${dur(stp.m)} · ${stp.w ? 'hands-free' : 'hands-on'}${need && rg ? ` · ${e(amt(stp))} · ${fmtV(need, stp.unit)} for this batch${stock(rg).low ? ' · <span class="err">' + e(rg.name) + ' is running low</span>' : ''}` : ''}</div>${stp.checks.filter(Boolean).map((ck, j) => `<label class="line sm"><input type="checkbox" data-c="tick" data-id="${s.id}" data-k="${i}|${j}" ${s.ticks[i + '|' + j] ? 'checked' : ''}> ${e(ck)}</label>`).join('')}${stp.note ? `<div class="sm muted">Comment: ${e(stp.note)}</div>` : ''}${notes}</div><div class="rt">${b}${c ? `<button class="btn sm" data-a="note" data-id="${s.id}" data-step="${i}">Note a deviation</button>` : ''}</div></li>`;
  }).join('')}</ol></div>`;
}

V.overview = () => {
  if (!proj()) return noProj();
  const xs = projExps(), ms = proj().samples;
  if (!xs.length || !ms.length) return `<div class="card"><h2>${e(proj().name)}</h2><div class="hint">This study has no ${ms.length ? 'experiments' : 'samples'} yet. Add them under Study plan and the grid of every sample against every experiment appears here.</div><div class="line"><button class="btn pri" data-a="tab" data-k="plan">Open Study plan</button></div></div>`;
  return `<div class="stack"><div class="legend"><span><i style="background:var(--ok-soft)"></i>done</span><span><i style="background:var(--warn-soft)"></i>on the bench or partly done</span><span><i style="background:var(--surface)"></i>to do</span><span>Click a sample for its record, or a column heading for that experiment.</span></div>
  <div class="scroll"><table class="mx"><thead><tr><th>Sample</th><th>Group</th>${xs.map(x => `<th><button class="lnk" data-a="goExp" data-x="${x.id}">${e(x.name)}</button></th>`).join('')}</tr>
  <tr><td>${ms.length} samples</td><td class="g">done</td>${xs.map(x => { let d = 0, n = 0; ms.forEach(m => { const c = expCount(x, m.id); d += c.d; n += c.n; }); return `<td>${d}/${n}</td>`; }).join('')}</tr></thead>
  <tbody>${ms.map(m => `<tr><td><button class="lnk mono" data-a="goMouse" data-m="${e(m.id)}">${e(m.id)}</button></td><td class="g">${e(m.group)}</td>${xs.map(x => {
    const c = expCount(x, m.id);
    if (!c.n) return '<td class="g" style="text-align:center">–</td>'; if (x.targets) return `<td class="${c.d === c.n ? 'done' : c.d || c.r ? 'part' : ''}">${c.d}/${c.n}</td>`; return `<td class="${c.d ? 'done' : c.r ? 'run' : ''}">${c.d ? '✓' : c.r ? '◔' : ''}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
};

function mouseRows() {
  const ms = proj().samples.filter(m => (m.id + ' ' + m.group).toLowerCase().includes(S.q.toLowerCase())), xs = projExps(); const gs = [...new Set(ms.map(m => m.group))];
  return gs.map(g => { const r = ms.filter(m => m.group === g); return `<div class="grp"><span>${e(g || 'No group')}</span><span>${r.length}</span></div>` + r.map(m => {
    let d = 0, n = 0, run = 0; xs.forEach(x => { const c = expCount(x, m.id); d += c.d; n += c.n; run += c.r; });
    return `<button class="row ${S.selMouse === m.id ? 'sel' : ''}" data-a="selMouse" data-m="${e(m.id)}"><span class="nm mono">${e(m.id)}</span><span class="meta">${e(m.group)}</span>${run ? flag('warn', 'On the bench') : (n ? flag(d === n ? 'ok' : '', d + ' of ' + n) : flag('', 'Held'))}</button>`;
  }).join(''); }).join('') || `<div class="hint" style="padding:12px">${proj().samples.length ? 'No sample matches.' : 'No samples yet. Add them under Study plan.'}</div>`;
}
V.mice = () => {
  if (!proj()) return noProj();
  const m = proj().samples.find(q => q.id === S.selMouse), xs = projExps(); let det = '<div class="empty">Choose a sample on the left to see every experiment for it.</div>';
  if (m) {
    let d = 0, n = 0; const cs = xs.map(x => { const c = expCount(x, m.id); d += c.d; n += c.n; return c; });
    det = `<div class="hdr"><button class="back" data-a="back">← All samples</button><div class="name"><span class="mono">${e(m.id)}</span>${(m.group ? flag('info', m.group) : '')}</div><div class="who">${e(proj().name)} · ${d} of ${n} runs done</div>
     <div class="chips">${xs.map((x, i) => !cs[i].n ? '' : `<button class="chip ${cs[i].d === cs[i].n ? 'done' : cs[i].d || cs[i].r ? 'part' : ''} ${S.mx === x.id ? 'view' : ''}" data-a="mx" data-x="${x.id}">${e(x.name)}${x.targets ? ' ' + cs[i].d + '/' + cs[i].n : ''}</button>`).join('')}</div></div>
    <div class="body">${n ? '' : '<div class="hint">Nothing is planned on this sample. It is recorded as held, for example in storage.</div>'}${xs.map((x, i) => { const c = cs[i]; if (!c.n) return ''; return `<details class="stage" ${S.mx === x.id || c.r || (!x.targets && !S.mx) ? 'open' : ''}><summary>${e(x.name)} ${c.d === c.n ? flag('ok', 'done') : c.r ? flag('warn', 'on the bench') : ''}<span class="cnt">${c.d} of ${c.n}</span></summary>${(x.targets || ['']).filter(t => stOf(x.id, t, m.id) !== 'na').map(t => runRow(x, t, m.id, e(t || x.name))).join('')}</details>`; }).join('')}</div>`;
  }
  return `<div class="split ${m ? 'has-sel' : ''}"><aside class="pane-list"><div class="tools"><input type="search" id="q" placeholder="Search sample or group" aria-label="Search samples" value="${e(S.q)}" data-i="q"></div><div class="rows" id="rows">${mouseRows()}</div></aside><main class="pane-detail">${det}</main></div>`;
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
     ${msx.length ? '' : '<div class="hint">No samples are assigned to this yet. Tick them under Study plan.</div>'}<div class="list">${msx.map(m => runRow(x, t, m.id, `<span class="mono">${e(m.id)}</span> <span class="muted sm" style="font-weight:400">${e(m.group)}</span>`, stOf(x.id, t, m.id) === 'todo' ? `<input type="checkbox" data-c="pick" data-m="${e(m.id)}" aria-label="Tick ${e(m.id)}" ${S.picked.has(m.id) ? 'checked' : ''}>` : '')).join('')}</div></div>`;
  }
  return `<div class="split ${x ? 'has-sel' : ''}"><aside class="pane-list"><div class="rows">${list}</div></aside><main class="pane-detail">${det}</main></div>`;
};

V.protos = () => {
  const p = P(S.selProto), ins = proj() ? DB.protocols.filter(inProj) : [], rest = DB.protocols.filter(q => !ins.includes(q));
  const row = q => `<button class="row ${p === q ? 'sel' : ''}" data-a="selProto" data-p="${q.id}"><span class="nm">${e(q.name)}</span><span class="meta">by ${e(users[q.by].name)} · ${cur(leaves(q)[0]).steps.length} steps · ${ptype(q)}</span>${flag('', leaves(q).length > 1 ? leaves(q).length + ' variants' : 'V1.0')}</button>`;
  const grp = (t, a) => `<div class="grp"><span>${t}</span><span>${a.length}</span></div>`;
  /* every lab protocol is always listed: the ones this study uses first, then the rest of the library */
  const list = !DB.protocols.length ? '<div class="hint" style="padding:12px">The lab has no protocols yet. Create the first one.</div>'
    : proj() ? grp('Used in ' + e(proj().name), ins) + (ins.map(row).join('') || `<div class="hint" style="padding:8px 12px">None yet. Open a protocol below and press Add to ${e(proj().name)}.</div>`) + (rest.length ? grp('Other lab protocols', rest) + rest.map(row).join('') : '')
    : grp('Lab library', rest) + rest.map(row).join('');
  let det = '<div class="empty">Choose a protocol on the left to view or edit it, or create a new one.</div>';
  if (p) {
    let n = p.nodes.find(q => q.id === S.selNode) || leaves(p)[0]; S.selNode = n.id; const leaf = isLeaf(p, n), r = n.revs.find(q => q.n === S.viewRev) || cur(n), isCur = r === cur(n);
    const used = (nn, rr) => DB.sessions.filter(s => s.node === nn.id && s.rev === rr.n).reduce((a, s) => a + s.mice.length, 0);
    const body = S.edit ? builderHTML(p, n)
      : `${isCur ? '' : `<div class="todo"><span>You are looking at rev ${r.n}, an older revision. It stays here because ${used(n, r)} run${used(n, r) === 1 ? ' was' : 's were'} done with it.</span><button class="btn sm" data-a="rev" data-n="">Back to the current revision</button></div>`}
      ${leaf ? '' : `<div class="todo"><span>${e(n.name)} has been split into sub-variants, so new sessions use those. This page is kept for the runs already done with it.</span></div>`}
      ${r.steps.length ? `<ol class="steps">${r.steps.map(stepLi).join('')}</ol>` : '<div class="hint">This protocol has no steps yet. Press Build steps to add them.</div>'}
      ${linkHTML(p)}
      <div class="hist"><h3 style="margin-bottom:6px">Revision history</h3>${[...n.revs].reverse().map(q => `<div><button class="lnk" data-a="rev" data-n="${q.n}">rev ${q.n}</button> · ${dt(q.at)} · ${e(users[q.by].name)} · ${e(q.note)} · <span class="muted">${used(n, q)} done run${used(n, q) === 1 ? '' : 's'} pinned to it</span></div>`).join('')}${[...(p.log || [])].reverse().map(q => `<div>${dt(q.at)} · ${e(users[q.by].name)} · ${e(q.text)}</div>`).join('')}</div>`;
    det = `<div class="hdr"><button class="back" data-a="back">← All protocols</button><div class="name">${e(p.name)}${inProj(p) ? flag('ok', 'In ' + proj().name) : ''}</div>
      <div class="who">Created by ${e(users[p.by].name)} · used in: ${e(usedIn(p))} · shared with everyone in the lab</div>
      <div class="who">${e(ptypeLine(p))}</div>
      <div class="chips">${walk(p, null).map(q => `<button class="chip ${q === n ? 'view' : ''} ${isLeaf(p, q) ? '' : 'old'}" data-a="selNode" data-n="${q.id}"><span class="mono">${vlabel(p, q)}</span>${q.name === 'Standard' ? '' : ' ' + e(q.name)}</button>`).join('')}</div>
      <div class="who"><span class="mono">${e(vname(p, n))}</span> · rev ${r.n} of ${cur(n).n} · ${dur(tot(r.steps))} in total · ${dur(hands(r.steps))} hands-on · longest hands-free stretch ${dur(maxW(r.steps))}</div>
      ${S.edit ? '' : `<div class="line">${inProj(p) || !proj() ? '' : `<button class="btn sm pri" data-a="addProj">Add to ${e(proj().name)}</button>`}${leaf && isCur ? `<button class="btn sm ${inProj(p) ? 'pri' : ''}" data-a="edStart">${r.steps.length ? 'Edit steps' : 'Build steps'}</button><button class="btn sm" data-a="split">Split into sub-variants</button>` : ''}<button class="btn sm" data-a="addVar">Add a variant</button><button class="btn sm" data-a="print">Print view</button></div>`}</div><div class="body">${body}</div>`;
  }
  return `<div class="split ${p ? 'has-sel' : ''}"><aside class="pane-list"><div class="tools"><button class="btn pri" data-a="newProto">Create new protocol</button></div><div class="rows">${list}</div></aside><main class="pane-detail">${det}</main></div>`;
};

V.reag = () => `<div class="cols"><div class="stack">${DB.reagents.map(r => {
  const k = stock(r), us = DB.protocols.filter(p => p.nodes.some(n => cur(n).steps.some(q => q.reagent === r.id))).map(p => p.name).concat(DB.exps.flatMap(x => Object.entries(x.treag || {}).filter(q => q[1] === r.id).map(q => x.name + ' ' + q[0])));
  return `<div class="card"><div class="line"><b class="grow">${e(r.name)}</b>${flag(k.low ? 'bad' : 'ok', k.low ? 'Running low' : 'In stock')}</div>
    <div class="bar pos ${k.low ? 'bad' : 'ok'}"><i style="width:${k.tot ? k.left / k.tot * 100 : 0}%"></i></div>
    <div class="sm"><b>${fmtV(k.left, r.unit)}</b> left of ${fmtV(k.tot, r.unit)} · ${r.bottles} × ${r.per} ${e(r.unit)} bought · warns at ${r.low} ${e(r.unit)}</div>
    <div class="sm muted">Used in: ${e(us.join(', ') || 'no protocol yet')}</div>
    <details><summary class="sm">Purchase details</summary><div class="sm muted">Brand: ${e(r.brand || 'not recorded')} · Supplier: ${e(r.supplier || 'not recorded')} · Price per bottle: ${r.price ? 'R ' + r.price : 'not recorded'}</div></details>
    <div class="line"><button class="btn sm" data-a="rgAdd" data-r="${r.id}">Record a new bottle</button></div></div>`;
}).join('') || '<div class="card hint">No reagents yet. Add the first one on the right, then it can be chosen in any protocol step.</div>'}</div>
  <div class="stack"><div class="card"><h2>How stock is counted</h2><div class="hint">Nobody types stock levels in. Each step ticked off in a bench session takes its amount off the reagent: amount × times × number of samples, or once if the step is set to per batch. Everyone in the lab sees the same stock and the same low warning, on this tab and on Today.</div></div>
   <div class="card"><h2>Add a reagent</h2><div class="rg"><label>Name<input type="text" id="rgName" value="${e(S.rgPrefill || '')}"></label><label>Bottles<input type="number" id="rgBottles" value="1" min="1"></label><label>Amount per bottle<input type="number" id="rgPer" min="0" step="any"></label><label>Unit<select id="rgUnit"><option>mL</option><option>µL</option></select></label><label>Warn when below<input type="number" id="rgLow" min="0" step="any"></label><label>Brand<input type="text" id="rgBrand"></label><label>Supplier<input type="text" id="rgSupplier"></label><label>Price per bottle (R)<input type="number" id="rgPrice" min="0"></label></div>
    <div class="line"><button class="btn pri" data-a="rgNew">Add reagent</button><span class="err" id="rgErr"></span></div>
    <div class="hint">Brand, supplier and price stay out of the way on screen. Brand and supplier appear on a protocol's print view.</div></div></div></div>`;

V.targets = () => {
  const sup = isSup(), ts = DB.targets.filter(t => sup || t.user === S.user);
  if (!sup && !proj()) return noProj();
  const card = t => tCard(t, sup && t.status === 'proposed' ? `<div class="line"><input type="text" id="tn${t.id}" class="grow" placeholder="Comment (needed if you ask for a change)" aria-label="Comment"><button class="btn sm pri" data-a="agree" data-id="${t.id}">Agree</button><button class="btn sm" data-a="change" data-id="${t.id}">Ask for a change</button></div>` : !sup && (t.status === 'proposed' || t.status === 'change') ? `<div class="line"><button class="btn sm" data-a="delT" data-id="${t.id}">Withdraw</button></div>` : '');
  const up = ts.filter(t => t.week >= WK).sort((a, b) => a.week - b.week), past = ts.filter(t => t.week < WK).sort((a, b) => b.week - a.week);
  let right = '<div class="card"><h2>Your part</h2><div class="hint">Lab members plan each week by picking the exact samples per experiment. Nothing counts until you agree it. If an agreed week is missed, the member cannot carry on in the tracker until they send you what happened, why, and their plan. That lands in your inbox.</div></div>';
  if (!sup && !projExps().length) right = '<div class="card hint">This study has no experiments yet. Add them under Study plan first.</div>'; else if (!sup) {
    const D = S.draft, opts = projExps().flatMap(x => (x.targets || ['']).map(t => x.id + '|' + t)); if (!opts.includes(D.exp)) { D.exp = opts[0] || '|'; D.pick.clear(); }
    const [dx, dg] = D.exp.split('|'), planned = new Set(D.items.filter(i => i.exp === dx && i.target === dg).flatMap(i => i.mice)), L = weekLoad(S.user, D.week, D.items);
    right = `<div class="card"><h2>Plan a week</h2>
     <label class="fld" for="dWk">Week<select id="dWk" data-c="dWk">${Array.from({ length: 27 }, (_, i) => WK + i * 7 * DAY).map(w => `<option value="${w}" ${w === D.week ? 'selected' : ''}>${wkLabel(w)}${w === WK ? ' (this week)' : ''}</option>`).join('')}</select></label>
     <h3>1. Pick an experiment, then click the samples</h3>
     <select id="dExp" data-c="dExp" aria-label="Experiment">${opts.map(o => { const [a, b] = o.split('|'); return `<option value="${e(o)}" ${o === D.exp ? 'selected' : ''}>${e(X(a).name)}${b ? ' ' + e(b) : ''}</option>`; }).join('')}</select>
     <div class="mcs">${proj().samples.filter(m => stOf(dx, dg, m.id) !== 'na').map(m => { const st = planned.has(m.id) ? 'plan' : stOf(dx, dg, m.id); return st === 'todo' ? `<button class="mc ${D.pick.has(m.id) ? 'on' : ''}" data-a="dPick" data-m="${e(m.id)}" aria-pressed="${D.pick.has(m.id)}">${e(m.id)}</button>` : `<span class="mc ${st}">${e(m.id)}${st === 'done' ? ' ✓' : ''}</span>`; }).join('') || '<span class="hint">No samples are assigned to this experiment yet. Tick them under Study plan.</span>'}</div>
     <div class="line"><button class="btn sm" data-a="dNext">Next 25 to do</button><button class="btn sm" data-a="dClear">Clear</button><span class="sm muted grow">${D.pick.size} picked${D.pick.size ? ', about ' + dur(est(dx, D.pick.size)) + ' as one batch' : ''}</span><button class="btn sm pri" data-a="dAdd" ${D.pick.size ? '' : 'disabled'}>Add to the plan</button></div>
     <div class="hint">Green is already done, amber is on the bench or already in this plan.</div>
     <h3>2. The plan for ${wkLabel(D.week)}</h3>
     ${D.items.map((i, k) => `<div class="line sm"><span class="grow"><b>${e(iName(i))}</b> · <span class="mono">${e(i.mice.join(', '))}</span> · about ${dur(est(i.exp, i.mice.length))}</span><button class="btn sm" data-a="dDel" data-i="${k}">Remove</button></div>`).join('') || '<div class="hint">Nothing added yet. You can add several experiments to the same week.</div>'}
     <div class="sm"><b>Does the week fit?</b> <span class="muted">Only you see this${L.total && !D.items.length ? '; it already includes what is planned for that week' : ''}.</span></div>${loadHTML(L)}
     <div class="hint">${[...new Set(D.items.map(i => i.exp).concat(dx))].filter(X).map(mdlText).join('<br>')}</div>
     ${L.over ? `<div class="todo sm"><span><b>${overMsg}</b> Move something to another week, or go ahead anyway.</span><label class="line"><input type="checkbox" id="dOver" data-c="dOver" ${D.override ? 'checked' : ''}> Go ahead anyway</label></div>` : ''}
     <button class="btn pri" data-a="propose" ${D.items.length && (!L.over || D.override) ? '' : 'disabled'}>Send to Prof Kaur for agreement</button></div>
    <div class="card"><h2>Next 6 months</h2><div class="hint">Estimated bench hours per planned week. Click a week to plan it.</div>
     <div class="wks">${Array.from({ length: 27 }, (_, i) => WK + i * 7 * DAY).map(w => { const l = weekLoad(S.user, w); return `<button class="wk ${l.total ? 'has' : ''} ${l.over ? 'ov' : ''} ${w === D.week ? 'sel' : ''}" data-a="dWkSet" data-w="${w}"><b>${dt(w)}</b>${l.total ? dur(l.total) : 'free'}</button>`; }).join('')}</div></div>`;
  }
  return `<div class="cols"><div class="stack">${progHTML()}${up.map(card).join('') || '<div class="card hint">Nothing planned from this week on.</div>'}${past.length ? '<h3>Earlier weeks</h3>' + past.map(card).join('') : ''}</div><div class="stack">${right}</div></div>`;
};

function mailCard() {
  const t = DB.notices.filter(n => n.test && n.to === S.user).sort(byAt).pop();
  return `<div class="card"><h2>Email notices</h2><div class="hint">Every notice in someone's Inbox is also emailed to their Wits address by the lab's mail sheet, which checks about once a minute. That includes the note a person gets when they are added to the lab, with the link to the tracker.</div>
    <div class="line"><button class="btn" data-a="mailTest">Send me a test email</button><span class="sm grow">${!t ? '<span class="muted">No test waiting.</span>' : t.mailedAt ? `<b>Test emailed</b> on ${dt(t.mailedAt)} at ${tm(t.mailedAt)} to ${e(S.user)}. Check your email.` : `<span class="muted">Test queued at ${tm(t.at)}. Waiting for the mail sheet to pick it up…</span>`}</span></div>
    ${t && !t.mailedAt && now() - t.at > 3 * MIN ? '<div class="err">Nothing has picked the test up after 3 minutes. Check that the mail sheet is set up and switched on (menu Lab mail in the sheet).</div>' : ''}</div>`;
}
V.lab = () => {
  const L = DB.lab, cl = canLab(), people = allPeople();
  const pRow = em => `<div class="prow"><span class="nm">${e(nameOf(em))}</span><span class="sm muted mono">${e(em)}</span>${flag(roleOf(em) === 'Supervisor' ? 'info' : roleOf(em) === 'Admin' ? 'ok' : '', roleOf(em))}
    ${cl && em !== S.user && !sups().includes(em) && !admins().includes(em) ? `<button class="btn sm" data-a="rmMember" data-em="${e(em)}">Remove</button>` : ''}
    ${cl && em !== S.user ? `<button class="btn sm" data-a="linkFor" data-em="${e(em)}" title="Emails ${e(nameOf(em))} a fresh sign-in link, for people who cannot use Sign in with Google">Email sign-in link</button>` : ''}</div>`;
  const projCard = p => {
    const canEdit = isSup() || p.members.includes(S.user), rest = people.filter(em => !sups().includes(em) && !p.members.includes(em));
    return `<div class="card"><div class="line"><b class="grow">${e(p.name)}</b>${p.id === S.project ? flag('info', 'Selected') : `<button class="btn sm" data-a="pickProj" data-id="${p.id}">Open</button>`}</div>
    <div class="sm muted">${p.desc ? e(p.desc) + ' · ' : ''}${p.samples.length} samples · ${p.exps.length} experiments</div>
    <div class="line">${p.members.map(em => `<span class="flag info">${e(nameOf(em))}${canEdit && (p.members.length > 1 || isSup()) ? ` <button class="lnk" style="color:inherit" data-a="rmMem" data-p="${p.id}" data-u="${e(em)}" aria-label="Remove ${e(nameOf(em))} from ${e(p.name)}">×</button>` : ''}</span>`).join('')}<span class="flag">Prof Kaur (supervises all)</span></div>
    ${canEdit ? `<div class="line"><select id="add${p.id}" aria-label="Person to add to ${e(p.name)}">${rest.map(em => `<option value="${e(em)}">${e(nameOf(em))}</option>`).join('') || '<option value="">Everyone is already in</option>'}</select><button class="btn sm" data-a="addMem" data-p="${p.id}">Add to project</button>${isSup() ? `<span class="sp"></span><button class="btn sm" data-a="delProj" data-id="${p.id}">Delete project</button>` : ''}</div>` : ''}</div>`;
  };
  return `<div class="cols lab"><div class="stack">
    <div class="card"><h2>${e(L.name || 'The lab')}</h2>
      <div class="hint">Supervisors see every project. Admins manage who is in the lab. Members see only their own projects.</div>
      <div class="plist">${people.map(pRow).join('')}</div>
      ${cl ? `<div class="line"><input type="email" id="newMember" class="grow" placeholder="Wits email of a lab member" aria-label="Wits email of a new lab member">
        <select id="newRole" aria-label="Role"><option value="members">Member</option><option value="supervisors">Supervisor</option></select>
        <button class="btn pri" data-a="addMember">Add</button></div><span class="err" id="memberErr"></span>` : ''}
    </div>
    ${cl ? mailCard() : ''}
    <div class="card"><h2>Where the data lives</h2><div class="flow"><div><b>The website</b>The app code only. No samples, notes, protocols or results are in the code, so a public page gives nothing away.</div><div><b>Google sign-in</b>Each person signs in with their Wits account. The page is an empty shell until they do.</div><div><b>The lab database</b>All records, held in Johannesburg. Projects are open only to their members and supervisors; protocols, reagents and duties are shared by the whole lab.</div></div>
      <div class="hint">Result files are not stored here: each run keeps links to where its files are, for example in Google Drive.</div></div>
  </div><div class="stack"><h3>Projects and who can see them</h3>
    ${DB.projects.map(projCard).join('') || '<div class="card hint">No projects yet. Create one with New study under Study plan.</div>'}
    <div class="line"><button class="btn" data-a="newStudy">New study</button></div>
  </div></div>`;
};

/* ---------------- study plan ---------------- */
const clean = t => String(t).replace(/[<>"'&|]/g, '').replace(/\s+/g, ' ').trim();
const planCols = () => projExps().flatMap(x => (x.targets && x.targets.length ? x.targets : x.targets ? [] : ['']).map(t => ({ x, t }))).filter(c => !S.planX || c.x.id === S.planX);
const hasRuns = m => [...IDX.keys()].some(k => k.endsWith('|' + m));
function nextMouse() {
  const ss = proj().samples, base = q => q.id.split(' ')[0]; if (!ss.length) return 'M01'; const m = base(ss[ss.length - 1]).match(/^(.*?)(\d+)$/); if (!m) return base(ss[ss.length - 1]) + '-2';
  const all = new Set(DB.projects.flatMap(p => p.samples.map(base))); let mx = 0; ss.forEach(q => { const k = base(q).match(/^(.*?)(\d+)$/); if (k && k[1] === m[1]) mx = Math.max(mx, +k[2]); }); let n = mx + 1, id; do { id = m[1] + String(n++).padStart(m[2].length, '0'); } while (all.has(id)); return id;
}
const pTypes = () => proj().types || [];
const pGroups = () => [...new Set(proj().samples.map(m => m.group).concat(proj().xg || []).filter(Boolean))];
V.plan = () => {
  if (!proj()) return noProj();
  const p = proj(), xs = projExps(), cols = planCols(), inUse = new Set(xs.map(x => x.proto)), nm = nextMouse(), selT = pTypes().filter(t => S.addT.has(t));
  return `<div class="stack"><div class="card"><div class="line"><h2 class="grow">Study plan: ${e(p.name)}</h2><button class="btn pri" data-a="newStudy">New study</button></div>
   <div class="hint">Set a study up in three steps: list the samples you hold, choose the experiments from the lab protocols, then tick which sample gets which experiment. Overview, Samples, Experiments and Targets all follow what is ticked here.</div></div>
  <div class="cols">
   <div class="card"><h2>1. Samples <span class="muted sm">${p.samples.length} held</span></h2>
    <label class="sm" for="smNames">Names, one per line or separated by commas<textarea id="smNames" rows="3" placeholder="M01, M02, M03"></textarea></label>
    <div class="rg"><label>One of each for these tissues (optional)<input type="text" id="smParts" placeholder="tumour, serum, kidney, brain"></label><label>Group (optional)<input type="text" id="smGroup" placeholder="e.g. treated"></label></div>
    <div class="line"><button class="btn" data-a="smAdd">Add samples</button><span class="err" id="smErr"></span></div>
    <div class="hint">With tissues filled in, M01 becomes M01 tumour, M01 serum and so on. A sample can sit here with nothing planned on it, so you still have a record that you hold it.</div>
    <details ${S.smOpen ? 'open' : ''}><summary class="sm">Show all ${p.samples.length} samples</summary><div class="mcs" style="margin-top:8px">${p.samples.map(m => `<span class="mc">${e(m.id)}${hasRuns(m.id) ? '' : `<button class="lnk" data-a="smDel" data-m="${e(m.id)}" aria-label="Remove ${e(m.id)}">×</button>`}</span>`).join('')}</div></details>
    <div class="ti"><h3>Or add one mouse at a time</h3>
     <div class="sm"><b>Sample types</b> <span class="muted">click all that this mouse has; they stay selected for the next mouse</span></div>
     <div class="mcs">${pTypes().map(t => `<button class="mc ${S.addT.has(t) ? 'on' : ''}" data-a="mtT" data-t="${e(t)}" aria-pressed="${S.addT.has(t)}">${e(t)}</button>`).join('') || '<span class="hint">No sample types yet. Add them below, or leave empty for one sample per mouse.</span>'}</div>
     <div class="line"><input type="text" id="mtNew" class="grow" placeholder="A sample type, e.g. tumour" aria-label="New sample type"><button class="btn sm" data-a="mtTAdd">Add type</button></div>
     <div class="sm"><b>Group</b> <span class="muted">stays the same until you change it</span></div>
     <div class="mcs">${[''].concat(pGroups()).map(g => `<button class="mc ${S.addG === g ? 'on' : ''}" data-a="mtG" data-g="${e(g)}" aria-pressed="${S.addG === g}">${e(g || 'No group')}</button>`).join('')}</div>
     <div class="line"><input type="text" id="mgNew" class="grow" placeholder="Another group" aria-label="New group"><button class="btn sm" data-a="mtGAdd">Add group</button></div>
     <div class="line"><button class="btn pri" data-a="mAdd">+ Add mouse ${e(nm)}</button><span class="sm muted grow">Adds ${selT.length ? selT.map(t => e(nm + ' ' + t)).join(', ') : e(nm) + ' as one sample'}${S.addG ? ' to ' + e(S.addG) : ''}</span></div></div></div>
   <div class="card"><h2>2. Experiments <span class="muted sm">${xs.length} in this study</span></h2>
    ${xs.map(x => `<div class="ti"><div class="line"><b class="grow">${e(x.name)}</b><span class="sm muted">${e(P(x.proto).name)}</span>${DB.sessions.some(q => q.exp === x.id) ? '' : `<button class="btn sm" data-a="xDel" data-x="${x.id}">Remove</button>`}</div>
      ${x.targets ? `<div class="mcs">${x.targets.map(t => `<span class="mc">${e(t)}${x.treag && R(x.treag[t]) ? ' · ' + e(R(x.treag[t]).name) : ''}</span>`).join('')}</div>
       <div class="line"><input type="text" id="tg${x.id}" class="grow" placeholder="Add a gene or protein" aria-label="Gene or protein"><select id="tr${x.id}" aria-label="Linked reagent"><option value="">No linked reagent</option>${DB.reagents.map(r => `<option value="${r.id}">${e(r.name)}</option>`).join('')}</select><button class="btn sm" data-a="tgAdd" data-x="${x.id}">Add</button></div>` : ''}</div>`).join('') || '<div class="hint">None yet.</div>'}
    <h3>Add from the lab protocols</h3>
    ${DB.protocols.length ? `<div class="rg"><label>Protocol<select id="pxProto">${DB.protocols.map(q => `<option value="${q.id}">${e(q.name)}${inUse.has(q.id) ? ' (already used here)' : ''}</option>`).join('')}</select></label><label>Name in this study<input type="text" id="pxName" placeholder="Same as the protocol"></label><label>Genes or proteins (optional)<input type="text" id="pxT" placeholder="e.g. gene A, gene B"></label></div>
    <div class="line"><button class="btn" data-a="pxAdd">Add experiment</button></div>` : '<div class="hint">The lab has no protocols yet. Create one under Protocols, then add it here.</div><div class="line"><button class="btn" data-a="tab" data-k="protos">Open Protocols</button></div>'}
    <div class="hint">The protocol stays one shared protocol. The genes or proteins belong to this study, and each can be linked to its own primer or antibody in Reagents so the right stock goes down.</div></div></div>
  <div class="card"><div class="line"><h2 class="grow">3. Which sample gets which experiment</h2><label class="fld" for="planX">Columns<select id="planX" data-c="planX"><option value="">All experiments</option>${xs.map(x => `<option value="${x.id}" ${S.planX === x.id ? 'selected' : ''}>${e(x.name)}</option>`).join('')}</select></label></div>
   <div class="hint">Tick a box to plan that experiment on that sample. Boxes where a run has already started are locked. "all / none" fills or clears a whole row or column.</div>
   ${p.samples.length && cols.length ? `<div class="scroll" style="max-height:70vh;overflow:auto"><table class="mx"><thead><tr><th>Sample</th>${cols.map((c, i) => `<th>${e(c.x.name)}${c.t ? '<br><span class="mono">' + e(c.t) + '</span>' : ''}<br><button class="lnk" data-a="asgCol" data-i="${i}">all / none</button></th>`).join('')}</tr></thead>
    <tbody>${p.samples.map(m => `<tr><td><span class="mono">${e(m.id)}</span> <button class="lnk sm" style="font-weight:400" data-a="asgRow" data-m="${e(m.id)}">all / none</button></td>${cols.map(c => { const k = key(c.x.id, c.t, m.id); return `<td><input type="checkbox" data-c="asg" data-k="${e(k)}" aria-label="${e(m.id + ' ' + c.x.name + ' ' + c.t)}" ${DB.asg.has(k) ? 'checked' : ''} ${IDX.has(k) ? 'disabled' : ''}></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`
      : '<div class="hint">Add at least one sample and one experiment above and the grid appears here.</div>'}</div></div>`;
};

/* ---------------- lab duties ---------------- */
const labPeople = () => allPeople().filter(u => !sups().includes(u));
const mKey = off => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const mName = k => new Date(k + '-01T12:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const KIND = { monthly: ['info', 'Every month'], asneeded: ['warn', 'As needed'], once: ['', 'Once-off'] };
/* fair shuffle: fewest duties first, then anyone who did not hold this duty last month, then chance */
function deal(k, prevK) {
  const load = {}, out = {}, prev = DB.rota[prevK] || {}; labPeople().forEach(u => load[u] = 0);
  for (const d of DB.duties.filter(d => d.kind !== 'once').sort((a, b) => b.people - a.people)) { const c = labPeople().map(u => ({ u, s: load[u] * 10 + ((prev[d.id] || []).includes(u) ? 5 : 0) + Math.random() })).sort((a, b) => a.s - b.s).slice(0, d.people).map(q => q.u); out[d.id] = c; c.forEach(u => load[u]++); }
  DB.rota[k] = out;
}
const holders = (d, k) => d.kind === 'once' ? d.who || [] : (DB.rota[k] || {})[d.id] || [];
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

/* ---------------- modal ---------------- */
function modalHTML() {
  const m = S.modal; if (!m) return ''; let h = '';
  if (m.type === 'run') {
    const x = X(m.x), s = runOf(m.x, m.t, m.m), fs = DB.files.filter(f => f.key === key(m.x, m.t, m.m));
    const p = s && P(s.proto), n = p && p.nodes.find(q => q.id === s.node), stale = n && (cur(n).n !== s.rev || !isLeaf(p, n) || vname(p, n) !== s.label);
    h = `<h2><span class="mono">${e(m.m)}</span> · ${e(x.name)} ${e(m.t)}</h2>${preLine(x, m.m)}
     ${!s ? '<div class="hint">Not started. Start it from Experiments, where you can tick several samples and run them as one bench session.</div>'
      : `<div class="line">${flag(s.doneAt ? 'ok' : 'warn', s.doneAt ? 'Done ' + dt(s.doneAt) : 'On the bench')}<span class="flag info mono">${e(s.pname)} ${e(s.label)} rev ${s.rev}</span><span class="sm muted">by ${e(users[s.by].name)}, batch of ${s.mice.length}</span></div>
       ${stale ? `<div class="todo sm"><span>The protocol has changed since (now ${e(vname(p, n))} rev ${cur(n).n}). This record keeps the steps as they were done.</span></div>` : ''}
       <ol class="steps">${s.steps.map((stp, i) => `<li class="${i < s.stepIdx ? 'done' : ''}"><span class="n">${i < s.stepIdx ? '✓' : i + 1}</span><div class="tx"><b>${e(stp.t)}</b>${s.notes.filter(q => q.step === i && (q.mice === 'all' || q.mice.includes(m.m))).map(q => `<div class="dev">${q.mice === 'all' ? 'Whole batch' : 'This sample'}: ${e(q.text)} <span class="muted">(${dt(q.at)}, ${e(users[q.by].name)})</span></div>`).join('')}</div><div class="rt sm muted">${dur(stp.m)}</div></li>`).join('')}</ol>
       ${s.notes.filter(q => q.step == null && q.mice.includes(m.m)).map(q => `<div class="dev">Note: ${e(q.text)} <span class="muted">(${dt(q.at)}, ${e(users[q.by].name)})</span></div>`).join('')}
       <div class="line"><input type="text" id="runNote" class="grow" placeholder="Note for this sample only, e.g. thawed for 6 min instead" aria-label="Note for this sample"><button class="btn sm" data-a="runNote">Add note</button></div>`}
     <h3>Results</h3>
     ${fs.map(f => `<div class="line sm"><span class="grow">${safeUrl(f.url) ? `<a class="lnk" href="${e(f.url)}" target="_blank" rel="noopener noreferrer">${e(f.name)}</a>` : `<span class="mono">${e(f.name)}</span>`} <span class="muted">· ${dt(f.at)} · ${e(users[f.by].name)}</span></span><button class="btn sm" data-a="fileDel" data-id="${f.id}">Remove</button></div>`).join('') || '<div class="hint">No result files yet.</div>'}
     <div class="rg"><label>File name<input type="text" id="fName" placeholder="e.g. image at 20x"></label><label>Link to the file<input type="url" id="fUrl" placeholder="https://drive.google.com/…"></label></div>
     <div class="line"><button class="btn sm" data-a="fileAdd">Add result file</button><span class="err" id="mErr"></span></div>
     <div class="hint">The file itself stays where it is, for example in Google Drive; the tracker keeps its name and link. Whoever opens the link still needs access to the file there.</div>
     <div class="foot"><button class="btn" data-a="close">Close</button></div>`;
  }
  if (m.type === 'note') {
    const s = sess(m.id);
    h = `<h2>Note a deviation</h2><div class="sm muted">Step ${m.step + 1}: ${e(s.steps[m.step].t)}. The protocol itself is not changed.</div>
     <label>What was different<textarea id="nText" rows="2" placeholder="e.g. thawed for 6 min instead"></textarea></label>
     <div class="pick"><label><input type="radio" name="nWho" value="all" checked> All ${s.mice.length} samples</label><label><input type="radio" name="nWho" value="some"> Only these:</label></div>
     <div class="pick">${s.mice.map(q => `<label><input type="checkbox" class="nM" value="${e(q)}"><span class="mono">${e(q)}</span></label>`).join('')}</div>
     <div class="foot"><span class="err" id="mErr"></span><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="noteSave">Save note</button></div>`;
  }
  if (m.type === 'split') {
    const p = P(S.selProto), n = p.nodes.find(q => q.id === S.selNode);
    h = `<h2>Split ${e(vname(p, n))} into sub-variants</h2><div class="sm muted">Each sub-variant starts as a copy of the current steps. Variants that are not split get a 0 on the end so the numbers stay the same length.</div>
     <label>Names, separated by commas<input type="text" id="spNames" placeholder="e.g. Breast tissue, Colorectal tissue"></label>
     <div class="foot"><span class="err" id="mErr"></span><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="splitSave">Split</button></div>`;
  }
  if (m.type === 'addVar') {
    h = `<h2>Add a variant to ${e(P(S.selProto).name)}</h2><div class="sm muted">It starts as a copy of the steps you are looking at.</div><label>Variant name<input type="text" id="avName" placeholder="e.g. Organoid"></label>
     <div class="foot"><span class="err" id="mErr"></span><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="addVarSave">Add variant</button></div>`;
  }
  if (m.type === 'pre') {
    const x = X(S.selExp), p = P(x.proto), ss = srcs(p), miss = lacking(x, [...S.picked]), today = new Date(now() - new Date().getTimezoneOffset() * MIN).toISOString().slice(0, 10);
    h = `<h2>${e(x.name)} needs an earlier step</h2>
     <div class="todo"><span>${e(p.name)} starts from a sample already processed by <b>${e(ss.map(q => q.name).join(' or '))}</b>. That is not recorded for ${miss.length} of the ${S.picked.size} ticked sample${S.picked.size === 1 ? '' : 's'}: <span class="mono">${e(miss.join(', '))}</span>.</span></div>
     <h3>Do it first</h3>${ss.map(q => { const xs = projExps().find(y => y.proto === q.id); return xs ? `<div class="line"><button class="btn" data-a="preGo" data-x="${xs.id}">Do ${e(xs.name)} first</button></div>` : `<div class="hint">${e(q.name)} is not in this study. Add it under Study plan to run it here.</div>`; }).join('')}
     <h3>It has already been done</h3>
     <div class="rg">${ss.length > 1 ? `<label>Which one<select id="preSrc">${ss.map(q => `<option value="${q.id}">${e(q.name)}</option>`).join('')}</select></label>` : ''}<label>Date it was done (optional)<input type="date" id="preDate" max="${today}"></label></div>
     <div class="hint">Leave the date empty if it is not known. This is kept on the record of each of these samples.</div>
     <div class="line"><button class="btn pri" data-a="preDone">Record as done and start</button></div>
     <div class="foot"><span class="err" id="mErr"></span><button class="btn" data-a="close">Cancel</button><button class="btn" data-a="start" data-force="1">Start anyway</button></div>`;
  }
  if (m.type === 'newProto') {
    h = `<h2>Create new protocol</h2><label>Name<input type="text" id="npName" placeholder="e.g. Oil Red O staining"></label>
     <div class="hint">That is all it needs. You build the steps next, and it joins the lab library where everyone in the lab can see it and add it to their project.</div>
     <div class="foot"><span class="err" id="mErr"></span><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="newProtoSave">Create and build steps</button></div>`;
  }
  if (m.type === 'lib') {
    h = `<h2>Add a protocol to ${e(proj().name)}</h2><div class="hint">Every protocol anyone in the lab has created. Adding one gives it a column in this project's Overview and Experiments.</div>
     ${DB.protocols.map(q => `<div class="line" style="border-top:1px solid var(--line);padding-top:8px"><span class="grow"><b>${e(q.name)}</b><br><span class="sm muted">by ${e(users[q.by].name)} · ${cur(leaves(q)[0]).steps.length} steps · used in: ${e(usedIn(q))}</span></span><button class="btn sm" data-a="selProto" data-p="${q.id}">View</button>${inProj(q) ? flag('ok', 'Added') : `<button class="btn sm pri" data-a="addProj" data-p="${q.id}">Add</button>`}</div>`).join('') || '<div class="hint">The lab library is empty. Create the first protocol.</div>'}
     <div class="foot"><button class="btn" data-a="close">Close</button></div>`;
  }
  if (m.type === 'print') {
    const p = P(S.selProto), n = p.nodes.find(q => q.id === S.selNode), r = cur(n), rs = [...new Set(r.steps.map(q => q.reagent).filter(Boolean))].map(R).filter(Boolean);
    h = `<h2>${e(p.name)} <span class="mono">${e(vname(p, n))} rev ${r.n}</span></h2><div class="sm muted">Created by ${e(users[p.by].name)} · printed ${dt(now())} · ${dur(tot(r.steps))} in total</div><div class="sm">${e(ptypeLine(p))}</div>
     <ol class="steps">${r.steps.map(stepLi).join('')}</ol>
     <h3>Reagents</h3>${rs.length ? `<div class="scroll"><table class="mx"><thead><tr><th>Reagent</th><th>Brand</th><th>Supplier</th><th>Pack size</th></tr></thead><tbody>${rs.map(q => `<tr><td>${e(q.name)}</td><td class="g">${e(q.brand || '')}</td><td class="g">${e(q.supplier || '')}</td><td>${q.per} ${e(q.unit)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="hint">No reagents chosen in this protocol.</div>'}
     <div class="hint noprint">Price is left off the printed sheet.</div><div class="foot"><button class="btn" data-a="close">Close</button><button class="btn pri" data-a="printNow">Print</button></div>`;
  }
  if (m.type === 'newStudy') {
    h = `<h2>New study</h2><label>Name<input type="text" id="nsName" placeholder="e.g. BCMS Phase III"></label><label>Short description<input type="text" id="nsDesc" placeholder="e.g. 30 mice, colorectal xenograft"></label>
     <div class="hint">${isSup() ? 'As a supervisor you see it without being listed. Add its members under Lab and access.' : 'You start as its only member. Add other people under Lab and access.'}</div>
     <div class="foot"><span class="err" id="mErr"></span><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="newStudySave">Create study</button></div>`;
  }
  if (m.type === 'inbox') {
    const ns = inbox().reverse();
    h = `<h2>Inbox for ${e(users[S.user].name)}</h2>${ns.map(n => `<div class="sm" style="border-top:1px solid var(--line);padding-top:8px"><span class="muted">${dt(n.at)}${n.mailedAt ? ' · emailed' : ''}</span><br>${e(n.text)}</div>`).join('') || '<div class="hint">Nothing here.</div>'}<div class="hint">Each notice is also emailed to your Wits address when the lab's email notices are switched on.</div><div class="foot">${ns.length ? '<button class="btn" data-a="inboxClear">Clear all</button>' : ''}<button class="btn" data-a="close">Close</button></div>`;
  }
  return `<div class="modal" data-a="closeBg"><div class="dlg" role="dialog" aria-modal="true">${h}</div></div>`;
}

/* ---------------- sign-in gates ---------------- */
const gate = inner => `<div class="gate"><div class="card"><div class="brand">Lab Bench Tracker</div>${inner}</div></div>`;
function gateView() {
  if (S.fb === undefined) return gate('<div class="hint">Loading…</div>');
  if (!S.fb) return gate(`<div class="hint">Sign in with your Wits Google account (@students.wits.ac.za or @wits.ac.za).</div>
    <button class="btn pri" data-a="signin">Sign in with Google</button>
    <hr style="border:0;border-top:1px solid var(--line);margin:6px 0">
    ${S.linkSent ? `<div class="todo sm"><span>If <b>${e(S.linkSent)}</b> is in the lab, a sign-in link is on its way from the lab's own mailbox. It can take up to two minutes. Open the link in this same browser.</span></div><button class="btn sm" data-a="linkAgain">Use a different address</button>`
      : `<div class="hint">No Google account on your Wits address (most staff addresses)? Get a sign-in link by email instead.</div>
    <label>Wits email address<input type="email" id="linkEmail" placeholder="name@wits.ac.za" autocomplete="email"></label>
    <div class="line"><button class="btn" data-a="linkAsk">Email me a sign-in link</button><span class="err" id="linkErr"></span></div>`}`);
  if (!WITS.test(S.fb.email || '')) return gate(`<div class="err">${e(S.fb.email)} is not a Wits account.</div>
    <div class="hint">Sign out and choose your Wits Google account.</div><button class="btn" data-a="signout">Sign out</button>`);
  if (S.labErr) return gate(`<div class="err">${e(S.labErr)}</div><button class="btn" data-a="signout">Sign out</button>`);
  if (pending.has('lab')) return gate('<div class="hint">Loading the lab…</div>');
  if (!DB.lab) {
    if (S.user === LAB_OWNER) return gate(`<h2>Set up the lab</h2>
      <div class="hint">One-time step. You become the lab admin. Prof Kaur becomes supervisor and sees every project.</div>
      <label>Lab name<input type="text" id="labName" value="Kaur lab"></label>
      <label>Prof Kaur's Wits email<input type="email" id="supEmail" placeholder="name@wits.ac.za"></label>
      <div class="line"><button class="btn pri" data-a="setupLab">Set up the lab</button><span class="err" id="setupErr"></span></div>`);
    return gate(`<div class="hint">The lab has not been set up yet. Ask Zak to set it up, then sign in again.</div><button class="btn" data-a="signout">Sign out</button>`);
  }
  if (!isMember()) return gate(`<div class="hint">You are signed in as <b>${e(S.user)}</b>, but you are not in the lab yet.</div>
    <div class="hint">Ask Prof Kaur or Zak to add this address under Lab and access.</div><button class="btn" data-a="signout">Sign out</button>`);
  if (!S.ready) return gate('<div class="hint">Loading your projects…</div>');
  return null;
}

/* ---------------- render ---------------- */
const TABS = [['today', 'Today'], ['overview', 'Overview'], ['mice', 'Samples'], ['exps', 'Experiments'], ['protos', 'Protocols'], ['reag', 'Reagents'], ['targets', 'Targets'], ['plan', 'Study plan'], ['duties', 'Lab duties'], ['lab', 'Lab and access']];
let stale = false;
const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio' && !!a.closest('#app,#modal'); };
/* a change arriving from Firestore must not wipe a field someone is typing in: redraw once they leave it */
function softRender() { if (typing() && !gateView()) { stale = true; return; } render(); }
function safe(fn, what) { try { return fn(); } catch (err) { console.error(err); return `<div class="card"><b>This ${what} could not be shown.</b><div class="hint">${e(err.message)}</div></div>`; } }
function render() {
  stale = false; lastSig = sigNow();
  const g = gateView(); welcomeCheck();
  if (g) { $('#app').innerHTML = g; $('#modal').innerHTML = ''; return; }
  const vis = visProj();
  if (proj() && S.selExp === undefined) S.selExp = proj().exps[0];
  const keep = S.tab === render.tab ? [...document.querySelectorAll('#app .scroll, #app .rows')].map(el => [el.scrollTop, el.scrollLeft]) : []; render.tab = S.tab;
  const lock = lockFor(S.user), nn = inbox().length;
  $('#app').innerHTML = `<header class="top"><span class="brand">Lab Bench Tracker</span><span class="sp"></span>
    ${vis.length ? `<label class="fld" for="selProj">Project<select id="selProj" data-c="proj">${vis.map(p => `<option value="${p.id}" ${p.id === S.project ? 'selected' : ''}>${e(p.name)}</option>`).join('')}</select></label>` : ''}
    <span id="online" class="online" role="group" aria-label="Online now">${onlineHTML()}</span>
    <span class="sm">${e(S.fb.displayName || S.user)}</span>${flag(isSup() ? 'info' : isAdmin() ? 'ok' : '', roleOf(S.user))}
    <button class="btn" data-a="inbox">Inbox ${nn ? flag('info', nn) : ''}</button><button class="btn" data-a="signout">Sign out</button></header>
   <nav class="tabs" aria-label="Sections">${TABS.map(([k, l]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-a="tab" data-k="${k}">${l}${k === 'reag' && lowList().length ? ' ' + flag('bad', lowList().length + ' low') : ''}${k === 'protos' && S.edit ? ' ' + flag('warn', 'unsaved') : ''}</button>`).join('')}</nav>
   ${lock ? `<section class="lock"><h2>Last week's target was missed</h2><div>${e(tName(lock))}, week of ${wkLabel(lock.week)}: <b>${tDone(lock)} of ${tN(lock)}</b> done. Before you carry on, tell Prof Kaur what happened. She is notified as soon as you send it.</div>
     <div class="g3"><label for="exWhat">What happened<textarea id="exWhat" rows="3"></textarea></label><label for="exWhy">Why that meant the target was missed<textarea id="exWhy" rows="3"></textarea></label><label for="exPlan">Plan to catch up<textarea id="exPlan" rows="3"></textarea></label></div>
     <div class="line"><button class="btn pri" data-a="excuse" data-id="${lock.id}">Send to Prof Kaur and unlock</button><span class="err" id="exErr"></span></div></section>` : ''}
   <div class="view" ${lock ? 'inert' : ''}>${safe(V[S.tab], 'tab')}</div>`;
  document.querySelectorAll('#app .scroll, #app .rows').forEach((el, i) => { if (keep[i]) { el.scrollTop = keep[i][0]; el.scrollLeft = keep[i][1]; } });
  $('#modal').innerHTML = safe(modalHTML, 'window'); tick();
}
function tick() { document.querySelectorAll('[data-until]').forEach(el => { const l = Math.round((+el.dataset.until - now()) / 1000); el.textContent = l > 0 ? (l >= 3600 ? Math.floor(l / 3600) + ':' : '') + String(Math.floor(l % 3600 / 60)).padStart(2, '0') + ':' + String(l % 60).padStart(2, '0') + ' left' : 'time is up'; }); }
setInterval(tick, 1000);

/* ---------------- actions ---------------- */
const val = id => ($('#' + id)?.value || '').trim();
function syncEdit() {
  if (!S.edit || !$('#edRows')) return;   // nothing to read unless the builder is on screen
  S.edit.steps = [...document.querySelectorAll('#edRows .blk')].map((b, i) => {
    const o = S.edit.steps[i], g = f => b.querySelector('[data-f=' + f + ']'), q = { ...o, t: g('t').value.trim(), reagent: g('reagent').value, rname: g('reagent').value === '@name' && g('rname') ? g('rname').value.trim() : '', vol: +g('vol').value || 0, unit: g('unit').value, per: g('per').value, note: g('note').value.trim(), checks: [...b.querySelectorAll('[data-f=chk]')].map(c => c.value.trim()) };
    if (o.type === 'wash') { q.reps = Math.max(1, +g('reps').value || 1); q.each = +g('each').value || 0; q.m = q.reps * q.each; q.w = false; } else { q.m = +g('m').value || 0; q.w = g('w').checked; }
    if (o.type === 'other') q.kind = g('kind').value; return q;
  });
  S.edit.note = val('edNote'); S.edit.name = val('edName');
}
const mErr = t => { const el = $('#mErr'); if (el) el.textContent = t; return false; };
const A = {
  signin: () => { B.signIn().catch(err => { if (err.code !== 'auth/popup-closed-by-user') toast(errMsg(err)); }); return false; },
  linkAsk: () => {
    const em = low(val('linkEmail')), bad = t => { $('#linkErr').textContent = t; return false; };
    if (!WITS.test(em)) return bad('Type your full Wits address.');
    try { localStorage.setItem('linkEmail', em); } catch (_) {}
    $('#linkErr').textContent = 'Asking…';
    B.commit([{ op: 'set', path: 'signinRequests/' + nid(), data: { email: em, site: location.origin + location.pathname, at: now() } }])
      .then(() => { S.linkSent = em; render(); }, err => { const el = $('#linkErr'); if (el) el.textContent = errMsg(err); });
    return false;
  },
  linkAgain: () => { S.linkSent = null; },
  linkFor: (d, el) => {
    if (!canLab() || !WITS.test(d.em)) return false;
    el.disabled = true;
    B.commit([{ op: 'set', path: 'signinRequests/' + nid(), data: { email: low(d.em), site: location.origin + location.pathname, at: now() } }])
      .then(() => toast(`A sign-in link will be emailed to ${nameOf(d.em)} within about two minutes.`), err => { el.disabled = false; toast(errMsg(err)); });
    return false;
  },
  signout: () => { leave(); stopAll(); B.signOutAll().then(() => location.reload()); return false; },
  setupLab: () => {
    const sup = low($('#supEmail').value), name = $('#labName').value.trim() || 'Kaur lab';
    if (!WITS.test(sup)) { $('#setupErr').textContent = "Enter Prof Kaur's Wits email address."; return false; }
    DB.lab = { name, admins: [S.user], members: [S.user], supervisors: [sup], createdAt: now(), createdBy: S.user }; toast('Lab set up.');
  },
  addMember: () => {
    const em = low($('#newMember').value), role = $('#newRole').value;
    if (!WITS.test(em)) { $('#memberErr').textContent = 'Enter a Wits email address.'; return false; }
    const L = DB.lab; L.members = [...new Set([...(L.members || []), em])]; if (role === 'supervisors') L.supervisors = [...new Set([...sups(), em])];
    notice(em, `${users[S.user].name} added you to the ${DB.lab.name || 'lab'} on Lab Bench Tracker, the lab's bench tracker. Sign in with this Wits address to get started.`); toast(em + ' added.');
  },
  rmMember: d => { DB.lab.members = (DB.lab.members || []).filter(u => u !== d.em); toast(d.em + ' removed from the lab.'); },
  pickProj: d => { S.project = d.id; S.selMouse = null; S.picked.clear(); S.draft = newDraft(); S.tpick = null; S.selExp = undefined; S.planX = ''; },
  delProj: d => {
    const p = PR(d.id); if (!p || prompt(`This deletes the project and every record in it. Type the project name to confirm: ${p.name}`) !== p.name) return false;
    DB.projects = DB.projects.filter(q => q.id !== p.id);
    for (const k of ['exps', 'sessions', 'targets', 'files']) DB[k] = DB[k].filter(q => q.proj !== p.id);
    buildIdx(); toast('Project deleted.');
  },
  tab: d => { syncEdit(); S.tab = d.k; },   // a protocol being built stays as it is while you look at another tab
  inbox: () => S.modal = { type: 'inbox' }, close: () => S.modal = null, closeBg: (d, el, ev) => { if (ev.target !== el) return false; S.modal = null; },
  // A notice still waiting to be emailed is only hidden; the mail sheet removes it once it has gone out.
  inboxClear: () => { DB.notices = DB.notices.filter(n => { if (n.to !== S.user) return true; if (n.mailedAt === null && now() - n.at < 7 * DAY) { n.cleared = now(); return true; } return false; }); },
  mailTest: () => { if (!canLab()) return false; DB.notices.push({ id: nid(), to: S.user, at: now(), text: 'This is a test from Lab Bench Tracker. If it reached your email inbox, email notices are working.', by: S.user, mailedAt: null, test: true }); toast('Test queued. It should reach your email within a minute or two.'); },
  goExp: d => { S.tab = 'exps'; S.selExp = d.x; S.picked.clear(); }, goMouse: d => { S.tab = 'mice'; S.selMouse = d.m; S.mx = null; },
  goProto: d => { S.tab = 'protos'; S.selProto = d.p; S.selNode = S.variant || null; S.viewRev = null; },
  selMouse: d => { S.selMouse = d.m; S.mx = null; }, mx: d => { S.mx = S.mx === d.x ? null : d.x; },
  back: () => { if (S.tab === 'mice') S.selMouse = null; if (S.tab === 'exps') S.selExp = null; if (S.tab === 'protos') { S.selProto = null; S.edit = null; } },
  selExp: d => { S.selExp = d.x; S.picked.clear(); S.variant = null; }, selT: d => { S.selTarget = d.t; S.picked.clear(); },
  pick25: () => { const x = X(S.selExp), t = x.targets ? S.selTarget : ''; S.picked.clear(); for (const m of proj().samples) { if (S.picked.size >= 25) break; if (stOf(x.id, t, m.id) === 'todo') S.picked.add(m.id); } },
  pick0: () => S.picked.clear(),
  preGo: d => {
    const from = X(S.selExp), miss = lacking(from, [...S.picked]), x = X(d.x);
    S.selExp = x.id; S.variant = null; S.modal = null; S.picked.clear(); if (x.targets) S.selTarget = x.targets[0];
    if (!x.targets) miss.forEach(m => { if (stOf(x.id, '', m) === 'todo') S.picked.add(m); });
    toast(S.picked.size ? `${S.picked.size} sample${S.picked.size === 1 ? '' : 's'} ticked for ${x.name}. Come back to ${from.name} afterwards.` : `Tick the samples for ${x.name}. If they are not listed, assign them under Study plan.`);
  },
  preDone: () => {
    const x = X(S.selExp), ss = srcs(P(x.proto)), q = ss.find(y => y.id === val('preSrc')) || ss[0], dv = val('preDate'), at = dv ? new Date(dv + 'T12:00').getTime() : 0, pr = PR(x.proj);
    if (dv && (isNaN(at) || at > now() + DAY)) return mErr('That date is in the future.');
    pr.prior = pr.prior || {}; for (const m of lacking(x, [...S.picked])) pr.prior[q.id + '|' + m] = { at, by: S.user, on: now() };
    return A.start({ force: '1' });
  },
  start: d => {
    const x = X(S.selExp), p = P(x.proto), n = leaves(p).find(q => q.id === S.variant) || leaves(p)[0];
    if (!S.picked.size) return false;
    if (!cur(n).steps.length) { toast('This protocol has no steps yet. Build them under Protocols first.'); return false; }
    if (!d.force && lacking(x, [...S.picked]).length) { S.modal = { type: 'pre' }; return; }
    S.modal = null;
    const s = newSession(S.project, x.id, x.targets ? S.selTarget : '', [...S.picked], n.id, cur(n).n, S.user); buildIdx(); S.picked.clear(); S.openSession = s.id; S.tab = 'today'; toast('Bench session started with ' + s.mice.length + ' samples.');
  },
  run: d => S.modal = { type: 'run', x: d.x, t: d.t, m: d.m },
  runNote: () => { const m = S.modal, t = val('runNote'), s = runOf(m.x, m.t, m.m); if (!t || !s) return false; s.notes.push({ step: null, mice: [m.m], text: t, at: now(), by: S.user }); },
  fileAdd: () => {
    const m = S.modal, name = val('fName'), url = val('fUrl');
    if (!name) return mErr('Give the file a name.'); if (url && !safeUrl(url)) return mErr('The link must start with https://');
    DB.files.push({ id: nid(), proj: X(m.x).proj, key: key(m.x, m.t, m.m), name, url, at: now(), by: S.user });
  },
  fileDel: d => { DB.files = DB.files.filter(f => f.id !== d.id); },
  openSess: d => S.openSession = d.id,
  startWait: d => { sess(d.id).waitStart = now(); },
  stepDone: d => {
    const s = sess(d.id), stp = s.steps[s.stepIdx]; if (!stp) return false;
    if (stp.w && s.waitStart) { const a = Math.round((now() - s.waitStart) / MIN); if (a !== stp.m) s.notes.push({ step: s.stepIdx, mice: 'all', text: `Waited ${dur(a)} (protocol says ${dur(stp.m)})`, at: now(), by: S.user }); }
    const need = needML(stp, s.mice.length), rg = R(stp.reagent); if (need && rg) rg.used = Math.round(((rg.used || 0) + need) * 1e6) / 1e6;
    s.waitStart = null; s.stepIdx++; if (s.stepIdx >= s.steps.length) { s.doneAt = now(); S.openSession = null; toast(s.mice.length + ' runs marked done. Add the result files from Samples or Experiments.'); }
  },
  note: d => S.modal = { type: 'note', id: d.id, step: +d.step },
  noteSave: () => {
    const m = S.modal, t = val('nText'), some = document.querySelector('[name=nWho]:checked').value === 'some', ms = [...document.querySelectorAll('.nM:checked')].map(c => c.value);
    if (!t) return mErr('Write what was different.'); if (some && !ms.length) return mErr('Tick the samples it applies to.');
    sess(m.id).notes.push({ step: m.step, mice: some ? ms : 'all', text: t, at: now(), by: S.user }); S.modal = null;
  },
  addBl: () => { const t = val('blText'); if (!t) return false; DB.backlog.push({ id: nid(), text: t, m: +val('blMin') || 30, done: false }); },
  blDel: d => { DB.backlog = DB.backlog.filter(b => b.id !== d.id); },
  selProto: d => { S.selProto = d.p; S.selNode = null; S.viewRev = null; S.edit = null; S.modal = null; }, selNode: d => { S.selNode = d.n; S.viewRev = null; S.edit = null; },
  rev: d => { S.viewRev = d.n ? +d.n : null; },
  edStart: () => { const n = P(S.selProto).nodes.find(q => q.id === S.selNode); S.edit = { steps: cur(n).steps.map(q => ({ ...q, checks: [...q.checks] })), note: '', name: P(S.selProto).name }; },
  edAdd: d => { syncEdit(); S.edit.steps.push(blank(d.t)); }, edDel: d => { syncEdit(); S.edit.steps.splice(+d.i, 1); }, edCancel: () => S.edit = null,
  edUp: d => { syncEdit(); const a = S.edit.steps, i = +d.i; if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; }, edDown: d => { syncEdit(); const a = S.edit.steps, i = +d.i; if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]]; },
  ckAdd: d => { syncEdit(); S.edit.steps[+d.i].checks.push(''); }, ckDel: d => { syncEdit(); S.edit.steps[+d.i].checks.splice(+d.j, 1); },
  edSave: () => {
    syncEdit(); const p = P(S.selProto), n = p.nodes.find(q => q.id === S.selNode), first = !cur(n).steps.length, steps = S.edit.steps.map(q => ({ ...q, checks: q.checks.filter(Boolean) }));
    const nm = (S.edit.name || '').trim(), renamed = nm !== p.name, norm = a => canon(a.map(q => ({ ...q, rname: q.rname || '' }))), same = norm(steps) === norm(cur(n).steps);
    const nameOnly = renamed && same && !S.edit.note;      // just a new name: no new revision is needed for that
    const noName = steps.find(q => q.reagent === '@name' && !q.rname);
    const bad = !nm ? 'Give the protocol a name.' : noName ? 'Type the name of the reagent, or choose one from the list.' : nameOnly ? '' : !steps.length ? 'Add at least one step.' : !first && !S.edit.note ? 'Say what changed and why. It is kept in the history.' : ''; if (bad) { $('#edErr').textContent = bad; return false; }
    if (renamed) { const old = p.name; p.name = nm; plog(p, `Renamed from "${old}" to "${nm}"`); DB.exps.forEach(x => { if (x.proto === p.id && x.name === old) x.name = nm; }); }
    if (nameOnly) { S.edit = null; toast('Renamed to ' + nm + '.'); return; }
    if (first) { cur(n).steps = steps; cur(n).at = now(); } else n.revs.push(mkRev(cur(n).n + 1, now(), S.user, S.edit.note, steps)); S.edit = null; toast('Saved as rev ' + cur(n).n + (first ? '.' : '. Runs already done keep the revision they used.'));
  },
  lib: () => S.modal = { type: 'lib' }, print: () => S.modal = { type: 'print' }, printNow: () => { window.print(); return false; },
  addProj: d => { const p = P(d.p || S.selProto); if (!proj()) return false; if (!projExps().some(q => q.proto === p.id)) { const x = { id: nid(), name: p.name, proto: p.id, proj: S.project }; DB.exps.push(x); proj().exps.push(x.id); } toast(p.name + ' added to ' + proj().name + '. Tick which samples get it under Study plan.'); },
  newStudy: () => S.modal = { type: 'newStudy' },
  newStudySave: () => {
    const nm = clean(val('nsName')); if (!nm) return mErr('Give the study a name.'); const id = nid();
    DB.projects.push({ id, name: nm, desc: clean(val('nsDesc')), members: isSup() ? [] : [S.user], exps: [], samples: [], createdBy: S.user, createdAt: now() });
    S.project = id; S.selMouse = null; S.picked.clear(); S.draft = newDraft(); S.tpick = null; S.planX = ''; S.selExp = undefined; S.modal = null; S.tab = 'plan'; toast('Study created. Add its samples and experiments below.');
  },
  smAdd: () => {
    const names = val('smNames').split(/[\n,]/).map(clean).filter(Boolean), parts = val('smParts').split(',').map(clean).filter(Boolean), g = clean(val('smGroup')); if (!names.length) { $('#smErr').textContent = 'Type at least one name.'; return false; }
    const have = new Set(DB.projects.flatMap(p => p.samples.map(m => m.id))); let add = 0, dup = 0; for (const n of names) for (const id of parts.length ? parts.map(q => n + ' ' + q) : [n]) { if (have.has(id)) { dup++; continue; } have.add(id); proj().samples.push({ id, group: g }); add++; }
    toast(add + ' sample' + (add === 1 ? '' : 's') + ' added' + (dup ? ', ' + dup + ' skipped because the name already exists in a study' : '') + '.');
  },
  mtT: d => { S.addT.has(d.t) ? S.addT.delete(d.t) : S.addT.add(d.t); }, mtG: d => { S.addG = d.g; },
  mtTAdd: () => { const t = clean(val('mtNew')); if (!t) return false; const p = proj(); p.types = p.types || []; if (!p.types.includes(t)) p.types.push(t); S.addT.add(t); },
  mtGAdd: () => { const g = clean(val('mgNew')); if (!g) return false; const p = proj(); p.xg = p.xg || []; if (!pGroups().includes(g)) p.xg.push(g); S.addG = g; },
  mAdd: () => { const id = nextMouse(), ts = pTypes().filter(t => S.addT.has(t)), ids = ts.length ? ts.map(t => id + ' ' + t) : [id]; ids.forEach(q => proj().samples.push({ id: q, group: S.addG })); S.smOpen = true; toast('Added ' + ids.join(', ') + (S.addG ? ' to ' + S.addG : '') + '.'); },
  smDel: d => { const p = proj(); p.samples = p.samples.filter(m => m.id !== d.m); [...DB.asg].forEach(k => { if (k.endsWith('|' + d.m) && X(k.slice(0, k.indexOf('|')))?.proj === p.id) DB.asg.delete(k); }); },
  xDel: d => {
    if (DB.targets.some(t => t.items.some(i => i.exp === d.x))) { toast('This experiment is in a weekly target. Withdraw the target first.'); return false; }
    [...DB.asg].forEach(k => { if (k.startsWith(d.x + '|')) DB.asg.delete(k); });
    const p = proj(); p.exps = p.exps.filter(id => id !== d.x); DB.exps = DB.exps.filter(x => x.id !== d.x); if (S.planX === d.x) S.planX = ''; if (S.selExp === d.x) S.selExp = undefined;
  },
  tgAdd: d => { const x = X(d.x), t = clean(val('tg' + d.x)), r = val('tr' + d.x); if (!t || x.targets.includes(t)) return false; x.targets.push(t); if (r) (x.treag = x.treag || {})[t] = r; },
  pxAdd: () => { const p = P(val('pxProto')); if (!p) return false; const ts = [...new Set(val('pxT').split(',').map(clean).filter(Boolean))], x = { id: nid(), name: clean(val('pxName')) || p.name, proto: p.id, proj: S.project }; if (ts.length) x.targets = ts; DB.exps.push(x); proj().exps.push(x.id); toast(x.name + ' added. Tick its samples in the grid below.'); },
  asgCol: d => { const c = planCols()[+d.i], ks = proj().samples.map(m => key(c.x.id, c.t, m.id)).filter(k => !IDX.has(k)), all = ks.every(k => DB.asg.has(k)); ks.forEach(k => all ? DB.asg.delete(k) : DB.asg.add(k)); },
  asgRow: d => { const ks = planCols().map(c => key(c.x.id, c.t, d.m)).filter(k => !IDX.has(k)), all = ks.every(k => DB.asg.has(k)); ks.forEach(k => all ? DB.asg.delete(k) : DB.asg.add(k)); },
  dDeal: () => { if (!canLab()) return false; const k = mKey(S.dOff); deal(k, mKey(S.dOff - 1)); toast(mName(k) + ' dealt out.'); },
  dTick: d => { const dy = DB.duties.find(q => q.id === d.d); if (dy.kind === 'once') dy.doneAt = now(); else DB.dutyLog.push({ id: nid(), duty: dy.id, by: S.user, at: now(), month: mKey(0) }); toast(dy.name + ' ticked as done.'); },
  rqPost: () => {
    const t = val('rqText'), dy = DB.duties.find(q => q.id === val('rqDuty')); if (!t) { $('#rqErr').textContent = 'Say what is needed.'; return false; } DB.requests.push({ id: nid(), duty: dy ? dy.id : '', text: t, by: S.user, at: now(), doneAt: null, doneBy: null });
    (dy ? holders(dy, mKey(0)) : labPeople()).forEach(u => notice(u, `${users[S.user].name} posted a request${dy ? ' for ' + dy.name : ''}: ${t}`)); toast('Request posted' + (dy ? ' to ' + (holders(dy, mKey(0)).map(u => users[u].name).join(' and ') || 'the lab') : ' to the lab') + '.');
  },
  rqDone: d => { const r = DB.requests.find(q => q.id === d.id); r.doneAt = now(); r.doneBy = S.user; if (r.duty) DB.dutyLog.push({ id: nid(), duty: r.duty, by: S.user, at: now(), month: mKey(0) }); notice(r.by, `${users[S.user].name} finished your request: ${r.text}`); toast('Request marked done.'); },
  dyAdd: () => {
    if (!canLab()) return false;
    const nm = clean(val('dyName')), kind = val('dyKind'), n = Math.min(labPeople().length, Math.max(1, +val('dyN') || 1)); if (!nm) { $('#dyErr').textContent = 'Give the duty a name.'; return false; }
    const k = mKey(0), load = {}; labPeople().forEach(u => load[u] = 0); Object.values(DB.rota[k] || {}).flat().forEach(u => { if (u in load) load[u]++; }); const who = labPeople().map(u => ({ u, s: load[u] + Math.random() })).sort((a, b) => a.s - b.s).slice(0, n).map(q => q.u);
    const dy = { id: nid(), name: nm, kind, people: Math.max(1, n), at: now() }; if (kind === 'once') { dy.who = who; dy.doneAt = null; } else if (DB.rota[k]) DB.rota[k][dy.id] = who; DB.duties.push(dy);
    const told = kind === 'once' || DB.rota[k]; if (told) who.forEach(u => notice(u, `You have a new lab duty: ${nm}.`)); toast(told ? nm + ' goes to ' + (who.map(u => users[u].name).join(' and ') || 'nobody yet') + '.' : nm + ' added. It is dealt out with the rest of the month.');
  },
  rgAdd: d => { R(d.r).bottles++; toast('One more bottle of ' + R(d.r).name + ' recorded.'); },
  rgLink: d => {
    const p = P(S.selProto), r = R(val(d.sel)); if (!p || !r) return false; let k = 0;
    for (const n of p.nodes) for (const rv of n.revs) for (const q of rv.steps) if (typed(q) && low(typed(q)) === low(d.n)) { q.reagent = r.id; k++; }
    plog(p, `Linked "${d.n}" to ${r.name} in the reagent list`); toast(`${d.n} is now linked to ${r.name} in ${k} step${k === 1 ? '' : 's'}. Stock is counted from the next session.`);
  },
  rgFromName: d => { S.rgPrefill = d.n; S.tab = 'reag'; toast('Fill in the pack size and add it, then come back to the protocol and press Link.'); },
  rgNew: () => { S.rgPrefill = ''; const nm = val('rgName'), per = +val('rgPer'); if (!nm || !per) { $('#rgErr').textContent = 'Give it a name and the amount per bottle.'; return false; } DB.reagents.push({ id: nid(), name: nm, bottles: +val('rgBottles') || 1, per, unit: val('rgUnit'), low: +val('rgLow') || 0, brand: val('rgBrand'), supplier: val('rgSupplier'), price: +val('rgPrice') || 0, used: 0 }); toast(nm + ' added. It can now be chosen in any protocol step.'); },
  split: () => S.modal = { type: 'split' }, addVar: () => S.modal = { type: 'addVar' }, newProto: () => S.modal = { type: 'newProto' },
  splitSave: () => {
    const p = P(S.selProto), n = p.nodes.find(q => q.id === S.selNode), names = val('spNames').split(',').map(s => s.trim()).filter(Boolean);
    if (names.length < 2) return mErr('Give at least two names.'); const from = vname(p, n) + ' rev ' + cur(n).n;
    names.forEach(nm => p.nodes.push({ id: nid(), parent: n.id, name: nm, revs: [mkRev(1, now(), S.user, 'Split from ' + from, clone(cur(n).steps))] }));
    S.selNode = kids(p, n.id)[0].id; S.modal = null; toast('Now: ' + leaves(p).map(q => vlabel(p, q)).join(', '));
  },
  addVarSave: () => {
    const p = P(S.selProto), n = p.nodes.find(q => q.id === S.selNode), nm = val('avName'); if (!nm) return mErr('Give the variant a name.');
    const from = vname(p, n); const nn = { id: nid(), parent: null, name: nm, revs: [mkRev(1, now(), S.user, 'Copied from ' + from, clone(cur(n).steps))] }; p.nodes.push(nn); S.selNode = nn.id; S.modal = null; toast('Added ' + vname(p, nn));
  },
  newProtoSave: () => {
    const nm = val('npName'); if (!nm) return mErr('Give it a name.'); const id = nid();
    DB.protocols.push({ id, name: nm, by: S.user, nodes: [{ id: id + '-s', parent: null, name: 'Standard', revs: [mkRev(1, now(), S.user, 'First version', [])] }] }); S.selProto = id; S.selNode = id + '-s'; S.viewRev = null; S.edit = { steps: [], note: '', name: nm }; S.modal = null; S.tab = 'protos';
  },
  propose: () => { const D = S.draft; if (!D.items.length) return false; const tg = { id: nid(), user: S.user, proj: S.project, week: D.week, status: 'proposed', excuse: null, override: D.override, items: D.items }; DB.targets.push(tg); noticeSup(`${users[S.user].name} proposed a target for ${wkLabel(tg.week)}: ${tName(tg)}. It needs your agreement.`); S.draft = newDraft(); toast('Sent to Prof Kaur.'); },
  dPick: d => { const p = S.draft.pick; p.has(d.m) ? p.delete(d.m) : p.add(d.m); }, dClear: () => S.draft.pick.clear(),
  dNext: () => { const D = S.draft, [x, t] = D.exp.split('|'), pl = new Set(D.items.filter(i => i.exp === x && i.target === t).flatMap(i => i.mice)); D.pick.clear(); for (const m of proj().samples) { if (D.pick.size >= 25) break; if (!pl.has(m.id) && stOf(x, t, m.id) === 'todo') D.pick.add(m.id); } },
  dAdd: () => { const D = S.draft, [x, t] = D.exp.split('|'); if (!D.pick.size) return false; D.items.push({ exp: x, target: t, mice: [...D.pick] }); D.pick.clear(); D.override = false; },
  dDel: d => { S.draft.items.splice(+d.i, 1); S.draft.override = false; }, dWkSet: d => { S.draft.week = +d.w; S.draft.override = false; },
  tpick: d => { const id = d.id, k = +d.k; if (!S.tpick || S.tpick.t !== id || S.tpick.k !== k) S.tpick = { t: id, k, set: new Set() }; const p = S.tpick.set; p.has(d.m) ? p.delete(d.m) : p.add(d.m); },
  tstart: () => {
    const t = DB.targets.find(q => q.id === S.tpick.t), i = t.items[S.tpick.k], n = leaves(P(X(i.exp).proto))[0];
    if (!cur(n).steps.length) { toast('This protocol has no steps yet. Build them under Protocols first.'); return false; }
    const s = newSession(t.proj, i.exp, i.target, [...S.tpick.set], n.id, cur(n).n, S.user); buildIdx(); S.tpick = null; S.openSession = s.id; S.tab = 'today'; toast('Bench session started with ' + s.mice.length + ' samples.');
  },
  pickT: () => { const x = X(S.selExp), t = x.targets ? S.selTarget : ''; S.picked = new Set(weekTargetMice(x.id, t)); },
  agree: d => { const t = DB.targets.find(q => q.id === d.id); t.status = 'agreed'; t.note = val('tn' + t.id); notice(t.user, `Prof Kaur agreed your target for ${wkLabel(t.week)}: ${tName(t)}.`); toast('Agreed. ' + users[t.user].name + ' has been told.'); },
  change: d => { const t = DB.targets.find(q => q.id === d.id), c = val('tn' + t.id); if (!c) { toast('Add a comment saying what to change.'); return false; } t.status = 'change'; t.note = c; notice(t.user, `Prof Kaur asked for a change to your target (${tName(t)}): ${c}`); },
  delT: d => { DB.targets = DB.targets.filter(q => q.id !== d.id); },
  excuse: d => {
    const t = DB.targets.find(q => q.id === d.id), what = val('exWhat'), why = val('exWhy'), plan = val('exPlan'); if (!what || !why || !plan) { $('#exErr').textContent = 'All three are needed before you can carry on.'; return false; }
    t.excuse = { what, why, plan, at: now() }; noticeSup(`${users[S.user].name} explained the missed target (${tName(t)}, ${tDone(t)} of ${tN(t)}). What happened: ${what} Why it was missed: ${why} Plan: ${plan}`); toast('Sent to Prof Kaur. You can carry on.');
  },
  addMem: d => { const u = val('add' + d.p), p = PR(d.p); if (!u || p.members.includes(u)) return false; p.members.push(u); notice(u, `${users[S.user].name} added you to ${p.name}.`); toast(users[u].name + ' now has access to ' + p.name); },
  rmMem: d => { const p = PR(d.p); p.members = p.members.filter(u => u !== d.u); },
};
document.addEventListener('click', ev => { const el = ev.target.closest('[data-a]'); if (!el || !A[el.dataset.a]) return; if (A[el.dataset.a](el.dataset, el, ev) !== false) { commit(); render(); } });
document.addEventListener('change', ev => {
  const el = ev.target, c = el.dataset.c; if (!c) return;
  if (c === 'proj') A.pickProj({ id: el.value });
  if (c === 'dWk') { S.draft.week = +el.value; S.draft.override = false; }
  if (c === 'dExp') { S.draft.exp = el.value; S.draft.pick.clear(); }
  if (c === 'dOver') S.draft.override = el.checked;
  if (c === 'free') S.freeMin = +el.value || null;
  if (c === 'bl') { const b = DB.backlog.find(b => b.id === el.dataset.id); if (b) b.done = el.checked; }
  if (c === 'pick') { el.checked ? S.picked.add(el.dataset.m) : S.picked.delete(el.dataset.m); }
  if (c === 'asg') { el.checked ? DB.asg.add(el.dataset.k) : DB.asg.delete(el.dataset.k); commit(); return; }
  if (c === 'planX') S.planX = el.value;
  if (c === 'dOff') S.dOff = +el.value;
  if (c === 'variant') S.variant = el.value;
  if (c === 'tick') { const s = sess(el.dataset.id); if (s) s.ticks[el.dataset.k] = el.checked; }
  if (c === 'preOn' || c === 'preFrom') {
    syncEdit(); const p = P(S.selProto); if (!p) return;
    if (c === 'preOn') { if (el.checked) { p.rel = true; p.from = p.from || []; } else { delete p.rel; delete p.from; } }
    else { const id = el.dataset.p; p.from = (p.from || []).filter(x => x !== id); if (el.checked) p.from.push(id); }
  }
  if (c === 'addOther') { if (!el.value) return; syncEdit(); S.edit.steps.push(blank('other', el.value)); }
  commit(); render();
});
document.addEventListener('change', ev => {
  const el = ev.target; if (!S.edit || !el.matches || !el.matches('#edRows [data-f=reagent]')) return;
  const i = el.closest('.blk').dataset.i; syncEdit(); render();
  const box = document.querySelector(`#edRows .blk[data-i="${i}"] [data-f=rname]`); if (box) box.focus();
});
document.addEventListener('input', ev => {
  if (S.edit && ev.target.closest('#edRows')) { syncEdit(); $('#prev').innerHTML = prevHTML(S.edit.steps); }
  if (ev.target.dataset.i === 'q') { S.q = ev.target.value; $('#rows').innerHTML = mouseRows(); }
});
document.addEventListener('focusout', () => { if (stale) setTimeout(() => { if (stale && !typing()) render(); }, 0); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.modal) { S.modal = null; render(); } });

/* ---------------- welcome ---------------- */
/* Shown every time the page loads signed in: a DNA strand draws itself while the lab loads, then unzips to show the page. */
let WEL = null;
function firstName(u) {
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const g = (u.displayName || '').trim().split(/\s+/)[0]; if (g && !g.includes('@') && /^\p{L}/u.test(g)) return g;
  const m = /^([a-z]+)[._-]/i.exec(u.email || ''); return m ? cap(m[1]) : '';
}
function helixSVG() {
  const W = 320, H = 84, A = 28, L = 80, y = (x, s) => H / 2 + s * A * Math.sin(x * 2 * Math.PI / L), r = n => Math.round(n * 10) / 10;
  const strand = s => { let d = ''; for (let x = 4; x <= W - 4; x += 2) d += (d ? 'L' : 'M') + x + ' ' + r(y(x, s)); return d; };
  let rungs = '', i = 0;
  for (let x = 14; x < W - 8; x += 10) { const a = y(x, 1), b = y(x, -1); if (Math.abs(a - b) < 16) continue; rungs += `<line x1="${x}" y1="${r(a)}" x2="${x}" y2="${r(b)}" class="${i % 2 ? 'p' : ''}" style="--i:${i++}"/>`; }
  return `<svg class="helix" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><g class="rungs">${rungs}</g><path class="a" pathLength="1" d="${strand(1)}"/><path class="b" pathLength="1" d="${strand(-1)}"/></svg>`;
}
function startWelcome(u) {
  if (WEL) WEL.el.remove();
  const el = document.createElement('div'), nm = firstName(u); el.id = 'welcome'; el.setAttribute('role', 'status');
  el.innerHTML = `<div class="wel-in"><img src="logo.png" alt="" width="116" height="116"><h1>Welcome${nm ? ', ' + e(nm) : ''}</h1>${helixSVG()}<div class="hint">Opening the lab…</div></div>`;
  document.body.append(el); WEL = { el, t0: now(), open: false };
  el.addEventListener('click', () => openWelcome());
  setTimeout(welcomeCheck, 1900); setTimeout(openWelcome, 9000);
}
const stillLoading = () => S.fb === undefined || (!!S.fb && WITS.test(S.fb.email || '') && !S.labErr && (pending.has('lab') || (!!DB.lab && isMember() && !S.ready)));
function welcomeCheck() { if (WEL && !WEL.open && now() - WEL.t0 >= 1850 && !stillLoading()) openWelcome(); }
function openWelcome() {
  if (!WEL || WEL.open) return; WEL.open = true; const el = WEL.el; el.classList.add('open');
  setTimeout(() => { el.remove(); if (WEL && WEL.el === el) WEL = null; }, 1100);
}

/* ---------------- sign-in ---------------- */
B.finishLink().then(r => { if (r && r.error) toast('That sign-in link has expired or was already used. Ask for a new one.'); });
S.fb = undefined;
B.onAuth(u => {
  stopAll(); S.fb = u || null; S.user = low(u?.email); rebuild();
  if (!u || !WITS.test(u.email || '')) return;
  // Keep a profile so other lab members see a name rather than an address.
  B.commit([{ op: 'merge', path: 'users/' + u.uid, data: { name: u.displayName || u.email, email: S.user, lastSeen: B.ts() } }]).catch(() => {});
  subs.push(watch('lab', 'config/lab', true));
  startWelcome(u);
  render();
});
render();
