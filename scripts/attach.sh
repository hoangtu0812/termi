#!/bin/sh
# ttyd -a nối ?arg=<tên> vào đây. Tên lạ → dùng "main".
name="${1:-main}"
case "$name" in *[!A-Za-z0-9_-]*) name=main ;; esac
[ ${#name} -le 40 ] || name=main
# tmux lấy từ PATH của dịch vụ (launchd trên Mac, systemd trên Linux/WSL)
exec tmux -u new -A -s "$name"
