#!/usr/bin/env node
// Proposals that make an extracted style better; only what the user accepts is applied.
//   node style-enhance.mjs <project-dir> <slug> [--no-sheet] [--offline]    list numbered proposals + before/after sheet
//   node style-enhance.mjs <project-dir> <slug> --accept 1,3|all            write them to style.enhance.json (variants/<v>.json, parts/)
//   node style-enhance.mjs <project-dir> <slug> --reject 2                   never propose these rules again
// Sheet: review/style-<slug>-enhance.jpg, one row per proposal that changes how a sample looks (before | after).
// The numbers are positions in the list the same command prints, so list first, then accept. Rules and thresholds:
// skills/style-extract/references/enhance-rules.md. Re-running after an accept lists only what is left.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ASPECTS, isMain, loadProject, now, parseArgs } from "./lib/project.mjs";
import { applyLayer, clone, composeLayers, loadLayers, mergeLayerInto, readLayer, writeLayer } from "./lib/style-layers.mjs";
import { enhanceContext, proposeEnhancements } from "./lib/style-enhance.mjs";
import { partHtml } from "./lib/style-enhance-parts.mjs";
import { mergeBrandPatch, styleDir, styleErrors } from "./lib/style-refs.mjs";
import { renderSamples, renderScenes } from "./lib/style-samples.mjs";
import { contactSheet } from "./keyframe-stills.mjs";

const brandOf = (project, style, slug) => ({ ...mergeBrandPatch(project.brand, style.brand), name: `${project.brand.name} · ${slug}` });

// "1,3" / "all" -> proposals; refuses numbers outside the list.
export function pick(proposals, spec) {
  if (spec === "all") return proposals;
  const nums = String(spec).split(",").map((s) => Number(s.trim()));
  const bad = nums.filter((n) => !Number.isInteger(n) || n < 1 || n > proposals.length);
  if (bad.length || !nums.length) throw new Error(`pick numbers from 1 to ${proposals.length} (or "all"), got "${spec}"`);
  return [...new Set(nums)].map((n) => proposals[n - 1]);
}

// Writes the accepted proposals. Everything is validated first, so a refusal writes nothing.
export function acceptProposals(project, ctx, picked) {
  const slug = ctx.slug;
  const { base, layers } = loadLayers(project, slug);
  const enhance = clone(readLayer(project, slug, "enhance"));
  const custom = clone(readLayer(project, slug, "custom"));
  const variants = {};
  const parts = [];
  for (const p of picked) {
    mergeLayerInto(enhance, p.patch);
    enhance.applied = [...(enhance.applied ?? []), { id: p.id, title: p.title, at: now() }];
    for (const [name, patch] of Object.entries(p.variants ?? {})) variants[name] = mergeLayerInto(clone(readLayer(project, slug, name)), patch);
    if (p.locks) custom.locked = [...new Set([...(custom.locked ?? []), ...p.locks])].sort();
    parts.push(...(p.parts ?? []));
  }
  const checked = composeLayers(base, layers.map(([n]) => [n, n === "enhance" ? enhance : n === "custom" ? custom : {}]));
  const errors = [...styleErrors(checked, { slug, brand: project.brand }), ...Object.values(variants).flatMap((v) => styleErrors(applyLayer(checked, v), { slug, brand: project.brand }))];
  if (errors.length) throw new Error(`Refused, nothing written:\n  ${errors.join("\n  ")}`);
  const files = [writeLayer(project, slug, "enhance", enhance)];
  if (custom.locked) files.push(writeLayer(project, slug, "custom", custom));
  for (const [name, layer] of Object.entries(variants)) files.push(writeLayer(project, slug, name, layer));
  if (parts.length) {
    const dir = join(styleDir(project, slug), "parts");
    mkdirSync(dir, { recursive: true });
    const { width, height } = ASPECTS[project.studio.format.aspect];
    const brand = brandOf(project, composeLayers(base, [["enhance", enhance]]), slug);
    for (const kind of new Set(parts)) {
      const dims = kind === "thumbnail" ? ASPECTS["16:9"] : { width, height };
      const file = join(dir, `${kind}.html`);
      writeFileSync(file, partHtml(kind, { ...dims, lang: ctx.lang, brand }).html);
      files.push(file);
    }
  }
  return files;
}

export function rejectProposals(project, slug, picked) {
  const enhance = readLayer(project, slug, "enhance");
  enhance.rejected = [...new Set([...(enhance.rejected ?? []), ...picked.map((p) => p.id)])].sort();
  return writeLayer(project, slug, "enhance", enhance);
}

// Before/after rows for the proposals that change a sample. -> { sheet, rows: [{ n, id, tiles }] }
export function enhanceSheet(project, ctx, proposals, { offline = false } = {}) {
  const base = join(project.root, ".one-studio", "enhance");
  const defaultRatio = project.studio.format.aspect;
  const cache = new Map();
  const before = (ratio, id) => {
    const key = `${ratio}`;
    if (!cache.has(key)) cache.set(key, renderSamples(project, brandOf(project, ctx.style, ctx.slug), { root: join(base, `before-${ratio.replace(":", "x")}`), ratio, offline, label: ctx.slug }).stills);
    return cache.get(key)[id];
  };
  const rows = [];
  const lang = ctx.lang;
  try {
    proposals.forEach((p, i) => {
      if (!p.sample) return;
      const n = i + 1;
      const ratio = p.ratio ?? defaultRatio;
      const root = join(base, `item-${n}`);
      if (p.sample === "parts") {
        const kinds = p.parts.filter((k) => k !== "thumbnail").slice(0, 2);
        if (!kinds.length) return;
        const { width, height } = ASPECTS[ratio];
        const brand = brandOf(project, ctx.style, ctx.slug);
        const scenes = kinds.map((k) => ({ id: k, html: partHtml(k, { width, height, lang, brand }).html }));
        const r = renderScenes(project, brand, scenes, { root, ratio, offline, label: ctx.slug });
        rows.push({ n, id: p.id, stills: kinds.map((k) => r.stills[k]), labels: kinds.map((k) => `#${n} ${p.id} · ${k}`) });
        return;
      }
      const afterStyle = applyLayer(ctx.style, p.variants ? Object.values(p.variants)[0] : p.patch);
      const after = renderSamples(project, brandOf(project, afterStyle, ctx.slug), { root, ratio, offline, only: [p.sample], label: ctx.slug }).stills[p.sample];
      rows.push({ n, id: p.id, stills: [before(ratio, p.sample), after], labels: [`#${n} ${p.id} · before`, `#${n} ${p.id} · after`] });
    });
    if (!rows.length) return { sheet: null, rows: [] };
    mkdirSync(join(project.root, "review"), { recursive: true });
    const sheet = contactSheet(rows.map((r) => ({ id: r.id, times: r.stills.map(() => ""), stills: r.stills, labels: r.labels })), join(project.root, "review", `style-${ctx.slug}-enhance.jpg`), { tileWidth: ASPECTS[defaultRatio].width >= ASPECTS[defaultRatio].height ? 400 : 240 });
    return { sheet, rows: rows.map((r) => ({ n: r.n, id: r.id, tiles: r.labels })) };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["help", "no-sheet", "offline"], options: ["accept", "reject"] });
    const [dir, slug] = args._;
    if (args.help || !dir || !slug) {
      console.log("usage: style-enhance.mjs <project-dir> <slug> [--accept 1,3|all] [--reject 2] [--no-sheet] [--offline]");
      process.exit(dir && slug ? 0 : 1);
    }
    const project = loadProject(dir);
    if (!project.brand) throw new Error("brand.json not found; run init-project.mjs first");
    const ctx = enhanceContext(project, slug);
    const proposals = proposeEnhancements(ctx);
    const vi = ctx.vi;
    if (args.accept || args.reject) {
      if (args.accept) {
        const files = acceptProposals(project, ctx, pick(proposals, args.accept));
        console.log(`${vi ? "Đã nhận" : "Accepted"}: ${files.map((f) => relative(project.root, f)).join(", ")}`);
      }
      if (args.reject) console.log(`${vi ? "Đã bỏ qua (không đề xuất lại)" : "Rejected (not proposed again)"}: ${relative(project.root, rejectProposals(project, slug, pick(proposals, args.reject)))}`);
      console.log(vi ? "Tiếp theo: style-compare.mjs, rồi hỏi người dùng." : "Next: style-compare.mjs, then ask the user.");
      process.exit(0);
    }
    if (!proposals.length) {
      console.log(vi ? "Không có đề xuất nào: style đã ổn với các luật hiện có." : "No proposals: the style passes every rule.");
      process.exit(0);
    }
    proposals.forEach((p, i) => console.log(`${i + 1}. [${p.id}] ${p.title}\n   ${p.why}`));
    if (!args["no-sheet"]) {
      const { sheet, rows } = enhanceSheet(project, ctx, proposals, { offline: args.offline });
      if (sheet) {
        console.log(`Sheet: ${relative(process.cwd(), sheet) || sheet}`);
        rows.forEach((r, i) => console.log(`  row ${i + 1} left to right: ${r.tiles.join(" | ")}`));
      }
      const plain = proposals.map((p, i) => (p.sample ? null : `${i + 1} ${p.id}`)).filter(Boolean);
      if (plain.length) console.log(`${vi ? "Không có ảnh (đổi số/khoá)" : "No picture (numbers or locks)"}: ${plain.join(", ")}`);
    }
    console.log(vi ? "Giải thích từng mục bằng lời thường, hỏi người dùng nhận mục nào, rồi: style-enhance.mjs <dir> <slug> --accept 1,3 (hoặc --reject)." : "Explain each in plain words, ask which to accept, then: style-enhance.mjs <dir> <slug> --accept 1,3 (or --reject).");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
