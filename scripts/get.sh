#!/bin/bash
# Cài hoặc nâng cấp termi từ bản phát hành trên GitHub, không cần clone code.
#
#   Repo công khai:          curl -fsSL https://raw.githubusercontent.com/hoangtu0812/termi/main/scripts/get.sh | bash
#   Repo riêng tư (dùng gh): gh api repos/hoangtu0812/termi/contents/scripts/get.sh -H 'Accept: application/vnd.github.raw' | bash
#
# Biến tuỳ chọn: TERMI_VERSION=v0.6.0 (mặc định bản mới nhất), TERMI_ROOTS=~/code:/Volumes/Data,
#                TERMI_NO_SERVICE=1 (chỉ tải và giải nén, không cài dịch vụ)
# Chạy lại để nâng cấp. Mã chạy nằm ở ~/.termi/app/<phiên bản>, ~/.termi/app/current trỏ tới bản đang dùng.
set -euo pipefail
REPO="${TERMI_REPO:-hoangtu0812/termi}"
WANT="${TERMI_VERSION:-latest}"
APP="$HOME/.termi/app"
say() { printf '\033[1m▸ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) OS=mac ;;
  Linux) OS=linux ;;
  *) die "Chỉ hỗ trợ macOS, Linux và Windows qua WSL2" ;;
esac

# 1. Công cụ cần có (Linux/WSL: install-linux.sh tự cài phần còn thiếu)
if [ "$OS" = mac ]; then
  command -v brew >/dev/null || die "Cần Homebrew: https://brew.sh"
  missing=()
  for c in tmux ttyd node; do command -v "$c" >/dev/null || missing+=("$c"); done
  if ((${#missing[@]})); then say "Cài ${missing[*]}…"; brew install "${missing[@]}"; fi
  node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' || die "Cần Node.js ≥ 24 (brew upgrade node)"
fi

# 2. Tìm bản phát hành và tải file cài. Repo riêng tư thì cần gh đã đăng nhập (gh auth login).
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  TAG=$( [ "$WANT" = latest ] && gh release view -R "$REPO" --json tagName -q .tagName || echo "$WANT" )
  say "Tải termi $TAG (qua gh)…"
  gh release download "$TAG" -R "$REPO" -p 'termi-*.tgz' -D "$TMP"
else
  API="https://api.github.com/repos/$REPO/releases/$( [ "$WANT" = latest ] && echo latest || echo "tags/$WANT" )"
  JSON=$(curl -fsSL "$API") || die "Không đọc được bản phát hành. Repo riêng tư: cài gh rồi chạy 'gh auth login'."
  TAG=$(printf '%s' "$JSON" | grep -o '"tag_name": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  URL=$(printf '%s' "$JSON" | grep -o '"browser_download_url": *"[^"]*termi-[^"]*\.tgz"' | head -1 | sed 's/.*"\(http[^"]*\)"$/\1/')
  [ -n "$URL" ] || die "Bản $TAG chưa có file cài termi-*.tgz"
  say "Tải termi $TAG…"
  curl -fsSL -o "$TMP/termi.tgz" "$URL"
fi
PKG=$(ls "$TMP"/*.tgz | head -1)
[ -s "$PKG" ] || die "Tải file cài thất bại"

# 3. Giải nén vào thư mục riêng của phiên bản rồi chuyển "current" sang (bản cũ vẫn còn để quay lại)
DEST="$APP/${TAG#v}"
mkdir -p "$DEST"
tar -xzf "$PKG" -C "$DEST" --strip-components=1 # npm pack đặt mọi thứ trong thư mục package/
chmod +x "$DEST"/scripts/*.sh
ln -sfn "$DEST" "$APP/current"
say "Đã giải nén vào $DEST"
# Giữ 2 bản gần nhất
ls -1dt "$APP"/*/ 2>/dev/null | grep -v '/current/$' | tail -n +3 | xargs -I{} rm -rf {} || true

# 4. Cài / khởi động lại dịch vụ, chạy từ đường dẫn "current" (nâng cấp sau chỉ cần đổi current)
if [ -n "${TERMI_NO_SERVICE:-}" ]; then say "Bỏ qua cài dịch vụ (TERMI_NO_SERVICE)"; exit 0; fi
if [ "$OS" = mac ]; then "$APP/current/scripts/install.sh"; else "$APP/current/scripts/install-linux.sh"; fi
say "Xong: termi $TAG"
