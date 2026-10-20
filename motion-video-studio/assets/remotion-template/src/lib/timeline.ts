// Pure timing logic shared by the Remotion composition and
// scripts/storyboard_to_timeline.mjs (Node strips the types).
// Keep it dependency-free.
import type { Aspect, SceneSpec, Storyboard } from "./types";

export const ASPECTS: Record<Aspect, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export type TimedScene = SceneSpec & {
  durationInFrames: number;
  transitionFrames: number;
  /** Absolute frame where the scene starts (transition overlap included). */
  startFrame: number;
  /** Absolute frame where VO starts (for music ducking). */
  voStartFrame: number | null;
  voEndFrame: number | null;
};

export type Timeline = {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  scenes: TimedScene[];
  warnings: string[];
};

export function buildTimeline(sb: Storyboard): Timeline {
  const fps = sb.meta.fps ?? 30;
  const dims = ASPECTS[sb.meta.aspect ?? "16:9"] ?? ASPECTS["16:9"];
  const width = sb.meta.width ?? dims.width;
  const height = sb.meta.height ?? dims.height;
  const pad = sb.meta.voPadding ?? 0.4;
  const warnings: string[] = [];
  const ids = new Set<string>();

  let cursor = 0;
  const scenes: TimedScene[] = sb.scenes.map((s, i) => {
    if (ids.has(s.id)) warnings.push(`Duplicate scene id "${s.id}"`);
    ids.add(s.id);

    const voDelay = s.vo?.delay ?? 0.15;
    const voNeed = s.vo?.duration ? s.vo.duration + voDelay + pad : 0;
    if (s.vo?.src && !s.vo.duration) {
      warnings.push(`Scene "${s.id}": vo.src has no measured duration — run probe_audio.mjs`);
    }
    if (s.vo?.text && !s.vo.src) {
      // Rough reading-speed check so the script fits the scene.
      const words = s.vo.text.trim().split(/\s+/).length;
      const wps = sb.meta.language === "vi" ? 3.0 : 2.5;
      const est = words / wps;
      if (s.duration && est > s.duration) {
        warnings.push(
          `Scene "${s.id}": VO (~${est.toFixed(1)}s for ${words} words) is longer than duration ${s.duration}s`,
        );
      }
    }
    const seconds = Math.max(s.duration ?? 0, voNeed);
    if (seconds <= 0) warnings.push(`Scene "${s.id}" has no duration and no measured VO`);
    const durationInFrames = Math.max(1, Math.round(seconds * fps));

    const t = s.transition;
    let transitionFrames =
      i === 0 || !t || t.type === "none" ? 0 : Math.round((t.duration ?? 0.5) * fps);
    const prev = i > 0 ? sb.scenes[i - 1] : null;
    if (transitionFrames > 0 && prev) {
      // A transition cannot be longer than either neighbouring scene.
      const limit = Math.min(durationInFrames, Math.round((prev.duration ?? 1) * fps)) - 1;
      if (transitionFrames > limit) {
        warnings.push(`Scene "${s.id}": transition clamped to ${limit} frames`);
        transitionFrames = Math.max(0, limit);
      }
    }
    const startFrame = cursor - transitionFrames;
    cursor = startFrame + durationInFrames;
    const voStartFrame = s.vo?.src ? startFrame + Math.round(voDelay * fps) : null;
    const voEndFrame =
      voStartFrame !== null && s.vo?.duration
        ? voStartFrame + Math.round(s.vo.duration * fps)
        : null;
    return { ...s, durationInFrames, transitionFrames, startFrame, voStartFrame, voEndFrame };
  });

  return { fps, width, height, durationInFrames: Math.max(1, cursor), scenes, warnings };
}
