import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Timeline } from "../lib/timeline";
import { safe, type, useTheme } from "../theme";

/**
 * Simple burned-in captions from scene vo.text, split into short chunks spread
 * evenly over the VO (or the scene). For word-accurate captions, transcribe the
 * VO with @remotion/captions (Whisper) instead — see references/09-audio.md.
 */
export const Captions: React.FC<{ timeline: Timeline; wordsPerChunk?: number }> = ({ timeline, wordsPerChunk = 6 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const theme = useTheme();
  const m = safe(width, height);

  let text: string | null = null;
  let local = 0;
  let len = 1;
  for (const s of timeline.scenes) {
    if (!s.vo?.text) continue;
    const start = s.voStartFrame ?? s.startFrame + s.transitionFrames;
    const end = s.voEndFrame ?? s.startFrame + s.durationInFrames;
    if (frame < start || frame >= end) continue;
    const words = s.vo.text.split(/\s+/);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
    const per = (end - start) / chunks.length;
    const idx = Math.min(chunks.length - 1, Math.floor((frame - start) / per));
    text = chunks[idx];
    local = frame - start - idx * per;
    len = per;
  }
  if (!text) return null;

  const opacity = interpolate(local, [0, 4, len - 4, len], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: m.y * (height > width ? 3 : 1.2) }}>
      <div
        style={{
          opacity,
          maxWidth: width - m.x * 2,
          fontSize: type(theme).caption * 1.2,
          fontWeight: 600,
          textAlign: "center",
          padding: "0.3em 0.7em",
          borderRadius: 12,
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
