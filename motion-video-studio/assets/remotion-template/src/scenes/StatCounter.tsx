import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { enter } from "../lib/anim";
import { Stage } from "../components/Stage";
import { ease, type, useTheme } from "../theme";

/** Big number that counts up with a progress ring. Good for "proof" beats. */
export const StatCounter: React.FC<{ value: number; prefix?: string; suffix?: string; label: string; decimals?: number }> = ({
  value,
  prefix = "",
  suffix = "",
  label,
  decimals = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const ts = type(theme);
  const p = interpolate(frame, [6, 6 + fps * 1.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.out });
  const r = theme.unit * 0.22;
  const c = 2 * Math.PI * r;

  return (
    <Stage>
      <div style={{ position: "relative", width: r * 2.4, height: r * 2.4, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={r * 2.4} height={r * 2.4} style={{ position: "absolute", rotate: "-90deg" }}>
          <circle cx={r * 1.2} cy={r * 1.2} r={r} fill="none" stroke={theme.colors.surface} strokeWidth={r * 0.12} />
          <circle
            cx={r * 1.2}
            cy={r * 1.2}
            r={r}
            fill="none"
            stroke={theme.colors.accent}
            strokeWidth={r * 0.12}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - p)}
          />
        </svg>
        <div style={{ fontSize: ts.display * 1.1, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {prefix}
          {(value * p).toFixed(decimals)}
          {suffix}
        </div>
      </div>
      <div style={{ fontSize: ts.h2, color: theme.colors.muted, marginTop: theme.unit * 0.03, opacity: enter(frame, 20, 18) }}>{label}</div>
    </Stage>
  );
};
