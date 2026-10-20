import { Lottie, type LottieAnimationData } from "@remotion/lottie";
import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";
import { resolveSrc } from "../lib/assets";
import { Stage } from "../components/Stage";
import { useTheme } from "../theme";

/**
 * Lottie JSON (After Effects / LottieFiles export) synced to the Remotion frame.
 * Put the file in public/lottie/. For .lottie (zipped) files use DotLottieScene.
 */
export const LottieScene: React.FC<{ src: string; size?: number; loop?: boolean; playbackRate?: number }> = ({
  src,
  size = 0.6,
  loop = false,
  playbackRate = 1,
}) => {
  const theme = useTheme();
  const [handle] = useState(() => delayRender(`Loading Lottie ${src}`));
  const [data, setData] = useState<LottieAnimationData | null>(null);

  useEffect(() => {
    fetch(resolveSrc(src))
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        continueRender(handle);
      })
      .catch(cancelRender);
  }, [src, handle]);

  if (!data) return null;
  return (
    <Stage>
      <Lottie animationData={data} loop={loop} playbackRate={playbackRate} style={{ width: theme.unit * size, height: theme.unit * size }} />
    </Stage>
  );
};
