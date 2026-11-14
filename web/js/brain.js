// Understands what the pilot says to the robot helper and turns it into actions.
// No internet needed: it works by spotting words, so it understands short, natural commands like
// "bring me the cannon arm", "move it in", "lock it on", "paint it red", "take off the left leg".
import { PARTS, SLOTS, COLORS, GLOW_COLORS } from './parts.js';

const SLOT_WORDS = [
  ['hull', ['cockpit', 'body', 'hull', 'torso', 'cabin', 'chest', 'core', 'frame', 'base']],
  ['head', ['head', 'sensor', 'eye', 'eyes', 'visor', 'face', 'optic', 'optics', 'camera']],
  ['back', ['back', 'backpack', 'pack']],
  ['shoulder', ['shoulder', 'shoulders']],
  ['arm', ['arm', 'arms', 'hand', 'hands']],
  ['leg', ['leg', 'legs', 'foot', 'feet']],
];

const has = (words, ...list) => list.some((w) => words.includes(w));
const hasPhrase = (text, ...list) => list.some((p) => new RegExp(`\\b${p}\\b`).test(text));

export function normalize(text) {
  return ` ${text.toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

/** How many single-letter edits turn a into b. */
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** Whether a heard word is close enough to the robot's name (speech engines spell unusual names many ways). */
export function soundsLike(word, name) {
  const w = word.replace(/[^a-z]/g, ''), n = name.replace(/[^a-z]/g, '');
  if (!w || !n) return false;
  if (w === n) return true;
  if (Math.abs(w.length - n.length) > 3 || w[0] !== n[0] && !(w[0] + n[0]).match(/^(ck|kc|cs|sc|sh|hs)$/)) return false;
  return editDistance(w, n) <= Math.max(1, Math.floor(n.length / 3));
}

/** Removes the robot's name ("Rivet, bring me...", "ok Sparky ..."), and says whether it was used. */
export function stripName(text, name) {
  const t = normalize(text);
  if (!name) return { text: t, named: false };
  const nameWords = normalize(name).trim().split(' ');
  const words = t.trim().split(' ');
  let named = false;
  const out = [];
  for (let i = 0; i < words.length; i++) {
    // the name, spelled roughly right, anywhere in the sentence (with "hey", "ok", "hi" before it dropped too)
    const span = words.slice(i, i + nameWords.length);
    const joined = span.join('');
    if (span.length === nameWords.length && (span.every((w, k) => soundsLike(w, nameWords[k])) || soundsLike(joined, nameWords.join('')))) {
      named = true;
      if (out.length && /^(hey|ok|okay|yo|hi|hello)$/.test(out.at(-1)) && out.length === 1) out.pop();
      i += nameWords.length - 1;
      continue;
    }
    out.push(words[i]);
  }
  return { text: ` ${out.join(' ')} `, named };
}

/** Which side is meant: 'L', 'R', 'both' or null. */
function sideOf(text) {
  const l = /\bleft\b/.test(text), r = /\bright\b/.test(text);
  if (/\bboth\b|\b(arms|legs|shoulders)\b/.test(text) && !(l !== r)) return 'both';
  if (l && !r) return 'L';
  if (r && !l) return 'R';
  if (l && r) return 'both';
  return null;
}

function slotKind(words) {
  for (const [kind, list] of SLOT_WORDS) if (list.some((w) => words.includes(w))) return kind;
  return null;
}

/** The part the words point to, if any (and its kind). */
export function findPart(words, kind = null) {
  let best = null, bestScore = 0;
  for (const p of PARTS) {
    if (kind && p.kind !== kind) continue;
    let score = 0;
    for (const w of p.words) if (words.includes(w)) score += w.length > 3 ? 2 : 1;
    // the full name counts extra
    const nameWords = p.name.toLowerCase().split(/[\s-]+/);
    if (nameWords.every((w) => words.includes(w))) score += 3;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  // generic words like "container" alone mean little; need a clear hit
  return bestScore >= 2 ? best : null;
}

function slotsFor(kind, side) {
  if (!kind) return [];
  if (kind === 'hull' || kind === 'head' || kind === 'back') return [kind];
  const cap = kind === 'arm' ? 'arm' : kind === 'leg' ? 'leg' : 'shoulder';
  if (side === 'both') return [cap + 'L', cap + 'R'];
  if (side) return [cap + side];
  return [cap + '?']; // decide later (the empty one first)
}

function colorIn(text, table) {
  // longest names first, so "light blue" wins over "blue"
  const names = Object.keys(table).sort((a, b) => b.length - a.length);
  for (const n of names) if (text.includes(` ${n} `)) return n;
  return null;
}

/**
 * Turns a sentence into a list of actions for the garage to carry out.
 * Each action: { type, ... }. Unknown sentences give [{ type: 'unknown' }].
 */
export function understand(raw, robotName = '') {
  const { text, named } = stripName(raw, robotName);
  const words = text.trim().split(' ');
  const acts = [];
  const side = sideOf(text);
  let kind = slotKind(words);
  const part = findPart(words, kind === 'arm' || kind === 'leg' || kind === 'shoulder' || kind === 'head' || kind === 'hull' || kind === 'back' ? kind : null) ?? (kind ? null : findPart(words));
  if (!kind && part) kind = part.kind;
  const slots = slotsFor(kind, side);

  // --- customising one part: nickname, stencilled label, own paint, size, length ---
  const PART_WORDS = '(left |right )?(cockpit|body|hull|torso|sensor|visor|eye|head|arm|arms|leg|legs|back ?pack|back|shoulder|shoulders)';
  let cm = text.match(new RegExp(`\\b(?:call|name|nickname) (?:the |my )?${PART_WORDS} ([a-z0-9' -]{1,20}) $`));
  if (cm) return [{ type: 'customize', slots: slotsFor(slotKind([cm[2].replace(/ /g, '')]) ?? slotKind([cm[2]]), sideOf(` ${cm[1] ?? ''}${cm[2]} `)), patch: { nickname: titleCase(cm[3]) } }];
  cm = text.match(new RegExp(`\\b(?:write|stencil|print|put|paint) (?:the word |the name )?(my name|[a-z0-9]{1,8}) on (?:the |my )?${PART_WORDS} $`));
  if (cm && !COLORS[cm[1]]) return [{ type: 'customize', slots: slotsFor(slotKind([cm[3].replace(/ /g, '')]) ?? slotKind([cm[3]]), sideOf(` ${cm[2] ?? ''}${cm[3]} `)), patch: { label: cm[1] === 'my name' ? '@pilot' : cm[1].toUpperCase() } }];
  if (kind && kind !== 'hull' || kind === 'hull' && hasPhrase(text, 'paint', 'color', 'colour', 'make')) {
    const grow = hasPhrase(text, 'bigger', 'larger', 'huge', 'huger', 'giant', 'massive') ? 0.1 : hasPhrase(text, 'smaller', 'tiny', 'tinier', 'little') ? -0.1 : 0;
    const stretch = hasPhrase(text, 'longer', 'taller', 'stretch') ? 0.1 : hasPhrase(text, 'shorter', 'stubby', 'stumpy') ? -0.1 : 0;
    const glowish = hasPhrase(text, 'eye', 'eyes', 'glow', 'lights', 'visor');
    const color = !glowish && hasPhrase(text, 'paint', 'color', 'colour', 'make', 'turn') ? colorIn(text, COLORS) : null;
    if ((grow || stretch) && hasPhrase(text, 'make', 'bigger', 'smaller', 'longer', 'shorter', 'larger', 'taller', 'grow', 'shrink')) {
      return [{ type: 'customize', slots: slots.length ? slots : [kind], patch: {}, grow, stretch }];
    }
    if (color) {
      const accent = hasPhrase(text, 'stripes', 'stripe', 'trim', 'accent', 'edges', 'details');
      return [{ type: 'customize', slots: slots.length ? slots : [kind], patch: { [accent ? 'accent' : 'primary']: COLORS[color] }, colorName: color }];
    }
  }

  // --- names ---
  let m = text.match(/\b(?:your name is|i'll call you|i will call you|call yourself|you are now|your new name is) ([a-z0-9' -]{1,24}) $/);
  if (m) return [{ type: 'renameRobot', name: titleCase(m[1]) }];
  m = text.match(/\b(?:call (?:the |my )?(?:mech|titan|robot|bot|suit) |name (?:the |my )?(?:mech|titan|suit) |(?:the |my )?(?:mech|titan|suit)(?:'s| s)? name is |name it )([a-z0-9' -]{1,24}) $/);
  if (m) return [{ type: 'nameMech', name: titleCase(m[1]) }];
  m = text.match(/\b(?:my name is|call me|i'm called|i am called) ([a-z0-9' -]{1,24}) $/);
  if (m) return [{ type: 'namePilot', name: titleCase(m[1]) }];

  // --- small talk ---
  if (hasPhrase(text, 'thank you', 'thanks', 'thank u', 'good job', 'nice job', 'well done', 'awesome', 'cool', 'great job', 'you rock')) acts.push({ type: 'thanks' });
  if (hasPhrase(text, 'joke', 'funny')) return [{ type: 'joke' }];
  if (hasPhrase(text, 'who are you', 'what are you', "what's your name", 'what is your name')) return [{ type: 'whoami' }];
  if (hasPhrase(text, 'help', 'what can you do', 'what can i say', 'how do i')) return [{ type: 'help' }];
  if (hasPhrase(text, 'save', 'save it', 'save my mech')) return [{ type: 'save' }];

  // --- the boombox (before anything else, so "stop the music" or "next song" never move the mech) ---
  const musicy = hasPhrase(text, 'music', 'song', 'songs', 'track', 'tune', 'tunes', 'jazz', 'radio', 'boombox', 'boom box', 'stereo', 'beats');
  if (musicy || hasPhrase(text, 'turn it up', 'turn it down', 'louder', 'quieter', 'volume up', 'volume down')) {
    if (hasPhrase(text, 'what song', "what's playing", 'what is playing', 'what is this song', "what's this song", 'name of the song')) return [{ type: 'music', action: 'what' }];
    if (hasPhrase(text, 'stop', 'pause', 'turn off', 'shut off', 'switch off', 'no more', 'kill', 'quiet the')) return [{ type: 'music', action: 'stop' }];
    if (hasPhrase(text, 'next', 'skip', 'change', 'another', 'different', 'new song')) return [{ type: 'music', action: 'next' }];
    if (hasPhrase(text, 'previous', 'last song', 'go back', 'back a song', 'the one before')) return [{ type: 'music', action: 'prev' }];
    if (hasPhrase(text, 'louder', 'turn it up', 'turn up', 'volume up', 'crank', 'pump up')) return [{ type: 'music', action: 'up' }];
    if (hasPhrase(text, 'quieter', 'turn it down', 'turn down', 'volume down', 'softer', 'lower')) return [{ type: 'music', action: 'down' }];
    if (musicy) return [{ type: 'music', action: 'play' }];
  }
  if (hasPhrase(text, 'quit the game', 'exit the game', 'close the game', 'quit game', 'exit game', "i'm done playing", 'i am done playing', 'turn off the game')) return [{ type: 'quit' }];

  // --- blueprint and the test planet ---
  if (hasPhrase(text, 'print', 'print it', 'print the plan')) return [{ type: 'print' }];
  if (hasPhrase(text, 'blueprint', 'blueprints', 'build plan', 'parts list', 'shopping list', 'real build', 'plans', 'how do i build it', 'real one')) {
    return [{ type: hasPhrase(text, 'close', 'exit', 'leave') ? 'closeBlueprint' : 'blueprint' }];
  }
  if (hasPhrase(text, 'launch', 'planet', 'simulation', 'simulator', 'outer space', 'take it outside', 'go outside', 'test it outside', 'test drive it', 'drop it', 'lets go outside', "let's go outside", 'go play')) return [{ type: 'launch' }];

  // --- whole-mech commands ---
  if (hasPhrase(text, 'start over', 'take it all apart', 'take everything off', 'scrap it', 'reset', 'clear it', 'empty the stand')) return [{ type: 'scrap' }];
  if (hasPhrase(text, 'build it all', 'build the whole', 'build everything', 'finish it', 'finish the mech', 'build my mech', 'build it for me', 'build the mech', 'build the titan', 'auto build', 'build the rest', 'finish building')) return [{ type: 'buildAll' }];
  if (hasPhrase(text, 'explode', 'exploded', 'spread it out', 'spread out', 'pull it apart', 'show me inside', 'blow it up')) return [{ type: 'explode', on: true }];
  if (hasPhrase(text, 'put it back together', 'collapse', 'close it up', 'unexplode', 'normal view')) return [{ type: 'explode', on: false }];
  if (hasPhrase(text, 'walk', 'test it', 'test drive', 'power up', 'power it up', 'turn it on', 'start it', "let's go", 'lets go', 'march', 'stomp', 'test walk')) return [{ type: 'walk', on: true }];
  if (hasPhrase(text, 'stop walking', 'power down', 'turn it off', 'shut it down', 'stand still')) return [{ type: 'walk', on: false }];
  if (hasPhrase(text, 'spin', 'turn it around', 'rotate', 'turn around', 'spin it')) {
    return [{ type: 'spin', dir: /\bleft\b/.test(text) ? 1 : /\bright\b/.test(text) ? -1 : 1, half: hasPhrase(text, 'turn it around', 'turn around') }];
  }
  if (hasPhrase(text, 'stop', 'freeze', 'hold still')) return [{ type: 'stop' }];
  if (hasPhrase(text, "what's missing", 'what is missing', 'status', 'how does it look', "how's it look", 'what do i need', "what's on", 'what is on', 'check it', 'is it done', 'stats', 'report')) return [{ type: 'status' }];
  if (hasPhrase(text, 'lights on', 'turn on the lights')) return [{ type: 'lights', on: true }];
  if (hasPhrase(text, 'lights off', 'turn off the lights', 'dark mode')) return [{ type: 'lights', on: false }];

  // --- camera ---
  if (hasPhrase(text, 'zoom in', 'closer look', 'get closer', 'come closer')) return [{ type: 'camera', zoom: -1 }];
  if (hasPhrase(text, 'zoom out', 'back up', 'see the whole', 'show me everything')) return [{ type: 'camera', zoom: 1 }];
  if (hasPhrase(text, 'look at', 'show me the', 'focus on') && kind && !hasPhrase(text, 'bring', 'get', 'grab') && !part) {
    return [{ type: 'camera', slot: slots[0] }];
  }

  // --- paint ---
  if (hasPhrase(text, 'paint', 'color', 'colour', 'make it', 'make the', 'spray', 'turn it')) {
    const glowWanted = hasPhrase(text, 'eye', 'eyes', 'glow', 'lights', 'light', 'visor');
    const accentWanted = hasPhrase(text, 'stripes', 'stripe', 'trim', 'accent', 'edges', 'frame', 'second color', 'details');
    const c = colorIn(text, glowWanted ? GLOW_COLORS : COLORS);
    if (c) return [{ type: 'paint', target: glowWanted ? 'glow' : accentWanted ? 'accent' : 'primary', color: c }];
    if (hasPhrase(text, 'camo', 'camouflage')) return [{ type: 'paint', target: 'primary', color: 'camo' }];
  }

  // --- holding a part ---
  if (hasPhrase(text, 'another one', 'next one', 'next', 'different one', 'something else', 'show me another', 'other one', 'try another', 'swap it')) return [{ type: 'cycle', dir: 1 }];
  if (hasPhrase(text, 'previous', 'last one', 'go back', 'the one before')) return [{ type: 'cycle', dir: -1 }];
  if (hasPhrase(text, 'move it in', 'push it in', 'bring it in', 'closer', 'move in', 'push in', 'in a bit', 'slide it in', 'move it closer', 'little more', 'a bit more')) {
    return [{ type: 'nudge', amount: hasPhrase(text, 'all the way', 'snap') ? -9 : hasPhrase(text, 'little', 'bit', 'tiny') ? -0.25 : -0.5 }];
  }
  if (hasPhrase(text, 'move it out', 'pull it out', 'move out', 'pull out', 'further', 'farther', 'away', 'back out', 'out a bit', 'take it out')) {
    return [{ type: 'nudge', amount: hasPhrase(text, 'little', 'bit', 'tiny') ? 0.25 : 0.5 }];
  }
  if (hasPhrase(text, 'put it back', 'never mind', 'nevermind', 'cancel', "don't want", 'do not want', 'not that one', 'no thanks', 'nope')) return [{ type: 'cancel' }];

  // remove / detach a fitted part
  if (hasPhrase(text, 'take off', 'remove', 'detach', 'unbolt', 'unattach', 'disconnect', 'pull off', 'get rid of', 'rip off', 'take the')) {
    if (slots.length && hasPhrase(text, 'take off', 'remove', 'detach', 'unbolt', 'unattach', 'disconnect', 'pull off', 'get rid of', 'rip off')) {
      return slots.map((s) => ({ type: 'remove', slot: s }));
    }
  }

  // attach / bring
  const attachWords = hasPhrase(text, 'attach', 'lock', 'confirm', 'weld', 'connect', 'bolt', 'install', 'fit', 'snap', 'clamp', 'secure', 'put it on', 'stick it', 'plug it');
  const bringWords = hasPhrase(text, 'bring', 'get', 'grab', 'fetch', 'give me', 'show me', 'hand me', 'pick', 'want', 'need', 'try', 'let me see', 'can i have', 'i choose', 'use', 'load');
  const putWords = hasPhrase(text, 'put', 'add', 'install', 'equip', 'attach', 'build', 'give it', 'give him', 'give her', 'stick', 'mount');
  if ((kind || part) && (bringWords || putWords || attachWords)) {
    const auto = putWords || attachWords;
    for (const s of slots.length ? slots : [part.kind === 'arm' ? 'arm?' : part.kind === 'leg' ? 'leg?' : part.kind === 'shoulder' ? 'shoulder?' : part.kind]) {
      acts.push({ type: 'bring', slot: s, partId: part?.id ?? null, attach: auto });
    }
    return acts;
  }
  if (attachWords || hasPhrase(text, 'yes', 'yeah', 'yep', 'do it', 'that one', 'perfect', 'ok', 'okay', 'go ahead', 'sure', 'looks good', 'i like it', 'that s good', "that's good")) {
    return [...acts, { type: 'lock' }];
  }
  if ((kind || part) && slots.length) {
    // just naming a part, e.g. "the crusher fist" or "left arm"
    return slots.map((s) => ({ type: 'bring', slot: s, partId: part?.id ?? null, attach: false }));
  }
  if (hasPhrase(text, 'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'sup', "what's up", 'yo') || (named && words.filter(Boolean).length === 0)) {
    return [...acts, { type: 'greet' }];
  }
  if (acts.length) return acts;
  return [{ type: 'unknown' }];
}

function titleCase(s) {
  return s.trim().split(' ').filter(Boolean).slice(0, 3).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// ---------- what the robot says ----------
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const say = {
  greet: (p) => pick([`Hey ${p}! Ready to build?`, `Hi ${p}. The garage is all yours.`, `Hello ${p}! What are we making today?`]),
  thanks: (p) => pick([`Anytime, ${p}.`, 'Happy to help!', 'That is what I am here for.', 'Teamwork!']),
  bringing: (part, slotLabel) => pick([`Getting the ${part} for the ${slotLabel}.`, `One ${part}, coming up.`, `On it. ${part} for the ${slotLabel}.`]),
  holding: () => pick(['Here it is. Tell me to move it in, or lock it on.', 'Holding it in place. Say "lock it" when it looks right.', 'How does that look? Move it in, or try another one.']),
  ready: () => pick(['Lined up. Say "lock it" to attach it.', 'It is right at the socket. Ready to lock.', 'Perfect fit. Lock it on?']),
  locked: (part) => pick([`${part} locked on!`, `Bolted and welded. The ${part} is on.`, `Done! The ${part} is attached.`]),
  removed: (label) => pick([`Unbolted the ${label}.`, `The ${label} is off.`, `${label} removed.`]),
  needHull: () => 'We need a cockpit first, so the other parts have something to attach to. I will bring the four-container cockpit.',
  nothingHeld: () => pick(['I am not holding anything. Pick a part first.', 'My hands are empty. What should I bring?']),
  cancelled: () => pick(['Okay, putting it back.', 'Back to storage it goes.', 'No problem, I will put it away.']),
  unknown: (p) => pick([`Sorry ${p}, I did not get that. Try "bring me the left arm" or say "help".`, 'Hmm, I am not sure what you mean. Say "help" to hear what I can do.', `Can you say that another way, ${p}?`]),
  help: () => 'You can say things like: bring me the left arm. Show me another one. Move it in. Lock it on. Take off the right leg. Paint it blue. Make the eyes red. Spin it. Test walk. What is missing? Or: build it all.',
  joke: () => pick(['Why did the robot go on holiday? To recharge its batteries.', 'What do you call a pirate robot? Arrr-two-D-two. Wait, no, that one is taken. Arrr-mech!', 'I tried to tell a joke about a broken motor. But it did not go anywhere.', 'Why was the robot so tired? It had a hard drive.']),
};

export const KIND_LABEL = Object.fromEntries(Object.entries(SLOTS).map(([k, v]) => [k, v.label.toLowerCase()]));
