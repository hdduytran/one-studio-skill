// Offline music beds: pure-JS synthesis to a seamless 48 kHz stereo WAV (no samples, no network).
// Every event is written into a circular buffer, so tails (pad release, delay echoes, kick decay)
// wrap into the start and the file loops without a click when concat-and-mix repeats it.
//   ambient  detuned sine pads (+octave, slow swell, overlapping into the next bar), eighth-note
//            sparkle arpeggio two octaves up with exp decay, 0.33 s feedback delay (0.28)
//   lofi     100 BPM: soft kick on 1 and 3, swung off-beat hat, root bass, warm low-passed chords, vinyl dust
// Output peak-normalised to −3 dBFS. Same parameters → byte-identical file.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const MUSIC_VERSION = 1;
export const RATE = 48000;

// Voicings (MIDI) in C, kept between F3 and B4 for smooth voice leading.
const CHORDS = {
  Cmaj7: [60, 64, 67, 71],
  Am7: [57, 60, 64, 67],
  Fmaj7: [53, 57, 60, 64],
  G6: [55, 59, 62, 64],
  Dm7: [50, 53, 57, 60],
  Em7: [52, 55, 59, 62],
};
export const MOODS = {
  calm: { chords: ["Cmaj7", "Am7", "Fmaj7", "G6"], bright: 1, cutoff: 3200 },
  bright: { chords: ["Cmaj7", "G6", "Am7", "Fmaj7"], bright: 1.4, cutoff: 5000 },
  warm: { chords: ["Fmaj7", "G6", "Em7", "Am7"], bright: 0.6, cutoff: 1800 },
  dark: { chords: ["Am7", "Fmaj7", "Dm7", "Em7"], bright: 0.5, cutoff: 1500 },
};
export const PRESETS = {
  ambient: { bpm: 60, mood: "calm", about: "slow pads + sparkle arpeggio + echo; no drums" },
  lofi: { bpm: 100, mood: "calm", about: "100 BPM soft kick, off-beat hat, root bass, warm chords" },
};
// Beds offered at gate 7 (name → parameters).
export const BUILTIN_BEDS = {
  ambient: { preset: "ambient", mood: "calm" },
  "ambient-bright": { preset: "ambient", mood: "bright" },
  lofi: { preset: "lofi", mood: "calm" },
  "lofi-dark": { preset: "lofi", mood: "dark" },
};

const NOTE = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
export function keyOffset(key = "C") {
  const k = NOTE[String(key).trim().replace(/^([a-g])/, (c) => c.toUpperCase())];
  if (k == null) throw new Error(`unknown key "${key}"; use C, C#, Db … B`);
  return k > 6 ? k - 12 : k; // stay close to the original register
}
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Normalised options with defaults, and the exact loop length (whole progressions).
export function resolveOptions({ preset = "ambient", mood, bpm, key = "C", length, seed = 1 } = {}) {
  const p = PRESETS[preset];
  if (!p) throw new Error(`unknown preset "${preset}"; use ${Object.keys(PRESETS).join(", ")}`);
  const m = mood ?? p.mood;
  if (!MOODS[m]) throw new Error(`unknown mood "${m}"; use ${Object.keys(MOODS).join(", ")}`);
  const b = Number(bpm ?? p.bpm);
  if (!(b >= 40 && b <= 200)) throw new Error("--bpm must be between 40 and 200");
  const bar = (4 * 60) / b;
  const cycle = bar * 4;
  const want = length == null ? (preset === "lofi" ? cycle * 2 : cycle) : Number(length);
  if (!(want > 0)) throw new Error("--length must be a positive number of seconds");
  const cycles = Math.max(1, Math.round(want / cycle));
  return { preset, mood: m, bpm: b, key, transpose: keyOffset(key), seed, bar, cycles, seconds: cycles * cycle };
}

export function renderBed(opts = {}) {
  const o = resolveOptions(opts);
  const N = Math.round(o.seconds * RATE);
  const L = new Float32Array(N);
  const Rt = new Float32Array(N);
  const rand = mulberry32(o.seed * 7919 + (o.preset === "lofi" ? 17 : 3));
  const mood = MOODS[o.mood];
  const bars = o.cycles * 4;
  const beat = o.bar / 4;

  // Add f(t) for t in [0, dur) starting at sample `start`, wrapping around the loop.
  const add = (buf, startSec, dur, f, gain = 1) => {
    const s0 = Math.round(startSec * RATE);
    const n = Math.round(dur * RATE);
    for (let i = 0; i < n; i++) {
      const v = f(i / RATE);
      if (v) buf[(s0 + i) % N] += v * gain;
    }
  };
  const addSt = (startSec, dur, f, pan = 0, dst = [L, Rt]) => {
    // equal-power pan, pan in [-1, 1]
    const a = ((pan + 1) * Math.PI) / 4;
    add(dst[0], startSec, dur, f, Math.cos(a));
    add(dst[1], startSec, dur, f, Math.sin(a));
  };

  const chordAt = (bar) => CHORDS[mood.chords[bar % 4]].map((n) => n + o.transpose);

  if (o.preset === "ambient") {
    const attack = Math.min(1.6, o.bar * 0.4);
    const overlap = Math.min(1.8, o.bar * 0.45);
    for (let b = 0; b < bars; b++) {
      const start = b * o.bar;
      const dur = o.bar + overlap;
      for (const note of chordAt(b)) {
        const f0 = hz(note);
        const env = (t) => {
          const up = t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : 1;
          const down = t > o.bar ? 0.5 + 0.5 * Math.cos((Math.PI * (t - o.bar)) / overlap) : 1;
          return up * down;
        };
        const det = 2 ** (4 / 1200);
        // two detuned voices, one per side, plus a quieter octave in the middle
        addSt(start, dur, (t) => 0.05 * env(t) * Math.sin(2 * Math.PI * f0 * det * t), -0.5);
        addSt(start, dur, (t) => 0.05 * env(t) * Math.sin(2 * Math.PI * (f0 / det) * t + 1.3), 0.5);
        addSt(start, dur, (t) => 0.018 * env(t) * Math.sin(2 * Math.PI * f0 * 2 * t + 0.7), 0);
      }
    }
    // Sparkle: eighth notes, chord tones two octaves up, exp decay, alternating pan; through a feedback delay.
    const sL = new Float32Array(N);
    const sR = new Float32Array(N);
    const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
    const eighth = beat / 2;
    for (let b = 0; b < bars; b++) {
      const tones = chordAt(b);
      for (let k = 0; k < 8; k++) {
        const f0 = hz(tones[pattern[k]] + 24);
        const amp = 0.035 * mood.bright * (k % 2 ? 0.75 : 1);
        const f = (t) => amp * Math.exp(-t / 0.22) * Math.sin(2 * Math.PI * f0 * t) * Math.min(1, t * 400);
        const a = ((k % 2 ? 0.45 : -0.45) + 1) * (Math.PI / 4);
        add(sL, b * o.bar + k * eighth, 1.2, f, Math.cos(a));
        add(sR, b * o.bar + k * eighth, 1.2, f, Math.sin(a));
      }
    }
    for (const [src, dst] of [[sL, L], [sR, Rt]]) {
      const y = feedbackDelay(src, Math.round(0.33 * RATE), 0.28);
      for (let i = 0; i < N; i++) dst[i] += y[i];
    }
  } else {
    // lofi
    const swing = beat * 0.08;
    const chordBus = [new Float32Array(N), new Float32Array(N)];
    for (let b = 0; b < bars; b++) {
      const start = b * o.bar;
      const tones = chordAt(b);
      // warm chords: sine + 2nd harmonic, slow tremolo, gentle decay, overlapping the next bar a little
      for (const note of tones) {
        const f0 = hz(note);
        const env = (t) => Math.min(1, t / 0.04) * Math.exp(-t / (o.bar * 0.9)) * (t > o.bar ? Math.max(0, 1 - (t - o.bar) / 0.4) : 1);
        const trem = (t) => 1 - 0.12 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4.2 * t));
        addSt(start, o.bar + 0.4, (t) => 0.06 * env(t) * trem(t) * (Math.sin(2 * Math.PI * f0 * t) + 0.18 * Math.sin(4 * Math.PI * f0 * t)), note % 2 ? 0.25 : -0.25, chordBus);
      }
      // root bass on beats 1 and 3
      const root = hz(tones[0] - 24 + (tones[0] - 24 < 33 ? 12 : 0));
      for (const at of [0, 2]) {
        const d = beat * 1.75;
        addSt(start + at * beat, d, (t) => 0.22 * Math.min(1, t / 0.01) * Math.min(1, (d - t) / 0.06) * (Math.sin(2 * Math.PI * root * t) + 0.15 * Math.sin(4 * Math.PI * root * t)), 0);
      }
      for (let q = 0; q < 4; q++) {
        // soft kick on 1 and 3: pitch drop 120 → 45 Hz
        if (q === 0 || q === 2) {
          addSt(start + q * beat, 0.45, (t) => {
            const ph = 2 * Math.PI * (45 * t + (75 / 22) * (1 - Math.exp(-22 * t)));
            return 0.42 * Math.exp(-t * 7) * Math.sin(ph) * Math.min(1, t * 500);
          }, 0);
        }
        // off-beat hat: seeded noise burst, high-passed, swung late
        const seed = Math.floor(rand() * 1e9);
        const noise = mulberry32(seed);
        let prev = 0;
        let lp = 0;
        addSt(start + q * beat + beat / 2 + swing, 0.09, (t) => {
          const x = noise() * 2 - 1;
          lp += 0.35 * (x - lp);
          const hp = x - lp;
          prev = hp;
          return 0.05 * Math.exp(-t * 55) * prev;
        }, 0.3);
      }
    }
    // the chords sit behind a one-pole low-pass (mood sets the cutoff), done circularly
    chordBus.forEach((buf, c) => {
      onePoleCircular(buf, mood.cutoff);
      const dst = c ? Rt : L;
      for (let i = 0; i < N; i++) dst[i] += buf[i];
    });
    // vinyl dust: sparse seeded clicks + a very quiet noise floor
    const dust = mulberry32(o.seed * 104729);
    for (let i = 0; i < N; i++) {
      const n = (dust() * 2 - 1) * 0.0012;
      const click = dust() < 0.00004 ? (dust() * 2 - 1) * 0.08 : 0;
      L[i] += n + click;
      Rt[i] += n + click * 0.8;
    }
  }

  // peak-normalise to −3 dBFS
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rt[i]));
  const k = peak ? 10 ** (-3 / 20) / peak : 1;
  for (let i = 0; i < N; i++) {
    L[i] *= k;
    Rt[i] *= k;
  }
  return { left: L, right: Rt, options: o, peakDb: -3 };
}

// y[n] = x[n] + fb · y[n − d] on a loop: a few passes reach the steady state, so echoes wrap around.
function feedbackDelay(x, d, fb) {
  const N = x.length;
  const y = Float32Array.from(x);
  for (let pass = 0; pass < 4; pass++) for (let i = 0; i < N; i++) y[i] = x[i] + fb * y[(i - d + N) % N];
  return y;
}

function onePoleCircular(buf, cutoff) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
  let s = 0;
  // warm-up pass over the tail so the filter state at sample 0 is the loop's own state
  for (let i = buf.length - RATE; i < buf.length; i++) s += a * (buf[Math.max(0, i)] - s);
  for (let i = 0; i < buf.length; i++) {
    s += a * (buf[i] - s);
    buf[i] = s;
  }
}

export function wavBytes(left, right) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(q(left[i]), 44 + i * 4);
    buf.writeInt16LE(q(right[i]), 46 + i * 4);
  }
  return buf;
}

export function writeBed(file, opts = {}) {
  const r = renderBed(opts);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.part`, wavBytes(r.left, r.right));
  renameSync(`${file}.part`, file);
  return { file, ...r.options };
}
