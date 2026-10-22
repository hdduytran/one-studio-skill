/* Style editor page logic. `Blend` (colour maths + lib/style-blend.mjs) is inlined above this file by style-editor.mjs.
 * State = the values the page opened with (D.initial) + "độ giống gốc" blend + the user's own edits (manual).
 * Preview: CSS variables are posted to the sample iframes; motion and caption layout need a reload of the scenes. */
"use strict";
const D = JSON.parse(document.getElementById("data").textContent);
const t = D.t;
const $ = (id) => document.getElementById(id);
const state = { sim: 100, manual: {}, locks: new Set(D.locked) };
const blended = () => (state.sim >= 100 ? D.initial : Blend.blendFlat(D.initial, D.base, state.sim));
const cur = () => Object.assign({}, blended(), state.manual);

const el = (tag, props, ...kids) => {
  const n = Object.assign(document.createElement(tag), props || {});
  kids.forEach((k) => n.append(k));
  return n;
};
const hex6 = (v) => (/^#[0-9a-f]{3}$/i.test(v || "") ? "#" + [...v.slice(1)].map((c) => c + c).join("") : /^#[0-9a-f]{6}$/i.test(v || "") ? v.toLowerCase() : null);
const quote = (f) => (/^[\w-]+$/.test(f) ? f : '"' + String(f).replace(/"/g, "") + '"');
const nearest = (list, w) => list.reduce((b, x) => (Math.abs(x - w) < Math.abs(b - w) ? x : b), list[0]);
const set = (path, value) => { state.manual[path] = value; update(); };

// ---- controls
const rows = []; // { sync(c) } for every control
const COLOR_MIN = { fg: 4.5, muted: 4.5, primary: 3, secondary: 3, accent: 3 };

function lockButton(path) {
  const unit = Blend.unitOf(path);
  const b = el("button", { className: "lock", title: t.lock, type: "button", textContent: "🔒" });
  b.onclick = () => { state.locks.has(unit) ? state.locks.delete(unit) : state.locks.add(unit); update(); };
  rows.push({ sync: () => b.classList.toggle("on", state.locks.has(unit)) });
  return b;
}
const row = (label, path, input, val, badge) => el("div", { className: "row" }, el("label", { textContent: label }), input, val || el("span"), badge || el("span"), lockButton(path));

function colorRow(path) {
  const role = path.split(".").pop();
  const input = el("input", { type: "color", ariaLabel: path });
  const badge = el("span", { className: "badge" });
  input.oninput = () => set(path, input.value);
  rows.push({ sync(c) {
    const v = hex6(c[path]);
    input.value = v || "#000000";
    input.disabled = !v;
    const other = role === "bg" ? hex6(c["brand.colors.fg"]) : hex6(c["brand.colors.bg"]);
    const min = role === "bg" ? 4.5 : COLOR_MIN[role];
    if (!v || !other || !min) { badge.textContent = ""; badge.className = "badge"; badge.hidden = true; return; }
    const r = Blend.contrastRatio(v, other);
    badge.hidden = false;
    badge.textContent = r.toFixed(1) + (r >= min ? " ✓" : " ✕");
    badge.className = "badge " + (r >= min ? "ok" : "bad");
    badge.title = t.contrast + " ≥ " + min;
  } });
  return row(path.replace("brand.", ""), path, input, null, badge);
}

function sliderRow([path, min, max, step, unit]) {
  const input = el("input", { type: "range", min, max, step, ariaLabel: path });
  const val = el("span", { className: "val" });
  input.oninput = () => set(path, Number(input.value));
  rows.push({ sync(c) { const v = c[path] === undefined ? min : c[path]; input.value = v; val.textContent = c[path] === undefined ? "—" : v + unit; } });
  return row(path.replace("brand.", ""), path, input, val);
}

function selectRow(path, options) {
  const input = el("select", { ariaLabel: path });
  options.forEach((o) => input.append(el("option", { value: o, textContent: o })));
  input.onchange = () => set(path, input.value);
  rows.push({ sync(c) { if (c[path] !== undefined && !options.includes(c[path])) input.append(el("option", { value: c[path], textContent: c[path] })); input.value = c[path] === undefined ? options[0] : c[path]; } });
  return row(path.replace("brand.", ""), path, input);
}

function fontRow(role) {
  const base = "brand.typography." + role;
  const family = el("select", { ariaLabel: base });
  D.fonts.forEach((f) => family.append(el("option", { value: f.family, textContent: f.family + (f.embedded ? "" : " · " + t.noPreview) })));
  const weight = el("select", { ariaLabel: base + ".weight" });
  family.onchange = () => {
    const f = D.fonts.find((x) => x.family === family.value);
    const c = cur();
    Object.assign(state.manual, {
      [base + ".family"]: f.family,
      [base + ".weight"]: nearest(f.weights, c[base + ".weight"] || 700),
      [base + ".fallback"]: f.fallback,
      [base + ".fontsource"]: f.fontsource || undefined,
      [base + ".src"]: undefined,
    });
    update();
  };
  weight.onchange = () => set(base + ".weight", Number(weight.value));
  rows.push({ sync(c) {
    const fam = c[base + ".family"];
    if (fam && !D.fonts.some((f) => f.family === fam) && ![...family.options].some((o) => o.value === fam)) family.append(el("option", { value: fam, textContent: fam + " · " + t.custom }));
    family.value = fam || D.fonts[0].family;
    const f = D.fonts.find((x) => x.family === family.value);
    weight.replaceChildren(...(f ? f.weights : [c[base + ".weight"] || 700]).map((w) => el("option", { value: w, textContent: w })));
    weight.value = c[base + ".weight"] || weight.options[0].value;
  } });
  return row(role, base, family, weight);
}

function build() {
  const box = $("controls");
  const group = (title, ...kids) => box.append(el("fieldset", {}, el("legend", { textContent: title }), ...kids));
  const sim = el("input", { type: "range", min: 0, max: 100, step: 1, value: 100, ariaLabel: t.similarity });
  const simVal = el("span", { className: "val", textContent: "100%" });
  sim.oninput = () => { state.sim = Number(sim.value); simVal.textContent = sim.value + "%"; update(); };
  sim.id = "similarity";
  const fs = el("fieldset", { className: "sim" }, el("legend", { textContent: t.similarity }), el("div", { className: "row" }, el("label", { textContent: t.similarityHint }), sim, simVal));
  box.append(fs);
  group(t.colors, ...["bg", "fg", "primary", "secondary", "accent", "muted"].map((r) => colorRow("brand.colors." + r)));
  group(t.fonts, fontRow("heading"), fontRow("body"));
  group(t.motion, ...[["brand.motion.duration.base", 0.1, 2, 0.05, "s"], ["brand.motion.stagger", 0, 0.3, 0.01, "s"], ["storyboard.target_shot_seconds", 0.5, 10, 0.1, "s"]].map(sliderRow));
  group(t.captions, selectRow("brand.captions.position", ["bottom", "middle", "top"]), sliderRow(["brand.captions.size", 24, 96, 1, "px"]), colorRow("brand.captions.color"));
  group(t.surface, selectRow("brand.surface", ["flat", "glass"]), selectRow("brand.transitions.default", ["cut", "fade", "slide-left", "slide-up", "wipe", "zoom", "blur"]), sliderRow(["brand.transitions.duration", 0, 1.5, 0.05, "s"]));
}

// ---- preview
const scenes = D.scenes.map((s) => {
  const frame = el("iframe", { title: s.label, src: "about:blank", width: D.size.width, height: D.size.height });
  const view = el("div", { className: "view" }, frame);
  view.style.aspectRatio = D.size.width + " / " + D.size.height;
  $("samples").append(el("figure", { className: "sample" }, view, el("figcaption", { textContent: s.label })));
  return { s, frame, view };
});
const fit = () => scenes.forEach(({ frame, view }) => { frame.style.transform = "scale(" + view.clientWidth / D.size.width + ")"; });
window.addEventListener("resize", fit);

function cssVars(c) {
  const v = {};
  ["bg", "fg", "primary", "secondary", "accent", "muted"].forEach((r) => { if (c["brand.colors." + r]) v["--c-" + r] = c["brand.colors." + r]; });
  ["heading", "body"].forEach((r) => {
    const p = "brand.typography." + r;
    if (c[p + ".family"]) v["--font-" + r] = quote(c[p + ".family"]) + ", " + (c[p + ".fallback"] || "sans-serif");
    if (c[p + ".weight"]) v["--fw-" + r] = c[p + ".weight"];
  });
  Object.keys(c).forEach((k) => { if (k.indexOf("brand.motion.duration.") === 0) v["--dur-" + k.split(".").pop()] = c[k] + "s"; });
  if (c["brand.motion.stagger"] !== undefined) v["--stagger"] = c["brand.motion.stagger"] + "s";
  if (c["brand.captions.size"] !== undefined) v["--caption-size"] = c["brand.captions.size"];
  if (c["brand.captions.color"]) v["--caption-color"] = c["brand.captions.color"];
  if (c["brand.captions.background"]) v["--caption-bg"] = c["brand.captions.background"];
  return v;
}
// What window.BRAND must say for the scenes to build their timelines and captions the way the style says.
function brandOverrides(c) {
  const out = {};
  Object.keys(c).forEach((k) => {
    const m = /^brand\.(colors|motion|transitions|captions)\.(.+)$/.exec(k);
    if (!m || c[k] === undefined) return;
    const parts = (m[1] + "." + m[2]).split(".");
    let o = out;
    parts.slice(0, -1).forEach((p) => { o = o[p] = o[p] || {}; });
    o[parts[parts.length - 1]] = c[k];
  });
  return out;
}
let loadedKey = null;
let timer = null;
const structural = (b) => JSON.stringify([b.motion, b.transitions, b.captions && [b.captions.position, b.captions.font, b.captions.max_chars]]);
let loads = 0;
function reload(play) {
  const c = cur();
  const brand = brandOverrides(c);
  loadedKey = structural(brand);
  const hash = encodeURIComponent(JSON.stringify({ brand, vars: cssVars(c), surface: c["brand.surface"], play: Boolean(play) }));
  scenes.forEach(({ s, frame }) => { frame.src = s.src + "?r=" + ++loads + "#" + hash; });
}
function preview() {
  const c = cur();
  scenes.forEach(({ frame }) => frame.contentWindow && frame.contentWindow.postMessage({ os: "editor", vars: cssVars(c), surface: c["brand.surface"] }, "*"));
  if (structural(brandOverrides(c)) !== loadedKey) { clearTimeout(timer); timer = setTimeout(() => reload(false), 350); }
}

// ---- command
function command() {
  const c = cur();
  const { changes, unsets } = Blend.diffChanges(D.initial, c);
  const lock = [...state.locks].filter((u) => !D.locked.includes(u)).sort();
  const unlock = D.locked.filter((u) => !state.locks.has(u)).sort();
  // A lock stores a value: one the style does not have yet is written together with it.
  lock.forEach((u) => Object.keys(c).filter((p) => (p === u || p.indexOf(u + ".") === 0) && c[p] !== undefined && !D.styleHas.includes(p)).forEach((p) => { changes[p] = c[p]; }));
  return Blend.buildSetCommand({ dir: D.dir, slug: D.slug, variant: D.variant, changes, unsets, lock, unlock });
}

function update() {
  const c = cur();
  rows.forEach((r) => r.sync(c));
  $("cmd").value = command() || t.nothing;
  preview();
}

// ---- chrome
document.title = D.title;
$("title").textContent = D.title;
$("hint").textContent = t.hint;
$("h-frames").textContent = t.frames;
$("h-samples").textContent = t.samples;
$("l-cmd").textContent = t.command;
$("replay").textContent = "▶ " + t.replay;
$("reset").textContent = t.reset;
$("copy").textContent = t.copy;
D.frames.forEach((src) => { const img = el("img", { src, alt: "" }); img.onerror = () => img.remove(); $("frames").append(img); });
if (!D.frames.length) $("frames").textContent = t.noFrames;
$("replay").onclick = () => reload(true);
$("reset").onclick = () => { state.manual = {}; state.sim = 100; state.locks = new Set(D.locked); $("similarity").value = 100; $("similarity").oninput(); };
$("copy").onclick = () => {
  const box = $("cmd");
  const done = () => { $("copy").textContent = t.copied; setTimeout(() => { $("copy").textContent = t.copy; }, 1500); };
  if (!command()) return;
  box.select();
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(done, () => { document.execCommand("copy"); done(); });
  else { document.execCommand("copy"); done(); }
};
build();
fit();
reload(false);
update();
window.__editor = { state, cur, command, update };
