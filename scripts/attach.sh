#!/bin/sh
name="${1:-main}"
case "$name" in *[!A-Za-z0-9_-]*) name=main ;; esac
[ ${#name} -le 40 ] || name=main
if ! tmux has-session -t "=$name" 2>/dev/null; then
  printf '\r\nPhiên "%s" không còn tồn tại.\r\n' "$name"
  exit 0
fi
exec tmux -u attach-session -t "=$name" \; set-option status off
