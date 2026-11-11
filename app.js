// Lab Bench Tracker: empty shell (build 1).
// Sign-in with a Wits Google account, lab membership, Prof Kaur as supervisor of every
// project, projects with members, and every tab from the mockup present with no data.
// No lab data lives in this repository: all records are in Firestore behind firestore.rules.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut }
  from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection,
  onSnapshot, setDoc, updateDoc, addDoc, deleteDoc, query, where, serverTimestamp, arrayUnion, arrayRemove,
  terminate, clearIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { firebaseConfig, LAB_OWNER } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Local browser cache for fast loading; cleared on sign-out (see doSignOut).
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const low = s => String(s || '').trim().toLowerCase();
const WITS = /@(students\.)?wits\.ac\.za$/i;
const flag = (k, t) => `<span class="flag ${k}">${e(t)}</span>`;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => el.hidden = true, 4200); }
const errMsg = err => (err && err.code === 'permission-denied') ? 'Not allowed: your account does not have permission for that.' : (err && err.message) || String(err);

/* ---------------- state ---------------- */
const S = { user: null, lab: undefined, labErr: null, projects: [], people: new Map(), tab: 'today', project: null, busy: false };
let unsub = [];
const stopAll = () => { unsub.forEach(u => u()); unsub = []; };
const me = () => low(S.user?.email);
const isSup = () => !!S.lab && (S.lab.supervisors || []).includes(me());
const isAdmin = () => !!S.lab && (S.lab.admins || []).includes(me());
const isMember = () => !!S.lab && (isSup() || isAdmin() || (S.lab.members || []).includes(me()));
const nameOf = em => S.people.get(em)?.name || em;
const roleOf = em => (S.lab?.supervisors || []).includes(em) ? 'Supervisor' : (S.lab?.admins || []).includes(em) ? 'Admin' : 'Member';
const proj = () => S.projects.find(p => p.id === S.project) || null;

/* ---------------- auth ---------------- */
onAuthStateChanged(auth, async u => {
  stopAll(); S.user = u; S.lab = undefined; S.projects = []; S.people = new Map();
  if (!u) return render();
  if (!WITS.test(u.email || '')) return render();
  // Keep a profile so other lab members see a name rather than an address.
  setDoc(doc(db, 'users', u.uid), { name: u.displayName || u.email, email: low(u.email), lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
  unsub.push(onSnapshot(doc(db, 'config', 'lab'), snap => {
    S.lab = snap.exists() ? snap.data() : null; S.labErr = null;
    watchData(); render();
  }, err => { S.lab = null; S.labErr = errMsg(err); render(); }));
  render();
});

let dataWatch = [];
function watchData() {
  dataWatch.forEach(u => u()); dataWatch = [];
  if (!isMember()) return;
  const q = isSup() ? collection(db, 'projects') : query(collection(db, 'projects'), where('members', 'array-contains', me()));
  dataWatch.push(onSnapshot(q, snap => {
    S.projects = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
    if (!proj()) S.project = S.projects[0]?.id || null;
    render();
  }, err => toast(errMsg(err))));
  dataWatch.push(onSnapshot(collection(db, 'users'), snap => {
    S.people = new Map(snap.docs.map(d => [d.data().email, d.data()])); render();
  }, () => {}));
  unsub.push(() => { dataWatch.forEach(u => u()); dataWatch = []; });
}

async function doSignIn() {
  try { await signInWithPopup(auth, new GoogleAuthProvider().setCustomParameters({ prompt: 'select_account' })); }
  catch (err) { if (err.code !== 'auth/popup-closed-by-user') toast(errMsg(err)); }
}
async function doSignOut() {
  stopAll();
  await signOut(auth);
  // Clear the local cache so nothing from this account stays in the browser.
  try { await terminate(db); await clearIndexedDbPersistence(db); } catch (_) {}
  location.reload();
}

/* ---------------- gates ---------------- */
const gate = inner => `<div class="gate"><div class="card"><div class="brand">Lab Bench Tracker</div>${inner}</div></div>`;
function gateView() {
  if (!S.user) return gate(`<div class="hint">Sign in with your Wits Google account (@students.wits.ac.za or @wits.ac.za).</div>
    <button class="btn pri" data-a="signin">Sign in with Google</button>`);
  if (!WITS.test(S.user.email || '')) return gate(`<div class="err">${e(S.user.email)} is not a Wits account.</div>
    <div class="hint">Sign out and choose your Wits Google account.</div><button class="btn" data-a="signout">Sign out</button>`);
  if (S.lab === undefined) return gate('<div class="hint">Loading the lab…</div>');
  if (S.lab === null) {
    if (S.labErr) return gate(`<div class="err">${e(S.labErr)}</div><button class="btn" data-a="signout">Sign out</button>`);
    if (me() === LAB_OWNER) return gate(`<h2>Set up the lab</h2>
      <div class="hint">One-time step. You become the lab admin. Prof Kaur becomes supervisor and sees every project.</div>
      <label>Lab name<input type="text" id="labName" value="Kaur lab"></label>
      <label>Prof Kaur's Wits email<input type="email" id="supEmail" placeholder="name@wits.ac.za"></label>
      <div class="line"><button class="btn pri" data-a="setupLab">Set up the lab</button><span class="err" id="setupErr"></span></div>`);
    return gate(`<div class="hint">The lab has not been set up yet. Ask Zak to set it up, then sign in again.</div><button class="btn" data-a="signout">Sign out</button>`);
  }
  if (!isMember()) return gate(`<div class="hint">You are signed in as <b>${e(me())}</b>, but you are not in the lab yet.</div>
    <div class="hint">Ask Prof Kaur or Zak to add this address under Lab and access.</div><button class="btn" data-a="signout">Sign out</button>`);
  return null;
}

/* ---------------- views ---------------- */
const TABS = [['today', 'Today'], ['overview', 'Overview'], ['samples', 'Samples'], ['exps', 'Experiments'], ['protocols', 'Protocols'],
  ['reagents', 'Reagents'], ['targets', 'Targets'], ['plan', 'Study plan'], ['duties', 'Lab duties'], ['access', 'Lab and access']];
const empty = (title, text) => `<div class="empty"><b>${e(title)}</b>${e(text)}</div>`;
const card = (title, body) => `<div class="card"><h2>${e(title)}</h2>${body}</div>`;
const soon = '<span class="flag warn">Next build</span>';
const needProject = () => S.projects.length ? null : empty('No project yet', 'Create a project under Lab and access, then it appears here.');

const V = {};
V.today = () => `<div class="cols"><div class="stack">
  ${card('On the bench now', '<div class="hint">Nothing is running. Bench sessions are started from Experiments, by ticking the samples.</div>')}
 </div><div class="stack">
  ${card('What fits while you wait', '<div class="hint">Nothing outstanding yet. Once experiments are planned, tasks that fit your free time show here.</div>')}
  ${card('Backlog', '<div class="hint">No unfinished tasks.</div>')}
  ${card("This week's target", '<div class="hint">No target agreed for this week.</div>')}
 </div></div>`;
V.overview = () => needProject() || `<div class="line"><h2 class="grow">${e(proj().name)}: every sample against every experiment</h2></div>
  ${empty('No samples or experiments yet', 'Add samples and experiments to this project under Study plan. The grid fills in as runs are finished.')}`;
V.samples = () => needProject() || `<div class="split"><div class="pane-list"><input type="search" placeholder="Search samples" aria-label="Search samples" disabled>
  <div class="hint">No samples in ${e(proj().name)}.</div></div><div class="pane-detail">Pick a sample on the left to open its record: every experiment, protocol version, deviation and result file.</div></div>`;
V.exps = () => needProject() || `<div class="split"><div class="pane-list"><div class="hint">No experiments in ${e(proj().name)}.</div></div>
  <div class="pane-detail">Pick an experiment to see which samples are done, on the bench or still to do, and start a bench session.</div></div>`;
V.protocols = () => `<div class="line"><h2 class="grow">Lab protocol library</h2>${soon}</div>
  ${empty('No protocols yet', 'Protocols are built from blocks (wash, incubation, other), with check boxes, variants numbered V1.1, V1.1.1, V1.2.0 and revisions. Every lab member shares this library.')}`;
V.reagents = () => `<div class="line"><h2 class="grow">Reagents</h2>${soon}</div>
  ${empty('No reagents yet', 'Stock is counted down from finished protocol steps, with a warning when a reagent runs low.')}`;
V.targets = () => `<div class="line"><h2 class="grow">Weekly targets</h2>${soon}</div>
  ${empty('No targets yet', 'Pick exact samples per week, up to 6 months ahead, for Prof Kaur to agree. Progress bars show on track, behind or ahead.')}`;
V.plan = () => needProject() || `<div class="line"><h2 class="grow">Study plan: ${e(proj().name)}</h2>${soon}</div>
  <div class="cols even">${card('Samples', '<div class="hint">No samples yet. This will be a free list, with a button to add a mouse.</div>')}
  ${card('Experiments', '<div class="hint">No experiments yet. Each comes from a lab protocol, with genes or proteins set for this study.</div>')}</div>
  ${empty('Assignment grid', 'Once there are samples and experiments, tick which sample gets which experiment here.')}`;
V.duties = () => `<div class="line"><h2 class="grow">Lab duties</h2>${soon}</div>
  <div class="cols even">${card('This month', '<div class="hint">No duties yet. Duties are dealt out fairly each month: every month, as needed, or once-off, with the number of people needed.</div>')}
  ${card('Requests', '<div class="hint">No requests.</div>')}</div>`;
V.access = () => {
  const L = S.lab, canLab = isAdmin() || isSup();
  const people = [...new Set([...(L.supervisors || []), ...(L.admins || []), ...(L.members || [])])].sort();
  const pRow = em => `<div class="row"><span class="nm grow">${e(nameOf(em))}</span><span class="sm muted mono">${e(em)}</span>${flag(roleOf(em) === 'Supervisor' ? 'info' : roleOf(em) === 'Admin' ? 'ok' : '', roleOf(em))}
    ${canLab && em !== me() && !(L.supervisors || []).includes(em) && !(L.admins || []).includes(em) ? `<button class="btn sm" data-a="rmMember" data-em="${e(em)}">Remove</button>` : ''}</div>`;
  const projCard = p => {
    const canEdit = isSup() || (p.members || []).includes(me());
    return `<div class="card"><div class="line"><h2 class="grow">${e(p.name)}</h2>${p.id === S.project ? flag('info', 'Selected') : `<button class="btn sm" data-a="pickProj" data-id="${e(p.id)}">Open</button>`}</div>
    ${p.desc ? `<div class="sm muted">${e(p.desc)}</div>` : ''}
    <div class="chips">${(p.members || []).map(em => `<span class="chip">${e(nameOf(em))}${canEdit && (p.members || []).length > 1 ? `<button data-a="rmProjMember" data-id="${e(p.id)}" data-em="${e(em)}" aria-label="Remove ${e(em)} from ${e(p.name)}">×</button>` : ''}</span>`).join('')}</div>
    <div class="sm muted">Prof Kaur and any other supervisor see this project without being listed.</div>
    ${canEdit ? `<div class="line"><select data-c="projAdd" data-id="${e(p.id)}" aria-label="Add a lab member to ${e(p.name)}"><option value="">Add a lab member…</option>${people.filter(em => !(p.members || []).includes(em)).map(em => `<option value="${e(em)}">${e(nameOf(em))}</option>`).join('')}</select>
      ${isSup() ? `<span class="sp"></span><button class="btn sm" data-a="delProj" data-id="${e(p.id)}">Delete project</button>` : ''}</div>` : ''}</div>`;
  };
  return `<div class="cols even"><div class="stack">
    <div class="card"><h2>${e(L.name || 'The lab')}</h2>
      <div class="hint">Supervisors see every project. Admins manage who is in the lab. Members see only their own projects.</div>
      <div class="list">${people.map(pRow).join('')}</div>
      ${canLab ? `<div class="line"><input type="email" id="newMember" class="grow" placeholder="Wits email of a lab member" aria-label="Wits email of a new lab member">
        <select id="newRole" aria-label="Role"><option value="members">Member</option>${isSup() || isAdmin() ? '<option value="supervisors">Supervisor</option>' : ''}</select>
        <button class="btn pri" data-a="addMember">Add</button></div><span class="err" id="memberErr"></span>` : ''}
    </div></div><div class="stack">
    <div class="card"><h2>New project</h2>
      <div class="line"><input type="text" id="projName" class="grow" placeholder="Project name, e.g. BCMS Phase II" aria-label="Project name"></div>
      <div class="line"><input type="text" id="projDesc" class="grow" placeholder="Short description (optional)" aria-label="Project description"></div>
      <div class="line"><button class="btn pri" data-a="newProj">Create project</button><span class="hint">You are added as its first member.</span></div></div>
    ${S.projects.length ? S.projects.map(projCard).join('') : '<div class="hint">No projects yet.</div>'}
  </div></div>`;
};

function render() {
  const g = gateView();
  if (g) { $('#app').innerHTML = g; return; }
  const p = proj();
  $('#app').innerHTML = `<div class="top"><span class="brand">Lab Bench Tracker</span>
    ${S.projects.length ? `<label class="fld" for="projSel">Project</label><select id="projSel" data-c="proj">${S.projects.map(x => `<option value="${e(x.id)}" ${x.id === S.project ? 'selected' : ''}>${e(x.name)}</option>`).join('')}</select>` : ''}
    <span class="sp"></span><span class="sm">${e(S.user.displayName || me())}</span>${flag(isSup() ? 'info' : isAdmin() ? 'ok' : '', roleOf(me()))}
    <button class="btn sm" data-a="signout">Sign out</button></div>
    <nav class="tabs" role="tablist">${TABS.map(([k, t]) => `<button class="tab ${S.tab === k ? 'on' : ''}" role="tab" aria-selected="${S.tab === k}" data-a="tab" data-k="${k}">${t}</button>`).join('')}</nav>
    <section class="stack">${V[S.tab]()}</section>`;
}

/* ---------------- actions ---------------- */
const labRef = () => doc(db, 'config', 'lab');
const A = {
  signin: doSignIn,
  signout: doSignOut,
  tab: b => { S.tab = b.dataset.k; render(); },
  pickProj: b => { S.project = b.dataset.id; render(); },
  async setupLab() {
    const sup = low($('#supEmail').value), name = $('#labName').value.trim() || 'Kaur lab';
    if (!WITS.test(sup)) return $('#setupErr').textContent = "Enter Prof Kaur's Wits email address.";
    try { await setDoc(labRef(), { name, admins: [me()], members: [me()], supervisors: [sup], createdAt: serverTimestamp(), createdBy: me() }); toast('Lab set up.'); }
    catch (err) { $('#setupErr').textContent = errMsg(err); }
  },
  async addMember() {
    const em = low($('#newMember').value), role = $('#newRole').value;
    if (!WITS.test(em)) return $('#memberErr').textContent = 'Enter a Wits email address.';
    try { await updateDoc(labRef(), { [role]: arrayUnion(em), members: arrayUnion(em) }); toast(em + ' added.'); }
    catch (err) { $('#memberErr').textContent = errMsg(err); }
  },
  async rmMember(b) {
    try { await updateDoc(labRef(), { members: arrayRemove(b.dataset.em) }); toast(b.dataset.em + ' removed from the lab.'); }
    catch (err) { toast(errMsg(err)); }
  },
  async newProj() {
    const name = $('#projName').value.trim(); if (!name) return toast('Give the project a name.');
    try { const r = await addDoc(collection(db, 'projects'), { name, desc: $('#projDesc').value.trim(), members: [me()], createdBy: me(), createdAt: serverTimestamp() }); S.project = r.id; toast('Project created.'); }
    catch (err) { toast(errMsg(err)); }
  },
  async rmProjMember(b) {
    try { await updateDoc(doc(db, 'projects', b.dataset.id), { members: arrayRemove(b.dataset.em) }); }
    catch (err) { toast(errMsg(err)); }
  },
  async delProj(b) {
    const p = S.projects.find(x => x.id === b.dataset.id);
    if (!p || prompt(`Type the project name to delete it: ${p.name}`) !== p.name) return;
    try { await deleteDoc(doc(db, 'projects', p.id)); toast('Project deleted.'); }
    catch (err) { toast(errMsg(err)); }
  },
};
document.addEventListener('click', ev => { const b = ev.target.closest('[data-a]'); if (b && A[b.dataset.a]) { ev.preventDefault(); A[b.dataset.a](b); } });
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset.c === 'proj') { S.project = t.value; render(); }
  if (t.dataset.c === 'projAdd' && t.value) {
    try { await updateDoc(doc(db, 'projects', t.dataset.id), { members: arrayUnion(t.value) }); } catch (err) { toast(errMsg(err)); }
  }
});
render();
