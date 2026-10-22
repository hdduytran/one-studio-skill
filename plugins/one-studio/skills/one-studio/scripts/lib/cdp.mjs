// Minimal Chrome DevTools Protocol client over Node's built-in WebSocket (Node 22+): no browser-automation package.
// Chrome is the same headless shell HyperFrames uses; override with ONE_STUDIO_CHROME.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const SYSTEM_CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

// The headless shell HyperFrames downloads (`hyperframes browser ensure`) lives under ~/.cache/hyperframes/chrome.
function hyperframesCache() {
  const base = join(homedir(), ".cache", "hyperframes", "chrome", "chrome-headless-shell");
  if (!existsSync(base)) return [];
  const out = [];
  for (const v of readdirSync(base).sort().reverse()) {
    for (const d of readdirSync(join(base, v))) out.push(join(base, v, d, process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell"));
  }
  return out;
}

export function findChrome() {
  const env = [process.env.ONE_STUDIO_CHROME, process.env.HYPERFRAMES_BROWSER_PATH, process.env.PLAYWRIGHT_CHROME].filter(Boolean);
  return [...env, ...hyperframesCache(), ...SYSTEM_CHROME].find((p) => existsSync(p)) ?? null;
}

export const cdpAvailable = () => typeof WebSocket === "function";

export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id) {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        if (m.error) p.reject(new Error(`${p.method}: ${m.error.message}`));
        else p.resolve(m.result);
      } else for (const l of [...this.listeners]) l(m);
    });
    ws.addEventListener("close", () => this.pending.forEach((p) => p.reject(new Error("browser connection closed"))));
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(handler) {
    this.listeners.push(handler);
    return () => (this.listeners = this.listeners.filter((l) => l !== handler));
  }

  // Resolves with the first event matching `match`, or rejects after `ms` of real time.
  waitFor(match, ms, what) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`timed out after ${ms} ms waiting for ${what}`));
      }, ms);
      const off = this.on((m) => {
        if (!match(m)) return;
        clearTimeout(timer);
        off();
        resolve(m);
      });
    });
  }
}

// Starts Chrome with a throw-away profile and returns { cdp, close }.
export async function launchChrome({ width, height, args: extra = [] } = {}) {
  if (!cdpAvailable()) throw new Error(`Screen capture needs Node 22+ (global WebSocket); this is ${process.version}.`);
  const exe = findChrome();
  if (!exe) throw new Error("No Chrome found for screen capture. Run `npx hyperframes@0.8.181 browser ensure` or set ONE_STUDIO_CHROME / HYPERFRAMES_BROWSER_PATH.");
  const profile = mkdtempSync(join(tmpdir(), "one-studio-chrome-"));
  const args = ["--headless", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars", "--mute-audio", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--force-color-profile=srgb", "--font-render-hinting=none", `--window-size=${width ?? 1440},${height ?? 900}`, ...extra, "about:blank"];
  const proc = spawn(exe, args, { stdio: ["ignore", "ignore", "pipe"] });
  const url = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error(`Chrome did not start within 20 s (${exe})`)), 20000);
    proc.stderr.on("data", (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on("exit", (code) => reject(new Error(`Chrome exited (${code}) before it was ready:\n${buf.slice(-400)}`)));
  });
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("cannot connect to Chrome DevTools")), { once: true });
  });
  return {
    cdp: new Cdp(ws),
    close() {
      try { ws.close(); } catch { /* already closed */ }
      proc.kill("SIGTERM");
      setTimeout(() => proc.kill("SIGKILL"), 2000).unref();
      rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}
