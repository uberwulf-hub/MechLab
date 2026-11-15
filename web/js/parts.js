// The parts catalog. Every part is modelled here from simple shapes, so it can be any colour.
// The mech faces +Z (towards the workstation). Its LEFT side is +X, so `side` is +1 for left parts, -1 for right.
import * as THREE from '../vendor/three/three.module.js';
import * as tex from './textures.js';
import { RoundedBoxGeometry } from '../vendor/three/addons/geometries/RoundedBoxGeometry.js';

// ---------- materials shared by one mech (repainting changes them all at once) ----------
export function makeMaterials(paint) {
  const wear = tex.paintWear();
  const m = {
    paint: new THREE.MeshStandardMaterial({ color: paint.primary, metalness: 0.35, roughness: 0.6, roughnessMap: wear }),
    container: new THREE.MeshStandardMaterial({ color: paint.primary, metalness: 0.35, roughness: 0.65, roughnessMap: wear, normalMap: tex.corrugated(), normalScale: new THREE.Vector2(1.2, 1.2) }),
    accent: new THREE.MeshStandardMaterial({ color: paint.accent, metalness: 0.5, roughness: 0.45, roughnessMap: wear }),
    steel: new THREE.MeshStandardMaterial({ color: 0xa4aab0, metalness: 1, roughness: 0.32, roughnessMap: tex.brushed() }),
    motor: new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.9, roughness: 0.38, roughnessMap: tex.brushed() }),
    dark: new THREE.MeshStandardMaterial({ color: 0x17191c, metalness: 0.2, roughness: 0.8 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb8733a, metalness: 1, roughness: 0.3 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(paint.glow), emissiveIntensity: 3.2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b1418, metalness: 0.9, roughness: 0.06, transparent: true, opacity: 0.85 }),
    hazard: new THREE.MeshStandardMaterial({ map: tex.hazard(), metalness: 0.3, roughness: 0.6 }),
  };
  return m;
}

/** Surface finishes a part can have: how shiny or worn its paint is. */
export const FINISHES = {
  painted: { label: 'Painted', paint: [0.35, 0.6], accent: [0.5, 0.45] },
  shiny:   { label: 'Shiny chrome', paint: [0.9, 0.16], accent: [0.95, 0.14] },
  worn:    { label: 'Battle-worn', paint: [0.25, 0.88], accent: [0.35, 0.8] },
  matte:   { label: 'Matte stealth', paint: [0.05, 0.95], accent: [0.1, 0.9] },
};
export function setFinish(mats, finish = 'painted') {
  const f = FINISHES[finish] ?? FINISHES.painted;
  for (const [k, [metal, rough]] of [['paint', f.paint], ['container', f.paint], ['accent', f.accent]]) {
    mats[k].metalness = metal;
    mats[k].roughness = k === 'container' ? Math.min(1, rough + 0.05) : rough;
  }
}

export function repaint(mats, paint) {
  mats.paint.color.set(paint.primary);
  mats.container.color.set(paint.primary);
  mats.accent.color.set(paint.accent);
  mats.glow.emissive.set(paint.glow);
}

// ---------- building blocks ----------
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
// Parts are made of rounded boxes (bevelled edges, like real pressed steel) and smooth cylinders.
// Shapes are shared between parts of the same size. The blueprint draws the sharp version's edges (userData.sharp).
const shapes = new Map();
const box = (w, h, d) => {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = shapes.get(key);
  if (!g) {
    const r = Math.min(0.06, Math.min(w, h, d) * 0.16);
    g = r < 0.004 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 3, r);
    g.userData.sharp = () => new THREE.BoxGeometry(w, h, d);
    shapes.set(key, g);
  }
  return g;
};
const cyl = (r, h, seg = 32) => new THREE.CylinderGeometry(r, r, h, Math.max(seg, 16));

/**
 * A shipping-container block: corrugated walls, two door ends with locking bars, corner castings and a stencilled number.
 * Long axis is `along` ('z' for hull containers, 'y' for limb segments).
 */
export function container(m, w, h, d, { label = '', along = 'z' } = {}) {
  if (label && m.label) label = m.label; // the pilot's own label for this part
  const g = new THREE.Group();
  // walls corrugated, ends (doors) painted flat
  const flat = m.paint, wall = m.container;
  const mats = along === 'y'
    ? [wall, wall, flat, flat, wall, wall]
    : [wall, wall, wall, wall, flat, flat];
  g.add(mesh(box(w, h, d), mats));
  // frame rails along the 4 long edges
  const t = Math.min(w, h, d) * 0.07;
  const railGeo = along === 'y' ? box(t, h + 0.01, t) : box(t, t, d + 0.01);
  for (const sx of [-1, 1]) for (const s2 of [-1, 1]) {
    const r = mesh(railGeo, m.accent);
    if (along === 'y') r.position.set(sx * (w / 2 - t / 2 + 0.005), 0, s2 * (d / 2 - t / 2 + 0.005));
    else r.position.set(sx * (w / 2 - t / 2 + 0.005), s2 * (h / 2 - t / 2 + 0.005), 0);
    g.add(r);
  }
  // corner castings
  const cc = box(t * 1.5, t * 1.5, t * 1.5);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    g.add(mesh(cc, m.motor, sx * (w / 2 - t * 0.6), sy * (h / 2 - t * 0.6), sz * (d / 2 - t * 0.6)));
  // door end: two locking bars per door leaf, on the front (+z) end for hull containers
  if (along === 'z') {
    const bar = cyl(0.018, h * 0.86, 8);
    for (const bx of [-0.36, -0.14, 0.14, 0.36]) g.add(mesh(bar, m.steel, bx * w, 0, d / 2 + 0.02));
    g.add(mesh(box(0.012, h * 0.9, 0.02), m.dark, 0, 0, d / 2 + 0.006)); // door split
  }
  if (label) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w, 0.9) * 0.8, Math.min(w, 0.9) * 0.2),
      new THREE.MeshStandardMaterial({ map: tex.stencil(label), transparent: true, roughness: 0.7, depthWrite: false }));
    if (along === 'z') { decal.rotation.y = Math.PI / 2; decal.position.set(w / 2 + 0.012, h * 0.18, 0); }
    else { decal.position.set(0, h * 0.25, d / 2 + 0.012); }
    g.add(decal);
  }
  return g;
}

/** A big electric motor: drum, cooling fins, end cap and a status light. Axis along X. */
export function motor(m, r, len) {
  const g = new THREE.Group();
  const drum = mesh(cyl(r, len, 32), m.motor);
  drum.rotation.z = Math.PI / 2;
  g.add(drum);
  const finGeo = cyl(r * 1.08, len * 0.06, 32);
  for (let i = -2; i <= 2; i++) {
    const f = mesh(finGeo, m.steel, i * len * 0.18, 0, 0);
    f.rotation.z = Math.PI / 2;
    g.add(f);
  }
  for (const s of [-1, 1]) {
    const cap = mesh(cyl(r * 0.55, 0.05, 24), m.accent, s * (len / 2 + 0.02), 0, 0);
    cap.rotation.z = Math.PI / 2;
    g.add(cap);
  }
  g.add(mesh(new THREE.SphereGeometry(r * 0.12, 12, 8), m.glow, 0, r * 0.98, r * 0.15));
  // wiring loom
  const wire = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.018, 6, 24, Math.PI * 0.9), m.copper);
  wire.rotation.y = Math.PI / 2;
  wire.position.x = len * 0.32;
  g.add(wire);
  return g;
}

function piston(m, len, r = 0.05) {
  const g = new THREE.Group();
  g.add(mesh(cyl(r, len * 0.55, 12), m.motor, 0, -len * 0.27, 0));
  g.add(mesh(cyl(r * 0.55, len * 0.55, 12), m.steel, 0, -len * 0.72, 0));
  return g;
}

function hoseBetween(m, a, b, sag = 0.15, r = 0.025) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  return mesh(new THREE.TubeGeometry(curve, 16, r, 6), m.dark);
}

// ---------- hulls (the cockpit) ----------
// Each hull returns sockets: where each slot attaches (hull-local) and which way is "out".
const HULL_SOCKETS = (w, h, d, extra = {}) => ({
  head: { pos: [0, h * 0.18, d / 2 + 0.02], out: [0, 0, 1] },
  back: { pos: [0, 0.05, -d / 2 - 0.02], out: [0, 0, -1] },
  armL: { pos: [w / 2 + 0.22, h * 0.32, 0], out: [1, 0, 0] },
  armR: { pos: [-w / 2 - 0.22, h * 0.32, 0], out: [-1, 0, 0] },
  legL: { pos: [w * 0.27, -h / 2 - 0.05, 0], out: [0, 0, 1] },
  legR: { pos: [-w * 0.27, -h / 2 - 0.05, 0], out: [0, 0, 1] },
  shoulderL: { pos: [w * 0.3, h / 2 + 0.02, -0.1], out: [0, 1, 0] },
  shoulderR: { pos: [-w * 0.3, h / 2 + 0.02, -0.1], out: [0, 1, 0] },
  ...extra,
});

function quadContainerHull(m) {
  // Four large containers, two side by side and two stacked, cut open at the front for the pilot.
  const g = new THREE.Group();
  const cw = 1.1, ch = 0.78, cd = 1.7;
  const labels = ['MK-01', 'MK-02', 'MK-03', 'MK-04'];
  let i = 0;
  for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
    const c = container(m, cw, ch, cd, { label: sx > 0 ? labels[i] : '' });
    c.position.set(sx * (cw / 2 + 0.01), sy * (ch / 2 + 0.01), 0);
    g.add(c);
    i++;
  }
  // the cut-out cockpit opening in the upper front, with a glass canopy and roll-cage bars
  const w = cw * 2, h = ch * 2;
  const glass = mesh(box(1.1, 0.42, 0.04), m.glass, 0, 0.42, cd / 2 + 0.05);
  g.add(glass);
  for (const bx of [-0.55, 0, 0.55]) g.add(mesh(box(0.06, 0.5, 0.06), m.steel, bx, 0.42, cd / 2 + 0.08));
  g.add(mesh(box(1.2, 0.06, 0.08), m.steel, 0, 0.67, cd / 2 + 0.08));
  g.add(mesh(box(1.2, 0.06, 0.08), m.steel, 0, 0.17, cd / 2 + 0.08));
  // seat inside, visible through the glass
  g.add(mesh(box(0.45, 0.5, 0.1), m.dark, 0, 0.42, cd / 2 - 0.35));
  // weld seams and strapping between the four containers
  for (const sx of [-1, 1]) g.add(mesh(box(0.06, h + 0.04, 0.12), m.hazard, sx * 0.42, 0, -cd / 2 + 0.2));
  g.add(mesh(box(w + 0.06, 0.06, 0.12), m.hazard, 0, 0, -cd / 2 + 0.2));
  // shoulder mount brackets
  for (const s of [-1, 1]) {
    const br = mesh(box(0.3, 0.5, 0.7), m.motor, s * (w / 2 + 0.1), h * 0.32, 0);
    g.add(br);
  }
  // hip frame under the hull
  g.add(mesh(box(w * 0.8, 0.14, 0.9), m.motor, 0, -h / 2 - 0.03, 0));
  return { group: g, sockets: HULL_SOCKETS(w, h, cd) };
}

function haulerHull(m) {
  // One wide armoured box with chamfered nose and a big windscreen.
  const g = new THREE.Group();
  const w = 2.3, h = 1.5, d = 1.8;
  g.add(mesh(box(w, h, d), m.paint));
  const nose = mesh(box(w * 0.95, h * 0.5, 0.5), m.paint, 0, -h * 0.18, d / 2 + 0.15);
  nose.rotation.x = -0.35;
  g.add(nose);
  g.add(mesh(box(w * 0.6, h * 0.32, 0.05), m.glass, 0, h * 0.22, d / 2 + 0.03));
  g.add(mesh(box(w + 0.04, 0.12, d + 0.04), m.accent, 0, h / 2 - 0.12, 0));
  g.add(mesh(box(w + 0.04, 0.08, d + 0.04), m.hazard, 0, -h / 2 + 0.1, 0));
  for (let i = -3; i <= 3; i++) g.add(mesh(box(0.04, h * 0.6, 0.03), m.dark, i * 0.25, -0.05, -d / 2 - 0.01)); // vents
  for (const s of [-1, 1]) g.add(mesh(box(0.3, 0.5, 0.7), m.motor, s * (w / 2 + 0.1), h * 0.32, 0));
  g.add(mesh(box(w * 0.8, 0.14, 0.9), m.motor, 0, -h / 2 - 0.03, 0));
  return { group: g, sockets: HULL_SOCKETS(w, h, d, { head: { pos: [0, h * 0.42, d / 2 + 0.02], out: [0, 0, 1] } }) };
}

function scoutHull(m) {
  // Narrow, tall and angled: fast and light.
  const g = new THREE.Group();
  const w = 1.7, h = 1.45, d = 1.4;
  const body = mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.42, h, 6), m.paint);
  body.rotation.y = Math.PI / 6;
  body.scale.z = d / w;
  g.add(body);
  g.add(mesh(box(w * 0.55, 0.28, 0.05), m.glass, 0, h * 0.18, d / 2 - 0.02));
  g.add(mesh(box(w * 0.9, 0.1, d * 0.9), m.accent, 0, h / 2 - 0.05, 0));
  for (const s of [-1, 1]) g.add(mesh(box(0.3, 0.5, 0.6), m.motor, s * (w / 2 + 0.05), h * 0.32, 0));
  g.add(mesh(box(w * 0.8, 0.14, 0.8), m.motor, 0, -h / 2 - 0.03, 0));
  return { group: g, sockets: HULL_SOCKETS(w, h, d, {
    head: { pos: [0, h * 0.42, d / 2 - 0.05], out: [0, 0, 1] },
    armL: { pos: [w / 2 + 0.17, h * 0.32, 0], out: [1, 0, 0] },
    armR: { pos: [-w / 2 - 0.17, h * 0.32, 0], out: [-1, 0, 0] },
  }) };
}

// ---------- heads / sensors (on the front of the body, no head on top) ----------
function visorSensor(m) {
  const g = new THREE.Group();
  g.add(mesh(box(0.9, 0.22, 0.16), m.motor, 0, 0, 0.06));
  g.add(mesh(box(0.7, 0.07, 0.04), m.glow, 0, 0, 0.15));
  g.add(mesh(box(0.96, 0.05, 0.2), m.accent, 0, 0.13, 0.06));
  return g;
}
function domeSensor(m) {
  const g = new THREE.Group();
  const dome = mesh(new THREE.SphereGeometry(0.32, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m.paint, 0, 0, 0.05);
  dome.rotation.x = Math.PI / 2;
  g.add(dome);
  g.add(mesh(new THREE.SphereGeometry(0.11, 24, 16), m.glow, 0, 0, 0.32));
  g.add(mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 24), m.steel, 0, 0, 0.32));
  return g;
}
function twinOptics(m) {
  const g = new THREE.Group();
  g.add(mesh(box(0.8, 0.3, 0.12), m.paint, 0, 0, 0.06));
  for (const s of [-1, 1]) {
    const lens = mesh(cyl(0.1, 0.26, 24), m.motor, s * 0.22, 0, 0.22);
    lens.rotation.x = Math.PI / 2;
    g.add(lens);
    const eye = mesh(new THREE.CircleGeometry(0.07, 24), m.glow, s * 0.22, 0, 0.355);
    g.add(eye);
  }
  return g;
}

// ---------- arms: two containers + two motors (shoulder, elbow), then a hand or tool ----------
// Arm origin = shoulder joint centre. Hangs down -Y. side: +1 left, -1 right.
function armBase(m, side, label) {
  const g = new THREE.Group();
  const shoulder = new THREE.Group(); g.add(shoulder);
  const sm = motor(m, 0.3, 0.42);
  shoulder.add(sm);
  const upper = container(m, 0.5, 0.95, 0.55, { label, along: 'y' });
  upper.position.set(side * 0.08, -0.72, 0);
  shoulder.add(upper);
  const elbow = new THREE.Group();
  elbow.position.set(side * 0.08, -1.36, 0);
  shoulder.add(elbow);
  elbow.add(motor(m, 0.24, 0.5));
  const lower = container(m, 0.44, 0.8, 0.5, { along: 'y' });
  lower.position.y = -0.6;
  elbow.add(lower);
  shoulder.add(hoseBetween(m, new THREE.Vector3(side * 0.27, -0.2, -0.2), new THREE.Vector3(side * 0.27, -1.3, -0.2), 0.12));
  const hand = new THREE.Group();
  hand.position.y = -1.05;
  elbow.add(hand);
  g.userData.joints = { shoulder, elbow, hand };
  return { g, hand };
}

function gripperArm(m, side) {
  const { g, hand } = armBase(m, side, side > 0 ? 'L-ARM' : 'R-ARM');
  hand.add(mesh(box(0.42, 0.14, 0.42), m.motor));
  const fingers = [];
  for (const [fx, fz] of [[0.13, 0.12], [-0.13, 0.12], [0, -0.14]]) {
    const f = new THREE.Group();
    f.position.set(fx, -0.07, fz);
    const seg = mesh(box(0.08, 0.3, 0.09), m.steel, 0, -0.15, 0);
    const tip = mesh(box(0.07, 0.18, 0.08), m.dark, 0, -0.34, fz > 0 ? -0.04 : 0.04);
    tip.rotation.x = fz > 0 ? 0.4 : -0.4;
    f.add(seg, tip);
    f.rotation.x = fz > 0 ? -0.25 : 0.25;
    hand.add(f);
    fingers.push(f);
  }
  g.userData.joints.fingers = fingers;
  return g;
}
function crusherArm(m, side) {
  const { g, hand } = armBase(m, side, 'CRUSH');
  const fist = mesh(box(0.62, 0.55, 0.62), m.paint, 0, -0.25, 0);
  hand.add(fist);
  for (let i = -1.5; i <= 1.5; i++) hand.add(mesh(box(0.12, 0.12, 0.14), m.steel, i * 0.14, -0.38, 0.33));
  hand.add(mesh(box(0.66, 0.1, 0.66), m.hazard, 0, -0.02, 0));
  return g;
}
function cannonArm(m, side) {
  const { g, hand } = armBase(m, side, 'CANNON');
  const barrel = mesh(cyl(0.12, 1.0, 20), m.motor, 0, -0.45, 0.1);
  hand.add(barrel);
  hand.add(mesh(cyl(0.17, 0.25, 20), m.accent, 0, -0.05, 0.1));
  hand.add(mesh(cyl(0.15, 0.12, 20), m.steel, 0, -0.92, 0.1));
  const muzzle = mesh(new THREE.CircleGeometry(0.08, 16), m.glow, 0, -0.985, 0.1);
  muzzle.rotation.x = Math.PI / 2;
  hand.add(muzzle);
  hand.add(mesh(box(0.08, 0.6, 0.2), m.paint, side * 0.18, -0.35, 0.1));
  return g;
}
function cutterArm(m, side) {
  // A very strong cutter: a big spinning saw blade.
  const { g, hand } = armBase(m, side, 'CUTTER');
  hand.add(mesh(box(0.3, 0.3, 0.3), m.motor, 0, -0.1, 0));
  const blade = new THREE.Group();
  blade.position.set(side * 0.18, -0.42, 0);
  const disc = mesh(cyl(0.42, 0.03, 40), m.steel);
  disc.rotation.z = Math.PI / 2;
  blade.add(disc);
  for (let i = 0; i < 24; i++) {
    const tooth = mesh(box(0.035, 0.06, 0.05), m.dark);
    const a = (i / 24) * Math.PI * 2;
    tooth.position.set(0, Math.cos(a) * 0.43, Math.sin(a) * 0.43);
    tooth.rotation.x = -a;
    blade.add(tooth);
  }
  hand.add(blade);
  const guard = mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.1, 32, 1, true, 0, Math.PI), m.hazard, side * 0.18, -0.42, 0);
  guard.rotation.z = Math.PI / 2;
  guard.material = m.hazard.clone();
  guard.material.side = THREE.DoubleSide;
  hand.add(guard);
  g.userData.joints.spinner = blade;
  return g;
}

// ---------- legs: two containers + two motors (hip, knee), then a foot ----------
function legBase(m, side, label) {
  const g = new THREE.Group();
  const hip = new THREE.Group(); g.add(hip);
  hip.add(motor(m, 0.3, 0.5));
  const upper = container(m, 0.58, 1.0, 0.62, { label, along: 'y' });
  upper.position.y = -0.72;
  hip.add(upper);
  const knee = new THREE.Group();
  knee.position.y = -1.36;
  hip.add(knee);
  knee.add(motor(m, 0.28, 0.6));
  const lower = container(m, 0.52, 0.85, 0.58, { along: 'y' });
  lower.position.y = -0.62;
  knee.add(lower);
  const ankle = new THREE.Group();
  ankle.position.y = -1.12;
  knee.add(ankle);
  g.userData.joints = { hip, knee, ankle };
  return { g, ankle, knee, hip };
}
function containerLeg(m, side) {
  const { g, ankle } = legBase(m, side, side > 0 ? 'L-LEG' : 'R-LEG');
  ankle.add(mesh(box(0.5, 0.12, 0.5), m.motor));
  ankle.add(mesh(box(0.8, 0.16, 1.15), m.paint, 0, -0.14, 0.12));
  ankle.add(mesh(box(0.82, 0.05, 1.17), m.dark, 0, -0.24, 0.12));
  ankle.add(mesh(box(0.84, 0.06, 0.1), m.hazard, 0, -0.1, 0.7));
  return g;
}
function pistonLeg(m, side) {
  const { g, ankle, knee, hip } = legBase(m, side, 'HYDRO');
  for (const s of [-1, 1]) {
    const p = piston(m, 1.2);
    p.position.set(s * 0.34, -0.15, 0.2);
    hip.add(p);
    const p2 = piston(m, 1.0);
    p2.position.set(s * 0.31, -0.1, -0.2);
    knee.add(p2);
  }
  ankle.add(mesh(box(0.5, 0.12, 0.5), m.motor));
  for (const tz of [0.45, -0.25]) {
    const toe = mesh(box(0.25, 0.12, 0.6), m.paint, 0, -0.15, tz);
    g.userData.joints.ankle.add(toe);
    for (const tx of [-0.28, 0.28]) {
      const side2 = mesh(box(0.22, 0.12, 0.5), m.accent, tx, -0.15, tz * 0.8);
      side2.rotation.y = tx * (tz > 0 ? -0.9 : 0.9);
      ankle.add(side2);
    }
  }
  return g;
}
function treadLeg(m, side) {
  const { g, ankle } = legBase(m, side, 'TRACK');
  // a small tank track instead of a foot
  const track = new THREE.Group();
  track.position.set(0, -0.32, 0.1);
  const len = 1.4, r = 0.25;
  const belt = mesh(new THREE.CapsuleGeometry(r, len - 2 * r, 8, 24), m.dark);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1.5, 1, 1);
  track.add(belt);
  for (let i = 0; i < 4; i++) {
    const wheel = mesh(cyl(0.17, 0.42, 20), m.steel, 0, -0.04, -0.5 + i * 0.33);
    wheel.rotation.z = Math.PI / 2;
    track.add(wheel);
  }
  track.add(mesh(box(0.46, 0.08, len * 0.85), m.paint, 0, 0.27, 0));
  ankle.add(track);
  g.userData.joints.track = track;
  return g;
}

// ---------- back packs ----------
function powerPack(m) {
  const g = new THREE.Group();
  g.add(mesh(box(1.2, 1.0, 0.45), m.paint, 0, 0, -0.22));
  for (const s of [-1, 0, 1]) {
    const cell = mesh(cyl(0.13, 0.85, 20), m.steel, s * 0.36, 0, -0.5);
    g.add(cell);
    g.add(mesh(cyl(0.135, 0.06, 20), m.glow, s * 0.36, 0.2, -0.5));
  }
  g.add(mesh(box(1.24, 0.08, 0.5), m.hazard, 0, -0.45, -0.22));
  return g;
}
function jumpJets(m) {
  const g = new THREE.Group();
  g.add(mesh(box(1.0, 0.7, 0.35), m.motor, 0, 0.1, -0.17));
  for (const s of [-1, 1]) {
    const noz = mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.45, 20, 1, true), m.steel, s * 0.32, -0.38, -0.32);
    g.add(noz);
    const fire = mesh(new THREE.CircleGeometry(0.15, 20), m.glow, s * 0.32, -0.55, -0.32);
    fire.rotation.x = Math.PI / 2;
    g.add(fire);
    g.add(mesh(cyl(0.18, 0.7, 20), m.paint, s * 0.32, 0.12, -0.32));
  }
  return g;
}
function radioMast(m) {
  const g = new THREE.Group();
  g.add(mesh(box(0.8, 0.8, 0.3), m.paint, 0, 0, -0.15));
  g.add(mesh(cyl(0.04, 2.0, 8), m.steel, 0.25, 1.1, -0.25));
  g.add(mesh(cyl(0.03, 1.3, 8), m.steel, -0.2, 0.75, -0.25));
  g.add(mesh(new THREE.SphereGeometry(0.06, 12, 8), m.glow, 0.25, 2.12, -0.25));
  const dish = mesh(new THREE.SphereGeometry(0.28, 24, 8, 0, Math.PI * 2, 0, 0.9), m.steel, -0.2, 1.45, -0.25);
  dish.rotation.x = -1.2;
  g.add(dish);
  return g;
}

// ---------- shoulder attachments ----------
function floodlight(m) {
  const g = new THREE.Group();
  g.add(mesh(box(0.2, 0.18, 0.2), m.motor, 0, 0.09, 0));
  const head = mesh(box(0.5, 0.32, 0.3), m.paint, 0, 0.36, 0.05);
  g.add(head);
  for (const s of [-1, 1]) g.add(mesh(new THREE.CircleGeometry(0.11, 20), m.glow, s * 0.12, 0.36, 0.205));
  g.userData.lamp = new THREE.Vector3(0, 0.36, 0.3);
  return g;
}
function missilePod(m) {
  const g = new THREE.Group();
  g.add(mesh(box(0.2, 0.18, 0.2), m.motor, 0, 0.09, 0));
  g.add(mesh(box(0.55, 0.45, 0.7), m.paint, 0, 0.42, 0));
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const tube = mesh(cyl(0.08, 0.05, 16), m.dark, -0.12 + i * 0.24, 0.31 + j * 0.22, 0.36);
    tube.rotation.x = Math.PI / 2;
    g.add(tube);
    const tip = mesh(new THREE.ConeGeometry(0.06, 0.1, 12), m.accent, -0.12 + i * 0.24, 0.31 + j * 0.22, 0.4);
    tip.rotation.x = Math.PI / 2;
    g.add(tip);
  }
  return g;
}
function armorPlate(m) {
  const g = new THREE.Group();
  const plate = mesh(box(0.9, 0.12, 1.1), m.paint, 0, 0.12, 0);
  plate.rotation.z = 0.15;
  g.add(plate);
  g.add(mesh(box(0.92, 0.04, 0.2), m.hazard, 0.02, 0.2, 0.5));
  for (const s of [-1, 1]) for (const t of [-1, 1]) g.add(mesh(cyl(0.035, 0.04, 8), m.steel, s * 0.3, 0.2, t * 0.4));
  return g;
}
function beacon(m) {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.12, 0.2, 16), m.motor, 0, 0.1, 0));
  const glass = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 16), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff7a00, emissiveIntensity: 3 }), 0, 0.31, 0);
  g.add(glass);
  g.userData.beacon = glass;
  return g;
}

// ---------- more parts (round 2) ----------
function sixPackHull(m) {
  // Six large containers: three wide, two high. Bigger and tougher than the quad.
  const g = new THREE.Group();
  const cw = 0.92, ch = 0.74, cd = 1.8;
  let i = 0;
  for (const sy of [-1, 1]) for (const sx of [-1, 0, 1]) {
    const c = container(m, cw, ch, cd, { label: sx === 1 ? `MK-1${i}` : '' });
    c.position.set(sx * (cw + 0.02), sy * (ch / 2 + 0.01), 0);
    g.add(c);
    i++;
  }
  const w = cw * 3 + 0.04, h = ch * 2;
  g.add(mesh(box(0.95, 0.4, 0.04), m.glass, 0, 0.4, cd / 2 + 0.05));
  for (const bx of [-0.48, 0, 0.48]) g.add(mesh(box(0.06, 0.48, 0.06), m.steel, bx, 0.4, cd / 2 + 0.08));
  g.add(mesh(box(w + 0.06, 0.06, 0.12), m.hazard, 0, 0, -cd / 2 + 0.2));
  for (const s of [-1, 1]) g.add(mesh(box(0.3, 0.5, 0.7), m.motor, s * (w / 2 + 0.1), h * 0.32, 0));
  g.add(mesh(box(w * 0.7, 0.14, 0.9), m.motor, 0, -h / 2 - 0.03, 0));
  return { group: g, sockets: HULL_SOCKETS(w, h, cd, {
    legL: { pos: [w * 0.22, -h / 2 - 0.05, 0], out: [0, 0, 1] },
    legR: { pos: [-w * 0.22, -h / 2 - 0.05, 0], out: [0, 0, 1] },
  }) };
}

function tankHull(m) {
  // Low and wide with sloped armour, like a tank turret on legs.
  const g = new THREE.Group();
  const w = 2.4, h = 1.3, d = 2.0;
  g.add(mesh(box(w, h * 0.7, d), m.paint, 0, -h * 0.15, 0));
  const top = mesh(box(w * 0.8, h * 0.4, d * 0.8), m.paint, 0, h * 0.35, -0.05);
  g.add(top);
  for (const s of [-1, 1]) {
    const slope = mesh(box(0.1, h * 0.75, d), m.accent, s * (w / 2 - 0.02), 0.05, 0);
    slope.rotation.z = s * 0.35;
    g.add(slope);
  }
  const front = mesh(box(w * 0.98, h * 0.55, 0.12), m.accent, 0, 0, d / 2 + 0.05);
  front.rotation.x = -0.4;
  g.add(front);
  g.add(mesh(box(w * 0.55, 0.12, 0.05), m.glass, 0, h * 0.4, d * 0.4 + 0.02));
  g.add(mesh(box(w + 0.04, 0.08, d + 0.04), m.hazard, 0, -h / 2 + 0.06, 0));
  for (let i = -2; i <= 2; i++) g.add(mesh(cyl(0.05, 0.04, 8), m.steel, i * 0.4, -0.05, d / 2 + 0.12).rotateX(Math.PI / 2));
  for (const s of [-1, 1]) g.add(mesh(box(0.3, 0.5, 0.7), m.motor, s * (w / 2 + 0.1), h * 0.25, 0));
  g.add(mesh(box(w * 0.7, 0.14, 0.9), m.motor, 0, -h / 2 - 0.03, 0));
  return { group: g, sockets: HULL_SOCKETS(w, h, d, {
    head: { pos: [0, h * 0.35, d * 0.4 + 0.02], out: [0, 0, 1] },
    armL: { pos: [w / 2 + 0.22, h * 0.25, 0], out: [1, 0, 0] },
    armR: { pos: [-w / 2 - 0.22, h * 0.25, 0], out: [-1, 0, 0] },
  }) };
}

function bubbleHull(m) {
  // A container base with a big round glass bubble on the front for the pilot.
  const g = new THREE.Group();
  const w = 2.0, h = 1.5, d = 1.6;
  const base = container(m, w, h, d, { label: 'BUBBLE' });
  g.add(base);
  const bubble = mesh(new THREE.SphereGeometry(0.62, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m.glass, 0, 0.1, d / 2);
  bubble.rotation.x = Math.PI / 2;
  g.add(bubble);
  g.add(mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 32), m.steel, 0, 0.1, d / 2 + 0.01));
  g.add(mesh(box(0.4, 0.45, 0.1), m.dark, 0, 0.1, d / 2 - 0.25));
  for (const s of [-1, 1]) g.add(mesh(box(0.3, 0.5, 0.7), m.motor, s * (w / 2 + 0.1), h * 0.32, 0));
  g.add(mesh(box(w * 0.8, 0.14, 0.9), m.motor, 0, -h / 2 - 0.03, 0));
  return { group: g, sockets: HULL_SOCKETS(w, h, d, { head: { pos: [0, h * 0.4, d / 2 + 0.02], out: [0, 0, 1] } }) };
}

function spiderEyes(m) {
  const g = new THREE.Group();
  g.add(mesh(box(0.8, 0.36, 0.12), m.motor, 0, 0, 0.06));
  for (const [x, y, r] of [[-0.22, 0.06, 0.09], [0.22, 0.06, 0.09], [-0.08, 0.08, 0.06], [0.08, 0.08, 0.06], [-0.3, -0.09, 0.05], [0.3, -0.09, 0.05], [-0.12, -0.08, 0.045], [0.12, -0.08, 0.045]]) {
    g.add(mesh(new THREE.SphereGeometry(r, 16, 10), m.glow, x, y, 0.13));
  }
  return g;
}
function searchlightEye(m) {
  const g = new THREE.Group();
  g.add(mesh(box(0.5, 0.5, 0.12), m.paint, 0, 0, 0.06));
  const can = mesh(cyl(0.2, 0.35, 24), m.motor, 0, 0, 0.3);
  can.rotation.x = Math.PI / 2;
  g.add(can);
  g.add(mesh(new THREE.CircleGeometry(0.17, 24), m.glow, 0, 0, 0.48));
  g.add(mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 24), m.accent, 0, 0, 0.48));
  return g;
}
function radarBar(m) {
  const g = new THREE.Group();
  g.add(mesh(box(1.2, 0.16, 0.18), m.motor, 0, 0, 0.08));
  for (let i = -4; i <= 4; i++) g.add(mesh(box(0.08, 0.06, 0.02), m.glow, i * 0.12, 0, 0.18));
  g.add(mesh(box(1.24, 0.04, 0.22), m.accent, 0, 0.1, 0.08));
  return g;
}

function drillArm(m, side) {
  const { g, hand } = armBase(m, side, 'DRILL');
  hand.add(mesh(cyl(0.2, 0.25, 20), m.motor, 0, -0.1, 0));
  const drill = new THREE.Group();
  drill.position.y = -0.25;
  const cone = mesh(new THREE.ConeGeometry(0.2, 0.8, 20), m.steel, 0, -0.4, 0);
  cone.rotation.x = Math.PI;
  drill.add(cone);
  for (let i = 0; i < 5; i++) {
    const ridge = mesh(new THREE.TorusGeometry(0.17 - i * 0.03, 0.02, 6, 20), m.dark, 0, -0.1 - i * 0.14, 0);
    ridge.rotation.x = Math.PI / 2 + 0.2;
    drill.add(ridge);
  }
  hand.add(drill);
  g.userData.joints.drill = drill;
  return g;
}
function shieldArm(m, side) {
  const { g, hand } = armBase(m, side, 'SHIELD');
  hand.add(mesh(box(0.3, 0.3, 0.3), m.motor, 0, -0.1, 0));
  const shield = mesh(box(0.1, 1.4, 1.0), m.paint, side * 0.3, -0.3, 0.1);
  hand.add(shield);
  hand.add(mesh(box(0.12, 1.2, 0.08), m.hazard, side * 0.31, -0.3, 0.55));
  hand.add(mesh(new THREE.CircleGeometry(0.12, 20), m.glow, side * 0.36, -0.1, 0.1).rotateY(side * Math.PI / 2));
  return g;
}
function pincerArm(m, side) {
  const { g, hand } = armBase(m, side, 'CLAW');
  hand.add(mesh(box(0.45, 0.2, 0.45), m.motor));
  const jaws = [];
  for (const s of [-1, 1]) {
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.1, s * 0.12);
    const a = mesh(box(0.16, 0.6, 0.1), m.paint, 0, -0.3, s * 0.08);
    a.rotation.x = s * 0.25;
    const tip = mesh(box(0.14, 0.25, 0.1), m.accent, 0, -0.62, -s * 0.02);
    tip.rotation.x = -s * 0.5;
    jaw.add(a, tip);
    hand.add(jaw);
    jaws.push(jaw);
  }
  g.userData.joints.jaws = jaws;
  return g;
}
function plasmaArm(m, side) {
  const { g, hand } = armBase(m, side, 'PLASMA');
  hand.add(mesh(box(0.4, 0.4, 0.5), m.paint, 0, -0.15, 0.05));
  for (const s of [-1, 1]) {
    hand.add(mesh(cyl(0.08, 0.8, 16), m.motor, s * 0.12, -0.6, 0.1));
    for (let i = 0; i < 3; i++) hand.add(mesh(cyl(0.1, 0.04, 16), m.glow, s * 0.12, -0.45 - i * 0.15, 0.1));
  }
  return g;
}

function raptorLeg(m, side) {
  // A backwards knee, like a bird: the shin angles back and the foot has big toes.
  const { g, ankle, knee, hip } = legBase(m, side, 'RAPTOR');
  hip.children[1].rotation.x = -0.25;
  knee.position.z = 0.3;
  knee.children[1].rotation.x = 0.45;
  knee.children[1].position.z = -0.25;
  ankle.position.z = -0.5;
  ankle.add(mesh(box(0.42, 0.14, 0.42), m.motor));
  for (const a of [-0.35, 0, 0.35]) {
    const toe = mesh(box(0.14, 0.12, 0.75), m.paint, Math.sin(a) * 0.3, -0.16, 0.3);
    toe.rotation.y = a;
    ankle.add(toe);
  }
  ankle.add(mesh(box(0.14, 0.12, 0.4), m.accent, 0, -0.16, -0.35));
  return g;
}
function wheelLeg(m, side) {
  const { g, ankle } = legBase(m, side, 'WHEEL');
  ankle.add(mesh(box(0.5, 0.12, 0.5), m.motor));
  const wheel = new THREE.Group();
  wheel.position.y = -0.1;
  const tyre = mesh(new THREE.TorusGeometry(0.34, 0.14, 12, 28), m.dark);
  tyre.rotation.y = Math.PI / 2;
  wheel.add(tyre);
  const hub = mesh(cyl(0.22, 0.24, 20), m.steel);
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);
  wheel.position.y = -0.38;
  ankle.add(wheel);
  for (const s of [-1, 1]) ankle.add(mesh(box(0.06, 0.5, 0.12), m.accent, s * 0.2, -0.2, 0));
  g.userData.joints.wheel = wheel;
  return g;
}
function stiltLeg(m, side) {
  // Extra long and thin: tall and fast, but less armour.
  const g = new THREE.Group();
  const hip = new THREE.Group(); g.add(hip);
  hip.add(motor(m, 0.26, 0.45));
  const upper = container(m, 0.42, 1.3, 0.45, { label: 'STILT', along: 'y' });
  upper.position.y = -0.85;
  hip.add(upper);
  const knee = new THREE.Group();
  knee.position.y = -1.62;
  hip.add(knee);
  knee.add(motor(m, 0.22, 0.48));
  knee.add(mesh(cyl(0.11, 1.4, 12), m.steel, 0, -0.78, 0));
  knee.add(mesh(cyl(0.16, 0.5, 12), m.paint, 0, -0.35, 0));
  const ankle = new THREE.Group();
  ankle.position.y = -1.5;
  knee.add(ankle);
  ankle.add(mesh(box(0.6, 0.12, 0.9), m.paint, 0, -0.1, 0.1));
  ankle.add(mesh(box(0.62, 0.05, 0.92), m.dark, 0, -0.18, 0.1));
  g.userData.joints = { hip, knee, ankle };
  return g;
}

function missileRack(m) {
  const g = new THREE.Group();
  g.add(mesh(box(1.1, 0.9, 0.35), m.paint, 0, 0.1, -0.18));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const t = mesh(cyl(0.09, 0.7, 12), m.dark, -0.3 + i * 0.3, 0.25 + j * 0.25, -0.5);
    g.add(t);
    g.add(mesh(new THREE.ConeGeometry(0.08, 0.15, 12), m.accent, -0.3 + i * 0.3, 0.67 + j * 0.25, -0.5));
  }
  return g;
}
function cargoBox(m) {
  const g = new THREE.Group();
  const c = container(m, 1.1, 0.9, 0.7, { label: 'CARGO', along: 'y' });
  c.position.set(0, 0.05, -0.38);
  g.add(c);
  for (const s of [-1, 1]) g.add(mesh(box(0.06, 1.0, 0.06), m.hazard, s * 0.4, 0.05, -0.74));
  return g;
}
function shieldGen(m) {
  const g = new THREE.Group();
  g.add(mesh(box(0.9, 0.9, 0.35), m.motor, 0, 0, -0.18));
  const ring = mesh(new THREE.TorusGeometry(0.45, 0.06, 10, 40), m.glow, 0, 0.1, -0.42);
  g.add(ring);
  g.add(mesh(new THREE.SphereGeometry(0.16, 20, 12), m.glow, 0, 0.1, -0.42));
  g.userData.ring = ring;
  return g;
}

function gunTurret(m) {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.18, 0.18, 16), m.motor, 0, 0.09, 0));
  g.add(mesh(box(0.42, 0.28, 0.45), m.paint, 0, 0.32, 0));
  for (const s of [-1, 1]) {
    const b = mesh(cyl(0.04, 0.6, 10), m.steel, s * 0.1, 0.32, 0.45);
    b.rotation.x = Math.PI / 2;
    g.add(b);
  }
  return g;
}
function radarDish(m) {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.05, 0.4, 8), m.steel, 0, 0.2, 0));
  const dish = mesh(new THREE.SphereGeometry(0.4, 24, 8, 0, Math.PI * 2, 0, 0.8), m.steel, 0, 0.5, 0);
  dish.rotation.x = -1.0;
  g.add(dish);
  g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), m.glow, 0, 0.62, 0.15));
  g.userData.dish = dish;
  return g;
}
function spikePad(m) {
  const g = new THREE.Group();
  const pad = mesh(new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.paint, 0, 0.02, 0);
  pad.scale.set(1, 0.6, 1.2);
  g.add(pad);
  for (const [x, z] of [[0, 0], [0.22, 0.2], [-0.22, 0.2], [0.22, -0.25], [-0.22, -0.25]]) {
    g.add(mesh(new THREE.ConeGeometry(0.07, 0.35, 10), m.steel, x, 0.42, z));
  }
  return g;
}

// ---------- round 3: style families (Samurai, Junkyard, Racer, Tesla) ----------
const rust = () => new THREE.MeshStandardMaterial({ color: 0x7a3f22, metalness: 0.4, roughness: 0.9, roughnessMap: tex.paintWear() });
const tyreMat = () => new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });

function samuraiHull(m) {
  // Layered armour plates like a samurai's chest, with a gold crest on the front.
  const g = new THREE.Group();
  const w = 2.1, h = 1.6, d = 1.6;
  g.add(mesh(box(w * 0.9, h, d * 0.9), m.dark));
  for (let i = 0; i < 5; i++) {
    const y = h / 2 - 0.16 - i * 0.3;
    const plate = mesh(box(w + i * 0.04, 0.26, d + i * 0.03), i % 2 ? m.accent : m.paint, 0, y, 0);
    plate.rotation.x = -0.06;
    g.add(plate);
    g.add(mesh(box(w + i * 0.04 + 0.02, 0.03, 0.04), m.steel, 0, y - 0.12, (d + i * 0.03) / 2 + 0.01));
  }
  g.add(mesh(box(0.9, 0.18, 0.04), m.glass, 0, h * 0.2, d / 2 + 0.06));
  // crest: two golden blades in a V above the window
  for (const s of [-1, 1]) {
    const blade = mesh(box(0.08, 0.7, 0.04), m.accent, s * 0.22, h / 2 + 0.25, d / 2 - 0.05);
    blade.rotation.z = -s * 0.5;
    g.add(blade);
  }
  g.add(mesh(new THREE.SphereGeometry(0.09, 16, 10), m.glow, 0, h / 2 + 0.02, d / 2 - 0.02));
  for (const s of [-1, 1]) {
    const pad = mesh(box(0.35, 0.5, 0.75), m.paint, s * (w / 2 + 0.12), h * 0.32, 0);
    pad.rotation.z = s * 0.25;
    g.add(pad);
  }
  g.add(mesh(box(w * 0.8, 0.14, 0.9), m.motor, 0, -h / 2 - 0.03, 0));
  return { group: g, sockets: HULL_SOCKETS(w, h, d, { head: { pos: [0, -h * 0.05, d / 2 + 0.05], out: [0, 0, 1] } }) };
}

function junkHull(m) {
  // Bolted together from whatever was lying around: odd containers, a rusty panel, an old tyre as a bumper.
  const g = new THREE.Group();
  const r = rust();
  const a = container(m, 1.2, 0.8, 1.6, { label: 'SCRAP' });
  a.position.set(0.45, -0.38, 0);
  a.rotation.y = 0.04;
  const b = container(m, 0.95, 0.8, 1.45, { label: '' });
  b.position.set(-0.55, -0.4, 0.06);
  const c = container(m, 1.4, 0.72, 1.5, { label: '' });
  c.position.set(-0.1, 0.4, -0.04);
  c.rotation.z = -0.04;
  g.add(a, b, c);
  g.add(mesh(box(0.9, 0.5, 0.06), r, 0.35, -0.3, 0.86));
  for (let i = 0; i < 6; i++) g.add(mesh(cyl(0.025, 0.03, 8), m.steel, 0.0 + (i % 3) * 0.33, -0.12 - Math.floor(i / 3) * 0.36, 0.9).rotateX(Math.PI / 2));
  g.add(mesh(box(0.7, 0.3, 0.04), m.glass, -0.2, 0.45, 0.74));
  const tyre = mesh(new THREE.TorusGeometry(0.32, 0.12, 12, 28), tyreMat(), -0.55, -0.4, 0.82);
  g.add(tyre);
  g.add(mesh(box(0.08, 0.9, 0.08), r, 0.85, 0.35, 0.6).rotateZ(0.3));
  const w = 2.2, h = 1.6, d = 1.6;
  for (const s of [-1, 1]) g.add(mesh(box(0.3, 0.5, 0.7), m.motor, s * (w / 2 + 0.1), h * 0.32, 0));
  g.add(mesh(box(w * 0.8, 0.14, 0.9), m.motor, 0, -h / 2 - 0.03, 0));
  return { group: g, sockets: HULL_SOCKETS(w, h, d, { head: { pos: [0.3, 0.1, 0.92], out: [0, 0, 1] } }) };
}

function racerHull(m) {
  // A sleek capsule with a long canopy and tail fins. Light and fast.
  const g = new THREE.Group();
  const w = 1.8, h = 1.3, d = 2.0;
  const body = mesh(new THREE.CapsuleGeometry(0.62, d - 1.1, 12, 32), m.paint);
  body.rotation.x = Math.PI / 2;
  body.scale.set(w / 1.24, 1, h / 1.24);
  g.add(body);
  const canopy = mesh(new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m.glass, 0, h * 0.3, 0.35);
  canopy.scale.set(0.9, 0.6, 1.6);
  g.add(canopy);
  g.add(mesh(box(w * 1.02, 0.06, d * 0.7), m.accent, 0, 0, 0));
  for (const s of [-1, 1]) {
    const fin = mesh(box(0.05, 0.55, 0.6), m.accent, s * 0.35, h * 0.45, -d * 0.4);
    fin.rotation.x = 0.5;
    g.add(fin);
    g.add(mesh(box(0.3, 0.45, 0.6), m.motor, s * (w / 2 + 0.08), h * 0.3, 0));
  }
  g.add(mesh(box(0.5, 0.05, 0.03), m.glow, 0, -0.1, d / 2 + 0.02));
  g.add(mesh(box(w * 0.75, 0.14, 0.85), m.motor, 0, -h / 2 - 0.03, 0));
  return { group: g, sockets: HULL_SOCKETS(w, h, d, { head: { pos: [0, -0.12, d / 2 + 0.02], out: [0, 0, 1] } }) };
}

function grilleSensor(m) {
  // A fierce grille across the front with glowing eyes behind the bars.
  const g = new THREE.Group();
  g.add(mesh(box(0.95, 0.4, 0.14), m.dark, 0, 0, 0.05));
  for (const s of [-1, 1]) g.add(mesh(box(0.22, 0.09, 0.03), m.glow, s * 0.24, 0.03, 0.12));
  for (let i = 0; i < 4; i++) g.add(mesh(box(1.0, 0.035, 0.05), m.steel, 0, -0.13 + i * 0.09, 0.15));
  g.add(mesh(box(1.02, 0.06, 0.18), m.accent, 0, 0.21, 0.06));
  return g;
}
function sweepScanner(m) {
  // A dark bar with a light that sweeps side to side.
  const g = new THREE.Group();
  g.add(mesh(box(1.0, 0.18, 0.14), m.motor, 0, 0, 0.05));
  g.add(mesh(box(0.92, 0.1, 0.02), m.dark, 0, 0, 0.13));
  const dot = mesh(box(0.12, 0.08, 0.03), m.glow, 0, 0, 0.14);
  dot.userData.sweep = 0.38;
  g.add(dot);
  return g;
}

function swordArm(m, side) {
  const { g, hand } = armBase(m, side, 'BLADE');
  hand.add(mesh(box(0.35, 0.18, 0.35), m.motor));
  hand.add(mesh(box(0.5, 0.08, 0.2), m.accent, 0, -0.14, 0));
  hand.add(mesh(cyl(0.06, 0.25, 12), m.dark, 0, -0.3, 0));
  const blade = mesh(box(0.06, 1.5, 0.22), m.glow, 0, -1.2, 0);
  hand.add(blade);
  hand.add(mesh(box(0.03, 1.5, 0.25), m.steel, 0, -1.2, 0));
  return g;
}
function wreckerArm(m, side) {
  const { g, hand } = armBase(m, side, 'WRECK');
  hand.add(mesh(box(0.35, 0.2, 0.35), m.motor));
  const chain = new THREE.Group();
  chain.position.y = -0.1;
  for (let i = 0; i < 4; i++) {
    const link = mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 12), m.steel, 0, -0.08 - i * 0.1, 0);
    link.rotation.y = i % 2 ? Math.PI / 2 : 0;
    chain.add(link);
  }
  const ball = mesh(new THREE.SphereGeometry(0.34, 24, 16), m.dark, 0, -0.75, 0);
  chain.add(ball);
  for (const [x, y, z] of [[0.34, 0, 0], [-0.34, 0, 0], [0, 0, 0.34], [0, 0, -0.34], [0, -0.34, 0]]) {
    const spike = mesh(new THREE.ConeGeometry(0.06, 0.18, 8), m.steel, x, -0.75 + y, z);
    spike.lookAt(new THREE.Vector3(x * 3, -0.75 + y * 3, z * 3));
    spike.rotateX(Math.PI / 2);
    chain.add(spike);
  }
  hand.add(chain);
  chain.userData.swing = true;
  return g;
}
function teslaArm(m, side) {
  const { g, hand } = armBase(m, side, 'TESLA');
  hand.add(mesh(box(0.38, 0.22, 0.38), m.motor));
  hand.add(mesh(cyl(0.07, 0.6, 12), m.copper, 0, -0.4, 0));
  for (let i = 0; i < 4; i++) hand.add(mesh(new THREE.TorusGeometry(0.16 - i * 0.02, 0.03, 8, 20), m.copper, 0, -0.2 - i * 0.12, 0).rotateX(Math.PI / 2));
  const orb = mesh(new THREE.SphereGeometry(0.17, 20, 14), m.glow, 0, -0.82, 0);
  orb.userData.pulse = true;
  hand.add(orb);
  return g;
}

function spiderLeg(m, side) {
  // A high arched knee and three sharp claws.
  const { g, ankle, knee, hip } = legBase(m, side, 'SPIDER');
  hip.children[1].rotation.x = 0.2;
  knee.add(mesh(new THREE.ConeGeometry(0.12, 0.5, 10), m.accent, 0, 0.35, -0.1));
  ankle.add(mesh(box(0.4, 0.14, 0.4), m.motor));
  for (const a of [0, 2.1, -2.1]) {
    const claw = new THREE.Group();
    claw.rotation.y = a;
    const seg = mesh(box(0.12, 0.12, 0.55), m.paint, 0, -0.08, 0.3);
    seg.rotation.x = -0.35;
    const tip = mesh(new THREE.ConeGeometry(0.07, 0.3, 8), m.steel, 0, -0.2, 0.6);
    tip.rotation.x = Math.PI / 2 + 0.6;
    claw.add(seg, tip);
    ankle.add(claw);
  }
  return g;
}
function hoverLeg(m, side) {
  // No foot: a glowing hover pad that floats just off the ground.
  const { g, ankle } = legBase(m, side, 'HOVER');
  ankle.add(mesh(new THREE.CylinderGeometry(0.3, 0.45, 0.2, 24), m.paint, 0, -0.08, 0));
  ankle.add(mesh(cyl(0.5, 0.06, 32), m.motor, 0, -0.2, 0));
  const ring = mesh(new THREE.TorusGeometry(0.42, 0.04, 10, 40), m.glow, 0, -0.26, 0);
  ring.rotation.x = Math.PI / 2;
  ring.userData.pulse = true;
  ankle.add(ring);
  ankle.add(mesh(new THREE.CircleGeometry(0.36, 32), m.glow, 0, -0.25, 0).rotateX(Math.PI / 2));
  return g;
}
function greaveLeg(m, side) {
  // Samurai armour: overlapping shin guards and a heavy sandal foot.
  const { g, ankle, knee, hip } = legBase(m, side, 'GUARD');
  for (let i = 0; i < 3; i++) {
    hip.add(mesh(box(0.7, 0.3, 0.12), i % 2 ? m.accent : m.paint, 0, -0.45 - i * 0.28, 0.36).rotateX(-0.12));
    knee.add(mesh(box(0.64, 0.28, 0.12), i % 2 ? m.paint : m.accent, 0, -0.3 - i * 0.26, 0.33).rotateX(-0.1));
  }
  knee.add(mesh(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.accent, 0, 0, 0.3).rotateX(Math.PI / 2));
  ankle.add(mesh(box(0.5, 0.12, 0.5), m.motor));
  ankle.add(mesh(box(0.75, 0.2, 1.05), m.dark, 0, -0.16, 0.1));
  ankle.add(mesh(box(0.78, 0.06, 1.08), m.accent, 0, -0.04, 0.1));
  return g;
}

function gliderWings(m) {
  // Folding wings with thrusters underneath, for long gliding jumps.
  const g = new THREE.Group();
  g.add(mesh(box(0.8, 0.8, 0.35), m.motor, 0, 0, -0.18));
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(s * 0.35, 0.25, -0.35);
    wing.rotation.z = s * 0.35;
    for (let i = 0; i < 3; i++) {
      const fin = mesh(box(0.9 - i * 0.15, 0.08, 0.5), i === 0 ? m.paint : m.accent, s * (0.5 - i * 0.05), -i * 0.18, -i * 0.06);
      fin.rotation.z = -s * i * 0.18;
      wing.add(fin);
    }
    wing.add(mesh(box(0.7, 0.03, 0.04), m.glow, s * 0.5, 0.05, 0.26));
    g.add(wing);
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.3, 16, 1, true), m.steel, s * 0.25, -0.5, -0.3));
  }
  return g;
}
function fusionReactor(m) {
  // A glowing reactor core in a cage. Lots of power.
  const g = new THREE.Group();
  g.add(mesh(box(1.0, 1.0, 0.3), m.motor, 0, 0, -0.15));
  const core = mesh(cyl(0.2, 0.8, 24), m.glow, 0, 0, -0.55);
  core.userData.pulse = true;
  g.add(core);
  g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.85, 24, 1, true), m.glass, 0, 0, -0.55));
  for (const a of [0, 1, 2, 3]) g.add(mesh(cyl(0.03, 0.95, 8), m.steel, Math.cos(a * Math.PI / 2 + 0.78) * 0.32, 0, -0.55 + Math.sin(a * Math.PI / 2 + 0.78) * 0.32));
  for (const y of [-0.45, 0.45]) g.add(mesh(cyl(0.36, 0.08, 24), m.accent, 0, y, -0.55));
  const ring = mesh(new THREE.TorusGeometry(0.4, 0.03, 8, 40), m.glow, 0, 0, -0.55);
  ring.rotation.x = Math.PI / 2;
  ring.userData.ring = true;
  g.add(ring);
  return g;
}

function mortarPod(m) {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.2, 0.15, 16), m.motor, 0, 0.08, 0));
  const tube = mesh(cyl(0.16, 0.6, 20), m.paint, 0, 0.4, -0.05);
  tube.rotation.x = -0.4;
  g.add(tube);
  g.add(mesh(cyl(0.18, 0.06, 20), m.accent, 0, 0.62, 0.05).rotateX(-0.4));
  g.add(mesh(box(0.08, 0.3, 0.2), m.steel, 0.18, 0.25, 0));
  return g;
}
function bannerPole(m) {
  // A tall samurai banner that flutters as you walk.
  const g = new THREE.Group();
  g.add(mesh(cyl(0.04, 1.8, 8), m.steel, 0, 0.9, -0.1));
  g.add(mesh(box(0.5, 0.04, 0.04), m.steel, 0.25, 1.75, -0.1));
  const flag = new THREE.Group();
  flag.position.set(0.02, 1.73, -0.1);
  flag.add(mesh(box(0.45, 0.95, 0.012), m.paint, 0.23, -0.48, 0));
  for (const z of [-0.008, 0.008]) flag.add(mesh(new THREE.CircleGeometry(0.12, 20), m.accent, 0.23, -0.4, z).rotateY(z < 0 ? Math.PI : 0));
  flag.userData.flag = true;
  g.add(flag);
  return g;
}
function exhaustStacks(m) {
  const g = new THREE.Group();
  g.add(mesh(box(0.4, 0.15, 0.35), m.motor, 0, 0.07, 0));
  for (const [x, h] of [[-0.1, 0.8], [0.1, 0.65]]) {
    g.add(mesh(cyl(0.07, h, 14), m.steel, x, 0.15 + h / 2, -0.05));
    g.add(mesh(cyl(0.085, 0.06, 14), m.dark, x, 0.15 + h, -0.05));
    g.add(mesh(cyl(0.05, 0.02, 14), m.glow, x, 0.18 + h, -0.05));
  }
  return g;
}

// ---------- the catalog ----------
// stats: armor, power (kW), weight (tonnes), speed. Shown on the readout and used by the assistant.
export const SLOTS = {
  hull: { label: 'Cockpit', kind: 'hull' },
  head: { label: 'Sensor', kind: 'head' },
  armL: { label: 'Left arm', kind: 'arm', side: 1 },
  armR: { label: 'Right arm', kind: 'arm', side: -1 },
  legL: { label: 'Left leg', kind: 'leg', side: 1 },
  legR: { label: 'Right leg', kind: 'leg', side: -1 },
  back: { label: 'Back pack', kind: 'back' },
  shoulderL: { label: 'Left shoulder', kind: 'shoulder', side: 1 },
  shoulderR: { label: 'Right shoulder', kind: 'shoulder', side: -1 },
};
export const SLOT_ORDER = ['hull', 'legL', 'legR', 'armL', 'armR', 'head', 'back', 'shoulderL', 'shoulderR'];

export const PARTS = [
  { id: 'hull-quad', kind: 'hull', name: 'Quad Container Cockpit', words: ['quad', 'container', 'four', 'box'], desc: 'Four large containers, cut open for the pilot.', stats: { armor: 40, power: 0, weight: 9, speed: 0 }, build: quadContainerHull },
  { id: 'hull-hauler', kind: 'hull', name: 'Hauler Cockpit', words: ['hauler', 'armoured', 'armored', 'big', 'wide'], desc: 'One wide armoured box with a big windscreen.', stats: { armor: 50, power: 0, weight: 11, speed: -1 }, build: haulerHull },
  { id: 'hull-scout', kind: 'hull', name: 'Scout Cockpit', words: ['scout', 'slim', 'light', 'fast'], desc: 'Narrow and angled. Light and quick.', stats: { armor: 25, power: 0, weight: 6, speed: 2 }, build: scoutHull },

  { id: 'head-visor', kind: 'head', name: 'Built-in Visor', words: ['visor', 'built', 'slit', 'built-in'], desc: 'No head on top: the sensor is built into the body.', stats: { armor: 2, power: -2, weight: 0.2, speed: 0 }, build: visorSensor },
  { id: 'head-dome', kind: 'head', name: 'Sensor Dome', words: ['dome', 'eye', 'round', 'cyclops'], desc: 'One big round eye, low on the body.', stats: { armor: 3, power: -3, weight: 0.3, speed: 0 }, sim: { radar: 1.2 }, build: domeSensor },
  { id: 'head-twin', kind: 'head', name: 'Twin Optics', words: ['twin', 'two', 'optics', 'binocular', 'eyes'], desc: 'Two long-range camera lenses.', stats: { armor: 2, power: -4, weight: 0.3, speed: 0 }, build: twinOptics },

  { id: 'arm-gripper', kind: 'arm', name: 'Container Arm', words: ['container', 'gripper', 'grabber', 'hand', 'claw', 'normal'], desc: 'Two containers and two motors, with a three-finger gripper.', stats: { armor: 10, power: -8, weight: 2.5, speed: 0 }, sim: { weapon: 'punch' }, build: gripperArm },
  { id: 'arm-crusher', kind: 'arm', name: 'Crusher Fist', words: ['crusher', 'fist', 'punch', 'smash', 'hammer'], desc: 'A solid steel fist for heavy jobs.', stats: { armor: 14, power: -6, weight: 3.2, speed: -1 }, sim: { weapon: 'punch', power: 3, cool: 0.6 }, build: crusherArm },
  { id: 'arm-cannon', kind: 'arm', name: 'Rivet Cannon', words: ['cannon', 'gun', 'blaster', 'shooter'], desc: 'Fires rivets to fix things from far away.', stats: { armor: 8, power: -14, weight: 2.8, speed: 0 }, sim: { weapon: 'bolt' }, build: cannonArm },
  { id: 'arm-cutter', kind: 'arm', name: 'Heavy Cutter', words: ['cutter', 'saw', 'blade', 'cutting', 'buzz'], desc: 'A very strong spinning cutter.', stats: { armor: 9, power: -16, weight: 3.0, speed: 0 }, sim: { weapon: 'saw' }, build: cutterArm },

  { id: 'leg-container', kind: 'leg', name: 'Container Leg', words: ['container', 'normal', 'stomper', 'big'], desc: 'Two containers and two motors, with a wide flat foot.', stats: { armor: 12, power: -10, weight: 3.5, speed: 1 }, sim: { run: 1, jump: 1 }, build: containerLeg },
  { id: 'leg-piston', kind: 'leg', name: 'Hydraulic Leg', words: ['hydraulic', 'piston', 'hydro', 'jumping', 'spring'], desc: 'Extra pistons and clawed toes. Good for jumping.', stats: { armor: 10, power: -14, weight: 3.8, speed: 2 }, sim: { run: 1.05, jump: 1.6 }, build: pistonLeg },
  { id: 'leg-tread', kind: 'leg', name: 'Track Leg', words: ['track', 'tread', 'tank', 'treads', 'tracks'], desc: 'A tank track instead of a foot. Rolls over anything.', stats: { armor: 16, power: -12, weight: 4.5, speed: 1 }, sim: { run: 1.15, jump: 0.5, roll: true }, build: treadLeg },

  { id: 'back-power', kind: 'back', name: 'Power Cell Pack', words: ['power', 'battery', 'cell', 'batteries', 'energy'], desc: 'Three big power cells. More power for everything.', stats: { armor: 4, power: 60, weight: 1.8, speed: 0 }, sim: { energy: 1.6 }, build: powerPack },
  { id: 'back-jets', kind: 'back', name: 'Jump Jets', words: ['jet', 'jets', 'jump', 'thruster', 'rocket', 'booster', 'fly'], desc: 'Thrusters for short jumps.', stats: { armor: 3, power: 25, weight: 1.6, speed: 3 }, sim: { jets: true }, build: jumpJets },
  { id: 'back-radio', kind: 'back', name: 'Radio Mast', words: ['radio', 'antenna', 'mast', 'dish', 'radar'], desc: 'Talks to the base from miles away.', stats: { armor: 2, power: 30, weight: 0.9, speed: 0 }, sim: { radar: 1.8 }, build: radioMast },

  { id: 'sh-light', kind: 'shoulder', name: 'Floodlight', words: ['light', 'flood', 'lamp', 'floodlight', 'flashlight'], desc: 'Two bright lamps for night work.', stats: { armor: 1, power: -2, weight: 0.3, speed: 0 }, sim: { light: true }, build: floodlight },
  { id: 'sh-missile', kind: 'shoulder', name: 'Rocket Pod', words: ['rocket', 'missile', 'pod', 'rockets', 'missiles'], desc: 'Four flare rockets.', stats: { armor: 3, power: -3, weight: 0.8, speed: 0 }, sim: { rockets: 4 }, build: missilePod },
  { id: 'sh-armor', kind: 'shoulder', name: 'Shoulder Plate', words: ['plate', 'shield', 'armor', 'armour', 'pad'], desc: 'Thick armour plate.', stats: { armor: 8, power: 0, weight: 0.9, speed: 0 }, sim: {}, build: armorPlate },
  { id: 'sh-beacon', kind: 'shoulder', name: 'Warning Beacon', words: ['beacon', 'siren', 'warning', 'flashing', 'orange'], desc: 'A spinning orange work light.', stats: { armor: 1, power: -1, weight: 0.2, speed: 0 }, sim: {}, build: beacon },
  { id: 'hull-six', kind: 'hull', name: 'Six-Pack Cockpit', words: ['six', 'six-pack', 'sixpack', 'huge', 'giant'], desc: 'Six large containers, three wide and two high. Huge and tough.', stats: { armor: 60, power: 0, weight: 13, speed: -1 }, build: sixPackHull },
  { id: 'hull-tank', kind: 'hull', name: 'Tank Cockpit', words: ['tank', 'turret', 'sloped', 'heavy'], desc: 'Low and wide, with sloped armour like a tank.', stats: { armor: 65, power: 0, weight: 14, speed: -2 }, build: tankHull },
  { id: 'hull-bubble', kind: 'hull', name: 'Bubble Cockpit', words: ['bubble', 'glass', 'round', 'window'], desc: 'A container with a big round glass bubble to see out of.', stats: { armor: 30, power: 0, weight: 7, speed: 1 }, build: bubbleHull },
  { id: 'head-spider', kind: 'head', name: 'Spider Eyes', words: ['spider', 'eight', 'many', 'bug'], desc: 'Eight little eyes. Sees creatures from far away.', stats: { armor: 2, power: -3, weight: 0.3, speed: 0 }, sim: { radar: 1.6 }, build: spiderEyes },
  { id: 'head-search', kind: 'head', name: 'Searchlight Eye', words: ['searchlight', 'search', 'spotlight', 'big eye'], desc: 'A big lamp eye that lights up the dark.', stats: { armor: 3, power: -4, weight: 0.4, speed: 0 }, sim: { light: true }, build: searchlightEye },
  { id: 'head-radar', kind: 'head', name: 'Radar Bar', words: ['radar', 'scanner', 'bar', 'scan'], desc: 'A wide scanner bar across the front.', stats: { armor: 2, power: -3, weight: 0.3, speed: 0 }, sim: { radar: 1.4 }, build: radarBar },
  { id: 'arm-drill', kind: 'arm', name: 'Mega Drill', words: ['drill', 'driller', 'spinner', 'screw'], desc: 'A giant spinning drill.', stats: { armor: 9, power: -12, weight: 3.0, speed: 0 }, sim: { weapon: 'saw' }, build: drillArm },
  { id: 'arm-shield', kind: 'arm', name: 'Shield Arm', words: ['shield', 'guard', 'block', 'wall'], desc: 'A big shield. Blocks half the damage.', stats: { armor: 22, power: -4, weight: 3.4, speed: -1 }, sim: { weapon: 'punch', shield: 0.5 }, build: shieldArm },
  { id: 'arm-pincer', kind: 'arm', name: 'Crab Claw', words: ['crab', 'pincer', 'pincers', 'pinch', 'clamp'], desc: 'Two big pincers that snap shut.', stats: { armor: 11, power: -7, weight: 2.7, speed: 0 }, sim: { weapon: 'punch' }, build: pincerArm },
  { id: 'arm-plasma', kind: 'arm', name: 'Plasma Blaster', words: ['plasma', 'laser', 'twin', 'blaster', 'zapper'], desc: 'Two glowing barrels that fire fast zaps.', stats: { armor: 7, power: -18, weight: 2.6, speed: 0 }, sim: { weapon: 'twin' }, build: plasmaArm },
  { id: 'leg-raptor', kind: 'leg', name: 'Raptor Leg', words: ['raptor', 'bird', 'chicken', 'backwards', 'dino', 'dinosaur'], desc: 'A backwards knee like a bird. Great for running and jumping.', stats: { armor: 9, power: -12, weight: 3.2, speed: 3 }, sim: { run: 1.3, jump: 1.3 }, build: raptorLeg },
  { id: 'leg-wheel', kind: 'leg', name: 'Wheel Leg', words: ['wheel', 'wheels', 'roller', 'skate'], desc: 'A big wheel instead of a foot. Zooms on flat ground.', stats: { armor: 10, power: -10, weight: 3.6, speed: 3 }, sim: { run: 1.45, jump: 0.6, roll: true }, build: wheelLeg },
  { id: 'leg-stilt', kind: 'leg', name: 'Stilt Leg', words: ['stilt', 'stilts', 'long', 'tall', 'skinny'], desc: 'Extra long legs. Tall and fast, less armour.', stats: { armor: 6, power: -9, weight: 2.6, speed: 2 }, sim: { run: 1.2, jump: 1.1 }, build: stiltLeg },
  { id: 'back-missiles', kind: 'back', name: 'Missile Rack', words: ['missile', 'rack', 'missiles', 'launcher'], desc: 'Six rockets on your back.', stats: { armor: 4, power: 15, weight: 2.0, speed: 0 }, sim: { rockets: 6 }, build: missileRack },
  { id: 'back-cargo', kind: 'back', name: 'Cargo Box', words: ['cargo', 'storage', 'box', 'carry', 'crate'], desc: 'A container for carrying crystals home. Holds extra power too.', stats: { armor: 6, power: 35, weight: 2.2, speed: 0 }, sim: { energy: 1.3 }, build: cargoBox },
  { id: 'back-shield', kind: 'back', name: 'Shield Generator', words: ['generator', 'force', 'field', 'bubble shield', 'forcefield'], desc: 'Makes a glowing force field when you are hit.', stats: { armor: 10, power: 20, weight: 1.9, speed: 0 }, sim: { forcefield: true }, build: shieldGen },
  { id: 'sh-turret', kind: 'shoulder', name: 'Gun Turret', words: ['turret', 'gun', 'guns', 'auto'], desc: 'Shoots creatures by itself.', stats: { armor: 2, power: -5, weight: 0.7, speed: 0 }, sim: { turret: true }, build: gunTurret },
  { id: 'sh-dish', kind: 'shoulder', name: 'Radar Dish', words: ['dish', 'satellite', 'radar dish'], desc: 'Finds crystals from far away.', stats: { armor: 1, power: -2, weight: 0.4, speed: 0 }, sim: { radar: 1.5 }, build: radarDish },
  { id: 'sh-spikes', kind: 'shoulder', name: 'Spike Pad', words: ['spike', 'spikes', 'spiky', 'pointy'], desc: 'Spiky armour. Ouch for anything that bites.', stats: { armor: 7, power: 0, weight: 0.8, speed: 0 }, sim: { thorns: true }, build: spikePad },
  // round 3: style families
  { id: 'hull-samurai', kind: 'hull', name: 'Samurai Cockpit', style: 'Samurai', words: ['samurai', 'ninja', 'warrior', 'crest', 'plates'], desc: 'Layered armour plates and a golden crest. Tough and proud.', stats: { armor: 58, power: 0, weight: 11, speed: 0 }, build: samuraiHull },
  { id: 'hull-junk', kind: 'hull', name: 'Junkyard Cockpit', style: 'Junkyard', words: ['junk', 'junkyard', 'scrap', 'rusty', 'trash'], desc: 'Bolted together from old containers, a rusty panel and a tyre.', stats: { armor: 45, power: 0, weight: 10, speed: 0 }, build: junkHull },
  { id: 'hull-racer', kind: 'hull', name: 'Racer Cockpit', style: 'Racer', words: ['racer', 'racing', 'race', 'sleek', 'capsule', 'speedy'], desc: 'A sleek capsule with tail fins. The fastest body.', stats: { armor: 22, power: 0, weight: 5, speed: 3 }, build: racerHull },
  { id: 'head-grille', kind: 'head', name: 'Battle Grille', style: 'Junkyard', words: ['grille', 'grill', 'bars', 'fierce', 'angry'], desc: 'Glowing eyes behind steel bars.', stats: { armor: 4, power: -2, weight: 0.4, speed: 0 }, sim: {}, build: grilleSensor },
  { id: 'head-sweep', kind: 'head', name: 'Sweep Scanner', style: 'Racer', words: ['sweep', 'sweeping', 'scanner light', 'moving light'], desc: 'A light that sweeps side to side, scanning for creatures.', stats: { armor: 2, power: -3, weight: 0.3, speed: 0 }, sim: { radar: 1.5 }, build: sweepScanner },
  { id: 'arm-sword', kind: 'arm', name: 'Energy Sword', style: 'Samurai', words: ['sword', 'katana', 'energy sword', 'lightsaber'], desc: 'A long glowing blade. Slices anything close.', stats: { armor: 8, power: -15, weight: 2.4, speed: 1 }, sim: { weapon: 'saw', power: 1.5, reach: 5.5, radius: 3.4 }, build: swordArm },
  { id: 'arm-wrecker', kind: 'arm', name: 'Wrecking Ball', style: 'Junkyard', words: ['wrecking', 'ball', 'flail', 'mace', 'chain'], desc: 'A spiked ball on a chain. Huge hits, slow swings.', stats: { armor: 12, power: -6, weight: 3.6, speed: -1 }, sim: { weapon: 'punch', power: 4, cool: 0.9, reach: 4.5, radius: 4.8 }, build: wreckerArm },
  { id: 'arm-tesla', kind: 'arm', name: 'Tesla Coil', style: 'Tesla', words: ['tesla', 'coil', 'lightning', 'electric', 'shock'], desc: 'Fires lightning that jumps from creature to creature.', stats: { armor: 7, power: -20, weight: 2.5, speed: 0 }, sim: { weapon: 'arc' }, build: teslaArm },
  { id: 'leg-spider', kind: 'leg', name: 'Spider Leg', style: 'Tesla', words: ['spider leg', 'claw leg', 'arachnid', 'creepy'], desc: 'A high knee and three sharp claws. Grips and jumps.', stats: { armor: 9, power: -11, weight: 3.0, speed: 2 }, sim: { run: 1.1, jump: 1.45 }, build: spiderLeg },
  { id: 'leg-hover', kind: 'leg', name: 'Hover Pad', style: 'Racer', words: ['hover', 'float', 'floating', 'antigravity'], desc: 'No foot: a glowing pad that floats over the ground. Very fast.', stats: { armor: 8, power: -18, weight: 2.8, speed: 4 }, sim: { run: 1.5, jump: 1.2, roll: true }, build: hoverLeg },
  { id: 'leg-greave', kind: 'leg', name: 'Samurai Greave', style: 'Samurai', words: ['greave', 'greaves', 'samurai leg', 'armoured leg', 'armored leg'], desc: 'Overlapping shin armour. Slow but very tough.', stats: { armor: 20, power: -10, weight: 4.2, speed: 0 }, sim: { run: 0.95, jump: 0.9 }, build: greaveLeg },
  { id: 'back-wings', kind: 'back', name: 'Glider Wings', style: 'Racer', words: ['wings', 'wing', 'glider', 'glide', 'flying'], desc: 'Folding wings with thrusters. Hold jump while falling to glide.', stats: { armor: 3, power: 20, weight: 1.4, speed: 2 }, sim: { jets: true, glide: true }, build: gliderWings },
  { id: 'back-reactor', kind: 'back', name: 'Fusion Reactor', style: 'Tesla', words: ['reactor', 'fusion', 'core', 'nuclear'], desc: 'A glowing reactor core. The most power of any pack.', stats: { armor: 5, power: 90, weight: 2.4, speed: 0 }, sim: { energy: 2.0 }, build: fusionReactor },
  { id: 'sh-mortar', kind: 'shoulder', name: 'Mini Mortar', style: 'Junkyard', words: ['mortar', 'lobber', 'tube'], desc: 'A tube that lobs three flare shells.', stats: { armor: 2, power: -2, weight: 0.6, speed: 0 }, sim: { rockets: 3 }, build: mortarPod },
  { id: 'sh-banner', kind: 'shoulder', name: 'Samurai Banner', style: 'Samurai', words: ['banner', 'flag', 'pennant'], desc: 'A tall flag in your colours that flutters as you walk.', stats: { armor: 0, power: 0, weight: 0.3, speed: 0 }, sim: {}, build: bannerPole },
  { id: 'sh-exhaust', kind: 'shoulder', name: 'Exhaust Stacks', style: 'Junkyard', words: ['exhaust', 'pipes', 'stacks', 'smokestack', 'chimney'], desc: 'Hot-rod exhaust pipes that glow when you run.', stats: { armor: 1, power: 0, weight: 0.4, speed: 1 }, sim: {}, build: exhaustStacks },
];

export const partById = (id) => PARTS.find((p) => p.id === id);
export const partsFor = (slot) => PARTS.filter((p) => p.kind === SLOTS[slot].kind);

/** Builds a part for a slot. Hulls return { group, sockets }; everything else returns a group. */
export function buildPart(part, slot, mats) {
  const side = SLOTS[slot].side ?? 1;
  const out = part.build(mats, side);
  return out.group ? out : { group: out };
}

export const COLORS = {
  red: '#a8322a', orange: '#d0661f', yellow: '#d9a62b', green: '#4e7a3a', 'army green': '#4f5a34', blue: '#2d5d9a',
  'navy blue': '#22324f', 'light blue': '#5aa0d6', purple: '#5d3d8a', pink: '#c25b8f', black: '#22252a', white: '#d9dcdf',
  grey: '#6b7278', gray: '#6b7278', silver: '#a9afb5', gold: '#c49a3c', brown: '#6b4a2f', teal: '#2f8a87', camo: '#5b6440',
};
export const GLOW_COLORS = {
  blue: '#39c6ff', cyan: '#39e6ff', red: '#ff3b2f', green: '#3dff7a', orange: '#ff8a1e', yellow: '#ffd23a', purple: '#b55cff', white: '#e8f4ff', pink: '#ff5cc8',
};
