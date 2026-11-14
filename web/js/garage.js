// The garage: floor, walls, lights, the assembly gantry, the workstation, the holo table and props.
import * as THREE from 'three';
import * as tex from './textures.js';
import { container, makeMaterials, motor } from './parts.js';

export const LAYOUT = {
  room: { w: 30, d: 24, h: 9 },
  platform: new THREE.Vector3(0, 0, 0), // the turntable the mech stands on
  hullHeight: 3.9,                       // hull centre when hanging in the gantry
  railZ: 3.2,                            // the floor rail the robot helper slides on
  railX: [-5.5, 5.5],
  lift: new THREE.Vector3(6.4, 0, 2.0),  // the parts lift: new parts rise here
  desk: new THREE.Vector3(0, 0, 8.2),    // the curved workstation
  holoTable: new THREE.Vector3(-6.2, 0, 3.6),
};

function m(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}

export function buildGarage(scene, quality) {
  const { w, d, h } = LAYOUT.room;
  const g = new THREE.Group();
  scene.add(g);
  const animated = [];

  // ---------- materials ----------
  const conc = tex.concrete();
  const floorMat = new THREE.MeshStandardMaterial({ map: conc.map, roughnessMap: conc.roughnessMap, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.9 });
  const wallMat = new THREE.MeshStandardMaterial({ map: tex.wallPanels(), roughness: 0.75, metalness: 0.3 });
  wallMat.map.repeat.set(6, 2);
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8d949a, metalness: 1, roughness: 0.35, roughnessMap: tex.brushed() });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.85, roughness: 0.45 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd9a62b, metalness: 0.4, roughness: 0.5, roughnessMap: tex.paintWear() });
  const hazard = new THREE.MeshStandardMaterial({ map: tex.hazard(), roughness: 0.6 });
  const strip = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff3e0, emissiveIntensity: 2.6 });
  const warm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc98a, emissiveIntensity: 3.5 });
  const holoBlue = new THREE.MeshBasicMaterial({ color: 0x5ccfff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  // ---------- room ----------
  const floor = m(new THREE.PlaneGeometry(w, d), floorMat, 0, 0, 0, false);
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  const ceil = m(new THREE.PlaneGeometry(w, d), ceilMat, 0, h, 0, false);
  ceil.rotation.x = Math.PI / 2;
  g.add(ceil);
  const back = m(new THREE.PlaneGeometry(w, h), wallMat, 0, h / 2, -d / 2, false);
  g.add(back);
  const left = m(new THREE.PlaneGeometry(d, h), wallMat, -w / 2, h / 2, 0, false);
  left.rotation.y = Math.PI / 2;
  g.add(left);
  const right = m(new THREE.PlaneGeometry(d, h), wallMat, w / 2, h / 2, 0, false);
  right.rotation.y = -Math.PI / 2;
  g.add(right);
  const front = m(new THREE.PlaneGeometry(w, h), wallMat, 0, h / 2, d / 2, false);
  front.rotation.y = Math.PI;
  g.add(front);
  // skirting
  for (const [x, z, ry, len] of [[0, -d / 2 + 0.05, 0, w], [-w / 2 + 0.05, 0, Math.PI / 2, d], [w / 2 - 0.05, 0, Math.PI / 2, d]]) {
    const s = m(new THREE.BoxGeometry(len, 0.25, 0.08), darkSteel, x, 0.12, z, false);
    s.rotation.y = ry;
    g.add(s);
  }

  // back wall: tall glowing slots (uplights), like a showroom
  for (let i = -5; i <= 5; i++) {
    const x = i * 2.4;
    g.add(m(new THREE.BoxGeometry(0.14, 3.2, 0.05), warm, x, 2.0, -d / 2 + 0.03, false));
    g.add(m(new THREE.BoxGeometry(0.5, 0.12, 0.3), darkSteel, x, 0.06, -d / 2 + 0.2, false));
  }
  // back wall: a recessed light band higher up
  g.add(m(new THREE.BoxGeometry(w * 0.9, 0.08, 0.05), strip, 0, 6.6, -d / 2 + 0.03, false));

  // right wall: high windows with cool daylight
  for (let i = -3; i <= 3; i++) {
    const win = m(new THREE.PlaneGeometry(2.4, 1.3), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xcfe3ff, emissiveIntensity: 1.6 }), w / 2 - 0.02, 6.6, i * 3, false);
    win.rotation.y = -Math.PI / 2;
    g.add(win);
    const frame = m(new THREE.BoxGeometry(0.1, 1.45, 2.55), darkSteel, w / 2 - 0.05, 6.6, i * 3, false);
    g.add(frame);
    frame.material = darkSteel;
    g.add(m(new THREE.BoxGeometry(0.12, 0.05, 2.5), darkSteel, w / 2 - 0.06, 6.6, i * 3, false));
  }
  // right wall: roll-up door
  const door = m(new THREE.PlaneGeometry(7, 5.2), new THREE.MeshStandardMaterial({ map: tex.corrugated(), color: 0x50565c, metalness: 0.7, roughness: 0.5 }), w / 2 - 0.03, 2.6, -5.5, false);
  door.material.normalMap = tex.corrugated();
  door.material.map = null;
  door.rotation.y = -Math.PI / 2;
  door.rotation.z = Math.PI / 2;
  g.add(door);
  g.add(m(new THREE.BoxGeometry(0.2, 0.2, 7.4), hazard, w / 2 - 0.1, 5.3, -5.5, false));

  // left wall: pegboard tool wall
  const peg = m(new THREE.PlaneGeometry(8, 2.6), new THREE.MeshStandardMaterial({ map: tex.pegboard(), roughness: 0.8 }), -w / 2 + 0.03, 2.4, 3, false);
  peg.rotation.y = Math.PI / 2;
  g.add(peg);
  const toolMat = [steel, darkSteel, yellow, new THREE.MeshStandardMaterial({ color: 0xa8322a, roughness: 0.5 })];
  const rnd = tex.rng(4);
  for (let i = 0; i < 26; i++) {
    const kind = i % 3;
    const geo = kind === 0 ? new THREE.BoxGeometry(0.05, 0.3 + rnd() * 0.3, 0.06) : kind === 1 ? new THREE.TorusGeometry(0.1 + rnd() * 0.08, 0.02, 6, 16) : new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8);
    const t = m(geo, toolMat[i % 4], -w / 2 + 0.08, 1.5 + rnd() * 1.8, -0.8 + rnd() * 7.6, false);
    t.rotation.y = Math.PI / 2;
    t.rotation.x = (rnd() - 0.5) * 0.4;
    g.add(t);
  }

  // ---------- ceiling: LED panels and the crane beam ----------
  for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) {
    if (i === 0 && j === 0) continue;
    g.add(m(new THREE.BoxGeometry(3.2, 0.06, 0.35), strip, i * 5.5, h - 0.05, j * 6, false));
  }
  for (const z of [-3, 3]) g.add(m(new THREE.BoxGeometry(w, 0.5, 0.35), darkSteel, 0, h - 0.4, z, false));
  for (const x of [-11, 11]) g.add(m(new THREE.BoxGeometry(0.5, h, 0.5), darkSteel, x, h / 2, -d / 2 + 0.3, false));

  // ---------- assembly gantry + turntable ----------
  const P = LAYOUT.platform;
  const turntable = m(new THREE.CylinderGeometry(2.9, 3.0, 0.16, 64), darkSteel, P.x, 0.08, P.z);
  g.add(turntable);
  const ring = m(new THREE.CylinderGeometry(3.05, 3.05, 0.17, 64, 1, true), hazard, P.x, 0.085, P.z);
  ring.material = hazard.clone();
  ring.material.map = hazard.map.clone();
  ring.material.map.repeat.set(24, 1);
  ring.material.map.needsUpdate = true;
  g.add(ring);
  const glowRing = m(new THREE.TorusGeometry(2.75, 0.025, 6, 96), new THREE.MeshBasicMaterial({ color: 0x5ccfff }), P.x, 0.17, P.z, false);
  glowRing.rotation.x = Math.PI / 2;
  g.add(glowRing);

  const gantry = new THREE.Group();
  gantry.position.copy(P);
  g.add(gantry);
  for (const s of [-1, 1]) {
    gantry.add(m(new THREE.BoxGeometry(0.42, 7.2, 0.42), yellow, s * 3.6, 3.6, -1.6));
    gantry.add(m(new THREE.BoxGeometry(1.1, 0.1, 1.1), darkSteel, s * 3.6, 0.05, -1.6));
    // diagonal braces
    const br = m(new THREE.BoxGeometry(0.12, 2.6, 0.12), darkSteel, s * 3.0, 6.3, -1.6);
    br.rotation.z = s * 0.7;
    gantry.add(br);
  }
  gantry.add(m(new THREE.BoxGeometry(7.8, 0.5, 0.5), yellow, 0, 7.3, -1.6));
  gantry.add(m(new THREE.BoxGeometry(7.8, 0.12, 0.52), hazard, 0, 7.0, -1.6));
  // the hoist trolley over the mech, with the chains down to the hull
  const trolleyBeam = m(new THREE.BoxGeometry(0.4, 0.35, 3.4), darkSteel, 0, 7.35, 0);
  gantry.add(trolleyBeam);
  const hoist = m(new THREE.BoxGeometry(0.9, 0.6, 0.7), yellow, 0, 6.9, 0);
  gantry.add(hoist);
  const linkGeo = new THREE.TorusGeometry(0.045, 0.014, 6, 10);
  const MAX_LINKS = 4 * 120;
  const chains = new THREE.InstancedMesh(linkGeo, steel, MAX_LINKS);
  chains.castShadow = true;
  chains.frustumCulled = false;
  gantry.add(chains);
  const tmp = new THREE.Object3D();
  function rebuildChains(topY) {
    let k = 0;
    for (const [cx, cz] of [[0.75, 0.55], [-0.75, 0.55], [0.75, -0.55], [-0.75, -0.55]]) {
      const from = new THREE.Vector3(Math.sign(cx) * 0.25, 6.6, Math.sign(cz) * 0.2);
      const to = new THREE.Vector3(cx, topY, cz);
      const n = Math.min(119, Math.floor(from.distanceTo(to) / 0.075));
      for (let i = 0; i < n; i++) {
        tmp.position.lerpVectors(from, to, i / n);
        tmp.lookAt(to.x + gantry.position.x, to.y, to.z + gantry.position.z);
        tmp.rotateX(Math.PI / 2);
        if (i % 2) tmp.rotateY(Math.PI / 2);
        tmp.updateMatrix();
        chains.setMatrixAt(k++, tmp.matrix);
      }
    }
    chains.count = k;
    chains.instanceMatrix.needsUpdate = true;
  }
  rebuildChains(LAYOUT.hullHeight + 0.85);

  // umbilical cables from the gantry to the mech position (decor)
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.7 });
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 3.4, 5.5, -1.6), new THREE.Vector3(s * 2.6, 2.0, -1.3), new THREE.Vector3(s * 1.8, 0.2, -1.0), new THREE.Vector3(s * 1.0, 0.18, -0.8),
    ]);
    g.add(m(new THREE.TubeGeometry(curve, 30, 0.05, 8), cableMat, 0, 0, 0));
  }

  // ---------- the robot helper's floor rail ----------
  const [rx0, rx1] = LAYOUT.railX;
  const railLen = rx1 - rx0 + 1.4;
  g.add(m(new THREE.BoxGeometry(railLen, 0.12, 1.2), darkSteel, 0, 0.06, LAYOUT.railZ));
  for (const s of [-1, 1]) g.add(m(new THREE.BoxGeometry(railLen, 0.1, 0.12), steel, 0, 0.17, LAYOUT.railZ + s * 0.42));
  g.add(m(new THREE.BoxGeometry(railLen, 0.02, 0.14), hazard, 0, 0.125, LAYOUT.railZ + 0.66));
  // cable carrier behind the rail
  g.add(m(new THREE.BoxGeometry(railLen, 0.18, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }), 0, 0.1, LAYOUT.railZ - 0.8));

  // ---------- parts lift ----------
  const L = LAYOUT.lift;
  g.add(m(new THREE.CylinderGeometry(1.25, 1.25, 0.1, 48), darkSteel, L.x, 0.05, L.z));
  const liftGlow = m(new THREE.TorusGeometry(1.15, 0.03, 6, 64), new THREE.MeshBasicMaterial({ color: 0x5ccfff }), L.x, 0.11, L.z, false);
  liftGlow.rotation.x = Math.PI / 2;
  g.add(liftGlow);
  const liftPad = m(new THREE.CylinderGeometry(1.0, 1.0, 0.12, 48), steel, L.x, 0.12, L.z);
  g.add(liftPad);
  const liftBeam = m(new THREE.CylinderGeometry(1.0, 1.0, 4, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ccfff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), L.x, 2.1, L.z, false);
  g.add(liftBeam);
  let liftFlash = 0;

  // ---------- the curved workstation ----------
  const D = LAYOUT.desk;
  const desk = new THREE.Group();
  desk.position.copy(D);
  g.add(desk);
  const deskTop = m(new THREE.RingGeometry(2.35, 3.2, 64, 1, Math.PI * 0.5 - Math.PI * 0.32, Math.PI * 0.64), new THREE.MeshStandardMaterial({ color: 0x1d2329, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }), 0, 0.92, 0);
  deskTop.rotation.x = -Math.PI / 2;
  desk.add(deskTop);
  const deskFront = m(new THREE.CylinderGeometry(3.15, 3.15, 0.85, 64, 1, true, -Math.PI * 0.32, Math.PI * 0.64), new THREE.MeshStandardMaterial({ color: 0x2b2f34, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }), 0, 0.46, 0);
  deskFront.rotation.y = Math.PI;
  desk.add(deskFront);
  const deskEdge = m(new THREE.TorusGeometry(3.2, 0.012, 4, 64, Math.PI * 0.64), new THREE.MeshBasicMaterial({ color: 0x5ccfff }), 0, 0.96, 0, false);
  deskEdge.rotation.x = Math.PI / 2;
  deskEdge.rotation.z = Math.PI / 2 - Math.PI * 0.32 + Math.PI;
  desk.add(deskEdge);

  // holo screens on the desk, left and right of centre so the mech stays in view
  const screens = [];
  const screenDefs = [
    { a: -0.86, y: 1.6, w: 1.5, h: 0.85 },
    { a: -0.56, y: 1.38, w: 1.05, h: 0.58 },
    { a: 0.56, y: 1.38, w: 1.05, h: 0.58 },
    { a: 0.86, y: 1.6, w: 1.5, h: 0.85 },
  ];
  for (const s of screenDefs) {
    const live = tex.liveCanvas(512, Math.round(512 * s.h / s.w));
    const mat = new THREE.MeshBasicMaterial({ map: live.texture, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
    const r = 2.9;
    scr.position.set(Math.sin(s.a) * r, s.y, -Math.cos(s.a) * r);
    scr.lookAt(new THREE.Vector3(0, s.y, 2.5).add(new THREE.Vector3(0, 0, 0)));
    scr.rotateY(Math.PI);
    desk.add(scr);
    // projector base for each screen
    const base = m(new THREE.BoxGeometry(0.4, 0.04, 0.12), darkSteel, scr.position.x, 0.97, scr.position.z);
    base.rotation.y = -s.a;
    desk.add(base);
    screens.push({ ...live, mesh: scr });
  }
  // keyboard and a coffee mug
  const kb = m(new THREE.BoxGeometry(0.9, 0.03, 0.3), darkSteel, 0, 0.97, -2.75);
  desk.add(kb);
  const mug = m(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 16), new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.4 }), 0.75, 1.01, -2.85);
  desk.add(mug);
  // the chair
  const chair = new THREE.Group();
  chair.position.set(0, 0, -1.9);
  desk.add(chair);
  chair.add(m(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 24), darkSteel, 0, 0.55, 0));
  chair.add(m(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), steel, 0, 0.3, 0));
  chair.add(m(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 5), darkSteel, 0, 0.05, 0));

  // ---------- holo table: shows the selected part as a blueprint ----------
  const H = LAYOUT.holoTable;
  const holo = new THREE.Group();
  holo.position.copy(H);
  g.add(holo);
  holo.add(m(new THREE.CylinderGeometry(1.1, 1.25, 0.95, 48), darkSteel, 0, 0.475, 0));
  holo.add(m(new THREE.CylinderGeometry(1.0, 1.0, 0.04, 48), new THREE.MeshStandardMaterial({ color: 0x0a1a24, emissive: 0x0b3b55, emissiveIntensity: 1, roughness: 0.2 }), 0, 0.97, 0));
  const holoCone = m(new THREE.CylinderGeometry(1.0, 0.25, 1.8, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ccfff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0, 1.9, 0, false);
  holoCone.rotation.x = Math.PI;
  holo.add(holoCone);
  const holoGrid = m(new THREE.CircleGeometry(0.98, 48), new THREE.MeshBasicMaterial({ map: tex.holoGrid(), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 1.0, 0, false);
  holoGrid.rotation.x = -Math.PI / 2;
  holo.add(holoGrid);
  const holoStage = new THREE.Group();
  holoStage.position.y = 1.9;
  holo.add(holoStage);

  // ---------- props ----------
  // the raw containers the mech was cut from, stacked in the back corner, one cut open
  const rawMats = makeMaterials({ primary: '#7a3b2a', accent: '#5e2e22', glow: '#000000' });
  const rawBlue = makeMaterials({ primary: '#2f4f6e', accent: '#253f58', glow: '#000000' });
  const c1 = container(rawMats, 2.4, 2.6, 6, { label: 'RAW-17' });
  c1.position.set(-11, 1.3, -7.5);
  c1.rotation.y = 0.05;
  g.add(c1);
  const c2 = container(rawBlue, 2.4, 2.6, 6, { label: 'RAW-22' });
  c2.position.set(-11, 3.92, -7.6);
  c2.rotation.y = -0.04;
  g.add(c2);
  const c3 = container(rawBlue, 2.4, 2.6, 4.2, { label: 'CUT-03' });
  c3.position.set(-7.4, 1.3, -8.4);
  c3.rotation.y = 1.45;
  g.add(c3);

  // red roll cabinet and workbench
  const red = new THREE.MeshStandardMaterial({ color: 0x9e2a22, metalness: 0.5, roughness: 0.35 });
  const cab = new THREE.Group();
  cab.position.set(-12.6, 0, 7.5);
  cab.rotation.y = Math.PI / 2;
  g.add(cab);
  cab.add(m(new THREE.BoxGeometry(2.2, 1.0, 0.7), red, 0, 0.55, 0));
  for (let i = 0; i < 5; i++) cab.add(m(new THREE.BoxGeometry(2.0, 0.025, 0.02), steel, 0, 0.2 + i * 0.17, 0.36));
  cab.add(m(new THREE.BoxGeometry(2.25, 0.05, 0.75), darkSteel, 0, 1.08, 0));
  cab.add(m(new THREE.BoxGeometry(2.2, 0.6, 0.6), red, 0, 1.42, -0.05));
  const bench = new THREE.Group();
  bench.position.set(-12.4, 0, -1.2);
  bench.rotation.y = Math.PI / 2;
  g.add(bench);
  bench.add(m(new THREE.BoxGeometry(3.4, 0.08, 1.0), new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.7 }), 0, 0.95, 0));
  for (const s of [-1, 1]) for (const t of [-1, 1]) bench.add(m(new THREE.BoxGeometry(0.08, 0.95, 0.08), darkSteel, s * 1.6, 0.47, t * 0.42));
  bench.add(m(new THREE.BoxGeometry(0.3, 0.2, 0.25), darkSteel, 1.2, 1.1, 0.3)); // vise
  // a spare motor on the bench
  const spare = makeMaterials({ primary: '#6b7278', accent: '#d9a62b', glow: '#39c6ff' });
  const mo = motor(spare, 0.22, 0.4);
  mo.position.set(-0.4, 1.2, 0);
  bench.add(mo);
  // oil drums
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x2d5d9a, metalness: 0.5, roughness: 0.45 });
  for (const [x, z] of [[12.5, 9.5], [11.6, 9.8], [12.3, 8.6]]) {
    g.add(m(new THREE.CylinderGeometry(0.42, 0.42, 1.25, 24), drumMat, x, 0.63, z));
    g.add(m(new THREE.TorusGeometry(0.42, 0.02, 6, 24), darkSteel, x, 0.4, z).rotateX(Math.PI / 2));
  }
  // floor markings: a walkway line and the assembly bay box
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xd9a62b, roughness: 0.7 });
  for (const [x, z, lw, ld] of [[0, -4.3, 9.6, 0.12], [0, 4.6, 9.6, 0.12], [-4.8, 0.15, 0.12, 8.9], [4.8, 0.15, 0.12, 8.9]]) {
    const line = m(new THREE.PlaneGeometry(lw, ld), lineMat, x, 0.006, z, false);
    line.rotation.x = -Math.PI / 2;
    g.add(line);
  }

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xb8c8d8, 0x2a2622, 0.22));
  const key = new THREE.SpotLight(0xfff4e6, 210, 30, 0.62, 0.55, 1.6);
  key.position.set(1.5, h - 0.3, 4.5);
  key.target.position.set(0, 2.2, 0);
  key.castShadow = true;
  const sm = quality === 'low' ? 1024 : 2048;
  key.shadow.mapSize.set(sm, sm);
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 22;
  scene.add(key, key.target);
  const rim = new THREE.SpotLight(0x9fd4ff, 160, 25, 0.7, 0.6, 1.6);
  rim.position.set(-4, h - 0.5, -6);
  rim.target.position.set(0, 2.5, 0);
  scene.add(rim, rim.target);
  const backWarm = new THREE.PointLight(0xffb070, 30, 14, 1.8);
  backWarm.position.set(0, 2.5, -10.5);
  scene.add(backWarm);
  const deskLight = new THREE.PointLight(0x5ccfff, 8, 6, 2);
  deskLight.position.set(D.x, 1.6, D.z - 1.8);
  scene.add(deskLight);
  const holoLight = new THREE.PointLight(0x5ccfff, 10, 5, 2);
  holoLight.position.set(H.x, 1.8, H.z);
  scene.add(holoLight);
  const fill = new THREE.PointLight(0xfff0e0, 22, 20, 1.6);
  fill.position.set(8, 6, 6);
  scene.add(fill);

  // ---------- per-frame ----------
  function update(t, dt) {
    glowRing.material.color.setHSL(0.55, 1, 0.55 + Math.sin(t * 1.5) * 0.1);
    holoGrid.rotation.z += dt * 0.15;
    holoStage.rotation.y += dt * 0.6;
    holoCone.material.opacity = 0.05 + Math.sin(t * 3) * 0.015;
    if (liftFlash > 0) {
      liftFlash = Math.max(0, liftFlash - dt * 0.7);
      liftBeam.material.opacity = liftFlash * 0.35;
      liftBeam.scale.set(1, 0.5 + liftFlash * 0.5, 1);
    }
    for (const a of animated) a(t, dt);
  }

  return {
    group: g, update, screens, holoStage, turntable, ring, glowRing, desk,
    flashLift: () => { liftFlash = 1; },
    rebuildChains,
    lights: { key, rim, backWarm, fill },
  };
}
