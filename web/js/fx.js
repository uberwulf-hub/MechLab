// Visual effects: welding sparks and the scan glow when a part arrives on the lift.
import * as THREE from 'three';

const MAX = 600;

export class Sparks {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffb35c, size: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.flash = new THREE.PointLight(0xffa040, 0, 6, 2);
    scene.add(this.flash);
    this.next = 0;
    this.emitters = [];
  }

  burst(at, count = 80, speed = 3) {
    for (let i = 0; i < count; i++) {
      const k = this.next = (this.next + 1) % MAX;
      this.pos.set([at.x, at.y, at.z], k * 3);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      this.vel.set([v.x, v.y, v.z], k * 3);
      this.life[k] = 0.4 + Math.random() * 0.7;
    }
    this.flash.position.copy(at);
    this.flash.intensity = 12;
  }

  /** Keeps throwing sparks at `at` for `seconds` (welding). */
  weld(at, seconds = 1.2) {
    this.emitters.push({ at: at.clone(), left: seconds });
  }

  update(dt) {
    for (const e of this.emitters) {
      e.left -= dt;
      this.burst(e.at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15)), 6, 2.5);
      this.flash.intensity = 6 + Math.random() * 10;
    }
    this.emitters = this.emitters.filter((e) => e.left > 0);
    this.flash.intensity *= Math.pow(0.02, dt);
    for (let k = 0; k < MAX; k++) {
      if (this.life[k] <= 0) { this.pos[k * 3 + 1] = -100; continue; }
      this.life[k] -= dt;
      this.vel[k * 3 + 1] -= 9.8 * dt;
      for (let a = 0; a < 3; a++) this.pos[k * 3 + a] += this.vel[k * 3 + a] * dt;
      if (this.pos[k * 3 + 1] < 0.02) { this.pos[k * 3 + 1] = 0.02; this.vel[k * 3 + 1] *= -0.3; this.vel[k * 3] *= 0.6; this.vel[k * 3 + 2] *= 0.6; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Makes a blue wireframe "hologram" copy of a part, for the holo table. */
export function hologram(group) {
  const holo = group.clone(true);
  const mat = new THREE.MeshBasicMaterial({ color: 0x5ccfff, wireframe: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  holo.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
  // fit it to about 1.4 m tall, centred
  const box = new THREE.Box3().setFromObject(holo);
  const size = box.getSize(new THREE.Vector3());
  const s = 1.4 / Math.max(size.x, size.y, size.z, 0.01);
  holo.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
  holo.position.sub(c);
  const wrap = new THREE.Group();
  wrap.add(holo);
  return wrap;
}

/** Briefly lights a part up blue while it "materialises". */
export function materialize(group, seconds = 0.9) {
  const meshes = [];
  group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const originals = meshes.map((o) => o.material);
  const glow = new THREE.MeshStandardMaterial({ color: 0x0a2a3a, emissive: 0x39c6ff, emissiveIntensity: 2, transparent: true, opacity: 0.85 });
  for (const o of meshes) o.material = glow;
  const start = performance.now();
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    meshes.forEach((o, i) => { o.material = originals[i]; });
    group.scale.setScalar(1);
    glow.dispose();
  };
  // even if animation frames stop (window hidden, mode change), the part always gets its real paint back
  setTimeout(restore, seconds * 1000 + 600);
  return new Promise((resolve) => {
    const step = () => {
      if (restored) return resolve();
      const t = (performance.now() - start) / 1000 / seconds;
      glow.emissiveIntensity = 2 * (1 - t);
      group.scale.setScalar(Math.min(1, 0.2 + t * 1.2));
      if (t < 1) requestAnimationFrame(step);
      else { restore(); resolve(); }
    };
    step();
  });
}

/** Shrinks a part away into the lift ("back to storage") and removes it. */
export function dematerialize(group, seconds = 0.7) {
  const start = performance.now();
  const y0 = group.position.y;
  return new Promise((resolve) => {
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / 1000 / seconds);
      group.scale.setScalar(1 - t * 0.95);
      group.position.y = y0 - t * 1.2;
      if (t < 1) requestAnimationFrame(step);
      else { group.removeFromParent(); resolve(); }
    };
    step();
  });
}
