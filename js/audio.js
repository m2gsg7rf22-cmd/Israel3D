let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  ctx = new Ctx();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
}

function now() { return ctx ? ctx.currentTime : 0; }
function noiseBuffer(seconds) {
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// ---- collision / punch impact: pitch-dropped noise burst + low-end thump ----
export function playImpact(strength = 1) {
  if (!ctx) return;
  const t0 = now(), dur = 0.18;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(2200, t0);
  filt.frequency.exponentialRampToValueAtTime(180, t0 + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.85 * strength, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filt).connect(gain).connect(master);
  src.start(t0);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(130, t0);
  osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.12);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.7 * strength, t0);
  og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
  osc.connect(og).connect(master);
  osc.start(t0); osc.stop(t0 + 0.16);
}
export function playPunch() { playImpact(0.55); }

// ---- pedestrian panic shriek: quick upward-chirp then settle ----
export function playShriek() {
  if (!ctx) return;
  const t0 = now();
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(480 + Math.random() * 200, t0);
  osc.frequency.exponentialRampToValueAtTime(1100 + Math.random() * 300, t0 + 0.11);
  osc.frequency.exponentialRampToValueAtTime(650, t0 + 0.3);
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = 1000;
  filt.Q.value = 2.2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
  osc.connect(filt).connect(gain).connect(master);
  osc.start(t0); osc.stop(t0 + 0.34);
}

// ---- police siren: two detuned oscillators swept by a shared LFO (wail 600-1200Hz) ----
let siren = null;
export function setSirenActive(active, volume = 1) {
  if (!ctx) return;
  if (active && !siren) {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = osc2.type = 'sine';
    osc2.detune.value = 7;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 300;
    lfo.connect(lfoGain);
    osc1.frequency.value = 900;
    osc2.frequency.value = 900;
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc1.connect(gain); osc2.connect(gain);
    gain.connect(master);
    osc1.start(); osc2.start(); lfo.start();
    siren = { osc1, osc2, lfo, gain };
  }
  if (siren) siren.gain.gain.setTargetAtTime(active ? 0.16 * clamp01(volume) : 0, now(), 0.15);
}

// ---- fire hydrant spray: continuous bandpass-filtered noise loop ----
let spray = null;
export function setHydrantSpray(active) {
  if (!ctx) return;
  if (active && !spray) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(2);
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 2400;
    filt.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filt).connect(gain).connect(master);
    src.start();
    spray = { src, gain };
  }
  if (spray) spray.gain.gain.setTargetAtTime(active ? 0.11 : 0, now(), 0.25);
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
export function isReady() { return !!ctx; }

// ---- global mute toggle for the settings panel ----
const BASE_VOLUME = 0.55;
export function setMuted(muted) {
  if (!master) return;
  master.gain.setTargetAtTime(muted ? 0 : BASE_VOLUME, now(), 0.05);
}

// ---- in-game radio: there's no licensed music in this project, so each
// "station" is a short synthesized arpeggio loop (distinct scale/tempo/
// waveform per station) rather than a real song -- disclosed here instead
// of silently passing a chiptune loop off as a soundtrack
const STATIONS = [
  { name: 'Meridian FM', notes: [261.6, 329.6, 392.0, 329.6], tempo: 0.28, wave: 'triangle' },
  { name: 'Bay Beats', notes: [220, 220, 261.6, 246.9], tempo: 0.22, wave: 'square' },
  { name: 'Night Drive', notes: [196, 233.1, 174.6, 220], tempo: 0.4, wave: 'sine' },
];
let radioGain = null, radioTimer = null, radioStep = 0;

export function getStationNames() { return STATIONS.map((s) => s.name); }

function playRadioStep(station) {
  const t0 = now();
  const note = station.notes[radioStep % station.notes.length];
  const osc = ctx.createOscillator();
  osc.type = station.wave;
  osc.frequency.value = note;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + station.tempo * 0.9);
  osc.connect(g).connect(radioGain);
  osc.start(t0); osc.stop(t0 + station.tempo);
  radioStep++;
}

export function setRadioStation(idx) {
  if (!ctx) return;
  if (radioTimer) { clearInterval(radioTimer); radioTimer = null; }
  if (idx === null) return; // "off"
  if (!radioGain) { radioGain = ctx.createGain(); radioGain.gain.value = 0.3; radioGain.connect(master); }
  const station = STATIONS[idx % STATIONS.length];
  radioStep = 0;
  playRadioStep(station);
  radioTimer = setInterval(() => playRadioStep(station), station.tempo * 1000);
}
