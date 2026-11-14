// Alien creatures on the test planet.
//   Skitter: small six-legged crawler. Runs in packs, chases and nibbles. One zap.
//   Floater: glowing jellyfish that drifts overhead. Harmless, worth extra points.
//   Stomper: big horned beast. Roars, then charges. Takes several hits.
// Zapped creatures pop into sparkles and come back somewhere else later.
import * as THREE from '../../vendor/three/three.module.js';
import { height } from './planet.js';

const TYPES = {
  skitter: { hp: 1, r: 1.0, speed: 5, chase: 9, points: 1, count: 14 },
  floater: { hp: 1, r: 1.4, speed: 2, chase: 0, points: 2, count: 8 },
  stomper: { hp: 6, r: 2.4, speed: 3, chase: 13, points: 5, count: 3 },
};

export class Creatures {
  constructor(scene, planet, quality = 'high') {
    this.scene = scene;
    this.planet = planet;
    this.list = [];
    this.scale = quality === 'low' ? 0.65 : 1;
    this.makeLooks();
    for (const [type, def] of Object.entries(TYPES)) {
      for (let i = 0; i < Math.round(def.count * this.scale); i++) this.spawn(type, null, true);
    }
  }

  makeLooks() {
    const std = (c, e, ei = 0) => new THREE.MeshStandardMaterial({ color: c, emissive: e ?? 0x000000, emissiveIntensity: ei, roughness: 0.55 });
    this.mats = {
      skitBody: std(0x3d6b2a, 0x2a5a10, 0.4), skitLeg: std(0x1b2a14), eye: std(0x000000, 0xffe14a, 3),
      jelly: new THREE.MeshStandardMaterial({ color: 0x401050, emissive: 0xff5cc8, emissiveIntensity: 1.6, transparent: true, opacity: 0.75, roughness: 0.2 }),
      tentacle: new THREE.MeshStandardMaterial({ color: 0x200830, emissive: 0xb05cff, emissiveIntensity: 1.2, transparent: true, opacity: 0.7 }),
      stompBody: std(0x5a3a2a, 0x3a1a0a, 0.2), stompHorn: std(0xe8dcc0), stompSpike: std(0x2a1a14, 0xff4a1a, 1.2),
      hit: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 }),
    };
    this.geo = {
      body: new THREE.SphereGeometry(1, 16, 10),
      leg: new THREE.CylinderGeometry(0.05, 0.035, 1, 5),
      eye: new THREE.SphereGeometry(0.1, 8, 6),
      dome: new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 1.8),
      horn: new THREE.ConeGeometry(0.25, 1.4, 8),
      spike: new THREE.ConeGeometry(0.2, 0.8, 6),
      thick: new THREE.CylinderGeometry(0.35, 0.3, 1, 8),
    };
  }

  build(type) {
    const g = new THREE.Group();
    const parts = { legs: [] };
    const M = this.mats, G = this.geo;
    const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    };
    if (type === 'skitter') {
      const body = mesh(G.body, M.skitBody, 0, 0.7, 0);
      body.scale.set(0.8, 0.45, 1.1);
      g.add(body);
      for (const s of [-1, 1]) g.add(mesh(G.eye, M.eye, s * 0.25, 0.85, 1.0));
      for (let i = 0; i < 6; i++) {
        const s = i < 3 ? -1 : 1, z = ((i % 3) - 1) * 0.6;
        const hip = new THREE.Group();
        hip.position.set(s * 0.6, 0.7, z);
        const leg = mesh(G.leg, M.skitLeg, s * 0.45, -0.15, 0);
        leg.scale.y = 1.2;
        leg.rotation.z = s * 1.0;
        hip.add(leg);
        g.add(hip);
        parts.legs.push(hip);
      }
    } else if (type === 'floater') {
      const dome = mesh(G.dome, M.jelly);
      dome.scale.set(1.3, 1.0, 1.3);
      g.add(dome);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const t = new THREE.Group();
        t.position.set(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8);
        const seg = mesh(G.leg, M.tentacle, 0, -1.5, 0);
        seg.scale.set(2, 3, 2);
        t.add(seg);
        g.add(t);
        parts.legs.push(t);
      }
    } else {
      const body = mesh(G.body, M.stompBody, 0, 2.2, 0);
      body.scale.set(1.5, 1.2, 2.2);
      g.add(body);
      const head = mesh(G.body, M.stompBody, 0, 2.0, 2.2);
      head.scale.set(0.9, 0.8, 0.9);
      g.add(head);
      for (const s of [-1, 1]) {
        const horn = mesh(G.horn, M.stompHorn, s * 0.55, 2.6, 2.7);
        horn.rotation.set(0.9, 0, -s * 0.5);
        g.add(horn);
        g.add(mesh(G.eye, M.eye, s * 0.4, 2.2, 3.0));
      }
      for (let i = 0; i < 5; i++) {
        const sp = mesh(G.spike, M.stompSpike, 0, 3.4 - Math.abs(i - 2) * 0.1, -1.4 + i * 0.7);
        g.add(sp);
      }
      for (const [x, z] of [[-1, 1.2], [1, 1.2], [-1, -1.2], [1, -1.2]]) {
        const hip = new THREE.Group();
        hip.position.set(x, 1.6, z);
        const leg = mesh(G.thick, M.stompBody, 0, -0.8, 0);
        leg.scale.y = 1.7;
        hip.add(leg);
        g.add(hip);
        parts.legs.push(hip);
      }
    }
    g.userData.parts = parts;
    return g;
  }

  /** Puts a creature somewhere away from the player (or anywhere at the start). */
  spawn(type, player, initial = false) {
    const def = TYPES[type];
    let p;
    for (let i = 0; i < 20; i++) {
      p = this.planet.spot(initial ? 40 : 30, 240);
      if (!player || p.distanceTo(player) > 45) break;
    }
    const group = this.build(type);
    group.position.copy(p);
    this.scene.add(group);
    this.list.push({
      type, def, group, pos: group.position, hp: def.hp, vel: new THREE.Vector3(),
      heading: Math.random() * Math.PI * 2, t: Math.random() * 10, state: 'wander', cool: 0, flash: 0,
      alt: type === 'floater' ? 6 + Math.random() * 6 : 0, home: p.clone(),
    });
  }

  /**
   * Moves every creature. Returns what happened to the player this frame:
   * { damage, knock: Vector3|null, roars: [creature], nibbles }.
   */
  update(dt, player) {
    const out = { damage: 0, knock: null, roar: false };
    for (const c of this.list) {
      c.t += dt;
      c.cool = Math.max(0, c.cool - dt);
      const toP = new THREE.Vector3(player.pos.x - c.pos.x, 0, player.pos.z - c.pos.z);
      const dist = toP.length();
      const def = c.def;
      let speed = def.speed;
      if (c.type === 'floater') {
        c.heading += Math.sin(c.t * 0.3) * dt * 0.5;
        if (c.pos.distanceTo(c.home) > 40) c.heading = Math.atan2(c.home.x - c.pos.x, c.home.z - c.pos.z);
      } else if (c.type === 'skitter') {
        if (dist < 32 && !player.down) { c.state = 'chase'; c.heading = Math.atan2(toP.x, toP.z); speed = def.chase; }
        else { c.state = 'wander'; c.heading += (Math.sin(c.t * 0.7) + Math.sin(c.t * 1.9)) * dt * 0.8; }
        if (dist < def.r + 2.2 && !player.down) {
          speed = 0;
          out.damage += 7 * dt;                       // nibble
          if (player.thorns && c.cool <= 0) { c.cool = 0.6; this.hurt(c, 1); }
        }
      } else {
        // stomper: wanders, roars when it sees the mech, then charges
        if (c.state === 'wander') {
          c.heading += Math.sin(c.t * 0.4) * dt * 0.4;
          if (dist < 38 && !player.down && c.cool <= 0) { c.state = 'roar'; c.timer = 1.1; out.roar = true; }
        } else if (c.state === 'roar') {
          speed = 0;
          c.heading = Math.atan2(toP.x, toP.z);
          c.timer -= dt;
          if (c.timer <= 0) { c.state = 'charge'; c.timer = 3; }
        } else if (c.state === 'charge') {
          speed = def.chase;
          c.timer -= dt;
          if (dist < def.r + 2.6) {
            out.damage += 16;
            out.knock = toP.clone().normalize().multiplyScalar(14);
            c.state = 'wander'; c.cool = 5;
          }
          if (c.timer <= 0) { c.state = 'wander'; c.cool = 3; }
        }
      }
      // move
      const dir = new THREE.Vector3(Math.sin(c.heading), 0, Math.cos(c.heading));
      c.pos.addScaledVector(dir, speed * dt);
      this.planet.collide(c.pos, def.r);
      if (this.planet.inAcid(c.pos.x, c.pos.z) && c.type !== 'floater') c.heading += Math.PI * dt * 2;
      const ground = height(c.pos.x, c.pos.z);
      c.pos.y = c.type === 'floater' ? ground + c.alt + Math.sin(c.t * 1.5) * 0.6 : ground;
      c.group.rotation.y = THREE.MathUtils.lerp(c.group.rotation.y, c.heading, Math.min(1, dt * 6));
      // animate legs / tentacles
      const legs = c.group.userData.parts.legs;
      legs.forEach((l, i) => {
        if (c.type === 'floater') l.rotation.x = Math.sin(c.t * 2 + i) * 0.35;
        else l.rotation.x = speed > 0 ? Math.sin(c.t * (c.type === 'skitter' ? 22 : 7) + i * Math.PI) * (c.type === 'skitter' ? 0.6 : 0.4) : 0;
      });
      if (c.state === 'roar') c.group.rotation.x = -Math.sin(c.timer * 10) * 0.08;
      else c.group.rotation.x = 0;
      // flash white when hit
      if (c.flash > 0) {
        c.flash -= dt;
        if (c.flash <= 0) c.group.traverse((o) => { if (o.isMesh && o.userData.mat) { o.material = o.userData.mat; o.userData.mat = null; } });
      }
    }
    return out;
  }

  /** Centre of a creature's body (what shots aim at). */
  centre(c) {
    const y = c.type === 'stomper' ? 2.2 : c.type === 'skitter' ? 0.7 : 0;
    return c.pos.clone().setY(c.pos.y + y);
  }

  /** The nearest creature in front of `from` along `dir` (within `cone` radians and `range` metres). */
  target(from, dir, range = 70, cone = 0.35) {
    let best = null, bestScore = Infinity;
    for (const c of this.list) {
      const to = this.centre(c).sub(from);
      const d = to.length();
      if (d > range) continue;
      const ang = to.normalize().angleTo(dir);
      if (ang > cone) continue;
      const score = ang * 30 + d;
      if (score < bestScore) { best = c; bestScore = score; }
    }
    return best;
  }

  /** Every creature within `r` of `p`. */
  near(p, r) {
    return this.list.filter((c) => this.centre(c).distanceTo(p) < r + c.def.r);
  }

  /** Damages a creature. Returns true if it was zapped away. */
  hurt(c, dmg) {
    c.hp -= dmg;
    if (c.hp > 0) {
      c.flash = 0.12;
      c.group.traverse((o) => { if (o.isMesh && !o.userData.mat) { o.userData.mat = o.material; o.material = this.mats.hit; } });
      if (c.type === 'stomper' && c.state === 'wander') { c.state = 'roar'; c.timer = 0.6; }
      return false;
    }
    this.remove(c);
    return true;
  }

  remove(c) {
    c.group.removeFromParent();
    this.list.splice(this.list.indexOf(c), 1);
    const type = c.type;
    setTimeout(() => { if (!this.disposed) this.spawn(type, this.lastPlayer); }, 6000 + Math.random() * 8000);
  }

  set player(p) { this.lastPlayer = p; }
}
