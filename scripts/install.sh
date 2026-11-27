#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LA="$HOME/Library/LaunchAgents"
PREV_ROOTS=$(plutil -extract EnvironmentVariables.TERMI_ROOTS raw "$LA/vn.termi.server.plist" 2>/dev/null || true)
ROOTS="${TERMI_ROOTS:-${PREV_ROOTS:-$HOME}}"
PATHS="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"
TS=/opt/homebrew/bin/tailscale
xml() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' <<<"$1"; }

if [[ "${1:-}" == uninstall ]]; then
  for n in server ttyd vscode vscode-proxy; do
    launchctl bootout "gui/$UID/vn.termi.$n" 2>/dev/null || true
    rm -f "$LA/vn.termi.$n.plist"
  done
  $TS serve --https=443 off 2>/dev/null || true
  $TS serve --https=8443 off 2>/dev/null || true
  $TS serve --https=9443 off 2>/dev/null || true
  echo "Đã gỡ termi (các phiên tmux vẫn giữ nguyên)."; exit 0
fi

plist() {
  local name=$1; shift
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" '\
'"http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
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
    echo '<key>AbandonProcessGroup</key><true/>'
    echo '<key>SoftResourceLimits</key><dict><key>NumberOfFiles</key><integer>8192</integer></dict>'
    echo '<key>HardResourceLimits</key><dict><key>NumberOfFiles</key><integer>8192</integer></dict>'
    echo '<key>ThrottleInterval</key><integer>10</integer>'
    echo "<key>StandardOutPath</key><string>$(xml "$HOME/Library/Logs/termi.$name.log")</string>"
    echo "<key>StandardErrorPath</key><string>$(xml "$HOME/Library/Logs/termi.$name.log")</string>"
    echo '</dict></plist>'
  } > "$LA/vn.termi.$name.plist"
  plutil -lint -s "$LA/vn.termi.$name.plist"
  launchctl bootout "gui/$UID/vn.termi.$name" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    launchctl print "gui/$UID/vn.termi.$name" &>/dev/null || break
    sleep 0.5
  done
  launchctl bootstrap "gui/$UID" "$LA/vn.termi.$name.plist"
}

mkdir -p "$LA"
chmod +x "$ROOT/scripts/attach.sh"
plist server /opt/homebrew/bin/node "$ROOT/src/server.mjs"
plist ttyd /opt/homebrew/bin/ttyd -i lo0 -p 7681 -b /term -W -a -O -P 20 \
  -t fontSize=14 -t 'fontFamily=Menlo,Consolas,Droid Sans Mono,monospace' -t disableLeaveAlert=true \
  -t 'theme={"background":"#16181d"}' \
  "$ROOT/scripts/attach.sh"

$TS serve --bg --https=443 http://127.0.0.1:7680
$TS serve --https=8443 off >/dev/null 2>&1 || true
DNS_NAME='import json,sys;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))'
HOST=$($TS status --json | /usr/bin/python3 -c "$DNS_NAME")
echo "Xong. Mở trên điện thoại (đã bật Tailscale): https://$HOST"
