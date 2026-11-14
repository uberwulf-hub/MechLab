// Every texture in the game is drawn here in code, so the game ships no outside art.
import * as THREE from '../vendor/three/three.module.js';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Small seeded random, so textures look the same every launch.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function toTexture(c, { repeat = 1, color = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Value noise blotches, used for stains and wear.
function blotches(ctx, w, h, rand, count, rMin, rMax, rgba) {
  for (let i = 0; i < count; i++) {
    const x = rand() * w, y = rand() * h, r = rMin + rand() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(rand()));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function grain(ctx, w, h, rand, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

const cache = new Map();
function once(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

/** Polished shop concrete: colour + roughness, with expansion joints. */
export function concrete() {
  return once('concrete', () => {
    const size = 1024, rand = rng(7);
    const [c, x] = canvas(size);
    x.fillStyle = '#6d6c69';
    x.fillRect(0, 0, size, size);
    blotches(x, size, size, rand, 220, 20, 140, (a) => `rgba(${a > 0.5 ? '40,38,36' : '150,148,142'},${0.05 + a * 0.08})`);
    blotches(x, size, size, rand, 30, 40, 120, () => 'rgba(30,26,20,0.10)'); // oil stains
    grain(x, size, size, rand, 22);
    // saw-cut joints
    x.strokeStyle = 'rgba(25,25,25,0.75)';
    x.lineWidth = 3;
    x.beginPath(); x.moveTo(0, 1); x.lineTo(size, 1); x.moveTo(1, 0); x.lineTo(1, size); x.stroke();

    const [r, rx] = canvas(512);
    rx.fillStyle = '#7a7a7a';
    rx.fillRect(0, 0, 512, 512);
    blotches(rx, 512, 512, rand, 140, 10, 90, (a) => `rgba(${a > 0.5 ? '20,20,20' : '230,230,230'},${0.08 + a * 0.1})`);
    grain(rx, 512, 512, rand, 30);
    return { map: toTexture(c, { repeat: 6 }), roughnessMap: toTexture(r, { repeat: 6, color: false }) };
  });
}

/** Brushed steel roughness streaks. */
export function brushed() {
  return once('brushed', () => {
    const rand = rng(3);
    const [c, x] = canvas(256);
    x.fillStyle = '#8a8a8a';
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const y = rand() * 256, v = 100 + rand() * 90;
      x.fillStyle = `rgba(${v},${v},${v},0.25)`;
      x.fillRect(0, y, 256, 0.6 + rand());
    }
    blotches(x, 256, 256, rand, 30, 6, 30, () => 'rgba(30,30,30,0.15)'); // fingerprints and scuffs
    return toTexture(c, { repeat: 2, color: false });
  });
}

/** Normal map of a shipping container's corrugated wall (vertical ribs). */
export function corrugated() {
  return once('corrugated', () => {
    const w = 256, h = 8;
    const [c, x] = canvas(w, h);
    const img = x.createImageData(w, h);
    for (let i = 0; i < w; i++) {
      // trapezoid ribs: slope out, flat, slope in, flat
      const p = (i % 32) / 32;
      let nx = 0;
      if (p < 0.15) nx = -0.7; else if (p >= 0.5 && p < 0.65) nx = 0.7;
      const r = Math.round((nx * 0.5 + 0.5) * 255);
      const b = Math.round(Math.sqrt(1 - nx * nx) * 0.5 * 255 + 127);
      for (let j = 0; j < h; j++) {
        const k = (j * w + i) * 4;
        img.data[k] = r; img.data[k + 1] = 128; img.data[k + 2] = b; img.data[k + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    const t = toTexture(c, { color: false });
    t.repeat.set(1, 1);
    return t;
  });
}

/** Grime and edge wear laid over painted steel (roughness). */
export function paintWear() {
  return once('paintWear', () => {
    const rand = rng(11);
    const [c, x] = canvas(256);
    x.fillStyle = '#8c8c8c';
    x.fillRect(0, 0, 256, 256);
    blotches(x, 256, 256, rand, 80, 4, 40, (a) => `rgba(${a > 0.6 ? '220,220,220' : '40,40,40'},${0.1 + a * 0.15})`);
    grain(x, 256, 256, rand, 26);
    return toTexture(c, { color: false });
  });
}

/** Yellow and black safety stripes. */
export function hazard() {
  return once('hazard', () => {
    const [c, x] = canvas(256, 64);
    x.fillStyle = '#e0a526';
    x.fillRect(0, 0, 256, 64);
    x.fillStyle = '#151515';
    for (let i = -64; i < 320; i += 48) {
      x.beginPath();
      x.moveTo(i, 64); x.lineTo(i + 24, 64); x.lineTo(i + 88, 0); x.lineTo(i + 64, 0);
      x.fill();
    }
    grain(x, 256, 64, rng(5), 18);
    const t = toTexture(c);
    t.repeat.set(8, 1);
    return t;
  });
}

/** Stencilled text, e.g. a container's serial number. Transparent background. */
export function stencil(text, { w = 256, h = 64, color = 'rgba(240,240,240,0.85)', font = 'bold 40px "Arial Narrow", Arial, sans-serif' } = {}) {
  return once(`stencil:${text}:${color}`, () => {
    const [c, x] = canvas(w, h);
    x.fillStyle = color;
    x.font = font;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, w / 2, h / 2 + 2);
    // stencil bridges
    x.globalCompositeOperation = 'destination-out';
    x.fillRect(0, h / 2 - 1, w, 2);
    const t = toTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Pegboard for the tool wall. */
export function pegboard() {
  return once('pegboard', () => {
    const [c, x] = canvas(256);
    x.fillStyle = '#4b4f52';
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#1b1c1d';
    for (let i = 8; i < 256; i += 16) for (let j = 8; j < 256; j += 16) {
      x.beginPath(); x.arc(i, j, 2.4, 0, Math.PI * 2); x.fill();
    }
    grain(x, 256, 256, rng(9), 12);
    return toTexture(c, { repeat: 3 });
  });
}

/** Wall panels: insulated metal sheeting with seams. */
export function wallPanels() {
  return once('wall', () => {
    const rand = rng(21);
    const [c, x] = canvas(512);
    x.fillStyle = '#3a3f44';
    x.fillRect(0, 0, 512, 512);
    blotches(x, 512, 512, rand, 60, 30, 160, (a) => `rgba(${a > 0.5 ? '20,22,25' : '90,95,100'},0.10)`);
    x.fillStyle = 'rgba(10,10,12,0.8)';
    for (let i = 0; i < 512; i += 128) x.fillRect(i, 0, 3, 512);
    x.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 3; i < 512; i += 128) x.fillRect(i, 0, 2, 512);
    grain(x, 512, 512, rand, 10);
    return toTexture(c, { repeat: 1 });
  });
}

/** The blue grid drawn on hologram surfaces. */
export function holoGrid() {
  return once('holoGrid', () => {
    const [c, x] = canvas(256);
    x.fillStyle = 'rgba(0,0,0,0)';
    x.clearRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(90,200,255,0.55)';
    x.lineWidth = 1;
    for (let i = 0; i <= 256; i += 32) {
      x.beginPath(); x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, 256); x.stroke();
      x.beginPath(); x.moveTo(0, i + 0.5); x.lineTo(256, i + 0.5); x.stroke();
    }
    x.strokeStyle = 'rgba(140,225,255,0.9)';
    x.lineWidth = 2;
    x.strokeRect(1, 1, 254, 254);
    return toTexture(c, { repeat: 4 });
  });
}

/** A canvas you can redraw (holo screens). Call .update() after drawing. */
export function liveCanvas(w, h) {
  const [c, x] = canvas(w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { canvas: c, ctx: x, texture: t, update: () => { t.needsUpdate = true; } };
}
