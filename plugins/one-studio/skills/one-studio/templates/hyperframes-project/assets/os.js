/* one-studio scene runtime v2 — deterministic helpers on top of a paused GSAP timeline.
 * Every helper places tweens at absolute scene times, so any frame can be rendered alone.
 * Usage in a scene:  const S = OS.scene("s01"); S.words(".os-display", { at: 0.2 }); S.done();
 */
(function () {
  "use strict";
  var B = window.BRAND || {};
  // Folder of this file (…/assets/), to resolve preview audio wherever the scene is mounted.
  var ASSETS = ((document.currentScript && document.currentScript.src) || "").replace(/os\.js(?:[?#].*)?$/, "");

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  // <style data-ratio="9:16,4:5"> blocks only apply at those aspect ratios (hashed per ratio as well).
  function ratioStyles(w, h) {
    var g = gcd(w, h) || 1;
    var ratio = w / g + ":" + h / g;
    Array.prototype.slice.call(document.querySelectorAll("style[data-ratio]")).forEach(function (el) {
      var list = el.getAttribute("data-ratio").split(",").map(function (s) { return s.trim(); });
      el.media = list.indexOf(ratio) >= 0 ? "all" : "not all";
    });
    return ratio;
  }

  // Studio preview only: play the scene's SFX cues (assets/audio-cues.js, from storyboard sfx[]) with howler.js.
  // Never under automation (renders, snapshots): the delivered mix is built by FFmpeg (concat-and-mix).
  function previewAudio(api) {
    var cues = (window.OS_CUES || {})[api.id];
    if (!cues || !cues.length || !window.Howl || navigator.webdriver || typeof requestAnimationFrame !== "function") return;
    var sounds = cues.map(function (c) {
      return { at: c.at, howl: new window.Howl({ src: [ASSETS + c.src], html5: true, preload: true, volume: Math.min(1, Math.pow(10, (c.gain || 0) / 20)) }) };
    });
    var last = -1;
    (function tick() {
      var t = api.tl.time();
      if (last >= 0 && t > last && t - last < 0.5) {
        sounds.forEach(function (s) { if (s.at > last && s.at <= t) { s.howl.stop(); s.howl.play(); } });
      }
      last = t;
      requestAnimationFrame(tick);
    })();
  }
  var M = B.motion || { ease: { in: "power2.in", out: "power3.out", inOut: "power2.inOut" }, duration: { fast: 0.25, base: 0.6, slow: 1.2 }, stagger: 0.08 };
  var T = B.transitions || { default: "fade", duration: 0.4 };

  var ENTER = {
    up: [{ autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0 }],
    down: [{ autoAlpha: 0, y: -40 }, { autoAlpha: 1, y: 0 }],
    left: [{ autoAlpha: 0, x: 60 }, { autoAlpha: 1, x: 0 }],
    right: [{ autoAlpha: 0, x: -60 }, { autoAlpha: 1, x: 0 }],
    fade: [{ autoAlpha: 0 }, { autoAlpha: 1 }],
    scale: [{ autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1 }],
    pop: [{ autoAlpha: 0, scale: 0.5 }, { autoAlpha: 1, scale: 1, ease: "back.out(1.7)" }],
  };

  // Wrap each word in a span, keeping inline elements (e.g. <span class="os-accent">) and their styling.
  function splitWords(el) {
    if (el.dataset.osSplit) return el.querySelectorAll(".os-word");
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 1) return void walk(child);
        if (child.nodeType !== 3) return;
        var frag = document.createDocumentFragment();
        child.nodeValue.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) return void frag.appendChild(document.createTextNode(part));
          var span = document.createElement("span");
          span.className = "os-word";
          span.textContent = part;
          frag.appendChild(span);
        });
        node.replaceChild(frag, child);
      });
    })(el);
    el.dataset.osSplit = "1";
    return el.querySelectorAll(".os-word");
  }

  // Stepped motion: sample scene time on a fixed grid (hand-made, Vox-like judder) while the render keeps full fps.
  // The epsilon keeps exact grid times (e.g. 0.25 at 12 fps) from falling into the previous step.
  var STEP_FPS = 12;
  function stepTime(t, fps) {
    fps = fps || STEP_FPS;
    return Math.floor(t * fps + 1e-6) / fps;
  }
  // Route every seek of the timeline through stepTime; the root's data-motion="stepped-12" turns it on.
  function quantiseTimeline(tl) {
    var seek = tl.seek, time = tl.time, total = tl.totalTime;
    tl.seek = function (t, suppress) { return seek.call(tl, stepTime(t), suppress); };
    tl.time = function (t, suppress) { return arguments.length ? time.call(tl, stepTime(t), suppress) : time.call(tl); };
    tl.totalTime = function (t, suppress) { return arguments.length ? total.call(tl, stepTime(t), suppress) : total.call(tl); };
  }

  function fmt(n, o) {
    var s = n.toFixed(o.decimals || 0);
    if (o.thousands !== false) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, o.separator || ".");
    return (o.prefix || "") + s + (o.suffix || "");
  }

  function needWorld(world, what) {
    if (!world) throw new Error("S." + what + ": this scene has no world (set world in storyboard.json and run new-scene)");
    return world;
  }

  // Resolve ../ style references of a world file against the file's own URL (the scene may be mounted elsewhere).
  function rebase(html, base) {
    var abs = function (ref) { return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref) ? ref : new URL(ref, base).href; };
    return html
      .replace(/\b(src|href)\s*=\s*(["'])([^"']+)\2/g, function (m, a, q, ref) { return a + "=" + q + abs(ref) + q; })
      .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, function (m, q, ref) { return "url(" + q + abs(ref) + q + ")"; });
  }

  function jsonAttr(el, name) {
    var v = el.getAttribute(name);
    return v ? JSON.parse(v) : null;
  }

  // The world layer of a scene: markup from worlds/<name>.html (read synchronously so the first frame has it),
  // one camera/state driver on the scene timeline, and the storyboard's camera / enter_state / exit_state as defaults.
  function worldRuntime(root, tl, dur, w, h, M) {
    var CAM = window.OS_CAMERA;
    if (!CAM) throw new Error("OS world: assets/camera.js is not loaded (run prepare-project, then new-scene --force)");
    var layer = root.querySelector(".os-world");
    var link = root.querySelector('link[rel="x-world"]');
    if (!link) throw new Error('OS world: missing <link rel="x-world" href="../worlds/<name>.html">');
    var xhr = new XMLHttpRequest();
    xhr.open("GET", link.href, false);
    xhr.send(null);
    if (xhr.status !== 200 && xhr.status !== 0) throw new Error("OS world: cannot load " + link.href + " (" + xhr.status + ")");
    layer.innerHTML = rebase(xhr.responseText, link.href);
    var ctx = { frame: { w: w, h: h }, world: { w: +layer.getAttribute("data-world-w"), h: +layer.getAttribute("data-world-h") }, places: null };
    var segs = [];
    var changes = []; // { el, name, at }
    var initial = new Map();
    var driver = null;
    var wanted = jsonAttr(layer, "data-camera");
    var enter = jsonAttr(layer, "data-enter-state") || {};
    var exit = jsonAttr(layer, "data-exit-state") || {};

    function places() {
      if (ctx.places) return ctx.places;
      ctx.places = {};
      Array.prototype.slice.call(layer.querySelectorAll("[data-place]")).forEach(function (el) {
        var x = 0, y = 0, n = el;
        while (n && n !== layer) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
        ctx.places[el.getAttribute("data-place")] = { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
      });
      return ctx.places;
    }
    function byId(id) {
      var el = layer.querySelector("#" + id + ',[data-id="' + id + '"]');
      if (!el) throw new Error("S.state: no world element #" + id);
      return el;
    }
    function remember(el) { if (!initial.has(el)) initial.set(el, el.getAttribute("data-state")); }

    function render(t) {
      initial.forEach(function (name, el) {
        var cur = name;
        changes.forEach(function (c) { if (c.el === el && c.at <= t + 1e-9) cur = c.name; });
        if (cur == null) el.removeAttribute("data-state"); else el.setAttribute("data-state", cur);
      });
      if (!segs.length) return;
      var seg = segs[0];
      segs.forEach(function (s) { if (s.at <= t + 1e-9) seg = s; });
      var p = seg.len > 0 ? Math.min(1, Math.max(0, (t - seg.at) / seg.len)) : 1;
      layer.style.transform = CAM.transform(CAM.sample(seg.a, seg.b, p >= 1 ? 1 : seg.ease(p), seg.move, ctx), ctx);
    }
    function ensureDriver() {
      if (driver) return;
      var clock = { t: 0 };
      driver = tl.to(clock, { t: dur, duration: dur, ease: "none", onUpdate: function () { render(clock.t); } }, 0);
    }

    var api = {
      camera: function (from, to, o) {
        var move = o.move || "push";
        var at = o.at || 0;
        var len = move === "cut" ? 0 : o.dur || Math.max(0.001, dur - at);
        places();
        segs.push({ a: CAM.viewOf(from, ctx), b: CAM.viewOf(to, ctx), move: move, at: at, len: len, ease: gsap.parseEase(o.ease || (move === "follow" ? "none" : M.ease.inOut)) });
        segs.sort(function (x, y) { return x.at - y.at; });
        ensureDriver();
        render(0);
      },
      state: function (elId, name, at) {
        var el = byId(elId);
        remember(el);
        changes.push({ el: el, name: name, at: at });
        ensureDriver();
        render(0);
      },
      // Defaults from the storyboard, for what the scene's own code did not set.
      finish: function () {
        Object.keys(enter).forEach(function (id) { var el = byId(id); remember(el); initial.set(el, enter[id]); });
        Object.keys(exit).forEach(function (id) {
          var el = byId(id);
          remember(el);
          if (!changes.some(function (c) { return c.el === el; })) changes.push({ el: el, name: exit[id], at: Math.max(0, dur - 0.5) });
        });
        if (!segs.length && wanted && wanted.to != null) api.camera(wanted.from != null ? wanted.from : wanted.to, wanted.to, wanted);
        if (segs.length || changes.length) ensureDriver();
        render(0);
      },
    };
    return api;
  }

  function scene(id) {
    var root = document.querySelector('[data-composition-id="' + id + '"]');
    if (!root) throw new Error("OS.scene: no element with data-composition-id=" + id);
    var dur = parseFloat(root.getAttribute("data-duration"));
    var w = +root.getAttribute("data-width");
    var h = +root.getAttribute("data-height");
    root.classList.add(w > h * 1.2 ? "os-landscape" : h > w * 1.2 ? "os-portrait" : "os-square");
    root.setAttribute("data-os-ratio", ratioStyles(w, h));
    var tl = gsap.timeline({ paused: true });
    window.__timelines = window.__timelines || {};
    window.__timelines[id] = tl;

    function q(sel) {
      if (typeof sel !== "string") return sel && sel.length !== undefined ? Array.prototype.slice.call(sel) : [sel];
      return Array.prototype.slice.call(root.querySelectorAll(sel));
    }

    var world = root.querySelector(".os-world") ? worldRuntime(root, tl, dur, w, h, M) : null;

    var api = {
      id: id, root: root, tl: tl, dur: dur, motion: M, q: q,

      enter: function (sel, o) {
        o = o || {};
        var k = ENTER[o.kind || "up"];
        var to = Object.assign({ duration: o.dur || M.duration.base, ease: M.ease.out, stagger: o.stagger == null ? M.stagger : o.stagger }, k[1]);
        tl.fromTo(q(sel), Object.assign({}, k[0]), to, o.at || 0);
        return api;
      },

      exit: function (sel, o) {
        o = o || {};
        tl.to(q(sel), { autoAlpha: 0, y: o.y || 0, duration: o.dur || M.duration.fast, ease: M.ease.in, stagger: o.stagger || 0 }, o.at);
        return api;
      },

      words: function (sel, o) {
        o = o || {};
        q(sel).forEach(function (el, i) {
          var words = splitWords(el);
          tl.fromTo(words, { autoAlpha: 0, y: "0.35em" }, { autoAlpha: 1, y: 0, duration: o.dur || M.duration.base, ease: M.ease.out, stagger: o.stagger || M.stagger }, (o.at || 0) + i * (o.gap || 0.4));
        });
        return api;
      },

      count: function (sel, o) {
        q(sel).forEach(function (el) {
          var to = o.to != null ? o.to : parseFloat(el.getAttribute("data-value"));
          var p = { v: o.from || 0 };
          el.textContent = fmt(p.v, o);
          tl.to(p, { v: to, duration: o.dur || M.duration.slow, ease: M.ease.out, onUpdate: function () { el.textContent = fmt(p.v, o); } }, o.at || 0);
        });
        return api;
      },

      // Stroke reveal for SVG paths/lines/circles (no paid plugin needed).
      draw: function (sel, o) {
        o = o || {};
        q(sel).forEach(function (el, i) {
          var len = typeof el.getTotalLength === "function" ? el.getTotalLength() : 1000;
          el.style.strokeDasharray = len + " " + len;
          tl.fromTo(el, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: o.dur || M.duration.slow, ease: o.ease || M.ease.inOut }, (o.at || 0) + i * (o.stagger == null ? M.stagger : o.stagger));
        });
        return api;
      },

      bars: function (sel, o) {
        o = o || {};
        tl.fromTo(q(sel).map(function (b) { return b.querySelector(".os-bar-fill"); }), { scaleY: 0 }, { scaleY: 1, duration: o.dur || M.duration.slow, ease: M.ease.out, stagger: o.stagger || M.stagger * 3 }, o.at || 0);
        return api;
      },

      // Drive any per-frame renderer (canvas, three.js, lottie) from scene time t in seconds.
      drive: function (fn, o) {
        o = o || {};
        var start = o.at || 0;
        var len = o.dur || dur - start;
        var p = { t: 0 };
        fn(0);
        tl.to(p, { t: len, duration: len, ease: "none", onUpdate: function () { fn(p.t); } }, start);
        return api;
      },

      lottie: function (sel, data, o) {
        o = o || {};
        var el = q(sel)[0];
        var anim = window.lottie.loadAnimation({ container: el, renderer: "svg", loop: false, autoplay: false, animationData: data });
        var fr = data.fr || 30;
        var frames = (data.op || 0) - (data.ip || 0);
        api.drive(function (t) {
          var f = t * fr * (o.speed || 1);
          f = o.loop === false ? Math.min(f, frames - 1) : f % frames;
          anim.goToAndStop(f, true);
        }, o);
        return anim;
      },

      // VO sync: start time (scene seconds) of a storyboard line, from <script id="os-lines"> written by
      // build-audio / sync-lines; `fallback` before the audio exists.
      line: function (id, fallback) {
        var t = lineTimes()[id];
        return t ? t.start : fallback == null ? 0 : fallback;
      },

      // Reveal every [data-line="<line-id>"] element when its sentence starts (offset default −0.1 s).
      // Per element: data-enter="up|fade|pop|words…" (default o.kind or "up"), data-at="2.5" before the VO exists.
      lines: function (o) {
        o = o || {};
        var times = lineTimes();
        q("[data-line]").forEach(function (el, i) {
          var t = times[el.getAttribute("data-line")];
          var at = t ? t.start : el.hasAttribute("data-at") ? parseFloat(el.getAttribute("data-at")) : (o.at || 0.3) + i * (o.gap || 2.5);
          at = Math.max(0, at + (o.offset == null ? -0.1 : o.offset));
          var kind = el.getAttribute("data-enter") || o.kind || "up";
          if (kind === "words") api.words(el, { at: at });
          else api.enter(el, { at: at, kind: kind, stagger: 0 });
        });
        return api;
      },

      // World camera: move the view from one place (or { x, y, zoom }) to another. See worlds/ and writers-room/visual-modes/world-camera.md.
      //   move: cut | push | fly | orbit | follow (default push); at, dur default to the rest of the scene; ease is a GSAP ease name.
      camera: function (from, to, o) { needWorld(world, "camera").camera(from, to, o || {}); return api; },

      // Switch a world element's data-state at scene time `at`.
      state: function (elId, name, o) { needWorld(world, "state").state(elId, name, (o && o.at) || 0); return api; },

      // Transition in/out from data-transition-in / data-transition-out or the brand default.
      done: function () {
        var kin = root.getAttribute("data-transition-in") || T.default;
        var kout = root.getAttribute("data-transition-out") || T.default;
        var td = parseFloat(root.getAttribute("data-transition-duration")) || T.duration || 0.4;
        var frames = q(".os-frame");
        var veil = document.createElement("div");
        veil.className = "os-veil";
        root.appendChild(veil);
        gsap.set(veil, { autoAlpha: 0 });
        if (kin !== "cut") {
          tl.fromTo(veil, { autoAlpha: 1 }, { autoAlpha: 0, duration: td, ease: "none" }, 0);
          if (kin === "slide-left") tl.fromTo(frames, { x: w * 0.06 }, { x: 0, duration: td * 1.5, ease: M.ease.out }, 0);
          if (kin === "slide-up") tl.fromTo(frames, { y: h * 0.06 }, { y: 0, duration: td * 1.5, ease: M.ease.out }, 0);
          if (kin === "zoom") tl.fromTo(frames, { scale: 1.06 }, { scale: 1, duration: td * 1.5, ease: M.ease.out }, 0);
          if (kin === "wipe") tl.fromTo(veil, { clipPath: "inset(0 0 0 0%)" }, { clipPath: "inset(0 0 0 100%)", duration: td, ease: M.ease.inOut }, 0);
        }
        if (kout !== "cut") tl.fromTo(veil, { autoAlpha: 0 }, { autoAlpha: 1, duration: td, ease: "none", immediateRender: false }, Math.max(0, dur - td));
        if (world) world.finish();
        labels();
        tl.seek(0);
        if (root.getAttribute("data-motion") === "stepped-12") quantiseTimeline(tl);
        previewAudio(api);
        return api;
      },
    };
    // Chip while an opinion / quote line is spoken: os-lines entries with a label (written by build-audio / sync-lines).
    function labels() {
      var times = lineTimes();
      Object.keys(times).forEach(function (id) {
        var t = times[id];
        if (!t.label) return;
        var chip = document.createElement("div");
        chip.className = "os-label os-label-" + (t.kind === "quote" ? "quote" : "opinion");
        chip.textContent = t.label;
        root.appendChild(chip);
        gsap.set(chip, { autoAlpha: 0 });
        tl.to(chip, { autoAlpha: 1, duration: M.duration.fast, ease: M.ease.out }, t.start);
        tl.to(chip, { autoAlpha: 0, duration: M.duration.fast, ease: M.ease.in }, Math.max(t.start, t.end - M.duration.fast));
      });
    }
    var cachedLines = null;
    function lineTimes() {
      if (cachedLines) return cachedLines;
      var el = document.getElementById("os-lines");
      try { cachedLines = el ? JSON.parse(el.textContent) : {}; } catch (e) { cachedLines = {}; }
      return cachedLines;
    }
    return api;
  }

  // Build bar DOM from rows. o: { label, value, highlight (index or "max"|"min"|"last"), scale: "linear"|"log", format }
  function barChart(container, rows, o) {
    o = o || {};
    var el = typeof container === "string" ? document.querySelector(container) : container;
    var keys = Object.keys(rows[0] || {});
    var lk = o.label || keys.find(function (k) { return typeof rows[0][k] === "string"; }) || keys[0];
    var vk = o.value || keys.find(function (k) { return k !== lk && typeof rows[0][k] === "number"; });
    var vals = rows.map(function (r) { return +r[vk]; });
    var f = o.scale === "log" ? function (v) { return Math.log10(Math.max(v, 1) + 1); } : function (v) { return v; };
    var max = Math.max.apply(null, vals.map(f)) || 1;
    var hi = o.highlight === "max" ? vals.indexOf(Math.max.apply(null, vals)) : o.highlight === "min" ? vals.indexOf(Math.min.apply(null, vals)) : o.highlight === "last" ? vals.length - 1 : o.highlight;
    el.classList.add("os-bars");
    el.innerHTML = "";
    rows.forEach(function (r, i) {
      var bar = document.createElement("div");
      bar.className = "os-bar" + (i === hi ? " is-highlight" : "");
      bar.innerHTML = '<div class="os-bar-value" data-value="' + r[vk] + '"></div><div class="os-bar-fill"></div><div class="os-bar-label"></div>';
      bar.querySelector(".os-bar-value").textContent = o.format ? o.format(r[vk]) : String(r[vk]);
      bar.querySelector(".os-bar-label").textContent = o.labelFormat ? o.labelFormat(r[lk]) : String(r[lk]);
      bar.querySelector(".os-bar-fill").style.height = Math.max(2, (f(+r[vk]) / max) * 100) * 0.7 + "%";
      el.appendChild(bar);
    });
    return el.querySelectorAll(".os-bar");
  }

  window.OS = { scene: scene, barChart: barChart, splitWords: splitWords, stepTime: stepTime, version: 2 };
})();
