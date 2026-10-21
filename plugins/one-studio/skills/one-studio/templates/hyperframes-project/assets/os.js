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

  function fmt(n, o) {
    var s = n.toFixed(o.decimals || 0);
    if (o.thousands !== false) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, o.separator || ".");
    return (o.prefix || "") + s + (o.suffix || "");
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
        tl.seek(0);
        previewAudio(api);
        return api;
      },
    };
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

  window.OS = { scene: scene, barChart: barChart, splitWords: splitWords, version: 2 };
})();
