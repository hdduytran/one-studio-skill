// Pronunciation dictionary: spoken forms of acronyms and brand words, per language.
//   brand.json  → pronunciations.<lang>   (a series shares it)
//   studio.json → pronunciations.<lang>   (this project; wins entry by entry)
// build-audio speaks applyPronunciations(line.text) when a line has no explicit `say`; captions keep `text`.
// Some voices swallow the last letter of capitalised acronyms (PHP → "P H") or read them as words (CA → "công an"):
// a letter-by-letter spelling ("pi ếch pi") fixes it.

const WORD = "\\p{L}\\p{N}_";
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Entries for one language: "vi-VN" also takes "vi" entries, then "default". Later layers win.
export function pronunciationsFor(project, lang) {
  const base = lang?.split("-")[0];
  const out = {};
  for (const src of [project.brand?.pronunciations, project.studio?.pronunciations]) {
    if (!src) continue;
    for (const key of ["default", base, lang]) if (key && src[key]) Object.assign(out, src[key]);
  }
  return out;
}

// Whole-word, case-sensitive replacement in one pass, longest key first: "PHP-FPM" or "PHP2Shell" entries win over
// "PHP" at the same position, and replaced text is never replaced again. A key without its own entry inside a
// compound ("PHP" in "PHP-FPM") is still replaced where it stands as a word ("-" is a word boundary, digits are not).
export function applyPronunciations(text, dict) {
  const keys = Object.keys(dict ?? {}).filter(Boolean).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  if (!keys.length || !text) return { text, hits: [] };
  const re = new RegExp(`(?<![${WORD}])(?:${keys.map(escapeRe).join("|")})(?![${WORD}])`, "gu");
  const hits = [];
  const out = text.replace(re, (m) => {
    hits.push(m);
    return dict[m];
  });
  return { text: out, hits };
}

// What the voice reads for a line: its explicit `say`, else the text with the dictionary applied.
export function spokenText(project, line, lang = line.lang ?? project.studio.meta?.language) {
  if (line.say != null) return { text: line.say, hits: [], explicit: true };
  return { ...applyPronunciations(line.text, pronunciationsFor(project, lang)), explicit: false };
}

// Capitalised acronyms in a text (2+ capitals/digits, at least two capitals), e.g. CVE, CVSS, PHP-FPM → PHP, FPM.
const TOKEN_RE = new RegExp(`(?<![${WORD}])[\\p{Lu}\\p{N}]{2,}(?![${WORD}])`, "gu");
export const acronyms = (text) => [...new Set((String(text ?? "").match(TOKEN_RE) ?? []).filter((t) => (t.match(/\p{Lu}/gu) ?? []).length >= 2))];

// Letters spelled out for a dictionary key (capitals and digits): "CVSS" → 4, "PHP-FPM" → 6.
export const spelledLetters = (key) => (String(key).match(/[\p{Lu}\p{N}]/gu) ?? []).length;
