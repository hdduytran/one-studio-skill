import { useGsapTimeline } from "../bridges/useGsapTimeline";
import { Stage } from "../components/Stage";
import { type, useTheme } from "../theme";

/** Example of a GSAP-driven scene: staggered grid with overlapping tweens. */
export const GsapShapes: React.FC<{ caption?: string; count?: number }> = ({ caption, count = 12 }) => {
  const theme = useTheme();
  const size = theme.unit * 0.09;
  const scope = useGsapTimeline<HTMLDivElement>((tl, q) => {
    tl.from(q(".cell"), { scale: 0, rotate: -90, opacity: 0, duration: 0.6, ease: "back.out(2)", stagger: { each: 0.04, from: "center" } })
      .to(q(".cell"), { borderRadius: "50%", duration: 0.5, ease: "power2.inOut", stagger: 0.03 }, "-=0.2")
      .to(q(".cell"), { y: (i: number) => (i % 2 ? -size * 0.4 : size * 0.4), duration: 0.6, ease: "sine.inOut" }, "<0.2")
      .from(q(".caption"), { y: 30, opacity: 0, duration: 0.5, ease: "power3.out" }, 0.4);
  });

  return (
    <Stage>
      <div ref={scope} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: theme.unit * 0.06 }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.ceil(count / 2)}, ${size}px)`, gap: size * 0.35 }}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="cell" style={{ width: size, height: size, borderRadius: 12, background: i % 3 === 0 ? theme.colors.accent : theme.colors.primary }} />
          ))}
        </div>
        {caption ? (
          <div className="caption" style={{ fontSize: type(theme).h2, fontWeight: 600 }}>
            {caption}
          </div>
        ) : null}
      </div>
    </Stage>
  );
};
