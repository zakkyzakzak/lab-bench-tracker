// Lab map tab: rooms with a 3D scan, the places inside them, what is kept in each place, checking a place's
// list while standing at it, photos of drawers, and the NFC tag link that opens a place directly.

import { $, AFTER, DB, S, V, dt, e, flag, followLink, low, nameOf, nid, now, readLink, toast } from './core.js';
import { commit } from './sync.js';
import { render } from './render.js';
import { A, SURE, val } from './actions.js';
import { PL, PLACE_KINDS, checkOf, checkable, itemsAt, kidsOf, pinOf, roomOf, tagUrl, trail, under, where } from './places.js';
import { blobUrl, dropBlob, putBlob, shrinkPhoto } from './blobs.js';
import { scanShow } from './scan.js';

const SCAN_MAX = 40e6;
const ago = t => { const d = Math.floor((now() - t) / 864e5); return d < 1 ? 'today' : d === 1 ? 'yesterday' : d < 60 ? d + ' days ago' : Math.round(d / 30) + ' months ago'; };
const checkFlag = p => { const s = checkOf(p); return flag(s === 'ok' ? 'ok' : s === 'stale' ? 'warn' : '', s === 'never' ? 'Never checked' : 'Checked ' + ago(p.checkedAt)); };
const count = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
const inside = p => under(p.id).reduce((s, q) => s + itemsAt(q.id).length, 0);
const toCheck = () => DB.places.filter(p => checkable(p) && checkOf(p) !== 'ok').sort((a, b) => (a.checkedAt || 0) - (b.checkedAt || 0));
const placeRow = p => `<div class="prow"><button class="lnk nm" style="text-align:left" data-a="plGo" data-id="${p.id}">${e(p.name)}</button><span class="sm muted">${e(p.kind || '')}</span><span class="sm muted">${count(inside(p), 'item')}</span>${checkable(p) ? checkFlag(p) : ''}</div>`;
const addForm = (label, kinds, first) => `<div class="line"><input type="text" id="plName" class="grow" placeholder="${label}" aria-label="${label}"><select id="plKind" aria-label="Kind of place">${kinds.map(k => `<option ${k === first ? 'selected' : ''}>${k}</option>`).join('')}</select><button class="btn" data-a="plAdd">Add</button></div><span class="err" id="plErr"></span>`;

function hitsHTML() {
  const q = low(S.mapQ); if (q.length < 2) return '';
  const its = DB.items.filter(i => PL(i.place) && (low(i.name).includes(q) || low(i.note).includes(q))).slice(0, 30), pls = DB.places.filter(p => low(p.name).includes(q)).slice(0, 10);
  if (!its.length && !pls.length) return '<div class="hint">Nothing on the lab map matches that.</div>';
  return `<div class="plist">${its.map(i => `<div class="prow"><span class="nm">${e(i.name)}</span><span class="sm muted">${e(i.qty || '')}</span><button class="lnk sm" data-a="plGo" data-id="${i.place}">${e(where(i.place))}</button></div>`).join('')}
    ${pls.map(p => `<div class="prow"><span class="nm">${e(p.name)} <span class="sm muted">${e(p.kind || 'place')}</span></span><button class="lnk sm" data-a="plGo" data-id="${p.id}">${e(where(p.id))}</button></div>`).join('')}</div>`;
}

function homeView() {
  const rooms = kidsOf(''), due = toCheck(), all = DB.places.filter(checkable), never = all.filter(p => !p.checkedAt).length;
  return `<div class="cols"><div class="stack">
    <div class="card"><h2>Find something</h2><input type="search" id="mapQ" data-i="mapq" value="${e(S.mapQ || '')}" placeholder="Name of an item or a place" aria-label="Find an item or a place"><div id="mapHits">${hitsHTML()}</div></div>
    <div class="card"><h2>Rooms</h2>${rooms.length ? `<div class="plist">${rooms.map(placeRow).join('')}</div>` : '<div class="hint">No rooms yet. Add the first one below, then scan it with a phone and add the scan on its page.</div>'}
      ${addForm('Name of a room, e.g. Tissue culture', ['Room'], 'Room')}</div></div>
   <div class="stack">
    <div class="card"><h2>What still needs checking</h2>${all.length ? `<div class="sm"><b>${all.length - due.length} of ${all.length}</b> places have been checked in the last three months${never ? `; ${never} ${never === 1 ? 'has' : 'have'} never been checked` : ''}.</div>
      <div class="bar pos ${due.length ? 'bad' : 'ok'}"><i style="width:${(all.length - due.length) / all.length * 100}%"></i></div>
      ${due.length ? `<div class="plist">${due.slice(0, 12).map(p => `<div class="prow"><button class="lnk nm" style="text-align:left" data-a="plGo" data-id="${p.id}">${e(where(p.id))}</button>${checkFlag(p)}</div>`).join('')}</div>${due.length > 12 ? `<div class="sm muted">and ${due.length - 12} more</div>` : ''}` : ''}`
      : '<div class="hint">Once places are on the map, this shows which of them nobody has looked into yet, so no shelf or drawer is missed.</div>'}</div>
    <div class="card"><h2>How the lab map works</h2><div class="hint">A room holds places (a fridge, a cupboard, a bench), and a place can hold smaller places (a shelf, a drawer, a box). Items are logged on the place they are kept in. Each place has its own link: write it to an NFC tag stuck at that spot, and tapping the tag with a phone opens that place ready to log an item or check its list.</div></div></div></div>`;
}

function placeView(p) {
  const tr = trail(p), room = roomOf(p), top = tr[0], its = itemsAt(p.id), kids = kidsOf(p.id), deeper = inside(p) - its.length, pin = pinOf(p), isRoom = !p.parent;
  const names = [...new Set([...DB.reagents.map(r => r.name), ...DB.items.map(i => i.name)])].sort();
  const scanCard = room ? `<div class="card"><div id="scanHost" class="scanHost" data-room="${room.id}"></div>
      ${S.pinning ? `<div class="todo sm"><span>Turn the scan until you can see where <b>${e(p.name)}</b> is, then tap that spot.</span><button class="btn sm" data-a="plPinStop">Cancel</button></div>`
      : isRoom ? `<div class="hint">Drag to turn the room, pinch or scroll to zoom. The dots are the places marked in this room: green was checked in the last three months, amber is older, grey has never been checked.</div>`
        : `<div class="line sm"><span class="grow muted">${p.pin ? 'This place is marked on the scan.' : pin ? `Shown at ${e(pin.name)}, which it is inside.` : 'This place is not marked on the scan yet.'}</span><button class="btn sm" data-a="plPin">${p.pin ? 'Move the mark' : 'Mark where it is'}</button>${p.pin ? '<button class="btn sm" data-a="plUnpin">Remove the mark</button>' : ''}</div>`}</div>`
    : isRoom ? `<div class="card"><h2>Add a 3D scan of this room</h2><div class="hint">Scan the room with a phone that has LiDAR (iPhone Pro or iPad Pro) in an app such as Polycam, Scaniverse or 3D Scanner App, export it as a <b>GLB</b> file, and choose that file here. Keep it under 40 MB: export at a reduced or medium detail setting if it is larger. Open fridge and cupboard doors are fine, but a scan cannot see inside closed ones; photos on each place cover that.</div>
        <div class="line"><label class="btn pri" style="cursor:pointer">Choose the scan file<input type="file" id="scanUp" accept=".glb,model/gltf-binary" hidden></label><span class="sm muted" id="scanMsg">${e(S.upMsg || '')}</span></div></div>`
      : `<div class="card"><div class="hint">${e(top.name)} has no 3D scan yet. <button class="lnk" data-a="plGo" data-id="${top.id}">Open ${e(top.name)}</button> to add one. Everything else on this page works without it.</div></div>`;
  return `<div class="card"><div class="line sm crumbs"><button class="lnk" data-a="plGo" data-id="">Lab map</button>${tr.slice(0, -1).map(q => ` <span class="muted">›</span> <button class="lnk" data-a="plGo" data-id="${q.id}">${e(q.name)}</button>`).join('')}</div>
     <div class="line"><h2 class="grow">${e(p.name)}</h2>${flag('info', e(p.kind || 'Place'))}${checkable(p) ? checkFlag(p) : ''}</div></div>
   <div class="cols"><div class="stack">${scanCard}
     <div class="card"><h2>Places inside ${e(p.name)}</h2>${kids.length ? `<div class="plist">${kids.map(placeRow).join('')}</div>` : `<div class="hint">None yet. Add the ${isRoom ? 'fridges, cupboards and benches' : 'shelves, drawers or boxes'} that are inside it.</div>`}
       ${addForm('Name, e.g. ' + (isRoom ? 'Fridge 2' : 'Shelf 3'), PLACE_KINDS.filter(k => k !== 'Room'), isRoom ? 'Fridge' : 'Shelf')}</div></div>
    <div class="stack">
     <div class="card"><h2>Log an item here</h2><div class="rg"><label>What it is<input type="text" id="itName" list="itNames" autocomplete="off"></label><label>How much<input type="text" id="itQty" placeholder="e.g. 2 boxes"></label><label>Note<input type="text" id="itNote" placeholder="optional"></label></div>
       <datalist id="itNames">${names.map(n => `<option value="${e(n)}">`).join('')}</datalist>
       <div class="line"><button class="btn pri" data-a="itAdd">Add to ${e(p.name)}</button><span class="err" id="itErr"></span></div>
       <div class="hint">A name that matches the Reagents list is linked to it, so the Reagents tab shows where it is kept.</div></div>
     <div class="card"><h2>Kept here</h2>${its.length ? `<div class="plist">${its.map(i => `<div class="prow"><span class="nm">${e(i.name)}${i.reagent && DB.reagents.some(r => r.id === i.reagent) ? ' ' + flag('info', 'Reagents list') : ''}</span><span class="sm">${e(i.qty || '')}</span>${i.note ? `<span class="sm muted">${e(i.note)}</span>` : ''}<button class="btn sm" data-a="itDel" data-id="${i.id}">Not here any more</button></div>`).join('')}</div>` : '<div class="hint">Nothing is logged on this place itself.</div>'}
       ${deeper ? `<div class="sm muted">${count(deeper, 'more item')} in the places inside it.</div>` : ''}
       <div class="line"><button class="btn" data-a="plCheck">I have looked: this list is right</button><span class="sm muted">${p.checkedAt ? `Last checked ${dt(p.checkedAt)} by ${e(nameOf(p.checkedBy))}` : 'Nobody has checked this place yet'}</span></div>
       <div class="hint">Standing at this place, add what is missing from the list and take off what has gone, then press the button. That is how the map knows this space has been covered.</div></div>
     <div class="card"><h2>Photos</h2>${(p.photos || []).length ? `<div class="thumbs">${p.photos.map((f, j) => `<span class="thumb"><a target="_blank" rel="noopener" title="${e(f.name || 'Photo')}"><img data-blob="${f.id}" data-n="${f.n}" alt="${e(f.name || 'Photo of ' + p.name)}"></a><button class="lnk sm" data-a="phDel" data-j="${j}">Remove</button></span>`).join('')}</div>` : '<div class="hint">A photo of an open drawer or shelf shows what a scan cannot.</div>'}
       <div class="line"><label class="btn sm" style="cursor:pointer">Add a photo<input type="file" id="phUp" accept="image/*" hidden></label></div></div>
     <div class="card"><h2>NFC tag for this place</h2><div class="sm mono" style="word-break:break-all">${e(tagUrl(p.id))}</div>
       <div class="line"><button class="btn sm" data-a="plCopy">Copy the link</button>${'NDEFReader' in window ? '<button class="btn sm" data-a="plNfc">Write it to a tag now</button>' : ''}</div>
       <div class="hint">Write this link to an NFC tag as a web address (URL) and stick the tag at this place. Tapping it with a phone opens this page. On an iPhone use a free app such as NFC Tools to write it; on Android, Chrome can write it from here. Use on-metal tags on fridges and freezers.</div></div>
     <div class="card"><h2>Place details</h2><div class="line"><input type="text" id="plRename" class="grow" value="${e(p.name)}" aria-label="Name"><select id="plRekind" aria-label="Kind of place">${PLACE_KINDS.map(k => `<option ${k === p.kind ? 'selected' : ''}>${k}</option>`).join('')}</select><button class="btn sm" data-a="plSave">Save</button></div><span class="err" id="plSaveErr"></span>
       <div class="line">${p.scan ? `<label class="btn sm" style="cursor:pointer">Replace the scan<input type="file" id="scanUp" accept=".glb,model/gltf-binary" hidden></label><button class="btn sm" data-a="scanDel">Remove the scan</button>` : ''}<button class="btn sm" data-a="plDel">Remove this place</button><span class="sm muted" id="scanMsg">${p.scan ? e(S.upMsg || '') : ''}</span></div></div></div></div>`;
}

V.map = () => {
  if (!S.place) return homeView();
  const p = PL(S.place);
  return p ? placeView(p) : `<div class="card"><h2>That tag is not on the lab map</h2><div class="hint">The link you opened points to a place that has been removed, or the tag was written with a link from somewhere else.</div><div class="line"><button class="btn pri" data-a="plGo" data-id="">Open the lab map</button></div></div>`;
};

/* after each redraw: put the 3D view back on the page and fill in the photos */
AFTER.push(() => {
  document.querySelectorAll('img[data-blob]').forEach(img => blobUrl({ id: img.dataset.blob, n: +img.dataset.n || 1 }, 'image/jpeg').then(u => { img.src = u; if (img.parentNode && img.parentNode.tagName === 'A') img.parentNode.href = u; }).catch(() => { img.alt = 'This photo could not be loaded'; }));
  const host = $('#scanHost'); if (!host) return;
  const room = PL(host.dataset.room), p = PL(S.place); if (!room || !room.scan || !p) return;
  scanShow(host, {
    scan: room.scan, focus: (pinOf(p) || {}).id || null,
    pins: under(room.id).filter(q => q.pin).map(q => ({ id: q.id, name: q.name, pos: q.pin, st: checkOf(q) })),
    pick: S.pinning ? pos => { const q = PL(S.place); if (!q) return; q.pin = pos; S.pinning = false; commit(); render(); toast(q.name + ' is marked on the scan.'); } : null,
  });
});

Object.assign(A, {
  plGo: d => { S.tab = 'map'; S.place = d.id || null; S.pinning = false; S.upMsg = ''; },
  plAdd: () => {
    const name = val('plName'); if (!name) { $('#plErr').textContent = 'Give it a name.'; return false; }
    if (kidsOf(S.place).some(q => low(q.name) === low(name))) { $('#plErr').textContent = 'There is already a place with that name here.'; return false; }
    DB.places.push({ id: nid(), name: name.slice(0, 80), kind: S.place ? val('plKind') : 'Room', parent: S.place || '', at: now(), by: S.user });
    toast(name + ' added.');
  },
  plSave: () => { const p = PL(S.place), name = val('plRename'); if (!name) { $('#plSaveErr').textContent = 'A place needs a name.'; return false; } p.name = name.slice(0, 80); p.kind = val('plRekind'); toast('Saved.'); },
  plDel: () => {
    const p = PL(S.place);
    (p.photos || []).forEach(dropBlob); if (p.scan) dropBlob(p.scan);
    DB.places = DB.places.filter(q => q !== p); S.place = p.parent || null; S.pinning = false; toast(p.name + ' removed.');
  },
  plCheck: () => { const p = PL(S.place); p.checkedAt = now(); p.checkedBy = S.user; toast(p.name + ' is marked as checked.'); },
  plPin: () => { S.pinning = true; },
  plPinStop: () => { S.pinning = false; },
  plUnpin: () => { delete PL(S.place).pin; },
  plCopy: () => { const u = tagUrl(S.place); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('Link copied.')).catch(() => toast('Copying did not work here: select the link and copy it by hand.')); return false; },
  plNfc: () => {
    toast('Hold the tag against the back of the phone…');
    new window.NDEFReader().write({ records: [{ recordType: 'url', data: tagUrl(S.place) }] }).then(() => toast('The tag now opens this place.')).catch(err => toast('The tag was not written: ' + ((err && err.message) || 'no tag was found') + '.'));
    return false;
  },
  itAdd: () => {
    const name = val('itName'); if (!name) { $('#itErr').textContent = 'Say what the item is.'; return false; }
    const r = DB.reagents.find(q => low(q.name) === low(name)), it = { id: nid(), name: name.slice(0, 120), qty: val('itQty').slice(0, 60), note: val('itNote').slice(0, 200), place: S.place, at: now(), by: S.user };
    if (r) it.reagent = r.id; DB.items.push(it); toast(name + ' logged in ' + PL(S.place).name + '.');
  },
  itDel: d => { DB.items = DB.items.filter(i => i.id !== d.id); },
  phDel: d => { const p = PL(S.place), f = (p.photos || [])[+d.j]; if (!f) return false; dropBlob(f); p.photos.splice(+d.j, 1); },
  scanDel: () => { const p = PL(S.place); dropBlob(p.scan); delete p.scan; for (const q of under(p.id)) delete q.pin; toast('The scan was removed. The places and their items are unchanged.'); },
});
/* a place can only be removed once it is empty, so nothing logged is lost by a slip */
const guard = A.plDel;
A.plDel = d => { const p = PL(S.place); if (!p) return false; if (kidsOf(p.id).length || itemsAt(p.id).length) { toast('Remove or move what is inside ' + p.name + ' first.'); return false; } return guard(d); };
Object.assign(SURE, {
  plDel: () => { const p = PL(S.place) || {}; return [`Remove ${p.name || 'this place'} from the lab map?`, p.scan ? 'Its 3D scan and photos are deleted too.' : 'Its photos are deleted too.', 'Remove place']; },
  itDel: d => ['Take this item off the list?', ((DB.items.find(i => i.id === d.id) || {}).name || '') + ' will no longer be shown as kept here.', 'Take it off'],
  phDel: () => ['Remove this photo?', 'It is deleted for everyone.', 'Remove photo'],
  scanDel: () => ['Remove the 3D scan of this room?', 'The marks placed on it are removed too. Places, items and photos stay.', 'Remove scan'],
});

/* files chosen on the lab map: a room scan or a photo of a place */
document.addEventListener('change', ev => {
  const el = ev.target, f = el.files && el.files[0], id = S.place; if (!f || (el.id !== 'scanUp' && el.id !== 'phUp')) return;
  const p = PL(id); if (!p) return;
  const msg = t => { S.upMsg = t; const m = $('#scanMsg'); if (m && S.place === id) m.textContent = t; };
  if (el.id === 'scanUp') {
    if (!/\.glb$/i.test(f.name)) { toast('Choose a .glb file. In the scanning app, pick GLB when you export.'); el.value = ''; return; }
    if (f.size > SCAN_MAX) { toast('That scan is ' + Math.round(f.size / 1e6) + ' MB. Export it at a lower detail setting so it is under 40 MB.'); el.value = ''; return; }
    msg('Reading the file…');
    f.arrayBuffer().then(b => putBlob(new Uint8Array(b), { name: f.name.slice(0, 120), type: 'model/gltf-binary', place: id }, (i, n) => msg('Saving the scan: ' + Math.round(i / n * 100) + '%')))
      .then(rec => { const q = PL(id); if (!q) { dropBlob(rec); return; } const old = q.scan; q.scan = { ...rec, name: f.name.slice(0, 120), at: now(), by: S.user }; if (old) { dropBlob(old); for (const k of under(q.id)) delete k.pin; } msg(''); commit(); render(); toast('The scan of ' + q.name + ' is saved.' + (old ? ' Mark the places on the new scan again.' : '')); })
      .catch(err => { msg(''); toast('The scan was not saved: ' + ((err && err.message) || 'no answer') + '.'); });
    return;
  }
  toast('Saving the photo…');
  shrinkPhoto(f).then(u8 => putBlob(u8, { name: f.name.slice(0, 120), type: 'image/jpeg', place: id }))
    .then(rec => { const q = PL(id); if (!q) { dropBlob(rec); return; } (q.photos = q.photos || []).push({ ...rec, name: f.name.slice(0, 120), at: now(), by: S.user }); commit(); render(); toast('Photo added to ' + q.name + '.'); })
    .catch(err => toast('The photo was not saved: ' + ((err && err.message) || 'it could not be read') + '.'));
});
document.addEventListener('input', ev => { if (ev.target.dataset.i === 'mapq') { S.mapQ = ev.target.value; $('#mapHits').innerHTML = hitsHTML(); } });
/* a tag tapped while the site is already open in this tab */
addEventListener('hashchange', () => { if (readLink() && S.ready && followLink()) render(); });
