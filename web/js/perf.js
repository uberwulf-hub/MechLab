// Graphics levels and the automatic adjuster.
// Each device starts at a level that suits it (PCs: high; tablets and phones: low). While playing, the adjuster
// watches the frame rate: if frames come too slowly it lowers the resolution a step at a time, then switches
// off the costly effects. A fast PC holds 60 frames a second, so nothing ever changes there.

export const LEVELS = {
  //          sharpness cap  glow   shadows   extra lights  screen redraws/s
  high:   { maxRatio: 2.0,  bloom: true,  shadows: 'soft', lights: true,  screensHz: 10, antialias: true },
  medium: { maxRatio: 1.5,  bloom: true,  shadows: 'hard', lights: false, screensHz: 4,  antialias: false },
  low:    { maxRatio: 1.0,  bloom: false, shadows: 'off',  lights: false, screensHz: 2,  antialias: false },
};
const ORDER = ['high', 'medium', 'low'];

/** Tablets, phones and the Android app start on low; everything else on high. */
export function autoLevel() {
  const touch = matchMedia('(pointer: coarse)').matches;
  const android = /Android/i.test(navigator.userAgent) || !!window.MechGarageAndroid;
  return android || touch ? 'low' : 'high';
}

export class Perf {
  /** setting: 'auto' | 'high' | 'medium' | 'low'. */
  constructor(setting = 'auto') {
    this.setting = setting;
    this.level = setting === 'auto' ? autoLevel() : setting;
    this.ratio = Math.min(devicePixelRatio || 1, LEVELS[this.level].maxRatio);
    this.minRatio = 0.6;
    this.frames = 0;
    this.time = 0;
    this.goodFor = 0;
    this.listeners = new Set();
  }

  get opts() { return LEVELS[this.level]; }
  get lowPower() { return this.level === 'low'; }
  onChange(fn) { this.listeners.add(fn); }
  emit() { for (const fn of this.listeners) fn(this); }

  /** Called every frame with the real time since the last one. Only adjusts when the setting is Auto. */
  tick(dt) {
    if (this.setting !== 'auto' || document.hidden) return;
    this.frames++;
    this.time += Math.min(dt, 0.25);
    if (this.time < 2) return;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (fps < 42) {
      this.goodFor = 0;
      if (this.ratio > this.minRatio + 0.01) {
        this.ratio = Math.max(this.minRatio, this.ratio * 0.85);  // a bit softer, much faster
      } else {
        const i = ORDER.indexOf(this.level);
        if (i < ORDER.length - 1) {
          this.level = ORDER[i + 1];                              // switch off the next costly effect
          this.ratio = Math.min(this.ratio, LEVELS[this.level].maxRatio);
        } else return;
      }
      this.emit();
    } else if (fps > 57) {
      // plenty of headroom for a while: sharpen back up (never past this level's cap)
      this.goodFor++;
      const cap = Math.min(devicePixelRatio || 1, this.opts.maxRatio);
      if (this.goodFor >= 3 && this.ratio < cap - 0.01) {
        this.goodFor = 0;
        this.ratio = Math.min(cap, this.ratio * 1.1);
        this.emit();
      }
    } else this.goodFor = 0;
  }
}
