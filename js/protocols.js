// Protocols: step blocks, the builder, versions and variants, importing from a file,
// and the Protocols tab.

import { DB, S, V, canLab, dt, dur, e, flag, low, now, users } from './core.js';
import { byName } from './sync.js';
import { R, UNITS } from './reagents.js';
import { proj, projExps } from './runs.js';

/* ---------------- step blocks and reagents ---------------- */
const KINDS = ['Pipette / add', 'Remove / aspirate', 'Resuspend', 'Homogenise / lyse', 'Centrifuge', 'Fix', 'Thaw', 'Storage', 'Section', 'Mount', 'Image / view', 'Collect / label',
  'Inject', 'Anaesthetise', 'Euthanase', 'Dissect / excise', 'Measure / record', 'Instrument run', 'Calculate', 'Review / report', 'Custom'];
const TEMPS = ['Room temperature', 'On ice', '4 °C', '37 °C', '37 °C, 5% CO2', '60 °C', '-20 °C', '-80 °C', 'Liquid nitrogen'];
export const mkRev = (n, at, by, note, steps) => ({ n, at, by, note, steps });
/* protocols are filed in groups (for example Gene expression) and numbered in the order they are done */
const protoGroups = () => { const o = ((DB.lab && DB.lab.pgroups) || []).filter(g => DB.protocols.some(p => p.grp === g)); return [...o, ...[...new Set(DB.protocols.map(p => p.grp || '').filter(g => g && !o.includes(g)))].sort()]; };
const pOrd = (a, b) => (a.pos ?? 1e9) - (b.pos ?? 1e9) || byName(a, b);
export const inGrp = g => DB.protocols.filter(p => (p.grp || '') === g).sort(pOrd);
const pSorted = list => { const o = protoGroups(), gi = p => { const i = o.indexOf(p.grp || ''); return i < 0 ? 1e9 : i; }; return [...list].sort((a, b) => gi(a) - gi(b) || pOrd(a, b)); };
export const revOff = () => !!(DB.lab && DB.lab.revOff);   // while the library is being set up, saving replaces the steps instead of making a new revision
export const plog = (p, text) => { (p.log = p.log || []).push({ at: now(), by: S.user, text }); };   // changes that are not a new revision: renames, reagent links
/* a step's reagent is one from the lab list, or ('@name') a name typed in the builder that can be linked to the list later */
export const typed = s => s.reagent === '@name' ? (s.rname || '').trim() : '';
const rnm = s => typed(s) || (R(s.reagent) ? R(s.reagent).name : '');
export const lbl = s => s.t || (s.type === 'wash' ? `Wash${s.reps > 1 ? ' ' + s.reps + '×' : ''}${rnm(s) ? ' in ' + (s.vol ? s.vol + ' ' + s.unit + ' ' : '') + rnm(s) : ''}` : s.type === 'inc' ? 'Incubate' + (rnm(s) ? ' in ' + rnm(s) : '') : s.kind + (rnm(s) ? ' with ' + rnm(s) : ''));
const rn = s => s.reagent === '@target' ? 'of the reagent linked to the gene or protein' : rnm(s);
const typedNames = p => { const m = new Map(); for (const n of p.nodes) for (const r of n.revs) for (const q of r.steps) for (const x of [q, ...(q.more || [])]) { const t = typed(x); if (t && !m.has(low(t))) m.set(low(t), t); } return [...m.values()]; };
export const amt = s => s.vol && rn(s) ? `${s.vol} ${s.unit}${s.type === 'wash' && s.reps > 1 ? ' × ' + s.reps : ''} ${rn(s)}, per ${s.per}` : '';
export const blank = (type, kind) => ({ type, kind: kind || 'Custom', t: '', m: type === 'wash' ? 15 : type === 'inc' ? 60 : 10, w: type === 'inc', reagent: '', rname: '', vol: type === 'wash' ? 5 : 0, unit: 'mL', reps: type === 'wash' ? 3 : 1, each: 5, per: 'sample', checks: [], note: '', conc: '', temp: '', equip: '', until: '', mMax: 0, more: [], prog: { n: 0, stages: [] }, outs: [] });
const progTxt = s => { const g = (s.prog && s.prog.stages) || []; return g.length ? (s.prog.n > 1 ? s.prog.n + ' cycles of ' : '') + g.map(x => [x.temp, x.time].filter(Boolean).join(' for ')).join(' → ') : ''; };
/* a step's main reagent plus any further ones ("more"), each seen with the step's own repeats and per-sample setting */
export const parts = s => [s, ...(s.more || []).map(x => ({ ...x, type: s.type, reps: s.reps, per: s.per }))];
const unlinked = s => [s, ...(s.more || [])].map(typed).filter(Boolean);
export const timeTxt = s => s.mMax > s.m ? dur(s.m) + ' to ' + dur(s.mMax) : s.m ? dur(s.m) : s.until ? 'until done' : 'no set time';
/* the detail lines under a step: amounts, further reagents, concentration, temperature, equipment, endpoint */
export function info(s, skipAmt) {
  const a = [], main = [skipAmt ? '' : amt(s), s.conc].filter(Boolean).join(' · '); if (main) a.push(main);
  for (const x of s.more || []) { const t = [x.vol ? x.vol + ' ' + x.unit : '', rnm(x), x.conc].filter(Boolean).join(' '); if (t) a.push('+ ' + t); }
  for (const x of s.props || []) if (x.n && x.v) a.push(x.n + ': ' + x.v);   // other settings of the step (speed, voltage, humidity…)
  if (s.temp) a.push('Temperature: ' + s.temp); if (s.equip) a.push('Equipment: ' + s.equip); if (s.until) a.push('Until: ' + s.until);
  if (progTxt(s)) a.push('Programme: ' + progTxt(s)); if ((s.outs || []).length) a.push('Produces: ' + s.outs.join(', '));
  return a;
}
/* a protocol that is repeated (weekly dosing, measurements): in a study each repeat becomes its own round */
export const schedTxt = sc => sc && sc.n > 1 ? `Repeated ${sc.n} times${sc.days ? ', every ' + (sc.days === 1 ? 'day' : sc.days + ' days') : ''}` : '';
export const rounds = sc => Array.from({ length: sc.n }, (_, i) => (sc.days === 7 ? 'Week ' : 'Round ') + (i + 1));
export const inProj = q => !!proj() && projExps().some(x => x.proto === q.id);
export const usedIn = q => DB.projects.filter(pr => pr.exps.some(id => X(id)?.proto === q.id)).map(pr => pr.name).join(', ') || 'no project yet';
export const stepLi = (s, i) => `<li><span class="n">${i + 1}</span><div class="tx"><b>${e(lbl(s))}</b>${info(s).map(t => `<div class="sm muted">${e(t)}</div>`).join('')}${unlinked(s).length ? `<div class="sm muted">${e(unlinked(s).join(', '))}: not linked to the reagent list yet, so stock is not counted.</div>` : ''}${s.checks.filter(Boolean).map(c => `<div class="sm">☐ ${e(c)}</div>`).join('')}${s.note ? `<div class="sm muted">Comment: ${e(s.note)}</div>` : ''}</div><div class="rt sm muted">${e(timeTxt(s))} · ${s.w ? 'hands-free' : 'hands-on'}</div></li>`;
export const prevHTML = steps => steps.length ? `<div class="sm muted">${dur(tot(steps))} in total · ${dur(hands(steps))} hands-on</div><ol class="steps">${steps.map(stepLi).join('')}</ol>` : '<div class="hint">Nothing yet. Add the first block on the left.</div>';
function blkHTML(s, i) {
  const sel = (f, opts, v) => `<select data-f="${f}">${opts.map(o => `<option value="${e(o[0])}" ${o[0] === v ? 'selected' : ''}>${e(o[1])}</option>`).join('')}</select>`;
  return `<div class="blk ${s.type}" data-i="${i}"><div class="line"><b class="grow">Step ${i + 1} · ${s.type === 'wash' ? 'Wash' : s.type === 'inc' ? 'Incubation' : 'Other'}</b><button class="btn sm" data-a="edUp" data-i="${i}" aria-label="Move step up" ${i ? '' : 'disabled'}>↑</button><button class="btn sm" data-a="edDown" data-i="${i}" aria-label="Move step down">↓</button><button class="btn sm" data-a="edDel" data-i="${i}">Remove</button></div>
   <input type="text" data-f="t" value="${e(s.t)}" placeholder="Description (optional). Left empty, it is written from the choices below." aria-label="Description">
   <div class="bf">${s.type === 'other' ? `<label>Kind${sel('kind', KINDS.map(k => [k, k]), s.kind)}</label>` : ''}
    <label>Reagent${sel('reagent', [['', 'None'], ['@name', 'Not in the list: type its name'], ['@target', 'Depends on the gene or protein']].concat(DB.reagents.map(r => [r.id, r.name])), s.reagent)}</label>
    ${s.reagent === '@name' ? `<label>Reagent name<input type="text" data-f="rname" value="${e(s.rname || '')}" placeholder="e.g. PBS" list="rgNames"></label>` : ''}
    <label>Amount<input type="number" data-f="vol" value="${s.vol || ''}" min="0" step="any"></label><label>Unit${sel('unit', UNITS.map(u => [u, u]), s.unit)}</label>
    <label>Per${sel('per', [['sample', 'sample'], ['batch', 'batch']], s.per)}</label>
    ${s.type === 'wash' ? `<label>Times<input type="number" data-f="reps" value="${s.reps}" min="1"></label><label>Min per wash<input type="number" data-f="each" value="${s.each}" min="0" step="any"></label>`
      : `<label>Minutes<input type="number" data-f="m" value="${s.m}" min="0" step="any"></label><label>Up to (min)<input type="number" data-f="mMax" value="${s.mMax || ''}" min="0" step="any" title="Fill in only when the time is a range, e.g. 45 to 60 minutes"></label><label class="ck"><input type="checkbox" data-f="w" ${s.w ? 'checked' : ''}> Hands-free</label>`}
    <label>Concentration, dilution or dose<input type="text" data-f="conc" value="${e(s.conc || '')}" placeholder="e.g. 1:500, 0.01 mg/mL, 20 mg/kg"></label>
    <label>Temperature<input type="text" data-f="temp" value="${e(s.temp || '')}" placeholder="e.g. 37 °C, on ice" list="tempList"></label>
    <label>Equipment<input type="text" data-f="equip" value="${e(s.equip || '')}" placeholder="e.g. NanoDrop"></label>
    <label>Done when (instead of a time)<input type="text" data-f="until" value="${e(s.until || '')}" placeholder="e.g. the cells detach"></label></div>
   ${(s.more || []).map((x, j) => `<div class="line more" style="flex-wrap:wrap"><span class="sm muted">+</span><input type="text" data-f="xname" class="grow" value="${e(rnm(x) || x.rname || '')}" placeholder="Another reagent in this step" list="rgNames" aria-label="Another reagent"><input type="number" data-f="xvol" value="${x.vol || ''}" min="0" step="any" style="width:84px" aria-label="Amount"><select data-f="xunit" aria-label="Unit">${UNITS.map(u => `<option ${u === x.unit ? 'selected' : ''}>${u}</option>`).join('')}</select><input type="text" data-f="xconc" value="${e(x.conc || '')}" placeholder="Concentration" style="width:130px" aria-label="Concentration"><button class="btn sm" data-a="moreDel" data-i="${i}" data-j="${j}">Remove</button></div>`).join('')}
   ${s.checks.map((c, j) => `<div class="line"><span aria-hidden="true">☐</span><input type="text" data-f="chk" class="grow" value="${e(c)}" placeholder="What to tick off, e.g. kept in the dark" aria-label="Check box text"><button class="btn sm" data-a="ckDel" data-i="${i}" data-j="${j}">Remove</button></div>`).join('')}
   ${((s.prog && s.prog.stages) || []).length ? `<div class="line" style="flex-wrap:wrap"><span class="sm muted">Programme, repeated</span><input type="number" data-f="gn" value="${s.prog.n || ''}" min="0" style="width:72px" aria-label="Number of cycles"><span class="sm muted">times (leave empty if it runs once)</span></div>` : ''}
   ${((s.prog && s.prog.stages) || []).map((g, j) => `<div class="line stage" style="flex-wrap:wrap"><span class="sm muted">${j + 1}.</span><input type="text" data-f="gtemp" value="${e(g.temp || '')}" placeholder="Temperature or setting, e.g. 95 °C" style="width:auto;flex:1 1 150px" list="tempList" aria-label="Stage temperature or setting"><input type="text" data-f="gtime" value="${e(g.time || '')}" placeholder="Time, e.g. 15 s" style="width:120px" aria-label="Stage time"><button class="btn sm" data-a="stageDel" data-i="${i}" data-j="${j}">Remove</button></div>`).join('')}
   ${(s.outs || []).map((o, j) => `<div class="line"><span class="sm muted">Produces</span><input type="text" data-f="out" class="grow" value="${e(o)}" placeholder="What comes out of this step, e.g. formalin-fixed piece" aria-label="Output of this step"><button class="btn sm" data-a="outDel" data-i="${i}" data-j="${j}">Remove</button></div>`).join('')}
   <div class="line" style="flex-wrap:wrap"><button class="btn sm" data-a="ckAdd" data-i="${i}">Add a check box</button><button class="btn sm" data-a="moreAdd" data-i="${i}">Add another reagent</button><button class="btn sm" data-a="stageAdd" data-i="${i}" title="For a programmed run such as thermal cycling: one row per stage">Add a programme stage</button><button class="btn sm" data-a="outAdd" data-i="${i}" title="When this step splits the sample or makes something a later protocol starts from">Add an output</button></div>
   <div class="line"><input type="text" data-f="note" class="grow" value="${e(s.note)}" placeholder="Comment for whoever runs this step (optional)" aria-label="Comment"></div></div>`;
}
function builderHTML(p, n) {
  const E = S.edit, first = !cur(n).steps.length;
  return `<div class="bld"><div class="stack"><h3>Build ${e(p.name)} ${e(vname(p, n))}</h3><div class="hint">${first ? 'Add the blocks in the order they are done at the bench.' : revOff() ? 'Revision history is switched off while the library is being set up: saving replaces the steps of this revision. Sessions already run keep their own copy of the steps.' : `Saving makes rev ${cur(n).n + 1}. Runs already done keep rev ${cur(n).n} and earlier exactly as they were performed.`}</div>
   <label class="sm" for="edName"><b>Protocol name</b></label><input type="text" id="edName" value="${e(E.name)}">
   <label class="sm" for="edFull"><b>Full name or description</b> (optional, shown under the short name)</label><input type="text" id="edFull" value="${e(E.full || '')}" maxlength="300" placeholder="e.g. Formalin-fixed paraffin-embedded tissue processing">
   <label class="sm" for="edGrp"><b>Group</b> (optional: protocols that belong to one workflow, listed in the order they are done)</label><input type="text" id="edGrp" value="${e(E.grp || '')}" maxlength="60" list="grpList" placeholder="e.g. Gene expression"><datalist id="grpList">${protoGroups().map(g => `<option value="${e(g)}">`).join('')}</datalist>
   <label class="sm" for="edNotes"><b>Notes for the whole protocol</b> (optional, e.g. "all steps at room temperature")</label><textarea id="edNotes" rows="2">${e(E.pnotes || '')}</textarea>
   <label class="sm" for="edEthics"><b>Ethics approval number</b> (optional, for animal or human work)</label><input type="text" id="edEthics" value="${e(E.ethics || '')}" placeholder="e.g. AREC2024-05-008D">
   <div class="line" style="flex-wrap:wrap"><b class="sm">Repeated on a schedule</b><input type="number" id="edSchedN" value="${e(E.schedN || '')}" min="0" style="width:72px" aria-label="Number of times"><span class="sm">times, every</span><input type="number" id="edSchedD" value="${e(E.schedD || '')}" min="0" style="width:72px" aria-label="Days between repeats"><span class="sm">days</span><span class="sm muted">(leave empty for a protocol that is done once per sample)</span></div>
   <div class="stack" id="edFields"><b class="sm">Results to type in for each sample</b><span class="sm muted">For a protocol that gives numbers, such as RNA extraction: name each value and its unit. They are asked for at the bench.</span>
    ${(E.fields || []).map((f, j) => `<div class="line pfield"><input type="text" data-f="fn" class="grow" value="${e(f.n || '')}" placeholder="Name, e.g. A260/280 or Yield" aria-label="Result name"><input type="text" data-f="fu" value="${e(f.u || '')}" placeholder="Unit, e.g. ng/µL" style="width:130px" aria-label="Unit"><label class="ck sm" title="Two boxes are shown for each sample and their average is worked out"><input type="checkbox" data-f="fd" ${f.dup ? 'checked' : ''}> Read twice, use the average</label><button class="btn sm" data-a="fldDel" data-j="${j}">Remove</button></div>`).join('')}
    <div class="line"><button class="btn sm" data-a="fldAdd">Add a result to record</button></div></div>
   <datalist id="tempList">${TEMPS.map(t => `<option value="${e(t)}">`).join('')}</datalist>
   <datalist id="rgNames">${DB.reagents.map(r => `<option value="${e(r.name)}">`).join('')}</datalist>
   ${preHTML(p)}
   <div id="edRows" class="stack">${E.steps.map(blkHTML).join('')}</div>
   <div class="addrow"><b>Step ${E.steps.length + 1}</b><button class="btn sm" data-a="edAdd" data-t="wash">Add wash</button><button class="btn sm" data-a="edAdd" data-t="inc">Add incubation</button><select id="addOther" data-c="addOther" aria-label="Add another kind of step"><option value="">Add other…</option>${KINDS.map(k => `<option>${e(k)}</option>`).join('')}</select></div>
   ${first || revOff() ? '' : `<label class="sm" for="edNote"><b>What changed and why</b> (required, kept in the history)</label><input type="text" id="edNote" value="${e(E.note)}">`}
   <div class="line"><button class="btn pri" data-a="edSave">${revOff() && !first ? 'Save (rev ' + cur(n).n + ' stays)' : 'Save as rev ' + (first ? 1 : cur(n).n + 1)}</button><button class="btn" data-a="edCancel">Cancel</button><span class="err" id="edErr"></span></div></div>
  <div class="stack"><h3>How it will look at the bench</h3><div id="prev" class="stack">${prevHTML(E.steps)}</div></div></div>`;
}

/* ---------------- protocol versions ---------------- */
export const P = id => DB.protocols.find(p => p.id === id) || DB.gone.find(p => p.id === id), X = id => DB.exps.find(x => x.id === id), PR = id => DB.projects.find(p => p.id === id);
export const kids = (p, id) => p.nodes.filter(n => n.parent === id);
export const isLeaf = (p, n) => !kids(p, n.id).length;
export const leaves = p => p.nodes.filter(n => isLeaf(p, n));
function path(p, n) { const a = []; while (n) { a.unshift(kids(p, n.parent).indexOf(n) + 1); n = p.nodes.find(x => x.id === n.parent); } return a; }
const depth = p => Math.max(...p.nodes.map(n => path(p, n).length));
/* V1.<variant>.<sub-variant>; a variant that is not subdivided gets .0 so every number has the same length */
export function vlabel(p, n) { if (p.nodes.length === 1) return 'V1.0'; const a = path(p, n); if (isLeaf(p, n)) while (a.length < depth(p)) a.push(0); return 'V1.' + a.join('.'); }
export const vname = (p, n) => vlabel(p, n) + (n.name === 'Standard' ? '' : ' ' + n.name);
export const cur = n => n.revs[n.revs.length - 1];
export const tot = s => s.reduce((a, x) => a + x.m, 0), hands = s => s.reduce((a, x) => a + (x.w ? 0 : x.m), 0), maxW = s => Math.max(0, ...s.filter(x => x.w).map(x => x.m));
/* what a protocol starts from: "reliant" needs a processed sample from an earlier protocol, "initial" is one that others start from, "entire" runs start to end on its own */
export const srcs = p => p.rel ? (p.from || []).map(P).filter(q => q && !q.deleted) : [];
export const feeds = p => DB.protocols.filter(q => srcs(q).includes(p));
const relies = (q, p, seen = new Set()) => q === p || (!seen.has(q) && (seen.add(q), srcs(q).some(x => relies(x, p, seen))));
const ptype = p => p.rel ? 'Reliant' : feeds(p).length ? 'Initial' : 'Entire';
export const names = a => a.map(q => q.name).join(', ');
const outsOf = p => [...new Set(leaves(p).flatMap(n => cur(n).steps.flatMap(q => q.outs || [])).filter(Boolean))];
const srcNames = p => srcs(p).map(q => q.name + ((p.uses || {})[q.id] ? ' (' + p.uses[q.id] + ')' : '')).join(', ');
export const needAll = p => !!p.all && srcs(p).length > 1;
export const ptypeLine = p => p.rel ? `Reliant protocol: needs ${srcs(p).length > 1 ? (needAll(p) ? 'all of: ' : 'any one of: ') : 'a processed sample from '}${srcs(p).length ? srcNames(p) : 'an earlier protocol (not chosen yet)'}${feeds(p).length ? ', and leads into ' + names(feeds(p)) : ''}` : feeds(p).length ? `Initial protocol: leads into ${names(feeds(p))}` : 'Entire protocol: runs from start to end on its own';
/* has the earlier protocol been done for this sample: a finished session in the study, or a note that it was done before */
export const priorOf = (pr, q, m) => (pr.prior || {})[q.id + '|' + m];
export const doneSess = (pr, q, m) => DB.sessions.find(s => s.proj === pr.id && s.proto === q.id && s.doneAt && s.mice.includes(m));
export const lacking = (x, mice) => { const ss = srcs(P(x.proto)), pr = PR(x.proj); const ok = m => q => doneSess(pr, q, m) || priorOf(pr, q, m); return ss.length ? mice.filter(m => !(needAll(P(x.proto)) ? ss.every(ok(m)) : ss.some(ok(m)))) : []; };
export const dty = t => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
export function preLine(x, m) {
  const pr = PR(x.proj), ss = srcs(P(x.proto)); if (!ss.length) return '';
  return `<div class="sm muted">Previous step: ${ss.map(q => { const s = doneSess(pr, q, m), k = priorOf(pr, q, m); return e(q.name) + (s ? ' done ' + dty(s.doneAt) : k ? ` recorded as already done${k.at ? ' on ' + dty(k.at) : ', date not known'} (by ${e(users[k.by].name)})` : ' not recorded'); }).join(' · ')}</div>`;
}
/* ---------------- importing protocols from a file ---------------- */
/* The file format is described in docs/protocol-import-handover.md. Everything read from the file is
   treated as plain text and numbers, cut to sensible lengths, and only becomes ordinary protocol steps. */
export function parseImport(text) {
  let t = String(text).trim();
  if (!t.startsWith('{')) { const m = /```(?:json)?\s*([\s\S]*?)```/.exec(t); if (m) t = m[1].trim(); else { const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) t = t.slice(a, b + 1); } }
  let j; try { j = JSON.parse(t); } catch (_) { throw new Error('it is not valid JSON'); }
  if (!j || !Array.isArray(j.protocols)) throw new Error('it has no "protocols" list');
  const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n), num = (v, d, max) => { const x = +v; return v !== null && v !== '' && isFinite(x) && x >= 0 ? Math.min(x, max) : d; };
  const step = q => {
    q = q && typeof q === 'object' ? q : {};
    const type = /^wash/i.test(q.type) ? 'wash' : /^inc/i.test(q.type) ? 'inc' : 'other', b = blank(type, KINDS.find(k => low(k) === low(q.kind)) || 'Custom');
    b.t = str(q.description, 300); b.rn = q.reagentDependsOnTarget ? '' : str(q.reagent, 80); b.reagent = q.reagentDependsOnTarget ? '@target' : '';
    const unit = u => { u = str(u, 8).replace('μ', 'µ'); return /^ul$/i.test(u) ? 'µL' : /^ug$/i.test(u) ? 'µg' : UNITS.find(k => low(k) === low(u)) || 'mL'; };
    b.vol = num(q.amount, 0, 1e9); b.unit = unit(q.unit); b.per = q.per === 'batch' ? 'batch' : 'sample';
    b.conc = str(q.concentration, 80); b.temp = str(q.temperature, 60); b.equip = str(q.equipment, 120); b.until = str(q.until, 160); b.mMax = type === 'wash' ? 0 : num(q.minutesMax, 0, 1e6);
    const cy = q.cycle && typeof q.cycle === 'object' ? q.cycle : {};
    b.prog = { n: Math.round(num(cy.cycles, 0, 999)), stages: (Array.isArray(cy.stages) ? cy.stages : []).slice(0, 12).map(g => g && typeof g === 'object' ? { temp: str(g.temperature, 60), time: str(g.time, 40) } : null).filter(g => g && (g.temp || g.time)) };
    b.outs = (Array.isArray(q.produces) ? q.produces : []).map(o => str(o, 80)).filter(Boolean).slice(0, 8);
    b.more = (Array.isArray(q.components) ? q.components : []).slice(0, 12).map(x => x && typeof x === 'object' ? { rn: str(x.reagent, 80), vol: num(x.amount, 0, 1e9), unit: unit(x.unit), conc: str(x.concentration, 80) } : null).filter(x => x && x.rn);
    if (type === 'wash') { b.reps = Math.max(1, Math.round(num(q.times, 1, 99))); b.each = num(q.minutesEach, 0, 1e5); b.m = b.reps * b.each; b.w = false; }
    else { b.m = num(q.minutes, 0, 1e6); b.w = !!q.handsFree; }
    b.checks = (Array.isArray(q.checks) ? q.checks : []).map(c => str(c, 200)).filter(Boolean).slice(0, 20); b.note = str(q.comment, 500);
    return b;
  };
  const steps = a => (Array.isArray(a) ? a : []).slice(0, 200).map(step);
  return j.protocols.slice(0, 200).map(p => {
    p = p && typeof p === 'object' ? p : {}; const name = str(p.name, 120); if (!name) return null;
    const vs = Array.isArray(p.variants) && p.variants.length ? p.variants.slice(0, 20).map(v => ({ name: str(v && v.name, 60) || 'Variant', steps: steps(v && v.steps) })) : [{ name: 'Standard', steps: steps(p.steps) }];
    return { name, source: str(p.source, 200), rel: !!p.requiresPrevious, prev: (Array.isArray(p.previousProtocols) ? p.previousProtocols : []).map(n => str(n, 120)).filter(Boolean).slice(0, 20), all: !!p.previousNeedsAll, sched: p.schedule && typeof p.schedule === 'object' && num(p.schedule.repeats, 0, 60) > 1 ? { n: Math.round(num(p.schedule.repeats, 0, 60)), days: Math.round(num(p.schedule.everyDays, 0, 365)) } : null,
      uses: p.previousUses && typeof p.previousUses === 'object' ? Object.entries(p.previousUses).slice(0, 20).map(([k, v]) => [str(k, 120), str(v, 80)]).filter(q => q[0] && q[1]) : [], notes: str(p.notes, 1000), ethics: str(p.ethicsApproval, 80), variants: vs };
  }).filter(Boolean);
}
export const nameTaken = n => DB.protocols.some(q => low(q.name) === low(n));
export function importHTML(m) {
  const names = new Set(); m.list.forEach(p => p.variants.forEach(v => v.steps.forEach(q => [q, ...q.more].forEach(x => { if (x.rn && !DB.reagents.some(r => low(r.name) === low(x.rn))) names.add(low(x.rn)); }))));
  return `<h2>Import protocols</h2><div class="sm muted">From <span class="mono">${e(m.file)}</span> · ${m.list.length} protocol${m.list.length === 1 ? '' : 's'} found. Tick the ones to bring into the lab library.</div>
   <div class="stack" style="max-height:50vh;overflow:auto">${m.list.map((p, i) => { const n = p.variants.reduce((a, v) => a + v.steps.length, 0), dup = nameTaken(p.name);
     return `<label class="line" style="border-top:1px solid var(--line);padding-top:8px;align-items:flex-start"><input type="checkbox" class="impCk" value="${i}" ${m.pick.has(i) ? 'checked' : ''}><span class="grow"><b>${e(p.name)}</b><br><span class="sm muted">${n} step${n === 1 ? '' : 's'}${p.variants.length > 1 ? ' in ' + p.variants.length + ' variants' : ''}${p.rel || p.prev.length ? ' · reliant' + (p.prev.length ? ', after ' + e(p.prev.join(', ')) : '') : ''}${p.sched ? ' · ' + e(schedTxt(p.sched).toLowerCase()) : ''}${p.source ? ' · ' + e(p.source) : ''}</span>${dup ? `<br><span class="sm" style="color:var(--warn)">A protocol with this name is already in the library. If ticked, it comes in as "${e(p.name)} (imported)".</span>` : ''}${n ? '' : '<br><span class="sm" style="color:var(--warn)">No steps were found for this one.</span>'}</span></label>`; }).join('')}</div>
   ${names.size ? `<div class="hint">${names.size} reagent name${names.size === 1 ? ' is' : 's are'} not in the lab's reagent list. They come in as typed names, which you can link to the list afterwards from each protocol's page.</div>` : ''}
   <div class="hint">Nothing is changed in protocols you already have. Imported protocols start at rev 1 and can be edited like any other.</div>
   <div class="foot"><span class="err" id="mErr"></span><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="impSave">Import the ticked protocols</button></div>`;
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
   ${p.rel ? `<div class="stack" style="flex-basis:100%"><div class="sm"><b>Which protocol does the sample come from?</b></div>${opts.length ? `<div class="line" style="flex-wrap:wrap">${opts.map(q => `<label class="ck sm"><input type="checkbox" data-c="preFrom" data-p="${q.id}" ${from.includes(q.id) ? 'checked' : ''}> ${e(q.name)}</label>`).join('')}</div>` : '<div class="hint">There is no other protocol to choose yet. Create the earlier protocol, then come back and tick it here.</div>'}${srcs(p).filter(q => outsOf(q).length).map(q => `<label class="sm">From ${e(q.name)} it uses <select data-c="preUse" data-p="${q.id}"><option value="">any part</option>${outsOf(q).map(o => `<option ${(p.uses || {})[q.id] === o ? 'selected' : ''}>${e(o)}</option>`).join('')}</select></label>`).join('')}${from.length > 1 ? `<label class="ck sm"><input type="checkbox" data-c="preAll" ${p.all ? 'checked' : ''}> All of the ticked protocols are needed (leave unticked if any one of them is enough)</label>` : ''}<div class="sm muted">This applies to every variant and is saved as soon as you tick it.</div></div>` : ''}</div>`;
}
function walk(p, parent, out = []) { for (const n of kids(p, parent)) { out.push(n); walk(p, n.id, out); } return out; }

V.protos = () => {
  const p = P(S.selProto), ins = proj() ? DB.protocols.filter(inProj) : [], rest = DB.protocols.filter(q => !ins.includes(q));
  const row = (q, i) => `<button class="row ${p === q ? 'sel' : ''}" data-a="selProto" data-p="${q.id}"><span class="nm">${i === undefined ? '' : (i + 1) + '. '}${e(q.name)}</span>${q.full ? `<span class="meta">${e(q.full)}</span>` : ''}<span class="meta">by ${e(users[q.by].name)} · ${cur(leaves(q)[0]).steps.length} steps · ${ptype(q)}</span>${flag('', leaves(q).length > 1 ? leaves(q).length + ' variants' : 'V1.0')}</button>`;
  const grp = (t, a) => `<div class="grp"><span>${t}</span><span>${a.length}</span></div>`;
  const filed = list => { const gs = protoGroups(), loose = pSorted(list.filter(q => !gs.includes(q.grp || ''))); return gs.map(g => { const a = inGrp(g), mine = a.filter(q => list.includes(q)); return mine.length ? grp(e(g), mine) + mine.map(q => row(q, a.indexOf(q))).join('') : ''; }).join('') + (loose.length ? grp(gs.length ? 'Not in a group' : 'Lab library', loose) + loose.map(q => row(q)).join('') : ''); };
  /* every lab protocol is always listed: the ones this study uses first, then the rest of the library */
  const list = !DB.protocols.length ? '<div class="hint" style="padding:12px">The lab has no protocols yet. Create the first one.</div>'
    : proj() ? grp('Used in ' + e(proj().name), ins) + (pSorted(ins).map(q => row(q)).join('') || `<div class="hint" style="padding:8px 12px">None yet. Open a protocol below and press Add to ${e(proj().name)}.</div>`) + (rest.length ? grp('Other lab protocols', rest) + filed(rest) : '')
    : filed(rest);
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
      ${p.full ? `<div class="who">${e(p.full)}</div>` : ''}${S.edit ? '' : (() => { const a = inGrp(p.grp || ''), i = a.indexOf(p); return p.grp ? `<div class="who">Group: <b>${e(p.grp)}</b> · step ${i + 1} of ${a.length} <button class="btn sm" data-a="pMove" data-d="-1" ${i ? '' : 'disabled'}>Move earlier</button> <button class="btn sm" data-a="pMove" data-d="1" ${i < a.length - 1 ? '' : 'disabled'}>Move later</button></div>` : '<div class="who">Not in a group yet. Press Edit steps to file it under one.</div>'; })()}
      <div class="who">Created by ${e(users[p.by].name)} · used in: ${e(usedIn(p))} · shared with everyone in the lab</div>
      <div class="who">${e(ptypeLine(p))}</div>
      ${p.ethics ? `<div class="who">Ethics approval: <span class="mono">${e(p.ethics)}</span></div>` : ''}${p.notes ? `<div class="who">Notes: ${e(p.notes)}</div>` : ''}${schedTxt(p.sched) ? `<div class="who">${e(schedTxt(p.sched))}. In a study, each repeat is its own round.</div>` : ''}
      <div class="chips">${walk(p, null).map(q => `<button class="chip ${q === n ? 'view' : ''} ${isLeaf(p, q) ? '' : 'old'}" data-a="selNode" data-n="${q.id}"><span class="mono">${vlabel(p, q)}</span>${q.name === 'Standard' ? '' : ' ' + e(q.name)}</button>`).join('')}</div>
      <div class="who"><span class="mono">${e(vname(p, n))}</span> · rev ${r.n} of ${cur(n).n} · ${dur(tot(r.steps))} in total · ${dur(hands(r.steps))} hands-on · longest hands-free stretch ${dur(maxW(r.steps))}</div>
      ${S.edit ? '' : `<div class="line">${inProj(p) || !proj() ? '' : `<button class="btn sm pri" data-a="addProj">Add to ${e(proj().name)}</button>`}${leaf && isCur ? `<button class="btn sm ${inProj(p) ? 'pri' : ''}" data-a="edStart">${r.steps.length ? 'Edit steps' : 'Build steps'}</button><button class="btn sm" data-a="split">Split into sub-variants</button>` : ''}<button class="btn sm" data-a="addVar">Add a variant</button><button class="btn sm" data-a="print">Print view</button>${canLab() ? '<button class="btn sm" data-a="delProto">Delete protocol</button>' : ''}</div>`}</div><div class="body">${body}</div>`;
  }
  return `<div class="split ${p ? 'has-sel' : ''}"><aside class="pane-list"><div class="tools"><button class="btn pri" data-a="newProto">Create new protocol</button><button class="btn" data-a="impPick">Import from a file</button>${canLab() ? `<button class="btn" data-a="revToggle" title="While the library is being set up, saving a protocol replaces its steps instead of adding a revision">Revision history: ${revOff() ? 'off' : 'on'}</button>` : ''}<input type="file" id="impFile" accept=".json,.md,.txt,application/json,text/markdown,text/plain" hidden></div><div class="rows">${list}</div></aside><main class="pane-detail">${det}</main></div>`;
};
