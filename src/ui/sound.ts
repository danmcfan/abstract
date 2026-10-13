import { createSignal } from "solid-js";
import { localSetting, switchedSound, type Cue, type Sound } from "../sim/sound";

// The game's sound: every cue is made on the spot with Web Audio, from
// noise bursts and short tones, so there are no sound files to load.
// Browsers won't start audio until the player first clicks or presses a
// key, so the audio context is only made then; cues before that are
// dropped quietly.

const setting = localSetting();
const [soundOn, setSoundOn] = createSignal(setting.on());
export { soundOn };

export function toggleSound(): void {
  setting.set(!soundOn());
  setSoundOn(setting.on());
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function unlock(): void {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
}

// Called once at startup. Capture phase, so the click that first unlocks
// audio can already play its own cue.
export function listenForFirstGesture(): void {
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
}

// A burst of filtered noise: clicks, thuds, scratches.
function burst(at: number, length: number, gain: number, type: BiquadFilterType, frequency: number, q = 1): void {
  if (ctx === null || master === null) return;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(env).connect(master);
  source.start(at, Math.random() * 0.5);
  source.stop(at + length + 0.02);
}

// A tone that strikes and dies away.
function tone(
  at: number,
  length: number,
  gain: number,
  frequency: number,
  type: OscillatorType = "sine",
  endFrequency = frequency,
): void {
  if (ctx === null || master === null) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, at);
  if (endFrequency !== frequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, at + length);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(env).connect(master);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

let pencilUntil = 0;

// One recipe per cue.
const CUES: Record<Cue, (now: number, pitch: number) => void> = {
  switch: (t) => {
    burst(t, 0.02, 0.5, "highpass", 2500);
    tone(t, 0.025, 0.15, 1900, "square");
  },
  place: (t) => {
    burst(t, 0.14, 0.7, "lowpass", 450);
    tone(t, 0.1, 0.25, 110, "sine", 70);
  },
  pencil: (t) => {
    // Pointer moves come faster than a scratch lasts; let one finish first.
    if (t < pencilUntil) return;
    pencilUntil = t + 0.04;
    burst(t, 0.07, 0.06, "bandpass", 3200 + Math.random() * 800, 0.8);
  },
  connect: (t) => {
    burst(t, 0.012, 0.6, "highpass", 1800);
    tone(t, 0.02, 0.12, 2600, "square");
    burst(t + 0.028, 0.015, 0.4, "highpass", 1400);
  },
  clock: (t) => {
    burst(t, 0.016, 0.7, "highpass", 1100);
    tone(t, 0.03, 0.14, 1300, "square");
    burst(t + 0.035, 0.02, 0.45, "highpass", 900);
  },
  unstable: (t) => {
    // A short circuit's buzz, then the pop as something gives.
    tone(t, 0.32, 0.12, 120, "sawtooth");
    tone(t, 0.32, 0.06, 181, "sawtooth");
    burst(t + 0.3, 0.06, 0.8, "lowpass", 1200);
  },
  carriage: (t) => {
    // A ratchet speeding up, then the carriage hitting its stop.
    let at = t;
    for (let i = 0; i < 9; i++) {
      burst(at, 0.015, 0.25, "bandpass", 2800, 2);
      at += 0.045 - i * 0.003;
    }
    burst(at, 0.09, 0.6, "lowpass", 900);
    tone(at, 0.06, 0.15, 220, "triangle");
  },
  tick: (t) => {
    tone(t, 0.035, 0.18, 1600, "triangle");
  },
  "fail-tick": (t) => {
    tone(t, 0.05, 0.18, 640, "triangle");
  },
  stamp: (t) => {
    burst(t, 0.2, 0.9, "lowpass", 300);
    tone(t, 0.16, 0.5, 90, "sine", 55);
  },
  bell: (t) => {
    // A desk bell rings just after the stamp lands.
    const at = t + 0.18;
    tone(at, 1.6, 0.18, 2093);
    tone(at, 1.1, 0.08, 2093 * 2.76);
    tone(at, 0.7, 0.05, 2093 * 5.4);
  },
  "fail-stamp": (t) => {
    burst(t, 0.18, 0.45, "lowpass", 180);
    tone(t, 0.16, 0.3, 65, "sine", 40);
  },
  key: (t, pitch) => {
    const shift = 2 ** (pitch / 12);
    burst(t, 0.02, 0.35, "bandpass", 2400 * shift, 1.5);
    tone(t, 0.025, 0.06, 900 * shift, "square");
  },
};

const voice: Sound = {
  play(cue, pitch = 0) {
    if (ctx?.state !== "running") return;
    try {
      CUES[cue](ctx.currentTime, pitch);
    } catch {}
  },
};

export const sound = switchedSound(voice, setting);
