import { LAB_OWNER } from '../config.js';
// Lab Bench Tracker: small helpers, the in-memory state (DB and S), people and roles,
// and V, the list of screens that each area adds its own tab to.


export const $ = s => document.querySelector(s);
export const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const low = s => String(s || '').trim().toLowerCase();
export const WITS = /@(students\.)?wits\.ac\.za$/i;
export const DAY = 864e5, MIN = 6e4, now = () => Date.now();
export function wkStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
export const WK = wkStart(now());
export const dur = m => { if (m > 0 && m < 1) return Math.round(m * 60) + ' s'; m = Math.max(0, Math.round(m)); if (m >= 2880 && m % 1440 === 0) return m / 1440 + ' days'; return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''); };
export const dt = t => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
export const wkLabel = w => dt(w) + ' to ' + dt(w + 6 * DAY);
export const flag = (k, t) => `<span class="flag ${k}">${e(t)}</span>`;
export const nid = () => 'i' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const safeUrl = u => /^https?:\/\//i.test(u) ? u : '';
export function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => el.hidden = true, 4200); }
export const errMsg = err => (err && err.code === 'permission-denied') ? 'Not allowed: your account does not have permission for that.' : (err && err.message) || String(err);

/* ---------------- state ---------------- */
export const DB = { lab: null, projects: [], exps: [], sessions: [], files: [], targets: [], asg: new Set(), protocols: [], gone: [], progress: [], obs: [], animals: [], reagents: [], duties: [], rota: {}, dutyLog: [], requests: [], notices: [], backlog: [], places: [], items: [] };
export const S = { fb: null, user: '', ready: false, labErr: null, people: new Map(), tab: 'today', project: null, selMouse: null, mx: null, selExp: undefined, selTarget: '', picked: new Set(), selProto: null, selNode: null, viewRev: null, edit: null, openSession: null, freeMin: null, q: '', modal: null, variant: null, tpick: null, draft: null, planX: '', dOff: 0, addT: new Set(), addG: '', smOpen: false };
/* the plan being put together under Targets: two weeks from `week`; each item is { week, exp, target, mice, d: { sample: day 0-6 } } */
export const newDraft = () => ({ week: WK, items: [], pick: new Set(), exp: '', override: false }); S.draft = newDraft();
/* An NFC tag (or any link) that ends in #p=<place> opens the lab map at that place. It is remembered through
   sign-in, including a sign-in link that opens in a new tab, and followed once the lab's records have loaded. */
const GO = 'lbt-go';
export function readLink() {
  const m = /^#p=([\w-]{4,40})$/.exec(location.hash); if (!m) return false;
  S.go = m[1]; try { localStorage.setItem(GO, JSON.stringify({ p: m[1], at: Date.now() })); } catch (_) {}
  history.replaceState(null, '', location.pathname + location.search); return true;
}
export function followLink() {
  if (S.go === undefined) { S.go = null; try { const o = JSON.parse(localStorage.getItem(GO) || 'null'); if (o && Date.now() - o.at < 20 * 6e4) S.go = o.p; } catch (_) {} }
  if (!S.go) return false;
  S.tab = 'map'; S.place = S.go; S.pinning = false; S.go = null; try { localStorage.removeItem(GO); } catch (_) {}
  return true;
}
readLink();
/* things to do after every redraw (the lab map puts its 3D view back on the page this way) */
export const AFTER = [];

/* ---------------- people and roles ---------------- */
export const sups = () => DB.lab?.supervisors || [], admins = () => DB.lab?.admins || [];
export const isSup = () => sups().includes(S.user);
export const realAdmin = () => admins().includes(S.user);
export const isAdmin = () => realAdmin() && !S.asMember;   // an admin can switch to the member view to see what members see
export const isMember = () => !!DB.lab && (isSup() || realAdmin() || (DB.lab.members || []).includes(S.user));
export const canLab = () => isSup() || isAdmin();
/* who sees every study without being listed in it: supervisors, and the lab owner (not while looking at the member view) */
export const seesAll = () => isSup() || (S.user === LAB_OWNER && !S.asMember);
export const nameOf = em => S.people.get(em)?.name || em;
export const roleOf = em => sups().includes(em) ? 'Supervisor' : admins().includes(em) ? 'Admin' : 'Member';
export const allPeople = () => [...new Set([...sups(), ...admins(), ...(DB.lab?.members || [])])].sort();
/* users[email] gives a name for anyone, including people who have not signed in yet */
export const users = new Proxy({}, { get: (_, em) => ({ name: nameOf(em), role: roleOf(em), sup: sups().includes(em) }) });

export const V = {};
