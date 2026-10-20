import { Img, useCurrentFrame, useVideoConfig } from "remotion";
import { enter, pop } from "../lib/anim";
import { resolveSrc } from "../lib/assets";
import { Stage } from "../components/Stage";
import { type, useTheme } from "../theme";

/** Closing card: optional logo, headline, pulsing CTA pill. */
export const EndCard: React.FC<{ title: string; cta?: string; logo?: string }> = ({ title, cta, logo }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const ts = type(theme);
  const pulse = 1 + Math.sin(Math.max(0, frame - 30) / 6) * 0.03 * enter(frame, 30, 10);

  return (
    <Stage>
      {logo ? <Img src={resolveSrc(logo)} style={{ height: theme.unit * 0.12, marginBottom: theme.unit * 0.04, scale: String(pop(frame, fps, 0)) }} /> : null}
      <div style={{ fontSize: ts.h1, fontWeight: 800, opacity: enter(frame, 4, 16), translate: `0 ${(1 - enter(frame, 4, 16)) * 30}px` }}>{title}</div>
      {cta ? (
        <div
          style={{
            marginTop: theme.unit * 0.05,
            padding: "0.5em 1.1em",
            borderRadius: 999,
            background: theme.colors.primary,
            color: theme.colors.bg,
            fontSize: ts.body,
            fontWeight: 800,
            scale: String(pop(frame, fps, 14) * pulse),
          }}
        >
          {cta}
        </div>
      ) : null}
    </Stage>
  );
};
