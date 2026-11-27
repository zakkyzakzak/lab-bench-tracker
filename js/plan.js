// Study plan: which sample gets which experiment.

import { DB, S, V, e, low } from './core.js';
import { R } from './reagents.js';
import { P } from './protocols.js';
import { IDX, key, noProj, proj, projExps } from './runs.js';
import { PALS, palOf } from './render.js';

/* ---------------- study plan ---------------- */
export const clean = t => String(t).replace(/[<>"'&|]/g, '').replace(/\s+/g, ' ').trim();
export const planCols = () => projExps().flatMap(x => (x.targets && x.targets.length ? x.targets : x.targets ? [] : ['']).map(t => ({ x, t }))).filter(c => !S.planX || c.x.id === S.planX);
const hasRuns = m => [...IDX.keys()].some(k => k.endsWith('|' + m)) || proj().samples.some(q => q.from === m);   // a passage that others were grown from stays too
/* what the names added one at a time start with: the study's own choice, else whatever the last sample starts with, else "S" */
export function namePrefix() {
  const p = proj(); if (p.pre) return p.pre; const ss = p.samples; if (!ss.length) return 'S';
  const b = ss[ss.length - 1].id.split(' ')[0], m = b.match(/^(.*?)(\d+)$/); return m ? m[1] : b + '-';
}
/* the next free name: the prefix and the next number, as wide as the numbers already in use (S01, S02 ... or P1, P2 ...) */
export function nextMouse() {
  const ss = proj().samples, base = q => q.id.split(' ')[0], pre = namePrefix(), all = new Set(DB.projects.flatMap(p => p.samples.map(base)));
  let mx = 0, width = 0; ss.forEach(q => { const b = base(q); if (!b.startsWith(pre)) return; const k = b.slice(pre.length); if (/^\d+$/.test(k)) { mx = Math.max(mx, +k); width = Math.max(width, k.length); } });
  let n = mx + 1, id; do { id = pre + String(n++).padStart(width || 2, '0'); } while (all.has(id)); return id;
}
export const pTypes = () => proj().types || [];
/* filters for the grid in Study plan: by sample type (the part of the name after the animal or donor), by group, and by text */
export const sType = id => id.includes(' ') ? id.slice(id.indexOf(' ') + 1) : '';
const planTypes = () => [...new Set(proj().samples.map(m => sType(m.id)).filter(Boolean))];
export const planRows = () => proj().samples.filter(m => (!S.planType || sType(m.id) === S.planType) && (!S.planGroup || m.group === S.planGroup) && (!S.planQ || low(m.id).includes(low(S.planQ))));
export const gtag = g => { if (!g || !proj()) return ''; const gs = pGroups(), i = Math.max(0, gs.indexOf(g)); const t = gs.length > 1 ? i / (gs.length - 1) : 0.4, deep = t > 0.55;   // pale to full colour, then darker; neighbours also lean slightly warmer or cooler
  return `<span class="gtag ${t > 0.38 ? 'dk' : ''}" style="--g:${Math.round(deep ? 100 : 14 + t / 0.55 * 86)}%;--k:${Math.round(deep ? (t - 0.55) / 0.45 * 42 : 0)}%;--h:${i % 2 ? 16 : -16}">${e(g)}</span>`; };
export const pGroups = () => [...new Set(proj().samples.map(m => m.group).concat(proj().xg || []).filter(Boolean))];
V.plan = () => {
  if (!proj()) return noProj();
  const p = proj(), xs = projExps(), cols = planCols(), inUse = new Set(xs.map(x => x.proto)), nm = nextMouse(), selT = pTypes().filter(t => S.addT.has(t));
  const types = planTypes(), groups = pGroups(); if (!types.includes(S.planType)) S.planType = ''; if (!groups.includes(S.planGroup)) S.planGroup = ''; const rows = planRows();
  return `<div class="stack"><div class="card"><div class="line"><h2 class="grow">Study plan: ${e(p.name)}</h2><span class="sm muted">Study colour</span>${p.lin ? '' : '<button class="btn sm" data-a="linSwitch" title="For organoids and cell lines: passages, frozen stocks and a lineage tree">Switch on lineages</button>'}${p.mon && p.mon.on ? '' : '<button class="btn sm" data-a="monOn">Switch on animal monitoring</button>'}<span class="swatches" role="group" aria-label="Study colour">${PALS.map(([k, l]) => `<button class="sw ${palOf(p) === k ? 'on' : ''}" data-pal="${k}" data-a="setPal" data-k="${k}" title="${l}" aria-label="${l}" aria-pressed="${palOf(p) === k}"></button>`).join('')}</span></div>
   <div class="hint">Set a study up in three steps: list the samples you hold, choose the experiments from the lab protocols, then tick which sample gets which experiment. Overview, Samples, Experiments and Targets all follow what is ticked here.</div></div>
  <div class="cols">
   <div class="card"><h2>1. Samples <span class="muted sm">${p.samples.length} held</span></h2>
    ${p.lin ? '<div class="todo sm"><span>This study grows cultures. Names added here become <b>founder samples</b>; their passages are added under Lineage as you make them, and each one then appears in the grid below.</span><button class="btn sm" data-a="tab" data-k="lineage">Open Lineage</button></div>' : ''}
    <label class="sm" for="smNames">Names, one per line or separated by commas<textarea id="smNames" rows="3" placeholder="Any names you like, for example: M01, M02, M03   or   Patient 7   or   HeLa-A, HeLa-B   or   Plate 1"></textarea></label>
    <div class="rg"><label>One of each for these parts (optional)<input type="text" id="smParts" placeholder="e.g. tumour, serum   or   RNA, protein"></label><label>Group (optional)<input type="text" id="smGroup" placeholder="e.g. treated"></label></div>
    <div class="line"><button class="btn" data-a="smAdd">Add samples</button><span class="err" id="smErr"></span></div>
    <div class="hint">A name can be whatever the sample comes from: an animal, a patient, a cell line, a plate. With parts filled in, each name gets one sample per part, so M01 becomes M01 tumour, M01 serum and so on. A sample can sit here with nothing planned on it, so you still have a record that you hold it.</div>
    <details ${S.smOpen ? 'open' : ''}><summary class="sm">Show all ${p.samples.length} samples</summary><div class="mcs" style="margin-top:8px">${p.samples.map(m => `<span class="mc">${e(m.id)}${hasRuns(m.id) ? '' : `<button class="lnk" data-a="smDel" data-m="${e(m.id)}" aria-label="Remove ${e(m.id)}">×</button>`}</span>`).join('')}</div></details>
    <div class="ti"><h3>Or add them one at a time</h3>
     <div class="sm"><b>Names start with</b> <span class="muted">any letters you like; the number is added for you</span></div>
     <div class="line"><input type="text" id="mPre" data-c="mPre" value="${e(namePrefix())}" style="width:130px" aria-label="What the names start with" placeholder="e.g. M, P, HeLa-"><span class="sm muted grow">The next one will be called <b class="mono">${e(nm)}</b>. Use M for mice, P for patients, a cell line's name, or anything else, without spaces.</span></div>
     <div class="sm"><b>Parts or sample types</b> <span class="muted">click all that this one has; they stay selected for the next one</span></div>
     <div class="mcs">${pTypes().map(t => `<button class="mc ${S.addT.has(t) ? 'on' : ''}" data-a="mtT" data-t="${e(t)}" aria-pressed="${S.addT.has(t)}">${e(t)}</button>`).join('') || '<span class="hint">None yet. Add them below, or leave empty if each name is a single sample.</span>'}</div>
     <div class="line"><input type="text" id="mtNew" class="grow" placeholder="A part or sample type, e.g. tumour, RNA, lysate" aria-label="New part or sample type"><button class="btn sm" data-a="mtTAdd">Add type</button></div>
     <div class="sm"><b>Group</b> <span class="muted">stays the same until you change it</span></div>
     <div class="mcs">${[''].concat(pGroups()).map(g => `<button class="mc ${S.addG === g ? 'on' : ''}" data-a="mtG" data-g="${e(g)}" aria-pressed="${S.addG === g}">${e(g || 'No group')}</button>`).join('')}</div>
     <div class="line"><input type="text" id="mgNew" class="grow" placeholder="Another group" aria-label="New group"><button class="btn sm" data-a="mtGAdd">Add group</button></div>
     <div class="line"><button class="btn pri" data-a="mAdd">+ Add ${e(nm)}</button><span class="sm muted grow">Adds ${selT.length ? selT.map(t => e(nm + ' ' + t)).join(', ') : e(nm) + ' as one sample'}${S.addG ? ' to ' + e(S.addG) : ''}</span></div></div></div>
   <div class="card"><h2>2. Experiments <span class="muted sm">${xs.length} in this study</span></h2>
    ${xs.map(x => `<div class="ti"><div class="line"><b class="grow">${e(x.name)}</b><span class="sm muted">${e(P(x.proto).name)}</span>${DB.sessions.some(q => q.exp === x.id) ? '' : `<button class="btn sm" data-a="xDel" data-x="${x.id}">Remove</button>`}</div>
      ${x.targets ? `<div class="mcs">${x.targets.map(t => `<span class="mc">${e(t)}${x.treag && R(x.treag[t]) ? ' · ' + e(R(x.treag[t]).name) : ''}</span>`).join('')}</div>
       <div class="line"><input type="text" id="tg${x.id}" class="grow" placeholder="Add a gene or protein" aria-label="Gene or protein"><select id="tr${x.id}" aria-label="Linked reagent"><option value="">No linked reagent</option>${DB.reagents.map(r => `<option value="${r.id}">${e(r.name)}</option>`).join('')}</select><button class="btn sm" data-a="tgAdd" data-x="${x.id}">Add</button></div>` : ''}</div>`).join('') || '<div class="hint">None yet.</div>'}
    <h3>Add from the lab protocols</h3>
    ${DB.protocols.length ? `<div class="rg"><label>Protocol<select id="pxProto">${DB.protocols.map(q => `<option value="${q.id}">${e(q.name)}${inUse.has(q.id) ? ' (already used here)' : ''}</option>`).join('')}</select></label><label>Name in this study<input type="text" id="pxName" placeholder="Same as the protocol"></label><label>Genes or proteins (optional)<input type="text" id="pxT" placeholder="e.g. gene A, gene B"></label></div>
    <div class="line"><button class="btn" data-a="pxAdd">Add experiment</button></div>` : '<div class="hint">The lab has no protocols yet. Create one under Protocols, then add it here.</div><div class="line"><button class="btn" data-a="tab" data-k="protos">Open Protocols</button></div>'}
    <div class="hint">The protocol stays one shared protocol. The genes or proteins belong to this study, and each can be linked to its own primer or antibody in Reagents so the right stock goes down.</div></div></div>
  <div class="card"><div class="line"><h2 class="grow">3. Which sample gets which experiment</h2><label class="fld" for="planX">Columns<select id="planX" data-c="planX"><option value="">All experiments</option>${xs.map(x => `<option value="${x.id}" ${S.planX === x.id ? 'selected' : ''}>${e(x.name)}</option>`).join('')}</select></label></div>
   <div class="line" style="flex-wrap:wrap"><b class="sm">Show samples</b>
    ${types.length ? `<label class="fld" for="planType">Type<select id="planType" data-c="planType"><option value="">All types</option>${types.map(t => `<option ${S.planType === t ? 'selected' : ''}>${e(t)}</option>`).join('')}</select></label>` : ''}
    ${groups.length ? `<label class="fld" for="planGroup">Group<select id="planGroup" data-c="planGroup"><option value="">All groups</option>${groups.map(g => `<option ${S.planGroup === g ? 'selected' : ''}>${e(g)}</option>`).join('')}</select></label>` : ''}
    <label class="fld" for="planQ">Name contains<input type="text" id="planQ" data-c="planQ" value="${e(S.planQ || '')}" placeholder="e.g. M01 or formalin" style="width:170px"></label>
    <span class="sm muted">${rows.length} of ${p.samples.length} shown</span>${rows.length < p.samples.length ? '<button class="lnk sm" data-a="planClear">Show all</button>' : ''}</div>
   <div class="hint">Tick a box to plan that experiment on that sample. Boxes where a run has already started are locked. "all / none" fills or clears a whole row, or a whole column for the samples shown.</div>
   ${p.samples.length && cols.length ? `<div class="scroll" style="max-height:70vh;overflow:auto"><table class="mx"><thead><tr><th>Sample</th>${cols.map((c, i) => `<th>${e(c.x.name)}${c.t ? '<br><span class="mono">' + e(c.t) + '</span>' : ''}<br><button class="lnk" data-a="asgCol" data-i="${i}">all / none</button></th>`).join('')}</tr></thead>
    <tbody>${rows.map(m => `<tr><td><span class="mono">${e(m.id)}</span> ${gtag(m.group)} <button class="lnk sm" style="font-weight:400" data-a="asgRow" data-m="${e(m.id)}">all / none</button></td>${cols.map(c => { const k = key(c.x.id, c.t, m.id); return `<td><input type="checkbox" data-c="asg" data-k="${e(k)}" aria-label="${e(m.id + ' ' + c.x.name + ' ' + c.t)}" ${DB.asg.has(k) ? 'checked' : ''} ${IDX.has(k) ? 'disabled' : ''}></td>`; }).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}" class="muted">No sample matches these filters.</td></tr>`}</tbody></table></div>`
      : '<div class="hint">Add at least one sample and one experiment above and the grid appears here.</div>'}</div></div>`;
};
