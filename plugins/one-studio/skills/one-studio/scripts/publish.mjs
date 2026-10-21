#!/usr/bin/env node
// Gate 10: deliver. Extra aspect ratios (studio.json → format.exports or --ratios), a thumbnail per
// ratio, a contact sheet per extra ratio, and out/manifest.json describing everything delivered.
//   node publish.mjs <project-dir> [--ratios 9:16,1:1] [--thumb-title "…"] [--thumb-subtitle "…"] [--no-thumbnail]
// Extra ratios re-render scenes from the same sources at the new size (cached per scene and ratio);
// Remotion scenes are fitted from their main clip. Audio and captions are shared with the main video.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ASPECTS, GATES, TEMPLATE_DIR, fileHash, isMain, loadProject, now, parseArgs, sceneEngine } from "./lib/project.mjs";
import { gateInputHash, gateProblems, outputPath } from "./lib/gates.mjs";
import { encodeSettings, normalize, probe, run } from "./lib/ffmpeg.mjs";
import { ENGINES } from "./lib/engines.mjs";
import { escapeHtml } from "./lib/scenes.mjs";
import { fitClip, ratioTag, variantHash, variantRoot } from "./lib/variants.mjs";
import { planRender } from "./render-changed-scenes.mjs";
import { assemble } from "./concat-and-mix.mjs";
import { contactSheet } from "./keyframe-stills.mjs";

const hf = (project, args) => run(process.platform === "win32" ? "npx.cmd" : "npx", ["--yes", `hyperframes@${project.studio.engine.versions?.hyperframes ?? "0.8.181"}`, ...args]);

function renderVariant(project, aspect, log) {
  const tag = ratioTag(aspect);
  const size = ASPECTS[aspect];
  const settings = { ...encodeSettings(project.studio, "final"), ...size };
  const root = variantRoot(project, aspect);
  const dir = join(project.root, project.studio.render?.out_dir ?? "out", tag, "scenes");
  mkdirSync(dir, { recursive: true });
  const mainPlan = planRender(project, { mode: "final" });
  const clips = [];
  for (const item of mainPlan) {
    const scene = item.scene;
    const vh = variantHash(project, scene, aspect);
    const clip = join(dir, `${scene.id}-${vh}.mp4`);
    if (!existsSync(clip)) {
      const raw = join(dir, `${scene.id}-${vh}.raw.mp4`);
      const engine = sceneEngine(scene, project.studio);
      if (engine === "hyperframes") ENGINES.hyperframes.render(project, scene, raw, { mode: "final", root });
      else if (engine === "lemo") ENGINES.lemo.render(project, scene, raw, { size });
      else fitClip(join(project.root, item.clip), raw, { ...size, fps: settings.fps });
      normalize(raw, clip, settings);
      rmSync(raw, { force: true });
      log(`✓ ${tag} ${scene.id} rendered`);
    } else log(`· ${tag} ${scene.id} cached`);
    clips.push(clip);
  }
  rmSync(root, { recursive: true, force: true });
  return { clips, settings, dir };
}

function thumbnail(project, aspect, { title, subtitle }, outFile) {
  const size = ASPECTS[aspect];
  const stage = join(project.root, ".one-studio", "stage", `thumb-${ratioTag(aspect)}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  symlinkSync(join(project.root, "assets"), join(stage, "assets"), "dir");
  const head = readFileSync(join(TEMPLATE_DIR, "scenes", "_head.html"), "utf8");
  const body = readFileSync(join(TEMPLATE_DIR, "scenes", "thumbnail.html"), "utf8");
  const logo = existsSync(join(project.root, "assets", "brand", "logo.svg")) ? '<img class="os-logo-corner" src="../assets/brand/logo.svg" />' : "";
  const vars = { id: "thumb", type: "thumbnail", lang: project.studio.meta.language, ...size, duration: 2, transition_in: "cut", transition_out: "cut", transition_duration: 0, headline: escapeHtml(title), subline: escapeHtml(subtitle ?? ""), logo, extra_head: "" };
  const html = (head + body).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m)).replace(/(["'(])\.\.\/assets\//g, "$1./assets/");
  writeFileSync(join(stage, "index.html"), html);
  const shots = join(stage, "shots");
  hf(project, ["snapshot", stage, "--at", "1", "--no-end", "-o", shots, "--describe", "false"]);
  const png = join(shots, "frame-00-at-1s.png");
  mkdirSync(join(outFile, ".."), { recursive: true });
  run("ffmpeg", ["-y", "-v", "error", "-i", png, "-vf", `scale='min(1920,iw)':-2`, "-q:v", "2", outFile]);
  rmSync(stage, { recursive: true, force: true });
  return outFile;
}

function sheetFromClips(clips, ids, out) {
  const rows = [];
  const tmp = `${out}.frames`;
  mkdirSync(tmp, { recursive: true });
  clips.forEach((c, i) => {
    const t = probe(c).duration / 2;
    const f = join(tmp, `${ids[i]}.png`);
    run("ffmpeg", ["-y", "-v", "error", "-ss", String(t), "-i", c, "-frames:v", "1", f]);
    rows.push({ id: ids[i], times: [Math.round(t * 10) / 10], stills: [f] });
  });
  // One row per scene is too tall for portrait; lay scenes out horizontally instead.
  const flat = [{ id: "", times: rows.map((r) => r.times[0]), stills: rows.map((r) => r.stills[0]), labels: rows.map((r) => `${r.id} · ${r.times[0]}s`) }];
  contactSheet(rows.length > 1 ? flat : rows, out, { tileWidth: 360 });
  rmSync(tmp, { recursive: true, force: true });
  return out;
}

export function publish(dir, { ratios = null, thumb = true, title = null, subtitle = null, log = () => {} } = {}) {
  const project = loadProject(dir);
  const renderGate = GATES.find((g) => g.id === "render");
  const problems = gateProblems(project, renderGate);
  if (problems.length) throw new Error(`Final video is not ready:\n  ${problems.join("\n  ")}`);
  const main = project.studio.format.aspect;
  const wanted = (ratios ?? project.studio.format.exports ?? [main]).filter((r) => r !== main);
  for (const r of wanted) if (!ASPECTS[r]) throw new Error(`unknown aspect ${r}; use ${Object.keys(ASPECTS).join(", ")}`);
  const name = project.studio.meta.name;
  const outDir = join(project.root, project.studio.render?.out_dir ?? "out");
  const deliverables = [];

  const mainFile = outputPath(project, "final");
  const mp = probe(mainFile);
  const sidecar = mainFile.replace(/\.mp4$/, ".json");
  const mainInfo = existsSync(sidecar) ? JSON.parse(readFileSync(sidecar, "utf8")) : {};
  deliverables.push({ aspect: main, path: relative(project.root, mainFile), width: mp.video.width, height: mp.video.height, duration: mp.duration, lufs: mainInfo.lufs ?? null });

  for (const aspect of wanted) {
    const { clips, settings, dir: clipDir } = renderVariant(project, aspect, log);
    const out = join(outDir, `${name}-${ratioTag(aspect)}.mp4`);
    const r = assemble(project, clips, settings, out, { log });
    const sheet = sheetFromClips(clips, (project.storyboard?.scenes ?? []).map((s) => s.id), join(clipDir, "..", "sheet.jpg"));
    deliverables.push({ aspect, path: relative(project.root, out), width: r.video.width, height: r.video.height, duration: r.duration, lufs: r.lufs, sheet: relative(project.root, sheet) });
    log(`✓ ${aspect} → ${relative(project.root, out)}`);
  }

  const thumbs = [];
  if (thumb) {
    const series = project.studio.meta.series ? `${project.studio.meta.series}${project.studio.meta.episode ? ` · tập ${project.studio.meta.episode}` : ""}` : "";
    for (const aspect of [main, ...wanted]) {
      const f = thumbnail(project, aspect, { title: title ?? project.studio.meta.title ?? name, subtitle: subtitle ?? series }, join(outDir, `${name}-thumb-${ratioTag(aspect)}.jpg`));
      thumbs.push({ aspect, path: relative(project.root, f) });
      log(`✓ thumbnail ${aspect}`);
    }
  }

  for (const d of deliverables) {
    const abs = join(project.root, d.path);
    Object.assign(d, { bytes: statSync(abs).size, sha256: fileHash(abs) });
  }
  const manifest = {
    name,
    title: project.studio.meta.title ?? name,
    language: project.studio.meta.language,
    series: project.studio.meta.series ?? null,
    episode: project.studio.meta.episode ?? null,
    brand: project.brand ? { name: project.brand.name, version: project.brand.version } : null,
    published: now(),
    videos: deliverables,
    thumbnails: thumbs,
    captions: existsSync(mainFile.replace(/\.mp4$/, ".srt")) ? relative(project.root, mainFile.replace(/\.mp4$/, ".srt")) : null,
    scenes: (mainInfo.scenes ?? []).map(({ id, hash }) => ({ id, hash })),
    audio: mainInfo.audio ?? null,
  };
  const manifestPath = outputPath(project, "manifest");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  project.studio.outputs ??= {};
  project.studio.outputs.publish = { path: relative(project.root, manifestPath), hash: gateInputHash(project, { id: "publish" }), at: now() };
  project.save();
  return { manifest, manifestPath };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["no-thumbnail", "help"], options: ["ratios", "thumb-title", "thumb-subtitle"] });
    const dir = args._[0];
    if (args.help || !dir) {
      console.log('usage: publish.mjs <project-dir> [--ratios 9:16,1:1] [--thumb-title "…"] [--thumb-subtitle "…"] [--no-thumbnail]');
      process.exit(dir ? 0 : 1);
    }
    const r = publish(dir, {
      ratios: args.ratios ? args.ratios.split(",").map((s) => s.trim()) : null,
      thumb: !args["no-thumbnail"],
      title: args["thumb-title"],
      subtitle: args["thumb-subtitle"],
      log: console.log,
    });
    console.log(`✓ ${r.manifestPath}`);
    for (const v of r.manifest.videos) console.log(`  ${v.aspect.padEnd(5)} ${v.path}  ${v.width}x${v.height} ${v.duration.toFixed(2)}s${v.lufs != null ? ` ${v.lufs} LUFS` : ""}`);
    for (const t of r.manifest.thumbnails) console.log(`  thumb ${t.aspect.padEnd(5)} ${t.path}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

