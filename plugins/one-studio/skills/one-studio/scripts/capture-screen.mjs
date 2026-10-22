#!/usr/bin/env node
// Record a scripted walk through a web page as video + an event log (cursor path, click rects, typing, scroll, marks).
//   node capture-screen.mjs <project-dir> <flow-id> [--recapture]
// Needs studio.json → services.capture = true (the user's consent to open the flow URL) and Chrome + FFmpeg.
//
// How the video gets a constant frame rate: Chrome runs in real time and Page.captureScreenshot grabs frames as fast as it can
// (about 15-25 per second). Each screenshot is stamped with the recording clock; FFmpeg then lays them on a fixed fps grid
// (concat durations + the fps filter), so the video is CFR and every event time matches the picture. Page.startScreencast is
// not used (it delivers frames at variable times) and neither is virtual time (Chrome stalls screenshots after mouse input).
// Waits for page loads and for selectors happen off the record: that time is cut from the clock, so slow pages do not slow the video.
// The cursor path is a function of the seed and the clock, so the event log is reproducible; the footage itself is a fixed asset
// (re-recorded only when the flow changes or with --recapture).
// Safety: only the flow's origin is navigated (other document requests are blocked), the real cursor is hidden, and typing
// into password fields is refused.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { run } from "./lib/ffmpeg.mjs";
import { CAPTURE_VERSION, captureFiles, flowHash, loadFlow, stepKind } from "./lib/flow.mjs";
import { launchChrome } from "./lib/cdp.mjs";
import { cursorAt, easeScroll, moveSegment, pointAt, rng, seedFor } from "./lib/cursor-path.mjs";

const KEYS = {
  Enter: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
  Tab: { key: "Tab", code: "Tab", vk: 9 },
  Escape: { key: "Escape", code: "Escape", vk: 27 },
  Backspace: { key: "Backspace", code: "Backspace", vk: 8 },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  PageUp: { key: "PageUp", code: "PageUp", vk: 33 },
  PageDown: { key: "PageDown", code: "PageDown", vk: 34 },
  End: { key: "End", code: "End", vk: 35 },
  Home: { key: "Home", code: "Home", vk: 36 },
  Space: { key: " ", code: "Space", vk: 32, text: " " },
};

const r3 = (n) => Math.round(n * 1000) / 1000;
const rectOf = (r) => ({ x: r3(r.x), y: r3(r.y), w: r3(r.w), h: r3(r.h) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const captureEnabled = (project) => project.studio.services?.capture === true;
export const CONSENT_HELP = 'Screen capture opens the flow URL in a browser, so it needs your OK first. After the user agrees, set "services": { "capture": true } in studio.json and run this again.';

function storageState(project, flow) {
  if (!flow.storage_state) return null;
  const file = resolve(project.root, flow.storage_state);
  if (!existsSync(file)) throw new Error(`storage_state not found: ${file}`);
  const state = JSON.parse(readFileSync(file, "utf8"));
  if (!state || typeof state !== "object") throw new Error(`storage_state ${file} is not a Playwright storage state`);
  return state;
}

const SAME_SITE = { strict: "Strict", lax: "Lax", none: "None" };

// One recording session: owns the page, the recording clock, the screenshots and the event log.
class Recorder {
  constructor({ cdp, sessionId, flow, framesDir, random }) {
    Object.assign(this, { cdp, sessionId, flow, framesDir, random });
    this.t0 = performance.now();
    this.skipped = 0; // ms spent off the record
    this.shots = []; // { ts, file }
    this.start = { x: flow.viewport.width * 0.78, y: flow.viewport.height * 0.84 };
    this.segments = [];
    this.pos = this.start;
    this.events = { clicks: [], hovers: [], types: [], scrolls: [], marks: [], drags: [] };
  }

  send(method, params) { return this.cdp.send(method, params, this.sessionId); }
  now() { return (performance.now() - this.t0 - this.skipped) / 1000; }

  // Run something whose duration must not appear in the video (loading, waiting for a selector).
  async off(fn) {
    const a = performance.now();
    try {
      return await fn();
    } finally {
      this.skipped += performance.now() - a;
    }
  }

  async evaluate(expression) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`page script failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }

  // One screenshot, stamped with the middle of the capture call.
  async shot() {
    const a = this.now();
    const img = await this.send("Page.captureScreenshot", { format: "jpeg", quality: 92, fromSurface: true });
    const ts = (a + this.now()) / 2;
    const file = join(this.framesDir, `s${String(this.shots.length).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(img.data, "base64"));
    this.shots.push({ ts, file });
  }

  // Keep recording until the clock reaches `end`; `each` runs before every screenshot.
  async until(end, each) {
    do {
      if (each) await each();
      await this.shot();
    } while (this.now() < end);
  }

  hold(seconds) { return this.until(this.now() + seconds); }

  mouse(type, x, y, extra = {}) {
    return this.send("Input.dispatchMouseEvent", { type, x, y, button: "none", ...extra });
  }

  async element(selector, { wait = 5 } = {}) {
    const js = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
      const r = el.getBoundingClientRect(), tag = el.tagName.toLowerCase();
      return { x: r.x, y: r.y, w: r.width, h: r.height, tag, type: (el.type || '').toLowerCase(), autocomplete: (el.getAttribute('autocomplete') || '').toLowerCase(),
        editable: el.isContentEditable || tag === 'textarea' || (tag === 'input' && !['button','submit','checkbox','radio','file','image','reset','range','color'].includes((el.type || '').toLowerCase())) }; })()`;
    const deadline = performance.now() + wait * 1000;
    for (;;) {
      const info = await this.evaluate(js);
      if (info && info.w > 0 && info.h > 0) return info;
      if (performance.now() >= deadline) throw new Error(`selector not found or not visible: ${selector}`);
      await this.off(() => sleep(100));
    }
  }

  async scrollTo(y) {
    const state = await this.evaluate("({ y: scrollY, max: Math.max(0, document.documentElement.scrollHeight - innerHeight) })");
    const to = Math.min(Math.max(0, y), state.max);
    if (Math.abs(to - state.y) < 1) return;
    const t0 = this.now();
    const len = Math.min(1.2, 0.4 + Math.abs(to - state.y) / 2500);
    await this.until(t0 + len, () => this.evaluate(`scrollTo(0, ${state.y + (to - state.y) * easeScroll(Math.min(1, (this.now() - t0) / len))})`));
    await this.evaluate(`scrollTo(0, ${to})`);
    this.events.scrolls.push({ t0: r3(t0), t1: r3(this.now()), from: r3(state.y), to: r3(to) });
  }

  // Bring an element into the viewport (a visible scroll), return its fresh rect.
  async reveal(selector) {
    let info = await this.element(selector);
    const vh = this.flow.viewport.height;
    if (info.y < vh * 0.08 || info.y + info.h > vh * 0.92) {
      const y = await this.evaluate("scrollY");
      await this.scrollTo(y + info.y + info.h / 2 - vh / 2);
      info = await this.element(selector);
    }
    return info;
  }

  async moveTo(target) {
    if (Math.hypot(target.x - this.pos.x, target.y - this.pos.y) < 1) return;
    const seg = moveSegment(this.pos, target, this.now(), this.random);
    this.segments.push(seg);
    await this.until(seg.t1, async () => {
      this.pos = pointAt(seg, this.now());
      await this.mouse("mouseMoved", this.pos.x, this.pos.y);
    });
    this.pos = target;
    await this.mouse("mouseMoved", target.x, target.y);
  }

  center(info) {
    return { x: info.x + info.w / 2, y: info.y + info.h / 2 };
  }

  async click(selector) {
    const info = await this.reveal(selector);
    await this.moveTo(this.center(info));
    const t = this.now();
    await this.mouse("mousePressed", this.pos.x, this.pos.y, { button: "left", buttons: 1, clickCount: 1 });
    await this.mouse("mouseReleased", this.pos.x, this.pos.y, { button: "left", clickCount: 1 });
    this.events.clicks.push({ t: r3(t), x: r3(this.pos.x), y: r3(this.pos.y), rect: rectOf(info), selector });
    await this.hold(0.4);
  }

  async hover(selector) {
    const info = await this.reveal(selector);
    await this.moveTo(this.center(info));
    this.events.hovers.push({ t: r3(this.now()), x: r3(this.pos.x), y: r3(this.pos.y), rect: rectOf(info), selector });
    await this.hold(0.5);
  }

  async type(selector, text, cps) {
    // Refuse before anything moves: credentials are never typed by this tool.
    const info = await this.element(selector);
    if (info.type === "password" || /(?:current|new)-password/.test(info.autocomplete)) {
      throw new Error(`refusing to type into a password field (${selector}). Use a storage_state file for signed-in pages.`);
    }
    if (!info.editable) throw new Error(`cannot type into ${selector}: not a text field`);
    await this.click(selector);
    const rect = rectOf(await this.element(selector));
    const chars = [...text];
    const t0 = this.now();
    let i = 0;
    await this.until(t0 + chars.length / cps, async () => {
      while (i < chars.length && this.now() >= t0 + i / cps) {
        const ch = chars[i++];
        if (ch === "\n") await this.key("Enter", false);
        else {
          await this.send("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch, unmodifiedText: ch });
          await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
        }
      }
    });
    this.events.types.push({ t0: r3(t0), t1: r3(this.now()), selector, text, rect });
    await this.hold(0.3);
  }

  async key(name, settle = true) {
    const k = KEYS[name];
    await this.send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, ...(k.text ? { text: k.text } : {}) });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: k.key, code: k.code, windowsVirtualKeyCode: k.vk });
    if (settle) await this.hold(0.3);
  }

  async scroll({ to, by }) {
    const y = await this.evaluate("scrollY");
    if (by !== undefined) await this.scrollTo(y + by);
    else if (typeof to === "number") await this.scrollTo(to);
    else {
      const info = await this.element(to);
      await this.scrollTo(y + info.y - this.flow.viewport.height * 0.3);
    }
    await this.hold(0.25);
  }

  async wait(what) {
    if (typeof what === "number") return this.hold(what / 1000);
    // A selector is waited for off the record: slow loads are cut from the video.
    await this.element(what, { wait: 15 });
    await this.hold(0.1);
  }

  // Navigation and load are off the record.
  async goto(url) {
    await this.off(async () => {
      let loaded = false;
      const off = this.cdp.on((m) => {
        if (m.method === "Page.loadEventFired" && m.sessionId === this.sessionId) loaded = true;
      });
      try {
        await this.send("Page.navigate", { url });
        for (let ms = 0; !loaded; ms += 50) {
          if (ms > 30000) throw new Error(`${url} did not finish loading in 30 s`);
          await sleep(50);
        }
        await sleep(300);
      } finally {
        off();
      }
    });
    await this.shot();
  }

  // Cursor samples on the output frame grid, from the recorded moves.
  cursorSamples(fps, frames) {
    return Array.from({ length: frames }, (_, k) => {
      const p = cursorAt(this.segments, this.start, k / fps);
      return [r3(k / fps), r3(p.x), r3(p.y)];
    });
  }

  // ffmpeg concat list: each screenshot lasts until the next one; the first starts at 0.
  concatList(duration) {
    const lines = [];
    this.shots.forEach((s, i) => {
      const from = i === 0 ? 0 : s.ts;
      const to = i + 1 < this.shots.length ? this.shots[i + 1].ts : duration;
      lines.push(`file '${s.file.replace(/'/g, "'\\''")}'`, `duration ${Math.max(0.001, to - from).toFixed(6)}`);
    });
    lines.push(`file '${this.shots.at(-1).file.replace(/'/g, "'\\''")}'`);
    return lines.join("\n") + "\n";
  }
}

function sameOriginGuard(cdp, sessionId, origin) {
  cdp.on((m) => {
    if (m.method !== "Fetch.requestPaused" || m.sessionId !== sessionId) return;
    const url = m.params.request.url;
    const allowed = url.startsWith("about:") || url.startsWith("data:") || url.startsWith("blob:") || new URL(url).origin === origin;
    const call = allowed ? cdp.send("Fetch.continueRequest", { requestId: m.params.requestId }, sessionId) : cdp.send("Fetch.failRequest", { requestId: m.params.requestId, errorReason: "BlockedByClient" }, sessionId);
    call.catch(() => {});
  });
}

export async function captureFlow(dir, id, { recapture = false, log = () => {} } = {}) {
  const project = loadProject(dir);
  if (!captureEnabled(project)) throw new Error(`services.capture is not enabled for this project. ${CONSENT_HELP}`);
  const flow = loadFlow(project, id);
  const state = storageState(project, flow);
  const out = captureFiles(project, id);
  const hash = flowHash(project, id);
  if (!recapture && existsSync(out.video) && existsSync(out.events) && existsSync(out.meta)) {
    const meta = JSON.parse(readFileSync(out.meta, "utf8"));
    if (meta.flow_hash === hash) return { skipped: true, ...out, hash };
  }

  const fps = flow.fps ?? project.studio.format?.fps ?? 30;
  const origin = new URL(flow.url).origin;
  const { width, height, deviceScaleFactor } = flow.viewport;
  mkdirSync(join(project.root, "capture", id), { recursive: true });
  const framesDir = mkdtempSync(join(tmpdir(), "one-studio-frames-"));
  const browser = await launchChrome({ width, height });
  try {
    const { cdp } = browser;
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    await send("Page.enable");
    await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile: false });
    // The recorded video never shows the real pointer; a drawn one is added when the scene renders.
    await send("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='*{cursor:none!important}';document.head.appendChild(s)})" });
    if (state) {
      const cookies = (state.cookies ?? []).map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path ?? "/", secure: c.secure, httpOnly: c.httpOnly, sameSite: SAME_SITE[String(c.sameSite).toLowerCase()], ...(c.expires > 0 ? { expires: c.expires } : {}) }));
      if (cookies.length) await send("Network.setCookies", { cookies });
      const local = (state.origins ?? []).filter((o) => o.origin === origin).flatMap((o) => o.localStorage ?? []);
      if (local.length) await send("Page.addScriptToEvaluateOnNewDocument", { source: `if (location.origin === ${JSON.stringify(origin)}) { for (const [k, v] of ${JSON.stringify(local.map((i) => [i.name, i.value]))}) localStorage.setItem(k, v); }` });
    }
    await send("Fetch.enable", { patterns: [{ resourceType: "Document" }] });
    sameOriginGuard(cdp, sessionId, origin);

    const rec = new Recorder({ cdp, sessionId, flow, framesDir, random: rng(seedFor(flow, id)) });
    await rec.goto(flow.url);
    await rec.hold(0.3);
    for (const [i, step] of flow.steps.entries()) {
      const kind = stepKind(step);
      log(`  step ${i + 1}/${flow.steps.length}: ${kind}`);
      try {
        if (kind === "goto") {
          const url = new URL(step.goto, flow.url);
          if (url.origin !== origin) throw new Error(`goto ${url.href} leaves the flow's origin ${origin}`);
          await rec.goto(url.href);
          await rec.hold(0.3);
        } else if (kind === "click") await rec.click(step.click);
        else if (kind === "type") await rec.type(step.type, step.text, step.cps ?? 14);
        else if (kind === "press") await rec.key(step.press);
        else if (kind === "scroll") await rec.scroll(step.scroll);
        else if (kind === "hover") await rec.hover(step.hover);
        else if (kind === "wait") await rec.wait(step.wait);
        else if (kind === "mark") rec.events.marks.push({ name: step.mark, t: r3(rec.now()) });
      } catch (err) {
        throw new Error(`flow "${id}" step ${i + 1} (${kind}): ${err.message}`);
      }
    }
    await rec.hold(0.6);

    const frames = Math.ceil(rec.now() * fps);
    const duration = r3(frames / fps);
    const list = join(framesDir, "frames.txt");
    writeFileSync(list, rec.concatList(duration));
    run("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`, "-frames:v", String(frames), "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-g", String(fps), "-an", "-movflags", "+faststart", out.video]);
    const events = {
      version: CAPTURE_VERSION,
      flow: id,
      url: flow.url,
      fps,
      viewport: flow.viewport,
      seed: seedFor(flow, id),
      duration,
      cursor: rec.cursorSamples(fps, frames),
      ...rec.events,
    };
    writeFileSync(out.events, JSON.stringify(events));
    writeFileSync(out.meta, JSON.stringify({ flow_hash: hash, version: CAPTURE_VERSION, frames, screenshots: rec.shots.length, fps }, null, 2) + "\n");
    return { skipped: false, ...out, hash, frames, duration };
  } finally {
    browser.close();
    rmSync(framesDir, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["recapture", "help"] });
    const [dir, id] = args._;
    if (args.help || !dir || !id) {
      console.log("usage: capture-screen.mjs <project-dir> <flow-id> [--recapture]");
      process.exit(args.help ? 0 : 1);
    }
    const r = await captureFlow(dir, id, { recapture: args.recapture, log: (m) => console.log(m) });
    console.log(r.skipped ? `· capture for "${id}" is up to date (flow unchanged); --recapture to redo` : `✓ ${r.frames} frames, ${r.duration}s → ${r.video}\n  events: ${r.events}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
