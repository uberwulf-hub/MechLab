// The mech on the assembly stand: which part is on which socket, the part being held out for fitting, paint and animation.
import * as THREE from '../vendor/three/three.module.js';
import { SLOTS, PARTS, partById, buildPart, makeMaterials, repaint } from './parts.js';

/** Size and length limits for customising a part. */
export const CUSTOM_LIMITS = { scale: [0.8, 1.3], length: [0.8, 1.4] };
import { LAYOUT } from './garage.js';

// how far out a part is held before it's pushed in
export const stageDist = (slot) => slot === 'hull' ? 1.9 : slot.startsWith('shoulder') ? 1.1 : slot === 'back' ? 1.4 : slot === 'head' ? 1.3 : 1.6;
export const SEAT_DIST = 0.35;          // close enough to lock on
const PLATFORM_TOP = 0.16;

const HULL_SOCKET = { pos: [0, 0, 0], out: [0, 0, 1] };

export class Mech {
  constructor(scene, paint) {
    this.paint = { ...paint };
    this.mats = makeMaterials(this.paint);
    this.root = new THREE.Group();          // turns with the turntable
    this.root.position.copy(LAYOUT.platform);
    scene.add(this.root);
    this.lift = new THREE.Group();          // hoist height
    this.lift.position.y = LAYOUT.hullHeight;
    this.root.add(this.lift);
    this.hullSocket = this.makeSocket('hull', HULL_SOCKET, this.lift);
    this.hull = null;                       // { part, group, sockets }
    this.sockets = {};                      // slot -> socket group on the hull
    this.attached = {};                     // slot -> { part, group }
    this.held = null;                       // { slot, part, group, dist }
    this.explode = 0;
    this.explodeTarget = 0;
    this.liftTarget = LAYOUT.hullHeight;
    this.walking = false;
    this.walkT = 0;
    this.spin = 0;
    this.turnTarget = null;
    // poses the test planet drives: walk speed, stride, arms aimed forward, legs tucked in a jump, a punch
    // the pilot's own touches per slot: { primary, accent, scale, length, label, nickname }
    this.custom = {};
    this.walkRate = 2.0;
    this.stride = 0.5;
    this.pose = { aimL: 0, aimR: 0, air: 0, punchL: 0, punchR: 0 };                 // turntable angle to turn to (e.g. so the robot can reach the back)
    this.onHeightChange = null;
  }

  makeSocket(slot, def, parent) {
    const s = new THREE.Group();
    s.position.fromArray(def.pos);
    s.userData = { slot, out: new THREE.Vector3().fromArray(def.out) };
    parent.add(s);
    return s;
  }

  socketFor(slot) {
    return slot === 'hull' ? this.hullSocket : this.sockets[slot];
  }

  /** World position and outward direction of a socket (where the part will sit, and which way is "out"). */
  socketWorld(slot, dist = 0) {
    const s = this.socketFor(slot);
    if (!s) return null;
    s.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3().setFromMatrixPosition(s.matrixWorld);
    const q = new THREE.Quaternion();
    s.getWorldQuaternion(q);
    const out = s.userData.out.clone().applyQuaternion(q);
    return { pos: pos.addScaledVector(out, dist), out };
  }

  canFit(slot) {
    if (slot === 'hull') return true;
    return !!this.hull;
  }

  /** The materials a slot's part is built with: the mech's, or its own if it has its own paint. */
  matsFor(slot) {
    const c = this.custom[slot];
    if (!c) return this.mats;
    let m = this.mats;
    if (c.primary || c.accent) {
      this.slotMats ??= {};
      m = this.slotMats[slot] ??= makeMaterials(this.paint);
      repaint(m, { primary: c.primary ?? this.paint.primary, accent: c.accent ?? this.paint.accent, glow: this.paint.glow });
    }
    return c.label ? { ...m, label: c.label } : m;
  }

  /** A fresh copy of a part, built in this mech's paint (or the slot's own), at the slot's size. */
  make(partId, slot) {
    const part = partById(partId);
    const built = buildPart(part, slot, this.matsFor(slot));
    const c = this.custom[slot];
    if (c && slot !== 'hull') {
      const k = c.scale ?? 1;
      const stretch = SLOTS[slot].kind === 'arm' || SLOTS[slot].kind === 'leg' ? (c.length ?? 1) : 1;
      built.group.scale.set(k, k * stretch, k);
    }
    built.group.userData.partId = partId;
    built.group.traverse((o) => { o.userData.slot = slot; });
    return { part, ...built };
  }

  /** Puts a part (already in the scene, e.g. in the robot's gripper) on hold in front of its socket. */
  hold(slot, made) {
    const socket = this.socketFor(slot);
    socket.attach(made.group); // keep where it is in the world for now
    this.held = { slot, part: made.part, group: made.group, sockets: made.sockets, dist: stageDist(slot), settle: 0 };
    return this.held;
  }

  nudge(delta) {
    if (!this.held) return null;
    this.held.dist = THREE.MathUtils.clamp(this.held.dist + delta, 0.05, 3.2);
    return this.held.dist;
  }

  get heldReady() { return !!this.held && this.held.dist <= SEAT_DIST + 0.01; }

  /** Locks the held part onto its socket. Returns the slot. */
  lockHeld() {
    const h = this.held;
    if (!h) return null;
    this.held = null;
    const { slot } = h;
    if (slot === 'hull') {
      this.installHull(h);
    } else {
      this.attached[slot] = { part: h.part, group: h.group };
      h.group.userData.seat = { from: h.group.position.clone(), q: h.group.quaternion.clone(), t: 0 };
    }
    this.updateStanding();
    return slot;
  }

  installHull(h) {
    const old = this.hull;
    this.hull = { part: h.part, group: h.group, sockets: h.sockets };
    h.group.userData.seat = { from: h.group.position.clone(), q: h.group.quaternion.clone(), t: 0 };
    // new sockets; anything already fitted moves across to the new hull
    const keep = {};
    for (const [slot, s] of Object.entries(this.sockets)) keep[slot] = [...s.children];
    this.sockets = {};
    for (const [slot, def] of Object.entries(h.sockets)) {
      this.sockets[slot] = this.makeSocket(slot, def, h.group);
      for (const c of keep[slot] ?? []) this.sockets[slot].add(c);
    }
    if (old) old.group.parent?.remove(old.group);
  }

  /** Takes a fitted part off, leaving it in the world (so the robot can carry it away). */
  remove(slot) {
    if (slot === 'hull') {
      const h = this.hull;
      if (!h) return null;
      for (const s of Object.keys(this.attached)) this.remove(s)?.removeFromParent();
      this.hull = null;
      this.sockets = {};
      this.updateStanding();
      return h.group;
    }
    const a = this.attached[slot];
    if (!a) return null;
    delete this.attached[slot];
    const scene = this.root.parent;
    scene.attach(a.group);
    this.updateStanding();
    return a.group;
  }

  dropHeld() {
    const h = this.held;
    if (!h) return null;
    this.held = null;
    this.root.parent.attach(h.group);
    return h;
  }

  partIn(slot) {
    if (slot === 'hull') return this.hull?.part ?? null;
    return this.attached[slot]?.part ?? null;
  }

  /** Which parts are on, as { slot: partId }, for saving. */
  get layout() {
    const out = {};
    if (this.hull) out.hull = this.hull.part.id;
    for (const [s, a] of Object.entries(this.attached)) out[s] = a.part.id;
    return out;
  }

  /** Puts parts straight on with no animation (loading a save). */
  loadLayout(layout) {
    this.clearAll();
    if (layout.hull) {
      const h = this.make(layout.hull, 'hull');
      this.hullSocket.add(h.group);
      this.installHull({ ...h });
      this.hull.group.userData.seat = null;
    }
    for (const [slot, id] of Object.entries(layout)) {
      if (slot === 'hull' || !this.hull || !this.sockets[slot] || !partById(id)) continue;
      const p = this.make(id, slot);
      this.sockets[slot].add(p.group);
      this.attached[slot] = { part: p.part, group: p.group };
    }
    this.updateStanding(true);
  }

  clearAll() {
    if (this.held) this.dropHeld().group.removeFromParent();
    for (const s of Object.keys(this.attached)) this.remove(s)?.removeFromParent();
    if (this.hull) this.remove('hull')?.removeFromParent();
  }

  setPaint(p) {
    Object.assign(this.paint, p);
    repaint(this.mats, this.paint);
    // parts with their own paint keep it, but share the mech's light colour
    for (const [slot, m] of Object.entries(this.slotMats ?? {})) {
      const c = this.custom[slot] ?? {};
      repaint(m, { primary: c.primary ?? this.paint.primary, accent: c.accent ?? this.paint.accent, glow: this.paint.glow });
    }
  }

  /** Changes a slot's own touches ({ primary, accent, scale, length, label, nickname }; null clears one) and rebuilds it. */
  customize(slot, patch) {
    const c = { ...(this.custom[slot] ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === undefined) delete c[k];
      else c[k] = v;
    }
    if (c.scale) c.scale = Math.min(CUSTOM_LIMITS.scale[1], Math.max(CUSTOM_LIMITS.scale[0], c.scale));
    if (c.length) c.length = Math.min(CUSTOM_LIMITS.length[1], Math.max(CUSTOM_LIMITS.length[0], c.length));
    if (c.scale === 1) delete c.scale;
    if (c.length === 1) delete c.length;
    if (Object.keys(c).length) this.custom[slot] = c; else delete this.custom[slot];
    if (!(c.primary || c.accent) && this.slotMats?.[slot]) delete this.slotMats[slot];
    this.rebuild(slot);
  }

  /** Rebuilds a fitted part in place (after customising it). */
  rebuild(slot) {
    if (slot === 'hull') {
      if (!this.hull) return;
      const made = this.make(this.hull.part.id, 'hull');
      this.hullSocket.add(made.group);
      this.installHull({ ...made });
      this.hull.group.userData.seat = null;
    } else {
      const a = this.attached[slot];
      if (!a) return;
      const made = this.make(a.part.id, slot);
      made.group.position.copy(a.group.position);
      made.group.quaternion.copy(a.group.quaternion);
      this.sockets[slot].add(made.group);
      a.group.removeFromParent();
      a.group = made.group;
    }
    this.updateStanding();
  }

  nickname(slot) { return this.custom[slot]?.nickname ?? null; }

  stats() {
    const parts = [this.hull?.part, ...Object.values(this.attached).map((a) => a.part)].filter(Boolean);
    const s = { armor: 0, power: 0, weight: 0, speed: 0 };
    const sized = [['hull', this.hull?.part], ...Object.entries(this.attached).map(([k, a]) => [k, a.part])].filter(([, p]) => p);
    for (const [slot, p] of sized) {
      const c = this.custom[slot] ?? {};
      const size = (c.scale ?? 1) ** 2 * (c.length ?? 1);   // bigger parts: more armour, more weight
      for (const k of Object.keys(s)) s[k] += k === 'armor' || k === 'weight' ? p.stats[k] * size : p.stats[k];
    }
    s.armor = Math.round(s.armor);
    s.power += this.hull ? 40 : 0; // the cockpit's own battery
    s.weight = Math.round(s.weight * 10) / 10;
    const missing = Object.keys(SLOTS).filter((k) => !this.partIn(k));
    return { ...s, missing, complete: missing.length === 0, count: parts.length };
  }

  /** With both legs on, the hoist lowers the mech so its feet stand on the platform. */
  updateStanding(instant = false) {
    let target = LAYOUT.hullHeight;
    if (this.hull && this.attached.legL && this.attached.legR) {
      // measure the lowest point of the legs, relative to the hoist
      this.root.updateMatrixWorld(true);
      const liftY = this.lift.getWorldPosition(new THREE.Vector3()).y;
      let low = Infinity;
      for (const slot of ['legL', 'legR']) {
        const g = this.attached[slot].group;
        const saved = g.position.clone();
        g.position.set(0, 0, 0);
        g.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(g);
        g.position.copy(saved);
        low = Math.min(low, b.min.y - liftY);
      }
      target = PLATFORM_TOP - low;
    }
    this.liftTarget = target;
    if (instant) this.lift.position.y = target;
  }

  get standing() { return !!(this.hull && this.attached.legL && this.attached.legR); }

  update(t, dt) {
    // hoist
    const ly = this.lift.position.y;
    if (Math.abs(ly - this.liftTarget) > 0.001) {
      this.lift.position.y += (this.liftTarget - ly) * Math.min(1, dt * 2.2);
      this.onHeightChange?.(this.lift.position.y);
    }
    // exploded view
    this.explode += (this.explodeTarget - this.explode) * Math.min(1, dt * 5);
    // the held part glides to its distance
    if (this.held) {
      const g = this.held.group;
      const out = this.socketFor(this.held.slot).userData.out;
      const want = out.clone().multiplyScalar(this.held.dist);
      g.position.lerp(want, Math.min(1, dt * 4));
      g.quaternion.slerp(new THREE.Quaternion(), Math.min(1, dt * 4));
    }
    // fitted parts slide home (seat), or out (exploded view)
    const seat = (g, out) => {
      const want = out.clone().multiplyScalar(this.explode * 0.9);
      const st = g.userData.seat;
      if (st) {
        st.t = Math.min(1, st.t + dt * 2.5);
        const e = 1 - Math.pow(1 - st.t, 3);
        g.position.lerpVectors(st.from, want, e);
        g.quaternion.slerpQuaternions(st.q, new THREE.Quaternion(), e);
        if (st.t >= 1) g.userData.seat = null;
      } else {
        g.position.copy(want);
      }
    };
    if (this.hull) {
      const st = this.hull.group.userData.seat;
      if (st) seat(this.hull.group, new THREE.Vector3());
      else this.hull.group.position.set(0, 0, 0);
    }
    for (const [slot, a] of Object.entries(this.attached)) seat(a.group, this.sockets[slot].userData.out);

    this.animate(t, dt);
  }

  animate(t, dt) {
    const A = this.attached;
    // turntable spin
    if (this.turnTarget !== null) {
      let d = this.turnTarget - this.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.root.rotation.y += Math.sign(d) * Math.min(Math.abs(d), dt * 1.6);
      if (Math.abs(d) < 0.002) { this.root.rotation.y = this.turnTarget; this.turnTarget = null; }
    } else this.root.rotation.y += this.spin * dt;
    // idle: small breathing sway in the arms, spinning tools, beacons
    const breathe = Math.sin(t * 1.3) * 0.03;
    if (this.walking && this.standing) this.walkT += dt * this.walkRate;
    const w = this.walkT;
    const walk = this.walking && this.standing;
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const phase = side === 'L' ? 0 : Math.PI;
      const arm = A['arm' + side]?.group.userData.joints;
      if (arm) {
        const swing = walk ? Math.sin(w + phase + Math.PI) * 0.35 * (this.stride / 0.38) : 0;
        const aim = Math.max(this.pose['aim' + side], this.pose['punch' + side]);
        const reach = this.pose['punch' + side];
        let sh = THREE.MathUtils.lerp(swing + breathe, -1.45, aim);
        let el = THREE.MathUtils.lerp(walk ? -0.35 + Math.sin(w + phase) * 0.15 : -0.12 - breathe, -0.05, aim);
        if (reach > 0) el = THREE.MathUtils.lerp(el, -0.9, 1 - reach); // a punch shoots the forearm straight out
        arm.shoulder.rotation.x = THREE.MathUtils.lerp(arm.shoulder.rotation.x, sh, Math.min(1, dt * (aim > 0 ? 14 : 6)));
        arm.shoulder.rotation.z = s * 0.06;
        arm.elbow.rotation.x = THREE.MathUtils.lerp(arm.elbow.rotation.x, el, Math.min(1, dt * (reach > 0 ? 20 : 6)));
        if (arm.spinner) arm.spinner.rotation.x += dt * (walk ? 18 : 4);
        if (arm.drill) arm.drill.rotation.y += dt * (this.pose['aim' + side] > 0 || this.pose['punch' + side] > 0 ? 25 : walk ? 10 : 2);
      }
      const leg = A['leg' + side]?.group.userData.joints;
      if (leg) {
        const k = walk ? Math.sin(w + phase) : 0;
        const air = this.pose.air;
        const hip = THREE.MathUtils.lerp(k * this.stride, -0.55 + (side === 'L' ? 0.15 : -0.1), air);
        const knee = THREE.MathUtils.lerp(walk ? Math.max(0, -Math.cos(w + phase)) * this.stride * 1.6 : 0, 1.1, air);
        leg.hip.rotation.x = THREE.MathUtils.lerp(leg.hip.rotation.x, hip, Math.min(1, dt * 8));
        leg.knee.rotation.x = THREE.MathUtils.lerp(leg.knee.rotation.x, knee, Math.min(1, dt * 8));
        leg.ankle.rotation.x = -leg.hip.rotation.x - leg.knee.rotation.x;
        if (leg.wheel) leg.wheel.rotation.x += dt * (walk ? this.walkRate * 2.5 : 0);
      }
    }
    if (walk) this.lift.position.y = this.liftTarget + Math.abs(Math.sin(w)) * 0.1 * (this.stride / 0.5);
    for (const a of Object.values(A)) a.group.traverse((o) => {
      if (o.userData.beacon) o.rotation.y += dt * 6;
      if (o.userData.dish) o.rotation.z = Math.sin(t * 0.8) * 0.6;
      if (o.userData.ring) o.rotation.z += dt * 2;
    });
    if (this.hull) this.hull.group.rotation.z = walk ? Math.sin(w) * 0.02 : 0;
  }

  /** Every mesh on the mech (fitted or held), for picking with the pointer. */
  pickables() {
    const list = [];
    const add = (g) => g.traverse((o) => { if (o.isMesh) list.push(o); });
    if (this.hull) add(this.hull.group);
    for (const a of Object.values(this.attached)) add(a.group);
    if (this.held) add(this.held.group);
    return list;
  }
}

export { PARTS, SLOTS };
