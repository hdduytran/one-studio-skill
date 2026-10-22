/* one-studio screen scene runtime: a recorded screen in a window/device frame with an auto-zoom camera,
 * a redrawn cursor, click ripples and motion blur. Pure functions of scene time, no clock, no randomness.
 * Inputs: the capture's events.json (see capture-screen.mjs) and the scene's data-screen options.
 * Loaded after camera.js (its view maths is reused); the pure parts are also imported by tests.
 */
(function (root, factory) {
  var api = factory(typeof require === "function" && typeof module === "object" ? require("./camera.js") : root.OS_CAMERA);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OS_SCREEN = api;
})(typeof window !== "undefined" ? window : this, function (CAM) {
  "use strict";
  var MERGE_GAP = 1.2;   // clicks closer than this share one zoom
  var LEAD = 0.6;        // zoom-in finishes as the click lands
  var TRAIL = 0.7;       // keep the zoom this long after the last click
  var MIN_HOLD = 1.2;    // a zoom stays at least this long once reached
  var EASE_OUT = 0.8;    // zoom back out
  var MIN_ZOOM = 1.15, MAX_ZOOM = 3.2;
  var TINY_MOVE = 0.06;  // of the frame width: smaller moves between zooms are ignored
  var SPRING_DT = 1 / 240;

  var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
  var easeInOut = function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };

  // Where the recording sits in the scene: the frame chrome and the video, in scene px.
  // The bottom caption zone stays clear (same 16% as the other scene types).
  function layout(W, H, viewport, kind) {
    var u = Math.min(W, H) / 1080;
    var pad = 48 * u;
    var bar = kind === "window" ? 44 * u : 0;
    var bezel = kind === "device" ? 22 * u : 0;
    var availW = W - 2 * pad;
    var availH = H - pad - Math.max(pad, H * 0.16);
    var s = Math.min((availW - 2 * bezel) / viewport.width, (availH - bar - 2 * bezel) / viewport.height);
    var vw = viewport.width * s, vh = viewport.height * s;
    var fw = vw + 2 * bezel, fh = vh + bar + 2 * bezel;
    var fx = (W - fw) / 2, fy = pad + (availH - fh) / 2;
    return { u: u, s: s, bar: bar, bezel: bezel, frame: { x: fx, y: fy, w: fw, h: fh }, video: { x: fx + bezel, y: fy + bar + bezel, w: vw, h: vh } };
  }

  // Click / typing targets inside [from, to], as zoom groups in scene time: nearby ones merge.
  function groups(events, from, to, extra) {
    var items = [];
    (events.clicks || []).forEach(function (c) { items.push({ start: c.t, end: c.t, rect: c.rect }); });
    (events.types || []).forEach(function (c) { items.push({ start: c.t0, end: c.t1, rect: c.rect }); });
    (extra || []).forEach(function (z) { items.push({ start: z.at + from, end: z.at + from + (z.hold || 0), rect: z.rect }); });
    items = items.filter(function (i) { return i.start >= from && i.start <= to; }).sort(function (a, b) { return a.start - b.start; });
    var out = [];
    items.forEach(function (it) {
      var g = out[out.length - 1];
      if (g && it.start - g.end < MERGE_GAP) {
        var x0 = Math.min(g.rect.x, it.rect.x), y0 = Math.min(g.rect.y, it.rect.y);
        var x1 = Math.max(g.rect.x + g.rect.w, it.rect.x + it.rect.w), y1 = Math.max(g.rect.y + g.rect.h, it.rect.y + it.rect.h);
        g.rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        g.end = Math.max(g.end, it.end);
      } else out.push({ start: it.start, end: it.end, rect: it.rect });
    });
    return out.map(function (g) { return { start: g.start - from, end: g.end - from, rect: g.rect }; });
  }

  // Camera view (CAM space = scene px, zoom 1 = whole frame) that shows a video-space rect with context.
  function viewFor(rect, lay, W, H, viewport) {
    var visW = Math.max(rect.w * 2.5, rect.h * 2.5 * (W / H), viewport.width * 0.4);
    var zoom = clamp(W / (lay.s * visW), MIN_ZOOM, MAX_ZOOM);
    var cx = lay.video.x + (rect.x + rect.w / 2) * lay.s;
    var cy = lay.video.y + (rect.y + rect.h / 2) * lay.s;
    var halfW = W / (2 * zoom), halfH = H / (2 * zoom);
    // Stay inside the recording when it is big enough to; centre on it otherwise.
    cx = lay.video.w > 2 * halfW ? clamp(cx, lay.video.x + halfW, lay.video.x + lay.video.w - halfW) : lay.video.x + lay.video.w / 2;
    cy = lay.video.h > 2 * halfH ? clamp(cy, lay.video.y + halfH, lay.video.y + lay.video.h - halfH) : lay.video.y + lay.video.h / 2;
    return { x: cx, y: cy, zoom: zoom };
  }

  // Camera plan: waypoints { t, view } in scene seconds; consecutive waypoints are eased moves (equal views = a hold).
  function plan(events, o) {
    var full = { x: o.W / 2, y: o.H / 2, zoom: 1 };
    var wps = [{ t: 0, view: full }];
    if (o.zoom === "manual" && !(o.zooms && o.zooms.length)) return wps;
    var gs = groups(events, o.from, o.to, o.zooms);
    var views = gs.map(function (g) { return viewFor(g.rect, o.layout, o.W, o.H, o.viewport); });
    // Tiny moves between neighbouring zooms are ignored: fold the group into the previous one.
    var merged = [];
    gs.forEach(function (g, i) {
      var prev = merged[merged.length - 1];
      var v = views[i];
      if (prev && Math.hypot(v.x - prev.view.x, v.y - prev.view.y) < TINY_MOVE * o.W && Math.abs(Math.log(v.zoom / prev.view.zoom)) < 0.08) prev.end = g.end;
      else merged.push({ start: g.start, end: g.end, view: v });
    });
    var cur = full, at = 0; // current view and the time it is held from
    merged.forEach(function (g) {
      // Room for a full zoom out before the next lead-in: show the whole frame between zooms; otherwise pan straight across.
      if (cur !== full && g.start - LEAD - at >= EASE_OUT + 0.3) {
        wps.push({ t: at, view: cur }, { t: at + EASE_OUT, view: full });
        cur = full;
        at += EASE_OUT;
      }
      var inStart = Math.max(at, g.start - LEAD);
      wps.push({ t: inStart, view: cur });
      wps.push({ t: Math.max(inStart + 0.3, g.start), view: g.view });
      var hold = Math.max(g.end + TRAIL, wps[wps.length - 1].t + MIN_HOLD);
      wps.push({ t: hold, view: g.view });
      cur = g.view;
      at = hold;
    });
    if (merged.length) {
      // Zoom out after the last hold, unless the scene ends first.
      wps.push({ t: at + EASE_OUT, view: full });
    }
    // A waypoint at the same time as the previous one repeats its view (direct pan between zooms): drop it.
    return wps.filter(function (w, i) { return i === 0 || w.t > wps[i - 1].t; });
  }

  // View at scene time t.
  function viewAt(wps, t, ctx) {
    var i = 0;
    while (i + 1 < wps.length && wps[i + 1].t <= t) i++;
    var a = wps[i], b = wps[i + 1];
    if (!b) return { x: a.view.x, y: a.view.y, zoom: a.view.zoom, rot: 0 };
    var p = clamp((t - a.t) / (b.t - a.t), 0, 1);
    return CAM.sample(a.view, b.view, easeInOut(p), "push", ctx);
  }

  // Blur radius (px) from how fast the camera moves on screen at time t: centre travel plus zoom change.
  function blurAt(wps, t, ctx, u) {
    var d = 1 / 60;
    var a = viewAt(wps, Math.max(0, t - d), ctx), b = viewAt(wps, t + d, ctx);
    var travel = Math.hypot((b.x - a.x) * b.zoom, (b.y - a.y) * b.zoom) + Math.abs(Math.log(b.zoom / a.zoom)) * 0.5 * Math.hypot(ctx.frame.w, ctx.frame.h);
    var speed = travel / (t - Math.max(0, t - d) + d);
    return clamp((speed - 350) / 220, 0, 9) * u;
  }

  // Raw pointer position at video time t from the per-frame samples [t, x, y].
  function rawAt(samples, t) {
    if (!samples.length) return { x: 0, y: 0 };
    var fps = samples.length > 1 ? 1 / (samples[1][0] - samples[0][0]) : 30;
    var f = clamp(t * fps, 0, samples.length - 1);
    var i = Math.floor(f), j = Math.min(samples.length - 1, i + 1), k = f - i;
    return { x: samples[i][1] + (samples[j][1] - samples[i][1]) * k, y: samples[i][2] + (samples[j][2] - samples[i][2]) * k };
  }

  // Cursor path over [from, to]: a critically damped spring chasing the raw path, integrated on a fixed step,
  // so the same input always gives the same positions. Drags and smooth 0 use the raw data.
  // Returns at(t): { x, y } in video css px, t in seconds from `from`.
  function cursorTrack(events, from, to, smooth) {
    var samples = events.cursor || [];
    var drags = events.drags || [];
    var w = 70 * (1 - 0.88 * clamp(smooth, 0, 1)); // rad/s: smooth 0.5 is about 40 ms of lag
    var n = Math.ceil((to - from) / SPRING_DT) + 2;
    var xs = new Float32Array(n), ys = new Float32Array(n);
    var p = rawAt(samples, from), vx = 0, vy = 0;
    for (var i = 0; i < n; i++) {
      var t = from + i * SPRING_DT;
      var raw = rawAt(samples, t);
      var dragging = drags.some(function (d) { return t >= d.t0 && t <= d.t1; });
      if (smooth <= 0 || dragging) { p = raw; vx = vy = 0; } else {
        vx += (w * w * (raw.x - p.x) - 2 * w * vx) * SPRING_DT; p = { x: p.x + vx * SPRING_DT, y: p.y };
        vy += (w * w * (raw.y - p.y) - 2 * w * vy) * SPRING_DT; p = { x: p.x, y: p.y + vy * SPRING_DT };
      }
      xs[i] = p.x; ys[i] = p.y;
    }
    return function at(t) {
      var f = clamp(t / SPRING_DT, 0, n - 1), i = Math.floor(f), j = Math.min(n - 1, i + 1), k = f - i;
      return { x: xs[i] + (xs[j] - xs[i]) * k, y: ys[i] + (ys[j] - ys[i]) * k };
    };
  }

  // ---- browser side ----
  function readEvents(rootEl) {
    var link = rootEl.querySelector('link[rel="x-screen"]');
    if (!link) throw new Error('OS screen: missing <link rel="x-screen" href="../capture/<flow>/events.json">');
    var xhr = new XMLHttpRequest();
    xhr.open("GET", link.href, false);
    xhr.send(null);
    if (xhr.status !== 200 && xhr.status !== 0) throw new Error("OS screen: cannot load " + link.href + " (" + xhr.status + ")");
    return JSON.parse(xhr.responseText);
  }

  // S = OS.scene(id); opts.zooms (zoom "manual"): [{ at, hold, rect: {x,y,w,h} in recorded-page px }].
  function mount(S, opts) {
    opts = opts || {};
    if (!CAM) throw new Error("OS screen: assets/camera.js is not loaded");
    var rootEl = S.root;
    var stage = rootEl.querySelector(".scr-stage");
    var cfg = JSON.parse(stage.getAttribute("data-screen"));
    var events = readEvents(rootEl);
    var W = +rootEl.getAttribute("data-width"), H = +rootEl.getAttribute("data-height");
    var lay = layout(W, H, events.viewport, cfg.frame);
    var frame = stage.querySelector(".scr-frame"), screen = stage.querySelector(".scr-screen"), video = stage.querySelector("video");
    var box = function (el, x, y, w, h) { el.style.left = x + "px"; el.style.top = y + "px"; el.style.width = w + "px"; el.style.height = h + "px"; };
    box(frame, lay.frame.x, lay.frame.y, lay.frame.w, lay.frame.h);
    frame.setAttribute("data-kind", cfg.frame);
    frame.style.setProperty("--scr-bar", lay.bar + "px");
    box(screen, lay.bezel, lay.bar + lay.bezel, lay.video.w, lay.video.h);
    video.style.width = lay.video.w + "px"; video.style.height = lay.video.h + "px";
    stage.style.width = W + "px"; stage.style.height = H + "px";

    var ctx = { frame: { w: W, h: H }, world: { w: W, h: H }, places: {} };
    var wps = plan(events, { W: W, H: H, from: cfg.from, to: cfg.to, zoom: cfg.zoom, layout: lay, viewport: events.viewport, zooms: opts.zooms });
    var track = cursorTrack(events, cfg.from, cfg.to, cfg.cursor.smooth);
    var cursor = stage.querySelector(".scr-cursor");
    var size = cfg.cursor.size * lay.u;
    cursor.style.width = size + "px"; cursor.style.height = size * 1.4 + "px";

    // Click ripples: one element per click, scaled and faded on the timeline.
    (events.clicks || []).filter(function (c) { return c.t >= cfg.from && c.t < cfg.to; }).forEach(function (c) {
      var r = document.createElement("div");
      r.className = "scr-ripple";
      var d = 56 * lay.u;
      r.style.cssText = "width:" + d + "px;height:" + d + "px;left:" + (lay.video.x + c.x * lay.s - d / 2) + "px;top:" + (lay.video.y + c.y * lay.s - d / 2) + "px";
      stage.appendChild(r);
      S.tl.set(r, { autoAlpha: 0 }, 0);
      S.tl.fromTo(r, { autoAlpha: 0.6, scale: 0.25 }, { autoAlpha: 0, scale: 1.8, duration: 0.55, ease: "power2.out", immediateRender: false }, c.t - cfg.from);
    });

    function render(t) {
      var v = viewAt(wps, t, ctx);
      stage.style.transform = CAM.transform(v, ctx);
      var b = blurAt(wps, t, ctx, lay.u);
      stage.style.filter = b > 0.3 ? "blur(" + b.toFixed(2) + "px)" : "none";
      var p = track(t);
      // The arrow's tip sits at (2, 2) of its 20 x 28 box.
      cursor.style.transform = "translate(" + (lay.video.x + p.x * lay.s - size * 0.1) + "px," + (lay.video.y + p.y * lay.s - size * 0.1) + "px)";
    }
    var clock = { t: 0 };
    S.tl.to(clock, { t: S.dur, duration: S.dur, ease: "none", onUpdate: function () { render(clock.t); } }, 0);
    render(0);
    return { plan: wps, layout: lay, view: function (t) { return viewAt(wps, t, ctx); }, render: render };
  }

  return { layout: layout, groups: groups, viewFor: viewFor, plan: plan, viewAt: viewAt, blurAt: blurAt, cursorTrack: cursorTrack, mount: mount, constants: { MERGE_GAP: MERGE_GAP, MIN_HOLD: MIN_HOLD } };
});
