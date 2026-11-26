// What every button and field does (A), and the page-wide click, change and key listeners.

import * as B from '../backend.js';
import { $, DAY, DB, MIN, S, WITS, WK, canLab, dur, errMsg, isSup, low, nameOf, newDraft, nid, now, safeUrl, sups, toast, users, wkLabel } from './core.js';
import { canon, clone, commit, dayKey, forgetPlace, leave, rebuild, stopAll, visitStop } from './sync.js';
import { R, needML } from './reagents.js';
import { P, PR, X, blank, cur, doneSess, inGrp, kids, lacking, leaves, mkRev, nameTaken, needAll, parseImport, parts, plog, prevHTML, priorOf, revOff, rounds, schedTxt, srcs, typed, vlabel, vname } from './protocols.js';
import { IDX, buildIdx, key, newSession, notice, noticeSup, proj, projExps, runOf, sess, stOf } from './runs.js';
import { DAYN, claimOf, day0, dayOf, tDone, tN, tName, weekTargetMice } from './targets.js';
import { monImport, obChange, obsDays } from './monitoring.js';
import { dueList, resChange } from './study.js';
import { anMk, anRec, mouseRows } from './animals.js';
import { BIO_URL, driveUpload } from './lab.js';
import { pickFiles, queueUpload } from './uploads.js';
import { photoActions } from './photos.js';
import { exportActions } from './export.js';
import { clean, nextMouse, pGroups, pTypes, planCols, planRows } from './plan.js';
import { deal, dutyActions, dutySure, holders, labPeople, mKey, mName } from './duties.js';
import { render, softRender, stale, typing } from './render.js';

let bioT = 0;

/* ---------------- actions ---------------- */
export const val = id => ($('#' + id)?.value || '').trim();
export function syncEdit() {
  if (!S.edit || !$('#edRows')) return;   // nothing to read unless the builder is on screen
  S.edit.steps = [...document.querySelectorAll('#edRows .blk')].map((b, i) => {
    const o = S.edit.steps[i], g = f => b.querySelector('[data-f=' + f + ']'), q = { ...o, t: g('t').value.trim(), reagent: g('reagent').value, rname: g('reagent').value === '@name' && g('rname') ? g('rname').value.trim() : '', vol: +g('vol').value || 0, unit: g('unit').value, per: g('per').value, note: g('note').value.trim(), checks: [...b.querySelectorAll('[data-f=chk]')].map(c => c.value.trim()),
      conc: g('conc').value.trim(), temp: g('temp').value.trim(), equip: g('equip').value.trim(), until: g('until').value.trim(), mMax: g('mMax') ? +g('mMax').value || 0 : 0,
      more: [...b.querySelectorAll('.more')].map(r => { const h = f => r.querySelector('[data-f=' + f + ']').value, nm = h('xname').trim(), hit = DB.reagents.find(z => low(z.name) === low(nm)); return { reagent: hit ? hit.id : '@name', rname: nm, vol: +h('xvol') || 0, unit: h('xunit'), conc: h('xconc').trim() }; }),
      prog: { n: g('gn') ? Math.max(0, Math.round(+g('gn').value || 0)) : 0, stages: [...b.querySelectorAll('.stage')].map(r => ({ temp: r.querySelector('[data-f=gtemp]').value.trim(), time: r.querySelector('[data-f=gtime]').value.trim() })) },
      outs: [...b.querySelectorAll('[data-f=out]')].map(c => c.value.trim()) };
    if (o.type === 'wash') { q.reps = Math.max(1, +g('reps').value || 1); q.each = +g('each').value || 0; q.m = q.reps * q.each; q.w = false; } else { q.m = +g('m').value || 0; q.w = g('w').checked; }
    if (o.type === 'other') q.kind = g('kind').value; return q;
  });
  S.edit.note = $('#edNote') ? val('edNote') : ''; S.edit.name = val('edName'); S.edit.full = val('edFull'); S.edit.grp = val('edGrp'); S.edit.pnotes = val('edNotes'); S.edit.ethics = val('edEthics'); S.edit.schedN = val('edSchedN'); S.edit.schedD = val('edSchedD'); S.edit.fields = [...document.querySelectorAll('#edFields .pfield')].map(r => ({ n: r.querySelector('[data-f=fn]').value.trim(), u: r.querySelector('[data-f=fu]').value.trim() }));
}
const mErr = t => { const el = $('#mErr'); if (el) el.textContent = t; return false; };
export const A = {
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
  signout: () => { try { sessionStorage.removeItem('lbt-state'); } catch (_) {} forgetPlace(); leave(); stopAll(); B.signOutAll().then(() => location.reload()); return false; },
  setupLab: () => {
    const sup = low($('#supEmail').value), name = $('#labName').value.trim() || 'Kaur lab';
    if (!WITS.test(sup)) { $('#setupErr').textContent = "Enter Prof Kaur's Wits email address."; return false; }
    DB.lab = { name, admins: [S.user], members: [S.user], supervisors: [sup], createdAt: now(), createdBy: S.user }; toast('Lab set up.');
  },
  addMember: () => {
    const em = low($('#newMember').value), role = $('#newRole').value;
    if (!WITS.test(em)) { $('#memberErr').textContent = 'Enter a Wits email address.'; return false; }
    const L = DB.lab; L.members = [...new Set([...(L.members || []), em])]; if (role === 'supervisors') L.supervisors = [...new Set([...sups(), em])];
    notice(em, `${users[S.user].name} added you to the ${DB.lab.name || 'lab'} on Lab Bench Tracker, the lab's bench tracker. Sign in with this Wits address to get started.`); toast(em + ' added. The list is in order of email address, so look for it there rather than at the bottom.');
  },
  rmMember: d => { DB.lab.members = (DB.lab.members || []).filter(u => u !== d.em); toast(d.em + ' removed from the lab.'); },
  pickProj: d => { S.project = d.id; S.selMouse = null; S.picked.clear(); S.draft = newDraft(); S.tpick = null; S.selExp = undefined; S.planX = ''; },
  delProj: d => {
    const p = PR(d.id); if (!p || prompt(`This deletes the project and every record in it. Type the project name to confirm: ${p.name}`) !== p.name) return false;
    DB.projects = DB.projects.filter(q => q.id !== p.id);
    for (const k of ['exps', 'sessions', 'targets', 'files', 'obs', 'animals']) DB[k] = DB[k].filter(q => q.proj !== p.id);
    B.commit([{ op: 'delete', path: 'progress/' + p.id }]).catch(() => {}); buildIdx(); toast('Project deleted.');
  },
  tab: d => { syncEdit(); S.tab = d.k; },
  viewAs: () => { S.asMember = !S.asMember; S.visOn = false; toast(S.asMember ? 'Member view: this is what a lab member without admin rights sees.' : 'Admin view.'); },
  setPal: d => { const p = proj(); if (!p) return false; if (d.k) p.pal = d.k; else delete p.pal; },
  ovRest: () => { S.ovRest = !S.ovRest; },   // a protocol being built stays as it is while you look at another tab
  inbox: () => S.modal = { type: 'inbox' }, close: () => S.modal = null, closeBg: (d, el, ev) => { if (ev.target !== el) return false; S.modal = null; },
  // A notice still waiting to be emailed is only hidden; the mail sheet removes it once it has gone out.
  inboxClear: () => { DB.notices = DB.notices.filter(n => { if (n.to !== S.user) return true; if (n.mailedAt === null && now() - n.at < 7 * DAY) { n.cleared = now(); return true; } return false; }); },
  mailTest: () => { if (!canLab()) return false; DB.notices.push({ id: nid(), to: S.user, at: now(), text: 'This is a test from Lab Bench Tracker. If it reached your email inbox, email notices are working.', by: S.user, mailedAt: null, test: true }); toast('Test queued. It should reach your email within a minute or two.'); },
  goExp: d => { S.tab = 'exps'; S.selExp = d.x; S.picked.clear(); }, goMouse: d => { S.tab = 'mice'; S.mAll = true; S.selMouse = d.m; S.mx = null; },
  goProto: d => { S.tab = 'protos'; S.selProto = d.p; S.selNode = S.variant || null; S.viewRev = null; },
  selAnimal: d => { S.selAnimal = d.an; }, mBy: d => { S.mAll = !!d.k; S.q = ''; },
  anFileAdd: () => { const name = val('afName'), url = val('afUrl'); if (!name) { $('#afErr').textContent = 'Give it a name.'; return false; } if (url && !safeUrl(url)) { $('#afErr').textContent = 'The link must start with https://'; return false; } anMk(S.selAnimal).files.push({ name, url, at: now(), by: S.user }); },
  anFileDel: d => { anMk(S.selAnimal).files.splice(+d.j, 1); },
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
    pr.prior = pr.prior || {}; for (const m of lacking(x, [...S.picked])) for (const y of needAll(P(x.proto)) ? ss : [q]) if (!doneSess(pr, y, m) && !priorOf(pr, y, m)) pr.prior[y.id + '|' + m] = { at, by: S.user, on: now() };
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
    const also = [...document.querySelectorAll('.fAlso:checked')].map(c => c.value), f = { id: nid(), proj: X(m.x).proj, key: key(m.x, m.t, m.m), name, url, at: now(), by: S.user };
    if (also.length) f.keys = [m.m, ...also].map(q => key(m.x, m.t, q)); DB.files.push(f);
  },
  /* a result file for the run that is open: it joins the waiting list, and is linked to the run (and any other samples ticked) once it is in Drive */
  upPick: () => {
    const m = S.modal; if (!m || m.type !== 'run' || !X(m.x)) return false;
    const x = X(m.x), pid = x.proj, typed = val('fName'), also = [...document.querySelectorAll('.fAlso:checked')].map(c => c.value), ks = also.length ? [m.m, ...also].map(q => key(m.x, m.t, q)) : null;
    pickFiles(true, fs => { fs.forEach(f => queueUpload(m.m + ': ' + f.name, pid + '|run|' + key(m.x, m.t, m.m), async () => {
      const j = await driveUpload(f, 'Results/' + (x.name || 'Experiment'), pid), rec = { id: nid(), proj: pid, key: key(m.x, m.t, m.m), name: fs.length === 1 && typed ? typed : f.name, url: j.url, did: j.id, at: now(), by: S.user }; if (ks) rec.keys = ks;
      DB.files.push(rec); commit(); softRender();
    })); const el = $('#fName'); if (el) el.value = ''; });
    return false;
  },
  fileDel: d => { DB.files = DB.files.filter(f => f.id !== d.id); },
  openSess: d => S.openSession = d.id,
  startWait: d => { sess(d.id).waitStart = now(); },
  stepDone: d => {
    const s = sess(d.id), stp = s.steps[s.stepIdx]; if (!stp) return false;
    if (stp.w && s.waitStart) { const a = Math.round((now() - s.waitStart) / MIN); if (a !== stp.m) s.notes.push({ step: s.stepIdx, mice: 'all', text: `Waited ${dur(a)} (protocol says ${dur(stp.m)})`, at: now(), by: S.user }); }
    for (const q of parts(stp)) { const need = needML(q, s.mice.length), rg = R(q.reagent); if (need && rg) rg.used = Math.round(((rg.used || 0) + need) * 1e6) / 1e6; }
    s.at = { ...(s.at || {}), [s.stepIdx]: now() }; s.waitStart = null; s.stepIdx++; if (s.stepIdx >= s.steps.length) { s.doneAt = now(); S.openSession = null; toast(s.mice.length + ' runs marked done. Add the result files from Samples or Experiments.'); }
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
  edStart: () => { const n = P(S.selProto).nodes.find(q => q.id === S.selNode); const p = P(S.selProto); S.edit = { steps: cur(n).steps.map(q => ({ ...blank(q.type, q.kind), ...q, checks: [...q.checks], more: (q.more || []).map(x => ({ ...x })), prog: { n: (q.prog && q.prog.n) || 0, stages: ((q.prog && q.prog.stages) || []).map(x => ({ ...x })) }, outs: [...(q.outs || [])] })), note: '', name: p.name, full: p.full || '', grp: p.grp || '', pnotes: p.notes || '', ethics: p.ethics || '', schedN: (p.sched && p.sched.n) || '', schedD: (p.sched && p.sched.days) || '', fields: (p.fields || []).map(f => ({ ...f })) }; },
  edAdd: d => { syncEdit(); S.edit.steps.push(blank(d.t)); }, edDel: d => { syncEdit(); S.edit.steps.splice(+d.i, 1); }, edCancel: () => S.edit = null,
  edUp: d => { syncEdit(); const a = S.edit.steps, i = +d.i; if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; }, edDown: d => { syncEdit(); const a = S.edit.steps, i = +d.i; if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]]; },
  fldAdd: () => { syncEdit(); S.edit.fields = [...(S.edit.fields || []), { n: '', u: '' }]; }, fldDel: d => { syncEdit(); S.edit.fields.splice(+d.j, 1); },
  moreAdd: d => { syncEdit(); const q = S.edit.steps[+d.i]; q.more = [...(q.more || []), { reagent: '@name', rname: '', vol: 0, unit: 'µL', conc: '' }]; },
  moreDel: d => { syncEdit(); S.edit.steps[+d.i].more.splice(+d.j, 1); },
  stageAdd: d => { syncEdit(); const q = S.edit.steps[+d.i]; q.prog = { n: (q.prog && q.prog.n) || 0, stages: [...((q.prog && q.prog.stages) || []), { temp: '', time: '' }] }; },
  stageDel: d => { syncEdit(); S.edit.steps[+d.i].prog.stages.splice(+d.j, 1); },
  outAdd: d => { syncEdit(); const q = S.edit.steps[+d.i]; q.outs = [...(q.outs || []), '']; },
  outDel: d => { syncEdit(); S.edit.steps[+d.i].outs.splice(+d.j, 1); },
  ckAdd: d => { syncEdit(); S.edit.steps[+d.i].checks.push(''); }, ckDel: d => { syncEdit(); S.edit.steps[+d.i].checks.splice(+d.j, 1); },
  pMove: d => { const p = P(S.selProto), a = inGrp(p.grp || ''), i = a.indexOf(p), j = i + (+d.d); if (!p.grp || j < 0 || j >= a.length) return false; a.splice(i, 1); a.splice(j, 0, p); a.forEach((q, k) => q.pos = k); },
  revToggle: () => { if (!canLab()) return false; if (DB.lab.revOff) delete DB.lab.revOff; else DB.lab.revOff = true; toast(DB.lab.revOff ? 'Revision history is off: saving a protocol replaces its steps.' : 'Revision history is on: each save makes a new revision.'); },
  edSave: () => {
    syncEdit(); const p = P(S.selProto), n = p.nodes.find(q => q.id === S.selNode), first = !cur(n).steps.length, steps = S.edit.steps.map(q => ({ ...q, checks: q.checks.filter(Boolean), more: (q.more || []).filter(x => x.rname), prog: { n: (q.prog && q.prog.n) || 0, stages: ((q.prog && q.prog.stages) || []).filter(x => x.temp || x.time) }, outs: (q.outs || []).filter(Boolean) }));
    const nm = (S.edit.name || '').trim(), renamed = nm !== p.name, norm = a => canon(a.map(q => ({ ...blank(q.type, q.kind), ...q, rname: q.reagent === '@name' ? q.rname || '' : '' }))), same = norm(steps) === norm(cur(n).steps);
    const pn = (S.edit.pnotes || '').trim(), et = (S.edit.ethics || '').trim(), notesCh = pn !== (p.notes || ''), ethCh = et !== (p.ethics || '');
    const sn = Math.min(60, Math.max(0, Math.round(+S.edit.schedN || 0))), sd = Math.max(0, Math.round(+S.edit.schedD || 0)), sc = sn > 1 ? { n: sn, days: sd } : null, schCh = canon(sc) !== canon(p.sched || null), fl = (S.edit.fields || []).filter(f => f.n), fldCh = canon(fl) !== canon(p.fields || []);
    const fu = (S.edit.full || '').trim(), gr = (S.edit.grp || '').trim(), fullCh = fu !== (p.full || ''), grpCh = gr !== (p.grp || ''), inPlace = first || revOff();
    const nameOnly = (renamed || notesCh || ethCh || schCh || fldCh || fullCh || grpCh) && same && !S.edit.note;      // name, notes or ethics number only: no new revision is needed for that
    if (!nm) { $('#edErr').textContent = 'Give the protocol a name.'; return false; }
    if (fullCh) { if (fu) p.full = fu; else delete p.full; }
    if (grpCh) { if (gr) { p.pos = inGrp(gr).reduce((a, q) => Math.max(a, q.pos ?? -1), -1) + 1; p.grp = gr; if (canLab() && !(DB.lab.pgroups || []).includes(gr)) DB.lab.pgroups = [...(DB.lab.pgroups || []), gr]; } else { delete p.grp; delete p.pos; } plog(p, gr ? 'Filed under ' + gr : 'Taken out of its group'); }
    if (notesCh) { if (pn) p.notes = pn; else delete p.notes; plog(p, 'Protocol notes changed'); }
    if (fldCh) { if (fl.length) p.fields = fl; else delete p.fields; plog(p, fl.length ? 'Results to record: ' + fl.map(f => f.n).join(', ') : 'Results to record removed'); }
    if (schCh) { if (sc) p.sched = sc; else delete p.sched; plog(p, sc ? 'Schedule set: ' + schedTxt(sc).toLowerCase() : 'Schedule removed'); }
    if (ethCh) { if (et) p.ethics = et; else delete p.ethics; plog(p, et ? 'Ethics approval number set to ' + et : 'Ethics approval number removed'); }
    const noName = steps.find(q => q.reagent === '@name' && !q.rname);
    const bad = !nm ? 'Give the protocol a name.' : noName ? 'Type the name of the reagent, or choose one from the list.' : nameOnly ? '' : !steps.length ? 'Add at least one step.' : !inPlace && !S.edit.note ? 'Say what changed and why. It is kept in the history.' : ''; if (bad) { $('#edErr').textContent = bad; return false; }
    if (renamed) { const old = p.name; p.name = nm; plog(p, `Renamed from "${old}" to "${nm}"`); DB.exps.forEach(x => { if (x.proto === p.id && x.name === old) x.name = nm; }); }
    if (nameOnly) { S.edit = null; toast('Saved. The steps were not changed, so the revision stays the same.'); return; }
    if (inPlace) { cur(n).steps = steps; cur(n).at = now(); } else n.revs.push(mkRev(cur(n).n + 1, now(), S.user, S.edit.note, steps)); S.edit = null; toast(inPlace && !first ? 'Saved. Revision history is off, so rev ' + cur(n).n + ' was replaced.' : 'Saved as rev ' + cur(n).n + (first ? '.' : '. Runs already done keep the revision they used.'));
  },
  lib: () => S.modal = { type: 'lib' }, print: () => S.modal = { type: 'print' }, printNow: () => { window.print(); return false; },
  addProj: d => { const p = P(d.p || S.selProto); if (!proj()) return false; if (!projExps().some(q => q.proto === p.id)) { const x = { id: nid(), name: p.name, proto: p.id, proj: S.project }; if (p.sched && p.sched.n > 1) { x.targets = rounds(p.sched); x.sched = { days: p.sched.days || 0 }; } DB.exps.push(x); proj().exps.push(x.id); } toast(p.name + ' added to ' + proj().name + '. Tick which samples get it under Study plan.'); },
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
  pxAdd: () => { const p = P(val('pxProto')); if (!p) return false; const ts = [...new Set(val('pxT').split(',').map(clean).filter(Boolean))], x = { id: nid(), name: clean(val('pxName')) || p.name, proto: p.id, proj: S.project }; if (ts.length) x.targets = ts; else if (p.sched && p.sched.n > 1) { x.targets = rounds(p.sched); x.sched = { days: p.sched.days || 0 }; }
    DB.exps.push(x); proj().exps.push(x.id); toast(x.name + (x.sched ? ` added with ${x.targets.length} rounds. Tick its samples in the grid below.` : ' added. Tick its samples in the grid below.')); },
  visShow: () => { S.visOn = true; }, visHide: () => { S.visOn = false; S.visDay = ''; visitStop(); },
  failOk: () => { S.fail = null; },
  sureNo: () => { S.modal = (S.modal && S.modal.back) || null; },
  monOn: () => { const p = proj(); p.mon = { tx: 6, alert: 15, total: 200, agents: [], groups: {}, ...(p.mon || {}), on: true }; S.tab = 'monitor'; S.monView = 'setup'; toast('Monitoring is on for ' + p.name + '. Set the rules, then record a visit or import your sheet.'); },
  monOff: () => { proj().mon.on = false; S.tab = 'plan'; },
  monView: d => { S.monView = d.k; }, goAnimal: d => { S.tab = 'mice'; S.mAll = false; S.selAnimal = d.an; },
  monStep: d => { const L = obsDays().map(o => o.id), day = S.monDay || dayKey(now()), nx = +d.n < 0 ? L.filter(x => x < day).pop() : L.find(x => x > day); S.monDay = nx || (+d.n > 0 ? dayKey(now()) : day); },
  monAgAdd: () => { const M = proj().mon; M.agents = [...(M.agents || []), { name: '', per: 0, unit: 'µL', dil: 'Saline', fixed: 0 }]; },
  monAgDel: d => { const M = proj().mon, q = M.agents[+d.i]; M.agents.splice(+d.i, 1); for (const g in M.groups || {}) M.groups[g] = M.groups[g].filter(n => n !== q.name); },
  anEnd: d => { S.modal = { type: 'anEnd', an: d.an }; },
  anEndSave: () => { const m = S.modal, day = val('aeDay'), why = [val('aeWhy'), val('aeNote')].filter(Boolean).join(': '); if (!day) return mErr('Choose the date.'); const r = anMk(m.an); r.end = day; r.why = why; S.modal = null; toast(m.an + ' marked as ended.'); },
  anUnend: d => { const r = anRec(d.an); if (r) { delete r.end; delete r.why; } },
  upUrlSave: () => { const u = val('upUrl').replace(/[?#].*$/, ''); if (u && !/^https:\/\/script\.google\.com\/(a\/macros\/[\w.-]+\/|a\/[\w.-]+\/macros\/|macros\/)s\/[\w-]+\/exec$/.test(u)) { $('#upErr').textContent = 'That is not a web app address. It starts with https://script.google.com/ and ends with /exec. Copy the address shown under Web app after deploying, not the Deployment ID or the Library address.'; return false; } if (u) DB.lab.uploadUrl = u; else delete DB.lab.uploadUrl; toast(u ? 'Saved. Upload buttons now show wherever a file can be attached.' : 'Uploads from the tracker are off.'); },
  upTest: () => { const el = $('#upErr'); el.textContent = 'Checking…'; fetch(DB.lab.uploadUrl).then(r => r.json()).then(j => { el.textContent = j && j.ok ? 'The web app answered. Uploads should work.' : 'The address answered, but not as expected.'; }, () => { el.textContent = 'No answer. Check the address, and that the web app is deployed for "Anyone".'; }); return false; },
  bioLogin: () => { window.open(BIO_URL, '_blank', 'noopener'); S.modal = { type: 'bio' }; },
  bioCode: () => {   // asks the lab script for the current code; the secret itself never leaves the script
    const m = S.modal; if (!m || m.type !== 'bio' || m.busy || !DB.lab.uploadUrl) return false;
    Object.assign(m, { busy: true, err: '', old: false, code: null }); clearTimeout(bioT);
    const done = f => { if (S.modal !== m) return; m.busy = false; f(); render(); };
    B.idToken().then(token => fetch(DB.lab.uploadUrl, { method: 'POST', body: JSON.stringify({ action: 'totp', token }) })).then(r => r.json()).then(
      j => done(() => { if (!j.ok || !/^\d{6}$/.test(j.code)) { m.err = 'No code: ' + (j.error || 'the lab script needs its new version (SETUP.md, section 8)') + '.'; return; }
        const ms = Math.max(1, +j.left || 0) * 1000; m.code = j.code; m.until = now() + ms; bioT = setTimeout(() => { if (S.modal === m) { m.code = null; m.old = true; render(); } }, ms); }),
      () => done(() => { m.err = 'No answer from the lab script. Try again.'; }));
  },
  bioCopy: () => { const c = S.modal && S.modal.code; if (c) navigator.clipboard.writeText(c).then(() => toast('Code copied.'), () => toast('Could not copy. Type it in instead.')); return false; },
  ownAsk: () => { S.modal = { type: 'sure', a: 'ownDo', d: { p: val('ownProj'), to: val('ownTo') }, q: [`Hand the Drive folder for ${PR(val('ownProj'))?.name || ''} to ${nameOf(val('ownTo'))}?`, 'They become the owner of the folder and every file in it. You keep Editor access. This cannot be undone from the tracker.', 'Hand over ownership'], back: null }; },
  ownDo: d => { B.commit([{ op: 'set', path: 'driveRequests/' + nid(), data: { proj: d.p, to: d.to, by: S.user, at: now() } }]).then(() => toast('Asked. The result shows here within a minute or two.'), err => toast(errMsg(err))); },
  planClear: () => { S.planType = ''; S.planGroup = ''; S.planQ = ''; },
  asgCol: d => { const c = planCols()[+d.i], ks = planRows().map(m => key(c.x.id, c.t, m.id)).filter(k => !IDX.has(k)), all = ks.every(k => DB.asg.has(k)); ks.forEach(k => all ? DB.asg.delete(k) : DB.asg.add(k)); },
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
  impPick: () => { $('#impFile').click(); return false; },
  delProto: () => { if (!canLab()) return false; S.modal = { type: 'delProto' }; },
  delProtoYes: () => {
    const p = P(S.selProto); if (!p || !canLab()) return false;
    DB.protocols = DB.protocols.filter(q => q !== p);
    if (!(isSup() && !DB.exps.some(x => x.proto === p.id))) { p.deleted = { at: now(), by: S.user }; DB.gone.push(p); }
    S.selProto = null; S.selNode = null; S.edit = null; S.modal = null; toast(p.name + ' deleted.');
  },
  impSave: () => {
    const m = S.modal, chosen = m.list.filter((_, i) => m.pick.has(i)); if (!chosen.length) return mErr('Tick at least one protocol.');
    const made = new Map(), note = 'Imported from ' + m.file;
    for (const p of chosen) {
      const id = nid(), name = nameTaken(p.name) ? p.name + ' (imported)' : p.name;
      const nodes = p.variants.map((v, i) => ({ id: id + (i ? '-' + i : '-s'), parent: null, name: v.name, revs: [mkRev(1, now(), S.user, note + (p.source ? ' (' + p.source + ')' : ''), v.steps.map(q => {
        const link = z => { const hit = z.rn && DB.reagents.find(r => low(r.name) === low(z.rn)); if (z.rn) { z.reagent = hit ? hit.id : '@name'; z.rname = z.rn; } delete z.rn; return z; };
        return link({ ...q, checks: [...q.checks], more: q.more.map(x => link({ reagent: '', rname: '', ...x })) }); }))] }));
      const rec = { id, name, by: S.user, nodes }; if (p.notes) rec.notes = p.notes; if (p.ethics) rec.ethics = p.ethics; if (p.sched) rec.sched = p.sched; DB.protocols.push(rec); made.set(low(p.name), rec); p.rec = rec;
    }
    for (const p of chosen) {                       // "needs a sample from" is worked out once everything is in
      const from = p.prev.map(n => made.get(low(n)) || DB.protocols.find(q => low(q.name) === low(n))).filter(q => q && q !== p.rec).map(q => q.id);
      if (p.rel || from.length) { p.rec.rel = true; p.rec.from = [...new Set(from)]; if (p.all && p.rec.from.length > 1) p.rec.all = true;
        const u = {}; for (const [n, lab] of p.uses) { const q = made.get(low(n)) || DB.protocols.find(z => low(z.name) === low(n)); if (q && p.rec.from.includes(q.id)) u[q.id] = lab; } if (Object.keys(u).length) p.rec.uses = u; }
      delete p.rec;
    }
    const first = made.values().next().value; S.selProto = first.id; S.selNode = first.nodes[0].id; S.viewRev = null; S.edit = null; S.modal = null;
    toast(`Imported ${chosen.length} protocol${chosen.length === 1 ? '' : 's'}. Open each one to check the steps.`);
  },
  rgLink: d => {
    const p = P(S.selProto), r = R(val(d.sel)); if (!p || !r) return false; let k = 0;
    for (const n of p.nodes) for (const rv of n.revs) for (const q of rv.steps) for (const x of [q, ...(q.more || [])]) if (typed(x) && low(typed(x)) === low(d.n)) { x.reagent = r.id; k++; }
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
  handOver: d => {
    const t = DB.targets.find(q => q.id === d.id), k = +d.k, i = t && t.items[k], to = val('ho' + d.id + '_' + k); if (!i || t.user !== S.user || !to) return false;
    const pk = S.tpick && S.tpick.t === t.id && S.tpick.k === k && S.tpick.set.size ? S.tpick.set : null, give = i.mice.filter(m => stOf(i.exp, i.target, m) === 'todo' && (!pk || pk.has(m))); if (!give.length) return false;
    i.mice = i.mice.filter(m => !give.includes(m)); if (!i.mice.length) t.items.splice(k, 1); if (!t.items.length) DB.targets = DB.targets.filter(q => q !== t);
    const nt = { id: nid(), user: to, proj: t.proj, week: Math.max(t.week, WK), status: t.status === 'agreed' ? 'agreed' : 'proposed', excuse: null, override: false, items: [{ exp: i.exp, target: i.target, mice: give }], from: S.user }; DB.targets.push(nt);
    notice(to, `${users[S.user].name} handed you ${tName(nt)} for the week of ${wkLabel(nt.week)}.`); noticeSup(`${users[S.user].name} handed ${tName(nt)} (week of ${wkLabel(nt.week)}) to ${nameOf(to)}.`);
    S.tpick = null; toast(`Handed ${give.length} sample${give.length === 1 ? '' : 's'} to ${nameOf(to)}.`);
  },
  propose: () => { const D = S.draft; let lost = 0; D.items.forEach(i => { const n = i.mice.length; i.mice = i.mice.filter(m => !claimOf(i.exp, i.target, m)); for (const m in i.d || {}) if (!i.mice.includes(m)) delete i.d[m]; lost += n - i.mice.length; }); D.items = D.items.filter(i => i.mice.length); if (lost) { toast(`${lost} sample${lost === 1 ? ' was' : 's were'} taken into a teammate's target in the meantime and removed from your plan. Check it and send again.`); return; }
    if (!D.items.length) return false;
    // one target per week, so each week is agreed, tracked and (if missed) explained by itself; the days travel with it
    const weeks = [...new Set(D.items.map(i => i.week))].sort((a, b) => a - b);
    for (const w of weeks) { const tg = { id: nid(), user: S.user, proj: S.project, week: w, status: 'proposed', excuse: null, override: D.override, items: D.items.filter(i => i.week === w).map(i => { const o = { exp: i.exp, target: i.target, mice: [...i.mice] }; if (i.d && Object.keys(i.d).length) o.d = { ...i.d }; return o; }) }; DB.targets.push(tg); noticeSup(`${users[S.user].name} proposed a target for ${wkLabel(tg.week)}: ${tName(tg)}. It needs your agreement.`); }
    S.draft = newDraft(); toast(weeks.length > 1 ? `Sent to Prof Kaur as ${weeks.length} weekly targets.` : 'Sent to Prof Kaur.'); },
  dPick: d => { const p = S.draft.pick, [x, t] = S.draft.exp.split('|'); if (claimOf(x, t, d.m)) return false; p.has(d.m) ? p.delete(d.m) : p.add(d.m); }, dClear: () => S.draft.pick.clear(),
  dNext: () => { const D = S.draft, [x, t] = D.exp.split('|'), pl = new Set(D.items.filter(i => i.exp === x && i.target === t).flatMap(i => i.mice)); DB.targets.forEach(q => { if (q.user === S.user && q.status !== 'change' && q.week >= WK) q.items.forEach(i => { if (i.exp === x && i.target === t) i.mice.forEach(m => pl.add(m)); }); });
    D.pick.clear(); for (const m of proj().samples) { if (D.pick.size >= 25) break; if (!pl.has(m.id) && stOf(x, t, m.id) === 'todo' && !claimOf(x, t, m.id)) D.pick.add(m.id); } },
  /* put the clicked samples on one day of one week (day -1: that week, no fixed day) */
  dDay: d => {
    const D = S.draft, [x, t] = D.exp.split('|'), w = +d.w, day = +d.d; if (!D.pick.size) { toast('Click the samples first, then the day.'); return false; }
    if (day >= 0 ? w + day * DAY < day0() : w + 7 * DAY <= day0()) { toast('That day has already passed.'); return false; }
    for (const i of D.items) if (i.exp === x && i.target === t) { i.mice = i.mice.filter(m => !D.pick.has(m)); for (const m of D.pick) delete i.d[m]; }   // a sample sits on one day only
    let it = D.items.find(i => i.week === w && i.exp === x && i.target === t); if (!it) D.items.push(it = { week: w, exp: x, target: t, mice: [], d: {} });
    for (const m of D.pick) { it.mice.push(m); if (day >= 0) it.d[m] = day; }
    D.items = D.items.filter(i => i.mice.length); toast(`${D.pick.size} sample${D.pick.size === 1 ? '' : 's'} planned for ${day < 0 ? 'the week of ' + wkLabel(w) : DAYN[day] + ' ' + new Date(w + day * DAY).getDate()}.`); D.pick.clear(); D.override = false;
  },
  dDel: d => { const D = S.draft, i = D.items[+d.i], day = +d.d; if (!i) return false; const out = i.mice.filter(m => dayOf(i, m) === day); i.mice = i.mice.filter(m => !out.includes(m)); out.forEach(m => delete i.d[m]); D.items = D.items.filter(q => q.mice.length); D.override = false; },
  dWkSet: d => { S.draft.week = Math.min(+d.w, WK + 25 * 7 * DAY); S.draft.override = false; },
  tpick: d => { const id = d.id, k = +d.k; if (!S.tpick || S.tpick.t !== id || S.tpick.k !== k) S.tpick = { t: id, k, set: new Set() }; const p = S.tpick.set; p.has(d.m) ? p.delete(d.m) : p.add(d.m); },
  tDay: d => {
    const t = DB.targets.find(q => q.id === d.id), sel = S.tpick; if (!t || t.user !== S.user || !sel || sel.t !== t.id || !sel.set.size) { toast('Click the samples first, then the day.'); return false; }
    const i = t.items[sel.k], day = +d.d; i.d = { ...(i.d || {}) }; for (const m of sel.set) { if (day < 0) delete i.d[m]; else i.d[m] = day; } if (!Object.keys(i.d).length) delete i.d;
    toast(day < 0 ? `${sel.set.size} taken off their day.` : `${sel.set.size} placed on ${DAYN[day]}.`); S.tpick = null;
  },
  tToday: d => { const t = DB.targets.find(q => q.id === d.id), k = +d.k, i = t && t.items[k], td = (new Date().getDay() + 6) % 7; if (!i) return false; S.tpick = { t: t.id, k, set: new Set(i.mice.filter(m => (d.late ? dayOf(i, m) >= 0 && dayOf(i, m) < td : dayOf(i, m) === td) && stOf(i.exp, i.target, m) === 'todo')) }; },
  tstart: () => {
    const t = DB.targets.find(q => q.id === S.tpick.t), i = t.items[S.tpick.k], n = leaves(P(X(i.exp).proto))[0];
    if (!cur(n).steps.length) { toast('This protocol has no steps yet. Build them under Protocols first.'); return false; }
    const s = newSession(t.proj, i.exp, i.target, [...S.tpick.set], n.id, cur(n).n, S.user); buildIdx(); S.tpick = null; S.openSession = s.id; S.tab = 'today'; toast('Bench session started with ' + s.mice.length + ' samples.');
  },
  dueOpen: d => { const q = dueList().find(z => z.x.id === d.x && z.t === d.t); if (!q) return false; S.tab = 'exps'; S.selExp = d.x; S.selTarget = d.t; S.variant = null; S.picked = new Set(q.due.map(z => z.m)); },
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
/* Anything that deletes or removes asks first. Each entry gives the question, what is lost, and the button text. */
Object.assign(A, photoActions, exportActions, dutyActions);
export const SURE = {
  blDel: d => ['Remove this task from your backlog?', (DB.backlog.find(b => b.id === d.id) || {}).text || '', 'Remove task'],
  // deleting a whole project asks for its name to be typed instead (see delProj)
  delT: () => ['Withdraw this target?', 'It is removed for you and for your supervisor.', 'Withdraw target'],
  fileDel: d => ['Remove this result file link?', ((DB.files.find(q => q.id === d.id) || {}).name || '') + '. Only the link is removed; the file itself stays where it is.', 'Remove link'],
  inboxClear: () => ['Clear every notice in your inbox?', 'They are removed for good.', 'Clear inbox'],
  rmMem: d => [`Remove ${nameOf(d.u)} from ${PR(d.p)?.name || 'this project'}?`, 'They will no longer see this project or its records.', 'Remove from project'],
  rmMember: d => [`Remove ${nameOf(d.em)} from the lab?`, 'They lose access to the tracker. Their past records stay.', 'Remove from lab'],
  smDel: d => [`Remove the sample ${d.m}?`, 'It is taken out of the study and unticked from every experiment in the plan.', 'Remove sample'],
  xDel: d => [`Remove the experiment ${X(d.x)?.name || ''} from this study?`, 'Its ticks in the plan are removed too. The protocol itself stays in the lab library.', 'Remove experiment'],
  anFileDel: d => ['Remove this photo or file link?', (((anRec(S.selAnimal) || {}).files || [])[+d.j] || {}).name || '', 'Remove link'],
  monAgDel: d => ['Remove this drug from the dose rules?', ((proj().mon.agents || [])[+d.i] || {}).name || '', 'Remove drug'],
  monOff: () => ['Switch animal monitoring off for this study?', 'The tab is hidden. Everything recorded is kept and comes back if you switch it on again.', 'Switch off'],
  anUnend: d => [`Mark ${d.an} as not ended?`, 'Its end date and reason are cleared.', 'Clear the end'],
  edDel: d => [`Remove step ${+d.i + 1}?`, 'Everything typed in this step is lost.', 'Remove step'],
};
Object.assign(SURE, dutySure);
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return; let a = el.dataset.a, d = el.dataset, sure = false;
  if (a === 'sureYes') { const m = S.modal; if (!m || m.type !== 'sure') return; a = m.a; d = m.d; S.modal = m.back || null; sure = true; }
  if (!A[a]) return;
  if (SURE[a] && !sure) { syncEdit(); const q = SURE[a](d); S.modal = { type: 'sure', a, d: { ...d }, q, back: S.modal }; render(); return; }
  if (A[a](d, el, ev) !== false) commit(); else if (!sure) return;
  render();
});
document.addEventListener('change', ev => {
  const el = ev.target, c = el.dataset.c; if (!c) return;
  if (c === 'ob') { obChange(el); return; }          // typed measurements save without redrawing, so Tab keeps moving along the row
  if (c === 'res') { resChange(el); return; }
  if (c === 'fAll') { document.querySelectorAll('.fAlso').forEach(b => { b.checked = el.checked; }); return; }
  if (c === 'qAn') S.q = el.value;
  if (c === 'monDay') S.monDay = el.value || dayKey(now());
  if (c === 'monCfg') proj().mon[el.dataset.f] = Math.max(0, +el.value || 0);
  if (c === 'monAg') { const M = proj().mon, q = M.agents[+el.dataset.i], f = el.dataset.f, old = q.name; q[f] = f === 'per' || f === 'fixed' ? Math.max(0, +el.value || 0) : el.value.trim(); if (f === 'name' && old !== q.name) for (const g in M.groups || {}) M.groups[g] = M.groups[g].map(n => n === old ? q.name : n); }
  if (c === 'monGrp') { const M = proj().mon; M.groups = M.groups || {}; const a = (M.groups[el.dataset.g] || []).filter(n => n !== el.dataset.n); if (el.checked) a.push(el.dataset.n); M.groups[el.dataset.g] = a; }
  if (c === 'proj') A.pickProj({ id: el.value });
  if (c === 'dWk') { S.draft.week = +el.value; S.draft.override = false; }
  if (c === 'dExp') { S.draft.exp = el.value; S.draft.pick.clear(); }
  if (c === 'dOver') S.draft.override = el.checked;
  if (c === 'free') S.freeMin = +el.value || null;
  if (c === 'bl') { const b = DB.backlog.find(b => b.id === el.dataset.id); if (b) b.done = el.checked; }
  if (c === 'pick') { el.checked ? S.picked.add(el.dataset.m) : S.picked.delete(el.dataset.m); }
  if (c === 'asg') { el.checked ? DB.asg.add(el.dataset.k) : DB.asg.delete(el.dataset.k); commit(); return; }
  if (c === 'planX') S.planX = el.value;
  if (c === 'visDay') S.visDay = el.value;
  if (c === 'planType') S.planType = el.value;
  if (c === 'planGroup') S.planGroup = el.value;
  if (c === 'planQ') S.planQ = el.value.trim();
  if (c === 'dOff') S.dOff = +el.value;
  if (c === 'variant') S.variant = el.value;
  if (c === 'tick') { const s = sess(el.dataset.id); if (s) s.ticks[el.dataset.k] = el.checked; }
  if (c === 'preOn' || c === 'preFrom' || c === 'preAll' || c === 'preUse') {
    syncEdit(); const p = P(S.selProto); if (!p) return;
    if (c === 'preUse') { const u = { ...(p.uses || {}) }; if (el.value) u[el.dataset.p] = el.value; else delete u[el.dataset.p]; if (Object.keys(u).length) p.uses = u; else delete p.uses; } else
    if (c === 'preAll') { if (el.checked) p.all = true; else delete p.all; } else
    if (c === 'preOn') { if (el.checked) { p.rel = true; p.from = p.from || []; } else { delete p.rel; delete p.from; } }
    else { const id = el.dataset.p; p.from = (p.from || []).filter(x => x !== id); if (el.checked) p.from.push(id); }
  }
  if (c === 'addOther') { if (!el.value) return; syncEdit(); S.edit.steps.push(blank('other', el.value)); }
  commit(); render();
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.id === 'monFile') {
    const f = el.files && el.files[0]; if (!f) return; const snap = $('#monSnap') ? $('#monSnap').checked : true;
    f.text().then(t => { const msg = monImport(t, snap); commit(); S.monView = 'status'; render(); toast(msg); }).catch(err => { rebuild(); toast('That file could not be used: ' + (err.message || 'it could not be read') + '.'); });
    return;
  }
  if (el.id === 'impFile') {
    const f = el.files && el.files[0]; if (!f) return;
    if (f.size > 2e6) { toast('That file is too large to be a protocol file.'); return; }
    f.text().then(t => { const list = parseImport(t); if (!list.length) throw new Error('it has no protocols in it');
      S.modal = { type: 'imp', file: f.name.slice(0, 80), list, pick: new Set(list.map((p, i) => nameTaken(p.name) ? -1 : i).filter(i => i >= 0)) }; render(); })
      .catch(err => toast('That file could not be used: ' + (err.message || 'it could not be read') + '.'));
    return;
  }
  if (el.classList && el.classList.contains('impCk') && S.modal && S.modal.type === 'imp') { el.checked ? S.modal.pick.add(+el.value) : S.modal.pick.delete(+el.value); return; }
  if (!S.edit || !el.matches || !el.matches('#edRows [data-f=reagent]')) return;
  const i = el.closest('.blk').dataset.i; syncEdit(); render();
  const box = document.querySelector(`#edRows .blk[data-i="${i}"] [data-f=rname]`); if (box) box.focus();
});
document.addEventListener('input', ev => {
  if (S.edit && ev.target.closest('#edRows')) { syncEdit(); $('#prev').innerHTML = prevHTML(S.edit.steps); }
  if (ev.target.dataset.i === 'q') { S.q = ev.target.value; $('#rows').innerHTML = mouseRows(); }
});
// A redraw that was held back while someone typed waits a moment after they leave the box: leaving it is usually
// the press on a button, and redrawing before that press lands would throw the press (and the typed text) away.
document.addEventListener('focusout', () => { if (stale) setTimeout(() => { if (stale && !typing()) render(true); }, 450); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.modal) { S.modal = null; render(); } });
