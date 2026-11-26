// The welcome screen shown after sign-in while records load.

import { DB, S, WITS, e, isMember, now } from './core.js';
import { pending } from './sync.js';

/* ---------------- welcome ---------------- */
/* Shown every time the page loads signed in: a DNA strand draws itself while the lab loads, then unzips to show the page. */
let WEL = null;
function firstName(u) {
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const g = (u.displayName || '').trim().split(/\s+/)[0]; if (g && !g.includes('@') && /^\p{L}/u.test(g)) return g;
  const m = /^([a-z]+)[._-]/i.exec(u.email || ''); return m ? cap(m[1]) : '';
}
function helixSVG() {
  const W = 320, H = 84, A = 28, L = 80, y = (x, s) => H / 2 + s * A * Math.sin(x * 2 * Math.PI / L), r = n => Math.round(n * 10) / 10;
  const strand = s => { let d = ''; for (let x = 4; x <= W - 4; x += 2) d += (d ? 'L' : 'M') + x + ' ' + r(y(x, s)); return d; };
  let rungs = '', i = 0;
  for (let x = 14; x < W - 8; x += 10) { const a = y(x, 1), b = y(x, -1); if (Math.abs(a - b) < 16) continue; rungs += `<line x1="${x}" y1="${r(a)}" x2="${x}" y2="${r(b)}" class="${i % 2 ? 'p' : ''}" style="--i:${i++}"/>`; }
  return `<svg class="helix" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><g class="rungs">${rungs}</g><path class="a" pathLength="1" d="${strand(1)}"/><path class="b" pathLength="1" d="${strand(-1)}"/></svg>`;
}
export function startWelcome(u) {
  if (WEL) WEL.el.remove();
  const el = document.createElement('div'), nm = firstName(u); el.id = 'welcome'; el.setAttribute('role', 'status');
  el.innerHTML = `<div class="wel-in"><img src="logo.png" alt="" width="116" height="116"><h1>Welcome${nm ? ', ' + e(nm) : ''}</h1>${helixSVG()}<div class="hint">Opening the lab…</div></div>`;
  document.body.append(el); WEL = { el, t0: now(), open: false };
  el.addEventListener('click', () => openWelcome());
  setTimeout(welcomeCheck, 1900); setTimeout(openWelcome, 9000);
}
const stillLoading = () => S.fb === undefined || (!!S.fb && WITS.test(S.fb.email || '') && !S.labErr && (pending.has('lab') || (!!DB.lab && isMember() && !S.ready)));
export function welcomeCheck() { if (WEL && !WEL.open && now() - WEL.t0 >= 1850 && !stillLoading()) openWelcome(); }
function openWelcome() {
  if (!WEL || WEL.open) return; WEL.open = true; const el = WEL.el; el.classList.add('open');
  setTimeout(() => { el.remove(); if (WEL && WEL.el === el) WEL = null; }, 1100);
}
