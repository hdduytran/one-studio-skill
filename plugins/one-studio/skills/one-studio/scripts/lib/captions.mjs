// SRT captions from sentence timings (no speech recognition needed: every sentence is its own audio file).

export function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

// Break text into chunks of at most `maxChars` per line and two lines per cue, at word boundaries.
export function wrapCue(text, maxChars = 42) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > maxChars) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  // Balance two-line cues so the break falls near the middle.
  const cues = [];
  for (let i = 0; i < lines.length; i += 2) cues.push(lines.slice(i, i + 2));
  return cues.map((c) => (c.length === 2 ? balance(c.join(" "), maxChars) : c));
}

function balance(text, maxChars) {
  const words = text.split(" ");
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    if (a.length > maxChars || b.length > maxChars) continue;
    const score = Math.abs(a.length - b.length);
    if (!best || score < best.score) best = { score, lines: [a, b] };
  }
  return best ? best.lines : [text];
}

// cues: [{ start, end, text }] in seconds → SRT; long sentences split proportionally to characters.
export function buildSrt(cues, { maxChars = 42 } = {}) {
  const out = [];
  let n = 1;
  for (const cue of cues) {
    const parts = wrapCue(cue.text, maxChars);
    const total = parts.reduce((k, p) => k + p.join(" ").length, 0) || 1;
    let t = cue.start;
    for (const p of parts) {
      const d = ((cue.end - cue.start) * p.join(" ").length) / total;
      out.push(`${n++}\n${srtTime(t)} --> ${srtTime(t + d)}\n${p.join("\n")}\n`);
      t += d;
    }
  }
  return out.join("\n");
}
