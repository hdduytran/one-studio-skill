#!/usr/bin/env node
// Batch-generate static graphics with Satori (JSX-like tree → SVG) and resvg (SVG → PNG):
// YouTube thumbnails, title cards, lower-thirds, quote cards, social covers.
// Output SVGs can be animated in Remotion (inline them) or used as PNG images.
//
// Usage: node render_cards.mjs <project-dir> <cards.json> [--out public/cards]
// Needs in the project: npm i -D satori@0.63.2 @resvg/resvg-js@2.6.2 @fontsource/inter@5.3.0
//
// cards.json: { "theme": {colors…}, "cards": [
//   { "name": "thumb", "template": "thumbnail", "width": 1280, "height": 720,
//     "props": { "title": "…", "kicker": "…", "badge": "NEW" } },
//   { "name": "lt-ceo", "template": "lowerThird", "props": { "name": "…", "role": "…" } },
//   { "name": "title", "template": "title", "props": { "title": "…", "subtitle": "…" } },
//   { "name": "q1", "template": "quote", "props": { "quote": "…", "author": "…" } } ] }
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? ".");
const cardsFile = resolve(process.argv[3] ?? join(dir, "cards.json"));
const outIdx = process.argv.indexOf("--out");
const outDir = resolve(dir, outIdx > 0 ? process.argv[outIdx + 1] : "public/cards");
const require = createRequire(join(dir, "package.json"));

let satori, Resvg, fontDir;
try {
  const sm = await import(require.resolve("satori"));
  satori = typeof sm.default === "function" ? sm.default : sm.default?.default ?? sm.satori;
  ({ Resvg } = await import(require.resolve("@resvg/resvg-js")));
  fontDir = join(dirname(require.resolve("@fontsource/inter/package.json")), "files");
} catch {
  console.error("Missing deps. In the project run:\n  npm i -D satori@0.63.2 @resvg/resvg-js@2.6.2 @fontsource/inter@5.3.0");
  process.exit(1);
}

// Satori needs TTF/OTF/WOFF (not WOFF2). Fontsource ships Inter split into subsets;
// each subset gets its own family name and FAMILY lists them as a fallback chain,
// so Vietnamese diacritics resolve to the vietnamese subset.
const SUBSETS = ["latin", "latin-ext", "vietnamese"];
const FAMILY = SUBSETS.map((s) => `Inter-${s}`).join(", ");
const fonts = [];
for (const weight of [400, 800]) {
  for (const subset of SUBSETS) {
    fonts.push({ name: `Inter-${subset}`, weight, style: "normal", data: readFileSync(join(fontDir, `inter-${subset}-${weight}-normal.woff`)) });
  }
}

const spec = JSON.parse(readFileSync(cardsFile, "utf8"));
const C = { bg: "#0B1020", surface: "#161D3A", primary: "#6C8CFF", accent: "#FFB547", text: "#F5F7FF", muted: "#9AA3C7", ...(spec.theme?.colors ?? {}) };

// Tiny h() so templates read like JSX without a build step.
const h = (type, style, ...children) => ({ type, props: { style: { display: "flex", fontFamily: FAMILY, ...style }, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false) } });

// Note: in Satori, padding on the ROOT adds to its width/height, so roots carry no
// padding — inner boxes are positioned with absolute offsets or margins instead.
const templates = {
  thumbnail: ({ title, kicker, badge }, W, H) =>
    h("div", { width: W, height: H, background: `linear-gradient(135deg, ${C.bg} 0%, ${C.surface} 100%)`, position: "relative" },
      h("div", { position: "absolute", left: W * 0.06, top: 0, width: W * 0.82, height: H, flexDirection: "column", justifyContent: "center" },
        kicker ? h("div", { color: C.accent, fontSize: W * 0.03, fontWeight: 800, letterSpacing: 4, marginBottom: 16 }, kicker.toUpperCase()) : null,
        h("div", { color: C.text, fontSize: W * 0.085, fontWeight: 800, lineHeight: 1.05, flexWrap: "wrap" }, title),
      ),
      badge ? h("div", { position: "absolute", top: W * 0.04, right: W * 0.04, background: C.accent, color: C.bg, fontSize: W * 0.03, fontWeight: 800, padding: "8px 20px", borderRadius: 12 }, badge) : null,
      h("div", { position: "absolute", bottom: 0, left: 0, width: W, height: H * 0.025, background: C.primary }),
    ),
  title: ({ title, subtitle }, W, H) =>
    h("div", { width: W, height: H, background: C.bg, flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" },
      h("div", { color: C.text, fontSize: Math.min(W, H) * 0.1, fontWeight: 800, maxWidth: W * 0.85, flexWrap: "wrap", justifyContent: "center" }, title),
      subtitle ? h("div", { color: C.muted, fontSize: Math.min(W, H) * 0.045, marginTop: 20 }, subtitle) : null,
    ),
  lowerThird: ({ name, role }, W, H) =>
    // Transparent background → overlay it in Remotion with <Img>.
    h("div", { width: W, height: H, position: "relative" },
      h("div", { position: "absolute", left: W * 0.05, bottom: H * 0.1, flexDirection: "column", background: C.surface, borderLeft: `10px solid ${C.accent}`, padding: "20px 36px" },
        h("div", { color: C.text, fontSize: H * 0.05, fontWeight: 800 }, name),
        role ? h("div", { color: C.muted, fontSize: H * 0.032 }, role) : null,
      ),
    ),
  quote: ({ quote, author }, W, H) =>
    h("div", { width: W, height: H, background: C.surface, position: "relative" },
      h("div", { position: "absolute", left: W * 0.08, top: 0, width: W * 0.84, height: H, flexDirection: "column", justifyContent: "center" },
        h("div", { color: C.accent, fontSize: W * 0.15, fontWeight: 800, lineHeight: 0.8 }, "“"),
        h("div", { color: C.text, fontSize: W * 0.05, fontWeight: 800, lineHeight: 1.25, flexWrap: "wrap" }, quote),
        author ? h("div", { color: C.muted, fontSize: W * 0.03, marginTop: 30 }, `— ${author}`) : null,
      ),
    ),
};

const defaults = { thumbnail: [1280, 720], title: [1920, 1080], lowerThird: [1920, 1080], quote: [1080, 1080] };
mkdirSync(outDir, { recursive: true });
for (const card of spec.cards) {
  const tpl = templates[card.template];
  if (!tpl) {
    console.error(`✗ ${card.name}: unknown template "${card.template}" (have: ${Object.keys(templates).join(", ")})`);
    continue;
  }
  const [W, H] = [card.width ?? defaults[card.template][0], card.height ?? defaults[card.template][1]];
  const svg = await satori(tpl(card.props ?? {}, W, H), { width: W, height: H, fonts });
  writeFileSync(join(outDir, `${card.name}.svg`), svg);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
  writeFileSync(join(outDir, `${card.name}.png`), png);
  console.log(`✓ ${card.name} (${card.template} ${W}×${H}) → ${outDir}/${card.name}.{svg,png}`);
}
