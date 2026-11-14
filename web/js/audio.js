// Sound effects, all made in code with Web Audio (no sound files).
let ctx = null, master = null, hum = null;
/** The shared audio context (null until the first tap or click). */
export const audioContext = () => ctx;
let volume = 0.7;
let lowPower = false;
/** On tablets and phones the sound card gets a bigger buffer, which stops crackles when the device is busy. */
export function setLowPower(on) { lowPower = on; }

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { ctx = new AC({ latencyHint: lowPower ? 'playback' : 'interactive' }); } catch { ctx = new AC(); }
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  startHum();
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

function noiseBuffer(seconds) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function env(node, t, a, peak, d) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.exponentialRampToValueAtTime(peak, t + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

/** The garage's background hum: a low electrical drone and air handling. */
function startHum() {
  const t = ctx.currentTime;
  hum = ctx.createGain();
  hum.gain.value = 0.05;
  hum.connect(master);
  for (const f of [60, 120]) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = f === 60 ? 0.25 : 0.08;
    o.connect(g).connect(hum);
    o.start(t);
  }
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(2);
  n.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  const g = ctx.createGain();
  g.gain.value = 0.35;
  n.connect(lp).connect(g).connect(hum);
  n.start(t);
}

export function blip(high = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(high ? 1320 : 880, t);
  o.frequency.exponentialRampToValueAtTime(high ? 1760 : 1100, t + 0.06);
  const g = ctx.createGain();
  env(g, t, 0.005, 0.15, 0.09);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 0.12);
}

/** Robot servo whirr for `seconds`. */
export function servo(seconds = 0.8, pitch = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(140 * pitch, t);
  o.frequency.linearRampToValueAtTime(220 * pitch, t + seconds * 0.4);
  o.frequency.linearRampToValueAtTime(170 * pitch, t + seconds);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.08);
  g.gain.setValueAtTime(0.09, t + seconds - 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  o.connect(bp).connect(g).connect(master);
  o.start(t); o.stop(t + seconds + 0.05);
}

/** Heavy metal clunk: a part locking on. */
export function clunk() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
  const g = ctx.createGain();
  env(g, t, 0.003, 0.7, 0.35);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 0.4);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(0.3);
  const hp = ctx.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 2500;
  const g2 = ctx.createGain();
  env(g2, t, 0.002, 0.35, 0.12);
  n.connect(hp).connect(g2).connect(master);
  n.start(t);
  // metallic ring
  for (const f of [523, 1187, 1741]) {
    const r = ctx.createOscillator();
    r.frequency.value = f;
    const rg = ctx.createGain();
    env(rg, t + 0.01, 0.003, 0.03, 0.8);
    r.connect(rg).connect(master);
    r.start(t); r.stop(t + 0.9);
  }
}

/** Welding crackle for `seconds`. */
export function weld(seconds = 1.2) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(seconds + 0.1);
  const bp = ctx.createBiquadFilter();
  bp.type = 'highpass';
  bp.frequency.value = 1800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  // crackle: random gain spikes
  for (let x = 0; x < seconds; x += 0.03) g.gain.setValueAtTime(Math.random() < 0.6 ? 0.05 + Math.random() * 0.12 : 0.01, t + x);
  g.gain.setValueAtTime(0.0001, t + seconds);
  n.connect(bp).connect(g).connect(master);
  n.start(t);
}

export function whoosh() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(1);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.5;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(2400, t + 0.6);
  const g = ctx.createGain();
  env(g, t, 0.2, 0.18, 0.5);
  n.connect(bp).connect(g).connect(master);
  n.start(t);
}

export function stomp() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(90, t);
  o.frequency.exponentialRampToValueAtTime(30, t + 0.3);
  const g = ctx.createGain();
  env(g, t, 0.005, 0.6, 0.35);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 0.4);
}

export function powerUp() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(60, t);
  o.frequency.exponentialRampToValueAtTime(480, t + 1.4);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.exponentialRampToValueAtTime(3000, t + 1.4);
  const g = ctx.createGain();
  env(g, t, 0.3, 0.15, 1.2);
  o.connect(lp).connect(g).connect(master);
  o.start(t); o.stop(t + 1.6);
}

// ---------- test planet ----------
/** Blaster shot. */
export function zap(pitch = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(1400 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(180 * pitch, t + 0.16);
  const g = ctx.createGain();
  env(g, t, 0.003, 0.12, 0.15);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3500;
  o.connect(lp).connect(g).connect(master);
  o.start(t); o.stop(t + 0.2);
}

/** A creature zapped away: a bubbly pop. */
export function pop() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    const s = t + i * 0.05;
    o.frequency.setValueAtTime(300 + i * 220, s);
    o.frequency.exponentialRampToValueAtTime(900 + i * 300, s + 0.08);
    const g = ctx.createGain();
    env(g, s, 0.004, 0.18, 0.1);
    o.connect(g).connect(master);
    o.start(s); o.stop(s + 0.15);
  }
}

/** A big creature's roar. */
export function roar() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(1.2);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(180, t);
  bp.frequency.linearRampToValueAtTime(420, t + 0.4);
  bp.frequency.linearRampToValueAtTime(140, t + 1.1);
  const g = ctx.createGain();
  env(g, t, 0.1, 0.5, 1.0);
  n.connect(bp).connect(g).connect(master);
  n.start(t);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(70, t);
  o.frequency.linearRampToValueAtTime(55, t + 1.1);
  const g2 = ctx.createGain();
  env(g2, t, 0.1, 0.12, 1.0);
  o.connect(g2).connect(master);
  o.start(t); o.stop(t + 1.2);
}

/** Picking up a crystal. */
export function chime() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [880, 1320, 1760].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const g = ctx.createGain();
    env(g, t + i * 0.07, 0.005, 0.12, 0.5);
    o.connect(g).connect(master);
    o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.6);
  });
}

/** Jump jets: a short burst of rushing air (call repeatedly while thrusting). */
export function jet() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(0.25);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const g = ctx.createGain();
  env(g, t, 0.03, 0.16, 0.2);
  n.connect(lp).connect(g).connect(master);
  n.start(t);
}

/** The mech takes a hit. */
export function hurt() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.25);
  const g = ctx.createGain();
  env(g, t, 0.005, 0.25, 0.25);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 0.3);
}

// ---------- heavier, more mechanical sounds (round 3) ----------
let shaper = null;
/** A little distortion, for grit. */
function grit() {
  if (shaper) return shaper;
  shaper = ctx.createWaveShaper();
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; curve[i] = Math.tanh(x * 2.5); }
  shaper.curve = curve;
  shaper.connect(master);
  return shaper;
}

function noise(t, type, freq, q, attack, peak, decay, dest = master) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(attack + decay + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, peak, decay);
  n.connect(f).connect(g).connect(dest);
  n.start(t);
  return f;
}

function tone(t, type, f0, f1, attack, peak, decay, dest = master) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
  const g = ctx.createGain();
  env(g, t, attack, peak, decay);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + attack + decay + 0.05);
}

/** A giant metal foot landing: deep thud, a steel clang, and a hiss from the hydraulics. */
export function clank(size = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, 'sine', 85 / size, 32, 0.004, 0.8 * Math.min(size, 1.3), 0.35 * size);
  noise(t, 'lowpass', 500, 0.7, 0.002, 0.45 * size, 0.18);
  // clang: inharmonic metal partials, slightly random each step
  const base = 180 + Math.random() * 40;
  for (const [ratio, level, dec] of [[1, 0.09, 0.5], [1.48, 0.07, 0.4], [2.31, 0.05, 0.35], [3.9, 0.035, 0.25], [5.4, 0.02, 0.2]]) {
    tone(t + 0.005, 'triangle', base * ratio / size, base * ratio * 0.99 / size, 0.002, level * size, dec);
  }
  noise(t + 0.04, 'highpass', 4500, 0.5, 0.02, 0.06, 0.22); // hydraulic hiss
}

/** Rivet cannon: a heavy punchy shot. */
export function cannon() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, 'sine', 180, 45, 0.002, 0.7, 0.22);
  noise(t, 'lowpass', 1800, 0.8, 0.001, 0.6, 0.12, grit());
  noise(t, 'bandpass', 3200, 2, 0.001, 0.15, 0.05);
  tone(t + 0.01, 'triangle', 1400, 1350, 0.001, 0.04, 0.12); // metal ping
}

/** Plasma blaster: a sharp energy bolt with a crackle. */
export function laser() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(1300, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.18);
  m.frequency.value = 90;
  mg.gain.value = 300;
  m.connect(mg).connect(o.frequency);
  f.type = 'bandpass'; f.Q.value = 3;
  f.frequency.setValueAtTime(2600, t);
  f.frequency.exponentialRampToValueAtTime(500, t + 0.18);
  env(g, t, 0.002, 0.3, 0.17);
  o.connect(f).connect(g).connect(grit());
  o.start(t); m.start(t); o.stop(t + 0.22); m.stop(t + 0.22);
  noise(t, 'highpass', 6000, 0.5, 0.001, 0.08, 0.06);
}

/** Shoulder turret: a quick rattle. */
export function turret() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 2; i++) {
    noise(t + i * 0.06, 'bandpass', 2200, 1.2, 0.001, 0.25, 0.05, grit());
    tone(t + i * 0.06, 'square', 240, 120, 0.001, 0.05, 0.05);
  }
}

/** Rocket launch: a hiss that rushes away. */
export function rocket() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const f = noise(t, 'bandpass', 800, 1, 0.03, 0.3, 0.7);
  f.frequency.exponentialRampToValueAtTime(2800, t + 0.7);
  tone(t, 'sine', 120, 60, 0.005, 0.3, 0.2);
}

/** Explosion. */
export function boom() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(t, 'sine', 90, 28, 0.003, 0.9, 0.7);
  const f = noise(t, 'lowpass', 1600, 0.6, 0.004, 0.7, 0.9, grit());
  f.frequency.exponentialRampToValueAtTime(200, t + 0.9);
}

/** A punch or claw connecting. */
export function punch(hitSomething) {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 'bandpass', 600, 0.5, 0.01, 0.15, 0.08); // swing
  if (hitSomething) {
    tone(t + 0.04, 'sine', 140, 50, 0.002, 0.7, 0.2);
    noise(t + 0.04, 'lowpass', 2500, 0.7, 0.001, 0.4, 0.1, grit());
  }
  clunk();
}

/** Saw or drill biting: a gritty grind. */
export function grind() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(220 + Math.random() * 30, t);
  f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.5;
  env(g, t, 0.01, 0.12, 0.17);
  o.connect(f).connect(g).connect(grit());
  o.start(t); o.stop(t + 0.2);
  noise(t, 'highpass', 5000, 0.6, 0.005, 0.08, 0.15);
}

/** A shot that hits but doesn't finish a creature off. */
export function hit() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 'bandpass', 1400, 1.5, 0.001, 0.25, 0.07);
  tone(t, 'square', 300, 150, 0.001, 0.05, 0.06);
}

/** A creature zapped away: an electric crackle and a wet squelch. */
export function splat(size = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 5; i++) noise(t + i * 0.025 + Math.random() * 0.01, 'highpass', 3000 + Math.random() * 3000, 0.6, 0.001, 0.12, 0.03);
  const f = noise(t + 0.03, 'lowpass', 900 / size, 2, 0.005, 0.35 * size, 0.25);
  f.frequency.exponentialRampToValueAtTime(150, t + 0.3);
  tone(t + 0.03, 'sine', 260 / size, 70, 0.005, 0.25, 0.22);
}
