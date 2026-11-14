// Blueprint mode: the mech drawn as white lines on blueprint blue, front/side/top/3D views with real-size
// dimensions, and a build plan for the real titan that can be printed.
import * as THREE from 'three';
import { DEFAULT_REAL, buildPlan, scale, size, length, TOOLS } from './realbuild.js';
import { SLOTS, partById } from './parts.js';

const BLUE = 0x0d3b66;
const VIEWS = ['front', 'side', 'top', '3d'];

export class Blueprint {
  constructor({ renderer, scene, camera, controls, mech, hide, state, save }) {
    Object.assign(this, { renderer, scene, camera, controls, mech, hide, state, save });
    this.active = false;
    this.view = 'front';
    this.ortho = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    this.fill = new THREE.MeshBasicMaterial({ color: 0x12416f, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.line = new THREE.LineBasicMaterial({ color: 0xd8ecff });
    this.lineHot = new THREE.LineBasicMaterial({ color: 0xffc35a });
    this.swapped = new Map();
    this.overlays = [];
    this.edgeCache = new Map();
    this.grids = this.makeGrids();
    this.hot = null;
    state.realBuild = { ...DEFAULT_REAL, ...(state.realBuild ?? {}), large: { ...DEFAULT_REAL.large, ...(state.realBuild?.large ?? {}) }, small: { ...DEFAULT_REAL.small, ...(state.realBuild?.small ?? {}) } };
    this.el = document.getElementById('blueprint');
    this.svg = document.getElementById('bp-dims');
    this.wire();
  }

  makeGrids() {
    const g = new THREE.Group();
    const mk = (rot, pos) => {
      const grid = new THREE.GridHelper(40, 80, 0x4f86b8, 0x24598a);
      grid.material.transparent = true;
      grid.material.opacity = 0.55;
      grid.rotation.set(...rot);
      grid.position.set(...pos);
      g.add(grid);
      return grid;
    };
    return { group: g, floor: mk([0, 0, 0], [0, 0.16, 0]), back: mk([Math.PI / 2, 0, 0], [0, 0, -4]), side: mk([0, 0, Math.PI / 2], [-4, 0, 0]) };
  }

  // ---------- entering and leaving ----------
  enter() {
    if (this.active) return;
    this.active = true;
    this.saved = { bg: this.scene.background, fog: this.scene.fog, rot: this.mech.root.rotation.y, spin: this.mech.spin, exposure: this.renderer.toneMappingExposure };
    this.mech.spin = 0;
    this.mech.turnTarget = null;
    this.mech.root.rotation.y = 0;
    this.mech.walking = false;
    this.hide(true);
    this.scene.background = new THREE.Color(BLUE);
    this.scene.fog = null;
    this.scene.add(this.grids.group);
    this.applyLook();
    this.el.classList.remove('hidden');
    document.body.classList.add('bp-on');
    this.renderPanel();
    this.setView(this.view);
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.clearLook();
    this.scene.remove(this.grids.group);
    this.scene.background = this.saved.bg;
    this.scene.fog = this.saved.fog;
    this.mech.root.rotation.y = this.saved.rot;
    this.hide(false);
    this.el.classList.add('hidden');
    document.body.classList.remove('bp-on');
    this.svg.innerHTML = '';
  }

  /** Swaps every mech mesh to blueprint fill and adds white edge lines. Called again when parts change. */
  applyLook() {
    this.clearLook();
    const meshes = [];
    const visit = (root) => root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    if (this.mech.hull) visit(this.mech.hull.group);
    for (const a of Object.values(this.mech.attached)) visit(a.group);
    for (const o of meshes) {
      const orig = o.material;
      const first = Array.isArray(orig) ? orig[0] : orig;
      this.swapped.set(o, { material: orig, visible: o.visible });
      if (first?.transparent && first.depthWrite === false) { o.visible = false; continue; } // decals
      o.material = this.fill;
      let edges = this.edgeCache.get(o.geometry.uuid);
      if (!edges) { edges = new THREE.EdgesGeometry(o.geometry.userData.sharp?.() ?? o.geometry, 28); this.edgeCache.set(o.geometry.uuid, edges); }
      const l = new THREE.LineSegments(edges, this.line);
      l.userData.slot = o.userData.slot;
      l.raycast = () => {};
      o.add(l);
      this.overlays.push(l);
    }
    this.highlight(this.hot);
  }

  clearLook() {
    for (const [o, s] of this.swapped) { o.material = s.material; o.visible = s.visible; }
    this.swapped.clear();
    for (const l of this.overlays) l.removeFromParent();
    this.overlays = [];
  }

  highlight(slot) {
    this.hot = slot;
    for (const l of this.overlays) l.material = slot && l.userData.slot === slot ? this.lineHot : this.line;
    for (const li of this.el.querySelectorAll('.bp-part')) li.classList.toggle('hot', li.dataset.slot === slot);
  }

  /** Parts were added, removed or repainted while the blueprint is open. */
  refresh() {
    if (!this.active) return;
    this.applyLook();
    this.renderPanel();
    this.frame();
  }

  // ---------- views ----------
  setView(v) {
    this.view = v;
    for (const b of this.el.querySelectorAll('[data-view]')) b.classList.toggle('on', b.dataset.view === v);
    this.grids.back.visible = v === 'front' || v === '3d';
    this.grids.side.visible = v === 'side';
    this.controls.enabled = v === '3d';
    this.frame();
  }

  bounds() {
    const box = new THREE.Box3();
    if (this.mech.hull) box.expandByObject(this.mech.hull.group);
    for (const a of Object.values(this.mech.attached)) box.expandByObject(a.group);
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 4, 1));
    return box;
  }

  /** Fits the orthographic camera around the mech, leaving room for the panel. */
  frame(print = null) {
    const box = this.bounds();
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const W = print?.w ?? innerWidth, H = print?.h ?? innerHeight;
    const panel = !print && innerWidth > 900 ? Math.min(420, innerWidth * 0.36) : 0;
    const w = W - panel, h = H;
    const aspect = w / h;
    let span, dir, up = new THREE.Vector3(0, 1, 0);
    if (this.view === 'front') { span = Math.max(s.y, s.x / aspect); dir = new THREE.Vector3(0, 0, 1); }
    else if (this.view === 'side') { span = Math.max(s.y, s.z / aspect); dir = new THREE.Vector3(1, 0, 0); }
    else { span = Math.max(s.z, s.x / aspect); dir = new THREE.Vector3(0, 1, 0); up = new THREE.Vector3(0, 0, -1); }
    span *= print ? 1.12 : 1.45;
    const half = span / 2;
    // shift left so the mech sits in the middle of the area the panel doesn't cover
    const shift = (panel / W) * half * (W / H);
    const o = this.ortho;
    o.left = -half * (W / H) + shift;
    o.right = half * (W / H) + shift;
    o.top = half;
    o.bottom = -half;
    o.position.copy(c).addScaledVector(dir, 30);
    o.up.copy(up);
    o.lookAt(c);
    o.updateProjectionMatrix();
    if (this.view === '3d') {
      this.controls.target.copy(c);
    }
  }

  get cam() { return this.view === '3d' ? this.camera : this.ortho; }

  render() {
    this.renderer.render(this.scene, this.cam);
    this.drawDims();
  }

  // ---------- dimension lines and callouts ----------
  toScreen(v) {
    const p = v.clone().project(this.cam);
    return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
  }

  drawDims() {
    const real = this.state.realBuild;
    const k = scale(real);
    const box = this.bounds();
    const s = box.getSize(new THREE.Vector3());
    let out = '';
    const line = (a, b, label, vertical) => {
      out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="dim"/>`;
      for (const p of [a, b]) out += vertical ? `<line x1="${p.x - 8}" y1="${p.y}" x2="${p.x + 8}" y2="${p.y}" class="dim"/>` : `<line x1="${p.x}" y1="${p.y - 8}" x2="${p.x}" y2="${p.y + 8}" class="dim"/>`;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      out += vertical
        ? `<text x="${mx - 12}" y="${my}" class="dimt" text-anchor="end" dominant-baseline="middle">${label}</text>`
        : `<text x="${mx}" y="${my + 22}" class="dimt" text-anchor="middle">${label}</text>`;
    };
    if (this.view !== '3d' && this.mech.hull) {
      const m = 0.35;
      const V = (x, y, z) => this.toScreen(new THREE.Vector3(x, y, z));
      const lo = box.min, hi = box.max;
      if (this.view === 'front') {
        line(V(lo.x - m, lo.y, hi.z), V(lo.x - m, hi.y, hi.z), length(s.y * k, real.units), true);
        line(V(lo.x, lo.y - m, hi.z), V(hi.x, lo.y - m, hi.z), length(s.x * k, real.units), false);
      } else if (this.view === 'side') {
        line(V(hi.x, lo.y, hi.z + m), V(hi.x, hi.y, hi.z + m), length(s.y * k, real.units), true);
        line(V(hi.x, lo.y - m, lo.z), V(hi.x, lo.y - m, hi.z), length(s.z * k, real.units), false);
      } else {
        line(V(lo.x, hi.y, hi.z + m), V(hi.x, hi.y, hi.z + m), length(s.x * k, real.units), false);
      }
      // callouts: each fitted part, with a leader line out to the side
      const items = Object.keys(SLOTS).filter((sl) => this.mech.partIn(sl)).map((sl) => ({ sl, p: this.toScreen(this.mech.socketWorld(sl).pos) }));
      const centre = this.toScreen(box.getCenter(new THREE.Vector3()));
      const left = items.filter((i) => i.p.x < centre.x).sort((a, b) => a.p.y - b.p.y);
      const right = items.filter((i) => i.p.x >= centre.x).sort((a, b) => a.p.y - b.p.y);
      // the mech's outline on screen, from all 8 corners of its box
      let sx0 = Infinity, sx1 = -Infinity;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const q = this.toScreen(new THREE.Vector3(x, y, z));
        sx0 = Math.min(sx0, q.x); sx1 = Math.max(sx1, q.x);
      }
      const edgeL = sx0 - 70, edgeR = sx1 + 70;
      const place = (list, x, anchor) => {
        let lastY = -Infinity;
        for (const { sl, p } of list) {
          const y = Math.max(p.y, lastY + 34);
          lastY = y;
          const part = this.mech.partIn(sl);
          const hot = sl === this.hot ? ' hot' : '';
          out += `<polyline points="${p.x},${p.y} ${x + (anchor === 'end' ? 8 : -8)},${y} ${x},${y}" class="lead${hot}"/><circle cx="${p.x}" cy="${p.y}" r="3.5" class="dot${hot}"/>`;
          out += `<text x="${x + (anchor === 'end' ? -4 : 4)}" y="${y - 3}" text-anchor="${anchor}" class="callt${hot}">${SLOTS[sl].label.toUpperCase()}</text>`;
          out += `<text x="${x + (anchor === 'end' ? -4 : 4)}" y="${y + 12}" text-anchor="${anchor}" class="calls${hot}">${esc(part.name)}</text>`;
        }
      };
      if (this.view === 'front') { place(left, Math.min(edgeL, centre.x - 160), 'end'); place(right, Math.max(edgeR, centre.x + 160), 'start'); }
      else if (this.view === 'side') place([...left, ...right].sort((a, b) => a.p.y - b.p.y), edgeR, 'start');
    }
    this.svg.innerHTML = out;
    const sizeEl = this.el.querySelector('.bp-size b');
    if (sizeEl && this.mech.hull) {
      const tall = length(s.y * k, real.units), wide = length(s.x * k, real.units);
      const bs = this.el.querySelectorAll('.bp-size b');
      if (bs[0].textContent !== tall) bs[0].textContent = tall;
      if (bs[1] && bs[1].textContent !== wide) bs[1].textContent = wide;
    }
  }

  // ---------- the panel ----------
  wire() {
    this.el.addEventListener('click', (e) => {
      const v = e.target.closest('[data-view]');
      if (v) { this.setView(v.dataset.view); return; }
      const p = e.target.closest('.bp-part');
      if (p) { this.highlight(this.hot === p.dataset.slot ? null : p.dataset.slot); }
    });
    this.el.addEventListener('change', (e) => {
      const t = e.target;
      const r = this.state.realBuild;
      if (t.dataset.real) {
        const [box, dim] = t.dataset.real.split('.');
        const v = parseFloat(t.value);
        const cm = r.units === 'in' ? v * 2.54 : v;
        if (cm > 0) r[box][dim] = cm;
      } else if (t.id === 'bp-units') r.units = t.value;
      else if (t.id === 'bp-motor') r.motor = t.value;
      else if (t.id === 'bp-notes') r.notes = t.value;
      this.save();
      this.renderPanel();
    });
  }

  plan() {
    return buildPlan(this.mech.layout, this.state.realBuild, (id) => partById(id)?.name ?? id);
  }

  renderPanel() {
    const r = this.state.realBuild;
    const k = scale(r);
    const s = this.bounds().getSize(new THREE.Vector3());
    const plan = this.plan();
    const u = r.units;
    const f = u === 'in' ? 1 / 2.54 : 1;
    const num = (cm) => Math.round(cm * f * 10) / 10;
    const dimInputs = (key) => ['l', 'w', 'h'].map((d) => `<input type="number" min="1" step="${u === 'in' ? 0.5 : 1}" data-real="${key}.${d}" value="${num(r[key][d])}" aria-label="${key} ${d}">`).join('<span>×</span>');
    let groups = '';
    let last = '';
    for (const t of plan.totals) {
      if (t.group !== last) { groups += `<li class="grp">${t.group}</li>`; last = t.group; }
      groups += `<li><b>${t.qty}×</b> ${esc(t.item)}${t.detail ? `<span class="sub"> · ${esc(t.detail)}</span>` : ''}</li>`;
    }
    this.el.querySelector('.bp-body').innerHTML = `
      <div class="bp-size">${this.mech.hull ? `Real size: about <b>${length(s.y * k, u)}</b> tall and <b>${length(s.x * k, u)}</b> wide` : 'Put a cockpit on the stand to start the blueprint.'}</div>
      <details open><summary>Your containers</summary>
        <label class="bp-row">Large<span class="dims">${dimInputs('large')}</span></label>
        <label class="bp-row">Small<span class="dims">${dimInputs('small')}</span></label>
        <label class="bp-row">Units<select id="bp-units"><option value="cm"${u === 'cm' ? ' selected' : ''}>cm</option><option value="in"${u === 'in' ? ' selected' : ''}>inches</option></select></label>
        <label class="bp-row">Motors<input id="bp-motor" value="${esc(r.motor)}"></label>
        <p class="sub">Measure the containers you have. Everything else is sized from them.</p>
      </details>
      <details open><summary>Shopping list</summary><ul class="bp-list">${groups || '<li class="sub">Nothing yet.</li>'}</ul></details>
      <details open><summary>Parts and how to build them</summary><ol class="bp-parts">${plan.parts.map((p) => `<li class="bp-part" data-slot="${p.slot}"><b>${p.label}</b> · ${esc(p.name)}<div class="sub">${esc(p.how)}</div></li>`).join('')}</ol></details>
      <details><summary>Tools and safety</summary><ul class="bp-list">${TOOLS.map((t) => `<li>${esc(t.item)}<span class="sub"> · ${t.who}</span></li>`).join('')}</ul>
        <p class="sub">Cutting containers is a grown-up job. Wear safety glasses, and keep fingers away from motors when they're switched on.</p></details>
      <details><summary>Notes</summary><textarea id="bp-notes" rows="4" placeholder="Ideas, measurements, what to buy…">${esc(r.notes ?? '')}</textarea></details>`;
    this.highlight(this.hot);
  }

  // ---------- printing ----------
  /** Renders a view as a white-paper picture (navy lines) for printing. */
  snapshot(view) {
    const prev = this.view;
    this.view = view;
    const size = this.renderer.getSize(new THREE.Vector2());
    const ratio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(900, 1100, false);
    this.frame({ w: 900, h: 1100 });
    const bg = this.scene.background;
    this.scene.background = new THREE.Color(0xffffff);
    this.fill.color.set(0xffffff);
    this.line.color.set(0x12345a);
    this.grids.group.visible = false;
    this.renderer.render(this.scene, this.ortho);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(size.x, size.y, false);
    this.scene.background = bg;
    this.fill.color.set(0x12416f);
    this.line.color.set(0xd8ecff);
    this.grids.group.visible = true;
    this.view = prev;
    this.frame();
    return url;
  }

  print() {
    const r = this.state.realBuild;
    const plan = this.plan();
    const s = this.bounds().getSize(new THREE.Vector3());
    const k = scale(r);
    const front = this.snapshot('front'), side = this.snapshot('side');
    const sheet = document.getElementById('print-sheet');
    const name = this.state.mechName || 'My mech';
    sheet.innerHTML = `
      <h1>${esc(name)} · Build plan</h1>
      <p>Designed by ${esc(this.state.pilotName || 'the pilot')} in Mech Garage · ${new Date().toLocaleDateString()}</p>
      <p><b>Real size:</b> about ${length(s.y * k, r.units)} tall, ${length(s.x * k, r.units)} wide, ${length(s.z * k, r.units)} deep.
         Large containers ${size(r.large, r.units)}, small containers ${size(r.small, r.units)}.</p>
      <div class="views"><figure><img src="${front}"><figcaption>Front</figcaption></figure><figure><img src="${side}"><figcaption>Side</figcaption></figure></div>
      <h2>Shopping list</h2>
      <table>${plan.totals.map((t) => `<tr><td>☐</td><td>${t.qty}×</td><td>${esc(t.item)}${t.detail ? ` (${esc(t.detail)})` : ''}</td><td>${t.group}</td></tr>`).join('')}</table>
      <h2>Build steps</h2>
      <ol>${plan.steps.map((st) => `<li>${esc(st)}</li>`).join('')}</ol>
      <h2>Tools and safety</h2>
      <ul>${TOOLS.map((t) => `<li>${esc(t.item)}: ${t.who}</li>`).join('')}</ul>
      <p><b>Safety:</b> cutting containers is a grown-up job. Wear safety glasses. Keep fingers away from motors when they're on.</p>
      ${r.notes ? `<h2>Notes</h2><p>${esc(r.notes).replace(/\n/g, '<br>')}</p>` : ''}`;
    if (window.MechGarageAndroid?.print) window.MechGarageAndroid.print();
    else window.print();
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export { VIEWS };
