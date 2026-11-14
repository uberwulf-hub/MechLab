// Simulation mode: drop the finished mech onto an alien planet and pilot it.
// Walk, run, jump (and fly with jump jets), fire whatever the arms carry, collect crystals and zap creatures.
// What the mech can do comes from its parts: legs set speed and jump, the back pack energy and jets, arms the weapons.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Planet, height, BASE } from './planet.js';
import { Creatures } from './creatures.js';
import { Mech } from '../mech.js';
import { partById } from '../parts.js';
import { Sparks } from '../fx.js';
import * as sfx from '../audio.js';

const GRAVITY = 24;
const PLATFORM_TOP = 0.16;

/** What the mech can do on the planet, from its parts. */
export function abilities(layout, custom = {}) {
  const p = (slot) => partById(layout[slot]);
  const legs = [p('legL'), p('legR')].filter(Boolean);
  const legSim = (k, d) => legs.reduce((a, l) => a + (l.sim?.[k] ?? d), 0) / Math.max(1, legs.length);
  const all = Object.values(layout).map(partById).filter(Boolean);
  const stat = (k) => all.reduce((a, x) => a + x.stats[k], 0);
  const weight = stat('weight');
  // bigger customised parts carry more armour (size² × length)
  const sizeOf = (slot) => (custom[slot]?.scale ?? 1) ** 2 * (custom[slot]?.length ?? 1);
  const armor = Object.entries(layout).reduce((a, [slot, id]) => a + (partById(id)?.stats.armor ?? 0) * sizeOf(slot), 0);
  const back = p('back')?.sim ?? {};
  const arms = { L: p('armL')?.sim ?? null, R: p('armR')?.sim ?? null };
  const shoulders = [p('shoulderL'), p('shoulderR')].filter(Boolean).map((x) => x.sim ?? {});
  const head = p('head')?.sim ?? {};
  const has = (k) => shoulders.some((s) => s[k]) || head[k] || back[k];
  const speedStat = stat('speed');
  const walk = (5.5 + speedStat * 0.35) * legSim('run', 1) * THREE.MathUtils.clamp(1.25 - weight / 90, 0.8, 1.15);
  return {
    maxHp: Math.round(70 + armor * 1.1),
    energyMax: Math.round(100 * (back.energy ?? 1)),
    walk,
    run: walk * 1.9,
    jump: 10.5 * legSim('jump', 1),
    roll: legs.some((l) => l.sim?.roll),
    jets: !!back.jets,
    rockets: (back.rockets ?? 0) + shoulders.reduce((a, s) => a + (s.rockets ?? 0), 0),
    light: !!has('light'),
    turret: shoulders.some((s) => s.turret),
    thorns: shoulders.some((s) => s.thorns),
    forcefield: !!back.forcefield,
    radar: 90 * Math.max(1, head.radar ?? 1, back.radar ?? 1, ...shoulders.map((s) => s.radar ?? 1)),
    shield: (arms.L?.shield ?? 0) * 0.5 + (arms.R?.shield ?? 0) * 0.5,
    arms,
  };
}

const MISSIONS = [
  { id: 'walk', text: 'Walk to the blue marker', radio: 'Systems online. Walk to the blue marker so I can check your legs.' },
  { id: 'jump', text: 'Jump three times', radio: 'Legs look good! Now try jumping. Three jumps.' },
  { id: 'crystals', text: 'Collect 5 energy crystals', radio: 'Nice! My scanners show glowing crystals out there. Bring back five.', goal: 5 },
  { id: 'zap', text: 'Zap 10 creatures', radio: 'Creatures on the radar! Zap ten of them back to their nests.', goal: 10 },
  { id: 'home', text: 'Return to the landing pad', radio: 'Great job, pilot! Head back to the landing pad.' },
  { id: 'free', text: 'Free roam: explore the planet', radio: 'Mission complete! The planet is yours. Explore as long as you like.' },
];

export class Sim {
  constructor({ renderer, state, layout, custom = {}, paint, talk, onExit, quality }) {
    this.renderer = renderer;
    this.state = state;
    this.talk = talk;
    this.onExit = onExit;
    this.quality = quality;
    this.ab = abilities(layout, custom);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.2, 1200);
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.45, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // soft reflections and a fill light from the camera, so the mech's paint shows at night
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.35;
    this.fill = new THREE.DirectionalLight(0xd8c8ff, 0.9);
    this.scene.add(this.fill, this.fill.target);
    this.planet = new Planet(this.scene, quality);
    this.creatures = new Creatures(this.scene, this.planet, quality);
    this.sparks = new Sparks(this.scene);
    this.mech = new Mech(this.scene, paint);
    this.mech.custom = structuredClone(custom);
    this.mech.loadLayout(layout);
    this.mech.walking = false;
    this.makeMarker();
    this.makeLamp();
    this.makeShieldBubble();
    this.shots = [];
    this.rocketsLeft = this.ab.rockets;
    this.player = {
      pos: BASE.clone().add(new THREE.Vector3(0, 0, 6)), vel: new THREE.Vector3(), yaw: Math.PI, hp: this.ab.maxHp, energy: this.ab.energyMax,
      grounded: true, down: false, thorns: this.ab.thorns,
    };
    this.cam = { yaw: Math.PI, pitch: 0.28, dist: 14 };
    this.input = { move: new THREE.Vector2(), run: false, jump: false, fire: false, rocket: false, look: new THREE.Vector2() };
    this.voiceMove = null;
    this.score = { crystals: 0, zapped: 0, jumps: 0 };
    this.mission = 0;
    this.fireCool = { L: 0, R: 0 };
    this.nextArm = 'R';
    this.turretCool = 0;
    this.shieldCool = 0;
    this.rocketRegen = 0;
    this.stepPhase = 0;
    this.shake = 0;
    this.lightOn = this.ab.light;
    this.t = 0;
    this.hud = new Hud(this);
    this.bindInput();
    this.setMission(0);
    this.active = true;
  }

  // ---------- bits of the world that belong to the sim ----------
  makeMarker() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x39c6ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 20;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 6, 40), new THREE.MeshBasicMaterial({ color: 0x7fe0ff }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    g.add(beam, ring);
    this.scene.add(g);
    this.marker = g;
  }

  makeLamp() {
    const lamp = new THREE.SpotLight(0xfff2d6, 0, 70, 0.55, 0.5, 1.2);
    this.scene.add(lamp, lamp.target);
    this.lamp = lamp;
  }

  makeShieldBubble() {
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(4.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0x5ccfff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.bubble);
  }

  // ---------- missions ----------
  setMission(i) {
    this.mission = i;
    const m = MISSIONS[i];
    this.markerTarget = null;
    if (m.id === 'walk') this.markerTarget = new THREE.Vector3(0, 0, 42);
    if (m.id === 'home') this.markerTarget = BASE.clone();
    if (this.markerTarget) this.markerTarget.y = height(this.markerTarget.x, this.markerTarget.z);
    this.marker.visible = !!this.markerTarget;
    if (this.markerTarget) this.marker.position.copy(this.markerTarget);
    this.hud.mission(m, this.progress());
    this.radio(m.radio);
  }

  progress() {
    const m = MISSIONS[this.mission];
    if (m.id === 'jump') return `${Math.min(3, this.score.jumps)} / 3`;
    if (m.id === 'crystals') return `${this.score.crystals} / 5`;
    if (m.id === 'zap') return `${this.score.zapped} / 10`;
    return '';
  }

  checkMission() {
    const m = MISSIONS[this.mission];
    const p = this.player.pos;
    let done = false;
    if (m.id === 'walk' || m.id === 'home') done = this.markerTarget && Math.hypot(p.x - this.markerTarget.x, p.z - this.markerTarget.z) < 5;
    if (m.id === 'jump') done = this.score.jumps >= 3;
    if (m.id === 'crystals') done = this.score.crystals >= 5;
    if (m.id === 'zap') done = this.score.zapped >= 10;
    if (done && this.mission < MISSIONS.length - 1) {
      sfx.chime();
      this.setMission(this.mission + 1);
    } else this.hud.mission(m, this.progress());
  }

  radio(text) {
    this.hud.radio(this.state.robotName || 'Robot', text);
    this.talk?.(text);
  }

  // ---------- input ----------
  bindInput() {
    const keys = this.keys = new Set();
    const canvas = this.renderer.domElement;
    this.onKey = (e) => {
      if (!this.active || e.target.closest?.('input, textarea')) return;
      const down = e.type === 'keydown';
      const k = e.key.toLowerCase();
      if (down) keys.add(k); else keys.delete(k);
      if (down && k === 'l') this.toggleLight();
      if (down && (k === 'r')) this.input.rocket = true;
      if (down && k === 'escape' && !document.pointerLockElement) this.exit();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    };
    addEventListener('keydown', this.onKey);
    addEventListener('keyup', this.onKey);
    // mouse: click to steer with the mouse (pointer lock), hold the left button to fire
    // Mouse: the first click captures the mouse (move to look, left button fires, Esc lets go).
    // If the mouse can't be captured, drag with any button to look instead (left button still fires).
    const speed = () => 0.0055 * (this.state.mouseSpeed ?? 1);
    this.onMouseDown = (e) => {
      if (!this.active || e.pointerType === 'touch') return;
      if (document.pointerLockElement !== canvas && !this.triedLock) {
        this.triedLock = true;
        try { const r = canvas.requestPointerLock?.({ unadjustedMovement: true }); r?.catch?.(() => canvas.requestPointerLock?.()); } catch { /* drag to look instead */ }
        return;
      }
      if (e.button === 0) this.mouseFire = true;
      this.dragLook = true;
    };
    this.onMouseUp = (e) => { if (e.button === 0) this.mouseFire = false; this.dragLook = false; };
    this.onMouseMove = (e) => {
      if (!this.active) return;
      const locked = document.pointerLockElement === canvas;
      if (!locked && !(this.dragLook && e.buttons)) return;
      const k = speed() * (locked ? 1 : 1.3);
      this.cam.yaw -= e.movementX * k;
      this.cam.pitch = THREE.MathUtils.clamp(this.cam.pitch + e.movementY * k * 0.75, -0.3, 1.15);
    };
    this.onLockChange = () => { if (document.pointerLockElement !== canvas) this.triedLock = false; };
    document.addEventListener('pointerlockchange', this.onLockChange);
    canvas.addEventListener('pointerdown', this.onMouseDown);
    addEventListener('pointerup', this.onMouseUp);
    addEventListener('mousemove', this.onMouseMove);
    this.onWheel = (e) => { if (this.active) this.cam.dist = THREE.MathUtils.clamp(this.cam.dist + Math.sign(e.deltaY) * 1.2, 7, 26); };
    canvas.addEventListener('wheel', this.onWheel, { passive: true });
    this.hud.bindTouch(this.input, this.cam);
  }

  readInput(dt) {
    const k = this.keys, inp = this.input;
    const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const kz = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const move = new THREE.Vector2(kx, kz);
    if (inp.touchMove) move.add(inp.touchMove);
    if (this.voiceMove) move.add(this.voiceMove);
    let run = k.has('shift') || inp.touchRun;
    let jump = k.has(' ') || inp.touchJump;
    let fire = this.mouseFire || k.has('f') || inp.touchFire;
    // gamepad
    const pad = navigator.getGamepads?.().find((g) => g && g.connected);
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      move.x += dz(pad.axes[0]); move.y -= dz(pad.axes[1]);
      this.cam.yaw -= dz(pad.axes[2] ?? 0) * dt * 2.6;
      this.cam.pitch = THREE.MathUtils.clamp(this.cam.pitch + dz(pad.axes[3] ?? 0) * dt * 1.6, -0.25, 1.1);
      const b = (i) => pad.buttons[i]?.pressed;
      jump ||= b(0);
      fire ||= b(7) || b(5);
      run ||= b(4) || b(10);
      if (b(3) && !this.padY) inp.rocket = true;
      if (b(2) && !this.padX) this.toggleLight();
      if (b(1) && !this.padB) this.exit();
      this.padY = b(3); this.padX = b(2); this.padB = b(1);
    }
    if (move.length() > 1) move.normalize();
    inp.move.copy(move);
    inp.run = run && move.length() > 0.1;
    inp.jump = jump;
    inp.fire = fire;
  }

  /** Voice commands while on the planet. Returns true if it handled the words. */
  voice(text) {
    const t = ` ${text.toLowerCase()} `;
    const has = (...w) => w.some((x) => t.includes(` ${x} `) || t.includes(` ${x}`));
    if (has('garage', 'go home', 'go back', 'exit', 'leave')) { this.exit(); return true; }
    if (has('jump', 'hop', 'fly')) { this.input.voiceJump = 0.4; return true; }
    if (has('fire', 'shoot', 'zap', 'blast', 'attack', 'punch')) { this.voiceFire = 1.2; return true; }
    if (has('rocket', 'missile')) { this.input.rocket = true; return true; }
    if (has('light', 'lights')) { this.toggleLight(); return true; }
    if (has('stop', 'halt', 'freeze', 'wait')) { this.voiceMove = null; return true; }
    if (has('forward', 'walk', 'go', 'move', 'run')) { this.voiceMove = new THREE.Vector2(0, 1); if (has('run')) this.voiceRun = true; return true; }
    if (has('back', 'backward', 'backwards', 'reverse')) { this.voiceMove = new THREE.Vector2(0, -1); return true; }
    if (has('left')) { this.cam.yaw += Math.PI / 4; return true; }
    if (has('right')) { this.cam.yaw -= Math.PI / 4; return true; }
    return false;
  }

  toggleLight() {
    if (!this.ab.light) { this.hud.toast('No lights fitted. Try a floodlight or searchlight.'); return; }
    this.lightOn = !this.lightOn;
    sfx.blip(this.lightOn);
  }

  // ---------- the frame ----------
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const t = this.t;
    const pl = this.player;
    const ab = this.ab;
    this.readInput(dt);
    if (this.input.voiceJump > 0) { this.input.jump = true; this.input.voiceJump -= dt; }
    if (this.voiceFire > 0) { this.input.fire = true; this.voiceFire -= dt; }
    if (this.voiceRun && this.voiceMove) this.input.run = true;
    if (!this.voiceMove) this.voiceRun = false;

    // ---- movement ----
    const inp = this.input;
    const fwd = new THREE.Vector3(Math.sin(this.cam.yaw), 0, Math.cos(this.cam.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3().addScaledVector(fwd, inp.move.y).addScaledVector(right, inp.move.x);
    const moving = wish.lengthSq() > 0.01 && !pl.down;
    const canRun = inp.run && pl.energy > 5;
    const speed = (canRun ? ab.run : ab.walk) * (this.planet.inAcid(pl.pos.x, pl.pos.z) ? 0.6 : 1);
    if (canRun && moving) pl.energy -= 9 * dt;
    const target = wish.clone().multiplyScalar(moving ? speed : 0);
    const accel = pl.grounded ? 9 : 2.5;
    pl.vel.x += (target.x - pl.vel.x) * Math.min(1, dt * accel);
    pl.vel.z += (target.z - pl.vel.z) * Math.min(1, dt * accel);

    // jump and jets
    if (inp.jump && pl.grounded && !pl.down && !this.jumpHeld) {
      pl.vel.y = ab.jump;
      pl.grounded = false;
      this.score.jumps++;
      sfx.servo(0.4, 0.7);
      this.dust(pl.pos, 30);
      if (MISSIONS[this.mission].id === 'jump') this.checkMission();
    }
    const jetting = ab.jets && inp.jump && !pl.grounded && pl.energy > 1 && this.jumpHeld && pl.vel.y < 9;
    if (jetting) {
      pl.vel.y += 40 * dt;
      pl.energy -= 28 * dt;
      this.jetT = (this.jetT ?? 0) - dt;
      if (this.jetT <= 0) { this.jetT = 0.12; sfx.jet(); }
      this.sparks.burst(pl.pos.clone().add(new THREE.Vector3(-Math.sin(pl.yaw) * 1.4, 3.2, -Math.cos(pl.yaw) * 1.4)), 4, 2);
    }
    this.jumpHeld = inp.jump;
    pl.vel.y -= GRAVITY * dt;
    pl.pos.addScaledVector(pl.vel, dt);
    this.planet.collide(pl.pos, 2.0);
    const ground = height(pl.pos.x, pl.pos.z);
    if (pl.pos.y <= ground) {
      if (!pl.grounded && pl.vel.y < -12) { sfx.clank(1.3); this.shake = 0.5; this.dust(pl.pos, 40); this.stompWave(); }
      pl.pos.y = ground;
      pl.vel.y = 0;
      pl.grounded = true;
    } else if (pl.pos.y > ground + 0.3) pl.grounded = false;
    if (!pl.down) pl.energy = Math.min(ab.energyMax, pl.energy + (canRun && moving || jetting ? 0 : 16) * dt);

    // face where it's going (or where it's shooting)
    const firing = inp.fire && !pl.down;
    let faceYaw = pl.yaw;
    if (firing) faceYaw = this.cam.yaw;
    else if (moving) faceYaw = Math.atan2(wish.x, wish.z);
    let d = faceYaw - pl.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    pl.yaw += d * Math.min(1, dt * (firing ? 10 : 5));

    // ---- the mech's body ----
    const m = this.mech;
    const hspeed = Math.hypot(pl.vel.x, pl.vel.z);
    m.walking = hspeed > 0.6 && pl.grounded;
    // big, heavy strides: fewer steps, longer swing
    m.walkRate = THREE.MathUtils.clamp(hspeed * (ab.roll ? 0.55 : 0.5), 1.3, 10);
    m.stride = ab.roll ? 0.12 : THREE.MathUtils.clamp(0.42 + hspeed * 0.022, 0.42, 0.75);
    m.pose.air = THREE.MathUtils.lerp(m.pose.air, pl.grounded ? 0 : 1, Math.min(1, dt * 6));
    m.root.position.set(pl.pos.x, pl.pos.y - PLATFORM_TOP, pl.pos.z);
    m.root.rotation.y = pl.yaw;
    // lean into turns and speed
    m.root.rotation.x = 0;
    m.update(t, dt);
    if (m.walking) {
      const ph = Math.floor(m.walkT / Math.PI);
      if (ph !== this.stepPhase) {
        this.stepPhase = ph;
        if (!ab.roll) { sfx.clank(Math.min(1, 0.6 + hspeed / 20)); this.shake = Math.max(this.shake, 0.18); this.dust(pl.pos, 10); }
      }
    }

    // ---- weapons ----
    this.weapons(dt, firing);
    this.updateShots(dt);

    // ---- creatures ----
    this.creatures.player = pl.pos;
    const hit = this.creatures.update(dt, pl);
    if (hit.roar) sfx.roar();
    if (hit.damage > 0 && !pl.down) this.damage(hit.damage, hit.knock);
    if (this.planet.inAcid(pl.pos.x, pl.pos.z) && pl.grounded && !pl.down) this.damage(10 * dt, null, true);

    // ---- crystals ----
    for (const c of this.planet.crystals) {
      if (c.taken) continue;
      if (Math.hypot(c.pos.x - pl.pos.x, c.pos.z - pl.pos.z) < 4.5 && Math.abs(c.pos.y - pl.pos.y) < 6) {
        c.taken = true;
        c.group.visible = false;
        this.score.crystals++;
        sfx.chime();
        this.sparks.burst(c.pos, 60, 4);
        this.hud.toast(`Crystal ${this.score.crystals} collected!`);
        if (this.score.crystals === 1) this.radio('Got one! Keep going.');
        this.checkMission();
      }
    }
    if (MISSIONS[this.mission].id === 'walk' || MISSIONS[this.mission].id === 'home') this.checkMission();

    // ---- lights, shield bubble ----
    const head = m.root.localToWorld(new THREE.Vector3(0, m.lift.position.y + 0.3, 1.2));
    this.lamp.position.copy(head);
    this.lamp.target.position.copy(m.root.localToWorld(new THREE.Vector3(0, 0, 25)));
    this.lamp.intensity = this.lightOn ? 260 : 0;
    this.shieldCool = Math.max(0, this.shieldCool - dt);
    this.bubble.position.copy(pl.pos).setY(pl.pos.y + 3);
    this.bubble.material.opacity = Math.max(0, this.bubble.material.opacity - dt * 0.8);

    this.planet.update(t, dt);
    this.planet.follow(pl.pos);
    this.sparks.update(dt);
    this.marker.rotation.y += dt;
    this.updateCamera(dt);
    // the reticle: which creature the auto-aim will hit
    const from = this.handWorld(this.nextArm);
    const dir = new THREE.Vector3(Math.sin(this.cam.yaw), -Math.sin(this.cam.pitch - 0.28) * 0.6, Math.cos(this.cam.yaw)).normalize();
    const tgt = this.ab.arms.L || this.ab.arms.R ? this.creatures.target(from, dir) : null;
    this.hud.lock(tgt ? this.creatures.centre(tgt) : null, this.camera);
    this.hud.update(dt);
  }

  dust(p, n) {
    const old = this.sparks.points.material.color.getHex();
    this.sparks.points.material.color.setHex(0xb08cff);
    this.sparks.burst(p.clone().setY(p.y + 0.3), n, 3);
    this.sparks.points.material.color.setHex(old);
  }

  /** Landing hard knocks nearby creatures over. */
  stompWave() {
    for (const c of this.creatures.near(this.player.pos, 6)) this.zap(c, 1);
  }

  // ---------- weapons ----------
  handWorld(side) {
    const a = this.mech.attached['arm' + side];
    const hand = a?.group.userData.joints?.hand;
    return hand ? hand.getWorldPosition(new THREE.Vector3()) : this.player.pos.clone().setY(this.player.pos.y + 3);
  }

  aimDir(from) {
    const dir = new THREE.Vector3(Math.sin(this.cam.yaw), -Math.sin(this.cam.pitch - 0.28) * 0.6, Math.cos(this.cam.yaw)).normalize();
    const tgt = this.creatures.target(from, dir);
    if (tgt) return this.creatures.centre(tgt).sub(from).normalize();
    return dir;
  }

  weapons(dt, firing) {
    const ab = this.ab, m = this.mech;
    for (const s of ['L', 'R']) {
      this.fireCool[s] = Math.max(0, this.fireCool[s] - dt);
      m.pose['aim' + s] = Math.max(0, m.pose['aim' + s] - dt * 2.5);
      m.pose['punch' + s] = Math.max(0, m.pose['punch' + s] - dt * 3.5);
    }
    const arms = ['L', 'R'].filter((s) => ab.arms[s]);
    if (firing && arms.length) {
      // alternate arms, each with its own cooldown
      const order = this.nextArm === 'L' ? ['L', 'R'] : ['R', 'L'];
      for (const s of order) {
        const w = ab.arms[s];
        if (!w) continue;
        if (w.weapon === 'saw') { m.pose['aim' + s] = 1; this.saw(s, dt); continue; }
        if (this.fireCool[s] > 0) continue;
        this.fire(s, w);
        this.nextArm = s === 'L' ? 'R' : 'L';
        break;
      }
    }
    // shoulder turret shoots by itself
    if (ab.turret) {
      this.turretCool -= dt;
      if (this.turretCool <= 0) {
        const from = this.player.pos.clone().setY(this.player.pos.y + 4.8);
        const near = this.creatures.near(this.player.pos, 28).sort((a, b) => a.pos.distanceTo(this.player.pos) - b.pos.distanceTo(this.player.pos))[0];
        if (near) {
          this.turretCool = 0.7;
          this.shoot(from, this.creatures.centre(near).sub(from).normalize(), 1, 0xffd23a, 55);
          sfx.turret();
        } else this.turretCool = 0.3;
      }
    }
    // rockets
    if (this.input.rocket) {
      this.input.rocket = false;
      if (ab.rockets === 0) this.hud.toast('No rockets fitted. Try a rocket pod or missile rack.');
      else if (this.rocketsLeft < 1) this.hud.toast('Rockets reloading…');
      else {
        this.rocketsLeft--;
        const from = this.player.pos.clone().setY(this.player.pos.y + 5);
        const dir = this.aimDir(from);
        const target = this.creatures.target(from, dir, 120, 0.8);
        this.shots.push(this.makeShot(from, dir.clone().setY(dir.y + 0.4).normalize(), 22, 4, 0xff7a2a, { rocket: true, target, splash: 5, life: 4 }));
        sfx.rocket();
      }
    }
    if (this.rocketsLeft < ab.rockets) {
      this.rocketRegen += dt;
      if (this.rocketRegen > 4) { this.rocketRegen = 0; this.rocketsLeft++; }
    }
  }

  fire(side, w) {
    const m = this.mech;
    const from = this.handWorld(side);
    if (w.weapon === 'bolt' || w.weapon === 'twin') {
      m.pose['aim' + side] = 1;
      this.fireCool[side] = w.weapon === 'twin' ? 0.13 : 0.24;
      const dir = this.aimDir(from);
      this.shoot(from, dir, 1, w.weapon === 'twin' ? 0xff5cc8 : 0x39e6ff, 75);
      if (w.weapon === 'twin') sfx.laser(); else sfx.cannon();
    } else {
      // punch: hits everything in front, short range, with a shockwave
      m.pose['punch' + side] = 1;
      this.fireCool[side] = 0.45;
      const fwd = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
      const hitAt = this.player.pos.clone().setY(this.player.pos.y + 1.5).addScaledVector(fwd, 4);
      let any = false;
      for (const c of this.creatures.near(hitAt, 3.5)) { this.zap(c, w.power ?? 2); any = true; }
      this.sparks.burst(hitAt, any ? 50 : 15, 4);
      sfx.punch(any);
      this.shake = Math.max(this.shake, 0.15);
    }
  }

  saw(side, dt) {
    const fwd = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    const at = this.player.pos.clone().setY(this.player.pos.y + 2).addScaledVector(fwd, 4.2);
    this.sawT = (this.sawT ?? 0) - dt;
    if (this.sawT <= 0) {
      this.sawT = 0.18;
      sfx.grind();
      this.sparks.burst(at, 8, 3);
      for (const c of this.creatures.near(at, 3)) this.zap(c, 0.8);
    }
  }

  makeShot(from, dir, speed, dmg, color, extra = {}) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(extra.rocket ? 0.3 : 0.22, 8, 6), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    mesh.scale.z = extra.rocket ? 2.5 : 4;
    mesh.position.copy(from);
    this.scene.add(mesh);
    return { mesh, vel: dir.clone().multiplyScalar(speed), dmg, life: extra.life ?? 1.4, ...extra };
  }

  shoot(from, dir, dmg, color, speed) {
    this.shots.push(this.makeShot(from, dir, speed, dmg, color));
  }

  updateShots(dt) {
    for (const s of this.shots) {
      s.life -= dt;
      if (s.rocket && s.target && this.creatures.list.includes(s.target)) {
        const want = this.creatures.centre(s.target).sub(s.mesh.position).normalize().multiplyScalar(s.vel.length() + dt * 20);
        s.vel.lerp(want, Math.min(1, dt * 3));
      }
      if (s.rocket) this.sparks.burst(s.mesh.position, 1, 0.5);
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.lookAt(s.mesh.position.clone().add(s.vel));
      const p = s.mesh.position;
      let boom = p.y < height(p.x, p.z) || s.life <= 0;
      for (const c of this.creatures.list) {
        if (this.creatures.centre(c).distanceTo(p) < c.def.r + 0.4) { boom = true; break; }
      }
      if (boom) {
        s.life = 0;
        const radius = s.splash ?? 1.2;
        for (const c of this.creatures.near(p, radius)) this.zap(c, s.dmg);
        this.sparks.burst(p, s.rocket ? 90 : 14, s.rocket ? 6 : 2.5);
        if (s.rocket) { sfx.boom(); this.shake = Math.max(this.shake, 0.3); }
      }
    }
    this.shots = this.shots.filter((s) => {
      if (s.life > 0) return true;
      s.mesh.removeFromParent();
      s.mesh.geometry.dispose();
      return false;
    });
  }

  zap(c, dmg) {
    if (!this.creatures.list.includes(c)) return;
    const at = this.creatures.centre(c);
    if (this.creatures.hurt(c, dmg)) {
      this.score.zapped++;
      this.score.points = (this.score.points ?? 0) + c.def.points;
      sfx.splat(c.type === 'stomper' ? 1.4 : c.type === 'floater' ? 0.7 : 1);
      const old = this.sparks.points.material.color.getHex();
      this.sparks.points.material.color.setHex(c.type === 'floater' ? 0xff7ad8 : c.type === 'stomper' ? 0xff8a3d : 0x9dff6a);
      this.sparks.burst(at, c.type === 'stomper' ? 120 : 50, 5);
      this.sparks.points.material.color.setHex(old);
      if (c.type === 'stomper') this.radio('You stopped a Stomper! Awesome!');
      if (MISSIONS[this.mission].id === 'zap') this.checkMission();
    } else sfx.hit();
  }

  // ---------- getting hurt ----------
  damage(amount, knock, quiet = false) {
    const pl = this.player;
    if (this.ab.forcefield && this.shieldCool <= 0 && amount > 5) {
      this.shieldCool = 6;
      this.bubble.material.opacity = 0.45;
      sfx.blip(true);
      return;
    }
    amount *= 1 - Math.min(0.6, this.ab.shield);
    pl.hp -= amount;
    if (knock) { pl.vel.add(knock); pl.vel.y = 6; pl.grounded = false; }
    if (!quiet) this.shake = Math.max(this.shake, amount > 5 ? 0.4 : 0.08);
    if (amount > 5) sfx.hurt();
    this.hud.hurt();
    if (pl.hp < this.ab.maxHp * 0.3 && !this.warned) { this.warned = true; this.radio('Armour is low! Head back to the landing pad to repair.'); }
    if (pl.hp <= 0) this.knockedOut();
  }

  knockedOut() {
    const pl = this.player;
    pl.down = true;
    pl.hp = 0;
    this.hud.big('SYSTEMS DOWN', 'Your robot helper is bringing the mech back to base…');
    this.radio("Don't worry, I've got you. Bringing you back to base for repairs.");
    setTimeout(() => {
      if (!this.active) return;
      pl.pos.copy(BASE).add(new THREE.Vector3(0, 0, 6));
      pl.vel.set(0, 0, 0);
      pl.hp = this.ab.maxHp;
      pl.energy = this.ab.energyMax;
      pl.down = false;
      this.warned = false;
      this.hud.big(null);
    }, 3500);
  }

  // ---------- camera ----------
  updateCamera(dt) {
    const pl = this.player;
    // repair on the landing pad
    if (Math.hypot(pl.pos.x - BASE.x, pl.pos.z - BASE.z) < 13 && pl.hp < this.ab.maxHp && !pl.down) {
      pl.hp = Math.min(this.ab.maxHp, pl.hp + 25 * dt);
      if (pl.hp >= this.ab.maxHp) this.warned = false;
    }
    if (this.input.look) {
      this.cam.yaw -= this.input.look.x;
      this.cam.pitch = THREE.MathUtils.clamp(this.cam.pitch + this.input.look.y, -0.25, 1.1);
      this.input.look.set(0, 0);
    }
    // gently swing behind the mech while walking without steering the camera
    const target = pl.pos.clone().setY(pl.pos.y + 4.2);
    const off = new THREE.Vector3(Math.sin(this.cam.yaw) * Math.cos(this.cam.pitch), Math.sin(this.cam.pitch), Math.cos(this.cam.yaw) * Math.cos(this.cam.pitch)).multiplyScalar(-this.cam.dist);
    const want = target.clone().add(off);
    const g = height(want.x, want.z) + 1.5;
    if (want.y < g) want.y = g;
    this.camera.position.lerp(want, Math.min(1, dt * 8));
    this.camera.lookAt(target);
    this.fill.position.copy(this.camera.position).add(new THREE.Vector3(0, 6, 0));
    this.fill.target.position.copy(target);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake));
    }
  }

  render() {
    this.composer.render();
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.fov = innerWidth / innerHeight < 0.8 ? 75 : 60;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.setSize(innerWidth / 2, innerHeight / 2);
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.creatures.disposed = true;
    document.exitPointerLock?.();
    removeEventListener('keydown', this.onKey);
    removeEventListener('keyup', this.onKey);
    removeEventListener('pointerup', this.onMouseUp);
    removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.renderer.domElement.removeEventListener('pointerdown', this.onMouseDown);
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
    this.hud.close();
    // free the planet's GPU memory; the mech's shapes and textures are shared with the garage, so leave those
    const keep = new Set();
    this.mech.root.traverse((o) => keep.add(o));
    this.scene.traverse((o) => {
      if (keep.has(o)) return;
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => mm.dispose());
    });
    this.composer.dispose?.();
    this.envTex.dispose();
    this.onExit?.(this.score);
  }
}

// ======================================================================
// HUD: bars, mission card, radar, radio line, touch controls
// ======================================================================
class Hud {
  constructor(sim) {
    this.sim = sim;
    this.el = document.getElementById('sim');
    this.el.classList.remove('hidden');
    document.body.classList.add('sim-on');
    this.$ = (id) => document.getElementById(id);
    this.radar = this.$('sim-radar').getContext('2d');
    this.$('sim-exit').onclick = () => sim.exit();
    this.$('sim-rockets-wrap').classList.toggle('hidden', !sim.ab.rockets);
    this.$('sim-b-rocket').classList.toggle('hidden', !sim.ab.rockets);
    this.$('sim-b-light').classList.toggle('hidden', !sim.ab.light);
    this.$('sim-b-light').onclick = () => sim.toggleLight();
    this.$('sim-b-rocket').onpointerdown = (e) => { e.preventDefault(); sim.input.rocket = true; };
    const touch = matchMedia('(pointer: coarse)').matches;
    this.$('sim-touch').classList.toggle('hidden', !touch);
    this.$('sim-help').innerHTML = touch
      ? 'Left stick: move · drag right side: look · buttons: jump, fire, run'
      : 'Click to steer with the mouse · <b>WASD</b> move · <b>Shift</b> run · <b>Space</b> jump' + (sim.ab.jets ? ' (hold to fly)' : '') + ' · <b>Mouse/F</b> fire' + (sim.ab.rockets ? ' · <b>R</b> rockets' : '') + (sim.ab.light ? ' · <b>L</b> lights' : '') + ' · <b>Esc</b> garage';
    this.$('sim-help').classList.remove('hidden');
    setTimeout(() => this.$('sim-help').classList.add('hidden'), 12000);
    this.big(null);
  }

  bindTouch(input, cam) {
    const stick = this.$('sim-stick'), knob = this.$('sim-knob');
    let stickId = null, lookId = null, origin = null, last = null;
    const lookArea = this.$('sim-look');
    stick.onpointerdown = (e) => {
      stickId = e.pointerId;
      const r = stick.getBoundingClientRect();
      origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      stick.setPointerCapture(e.pointerId);
    };
    stick.onpointermove = (e) => {
      if (e.pointerId !== stickId) return;
      const dx = e.clientX - origin.x, dy = e.clientY - origin.y;
      const len = Math.min(55, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      knob.style.transform = `translate(${Math.cos(a) * len}px, ${Math.sin(a) * len}px)`;
      input.touchMove = new THREE.Vector2(Math.cos(a) * len / 55, -Math.sin(a) * len / 55);
      input.touchRun = len > 50;
    };
    stick.onpointerup = stick.onpointercancel = () => { stickId = null; input.touchMove = null; input.touchRun = false; knob.style.transform = ''; };
    lookArea.onpointerdown = (e) => { lookId = e.pointerId; last = { x: e.clientX, y: e.clientY }; lookArea.setPointerCapture(e.pointerId); };
    lookArea.onpointermove = (e) => {
      if (e.pointerId !== lookId) return;
      input.look.x += (e.clientX - last.x) * 0.006;
      input.look.y += (e.clientY - last.y) * 0.004;
      last = { x: e.clientX, y: e.clientY };
    };
    lookArea.onpointerup = lookArea.onpointercancel = () => { lookId = null; };
    const hold = (id, key) => {
      const b = this.$(id);
      b.onpointerdown = (e) => { e.preventDefault(); input[key] = true; b.classList.add('on'); };
      b.onpointerup = b.onpointercancel = b.onpointerleave = () => { input[key] = false; b.classList.remove('on'); };
    };
    hold('sim-b-fire', 'touchFire');
    hold('sim-b-jump', 'touchJump');
    hold('sim-b-run', 'touchRun');
  }

  mission(m, progress) {
    this.$('sim-mission').textContent = m.text;
    this.$('sim-progress').textContent = progress;
  }

  radio(who, text) {
    const r = this.$('sim-radio');
    r.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = who + ': ';
    r.append(b, document.createTextNode(text));
    r.classList.remove('hidden');
    clearTimeout(this.radioT);
    this.radioT = setTimeout(() => r.classList.add('hidden'), 6500);
  }

  toast(text) {
    const t = this.$('sim-toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  big(title, sub = '') {
    const b = this.$('sim-big');
    if (!title) { b.classList.add('hidden'); return; }
    b.innerHTML = `<div>${title}</div><small>${sub}</small>`;
    b.classList.remove('hidden');
  }

  /** Moves the lock-on ring onto the creature the shots will go to (or hides it). */
  lock(p, camera) {
    const el = this.$('sim-lock');
    if (!p) { el.classList.add('hidden'); this.$('sim-cross').classList.remove('locked'); return; }
    const v = p.clone().project(camera);
    if (v.z > 1) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.style.transform = `translate(${(v.x + 1) / 2 * innerWidth - 22}px, ${(1 - v.y) / 2 * innerHeight - 22}px)`;
    this.$('sim-cross').classList.add('locked');
  }

  hurt() {
    const f = this.$('sim-flash');
    f.style.opacity = '0.5';
    clearTimeout(this.hurtT);
    this.hurtT = setTimeout(() => { f.style.opacity = '0'; }, 120);
  }

  update() {
    const s = this.sim, pl = s.player, ab = s.ab;
    this.$('sim-hp').style.width = `${Math.max(0, pl.hp / ab.maxHp) * 100}%`;
    this.$('sim-hp').classList.toggle('low', pl.hp < ab.maxHp * 0.3);
    this.$('sim-en').style.width = `${Math.max(0, pl.energy / ab.energyMax) * 100}%`;
    this.$('sim-hp-v').textContent = Math.ceil(Math.max(0, pl.hp));
    this.$('sim-en-v').textContent = Math.round(pl.energy);
    this.$('sim-rockets').textContent = '▮'.repeat(s.rocketsLeft) + '▯'.repeat(Math.max(0, ab.rockets - s.rocketsLeft));
    this.$('sim-score').textContent = `💎 ${s.score.crystals}   ✦ ${s.score.zapped}`;
    this.$('sim-speed').textContent = `${Math.round(Math.hypot(pl.vel.x, pl.vel.z) * 3.6)} km/h`;
    this.drawRadar();
  }

  drawRadar() {
    const s = this.sim, c = this.radar, W = 160, R = 74;
    c.clearRect(0, 0, W, W);
    c.save();
    c.translate(W / 2, W / 2);
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2);
    c.fillStyle = 'rgba(10,25,35,0.7)'; c.fill();
    c.strokeStyle = 'rgba(92,207,255,0.6)'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = 'rgba(92,207,255,0.2)';
    c.beginPath(); c.arc(0, 0, R / 2, 0, Math.PI * 2); c.stroke();
    // sweep
    const sweep = (s.t * 2) % (Math.PI * 2);
    c.fillStyle = 'rgba(92,207,255,0.12)';
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, sweep - 0.5, sweep); c.fill();
    const range = s.ab.radar, yaw = s.cam.yaw, p = s.player.pos;
    const dot = (x, z, color, size) => {
      const dx = x - p.x, dz = z - p.z;
      // rotate so "up" on the radar is where the camera looks
      const rx = -(dx * Math.cos(yaw) - dz * Math.sin(yaw));
      const ry = -(dx * Math.sin(yaw) + dz * Math.cos(yaw));
      let px = (rx / range) * R, py = (ry / range) * R;
      const l = Math.hypot(px, py);
      if (l > R - 3) { px *= (R - 3) / l; py *= (R - 3) / l; size = Math.max(2, size - 1); }
      c.fillStyle = color;
      c.beginPath(); c.arc(px, py, size, 0, Math.PI * 2); c.fill();
    };
    dot(BASE.x, BASE.z, '#7dffb5', 5);
    if (s.markerTarget) dot(s.markerTarget.x, s.markerTarget.z, '#39c6ff', 5);
    for (const cr of s.planet.crystals) if (!cr.taken) dot(cr.pos.x, cr.pos.z, '#39e6ff', 3.5);
    for (const cr of s.creatures.list) {
      if (cr.pos.distanceTo(p) > range * 1.2) continue;
      dot(cr.pos.x, cr.pos.z, cr.type === 'stomper' ? '#ff8a3d' : cr.type === 'floater' ? '#ff7ad8' : '#ff4a4a', cr.type === 'stomper' ? 4.5 : 3);
    }
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(-5, 5); c.fill();
    c.restore();
  }

  close() {
    this.el.classList.add('hidden');
    document.body.classList.remove('sim-on');
  }
}
