import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';

import { buildGarage, LAYOUT } from './garage.js';
import { Mech, stageDist, SEAT_DIST } from './mech.js';
import { Robot } from './robot.js';
import { Sparks, hologram, materialize, dematerialize } from './fx.js';
import { PARTS, SLOTS, SLOT_ORDER, partById, partsFor, COLORS, GLOW_COLORS } from './parts.js';
import { understand, say, KIND_LABEL } from './brain.js';
import * as voice from './voice.js';
import * as sfx from './audio.js';
import { Blueprint } from './blueprint.js';
import { Sim } from './sim/sim.js';
import { Jazz, TRACKS } from './music.js';
import { Boombox } from './boombox.js';
import { Perf } from './perf.js';

/** Phones (and phones on their side): panels open one at a time as sheets. Matches the CSS. */
const COMPACT = matchMedia('(max-width: 900px), (max-height: 560px) and (pointer: coarse)');
const compact = () => COMPACT.matches;

// ======================================================================
// saved state
// ======================================================================
const SAVE_KEY = 'mechgarage.save.v1';
const DEFAULT_PAINT = { primary: '#525a63', accent: '#d9a62b', glow: '#39c6ff' };
// The starter titan: four-container cockpit, container arms and legs, sensor built into the body.
const DEFAULT_BUILD = { hull: 'hull-quad', legL: 'leg-container', legR: 'leg-container', armL: 'arm-gripper', armR: 'arm-gripper', head: 'head-visor', back: 'back-power', shoulderL: 'sh-light', shoulderR: 'sh-beacon' };

function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) ?? null; } catch { return null; }
}
const state = Object.assign({
  robotName: '', pilotName: '', mechName: '', paint: { ...DEFAULT_PAINT }, layout: {},
  voiceOn: true, wakeWord: false, volume: 0.7, voiceId: '', musicOn: true, musicVolume: 0.45, track: 0, graphics: 'auto',
}, load() ?? {});
function save() {
  state.layout = mech.layout;
  state.custom = mech.custom;
  state.paint = { ...mech.paint };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* private mode: keep playing */ }
}

// ======================================================================
// renderer, scene, camera
// ======================================================================
const canvas = document.getElementById('view');
// graphics level: PCs start on high, tablets and phones on low; on Auto it steps down by itself if frames come slowly
delete state.quality;  // the old two-way setting; the new one starts on Auto
const perf = new Perf(state.graphics ?? 'auto');
sfx.setLowPower(perf.lowPower);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: perf.opts.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(perf.ratio);
renderer.shadowMap.enabled = perf.opts.shadows !== 'off';
renderer.shadowMap.type = perf.opts.shadows === 'soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090c);
scene.fog = new THREE.Fog(0x07090c, 22, 42);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 80);
const HOME_CAM = { pos: new THREE.Vector3(0.6, 4.4, 13.2), target: new THREE.Vector3(0, 2.7, 0) };
camera.position.copy(HOME_CAM.pos);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME_CAM.target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3.5;
controls.maxDistance = 17;
controls.maxPolarAngle = Math.PI * 0.49;
controls.screenSpacePanning = true;
controls.update();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// the other modes (made further down)
let sim = null;
let blueprint = null;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w / 2, h / 2);
  camera.aspect = w / h;
  // phones in portrait see more by stepping back
  camera.fov = w / h < 0.8 ? 66 : w / h < 1.2 ? 56 : 48;
  camera.updateProjectionMatrix();
  if (sim) sim.resize();
  if (blueprint?.active) blueprint.frame();
}
addEventListener('resize', resize);
resize();

// ======================================================================
// the world
// ======================================================================
const garage = buildGarage(scene, perf.level);
const mech = new Mech(scene, state.paint);
mech.onHeightChange = (y) => garage.rebuildChains(y + hullTop());
const robot = new Robot(scene);
const sparks = new Sparks(scene);
robot.home(camera.position);
// the boombox on the desk, and the band inside it
const boombox = new Boombox(garage.desk, new THREE.Vector3(-1.05, 0.955, -2.62), 0.3);
const music = new Jazz(() => sfx.audioContext());
music.lowPower = perf.lowPower;

/** Applies the current graphics level (at start and whenever the adjuster changes it). */
function applyPerf() {
  const o = perf.opts;
  renderer.setPixelRatio(perf.ratio);
  resize();
  garage.setLevel(o);
  boombox.light.visible = o.lights;
  boombox.lowPower = perf.lowPower;
  if (o.shadows === 'off') for (const l of [garage.lights.key, sim?.planet.sun]) if (l) l.castShadow = false;
  music.lowPower = perf.lowPower;
}
perf.onChange(applyPerf);
applyPerf();
music.index = Math.min(state.track ?? 0, TRACKS.length - 1);
music.volume = state.musicVolume;
music.onChange = () => { state.track = music.index; renderBoombox(); };
let musicBeforeSim = false;
/** Starts the music on the first tap or click (browsers only allow sound after one). */
function startMusicIfWanted() {
  if (state.musicOn && !music.playing && !sim && sfx.audioContext()) music.play();
}
blueprint = new Blueprint({
  renderer, scene, camera, controls, mech, state, save: () => save(),
  hide: (h) => { garage.group.visible = !h; robot.group.visible = !h; sparks.points.visible = !h; },
});

function hullTop() {
  if (!mech.hull) return 0.9;
  if (mech.hull.top === undefined) {
    const b = new THREE.Box3().setFromObject(mech.hull.group);
    mech.hull.top = b.max.y - mech.hull.group.getWorldPosition(new THREE.Vector3()).y - 0.05;
  }
  return mech.hull.top;
}

// ======================================================================
// the job queue: everything the robot does happens one job at a time
// ======================================================================
let busy = false;
const queue = [];
function job(fn) {
  return new Promise((resolve) => {
    queue.push(async () => { try { await fn(); } catch (e) { console.error(e); } resolve(); });
    pump();
  });
}
async function pump() {
  if (busy) return;
  busy = true;
  setRobotState('working');
  while (queue.length) await queue.shift()();
  busy = false;
  if (!mech.held) robot.home(camera.position);
  setRobotState(speaking ? 'talking' : 'idle');
  refreshUI();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- talking ----------
let speaking = false;
const pilot = () => state.pilotName || 'pilot';
async function talk(text, { wait = false } = {}) {
  addMsg('bot', text);
  if (!state.voiceOn) return;
  const p = (async () => {
    speaking = true;
    robot.setMood('talking');
    setLed('talking');
    await voice.speak(text);
    speaking = false;
    robot.setMood(busy ? 'working' : 'idle');
    setLed(busy ? 'working' : 'idle');
  })();
  if (wait) await p;
}

// ======================================================================
// what the robot can do
// ======================================================================
const label = (slot) => KIND_LABEL[slot] ?? slot;
const liftTop = (slot) => {
  const k = SLOTS[slot].kind;
  return LAYOUT.lift.clone().setY(k === 'arm' || k === 'leg' ? 3.0 : k === 'hull' ? 1.4 : 1.2);
};

function resolveSlot(slot) {
  if (!slot.endsWith('?')) return slot;
  const base = slot.slice(0, -1);
  const L = base + 'L', R = base + 'R';
  if (mech.held && (mech.held.slot === L || mech.held.slot === R)) return mech.held.slot;
  if (!mech.partIn(L)) return L;
  if (!mech.partIn(R)) return R;
  return lastSlot === R ? R : L;
}

let lastSlot = 'hull';

/** Turns the turntable so the robot can reach the back. */
async function faceFor(slot) {
  const angle = slot === 'back' ? Math.PI : 0;
  mech.spin = 0;
  const cur = mech.root.rotation.y;
  if (Math.abs(Math.atan2(Math.sin(angle - cur), Math.cos(angle - cur))) < 0.01) return;
  mech.turnTarget = angle;
  sfx.servo(1.5, 0.6);
  while (mech.turnTarget !== null) await sleep(50);
}

/** The robot fetches a part from the lift and holds it out in front of its socket. */
async function bring(slotIn, partId, attach) {
  let slot = resolveSlot(slotIn);
  if (!mech.canFit(slot)) {
    await talk(say.needHull(), { wait: false });
    await bring('hull', 'hull-quad', true);
  }
  lastSlot = slot;
  // which part: the one asked for, the next one along, or the first
  const options = partsFor(slot);
  if (!partId) {
    const cur = mech.held?.slot === slot ? mech.held.part.id : mech.partIn(slot)?.id;
    partId = cur ? options[(options.findIndex((p) => p.id === cur) + 1) % options.length].id : (DEFAULT_BUILD[slot] ?? options[0].id);
  }
  if (mech.held?.slot === slot && mech.held.part.id === partId) {
    if (attach) await lock();
    else await talk(say.holding());
    return;
  }
  if (mech.held) await putBack(false);
  if (mech.partIn(slot)?.id === partId) {
    await talk(`The ${partById(partId).name} is already on the ${label(slot)}.`);
    return;
  }
  if (slot !== 'hull' && mech.partIn(slot)) await takeOff(slot, false);

  const made = mech.make(partId, slot);
  addMsgQuiet(say.bringing(made.part.name, label(slot)));
  showHolo(made.group);
  // it appears on the lift
  const at = liftTop(slot);
  made.group.position.copy(at);
  scene.add(made.group);
  garage.flashLift();
  sfx.whoosh();
  await materialize(made.group, 0.8);
  // the robot picks it up
  robot.setMood('working');
  sfx.servo(1.2);
  await robot.reach(made.group.getWorldPosition(new THREE.Vector3()));
  robot.take(made.group);
  sfx.blip();
  await faceFor(slot);
  // and carries it to the socket
  sfx.servo(1.4, 0.9);
  const stage = mech.socketWorld(slot, stageDist(slot)).pos;
  await robot.reach(stage, { timeout: 4 });
  robot.release();
  mech.hold(slot, made);
  refreshUI();
  if (attach) {
    await sleep(350);
    await lock();
  } else {
    await talk(say.holding());
  }
}

/** Pushes the held part home and locks it on with a weld. */
async function lock() {
  const h = mech.held;
  if (!h) { await talk(say.nothingHeld()); return; }
  const { slot, part } = h;
  h.dist = 0.02;
  sfx.servo(0.7, 1.3);
  await sleep(650);
  mech.lockHeld();
  const p = mech.socketWorld(slot).pos;
  sparks.burst(p, 120, 3.5);
  sparks.weld(p, 0.9);
  sfx.clunk();
  sfx.weld(0.9);
  await sleep(500);
  if (slot === 'back') { await sleep(400); await faceFor('front'); }
  if (mech.standing && !wasStanding) { wasStanding = true; sfx.servo(1.6, 0.5); }
  if (!mech.standing) wasStanding = false;
  save();
  refreshUI();
  const s = mech.stats();
  let line = say.locked(part.name);
  if (s.complete) line += ` That's every part, ${pilot()}! ${state.mechName || 'Your mech'} is complete. Say "test walk" to try it.`;
  else if (mech.standing && (slot === 'legL' || slot === 'legR')) line += ' It is standing on its own feet now!';
  await talk(line);
}
let wasStanding = false;

/** Puts the held part back on the lift. */
async function putBack(announce = true) {
  const h = mech.dropHeld();
  if (!h) { if (announce) await talk(say.nothingHeld()); return; }
  if (announce) addMsgQuiet(say.cancelled());
  if (announce && state.voiceOn) voice.speak(say.cancelled());
  robot.setMood('working');
  await robot.reach(h.group.getWorldPosition(new THREE.Vector3()), { timeout: 2 });
  robot.take(h.group);
  sfx.servo(1.2);
  await robot.reach(liftTop(h.slot), { timeout: 4 });
  const g = robot.release();
  scene.attach(g);
  garage.flashLift();
  await dematerialize(g);
  if (h.slot === 'back') await faceFor('front');
  refreshUI();
}

/** Takes a fitted part off and returns it to the lift. */
async function takeOff(slotIn, announce = true) {
  let slot = slotIn.endsWith('?') ? (() => { const b = slotIn.slice(0, -1); return mech.partIn(b + 'L') ? b + 'L' : b + 'R'; })() : slotIn;
  const part = mech.partIn(slot);
  if (!part) { if (announce) await talk(`There's nothing on the ${label(slot)}.`); return; }
  if (slot === 'hull') return scrap();
  if (mech.held) await putBack(false);
  await faceFor(slot);
  robot.setMood('working');
  sfx.servo(1.2);
  await robot.reach(mech.socketWorld(slot).pos, { timeout: 4 });
  sparks.burst(mech.socketWorld(slot).pos, 60, 2.5);
  sfx.clunk();
  const g = mech.remove(slot);
  robot.take(g);
  await robot.reach(mech.socketWorld(slot, stageDist(slot))?.pos ?? liftTop(slot), { timeout: 2 });
  sfx.servo(1.2);
  await robot.reach(liftTop(slot), { timeout: 4 });
  scene.attach(robot.release());
  garage.flashLift();
  await dematerialize(g);
  if (slot === 'back') await faceFor('front');
  save();
  refreshUI();
  if (announce) await talk(say.removed(label(slot)));
}

/** Everything off the stand. */
async function scrap() {
  if (mech.held) await putBack(false);
  addMsgQuiet('Taking it all apart.');
  if (state.voiceOn) voice.speak('Taking it all apart.');
  for (const slot of [...SLOT_ORDER].reverse()) {
    if (!mech.partIn(slot)) continue;
    const g = slot === 'hull' ? mech.remove('hull') : mech.remove(slot);
    if (!g) continue;
    scene.attach(g);
    sfx.clunk();
    dematerialize(g, 0.6);
    await sleep(220);
  }
  mech.walking = false;
  save();
  refreshUI();
}

/** Builds whatever is missing, the starter titan by default. */
async function buildAll() {
  const missing = SLOT_ORDER.filter((s) => !mech.partIn(s));
  if (!missing.length) { await talk(`It's already complete, ${pilot()}. Want to swap something?`); return; }
  await talk(`Building the rest. Watch this, ${pilot()}!`);
  robot.speed = 1.8;
  for (const slot of missing) {
    if (mech.held && mech.held.slot !== slot) await putBack(false);
    await bring(slot, mech.held?.slot === slot ? mech.held.part.id : DEFAULT_BUILD[slot], true);
  }
  robot.speed = 1;
}

async function cycle(dir) {
  const slot = mech.held?.slot ?? lastSlot;
  const options = partsFor(slot);
  const cur = mech.held?.part.id ?? mech.partIn(slot)?.id ?? options[0].id;
  const next = options[(options.findIndex((p) => p.id === cur) + dir + options.length) % options.length];
  await bring(slot, next.id, false);
}

async function nudge(amount) {
  if (!mech.held) { await talk(say.nothingHeld()); return; }
  const before = mech.held.dist;
  const d = mech.nudge(amount);
  sfx.servo(0.4, amount < 0 ? 1.2 : 0.9);
  refreshUI();
  if (d <= SEAT_DIST + 0.01 && before > SEAT_DIST + 0.01) await talk(say.ready());
  else if (d >= 3.19 && amount > 0) await talk('That is as far out as my arm goes.');
}

async function paint(target, colorName) {
  const table = target === 'glow' ? GLOW_COLORS : COLORS;
  const hex = table[colorName];
  if (!hex) return;
  mech.setPaint({ [target]: hex });
  // a puff of spray at the hull
  if (mech.hull) sparks.burst(mech.hull.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 1)), 30, 1.2);
  save();
  refreshUI();
  const what = target === 'glow' ? 'The lights are' : target === 'accent' ? 'The trim is' : 'It is';
  await talk(`${what} ${colorName} now. Looking good!`);
}

async function walkTest(on) {
  if (!on) { mech.walking = false; await talk('Powering down.'); return; }
  if (!mech.standing) { await talk(`It needs both legs before it can walk, ${pilot()}.`); return; }
  const s = mech.stats();
  if (s.power < 0) { await talk(`Not enough power! It needs ${-s.power} more. Try a power cell pack on the back.`); return; }
  if (mech.held) await putBack(false);
  mech.spin = 0;
  await talk('Power up! Running the walk test.');
  sfx.powerUp();
  await sleep(900);
  mech.walking = true;
  setTimeout(() => { if (mech.walking) { mech.walking = false; refreshUI(); } }, 9000);
  refreshUI();
}

/** Whether the mech can go to the test planet, and if not, why. */
function launchCheck() {
  const s = mech.stats();
  if (!mech.hull) return { ok: false, why: `There's no mech on the stand yet, ${pilot()}. Build one first!` };
  if (!mech.standing) return { ok: false, why: 'It needs both legs before it can go to the test planet.' };
  if (s.power < 0) return { ok: false, why: `Not enough power for the planet. It needs ${-s.power} more. Try a power cell pack on the back.` };
  return { ok: true, noArms: !mech.attached.armL && !mech.attached.armR };
}

async function launch() {
  const c = launchCheck();
  if (!c.ok) { await talk(c.why); return; }
  if (mech.held) await putBack(false);
  if (blueprint.active) blueprint.exit();
  mech.walking = false;
  mech.spin = 0;
  await talk(`Launching ${state.mechName || 'your mech'} to the test planet! ${c.noArms ? 'No arms means no blasters, but you can still explore.' : 'Good luck, pilot!'}`);
  sfx.powerUp();
  $('loading').querySelector('.boot-text').textContent = 'Dropping to the test planet…';
  $('loading').classList.remove('hidden');
  await sleep(60);
  musicBeforeSim = music.playing;
  music.pause();
  sim = new Sim({
    renderer, state, layout: mech.layout, custom: mech.custom, paint: { ...mech.paint }, perf,
    talk: (t) => talk(t),
    onExit: (score) => {
      sim = null;
      if (musicBeforeSim) music.play();
      // rebuild the garage mech fresh from its saved design, so nothing from the planet trip can stick to it
      mech.loadLayout(mech.layout);
      garage.rebuildChains(mech.lift.position.y + hullTop());
      resize();
      refreshUI();
      const bits = [];
      if (score.crystals) bits.push(`${score.crystals} crystal${score.crystals > 1 ? 's' : ''}`);
      if (score.zapped) bits.push(`${score.zapped} creature${score.zapped > 1 ? 's' : ''} zapped`);
      talk(`Welcome back to the garage, ${pilot()}! ${bits.length ? `You got ${bits.join(' and ')}.` : ''} Want to change anything before the next test?`);
    },
  });
  sim.resize();
  $('loading').classList.add('hidden');
}

async function openBlueprint() {
  if (mech.held) await putBack(false);
  blueprint.enter();
  await talk(mech.hull ? `Here's the blueprint for ${state.mechName || 'your mech'}, with real sizes and a shopping list. Measure your containers and type them in, then print the plan.` : 'The blueprint is empty. Put a cockpit on the stand first.');
}

async function status() {
  const s = mech.stats();
  if (!mech.hull) { await talk(`The stand is empty. Let's start with a cockpit. Say "bring me the cockpit".`); return; }
  const on = SLOT_ORDER.filter((x) => mech.partIn(x)).map(label);
  const missing = s.missing.map(label);
  let line = `So far it has: ${on.join(', ')}.`;
  if (missing.length) line += ` Still missing: ${missing.join(', ')}.`;
  line += ` Armour ${s.armor}, power ${s.power}, weight ${s.weight} tonnes.`;
  if (s.power < 0) line += ' Warning: not enough power. Add a power pack.';
  await talk(line);
}

function focusSlot(slot) {
  const p = slot ? mech.socketWorld(resolveSlot(slot))?.pos : null;
  camTween = { target: (p ?? HOME_CAM.target).clone(), dist: p ? 5.5 : null, t: 0 };
}
let camTween = null;

// ======================================================================
// understanding commands
// ======================================================================
async function handle(text, fromVoice = false) {
  text = text.trim();
  if (!text) return;
  addMsg('me', text);
  sfx.blip(true);
  if (sim) { if (!sim.voice(text)) sim.hud.toast('On the planet, try: jump, fire, walk forward, stop, lights, go back to the garage.'); return; }
  const acts = understand(text, state.robotName);
  if (blueprint.active && acts.some((a) => ['bring', 'remove', 'lock', 'scrap', 'buildAll', 'cycle', 'nudge', 'walk', 'spin'].includes(a.type))) blueprint.exit();
  for (const a of acts) await act(a, fromVoice);
}

function act(a) {
  switch (a.type) {
    case 'bring': return job(() => bring(a.slot, a.partId, a.attach));
    case 'lock': return job(lock);
    case 'cancel': return job(() => putBack(true));
    case 'remove': return job(() => takeOff(a.slot));
    case 'cycle': return job(() => cycle(a.dir));
    case 'nudge': return job(() => nudge(a.amount));
    case 'scrap': return job(scrap);
    case 'buildAll': return job(buildAll);
    case 'paint': return job(() => paint(a.target, a.color));
    case 'walk': return job(() => walkTest(a.on));
    case 'status': return job(status);
    case 'explode':
      mech.explodeTarget = a.on ? 1 : 0;
      refreshUI();
      return talk(a.on ? 'Exploded view. You can see how every part connects.' : 'Back together.');
    case 'spin':
      if (a.half) { mech.spin = 0; mech.turnTarget = mech.root.rotation.y + Math.PI; sfx.servo(1.8, 0.6); return talk('Turning it around.'); }
      mech.spin = 0.6 * a.dir;
      refreshUI();
      return talk('Spinning the turntable.');
    case 'stop':
      mech.spin = 0; mech.walking = false;
      refreshUI();
      return talk('Stopped.');
    case 'camera':
      if (a.slot) focusSlot(a.slot);
      else { const d = camera.position.distanceTo(controls.target); camTween = { target: controls.target.clone(), dist: THREE.MathUtils.clamp(d + a.zoom * 3, 4, 16), t: 0 }; }
      return;
    case 'lights':
      garage.lights.key.intensity = a.on ? 210 : 30;
      garage.lights.fill.intensity = a.on ? 22 : 3;
      return talk(a.on ? 'Lights on.' : 'Lights down. Ooh, look at it glow.');
    case 'renameRobot':
      state.robotName = a.name; save(); refreshUI();
      return talk(`${a.name}. I like it! That's my name now.`);
    case 'nameMech':
      state.mechName = a.name; save(); refreshUI();
      return talk(`The mech is now called ${a.name}. Great name!`);
    case 'namePilot':
      state.pilotName = a.name; save();
      return talk(`Nice to meet you, ${a.name}!`);
    case 'save': save(); return talk('Saved. Your mech is safe.');
    case 'blueprint': return job(openBlueprint);
    case 'closeBlueprint': blueprint.exit(); return talk('Back to the garage.');
    case 'print': if (!blueprint.active) blueprint.enter(); return blueprint.print();
    case 'launch': return job(launch);
    case 'music': return musicCommand(a.action);
    case 'customize': return customizeByVoice(a);
    case 'quit': openMenu(); return talk(`Leaving already, ${pilot()}? Press Exit game to quit, or keep building!`);
    case 'greet': return talk(say.greet(pilot()));
    case 'thanks': return talk(say.thanks(pilot()));
    case 'joke': return talk(say.joke());
    case 'whoami': return talk(`I'm ${state.robotName || 'your robot helper'}, your garage assistant. I fetch parts, hold them in place, and weld them on. Just tell me what you want.`);
    case 'help': return talk(say.help());
    default: return talk(say.unknown(pilot()));
  }
}

// ======================================================================
// UI
// ======================================================================
const $ = (id) => document.getElementById(id);
const logEl = $('log');

function addMsg(who, text) {
  const d = document.createElement('div');
  d.className = `msg ${who}`;
  const from = document.createElement('span');
  from.className = 'from';
  from.textContent = who === 'bot' ? (state.robotName || 'Robot') : (state.pilotName || 'You');
  d.append(from, document.createTextNode(text));
  logEl.append(d);
  while (logEl.children.length > 60) logEl.firstChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
}
function addMsgQuiet(text) { addMsg('bot', text); }

function setLed(mood) {
  $('robot-led').className = `led ${mood}`;
  $('robot-state').textContent = { idle: 'Ready', listening: 'Listening…', talking: 'Talking', working: 'Working', thinking: 'Thinking' }[mood] ?? 'Ready';
}
function setRobotState(mood) {
  if (!speaking && !listening) { robot.setMood(mood); setLed(mood); }
}

let activeTab = 'hull';
const TABS = [['hull', 'Cockpit'], ['arm', 'Arms'], ['leg', 'Legs'], ['head', 'Sensor'], ['back', 'Back'], ['shoulder', 'Shoulders']];
function slotsOfKind(kind) { return Object.keys(SLOTS).filter((s) => SLOTS[s].kind === kind); }

function renderTabs() {
  const el = $('slot-tabs');
  el.innerHTML = '';
  for (const [kind, name] of TABS) {
    const b = document.createElement('button');
    b.className = 'tab' + (activeTab === kind ? ' on' : '');
    b.textContent = name;
    if (slotsOfKind(kind).every((s) => mech.partIn(s))) { const dot = document.createElement('i'); dot.className = 'dot'; b.append(dot); }
    b.onclick = () => { activeTab = kind; sfx.blip(); renderTabs(); renderParts(); };
    el.append(b);
  }
}

function renderParts() {
  const el = $('part-list');
  el.innerHTML = '';
  const slots = slotsOfKind(activeTab);
  for (const p of PARTS.filter((x) => x.kind === activeTab)) {
    const card = document.createElement('div');
    card.className = 'part';
    const onSlots = slots.filter((s) => mech.partIn(s)?.id === p.id);
    const isHeld = mech.held?.part.id === p.id;
    if (onSlots.length) card.classList.add('on');
    if (isHeld) card.classList.add('held');
    const badge = isHeld ? 'Holding' : onSlots.length ? (slots.length > 1 ? onSlots.map((s) => (SLOTS[s].side > 0 ? 'L' : 'R')).join(' + ') + ' fitted' : 'Fitted') : '';
    const st = p.stats;
    card.innerHTML = `<span class="badge">${badge}</span><div class="name"></div><div class="desc"></div>
      <div class="stats"><span>ARM <b>${st.armor}</b></span><span>PWR <b>${st.power > 0 ? '+' : ''}${st.power}</b></span><span>WT <b>${st.weight}t</b></span></div>`;
    card.querySelector('.name').textContent = p.name + onSlots.map((sl) => mech.nickname(sl)).filter(Boolean).map((n) => ` “${n}”`).join('');
    card.querySelector('.desc').textContent = p.desc;
    makeDraggable(card, p);
    el.append(card);
  }
}

function renderReadout() {
  const s = mech.stats();
  const set = (k, v, max, text) => {
    $('v-' + k).textContent = text ?? v;
    const bar = $('b-' + k);
    bar.style.width = `${Math.max(0, Math.min(100, (Math.abs(v) / max) * 100))}%`;
    bar.classList.toggle('low', k === 'power' && v < 0);
  };
  set('armor', s.armor, 140);
  set('power', s.power, 120, `${s.power > 0 ? '+' : ''}${s.power}`);
  set('weight', s.weight, 32, `${s.weight} t`);
  set('speed', Math.max(0, s.speed + 3), 12, String(Math.max(0, s.speed + 3)));
  $('ready-text').textContent = s.complete ? (s.power >= 0 ? 'Ready for test' : 'Low power') : `${9 - s.missing.length} / 9 parts`;
  const cl = $('checklist');
  cl.innerHTML = '';
  for (const slot of SLOT_ORDER) {
    const sp = document.createElement('span');
    sp.textContent = SLOTS[slot].label;
    if (mech.partIn(slot)) sp.className = 'ok';
    cl.append(sp);
  }
}

function renderHoldbar() {
  const h = mech.held;
  $('holdbar').classList.toggle('hidden', !h || busy && !h);
  if (!h) return;
  $('hold-name').textContent = h.part.name;
  $('hold-slot').textContent = `for the ${label(h.slot)}`;
  const max = stageDist(h.slot) + 0.6;
  $('hold-fill').style.width = `${Math.max(2, (1 - h.dist / max) * 100)}%`;
}

function renderChips() {
  const el = $('chips');
  el.innerHTML = '';
  const list = mech.held
    ? ['move it in', 'move it out', 'lock it', 'another one', 'put it back']
    : !mech.hull ? ['bring me the cockpit', 'build it all', 'help']
    : ['what is missing', 'bring me the left arm', 'paint it red', 'test walk', 'spin it', 'tell me a joke'];
  for (const c of list) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = c;
    b.onclick = () => handle(c);
    el.append(b);
  }
}

function refreshUI() {
  const lc = launchCheck();
  $('btn-launch').classList.toggle('ready', lc.ok);
  if (blueprint.active) blueprint.refresh();
  $('robot-name').textContent = state.robotName || 'Robot';
  $('mech-name').textContent = state.mechName || 'Unnamed mech';
  $('btn-explode').classList.toggle('on', mech.explodeTarget > 0);
  $('btn-spin').classList.toggle('on', mech.spin !== 0);
  $('btn-walk').classList.toggle('on', mech.walking);
  renderTabs();
  renderParts();
  renderReadout();
  renderHoldbar();
  renderChips();
  renderPaint();
}

// ---------- paint drawer ----------
function renderPaint() {
  for (const row of document.querySelectorAll('#paint .swatches')) {
    const target = row.dataset.target;
    const table = target === 'glow' ? GLOW_COLORS : COLORS;
    if (!row.children.length) {
      const seen = new Set();
      for (const [name, hex] of Object.entries(table)) {
        if (seen.has(hex)) continue;
        seen.add(hex);
        const b = document.createElement('button');
        b.className = 'sw';
        b.style.background = hex;
        b.title = name;
        b.dataset.hex = hex;
        b.onclick = () => handle(`${target === 'glow' ? 'make the lights' : target === 'accent' ? 'paint the trim' : 'paint it'} ${name}`);
        row.append(b);
      }
    }
    for (const b of row.children) b.classList.toggle('on', b.dataset.hex.toLowerCase() === String(mech.paint[target]).toLowerCase());
  }
}

// ---------- buttons ----------
function toggleDrawer(id) {
  for (const d of ['paint', 'settings', 'custom']) if (d !== id) $(d).classList.add('hidden');
  $(id).classList.toggle('hidden');
}
$('btn-paint').onclick = () => { sfx.blip(); toggleDrawer('paint'); };
$('btn-settings').onclick = () => {
  sfx.blip();
  $('set-robot').value = state.robotName;
  $('set-pilot').value = state.pilotName;
  $('set-voice').checked = state.voiceOn;
  $('set-wake').checked = state.wakeWord;
  $('set-volume').value = state.volume;
  $('set-quality').value = state.graphics ?? 'auto';
  $('set-music').checked = state.musicOn;
  $('set-music-volume').value = music.volume;
  fillVoices();
  toggleDrawer('settings');
};
$('btn-explode').onclick = () => handle(mech.explodeTarget > 0 ? 'put it back together' : 'exploded view');
$('btn-spin').onclick = () => handle(mech.spin ? 'stop' : 'spin it');
$('btn-walk').onclick = () => handle(mech.walking ? 'power down' : 'test walk');
$('btn-build').onclick = () => handle('build it all');
$('btn-blueprint').onclick = () => handle('show me the blueprint');
$('btn-launch').onclick = () => handle('launch to the test planet');
$('bp-close').onclick = $('bp-done').onclick = () => { blueprint.exit(); refreshUI(); };
$('bp-print').onclick = () => blueprint.print();
$('bp-explode').onclick = () => { mech.explodeTarget = mech.explodeTarget > 0 ? 0 : 1; $('bp-explode').classList.toggle('on', mech.explodeTarget > 0); setTimeout(() => blueprint.frame(), 600); };
$('rename-mech').onclick = () => {
  const n = prompt('Name your mech', state.mechName);
  if (n?.trim()) handle(`call the mech ${n.trim()}`);
};
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => { const el = $(b.dataset.close); el.classList.add('hidden'); el.classList.remove('open'); if (b.dataset.close === 'parts' || b.dataset.close === 'chat') el.classList.remove('hidden'); };
for (const b of document.querySelectorAll('[data-open]')) b.onclick = () => {
  const id = b.dataset.open;
  for (const o of ['parts', 'chat']) if (o !== id) $(o).classList.remove('open');
  $(id).classList.toggle('open');
};
for (const b of document.querySelectorAll('[data-cmd]')) b.onclick = () => handle(b.dataset.cmd);
$('say').onsubmit = (e) => {
  e.preventDefault();
  const t = $('say-text').value;
  $('say-text').value = '';
  handle(t);
};
$('set-save').onclick = () => {
  const oldName = state.robotName;
  state.robotName = $('set-robot').value.trim() || state.robotName;
  state.pilotName = $('set-pilot').value.trim();
  state.voiceOn = $('set-voice').checked;
  state.wakeWord = $('set-wake').checked;
  state.volume = +$('set-volume').value;
  const q = $('set-quality').value;
  const reload = q !== (state.graphics ?? 'auto');
  state.graphics = q;
  sfx.setVolume(state.volume);
  voice.setMuted(!state.voiceOn);
  state.voiceId = $('set-voice-pick').value;
  voice.setVoice(state.voiceId);
  state.musicOn = $('set-music').checked;
  if (state.musicOn) startMusicIfWanted(); else music.pause();
  state.musicVolume = +$('set-music-volume').value;
  music.setVolume(state.musicVolume);
  save();
  toggleDrawer('settings');
  refreshUI();
  if (reload) location.reload();
  else if (oldName !== state.robotName) talk(`My new name is ${state.robotName}.`);
};
$('set-reset').onclick = () => {
  if (!confirm('Take every part off and start a new mech? Your robot keeps its name.')) return;
  toggleDrawer('settings');
  state.mechName = '';
  job(scrap);
};

// ---------- customising one part ----------
let customSlot = null;
function openCustom(slot) {
  if (!mech.partIn(slot)) return;
  customSlot = slot;
  for (const d of ['paint', 'settings']) $(d).classList.add('hidden');
  $('custom').classList.remove('hidden');
  if (compact()) $('chat').classList.remove('open');
  renderCustom();
  sfx.blip();
}
function renderCustom() {
  const slot = customSlot;
  if (!slot || !mech.partIn(slot)) { $('custom').classList.add('hidden'); return; }
  const c = mech.custom[slot] ?? {};
  const limb = SLOTS[slot].kind === 'arm' || SLOTS[slot].kind === 'leg';
  $('cu-title').textContent = `Customize: ${SLOTS[slot].label}`;
  $('cu-part').textContent = c.nickname ? `“${c.nickname}”` : mech.partIn(slot).name;
  $('cu-slot').textContent = c.nickname ? mech.partIn(slot).name : 'Make it your own';
  if (document.activeElement !== $('cu-nick')) $('cu-nick').value = c.nickname ?? '';
  if (document.activeElement !== $('cu-label')) $('cu-label').value = c.label ?? '';
  $('cu-size-row').classList.toggle('hidden', slot === 'hull');
  $('cu-length-row').classList.toggle('hidden', !limb);
  $('cu-size').value = c.scale ?? 1;
  $('cu-length').value = c.length ?? 1;
  $('cu-size-v').textContent = `${Math.round((c.scale ?? 1) * 100)}%`;
  $('cu-length-v').textContent = `${Math.round((c.length ?? 1) * 100)}%`;
  for (const [target, el] of [['primary', $('cu-primary')], ['accent', $('cu-accent')]]) {
    if (!el.children.length) {
      const same = document.createElement('button');
      same.className = 'sw same';
      same.title = 'Same as the mech';
      same.dataset.hex = '';
      same.onclick = () => customizeSlot(customSlot, { [target]: null });
      el.append(same);
      const seen = new Set();
      for (const [name, hex] of Object.entries(COLORS)) {
        if (seen.has(hex)) continue;
        seen.add(hex);
        const b = document.createElement('button');
        b.className = 'sw';
        b.style.background = hex;
        b.title = name;
        b.dataset.hex = hex;
        b.onclick = () => customizeSlot(customSlot, { [target]: hex });
        el.append(b);
      }
    }
    for (const b of el.children) b.classList.toggle('on', (b.dataset.hex || null) === (c[target] ?? null));
  }
}
function customizeSlot(slot, patch, { quiet = true } = {}) {
  mech.customize(slot, patch);
  sfx.servo(0.25, 1.2);
  save();
  refreshUI();
  renderCustom();
}
$('cu-nick').onchange = (e) => customizeSlot(customSlot, { nickname: e.target.value.trim().slice(0, 20) || null });
$('cu-label').onchange = (e) => customizeSlot(customSlot, { label: e.target.value.trim().toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 8) || null });
$('cu-size').oninput = (e) => customizeSlot(customSlot, { scale: +e.target.value });
$('cu-length').oninput = (e) => customizeSlot(customSlot, { length: +e.target.value });
$('cu-reset').onclick = () => {
  const keep = mech.custom[customSlot]?.nickname;
  mech.custom[customSlot] = keep ? { nickname: keep } : {};
  customizeSlot(customSlot, {});
};
$('cu-done').onclick = () => $('custom').classList.add('hidden');

/** Voice: "make the left arm bigger", "paint the legs red", "call the left arm Big Bertha", "write TITAN on the cockpit". */
async function customizeByVoice(a) {
  const slots = a.slots.map(resolveFitted).filter(Boolean);
  if (!slots.length) return talk(`There's no ${a.slots.map((s) => label(s.replace('?', ''))).join(' or ')} fitted yet.`);
  if (a.patch.label === '@pilot') a.patch.label = (state.pilotName || 'PILOT').toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 8);
  for (const slot of slots) {
    const c = mech.custom[slot] ?? {};
    const patch = { ...a.patch };
    if (a.grow) patch.scale = (c.scale ?? 1) + a.grow;
    if (a.stretch) patch.length = (c.length ?? 1) + a.stretch;
    if (slot === 'hull') delete patch.scale;
    customizeSlot(slot, patch);
  }
  const what = slots.map(label).join(' and ');
  if (a.patch.nickname) return talk(`The ${what} is now called ${a.patch.nickname}!`);
  if (a.patch.label) return talk(`Stencilled ${a.patch.label} on the ${what}.`);
  if (a.patch.primary) return talk(`Painted the ${what} ${a.colorName}.`);
  if (a.grow) return talk(a.grow > 0 ? `Made the ${what} bigger.` : `Made the ${what} smaller.`);
  if (a.stretch) return talk(a.stretch > 0 ? `Made the ${what} longer.` : `Made the ${what} shorter.`);
}
/** "arm?" means whichever arm is fitted (left first). */
function resolveFitted(slot) {
  if (!slot.endsWith('?')) return mech.partIn(slot) ? slot : null;
  const base = slot.slice(0, -1);
  return mech.partIn(base + 'L') ? base + 'L' : mech.partIn(base + 'R') ? base + 'R' : null;
}

// ---------- voice picker ----------
function fillVoices() {
  const sel = $('set-voice-pick');
  const list = voice.voices();
  const current = state.voiceId || voice.currentVoiceId();
  sel.innerHTML = '';
  const auto = new Option('Best available', '');
  sel.append(auto);
  if (voice.platform !== 'browser') sel.append(new Option(voice.platform === 'android' ? 'Phone voice (automatic)' : 'Windows voice (automatic)', 'app:'));
  for (const v of list) sel.append(new Option(`${v.name}${v.natural ? ' ★' : ''}${v.online ? ' (needs internet)' : ''}`, v.id));
  sel.value = state.voiceId && [...sel.options].some((o) => o.value === state.voiceId) ? state.voiceId : '';
  sel.title = `Now using: ${list.find((v) => v.id === current)?.name ?? 'the app voice'}`;
}
voice.onVoice((m) => { if (m.type === 'voicesChanged' && !$('settings').classList.contains('hidden')) fillVoices(); });
$('set-voice-test').onclick = () => {
  voice.setVoice($('set-voice-pick').value);
  voice.speak(`Hi ${pilot()}! This is how I sound. Ready to build?`);
};
voice.setVoice(state.voiceId);

// ---------- boombox ----------
function renderBoombox() {
  $('bb-track').textContent = `${music.playing ? '♪' : '❚❚'} ${music.track.name}`;
  $('bb-play').textContent = music.playing ? '❚❚' : '▶';
  $('bb-volume').value = music.volume;
}
function openBoombox(x, y) {
  const b = $('boombox');
  renderBoombox();
  b.classList.remove('hidden');
  b.style.left = `${Math.min(Math.max(8, x - 130), innerWidth - 270)}px`;
  b.style.top = `${Math.max(90, Math.min(y - 230, innerHeight - 250))}px`;
  sfx.blip();
}
$('bb-close').onclick = () => $('boombox').classList.add('hidden');
$('bb-play').onclick = () => { sfx.unlock(); state.musicOn = !music.playing; music.toggle(); save(); };
$('bb-next').onclick = () => { sfx.unlock(); if (!music.playing) music.play(); music.next(1); save(); };
$('bb-prev').onclick = () => { sfx.unlock(); if (!music.playing) music.play(); music.next(-1); save(); };
$('bb-volume').oninput = (e) => { music.setVolume(+e.target.value); state.musicVolume = music.volume; };
$('bb-volume').onchange = () => save();

async function musicCommand(action) {
  sfx.unlock();
  if (action === 'play') {
    state.musicOn = true;
    if (!music.play()) return talk('Tap anywhere first, then ask me again.');
    save();
    return talk(`Here's ${music.track.name}.`);
  }
  if (action === 'stop') { state.musicOn = false; music.pause(); save(); return talk('Music off.'); }
  if (action === 'next' || action === 'prev') {
    if (!music.playing) music.play();
    music.next(action === 'next' ? 1 : -1);
    save();
    return talk(`Next up: ${music.track.name}.`);
  }
  if (action === 'up' || action === 'down') {
    if (!music.playing) { state.musicOn = true; music.play(); }
    music.setVolume(music.volume + (action === 'up' ? 0.15 : -0.15));
    state.musicVolume = music.volume;
    save();
    return talk(action === 'up' ? 'Turning it up!' : 'Turning it down.');
  }
  if (action === 'what') return talk(music.playing ? `This is ${music.track.name}. All my own music, by the way.` : 'Nothing is playing. Say "play some jazz".');
}

// ---------- pause menu and the app window ----------
function openMenu() {
  $('menu').classList.remove('hidden');
  $('menu-quit').classList.toggle('hidden', !voice.canQuit);
  $('menu-minimize').classList.toggle('hidden', voice.platform !== 'windows');
  $('menu-window').classList.toggle('hidden', voice.platform !== 'windows');
  $('menu-resume').focus();
  sfx.blip();
}
function closeMenu() { $('menu').classList.add('hidden'); }
$('btn-menu').onclick = openMenu;
$('menu-resume').onclick = closeMenu;
$('menu-quit').onclick = () => { save(); voice.stopSpeaking(); music.pause(); setTimeout(voice.quit, 150); };
$('menu-minimize').onclick = () => { closeMenu(); voice.minimize(); };
$('menu-window').onclick = () => { closeMenu(); voice.toggleFullscreen(); };
addEventListener('keydown', (e) => {
  if (e.key === 'F11') { e.preventDefault(); voice.toggleFullscreen(); return; }
  if (e.key !== 'Escape' || sim) return;
  if (!$('menu').classList.contains('hidden')) return closeMenu();
  // Esc closes whatever is open first, then opens the pause menu
  for (const id of ['boombox', 'partmenu', 'paint', 'settings', 'custom']) {
    if (!$(id).classList.contains('hidden')) { $(id).classList.add('hidden'); return; }
  }
  if (blueprint.active) { blueprint.exit(); refreshUI(); return; }
  openMenu();
});
// the first tap or click anywhere allows sound, and starts the boombox
addEventListener('pointerdown', () => { sfx.unlock(); setTimeout(startMusicIfWanted, 50); }, { capture: true });

// ======================================================================
// voice
// ======================================================================
let listening = false;
const mic = $('mic');
voice.setMuted(!state.voiceOn);
function startListening() {
  sfx.unlock();
  if (!voice.canListen) { toast('Talking isn’t available here. Type to your helper instead.'); return; }
  voice.listen(listenPhrases());
}
mic.onclick = () => { sfx.blip(true); if (listening) voice.stopListening(); else startListening(); };
voice.onVoice((m) => {
  if (m.type === 'listening') {
    listening = m.on;
    mic.classList.toggle('on', m.on);
    if (m.on) { robot.setMood('listening'); setLed('listening'); }
    else { setRobotState(busy ? 'working' : 'idle'); setTimeout(() => $('heard').classList.add('hidden'), 1200); }
  } else if (m.type === 'heard') {
    const h = $('heard');
    h.textContent = m.text;
    h.classList.remove('hidden');
    if (m.final) {
      if (state.wakeWord && state.robotName && !m.text.toLowerCase().includes(state.robotName.toLowerCase())) return;
      handle(m.text, true);
    }
  } else if (m.type === 'voiceError') {
    toast(m.message);
  } else if (m.type === 'level') {
    robot.talkLevel = m.value;
  }
});
// helps the Windows recogniser: the phrases it should expect
function listenPhrases() {
  const n = state.robotName ? [state.robotName] : [];
  const parts = PARTS.map((p) => p.name.toLowerCase());
  const slots = ['cockpit', 'left arm', 'right arm', 'left leg', 'right leg', 'sensor', 'back pack', 'left shoulder', 'right shoulder', 'arms', 'legs'];
  return { names: n, parts, slots, colors: [...Object.keys(COLORS), ...Object.keys(GLOW_COLORS)] };
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

// ======================================================================
// keyboard: W A S D (or the arrow keys) move the camera around the garage, Q and E turn it
// ======================================================================
const camKeys = new Set();
addEventListener('keydown', (e) => {
  if (sim || e.target.closest?.('input, textarea, select') || e.ctrlKey || e.altKey || e.metaKey) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    camKeys.add(k);
    camTween = null;
    e.preventDefault();
  }
});
addEventListener('keyup', (e) => camKeys.delete(e.key.toLowerCase()));
addEventListener('blur', () => camKeys.clear());
function moveCamera(dt) {
  if (!camKeys.size || (blueprint.active && blueprint.view !== '3d')) return;
  const k = (...names) => names.some((n) => camKeys.has(n));
  const fwd = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0).normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const move = new THREE.Vector3()
    .addScaledVector(fwd, (k('w', 'arrowup') ? 1 : 0) - (k('s', 'arrowdown') ? 1 : 0))
    .addScaledVector(right, (k('d', 'arrowright') ? 1 : 0) - (k('a', 'arrowleft') ? 1 : 0));
  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(7 * dt);
    // keep the view inside the garage
    const t = controls.target.clone().add(move);
    t.x = THREE.MathUtils.clamp(t.x, -12, 12);
    t.z = THREE.MathUtils.clamp(t.z, -9, 9);
    move.subVectors(t, controls.target);
    controls.target.add(move);
    camera.position.add(move);
  }
  const turn = (k('q') ? 1 : 0) - (k('e') ? 1 : 0);
  if (turn) {
    const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * 1.4 * dt);
    camera.position.copy(controls.target).add(off);
  }
}

// ======================================================================
// pointer: tap fitted parts, drag the held part in/out, drag cards onto the mech
// ======================================================================
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(mech.pickables(), false)[0];
  return hit ?? null;
}
function screenOf(v) {
  const p = v.clone().project(camera);
  return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  $('partmenu').classList.add('hidden');
  $('boombox').classList.add('hidden');
  const hit = pick(e.clientX, e.clientY);
  if (hit && mech.held && hit.object.userData.slot === mech.held.slot && isInHeld(hit.object) && !busy) {
    // drag the held part along its in/out line
    const s = mech.socketWorld(mech.held.slot);
    const a = screenOf(s.pos), b = screenOf(s.pos.clone().add(s.out));
    const dir = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(dir.x, dir.y) || 1;
    drag = { kind: 'held', x: e.clientX, y: e.clientY, dir: { x: dir.x / len, y: dir.y / len }, pxPerM: len, start: mech.held.dist };
    controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  drag = { kind: 'tap', x: e.clientX, y: e.clientY, hit, t: performance.now() };
});
canvas.addEventListener('pointermove', (e) => {
  if (drag?.kind !== 'held' || !mech.held) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  const along = (dx * drag.dir.x + dy * drag.dir.y) / drag.pxPerM;
  mech.held.dist = THREE.MathUtils.clamp(drag.start + along, 0.05, 3.2);
  renderHoldbar();
});
canvas.addEventListener('pointerup', (e) => {
  const d = drag;
  drag = null;
  controls.enabled = true;
  if (!d) return;
  if (d.kind === 'held') {
    if (mech.held && mech.held.dist <= SEAT_DIST + 0.01) handle('lock it');
    else sfx.servo(0.3);
    return;
  }
  const tapped = Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8 && performance.now() - d.t < 500;
  // a tap on the boombox opens its controls
  if (tapped && !blueprint.active) {
    ray.setFromCamera(ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
    const bb = ray.intersectObjects(boombox.pickables(), false)[0];
    if (bb && (!d.hit || bb.distance < d.hit.distance)) { openBoombox(e.clientX, e.clientY); return; }
  }
  // a tap (not an orbit drag) on a fitted part opens its menu
  if (tapped && d.hit) {
    const slot = d.hit.object.userData.slot;
    if (!slot || (mech.held && isInHeld(d.hit.object))) return;
    openPartMenu(slot, e.clientX, e.clientY);
  }
});
function isInHeld(obj) {
  for (let o = obj; o; o = o.parent) if (o === mech.held?.group) return true;
  return false;
}
function openPartMenu(slot, x, y) {
  const part = mech.partIn(slot);
  if (!part) return;
  const m = $('partmenu');
  $('pm-name').textContent = mech.nickname(slot) ? `“${mech.nickname(slot)}” · ${part.name}` : part.name;
  $('pm-slot').textContent = SLOTS[slot].label;
  m.style.left = `${Math.min(x + 12, innerWidth - 200)}px`;
  m.style.top = `${Math.min(y + 12, innerHeight - 110)}px`;
  m.classList.remove('hidden');
  $('pm-custom').onclick = () => { m.classList.add('hidden'); openCustom(slot); };
  $('pm-swap').onclick = () => { m.classList.add('hidden'); lastSlot = slot; activeTab = SLOTS[slot].kind; refreshUI(); act({ type: 'bring', slot, partId: null, attach: false }); };
  $('pm-remove').onclick = () => { m.classList.add('hidden'); addMsg('me', `Take off the ${label(slot)}`); act({ type: 'remove', slot }); };
  sfx.blip();
}

// part cards: tap = bring it, drag = drop it on the mech where it should go
function makeDraggable(card, part) {
  card.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    const start = { x: e.clientX, y: e.clientY };
    let dragging = false;
    const ghost = $('drag-ghost');
    const move = (ev) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 10) {
        dragging = true;
        ghost.textContent = part.name;
        ghost.classList.remove('hidden');
        if (compact()) $('parts').classList.remove('open');
      }
      if (dragging) { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; }
    };
    const up = (ev) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      ghost.classList.add('hidden');
      if (!dragging) {
        // tap: bring it for the first matching empty slot
        const slot = slotsOfKind(part.kind).length > 1 ? `${part.kind}?` : part.kind;
        addMsg('me', `Bring me the ${part.name}`);
        act({ type: 'bring', slot, partId: part.id, attach: false });
        return;
      }
      const overUI = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.panel, .holdbar, #topbar');
      if (overUI) return;
      // dropped on the 3D view: the nearest socket of the right kind gets it, and it goes straight on
      const slots = slotsOfKind(part.kind);
      let best = slots[0], bestD = Infinity;
      for (const s of slots) {
        const w = mech.socketWorld(s);
        const p = w ? screenOf(w.pos) : { x: innerWidth / 2, y: innerHeight / 2 };
        const d = Math.hypot(p.x - ev.clientX, p.y - ev.clientY);
        if (d < bestD) { best = s; bestD = d; }
      }
      addMsg('me', `Put the ${part.name} on the ${label(best)}`);
      act({ type: 'bring', slot: best, partId: part.id, attach: true });
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });
}

// ======================================================================
// holo table and desk screens
// ======================================================================
function showHolo(group) {
  garage.holoStage.clear();
  garage.holoStage.add(hologram(group));
}

const t0 = performance.now();
let screenTimer = 0;
function drawScreens(t) {
  const [s0, s1, s2, s3] = garage.screens;
  const st = mech.stats();
  const frame = (sc, title) => {
    const { ctx: c, canvas: cv } = sc;
    c.clearRect(0, 0, cv.width, cv.height);
    c.fillStyle = 'rgba(20,80,120,0.25)';
    c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = 'rgba(92,207,255,0.8)';
    c.lineWidth = 3;
    c.strokeRect(2, 2, cv.width - 4, cv.height - 4);
    c.fillStyle = '#9fe6ff';
    c.font = 'bold 22px Consolas, monospace';
    c.fillText(title, 16, 32);
    c.fillStyle = 'rgba(92,207,255,0.5)';
    c.fillRect(16, 42, cv.width - 32, 2);
    return c;
  };
  // 0: build checklist
  let c = frame(s0, `${(state.mechName || 'MECH').toUpperCase()} // BUILD`);
  c.font = '20px Consolas, monospace';
  SLOT_ORDER.forEach((slot, i) => {
    const p = mech.partIn(slot);
    c.fillStyle = p ? '#7dffb5' : 'rgba(160,200,220,0.6)';
    c.fillText(`${p ? '■' : '□'} ${SLOTS[slot].label.toUpperCase().padEnd(15)} ${p ? p.name.toUpperCase().slice(0, 18) : '---'}`, 16, 74 + i * 25);
  });
  s0.update();
  // 1: robot status + voice wave
  c = frame(s1, `${(state.robotName || 'ROBOT').toUpperCase()} // LINK`);
  c.strokeStyle = speaking ? '#ffb05c' : listening ? '#7dffb5' : '#5ccfff';
  c.lineWidth = 3;
  c.beginPath();
  for (let x = 0; x < s1.canvas.width - 32; x += 4) {
    const amp = speaking || listening ? 40 : 6;
    const y = 170 + Math.sin(x * 0.05 + t * 9) * amp * Math.sin(x * 0.011 + t * 2) ;
    if (x === 0) c.moveTo(16 + x, y); else c.lineTo(16 + x, y);
  }
  c.stroke();
  c.fillStyle = '#9fe6ff';
  c.font = '20px Consolas, monospace';
  c.fillText(speaking ? 'TRANSMITTING' : listening ? 'LISTENING' : busy ? 'WORKING' : 'STANDING BY', 16, 80);
  s1.update();
  // 2: held part
  c = frame(s2, 'MANIPULATOR');
  c.font = '20px Consolas, monospace';
  c.fillStyle = '#9fe6ff';
  if (mech.held) {
    c.fillText(mech.held.part.name.toUpperCase(), 16, 80);
    c.fillText(`TO: ${SLOTS[mech.held.slot].label.toUpperCase()}`, 16, 108);
    c.fillText(`GAP: ${mech.held.dist.toFixed(2)} M`, 16, 136);
    c.fillStyle = mech.heldReady ? '#7dffb5' : '#ffd23a';
    c.fillText(mech.heldReady ? 'READY TO LOCK' : 'ALIGNING…', 16, 170);
  } else c.fillText('GRIPPER EMPTY', 16, 80);
  s2.update();
  // 3: stats
  c = frame(s3, 'SYSTEMS');
  const rows = [['ARMOR', st.armor, 140], ['POWER', st.power, 120], ['WEIGHT', st.weight, 32], ['SPEED', st.speed + 3, 12]];
  c.font = '20px Consolas, monospace';
  rows.forEach(([n, v, max], i) => {
    const y = 80 + i * 44;
    c.fillStyle = '#9fe6ff';
    c.fillText(`${n.padEnd(7)} ${String(v).padStart(5)}`, 16, y);
    c.fillStyle = 'rgba(92,207,255,0.25)';
    c.fillRect(220, y - 14, 260, 12);
    c.fillStyle = n === 'POWER' && v < 0 ? '#ff6b5c' : '#e2a03f';
    c.fillRect(220, y - 14, 260 * Math.max(0, Math.min(1, Math.abs(v) / max)), 12);
  });
  s3.update();
}

// ======================================================================
// main loop
// ======================================================================
let last = performance.now();
let stepPhase = 0;
function frame(now) {
  perf.tick((now - last) / 1000);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = (now - t0) / 1000;
  if (sim) {
    sim.update(dt);
    if (sim) sim.render();
    requestAnimationFrame(frame);
    return;
  }
  if (blueprint.active) {
    moveCamera(dt);
    mech.update(t, dt);
    controls.update();
    blueprint.render();
    requestAnimationFrame(frame);
    return;
  }

  // the robot keeps hold of a part while it's being fitted
  if (mech.held && !queue.length && (!busy || robot.holding === null)) {
    robot.setMood(speaking ? 'talking' : listening ? 'listening' : 'working');
    robot.target.lerp(mech.held.group.getWorldPosition(new THREE.Vector3()), Math.min(1, dt * 6));
  } else if (!busy && !mech.held) {
    robot.lookAt = camera.position;
  }

  mech.update(t, dt);
  robot.update(t, dt);
  garage.update(t, dt);
  sparks.update(dt);

  // footsteps in the walk test
  if (mech.walking) {
    const ph = Math.floor(mech.walkT / Math.PI);
    if (ph !== stepPhase) { stepPhase = ph; sfx.clank(0.9); }
  }

  moveCamera(dt);
  boombox.update(t, dt, music.meter(), music.track.name, music.playing);
  // camera glide
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt * 1.5);
    controls.target.lerp(camTween.target, camTween.t * 0.2);
    if (camTween.dist) {
      const off = camera.position.clone().sub(controls.target);
      off.setLength(THREE.MathUtils.lerp(off.length(), camTween.dist, camTween.t * 0.2));
      camera.position.copy(controls.target).add(off);
    }
    if (camTween.t >= 1) camTween = null;
  }
  controls.update();

  screenTimer -= dt;
  if (screenTimer <= 0) { screenTimer = 1 / perf.opts.screensHz; drawScreens(t); }
  if (mech.held) renderHoldbar();

  if (perf.opts.bloom) composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ======================================================================
// start
// ======================================================================
function start() {
  if (state.layout && Object.keys(state.layout).length) {
    mech.custom = structuredClone(state.custom ?? {});
    mech.loadLayout(state.layout);
    wasStanding = mech.standing;
    if (mech.hull) showHolo(mech.hull.group);
  }
  garage.rebuildChains(mech.lift.position.y + hullTop());
  sfx.setVolume(state.volume);
  refreshUI();
  requestAnimationFrame(frame);
  $('loading').classList.add('hidden');
  if (!state.robotName) {
    $('setup').classList.remove('hidden');
    $('setup-robot').focus();
  } else {
    setTimeout(() => talk(mech.hull ? `Welcome back, ${pilot()}. ${state.mechName || 'Your mech'} is right where you left it.` : say.greet(pilot())), 600);
  }
}
$('setup-form').onsubmit = (e) => {
  e.preventDefault();
  sfx.unlock();
  state.robotName = $('setup-robot').value.trim().slice(0, 20);
  state.pilotName = $('setup-pilot').value.trim().slice(0, 20);
  state.mechName = $('setup-mech').value.trim().slice(0, 24);
  save();
  $('setup').classList.add('hidden');
  refreshUI();
  sfx.powerUp();
  robot.setMood('talking');
  setTimeout(async () => {
    await talk(`${state.robotName}, online! Hi ${pilot()}. I'm your garage helper. Tell me what to bring, and I'll hold each part while you line it up. Let's start with the cockpit.`, { wait: true });
    activeTab = 'hull';
    refreshUI();
  }, 1200);
};

// debugging and tests can reach the game from the console
window.garage = { state, mech, robot, handle, understand, blueprint, music, boombox, openCustom, perf, get sim() { return sim; } };

start();
