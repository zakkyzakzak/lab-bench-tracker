// Every pop-up window.

import { DB, MIN, S, dt, dur, e, flag, isSup, now, safeUrl, users } from './core.js';
import { dayKey } from './sync.js';
import { R } from './reagents.js';
import { P, X, cur, feeds, importHTML, inProj, isLeaf, lacking, leaves, names, needAll, preLine, ptypeLine, srcs, stepLi, tot, usedIn, vname } from './protocols.js';
import { fHas, inbox, key, proj, projExps, runOf, sess } from './runs.js';
import { resTable } from './study.js';
import { upBtn } from './animals.js';
import { addFileHTML, anDataHTML, sureFoot } from './photos.js';
import { BIO_URL } from './lab.js';
import { xreqHTML } from './export.js';
import { dutyModal } from './duties.js';
import { linModal } from './lineage.js';

/* ---------------- modal ---------------- */
export function modalHTML() {
  const m = S.modal; if (!m) return ''; let h = '';
  if (m.type === 'run') {
    const x = X(m.x), s = runOf(m.x, m.t, m.m), fs = DB.files.filter(f => fHas(f, key(m.x, m.t, m.m)));
    const p = s && P(s.proto), n = p && p.nodes.find(q => q.id === s.node), stale = n && (cur(n).n !== s.rev || !isLeaf(p, n) || vname(p, n) !== s.label);
    h = `<h2><span class="mono">${e(m.m)}</span> · ${e(x.name)} ${e(m.t)}</h2>${preLine(x, m.m)}
     ${!s ? '<div class="hint">Not started. Start it from Experiments, where you can tick several samples and run them as one bench session.</div>'
      : `<div class="line">${flag(s.doneAt ? 'ok' : 'warn', s.doneAt ? 'Done ' + dt(s.doneAt) : 'On the bench')}<span class="flag info mono">${e(s.pname)} ${e(s.label)} rev ${s.rev}</span><span class="sm muted">by ${e(users[s.by].name)}, batch of ${s.mice.length}</span></div>
       ${stale ? `<div class="todo sm"><span>The protocol has changed since (now ${e(vname(p, n))} rev ${cur(n).n}). This record keeps the steps as they were done.</span></div>` : ''}
       <ol class="steps">${s.steps.map((stp, i) => `<li class="${i < s.stepIdx ? 'done' : ''}"><span class="n">${i < s.stepIdx ? '✓' : i + 1}</span><div class="tx"><b>${e(stp.t)}</b>${s.notes.filter(q => q.step === i && (q.mice === 'all' || q.mice.includes(m.m))).map(q => `<div class="dev">${q.mice === 'all' ? 'Whole batch' : 'This sample'}: ${e(q.text)} <span class="muted">(${dt(q.at)}, ${e(users[q.by].name)})</span></div>`).join('')}</div><div class="rt sm muted">${dur(stp.m)}</div></li>`).join('')}</ol>
       ${s.notes.filter(q => q.step == null && q.mice.includes(m.m)).map(q => `<div class="dev">Note: ${e(q.text)} <span class="muted">(${dt(q.at)}, ${e(users[q.by].name)})</span></div>`).join('')}
       <div class="line"><input type="text" id="runNote" class="grow" placeholder="Note for this sample only, e.g. thawed for 6 min instead" aria-label="Note for this sample"><button class="btn sm" data-a="runNote">Add note</button></div>`}
     ${s ? resTable(s, m.m) : ''}
     <h3>Results</h3>
     ${fs.map(f => `<div class="line sm"><span class="grow">${safeUrl(f.url) ? `<a class="lnk" href="${e(f.url)}" target="_blank" rel="noopener noreferrer">${e(f.name)}</a>` : `<span class="mono">${e(f.name)}</span>`} <span class="muted">· ${dt(f.at)} · ${e(users[f.by].name)}${(f.keys || []).length > 1 ? ' · shared by ' + f.keys.length + ' samples' : ''}</span></span><button class="btn sm" data-a="fileDel" data-id="${f.id}">Remove</button></div>`).join('') || '<div class="hint">No result files yet.</div>'}
     <div class="rg"><label>File name<input type="text" id="fName" placeholder="e.g. image at 20x"></label><label>Link to the file<input type="url" id="fUrl" placeholder="https://drive.google.com/…"></label></div>
     ${s && s.mice.length > 1 ? `<details class="sm"><summary>This file shows more than one sample (for example a gel)</summary><div class="pick" style="padding-top:6px"><label><input type="checkbox" id="fAll" data-c="fAll"> All ${s.mice.length} in this session</label>${s.mice.filter(q => q !== m.m).map(q => `<label><input type="checkbox" class="fAlso" value="${e(q)}"> <span class="mono">${e(q)}</span></label>`).join('')}</div></details>` : ''}
     <div class="line"><button class="btn sm" data-a="fileAdd">Add result file</button>${upBtn('fUp')}<span class="err" id="mErr"></span></div>
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
     <div class="todo"><span>${e(p.name)} starts from a sample already processed by <b>${e(ss.map(q => q.name).join(needAll(p) ? ' and ' : ' or '))}</b>. That is not recorded for ${miss.length} of the ${S.picked.size} ticked sample${S.picked.size === 1 ? '' : 's'}: <span class="mono">${e(miss.join(', '))}</span>.</span></div>
     <h3>Do it first</h3>${ss.map(q => { const xs = projExps().find(y => y.proto === q.id); return xs ? `<div class="line"><button class="btn" data-a="preGo" data-x="${xs.id}">Do ${e(xs.name)} first</button></div>` : `<div class="hint">${e(q.name)} is not in this study. Add it under Study plan to run it here.</div>`; }).join('')}
     <h3>It has already been done</h3>
     <div class="rg">${ss.length > 1 && !needAll(p) ? `<label>Which one<select id="preSrc">${ss.map(q => `<option value="${q.id}">${e(q.name)}</option>`).join('')}</select></label>` : ''}<label>Date it was done (optional)<input type="date" id="preDate" max="${today}"></label></div>
     <div class="hint">Leave the date empty if it is not known. This is kept on the record of each of these samples.</div>
     <div class="line"><button class="btn pri" data-a="preDone">Record as done and start</button></div>
     <div class="foot"><span class="err" id="mErr"></span><button class="btn" data-a="close">Cancel</button><button class="btn" data-a="start" data-force="1">Start anyway</button></div>`;
  }
  if (m.type === 'imp') h = importHTML(m);
  if (m.type === 'anData') h = anDataHTML(m);
  if (m.type === 'duty') h = dutyModal(m);
  if (m.type === 'addFile') h = addFileHTML(m);
  if (m.type === 'xreq') h = xreqHTML(m);
  if (['linPass', 'linFreeze', 'linThaw', 'linEnd'].includes(m.type)) h = linModal(m);
  if (m.type === 'anEnd') h = `<h2>End of ${e(m.an)}</h2><div class="rg"><label>Date<input type="date" id="aeDay" value="${S.monDay || dayKey(now())}" max="${dayKey(now())}"></label><label>Reason<select id="aeWhy"><option>End of study</option><option>Humane endpoint</option><option>Found dead</option><option>Other</option></select></label></div><label>Note (optional)<input type="text" id="aeNote" placeholder="e.g. tumour over the size limit"></label>
     <div class="hint">The animal moves to the bottom of the visit list and is left out of dose sheets after this date. Its samples and records are not affected.</div><div class="foot"><span class="err" id="mErr"></span><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="anEndSave">Mark as ended</button></div>`;
  if (m.type === 'sure') h = `<h2>Are you sure?</h2><div class="todo"><span><b>${e(m.q[0])}</b>${m.q[1] ? '<br>' + e(m.q[1]) : ''}</span></div>
     ${sureFoot(m, e(m.q[2]))}`;
  if (m.type === 'delProto') {
    const p = P(S.selProto), xs = DB.exps.filter(x => x.proto === p.id), ns = DB.sessions.filter(q => q.proto === p.id).length, lead = feeds(p);
    h = `<h2>Delete ${e(p.name)}?</h2>
     <div class="todo"><span>${xs.length ? `It is used by ${xs.length} experiment${xs.length === 1 ? '' : 's'} in the studies you can see${ns ? `, with ${ns} bench session${ns === 1 ? '' : 's'} recorded` : ''}. Those experiments keep working and keep their records, but the protocol leaves the library and can no longer be added to a study.` : isSup() ? 'No study uses it. It will be removed completely, with all its variants and revisions.' : 'You cannot see every study, so it is taken out of the library but kept in the background in case a study still uses it.'}</span></div>
     ${lead.length ? `<div class="hint">${e(names(lead))} will no longer list it as an earlier step.</div>` : ''}
     <div class="hint">This cannot be undone from the site.</div>
     <div class="foot"><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="delProtoYes">Delete protocol</button></div>`;
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
    h = `<h2>${e(p.name)} <span class="mono">${e(vname(p, n))} rev ${r.n}</span></h2><div class="sm muted">Created by ${e(users[p.by].name)} · printed ${dt(now())} · ${dur(tot(r.steps))} in total</div><div class="sm">${e(ptypeLine(p))}</div>${p.ethics ? `<div class="sm">Ethics approval: ${e(p.ethics)}</div>` : ''}${p.notes ? `<div class="sm">Notes: ${e(p.notes)}</div>` : ''}
     <ol class="steps">${r.steps.map(stepLi).join('')}</ol>
     <h3>Reagents</h3>${rs.length ? `<div class="scroll"><table class="mx"><thead><tr><th>Reagent</th><th>Brand</th><th>Supplier</th><th>Pack size</th></tr></thead><tbody>${rs.map(q => `<tr><td>${e(q.name)}</td><td class="g">${e(q.brand || '')}</td><td class="g">${e(q.supplier || '')}</td><td>${q.per} ${e(q.unit)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="hint">No reagents chosen in this protocol.</div>'}
     <div class="hint noprint">Price is left off the printed sheet.</div><div class="foot"><button class="btn" data-a="close">Close</button><button class="btn pri" data-a="printNow">Print</button></div>`;
  }
  if (m.type === 'newStudy') {
    h = `<h2>New study</h2><label>Name<input type="text" id="nsName" placeholder="e.g. BCMS Phase III"></label><label>Short description<input type="text" id="nsDesc" placeholder="e.g. 30 mice, colorectal xenograft"></label>
     <label>Its samples<select id="nsKind"><option value="">A fixed set, known at the start (animals, patient tissue)</option><option value="lin">Cultures that grow over time (organoids, cell lines)</option></select></label>
     <div class="hint">Cultures get a Lineage tab: founder samples, their passages, frozen stocks and a lineage tree, added to as you go. It can also be switched on later under Study plan. <button class="lnk" data-a="linTest">See a test study with made-up samples</button></div>
     <div class="hint">${isSup() ? 'As a supervisor you see it without being listed. Add its members under Lab and access.' : 'You start as its only member. Add other people under Lab and access.'}</div>
     <div class="foot"><span class="err" id="mErr"></span><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="newStudySave">Create study</button></div>`;
  }
  if (m.type === 'inbox') {
    const ns = inbox().reverse();
    h = `<h2>Inbox for ${e(users[S.user].name)}</h2>${ns.map(n => `<div class="sm" style="border-top:1px solid var(--line);padding-top:8px"><span class="muted">${dt(n.at)}${n.mailedAt ? ' · emailed' : ''}</span><br>${e(n.text)}</div>`).join('') || '<div class="hint">Nothing here.</div>'}<div class="hint">Each notice is also emailed to your Wits address when the lab's email notices are switched on.</div><div class="foot">${ns.length ? '<button class="btn" data-a="inboxClear">Clear all</button>' : ''}<button class="btn" data-a="close">Close</button></div>`;
  }
  if (m.type === 'bio') {
    const set = !!DB.lab.uploadUrl;
    h = `<h2>BioRender login</h2>
     <ol class="sm" style="margin:0;padding-left:20px;display:grid;gap:4px"><li>BioRender has opened in a new tab. <a class="lnk" href="${BIO_URL}" target="_blank" rel="noopener noreferrer">Open it again</a> if it did not.</li><li>Sign in there with the lab's email address and password.</li><li>When BioRender asks for a 6-digit code, come back here, press <b>Show the code</b> and type it in.</li></ol>
     ${m.code ? `<div class="line"><span class="mono" style="font-size:34px;font-weight:600;letter-spacing:.14em" aria-live="polite">${e(m.code)}</span><button class="btn sm" data-a="bioCopy">Copy</button><span class="sm muted" data-until="${m.until}"></span></div>` : ''}
     ${m.old ? '<div class="todo sm"><span>That code has run out. Get a new one.</span></div>' : ''}
     <div class="hint">${set ? 'A code works once, for about 30 seconds. Each code handed out is recorded with your name.' : 'Codes are not set up yet. An admin has to do apps-script/SETUP.md, section 8, and save the web app address under Lab and access.'}</div>
     <div class="foot"><span class="err" id="mErr">${e(m.err || '')}</span><button class="btn" data-a="close">Close</button><button class="btn pri" data-a="bioCode" ${set && !m.busy ? '' : 'disabled'}>${m.busy ? 'Getting the code…' : m.code || m.old ? 'Get a new code' : 'Show the code'}</button></div>`;
  }
  return `<div class="modal" data-a="closeBg"><div class="dlg" role="dialog" aria-modal="true">${h}</div></div>`;
}
