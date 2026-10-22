// Scene templates for the parts a style may lack (lower third, intro, outro, thumbnail). They use brand
// variables only, so they take the colours and fonts of whichever brand.css they are rendered with.
// Written to style-refs/<slug>/parts/<name>.html as full scene files: copy one into scenes/ and add it to the
// storyboard (id = file name).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATE_DIR } from "./project.mjs";
import { fillScene } from "./style-samples.mjs";

export const PART_KINDS = ["lower-third", "intro", "outro", "thumbnail"];
const SECONDS = { "lower-third": 3.5, intro: 3, outro: 3, thumbnail: 1 };

const LOWER_THIRD = `  <div class="os-lower-third clip" data-start="0" data-duration="{{duration}}" data-track-index="0">Tên người nói · Chức danh</div>
</div>
<script>
  const S = OS.scene("{{id}}");
  S.enter(".os-lower-third", { at: 0.3, kind: "up" });
  S.done();
</script>
</body>
</html>
`;

const TEXT = { intro: ["Tiêu đề video", "Một câu nói rõ chủ đề"], outro: ["Cảm ơn đã xem", "Đăng ký để xem tập tiếp theo"], thumbnail: ["Tiêu đề thật ngắn", "Phụ đề một dòng"] };

// -> { html, duration } for one part kind, laid out for width x height.
export function partHtml(kind, { width, height, lang, brand }) {
  const duration = SECONDS[kind];
  const fragment = kind === "lower-third" ? LOWER_THIRD : readFileSync(join(TEMPLATE_DIR, "scenes", kind === "thumbnail" ? "thumbnail.html" : "text.html"), "utf8");
  const [headline, subline] = TEXT[kind] ?? [];
  const html = fillScene(fragment, { id: kind, width, height, lang, brand, duration, vars: { headline, subline, background: "", logo: "" } });
  return { html, duration };
}
