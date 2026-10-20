import { Composition } from "remotion";
import storyboardJson from "../storyboard.json";
import { Main } from "./Main";
import { buildTimeline } from "./lib/timeline";
import type { Storyboard } from "./lib/types";

const storyboard = storyboardJson as unknown as Storyboard;

export const RemotionRoot = () => {
  const tl = buildTimeline(storyboard);
  return (
    <>
      <Composition
        id="Main"
        component={Main}
        durationInFrames={tl.durationInFrames}
        fps={tl.fps}
        width={tl.width}
        height={tl.height}
        defaultProps={{ storyboard }}
        // Lets you render other aspects from the same storyboard:
        //   npx remotion render Main out/vertical.mp4 --props='{"aspect":"9:16"}'
        calculateMetadata={({ props }) => {
          const sb = props.aspect
            ? { ...props.storyboard, meta: { ...props.storyboard.meta, aspect: props.aspect, width: undefined, height: undefined } }
            : props.storyboard;
          const t = buildTimeline(sb);
          return { durationInFrames: t.durationInFrames, fps: t.fps, width: t.width, height: t.height, props: { ...props, storyboard: sb } };
        }}
      />
    </>
  );
};
