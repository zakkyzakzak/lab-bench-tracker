// Sign-in gates, the tab bar and render(), which draws the whole screen.

import { LAB_OWNER } from '../config.js';
import { $, AFTER, DB, S, V, WITS, e, flag, isAdmin, isMember, isSup, now, realAdmin, roleOf, safeUrl, wkLabel } from './core.js';
import { markDrawn, onlineHTML, pending, saveState } from './sync.js';
import { lowList } from './reagents.js';
import { inbox, proj, visProj } from './runs.js';
import { lockFor, tDone, tN, tName } from './targets.js';
import { modalHTML } from './modal.js';
import { welcomeCheck } from './welcome.js';

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
const STUDY_TABS = [['today', 'Today'], ['timeline', 'Timeline'], ['targets', 'Targets'], ['overview', 'Overview'], ['mice', 'Samples'], ['lineage', 'Lineage'], ['exps', 'Experiments'], ['monitor', 'Monitoring'], ['plan', 'Study plan'], ['export', 'Export']];
const LAB_TABS = [['protos', 'Protocols'], ['reag', 'Reagents'], ['map', 'Lab map'], ['duties', 'Lab duties'], ['others', 'Other projects'], ['lab', 'Lab and access']];
export const TABS = [...STUDY_TABS, ...LAB_TABS];
/* a study can pick a colour; everything inside that study's space is drawn in it, for everyone */
export const PALS = [['', 'Teal'], ['pink', 'Pink'], ['purple', 'Purple'], ['blue', 'Blue'], ['green', 'Green'], ['amber', 'Amber'], ['red', 'Red'], ['slate', 'Slate']];
export const palOf = p => (p && PALS.some(q => q[0] === p.pal) && p.pal) || '';
export let stale = false;
export const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio' && !!a.closest('#app,#modal'); };
/* a change arriving from Firestore must not wipe a field someone is typing in: redraw once they leave it */
export function softRender() { if (typing() && !gateView()) { stale = true; return; } render(true); }
function safe(fn, what) { try { return fn(); } catch (err) { console.error(err); return `<div class="card"><b>This ${what} could not be shown.</b><div class="hint">${e(err.message)}</div></div>`; } }
export function render(keepTyped) {
  stale = false; markDrawn();
  // when the redraw comes from new data (not from something the person did), text typed but not yet used is carried over
  const typed = keepTyped ? [...document.querySelectorAll('#app input[id], #app textarea[id]')].filter(el => !['checkbox', 'radio', 'file'].includes(el.type) && el.value !== el.defaultValue).map(el => [el.id, el.value, el.defaultValue]) : [];
  const g = gateView(); welcomeCheck();
  if (g) { $('#app').innerHTML = g; $('#modal').innerHTML = ''; render.mh = ''; return; }
  const vis = visProj();
  if (proj() && S.selExp === undefined) S.selExp = proj().exps[0];
  if (S.tab === 'lineage' && proj() && !proj().lin) S.tab = 'plan';   // the Lineage tab only exists in studies that grow cultures
  const keep = S.tab === render.tab ? [...document.querySelectorAll('#app .scroll, #app .rows')].map(el => [el.scrollTop, el.scrollLeft]) : []; render.tab = S.tab;
  const lock = lockFor(S.user), nn = inbox().length;
  const inStudy = STUDY_TABS.some(t => t[0] === S.tab), pal = palOf(proj()), labName = DB.lab.name || 'the lab';
  const tabBtn = ([k, l]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-a="tab" data-k="${k}">${l}${k === 'reag' && lowList().length ? ' ' + flag('bad', lowList().length + ' low') : ''}${k === 'protos' && S.edit ? ' ' + flag('warn', 'unsaved') : ''}</button>`;
  $('#app').innerHTML = `<header class="top"><img class="logo" src="logo.png" alt="Kaur Laboratory" width="36" height="36"><span class="brand">Lab Bench Tracker</span><span class="sp"></span>
    <span id="online" class="online" role="group" aria-label="Online now">${onlineHTML()}</span>
    <span class="sm">${e(S.fb.displayName || S.user)}</span>${flag(isSup() ? 'info' : isAdmin() ? 'ok' : '', S.asMember && realAdmin() ? 'Member view' : roleOf(S.user))}
    ${realAdmin() ? `<button class="btn sm" data-a="viewAs" title="Switch between what an admin sees and what an ordinary member sees">${S.asMember ? 'Back to admin view' : 'See as a member'}</button>` : ''}
    <button class="btn" data-a="inbox">Inbox ${nn ? flag('info', nn) : ''}</button><button class="btn" data-a="signout">Sign out</button></header>
   ${S.fail ? `<section class="lock" role="alert"><div class="line"><h2 class="grow">${S.fail.bad.length + S.fail.more} of ${S.fail.of} change${S.fail.of === 1 ? '' : 's'} could not be saved</h2><button class="btn sm" data-a="failOk">Dismiss</button></div>
     <div class="sm">What was refused has been put back as it was${S.fail.of > S.fail.bad.length + S.fail.more ? '; the rest was saved' : ''}. If this keeps happening, send a screenshot of this box.</div>
     ${S.fail.bad.map(b => `<div class="sm mono" style="white-space:normal;word-break:break-word">${e(b.op)} ${e(b.path)}${b.fields ? ' [' + e(b.fields) + ']' : ''} → ${e(b.code || 'error')}: ${e(b.msg.slice(0, 220))}</div>`).join('')}${S.fail.more ? `<div class="sm">and ${S.fail.more} more</div>` : ''}</section>` : ''}
   <nav class="nav2" aria-label="Sections">
    <div class="navg study ${inStudy ? 'here' : ''}" data-pal="${pal}"><div class="navh"><span class="navt">Study</span>${vis.length ? `<select id="selProj" data-c="proj" aria-label="Study">${vis.map(p => `<option value="${p.id}" ${p.id === S.project ? 'selected' : ''}>${e(p.name)}</option>`).join('')}</select>` : '<span class="sm muted">none yet</span>'}<button class="btn sm" data-a="newStudy">New study</button></div><div class="tabs">${STUDY_TABS.filter(t => t[0] !== 'lineage' || (proj() && proj().lin)).map(tabBtn).join('')}</div></div>
    <div class="navg lab ${inStudy ? '' : 'here'}"><div class="navh"><span class="navt">Whole lab</span><span class="sm muted">shared by everyone in ${e(labName)}</span><button class="btn sm" data-a="bioLogin" title="Opens BioRender's sign-in page and gives you the 6-digit code for the lab's account">BioRender login</button></div><div class="tabs">${LAB_TABS.map(tabBtn).join('')}</div></div>
   </nav>
   ${inStudy ? (proj() ? `<div class="scope study" data-pal="${pal}"><b>${e(proj().name)}</b><span class="grow">You are inside this study. What you add or change on this page belongs to ${e(proj().name)} only.</span>${proj().drive && safeUrl(proj().drive.url) ? `<a class="btn sm" href="${e(proj().drive.url)}" target="_blank" rel="noopener noreferrer">Open the Google Drive folder for ${e(proj().name)}</a>${safeUrl(proj().drive.sheetUrl) ? `<a class="btn sm" href="${e(proj().drive.sheetUrl)}" target="_blank" rel="noopener noreferrer">Data sheet</a>` : ''}` : ''}</div>` : '')
     : `<div class="scope lab"><b>Whole lab</b><span>This page is shared. What you add or change here is seen and used by everyone in ${e(labName)}.</span></div>`}
   ${lock ? `<section class="lock"><h2>Last week's target was missed</h2><div>${e(tName(lock))}, week of ${wkLabel(lock.week)}: <b>${tDone(lock)} of ${tN(lock)}</b> done. Before you carry on, tell Prof Kaur what happened. She is notified as soon as you send it.</div>
     <div class="g3"><label for="exWhat">What happened<textarea id="exWhat" rows="3"></textarea></label><label for="exWhy">Why that meant the target was missed<textarea id="exWhy" rows="3"></textarea></label><label for="exPlan">Plan to catch up<textarea id="exPlan" rows="3"></textarea></label></div>
     <div class="line"><button class="btn pri" data-a="excuse" data-id="${lock.id}">Send to Prof Kaur and unlock</button><span class="err" id="exErr"></span></div></section>` : ''}
   <div class="view" data-pal="${inStudy ? pal : ''}" ${lock ? 'inert' : ''}>${safe(V[S.tab] || V.today, 'tab')}</div>`;
  document.querySelectorAll('#app .scroll, #app .rows').forEach((el, i) => { if (keep[i]) { el.scrollTop = keep[i][0]; el.scrollLeft = keep[i][1]; } });
  for (const [id, v, dv] of typed) { const el = document.getElementById(id); if (el && el.defaultValue === dv) el.value = v; }
  const mh = safe(modalHTML, 'window'); if (mh !== render.mh) { $('#modal').innerHTML = mh; render.mh = mh; }   // left alone when unchanged, so an open window does not flicker or lose what is typed
  AFTER.forEach(f => f());
  tick(); saveState();
}
function tick() { document.querySelectorAll('[data-until]').forEach(el => { const l = Math.round((+el.dataset.until - now()) / 1000); el.textContent = l > 0 ? (l >= 3600 ? Math.floor(l / 3600) + ':' : '') + String(Math.floor(l % 3600 / 60)).padStart(2, '0') + ':' + String(l % 60).padStart(2, '0') + ' left' : 'time is up'; }); }
setInterval(tick, 1000);
setInterval(() => { if (S.ready && S.tab === 'today' && DB.sessions.some(s => !s.doneAt && s.waitStart)) softRender(); }, 60000);   // keeps "what fits" in step with the time left
