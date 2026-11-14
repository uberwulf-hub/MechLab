// The boombox on the workstation desk: speakers that pump with the music and a little screen showing the song.
import * as THREE from '../vendor/three/three.module.js';
import * as tex from './textures.js';

export class Boombox {
  constructor(parent, position, rotationY = 0) {
    const g = this.group = new THREE.Group();
    g.position.copy(position);
    g.rotation.y = rotationY;
    parent.add(g);
    const body = new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.35, roughness: 0.45, roughnessMap: tex.paintWear() });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 1, roughness: 0.22 });
    const grill = new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.5, roughness: 0.7, map: tex.pegboard() });
    const cone = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.85 });
    const red = new THREE.MeshStandardMaterial({ color: 0xb33a2a, roughness: 0.4 });
    const m = (geo, mat, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(x, y, z);
      o.castShadow = o.receiveShadow = true;
      o.userData.boombox = true;
      g.add(o);
      return o;
    };
    const W = 0.62, H = 0.3, D = 0.16;
    m(new THREE.BoxGeometry(W, H, D), body, 0, H / 2, 0);
    m(new THREE.BoxGeometry(W + 0.01, 0.02, D + 0.01), chrome, 0, H - 0.01, 0);
    m(new THREE.BoxGeometry(W + 0.01, 0.015, D + 0.01), chrome, 0, 0.008, 0);
    // carry handle
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 24, Math.PI), chrome);
    handle.position.set(0, H, 0);
    handle.userData.boombox = true;
    g.add(handle);
    for (const s of [-1, 1]) m(new THREE.BoxGeometry(0.03, 0.04, 0.04), chrome, s * 0.2, H + 0.01, 0);
    // two speakers
    this.cones = [];
    for (const s of [-1, 1]) {
      const ring = m(new THREE.TorusGeometry(0.105, 0.012, 8, 32), chrome, s * 0.19, 0.14, D / 2 + 0.004);
      ring.rotation.set(0, 0, 0);
      m(new THREE.CircleGeometry(0.1, 32), grill, s * 0.19, 0.14, D / 2 + 0.002);
      const c = m(new THREE.ConeGeometry(0.07, 0.04, 24, 1, true), cone, s * 0.19, 0.14, D / 2 + 0.01);
      c.rotation.x = -Math.PI / 2;
      m(new THREE.SphereGeometry(0.02, 12, 8), chrome, s * 0.19, 0.14, D / 2 + 0.03);
      this.cones.push(c);
    }
    // cassette deck and the screen
    m(new THREE.BoxGeometry(0.15, 0.08, 0.01), new THREE.MeshStandardMaterial({ color: 0x0b0c0d, metalness: 0.8, roughness: 0.1 }), 0, 0.1, D / 2 + 0.002);
    this.screen = tex.liveCanvas(256, 64);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.04), new THREE.MeshBasicMaterial({ map: this.screen.texture, toneMapped: false }));
    scr.position.set(0, 0.21, D / 2 + 0.003);
    scr.userData.boombox = true;
    g.add(scr);
    // buttons and knobs
    for (let i = 0; i < 5; i++) m(new THREE.BoxGeometry(0.022, 0.012, 0.02), i === 2 ? red : chrome, -0.05 + i * 0.025, H + 0.004, D / 2 - 0.04);
    for (const s of [-1, 1]) {
      const k = m(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 16), chrome, s * 0.1, 0.26, D / 2 + 0.008);
      k.rotation.x = Math.PI / 2;
    }
    // a soft light on the desk when it's playing
    this.light = new THREE.PointLight(0xffa04a, 0, 1.5, 2);
    this.light.position.set(0, 0.2, 0.25);
    g.add(this.light);
    this.scroll = 0;
    this.lastDraw = 0;
  }

  /** Meshes to click on. */
  pickables() {
    const out = [];
    this.group.traverse((o) => { if (o.isMesh) out.push(o); });
    return out;
  }

  update(t, dt, level, title, playing) {
    for (const c of this.cones) c.scale.set(1 + level * 0.18, 1 + level * 0.18, 1 + level * 0.5);
    this.light.intensity = playing ? 0.4 + level * 1.2 : 0;
    this.scroll += dt * 40;
    if (t - this.lastDraw < 0.08) return;
    this.lastDraw = t;
    const { ctx: c, canvas } = this.screen;
    c.fillStyle = '#0c1a10';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = playing ? '#7dffb0' : '#2e5a3c';
    c.font = 'bold 30px "Cascadia Mono", Consolas, monospace';
    c.textBaseline = 'middle';
    const text = playing ? `♪ ${title.toUpperCase()}   ` : 'PAUSED';
    const w = c.measureText(text).width;
    if (playing && w > canvas.width - 10) {
      const x = 8 - (this.scroll % w);
      c.fillText(text, x, 34);
      c.fillText(text, x + w, 34);
    } else c.fillText(text, 8, 34);
    // level meter
    if (playing) {
      c.fillStyle = '#ffb04a';
      for (let i = 0; i < 12; i++) if (i / 12 < level) c.fillRect(8 + i * 20, 56, 14, 5);
    }
    this.screen.update();
  }
}
