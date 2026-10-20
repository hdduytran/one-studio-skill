import { stagger, svg } from "animejs";
import { useAnimeTimeline } from "../bridges/useAnimeTimeline";
import { Stage } from "../components/Stage";
import { type, useTheme } from "../theme";

/** Example of an Anime.js-driven scene: SVG strokes draw themselves, then fill fades in. */
export const AnimeLineDraw: React.FC<{ caption?: string }> = ({ caption }) => {
  const theme = useTheme();
  const scope = useAnimeTimeline<HTMLDivElement>((tl, root) => {
    tl.add(svg.createDrawable(root.querySelectorAll(".stroke")), { draw: ["0 0", "0 1"], duration: 1400, ease: "inOutQuad", delay: stagger(150) })
      .add(root.querySelectorAll(".stroke"), { fillOpacity: [0, 1], duration: 500 }, "-=300")
      .add(root.querySelectorAll(".caption"), { opacity: [0, 1], translateY: [30, 0], duration: 500, ease: "outCubic" }, 300);
  });
  const s = theme.unit * 0.5;

  return (
    <Stage>
      <div ref={scope} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: theme.unit * 0.04 }}>
        <svg width={s * 1.6} height={s} viewBox="0 0 320 200" fill="none" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
          <path className="stroke" stroke={theme.colors.primary} fill={theme.colors.primary + "33"} d="M20 170 L80 60 L140 170 Z" />
          <path className="stroke" stroke={theme.colors.accent} fill={theme.colors.accent + "33"} d="M160 110 a50 50 0 1 0 100 0 a50 50 0 1 0 -100 0" />
          <path className="stroke" stroke={theme.colors.text} d="M40 190 C 120 140, 200 240, 300 180" />
        </svg>
        {caption ? (
          <div className="caption" style={{ fontSize: type(theme).h2, fontWeight: 600, opacity: 0 }}>
            {caption}
          </div>
        ) : null}
      </div>
    </Stage>
  );
};
