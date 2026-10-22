/* Runs inside each preview scene (between brand.js and os.js): applies the editor's overrides before the scene
 * builds its timeline, then keeps CSS variables and the surface stylesheet live through postMessage. */
(function () {
  "use strict";
  var hash = {};
  try { hash = JSON.parse(decodeURIComponent(location.hash.slice(1)) || "{}"); } catch (e) { hash = {}; }
  function merge(a, b) {
    Object.keys(b).forEach(function (k) {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") merge(a[k], b[k]);
      else a[k] = b[k];
    });
  }
  function vars(v) { Object.keys(v || {}).forEach(function (k) { document.documentElement.style.setProperty(k, v[k]); }); }
  function surface(s) {
    var link = document.querySelector('link[rel="stylesheet"][href*="brand"]');
    if (link && s) link.setAttribute("href", "../assets/brand-" + s + ".css");
  }
  window.BRAND = window.BRAND || {};
  if (hash.brand) merge(window.BRAND, hash.brand);
  vars(hash.vars);
  surface(hash.surface);
  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.os !== "editor") return;
    vars(d.vars);
    surface(d.surface);
  });
  window.addEventListener("load", function () {
    var tls = window.__timelines || {};
    Object.keys(tls).forEach(function (id) {
      // The settled picture sits before the exit transition, like the stills style-compare takes (75% in).
      if (hash.play) tls[id].restart(); else tls[id].time(tls[id].duration() * 0.75);
    });
  });
})();
