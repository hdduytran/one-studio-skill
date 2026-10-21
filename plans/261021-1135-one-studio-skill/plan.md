---
status: in-progress
created: 2026-10-21
---

# One Studio Skill — Plan

Skill "điều phối" làm video motion trọn gói: brief → kịch bản → storyboard → keyframe review → dựng → voice/nhạc → render → xuất bản. Bản thân skill nhẹ; chỉ nạp skill/tool con khi video thật sự cần.

## 1. Brainstorm contract

- **Outcome:** Gõ `/one-studio` → được dẫn từng bước tới file MP4 hoàn chỉnh; thêm/sửa scene chỉ render lại scene đó; series dùng chung brand kit.
- **Constraints:** Tiết kiệm token Claude (lazy-load reference); service ngoài (TTS cloud, AI image, stock) phải hỏi trước; TTS gọi qua API OpenAI-compatible (`/v1/audio/speech`), tiếng Việt → ZeroTTS (local), ngôn ngữ khác → OmniVoice (local hoặc remote); cá nhân dùng; đóng gói Claude plugin; chạy local (Node + FFmpeg + Chrome headless).
- **Non-goals:** Không viết lại engine render; không làm editor GUI; không tự huấn luyện model voice/nhân vật; không gọi API trả phí mà không hỏi.
- **Acceptance:** (a) 1 video 2D 30–60s tạo từ brief qua đủ các gate; (b) thêm 1 scene → chỉ scene mới render, phần cũ dùng cache, hash không đổi; (c) video thứ 2 của series dùng lại brand kit không hỏi lại; (d) có báo ước tính credit trước mỗi bước tốn kém; (e) user duyệt frame mẫu trước render full.

## 2. Thành phần của một video motion (anatomy)

| Lớp | Nội dung | Artifact trong project |
|---|---|---|
| Message | mục tiêu, khán giả, CTA, độ dài, tỉ lệ (16:9/9:16/1:1) | `brief.md` |
| Script | lời thoại/VO theo beat, thời lượng ước tính | `script.md` |
| Storyboard | scene → shot → beat; layout, chuyển cảnh | `storyboard.json` |
| Brand / design system | màu, font, logo, grid, motion tokens (easing, duration, stagger) | `brand/brand.json` |
| Assets | SVG (tối ưu SVGO), ảnh/OG (Satori), Lottie, Rive, 3D model | `assets/` |
| Motion | intro/outro, kinetic type, transitions, data/diagram reveal, character | `scenes/*` |
| Audio | VO, nhạc nền, SFX, ducking, loudness -14 LUFS | `audio/` |
| Captions | phụ đề từ timestamp TTS | `captions.srt` |
| Render/Delivery | encode, nhiều tỉ lệ, thumbnail | `out/` |

## 3. Quy trình (gates)

```
0 Setup ─ đọc/tạo brand kit, hỏi: 2D hay 3D? engine? ngôn ngữ VO? service ngoài?
1 Brief ─ hỏi tối thiểu (mục tiêu, độ dài, tỉ lệ, phong cách)
2 Script ─ viết → USER DUYỆT
3 Storyboard ─ scene list + thời lượng + loại scene (text/diagram/character/3D) → USER DUYỆT
4 Credit estimate ─ báo số scene, skill sẽ nạp, service ngoài, thời gian render ước tính
5 Keyframe review ─ render still 1–3 frame/scene (Remotion `still` / HyperFrames snapshot) → USER DUYỆT
6 Build scenes ─ mỗi scene 1 file độc lập, chỉ nạp skill theo loại scene
7 Audio ─ TTS theo scene, nhạc, SFX; đo thời lượng VO → khớp duration scene
8 Preview ─ render low-res / studio preview → USER DUYỆT
9 Render final ─ per-scene render + FFmpeg concat; captions; loudnorm
10 Publish ─ xuất bản các tỉ lệ, thumbnail (Satori), ghi manifest
```

## 4. Map tool → vai trò

| Nhóm | Tool | Dùng khi | Nạp skill/reference |
|---|---|---|---|
| Engine | **HyperFrames** (mặc định 2D) | HTML/CSS + GSAP, video ngắn, social, nhanh, AI dễ viết | `hyperframes*` đã cài |
| Engine | **Remotion** | data-driven, React component, 3D (R3F), template hoá series, render song song | `ak:remotion`, remotion-dev/skills |
| Engine | Motion Canvas | video giải thích code/diagram kiểu vector, timeline bằng generator | chỉ khi user chọn |
| Animation | GSAP (+gsap-skills) | timeline, SplitText, MorphSVG, DrawSVG — mặc định trong HyperFrames | gsap-skills |
| Animation | Motion (+ai-kit) | spring/layout trong React/Remotion | motion ai-kit |
| Animation | Anime.js | thay thế nhẹ cho SVG/stagger khi không dùng GSAP | ref ngắn |
| Animation | dotLottie | icon/illustration có sẵn từ LottieFiles | khi storyboard có lottie |
| Animation | Rive | nhân vật/asset có state machine (trộn với lemo-opuscar) | khi có character |
| Design | SVGO | tối ưu mọi SVG trước khi đưa vào scene | luôn (CLI, rẻ) |
| Design | Satori | render text/layout → SVG/PNG: thumbnail, title card, OG | bước publish |
| 3D | Three.js / R3F / Drei / Rapier / Postprocessing | scene 3D (chỉ khi user chọn 3D) | `ak:threejs`; trong Remotion qua `@remotion/three` |
| Audio | Howler.js | preview âm thanh trong browser/studio (không dùng cho render) | hiếm |
| Audio | OmniVoice / ZeroTTS | VO đa ngôn ngữ / tiếng Việt | hỏi trước khi chạy |
| Output | Mediabunny | đọc metadata, trim/encode trong JS, kiểm tra duration | bước audio/QA |
| Output | FFmpeg | concat scene, mix audio, loudnorm, burn captions, đổi tỉ lệ | luôn |
| Mở rộng | anatomy (MIT) | minh hoạ isometric SVG/WebGL của máy móc/hệ thống; dùng cho scene giải thích kỹ thuật ("explainer object") — xuất SVG tĩnh/tách lớp rồi animate bằng GSAP | scene `explainer` |
| Mở rộng | lemo-opuscar (MIT, CC BY 4.0) | 51 style phim + DIRECTOR.md/TECHNIQUE.md; nhân vật vẽ bằng code, canvas/WebGL render từng frame | scene `character`, chọn style |
| Mở rộng | `archify` / `ak:diagram` | video architecture/diagram: sinh SVG rồi animate reveal | khi scene loại diagram |

## 5. HyperFrames vs Remotion

| Tiêu chí | HyperFrames | Remotion |
|---|---|---|
| Authoring | HTML/CSS/GSAP — LLM viết rất tốt, ít token | React/TSX — cấu trúc chặt, nhiều boilerplate |
| Setup | nhẹ, CLI | Node project + bundler, nặng hơn |
| 3D | hạn chế (three thuần trong HTML) | mạnh: R3F/Drei/Postprocessing qua `@remotion/three` |
| Data-driven / series template | được, qua biến | rất mạnh: props + schema (zod), `calculateMetadata` |
| Preview | studio của HyperFrames | Remotion Studio, `still` để review frame |
| Render scale | local | local + Lambda/Cloud Run (tốn phí) |
| License | cần kiểm tra | Remotion: miễn phí cá nhân/công ty nhỏ, công ty lớn phải mua license |

**Quyết định:** HyperFrames mặc định cho 2D (rẻ token, nhanh); Remotion chỉ khi cần 3D R3F (dùng cá nhân → miễn phí license; nếu sau này cần license thì quay về HyperFrames + three.js thuần). Router hỏi ở bước 0, có default. Đã có skill `remotion-to-hyperframes` để chuyển đổi nếu cần.

## 6. Tiết kiệm credit & update scene

- **Lazy skill injection:** `SKILL.md` chính < 150 dòng chỉ chứa flow + router. Mỗi loại scene có reference riêng (`references/scene-text.md`, `scene-diagram.md`, `scene-3d.md`, `scene-character.md`...). Chỉ đọc reference của loại scene có trong storyboard.
- **Scene isolation:** mỗi scene = 1 file + 1 clip render riêng `out/scenes/<id>-<hash>.mp4`. Hash = nội dung scene + brand version + asset hash.
- **Manifest** `studio.json`: danh sách scene, hash, duration, trạng thái duyệt. Thêm/sửa scene → so hash → chỉ render scene thay đổi → FFmpeg concat lại (copy stream, không encode lại toàn bộ).
- **Chống mismatch:** scene mới bắt buộc dùng brand tokens + transition chuẩn của project; QA check font/màu/fps/resolution giống scene cũ trước concat.
- **Credit estimate:** trước bước 5/6/7/9 in bảng: số scene cần build, skill sẽ nạp, gọi service ngoài, thời gian render. Ngưỡng cảnh báo cấu hình được (vd > 8 scene hoặc có 3D).

## 7. Brand kit cho series

`brand/brand.json`: colors, typography, logo (SVG đã SVGO), spacing grid, motion tokens (ease, durations, stagger), intro/outro template, lower-third, caption style, voice preset. Lưu ở cấp series (`series/<name>/brand`), các tập trỏ tới. Đổi brand → bump version → mọi scene hash đổi → user được báo số scene sẽ render lại.

## 8. Cấu trúc plugin

```
one-studio/
  .claude-plugin/plugin.json      # + marketplace.json để `claude plugin install`
  skills/one-studio/
    SKILL.md                      # flow + gates + router (ngắn)
    references/
      workflow-gates.md  engine-selection.md  brand-kit.md  credit-estimation.md
      scene-types/{text,diagram,data,explainer-anatomy,character-lemo,3d,lottie-rive}.md
      audio-tts.md                # OpenAI-compatible client, ZeroTTS/OmniVoice config
      render-ffmpeg.md
    scripts/
      init-project.mjs  scene-hash.mjs  render-changed-scenes.mjs
      keyframe-stills.mjs  tts-openai-compatible.mjs  concat-and-mix.sh  optimize-svg.sh
    templates/hyperframes-project/  remotion-project/  brand.json
```

Phụ thuộc ngoài (anatomy, lemo-opuscar, hyperframes, remotion skills) không copy vào plugin: ghi trong reference cách cài, skill kiểm tra có sẵn chưa và chỉ đọc file cần thiết (vd `STYLE.md` của 1 style, không đọc cả 51).

## TTS config

`studio.json → audio.tts`: `{ vi: {base_url, model:"zerotts", voice}, default: {base_url, model:"omnivoice", voice} }`. API key lấy từ env, không lưu file. Phụ đề: TTS sinh theo từng câu → mỗi câu 1 file audio; đo duration bằng ffprobe/Mediabunny, cộng dồn ra timing từng câu → xuất `captions.srt` và khớp duration scene. Không cần Whisper.

## Credit (token Claude)

Ước tính = số scene × loại scene (text ~ thấp, diagram/explainer ~ vừa, character/3D ~ cao) + số reference sẽ nạp. In bảng trước bước 5, 6, 9. Sửa 1 scene chỉ nạp lại reference của loại scene đó.

## 9. Phases

| # | Phase | Phụ thuộc | File |
|---|---|---|---|
| 1 | Research & contracts | – | [phase-01](phase-01-research-and-contracts.md) |
| 2 | Plugin skeleton & gates | 1 | [phase-02](phase-02-plugin-skeleton-and-gates.md) |
| 3 | Brand kit & 2D scenes | 2 | [phase-03](phase-03-brand-kit-and-2d-scenes.md) |
| 4 | Keyframe review & incremental render | 3 | [phase-04](phase-04-keyframe-review-and-incremental-render.md) |
| 5 | Audio, TTS & captions | 4 | [phase-05](phase-05-audio-tts-and-captions.md) |
| 6 | Explainer, character, 3D | 4 | [phase-06](phase-06-explainer-character-3d.md) |
| 7 | Series, publish & packaging | 5, 6 | [phase-07](phase-07-series-publish-packaging.md) |
| 8 | E2E validation | 7 | [phase-08](phase-08-e2e-validation.md) |

Phase 5 và 6 có thể làm song song (khác file).

## Trade-offs

- **HyperFrames-first:** dựa vào giả định LLM viết HTML/GSAP ổn định; hỏng đầu tiên khi cần 3D/physics phức tạp → chuyển Remotion.
- **Remotion-only:** đồng nhất 1 engine; hỏng đầu tiên ở chi phí token/setup cho video ngắn và license cho công ty lớn.
- **Dual-engine (khuyến nghị):** linh hoạt; rủi ro là 2 template phải giữ brand nhất quán → brand tokens chung dạng JSON, mỗi engine đọc cùng file.

Better approaches: không bắt buộc dùng hết 20 tool — Anime.js, Howler.js, Motion Canvas trùng vai trò với GSAP/FFmpeg/HyperFrames; đề xuất để ở dạng "optional", không viết reference sâu trừ khi có nhu cầu.

## Câu hỏi chưa giải quyết

Không còn. Plan sẵn sàng triển khai.
