import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { Fragment } from "react";
import { buildTimeline } from "./lib/timeline";
import { presentationFor } from "./lib/transitions";
import { resolveSrc } from "./lib/assets";
import type { Aspect, Storyboard } from "./lib/types";
import { ThemeProvider, makeTheme } from "./theme";
import { SCENES } from "./scenes";
import { Background } from "./components/Background";
import { Captions } from "./components/Captions";
import { Music } from "./components/Music";

export type MainProps = { storyboard: Storyboard; aspect?: Aspect };

export const Main: React.FC<MainProps> = ({ storyboard }) => {
  const { width, height } = useVideoConfig();
  const tl = buildTimeline(storyboard);
  const theme = makeTheme(storyboard.theme?.colors, storyboard.theme?.fontFamily, width, height);

  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill style={{ backgroundColor: theme.colors.bg, fontFamily: theme.fontFamily, color: theme.colors.text }}>
        <Background />
        <TransitionSeries>
          {tl.scenes.map((scene) => {
            const Scene = SCENES[scene.component];
            if (!Scene) throw new Error(`Unknown component "${scene.component}" in scene "${scene.id}". Register it in src/scenes/index.ts`);
            return (
              <Fragment key={scene.id}>
                {scene.transitionFrames > 0 && scene.transition ? (
                  <TransitionSeries.Transition
                    presentation={presentationFor(scene.transition, width, height)}
                    timing={linearTiming({ durationInFrames: scene.transitionFrames })}
                  />
                ) : null}
                <TransitionSeries.Sequence durationInFrames={scene.durationInFrames} name={scene.id}>
                  <Scene {...(scene.props ?? {})} />
                </TransitionSeries.Sequence>
              </Fragment>
            );
          })}
        </TransitionSeries>

        {/* Audio lives on absolute-time Sequences so transitions never shift it. */}
        {tl.scenes.map((scene) => (
          <Fragment key={`audio-${scene.id}`}>
            {scene.vo?.src && scene.voStartFrame !== null ? (
              <Sequence from={scene.voStartFrame} name={`vo:${scene.id}`} layout="none">
                <Audio src={resolveSrc(scene.vo.src)} />
              </Sequence>
            ) : null}
            {(scene.sfx ?? []).map((cue, i) => (
              <Sequence key={i} from={scene.startFrame + Math.round(cue.at * tl.fps)} name={`sfx:${scene.id}:${i}`} layout="none">
                <Audio src={resolveSrc(cue.src)} volume={cue.volume ?? 0.6} />
              </Sequence>
            ))}
          </Fragment>
        ))}
        {storyboard.audio?.music ? <Music music={storyboard.audio.music} timeline={tl} /> : null}
        {storyboard.meta.captions ? <Captions timeline={tl} /> : null}
      </AbsoluteFill>
    </ThemeProvider>
  );
};
