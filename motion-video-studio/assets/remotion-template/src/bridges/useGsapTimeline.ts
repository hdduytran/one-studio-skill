import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Frame-driven GSAP. Build a paused timeline once, then seek it to the current
 * frame on every render — GSAP never runs on its own clock, so Remotion can render
 * frames in any order, in parallel, and get identical pixels.
 *
 *   const scope = useGsapTimeline<HTMLDivElement>((tl, q) => {
 *     tl.from(q(".box"), { y: 80, opacity: 0, stagger: 0.08, ease: "back.out(1.7)" })
 *       .to(q(".box"), { rotate: 90, duration: 0.6 }, "+=0.3");
 *   });
 *   return <div ref={scope}>...</div>;
 *
 * Times inside the timeline are in SECONDS of scene time (frame / fps).
 */
export function useGsapTimeline<T extends Element = HTMLDivElement>(
  build: (tl: gsap.core.Timeline, q: (selector: string) => Element[]) => void,
) {
  const scope = useRef<T>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true });
      build(tl, gsap.utils.selector(scope));
      tlRef.current = tl;
    }, scope);
    return () => {
      ctx.revert();
      tlRef.current = null;
    };
    // Built once per mount on purpose: the timeline is static, only the playhead moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    tlRef.current?.seek(frame / fps, false);
  }, [frame, fps]);

  return scope;
}
