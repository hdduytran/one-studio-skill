#!/usr/bin/env node
// Gate 0 / 7: one local page to audition voices, music beds and SFX side by side (howler.js, offline).
//   node audio-picker.mjs <project-dir> [--no-music] [--no-sfx]
// Collects review/voices/*.wav (tts-openai-compatible.mjs --samples), review/music/*.m4a
// (make-music.mjs --samples; rendered here when missing) and the built-in SFX kit (assets/sfx/),
// vendors howler.js into assets/vendor/ and writes review/audio-picker.html. Open it in a browser
// (file:// works), then tell Claude your pick; Claude records it with make-music.mjs --use /
// tts-openai-compatible.mjs --use-voice. Nothing here calls TTS or the network.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isMain, loadProject, parseArgs } from "./lib/project.mjs";
import { BUILTIN_BEDS, PRESETS } from "./lib/music.mjs";
import { SFX_NAMES, SFX_RECIPES, makeSfx, sfxDir } from "./lib/sfx.mjs";
import { vendorHowler } from "./lib/vendor.mjs";
import { endpointFor } from "./lib/tts.mjs";
import { escapeHtml } from "./lib/scenes.mjs";
import { musicSamples } from "./make-music.mjs";

const T = {
  vi: { title: "Chọn âm thanh", voices: "Giọng đọc", music: "Nhạc nền", sfx: "Hiệu ứng (SFX)", none: "Chưa có mẫu. Chạy:", current: "đang dùng", pick: "Chọn bằng", together: "Thử giọng + nhạc", stop: "Dừng tất cả", noMusic: "Không nhạc", hint: "Bấm ▶ để nghe. Chọn một giọng và một nhạc rồi bấm “Thử giọng + nhạc” (nhạc nhỏ đi như khi trộn thật). Báo lại lựa chọn cho Claude.", mixNote: "Bản trộn cuối do FFmpeg làm (concat-and-mix); trang này chỉ để nghe thử." },
  en: { title: "Pick the sound", voices: "Voices", music: "Music beds", sfx: "Sound effects", none: "No samples yet. Run:", current: "in use", pick: "Pick with", together: "Voice + music", stop: "Stop all", noMusic: "No music", hint: "Press ▶ to listen. Select one voice and one bed, then “Voice + music” (music ducked as in the real mix). Tell Claude your pick.", mixNote: "The delivered mix is built by FFmpeg (concat-and-mix); this page is for listening only." },
};

const list = (dir, re) => (existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)).sort() : []);

export function audioPicker(dir, { music = true, sfx = true, log = () => {} } = {}) {
  const project = loadProject(dir);
  const root = project.root;
  const lang = project.studio.meta.language?.startsWith("vi") ? "vi" : "en";
  const t = T[lang];
  vendorHowler(join(root, "assets"));

  // Voices: samples made with tts-openai-compatible.mjs --samples (needs the user's TTS consent).
  let currentVoice = null;
  try {
    currentVoice = endpointFor(project.studio, project.studio.meta.language).voice;
  } catch {}
  const preset = project.brand?.voice?.[project.studio.meta.language]?.voice;
  const voices = list(join(root, "review", "voices"), /\.(wav|mp3|m4a|ogg)$/i).map((f) => ({
    id: f.replace(/\.[^.]+$/, ""),
    src: `voices/${f}`,
  }));

  // Music: built-in beds (rendered locally on demand) + any user files already sampled.
  if (music) {
    const have = new Set(list(join(root, "review", "music"), /\.m4a$/));
    if (Object.keys(BUILTIN_BEDS).some((n) => !have.has(`${n}.m4a`))) musicSamples(root, { log });
  }
  const currentMusic = project.studio.audio?.music;
  const beds = list(join(root, "review", "music"), /\.(m4a|mp3|wav)$/i).map((f) => {
    const id = f.replace(/\.[^.]+$/, "");
    const spec = BUILTIN_BEDS[id];
    return { id, src: `music/${f}`, about: spec ? `${spec.preset} · ${spec.mood} — ${PRESETS[spec.preset].about}` : "file", current: typeof currentMusic === "string" && basename(currentMusic).replace(/\.[^.]+$/, "") === id };
  });

  // SFX: the built-in kit (FFmpeg lavfi, local) + any other file in assets/sfx/.
  if (sfx) for (const n of SFX_NAMES) makeSfx(n, sfxDir(project));
  const effects = list(sfxDir(project), /\.(wav|mp3|m4a|ogg)$/i).map((f) => {
    const id = f.replace(/\.[^.]+$/, "");
    return { id, src: `../assets/sfx/${f}`, about: SFX_RECIPES[id]?.about ?? "file" };
  });

  // Commands are shown short: the user only has to say which one; Claude runs them on the project.
  const rel = "<dir>";
  const q = (s) => s;
  const card = (group, item, cmd, extra = "") => `
      <li class="item${item.current ? " is-current" : ""}">
        ${group !== "sfx" ? `<input type="radio" name="${group}" value="${escapeHtml(item.src)}" aria-label="${escapeHtml(item.id)}"${item.current ? " checked" : ""}>` : ""}
        <button class="play" data-src="${escapeHtml(item.src)}" aria-label="play ${escapeHtml(item.id)}">▶</button>
        <div class="meta"><b>${escapeHtml(item.id)}</b>${item.current ? ` <span class="tag">${t.current}</span>` : ""}${extra ? `<small>${escapeHtml(extra)}</small>` : ""}
          ${cmd ? `<code>${escapeHtml(cmd)}</code>` : ""}</div>
        <progress max="1" value="0"></progress>
      </li>`;
  const section = (title, items, empty) => `
  <section><h2>${title} <span class="count">${items.length}</span></h2>
    ${items.length ? `<ul>${items.join("")}</ul>` : `<p class="empty">${t.none} <code>${escapeHtml(empty)}</code></p>`}
  </section>`;

  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title} · ${escapeHtml(project.studio.meta.title ?? project.studio.meta.name)}</title>
<!-- Generated by one-studio audio-picker.mjs. Local only: howler.js from assets/vendor, no network. -->
<style>
  :root { --bg: #fbfbfd; --fg: #1d1d1f; --muted: #6e6e73; --line: #d2d2d7; --card: #ffffff; --accent: #0071e3; --on: #e8f1fc; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111113; --fg: #f5f5f7; --muted: #a1a1a6; --line: #333336; --card: #1c1c1e; --accent: #2997ff; --on: #10243a; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 -apple-system, "Segoe UI", Inter, system-ui, sans-serif; }
  main { max-width: 880px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 17px; margin: 32px 0 10px; }
  .count { color: var(--muted); font-weight: 400; }
  p.hint { color: var(--muted); margin: 0 0 8px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .item { display: grid; grid-template-columns: auto auto 1fr 120px; gap: 12px; align-items: center; padding: 10px 14px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
  .item.is-current { background: var(--on); border-color: var(--accent); }
  .item input { accent-color: var(--accent); width: 18px; height: 18px; margin: 0; }
  #sfx .item { grid-template-columns: auto 1fr 120px; }
  .play { width: 36px; height: 36px; border-radius: 50%; border: 0; background: var(--accent); color: #fff; font-size: 14px; cursor: pointer; }
  .play.is-playing { background: var(--fg); color: var(--bg); }
  .meta { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .meta small { color: var(--muted); }
  code { font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); overflow-wrap: anywhere; }
  .tag { font-size: 11px; color: var(--accent); text-transform: uppercase; letter-spacing: .04em; }
  progress { width: 100%; height: 4px; appearance: none; border: 0; background: var(--line); border-radius: 2px; }
  progress::-webkit-progress-bar { background: var(--line); border-radius: 2px; }
  progress::-webkit-progress-value { background: var(--accent); border-radius: 2px; }
  .bar { position: sticky; top: 0; display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 0; background: var(--bg); border-bottom: 1px solid var(--line); z-index: 1; }
  .bar button { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer; font: inherit; }
  .bar button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .empty { color: var(--muted); }
  footer { margin-top: 40px; color: var(--muted); font-size: 13px; }
  @media (max-width: 560px) { .item { grid-template-columns: auto auto 1fr; } .item progress { grid-column: 1 / -1; } #sfx .item { grid-template-columns: auto 1fr; } }
</style>
</head>
<body>
<main>
  <h1>${t.title}</h1>
  <p class="hint">${t.hint}</p>
  <div class="bar"><button class="primary" id="together">▶ ${t.together}</button><button id="stop">■ ${t.stop}</button></div>
  <div id="voices">${section(t.voices, voices.map((v) => card("voice", { ...v, current: v.id === (preset ?? currentVoice) }, `node tts-openai-compatible.mjs ${q(rel)} --use-voice ${v.id}`)), `node tts-openai-compatible.mjs ${q(rel)} --samples all --text "…" --allow-tts`)}</div>
  <div id="music">${section(t.music, [
    ...beds.map((b) => card("music", b, `node make-music.mjs ${q(rel)} --use ${b.id}`, b.about)),
    card("music", { id: t.noMusic, src: "", current: currentMusic === false }, `node make-music.mjs ${q(rel)} --use none`),
  ], `node make-music.mjs ${q(rel)} --samples`)}</div>
  <div id="sfx">${section(t.sfx, effects.map((e) => card("sfx", e, `storyboard.json → scenes[].sfx[]: { "name": "${e.id}", "at": 0.5 }`, e.about)), `node make-sfx.mjs ${q(rel)}`)}</div>
  <footer>${t.mixNote}</footer>
</main>
<script src="../assets/vendor/howler.core.min.js"></script>
<script>
(function () {
  "use strict";
  var playing = [];
  function stopAll() {
    playing.forEach(function (p) { p.howl.stop(); p.howl.unload(); p.btn && p.btn.classList.remove("is-playing"); if (p.bar) p.bar.value = 0; });
    playing = [];
  }
  function play(src, btn, volume) {
    var li = btn && btn.closest(".item");
    var bar = li && li.querySelector("progress");
    var howl = new Howl({ src: [src], html5: true, volume: volume == null ? 1 : volume });
    var p = { howl: howl, btn: btn, bar: bar };
    howl.on("end", function () { btn && btn.classList.remove("is-playing"); if (bar) bar.value = 0; });
    howl.play();
    btn && btn.classList.add("is-playing");
    (function tick() {
      if (playing.indexOf(p) < 0) return;
      var d = howl.duration();
      if (bar && d) bar.value = (howl.seek() || 0) / d;
      if (howl.playing()) requestAnimationFrame(tick);
    })();
    playing.push(p);
    return p;
  }
  document.querySelectorAll(".play").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var was = btn.classList.contains("is-playing");
      stopAll();
      if (!was && btn.dataset.src) play(btn.dataset.src, btn);
    });
  });
  document.getElementById("stop").addEventListener("click", stopAll);
  // Voice + music: the bed at the level it keeps under the VO after ducking (about −12 dB).
  document.getElementById("together").addEventListener("click", function () {
    stopAll();
    var v = document.querySelector('input[name="voice"]:checked');
    var m = document.querySelector('input[name="music"]:checked');
    if (m && m.value) play(m.value, m.closest(".item").querySelector(".play"), 0.25);
    if (v) play(v.value, v.closest(".item").querySelector(".play"), 1);
  });
})();
</script>
</body>
</html>
`;
  mkdirSync(join(root, "review"), { recursive: true });
  const out = join(root, "review", "audio-picker.html");
  writeFileSync(out, html);
  return { out, voices: voices.length, beds: beds.length, effects: effects.length };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2), { flags: ["no-music", "no-sfx", "help"] });
    const dir = args._[0];
    if (args.help || !dir) {
      console.log("usage: audio-picker.mjs <project-dir> [--no-music] [--no-sfx]");
      process.exit(dir ? 0 : 1);
    }
    const r = audioPicker(dir, { music: !args["no-music"], sfx: !args["no-sfx"], log: console.log });
    console.log(`✓ ${r.out}`);
    console.log(`  ${r.voices} voice sample(s), ${r.beds} music bed(s), ${r.effects} sound effect(s)`);
    if (!r.voices) console.log("  no voice samples yet: tts-openai-compatible.mjs <dir> --samples all --text \"…\" (ask before calling TTS)");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
