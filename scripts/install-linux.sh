#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TTYD_VERSION=1.7.7
UNIT_DIR="$HOME/.config/systemd/user"
TTYD="$HOME/.local/bin/ttyd"
is_wsl() { grep -qi microsoft /proc/version 2>/dev/null; }
if is_wsl; then
  PORT="${TERMI_PORT:-7690}"
  TPORT="${TERMI_TTYD_PORT:-7691}"
else
  PORT="${TERMI_PORT:-7680}"
  TPORT="${TERMI_TTYD_PORT:-7681}"
fi

WIN_TS="/mnt/c/Program Files/Tailscale/tailscale.exe"
ts() {
  if command -v tailscale >/dev/null 2>&1; then tailscale "$@"
  elif is_wsl && [ -x "$WIN_TS" ]; then "$WIN_TS" "$@"
  else return 127; fi
}

KEEPALIVE_VBS=termi-wsl.vbs
WSCRIPT=/mnt/c/Windows/System32/wscript.exe

windows_startup_dir() {
  local appdata
  appdata=$(cd /mnt/c && cmd.exe /c 'echo %APPDATA%' 2>/dev/null | tr -d '\r')
  [ -n "$appdata" ] || return 1
  printf '%s/Microsoft/Windows/Start Menu/Programs/Startup' "$(wslpath "$appdata")"
}

wsl_keepalive() {
  is_wsl || return 0
  local startup distro="${WSL_DISTRO_NAME:-Ubuntu}"
  startup=$(windows_startup_dir) || startup=''
  if [ ! -d "$startup" ]; then
    echo "Không tìm thấy thư mục Startup của Windows, bỏ qua bước giữ WSL luôn chạy."
    return 0
  fi
  printf 'CreateObject("WScript.Shell").Run "wsl.exe -d %s --exec sleep infinity", 0, False\r\n' "$distro" \
    > "$startup/$KEEPALIVE_VBS"
  if ! pgrep -fx 'sleep infinity' >/dev/null && [ -x "$WSCRIPT" ]; then
    "$WSCRIPT" "$(wslpath -w "$startup/$KEEPALIVE_VBS")" >/dev/null 2>&1 || true
  fi
  echo "WSL sẽ luôn chạy khi Windows đăng nhập ($KEEPALIVE_VBS trong Startup)."
}

remove_wsl_keepalive() {
  is_wsl || return 0
  local startup
  startup=$(windows_startup_dir) && rm -f "$startup/$KEEPALIVE_VBS"
  pkill -fx 'sleep infinity' 2>/dev/null || true
}

if [[ "${1:-}" == uninstall ]]; then
  remove_wsl_keepalive
  systemctl --user disable --now termi-server termi-ttyd 2>/dev/null || true
  rm -f "$UNIT_DIR/termi-server.service" "$UNIT_DIR/termi-ttyd.service"
  systemctl --user daemon-reload 2>/dev/null || true
  ts serve --https=443 off 2>/dev/null || true
  echo "Đã gỡ termi (các phiên tmux vẫn giữ nguyên)."
  exit 0
fi

if ! systemctl --user show-environment >/dev/null 2>&1; then
  echo "Cần bật systemd. Trên WSL: thêm vào /etc/wsl.conf (sudo nano /etc/wsl.conf):"
  echo "  [boot]"
  echo "  systemd=true"
  echo "Rồi chạy 'wsl --shutdown' trong PowerShell, mở lại WSL và chạy lại script này."
  exit 1
fi

missing=()
for c in tmux git curl; do command -v "$c" >/dev/null || missing+=("$c"); done
if ((${#missing[@]})); then sudo apt-get update && sudo apt-get install -y "${missing[@]}"; fi

if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' 2>/dev/null; then
  echo "Cài Node.js 24 (NodeSource)…"
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! "$TTYD" --version 2>/dev/null | grep -q "$TTYD_VERSION"; then
  arch=$(uname -m)
  case "$arch" in x86_64|aarch64) ;; *) echo "Chưa hỗ trợ kiến trúc $arch"; exit 1 ;; esac
  mkdir -p "$HOME/.local/bin"
  curl -fsSL -o "$TTYD" "https://github.com/tsl0922/ttyd/releases/download/$TTYD_VERSION/ttyd.$arch"
  chmod +x "$TTYD"
fi

NODE="$(command -v node)"
PREV_ROOTS=$(grep -o '"TERMI_ROOTS=[^"]*"' "$UNIT_DIR/termi-server.service" 2>/dev/null \
  | sed 's/^"TERMI_ROOTS=//; s/"$//' || true)
ROOTS="${TERMI_ROOTS:-${PREV_ROOTS:-$HOME}}"
ENV_PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
TS_BIN="tailscale"
if ! command -v tailscale >/dev/null 2>&1 && is_wsl && [ -x "$WIN_TS" ]; then TS_BIN="$WIN_TS"; fi
chmod +x "$ROOT/scripts/attach.sh"
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/termi-server.service" <<EOF
[Unit]
Description=termi server

[Service]
ExecStart="$NODE" "$ROOT/src/server.mjs"
Environment="PATH=$ENV_PATH" "TERMI_ROOTS=$ROOTS" "LANG=C.UTF-8" "SHELL=$SHELL" \
"TERMI_TAILSCALE=$TS_BIN" "TERMI_PORT=$PORT" "TERMI_TTYD_PORT=$TPORT"
WorkingDirectory=$HOME
Restart=always
RestartSec=3
KillMode=process
LimitNOFILE=8192

[Install]
WantedBy=default.target
EOF
cat > "$UNIT_DIR/termi-ttyd.service" <<EOF
[Unit]
Description=termi ttyd

[Service]
ExecStart="$TTYD" -i 127.0.0.1 -p $TPORT -b /term -W -a -O -P 20 -t fontSize=14 \
-t "fontFamily=Menlo,Consolas,Droid Sans Mono,monospace" -t disableLeaveAlert=true \
-t 'theme={"background":"#16181d"}' "$ROOT/scripts/attach.sh"
Environment="PATH=$ENV_PATH" "LANG=C.UTF-8" "SHELL=$SHELL"
WorkingDirectory=$HOME
Restart=always
RestartSec=3
KillMode=process
LimitNOFILE=8192

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now termi-server termi-ttyd
systemctl --user restart termi-server termi-ttyd
loginctl enable-linger "$USER" 2>/dev/null || true
wsl_keepalive

if ts serve --bg --https=443 http://127.0.0.1:$PORT; then
  DNS_NAME='let s="";process.stdin.on("data",d=>s+=d)'
  DNS_NAME+='.on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))'
  HOST=$(ts status --json | node -e "$DNS_NAME")
  echo "Xong. Máy này: https://$HOST"
  echo "Trên termi của máy khác, chọn máy này ở ô chọn máy đầu sidebar."
else
  echo "Không tìm thấy Tailscale. Cài Tailscale (trên Windows nếu đang dùng WSL) rồi chạy lại script này."
  exit 1
fi
