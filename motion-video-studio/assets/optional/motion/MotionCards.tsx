import { useCurrentFrame, useVideoConfig } from "remotion";
import { motionInertia, motionSpring } from "../bridges/motionAt";
import { Stage } from "../components/Stage";
import { type, useTheme } from "../theme";

/** UI-mock scene using Motion springs (bouncy cards) + inertia (a flicked feed). */
export const MotionCards: React.FC<{ title?: string; cards?: string[] }> = ({ title = "Motion springs", cards = ["Ăn uống", "Di chuyển", "Mua sắm", "Hoá đơn"] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const ts = type(theme);
  const feed = motionInertia(frame, fps, { velocity: -250, power: 0.5, delay: 40, min: -80, max: 0 });

  return (
    <Stage>
      <div style={{ fontSize: ts.h1, fontWeight: 800, marginBottom: theme.unit * 0.04, scale: String(motionSpring(frame, fps, { bounce: 0.4, visualDuration: 0.5 })) }}>{title}</div>
      <div style={{ display: "flex", gap: theme.unit * 0.03, translate: `${feed}px 0` }}>
        {cards.map((c, i) => {
          const s = motionSpring(frame, fps, { delay: 6 + i * 5, bounce: 0.45, visualDuration: 0.45 });
          return (
            <div key={c} style={{ width: theme.unit * 0.22, height: theme.unit * 0.28, borderRadius: 24, background: theme.colors.surface, border: `2px solid ${theme.colors.primary}55`, display: "flex", alignItems: "flex-end", padding: 20, fontSize: ts.body, fontWeight: 600, scale: String(s), translate: `0 ${(1 - s) * 80}px` }}>
              {c}
            </div>
          );
        })}
      </div>
    </Stage>
  );
};
