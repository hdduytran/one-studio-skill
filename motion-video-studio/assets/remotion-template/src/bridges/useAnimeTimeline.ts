import { createTimeline, type Timeline } from "animejs";
import { useLayoutEffect, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Frame-driven Anime.js v4. The timeline is created with autoplay:false and
 * seeked to the current frame (anime.js uses MILLISECONDS).
 *
 *   const scope = useAnimeTimeline<SVGSVGElement>((tl, root) => {
 *     tl.add(svg.createDrawable(root.querySelectorAll("path")), { draw: ["0 0", "0 1"], duration: 1200, delay: stagger(80) });
 *   });
 */
export function useAnimeTimeline<T extends Element = HTMLDivElement>(build: (tl: Timeline, root: T) => void) {
  const scope = useRef<T>(null);
  const tlRef = useRef<Timeline | null>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  useLayoutEffect(() => {
    if (!scope.current) return;
    const tl = createTimeline({ autoplay: false });
    build(tl, scope.current);
    tlRef.current = tl;
    return () => {
      tl.revert();
      tlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    tlRef.current?.seek((frame / fps) * 1000);
  }, [frame, fps]);

  return scope;
}
