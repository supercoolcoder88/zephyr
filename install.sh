#!/usr/bin/env bash
# Builds zephyr from this clone and installs the `zephyr` command. Rerun to update.
set -euo pipefail

cd "$(dirname "$0")"
dest="$HOME/.local/opt/zephyr"
bin="$HOME/.local/bin"
log() { echo "==> $*"; }

command -v npm >/dev/null || { echo "Node.js is required" >&2; exit 1; }
if pgrep -f "$dest/zephyr" >/dev/null; then
  echo "zephyr is running, close it first." >&2
  exit 1
fi

log "Installing dependencies"
npm install
log "Packaging app"
npm run package
log "Copying build to $dest"
mkdir -p "$(dirname "$dest")" "$bin"
# Copy beside the old build first so a failed copy leaves it runnable.
rm -rf "$dest.new"
cp -r out/zephyr-linux-x64 "$dest.new"
rm -rf "$dest"
mv "$dest.new" "$dest"
commit=$(git rev-parse HEAD)

cat > "$bin/zephyr" <<LAUNCHER
#!/usr/bin/env bash
if [ "\${1:-}" = update ]; then
  cd "$PWD" && git pull --ff-only && exec ./install.sh
elif [ -n "\${1:-}" ]; then
  [ -d "\$1" ] || { echo "zephyr: \$1 is not a directory" >&2; exit 1; }
  set -- "\$(realpath "\$1")"
fi
ZEPHYR_SOURCE="$PWD" ZEPHYR_COMMIT="$commit" setsid "$dest/zephyr" "\$@" >/dev/null 2>&1 &
LAUNCHER
chmod +x "$bin/zephyr"

case ":$PATH:" in
  *":$bin:"*) ;;
  *)
    rc="$HOME/.bashrc"
    [[ "${SHELL:-}" == */zsh ]] && rc="$HOME/.zshrc"
    line='export PATH="$HOME/.local/bin:$PATH"'
    grep -qxF "$line" "$rc" 2>/dev/null || echo "$line" >>"$rc"
    log "Added ~/.local/bin to PATH in $rc, open a new terminal"
    ;;
esac

log "Installed. Run 'zephyr', 'zephyr .' or 'zephyr update'"
