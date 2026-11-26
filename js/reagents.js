// Reagents: stock counted down from finished steps, the low-stock list and the Reagents tab.

import { DB, S, V, e, flag } from './core.js';
import { cur } from './protocols.js';
import { keptIn } from './places.js';

/* amounts can be in any of these; only the volume ones are counted against reagent stock */
export const UNITS = ['mL', 'µL', 'L', 'g', 'mg', 'µg', 'ng', 'mg/kg', 'µm', 'mm', 'mm³', 'cm²', 'cells', 'U'], VOL = { 'mL': 1, 'µL': 0.001, 'L': 1000 };
export const R = id => DB.reagents.find(r => r.id === id);
const toML = (v, u) => v * (VOL[u] || 1);
export const fmtV = (ml, u) => u === 'µL' ? Math.round(ml * 1000) + ' µL' : (Math.round(ml * 10) / 10) + ' mL';
export const needML = (q, n) => q.vol && q.reagent && VOL[q.unit] ? toML(q.vol, q.unit) * (q.type === 'wash' ? q.reps : 1) * (q.per === 'batch' ? 1 : n) : 0;
/* stock is never typed in: it is bottles bought minus what every finished step has drawn (kept as "used" on the reagent) */
export function stock(r) { const tot = toML(r.bottles * r.per, r.unit), left = Math.max(0, tot - (r.used || 0)); return { tot, left, low: left <= toML(r.low, r.unit) }; }
export const lowList = () => DB.reagents.filter(r => stock(r).low);

V.reag = () => `<div class="cols"><div class="stack">${DB.reagents.map(r => {
  const k = stock(r), us = DB.protocols.filter(p => p.nodes.some(n => cur(n).steps.some(q => q.reagent === r.id))).map(p => p.name).concat(DB.exps.flatMap(x => Object.entries(x.treag || {}).filter(q => q[1] === r.id).map(q => x.name + ' ' + q[0])));
  return `<div class="card"><div class="line"><b class="grow">${e(r.name)}</b>${flag(k.low ? 'bad' : 'ok', k.low ? 'Running low' : 'In stock')}</div>
    <div class="bar pos ${k.low ? 'bad' : 'ok'}"><i style="width:${k.tot ? k.left / k.tot * 100 : 0}%"></i></div>
    <div class="sm"><b>${fmtV(k.left, r.unit)}</b> left of ${fmtV(k.tot, r.unit)} · ${r.bottles} × ${r.per} ${e(r.unit)} bought · warns at ${r.low} ${e(r.unit)}</div>
    <div class="sm muted">Used in: ${e(us.join(', ') || 'no protocol yet')}</div>
    <div class="sm muted">Kept in: ${keptIn(r.id).map(q => `<button class="lnk" data-a="plGo" data-id="${q.id}">${e(q.where)}</button>`).join(' · ') || 'not logged on the lab map yet'}</div>
    <details><summary class="sm">Purchase details</summary><div class="sm muted">Brand: ${e(r.brand || 'not recorded')} · Supplier: ${e(r.supplier || 'not recorded')} · Price per bottle: ${r.price ? 'R ' + r.price : 'not recorded'}</div></details>
    <div class="line"><button class="btn sm" data-a="rgAdd" data-r="${r.id}">Record a new bottle</button></div></div>`;
}).join('') || '<div class="card hint">No reagents yet. Add the first one on the right, then it can be chosen in any protocol step.</div>'}</div>
  <div class="stack"><div class="card"><h2>How stock is counted</h2><div class="hint">Nobody types stock levels in. Each step ticked off in a bench session takes its amount off the reagent: amount × times × number of samples, or once if the step is set to per batch. Everyone in the lab sees the same stock and the same low warning, on this tab and on Today.</div></div>
   <div class="card"><h2>Add a reagent</h2><div class="rg"><label>Name<input type="text" id="rgName" value="${e(S.rgPrefill || '')}"></label><label>Bottles<input type="number" id="rgBottles" value="1" min="1"></label><label>Amount per bottle<input type="number" id="rgPer" min="0" step="any"></label><label>Unit<select id="rgUnit"><option>mL</option><option>µL</option></select></label><label>Warn when below<input type="number" id="rgLow" min="0" step="any"></label><label>Brand<input type="text" id="rgBrand"></label><label>Supplier<input type="text" id="rgSupplier"></label><label>Price per bottle (R)<input type="number" id="rgPrice" min="0"></label></div>
    <div class="line"><button class="btn pri" data-a="rgNew">Add reagent</button><span class="err" id="rgErr"></span></div>
    <div class="hint">Brand, supplier and price stay out of the way on screen. Brand and supplier appear on a protocol's print view.</div></div></div></div>`;
