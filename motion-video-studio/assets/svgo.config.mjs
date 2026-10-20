// SVGO config tuned for SVGs that will be ANIMATED (not just displayed):
// keep ids/classes you target from code, keep paths separate so they can be
// staggered, keep viewBox so the SVG scales with the frame.
export default {
  multipass: true,
  floatPrecision: 2,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          cleanupIds: false, // GSAP/Anime/CSS target elements by id
          mergePaths: false, // separate paths = separate draw-on strokes
          collapseGroups: false, // groups are handy animation pivots
          convertShapeToPath: false, // keep <circle>/<rect> semantics (easier to animate r, width…)
          moveGroupAttrsToElems: false,
          inlineStyles: { onlyMatchedOnce: false },
        },
      },
    },
    "removeDimensions", // drop width/height → size from CSS, viewBox kept
    "sortAttrs",
  ],
};
