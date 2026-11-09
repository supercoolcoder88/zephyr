---
name: ui-review
description: Launch a throwaway headless zephyr instance and screenshot it to review UI changes. Use after changing anything under src/components, App.tsx or index.css, or when asked to check, review or screenshot the UI.
---

# UI review

`scripts/ui.mjs` runs the dev build headless (no window, no Xvfb) with a temp profile, a temp git workspace and a temp `CLAUDE_CONFIG_DIR`. It cannot touch the user's settings, threads or `~/.claude` history, and it runs alongside their own dev instance. All state lives in `/tmp/zephyr-ui`.

```bash
node scripts/ui.mjs start [1280x800]      # waits until the app has rendered
node scripts/ui.mjs click "text=OPEN PROJECT"   # opens the temp workspace, no dialog
node scripts/ui.mjs shot [file.png]       # prints the PNG path, then Read it
node scripts/ui.mjs click <css | text=...>
node scripts/ui.mjs hover <css | text=...>
node scripts/ui.mjs type "some text"      # into the focused element
node scripts/ui.mjs key Enter             # Enter Escape Tab Backspace ArrowUp ArrowDown
node scripts/ui.mjs eval "<js>"           # runs in the renderer, prints the JSON result
node scripts/ui.mjs stop                  # kills the app and deletes /tmp/zephyr-ui
```

## Workflow

1. `start`, then `click "text=OPEN PROJECT"` to get past the home screen.
2. Get the UI into the state your change affects, then `shot` and Read the PNG. Check it against `STYLES.md`.
3. Renderer edits hot-reload into the running instance, so just shoot again. Changes to `main.ts`, `agent.ts`, `backlog.ts` or `preload.ts` need `stop` then `start`.
4. Always `stop` when done, including after failures.

## Notes

- `text=` matches the innermost visible element containing that text, so `text=SEND` clicks the send button.
- Sending a prompt runs a real Claude session on the user's subscription. Keep prompts tiny (e.g. "Reply with just the word pong.") and only send them when the change involves chat output. Poll with `eval "document.body.innerText.includes('...')"` before shooting.
- Prefer `eval` over screenshots for factual checks (text present, element count, computed styles). Use screenshots for layout and visual review.
- The app renders the shared working tree, so another agent's unfinished edits can show up. If `git status` lists changes that aren't yours, wait until they're done before reviewing.
- If `start` fails, read `/tmp/zephyr-ui/app.log`, then run `stop` before retrying.
