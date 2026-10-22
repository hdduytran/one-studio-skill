# Research: viết brief & kịch bản video "có người" — đề xuất bộ sub-skill cho one-studio

Ngày: 2026-10-21 · Phạm vi: cách con người làm brief/kịch bản theo thể loại, ngôn ngữ hình ảnh liền mạch, chống văn AI. Chưa đổi code.

## TL;DR

- Video "có người" không đến từ câu văn hay hơn, mà từ **quy trình**: nghiên cứu sâu → tìm *góc nhìn* (angle) và *một điều bất ngờ* → dàn ý nhân-quả (but/therefore) → **lên hình trước, viết lời sau** → đọc to và cắt. Các creator lớn (Johnny Harris, Cleo Abram, Kurzgesagt, 3Blue1Brown) đều làm hình và chữ song song, hoặc dựng hình trước rồi viết lời quanh hình.
- Brief hiện tại của one-studio (bảng Goal/Audience/CTA) thiếu đúng những trường tạo ra "chất người": **quan điểm, căng thẳng/xung đột, hiểu lầm phổ biến, chi tiết cụ thể chỉ chủ đề này có, nhân vật/người thật, giọng kể**.
- Scene hiện là "slide" rời (`text | diagram | data…`, ghép bằng transition). Muốn bớt "vô tri" cần thêm 3 khái niệm: **thế giới liên tục + camera**, **vật thể xuyên suốt (motif)**, và **chuyển cảnh có neo (match cut / handoff)**.
- Đề xuất: thêm một sub-skill `one-studio:writers-room` (gate 1–3) gồm craft chung + playbook theo thể loại (SaaS, open-source, so sánh, tin tức + bình luận, cơ chế máy móc/hệ thống, khái niệm trừu tượng), và mở rộng storyboard với `world`, `camera`, `motif`, `handoff`.

---

## 1. Con người viết kịch bản thế nào (bằng chứng)

| Creator | Quy trình | Bài học cho skill |
|---|---|---|
| **Johnny Harris** | Viết kịch bản và đạo diễn hình *cùng lúc*, script 2 cột (lời / hình), ghi chú màu cho asset & fact-check; một video từng có tài liệu nghiên cứu 188 trang; 30–60 s đầu đặt "lời hứa" bằng hình mạnh rồi trả nợ bằng fact | Script phải là **2 cột AV**, không phải danh sách câu. Có "promise → payoff" rõ |
| **Cleo Abram** (Huge If True, cựu Vox) | pitch → info doc → outline → script; lên "visual abstract" trước, script viết **sau cùng** quanh hình đã có; hàng trăm giờ phỏng vấn chuyên gia | Thêm bước **info doc** và **visual abstract** trước khi viết lời |
| **Kurzgesagt** | Researcher gom mọi thứ thú vị vào 1 tài liệu → writer dựng câu chuyện → chuyên gia review; tìm *ẩn dụ hình ảnh* và *chuyển cảnh giữa ý*; so sánh tỉ lệ luôn neo vào cỡ con người | Ẩn dụ + neo vào con người ("bạn") là công cụ chính, không phải chữ trên màn |
| **Veritasium** (luận án của Derek Muller) | Video giảng giải "rõ ràng" gần như không dạy được gì và còn củng cố hiểu lầm; video **nêu hiểu lầm trước rồi phá** cho điểm hậu kiểm gần gấp đôi | Playbook giải thích mở bằng **hiểu lầm phổ biến** |
| **3Blue1Brown** | Script chỉ là hướng dẫn; kể *con đường khám phá* thay vì tuyên bố "đây là sự thật"; ví dụ cụ thể trước, trừu tượng sau | Thứ tự: ví dụ → quy luật → tên gọi |
| **Branch Education** | Mỗi video >1.100 giờ; dựng mô hình từ dữ liệu kỹ thuật, exploded view, đường electron chạy khớp lời; storyboard cả *camera transition* và *scale* | Cơ chế máy móc = **đi theo dòng năng lượng/vật chất**, camera đi cùng |
| **Trey Parker & Matt Stone** | Thay mọi "and then" giữa các beat bằng "but" hoặc "therefore" | Lint dàn ý: mỗi chuyển beat phải là *nhưng* / *vì vậy* |
| **MrBeast handbook** (rò rỉ 2024) | Phút đầu là nơi người xem bỏ nhiều nhất; thumbnail đặt kỳ vọng; có beat "kéo lại" quanh phút 3 | Hook trả đúng lời hứa của tiêu đề; video dài cần re-hook |
| **Phát thanh / NPR** | Viết như nói; người nghe chỉ nghe một lần; câu ngắn, chủ động, ít số; đọc to trước khi thu | Lượt "đọc to" là bắt buộc trước khi duyệt script |

Điểm chung: **nội dung đến từ nghiên cứu và quan điểm**, hình là bằng chứng, lời là sợi chỉ nối các bằng chứng.

## 2. Vì sao kịch bản AI nghe "vô tri"

Theo các nguồn (đa phần là blog thực hành, nên coi là kinh nghiệm chứ không phải nghiên cứu):

1. **Câu chung chung, ai cũng nói được** — không có chi tiết chỉ chủ đề này có. (HyperFrames `story-spine.md` có cùng phép thử: "nếu prop xuất hiện y nguyên trong video sản phẩm khác thì nó không đến từ nguồn".)
2. **Chuỗi "và rồi"** — liệt kê tính năng/sự kiện, không có nhân quả, không có căng thẳng.
3. **Không có người**: không có ai gặp vấn đề, không có ý kiến, không dám nói "chúng tôi nghĩ…".
4. **Từ "an toàn" thống kê**: delve, tapestry, crucial, "in today's ever-evolving world", "in conclusion".
5. **Một prompt viết cả script** — nguồn khuyên viết theo nhiều bước và nạp giọng thật trước.

Tương đương tiếng Việt (mình tự tổng hợp, chưa có nguồn): "Bạn có bao giờ tự hỏi…", "Hãy cùng tìm hiểu…", "Trong thời đại công nghệ 4.0…", "không chỉ… mà còn…", "đóng vai trò vô cùng quan trọng", "giải pháp toàn diện", "nâng tầm", "kỷ nguyên mới", "Tóm lại,…". Đổi từ chỉ là sửa bề mặt; cách sửa thật là các mục 1 và 3.

## 3. Brief mới: các trường tạo ra "chất người"

Giữ bảng hiện tại, thêm phần **Story core** (bắt buộc với mọi thể loại):

| Trường | Câu hỏi | Ví dụ (SaaS quản lý hoá đơn) |
|---|---|---|
| Angle (một câu) | Video này *nói gì mà video khác không nói*? | "Kế toán không ghét Excel, họ ghét 17h chiều thứ Sáu cuối tháng" |
| Người thật | Ai, đang ở đâu, gặp chuyện gì? | Chị Lan, kế toán 1 người cho 3 cửa hàng |
| Căng thẳng | Cái gì đang mâu thuẫn / bị đe doạ? | Sếp cần số trước 9h sáng thứ Hai |
| Hiểu lầm phổ biến | Người xem đang tin sai điều gì? | "Phần mềm kế toán là cho công ty lớn" |
| Chi tiết chỉ chủ đề này có | 3 chi tiết cụ thể từ nghiên cứu | Mã lỗi MST sai, 4 file Excel tên "final_v3" |
| Quan điểm / giọng | Mình đứng ở đâu? Giọng nào? | Đồng cảm, hơi hài, không bán hàng gắt |
| Lời hứa & trả nợ | Tiêu đề hứa gì, khi nào trả? | Hứa "cắt 3 giờ" → trả bằng đồng hồ ở giây 40 |
| Nguồn | Dẫn chứng cho mọi con số/khẳng định | link, ngày truy cập |

Gate 1 hiện cho phép tự approve brief; với các trường trên nên **hỏi user 2–3 câu về angle/người thật** nếu họ chưa cho, vì đây là thứ AI không tự bịa được.

## 4. Quy trình viết (thay gate 2 "viết bullet")

```
research → info doc → angle + 1 điều bất ngờ → beat outline (but/therefore)
        → visual abstract (hình chủ đạo mỗi beat) → script 2 cột AV
        → đọc to (TTS nháp hoặc ước lượng nhịp) → cắt 20% → duyệt
```

- **Info doc** (`research.md`): fact, số liệu, trích dẫn, nguồn, "những điều thú vị" kể cả thứ không dùng. Với tin tức là bắt buộc, có ngày.
- **Beat outline**: 5–9 beat, mỗi beat một câu; nối bằng *nhưng / vì vậy*. Lint: không quá 1 chỗ "và rồi".
- **Visual abstract**: mỗi beat một hình chủ đạo *cụ thể* (không phải "icon bánh răng"). Hình quyết định lời, không ngược lại.
- **Script 2 cột**: cột lời (mỗi dòng một câu TTS như hiện tại) + cột hình/camera/âm thanh. Cho phép **khoảng lặng** (hình kể, không lời) và beat chỉ có SFX.
- **Lượt đọc to**: kiểm câu ≤ 20 từ, số đã viết cho tai, không có cụm trong danh sách cấm, có ít nhất một câu "có người" (ý kiến, đùa, thừa nhận giới hạn).
- **Cắt**: script phải *ngắn hơn* video (HyperFrames: ~2.3 từ/s thực tế cho tiếng Anh).

## 5. Playbook theo thể loại

### 5.1 SaaS / sản phẩm thương mại
- Khung: **Pain (một ngày cụ thể của một người) → Agitate (cái giá) → Turn ("nhưng nếu…") → Show (2–3 khoảnh khắc sản phẩm, không phải tour tính năng) → Proof → CTA**. Studio motion còn thêm Empathy trước Solution.
- Hook 3–5 s bằng nỗi đau, không bằng tên sản phẩm. Apple: nói trải nghiệm thay vì spec, nhạc và nhịp mang cảm xúc.
- Demo ngắn xem hết nhiều hơn; mỗi bước một ý (dữ liệu vendor, tham khảo).
- **Hình**: quay màn hình kiểu Screen Studio: zoom vào chỗ click, con trỏ trượt mượt, motion blur khi lia nhanh, đặt trên nền thương hiệu, tự chỉnh zoom khi xuất 9:16. Tránh zoom theo mọi cử động nhỏ.
- Phép thử value-first (HyperFrames): xoá hết beat demo, phần còn lại vẫn phải nói được giá trị.

### 5.2 Open-source / devtool
- Người xem là dev: **giọng thẳng, không hype**, khoe code thật, số thật (benchmark có điều kiện đo).
- Khung: **"Mình đã bực vì X" (câu chuyện người viết) → 1 dòng lệnh / 10 dòng code làm được gì → so với cách cũ → giới hạn thật thà → star/try**. Thừa nhận giới hạn là tín hiệu "người", dev tin hơn.
- Hình: terminal gõ thật, diff, kiến trúc 1 hình, avatar contributor (có sẵn trong `pr-to-video`).

### 5.3 Video so sánh (vs)
- Trình bày workflow của đối thủ **công bằng**; phóng đại sẽ thành bù nhìn và phá cả video.
- Không nêu tên/logo đối thủ ("cách làm thường thấy") trừ khi có dữ liệu bên thứ ba; chỉ trích mạnh chỉ khi có bằng chứng khách quan.
- Hình: **split-screen cùng một tác vụ, cùng đồng hồ**; bảng so sánh xuất hiện dần theo từng tiêu chí, không đổ cả bảng.

### 5.4 Tóm tắt tin tức + bình luận
- Khung mỗi tin: **chuyện gì xảy ra → vì sao quan trọng (với *bạn*) → chưa rõ / sắp tới**. Phần "nó có nghĩa gì với bạn" là phần hay bị bỏ và là lý do duy nhất người ta bấm xem.
- Mẫu DeFranco: trình bày các phía của câu chuyện, rồi nêu ý kiến **được dán nhãn rõ là ý kiến**; mỗi tin dẫn nhiều nguồn.
- Bắt buộc: info doc có **ngày, nguồn, ai nói**; tách fact / trích dẫn / bình luận ở cả lời và hình (vd. nhãn "Ý KIẾN"). Không bịa trích dẫn.
- Hình: ảnh chụp tiêu đề báo/tweet thật (có nguồn), timeline, bản đồ, highlight dòng chữ trong bài; giọng kể ngồi bàn kiểu Johnny Harris (bản đồ giấy, bút dạ).
- Bản newsroom (Morphic): giọng biên tập *là phần phải giữ cho người*; recap hợp với voice-over trên đồ hoạ.

### 5.5 Cơ chế máy móc / hệ thống vận hành
- Mở bằng **hiện tượng quen thuộc + hiểu lầm** ("bạn nghĩ GPS phát tín hiệu lên vệ tinh?"), không mở bằng định nghĩa.
- Thân: **đi theo một thứ đang chảy** (năng lượng, dữ liệu, gói tin, nhiên liệu) từ input đến output; mỗi beat một bộ phận, một nhãn.
- Kỹ thuật hình: exploded view theo từng bước (mỗi bước dọc một trục), cutaway lộ đường chảy, mã màu dòng chảy giữ nhất quán, slow-mo ở khoảnh khắc then chốt, kết bằng toàn bộ máy chạy lại ở tốc độ thật (vòng lặp). Branch còn lên kế hoạch *scale* và *camera transition* ngay ở storyboard.
- Thứ tự 3Blue1Brown: ví dụ cụ thể → quy luật → tên gọi kỹ thuật.

### 5.6 Khái niệm trừu tượng / khoa học
- Kurzgesagt: ẩn dụ hình ảnh, neo tỉ lệ vào con người, ngôi thứ hai ("bạn đang ở giữa mọi thứ").
- Veritasium: nêu hiểu lầm, để người xem *tạm thời không chắc*, rồi phá.
- Kể như con đường khám phá: "giả sử bạn là người đầu tiên gặp vấn đề này…".

## 6. Ngôn ngữ hình ảnh: thoát khỏi "slide rời"

Từ research, những thứ khiến video "liền" thay vì "rời":

| Kỹ thuật | Mô tả | Hợp với |
|---|---|---|
| **Thế giới liên tục + camera** | Một canvas lớn hơn khung; các beat là *vị trí* trong thế giới, camera bay/zoom giữa chúng (infinite zoom: lồng lớp + scale, chú ý tốc độ đều qua các keyframe) | khái niệm, scale, hệ thống |
| **Match cut / handoff** | Cảnh sau nhặt lại hình/chuyển động của cảnh trước (hình tròn logo → bánh xe); cắt ở đỉnh chuyển động | mọi thể loại |
| **Motif xuyên suốt** | Một vật thể/màu đi suốt video và đổi trạng thái (tờ hoá đơn nhàu → phẳng; dòng chảy xanh) | SaaS, cơ chế |
| **Desk/collage tài liệu** | Giấy cắt, băng dính, halftone, mẩu báo, highlight; Vox render đồ hoạ ở 12 fps trong timeline 24 fps để có độ "giật" thủ công | tin tức, lịch sử, bình luận |
| **Screen cinema** | Quay màn hình + zoom theo click, con trỏ mượt, motion blur, nền thương hiệu | SaaS, devtool |
| **Exploded/cutaway** | Tách lớp theo bước, lộ đường chảy | cơ chế |
| **Kinetic type có nhịp** | Chữ là giọng nói (nhấn, ngắt), không phải phụ đề phóng to | hook, ý kiến |
| **Khoảng lặng & beat không lời** | Để hình/âm thanh kể 1–2 giây | mọi thể loại |

**Ảnh hưởng tới kiến trúc one-studio** (cần quyết định trước khi làm):
- Hiện mỗi scene là một clip độc lập, ghép stream-copy. Match cut/motif cần **handoff**: frame cuối của sN và frame đầu của sN+1 có cùng phần tử ở cùng vị trí. Có thể thêm `handoff: { element, state }` trong storyboard, và `keyframe-stills` chụp thêm cặp frame nối để duyệt.
- "Thế giới liên tục" cần một scene dài chứa nhiều beat với `camera` path; vẫn giữ render tăng dần theo scene, nhưng scene to hơn → render lại đắt hơn. Phương án rẻ: `world.svg/html` dùng chung, mỗi scene là một đoạn camera trong cùng thế giới (cùng file nguồn → đổi thế giới thì mọi scene liên quan đều re-render, đúng hành vi hash hiện tại).
- Desk/collage và 12 fps có thể là **preset hình + kiểu chuyển động** (`motion: "stepped-12"`), không cần engine mới.
- Screen cinema cần nguồn quay màn hình hoặc capture bằng Playwright rồi animate camera; có sẵn ý tưởng ở `product-launch-video` (capture website).

## 7. Đề xuất cấu trúc sub-skill

Một sub-skill, nạp từng phần (giữ nguyên tắc tiết kiệm token của one-studio):

```
plugins/one-studio/skills/writers-room/
  SKILL.md                      # quy trình gate 1–3, router theo thể loại
  craft/
    research-and-info-doc.md    # cách nghiên cứu, ghi nguồn, fact/opinion
    angle-and-story-core.md     # angle, người thật, căng thẳng, hiểu lầm, lời hứa
    beat-outline.md             # but/therefore, promise/payoff, re-hook, độ dài
    write-for-the-ear.md        # nói như người, số cho TTS, nhịp, khoảng lặng (vi + en)
    anti-slop.md                # danh sách cấm vi/en + phép thử "chỉ chủ đề này có"
    visual-language.md          # bảng mục 6: world, camera, motif, handoff, preset hình
  playbooks/                    # index.md + 14 thể loại (mục 5 và 9), nạp đúng 1 file
  formats/                      # short-vertical, long-form, series-episode, no-voice
  tones.md
  visual-modes/                 # world-camera, screen-cinema, desk-collage, exploded-cutaway, …
  templates/
    brief-story-core.md         # bảng mục 3
    research.md                 # info doc
    script-av.md                # script 2 cột (vẫn parse được bullet lời như hiện tại)
```

Thay đổi nhỏ ở one-studio: gate 1–2 gọi writers-room; `script.md` chấp nhận cột hình (`> visual:` đã có, mở rộng thêm `> camera:`, `> sfx:`, `> silence: 1.5s`); `storyboard.schema.json` thêm `world`, `camera`, `motif`, `handoff` (tuỳ chọn, tương thích ngược).

Tại sao một sub-skill thay vì sáu: các thể loại dùng chung 80% craft; tách skill sẽ lặp lại craft hoặc phải nạp chéo. Playbook thể loại chỉ ~60–100 dòng mỗi file, nạp đúng file cần.

## 8. Tiêu chí "video con người" để kiểm khi duyệt script

1. Có một câu nói được *angle* mà video khác không nói.
2. Có một người/tình huống cụ thể, hoặc một hiểu lầm cụ thể bị phá.
3. Mọi chuyển beat là *nhưng / vì vậy*.
4. Mỗi beat có hình chủ đạo cụ thể, truy được về nguồn.
5. Ít nhất một câu có quan điểm/cảm xúc thật (đùa, thừa nhận, ý kiến có nhãn).
6. Không có cụm trong `anti-slop.md`; số viết cho tai.
7. Có ít nhất một chuyển cảnh có neo (match cut/motif), không chỉ fade/slide.
8. Script ngắn hơn video; có ít nhất một khoảng lặng.

## 9. Playbook bổ sung (vòng research 2)

Mỗi playbook dưới đây là khung xương; bản đầy đủ sẽ nằm trong `playbooks/<id>.md` theo mẫu chung ở mục 10.

### 9.1 Câu chuyện khách hàng (case study / testimonial)
- **Khách hàng là nhân vật chính, thương hiệu là người dẫn đường** (StoryBrand: "Yoda, không phải Luke"). Doanh nghiệp hay cưỡng lại điều này vì muốn mình là trung tâm.
- Khung: vấn đề cụ thể của *họ* → vì sao chọn, *họ đã sợ gì* → bước ngoặt → kết quả bằng một con số cứng. Video 2 phút phải vào xung đột trong 20 s đầu.
- Người xem chuyển đổi khi thấy người giống mình; câu chuyện khớp đối tượng + con số thật thắng phim bóng bẩy khen chung chung.
- Hình: before/after cùng khung, "một ngày làm việc", số liệu chạy. Bản ngắn dùng Before-After-Bridge.

### 9.2 Hướng dẫn / walkthrough tính năng
- **Cho xem kết quả cuối trước mọi thứ**, intro 10–20 s gồm kết quả + điều kiện cần.
- Khung: kết quả → điều kiện → các bước (cảnh báo lỗi hay gặp *đúng chỗ* nó xảy ra) → xử lý sự cố → việc tiếp theo. Lý thuyết đặt *sau* các bước.
- Một video một việc. Câu mở bằng động từ ("Bấm Start"), giá trị chính xác ("đặt zoom 125%").
- Hình: tự quay màn hình (mục 11), zoom theo thao tác, nhãn phím tắt.

### 9.3 Câu chuyện thương hiệu / founder / manifesto
- Khung: **nguồn gốc → niềm tin → việc chúng tôi làm → bằng chứng**. Phim thương hiệu thất bại khi đọc danh sách giá trị.
- Nhân vật chính vẫn là khách hàng; founder kể *vì sao*, không kể thành tích.
- Kinh nghiệm studio: đọc kịch bản xong thì phỏng vấn tự do để có giọng tự nhiên. Với TTS: viết câu có nhịp nói, chừa khoảng lặng, ít tính từ.

### 9.4 Câu chuyện dữ liệu (data story)
- Segel & Heer: video là thể loại *tác giả dẫn dắt* (thứ tự chặt, thông điệp mạnh). Cấu trúc "martini glass": thân ly là câu chuyện tuyến tính, miệng ly là phần để người xem tự khám phá. Trong video thì miệng ly là khung hình cuối giữ đủ lâu để đọc.
- Hans Rosling (qua nghiên cứu Roslingifier): lời kể song song với chuyển động, hiệu ứng nhấn sự kiện, và **tua/dừng thời gian** của animation để kể.
- Khung: một con số trái trực giác → dữ liệu chạy theo thời gian → dừng ở điểm gãy → giải thích → quay lại toàn cảnh. Mỗi biểu đồ một câu kết luận viết thành tiêu đề.

### 9.5 Lịch sử / timeline / tài liệu
- Ken Burns: phim tài liệu dùng luật kể chuyện của hư cấu; động cơ là xung đột và việc *chưa biết kết cục*. Thứ tự thời gian là khung, nhưng được phép đảo.
- Cold open: một cảnh trước tiêu đề đặt bí ẩn hoặc vấn đề trung tâm. Tuyến tính hợp câu chuyện ca ngợi; phi tuyến, nhiều giọng hợp câu chuyện phản biện.
- Hình: bản đồ, ảnh tư liệu (Ken Burns pan), tài liệu giấy, timeline là *thế giới liên tục* để camera đi dọc.

### 9.6 Đánh giá / teardown sản phẩm
- **Kết luận trước** (2–3 câu), rồi chi tiết, ưu/nhược cân bằng, kết luận cuối rõ ràng. Nói thẳng nhược điểm làm tăng độ tin.
- Công khai cách có sản phẩm; so với sản phẩm cùng tầm để có bối cảnh.
- Hình: exploded/teardown (dùng chung mode với playbook cơ chế), bảng điểm hiện dần.

### 9.7 Video essay / quan điểm
- Một luận điểm gây tranh cãi được nêu sớm, rồi bằng chứng theo thứ tự but/therefore, có **phản biện mạnh nhất** của phía kia, rồi kết luận có sắc thái.
- Đây là thể loại mà "giọng" là sản phẩm: playbook phải hỏi user quan điểm thật của họ; không có quan điểm thì không viết.
- Hình: desk/collage, trích dẫn có nguồn, kinetic type cho câu then chốt.

### 9.8 Danh sách / top N (mạng xã hội)
- Danh sách cũng cần xương sống: một câu hỏi chung mà mọi mục trả lời, mục **tăng dần** độ bất ngờ, mục hay nhất để cuối và được hứa từ đầu (open loop).
- Mỗi mục: một câu khẳng định + một hình cụ thể + một lý do; cấm mục độn.

### 9.9 Lớp định dạng (dùng chồng lên bất kỳ playbook nào)
- **Short dọc 9:16**: hook 1–3 s, khung đầu phải có chữ vì nhiều người xem không bật tiếng; các beat 1–2 câu, mỗi beat "trả tiền" cho giây tiếp theo; một lời kêu gọi; kết thúc nối về đầu để xem lại (kỹ thuật phổ biến, chưa có số liệu đo).
- **Dài (> 3 phút)**: re-hook mỗi 60–90 s, có "chương"; phút đầu trả đúng lời hứa của tiêu đề (MrBeast handbook).
- **Tập trong series**: nhắc lại 1 câu tập trước, motif và thế giới dùng lại, kết bằng câu hỏi mở cho tập sau.
- **Không lời (chỉ nhạc + chữ)**: nhịp theo beat nhạc, chữ là lời, tối đa 6–8 từ mỗi khung.

### 9.10 Giọng kể (tone card)
Một file nhỏ với 5 giọng: *bạn thân am hiểu*, *chuyên gia khô*, *tinh nghịch*, *biên tập viên trung lập* (tin tức), *điện ảnh tối giản* (thương hiệu). Mỗi giọng: 3 câu mẫu tiếng Việt, 3 câu mẫu tiếng Anh, điều cấm.

## 10. Tổ chức playbook để không tràn context

Nguyên tắc: **mỗi gate chỉ nạp đúng thứ gate đó cần, và kết quả của gate được ghi ra file dự án**, nên gate sau đọc file dự án thay vì nạp lại playbook.

| Tầng | File | Nạp khi | Ngân sách |
|---|---|---|---|
| Router | `writers-room/SKILL.md` | luôn | ≤ 90 dòng |
| Mục lục | `playbooks/index.md` (1 dòng/playbook: id, khi nào dùng, tín hiệu nhận biết) | gate 1 | ≤ 40 dòng |
| Playbook | đúng **1** file `playbooks/<id>.md` | gate 1–2 | ≤ 90 dòng |
| Lớp định dạng | ≤ 1 file `formats/<id>.md` | gate 2 nếu cần | ≤ 40 dòng |
| Craft | `craft/<stage>.md` theo gate | gate tương ứng | ≤ 60 dòng/file |
| Visual mode | chỉ các mode storyboard chọn, `visual-modes/<id>.md` | gate 3, 5 | ≤ 60 dòng/file |

Mẫu cố định cho mọi playbook (để model đọc nhanh, so sánh được): *Dùng khi · Câu hỏi của người xem · Câu hỏi Story core riêng · Khung beat (kèm % thời lượng) · 3 kiểu hook · Visual mode gợi ý · Nghiên cứu cần gì · Bẫy hay gặp · Checklist duyệt*.

Thêm ba cơ chế giảm context:
1. **Lint bằng script thay vì nạp luật**: `script-lint.mjs` kiểm cụm sáo rỗng (vi/en), độ dài câu, số chưa viết cho tai, số chỗ "và rồi", thiếu cột hình, thiếu khoảng lặng, câu fact thiếu nguồn. Chỉ in vi phạm, nên danh sách cấm không cần nằm trong context.
2. **Research chạy trong subagent**: trang web thô ở lại trong context của subagent; agent chính chỉ nhận `research.md` (fact, trích dẫn, nguồn, ngày).
3. **Playbook đã chọn ghi vào `studio.json → story`** (`playbook`, `format`, `tone`, `modes`): phiên sau và gate sau biết ngay, không phải đoán lại.

## 11. Quyết định đã chốt (2026-10-21)

- **Tin tức**: research thêm khi user yêu cầu (web search, cần đồng ý qua `services.web`); mỗi câu fact gắn nguồn, ý kiến được dán nhãn.
- **Quay màn hình**: tự quay. Một script Playwright chạy theo kịch bản thao tác, ghi video + nhật ký con trỏ/click; scene `screen` dựng camera ảo zoom theo click, con trỏ vẽ lại mượt, ripple, motion blur, trên nền thương hiệu. Đăng nhập dùng storage state do user cung cấp, không tự nhập mật khẩu.
- **Thế giới liên tục**: làm. Một file `worlds/<name>.html` dùng chung; mỗi scene là một đoạn camera trong thế giới đó; scene liền kề cùng thế giới thì frame cuối = frame đầu và chuyển cảnh là `cut`, nên ghép vẫn copy stream mà nhìn như một cú máy.

## Nguồn

- Johnny Harris: [Medium phân tích visual storytelling](https://medium.com/@LMK_writing/how-johnny-harris-mastered-visual-storytelling-on-youtube-343ddf9160ec), [How I Write (podcast)](https://podcasts.apple.com/bg/podcast/johnny-harris-master-storytelling-on-youtube/id1700171470?i=1000698950686), [Jon Youshaei interview](https://creators.spotify.com/pod/profile/youshaei/episodes/The-Rise-of-Johnny-Harris--Explained-Interview-e2r0dge)
- Cleo Abram: [Washington Post Creator Q+A](https://wpcreator.washingtonpost.com/p/creator-q-a-cleo-abram), [Youshaei interview](https://podwise.ai/episodes/2768285), [YouTube Blog](https://blog.youtube/creator-and-artist-stories/5-huge-if-true-moments-for-cleo-abram/)
- Kurzgesagt: [What we do](https://kurzgesagt.org/what-we-do?visit=videos), [Research & fact-checking](https://medium.com/@Kurzgesagt/how-research-and-factchecking-work-at-kurzgesagt-f5b239188255), [FlowingData về scale](https://flowingdata.com/2023/12/21/scale-of-all-the-things-compared-to-you/)
- Veritasium / Muller: [THE Journal](https://thejournal.com/articles/2015/05/05/watching-videos-does-not-necessarily-lead-to-learning.aspx), [Big Think](https://bigthink.com/?p=68008)
- 3Blue1Brown: [MAA FOCUS interview](https://digitaleditions.walsworthprintgroup.com/publication/?i=529803&article_id=3201151&view=articleBrowser&ver=html5), [Dropbox profile](https://blog.dropbox.com/topics/work-culture/grant-sanderson-channels-his-passion-for-math-into-marvelously-i)
- Branch Education: [branch.education](https://branch.education/), [Acoroid case study](https://www.acoroidstudio.com/case-studies/branch-education-3d-modeling-animation)
- But/Therefore: [Perell](https://perell.com/note/but-therefore-rule/), [Matt Rickard](https://mattrickard.com/but-therefore), [Spliceworld](https://spliceworld.substack.com/p/but-therefore)
- MrBeast handbook: [Passionfruit](https://passionfru.it/mrbeast-leaked-document-81151/), [Alexander Jarvis](https://www.alexanderjarvis.com/memo-how-to-succeed-in-mrbeast-production/)
- Viết cho tai: [JEA (NPR-based)](https://jea.org/digital-media/writing-for-broadcast-how-to-sound-like-a-real-person), [Human Kinetics](https://us.humankinetics.com/blogs/excerpt/tips-for-writing-for-broadcast), [TruScribe](https://truscribe.com/blog/10-tips-for-writing-a-great-voiceover-script)
- SaaS/PAS: [Supademo](https://supademo.com/blog/demo-video), [Moonb](https://www.moonb.io/blog/perfect-demo-video), [Videojeeves](https://www.videojeeves.com/blog/how-to-make-a-saas-product-demo-video/)
- Apple: [Inc. – Carmine Gallo](https://www.inc.com/carmine-gallo/the-storytelling-secret-that-made-apple-a-global-icon/91324720), [ngram playbook](https://www.ngram.com/blog/product-launch-video-complete-playbook-2026)
- So sánh: [Advids playbook](https://advids.co/insights/the-comparison-video-playbook-creating-effective-youtube-videos-that-win-competitor-users-for-saas), [Weidert](https://www.weidert.com/blog/comparing-your-product-to-competitors-in-a-video), [Klue](https://klue.com/podcast/building-comparison-pages-that-crush-your-competitors-federico-jorge-stack-against)
- Tin tức: [Morphic newsroom guide](https://morphic.com/resources/guides/media/local-newsrooms-explainer-recap-ai), [Storm & Shelter](https://stormandshelter.com/content/latest/how-to-make-an-explainer-video-people-actually-understand), [DeFranco Show (Wikipedia)](https://en.wikipedia.org/wiki/The_Philip_DeFranco_Show)
- Hình ảnh: [Screen Studio](https://screen.studio/), [Dave Swift review](https://daveswift.com/screen-studio/), [PremiumBeat – Vox motion](https://www.premiumbeat.com/blog/replicating-vox-motion-graphic/), [vox-director](https://github.com/Alisa0808/vox-director), [School of Motion transitions](https://schoolofmotion.com/blog/six-essential-motion-design-transitions-tutorial), [Toolfarm infinite zoom](https://www.toolfarm.com/?p=61343)
- Chống văn AI: [AiSDR](https://aisdr.com/?p=3844), [Subscribr](https://subscribr.ai/youtube-strategy/ai-mistakes-youtube-creators)
- Vòng 2: [Shootsta customer story](https://shootsta.com/blog/customer-story-video-that-converts), [Blare Media frameworks](https://blaremedia.net/storytelling-frameworks-for-video/), [Venture Videos case study](https://venturevideos.com/insight/making-impactful-case-study-videos-a-deep-dive), [TubeMilestone tutorial](https://tubemilestone.com/blog/structure-youtube-tutorial), [Clueso tight script](https://www.clueso.io/cluebooks/tasteful-screen-recording--writing-a-tight-script), [Bold Content founder film](https://boldcontentvideo.com/project/marketinvoice-founder-film/), [Segel & Heer 2010](https://homes.cs.washington.edu/~jheer/files/narrative.pdf), [Roslingifier](https://users.umiacs.umd.edu/~elm/projects/roslingifier/roslingifier.pdf), [Ken Burns MasterClass](https://www.masterclass.com/classes/ken-burns-teaches-documentary-filmmaking/chapters/structuring-a-documentary-narrative), [Testimonial.to review guide](https://testimonial.to/resources/how-to-write-product-reviews), [Marketing Monk short-form](https://www.marketingmonk.so/tools/tiktok-script-generator)
- Nội bộ: HyperFrames `hyperframes-creative/references/story-spine.md`, `narration.md`

Lưu ý: nhiều nguồn là tóm tắt thứ cấp hoặc blog vendor; số liệu (188 trang, 1.100 giờ, điểm test Veritasium) nên coi là xấp xỉ. Danh sách cụm sáo rỗng tiếng Việt là mình tự tổng hợp.

## Câu hỏi chưa giải quyết

Câu 2–4 của vòng 1 đã chốt ở mục 11. Còn lại:
1. Một sub-skill `writers-room` (đề xuất) hay mỗi thể loại một skill?
2. Video mẫu để kiểm chứng: "GPS hoạt động thế nào" (cơ chế + thế giới liên tục) có hợp không?
