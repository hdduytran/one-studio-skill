/* one-studio world camera math: pure functions, no DOM, no clock.
 * A view is { x, y, zoom }: the point of the world at the frame centre, zoom 1 = the whole world fits the frame.
 * Places and free targets resolve to views, so the same move works at 16:9, 9:16 and 1:1.
 * Loaded by scenes that use a world (os.js S.camera) and imported by tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OS_CAMERA = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var FILL = 0.9; // a place fills 90% of the frame on its tighter axis
  var ORBIT_DEG = 10;

  // Pixels per world unit when the whole world is contained in the frame.
  function contain(ctx) { return Math.min(ctx.frame.w / ctx.world.w, ctx.frame.h / ctx.world.h); }

  // target: place id (ctx.places[id] = { x, y, w, h } in world units) or { x, y, zoom? }.
  function viewOf(target, ctx) {
    if (typeof target === "string") {
      var p = ctx.places[target];
      if (!p) throw new Error('camera: no [data-place="' + target + '"] in the world');
      var fit = Math.min(ctx.frame.w / p.w, ctx.frame.h / p.h) * (ctx.fill || FILL);
      return { x: p.x + p.w / 2, y: p.y + p.h / 2, zoom: fit / contain(ctx) };
    }
    if (target && isFinite(target.x) && isFinite(target.y)) {
      var z = target.zoom == null ? 1 : +target.zoom;
      if (!(z > 0)) throw new Error("camera: zoom must be > 0");
      return { x: +target.x, y: +target.y, zoom: z };
    }
    throw new Error("camera: target must be a place id or { x, y, zoom }");
  }

  // View at progress p (0..1, already eased). Zoom interpolates on a log scale so it feels even.
  // push/orbit slide the centre so the destination stays put while zooming (constant pan speed on screen);
  // fly and follow slide it linearly, and fly also pulls back in the middle for long hops.
  function sample(a, b, p, move, ctx) {
    if (p >= 1) return { x: b.x, y: b.y, zoom: b.zoom, rot: 0 };
    if (p <= 0 || move === "cut") return { x: a.x, y: a.y, zoom: a.zoom, rot: 0 };
    var lz = Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * p;
    var s = p;
    var wa = 1 / a.zoom, wb = 1 / b.zoom;
    if ((move === "push" || move === "orbit" || !move) && Math.abs(wa - wb) > 1e-9) s = (wa - 1 / Math.exp(lz)) / (wa - wb);
    var arc = Math.sin(Math.PI * p);
    if (move === "fly") {
      var tight = Math.min(ctx.frame.w, ctx.frame.h) / (Math.max(a.zoom, b.zoom) * contain(ctx));
      lz -= 0.5 * Math.log(1 + Math.hypot(b.x - a.x, b.y - a.y) / tight) * arc;
    }
    return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, zoom: Math.exp(lz), rot: move === "orbit" ? ORBIT_DEG * arc : 0 };
  }

  // CSS transform (origin 0 0) that puts the view centre in the middle of the frame.
  function transform(v, ctx) {
    var sc = v.zoom * contain(ctx);
    return "translate(" + ctx.frame.w / 2 + "px," + ctx.frame.h / 2 + "px) rotate(" + (v.rot || 0) + "deg) scale(" + sc + ") translate(" + -v.x + "px," + -v.y + "px)";
  }

  return { FILL: FILL, contain: contain, viewOf: viewOf, sample: sample, transform: transform };
});
