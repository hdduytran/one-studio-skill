import { createContext, useContext } from "react";
import { Easing } from "remotion";
import { FONT_FAMILY } from "./fonts";

const fontFamily = FONT_FAMILY;

export const defaultColors = {
  bg: "#0B1020",
  surface: "#161D3A",
  primary: "#6C8CFF",
  accent: "#FFB547",
  text: "#F5F7FF",
  muted: "#9AA3C7",
};

export type Theme = {
  colors: typeof defaultColors & Record<string, string>;
  fontFamily: string;
  /** Short side of the frame in px — scale type and spacing from it so every aspect works. */
  unit: number;
};

export const makeTheme = (
  colors: Record<string, string> | undefined,
  family: string | undefined,
  width: number,
  height: number,
): Theme => ({
  colors: { ...defaultColors, ...(colors ?? {}) },
  fontFamily: family ?? fontFamily,
  unit: Math.min(width, height),
});

const ThemeContext = createContext<Theme>(makeTheme(undefined, undefined, 1920, 1080));
export const ThemeProvider = ThemeContext.Provider;
export const useTheme = () => useContext(ThemeContext);

/** House easing curves — use these instead of ad-hoc beziers so motion feels consistent. */
export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1), // entrances
  in: Easing.bezier(0.7, 0, 0.84, 0), // exits
  inOut: Easing.bezier(0.65, 0, 0.35, 1), // moves on screen
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1), // playful pops
};

/** Type scale relative to the short side (1080 → 1). */
export const type = (t: Theme) => ({
  display: t.unit * 0.1,
  h1: t.unit * 0.075,
  h2: t.unit * 0.05,
  body: t.unit * 0.035,
  caption: t.unit * 0.026,
});

/** Title-safe margin (~5% of each side). */
export const safe = (width: number, height: number) => ({
  x: Math.round(width * 0.06),
  y: Math.round(height * 0.06),
});
