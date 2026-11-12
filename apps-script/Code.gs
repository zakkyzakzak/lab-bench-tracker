/**
 * Lab Bench Tracker: email notices.
 *
 * Lives in a Google Sheet owned by the lab admin. Every minute it:
 *   1. collects new notices from the tracker's database into the "Mail queue" sheet (status "pending");
 *   2. emails every pending row from this Google account, marks the row "sent", and tells the
 *      database the notice was emailed (the tracker shows that on the admin's test button).
 * The Status column is the memory: a row is only ever sent once, and a failed send is retried.
 *
 * It also answers requests for a sign-in link (for people whose Wits address has no Google account):
 * the sign-in screen leaves a request in the database, and this script makes the link and emails it,
 * but only to an address that is already in the lab.
 *
 * There is no web address to call: the script only reaches out, so nobody else can make it send mail.
 */
const PROJECT = 'lab-bench-tracker';
const SITE = 'https://zakkyzakzak.github.io/lab-bench-tracker/';
const SHEET = 'Mail queue';
const HEAD = ['Notice ID', 'To', 'Message', 'From', 'Created', 'Status', 'Sent at', 'Problem', 'Tries'];
const COL = { id: 0, to: 1, text: 2, by: 3, at: 4, status: 5, sent: 6, err: 7, tries: 8 };
const WITS = /^[^@\s,;]+@(students\.)?wits\.ac\.za$/i;   // only Wits addresses are ever emailed
const MAX_TRIES = 5, PER_RUN = 50;
const SITES = [SITE, 'https://lab-bench-tracker.web.app/'];   // the only places a sign-in link may lead back to
const LINK_WAIT_MIN = 3, LINK_MAX_AGE_MIN = 15;
const DOCS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Lab mail')
    .addItem('Set up and switch on', 'setup')
    .addItem('Check for mail now', 'run')
    .addItem('Switch off', 'stop')
    .addSeparator()
    .addItem('Switch on Google Drive', 'driveSetup')
    .addItem('Switch off Google Drive', 'driveOff')
    .addToUi();
}

/** One-time: makes the queue sheet, checks the database can be read, starts the every-minute timer. */
function setup() {
  sheet_();
  fs_('get', '/config/lab');                       // fails loudly here if database access is not set up
  stop_();
  ScriptApp.newTrigger('run').timeBased().everyMinutes(1).create();
  SpreadsheetApp.getUi().alert('Email notices are on. The tracker is checked every minute.\n\nIn the tracker, open Lab and access and press "Send me a test email".');
}
function stop() { stop_(); SpreadsheetApp.getUi().alert('Email notices are off. Nothing is sent until you set up again.'); }
function stop_() { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'run') ScriptApp.deleteTrigger(t); }); }

/** Runs every minute (and from the menu). */
function run() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;                 // the previous run is still going
  try {
    try { links_(); } catch (err) { console.error('Sign-in links: ' + (err.message || err)); }   // must never hold up the notices
    pull_(); send_();
    try { drive_(); } catch (err) { console.error('Drive: ' + (err.message || err)); }             // Drive.gs; does nothing until switched on
  } finally { lock.releaseLock(); }
}

function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) sh = ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) { sh.appendRow(HEAD); sh.setFrozenRows(1); sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold'); }
  return sh;
}

/** Calls the database as the person who owns this script (the Firebase project owner). */
function fs_(method, path, payload) {
  const res = UrlFetchApp.fetch(DOCS + path, {
    method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: payload ? JSON.stringify(payload) : undefined,
  });
  const code = res.getResponseCode(), body = res.getContentText();
  if (code >= 300) { const err = new Error('The database answered ' + code + ': ' + body.slice(0, 300)); err.code = code; throw err; }
  return body ? JSON.parse(body) : null;
}
function val_(f) { if (!f) return ''; if ('stringValue' in f) return f.stringValue; if ('integerValue' in f) return Number(f.integerValue); if ('doubleValue' in f) return f.doubleValue; return ''; }
/** Text from the tracker must never be read by Sheets as a formula. */
function cell_(s) { s = String(s == null ? '' : s); return /^[=+\-@]/.test(s) ? "'" + s : s; }

/** Sign-in links: answer each request once, only for people already in the lab. */
function links_() {
  const found = fs_('get', '/signinRequests?pageSize=20');
  const docs = (found && found.documents) || [];
  if (!docs.length) return;
  const lab = fs_('get', '/config/lab').fields || {}, inLab = {};
  ['members', 'admins', 'supervisors'].forEach(function (k) {
    ((lab[k] && lab[k].arrayValue && lab[k].arrayValue.values) || []).forEach(function (v) { inLab[String(v.stringValue || '').toLowerCase()] = true; });
  });
  const props = PropertiesService.getScriptProperties(), sh = sheet_();
  docs.forEach(function (d) {
    const id = d.name.split('/').pop(), f = d.fields || {}, email = String(val_(f.email)).trim().toLowerCase(), made = new Date(d.createTime);
    try { fs_('delete', '/signinRequests/' + encodeURIComponent(id)); } catch (err) { if (err.code !== 404) throw err; }   // removed first, so it is never answered twice
    const log = function (status, problem) { sh.appendRow(['sign-in link', cell_(email), 'Sign-in link requested', '', made, status, status === 'sent' ? new Date() : '', problem, 1]); };
    if (!WITS.test(email)) return log('skipped', 'Not a Wits address');
    if (Date.now() - made.getTime() > LINK_MAX_AGE_MIN * 60000) return log('skipped', 'Request was too old');
    if (!inLab[email]) return log('skipped', 'Not in the lab');
    const key = 'link:' + email, lastSent = Number(props.getProperty(key) || 0);
    if (Date.now() - lastSent < LINK_WAIT_MIN * 60000) return log('skipped', 'A link was sent less than ' + LINK_WAIT_MIN + ' minutes ago');
    if (MailApp.getRemainingDailyQuota() < 1) return log('failed', 'Daily email limit reached');
    try {
      const want = String(val_(f.site)), back = SITES.filter(function (s) { return want.indexOf(s) === 0; })[0] || SITE;
      const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:sendOobCode', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        payload: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email: email, continueUrl: back, canHandleCodeInApp: true, returnOobLink: true }),
      });
      const body = res.getContentText(), link = res.getResponseCode() < 300 ? JSON.parse(body).oobLink : '';
      if (!link) throw new Error('Google answered ' + res.getResponseCode() + ': ' + body.slice(0, 200));
      MailApp.sendEmail({
        to: email, name: 'Lab Bench Tracker', subject: 'Lab Bench Tracker: your sign-in link',
        body: 'Here is your sign-in link for the Lab Bench Tracker:\n\n' + link + '\n\nOpen it in the browser you want to use the tracker in. If it asks for your email address, type ' + email + '. The link works once and stops working after a few hours.\n\nIf you were not expecting this, ignore this email: nobody can sign in without it.\n\nThis message was sent automatically by the Kaur lab tracker.',
      });
      props.setProperty(key, String(Date.now()));
      log('sent', '');                                   // the link itself is never written to the sheet
    } catch (err) { log('failed', String(err.message || err).slice(0, 200)); }
  });
  SpreadsheetApp.flush();
}

/** Step 1: copy notices that have not been emailed yet into the sheet, once each. */
function pull_() {
  const sh = sheet_();
  const found = fs_('post', ':runQuery', { structuredQuery: {
    from: [{ collectionId: 'notices' }],
    where: { unaryFilter: { field: { fieldPath: 'mailedAt' }, op: 'IS_NULL' } },
    limit: PER_RUN,
  } }) || [];
  const docs = found.filter(function (r) { return r.document; });
  if (!docs.length) return;
  const last = sh.getLastRow();
  const have = {}; if (last > 1) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { have[r[0]] = true; });
  const rows = [];
  docs.forEach(function (r) {
    const id = r.document.name.split('/').pop(), f = r.document.fields || {};
    if (have[id]) return;
    const at = val_(f.at);
    rows.push([id, cell_(val_(f.to)), cell_(val_(f.text)), cell_(val_(f.by)), at ? new Date(at) : new Date(), 'pending', '', '', 0]);
  });
  if (rows.length) { sh.getRange(last + 1, 1, rows.length, HEAD.length).setValues(rows); SpreadsheetApp.flush(); }
}

/** Step 2: send every pending row, then record that it went. */
function send_() {
  const sh = sheet_(), last = sh.getLastRow();
  if (last < 2) return;
  const data = sh.getRange(2, 1, last - 1, HEAD.length).getValues();
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (r[COL.status] !== 'pending') continue;
    const row = i + 2, to = String(r[COL.to]).trim(), text = String(r[COL.text]);
    const set = function (status, sent, err, tries) { sh.getRange(row, COL.status + 1, 1, 4).setValues([[status, sent, err, tries]]); SpreadsheetApp.flush(); };
    if (!WITS.test(to)) { set('skipped', '', 'Not a Wits address', r[COL.tries]); mark_(r[COL.id]); continue; }
    if (MailApp.getRemainingDailyQuota() < 1) return;      // Google's daily limit reached: carry on tomorrow
    try {
      MailApp.sendEmail({
        to: to, name: 'Lab Bench Tracker',
        subject: 'Lab Bench Tracker: ' + (text.length > 70 ? text.slice(0, 67) + '...' : text),
        body: text + '\n\nOpen the tracker: ' + SITE + '\nSign in with ' + to + ': with Google, or ask for a sign-in link on the sign-in screen.\n\nThis message was sent automatically by the Kaur lab tracker.',
      });
    } catch (err) {
      const tries = Number(r[COL.tries] || 0) + 1;
      set(tries >= MAX_TRIES ? 'failed' : 'pending', '', String(err.message || err).slice(0, 200), tries);
      if (tries >= MAX_TRIES) mark_(r[COL.id]);
      continue;
    }
    set('sent', new Date(), '', Number(r[COL.tries] || 0) + 1);   // written before anything else, so it can never go twice
    mark_(r[COL.id]);
  }
}

/** Tell the database this notice has been dealt with; remove it if its reader already cleared it. */
function mark_(id) {
  try {
    const doc = fs_('patch', '/notices/' + encodeURIComponent(id) + '?updateMask.fieldPaths=mailedAt&currentDocument.exists=true',
      { fields: { mailedAt: { integerValue: String(Date.now()) } } });
    if (doc && doc.fields && doc.fields.cleared && !('nullValue' in doc.fields.cleared)) fs_('delete', '/notices/' + encodeURIComponent(id));
  } catch (err) {
    if (err.code !== 404 && err.code !== 400 && err.code !== 409) throw err;   // the notice was deleted in the meantime: nothing to mark
  }
}
