#!/bin/bash
# Cài termi thành dịch vụ launchd (tự chạy khi đăng nhập, tự khởi động lại khi chết)
# và mở ra tailnet qua `tailscale serve` (chỉ máy trong tailnet của bạn truy cập được).
# Chạy lại an toàn. Gỡ: ./install.sh uninstall
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
LA="$HOME/Library/LaunchAgents"
ROOTS="${TERMI_ROOTS:-$HOME:/Volumes/ST1000LM 03}"
PATHS="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"
TS=/opt/homebrew/bin/tailscale
xml() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' <<<"$1"; }

if [[ "${1:-}" == uninstall ]]; then
  for n in server ttyd; do launchctl bootout "gui/$UID/vn.termi.$n" 2>/dev/null || true; rm -f "$LA/vn.termi.$n.plist"; done
  $TS serve --https=443 off 2>/dev/null || true
  $TS serve --https=8443 off 2>/dev/null || true
  echo "Đã gỡ termi (các phiên tmux vẫn giữ nguyên)."; exit 0
fi

# plist <tên> <arg...>
plist() {
  local name=$1; shift
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo "<key>Label</key><string>vn.termi.$name</string>"
    echo '<key>ProgramArguments</key><array>'
    for a in "$@"; do echo "<string>$(xml "$a")</string>"; done
    echo '</array>'
    echo '<key>EnvironmentVariables</key><dict>'
    echo "<key>PATH</key><string>$(xml "$PATHS")</string>"
    echo '<key>LANG</key><string>en_US.UTF-8</string>'
    echo "<key>SHELL</key><string>$SHELL</string>"
    echo "<key>TERMI_ROOTS</key><string>$(xml "$ROOTS")</string>"
    echo '</dict>'
    echo "<key>WorkingDirectory</key><string>$(xml "$HOME")</string>"
    echo '<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>'
    # Khi dịch vụ khởi động lại, launchd không được giết tmux server mà dịch vụ đã sinh ra
    echo '<key>AbandonProcessGroup</key><true/>'
    echo '<key>ThrottleInterval</key><integer>10</integer>'
    echo "<key>StandardOutPath</key><string>$(xml "$HOME/Library/Logs/termi.$name.log")</string>"
    echo "<key>StandardErrorPath</key><string>$(xml "$HOME/Library/Logs/termi.$name.log")</string>"
    echo '</dict></plist>'
  } > "$LA/vn.termi.$name.plist"
  plutil -lint -s "$LA/vn.termi.$name.plist"
  launchctl bootout "gui/$UID/vn.termi.$name" 2>/dev/null || true
  # bootout chạy bất đồng bộ: chờ dịch vụ cũ dừng hẳn, không thì bootstrap báo lỗi 5
  for _ in 1 2 3 4 5 6 7 8 9 10; do launchctl print "gui/$UID/vn.termi.$name" &>/dev/null || break; sleep 0.5; done
  launchctl bootstrap "gui/$UID" "$LA/vn.termi.$name.plist"
}

mkdir -p "$LA"
chmod +x "$DIR/attach.sh"
plist server /opt/homebrew/bin/node "$DIR/server.mjs"
plist ttyd /opt/homebrew/bin/ttyd -i lo0 -p 7681 -W -a -O -P 20 \
  -t fontSize=14 -t 'fontFamily=Menlo,Consolas,Droid Sans Mono,monospace' -t disableLeaveAlert=true -t 'theme={"background":"#16181d"}' \
  "$DIR/attach.sh"

# Lần đầu tailscale sẽ in link để bật Serve/HTTPS cho tailnet và chờ: mở link đó rồi lệnh tự chạy tiếp
$TS serve --bg --https=443 http://127.0.0.1:7680
$TS serve --bg --https=8443 http://127.0.0.1:7681
HOST=$($TS status --json | /usr/bin/python3 -c 'import json,sys;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')
echo "Xong. Mở trên điện thoại (đã bật Tailscale): https://$HOST"
