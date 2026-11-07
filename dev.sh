#!/usr/bin/env bash
# ./dev.sh          launch the stable build (installs it first if missing)
# ./dev.sh install  rebuild and replace the stable build
set -euo pipefail

cd "$(dirname "$0")"
dest="$HOME/.local/opt/zephyr"
log() { echo "==> $*"; }

install() {
  if pgrep -f "$dest/zephyr" >/dev/null; then
    echo "Stable zephyr is running, close it first." >&2
    exit 1
  fi
  log "Running tests"
  npx vitest run
  log "Packaging app"
  npm run package
  log "Removing old build at $dest"
  rm -rf "$dest"
  mkdir -p "$(dirname "$dest")"
  log "Copying build to $dest"
  cp -r out/zephyr-linux-x64 "$dest"
  log "Installed"
}

case "${1:-}" in
  install) install ;;
  "")
    if [ ! -x "$dest/zephyr" ]; then
      log "No stable build found, installing"
      install
    fi
    log "Launching $dest/zephyr"
    setsid "$dest/zephyr" >/dev/null 2>&1 &
    ;;
  *) echo "usage: ./dev.sh [install]" >&2; exit 1 ;;
esac
