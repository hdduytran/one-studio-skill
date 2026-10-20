# one-studio-skill

## `motion-video-studio` — làm video motion trọn gói, từ kịch bản đến file MP4

Một Agent Skill (Claude Code / các agent hỗ trợ chuẩn Agent Skills) đóng vai "đạo diễn + dựng phim":

```
brief → kịch bản ◆ → storyboard ◆ → style frames ◆ → asset → animatic ◆ → animation → âm thanh → render → hậu kỳ → QA
```
(◆ = điểm dừng để người dùng duyệt)

**Xương sống render:** Remotion. Mọi thư viện khác được cắm vào và **chạy theo số frame** (không chạy theo đồng hồ thật) để render không giật/lệch:

| Nhóm | Công cụ | Vai trò trong skill |
|---|---|---|
| Agent skills | Remotion Skills, GSAP Skills, Motion AI Kit | tra cứu API chi tiết (cài kèm) |
| Design | SVGO, Satori | làm sạch SVG để animate; sinh thumbnail/title/lower-third/quote card |
| Animation | GSAP, Anime.js, Motion, Rive, dotLottie (+ Lottie) | bridge chạy theo frame trong `src/bridges/` và `assets/optional/` |
| Video | Remotion, Motion Canvas | Remotion mặc định; Motion Canvas cho video giải thích code/toán |
| 3D | Three.js, R3F, Drei, Rapier, Postprocessing | `Scene3D`, `PhysicsPlayback` (vật lý được bake trước) |
| Âm thanh & xuất bản | Howler.js, Mediabunny, FFmpeg | preview SFX; đo độ dài VO; loudness, phụ đề, reframe, QA |

### Cấu trúc
```
motion-video-studio/
├── SKILL.md                 # quy trình, bảng chọn công cụ, quy tắc vàng
├── references/              # 10 tài liệu đọc theo từng bước
├── scripts/                 # init_project, storyboard_to_timeline, probe_audio, make_sfx,
│                            # optimize_svgs, render_cards, bake_physics, post_export, qa_video
└── assets/
    ├── remotion-template/   # project Remotion mẫu đọc storyboard.json
    ├── optional/            # three | lottie | dotlottie | rive | motion
    └── svgo.config.mjs
```

### Cài đặt & dùng thử
```bash
# cài skill (copy thư mục vào ~/.claude/skills/ hoặc .claude/skills/ của project)
cp -r motion-video-studio ~/.claude/skills/

# tạo project video
bash motion-video-studio/scripts/init_project.sh my-video --with three,motion
cd my-video
node ../motion-video-studio/scripts/storyboard_to_timeline.mjs .
npx remotion studio                       # xem trước
npx remotion render Main out/master.mp4   # render
bash ../motion-video-studio/scripts/post_export.sh out/master.mp4 --reframe 9:16
bash ../motion-video-studio/scripts/qa_video.sh out/export/master-web.mp4 .
```
Yêu cầu: Node ≥ 22.18, FFmpeg. Không có mạng để tải Chrome? Đặt `REMOTION_BROWSER=/đường/dẫn/chrome`.
