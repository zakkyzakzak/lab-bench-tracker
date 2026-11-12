/**
 * Lab Bench Tracker: Google Drive.
 *
 * A second file in the same Apps Script project as Code.gs. Once switched on (menu Lab mail >
 * Switch on Google Drive) it:
 *   - keeps one folder per study inside a "Lab Bench Tracker" folder in the owner's Drive, shared as
 *     Editor with the study's members and the supervisors;
 *   - keeps a spreadsheet in each folder with a copy of what was typed into the tracker
 *     (monitoring, results, runs, samples), refreshed about every ten minutes;
 *   - receives files uploaded from the tracker (the web app at the bottom) and files them there;
 *   - hands a study's folder and its contents to a new owner when an admin asks for that.
 *
 * Files are created by, and belong to, the Google account that owns this script.
 */
const ROOT_NAME = 'Lab Bench Tracker';
const WEB_KEY = 'AIzaSyAIdI0mTSnB4Y-l-VWGqrrgXrow_fbby9c';   // the tracker's public web key (the same one in config.js), used to check who is uploading
const MAX_UPLOAD = 25 * 1024 * 1024;
const NO_EXT = /\.(exe|msi|bat|cmd|com|scr|js|vbs|ps1|jar|sh|html?|svg)$/i;   // never stored: programs and pages

function driveSetup() {
  DriveApp.getRootFolder();                                   // asks for Drive permission here if it is missing
  PropertiesService.getScriptProperties().setProperty('drive', 'on');
  PropertiesService.getScriptProperties().deleteProperty('driveAt');
  driveSync_();
  SpreadsheetApp.getUi().alert('Google Drive is on.\n\nEach study now has a folder inside "' + ROOT_NAME + '" in your Drive, shared with its members.\n\nFor uploads from the tracker, deploy this script as a web app (see SETUP.md, section 7) and paste its address into the tracker under Lab and access.');
}
function driveOff() {
  PropertiesService.getScriptProperties().deleteProperty('drive');
  SpreadsheetApp.getUi().alert('Google Drive is off. Folders and files stay where they are; nothing new is created or updated.');
}
function driveOn_() { return PropertiesService.getScriptProperties().getProperty('drive') === 'on'; }

/** Called from run() every minute. Ownership requests are answered at once; folders and sheets about every ten minutes. */
function drive_() {
  if (!driveOn_()) return;
  owners_();
  const props = PropertiesService.getScriptProperties(), last = Number(props.getProperty('driveAt') || 0);
  if (Date.now() - last < 10 * 60000) return;
  props.setProperty('driveAt', String(Date.now()));
  driveSync_();
}

/* ---------- reading the database ---------- */
function dec_(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec_);
  if ('mapValue' in v) return obj_(v.mapValue.fields);
  return null;
}
function obj_(f) { const o = {}; Object.keys(f || {}).forEach(function (k) { o[k] = dec_(f[k]); }); return o; }
function docs_(path) {
  const out = []; let tok = '';
  do {
    const r = fs_('get', path + '?pageSize=300' + (tok ? '&pageToken=' + encodeURIComponent(tok) : '')) || {};
    (r.documents || []).forEach(function (d) { out.push({ id: d.name.split('/').pop(), data: obj_(d.fields) }); });
    tok = r.nextPageToken || '';
  } while (tok);
  return out;
}
function lab_() { return obj_((fs_('get', '/config/lab') || {}).fields); }
function setDrive_(projId, drive) {
  const f = {}; Object.keys(drive).forEach(function (k) { f[k] = { stringValue: String(drive[k]) }; });
  fs_('patch', '/projects/' + encodeURIComponent(projId) + '?updateMask.fieldPaths=drive&currentDocument.exists=true', { fields: { drive: { mapValue: { fields: f } } } });
}

/* ---------- folders and sharing ---------- */
function root_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('root');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (err) {} }
  const f = DriveApp.createFolder(ROOT_NAME); props.setProperty('root', f.getId()); return f;
}
function safeName_(s) { return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled'; }
/** The study's folder, made if it does not exist yet. Returns { folder, drive } where drive is what the tracker stores. */
function folder_(proj) {
  let drive = proj.data.drive || {}, folder = null;
  if (drive.id) { try { folder = DriveApp.getFolderById(drive.id); if (folder.isTrashed()) folder = null; } catch (err) { folder = null; } }
  if (!folder) { folder = root_().createFolder(safeName_(proj.data.name)); drive = { id: folder.getId(), url: folder.getUrl() }; setDrive_(proj.id, drive); }
  return { folder: folder, drive: drive };
}
function share_(folder, proj, lab) {
  const me = Session.getEffectiveUser().getEmail().toLowerCase(), have = {};
  folder.getEditors().forEach(function (u) { have[u.getEmail().toLowerCase()] = true; });
  try { have[folder.getOwner().getEmail().toLowerCase()] = true; } catch (err) {}
  (proj.data.members || []).concat(lab.supervisors || []).forEach(function (em) {
    em = String(em || '').toLowerCase();
    if (!em || em === me || have[em] || !WITS.test(em)) return;
    try { folder.addEditor(em); have[em] = true; } catch (err) { console.error('Could not share ' + proj.data.name + ' with ' + em + ': ' + (err.message || err)); }
  });
}

/* ---------- the data sheet ---------- */
function tab_(ss, name, head, rows) {
  let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name);
  sh.clearContents();
  const all = [head].concat(rows.map(function (r) { return r.map(function (c) { return typeof c === 'string' ? cell_(c) : (c == null ? '' : c); }); }));
  sh.getRange(1, 1, all.length, head.length).setValues(all);
  sh.setFrozenRows(1); sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
}
function day_(ms) { return ms ? new Date(ms) : ''; }
function mirror_(proj, folder, drive) {
  const base = '/projects/' + encodeURIComponent(proj.id), p = proj.data;
  const exps = {}; docs_(base + '/exps').forEach(function (x) { exps[x.id] = x.data; });
  const sessions = docs_(base + '/sessions'), obs = docs_(base + '/obs'), asg = docs_(base + '/asg');
  const groupOf = {}; (p.samples || []).forEach(function (m) { groupOf[m.id] = m.group || ''; groupOf[String(m.id).split(' ')[0]] = groupOf[String(m.id).split(' ')[0]] || m.group || ''; });

  const mon = [];
  obs.sort(function (a, b) { return a.id < b.id ? -1 : 1; }).forEach(function (d) {
    Object.keys(d.data).filter(function (k) { return k !== 'proj'; }).sort().forEach(function (an) {
      const o = d.data[an] || {}, v = o.v || [], vol = v.length === 3 && v[0] > 0 && v[1] > 0 && v[2] > 0 ? v[0] * v[1] * v[2] / 2 : '';
      mon.push([d.id, an, groupOf[an] || '', o.w || '', o.wn || '', v[0] || '', v[1] || '', v[2] || '', vol, o.vn || '', o.tx === true ? 'Yes' : o.tx === false ? 'No' : '', o.c || '']);
    });
  });
  const runs = [], res = [];
  sessions.sort(function (a, b) { return (a.data.startedAt || 0) - (b.data.startedAt || 0); }).forEach(function (s) {
    const d = s.data, xn = (exps[d.exp] || {}).name || d.pname || '';
    (d.mice || []).forEach(function (m) {
      runs.push([xn, d.target || '', m, groupOf[m] || '', d.doneAt ? 'Done' : 'On the bench', day_(d.startedAt), day_(d.doneAt), d.by || '', (d.pname || '') + ' ' + (d.label || ''), d.rev || '']);
      const r = (d.res || {})[m] || {};
      Object.keys(r).sort().forEach(function (f) { res.push([xn, d.target || '', m, groupOf[m] || '', f, r[f], day_(d.doneAt || d.startedAt), d.by || '']); });
    });
  });
  const plan = [];
  asg.forEach(function (a) { (a.data.k || []).forEach(function (k) { const i = String(k).indexOf('|'); plan.push([(exps[a.id] || {}).name || '', String(k).slice(0, i), String(k).slice(i + 1)]); }); });

  const sig = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify([mon, runs, res, plan, p.samples || []])));
  const props = PropertiesService.getScriptProperties(), key = 'sig:' + proj.id;
  let ss = null;
  if (drive.sheet) { try { ss = SpreadsheetApp.openById(drive.sheet); } catch (err) { ss = null; } }
  if (ss && props.getProperty(key) === sig) return;                                  // nothing has changed since the last copy
  if (!ss) {
    ss = SpreadsheetApp.create(safeName_(p.name) + ' data (from Lab Bench Tracker)');
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    drive.sheet = ss.getId(); drive.sheetUrl = ss.getUrl(); setDrive_(proj.id, drive);
  }
  tab_(ss, 'Read me', ['This spreadsheet is a copy of what has been typed into the Lab Bench Tracker for ' + p.name + '. It is rewritten about every ten minutes, so do not edit it here: changes are lost. Add your own tabs or make a copy if you want to work on the numbers.'], [['Last copied', new Date()]]);
  tab_(ss, 'Monitoring', ['Date', 'Animal', 'Group', 'Weight (g)', 'Weight note', 'Length (mm)', 'Width (mm)', 'Height (mm)', 'Volume (mm3)', 'Tumour note', 'Treated', 'Comment'], mon);
  tab_(ss, 'Results', ['Experiment', 'Round or target', 'Sample', 'Group', 'Value', 'Result', 'Date', 'By'], res);
  tab_(ss, 'Runs', ['Experiment', 'Round or target', 'Sample', 'Group', 'Status', 'Started', 'Finished', 'By', 'Protocol', 'Revision'], runs);
  tab_(ss, 'Plan', ['Experiment', 'Round or target', 'Sample'], plan);
  tab_(ss, 'Samples', ['Sample', 'Group'], (p.samples || []).map(function (m) { return [m.id, m.group || '']; }));
  const first = ss.getSheetByName('Sheet1'); if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
  props.setProperty(key, sig);
}

function driveSync_() {
  const lab = lab_();
  docs_('/projects').forEach(function (proj) {
    try { const f = folder_(proj); share_(f.folder, proj, lab); mirror_(proj, f.folder, f.drive); }
    catch (err) { console.error('Drive, ' + proj.data.name + ': ' + (err.message || err)); }
  });
}

/* ---------- handing a study's folder to a new owner ---------- */
function owners_() {
  const reqs = docs_('/driveRequests'); if (!reqs.length) return;
  const lab = lab_(), boss = (lab.admins || []).concat(lab.supervisors || []).map(function (x) { return String(x).toLowerCase(); });
  reqs.forEach(function (r) {
    try { fs_('delete', '/driveRequests/' + encodeURIComponent(r.id)); } catch (err) { if (err.code !== 404) throw err; }
    const q = r.data, to = String(q.to || '').toLowerCase();
    let msg = '';
    try {
      if (boss.indexOf(String(q.by || '').toLowerCase()) < 0) throw new Error('only an admin or supervisor can ask for this');
      if (!WITS.test(to)) throw new Error('the new owner must have a Wits address');
      const proj = { id: q.proj, data: obj_((fs_('get', '/projects/' + encodeURIComponent(q.proj)) || {}).fields) };
      const f = folder_(proj); let n = 0;
      (function walk(folder) {
        const files = folder.getFiles(); while (files.hasNext()) { files.next().setOwner(to); n++; }
        const subs = folder.getFolders(); while (subs.hasNext()) walk(subs.next());
        folder.setOwner(to);
      })(f.folder);
      f.drive.owner = to; msg = 'Handed to ' + to + ' on ' + Utilities.formatDate(new Date(), 'Africa/Johannesburg', 'd MMM yyyy') + ' (' + n + ' files). You keep Editor access.';
      f.drive.ownerMsg = msg; setDrive_(proj.id, f.drive);
    } catch (err) {
      msg = 'The folder could not be handed over: ' + String(err.message || err).slice(0, 200);
      try { const p2 = obj_((fs_('get', '/projects/' + encodeURIComponent(q.proj)) || {}).fields), d = p2.drive || {}; d.ownerMsg = msg; if (d.id) setDrive_(q.proj, d); } catch (e2) {}
    }
    sheet_().appendRow(['drive', cell_(to), cell_(msg), cell_(q.by || ''), new Date(), /^Handed/.test(msg) ? 'sent' : 'failed', '', '', 1]);
  });
}

/* ---------- uploads from the tracker (web app) ---------- */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
/** Who is calling: the tracker sends the person's sign-in token, and Google says whose it is. */
function whoIs_(token) {
  const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + WEB_KEY, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify({ idToken: String(token || '') }) });
  if (res.getResponseCode() >= 300) throw new Error('your sign-in could not be checked; sign out and in again');
  const u = (JSON.parse(res.getContentText()).users || [])[0];
  if (!u || !u.email || !u.emailVerified) throw new Error('your sign-in could not be checked');
  return String(u.email).toLowerCase();
}
function doGet() { return json_({ ok: true, service: 'Lab Bench Tracker uploads' }); }
function doPost(e) {
  try {
    if (!driveOn_()) throw new Error('Google Drive is switched off in the mail sheet');
    const q = JSON.parse(e.postData.contents), who = whoIs_(q.token), lab = lab_();
    const inLab = (lab.members || []).concat(lab.admins || [], lab.supervisors || []).map(function (x) { return String(x).toLowerCase(); });
    if (inLab.indexOf(who) < 0) throw new Error('you are not in the lab');
    const proj = { id: String(q.project || ''), data: obj_((fs_('get', '/projects/' + encodeURIComponent(String(q.project || ''))) || {}).fields) };
    const isSup = (lab.supervisors || []).map(function (x) { return String(x).toLowerCase(); }).indexOf(who) >= 0;
    if (!isSup && (proj.data.members || []).map(function (x) { return String(x).toLowerCase(); }).indexOf(who) < 0) throw new Error('you are not in this study');
    const name = safeName_(q.name); if (NO_EXT.test(name)) throw new Error('that kind of file cannot be stored');
    const bytes = Utilities.base64Decode(String(q.data || '')); if (!bytes.length) throw new Error('the file was empty'); if (bytes.length > MAX_UPLOAD) throw new Error('the file is larger than 25 MB');
    let dir = folder_(proj).folder;
    String(q.path || '').split('/').map(safeName_).filter(function (s) { return s && s !== 'Untitled'; }).slice(0, 3).forEach(function (part) {
      const it = dir.getFoldersByName(part); dir = it.hasNext() ? it.next() : dir.createFolder(part);
    });
    const file = dir.createFile(Utilities.newBlob(bytes, String(q.type || 'application/octet-stream'), name));
    file.setDescription('Uploaded from Lab Bench Tracker by ' + who);
    return json_({ ok: true, url: file.getUrl(), id: file.getId(), name: name });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err).slice(0, 300) });
  }
}
