#!/bin/sh
# ttyd -a nối ?arg=<tên> vào đây. Tên lạ → dùng "main".
name="${1:-main}"
case "$name" in *[!A-Za-z0-9_-]*) name=main ;; esac
[ ${#name} -le 40 ] || name=main
# tmux lấy từ PATH của dịch vụ (launchd trên Mac, systemd trên Linux/WSL)
# Chỉ gắn vào phiên có sẵn (termi tạo phiên qua API). Không tạo mới, vì đường dẫn cũ của một phiên
# đã đóng sẽ hồi sinh nó, nhất là khi app tự kết nối lại.
if ! tmux has-session -t "=$name" 2>/dev/null; then
  printf '\r\nPhiên "%s" không còn tồn tại.\r\n' "$name"
  exit 0
fi
# Tắt thanh trạng thái của tmux: header của termi đã hiện tên phiên và trạng thái
exec tmux -u attach-session -t "=$name" \; set-option status off
