// The waiting list for uploads to Google Drive. Anything sent to Drive joins the list and goes up one at a time,
// in the order it was added, so you can carry on to the next animal or sample without waiting for the last one.
// A small box in the corner shows what is going up, what is waiting and anything that failed.

import { e, toast } from './core.js';

const Q = [];                       // { id, label, where, run, state: 'wait' | 'run' | 'done' | 'fail', err, tries }
let seq = 0, active = false, okCount = 0;
const left = () => Q.filter(t => t.state === 'wait' || t.state === 'run');
/* how many uploads are still on their way for one place (an animal, a run), to show on its page */
export const waitingFor = where => left().filter(t => t.where === where).length;
export const uploading = () => left().length > 0;

/* Add a job. run() does the upload and records the result; it is called when its turn comes. */
export function queueUpload(label, where, run) {
  Q.push({ id: ++seq, label, where, run, state: 'wait', err: '', tries: 0 }); draw(); pump();
}
const passing = err => !err.refused && /failed to fetch|networkerror|load failed|no answer|unexpected token|not valid json/i.test(String(err && err.message));
async function pump() {
  if (active) return; active = true;
  for (let t; (t = Q.find(q => q.state === 'wait'));) {
    t.state = 'run'; draw();
    try { t.tries++; await t.run(); t.state = 'done'; okCount++; }
    catch (err) {
      if (passing(err) && t.tries < 3) { t.state = 'wait'; t.err = 'trying again'; draw(); await new Promise(r => setTimeout(r, 2500 * t.tries)); continue; }   // a dropped connection: try the same one again before moving on
      t.state = 'fail'; t.err = (err && err.message) || 'no answer from Drive'; console.error('Upload failed', t.label, err);
    }
    draw();
  }
  active = false;
  const bad = Q.filter(t => t.state === 'fail').length;
  if (okCount) toast(`${okCount} upload${okCount === 1 ? '' : 's'} finished${bad ? ', ' + bad + ' failed (see the box in the corner)' : ''}.`); okCount = 0;
  for (let i = Q.length - 1; i >= 0; i--) if (Q[i].state === 'done') Q.splice(i, 1);
  setTimeout(draw, 2500);
}

function box() { let el = document.getElementById('upq'); if (!el) { el = document.createElement('div'); el.id = 'upq'; el.setAttribute('aria-live', 'polite'); document.body.append(el); } return el; }
let open = false;
function draw() {
  const el = box(), run = Q.find(t => t.state === 'run'), wait = Q.filter(t => t.state === 'wait'), bad = Q.filter(t => t.state === 'fail'), done = Q.filter(t => t.state === 'done').length;
  if (!run && !wait.length && !bad.length) { el.hidden = true; el.innerHTML = ''; return; }
  const total = done + (run ? 1 : 0) + wait.length;
  el.hidden = false;
  el.innerHTML = `<div class="upq-h"><b>${run || wait.length ? `Uploading ${done + 1} of ${total}` : 'Uploads'}</b>${wait.length ? `<span class="muted">${wait.length} waiting</span>` : ''}${bad.length ? `<span class="late">${bad.length} failed</span>` : ''}<span class="sp"></span>${wait.length ? `<button class="lnk sm" data-uq="open">${open ? 'Hide' : 'Show'} list</button>` : ''}</div>
    ${run ? `<div class="sm upq-cur"><span class="upq-spin" aria-hidden="true"></span>${e(run.label)}</div>` : ''}
    ${open ? wait.map(t => `<div class="sm muted">${e(t.label)}${t.err ? ' · ' + e(t.err) : ''}</div>`).join('') : ''}
    ${bad.map(t => `<div class="sm"><span class="late">Failed:</span> ${e(t.label)}<br><span class="muted">${e(t.err)}</span> <button class="lnk" data-uq="again" data-id="${t.id}">Try again</button> <button class="lnk" data-uq="drop" data-id="${t.id}">Dismiss</button></div>`).join('')}`;
}
document.addEventListener('click', ev => {
  const b = ev.target.closest && ev.target.closest('[data-uq]'); if (!b) return; const k = b.dataset.uq, t = Q.find(q => q.id === +b.dataset.id);
  if (k === 'open') open = !open;
  if (k === 'again' && t) { t.state = 'wait'; t.err = ''; t.tries = 0; }
  if (k === 'drop' && t) Q.splice(Q.indexOf(t), 1);
  draw(); pump();
});
addEventListener('beforeunload', ev => { if (uploading()) { ev.preventDefault(); ev.returnValue = ''; } });

/* One file chooser that lives outside the page that gets redrawn. A chooser inside it is thrown away when the page
   redraws (for example when an earlier upload finishes), and the file picked in it is then silently lost. */
let inp = null;
export function pickFiles(many, cb, accept) {
  if (!inp) { inp = document.createElement('input'); inp.type = 'file'; inp.hidden = true; inp.id = 'upPicker'; document.body.append(inp); }
  inp.multiple = !!many; inp.value = ''; inp.accept = accept || '';       // accept: the kinds of file the chooser offers, e.g. '.pdf,.docx'
  inp.onchange = () => { const fs = [...(inp.files || [])]; inp.value = ''; if (fs.length) cb(fs); };
  inp.click();
}
