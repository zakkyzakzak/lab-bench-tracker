// Lab map records: places (a room, and inside it fridges, shelves, drawers, boxes) and the items logged in them.
// Only look-ups live here, so any other area can ask where something is kept.

import { SITE } from '../config.js';
import { DAY, DB, now } from './core.js';

export const PLACE_KINDS = ['Room', 'Fridge', 'Freezer', 'Cupboard', 'Bench', 'Shelf', 'Drawer', 'Rack', 'Box', 'Other'];
export const PL = id => DB.places.find(p => p.id === id);
export const kidsOf = id => DB.places.filter(p => (p.parent || '') === (id || ''));
/* the place and everything above it, outermost first */
export function trail(p) { const out = []; for (let q = p, n = 0; q && n < 12; q = PL(q.parent), n++) out.unshift(q); return out; }
export const where = id => trail(PL(id)).map(p => p.name).join(' › ');
/* the place and everything inside it */
export function under(id) { const out = [], go = q => { out.push(q); kidsOf(q.id).forEach(go); }; const p = PL(id); if (p) go(p); return out; }
export const itemsAt = id => DB.items.filter(i => i.place === id);
/* a place is checked by someone standing at it and confirming its list; after three months that is treated as out of date */
export const STALE = 90 * DAY;
export const checkOf = p => !p.checkedAt ? 'never' : now() - p.checkedAt > STALE ? 'stale' : 'ok';
/* the places somebody has to look into: those with nothing inside them on the map, or with items logged straight on them */
export const checkable = p => !kidsOf(p.id).length || itemsAt(p.id).length > 0;
/* the room a place is in (its outermost place) when that room has a scan, and the nearest spot marked on that scan */
export const roomOf = p => { const r = trail(p)[0]; return r && r.scan ? r : null; };
export const pinOf = p => trail(p).reverse().find(q => q.pin) || null;
/* where a reagent from the lab's list is kept */
export const keptIn = rid => [...new Set(DB.items.filter(i => i.reagent === rid && PL(i.place)).map(i => i.place))].map(id => ({ id, where: where(id) }));
/* the address written to a place's NFC tag */
export const tagUrl = id => SITE + '#p=' + id;
