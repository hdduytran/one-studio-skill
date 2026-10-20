import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { enter } from "../lib/anim";
import { resolveSrc } from "../lib/assets";
import { safe, type, useTheme } from "../theme";

/** Image/screenshot with a slow Ken Burns push and an optional lower-third caption. */
export const ImageFocus: React.FC<{ src: string; caption?: string; zoom?: [number, number]; fit?: "cover" | "contain" }> = ({
  src,
  caption,
  zoom = [1, 1.12],
  fit = "cover",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const theme = useTheme();
  const m = safe(width, height);
  const scale = interpolate(frame, [0, durationInFrames], zoom);

  return (
    <AbsoluteFill>
      <Img src={resolveSrc(src)} style={{ width: "100%", height: "100%", objectFit: fit, scale: String(scale) }} />
      {caption ? (
        <div
          style={{
            position: "absolute",
            left: m.x,
            bottom: m.y,
            padding: "0.4em 0.8em",
            fontSize: type(theme).body,
            fontWeight: 600,
            background: theme.colors.surface,
            borderLeft: `6px solid ${theme.colors.accent}`,
            opacity: enter(frame, 10, 15),
            translate: `${(1 - enter(frame, 10, 15)) * -40}px 0`,
          }}
        >
          {caption}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
