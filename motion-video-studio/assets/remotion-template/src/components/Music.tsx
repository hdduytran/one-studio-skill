import { Audio } from "@remotion/media";
import { interpolate } from "remotion";
import { resolveSrc } from "../lib/assets";
import type { Timeline } from "../lib/timeline";
import type { Storyboard } from "../lib/types";

type MusicSpec = NonNullable<NonNullable<Storyboard["audio"]>["music"]>;

/** Background music that ducks under every voice-over line and fades out at the end. */
export const Music: React.FC<{ music: MusicSpec; timeline: Timeline }> = ({ music, timeline }) => {
  const base = music.volume ?? 0.6;
  const ducked = music.duckTo ?? 0.18;
  const ramp = Math.round(timeline.fps * 0.25);
  const fadeOut = Math.round((music.fadeOut ?? 1.5) * timeline.fps);
  const vo = timeline.scenes
    .filter((s) => s.voStartFrame !== null && s.voEndFrame !== null)
    .map((s) => [s.voStartFrame as number, s.voEndFrame as number] as const);

  return (
    <Audio
      src={resolveSrc(music.src)}
      loop
      volume={(f) => {
        let v = base;
        for (const [a, b] of vo) {
          const d = interpolate(f, [a - ramp, a, b, b + ramp], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          v = Math.min(v, base - (base - ducked) * d);
        }
        const end = timeline.durationInFrames;
        return v * interpolate(f, [end - fadeOut, end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      }}
    />
  );
};
