import type { TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import type { SceneSpec } from "./types";

export const presentationFor = (
  t: NonNullable<SceneSpec["transition"]>,
  width: number,
  height: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): TransitionPresentation<any> => {
  const direction = t.direction ?? "from-right";
  switch (t.type) {
    case "slide":
      return slide({ direction });
    case "wipe":
      return wipe({ direction });
    case "flip":
      return flip({ direction });
    case "clockWipe":
      return clockWipe({ width, height });
    case "fade":
    default:
      return fade();
  }
};
