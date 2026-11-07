#!/usr/bin/env bash
# PreToolUse(Bash): refuse to launch a second zephyr instance when one is already running.
cmd=$(jq -r '.tool_input.command // empty')
grep -qE '(npm (run )?start|electron-forge start|electron \.)' <<<"$cmd" || exit 0

dir=${CLAUDE_PROJECT_DIR:-$(pwd)}
pid=$(pgrep -f "$dir/node_modules/electron/dist/electron \.$" | head -1)
[ -z "$pid" ] && exit 0

port=$(ss -ltnpH 2>/dev/null | grep -F "$(pgrep -f "$dir/node_modules/@electron-forge/cli/dist/electron-forge-start.js" | head -1)" | grep -oE ':[0-9]+ ' | head -1 | tr -d ': ')
reason="zephyr is already running (electron pid $pid${port:+, Vite dev server on http://localhost:$port}). Do not start another instance. Renderer changes (src/components, App.tsx, index.css) hot-reload into the running window; main/preload changes need the user to restart it, so ask them to. Use the existing window to check your change, or ask the user to look at it."

jq -n --arg r "$reason" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
