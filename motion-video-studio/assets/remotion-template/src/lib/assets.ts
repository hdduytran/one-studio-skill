import { staticFile } from "remotion";

/** Accepts either a URL or a path relative to public/. */
export const resolveSrc = (src: string) => (/^(https?:|data:)/.test(src) ? src : staticFile(src));
