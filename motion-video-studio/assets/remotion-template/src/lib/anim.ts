import { interpolate, spring } from "remotion";
import { ease } from "../theme";

/** 0→1 progress for an entrance that starts at `delay` frames and lasts `dur` frames. */
export const enter = (frame: number, delay = 0, dur = 18, easing = ease.out) =>
  interpolate(frame, [delay, delay + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

/** Spring 0→1 starting at `delay` frames (Remotion's deterministic spring). */
export const pop = (frame: number, fps: number, delay = 0, damping = 14) =>
  spring({ frame: frame - delay, fps, config: { damping, stiffness: 160, mass: 0.8 } });

/** Exit 1→0 over the last `dur` frames of a scene (use when there is no transition out). */
export const exit = (frame: number, total: number, dur = 12) =>
  interpolate(frame, [total - dur, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.in });
