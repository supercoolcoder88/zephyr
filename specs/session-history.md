# Spec: thread history from Claude sessions

## Goal

The sidebar lists every Claude session for the open project, including ones started from the `claude` CLI. Selecting one shows its full chat, and a thread can be deleted from the sidebar. Session transcripts written by the Agent SDK (`~/.claude/projects/<project>/<sessionId>.jsonl`) are the only store. No SQLite, no zephyr-side copy of messages.

## SDK APIs (`@anthropic-ai/claude-agent-sdk`, main process only)

- `listSessions({ dir: cwd })` → `SDKSessionInfo[]` (`sessionId`, `summary`, `customTitle`, `firstPrompt`, `lastModified`, `createdAt`, …)
- `getSessionMessages(sessionId, { dir: cwd })` → `SessionMessage[]` (`type: 'user' | 'assistant' | 'system'`, `message: unknown`, `parent_tool_use_id`)
- `deleteSession(sessionId, { dir: cwd })` removes `{sessionId}.jsonl` and its `{sessionId}/` subagent directory. It throws if the session isn't found. If removing the subdirectory fails, it throws after the transcript is already gone.

Load them through the existing lazy `loadSdk()` in `src/agent.ts`.

## Feature A: list and load threads

1. **IPC** (`src/agent.ts`, `src/preload.ts`, `src/agent-types.ts`): add `listThreads(cwd)` and `loadThread(sessionId, cwd)` to `AgentApi`.
   1. `listThreads` maps sessions to `{ id: sessionId, title, updatedAt }`, sorted newest first. Title is `customTitle ?? summary ?? firstPrompt`, trimmed to 48 chars.
   2. `loadThread` returns `ThreadItem[]`.
2. **Parsing** (in `src/agent.ts`, next to `forward`): convert `SessionMessage[]` to `ThreadItem[]` using the same mapping `forward` uses for live events.
   1. Assistant `text` block → `{ type: 'text' }`. `tool_use` block → `{ type: 'tool', name, input }`.
   2. User message whose content is a string or contains `text` blocks → `{ type: 'user', text }`.
   3. Skip user messages that only carry `tool_result` blocks, `system` messages, and anything with a non-null `parent_tool_use_id` (subagent traffic).
   4. `done` items can't be rebuilt from the transcript. Leave them out.
   5. Share the block mapping between `forward` and the parser if it's a straight reuse. Otherwise inline it.
3. **Thread model** (`src/thread.ts`):
   1. A thread's `id` is its `sessionId`.
   2. A new thread lives only in renderer memory with a temporary id until its first run emits the `session` event, then it's swapped to the real `sessionId`.
   3. Items are fetched on select, not kept for every thread.
4. **App** (`src/App.tsx`):
   1. On `openWorkspace`, call `listThreads(cwd)` and show the result.
   2. On select, call `loadThread` if the thread's items aren't loaded yet.
   3. After a run finishes, refresh the list so titles and order update.
   4. Keep the live event stream as it is for the run in progress.
5. **Sidebar**: no visual change beyond showing the loaded list. Follow `STYLES.md`.

## Feature B: delete a thread

6. **IPC**: add `deleteThread(sessionId, cwd)` to `AgentApi`, calling `deleteSession`.
   1. Treat a "not found" error as success, since the goal is for the session to be gone. This also covers a retry after a partial delete.
   2. Let any other error reject, so the renderer can show it.
7. **Sidebar UI** (`src/components/Sidebar.tsx`, follow `STYLES.md`):
   1. On row hover or keyboard focus, show `[ DEL ]` at the right edge in `text-mute`, turning `text-alert` on hover.
   2. Clicking it switches the control to `[ CONFIRM ]` in `text-alert`. A second click deletes. Moving off the row or pressing Escape cancels. Deletion is permanent, so there is no single-click delete.
   3. Hide the control on the thread that's currently running.
   4. A new thread that hasn't been sent yet has no session, so deleting it just removes it from renderer state without calling IPC.
8. **App**:
   1. On success, remove the thread from state.
   2. If it was the active thread, select the next thread in the list, or create an empty one if none are left.
   3. On failure, keep the row and show the error message in `text-alert` beneath the thread list until the next action.

## Out of scope

9. Pinning, unread state, rename UI, tagging zephyr sessions, bulk delete, undo, and watching the session directory for changes made by other processes.

## Done when

10. Opening a project that has prior CLI sessions lists them in the sidebar.
11. Selecting one renders its user/assistant/tool items.
12. Sending a prompt in it resumes that session.
13. Deleting a thread removes it from the sidebar and its `.jsonl` file is gone from `~/.claude/projects/<project>/`. After re-opening the project it stays gone.
14. `npm run typecheck` and `npm run lint` pass.
