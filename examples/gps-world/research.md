# Research — GPS hoạt động thế nào

Ngày truy cập: 2026-10-22. Chủ đề cơ chế (không phải tin tức): mỗi fact có ít nhất một nguồn đáng tin; con số quan trọng có nguồn thứ hai hoặc phép tính ghi rõ.

| id | type | content | source | url | published | accessed | speaker |
|---|---|---|---|---|---|---|---|
| r1 | fact | Vệ tinh GPS bay ở quỹ đạo trung bình (MEO), độ cao khoảng 20.200 km (12.550 dặm); mỗi vệ tinh bay hai vòng quanh Trái Đất mỗi ngày. | GPS.gov — Space Segment | http://www.gps.gov/space-segment | – | 2026-10-22 | |
| r2 | fact | Bố trí 24 vị trí quỹ đạo bảo đảm người dùng thấy ít nhất bốn vệ tinh từ gần như mọi điểm trên hành tinh; Lực lượng Không gian Mỹ đang vận hành 31 vệ tinh. | GPS.gov — Space Segment | http://www.gps.gov/space-segment | – | 2026-10-22 | |
| r3 | fact | Mỗi vệ tinh có đồng hồ nguyên tử dự phòng và phát đi vị trí cùng thời gian của nó đều đặn; máy thu tính vị trí bằng cách đo tín hiệu mất bao lâu để tới nơi. GPS định vị ở mức mét và thời gian ở mức 10 nano giây. | NASA — GPS (Space Communications and Navigation) | https://www.nasa.gov/directorates/somd/space-communications-navigation-program/gps/ | – | 2026-10-22 | |
| r4 | fact | Tín hiệu đi với tốc độ ánh sáng, hơn 299.792 km/s; khoảng cách = vận tốc × (giờ nhận − giờ phát). Cần ít nhất bốn vệ tinh vì vệ tinh thứ tư dùng để sửa sai số đồng hồ của máy thu. Nội dung lấy từ tóm tắt tìm kiếm của tờ áp phích; tải trực tiếp trang gốc báo 404 lúc truy cập. | GPS.gov — How GPS Works (poster) | https://www.gps.gov/multimedia/poster/poster-web.pdf | – | 2026-10-22 | |
| r5 | fact | Cần tối thiểu bốn tín hiệu để xác định một điểm, và thời gian phải chính xác tới vài phần tỷ giây: lệch một phần tỷ giây tương đương lệch 30 cm vị trí. Nội dung lấy từ kết quả tìm kiếm; trang ESA đang tạm offline lúc truy cập. | ESA — Galileo infographic "A question of time" | https://www.esa.int/ESA_Multimedia/Images/2021/11/Galileo_infographic_A_question_of_time | 2021-11 | 2026-10-22 | |
| r6 | fact | Hiệu ứng tương đối: đồng hồ trên vệ tinh nhanh hơn đồng hồ dưới đất khoảng 38 micro giây mỗi ngày (cộng 45 do trọng lực yếu hơn, trừ 7 do chuyển động). Không hiệu chỉnh thì sai số vị trí tích luỹ khoảng 10 km mỗi ngày. | Ohio State University, Astronomy 162 (R. Pogge) — Relativity and GPS | https://www.astronomy.ohio-state.edu/pogge.1/Ast162/Unit5/gps.html | – | 2026-10-22 | |
| r7 | context | Phép tính của chúng tôi: 20.200 km ÷ 299.792 km/s ≈ 0,067 s, tức khoảng 67 mili giây cho tín hiệu từ vệ tinh ngay trên đầu xuống tay bạn (vệ tinh ở xa hơn thì lâu hơn một chút). 1 ns × 299.792 km/s ≈ 30 cm khớp với r5. | tính từ r1 và r4 | – | – | 2026-10-22 | |
| r8 | context | Điện thoại chỉ thu: nguồn r3 mô tả vệ tinh phát và máy thu tính; không nguồn nào mô tả máy thu gửi gì lên vệ tinh. Đây là suy ra từ mô tả hệ thống, không phải câu trích. | r3, r4 | – | – | 2026-10-22 | |

## Details only this topic has

1. Điện thoại không bao giờ nói gì với vệ tinh: nó chỉ nghe, nên một triệu điện thoại cùng dùng GPS cũng không làm vệ tinh quá tải (suy ra từ r3, r4).
2. Vệ tinh thứ tư không để đo thêm một chiều, mà để sửa đồng hồ rẻ tiền của điện thoại (r4).
3. Đồng hồ vệ tinh phải được chỉnh trước cho chạy chậm đi, nếu không GPS lệch khoảng 10 km mỗi ngày (r6).

## Interesting but not used

- Vệ tinh bay hai vòng mỗi ngày nên một điểm trên đất liền luôn đổi nhóm vệ tinh nhìn thấy (r1).
- Độ chính xác điện thoại cụ thể (vài mét) phụ thuộc chip và môi trường; chưa có nguồn đo trong bộ research này nên không đưa vào.

## Open questions

- Tải trực tiếp được trang gốc của poster GPS.gov (r4) và ESA (r5) khi trang hoạt động lại, để kiểm chứng nguyên văn.
