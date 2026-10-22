// Where the video will be posted (studio.json → format.platforms), and what that implies:
// vertical platforms need a 9:16 export, keep burned captions out of their on-screen UI, and cap the length.

// TikTok / Shorts / Reels chrome (name, buttons, description) as fractions of a 9:16 frame.
export const UI_ZONE = { bottom: 0.2, right: 0.12 };

export const PLATFORMS = {
  youtube: { label: "YouTube", aspect: "16:9" },
  shorts: { label: "YouTube Shorts", aspect: "9:16", vertical: true, maxSeconds: 180 },
  tiktok: { label: "TikTok", aspect: "9:16", vertical: true, maxSeconds: 600 },
  reels: { label: "Instagram / Facebook Reels", aspect: "9:16", vertical: true, maxSeconds: 180 },
  facebook: { label: "Facebook feed", aspect: "16:9" },
  linkedin: { label: "LinkedIn", aspect: "16:9" },
};

// "shorts, TikTok" -> ["shorts", "tiktok"]; throws on an unknown name.
export function parsePlatforms(text) {
  const list = String(text ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const p of list) if (!PLATFORMS[p]) throw new Error(`--platform: unknown "${p}"; use ${Object.keys(PLATFORMS).join(", ")}`);
  return [...new Set(list)];
}

export const verticalPlatforms = (studio) => (studio?.format?.platforms ?? []).filter((p) => PLATFORMS[p]?.vertical);

// Burned captions on a portrait output of a project meant for Shorts / TikTok / Reels stay out of the UI zone.
export const captionSafe = (project, width, height) => height > width * 1.2 && verticalPlatforms(project?.studio).length > 0;

// Ratios a project needs for its platforms that are neither its own nor already exported.
export function missingRatios(format) {
  const have = new Set([format.aspect, ...(format.exports ?? [])]);
  return [...new Set((format.platforms ?? []).map((p) => PLATFORMS[p]?.aspect).filter((a) => a && !have.has(a)))];
}

// Length limits the planned video breaks.
export function platformWarnings(studio) {
  const len = studio?.format?.target_duration;
  return (studio?.format?.platforms ?? [])
    .filter((p) => PLATFORMS[p]?.maxSeconds && len > PLATFORMS[p].maxSeconds)
    .map((p) => `${PLATFORMS[p].label} accepts at most ${PLATFORMS[p].maxSeconds}s; the target is ${len}s`);
}
