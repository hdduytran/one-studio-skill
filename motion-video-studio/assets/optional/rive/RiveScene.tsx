import { Layout, Fit, Rive, RuntimeLoader } from "@rive-app/canvas";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveSrc } from "../lib/assets";
import { Stage } from "../components/Stage";
import { useTheme } from "../theme";

// Load the Rive WASM runtime from public/ instead of unpkg (init_project.sh copies it).
RuntimeLoader.setWasmUrl(staticFile("wasm/rive.wasm"));

/**
 * Rive (.riv) timeline animation scrubbed to the Remotion frame.
 * Use a named *linear animation* (not a state machine): state machines react to
 * inputs over real time and are not frame-deterministic. If the designer only
 * built a state machine, ask them to export the sequence as a timeline animation.
 */
export const RiveScene: React.FC<{ src: string; animation: string; artboard?: string; size?: number }> = ({
  src,
  animation,
  artboard,
  size = 0.6,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const canvas = useRef<HTMLCanvasElement>(null);
  const rive = useRef<Rive | null>(null);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender(`Loading Rive ${src}`));
  const px = Math.round(theme.unit * size);

  useEffect(() => {
    if (!canvas.current) return;
    const r = new Rive({
      src: resolveSrc(src),
      canvas: canvas.current,
      artboard,
      animations: animation,
      autoplay: false,
      layout: new Layout({ fit: Fit.Contain }),
      onLoad: () => {
        rive.current = r;
        setReady(true);
        continueRender(handle);
      },
      onLoadError: () => cancelRender(new Error(`Rive failed to load ${src}`)),
    });
    return () => r.cleanup();
  }, [src, animation, artboard, handle]);

  useLayoutEffect(() => {
    const r = rive.current;
    if (!ready || !r) return;
    // scrub() sets the animation to an absolute time in seconds and draws it.
    r.scrub(animation, frame / fps);
  }, [frame, fps, ready, animation]);

  return (
    <Stage>
      <canvas ref={canvas} width={px} height={px} style={{ width: px, height: px }} />
    </Stage>
  );
};
