// Talking and listening. The Windows and Android apps give the page their own speech engines;
// in a desktop browser it falls back to the browser's speech, so the game can be tried there too.
//
// Windows (WebView2):  page -> chrome.webview.postMessage({ type: 'listen' | 'stopListening' | 'speak' | 'stopSpeaking' | 'voices' | 'quit' | 'minimize' | 'fullscreen', text, voice, phrases })
//                      app  -> message event { type: 'heard', text, final } | { type: 'listening', on } | { type: 'spoken' } | { type: 'voices', list } | { type: 'voiceError', message } | { type: 'level', value }
// Android:             page -> MechGarageAndroid.listen() / stopListening() / speak(text) / stopSpeaking() / voices() / setVoice(name) / quit()
//                      app  -> window.mechGarageNative({ ... the same messages ... })

const listeners = new Set();
const emit = (msg) => { for (const l of listeners) l(msg); };
export const onVoice = (fn) => listeners.add(fn);

const webview = window.chrome?.webview;
const android = window.MechGarageAndroid;
window.mechGarageNative = (msg) => emit(typeof msg === 'string' ? JSON.parse(msg) : msg);
webview?.addEventListener('message', (e) => emit(typeof e.data === 'string' ? JSON.parse(e.data) : e.data));

export const platform = webview ? 'windows' : android ? 'android' : 'browser';

// ---------- the app window ----------
export const canQuit = !!(webview || android?.quit);
export function quit() {
  if (webview) webview.postMessage(JSON.stringify({ type: 'quit' }));
  else if (android?.quit) android.quit();
  else window.close();
}
export function minimize() { webview?.postMessage(JSON.stringify({ type: 'minimize' })); }
export function toggleFullscreen() { webview?.postMessage(JSON.stringify({ type: 'fullscreen' })); }

// ---------- listening ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
export const canListen = !!(webview || android || SR);

// If listening stops before the engine called anything "final", act on the last thing it heard anyway,
// so the robot always answers instead of going quiet.
let lastPartial = '';
let gotFinal = false;
onVoice((m) => {
  if (m.type === 'heard') {
    if (m.final) gotFinal = true;
    else lastPartial = m.text;
  } else if (m.type === 'listening' && m.on) {
    lastPartial = '';
    gotFinal = false;
  } else if (m.type === 'listening' && !m.on && !gotFinal && lastPartial.trim()) {
    const text = lastPartial;
    lastPartial = '';
    gotFinal = true;
    emit({ type: 'heard', text, final: true });
  }
});

export function listen(phrases = []) {
  stopSpeaking();
  if (webview) return webview.postMessage(JSON.stringify({ type: 'listen', phrases }));
  if (android) return android.listen();
  if (!SR) return emit({ type: 'voiceError', message: 'This browser cannot listen. Type instead.' });
  rec?.abort();
  rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onstart = () => emit({ type: 'listening', on: true });
  rec.onend = () => emit({ type: 'listening', on: false });
  rec.onerror = (e) => emit({ type: 'voiceError', message: e.error === 'not-allowed' ? 'The microphone is blocked.' : e.error === 'no-speech' ? 'I did not hear anything.' : `Listening stopped (${e.error}).` });
  rec.onresult = (e) => {
    const r = e.results[e.results.length - 1];
    emit({ type: 'heard', text: r[0].transcript, final: r.isFinal });
  };
  rec.start();
}

export function stopListening() {
  if (webview) return webview.postMessage(JSON.stringify({ type: 'stopListening' }));
  if (android) return android.stopListening();
  rec?.stop();
}

// ---------- voices ----------
// Every voice on offer, from the web view (on Windows this can include Microsoft's natural online voices) and from the
// app itself. Each: { id: 'web:<name>' | 'app:<name>', name, natural, online }.
const synth = window.speechSynthesis;
let appVoices = [];
let chosen = null; // a voice id, or null for "best available"

function webVoices() {
  return (synth?.getVoices() ?? [])
    .filter((v) => /^en/i.test(v.lang))
    .map((v) => ({ id: `web:${v.name}`, name: v.name.replace(/^Microsoft /, '').replace(/ - English.*$/, '').replace(/ Online \(Natural\)/, ' (natural)'), natural: /natural|neural|premium|enhanced|wavenet/i.test(v.name), online: !v.localService, voice: v }));
}

export function voices() {
  const app = appVoices.map((v) => ({ id: `app:${v.id}`, name: tidyAppName(v), natural: v.quality >= 400, online: !!v.online }));
  return [...webVoices(), ...app];
}

function tidyAppName(v) {
  // Android names look like "en-us-x-tpf-local": make them friendlier.
  if (platform === 'android') {
    const m = /^en-(\w+)-x-(\w+)-(local|network)$/i.exec(v.id);
    if (m) return `English (${m[1].toUpperCase()}) voice ${m[2].toUpperCase()}${m[3] === 'network' ? ' (online)' : ''}`;
  }
  return v.name;
}

function refreshAppVoices() {
  if (webview) webview.postMessage(JSON.stringify({ type: 'voices' }));
  else if (android?.voices) {
    try { appVoices = JSON.parse(android.voices()); } catch { appVoices = []; }
    emit({ type: 'voicesChanged' });
  }
}
onVoice((m) => {
  if (m.type === 'voices') { appVoices = m.list ?? []; emit({ type: 'voicesChanged' }); }
  if (m.type === 'voicesChanged' && android && !appVoices.length && android.voices) {
    try { appVoices = JSON.parse(android.voices()); } catch { /* not ready yet */ }
  }
});
synth?.addEventListener?.('voiceschanged', () => emit({ type: 'voicesChanged' }));
setTimeout(refreshAppVoices, 300);

/** The voice that will speak: the one chosen in Settings, or the most natural one available. */
function current() {
  const all = voices();
  if (chosen) {
    const v = all.find((x) => x.id === chosen);
    if (v) return v;
  }
  // natural web voices first (Windows natural voices, when the web view offers them), then the app's own
  // (on Android the app has already picked the phone's best voice), then any English web voice
  return all.find((v) => v.id.startsWith('web:') && v.natural && /en-US/i.test(v.voice?.lang ?? ''))
    ?? all.find((v) => v.id.startsWith('web:') && v.natural)
    ?? (webview || android ? { id: 'app:', name: 'App voice' } : null)
    ?? all.find((v) => v.id.startsWith('web:') && /en-US/i.test(v.voice?.lang ?? ''))
    ?? all[0] ?? null;
}
export const currentVoiceId = () => current()?.id ?? '';
export function setVoice(id) {
  chosen = id || null;
  if (android?.setVoice && chosen?.startsWith('app:')) android.setVoice(chosen.slice(4));
}

let muted = false;
export const setMuted = (m) => { muted = m; if (m) stopSpeaking(); };

export function stopSpeaking() {
  synth?.cancel();
  if (webview) webview.postMessage(JSON.stringify({ type: 'stopSpeaking' }));
  else android?.stopSpeaking?.();
}

/** Speaks `text`. Resolves when finished (or about when it should have). */
export function speak(text) {
  emit({ type: 'speaking', text });
  const estimate = 600 + text.split(' ').length * 330;
  if (muted) return wait(Math.min(estimate, 1500));
  const v = current();
  if (v?.id.startsWith('app:') && (webview || android)) {
    if (webview) webview.postMessage(JSON.stringify({ type: 'speak', text, voice: v.id.slice(4) || null }));
    else android.speak(text);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; listeners.delete(onDone); emit({ type: 'spoken' }); resolve(); } };
      const onDone = (m) => { if (m.type === 'spoken') finish(); };
      listeners.add(onDone);
      setTimeout(finish, estimate + 4000);
    });
  }
  if (!synth) return wait(estimate);
  synth.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    if (v?.voice) u.voice = v.voice;
    u.rate = 1.0;
    u.pitch = 1.0;
    let done = false;
    const finish = () => { if (!done) { done = true; emit({ type: 'spoken' }); resolve(); } };
    u.onend = finish;
    u.onerror = finish;
    synth.speak(u);
    setTimeout(finish, estimate + 4000);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
