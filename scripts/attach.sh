#!/bin/sh
# ttyd -a nối ?arg=<tên> vào đây. Tên lạ → dùng "main".
name="${1:-main}"
case "$name" in *[!A-Za-z0-9_-]*) name=main ;; esac
[ ${#name} -le 40 ] || name=main
# tmux lấy từ PATH của dịch vụ (launchd trên Mac, systemd trên Linux/WSL)
# Tắt thanh trạng thái của tmux: header của termi đã hiện tên phiên và trạng thái
exec tmux -u new -A -s "$name" \; set-option status off
