#!/usr/bin/env node
// Prepare project assets for rendering:
//   - every *.svg under assets/ (except vendor/, fonts/) is optimised with SVGO (multipass, ids kept for animation)
//   - every Lottie *.json / *.lottie under assets/ becomes assets/lottie/<name>.js (window.LOTTIE[name] = data),
//     so scenes load animation data synchronously (no fetch, deterministic first frame)
//   node optimize-assets.mjs <project-dir> [--no-svgo]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { isMain, parseArgs } from "./lib/project.mjs";
import { svgoBin } from "./lib/vendor.mjs";

const SKIP = new Set(["vendor", "fonts", "lottie", "brand"]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP.has(name)) walk(p, out);
    } else out.push(p);
  }
  return out;
}

const SVGO_CONFIG = `export default {
  multipass: true,
  plugins: [
    { name: "preset-default", params: { overrides: { cleanupIds: false, removeViewBox: false } } },
  ],
};
`;

function lottieFromZip(path) {
  // .lottie = zip with animations/<id>.json; read it with Python's zipfile (always present with FFmpeg setups).
  const code = "import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);n=[x for x in z.namelist() if x.startswith('animations/') and x.endswith('.json')];sys.stdout.write(z.read(n[0]).decode('utf-8'))";
  return execFileSync("python3", ["-I", "-c", code, path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const isLottieJson = (data) => data && typeof data === "object" && "fr" in data && "op" in data && Array.isArray(data.layers);

export function optimizeAssets(root, { svgo = true } = {}) {
  const assets = join(root, "assets");
  const files = walk(assets);
  const result = { svg: [], lottie: [] };

  // anatomy figures keep their own scoped CSS and part attributes: never run SVGO over them.
  const svgs = files.filter((f) => extname(f) === ".svg" && !f.endsWith(".anatomy.svg"));
  if (svgo && svgs.length) {
    const cfgDir = join(root, ".one-studio");
    mkdirSync(cfgDir, { recursive: true });
    const cfg = join(cfgDir, "svgo.config.mjs");
    writeFileSync(cfg, SVGO_CONFIG);
    execFileSync(svgoBin(), ["--config", cfg, "--quiet", ...svgs], { stdio: ["ignore", "ignore", "pipe"] });
    result.svg = svgs.map((f) => relative(root, f));
  }

  for (const f of files.filter((f) => [".json", ".lottie"].includes(extname(f)))) {
    const text = extname(f) === ".lottie" ? lottieFromZip(f) : readFileSync(f, "utf8");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }
    if (!isLottieJson(data)) continue;
    const name = basename(f, extname(f));
    mkdirSync(join(assets, "lottie"), { recursive: true });
    writeFileSync(join(assets, "lottie", `${name}.js`), `window.LOTTIE = window.LOTTIE || {};\nwindow.LOTTIE[${JSON.stringify(name)}] = ${JSON.stringify(data)};\n`);
    result.lottie.push(name);
  }
  return result;
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["no-svgo", "help"] });
    if (args.help || !args._[0]) {
      console.log("usage: optimize-assets.mjs <project-dir> [--no-svgo]");
      process.exit(args._[0] ? 0 : 1);
    }
    const r = optimizeAssets(args._[0], { svgo: !args["no-svgo"] });
    console.log(`✓ svgo: ${r.svg.length} file(s); lottie: ${r.lottie.join(", ") || "none"}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
