// Lab and access tab, with the Google Drive link-up and sign-in mail.

import * as B from '../backend.js';
import { DB, MIN, S, V, admins, allPeople, canLab, dt, e, flag, isAdmin, isSup, seesAll, nameOf, now, roleOf, safeUrl, sups } from './core.js';
import { byAt, visitCard } from './sync.js';
import { tm } from './runs.js';

/* ---------------- Google Drive: a folder per study, uploads, hand-over of ownership ---------------- */
export const BIO_URL = 'https://app.biorender.com/';   // shows the sign-in page to anyone not signed in; BioRender refuses to be shown inside another site, so it opens in its own tab
export async function driveUpload(file, path) {
  if (file.size > 20e6) throw new Error('the file is larger than 20 MB');
  const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('the file could not be read')); r.readAsDataURL(file); });
  const resp = await fetch(DB.lab.uploadUrl, { method: 'POST', body: JSON.stringify({ token: await B.idToken(), project: S.project, path, name: file.name, type: file.type, data }) });
  const j = await resp.json(); if (!j.ok) throw new Error(j.error || 'the upload was refused'); return j;
}
function driveCard() {
  const url = DB.lab.uploadUrl || '';
  return `<div class="card"><h2>Google Drive</h2><div class="hint">The lab's mail sheet can keep a Drive folder for every study, shared with its members and supervisors, with a spreadsheet copy of everything typed into the tracker. Switch it on in the sheet (menu Lab mail, Switch on Google Drive). Files then belong to the Google account that owns that sheet.</div>
    ${DB.projects.map(p => `<div class="line sm"><b class="grow">${e(p.name)}</b>${p.drive && safeUrl(p.drive.url) ? `<a class="lnk" href="${e(p.drive.url)}" target="_blank" rel="noopener noreferrer">Folder</a>${safeUrl(p.drive.sheetUrl) ? ` <a class="lnk" href="${e(p.drive.sheetUrl)}" target="_blank" rel="noopener noreferrer">Data sheet</a>` : ''}` : '<span class="muted">no folder yet</span>'}</div>${p.drive && p.drive.ownerMsg ? `<div class="sm muted">${e(p.drive.ownerMsg)}</div>` : ''}`).join('') || '<div class="hint">You are not in any study, so there is nothing to list here.</div>'}
    <h3>Uploads from the tracker</h3><div class="hint">To upload photos and result files from inside the tracker, deploy the sheet's script as a web app and paste its address here (see apps-script/SETUP.md, section 7).</div>
    <div class="line"><input type="url" id="upUrl" class="grow" value="${e(url)}" placeholder="https://script.google.com/macros/s/…/exec" aria-label="Web app address"><button class="btn sm" data-a="upUrlSave">Save</button><button class="btn sm" data-a="upTest" ${url ? '' : 'disabled'}>Test</button></div><span class="err" id="upErr"></span>
    ${DB.projects.some(p => p.drive && p.drive.id) ? `<h3>Hand a study's folder to a new owner</h3><div class="hint">Makes someone else the owner of the folder and every file in it, for example Prof Kaur when you leave. You keep Editor access. Google only allows this between accounts in the same organisation, so it may be refused.</div>
    <div class="line"><select id="ownProj" aria-label="Study">${DB.projects.filter(p => p.drive && p.drive.id).map(p => `<option value="${p.id}">${e(p.name)}</option>`).join('')}</select><select id="ownTo" aria-label="New owner">${allPeople().filter(u => u !== S.user).map(u => `<option value="${e(u)}">${e(nameOf(u))}</option>`).join('')}</select><button class="btn sm" data-a="ownAsk">Hand over ownership</button></div>` : ''}</div>`;
}
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
    const canEdit = seesAll() || p.members.includes(S.user), rest = people.filter(em => !sups().includes(em) && !p.members.includes(em));
    return `<div class="card"><div class="line"><b class="grow">${e(p.name)}</b>${p.id === S.project ? flag('info', 'Selected') : `<button class="btn sm" data-a="pickProj" data-id="${p.id}">Open</button>`}</div>
    <div class="sm muted">${p.desc ? e(p.desc) + ' · ' : ''}${p.samples.length} samples · ${p.exps.length} experiments</div>
    <div class="line">${p.members.map(em => `<span class="flag info">${e(nameOf(em))}${canEdit && (p.members.length > 1 || seesAll()) ? ` <button class="lnk" style="color:inherit" data-a="rmMem" data-p="${p.id}" data-u="${e(em)}" aria-label="Remove ${e(nameOf(em))} from ${e(p.name)}">×</button>` : ''}</span>`).join('')}<span class="flag">Prof Kaur (supervises all)</span></div>
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
    ${cl ? mailCard() : ''}${cl ? driveCard() : ''}${isAdmin() ? visitCard() : ''}
    <div class="card"><h2>Where the data lives</h2><div class="flow"><div><b>The website</b>The app code only. No samples, notes, protocols or results are in the code, so a public page gives nothing away.</div><div><b>Google sign-in</b>Each person signs in with their Wits account. The page is an empty shell until they do.</div><div><b>The lab database</b>All records, held in Johannesburg. Projects are open only to their members and supervisors; protocols, reagents and duties are shared by the whole lab.</div></div>
      <div class="hint">Result files are not stored here: each run keeps links to where its files are, for example in Google Drive.</div></div>
  </div><div class="stack"><h3>Projects and who can see them</h3>
    ${DB.projects.map(projCard).join('') || '<div class="card hint">No projects yet. Create one with New study under Study plan.</div>'}
    <div class="line"><button class="btn" data-a="newStudy">New study</button></div>
  </div></div>`;
};
