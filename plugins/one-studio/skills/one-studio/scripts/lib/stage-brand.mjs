// Staging folder for rendering scenes under a brand that is not the project's own (preset or style trial).
// The folder gets its own assets/brand.css + fonts, symlinks to the project's other assets, and copies of the scenes,
// so nothing in the project (assets, scenes, approvals) is touched. Used by compare-presets and style-compare.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_VERSIONS, TEMPLATE_DIR, linkSharedDirs } from "./project.mjs";
import { run } from "./ffmpeg.mjs";
import { vendorGsap, vendorHowler } from "./vendor.mjs";
import { brandToCss } from "../brand-to-css.mjs";
import { stripRatioStyles } from "./hash.mjs";

// Generated per brand, so never linked from the project.
const OWN = new Set(["brand.css", "brand.js", "fonts", "brand"]);
const RUNTIME = ["os.css", "os.js", "camera.js", "screen.js"];

// A project that is not prepared yet (gate 0) lacks the scene runtime: fill in what the symlinks did not bring.
function ensureRuntime(assets) {
  const tpl = join(TEMPLATE_DIR, "hyperframes-project", "assets");
  for (const f of RUNTIME) if (!existsSync(join(assets, f))) copyFileSync(join(tpl, f), join(assets, f));
  const vendor = join(assets, "vendor");
  const linked = existsSync(vendor) && lstatSync(vendor).isSymbolicLink();
  if (!linked) {
    if (!existsSync(join(vendor, "gsap.min.js"))) vendorGsap(assets);
    if (!existsSync(join(vendor, "howler.core.min.js"))) vendorHowler(assets);
  }
  if (!existsSync(join(assets, "audio-cues.js"))) writeFileSync(join(assets, "audio-cues.js"), "window.OS_CUES = {};\n");
}

// scenes: [{ id, file }] (copied) or [{ id, html }] (written), with only `aspect`'s <style data-ratio> blocks
// left in (default: the project's ratio). Returns { root, warning }.
// Fonts that cannot be fetched fall back to the system stack with a warning, unless `offline` (then it throws).
export function stageBrand(project, { root, brand, scenes, offline = false, label = brand.name, aspect = project.studio.format.aspect }) {
  rmSync(root, { recursive: true, force: true });
  const assets = join(root, "assets");
  mkdirSync(join(root, "scenes"), { recursive: true });
  mkdirSync(join(assets, "fonts"), { recursive: true });
  const src = join(project.root, "assets");
  for (const entry of existsSync(src) ? readdirSync(src) : []) if (!OWN.has(entry)) symlinkSync(join(src, entry), join(assets, entry));
  linkSharedDirs(project.root, root);
  for (const f of existsSync(join(src, "fonts")) ? readdirSync(join(src, "fonts")) : []) copyFileSync(join(src, "fonts", f), join(assets, "fonts", f));
  let warning = null;
  try {
    brandToCss({ brand, brandPath: project.brandPath, root }, { offline, assetsDir: assets });
  } catch (err) {
    if (offline) throw err;
    warning = `${label}: fonts unavailable (${err.message.split("\n")[0]}), using fallbacks`;
    brandToCss({ brand, brandPath: project.brandPath, root }, { offline: true, assetsDir: assets });
  }
  ensureRuntime(assets);
  for (const s of scenes) {
    const html = s.html !== undefined ? s.html : readFileSync(s.file, "utf8");
    writeFileSync(join(root, "scenes", `${s.id}.html`), stripRatioStyles(html, aspect));
  }
  const hf = join(project.root, "hyperframes.json");
  writeFileSync(join(root, "hyperframes.json"), existsSync(hf) ? readFileSync(hf) : "{}\n");
  return { root, warning };
}

// PNG stills of a staged folder at the given times (seconds on its index.html timeline), in time order.
export function snapshotStills(project, root, times) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const shots = join(root, "shots");
  run(npx, ["--yes", `hyperframes@${project.studio.engine?.versions?.hyperframes ?? ENGINE_VERSIONS.hyperframes}`, "snapshot", root, "--at", times.join(","), "--no-end", "-o", shots, "--describe", "false"]);
  return readdirSync(shots).filter((f) => f.endsWith(".png")).sort().map((f) => join(shots, f));
}
