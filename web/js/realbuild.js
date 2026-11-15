// Blueprint mode's "real build": what each game part means in real life, so the mech on screen becomes a
// parts list and build plan for the real titan (plastic storage containers, motors and craft supplies).
// Pure data and maths, no 3D, so it can be tested on its own.

export const DEFAULT_REAL = {
  units: 'cm',
  large: { l: 60, w: 40, h: 35 },   // a big storage tote
  small: { l: 40, w: 30, h: 25 },   // a small storage tote
  motor: '12 V DC gear motor (high torque)',
  notes: '',
};

// The cockpit's large container in the game is 1.7 m long; the real one sets the scale for everything.
const GAME_LARGE_LENGTH = 1.7;

const L = (qty, note = '') => ({ item: 'Large container', qty, note, group: 'Containers' });
const S = (qty, note = '') => ({ item: 'Small container', qty, note, group: 'Containers' });
const M = (qty) => ({ item: 'Motor', qty, note: '', group: 'Motors' });
const X = (item, qty, group = 'Craft parts', note = '') => ({ item, qty, note, group });

/** Real materials for each part, and how to build it. */
export const REAL_PARTS = {
  'hull-quad': { mats: [L(4), X('Clear plastic sheet (window)', 1), X('Zip ties', 40, 'Hardware')], how: 'Put 4 large containers in a 2 by 2 block and join them with zip ties through drilled holes. A grown-up cuts a window opening across the top two, and you cover it with the clear sheet.' },
  'hull-six': { mats: [L(6), X('Clear plastic sheet (window)', 1), X('Zip ties', 60, 'Hardware')], how: 'Make a 3 wide by 2 high block of 6 large containers, zip tied together. Cut the window in the middle top container.' },
  'hull-hauler': { mats: [L(2), X('Cardboard (nose panel)', 1), X('Clear plastic sheet (window)', 1), X('Zip ties', 30, 'Hardware')], how: 'Stack 2 large containers. Add a sloped cardboard nose on the front and a wide window.' },
  'hull-scout': { mats: [L(2), X('Clear plastic sheet (window)', 1), X('Zip ties', 25, 'Hardware')], how: 'Stand 2 large containers on their ends, side by side, for a tall narrow body. Cut a small window.' },
  'hull-tank': { mats: [L(3), X('Cardboard sheets (sloped armour)', 4), X('Zip ties', 40, 'Hardware')], how: 'Lay 2 large containers side by side and put the third on top, set back. Tape cardboard sheets on the sides at an angle like tank armour.' },
  'hull-bubble': { mats: [L(2), X('Clear plastic bowl (bubble)', 1), X('Zip ties', 30, 'Hardware')], how: 'Stack 2 large containers. A grown-up cuts a round hole in the front and you fit the clear bowl over it.' },

  'head-visor': { mats: [X('LED strip light (blue)', 1, 'Lights'), X('Black tape', 1)], how: 'No head on top: stick a strip of LED light across the front of the body, with black tape around it for the visor.' },
  'head-dome': { mats: [X('Plastic bowl', 1), X('LED puck light', 1, 'Lights')], how: 'Glue a puck light inside a bowl and fix it to the front of the body.' },
  'head-twin': { mats: [X('Plastic cups or tubes', 2), X('LED puck light', 2, 'Lights')], how: 'Two cups with a light in each, side by side on the front.' },
  'head-spider': { mats: [X('Bottle caps', 8), X('Small LED lights', 8, 'Lights')], how: 'Eight bottle caps with tiny LEDs in them, in a cluster on the front.' },
  'head-search': { mats: [X('LED flashlight', 1, 'Lights'), X('Tin can', 1)], how: 'Put a flashlight inside a tin can and fix it to the front.' },
  'head-radar': { mats: [X('LED strip light', 1, 'Lights'), X('Wooden strip', 1)], how: 'A wooden strip across the front with LED lights along it.' },

  'arm-gripper': { mats: [S(2), M(2), X('Wooden strips (fingers)', 3)], how: 'Two small containers end to end, with a motor at the shoulder and one at the elbow. Three wooden strips at the end make the gripper fingers.' },
  'arm-crusher': { mats: [S(2), M(2), X('Small box (fist)', 1)], how: 'Two small containers and two motors, with a small sturdy box on the end for the fist.' },
  'arm-cannon': { mats: [S(2), M(2), X('Cardboard tube (barrel)', 1), X('LED puck light', 1, 'Lights')], how: 'Two small containers and two motors, with a cardboard tube barrel and a light at the tip.' },
  'arm-cutter': { mats: [S(2), M(2), X('Cardboard disc (pretend saw)', 1)], how: 'Two small containers and two motors. The saw is a painted cardboard disc: never a real blade.' },
  'arm-drill': { mats: [S(2), M(2), X('Party hat or cardboard cone', 1)], how: 'Two small containers and two motors, with a cardboard cone drill that the elbow motor can spin.' },
  'arm-shield': { mats: [S(2), M(2), X('Plastic lid or board (shield)', 1)], how: 'Two small containers and two motors, with a big lid fixed on the side as a shield.' },
  'arm-pincer': { mats: [S(2), M(2), X('Cardboard (pincers)', 2)], how: 'Two small containers and two motors, with two cardboard pincers at the end.' },
  'arm-plasma': { mats: [S(2), M(2), X('Cardboard tubes', 2), X('LED strip light', 1, 'Lights')], how: 'Two small containers and two motors, with two tubes wrapped in LED lights.' },

  'leg-container': { mats: [S(2), M(2), X('Plywood (foot plate)', 1)], how: 'Two small containers end to end, a motor at the hip and one at the knee, and a flat plywood foot.' },
  'leg-piston': { mats: [S(2), M(2), X('Plywood (foot plate)', 1), X('Pool noodles or PVC pipe (pistons)', 4)], how: 'Like the container leg, with pool noodle pistons on the sides.' },
  'leg-tread': { mats: [S(2), M(2), X('Wheels', 4, 'Wheels'), X('Rubber strip or belt (track)', 1)], how: 'Two small containers and two motors, with 4 wheels and a rubber belt for a track at the bottom.' },
  'leg-raptor': { mats: [S(2), M(2), X('Wooden strips (toes)', 4)], how: 'Two small containers with the knee bending backwards, and wooden toes.' },
  'leg-wheel': { mats: [S(2), M(2), X('Wheels', 1, 'Wheels')], how: 'Two small containers and two motors, with one big wheel at the bottom.' },
  'leg-stilt': { mats: [S(1), M(2), X('PVC pipe (shin)', 1), X('Plywood (foot plate)', 1)], how: 'One small container for the thigh and a long pipe for the shin.' },

  'back-power': { mats: [X('Plastic bottles (pretend cells)', 3), X('Battery pack (grown-up sets up)', 1, 'Electronics')], how: 'The real battery goes in a box on the back. Three bottles on top look like power cells.' },
  'back-jets': { mats: [X('Plastic bottles (jets)', 2), X('Red or orange LED light', 2, 'Lights')], how: 'Two bottles upside down with orange lights in the bottom for thruster flames.' },
  'back-radio': { mats: [X('Wooden dowel (antenna)', 2), X('Plastic bowl (dish)', 1)], how: 'Two dowels standing up for antennas and a bowl for a dish.' },
  'back-missiles': { mats: [X('Paper towel tubes', 6)], how: 'Six tubes in two rows on a board on the back.' },
  'back-cargo': { mats: [S(1)], how: 'One more small container on the back, to carry things for real.' },
  'back-shield': { mats: [X('Hula hoop or ring', 1), X('LED strip light', 1, 'Lights')], how: 'A ring wrapped in LED lights on the back.' },

  'sh-light': { mats: [X('LED flashlight', 1, 'Lights')], how: 'A flashlight on top of the shoulder.' },
  'sh-missile': { mats: [X('Paper towel tubes', 4), X('Small box', 1)], how: 'A small box on the shoulder with 4 tubes inside.' },
  'sh-armor': { mats: [X('Plastic lid', 1)], how: 'A plastic lid as shoulder armour.' },
  'sh-beacon': { mats: [X('Orange LED light', 1, 'Lights')], how: 'An orange light on the shoulder.' },
  'sh-turret': { mats: [X('Small box', 1), X('Pencils or dowels (barrels)', 2)], how: 'A small box with two dowel barrels sticking out.' },
  'sh-dish': { mats: [X('Plastic bowl', 1), X('Wooden dowel', 1)], how: 'A bowl on a dowel.' },
  'sh-spikes': { mats: [X('Plastic bowl', 1), X('Cardboard cones', 5)], how: 'A bowl with cardboard cone spikes.' },
  // style families
  'hull-samurai': { mats: [L(3), X('Cardboard strips (armour plates)', 10), X('Gold card (crest)', 1), X('Clear plastic sheet (window)', 1), X('Zip ties', 40, 'Hardware')], how: 'Stack 3 large containers. Glue overlapping cardboard strips across the front like samurai armour, and add a gold card V-crest on top.' },
  'hull-junk': { mats: [L(2), S(1), X('Old tyre or swim ring', 1), X('Scrap card painted rust brown', 2), X('Zip ties', 40, 'Hardware')], how: 'Zip tie 2 large containers and 1 small one together a bit crooked on purpose. Add a rusty painted panel and an old tyre as a bumper.' },
  'hull-racer': { mats: [L(2), X('Clear plastic bowl (canopy)', 1), X('Cardboard fins', 2), X('Zip ties', 30, 'Hardware')], how: 'Lay 2 large containers end to end for a long body. Add a clear bowl as the canopy and two cardboard tail fins.' },
  'head-grille': { mats: [X('Cooling rack or grill grate', 1), X('LED lights (2)', 2, 'Lights')], how: 'Fix a small cooling rack over two LED lights on the front of the body.' },
  'head-sweep': { mats: [X('Black card strip', 1), X('LED strip light', 1, 'Lights')], how: 'Put an LED strip behind a black card strip on the front. Set the LEDs to a chasing pattern if they have one.' },
  'arm-sword': { mats: [S(2), M(2), X('Pool noodle or foam tube (blade)', 1), X('LED strip light', 1, 'Lights')], how: 'Two small containers and two motors, with a foam blade wrapped in LED light at the end.' },
  'arm-wrecker': { mats: [S(2), M(2), X('Plastic chain', 1), X('Foam ball', 1), X('Cardboard cones', 5)], how: 'Two small containers and two motors. Hang a foam ball with cardboard spikes from a plastic chain.' },
  'arm-tesla': { mats: [S(2), M(2), X('Copper-coloured wire or tape', 1), X('Clear ball ornament', 1), X('LED light', 1, 'Lights')], how: 'Two small containers and two motors. Wind copper wire around a tube and put a light inside a clear ball on the end.' },
  'leg-spider': { mats: [S(2), M(2), X('Cardboard claws', 3)], how: 'Two small containers and two motors, with three cardboard claws for a foot.' },
  'leg-hover': { mats: [S(2), M(2), X('Round plastic lid (pad)', 1), X('LED strip light (ring)', 1, 'Lights')], how: 'Two small containers and two motors. A round lid for the foot, with an LED strip around the edge underneath.' },
  'leg-greave': { mats: [S(2), M(2), X('Cardboard strips (shin armour)', 6), X('Plywood (foot plate)', 1)], how: 'Two small containers and two motors, with overlapping cardboard armour strips down the front.' },
  'back-wings': { mats: [X('Corrugated plastic sheet (wings)', 2), S(1), X('Hinges', 2, 'Hardware')], how: 'A small container on the back with two corrugated plastic wings on hinges so they fold.' },
  'back-reactor': { mats: [S(1), X('Clear plastic bottle (core)', 1), X('LED light', 1, 'Lights'), X('Dowels (cage)', 4)], how: 'A small container on the back holding a clear bottle with a light inside, caged with four dowels.' },
  'sh-mortar': { mats: [X('Cardboard tube', 1), X('Bottle cap', 1)], how: 'A short wide cardboard tube, tilted up.' },
  'sh-banner': { mats: [X('Dowel (pole)', 1), X('Fabric (flag)', 1)], how: 'A tall dowel with a fabric flag in your mech colours.' },
  'sh-exhaust': { mats: [X('Cardboard tubes (pipes)', 2), X('Silver tape', 1)], how: 'Two tubes of different heights wrapped in silver tape.' },
};

export const TOOLS = [
  { item: 'Strong cutter (oscillating tool or hot knife)', who: 'Grown-up only' },
  { item: 'Utility knife', who: 'Grown-up helps' },
  { item: 'Drill and bits', who: 'Grown-up helps' },
  { item: 'Screwdrivers and pliers', who: 'You can do it' },
  { item: 'Safety glasses and gloves', who: 'Everyone wears them' },
];

const SLOT_ORDER = ['hull', 'legL', 'legR', 'armL', 'armR', 'head', 'back', 'shoulderL', 'shoulderR'];
const SLOT_LABEL = { hull: 'Cockpit', legL: 'Left leg', legR: 'Right leg', armL: 'Left arm', armR: 'Right arm', head: 'Sensor', back: 'Back pack', shoulderL: 'Left shoulder', shoulderR: 'Right shoulder' };

/** Size in the chosen units, e.g. "60 × 40 × 35 cm". */
export function size(d, units = 'cm') {
  const f = units === 'in' ? 1 / 2.54 : 1;
  const r = (v) => Math.round(v * f * (units === 'in' ? 2 : 1)) / (units === 'in' ? 2 : 1);
  return `${r(d.l)} × ${r(d.w)} × ${r(d.h)} ${units}`;
}

export function length(cm, units = 'cm') {
  if (units === 'in') {
    const inches = Math.round(cm / 2.54);
    return `${Math.floor(inches / 12)} ft ${inches % 12} in`;
  }
  return cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${Math.round(cm)} cm`;
}

/** How many real centimetres one game metre is, from the real large container. */
export function scale(real) {
  return real.large.l / GAME_LARGE_LENGTH;
}

/**
 * The whole plan for a mech layout ({ slot: partId }): per-part materials and steps, totals, and electronics.
 * `partName(id)` gives each part's display name.
 */
export function buildPlan(layout, real = DEFAULT_REAL, partName = (id) => id) {
  const parts = [];
  const totals = new Map();
  const add = (m) => {
    const key = m.item;
    const t = totals.get(key) ?? { item: m.item, qty: 0, group: m.group };
    t.qty += m.qty;
    totals.set(key, t);
  };
  for (const slot of SLOT_ORDER) {
    const id = layout[slot];
    if (!id) continue;
    const r = REAL_PARTS[id];
    if (!r) continue;
    parts.push({ slot, label: SLOT_LABEL[slot], id, name: partName(id), mats: r.mats, how: r.how });
    r.mats.forEach(add);
  }
  const motors = totals.get('Motor')?.qty ?? 0;
  if (motors > 0) {
    add({ item: 'Motor controller (drives 2 motors)', qty: Math.ceil(motors / 2), group: 'Electronics' });
    add({ item: 'On/off switch', qty: 1, group: 'Electronics' });
    add({ item: 'Wire and connectors', qty: 1, group: 'Electronics' });
    if (!layout.back || layout.back !== 'back-power') add({ item: 'Battery pack (grown-up sets up)', qty: 1, group: 'Electronics' });
    add({ item: 'Motor brackets', qty: motors, group: 'Hardware' });
  }
  add({ item: 'Bolts, nuts and washers', qty: 1, group: 'Hardware' });
  add({ item: 'Duct tape', qty: 1, group: 'Hardware' });
  const order = ['Containers', 'Motors', 'Electronics', 'Wheels', 'Lights', 'Hardware', 'Craft parts'];
  const list = [...totals.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.item.localeCompare(b.item));
  for (const t of list) {
    if (t.item === 'Large container') t.detail = size(real.large, real.units);
    if (t.item === 'Small container') t.detail = size(real.small, real.units);
    if (t.item === 'Motor') t.detail = real.motor;
  }
  const steps = parts.map((p) => `${p.label}: ${p.name}. ${p.how}`);
  if (motors > 0) steps.push(`Wiring (with a grown-up): connect the ${motors} motors to ${Math.ceil(motors / 2)} motor controllers, then to the switch and battery. Test each motor on its own first.`);
  steps.push('Test it: switch on, move one joint at a time, and keep fingers clear of the motors.');
  return { parts, totals: list, steps, motors };
}
