// Export: a study's record as files to keep, in place of a paper lab book. The methods as they were performed
// (Word or Excel), the result files and images (Word, PowerPoint, or the original files in a zip), or everything.
// A file that shows several samples (one gel, five lanes) is exported once and lists all of its samples.

import * as B from '../backend.js';
import { DAY, DB, S, V, e, flag, nameOf, now, safeUrl, toast } from './core.js';
import { dayKey } from './sync.js';
import { softRender } from './render.js';
import { R, fmtV, needML } from './reagents.js';
import { P, X, dty, info, timeTxt, vname } from './protocols.js';
import { key, noProj, proj, projExps } from './runs.js';
import { DAYN, TS, dayOf, iName, tDone, tN, tState } from './targets.js';
import { tvol } from './monitoring.js';
import { DOC_BOX, docxBlob, fileSafe, fitBox, lib, pptxBlob, saveBlob, sha, shrink, xlsxBlob } from './office.js';

/* ---------------- what is being exported ---------------- */
const O = { proj: null, off: new Set(), from: '', to: '', animals: true };     // the choices at the top of the tab
const hm = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dtm = t => t ? dty(t) + ' ' + hm(t) : '', day = t => t ? dty(t) : '', D = t => t ? new Date(t) : '';
const who = em => em ? nameOf(em) : '', pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const xName = (x, t) => (X(x)?.name || 'Removed experiment') + (t ? ' ' + t : '');
function scope() {
  const p = proj(); if (O.proj !== p.id) { O.proj = p.id; O.off = new Set(); }
  const xs = projExps().filter(x => !O.off.has(x.id)), ids = new Set(xs.map(x => x.id));
  const from = O.from ? new Date(O.from + 'T00:00').getTime() : -Infinity, to = O.to ? new Date(O.to + 'T00:00').getTime() + DAY : Infinity, inR = t => t >= from && t < to;
  const sessions = DB.sessions.filter(s => s.proj === p.id && ids.has(s.exp) && inR(s.doneAt || s.startedAt || 0));
  const gm = new Map(p.samples.map(q => [q.id, q.group || '']));
  const what = `${xs.length === projExps().length ? 'all experiments' : xs.map(x => x.name).join(', ') || 'no experiments'}${O.from || O.to ? `, ${O.from ? 'from ' + day(from) : 'up'} to ${O.to ? day(to - DAY) : 'today'}` : ', all dates'}`;
  return { p, xs, ids, inR, sessions, group: id => gm.get(id) || '', what, ranged: !!(O.from || O.to) };
}

/* ---------------- result files: one entry per real file ---------------- */
/* The same file can be linked from many samples: once with several samples ticked, or pasted again on each sample.
   Both are brought down to one entry per file, which keeps the full list of samples it shows. */
export function driveId(u) {
  let url; try { url = new URL(String(u || '')); } catch (_) { return ''; }
  if (!/(^|\.)google\.com$/i.test(url.hostname)) return '';
  const m = /\/(?:file|document|spreadsheets|presentation|drawings)\/(?:u\/\d+\/)?d\/([\w-]{15,})/.exec(url.pathname); if (m) return m[1];
  const id = url.searchParams.get('id'); return id && /^[\w-]{15,}$/.test(id) && !/\/folders?\b/.test(url.pathname) ? id : '';
}
const normUrl = u => { try { const q = new URL(u); return q.origin.toLowerCase() + q.pathname.replace(/\/+$/, '') + q.search; } catch (_) { return String(u); } };
export function units(sc) {
  const U = new Map(), xi = new Map(sc.xs.map((x, i) => [x.id, i])), pairs = new Set(); let recs = 0, repeat = 0;
  const unit = (id, f, did) => {
    let u = U.get(id); if (!u) U.set(id, u = { ident: id, did: '', url: '', names: [], links: new Map(), animals: new Set(), recs: 0, at: 0, by: '' });
    u.recs++; recs++; u.did = u.did || did; if (f.name && !u.names.includes(f.name)) u.names.push(f.name); if (!u.url && safeUrl(f.url)) u.url = f.url;
    if (f.at && (!u.at || f.at < u.at)) { u.at = f.at; u.by = f.by || ''; } if (f.w) { u.ow = f.w; u.oh = f.h; } return u;
  };
  for (const f of DB.files) {
    if (f.proj !== sc.p.id || !sc.inR(f.at || 0)) continue;
    const ks = [...new Set((f.keys && f.keys.length ? f.keys : [f.key]).filter(Boolean))].map(k => { const a = String(k).split('|'); return { k, x: a[0], t: a[1] || '', m: a.slice(2).join('|') }; }).filter(q => sc.ids.has(q.x));
    if (f.kind === 'graph') { const did = f.did || driveId(f.url), u = unit(did ? 'd:' + did : safeUrl(f.url) ? 'u:' + normUrl(f.url) : 'n:' + f.id, f, did); u.graph = f.all ? ['All groups'] : [...new Set((u.graph || []).concat(f.groups || []))]; continue; }   // a graph belongs to groups, not to runs
    if (!ks.length) continue;
    const did = f.did || driveId(f.url), id = did ? 'd:' + did : safeUrl(f.url) ? 'u:' + normUrl(f.url) : 'n:' + f.id, u = unit(id, f, did);
    for (const q of ks) { pairs.add(id + '\n' + q.k); if (u.links.has(q.k)) repeat++; else u.links.set(q.k, q); }
  }
  if (O.animals) for (const a of DB.animals) {
    if (a.proj !== sc.p.id) continue;
    for (const f of a.files || []) { if (!sc.inR(f.at || 0)) continue; const did = f.id || driveId(f.url), id = did ? 'd:' + did : safeUrl(f.url) ? 'u:' + normUrl(f.url) : 'n:' + a.id + '|' + f.name + '|' + f.at, u = unit(id, f, did); u.animals.add(a.id); if (f.of) u.cut = true; }
  }
  const list = [...U.values()];
  for (const u of list) { const ls = [...u.links.values()]; u.xi = ls.length ? Math.min(...ls.map(q => xi.get(q.x))) : 1e9; u.x = ls.length ? sc.xs[u.xi] : null; u.tg = ls.length ? ls.filter(q => q.x === u.x.id).map(q => q.t).sort()[0] : ''; u.name = u.names[0] || 'Unnamed file'; }
  list.sort((a, b) => a.xi - b.xi || (a.tg < b.tg ? -1 : a.tg > b.tg ? 1 : 0) || a.at - b.at || (a.ident < b.ident ? -1 : 1));
  list.forEach((u, i) => { u.n = i + 1; u.no = 'F' + String(i + 1).padStart(list.length > 999 ? 4 : 3, '0'); });
  // the check: every sample-to-file link found in the tracker's records must still be there after bringing duplicates together
  const linkN = list.reduce((a, u) => a + u.links.size, 0), ok = linkN === pairs.size && [...pairs].every(q => { const [id, k] = q.split('\n'); return U.get(id) && U.get(id).links.has(k); });
  const covered = new Set(list.flatMap(u => [...u.links.keys()])), gaps = sc.sessions.filter(s => s.doneAt).flatMap(s => s.mice.map(m => ({ s, m, k: key(s.exp, s.target, m) }))).filter(q => !covered.has(q.k));
  const byKey = new Map(); for (const u of list) for (const k of u.links.keys()) (byKey.get(k) || byKey.set(k, []).get(k)).push(u);
  return { list, recs, linkN, repeat, merged: recs - list.length, ok, gaps, byKey, samples: new Set(list.flatMap(u => [...u.links.values()].map(q => q.m))).size,
    noLink: list.filter(u => !u.url).length, notDrive: list.filter(u => u.url && !u.did).length };
}
const covers = u => { const m = new Map(); for (const q of u.links.values()) { const l = xName(q.x, q.t); (m.get(l) || m.set(l, []).get(l)).push(q.m); } const out = [...m].map(([label, ms]) => ({ label, ms })); if (u.animals.size) out.push({ label: 'Animal profile', ms: [...u.animals] }); if (u.graph) out.push({ label: 'Graph for groups', ms: u.graph }); return out; };
const coverTxt = u => covers(u).map(c => `${c.label}: ${c.ms.join(', ')}${c.ms.length > 1 ? ' (' + c.ms.length + ')' : ''}`).join('; ');
const WHY = { link: 'It is a link to somewhere outside the study\'s Drive folder, so the tracker cannot download it. Open it from the link.', nolink: 'Only a name was recorded, with no link.', nodrive: 'Uploads from the tracker are not set up, so files cannot be downloaded (Lab and access, Google Drive).',
  notimg: 'It is not a picture, so it is listed with its link.', noprev: 'The browser cannot show this kind of picture (for example a TIFF) and Drive gave no preview.', failed: 'Drive did not hand it over after several tries.', gone: 'It could not be taken from Drive', none: 'Not reached: the export was stopped before this file.' };
function stText(u) {
  if (u.st === 'shown') return u.saved ? 'Shown in the document; original saved' : 'Shown in the document';
  if (u.st === 'saved') return 'Original saved';
  if (u.st === 'dup') return `The same file, byte for byte, as ${u.dupOf}: kept once, under ${u.dupOf}`;
  if (u.st === 'gone') return WHY.gone + (u.err ? ': ' + u.err + '.' : '.');
  if (u.st === 'failed') return WHY.failed + (u.err ? ' Last answer: ' + u.err + '.' : '');
  return (u.saved ? 'Original saved. ' : '') + (WHY[u.st || 'none'] || '');
}

/* ---------------- the methods, as performed ---------------- */
const stepState = (s, i) => i < s.stepIdx ? (s.at && s.at[i] ? dtm(s.at[i]) : 'Done') : i === s.stepIdx && !s.doneAt ? 'In progress' : 'Not done';
const stepNotes = (s, i) => s.notes.filter(n => n.step === i).map(n => `${n.mice === 'all' ? 'All samples' : n.mice.join(', ')}: ${n.text} (${who(n.by)}, ${dtm(n.at)})`);
function stepInfo(s, stp, i) {
  const a = info(stp), need = needML(stp, s.mice.length), rg = R(stp.reagent); if (need && rg) a.push(`${fmtV(need, stp.unit)} of ${rg.name} for this batch of ${s.mice.length}`);
  (stp.checks || []).filter(Boolean).forEach((c, j) => a.push((s.ticks[i + '|' + j] ? '☑ ' : '☐ ') + c)); if (stp.note) a.push('Comment: ' + stp.note); return a;
}
const resFields = ss => [...new Set(ss.flatMap(s => Object.values(s.res || {}).flatMap(r => Object.keys(r))))];
function sessBlocks(sc, U, s) {
  const pr = P(s.proto), b = [], mins = s.doneAt ? Math.round((s.doneAt - s.startedAt) / 6e4) : 0, fs = [...new Set(s.mice.flatMap(m => U.byKey.get(key(s.exp, s.target, m)) || []))], rf = resFields([s]);
  b.push({ h: 2, t: `${day(s.startedAt)} · ${xName(s.exp, s.target)} · ${pl(s.mice.length, 'sample')}` });
  b.push({ p: [{ t: 'Started ', b: true }, `${dtm(s.startedAt)} by ${who(s.by)}. `, { t: s.doneAt ? 'Finished ' : 'Not finished: ', b: true }, s.doneAt ? `${dtm(s.doneAt)} (${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min from start to finish).` : `at step ${s.stepIdx + 1} of ${s.steps.length} when this was exported.`] });
  b.push({ p: [{ t: 'Protocol ', b: true }, `${s.pname} ${s.label}, revision ${s.rev}. The steps below are the copy taken when the session started, so later edits to the protocol do not change them.${pr && pr.ethics ? ' Ethics approval: ' + pr.ethics + '.' : ''}`] });
  b.push({ p: [{ t: `Samples (${s.mice.length}) `, b: true }, s.mice.map(m => m + (sc.group(m) ? ' [' + sc.group(m) + ']' : '')).join(', ')] });
  b.push({ table: { head: ['#', 'Step', 'Details', 'Time', 'Done', 'Deviations noted'], w: [4, 22, 32, 10, 12, 20], rows: s.steps.map((stp, i) => [String(i + 1), stp.t || '', { lines: stepInfo(s, stp, i) }, timeTxt(stp) + (stp.w ? ', hands-free' : ''), stepState(s, i), { lines: stepNotes(s, i) }]) } });
  const loose = s.notes.filter(n => n.step == null); if (loose.length) b.push({ p: [{ t: 'Notes on single samples ', b: true }, loose.map(n => `${n.mice === 'all' ? 'All' : n.mice.join(', ')}: ${n.text} (${who(n.by)}, ${dtm(n.at)})`).join(' · ')] });
  if (rf.length) b.push({ p: [{ t: 'Values recorded', b: true }], keep: true }, { table: { head: ['Sample', ...rf], rows: s.mice.filter(m => s.res[m]).map(m => [m, ...rf.map(f => String(s.res[m][f] ?? ''))]) } });
  if (fs.length) b.push({ p: [{ t: 'Result files ', b: true }, ...fs.flatMap((u, i) => [i ? ' · ' : '', { t: `${u.no} ${u.name}`, url: u.url }])] });
  return b;
}
function protoHistory(sc) {
  const out = [], pids = [...new Set(sc.sessions.map(s => s.proto).concat(sc.xs.map(x => x.proto)))];
  for (const pid of pids) { const pr = P(pid); if (!pr) continue;
    for (const n of pr.nodes) for (const r of n.revs) out.push([pr.name, vname(pr, n), 'Revision ' + r.n, D(r.at), who(r.by), r.note || '', sc.sessions.filter(s => s.proto === pid && s.node === n.id && s.rev === r.n).length]);
    for (const l of pr.log || []) out.push([pr.name, '', 'Change', D(l.at), who(l.by), l.text || '', '']); }
  return out;
}
function methodBlocks(sc, U) {
  const p = sc.p, b = [], ss = sc.sessions;
  b.push({ h: 1, t: 'Lab book: ' + p.name });
  b.push({ p: `Exported from Lab Bench Tracker on ${dtm(now())} by ${who(S.user)}. Covers ${sc.what}.`, sm: true });
  if (p.desc) b.push({ p: p.desc });
  b.push({ p: `This is the record of what was done at the bench: ${pl(ss.length, 'bench session')} (${ss.filter(s => s.doneAt).length} finished), each with the protocol revision it used, the steps as they were performed, every deviation that was noted and the values typed in. File numbers (F001 and so on) are the same as in a data export made with the same selection.` });
  b.push({ table: { head: ['Experiment', 'Protocol', 'Sessions', 'Runs done', 'First', 'Last'], w: [26, 26, 10, 12, 13, 13], rows: sc.xs.map(x => { const q = ss.filter(s => s.exp === x.id), dn = q.filter(s => s.doneAt); return [x.name, (P(x.proto) || {}).name || '', String(q.length), String(dn.reduce((a, s) => a + s.mice.length, 0)), q.length ? day(q[0].startedAt) : '', q.length ? day(q[q.length - 1].doneAt || q[q.length - 1].startedAt) : '']; }) } });
  for (const x of sc.xs) {
    const q = ss.filter(s => s.exp === x.id); if (!q.length) continue; const pr = P(x.proto);
    b.push({ h: 1, t: x.name, brk: true });
    if (pr) b.push({ p: `Protocol: ${pr.name}${pr.full ? ' (' + pr.full + ')' : ''}.${pr.notes ? ' ' + pr.notes : ''}` });
    for (const s of q) b.push(...sessBlocks(sc, U, s));
  }
  if (!ss.length) b.push({ p: 'No bench session falls inside this selection.' });
  const hist = protoHistory(sc);
  if (hist.length) b.push({ h: 1, t: 'Protocol versions and changes', brk: true }, { p: 'Every revision of the protocols used here, and how many of the sessions above used each one. If revision history was switched off when a protocol was saved, that save replaced the steps of the revision; the steps printed with each session are always the ones that were really followed.', sm: true },
    { table: { head: ['Protocol', 'Variant', 'What', 'When', 'By', 'Note', 'Sessions here'], w: [18, 12, 10, 14, 14, 24, 8], rows: hist.map(r => r.map((c, i) => i === 3 ? dtm(c && c.getTime()) : String(c ?? ''))) } });
  const prior = Object.entries(p.prior || {});
  if (prior.length) b.push({ h: 1, t: 'Earlier steps recorded as already done' }, { table: { head: ['Sample', 'Earlier step', 'Date it was done', 'Recorded by', 'Recorded on'], rows: prior.map(([k, v]) => { const i = k.indexOf('|'); return [k.slice(i + 1), (P(k.slice(0, i)) || {}).name || '', v.at ? day(v.at) : 'not known', who(v.by), day(v.on)]; }) } });
  const ts = DB.targets.filter(t => t.proj === p.id && t.status !== 'change' && sc.inR(t.week)).sort((a, c) => a.week - c.week);
  if (ts.length) b.push({ h: 1, t: 'Weekly plan and what was done' }, { table: { head: ['Week of', 'Who', 'Planned', 'Done', 'State', 'Notes'], w: [12, 14, 34, 8, 12, 20], rows: ts.map(t => [day(t.week), who(t.user), { lines: t.items.map(i => { const by = [0, 1, 2, 3, 4, 5, 6, -1].map(d => [d, i.mice.filter(m => dayOf(i, m) === d).length]).filter(q => q[1]); return `${iName(i)} × ${i.mice.length}${by.some(q => q[0] >= 0) ? ' (' + by.map(q => (q[0] < 0 ? 'any day' : DAYN[q[0]]) + ' ' + q[1]).join(', ') + ')' : ''}`; }) }, `${tDone(t)} of ${tN(t)}`, TS[tState(t)][1], [t.note ? 'Supervisor: ' + t.note : '', t.excuse ? `Missed. What happened: ${t.excuse.what} Why: ${t.excuse.why} Plan: ${t.excuse.plan}` : ''].filter(Boolean).join(' ')]) } });
  return b;
}

/* ---------------- the tables (Excel) ---------------- */
function tables(sc, U, full) {
  const p = sc.p, ss = sc.sessions, g = sc.group, T = [];
  T.push({ name: 'Read me', head: [`${p.name}: exported from Lab Bench Tracker on ${dtm(now())} by ${who(S.user)}. Covers ${sc.what}.`], rows: [['Each tab is one table. "Steps" has every step of every bench session as it was performed; "Deviations" every note of something done differently.'], ['Text is stored as plain text. Dates are real dates, so they can be sorted and filtered.']] });
  T.push({ name: 'Sessions', head: ['Experiment', 'Round or target', 'Started', 'Finished', 'By', 'Protocol', 'Variant', 'Revision', 'Samples', 'Sample list', 'Steps done', 'Steps', 'Deviations', 'Ethics approval'],
    rows: ss.map(s => [xName(s.exp), s.target || '', D(s.startedAt), D(s.doneAt), who(s.by), s.pname || '', s.label || '', s.rev || '', s.mice.length, s.mice.join(', '), Math.min(s.stepIdx, s.steps.length), s.steps.length, s.notes.length, (P(s.proto) || {}).ethics || '']) });
  T.push({ name: 'Steps', head: ['Experiment', 'Round or target', 'Session started', 'Step', 'What', 'Details', 'Time', 'Hands-free', 'Done', 'Deviations noted'],
    rows: ss.flatMap(s => s.steps.map((stp, i) => [xName(s.exp), s.target || '', D(s.startedAt), i + 1, stp.t || '', stepInfo(s, stp, i).join(' | '), timeTxt(stp), stp.w ? 'Yes' : 'No', i < s.stepIdx && s.at && s.at[i] ? D(s.at[i]) : stepState(s, i), stepNotes(s, i).join(' | ')])) });
  T.push({ name: 'Deviations', head: ['Experiment', 'Round or target', 'Session started', 'Step', 'What', 'Applies to', 'Note', 'By', 'When'],
    rows: ss.flatMap(s => s.notes.map(n => [xName(s.exp), s.target || '', D(s.startedAt), n.step == null ? '' : n.step + 1, n.step == null ? '' : (s.steps[n.step] || {}).t || '', n.mice === 'all' ? 'All samples' : n.mice.join(', '), n.text, who(n.by), D(n.at)])) });
  T.push({ name: 'Runs', head: ['Experiment', 'Round or target', 'Sample', 'Group', 'Status', 'Started', 'Finished', 'By', 'Protocol', 'Revision', 'Result files'],
    rows: ss.flatMap(s => s.mice.map(m => [xName(s.exp), s.target || '', m, g(m), s.doneAt ? 'Done' : 'On the bench', D(s.startedAt), D(s.doneAt), who(s.by), (s.pname || '') + ' ' + (s.label || ''), s.rev || '', (U.byKey.get(key(s.exp, s.target, m)) || []).map(u => u.no).join(', ')])) });
  T.push({ name: 'Results', head: ['Experiment', 'Round or target', 'Sample', 'Group', 'Value', 'Result', 'Date', 'By'],
    rows: ss.flatMap(s => s.mice.flatMap(m => Object.keys(s.res[m] || {}).sort().map(f => [xName(s.exp), s.target || '', m, g(m), f, s.res[m][f], D(s.doneAt || s.startedAt), who(s.by)]))) });
  T.push({ name: 'Protocol history', head: ['Protocol', 'Variant', 'What', 'When', 'By', 'Note', 'Sessions in this export'], rows: protoHistory(sc) });
  if (!full) return T;
  T.push(...fileTables(U));
  T.push({ name: 'Samples', head: ['Sample', 'Group'], rows: p.samples.map(m => [m.id, m.group || '']) });
  T.push({ name: 'Plan', head: ['Experiment', 'Round or target', 'Sample', 'Group', 'Status'], rows: sc.xs.flatMap(x => (x.targets || ['']).flatMap(t => p.samples.filter(m => DB.asg.has(key(x.id, t, m.id)) || ss.some(s => s.exp === x.id && s.target === t && s.mice.includes(m.id))).map(m => { const s = ss.find(q => q.exp === x.id && q.target === t && q.mice.includes(m.id)); return [x.name, t, m.id, m.group || '', s ? (s.doneAt ? 'Done' : 'On the bench') : 'To do']; }))) });
  T.push({ name: 'Day plan', head: ['Week of', 'Who', 'State of the week', 'Experiment', 'Round or target', 'Sample', 'Planned day', 'Planned date', 'Run finished'],
    rows: DB.targets.filter(t => t.proj === p.id && t.status !== 'change' && sc.inR(t.week)).sort((a, b) => a.week - b.week).flatMap(t => t.items.flatMap(i => i.mice.map(m => { const d = dayOf(i, m), s = DB.sessions.find(q => q.exp === i.exp && q.target === i.target && q.mice.includes(m)); return [D(t.week), who(t.user), TS[tState(t)][1], xName(i.exp), i.target || '', m, d < 0 ? 'Any day' : DAYN[d], d < 0 ? '' : D(t.week + d * DAY), s && s.doneAt ? D(s.doneAt) : '']; }))) });
  const obs = DB.obs.filter(o => o.proj === p.id).sort((a, b) => a.id < b.id ? -1 : 1), an = id => g(id) || (p.samples.find(m => m.id.split(' ')[0] === id) || {}).group || '';
  if (obs.length) T.push({ name: 'Monitoring', head: ['Date', 'Animal', 'Group', 'Weight (g)', 'Weight note', 'Length (mm)', 'Width (mm)', 'Height (mm)', 'Volume (mm3)', 'Tumour note', 'Treated', 'Comment'],
    rows: obs.flatMap(o => Object.keys(o).filter(k => k !== 'id' && k !== 'proj' && o[k] && typeof o[k] === 'object').sort().map(a => { const q = o[a], v = q.v || []; return [o.id, a, an(a), q.w || '', q.wn || '', v[0] || '', v[1] || '', v[2] || '', tvol(q) ?? '', q.vn || '', q.tx === true ? 'Yes' : q.tx === false ? 'No' : '', q.c || '']; })) });
  const ans = DB.animals.filter(a => a.proj === p.id);
  if (ans.length) T.push({ name: 'Animals', head: ['Animal', 'Group', 'Ended', 'Reason', 'Photos and files'], rows: ans.map(a => [a.id, an(a.id), a.end || '', a.why || '', (a.files || []).length]) });
  return T;
}
function fileTables(U) {
  return [{ name: 'Files', head: ['File', 'Name', 'Also named', 'Shows', 'Samples', 'Added', 'By', 'Link', 'Original file name', 'Kind', 'Size (bytes)', 'In this export'],
      rows: U.list.map(u => [u.no, u.name, u.names.slice(1).join(' | '), covers(u).map(c => c.label).join('; '), u.links.size + u.animals.size, D(u.at), who(u.by), u.url || '', u.fname || (u.meta && u.meta.name) || '', u.type || (u.meta && u.meta.type) || '', u.size || (u.meta && u.meta.size) || '', u.st ? stText(u) : '']) },
    { name: 'File to sample', head: ['File', 'Name', 'Experiment', 'Round or target', 'Sample or animal'], rows: U.list.flatMap(u => [...u.links.values()].map(q => [u.no, u.name, xName(q.x), q.t, q.m]).concat([...u.animals].map(a => [u.no, u.name, 'Animal profile', '', a]))) }];
}
function rawRecord(sc) {
  const p = sc.p, mine = l => l.filter(q => q.proj === p.id), strip = a => ({ ...a, files: (a.files || []).map(({ th, ...f }) => f) });
  return JSON.stringify({ exported: { at: new Date().toISOString(), by: S.user, from: 'Lab Bench Tracker', note: 'The whole study as the tracker stores it, whatever was chosen at the top of the Export tab. Times are milliseconds since 1970.' },
    study: p, experiments: mine(DB.exps), plan: [...DB.asg].filter(k => X(k.slice(0, k.indexOf('|')))?.proj === p.id), sessions: mine(DB.sessions), targets: mine(DB.targets), files: mine(DB.files), monitoring: mine(DB.obs), animals: mine(DB.animals).map(strip),
    protocols: [...new Set(mine(DB.exps).map(x => x.proto))].map(P).filter(Boolean) }, null, 1);
}

/* ---------------- the pages of a data document ---------------- */
const head = (sc, t) => [{ h: 1, t: t + ': ' + sc.p.name }, { p: `Exported from Lab Bench Tracker on ${dtm(now())} by ${who(S.user)}. Covers ${sc.what}.`, sm: true }];
const sumLine = U => `${pl(U.list.length, 'file')}, from ${pl(U.recs, 'link')} recorded in the tracker, showing ${pl(U.samples, 'sample')}.${U.merged ? ` ${pl(U.merged, 'link')} pointed at a file that was already counted, so that file appears once here and lists every sample it shows.` : ''} ${U.ok ? `Check passed: all ${U.linkN} sample-to-file links are kept.` : 'CHECK FAILED: the links in this export do not match the tracker. Do not rely on it; tell the lab admin.'}`;
function frontBlocks(sc, U) {
  const b = [...head(sc, 'Result files and images'), { p: 'Every file appears once, however many samples it shows. A gel with five lanes is one entry that lists its five samples; fifty separate images are fifty entries. File numbers (F001 and so on) are the same in the lab book export made with the same selection.' }, { p: sumLine(U) }];
  b.push({ h: 2, t: 'Files in this export' }, { table: { head: ['File', 'Name', 'Shows', 'Samples', 'Added'], w: [8, 26, 24, 30, 12], rows: U.list.map(u => [u.no, u.name, covers(u).map(c => c.label).join('; '), covers(u).flatMap(c => c.ms).join(', '), day(u.at)]) } });
  const rows = []; for (const x of sc.xs) for (const t of x.targets || ['']) for (const m of sc.p.samples) { const us = U.byKey.get(key(x.id, t, m.id)); if (us) rows.push([m.id, m.group || '', xName(x.id, t), us.map(u => u.no).join(', ')]); }
  if (rows.length) b.push({ h: 2, t: 'Which files show each sample' }, { table: { head: ['Sample', 'Group', 'Experiment', 'Files'], w: [26, 16, 30, 28], rows } });
  if (U.gaps.length) b.push({ h: 2, t: 'Finished runs with no result file' }, { p: `${pl(U.gaps.length, 'finished run')} in this selection ${U.gaps.length === 1 ? 'has' : 'have'} no file attached. That may be right (not every experiment gives a file); they are listed so nothing is missed by accident.`, sm: true },
    { table: { head: ['Experiment', 'Sample', 'Finished'], rows: U.gaps.slice(0, 600).map(q => [xName(q.s.exp, q.s.target), q.m, day(q.s.doneAt)]) } });
  for (const x of sc.xs) for (const t of x.targets || ['']) {
    const ss = sc.sessions.filter(s => s.exp === x.id && s.target === t), rf = resFields(ss); if (!rf.length) continue;
    b.push({ h: 2, t: 'Values typed in: ' + xName(x.id, t) }, { table: { head: ['Sample', 'Group', ...rf, 'Date'], rows: ss.flatMap(s => s.mice.filter(m => s.res[m]).map(m => [m, sc.group(m), ...rf.map(f => String(s.res[m][f] ?? '')), day(s.doneAt || s.startedAt)])) } });
  }
  return b;
}
const factLine = u => [`Added ${day(u.at)}${u.by ? ' by ' + who(u.by) : ''}.`, u.fname ? ` Original file: ${u.fname}` + (u.ow ? `, ${u.ow} × ${u.oh} pixels` : '') + (u.size ? `, ${u.size > 1e6 ? (u.size / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(u.size / 1e3)) + ' kB'}` : '') + '.' : '', u.names.length > 1 ? ` Also named: ${u.names.slice(1).join(', ')}.` : '', u.cut ? ' Background removed in the tracker.' : ''].join('');
function unitBlocks(u, img) {
  const b = [{ h: 2, t: `${u.no} · ${u.name}`, brk: !!img }, { table: { head: ['Shows', 'Samples'], w: [30, 70], rows: covers(u).map(c => [c.label, c.ms.join(', ') + (c.ms.length > 1 ? `  (${c.ms.length})` : '')]) } }];
  b.push({ p: [factLine(u), u.url ? ' ' : '', u.url ? { t: 'Open the original', url: u.url } : ''], sm: true });
  b.push(img ? { img: fitBox(img, DOC_BOX) } : { p: 'Not shown here. ' + stText(u), c: '9A3412' });
  return b;
}
const KNOWN = ['shown', 'saved', 'notimg', 'noprev', 'dup', 'link', 'nolink', 'nodrive', 'gone', 'failed', 'none'];
const repList = job => job.only || job.U.list.slice(job.i0);
const tally = list => { const c = {}; for (const u of list) c[u.st || 'none'] = (c[u.st || 'none'] || 0) + 1; return c; };
function reportLines(job, list) {
  const c = tally(list), n = k => c[k] || 0, L = [];
  L.push(`${pl(list.length, 'file')} in this export${job.only ? ' (the files tried again)' : job.i0 ? ` (files ${job.i0 + 1} to ${job.i0 + list.length}; the earlier ones are in the pieces saved before)` : ''}.`);
  if (n('shown')) L.push(`${n('shown')} shown as a picture.`); if (n('saved')) L.push(`${n('saved')} saved as the original file only (not a picture, or one that cannot be shown).`);
  if (n('notimg') + n('noprev')) L.push(`${n('notimg') + n('noprev')} listed with a link because they are not pictures, or cannot be shown.`);
  if (n('dup')) L.push(`${n('dup')} turned out to be the same file, byte for byte, as an earlier one, so ${n('dup') === 1 ? 'it is' : 'they are'} kept once.`);
  if (n('link') + n('nolink') + n('nodrive')) L.push(`${n('link') + n('nolink') + n('nodrive')} could not be downloaded because the tracker only holds a link or a name for them.`);
  if (n('gone')) L.push(`${n('gone')} could not be taken from Drive (moved out of the study's folder, deleted, or too large).`); if (n('failed')) L.push(`${n('failed')} did not arrive after several tries. Use "Try the failed files again" on the Export tab.`);
  if (n('none')) L.push(`${n('none')} were not reached because the export was stopped.`);
  L.push(KNOWN.reduce((a, k) => a + n(k), 0) === list.length ? `Every one of the ${list.length} is accounted for above.` : 'The counts above do not add up: tell the lab admin.');
  return L;
}
function endBlocks(job, list) {
  const odd = list.filter(u => u.st !== 'shown' && !(u.st === 'saved'));
  return [{ h: 1, t: 'Export report', brk: true }, ...reportLines(job, list).map(t => ({ p: t })), ...(odd.length ? [{ table: { head: ['File', 'Name', 'What happened', 'Link'], w: [8, 26, 46, 20], rows: odd.map(u => [u.no, u.name, stText(u), u.url ? [{ t: 'Open', url: u.url }] : '']) } }] : [])];
}
const unitSlide = (u, img) => ({ title: `${u.no} · ${u.name}`, sub: (coverTxt(u).length > 560 ? coverTxt(u).slice(0, 540) + '… (full list in the notes)' : coverTxt(u)) + '  ·  ' + factLine(u), img: img ? { data: img.data, w: img.pw, h: img.ph } : null, lines: img ? null : ['Not shown here. ' + stText(u), u.url || ''], notes: coverTxt(u) + (u.url ? '\n' + u.url : '') });

/* ---------------- fetching from Drive, at a polite pace ---------------- */
/* Files come through the lab's Drive script one at a time. Google limits how much a script may do in a day and how
   fast, so there is a pause between files that grows when Drive is slow or refuses, and shrinks again when it answers.
   After several files in a row fail, the export stops and waits for the person rather than keep knocking. */
const PACE = { min: 1000, max: 30000, waits: [5, 20, 60], trip: 4 }, PER_DOC = 120, VOL = 350e6, STOP = { stop: true };
const PERM = /not in this study|larger than|not in the lab|switched off|cannot be stored|no item|not found|invalid argument|is not in|access denied|do not have permission|has no preview/i;
let J = null;                                   // the export that is running, or the report of the last one
const busy = () => !!J && J.state !== 'done';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function nap(job, ms) { for (let t = 0; t < ms && !job.stop; t += 250) await sleep(Math.min(250, ms - t)); if (job.stop) throw STOP; }
async function call(job, body) {
  let j; const r = await fetch(job.url, { method: 'POST', body: JSON.stringify({ token: await B.idToken(), project: job.proj, ...body }) });
  try { j = await r.json(); } catch (_) { throw new Error('Drive did not answer properly; it may be busy, or over its limit for now'); }
  if (!j.ok) { const er = new Error(j.error || 'refused'); er.old = /file was empty/i.test(er.message); er.perm = er.old || PERM.test(er.message); throw er; }
  return j;
}
const unb64 = (s, type) => { const bin = atob(s || ''), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type: type || 'application/octet-stream' }); };
async function paced(job, u, body) {
  for (let n = 0; ; n++) {
    await nap(job, Math.max(0, job.last + job.gap - now()));
    try { const j = await call(job, body); job.last = now(); job.gap = Math.max(PACE.min, job.gap * 0.7); job.bad = 0; return j; }
    catch (err) {
      job.last = now(); if (err.perm) throw err; job.gap = Math.min(PACE.max, job.gap * 2);
      if (n >= PACE.waits.length) { job.bad++; throw err; }
      job.cur = `Drive is slow or busy. Waiting ${PACE.waits[n]} s before trying ${u ? u.no : 'again'}${u ? ' again' : ''} (try ${n + 2} of ${PACE.waits.length + 1}).`; drawJob(); await nap(job, PACE.waits[n] * 1000);
    }
  }
}
function hold(job) { job.state = 'paused'; drawJob(); return new Promise((res, rej) => { job.go = ok => { job.go = null; job.state = 'run'; job.bad = 0; job.gap = PACE.min * 3; ok ? res() : rej(STOP); drawJob(); }; }); }
/* ask Drive about the files before fetching them: which are still in the study's folder, what kind each is and how big.
   Best effort: an older copy of the Drive script cannot answer, and the export carries on without it. */
async function metaAll(job, list) {
  const todo = list.filter(u => u.did && !u.meta), by = new Map(todo.map(u => [u.did, u])); if (!job.url || !todo.length) return;
  for (let i = 0; i < todo.length; i += 40) {
    job.cur = `Checking the files in Drive (${Math.min(i + 40, todo.length)} of ${todo.length})…`; drawJob();
    try { const j = await paced(job, null, { action: 'meta', ids: todo.slice(i, i + 40).map(u => u.did) }); if (!Array.isArray(j.files)) return; for (const m of j.files) { const u = by.get(m.id); if (u) u.meta = m; } }
    catch (err) { if (err === STOP) throw err; job.noMeta = true; return; }
  }
}
const READS = /^image\/(jpeg|png|webp|gif|bmp|avif|x-icon|svg)/i;
async function preview(job, u) {            // a picture the browser cannot read: Drive's own preview of it, if the script can give one
  if (job.noPrev) return null;
  try { const j = await paced(job, u, { action: 'preview', id: u.did }); return await shrink(unb64(j.data, j.type)); } catch (err) { if (err === STOP) throw err; if (err.old) job.noPrev = true; return null; }
}
/* one file: fetch it, save the original and/or make its picture for the document. Sets u.st; gives the picture or null. */
async function one(job, u, { doc, orig, out, seen }) {
  u.st = ''; u.err = ''; u.saved = false;
  if (!u.did) { u.st = u.url ? 'link' : 'nolink'; return null; }
  if (!job.url) { u.st = 'nodrive'; return null; }
  const m = u.meta; if (m && !m.ok) { u.st = 'gone'; u.err = m.err || ''; return null; }
  if (m) { u.fname = m.name; u.type = m.type; u.size = m.size; }
  if (m && m.size > 32e6) { u.st = 'gone'; u.err = 'it is larger than 32 MB, the most the tracker can fetch in one piece; open it from its link'; return null; }
  if (!orig && m && !/^image\//i.test(m.type || '')) { u.st = 'notimg'; return null; }                      // a document only needs the pictures
  if (!orig && m && !READS.test(m.type)) { const im = await preview(job, u); u.st = im ? 'shown' : 'noprev'; return im; }
  let f;
  try { const j = await paced(job, u, { action: 'fetch', id: u.did }); f = { name: j.name || u.name, type: j.type || '', blob: unb64(j.data, j.type) }; }
  catch (err) { if (err === STOP) throw err; u.err = err.old ? 'the lab\'s Drive script is an older version that cannot hand files back (SETUP.md, section 7)' : err.message; if (err.perm) u.st = 'gone'; else { u.st = 'failed'; job.fail.push(u); if (job.bad >= PACE.trip) await hold(job); } return null; }
  u.fname = f.name; u.type = f.type; u.size = f.blob.size; job.bytes += u.size;
  const h = await sha(f.blob); if (h && seen.has(h)) { u.st = 'dup'; u.dupOf = seen.get(h); return null; } if (h) seen.set(h, u.no);
  if (orig) { await out.add(`files/${fileSafe(u.x ? u.x.name : u.graph ? 'Graphs' : 'Animal profiles')}/${u.no} ${fileSafe(f.name)}`, f.blob); u.saved = true; }
  let im = null; if (doc) { im = await shrink(f.blob); if (!im && /^image\//i.test(f.type)) im = await preview(job, u); if (im && im.ow) { u.ow = u.ow || im.ow; u.oh = u.oh || im.oh; } }
  u.st = im ? 'shown' : orig ? 'saved' : /^image\//i.test(f.type) ? 'noprev' : 'notimg'; return im;
}
/* where finished pieces go: straight to Downloads, or into zip files of a few hundred megabytes each */
function sink(job, zip) {
  let z = null, bytes = 0; const base = `${job.name} ${job.kind === 'all' ? 'full export' : 'original files'}${job.only ? ' (files tried again)' : ''}`;
  return {
    add: async (path, data, squeeze) => { if (!zip) { saveBlob(data, path); job.saved.push(path); return; } if (!z) z = new (await lib('zip'))(); z.file(path, data, { compression: squeeze ? 'DEFLATE' : 'STORE' }); bytes += data.size || data.length || 0; },
    full: () => zip && bytes > VOL,
    flush: async last => { if (!z) return; job.part++; const nm = `${base}${last && job.part === 1 ? '' : ' part ' + job.part}.zip`; job.cur = 'Writing ' + nm + '…'; drawJob(); saveBlob(await z.generateAsync({ type: 'blob', streamFiles: true }), nm); job.saved.push(nm); z = null; bytes = 0; },
  };
}
async function work(job) {
  const { kind, sc, U } = job, doc = kind === 'docx' || kind === 'all' ? 'docx' : kind === 'pptx' ? 'pptx' : null, orig = kind === 'zip' || kind === 'all', list = job.only || U.list, rep = repList(job), out = sink(job, orig), seen = job.seen;
  const meta = { title: `${sc.p.name}: result files and images`, by: who(S.user), foot: `${sc.p.name} · result files and images · exported ${day(now())}` }, stamp = dayKey(now());
  if (doc) await lib(doc); if (orig) await lib('zip');                                                    // find out now, not after an hour, if a file writer cannot be loaded
  if (kind === 'all' && !job.only && !job.resumed) {
    job.cur = 'Writing the lab book…'; drawJob();
    await out.add(`${job.name} lab book (methods).docx`, await docxBlob({ title: `${sc.p.name}: lab book`, by: who(S.user), foot: `${sc.p.name} · lab book · exported ${day(now())}` }, methodBlocks(sc, U)), true);
    await out.add('record.json', rawRecord(sc), true);
  }
  try { await metaAll(job, list.slice(job.i)); } catch (err) { if (err !== STOP) throw err; }
  let pages = [];
  const flushDoc = async last => {
    if (!doc || !list.length || (!pages.length && !(last && !job.docN))) return; job.docN++;
    const first = job.docN === 1 && !job.only && !job.resumed, nm = `${job.name} result files${job.only ? ' (files tried again)' : ''}${last && job.docN === 1 ? '' : ' part ' + job.docN}${orig ? '' : ' ' + stamp}.${doc}`;
    job.cur = 'Writing ' + nm + '…'; drawJob(); let blob;
    if (doc === 'docx') blob = await docxBlob(meta, [...(first ? frontBlocks(sc, U) : head(sc, 'Result files and images, part ' + job.docN)), ...pages.flatMap(q => unitBlocks(q.u, q.img)), ...(last ? endBlocks(job, rep) : [])]);
    else blob = await pptxBlob(meta, [...(first ? [{ title: sc.p.name, big: true, sub: 'Result files and images', lines: [`Exported ${dtm(now())} by ${who(S.user)}. Covers ${sc.what}.`, '', sumLine(U), '', 'Every file is one slide, however many samples it shows. The samples are listed under the title and in the notes.'] }] : []), ...pages.map(q => unitSlide(q.u, q.img)),
      ...(last ? (r => { const o = [{ title: 'Export report', lines: r }]; const odd = rep.filter(u => u.st !== 'shown'); for (let i = 0; i < odd.length; i += 14) o.push({ title: 'Not shown as a picture' + (odd.length > 14 ? ` (${i / 14 + 1})` : ''), lines: odd.slice(i, i + 14).map(u => `${u.no} ${u.name}: ${stText(u)}`) }); return o; })(reportLines(job, rep)) : [])]);
    await out.add(nm, blob, true); pages = [];
  };
  for (let i = job.i; i < list.length; i++) {
    if (job.stop) { job.stopped = true; break; }
    const u = list[i]; job.cur = `${u.no} ${u.name}`; drawJob(); let img;
    try { img = await one(job, u, { doc, orig, out, seen }); }
    catch (err) { if (err !== STOP) throw err; job.stopped = true; if (u.st !== 'failed') { u.st = ''; break; } }      // stopped part-way through this file: it is left for next time, unless it had already failed
    if (doc) pages.push({ u, img }); job.i = i + 1; if (job.stopped) break;
    if ((doc && pages.length >= PER_DOC) || out.full()) { await flushDoc(false); await out.flush(false); job.safe = job.i; remember(job); }
  }
  job.stop = false; await flushDoc(true);
  if (orig) {
    job.cur = 'Writing the tables and the report…'; drawJob();
    await out.add(kind === 'all' ? `${job.name} data tables.xlsx` : 'Files in this export.xlsx', await xlsxBlob(kind === 'all' ? tables(sc, U, true) : fileTables(U)), true);
    await out.add('Export report.txt', [`${sc.p.name}: ${kind === 'all' ? 'full export' : 'original files'}`, `Exported from Lab Bench Tracker on ${dtm(now())} by ${who(S.user)}. Covers ${sc.what}.`, '', sumLine(U), '', ...reportLines(job, rep), '', ...rep.filter(u => u.st !== 'shown' && u.st !== 'saved').map(u => `${u.no}  ${u.name}  --  ${stText(u)}${u.url ? '  ' + u.url : ''}`)].join('\r\n'), true);
    await out.flush(true);
  }
  job.safe = job.i; if (job.stopped && job.i < list.length && !job.only) remember(job); else if (!job.only) forget();
}
/* an export that was stopped, or cut short by a closed tab, can carry on from the last piece that was saved */
const MEM = 'lbt-export';
const sigOf = (kind, U) => { let h = 5381; for (const ch of kind + '\n' + U.list.map(u => u.ident).join('\n')) h = ((h << 5) + h + ch.charCodeAt(0)) | 0; return String(h); };
const remember = job => { if (job.only) return; try { localStorage.setItem(MEM, JSON.stringify({ sig: job.sig, kind: job.kind, proj: job.proj, i: job.safe, part: job.part, docN: job.docN, seen: [...job.seen], at: now() })); } catch (_) {} };
const forget = () => { try { localStorage.removeItem(MEM); } catch (_) {} };
function resumable(sc, U) { try { const r = JSON.parse(localStorage.getItem(MEM) || 'null'); return r && r.proj === sc.p.id && r.i > 0 && r.i < U.list.length && now() - r.at < 14 * DAY && r.sig === sigOf(r.kind, U) ? r : null; } catch (_) { return null; } }
async function start(kind, from, only) {
  if (busy()) return; const prev = J, sc = only ? prev.sc : scope(), U = only ? prev.U : units(sc);
  if (!U.list.length && kind !== 'all') { toast('There are no result files in this selection.'); return; }
  const job = J = { kind, sc, U, only: only || null, total: (only || U.list).length, i: from ? from.i : 0, part: from ? from.part || 0 : only ? prev.part : 0, docN: from ? from.docN || 0 : only ? prev.docN : 0, resumed: !!from, i0: from ? from.i : 0, safe: from ? from.i : 0, seen: new Map((from && from.seen) || []),
    proj: sc.p.id, url: DB.lab.uploadUrl || '', name: fileSafe(sc.p.name), t0: now(), state: 'run', gap: PACE.min, last: 0, bad: 0, fail: [], saved: [], bytes: 0, cur: 'Getting ready…', sig: sigOf(kind, U) };
  softRender();
  try { await work(job); } catch (err) { if (err !== STOP) { job.error = err.message || String(err); console.error(err); remember(job); } else job.stopped = true; }
  job.state = 'done'; job.took = now() - job.t0; softRender(); drawJob();
  toast(job.error ? 'The export stopped on a problem. See the Export tab.' : job.stopped ? 'Export stopped. What was fetched has been saved.' : 'Export finished. The files are in your Downloads folder.');
}
async function quick(label, fn) {
  if (busy()) return; const job = J = { quick: true, state: 'run', cur: label, t0: now() }; softRender();
  try { await fn(); J = null; } catch (err) { job.error = err.message || String(err); job.state = 'done'; console.error(err); }
  softRender(); drawJob();
}
addEventListener('beforeunload', ev => { if (busy()) { ev.preventDefault(); ev.returnValue = ''; } });

/* ---------------- the tab ---------------- */
const KIND = { docx: 'Word document of the images', pptx: 'PowerPoint of the images', zip: 'original files', all: 'full export' };
const span = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? s + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h'; };
function jobHTML() {
  const j = J;
  if (!j) { if (!proj()) return ''; const sc = scope(), r = resumable(sc, units(sc)); return r ? `<div class="card" style="border-color:var(--warn)"><div class="line"><b class="grow">An export (${KIND[r.kind]}) stopped at file ${r.i} of ${units(sc).list.length} on ${e(day(r.at))}.</b><button class="btn sm pri" data-a="exResume">Carry on from there</button><button class="btn sm" data-a="exForget">Forget it</button></div><div class="hint">The pieces already saved in your Downloads folder stay as they are; the rest follows as further parts.</div></div>` : ''; }
  if (j.quick) return j.state === 'run' ? `<div class="card"><div class="line"><b class="grow">${e(j.cur)}</b></div><div class="bar"><i style="width:100%;opacity:.45"></i></div></div>` : `<div class="card" style="border-color:var(--bad)"><div class="line"><span class="grow"><b>That export did not work.</b> ${e(j.error)}.</span><button class="btn sm" data-a="exClose">Close</button></div></div>`;
  const done = j.i - j.i0, left = j.total - j.i, el = now() - j.t0, eta = done >= 3 ? el / done * left : 0, pct = j.total ? j.i / j.total * 100 : 0;
  if (j.state !== 'done') return `<div class="card" style="border-color:var(--accent)" aria-live="polite"><div class="line"><h2 class="grow">Exporting: ${e(KIND[j.kind])}${j.only ? ' (files tried again)' : ''}</h2>${j.state === 'paused' ? '' : `<button class="btn sm" data-a="exStop" ${j.stop ? 'disabled' : ''}>${j.stop ? 'Stopping…' : 'Stop'}</button>`}</div>
    <div class="bar big"><i style="width:${pct}%"></i></div>
    <div class="line sm"><span class="grow"><b>${j.i} of ${j.total}</b> files · ${span(el)} so far${eta ? ' · about ' + span(eta) + ' left' : ''}${j.bytes ? ' · ' + (j.bytes / 1e6).toFixed(0) + ' MB fetched' : ''}${j.fail.length ? ` · <span class="late">${j.fail.length} failed so far</span>` : ''}</span><span class="muted">one file every ${(j.gap / 1000).toFixed(1)} s or slower</span></div>
    ${j.state === 'paused' ? `<div class="todo sm"><span><b>Paused: Drive has refused ${PACE.trip} files in a row.</b> It is probably busy, or the lab's Drive script has reached Google's limit for now. Nothing is lost. Wait a few minutes (if it keeps happening, try again in an hour or tomorrow), then carry on.</span><button class="btn sm pri" data-a="exGo">Carry on</button><button class="btn sm" data-a="exEnd">Stop and save what there is</button></div>` : `<div class="sm mono" style="white-space:normal;word-break:break-word">${e(j.cur)}</div>`}
    <div class="hint">Keep this tab open. You can use the other tabs of the tracker meanwhile. Files are fetched from Google Drive one at a time, on purpose, so the lab's Drive account is not overloaded.${j.saved.length ? ' Saved so far: ' + e(j.saved.join(', ')) + '.' : ''}</div></div>`;
  const list = repList(j), c = tally(list), bad = c.failed || 0;
  return `<div class="card" style="border-color:${j.error || bad ? 'var(--warn)' : 'var(--ok)'}"><div class="line"><h2 class="grow">${j.error ? 'The export stopped on a problem' : j.stopped ? 'Export stopped' : 'Export finished'}: ${e(KIND[j.kind])}</h2><button class="btn sm" data-a="exClose">Close</button></div>
    ${j.error ? `<div class="err">${e(j.error)}. What was saved before that is in your Downloads folder.</div>` : ''}
    <div class="sm">${reportLines(j, list).map(e).join('<br>')}</div>
    <div class="sm muted">${j.saved.length ? 'In your Downloads folder: ' + e(j.saved.join(', ')) + '.' : 'Nothing was saved.'} Took ${span(j.took || 0)}.${j.noMeta && j.url ? ' The lab\'s Drive script is an older version, so the files could not be checked first and each one was fetched in full; updating it (SETUP.md, section 7) makes exports quicker and adds previews of TIFF images.' : ''}</div>
    ${bad && !j.error ? `<div class="line"><button class="btn sm pri" data-a="exRetry">Try the ${bad} failed file${bad === 1 ? '' : 's'} again</button><span class="sm muted">They are saved as an extra piece; nothing already saved is fetched twice.</span></div>` : ''}
    ${(j.stopped || j.error) && !j.only && j.i < j.total ? `<div class="line"><button class="btn sm pri" data-a="exResume">Carry on from file ${j.i + 1}</button></div>` : ''}</div>`;
}
function drawJob() { const el = document.getElementById('xjob'); if (el) el.innerHTML = jobHTML(); }
setInterval(() => { if (busy() && !J.quick && S.tab === 'export') drawJob(); }, 5000);

V.export = () => {
  if (!proj()) return noProj();
  const sc = scope(), U = units(sc), p = sc.p, all = projExps(), ss = sc.sessions, off = busy() ? 'disabled' : '', nf = U.list.length, noF = busy() || !nf ? 'disabled' : '', drive = !!DB.lab.uploadUrl;
  const nRes = ss.reduce((a, s) => a + Object.values(s.res || {}).reduce((b, r) => b + Object.keys(r).length, 0), 0), nDev = ss.reduce((a, s) => a + s.notes.length, 0), pull = U.list.filter(u => u.did).length;
  return `<div class="stack">
   <div class="card"><h2>Export: ${e(p.name)}</h2>
    <div class="hint">Take the study's record out of the tracker as files you can keep, hand in or print: the methods exactly as they were performed, the data and images, or everything at once. Choose what to include, then pick an export below.</div>
    <div class="line"><b class="sm">Experiments</b><button class="lnk sm" data-a="exAllX">${O.off.size ? 'Include all' : 'Include none'}</button></div>
    <div class="mcs">${all.map(x => `<button class="mc ${O.off.has(x.id) ? '' : 'on'}" data-a="exX" data-x="${x.id}" aria-pressed="${!O.off.has(x.id)}" ${off}>${e(x.name)}</button>`).join('') || '<span class="hint">This study has no experiments yet.</span>'}</div>
    <div class="rg"><label>From (optional)<input type="date" data-ex="from" value="${e(O.from)}" ${off}></label><label>To (optional)<input type="date" data-ex="to" value="${e(O.to)}" ${off}></label></div>
    <label class="line sm"><input type="checkbox" data-ex="animals" ${O.animals ? 'checked' : ''} ${off}> Include the photos and files on the animals' profiles</label>
    <div class="sm"><b>In this selection:</b> ${pl(ss.length, 'bench session')} (${ss.filter(s => s.doneAt).length} finished) · ${pl(ss.reduce((a, s) => a + s.mice.length, 0), 'run')} · ${pl(nDev, 'deviation')} noted · ${pl(nRes, 'typed value')} · ${pl(nf, 'result file')}</div></div>
   <div id="xjob">${jobHTML()}</div>
   <div class="cols even">
    <div class="card"><h2>1. Methods, as performed</h2>
     <div class="hint">The lab book. Every bench session in date order: who did it and when, the protocol revision used, each step as it was carried out with its amounts and settings, the check boxes ticked, every deviation noted, and the values typed in. Ends with the full change history of the protocols used.</div>
     <div class="line"><button class="btn pri" data-a="exMethods" data-f="docx" ${off}>Word document</button><button class="btn" data-a="exMethods" data-f="xlsx" ${off}>Excel workbook</button></div>
     <div class="hint">Made at once: nothing has to be fetched from Drive.</div></div>
    <div class="card"><h2>2. Data and images</h2>
     <div class="hint">Every result file, once. A file that shows several samples, such as a gel, is one page that lists all of its samples; a file per sample gives a page per sample.</div>
     <div class="ti sm"><div><b>${pl(nf, 'file')}</b> to export, from ${pl(U.recs, 'link')} in the tracker, showing ${pl(U.samples, 'sample')}.</div>
      ${U.merged ? `<div>${pl(U.merged, 'link')} ${U.merged === 1 ? 'points' : 'point'} at a file already counted${U.repeat ? ` (${U.repeat} of them the same file added to the same sample twice)` : ''}: no file is exported twice.</div>` : ''}
      <div>${U.ok ? flag('ok', 'Check passed') + ` all ${U.linkN} sample-to-file links are kept` : flag('bad', 'Check failed') + ' the links do not add up. Do not export; send a screenshot of this to the lab admin.'}</div>
      ${U.gaps.length ? `<div class="muted">${pl(U.gaps.length, 'finished run')} ${U.gaps.length === 1 ? 'has' : 'have'} no result file; they are listed in the export.</div>` : ''}
      ${nf - pull ? `<div class="muted">${nf - pull} ${nf - pull === 1 ? 'is a link' : 'are links'} to somewhere outside the study's Drive folder (or a name only). The tracker cannot download those; they are listed with their links.</div>` : ''}
      ${!drive && pull ? '<div class="err">Uploads from the tracker are not set up, so files cannot be fetched from Drive. The document will list every file with its link instead. An admin can set it up under Lab and access, Google Drive.</div>' : ''}</div>
     <div class="line"><button class="btn pri" data-a="exData" data-f="docx" ${noF || (U.ok ? '' : 'disabled')}>Word document</button><button class="btn" data-a="exData" data-f="pptx" ${noF || (U.ok ? '' : 'disabled')}>PowerPoint</button><button class="btn" data-a="exData" data-f="zip" ${noF || (U.ok && drive ? '' : 'disabled')}>Original files (zip)</button></div>
     <div class="hint">${pull ? `About ${span(pull * 2500)} or more for ${pl(pull, 'file')}: they come from Google Drive one at a time, slowly on purpose. ` : ''}In a document, pictures are made smaller so it stays usable (about ${PER_DOC} to a document, then a second part starts). The zip holds the files exactly as they are in Drive.</div></div>
    <div class="card"><h2>3. Everything</h2>
     <div class="hint">The whole study in one go: the lab book, a workbook of every table (samples, plan, runs, steps, deviations, results, files, the day plan, monitoring), every original file, the images document, and the complete record as the tracker stores it. Large studies are saved as several zip files of about ${Math.round(VOL / 1e6)} MB.</div>
     <div class="line"><button class="btn pri" data-a="exData" data-f="all" ${busy() || !U.ok ? 'disabled' : ''}>Export everything (zip)</button><button class="btn" data-a="exTables" ${off}>Only the tables (Excel)</button></div>
     <div class="hint">Your browser may ask once whether this site may download several files. Say yes, or only the first piece is saved.</div></div>
   </div></div>`;
};
document.addEventListener('change', ev => {
  const el = ev.target, k = el.dataset && el.dataset.ex; if (!k || busy()) return;
  if (k === 'animals') O.animals = el.checked; else O[k] = el.value; softRender();
});
const stampName = (sc, what, ext) => `${fileSafe(sc.p.name)} ${what} ${dayKey(now())}.${ext}`;
export const exportActions = {
  exX: d => { if (busy()) return false; O.off.has(d.x) ? O.off.delete(d.x) : O.off.add(d.x); },
  exAllX: () => { if (busy()) return false; if (O.off.size) O.off.clear(); else O.off = new Set(projExps().map(x => x.id)); },
  exMethods: d => { const sc = scope(), U = units(sc); quick('Writing the lab book…', async () => saveBlob(d.f === 'xlsx' ? await xlsxBlob(tables(sc, U, false)) : await docxBlob({ title: `${sc.p.name}: lab book`, by: who(S.user), foot: `${sc.p.name} · lab book · exported ${day(now())}` }, methodBlocks(sc, U)), stampName(sc, 'lab book (methods)', d.f))); return false; },
  exTables: () => { const sc = scope(), U = units(sc); quick('Writing the tables…', async () => saveBlob(await xlsxBlob(tables(sc, U, true)), stampName(sc, 'data tables', 'xlsx'))); return false; },
  exData: d => { start(d.f); return false; },
  exStop: () => { if (busy()) { J.stop = true; drawJob(); } return false; },
  exGo: () => { if (J && J.go) J.go(true); return false; },
  exEnd: () => { if (J && J.go) { J.stop = true; J.go(false); } return false; },
  exRetry: () => { if (J && J.state === 'done' && J.fail.length) start(J.kind, null, J.fail.slice()); return false; },
  exResume: () => { if (busy()) return false; const sc = scope(), r = resumable(sc, units(sc)); if (!r) { toast('The selection has changed since that export, so it cannot carry on. Start it again.'); forget(); softRender(); return false; } start(r.kind, r); return false; },
  exForget: () => { forget(); },
  exClose: () => { if (!busy()) J = null; },
};
