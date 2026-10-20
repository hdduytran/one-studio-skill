import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme } from "../theme";

/** Slow drifting colour blobs + grain. Fully frame-driven and seeded, so renders are repeatable. */
export const Background: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { colors } = useTheme();
  const blobs = [colors.primary, colors.accent, colors.primary];

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {blobs.map((c, i) => {
        const seed = `blob-${i}`;
        const x = (random(seed + "x") * 0.8 + 0.1) * width + Math.sin(frame / (90 + i * 30) + i) * width * 0.08;
        const y = (random(seed + "y") * 0.8 + 0.1) * height + Math.cos(frame / (110 + i * 25) + i) * height * 0.08;
        const size = Math.min(width, height) * (0.7 + random(seed + "s") * 0.4);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${c}55 0%, ${c}00 65%)`,
              opacity: 0.55 * intensity,
            }}
          />
        );
      })}
      {/* Static grain: an SVG turbulence filter, seeded per-frame step for subtle film texture. */}
      <svg width={width} height={height} style={{ position: "absolute", opacity: 0.07 * intensity, mixBlendMode: "overlay" }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={Math.floor(frame / 2) % 50} />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};
