// Speech measures from a WebVTT file. Auto-generated subtitles repeat the previous line in every cue
// (rolling captions), so repeated lines are dropped before counting words.

const TS = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})/;
const toSec = (s) => {
  const m = TS.exec(s);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : NaN;
};
const clean = (t) => t.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const wordsOf = (t) => t.split(/\s+/).filter(Boolean);

// [{start, end, lines: [new text lines only]}] with duplicates removed.
export function parseVtt(text) {
  const cues = [];
  let prev = new Set();
  for (const block of text.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split("-->");
    const start = toSec(a);
    const end = toSec(b);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const own = lines.slice(ti + 1).map(clean).filter(Boolean);
    const fresh = own.filter((l) => !prev.has(l));
    prev = new Set(own);
    // Rolling-caption stubs (a few ms long) only repeat text already counted.
    if (fresh.length && end - start >= 0.1) cues.push({ start, end, lines: fresh });
  }
  return cues;
}

const SENTENCE_END = /[.!?…]+(?:\s|$)/;

export function speechStats(cues) {
  if (!cues.length) return { words_per_minute: null, sentence_words_mean: null, hook_text: "", words: 0 };
  const texts = cues.map((c) => c.lines.join(" "));
  const words = texts.reduce((n, t) => n + wordsOf(t).length, 0);
  const span = Math.max(1, cues[cues.length - 1].end - cues[0].start);
  const joined = texts.join(" ");
  const sentences = joined.split(SENTENCE_END).map((s) => wordsOf(s).length).filter(Boolean);
  const units = sentences.length >= 3 ? sentences : texts.map((t) => wordsOf(t).length);
  return {
    words,
    words_per_minute: Math.round((words / span) * 60),
    sentence_words_mean: +(units.reduce((a, b) => a + b, 0) / units.length).toFixed(1),
    hook_text: cues.filter((c) => c.start < 3).map((c) => c.lines.join(" ")).join(" ").trim(),
  };
}
