// The robot helper: an industrial arm on a floor rail, with a camera head and a light ring that shows its mood.
import * as THREE from 'three';
import * as tex from './textures.js';
import { LAYOUT } from './garage.js';

const L1 = 2.95, L2 = 2.8, SHOULDER_Y = 1.45, GRIP = 0.55;
const MOODS = { idle: 0x39c6ff, listening: 0x3dff7a, thinking: 0xffd23a, talking: 0xffa24a, working: 0x39c6ff, error: 0xff3b2f };

export class Robot {
  constructor(scene) {
    const g = this.group = new THREE.Group();
    scene.add(g);
    const graphite = new THREE.MeshStandardMaterial({ color: 0x33373d, metalness: 0.8, roughness: 0.42, roughnessMap: tex.brushed() });
    const white = new THREE.MeshStandardMaterial({ color: 0xd8dade, metalness: 0.3, roughness: 0.35, roughnessMap: tex.paintWear() });
    const dark = new THREE.MeshStandardMaterial({ color: 0x151719, metalness: 0.4, roughness: 0.7 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xa4aab0, metalness: 1, roughness: 0.3 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xd9a62b, metalness: 0.4, roughness: 0.45 });
    this.ledMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: MOODS.idle, emissiveIntensity: 3 });
    const m = (geo, mat, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(x, y, z);
      o.castShadow = o.receiveShadow = true;
      return o;
    };

    // carriage on the rail
    this.carriage = new THREE.Group();
    this.carriage.position.set(2.5, 0, LAYOUT.railZ);
    g.add(this.carriage);
    this.carriage.add(m(new THREE.BoxGeometry(1.35, 0.32, 1.15), graphite, 0, 0.36, 0));
    this.carriage.add(m(new THREE.BoxGeometry(1.4, 0.06, 1.2), accent, 0, 0.53, 0));
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      const wh = m(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 16), dark, s * 0.5, 0.23, t * 0.42);
      wh.rotation.x = Math.PI / 2;
      this.carriage.add(wh);
    }
    this.carriage.add(m(new THREE.BoxGeometry(0.3, 0.04, 0.02), this.ledMat, 0.45, 0.4, 0.58));

    // turret (turns left/right)
    this.turret = new THREE.Group();
    this.turret.position.y = 0.56;
    this.carriage.add(this.turret);
    this.turret.add(m(new THREE.CylinderGeometry(0.55, 0.62, 0.45, 32), white, 0, 0.22, 0));
    this.turret.add(m(new THREE.CylinderGeometry(0.45, 0.5, 0.35, 32), graphite, 0, 0.6, 0));
    this.turret.add(m(new THREE.TorusGeometry(0.56, 0.02, 6, 48), this.ledMat, 0, 0.45, 0).rotateX(Math.PI / 2));

    // shoulder (tips up/down); the arm points along +Z
    this.shoulder = new THREE.Group();
    this.shoulder.position.y = SHOULDER_Y - 0.56;
    this.turret.add(this.shoulder);
    const sj = m(new THREE.CylinderGeometry(0.34, 0.34, 0.75, 32), graphite);
    sj.rotation.z = Math.PI / 2;
    this.shoulder.add(sj);
    for (const s of [-1, 1]) {
      const cap = m(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 24), accent, s * 0.4, 0, 0);
      cap.rotation.z = Math.PI / 2;
      this.shoulder.add(cap);
    }
    this.shoulder.add(m(new THREE.BoxGeometry(0.42, 0.42, L1 - 0.4), white, 0, 0, L1 / 2));
    this.shoulder.add(m(new THREE.BoxGeometry(0.44, 0.06, L1 - 0.6), dark, 0, 0.22, L1 / 2));
    // hydraulic piston along the upper arm
    this.shoulder.add(m(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 12), graphite, 0, -0.32, 0.9).rotateX(Math.PI / 2));
    this.shoulder.add(m(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 12), steel, 0, -0.32, 1.9).rotateX(Math.PI / 2));

    // elbow
    this.elbow = new THREE.Group();
    this.elbow.position.z = L1;
    this.shoulder.add(this.elbow);
    const ej = m(new THREE.CylinderGeometry(0.27, 0.27, 0.6, 32), graphite);
    ej.rotation.z = Math.PI / 2;
    this.elbow.add(ej);
    this.elbow.add(m(new THREE.BoxGeometry(0.32, 0.32, L2 - 0.35), white, 0, 0, L2 / 2));
    this.elbow.add(m(new THREE.BoxGeometry(0.34, 0.05, L2 - 0.6), dark, 0, 0.17, L2 / 2));
    // cable loop
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0.2, 0.15, -L1 * 0.4), new THREE.Vector3(0.35, 0.6, 0), new THREE.Vector3(0.2, 0.15, L2 * 0.3)), 16, 0.035, 6), dark);
    this.elbow.add(cable);

    // wrist and camera head with gripper
    this.wrist = new THREE.Group();
    this.wrist.position.z = L2;
    this.elbow.add(this.wrist);
    const wj = m(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 24), graphite);
    wj.rotation.z = Math.PI / 2;
    this.wrist.add(wj);
    this.head = new THREE.Group();
    this.wrist.add(this.head);
    this.head.add(m(new THREE.BoxGeometry(0.5, 0.36, 0.42), white, 0, 0.05, 0.25));
    const lens = m(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 24), dark, 0, 0.08, 0.5);
    lens.rotation.x = Math.PI / 2;
    this.head.add(lens);
    this.eye = m(new THREE.CircleGeometry(0.075, 24), this.ledMat, 0, 0.08, 0.565);
    this.head.add(this.eye);
    this.head.add(m(new THREE.TorusGeometry(0.12, 0.012, 6, 32), this.ledMat, 0, 0.08, 0.56));
    // the gripper: two fingers under the head
    this.fingers = [];
    for (const s of [-1, 1]) {
      const f = new THREE.Group();
      f.position.set(s * 0.12, -0.18, 0.4);
      f.add(m(new THREE.BoxGeometry(0.06, 0.08, 0.36), steel, 0, 0, 0.12));
      f.add(m(new THREE.BoxGeometry(0.07, 0.1, 0.1), dark, -s * 0.02, 0, 0.3));
      this.head.add(f);
      this.fingers.push(f);
    }
    this.grip = new THREE.Group();          // what it's holding hangs here
    this.grip.position.set(0, -0.2, GRIP);
    this.head.add(this.grip);

    // light that follows the head, so the robot glows a little in its mood colour
    this.light = new THREE.PointLight(MOODS.idle, 3, 3, 2);
    this.light.position.set(0, 0.1, 0.7);
    this.head.add(this.light);

    // state
    this.target = new THREE.Vector3(2.5, 2.6, LAYOUT.railZ + 1.4);
    this.lookAt = null;
    this.angles = { yaw: 0, sh: 0.6, el: 1.6, wr: 0 };
    this.mood = 'idle';
    this.speed = 1;
    this.talkLevel = 0;
    this.gripOpen = 1;
    this.homeX = 2.6;
    this.holding = null;
  }

  setMood(mood) {
    this.mood = mood;
    const c = MOODS[mood] ?? MOODS.idle;
    this.ledMat.emissive.setHex(c);
    this.light.color.setHex(c);
  }

  /** The point between the fingers, in the world. */
  gripWorld() {
    return this.grip.getWorldPosition(new THREE.Vector3());
  }

  home(camPos) {
    this.lookAt = camPos;
    this.target.set(this.homeX, 2.7, LAYOUT.railZ + 1.3);
  }

  /** Moves until the grip reaches `p`. Resolves when it's there. */
  reach(p, { tolerance = 0.06, timeout = 6 } = {}) {
    this.target.copy(p);
    return new Promise((resolve) => {
      const start = performance.now();
      const check = () => {
        if (this.gripWorld().distanceTo(this.target) < tolerance || performance.now() - start > timeout * 1000) resolve();
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  take(object) {
    this.holding = object;
    this.grip.attach(object);
    this.gripOpen = 0.25;
  }

  release() {
    const o = this.holding;
    this.holding = null;
    this.gripOpen = 1;
    return o;
  }

  /** Solves the arm for the current target and eases the joints there. */
  update(t, dt) {
    const T = this.target.clone();
    if (this.mood === 'talking') T.y += Math.sin(t * 9) * 0.04 * (0.5 + this.talkLevel);
    // the carriage slides along the rail to line up with the target
    const [x0, x1] = LAYOUT.railX;
    const want = THREE.MathUtils.clamp(T.x + (T.z < LAYOUT.railZ - 2 ? 0 : 0.6 * Math.sign(T.x || 1)), x0, x1);
    const cx = this.carriage.position.x;
    const step = Math.sign(want - cx) * Math.min(Math.abs(want - cx), dt * 3.2 * this.speed);
    this.carriage.position.x += step;

    // aim: the wrist sits GRIP short of the target, horizontally, so the head points at it
    const base = new THREE.Vector3(this.carriage.position.x, SHOULDER_Y, LAYOUT.railZ);
    const flat = new THREE.Vector3(T.x - base.x, 0, T.z - base.z);
    const flatLen = Math.max(0.001, flat.length());
    const dir = flat.clone().divideScalar(flatLen);
    const wristTarget = T.clone().addScaledVector(dir, -GRIP).add(new THREE.Vector3(0, 0.2, 0));
    const dx = wristTarget.x - base.x, dz = wristTarget.z - base.z;
    const yaw = Math.atan2(dx, dz);
    const r = Math.max(0.3, Math.hypot(dx, dz));
    const v = wristTarget.y - base.y;
    const D = THREE.MathUtils.clamp(Math.hypot(r, v), Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.02);
    const a = Math.atan2(v, r);
    const b = Math.acos(THREE.MathUtils.clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    const c = Math.acos(THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
    const sh = a + b;                  // upper arm up from horizontal
    const el = Math.PI - c;            // elbow bend
    const foreElev = sh - el;
    // the head looks level, or at the camera when idle
    let headElev = 0;
    if (this.lookAt && !this.holding && this.mood !== 'working') {
      const wp = this.wrist.getWorldPosition(new THREE.Vector3());
      const to = this.lookAt.clone().sub(wp);
      headElev = Math.atan2(to.y, Math.hypot(to.x, to.z));
    }
    const wr = headElev - foreElev;

    const k = Math.min(1, dt * 4.5 * this.speed);
    const A = this.angles;
    A.yaw += angleDiff(yaw, A.yaw) * k;
    A.sh += (sh - A.sh) * k;
    A.el += (el - A.el) * k;
    A.wr += (wr - A.wr) * k;
    this.turret.rotation.y = A.yaw;
    this.shoulder.rotation.x = -A.sh;
    this.elbow.rotation.x = A.el;
    this.wrist.rotation.x = -A.wr;
    // head turns towards the camera when it's just chatting
    let headYaw = 0;
    if (this.lookAt && !this.holding && this.mood !== 'working') {
      const hp = this.head.getWorldPosition(new THREE.Vector3());
      const to = this.lookAt.clone().sub(hp);
      headYaw = angleDiff(Math.atan2(to.x, to.z), A.yaw);
      headYaw = THREE.MathUtils.clamp(headYaw, -1.2, 1.2);
    }
    this.head.rotation.y += (headYaw - this.head.rotation.y) * Math.min(1, dt * 4);

    for (const [i, f] of this.fingers.entries()) {
      const s = i ? 1 : -1;
      f.position.x += (s * (0.06 + this.gripOpen * 0.12) - f.position.x) * Math.min(1, dt * 8);
    }
    // the light ring breathes
    const pulse = this.mood === 'listening' ? 2.5 + Math.sin(t * 8) * 1.5 : this.mood === 'talking' ? 2.6 + this.talkLevel * 3 : 2.6 + Math.sin(t * 2) * 0.4;
    this.ledMat.emissiveIntensity = pulse;
    this.light.intensity = pulse * 0.9;
  }
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
