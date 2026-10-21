import { Composition } from "remotion";
import { SCENES } from "./scenes.generated";
import { FORMAT } from "./brand.generated";

// One composition per 3D scene; id = storyboard scene id. Length comes from the render props
// (durationInFrames), so fitting a scene to its voice-over never needs a code change.
export const Root: React.FC = () => (
  <>
    {SCENES.map((s) => (
      <Composition
        key={s.id}
        id={s.id}
        component={s.component}
        width={FORMAT.width}
        height={FORMAT.height}
        fps={FORMAT.fps}
        durationInFrames={s.durationInFrames}
        defaultProps={{ durationInFrames: s.durationInFrames }}
        calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
      />
    ))}
  </>
);
