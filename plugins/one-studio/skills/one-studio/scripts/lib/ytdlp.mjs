// yt-dlp glue for style-fetch: locate the binary, validate the link, build the argument array,
// classify failures from stderr, and reduce yt-dlp's info.json to the few fields the project keeps.
import { spawnSync } from "node:child_process";

export const DEFAULT_MAX_SECONDS = 90;
export const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
export const INSTALL_HELP = "brew install yt-dlp   (or: pipx install yt-dlp)";

// "90", "1:30", "0:01:30.5" -> seconds. Throws on anything else.
export function parseTime(text) {
  const s = String(text).trim();
  if (!/^\d+(\.\d+)?(:\d{1,2}(\.\d+)?){0,2}$/.test(s)) throw new Error(`Invalid time "${text}" (use seconds, m:ss or h:mm:ss)`);
  return s.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
}

// Resolves --from / --to / --max into { from, to, max } (to = null: open-ended, capped by max when max > 0).
export function resolveRange({ from, to, max } = {}) {
  const start = from === undefined ? 0 : parseTime(from);
  const cap = max === undefined ? DEFAULT_MAX_SECONDS : Number(max);
  if (!Number.isFinite(cap) || cap < 0) throw new Error(`Invalid --max "${max}" (seconds, 0 = no limit)`);
  let end = to === undefined ? null : parseTime(to);
  if (end !== null && end <= start) throw new Error(`--to (${end}s) must be after --from (${start}s)`);
  if (end !== null && cap > 0 && end - start > cap) {
    throw new Error(`Span ${end - start}s is longer than --max ${cap}s. Shorten --from/--to or raise --max (0 = no limit).\nĐoạn ${end - start}s dài hơn --max ${cap}s: rút ngắn --from/--to hoặc tăng --max (0 = không giới hạn).`);
  }
  if (end === null && cap > 0) end = start + cap;
  return { from: start, to: end, max: cap };
}

export function assertHttpUrl(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`"${text}" is neither an existing file nor a link / không phải file có sẵn hay đường link`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Only http(s) links are accepted, got "${url.protocol}" / chỉ nhận link http(s)`);
  return url.href;
}

// The link without `user:pass@`; path and query stay (YouTube needs ?v=). Non-links come back unchanged.
export function stripUserinfo(text) {
  if (typeof text !== "string") return text;
  try {
    const url = new URL(text);
    url.username = "";
    url.password = "";
    return url.href;
  } catch {
    return text;
  }
}

export const looksLikeUrl = (text) => /^[a-z][a-z0-9+.-]*:\/\//i.test(text);

// Binary: ONE_STUDIO_YTDLP, else yt-dlp on PATH. Returns the command or null.
export function findYtdlp(env = process.env) {
  const bin = env.ONE_STUDIO_YTDLP || "yt-dlp";
  return spawnSync(bin, ["--version"], { encoding: "utf8", env }).status === 0 ? bin : null;
}

// Argument array (never a shell string). `to` null means "until the end".
export function buildArgs({ url, dir, from, to }) {
  return [
    "--ignore-config",
    "-f", "bv*[height<=720]+ba/b[height<=720]",
    "--download-sections", `*${from}-${to ?? "inf"}`,
    "--no-playlist",
    "--write-info-json",
    "--write-subs", "--write-auto-subs", "--sub-langs", "vi.*,en.*", "--sub-format", "vtt",
    "--no-cookies-from-browser",
    "--no-mtime",
    "-o", `${dir.replace(/%/g, "%%")}/source.%(ext)s`,
    "--", url,
  ];
}

const ERROR_KINDS = [
  ["login", /sign in|log ?in|private video|members[- ]only|age[- ]restrict|confirm your age|use --cookies|authentication|account is private|not available.*(login|account)/i,
    "Video cần đăng nhập, riêng tư hoặc giới hạn độ tuổi. Hãy tự tải video rồi chạy lại với đường dẫn file.\nThe video needs a login, is private or age-restricted. Download it yourself and run again with the file path."],
  ["format", /requested format is not available|no video formats found|no formats? (found|available)/i,
    "Không có định dạng video phù hợp (≤720p). Thử tải thủ công rồi dùng đường dẫn file.\nNo suitable video format (≤720p). Download it manually and pass the file."],
  ["network", /unable to download|urlopen error|timed out|connection (reset|refused|aborted)|temporary failure|name or service|network is unreachable|http error 5\d\d|getaddrinfo/i,
    "Lỗi mạng khi tải. Kiểm tra kết nối rồi thử lại.\nNetwork error while downloading. Check your connection and retry."],
  ["extractor", /unable to extract|extractorerror|unsupported url|report this issue|please report|http error 4\d\d|nsig|signature/i,
    "Bộ trích xuất của yt-dlp không đọc được trang này (thường do nền tảng đổi giao diện). Chạy `yt-dlp -U` để cập nhật rồi thử lại, hoặc tự tải video và dùng đường dẫn file.\nyt-dlp's extractor cannot read this page (platform changes often break it). Run `yt-dlp -U`, or download the video yourself and pass the file."],
];

// -> { kind: login|format|network|extractor|other, message }
export function classifyError(stderr) {
  const text = String(stderr ?? "");
  for (const [kind, re, message] of ERROR_KINDS) if (re.test(text)) return { kind, message };
  const tail = text.trim().split("\n").slice(-3).join("\n");
  return { kind: "other", message: `yt-dlp thất bại / yt-dlp failed:\n${tail}` };
}

export function platformOf(extractor, url) {
  const hay = `${extractor ?? ""} ${url ? new URL(url).hostname : ""}`.toLowerCase();
  for (const name of ["youtube", "tiktok", "facebook", "instagram"]) if (hay.includes(name)) return name;
  if (hay.includes("youtu.be") || hay.includes("fb.watch")) return hay.includes("fb.") ? "facebook" : "youtube";
  return "other";
}

// Keeps only what the project needs from yt-dlp's own info.json (the rest may hold personal data).
export function filterInfo(raw = {}) {
  const pick = (v, type) => (typeof v === type ? v : undefined);
  return {
    title: pick(raw.title, "string"),
    channel: pick(raw.uploader, "string"),
    url: stripUserinfo(pick(raw.webpage_url, "string")),
    duration: pick(raw.duration, "number"),
    extractor: pick(raw.extractor, "string"),
    width: pick(raw.width, "number"),
    height: pick(raw.height, "number"),
  };
}
