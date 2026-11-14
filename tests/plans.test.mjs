// Run with: node --test tests/plans.test.mjs  (from the repo root). Checks blueprint plans and planet abilities.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
  const base = ${JSON.stringify(new URL('../web/vendor/three/', import.meta.url).href)};
  export async function resolve(spec, ctx, next) {
    if (spec === 'three') return next(base + 'three.module.js', ctx);
    if (spec.startsWith('three/addons/')) return next(base + 'addons/' + spec.slice('three/addons/'.length), ctx);
    return next(spec, ctx);
  }`));
const { PARTS } = await import('../web/js/parts.js');
const { REAL_PARTS, buildPlan, DEFAULT_REAL, scale, length } = await import('../web/js/realbuild.js');
const { abilities } = await import('../web/js/sim/sim.js');

const starter = { hull: 'hull-quad', legL: 'leg-container', legR: 'leg-container', armL: 'arm-gripper', armR: 'arm-gripper', head: 'head-visor', back: 'back-power', shoulderL: 'sh-light', shoulderR: 'sh-beacon' };
const qty = (plan, item) => plan.totals.find((t) => t.item === item)?.qty ?? 0;

test('every part has a real-world build', () => {
  for (const p of PARTS) assert.ok(REAL_PARTS[p.id], `${p.id} has no real build`);
});

test("the starter titan: 4 large containers for the cockpit, 2 small + 2 motors per limb", () => {
  const plan = buildPlan(starter);
  assert.equal(qty(plan, 'Large container'), 4);
  assert.equal(qty(plan, 'Small container'), 8);
  assert.equal(qty(plan, 'Motor'), 8);
  assert.equal(qty(plan, 'Motor controller (drives 2 motors)'), 4);
  assert.equal(plan.parts.length, 9);
  assert.ok(plan.steps.at(-1).startsWith('Test it'));
});

test('real sizes follow the containers', () => {
  assert.equal(Math.round(scale(DEFAULT_REAL)), 35);
  assert.equal(length(173), '1.73 m');
  assert.equal(length(173, 'in'), '5 ft 8 in');
});

test('parts set what the mech can do on the planet', () => {
  const a = abilities(starter);
  assert.equal(a.arms.L.weapon, 'punch');
  assert.equal(a.jets, false);
  assert.ok(a.light);
  const b = abilities({ ...starter, back: 'back-jets', armR: 'arm-cannon', legL: 'leg-piston', legR: 'leg-piston', shoulderR: 'sh-missile' });
  assert.ok(b.jets);
  assert.equal(b.arms.R.weapon, 'bolt');
  assert.equal(b.rockets, 4);
  assert.ok(b.jump > a.jump, 'hydraulic legs jump higher');
  const tank = abilities({ ...starter, hull: 'hull-tank', armL: 'arm-shield' });
  assert.ok(tank.maxHp > a.maxHp, 'more armour means more health');
  assert.ok(tank.shield > 0);
});
