import { inertia, keyframes, spring } from "motion";

/**
 * Frame-driven Motion. Motion's animation generators are pure functions of
 * time, so we sample them at frame/fps — never use <motion.div animate> or
 * animate() inside a Remotion render (they run on the wall clock).
 */
const ms = (frame: number, fps: number, delayFrames = 0) => Math.max(0, ((frame - delayFrames) / fps) * 1000);

/** Physical spring from → to. Use `bounce` + `visualDuration` (seconds) for designer-friendly tuning. */
export const motionSpring = (
  frame: number,
  fps: number,
  o: { from?: number; to?: number; delay?: number; stiffness?: number; damping?: number; mass?: number; bounce?: number; visualDuration?: number; velocity?: number },
) => {
  const { from = 0, to = 1, delay = 0, ...cfg } = o;
  return spring({ keyframes: [from, to], ...cfg }).next(ms(frame, fps, delay)).value as number;
};

/** Multi-stop tween with Motion's easing names ("easeInOut", "backOut", "circOut"…). Duration in seconds. */
export const motionKeyframes = (
  frame: number,
  fps: number,
  o: { values: number[]; duration: number; times?: number[]; ease?: string | string[]; delay?: number },
) =>
  keyframes({
    keyframes: o.values,
    duration: o.duration * 1000,
    times: o.times,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ease: o.ease as any,
  }).next(ms(frame, fps, o.delay)).value as number;

/** Momentum "flick" that decelerates (e.g. a list or carousel thrown by a finger). */
export const motionInertia = (frame: number, fps: number, o: { from?: number; velocity: number; power?: number; timeConstant?: number; min?: number; max?: number; delay?: number }) => {
  const { from = 0, delay = 0, ...cfg } = o;
  return inertia({ keyframes: [from], ...cfg }).next(ms(frame, fps, delay)).value as number;
};
