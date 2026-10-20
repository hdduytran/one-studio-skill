import { useCurrentFrame } from "remotion";
import { enter } from "../lib/anim";
import { Stage } from "../components/Stage";
import { type, useTheme } from "../theme";

/** Kinetic headline: kicker slides in, title words rise with stagger, subtitle fades. */
export const TitleCard: React.FC<{ kicker?: string; title: string; subtitle?: string }> = ({ kicker, title, subtitle }) => {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const ts = type(theme);
  const words = title.split(" ");

  return (
    <Stage>
      {kicker ? (
        <div
          style={{
            fontSize: ts.caption,
            fontWeight: 600,
            letterSpacing: "0.3em",
            color: theme.colors.accent,
            opacity: enter(frame, 0, 15),
            translate: `0 ${(1 - enter(frame, 0, 15)) * 20}px`,
            marginBottom: theme.unit * 0.03,
          }}
        >
          {kicker}
        </div>
      ) : null}
      <div style={{ fontSize: ts.display, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
        {words.map((w, i) => {
          const p = enter(frame, 6 + i * 4, 20);
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: "0.25em",
                opacity: p,
                translate: `0 ${(1 - p) * 0.6}em`,
                filter: `blur(${(1 - p) * 12}px)`,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
      {subtitle ? (
        <div style={{ fontSize: ts.h2, color: theme.colors.muted, marginTop: theme.unit * 0.03, opacity: enter(frame, 18 + words.length * 4, 18) }}>
          {subtitle}
        </div>
      ) : null}
    </Stage>
  );
};
