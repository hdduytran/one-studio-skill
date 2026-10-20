import { DotLottie } from "@lottiefiles/dotlottie-web";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveSrc } from "../lib/assets";
import { Stage } from "../components/Stage";
import { useTheme } from "../theme";

// Load the WASM renderer from public/ instead of a CDN (init_project.sh copies it there).
DotLottie.setWasmUrl(staticFile("wasm/dotlottie-player.wasm"));

/**
 * .lottie / .json animation rendered by the dotLottie (ThorVG/WASM) player,
 * paused and scrubbed to the Remotion frame. Supports themes & multi-animation .lottie files.
 */
export const DotLottieScene: React.FC<{ src: string; size?: number; loop?: boolean; speed?: number }> = ({
  src,
  size = 0.6,
  loop = false,
  speed = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<DotLottie | null>(null);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender(`Loading dotLottie ${src}`));
  const px = Math.round(theme.unit * size);

  useEffect(() => {
    if (!canvas.current) return;
    const dl = new DotLottie({ canvas: canvas.current, src: resolveSrc(src), autoplay: false, loop: false, useFrameInterpolation: true });
    dl.addEventListener("load", () => {
      player.current = dl;
      setReady(true);
      continueRender(handle);
    });
    dl.addEventListener("loadError", (e) => cancelRender(new Error(`dotLottie failed: ${String((e as { error?: unknown }).error)}`)));
    return () => dl.destroy();
  }, [src, handle]);

  useLayoutEffect(() => {
    const dl = player.current;
    if (!ready || !dl) return;
    const total = dl.totalFrames; // animation frames
    const animFps = total / dl.duration; // animation's own frame rate
    let f = (frame / fps) * animFps * speed;
    f = loop ? f % total : Math.min(f, total - 1);
    dl.setFrame(f);
  }, [frame, fps, ready, loop, speed]);

  return (
    <Stage>
      <canvas ref={canvas} width={px} height={px} style={{ width: px, height: px }} />
    </Stage>
  );
};
