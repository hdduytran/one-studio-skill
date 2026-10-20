# Motion Canvas — when and how

Motion Canvas is a separate engine: animations are TypeScript **generator functions** with a dedicated editor (timeline, audio waveform, time events). It shines for **technical explainers** — code walkthroughs, math, diagrams that morph step by step — narrated over a VO track.

## Choose Motion Canvas instead of Remotion when
- The video is mostly diagrams/code/math built step-by-step to narration, and
- the user (or you) prefers imperative "do this, then that" sequencing, and
- you don't need React components, Lottie/Rive, 3D or server-side batch rendering.

Otherwise stay in Remotion. **Don't mix both in one project.** If needed, render the Motion Canvas part to a video and place it in Remotion with `<Video>` from `@remotion/media`.

## Quick start
```bash
npm init @motion-canvas@latest   # pick a name, TypeScript
cd <name> && npm install && npm start   # editor on http://localhost:9000
```
Scene example (`src/scenes/example.tsx`):
```tsx
import { makeScene2D, Circle, Txt, Code } from "@motion-canvas/2d";
import { all, createRef, waitFor, waitUntil, easeOutCubic } from "@motion-canvas/core";

export default makeScene2D(function* (view) {
  const circle = createRef<Circle>();
  const label = createRef<Txt>();
  view.add(<>
    <Circle ref={circle} size={0} fill="#6C8CFF" />
    <Txt ref={label} y={220} fill="#F5F7FF" fontSize={64} opacity={0}>Hello</Txt>
  </>);
  yield* circle().size(320, 0.6, easeOutCubic);      // value, seconds, easing
  yield* waitUntil("label");                           // time event, draggable in the editor to sync with VO
  yield* all(label().opacity(1, 0.4), circle().fill("#FFB547", 0.4));
  yield* waitFor(1);
});
```
- `yield*` = wait for the animation; `all()`/`chain()`/`sequence()` compose.
- `Code` node animates code diffs (`code().code.append(...)`, `selection`) — great for programming videos.
- Add the VO in `project.ts` (`audio: voUrl`) and drag `waitUntil` events onto the waveform.
- Fonts: load with CSS `@font-face` in the project, bundled locally.

## Rendering
Rendering happens from the editor (Video Settings → Rendering → "Render"). Image-sequence output is built in; for MP4 install the FFmpeg exporter:
```bash
npm i @motion-canvas/ffmpeg   # then add ffmpeg() to plugins in vite.config.ts
```
There is no official headless CLI render. For unattended renders you can drive the editor with Playwright or use Revideo (a fork with a headless render API). After rendering, use `scripts/post_export.sh` and `scripts/qa_video.sh` from this skill as usual.

## Mapping this skill's workflow
Brief → script → storyboard (use the same JSON as a planning doc; each scene → one `makeScene2D` file) → style frames (editor screenshots) → animation → VO time events → render → post_export → QA.
