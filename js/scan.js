// The 3D view of a room scan (a .glb file exported from a phone's LiDAR scanning app).
// The 3D library is large, so it is only fetched the first time a scan is opened. The view is one element that is
// kept between redraws and put back on the page each time, because render() rebuilds everything else.

import { e } from './core.js';
import { getBlob } from './blobs.js';

let lib = null, T = null, L = null;
let el = null, cv, pinBox, note, renderer, scene, camera, controls, ray;
let model = null, box = null, span = 1, wanted = null, raf = 0, anim = null, aimed;
let st = { scan: null, pins: [], focus: null, pick: null };

const load = () => lib || (lib = Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js'), import('three/addons/controls/OrbitControls.js'),
  import('three/addons/loaders/DRACOLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')])
  .then(([three, g, o, d, m]) => { T = three; L = { GLTFLoader: g.GLTFLoader, OrbitControls: o.OrbitControls, DRACOLoader: d.DRACOLoader, Meshopt: m.MeshoptDecoder }; })
  .catch(err => { lib = null; throw err; }));
const say = t => { if (note) note.textContent = t; };
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function build() {
  el = document.createElement('div'); el.className = 'scan3d';
  el.innerHTML = '<canvas aria-label="3D scan of the room. Drag to turn it, pinch or scroll to zoom, drag with two fingers to slide."></canvas><div class="pins"></div><div class="scanNote" role="status"></div>';
  [cv, pinBox, note] = el.children;
  new ResizeObserver(size).observe(el);
  // a tap (not a drag) while a spot is being chosen marks that spot on the scan
  let down = null;
  cv.addEventListener('pointerdown', ev => { down = [ev.clientX, ev.clientY]; });
  cv.addEventListener('pointerup', ev => {
    const d = down; down = null; if (!d || !st.pick || !model || Math.hypot(ev.clientX - d[0], ev.clientY - d[1]) > 6) return;
    const r = cv.getBoundingClientRect(); ray.setFromCamera(new T.Vector2((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObject(model, true)[0]; if (hit) st.pick(hit.point.toArray().map(v => Math.round(v * 1000) / 1000));
  });
}
function setup() {
  renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  scene = new T.Scene(); camera = new T.PerspectiveCamera(55, 1, 0.05, 500); ray = new T.Raycaster();
  // only scans that come without colour need light; coloured scans are shown exactly as they were captured
  scene.add(new T.HemisphereLight(0xffffff, 0x8a9aa0, 2.4)); const sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(3, 8, 5); scene.add(sun);
  controls = new L.OrbitControls(camera, cv); controls.zoomToCursor = true; controls.addEventListener('change', draw);
  size();
}
function size() { if (!renderer || !el.clientWidth || !el.clientHeight) return; renderer.setSize(el.clientWidth, el.clientHeight, false); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); draw(); }
function draw() { if (!raf && renderer) raf = requestAnimationFrame(frame); }
function frame(t) {
  raf = 0;
  if (anim) {
    const k = anim.ms ? Math.min(1, (t - (anim.t0 ??= t)) / anim.ms) : 1, q = 1 - Math.pow(1 - k, 3);
    controls.target.lerpVectors(anim.t[0], anim.t[1], q); camera.position.lerpVectors(anim.p[0], anim.p[1], q);
    if (k >= 1) anim = null;
  }
  controls.update(); renderer.render(scene, camera); placePins();
  if (anim) draw();
}
function placePins() {
  const w = el.clientWidth, h = el.clientHeight, v = new T.Vector3();
  for (const b of pinBox.children) {
    const p = st.pins[+b.dataset.n]; if (!p || !model) { b.hidden = true; continue; }
    v.fromArray(p.pos).project(camera); b.hidden = v.z > 1 || v.z < -1;
    if (!b.hidden) b.style.transform = `translate(${Math.round((v.x + 1) / 2 * w)}px,${Math.round((1 - v.y) / 2 * h)}px)`;
  }
}
function drawPins() {
  const names = st.pins.length <= 14;
  pinBox.innerHTML = st.pins.map((p, n) => `<button class="pin ${p.st}${p.id === st.focus ? ' on' : ''}" data-n="${n}" data-a="plGo" data-id="${p.id}" title="${e(p.name)}" aria-label="${e(p.name)}" hidden><i></i>${names || p.id === st.focus ? `<span>${e(p.name)}</span>` : ''}</button>`).join('');
}
/* scans carry their colour in the file (a photo texture or a colour per point), so they are drawn unlit */
function flat(root) {
  const mk = m => { if (!m || (!m.map && !m.vertexColors) || m.isPointsMaterial || m.isLineBasicMaterial) return m; const b = new T.MeshBasicMaterial({ map: m.map || null, vertexColors: !!m.vertexColors, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest }); m.dispose(); return b; };
  root.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(mk) : mk(o.material); });
}
function clear() {
  if (!model) return; scene.remove(model);
  model.traverse(o => { if (o.geometry) o.geometry.dispose(); for (const m of [].concat(o.material || [])) { if (m.map) m.map.dispose(); m.dispose(); } });
  model = null; box = null;
}
/* turn the view to the chosen spot, or back out to the whole room when nothing is chosen */
function aim(jump) {
  if (!model) return; const pin = st.pins.find(p => p.id === st.focus), key = pin ? pin.id + ':' + pin.pos.join(',') : '';
  if (!jump && key === aimed) return; aimed = key;
  const c = box.getCenter(new T.Vector3()); let t, p;
  if (pin) {
    t = new T.Vector3().fromArray(pin.pos); const dir = camera.position.clone().sub(controls.target); if (dir.lengthSq() < 1e-6) dir.set(1, 1, 1);
    dir.normalize(); dir.y = Math.max(dir.y, 0.35); dir.normalize(); p = t.clone().addScaledVector(dir, Math.max(0.9, Math.min(2.6, span * 0.3)));
  } else { t = c; p = new T.Vector3(c.x + span * 0.55, box.max.y + span * 0.7, c.z + span * 0.55); }
  anim = { t: [controls.target.clone(), t], p: [camera.position.clone(), p], ms: jump || still() ? 0 : 650 }; draw();
}
async function open(scan) {
  wanted = scan.id; say('Loading the scan…');
  try {
    await load(); if (!renderer) setup();
    const u8 = await getBlob(scan, (i, n) => { if (wanted === scan.id) say('Loading the scan: ' + Math.round(i / n * 100) + '%'); });
    if (wanted !== scan.id) return;
    const gl = new L.GLTFLoader(); gl.setDRACOLoader(new L.DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')); gl.setMeshoptDecoder(L.Meshopt);
    const g = await gl.parseAsync(u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.slice().buffer, '');
    if (wanted !== scan.id) return;
    clear(); model = g.scene; flat(model); scene.add(model);
    box = new T.Box3().setFromObject(model); const s = box.getSize(new T.Vector3()); span = Math.max(s.x, s.z, 0.5);
    camera.near = span / 400; camera.far = span * 30; camera.updateProjectionMatrix(); controls.maxDistance = span * 4; controls.minDistance = span / 100;
    say(''); size(); aim(true);
  } catch (err) { if (wanted === scan.id) { console.error(err); say('The scan could not be shown: ' + ((err && err.message) || 'it could not be read') + '. The lists beside it still work.'); } }
}
/* put the view into host and show state s: { scan: {id, n, size}, pins: [{id, name, pos, st}], focus: place id or null, pick: fn([x, y, z]) or null } */
export function scanShow(host, s) {
  if (!el) build();
  if (el.parentNode !== host) host.appendChild(el);
  st = s; drawPins(); el.classList.toggle('picking', !!s.pick);
  if (s.scan.id !== wanted) { clear(); aimed = undefined; open(s.scan); } else aim(false);
  size(); draw();
}
