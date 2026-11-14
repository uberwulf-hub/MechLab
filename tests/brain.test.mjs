// Run with: node --test tests/brain.test.mjs  (from games/MechGarage). Checks the robot understands everyday commands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === 'three') return next(new URL('../web/vendor/three/three.module.js', ${JSON.stringify(import.meta.url)}).href, ctx);
    if (spec.startsWith('three/addons/')) return next(new URL('../web/vendor/three/addons/' + spec.slice(13), ${JSON.stringify(import.meta.url)}).href, ctx);
    return next(spec, ctx);
  }`));
const { understand } = await import('../web/js/brain.js');
const first = (t) => understand(t, 'Rivet')[0];

test('bringing parts', () => {
  assert.deepEqual(first('Rivet, bring me the left arm'), { type: 'bring', slot: 'armL', partId: null, attach: false });
  assert.deepEqual(first('put the crusher fist on the right arm'), { type: 'bring', slot: 'armR', partId: 'arm-crusher', attach: true });
  assert.equal(first('I want the jump jets').partId, 'back-jets');
  assert.equal(first('show me the hauler cockpit').partId, 'hull-hauler');
  assert.equal(understand('give it tank treads', 'Rivet')[0].partId, 'leg-tread');
});
test('holding and fitting', () => {
  assert.equal(first('move it in').type, 'nudge');
  assert.ok(first('move it in').amount < 0);
  assert.ok(first('move it out').amount > 0);
  for (const t of ['lock it', 'attach it', 'yes']) assert.equal(first(t).type, 'lock');
  assert.equal(first('another one').type, 'cycle');
  assert.equal(first('put it back').type, 'cancel');
  assert.deepEqual(understand('remove the legs', 'Rivet').map((a) => a.slot), ['legL', 'legR']);
});
test('paint, names and talk', () => {
  assert.deepEqual(first('make the eyes green'), { type: 'paint', target: 'glow', color: 'green' });
  assert.deepEqual(first('paint the trim black'), { type: 'paint', target: 'accent', color: 'black' });
  assert.deepEqual(first('your name is Bolt'), { type: 'renameRobot', name: 'Bolt' });
  assert.deepEqual(first('call the mech Ironclad'), { type: 'nameMech', name: 'Ironclad' });
  assert.equal(first('hello rivet').type, 'greet'); // the robot's name never picks a part
  assert.equal(first('blah blah').type, 'unknown');
});
test('blueprint and the test planet', () => {
  assert.equal(first('show me the blueprint').type, 'blueprint');
  assert.equal(first('what do I need for the real one').type, 'blueprint');
  assert.equal(first('print the plan').type, 'print');
  assert.equal(first('launch it to the planet').type, 'launch');
  assert.equal(first("let's go outside").type, 'launch');
  assert.equal(first('test walk').type, 'walk'); // still the garage walk test
  assert.equal(first('bring me the mega drill').partId, 'arm-drill');
  assert.equal(first('give it raptor legs').partId, 'leg-raptor');
});
test('the robot hears its name even when the speech engine spells it differently', () => {
  const u = (t) => understand(t, 'Sparky')[0];
  assert.deepEqual(u("ok sparky I'd like to put an arm on my robot"), { type: 'bring', slot: 'arm?', partId: null, attach: true });
  assert.equal(u('hey sparki bring me the left leg').slot, 'legL');
  assert.equal(u('sparkie paint it red').color, 'red');
  assert.equal(u('hello sparky').type, 'greet');
});

test('customising parts and the boombox by voice', () => {
  assert.deepEqual(first('make the left arm bigger'), { type: 'customize', slots: ['armL'], patch: {}, grow: 0.1, stretch: 0 });
  assert.deepEqual(first('paint the legs red').slots, ['legL', 'legR']);
  assert.equal(first('call the left arm big bertha').patch.nickname, 'Big Bertha');
  assert.equal(first('write titan on the cockpit').patch.label, 'TITAN');
  assert.equal(first('paint it red').type, 'paint'); // the whole mech
  assert.equal(first('make the eyes green').target, 'glow');
  assert.deepEqual(first('play some jazz'), { type: 'music', action: 'play' });
  assert.equal(first('next song').action, 'next');
  assert.equal(first('stop the music').action, 'stop');
  assert.equal(first('stop').type, 'stop');        // still stops the mech
  assert.equal(first('next one').type, 'cycle');   // still the next part
});
