#!/bin/bash
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

if [ "$OS" = mac ]; then
  command -v brew >/dev/null || die "Cần Homebrew: https://brew.sh"
  missing=()
  for c in tmux ttyd node; do command -v "$c" >/dev/null || missing+=("$c"); done
  if ((${#missing[@]})); then say "Cài ${missing[*]}…"; brew install "${missing[@]}"; fi
  NODE_CHECK='process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'
  node -e "$NODE_CHECK" || die "Cần Node.js ≥ 24 (brew upgrade node)"
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  TAG=$( [ "$WANT" = latest ] && gh release view -R "$REPO" --json tagName -q .tagName || echo "$WANT" )
  say "Tải termi $TAG (qua gh)…"
  gh release download "$TAG" -R "$REPO" -p 'termi-*.tgz' -D "$TMP"
else
  API="https://api.github.com/repos/$REPO/releases/$( [ "$WANT" = latest ] && echo latest || echo "tags/$WANT" )"
  JSON=$(curl -fsSL "$API") \
    || die "Không đọc được bản phát hành. Repo riêng tư: cài gh rồi chạy 'gh auth login'."
  TAG=$(printf '%s' "$JSON" | grep -o '"tag_name": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  URL=$(printf '%s' "$JSON" | grep -o '"browser_download_url": *"[^"]*termi-[^"]*\.tgz"' \
    | head -1 | sed 's/.*"\(http[^"]*\)"$/\1/')
  [ -n "$URL" ] || die "Bản $TAG chưa có file cài termi-*.tgz"
  say "Tải termi $TAG…"
  curl -fsSL -o "$TMP/termi.tgz" "$URL"
fi
PKG=$(ls "$TMP"/*.tgz | head -1)
[ -s "$PKG" ] || die "Tải file cài thất bại"

DEST="$APP/${TAG#v}"
mkdir -p "$DEST"
tar -xzf "$PKG" -C "$DEST" --strip-components=1
chmod +x "$DEST"/scripts/*.sh
ln -sfn "$DEST" "$APP/current"
say "Đã giải nén vào $DEST"
ls -1dt "$APP"/*/ 2>/dev/null | grep -v '/current/$' | tail -n +3 | xargs -I{} rm -rf {} || true

if [ -n "${TERMI_NO_SERVICE:-}" ]; then say "Bỏ qua cài dịch vụ (TERMI_NO_SERVICE)"; exit 0; fi
if [ "$OS" = mac ]; then "$APP/current/scripts/install.sh"; else "$APP/current/scripts/install-linux.sh"; fi
say "Xong: termi $TAG"
