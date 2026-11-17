// The garage boombox. Two kinds of music take turns on one playlist:
//  - Records: real recorded jazz songs listed in web/music/tracks.json (each with its artist, licence and link; the
//    credits show on the boombox and in CREDITS.md). Played from the file, through the boombox's tone and volume.
//  - The band: a little smooth-jazz band played live with Web Audio. Every note is made here, so there's nothing to
//    license. Electric piano chords, a walking upright bass, brushed drums with a ride cymbal, and a sax, vibraphone or
//    electric piano lead that improvises over the chord changes. Five original tunes.
// With no records listed, the band plays on its own, as before.

export const TRACKS = [
  { name: 'Rivet Lounge', bpm: 92, swing: 0.62, lead: 'sax', minor: false, key: 2,
    prog: ['Dmaj7', 'Bm7', 'Em7', 'A7', 'Dmaj7', 'Bm7', 'Em7 A7', 'Dmaj7', 'Gmaj7', 'F#m7', 'Em7', 'A7', 'F#m7 B7', 'Em7 A7', 'Dmaj7', 'Em7 A7'] },
  { name: 'Blue Gantry', bpm: 84, swing: 0.64, lead: 'vibes', minor: true, key: 0,
    prog: ['Cm7', 'Fm7', 'Dm7b5 G7', 'Cm7', 'Abmaj7', 'Dm7b5 G7', 'Cm7', 'Dm7b5 G7'] },
  { name: 'Late Night Welding', bpm: 100, swing: 0.6, lead: 'sax', minor: false, key: 3,
    prog: ['Ebmaj7', 'Cm7', 'Fm7', 'Bb7', 'Gm7', 'C7', 'Fm7', 'Bb7'] },
  { name: 'Hydraulic Groove', bpm: 96, swing: 0.55, lead: 'ep', minor: true, key: 9,
    prog: ['Am7', 'D7', 'Am7', 'D7', 'Fmaj7', 'E7', 'Am7', 'E7'] },
  { name: 'Moonlight on the Lift', bpm: 70, swing: 0.6, lead: 'vibes', minor: false, key: 5,
    prog: ['Fmaj7', 'Bbmaj7', 'Am7', 'Dm7', 'Gm7', 'C7', 'Fmaj7', 'Gm7 C7'] },
];

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY = {
  maj7: { tones: [0, 4, 7, 11], voicing: [4, 7, 11, 14] },
  m7: { tones: [0, 3, 7, 10], voicing: [3, 7, 10, 14] },
  '7': { tones: [0, 4, 7, 10], voicing: [4, 10, 14, 21] },
  m7b5: { tones: [0, 3, 6, 10], voicing: [3, 6, 10, 15] },
  '6': { tones: [0, 4, 7, 9], voicing: [4, 9, 14, 19] },
};

export function parseChord(name) {
  const m = /^([A-G])([b#]?)(maj7|m7b5|m7|7|6)$/.exec(name);
  if (!m) throw new Error(`Unknown chord ${name}`);
  const root = (NOTE[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0) + 12) % 12;
  return { name, root, ...QUALITY[m[3]] };
}

/** Each bar split into two half-bars of chords. */
function halfBars(prog) {
  const out = [];
  for (const bar of prog) {
    const cs = bar.split(' ').map(parseChord);
    out.push(cs[0], cs[1] ?? cs[0]);
  }
  return out;
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
/** The pitch with pitch-class `pc` nearest to `near`. */
const nearest = (pc, near) => { let m = near - ((near - pc) % 12 + 12) % 12; if (near - m > 6) m += 12; return m; };
const rnd = Math.random;
const pickOf = (a) => a[Math.floor(rnd() * a.length)];

export class Jazz {
  constructor(getContext) {
    this.getContext = getContext;
    this.index = 0;
    this.playing = false;
    this.volume = 0.5;
    this.onChange = null;
    this.level = 0;
  }

  /** Records first (real songs), then the band's own tunes. */
  get list() { return [...(this.records ?? []), ...TRACKS]; }
  get track() { return this.list[this.index] ?? TRACKS[0]; }
  get isRecord() { return !!this.track.file; }

  /** Reads the list of recorded songs (web/music/tracks.json). Missing or empty: just the band. */
  async loadRecords(base = 'music/') {
    try {
      const r = await fetch(base + 'tracks.json', { cache: 'no-cache' });
      if (!r.ok) { console.warn('boombox: no song list', r.status); return (this.records = []); }
      const list = (await r.json()).filter((t) => t.file && t.title);
      this.records = list.map((t) => ({ ...t, name: t.title, file: base + t.file }));
    } catch (e) { console.warn('boombox: song list unreadable', e); this.records = []; }
    return this.records;
  }

  /** Index of a song by name (saved between visits, since the list can change). */
  find(name) { return this.list.findIndex((t) => t.name === name); }

  setup() {
    if (this.out) return true;
    const ctx = this.getContext();
    if (!ctx) return false;
    this.ctx = ctx;
    // band -> (dry + room reverb) -> boombox tone -> volume -> speakers
    this.bus = ctx.createGain();
    this.fade = ctx.createGain();
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf'; low.frequency.value = 140; low.gain.value = 3;
    const high = ctx.createBiquadFilter();
    high.type = 'highshelf'; high.frequency.value = 7000; high.gain.value = -4;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.bus.connect(low);
    this.tone = low;
    if (!this.lowPower) {
      // the room's echo: lovely, but heavy work for a tablet, so only on stronger devices
      const verb = ctx.createConvolver();
      verb.buffer = this.impulse(2.4);
      const wet = ctx.createGain();
      wet.gain.value = 0.22;
      this.bus.connect(verb).connect(wet).connect(low);
    }
    low.connect(high).connect(comp).connect(this.fade).connect(this.out).connect(ctx.destination);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.fade.connect(this.analyser);
    this.levelData = new Uint8Array(this.analyser.fftSize);
    this.noise = this.makeNoise(1.5);
    return true;
  }

  impulse(seconds) {
    const ctx = this.ctx, len = ctx.sampleRate * seconds;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return b;
  }

  makeNoise(seconds) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    return b;
  }

  // ---------- transport ----------
  play() {
    if (!this.setup()) return false;
    if (this.playing) return true;
    this.playing = true;
    this.fade.gain.cancelScheduledValues(this.ctx.currentTime);
    this.fade.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.fade.gain.exponentialRampToValueAtTime(1, this.ctx.currentTime + 0.8);
    // a recorded song that was only paused carries on where it stopped; anything else starts fresh
    if (this.isRecord && this.loadedFile === this.track.file && !this.audio.ended) { this.recordOn = true; this.audio.play().catch(() => {}); }
    else this.startTrack(this.index);
    // slower devices plan further ahead, so a busy moment on screen can't make the band stumble
    this.timer = setInterval(() => this.schedule(), this.lowPower ? 100 : 40);
    this.onChange?.();
    return true;
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.fade.gain.cancelScheduledValues(t);
    this.fade.gain.setValueAtTime(this.fade.gain.value, t);
    this.fade.gain.linearRampToValueAtTime(0, t + 0.4);
    const a = this.audio;
    if (a) setTimeout(() => { if (!this.playing) a.pause(); }, 450);
    this.onChange?.();
  }

  toggle() { return this.playing ? (this.pause(), false) : this.play(); }

  next(dir = 1) {
    this.index = (this.index + dir + this.list.length) % this.list.length;
    if (this.playing) {
      const t = this.ctx.currentTime;
      this.fade.gain.cancelScheduledValues(t);
      this.fade.gain.setValueAtTime(0.0001, t);
      this.fade.gain.exponentialRampToValueAtTime(1, t + 0.6);
      this.startTrack(this.index);
    }
    this.onChange?.();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.out) this.out.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    this.onChange?.();
  }

  /** How loud it is right now (0..1), for the boombox speakers to pulse. */
  meter() {
    if (!this.analyser || !this.playing) return (this.level *= 0.9);
    this.analyser.getByteTimeDomainData(this.levelData);
    let sum = 0;
    for (const v of this.levelData) sum += ((v - 128) / 128) ** 2;
    this.level = Math.min(1, Math.sqrt(sum / this.levelData.length) * 4);
    return this.level;
  }

  get elapsed() { return this.playing ? this.ctx.currentTime - this.trackStart : 0; }

  // ---------- the band ----------
  startTrack(i) {
    const tr = this.list[i];
    if (tr.file) return this.startRecord(tr);
    this.audio?.pause();
    this.recordOn = false;
    this.song = { tr, chords: halfBars(tr.prog), eighth: 60 / tr.bpm / 2 };
    this.step = 0;               // eighth-note counter from the start of the tune
    this.nextTime = this.ctx.currentTime + 0.12;
    this.trackStart = this.nextTime;
    this.phrase = [];
    this.lastPhrase = null;
    this.leadNote = 60 + tr.key + 12;
    this.bassNote = 36 + tr.key;
    // play the form three times (or at least two minutes), then move on to the next tune
    const formSecs = tr.prog.length * 8 * this.song.eighth;
    this.trackLength = Math.max(120, formSecs * 3);
  }

  /** Plays a recorded song from its file, through the boombox's tone, volume and level meter. */
  startRecord(tr) {
    this.recordOn = true;
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.ctx.createMediaElementSource(this.audio).connect(this.tone);
      this.audio.addEventListener('ended', () => { if (this.playing && this.recordOn) this.next(1); });
      this.audio.addEventListener('error', () => { if (this.playing && this.recordOn) setTimeout(() => this.next(1), 500); });
    }
    this.audio.src = tr.file;
    this.loadedFile = tr.file;
    this.trackStart = this.ctx.currentTime;
    this.audio.play().catch(() => {});
  }

  schedule() {
    if (this.recordOn) return;
    const ahead = this.ctx.currentTime + (this.lowPower ? 0.8 : 0.25);
    while (this.nextTime < ahead) {
      this.playStep(this.step, this.nextTime);
      this.step++;
      this.nextTime += this.song.eighth;
      if (this.nextTime - this.trackStart > this.trackLength && this.step % (this.song.chords.length * 4) === 0) {
        this.index = (this.index + 1) % this.list.length;
        this.startTrack(this.index);
        this.onChange?.();
        return;
      }
    }
  }

  playStep(step, t0) {
    const { tr, chords, eighth } = this.song;
    const inBar = step % 8;
    const bar = Math.floor(step / 8);
    const half = (bar * 2 + (inBar >= 4 ? 1 : 0)) % chords.length;
    const chord = chords[half];
    const nextChord = chords[(half + 1) % chords.length];
    // swing: off-beat eighths land late
    const t = t0 + (inBar % 2 === 1 ? (tr.swing - 0.5) * 2 * eighth : 0);
    const beat = inBar / 2;

    // drums: ride "ding, ding-da ding", hi-hat foot on 2 and 4, brushes, a soft kick
    if (inBar % 2 === 0) this.ride(t, inBar === 0 ? 0.55 : 0.4);
    if (inBar === 3 || inBar === 7) this.ride(t, 0.3);
    if (inBar === 2 || inBar === 6) { this.hat(t); this.brush(t, 0.5); }
    if (inBar % 2 === 0) this.brush(t, 0.18);
    if (inBar === 0 || (inBar === 5 && rnd() < 0.3)) this.kick(t, inBar === 0 ? 0.5 : 0.3);

    // walking bass on every beat
    if (inBar % 2 === 0) {
      let note;
      const root = nearest(chord.root, this.bassNote);
      if (beat === 0 || beat === 2) note = root;
      else if (beat === 3 || beat === 1 && chord !== nextChord) {
        // lead into the next chord from a half step away
        const target = nearest((beat === 1 ? chords[(half + 1) % chords.length] : nextChord).root, this.bassNote);
        note = target + (rnd() < 0.5 ? 1 : -1);
      } else note = root + pickOf([chord.tones[1], chord.tones[2], chord.tones[3]]);
      note = Math.max(31, Math.min(50, note));
      this.bassNote = note;
      this.bass(note, t, eighth * 1.9);
    }

    // electric piano comping: chords on the "and" of beats, Charleston-style
    if (!this.compBar || inBar === 0) this.compBar = pickOf([[0, 3], [3, 7], [1, 4], [0, 5], [3], [2, 5], [0, 3, 6]]);
    if (this.compBar.includes(inBar)) {
      const notes = chord.voicing.map((iv) => nearest((chord.root + iv) % 12, 62 + (iv > 12 ? 5 : 0)));
      for (const n of notes) this.ep(n, t, eighth * (rnd() < 0.5 ? 1.5 : 3), 0.12, false);
    }

    // the lead improvises two-bar phrases
    if (step % 16 === 0) this.phrase = this.makePhrase(step);
    for (const n of this.phrase) if (n.at === step % 16) this.lead(tr.lead, n.note, t, n.len * eighth * 0.95, n.vel);
  }

  /** A two-bar melody: chord tones on strong beats, scale steps between, often answering the last phrase. */
  makePhrase(step) {
    const { tr, chords } = this.song;
    if (rnd() < 0.3) return [];   // leave space: a rest
    const scale = tr.minor ? [0, 2, 3, 5, 7, 9, 10] : [0, 2, 4, 5, 7, 9, 11];
    const lo = 60 + tr.key - (tr.key > 6 ? 12 : 0) + 2, hi = lo + 18;
    const out = [];
    let at = rnd() < 0.5 ? 0 : 1;
    let note = this.leadNote;
    const reuse = this.lastPhrase && rnd() < 0.4;
    const rhythm = reuse ? this.lastPhrase.map((n) => [n.at, n.len]) : null;
    let i = 0;
    while (at < 15) {
      const len = rhythm ? rhythm[i]?.[1] : pickOf([1, 1, 1, 2, 2, 3]);
      if (rhythm && !rhythm[i]) break;
      if (rhythm) at = rhythm[i][0];
      const bar = Math.floor((step + at) / 8);
      const half = (bar * 2 + (((step + at) % 8) >= 4 ? 1 : 0)) % chords.length;
      const chord = chords[half];
      const strong = at % 4 === 0;
      if (strong || rnd() < 0.3) {
        // land on a chord tone near where we are
        const options = chord.tones.concat(chord.voicing.slice(-1)).map((iv) => nearest((chord.root + iv) % 12, note));
        note = pickOf(options);
      } else {
        // step up or down the scale
        const dir = note > hi - 3 ? -1 : note < lo + 3 ? 1 : (rnd() < 0.5 ? -1 : 1);
        do note += dir; while (!scale.includes(((note - tr.key) % 12 + 12) % 12));
      }
      note = Math.max(lo, Math.min(hi, note));
      out.push({ at, note, len: at + len >= 15 ? Math.max(len, 3) : len, vel: strong ? 0.9 : 0.7 });
      at += len + (rnd() < 0.15 ? 1 : 0);
      i++;
    }
    this.leadNote = note;
    this.lastPhrase = out.length ? out : this.lastPhrase;
    return out;
  }

  // ---------- instruments ----------
  env(g, t, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  pan(node, p) {
    if (!this.ctx.createStereoPanner) return node;
    const s = this.ctx.createStereoPanner();
    s.pan.value = p;
    node.connect(s);
    return s;
  }

  /** Electric piano: a soft FM bell tone. */
  ep(m, t, dur, vel, lead) {
    const c = this.ctx, f = mtof(m);
    const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.frequency.value = f;
    mod.frequency.value = f;
    mg.gain.setValueAtTime(f * (lead ? 1.6 : 1.1), t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.9);
    mod.connect(mg).connect(car.frequency);
    car.connect(g);
    this.env(g, t, 0.006, vel, dur + 0.9);
    this.pan(g, lead ? 0.1 : -0.25 + rnd() * 0.2).connect(this.bus);
    car.start(t); mod.start(t);
    car.stop(t + dur + 1.1); mod.stop(t + dur + 1.1);
  }

  bass(m, t, dur) {
    const c = this.ctx, f = mtof(m);
    const o = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    o2.type = 'sine'; o2.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(320, t + 0.25);
    o.connect(lp); o2.connect(lp);
    lp.connect(g);
    this.env(g, t, 0.012, 0.42, dur * 1.3);
    g.connect(this.bus);
    o.start(t); o2.start(t);
    o.stop(t + dur * 1.5); o2.stop(t + dur * 1.5);
  }

  noiseHit(t, type, freq, q, attack, peak, decay, pan = 0) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.playbackRate.value = 0.8 + rnd() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, attack, peak, decay);
    n.connect(f).connect(g);
    this.pan(g, pan).connect(this.bus);
    n.start(t, rnd() * 0.5);
    n.stop(t + attack + decay + 0.05);
  }

  ride(t, vel) {
    this.noiseHit(t, 'bandpass', 8200, 0.9, 0.002, vel * 0.16, 0.45, 0.35);
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), hp = c.createBiquadFilter();
    o.type = 'square'; o.frequency.value = 5210;
    hp.type = 'highpass'; hp.frequency.value = 4000;
    this.env(g, t, 0.001, vel * 0.012, 0.3);
    o.connect(hp).connect(g);
    this.pan(g, 0.35).connect(this.bus);
    o.start(t); o.stop(t + 0.35);
  }

  hat(t) { this.noiseHit(t, 'highpass', 7000, 0.7, 0.002, 0.07, 0.05, -0.2); }
  brush(t, vel) { this.noiseHit(t, 'bandpass', 2600, 0.6, 0.04, vel * 0.09, 0.18, -0.1); }

  kick(t, vel) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    this.env(g, t, 0.004, vel * 0.5, 0.25);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + 0.3);
  }

  lead(kind, m, t, dur, vel) {
    if (kind === 'vibes') return this.vibes(m, t, dur, vel);
    if (kind === 'ep') return this.ep(m + 12, t, dur, 0.13 * vel, true);
    return this.sax(m, t, dur, vel);
  }

  /** A breathy, warm sax: two detuned buzzy waves through an opening filter, with vibrato and a little scoop. */
  sax(m, t, dur, vel) {
    const c = this.ctx, f = mtof(m);
    const a = c.createOscillator(), b = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    a.type = 'sawtooth'; b.type = 'square';
    for (const o of [a, b]) {
      o.frequency.setValueAtTime(f * 0.97, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    }
    b.detune.value = 6;
    const vib = c.createOscillator(), vg = c.createGain();
    vib.frequency.value = 5.2;
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.35, dur));
    vib.connect(vg); vg.connect(a.frequency); vg.connect(b.frequency);
    lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(2200 * vel, t + 0.08);
    lp.frequency.linearRampToValueAtTime(1500, t + dur);
    const mix = c.createGain();
    mix.gain.value = 0.5;
    a.connect(mix); b.connect(mix);
    mix.connect(lp).connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.085 * vel, t + 0.05);
    g.gain.setValueAtTime(0.075 * vel, t + Math.max(0.06, dur - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    this.pan(g, 0.12).connect(this.bus);
    // breath
    if (!this.lowPower) this.noiseHit(t, 'bandpass', 1800, 1.5, 0.03, 0.012 * vel, dur, 0.12);
    for (const o of [a, b, vib]) { o.start(t); o.stop(t + dur + 0.2); }
  }

  /** Vibraphone: bright metal bars with a slow tremolo. */
  vibes(m, t, dur, vel) {
    const c = this.ctx, f = mtof(m + 12);
    const g = c.createGain(), trem = c.createOscillator(), tg = c.createGain(), amp = c.createGain();
    trem.frequency.value = 5.5;
    tg.gain.value = 0.3;
    amp.gain.value = 0.7;
    trem.connect(tg).connect(amp.gain);
    for (const [ratio, level] of this.lowPower ? [[1, 1], [4, 0.18]] : [[1, 1], [4, 0.18], [10, 0.05]]) {
      const o = c.createOscillator(), og = c.createGain();
      o.frequency.value = f * ratio;
      this.env(og, t, 0.003, level, ratio === 1 ? dur + 1.6 : 0.4);
      o.connect(og).connect(amp);
      o.start(t); o.stop(t + dur + 1.8);
    }
    amp.connect(g);
    g.gain.value = 0.11 * vel;
    this.pan(g, 0.15).connect(this.bus);
    trem.start(t); trem.stop(t + dur + 1.8);
  }
}
