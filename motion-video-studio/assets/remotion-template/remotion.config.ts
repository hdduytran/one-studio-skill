import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Needed for WebGL (Three.js / R3F, Rive, dotLottie) in headless renders.
Config.setChromiumOpenGlRenderer("angle");

// Sandboxes without network can point at a pre-installed Chromium:
//   REMOTION_BROWSER=/path/to/chrome npx remotion render ...
if (process.env.REMOTION_BROWSER) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
}
