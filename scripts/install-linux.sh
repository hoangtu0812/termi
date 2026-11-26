#!/bin/bash
# Cài termi trên Linux hoặc WSL2 (Ubuntu/Debian) để điều khiển máy này từ termi trên máy khác
# cùng tài khoản Tailscale. Chạy lại an toàn. Gỡ: scripts/install-linux.sh uninstall
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TTYD_VERSION=1.7.7
UNIT_DIR="$HOME/.config/systemd/user"
TTYD="$HOME/.local/bin/ttyd"

is_wsl() { grep -qi microsoft /proc/version 2>/dev/null; }
# Linux dùng lệnh tailscale; WSL dùng tailscale.exe của Windows (WSL tự chuyển localhost sang Windows)
WIN_TS="/mnt/c/Program Files/Tailscale/tailscale.exe"
ts() {
  if command -v tailscale >/dev/null 2>&1; then tailscale "$@"
  elif is_wsl && [ -x "$WIN_TS" ]; then "$WIN_TS" "$@"
  else return 127; fi
}

if [[ "${1:-}" == uninstall ]]; then
  systemctl --user disable --now termi-server termi-ttyd 2>/dev/null || true
  rm -f "$UNIT_DIR/termi-server.service" "$UNIT_DIR/termi-ttyd.service"
  systemctl --user daemon-reload 2>/dev/null || true
  ts serve --https=443 off 2>/dev/null || true
  echo "Đã gỡ termi (các phiên tmux vẫn giữ nguyên)."
  exit 0
fi

# 1. systemd: dịch vụ tự chạy lại khi chết / khi khởi động
if ! systemctl --user show-environment >/dev/null 2>&1; then
  echo "Cần bật systemd. Trên WSL: thêm vào /etc/wsl.conf (sudo nano /etc/wsl.conf):"
  echo "  [boot]"
  echo "  systemd=true"
  echo "Rồi chạy 'wsl --shutdown' trong PowerShell, mở lại WSL và chạy lại script này."
  exit 1
fi

# 2. Gói hệ thống
missing=()
for c in tmux git curl; do command -v "$c" >/dev/null || missing+=("$c"); done
if ((${#missing[@]})); then sudo apt-get update && sudo apt-get install -y "${missing[@]}"; fi

# 3. Node.js >= 24
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' 2>/dev/null; then
  echo "Cài Node.js 24 (NodeSource)…"
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# 4. ttyd bản chính thức (bản apt thường quá cũ, thiếu tuỳ chọn termi cần)
if ! "$TTYD" --version 2>/dev/null | grep -q "$TTYD_VERSION"; then
  arch=$(uname -m)
  case "$arch" in x86_64|aarch64) ;; *) echo "Chưa hỗ trợ kiến trúc $arch"; exit 1 ;; esac
  mkdir -p "$HOME/.local/bin"
  curl -fsSL -o "$TTYD" "https://github.com/tsl0922/ttyd/releases/download/$TTYD_VERSION/ttyd.$arch"
  chmod +x "$TTYD"
fi

# 5. Dịch vụ systemd --user
NODE="$(command -v node)"
# Thư mục được phép truy cập: TERMI_ROOTS, hoặc giữ giá trị của lần cài trước (nâng cấp), hoặc ~
PREV_ROOTS=$(grep -o '"TERMI_ROOTS=[^"]*"' "$UNIT_DIR/termi-server.service" 2>/dev/null | sed 's/^"TERMI_ROOTS=//; s/"$//' || true)
ROOTS="${TERMI_ROOTS:-${PREV_ROOTS:-$HOME}}"
ENV_PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
# termi hỏi Tailscale xem chủ máy là ai (chỉ chủ máy được vào); trong WSL thì hỏi tailscale.exe của Windows
TS_BIN="tailscale"
if ! command -v tailscale >/dev/null 2>&1 && is_wsl && [ -x "$WIN_TS" ]; then TS_BIN="$WIN_TS"; fi
chmod +x "$ROOT/scripts/attach.sh"
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/termi-server.service" <<EOF
[Unit]
Description=termi server

[Service]
ExecStart="$NODE" "$ROOT/src/server.mjs"
Environment="PATH=$ENV_PATH" "TERMI_ROOTS=$ROOTS" "LANG=C.UTF-8" "SHELL=$SHELL" "TERMI_TAILSCALE=$TS_BIN"
WorkingDirectory=$HOME
Restart=always
RestartSec=3
# Khởi động lại dịch vụ không được giết tmux server (và các phiên) mà dịch vụ đã sinh ra
KillMode=process
LimitNOFILE=8192

[Install]
WantedBy=default.target
EOF
cat > "$UNIT_DIR/termi-ttyd.service" <<EOF
[Unit]
Description=termi ttyd

[Service]
ExecStart="$TTYD" -i lo -p 7681 -b /term -W -a -O -P 20 -t fontSize=14 -t "fontFamily=Menlo,Consolas,Droid Sans Mono,monospace" -t disableLeaveAlert=true -t 'theme={"background":"#16181d"}' "$ROOT/scripts/attach.sh"
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
loginctl enable-linger "$USER" 2>/dev/null || true # chạy cả khi chưa đăng nhập

# 6. Mở ra tailnet
if ts serve --bg --https=443 http://127.0.0.1:7680; then
  HOST=$(ts status --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))')
  echo "Xong. Máy này: https://$HOST"
  echo "Trên termi của máy khác, chọn máy này ở ô chọn máy đầu sidebar."
else
  echo "Không tìm thấy Tailscale. Cài Tailscale (trên Windows nếu đang dùng WSL) rồi chạy lại script này."
  exit 1
fi
