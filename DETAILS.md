# Agent sessions and permissions

## One process per thread

- Your first message in a thread starts a Claude process. Later messages go into that same process.
- You can send while the agent is working. The message reaches it straight away.
- STOP ends the current turn but keeps the process, so your next message continues in it.
- A thread counts as finished when Claude Code says it is idle.

## Asking before tool calls

- By default (ASK), the agent waits for your answer before a tool call that needs approval.
- A card with ALLOW / DENY shows at the bottom of the chat.
- While a card is waiting, the thread shows WAITING and its sidebar dot changes colour.
- STOP, or the process closing, denies any request still waiting.
- The gear button in the sidebar footer switches between ASK and AUTO (allow everything). The change also applies to threads that are already running.

## Keeping memory down

- A process closes after 10 minutes idle.
- Switching projects closes the idle processes of the project you left.
- At most 4 processes stay alive. Starting a 5th closes the one unused for longest.
- A process that is working or waiting on you is never closed.
- After a process closes, the thread's next message starts a new one that picks up the same conversation.
