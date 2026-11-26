# termi — Quy tắc kỹ thuật cho agent viết code

[English](AGENTS.md) | Tiếng Việt

> Bản dịch của `AGENTS.md`. Khi hai bản khác nhau, bản tiếng Anh là bản chuẩn.

Mọi người và mọi AI agent khi sửa repo này đều phải tuân theo các quy tắc sau. Khi quy tắc mâu thuẫn với phần code cũ, áp dụng quy tắc cho phần code bạn chạm vào; phần còn lại xử lý theo kế hoạch refactor trong `plan/`.

## 1. Ràng buộc của sản phẩm

- termi là server Node.js (≥ 24) không dependency cộng với PWA tĩnh không cần build. Không thêm dependency khi chạy, bundler, transpiler hay framework.
- Server chỉ dùng module có sẵn của Node (`node:*`). Client chỉ dùng API gốc của trình duyệt và ES module.
- Server chỉ nghe trên `127.0.0.1`. Đường vào duy nhất từ bên ngoài là `tailscale serve`.
- Nền tảng hỗ trợ: macOS, Linux, Windows qua WSL2. Mọi nhánh code riêng theo hệ điều hành phải xử lý cả ba.

## 2. Không comment trong code

- Không viết comment trong bất kỳ file mã nguồn nào: `.mjs`, `.js`, `.sh`, `.css`, `.html`, `.json`. Bao gồm comment dòng, comment khối, JSDoc, comment HTML, code bị comment lại, đánh dấu TODO/FIXME và dòng phân đoạn.
- Ngoại lệ duy nhất là dòng shebang (`#!/bin/bash`, `#!/usr/bin/env node`) và chỉ thị máy mà công cụ bắt buộc phải có.
- Để code tự giải thích: tên chính xác, hàm nhỏ, hằng có tên thay cho số "ma thuật", return sớm, cấu trúc dữ liệu rõ ràng.
- Lý do không thể diễn đạt bằng code thì ghi ở:
  - phần thân commit message (vì sao có thay đổi này),
  - `docs/` (vì sao hệ thống làm như vậy: cách lách lỗi, đặc thù nền tảng, quyết định bảo mật),
  - test (hành vi bắt buộc phải có).
- Khi sửa file còn comment cũ, chuyển lý do không hiển nhiên ở những dòng bạn chạm vào sang file `docs/` tương ứng, rồi xoá các comment đó trong cùng thay đổi.

## 3. Kiến trúc và module hoá

- Một module = một trách nhiệm. Phải mô tả được module bằng một câu không có chữ "và".
- Cấu trúc đích (lộ trình chuyển đổi xem trong `plan/`):

  ```
  src/
    server.mjs        chỉ khởi động: đọc config, gọi start()
    config.mjs        biến môi trường và hằng số
    store.mjs         lưu JSON, ghi nguyên tử
    http/             router, xác thực, file tĩnh, chuyển tiếp
    routes/           mỗi nhóm API một file
    agents/           mỗi agent một adapter (claude, codex, agy)
    tmux/             liệt kê phiên và đọc màn hình
    git/              chạy git, parser, xếp làn cây commit
    push/             VAPID, Web Push, theo dõi trạng thái
  public/
    index.html        chỉ có markup
    css/              stylesheet
    js/               ES module gốc, mỗi tính năng một file
  ```

- Giới hạn kích thước: file ≤ 300 dòng, hàm ≤ 40 dòng, dòng ≤ 120 ký tự. Tách trước khi vượt.
- Không có tác dụng phụ khi import. Import một module không được tạo thư mục, đọc/ghi file, chạy tiến trình, sinh khoá hay bật timer. Những việc đó làm trong hàm `start()` / `init()` gọi rõ ràng.
- Truyền phụ thuộc vào (đường dẫn, thư mục gốc, đồng hồ, hàm chạy lệnh) thay vì đọc biến toàn cục, để test được.
- Hành vi riêng của từng agent chỉ nằm trong `src/agents/<agent>.mjs`, sau một interface chung. Không có `if (agent === 'claude')` bên ngoài thư mục đó.
- Tách logic thuần (parser, xếp layout, kiểm tra dữ liệu) khỏi I/O. Hàm thuần không đụng tới file, mạng hay tiến trình.
- Không lặp logic. Hai nơi cùng parse một định dạng thì tách ra một hàm.

## 4. Tính đúng đắn và an toàn

- Không bao giờ dùng shell. Chạy lệnh ngoài bằng `execFile` với mảng tham số.
- Kiểm tra mọi dữ liệu vào từ HTTP, file và máy khác bằng các hàm có sẵn (`validName`, `validBranch`, `validRev`, `validUuid`, `validGitPath`, `safePath`). Loại dữ liệu mới thì thêm hàm kiểm tra kèm test.
- Mọi đường dẫn đến từ request phải qua `safePath` (realpath + kiểm tra `TERMI_ROOTS`).
- Không được nới lỏng các lớp chặn request: kiểm tra Host, kiểm tra danh tính Tailscale (không xác định được thì chặn), header `X-Termi` cho POST, kiểm tra Origin của WebSocket, header CSP và chống nhúng.
- Code phía client không dựng HTML từ dữ liệu. Dùng `textContent` và DOM API; `innerHTML` chỉ dùng cho markup tĩnh, tin cậy.
- Lưu trạng thái bằng ghi nguyên tử (ghi file tạm rồi `rename`) và tuần tự hoá các chu trình đọc–sửa–ghi trên cùng một file.
- Giới hạn mọi lần đọc từ bên ngoài: timeout cho tiến trình và fetch, giới hạn kích thước body, file và output.
- Lỗi trả về client dùng `fail(status, message)`. Lỗi bất ngờ ghi log phía server và trả về 500 chung chung.
- Tên định danh, tên file và log bằng tiếng Anh. Chữ hiển thị trên giao diện giữ tiếng Việt cho tới khi có i18n.

## 5. Phong cách code

- ES module, mặc định `const`, chỉ dùng `let` khi gán lại, không bao giờ dùng `var`.
- Dùng async/await; không để promise bị bỏ rơi. Lời gọi chạy nền phải kết thúc bằng `.catch(...)` có ghi log.
- Ưu tiên rõ ràng hơn khéo léo: mỗi dòng một câu lệnh, toán tử ba ngôi lồng nhau không quá một cấp, không viết một dòng dày đặc che mất luồng xử lý.
- Đặt tên: `camelCase` cho hàm và biến, `UPPER_SNAKE_CASE` cho hằng của module, `kebab-case` cho tên file.
- Thụt lề 2 dấu cách, nháy đơn, có dấu chấm phẩy, dấu phẩy cuối trong literal nhiều dòng.

## 6. Test

- Chỉ dùng `node:test` và `node:assert/strict`.
- Mỗi lần sửa lỗi phải có một test fail trước khi sửa. Mỗi hàm thuần mới phải có test.
- Test không được đụng tới thư mục home thật, `~/.termi`, tmux, git remote hay mạng. Dùng thư mục tạm và phụ thuộc được truyền vào.
- Chạy `npm test` và phải qua hết trước khi báo xong việc.

## 7. Đặt tên tài liệu

- Mọi tài liệu trong `docs/` và `plan/` đặt tên theo dạng `<TIỀN_TỐ>-v<MAJOR>.<MINOR>-<slug-kebab>.md`, ví dụ `PLAN-v1.0-architecture-refactor.md`.
- Bản dịch tiếng Việt dùng cùng tên với đuôi `.vi.md`: `PLAN-v1.0-architecture-refactor.vi.md`.
- Tiền tố:

  | Tiền tố | Thư mục | Dùng cho |
  |---|---|---|
  | `PLAN` | `plan/` | Kế hoạch thực hiện, lộ trình |
  | `ARCH` | `docs/` | Kiến trúc và thiết kế module |
  | `ADR` | `docs/` | Một quyết định kiến trúc |
  | `SPEC` | `docs/` | Đặc tả API hoặc hành vi |
  | `GUIDE` | `docs/` | Hướng dẫn cho người dùng hoặc lập trình viên |
  | `NOTES` | `docs/` | Ghi chú cài đặt, cách lách lỗi, đặc thù nền tảng |
  | `REVIEW` | `docs/` | Rà soát code hoặc kiến trúc |

- Version là số phiên bản của chính tài liệu. Tăng `MINOR` khi bổ sung hoặc sửa, tăng `MAJOR` khi viết lại hoặc đổi hướng. Đổi tên bằng `git mv` để giữ lịch sử, và cập nhật mọi liên kết tới file.
- Mỗi tài liệu mở đầu bằng: tiêu đề, version, trạng thái (`Draft`, `Active`, `Done`, `Superseded`), ngày cập nhật (`YYYY-MM-DD`).
- Ảnh và tài nguyên khác để trong `docs/assets/`, không áp dụng quy tắc đặt tên.
- File ở thư mục gốc mà công cụ tìm theo tên thì giữ tên chuẩn: `README.md`, `CHANGELOG.md`, `AGENTS.md`, `CLAUDE.md`, cùng bản dịch `.vi.md` của chúng.

## 8. Ngôn ngữ

| Thành phần | Ngôn ngữ |
|---|---|
| Tên định danh trong code, log | Tiếng Anh |
| Commit message | Tiếng Anh |
| Release và tag trên GitHub | Tiếng Anh |
| `CHANGELOG.md` | Tiếng Anh, kèm `CHANGELOG.vi.md` tiếng Việt |
| `README.md` | Tiếng Anh, kèm `README.vi.md` tiếng Việt |
| `AGENTS.md` | Tiếng Anh, kèm `AGENTS.vi.md` tiếng Việt |
| Tài liệu và kế hoạch | Tiếng Anh; bản dịch `.vi.md` không bắt buộc |
| Chữ trên giao diện | Tiếng Việt |

Khi sửa tài liệu có bản dịch, cập nhật cả hai file trong cùng một commit.

## 9. Commit

- Định dạng: [Conventional Commits](https://www.conventionalcommits.org), viết bằng tiếng Anh.

  ```
  <type>(<scope>): <tóm tắt dạng mệnh lệnh, ≤ 72 ký tự, không chấm cuối>

  <thân: thay đổi gì và vì sao, xuống dòng ở 72 ký tự>
  ```

- Type: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`.
- Scope: `server`, `agents`, `tmux`, `git`, `push`, `http`, `ui`, `terminal`, `scripts`, `docs`, `release`.
- Mỗi commit một thay đổi logic. Không trộn refactor với thay đổi hành vi.
- Mọi thay đổi người dùng thấy được phải thêm một dòng dưới `## [Unreleased]` ở cả `CHANGELOG.md` và `CHANGELOG.vi.md` trong cùng commit.
- Agent chỉ commit khi được yêu cầu.

## 10. Phát hành

- Đánh số theo [SemVer](https://semver.org). Tag dạng `vX.Y.Z`.
- Các bước phát hành:
  1. Chuyển các mục `Unreleased` ở cả hai changelog xuống dưới `## [X.Y.Z] - YYYY-MM-DD`.
  2. Tăng `version` trong `package.json`.
  3. Commit `chore(release): vX.Y.Z`.
  4. Tạo tag `vX.Y.Z` và GitHub release tên `vX.Y.Z`, nội dung là phần changelog tiếng Anh.
  5. Chạy `npm run release:asset` để đính kèm `termi-X.Y.Z.tgz`.
- Nội dung release viết bằng tiếng Anh.

## 11. Thế nào là xong

- `npm test` qua hết.
- Không thêm comment, không file, hàm hay dòng nào vượt giới hạn kích thước.
- Changelog, README và tài liệu (cả hai ngôn ngữ nếu có bản dịch) đã phản ánh thay đổi.
- Các lớp bảo vệ ở mục 4 còn nguyên.
