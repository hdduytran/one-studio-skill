import type { ComponentType } from "react";
import { TitleCard } from "./TitleCard";
import { BulletList } from "./BulletList";
import { StatCounter } from "./StatCounter";
import { ImageFocus } from "./ImageFocus";
import { EndCard } from "./EndCard";
import { GsapShapes } from "./GsapShapes";
import { AnimeLineDraw } from "./AnimeLineDraw";
import { SvgReveal } from "./SvgReveal";

/**
 * storyboard.json `component` → React component.
 * Add custom scenes here (one file per scene in src/scenes/).
 * init_project.sh appends optional scenes (3D, Lottie, Rive) below the marker.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SCENES: Record<string, ComponentType<any>> = {
  TitleCard,
  BulletList,
  StatCounter,
  ImageFocus,
  EndCard,
  GsapShapes,
  AnimeLineDraw,
  SvgReveal,
  // @optional-scenes
};
