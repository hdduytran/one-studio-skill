// Compare a voice-over sentence with what a speech-to-text model heard (check-pronunciation.mjs).
// ASR is screening only: models merge spelled letters ("xi vi i" → "CV"), so a flagged line is a line to listen
// to, not a verdict. The duration check is a second, independent hint for spelled acronyms.
import { acronyms, applyPronunciations, spelledLetters } from "./pronounce.mjs";
import { wordCount } from "./speech-rate.mjs";

// One spelled letter adds roughly this much speech (s): fast single syllables to slow two-syllable names.
export const LETTER_SECONDS = { min: 0.16, max: 0.48 };

export const tokens = (s) => String(s ?? "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);

// Longest common subsequence of two token lists → what was expected but not heard, and heard but not expected.
export function diffTokens(expected, heard) {
  const n = expected.length;
  const m = heard.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = expected[i] === heard[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const missing = [];
  const extra = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && expected[i] === heard[j]) {
      i++;
      j++;
    } else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) extra.push(heard[j++]);
    else missing.push(expected[i++]);
  }
  return { matched: dp[0][0], missing, extra };
}

const containsSeq = (hay, needle) => needle.length > 0 && hay.some((_, i) => needle.every((t, k) => hay[i + k] === t));

// Heard text with each dictionary entry's spelled form written back as the entry ("pi ếch pi" → "php"),
// so a transcript that spells and one that writes the acronym compare the same against the written line.
export function canonicalHeard(heard, dict) {
  let toks = tokens(heard);
  const entries = Object.entries(dict ?? {}).sort((a, b) => tokens(b[1]).length - tokens(a[1]).length);
  for (const [key, say] of entries) {
    const from = tokens(say);
    const to = tokens(key);
    if (!from.length) continue;
    const out = [];
    for (let i = 0; i < toks.length; ) {
      if (from.every((t, k) => toks[i + k] === t)) {
        out.push(...to);
        i += from.length;
      } else out.push(toks[i++]);
    }
    toks = out;
  }
  return toks;
}

// line: { text, say? }  spoken: text the voice read  hits: dictionary keys applied  dict: the dictionary
// transcript: STT output  duration: seconds of the wav  wps: the voice's speaking rate (words/s)
export function checkLine({ text, say = null, spoken, hits = [], dict = {}, transcript, duration, wps }) {
  const explicit = say != null;
  const expected = tokens(explicit ? say : text);
  const heard = explicit ? tokens(transcript) : canonicalHeard(transcript, dict);
  const d = diffTokens(expected, heard);
  const issues = [];
  if (d.missing.length) issues.push(`missing: ${d.missing.join(" ")}`);
  if (d.extra.length) issues.push(`heard instead/extra: ${d.extra.join(" ")}`);

  const keys = [...new Set(hits)];
  const terms = keys.map((key) => ({ key, say: dict[key], letters: spelledLetters(key), heard: containsSeq(heard, tokens(key)) }));
  for (const t of terms) if (!t.heard) issues.push(`${t.key} ("${t.say}") not recognised`);

  // Acronyms the dictionary does not cover (only for lines read from `text`).
  const rest = explicit ? "" : applyPronunciations(text, Object.fromEntries(keys.map((k) => [k, " "]))).text;
  const unlisted = explicit ? [] : acronyms(rest);
  for (const a of unlisted) issues.push(`${a}: no pronunciation entry (the voice may swallow or misread it)`);

  // Duration: speech left after the plain words should hold every spelled letter.
  let timing = null;
  const total = hits.reduce((n, h) => n + spelledLetters(h), 0);
  if (total && wps > 0 && duration > 0) {
    const spelledWords = hits.reduce((n, h) => n + wordCount(dict[h]), 0);
    const plain = Math.max(0, wordCount(spoken) - spelledWords);
    const residual = Math.round((duration - plain / wps) * 100) / 100;
    const min = Math.round(total * LETTER_SECONDS.min * 100) / 100;
    const max = Math.round(total * LETTER_SECONDS.max * 100) / 100;
    const verdict = residual < min ? "short" : residual > max * 1.5 ? "long" : "ok";
    timing = { letters: total, residual, min, max, verdict };
    if (verdict === "short") issues.push(`duration: ${residual}s left for ${total} spelled letter(s), expected ≥ ${min}s (letters may be swallowed)`);
    if (verdict === "long") issues.push(`duration: ${residual}s left for ${total} spelled letter(s), expected ≤ ${max}s (pause or misreading?)`);
  }
  return { ok: issues.length === 0, expected: expected.join(" "), heard: heard.join(" "), similarity: expected.length ? Math.round((d.matched / expected.length) * 100) / 100 : 1, ...d, terms, unlisted, timing, issues };
}
