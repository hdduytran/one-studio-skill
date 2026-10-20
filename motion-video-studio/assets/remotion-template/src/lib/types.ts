export type Aspect = "16:9" | "9:16" | "1:1" | "4:5";

export type TransitionType =
  | "none"
  | "fade"
  | "slide"
  | "wipe"
  | "flip"
  | "clockWipe";

export type Direction = "from-left" | "from-right" | "from-top" | "from-bottom";

export type SfxCue = { src: string; at: number; volume?: number };

export type SceneSpec = {
  id: string;
  beat?: string;
  component: string;
  /** Seconds. Final length = max(duration, voDuration + voPadding). */
  duration?: number;
  /** Transition INTO this scene from the previous one. */
  transition?: { type: TransitionType; duration?: number; direction?: Direction };
  props?: Record<string, unknown>;
  vo?: { text?: string; src?: string; duration?: number; delay?: number };
  sfx?: SfxCue[];
  notes?: string;
};

export type Storyboard = {
  meta: {
    title?: string;
    fps?: number;
    aspect?: Aspect;
    width?: number;
    height?: number;
    language?: string;
    voPadding?: number;
    captions?: boolean;
  };
  theme?: { colors?: Record<string, string>; fontFamily?: string };
  audio?: {
    music?: { src: string; volume?: number; duckTo?: number; fadeOut?: number } | null;
  };
  scenes: SceneSpec[];
};
