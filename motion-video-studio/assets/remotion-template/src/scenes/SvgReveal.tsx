import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender, useCurrentFrame } from "remotion";
import { enter } from "../lib/anim";
import { resolveSrc } from "../lib/assets";
import { Stage } from "../components/Stage";
import { type, useTheme } from "../theme";

/**
 * Logo / illustration reveal from an SVG file in public/ (run optimize_svgs.sh first).
 * Strokes draw on (stroke-dashoffset from each path's real length), then fills fade in.
 * No animation library needed — pure frame math.
 */
export const SvgReveal: React.FC<{ src: string; caption?: string; drawFrames?: number; size?: number }> = ({
  src,
  caption,
  drawFrames = 40,
  size = 0.45,
}) => {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const [markup, setMarkup] = useState<string | null>(null);
  const [handle] = useState(() => delayRender(`Loading ${src}`));
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(resolveSrc(src))
      .then((r) => r.text())
      .then((t) => {
        setMarkup(t);
        continueRender(handle);
      })
      .catch(cancelRender);
  }, [src, handle]);

  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const draw = enter(frame, 0, drawFrames);
    const fill = enter(frame, drawFrames * 0.7, 15);
    root.querySelectorAll<SVGGeometryElement>("path, circle, rect, ellipse, line, polyline, polygon").forEach((el, i, all) => {
      const len = el.getTotalLength?.() ?? 0;
      const local = Math.min(1, Math.max(0, draw * (1 + all.length * 0.08) - i * 0.08));
      if (!el.getAttribute("data-stroke")) {
        el.setAttribute("data-stroke", "1");
        if (!el.getAttribute("stroke") || el.getAttribute("stroke") === "none") el.setAttribute("stroke", theme.colors.text);
        el.style.strokeWidth = el.style.strokeWidth || "2";
      }
      el.style.strokeDasharray = `${len}`;
      el.style.strokeDashoffset = `${len * (1 - local)}`;
      el.style.fillOpacity = `${fill}`;
    });
  }, [frame, markup, drawFrames, theme.colors.text]);

  return (
    <Stage>
      <div
        ref={box}
        style={{ width: theme.unit * size, height: theme.unit * size }}
        className="svg-reveal"
        dangerouslySetInnerHTML={markup ? { __html: markup.replace(/<svg /, '<svg width="100%" height="100%" ') } : undefined}
      />
      {caption ? <div style={{ fontSize: type(theme).h2, fontWeight: 600, marginTop: theme.unit * 0.03, opacity: enter(frame, drawFrames, 15) }}>{caption}</div> : null}
    </Stage>
  );
};
