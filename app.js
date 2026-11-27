// Lab Bench Tracker: start-up.
// Everything on screen is drawn from DB, an in-memory copy of what this account may read in
// Firestore. Actions change DB, then commit() works out what changed and writes only that.
// No lab data lives in this repository: all records are in Firestore behind firestore.rules.
// The code is in js/, one file per area; this file loads them and starts sign-in.

import * as B from './backend.js';
import { S, WITS, low, toast } from './js/core.js';
import { rebuild, stopAll, subs, watch } from './js/sync.js';
import { render } from './js/render.js';
import { startWelcome } from './js/welcome.js';
import './js/reagents.js';
import './js/protocols.js';
import './js/runs.js';
import './js/targets.js';
import './js/today.js';
import './js/monitoring.js';
import './js/study.js';
import './js/animals.js';
import './js/lineage.js';
import './js/lab.js';
import './js/plan.js';
import './js/duties.js';
import './js/export.js';
import './js/modal.js';
import './js/actions.js';
import './js/map.js';

/* ---------------- sign-in ---------------- */
B.finishLink().then(r => { if (r && r.error) toast('That sign-in link has expired or was already used. Ask for a new one.'); });
S.fb = undefined;
B.onAuth(u => {
  stopAll(); S.fb = u || null; S.user = low(u?.email); rebuild();
  if (!u || !WITS.test(u.email || '')) return;
  // Keep a profile so other lab members see a name rather than an address.
  B.commit([{ op: 'merge', path: 'users/' + u.uid, data: { name: u.displayName || u.email, email: S.user, lastSeen: B.ts() } }]).catch(() => {});
  subs.push(watch('lab', 'config/lab', true));
  startWelcome(u);
  render();
});
render();
