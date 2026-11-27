# Nhật ký thay đổi

[English](CHANGELOG.md) | Tiếng Việt

> Bản dịch của `CHANGELOG.md`. Khi hai bản khác nhau, bản tiếng Anh là bản chuẩn.

Mọi thay đổi đáng chú ý của termi được ghi ở đây. Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), đánh số phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

## [Unreleased]

### Thêm
- Chế độ nhúng: khi đặt `TERMI_TOKEN`, termi nhận request mang token trong `X-Termi-Token` thay cho danh tính Tailscale, để chạy được sau reverse proxy của một ứng dụng khác (ví dụ mỗi người một container sandbox). Xem `docs/GUIDE-v1.5-embedded-mode.md`.
- Chế độ nhúng: token phải dài ít nhất 32 ký tự và không bao giờ được chuyển tiếp sang máy khác hay sang ttyd.

### Thay đổi
- Web app dùng URL tương đối nên chạy được khi đặt dưới một tiền tố đường dẫn như `/sandbox/ui/`.

## [1.4.0] - 2026-11-27

### Thay đổi
- Trạng thái phiên được máy chủ đẩy xuống qua luồng (`GET /api/stream`): phiên mới, "chờ bạn" và câu trả lời xong hiện trong khoảng một giây; app chỉ hỏi định kỳ 15 giây một lần để dự phòng, đỡ tốn pin điện thoại.

## [1.3.0] - 2026-11-27

### Thêm
- WSL: script cài giữ bản Linux luôn chạy khi đăng nhập Windows, nên máy không còn biến mất khỏi danh sách khi đóng cửa sổ Ubuntu.
- macOS: máy chủ tự xoay vòng `~/Library/Logs/termi.*.log` khi quá 5 MB.

### Thay đổi
- Ghi chú cài đặt đổi tên thành `docs/NOTES-v1.8-implementation-notes.md`, thêm lý do của các thay đổi trong bản này.
- Lúc termi đang khởi động lại (ví dụ khi nâng cấp), app hiện trang "đang kết nối" rồi tự vào lại thay vì trang lỗi 502 của trình duyệt; các lệnh gọi API coi đó là mất kết nối.

## [1.2.0] - 2026-11-27

### Thêm
- Chuyển phiên giữ sẵn tối đa bốn terminal đang kết nối ở nền, quay lại là hiện ngay, không tải lại.
- Chấm kết nối trên header (xanh / vàng / đỏ) cho biết máy chủ và terminal có kết nối không và dữ liệu mới nhất cách đây bao lâu.
- Tin gửi lúc mất mạng được giữ lại, hiện phía trên ô nhắn và tự gửi khi có mạng lại.

### Thay đổi
- Có bản termi mới không còn tự tải lại trang khi bạn đang dùng; thay vào đó hiện thanh "Có bản termi mới · Tải lại".

## [1.1.0] - 2026-11-27

### Thêm
- Danh sách phiên: hàng lọc (Tất cả / Chờ bạn / Đang chạy / Rảnh) kèm số lượng, nút đổi tên/đóng phiên hiện khi rê chuột.
- Lịch sử git nhóm theo ngày ("Hôm nay", "Hôm qua", rồi ngày cụ thể) và có avatar chữ cái đầu của tác giả.
- Diff hai cột tô đúng phần chữ đã đổi trong mỗi dòng sửa.
- Tab File: đường dẫn bấm được, tìm file theo tên trong cả thư mục (`GET /api/find`), số dòng khi xem code.
- Điện thoại: hộp thoại dạng sheet trượt từ dưới lên, vuốt từ mép trái để quay lại, kéo xuống để làm mới chat, file, git và danh sách phiên, rung nhẹ khi gửi, chuyển tab và đóng phiên.

### Thay đổi
- Tên phiên dài giữ phần đuôi phân biệt (`BSR-Digi…-3`) thay vì bị cắt ở cuối.
- Cột chat vẫn rộng 820px nhưng cuộn được ở cả khung, không chỉ trong cột.

### Sửa lỗi
- `npm run check` không còn báo lỗi vì file AppleDouble (`._*`) của macOS sinh ra trên ổ exFAT.

## [1.0.1] - 2026-11-27

### Sửa lỗi
- Cài đặt → "Báo khi": ô tích nằm lệch phía trên chữ và mỗi ô giờ yên lặng chiếm trọn một dòng; giờ đã thẳng hàng, và trên điện thoại khoảng giờ xuống dòng nguyên khối.

## [1.0.0] - 2026-11-27

### Thêm
- Quy tắc kỹ thuật cho agent viết code trong `AGENTS.md` (tiếng Việt: `AGENTS.vi.md`), Claude Code nạp qua `CLAUDE.md`.
- Kế hoạch refactor kiến trúc `plan/PLAN-v1.8-architecture-refactor.md`.
- Ghi chú cài đặt `docs/NOTES-v1.8-implementation-notes.md`, chứa lý do trước đây nằm trong comment.
- `npm run check`: kiểm tra comment, độ dài file và dòng, cú pháp và tên tài liệu, không cần dependency; có allowlist cho file cũ và danh sách này chỉ được thu hẹp.
- `npm run verify` (kiểm tra + test) và CI trên GitHub Actions cho Ubuntu và macOS.
- `.editorconfig`.
- Biến môi trường `TERMI_DATA` để chọn thư mục dữ liệu (mặc định `~/.termi`).
- Nhật ký thay đổi bằng tiếng Anh và tiếng Việt.

### Thay đổi
- README chuyển sang tiếng Anh, bản tiếng Việt ở `README.vi.md`.
- Ảnh chụp chuyển vào `docs/assets/screenshots/`.
- Tài liệu trong `docs/` và `plan/` đặt tên theo quy tắc `<TIỀN_TỐ>-v<MAJOR>.<MINOR>-<slug>.md`.
- Commit, release và changelog viết bằng tiếng Anh.
- File trạng thái trong thư mục dữ liệu được ghi nguyên tử và lần lượt theo từng file.
- File trạng thái bị hỏng được chuyển sang `<tên>.corrupt-<thời điểm>` và ghi log, thay vì bị thay thế âm thầm.
- `vapid.json` bị hỏng thì server dừng với thông báo rõ ràng, thay vì sinh khoá mới làm hỏng mọi đăng ký thông báo đẩy.
- `src/server.mjs` giờ chỉ là điểm khởi động; code server chuyển sang `src/app.mjs`, cấu hình ở `src/config.mjs`, lưu trữ ở `src/store.mjs`.
- Phần kiểm tra dữ liệu, xử lý chữ, git và tmux tách khỏi `src/app.mjs` sang `src/validate.mjs`, `src/text.mjs`, `src/git/` và `src/tmux/`, mỗi phần có test riêng.
- Code riêng của từng agent (Claude Code, Codex, Antigravity) chuyển vào adapter riêng trong `src/agents/`.
- Không còn `src/app.mjs`: lớp HTTP nằm trong `src/http/`, API chia mỗi nhóm một file trong `src/routes/`, Web Push trong `src/push/`; phiên, bản lưu phiên, máy trong tailnet và watchdog ttyd có module riêng; `src/start.mjs` nối chúng lại.
- Log của server viết bằng tiếng Anh.
- Giao diện web tách thành `public/css/` (10 file CSS) và `public/js/` (ES module gốc của trình duyệt); `index.html` chỉ còn markup. Sửa bất kỳ file giao diện nào cũng làm các trang đang mở tự tải lại.
- Đã bỏ comment khỏi mọi file mã nguồn, kể cả script cài đặt, service worker và statusline của Claude; lý do được chuyển sang `docs/NOTES-v1.8-implementation-notes.md`. Allowlist của bộ kiểm tra quy tắc đã rỗng.
- Mọi hàm đều không quá 40 dòng; module client không còn đụng tới trình duyệt lúc nạp, nên phần logic có unit test.
- Các script shell có quyền thực thi ngay trong repo.
- `docs/ARCH-v1.0-overview.md` mô tả sơ đồ module.

### Hiệu năng
- Danh sách phiên được dựng tối đa một lần mỗi giây và dùng chung cho mọi thiết bị đang mở cùng bộ theo dõi thông báo; 5 request cùng lúc với 10 phiên agent giảm từ khoảng 65 ms xuống 19 ms.
- Usage, Chat và màn hình chép chữ chỉ tra một phiên thay vì dựng lại cả danh sách (18 ms xuống 7 ms với 10 phiên).

### Sửa lỗi
- `npm test` lỗi trên Node 24 (`MODULE_NOT_FOUND`) và không chạy test nào.
- Test không còn ghi vào `~/.termi` thật.
- Thiếu số liệu Usage của Claude khi server chạy với `TERMI_DATA` khác `~/.termi`; statusline giờ ghi vào cạnh bản đã cài của nó.
- Chế độ Chat không còn lỗi khi tham số của một lần gọi công cụ là giá trị JSON `null`.
- Đóng phiên, khôi phục phiên và bản lưu định kỳ có thể ghi đè thay đổi của nhau trong `sessions.json`.

## [0.12.0] - 2026-11-26

### Thay đổi
- Chat kiểu Claude: câu trả lời không khung, khối code có thanh ngôn ngữ và nút chép, thẻ các bước gọn.
- Terminal dùng cùng bảng màu với app, có lề trong và con trỏ dạng thanh.
- Màn hình chào có lời chào và gợi ý tiếp tục hội thoại gần nhất.
- Chọn agent bằng thẻ có logo.

## [0.11.0] - 2026-11-26

### Thay đổi
- Giao diện mới: font Be Vietnam Pro và JetBrains Mono (cả terminal), bảng màu tối giản, thanh "đang làm" thành viên nhỏ trên header.

### Sửa lỗi
- Danh sách đánh số trong câu trả lời của agent bị nhận nhầm thành bảng chọn.

## [0.10.5] - 2026-11-26

### Sửa lỗi
- WSL: dùng cổng 7690/7691 vì Windows đã giữ 7680, ttyd gắn đúng 127.0.0.1 ở chế độ mạng mirrored.

## [0.10.4] - 2026-11-26

### Thêm
- Bôi đen chữ trong terminal là chép ra clipboard (nhận mã OSC 52 từ tmux).

### Bỏ
- Hàng câu đã gửi gần đây phía trên ô nhắn (vẫn gọi lại câu vừa gửi bằng phím ↑).

## [0.10.3] - 2026-11-26

### Sửa lỗi
- Chớp màn hình: khi nghi kết nối đứng thì nhờ tmux vẽ lại để kiểm tra, chỉ nạp lại khi thật sự đứng.

## [0.10.2] - 2026-11-26

### Sửa lỗi
- Chớp màn hình: terminal tự nạp lại vô cớ mỗi khi bấm chuột hoặc gõ phím không ra chữ.

## [0.10.1] - 2026-11-26

### Thêm
- Dán ảnh hoặc kéo thả file vào ô chat.

### Sửa lỗi
- Nháy do thanh xác nhận ẩn hiện làm terminal đổi cỡ liên tục.

## [0.10.0] - 2026-11-26

### Thêm
- Trả lời menu chọn nhiều ngay trong app.
- Tự sửa danh sách thao tác nhanh.
- Một danh sách phiên cho mọi máy.
- Tuỳ chỉnh thông báo.

### Sửa lỗi
- Terminal tự lấy lại đủ cỡ khi quay lại cửa sổ sau khi điện thoại ép khung nhỏ.

## [0.9.0] - 2026-11-26

### Thêm
- Chat hiện các bước agent làm.
- Bảng lệnh (Ctrl/Cmd+K).
- Thanh "agent đang làm gì".
- Danh sách thao tác nhanh.

### Sửa lỗi
- Thanh xác nhận bị nháy.

## [0.8.1] - 2026-11-26

### Thêm
- Tên hội thoại như trong Claude, hiện model đang dùng.

### Sửa lỗi
- Mất thanh tab sau khi gửi tin nhắn.

## [0.8.0] - 2026-11-26

### Thêm
- Cây project giống Claude Code desktop.
- Chế độ Chat.
- Nút xác nhận nhanh.
- Nhập bằng giọng nói.
- Trang Cài đặt.

## [0.7.0] - 2026-11-26

### Thay đổi
- Khung tmux theo cỡ của thiết bị đang được chạm hoặc gõ, không chỉ lúc mở terminal.
- Giao diện giống app thật hơn, chuyển phiên nhanh, xem code đẹp hơn.

## [0.6.0] - 2026-11-26

### Thêm
- Cài không cần clone: `scripts/get.sh` tải file cài từ bản phát hành mới nhất.
- Chia đôi màn hình trên máy tính, ô nhắn thông minh, thẻ phiên sống động, hộp thông báo.

## [0.5.0] - 2026-11-26

### Thêm
- Thẻ phiên xem trước câu trả lời gần nhất của agent.
- Xem commit có danh sách file; tab Git gọn đẹp hơn.
- Nhóm phiên theo thư mục project, nút + tạo phiên trong project, lịch sử lọc theo thư mục của phiên.
- Khôi phục phiên sau khi khởi động lại máy.

### Sửa lỗi
- Terminal không còn đứng im sau khi điện thoại ngủ hoặc đổi mạng.
- Dọn ttyd rò pty, nối lại bền hơn.
- Phiên đã đóng bị tạo lại khi mở đường dẫn cũ hoặc tự kết nối lại.

## [0.4.0] - 2026-11-26

### Thay đổi
- Terminal vừa khung; tab File có icon và trạng thái git; danh sách phiên và màn hình chào mới.

## [0.3.0] - 2026-11-26

### Thêm
- Icon agent trên thẻ phiên và lịch sử (Claude, OpenAI Codex, Antigravity, shell).
- Nút 📋 Chép mở chữ của phiên để chọn và copy.
- Lệnh ngắn `npm run claude-usage`.

### Thay đổi
- Bảng Usage có icon, nút đóng cố định ở đầu; nút gửi một chạm là gửi.

### Bảo mật
- Chỉ chủ máy được vào termi.
- Chặn WebSocket từ trang lạ.
- Trang khác không nhúng được termi.

## [0.2.1] - 2026-11-26

### Thêm
- Gửi thử thông báo hiện kết quả; đăng ký cũ đã chết thì tự đăng ký lại.

## [0.2.0] - 2026-11-26

### Thêm
- Usage trên header: hạn mức gói agent, ngữ cảnh phiên, tài nguyên máy.

### Thay đổi
- Header gọn hơn, dòng phụ chỉ ghi agent · trạng thái · tên thư mục.

## [0.1.0] - 2026-11-26

### Thêm
- Web app quản lý phiên Claude Code trong tmux từ điện thoại.
- Tạo phiên ở thư mục bất kỳ, gợi ý thư mục gần đây.
- Cây git dạng đồ thị: làn màu, đường merge, nhãn branch.
- Xem trước Markdown trong trình xem file, hiện được ảnh SVG và sơ đồ Mermaid.
- Giao diện Tự động / Sáng / Tối.
- Terminal vuốt để cuộn, chỉnh cỡ chữ, chạm hoặc tự kết nối lại.
- Giữ màn hình sáng khi đang mở app (Screen Wake Lock).
- Nút ⚡ thao tác nhanh gửi yêu cầu soạn sẵn cho Claude.
- Nhiều agent: Claude Code, Codex và Antigravity.
- Điều khiển nhiều máy trong tailnet, kèm script cài cho Linux và WSL.
- Nút gửi ảnh mở bộ sưu tập; file đính kèm hiện dạng ô thu nhỏ.
- Trang tự tải lại khi có bản mới.
- README có logo, tech stack, ảnh chụp, kiến trúc và hướng dẫn cài đặt.

### Thay đổi
- Chuẩn hoá cấu trúc thư mục: `src/`, `scripts/`, `test/`, `package.json`.

### Sửa lỗi
- Bấm phím trên thanh công cụ không còn bật bàn phím điện thoại.
- Cỡ chữ terminal không còn về mặc định khi tải lại.
- Ô nhắn bị bàn phím đè khi mở.
- Font terminal trên Android (bỏ Courier khỏi danh sách font).
- Bỏ qua file rác `._*` của macOS trên ổ NTFS.

[Unreleased]: https://github.com/hoangtu0812/termi/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/hoangtu0812/termi/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/hoangtu0812/termi/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/hoangtu0812/termi/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/hoangtu0812/termi/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/hoangtu0812/termi/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/hoangtu0812/termi/compare/v0.12.0...v1.0.0
[0.12.0]: https://github.com/hoangtu0812/termi/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/hoangtu0812/termi/compare/v0.10.5...v0.11.0
[0.10.5]: https://github.com/hoangtu0812/termi/compare/v0.10.4...v0.10.5
[0.10.4]: https://github.com/hoangtu0812/termi/compare/v0.10.3...v0.10.4
[0.10.3]: https://github.com/hoangtu0812/termi/compare/v0.10.2...v0.10.3
[0.10.2]: https://github.com/hoangtu0812/termi/compare/v0.10.1...v0.10.2
[0.10.1]: https://github.com/hoangtu0812/termi/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/hoangtu0812/termi/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/hoangtu0812/termi/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/hoangtu0812/termi/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/hoangtu0812/termi/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/hoangtu0812/termi/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/hoangtu0812/termi/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/hoangtu0812/termi/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/hoangtu0812/termi/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/hoangtu0812/termi/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/hoangtu0812/termi/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/hoangtu0812/termi/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/hoangtu0812/termi/releases/tag/v0.1.0
