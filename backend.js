// Firebase layer for Lab Bench Tracker: sign-in, live reads and batched writes.
// app.js talks only to this file, so the rest of the app has no Firebase calls in it.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut }
  from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, onSnapshot,
  query, where, writeBatch, deleteField, serverTimestamp, terminate, clearIndexedDbPersistence }
  from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Local browser cache for fast loading; cleared on sign-out.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});

export const DEL = deleteField();          // value meaning "remove this field"
export const ts = () => serverTimestamp();

export const onAuth = cb => onAuthStateChanged(auth, u => cb(u && { uid: u.uid, email: u.email, displayName: u.displayName }));
export async function signIn() {
  await signInWithPopup(auth, new GoogleAuthProvider().setCustomParameters({ prompt: 'select_account' }));
}
export async function signOutAll() {
  await signOut(auth);
  // Clear the local cache so nothing from this account stays in the browser.
  try { await terminate(db); await clearIndexedDbPersistence(db); } catch (_) {}
}

// cb(data or null) for one document.
export const watchDoc = (path, cb, err) => onSnapshot(doc(db, path), s => cb(s.exists() ? s.data() : null), err);
// cb(Map of id -> data) for a collection; filter is [field, operator, value] or null.
export const watchCol = (path, filter, cb, err) => onSnapshot(
  filter ? query(collection(db, path), where(filter[0], filter[1], filter[2])) : collection(db, path),
  s => cb(new Map(s.docs.map(d => [d.id, d.data()]))), err);

// ops: [{op: 'set' | 'merge' | 'update' | 'delete', path, data}], applied together.
export async function commit(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    for (const o of ops.slice(i, i + 400)) {
      const r = doc(db, o.path);
      if (o.op === 'set') b.set(r, o.data);
      else if (o.op === 'merge') b.set(r, o.data, { merge: true });
      else if (o.op === 'update') b.update(r, o.data);
      else b.delete(r);
    }
    await b.commit();
  }
}
