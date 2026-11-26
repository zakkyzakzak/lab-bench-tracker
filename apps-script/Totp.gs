/**
 * Lab Bench Tracker: sign-in codes for the lab's shared BioRender account.
 *
 * A third file in the same Apps Script project as Code.gs and Drive.gs. The account's two-step
 * secret is kept in this script's properties (menu Lab mail > Set the BioRender code secret), never
 * in the tracker, the database or this file. The web app in Drive.gs hands the current 6-digit code
 * (RFC 6238: SHA-1, 30 seconds) to anyone signed in to the tracker who is in the lab, and writes
 * who asked, and when, to the "Sign-in codes" sheet. The secret itself is never sent anywhere.
 */
const CODE_SHEET = 'Sign-in codes';
const CODE_MAX_PER_10_MIN = 10;   // per person

function signed_(b) { return b > 127 ? b - 256 : b; }
function base32_(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', out = []; let bits = 0, val = 0;
  String(s || '').toUpperCase().replace(/[\s=-]/g, '').split('').forEach(function (c) {
    const i = A.indexOf(c); if (i < 0) throw new Error('the stored secret is not valid');
    val = ((val << 5) | i) & 0xfff; bits += 5;
    if (bits >= 8) { bits -= 8; out.push(signed_((val >>> bits) & 255)); }
  });
  if (out.length < 10) throw new Error('the stored secret is too short');
  return out;
}
/** The code for a secret at a moment (milliseconds), and how many seconds it has left. */
function totpFor_(secret, at) {
  const key = base32_(secret), now = Math.floor(at / 1000), msg = []; let c = Math.floor(now / 30);
  for (let i = 7; i >= 0; i--) { msg[i] = signed_(c % 256); c = Math.floor(c / 256); }
  const h = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, msg, key).map(function (b) { return b & 255; });
  const o = h[19] & 15, n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return { code: ('000000' + (n % 1000000)).slice(-6), left: 30 - now % 30 };
}

/** Called by doPost in Drive.gs once the caller is known to be in the lab. */
function totpGive_(who) {
  const secret = PropertiesService.getScriptProperties().getProperty('totpSecret');
  if (!secret) throw new Error('the BioRender code has not been set up in the mail sheet');
  const cache = CacheService.getScriptCache(), k = 'totp:' + who, n = Number(cache.get(k) || 0);
  if (n >= CODE_MAX_PER_10_MIN) throw new Error('too many codes asked for; wait ten minutes');
  cache.put(k, String(n + 1), 600);
  const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(CODE_SHEET);
  if (!sh) { sh = ss.insertSheet(CODE_SHEET); sh.appendRow(['When', 'Who']); sh.setFrozenRows(1); sh.getRange(1, 1, 1, 2).setFontWeight('bold'); }
  sh.appendRow([new Date(), who]);
  return totpFor_(secret, Date.now());
}

/** Menu: store or replace the secret. It is typed into a prompt, so it never sits in the code. */
function totpSet() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('BioRender code secret', 'Paste the secret key BioRender shows when two-step sign-in is set up (letters A to Z and digits 2 to 7). Leave it empty to remove the stored secret.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const s = r.getResponseText().replace(/[\s-]/g, '').toUpperCase(), props = PropertiesService.getScriptProperties();
  if (!s) { props.deleteProperty('totpSecret'); ui.alert('The secret has been removed. The tracker can no longer give codes.'); return; }
  try { base32_(s); } catch (err) { ui.alert('Not saved: ' + err.message + '.'); return; }
  props.setProperty('totpSecret', s);
  ui.alert('Saved. The code right now is ' + totpFor_(s, Date.now()).code + '.\n\nCheck that it matches your authenticator app before relying on it.');
}
/** Menu: proves the arithmetic against the published RFC 6238 example. */
function totpTest() {
  const got = totpFor_('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000).code;
  SpreadsheetApp.getUi().alert(got === '287082' ? 'The code generator is working (RFC 6238 example matched).' : 'The code generator is NOT working: got ' + got + ', expected 287082.');
}
