// The test planet: alien terrain, sky, plants, rocks, crystal spires, acid pools, the landing pad and the crystals to
// collect. Everything is generated from a fixed seed, so it's the same planet every time.
import * as THREE from '../../vendor/three/three.module.js';
import { rng } from '../textures.js';

// ---------- noise ----------
function hash(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, oct = 5) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, z * f); f *= 2.03; amp *= 0.5; }
  return s;
}

export const SIZE = 560;
export const BASE = new THREE.Vector3(0, 0, 0);

/** Ground height at x, z (metres). Flat around the landing pad, hills and ridges further out. */
export function height(x, z) {
  const d = Math.hypot(x - BASE.x, z - BASE.z);
  let h = (fbm(x * 0.006, z * 0.006) - 0.45) * 38;
  h += Math.pow(Math.abs(fbm(x * 0.015 + 40, z * 0.015) - 0.5) * 2, 2) * 10; // ridges
  h += (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 2.2;                              // bumps
  // a big crater to the north-east
  const cd = Math.hypot(x - 120, z + 90);
  if (cd < 45) h -= Math.cos((cd / 45) * Math.PI / 2) * 12;
  else if (cd < 55) h += Math.sin(((cd - 45) / 10) * Math.PI) * 4;
  // flat landing area
  const flat = THREE.MathUtils.smoothstep(d, 18, 45);
  h *= flat;
  // the world's edge rises into cliffs so you can't walk off
  const edge = Math.max(Math.abs(x), Math.abs(z)) - (SIZE / 2 - 50);
  if (edge > 0) h += edge * edge * 0.06;
  return h;
}

export class Planet {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.low = quality === 'low';
    this.colliders = [];   // { x, z, r }
    this.pools = [];       // acid pools: { x, z, r }
    this.crystals = [];    // collectibles
    this.swayers = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rand = rng(77);
    this.sky();
    this.terrain();
    this.base();
    this.props();
    this.makeCrystals();
    this.lights();
  }

  // ---------- sky ----------
  sky() {
    const s = this.scene;
    s.background = new THREE.Color(0x150a26);
    s.fog = new THREE.Fog(0x2a1640, 70, this.low ? 260 : 330);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = clamp(vP.y, -0.2, 1.0);
          vec3 horizon = vec3(0.75, 0.28, 0.42);
          vec3 mid = vec3(0.22, 0.08, 0.38);
          vec3 top = vec3(0.03, 0.02, 0.10);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h));
          c = mix(c, top, smoothstep(0.25, 0.9, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    dome.renderOrder = -10;
    this.group.add(dome);
    // stars
    const n = 1600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = this.rand() * 2 - 1, a = this.rand() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.05, r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 850, y * 850, Math.sin(a) * r * 850], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.group.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })));
    // a giant ringed planet
    const giant = new THREE.Group();
    giant.position.set(-380, 260, -560);
    const bands = document.createElement('canvas');
    bands.width = 4; bands.height = 256;
    const bx = bands.getContext('2d');
    for (let y = 0; y < 256; y++) {
      const t = y / 256 + Math.sin(y * 0.3) * 0.02;
      bx.fillStyle = `hsl(${20 + t * 30 + Math.sin(y * 0.15) * 8}, 60%, ${45 + Math.sin(y * 0.21) * 12}%)`;
      bx.fillRect(0, y, 4, 1);
    }
    const bt = new THREE.CanvasTexture(bands);
    bt.colorSpace = THREE.SRGBColorSpace;
    giant.add(new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), new THREE.MeshBasicMaterial({ map: bt, fog: false })));
    const ring = new THREE.Mesh(new THREE.RingGeometry(185, 290, 96), new THREE.MeshBasicMaterial({ color: 0xe8c9a0, transparent: true, opacity: 0.4, side: THREE.DoubleSide, fog: false }));
    ring.rotation.x = Math.PI / 2 - 0.22;
    giant.add(ring);
    giant.rotation.z = 0.35;
    this.group.add(giant);
    // two moons
    for (const [x, y, z, r, c] of [[420, 330, -300, 28, 0x9fe8ff], [250, 180, 520, 14, 0xffd0f0]]) {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color: c, fog: false }));
      moon.position.set(x, y, z);
      this.group.add(moon);
    }
  }

  // ---------- ground ----------
  terrain() {
    const seg = this.low ? 120 : 190;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const cLow = new THREE.Color(0x3a2152), cMid = new THREE.Color(0x1e5a58), cHigh = new THREE.Color(0x8c4a6e), cDust = new THREE.Color(0xa3603a);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const h = height(x, z);
      p.setY(i, h);
      const n = fbm(x * 0.03 + 9, z * 0.03, 3);
      c.copy(cLow).lerp(cMid, THREE.MathUtils.smoothstep(n, 0.4, 0.62));
      c.lerp(cHigh, THREE.MathUtils.smoothstep(h, 6, 18));
      c.lerp(cDust, THREE.MathUtils.smoothstep(fbm(x * 0.02 - 30, z * 0.02 + 11, 2), 0.62, 0.75) * 0.7);
      c.multiplyScalar(0.85 + vnoise(x * 0.8, z * 0.8) * 0.3);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.05 }));
    ground.receiveShadow = true;
    this.group.add(ground);
    this.ground = ground;
  }

  /** A spot on the planet at least `minDist` from the base and from colliders. */
  spot(minDist = 30, maxDist = SIZE / 2 - 70) {
    for (let i = 0; i < 40; i++) {
      const a = this.rand() * Math.PI * 2, d = minDist + this.rand() * (maxDist - minDist);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (this.blocked(x, z, 3)) continue;
      return new THREE.Vector3(x, height(x, z), z);
    }
    return new THREE.Vector3(minDist, height(minDist, 0), 0);
  }

  blocked(x, z, r) {
    return this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r);
  }

  // ---------- landing pad and dropship ----------
  base() {
    const g = new THREE.Group();
    g.position.copy(BASE);
    this.group.add(g);
    const metal = new THREE.MeshStandardMaterial({ color: 0x5a6470, metalness: 0.8, roughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23282f, metalness: 0.7, roughness: 0.5 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x5ccfff, emissiveIntensity: 1.6 });
    const amber = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa040, emissiveIntensity: 3 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(14, 15, 0.6, 6), dark);
    pad.position.y = 0.3;
    pad.receiveShadow = true;
    g.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(12, 0.12, 6, 6), glow);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.62;
    g.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), amber);
      l.position.set(Math.cos(a) * 14, 0.7, Math.sin(a) * 14);
      g.add(l);
    }
    // the dropship, parked behind the pad
    const ship = new THREE.Group();
    ship.position.set(0, 0, -24);
    g.add(ship);
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 16), metal);
    body.position.y = 4;
    body.castShadow = true;
    ship.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(4.2, 6, 4), metal);
    nose.rotation.x = Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, 4, 11);
    ship.add(nose);
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 3), new THREE.MeshStandardMaterial({ color: 0x0b1418, metalness: 0.9, roughness: 0.05 }));
    cockpit.position.set(0, 6.2, 6);
    ship.add(cockpit);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 6), dark);
      wing.position.set(s * 8, 4.5, -2);
      wing.castShadow = true;
      ship.add(wing);
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 4, 16), dark);
      engine.rotation.x = Math.PI / 2;
      engine.position.set(s * 11, 4.5, -4);
      ship.add(engine);
      const flame = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16), glow);
      flame.position.set(s * 11, 4.5, -6.05);
      flame.rotation.y = Math.PI;
      ship.add(flame);
      for (const z of [-5, 4]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 3, 8), metal);
        leg.position.set(s * 3.5, 1.5, z);
        ship.add(leg);
      }
    }
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 7), metal);
    ramp.position.set(0, 1.4, 10.5);
    ramp.rotation.x = 0.35;
    ship.add(ramp);
    this.colliders.push({ x: 0, z: -24, r: 9 }, { x: 11, z: -28, r: 3 }, { x: -11, z: -28, r: 3 });
    // a beacon light column above the pad, to find the way home
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 120, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ccfff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.set(0, 60, 0);
    g.add(beam);
    const padLight = new THREE.PointLight(0x5ccfff, 8, 30, 1.8);
    padLight.position.set(0, 6, 0);
    g.add(padLight);
  }

  // ---------- rocks, spires, plants, pools ----------
  props() {
    const r = this.rand;
    const n = this.low ? 0.6 : 1;
    const place = (count, minR, maxR, fn) => {
      for (let i = 0; i < count; i++) {
        const p = this.spot(minR, maxR);
        fn(p, i);
      }
    };
    const dummy = new THREE.Object3D();

    // rocks (you bump into big ones)
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x4c3a58, roughness: 0.95, flatShading: true }), Math.round(170 * n));
    let k = 0;
    place(rocks.count, 30, SIZE / 2 - 60, (p) => {
      const s = 0.8 + r() * r() * 5;
      dummy.position.set(p.x, p.y + s * 0.3, p.z);
      dummy.rotation.set(r() * 3, r() * 3, r() * 3);
      dummy.scale.set(s * (0.8 + r() * 0.6), s * (0.5 + r() * 0.5), s * (0.8 + r() * 0.6));
      dummy.updateMatrix();
      rocks.setMatrixAt(k++, dummy.matrix);
      if (s > 1.8) this.colliders.push({ x: p.x, z: p.z, r: s * 0.95 });
    });
    rocks.castShadow = rocks.receiveShadow = true;
    this.group.add(rocks);

    // crystal spires: tall glowing towers
    const spireGeo = new THREE.ConeGeometry(1, 1, 5);
    spireGeo.translate(0, 0.5, 0);
    const spireMats = [0x39e6ff, 0xff4fd8, 0x9b6bff].map((c) => new THREE.MeshStandardMaterial({ color: 0x111122, emissive: c, emissiveIntensity: 0.75, roughness: 0.2, metalness: 0.3 }));
    for (const mat of spireMats) {
      const count = Math.round(26 * n);
      const spires = new THREE.InstancedMesh(spireGeo, mat, count * 4);
      let j = 0;
      place(count, 40, SIZE / 2 - 60, (p) => {
        const cluster = 2 + Math.floor(r() * 3);
        for (let c = 0; c < 4; c++) {
          const big = c === 0;
          const s = big ? 1.4 + r() * 1.6 : 0.5 + r() * 0.8;
          const hgt = big ? 8 + r() * 14 : 2 + r() * 6;
          dummy.position.set(p.x + (big ? 0 : (r() - 0.5) * 5), p.y - 0.5, p.z + (big ? 0 : (r() - 0.5) * 5));
          dummy.rotation.set((r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5);
          dummy.scale.set(c < cluster ? s : 0.001, c < cluster ? hgt : 0.001, c < cluster ? s : 0.001);
          dummy.updateMatrix();
          spires.setMatrixAt(j++, dummy.matrix);
        }
        this.colliders.push({ x: p.x, z: p.z, r: 2.6 });
      });
      spires.castShadow = true;
      this.group.add(spires);
    }

    // glowing mushrooms (you can walk through them)
    const stemGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 6);
    stemGeo.translate(0, 0.5, 0);
    const capGeo = new THREE.SphereGeometry(0.8, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const mc = Math.round(220 * n);
    const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0xcfc6e0, roughness: 0.7 }), mc);
    const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: 0x220a22, emissive: 0xff7a3d, emissiveIntensity: 1.0, roughness: 0.5 }), mc);
    const capColor = new THREE.Color();
    place(mc, 22, SIZE / 2 - 60, (p, i) => {
      const s = 0.5 + r() * 1.8;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, r() * 3, (r() - 0.5) * 0.3);
      dummy.scale.set(s, s * (1 + r()), s);
      dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
      dummy.position.y = p.y + s * (1 + r()) * 0.95;
      dummy.scale.set(s, s * 0.7, s);
      dummy.updateMatrix();
      caps.setMatrixAt(i, dummy.matrix);
      caps.setColorAt(i, capColor.setHSL(0.02 + r() * 0.12 + (r() < 0.3 ? 0.45 : 0), 0.9, 0.6));
    });
    this.group.add(stems, caps);

    // tentacle plants that sway
    const tentMat = new THREE.MeshStandardMaterial({ color: 0x2b5c3a, roughness: 0.6 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x7dff6a, emissiveIntensity: 2.4 });
    const tc = Math.round(45 * n);
    place(tc, 25, SIZE / 2 - 70, (p) => {
      const plant = new THREE.Group();
      plant.position.copy(p);
      for (let i = 0; i < 4; i++) {
        const stalk = new THREE.Group();
        stalk.rotation.y = (i / 4) * Math.PI * 2 + r();
        const hgt = 3 + r() * 5;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, hgt * 0.35, 0.2), new THREE.Vector3(-0.3, hgt * 0.7, 0.4), new THREE.Vector3(0.5, hgt, 0)]);
        stalk.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.12, 5), tentMat));
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), bulbMat);
        bulb.position.set(0.5, hgt, 0);
        stalk.add(bulb);
        stalk.userData.phase = r() * 6;
        plant.add(stalk);
        this.swayers.push(stalk);
      }
      this.group.add(plant);
    });

    // acid pools: glowing green, they hurt
    const poolMat = new THREE.MeshStandardMaterial({ color: 0x0a2a10, emissive: 0x4dff6a, emissiveIntensity: 1.1, roughness: 0.15, transparent: true, opacity: 0.9 });
    for (let i = 0; i < (this.low ? 6 : 9); i++) {
      const p = this.spot(50, SIZE / 2 - 80);
      const rad = 5 + r() * 7;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(rad, 28), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(p.x, p.y + 0.15, p.z);
      this.group.add(pool);
      this.pools.push({ x: p.x, z: p.z, r: rad, mesh: pool });
    }
  }

  // ---------- crystals to collect ----------
  makeCrystals() {
    const geo = new THREE.OctahedronGeometry(0.9, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0a2030, emissive: 0x39e6ff, emissiveIntensity: 3, roughness: 0.1, metalness: 0.2 });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x39e6ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 12; i++) {
      const p = this.spot(45 + i * 6, Math.min(SIZE / 2 - 70, 90 + i * 14));
      const g = new THREE.Group();
      g.position.set(p.x, p.y + 2.2, p.z);
      const gem = new THREE.Mesh(geo, mat);
      gem.scale.set(1, 1.6, 1);
      g.add(gem);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 30, 8, 1, true), beamMat);
      beam.position.y = 15;
      g.add(beam);
      this.group.add(g);
      this.crystals.push({ group: g, gem, taken: false, pos: g.position });
    }
  }

  lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x9a7cff, 0x1a3a2a, 0.75));
    const sun = new THREE.DirectionalLight(0xbfe6ff, 1.3);
    sun.position.set(-60, 90, 40);
    sun.castShadow = true;
    const sm = this.low ? 1024 : 2048;
    sun.shadow.mapSize.set(sm, sm);
    const c = sun.shadow.camera;
    c.left = -40; c.right = 40; c.top = 40; c.bottom = -40; c.near = 1; c.far = 260;
    sun.shadow.bias = -0.0005;
    s.add(sun, sun.target);
    this.sun = sun;
  }

  /** Keeps the sun's shadows around the player. */
  follow(p) {
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).add(new THREE.Vector3(-60, 90, 40));
  }

  update(t, dt) {
    for (const s of this.swayers) s.rotation.z = Math.sin(t * 1.3 + s.userData.phase) * 0.18;
    for (const c of this.crystals) {
      if (c.taken) continue;
      c.gem.rotation.y += dt * 1.5;
      c.gem.position.y = Math.sin(t * 2 + c.pos.x) * 0.3;
    }
    for (const p of this.pools) p.mesh.material.emissiveIntensity = 0.9 + Math.sin(t * 2) * 0.25;
  }

  /** Pushes a circle (x, z, r) out of rocks and spires. */
  collide(pos, r) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + r;
      if (d < min && d > 0.0001) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
    const lim = SIZE / 2 - 30;
    pos.x = THREE.MathUtils.clamp(pos.x, -lim, lim);
    pos.z = THREE.MathUtils.clamp(pos.z, -lim, lim);
  }

  inAcid(x, z) {
    return this.pools.some((p) => Math.hypot(p.x - x, p.z - z) < p.r);
  }
}
