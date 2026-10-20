import { useCurrentFrame, useVideoConfig } from "remotion";
import { enter, pop } from "../lib/anim";
import { Stage } from "../components/Stage";
import { type, useTheme } from "../theme";

/** Title + items that pop in one by one. `stepFrames` controls the rhythm — match it to the VO. */
export const BulletList: React.FC<{ title?: string; items: string[]; stepFrames?: number }> = ({ title, items, stepFrames = 10 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const ts = type(theme);

  return (
    <Stage align="start" style={{ justifyContent: "center" }}>
      {title ? (
        <div style={{ fontSize: ts.h1, fontWeight: 800, marginBottom: theme.unit * 0.04, opacity: enter(frame, 0, 15) }}>{title}</div>
      ) : null}
      {items.map((item, i) => {
        const d = 12 + i * stepFrames;
        const p = enter(frame, d, 16);
        const s = pop(frame, fps, d);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.6em", fontSize: ts.h2 * 1.15, fontWeight: 600, marginBottom: "0.45em", opacity: p, translate: `${(1 - p) * 40}px 0` }}>
            <div
              style={{
                width: "1.1em",
                height: "1.1em",
                borderRadius: "50%",
                background: theme.colors.primary,
                color: theme.colors.bg,
                fontSize: "0.7em",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                scale: String(s),
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <span>{item}</span>
          </div>
        );
      })}
    </Stage>
  );
};
