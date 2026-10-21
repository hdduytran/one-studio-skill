// Pinned third-party runtime files, fetched once from npm into a local cache and copied
// into each project, so renders never touch the network and stay reproducible.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export const PINS = {
  gsap: "3.14.2",
  howler: "2.2.4",
  "lottie-web": "5.13.0",
  svgo: "4.1.0",
  three: "0.170.0",
};

export const cacheDir = () => process.env.ONE_STUDIO_CACHE ?? join(homedir(), ".cache", "one-studio");

// Returns the package folder inside the cache, installing it on first use.
export function ensurePackage(name, version) {
  const prefix = join(cacheDir(), "npm", `${name.replace("/", "+")}@${version}`);
  const pkgDir = join(prefix, "node_modules", name);
  if (existsSync(join(pkgDir, "package.json"))) return pkgDir;
  mkdirSync(prefix, { recursive: true });
  try {
    execFileSync("npm", ["install", "--prefix", prefix, "--no-save", "--no-audit", "--no-fund", "--ignore-scripts", `${name}@${version}`], {
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (err) {
    throw new Error(`Could not install ${name}@${version} into ${prefix}: ${err.stderr?.toString().trim() || err.message}`);
  }
  return pkgDir;
}

export function copyInto(src, destDir, name = basename(src)) {
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, name);
  copyFileSync(src, dest);
  return dest;
}

// Vendor the GSAP core into <assets>/vendor. Plugins we need (none by default) can be added by name.
export function vendorGsap(assetsDir, plugins = []) {
  const pkg = ensurePackage("gsap", PINS.gsap);
  const out = [copyInto(join(pkg, "dist", "gsap.min.js"), join(assetsDir, "vendor"))];
  for (const p of plugins) out.push(copyInto(join(pkg, "dist", `${p}.min.js`), join(assetsDir, "vendor")));
  return out;
}

// howler.js (MIT): audio in the local review/picker page and the studio preview of SFX cues.
// Never used for the delivered mix (FFmpeg builds it in concat-and-mix).
export function vendorHowler(assetsDir) {
  const pkg = ensurePackage("howler", PINS.howler);
  return copyInto(join(pkg, "dist", "howler.core.min.js"), join(assetsDir, "vendor"));
}

export function vendorLottie(assetsDir) {
  const pkg = ensurePackage("lottie-web", PINS["lottie-web"]);
  return copyInto(join(pkg, "build", "player", "lottie_svg.min.js"), join(assetsDir, "vendor"), "lottie.min.js");
}

export function vendorThree(assetsDir) {
  const pkg = ensurePackage("three", PINS.three);
  return copyInto(join(pkg, "build", "three.module.min.js"), join(assetsDir, "vendor"));
}

const KEEP_SUBSETS = ["latin", "latin-ext", "vietnamese"];

// Copy a @fontsource font (spec "inter@5.2.8") for the given weights.
// Returns @font-face CSS pointing at fonts/<file> relative to the assets folder.
export function vendorFontsource(spec, weights, assetsDir) {
  const m = /^([a-z0-9-]+)@(\d+\.\d+\.\d+)$/.exec(spec);
  if (!m) throw new Error(`fontsource must look like "inter@5.2.8", got "${spec}"`);
  const pkg = ensurePackage(`@fontsource/${m[1]}`, m[2]);
  const css = [];
  for (const w of [...new Set(weights)]) {
    const file = join(pkg, `${w}.css`);
    if (!existsSync(file)) throw new Error(`@fontsource/${m[1]} has no weight ${w}`);
    for (const block of readFileSync(file, "utf8").split(/(?=\/\*)/)) {
      const subset = /\/\*\s*[a-z0-9-]+?-((?:latin-ext|latin|vietnamese))-\d+-normal\s*\*\//.exec(block);
      if (!subset || !KEEP_SUBSETS.includes(subset[1])) continue;
      const woff2 = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)[1];
      copyInto(join(pkg, "files", woff2), join(assetsDir, "fonts"));
      css.push(
        block
          .replace(/src:[^;]+;/, `src: url(fonts/${woff2}) format('woff2');`)
          .replace("font-display: swap;", "font-display: block;")
          .trim(),
      );
    }
  }
  return css.join("\n\n");
}

export function svgoBin() {
  const pkg = ensurePackage("svgo", PINS.svgo);
  return join(dirname(dirname(pkg)), ".bin", "svgo");
}
