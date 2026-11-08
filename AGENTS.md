zephyr is an early-stage agent orchestration tool currently only supporting claude code via Claude Agent SDK and Claude subscription.

# Glossary

- **Thread**: a Claude session in a workspace, shown as one chat in the sidebar.
- **Subthread**: a subagent spawned inside a thread, listed under the turn that started it and opened in a popup.

# Programming guide

- Reduce the number of comments made
- Keep abstraction thin, don't plan for future abstractions. If another agent is working on a piece of code and you find yourself butting heads with it, it may mean an extraction or abstraction is required.
- Do not create functions over and over, only create them if the code is repeatedly used otherwise inline
- If another agent is working the same file and changes will conflict, start a separate worktree and merge then remove once done

# Styling

Before changing any UI, styling, or components, read `STYLES.md` and follow it. You don't need it for non-UI work.

Components that you create should be intentional and practical. Bad designs include the following:

- Using unnecessary subheadings under major titles that provide commentary about the title
- Random pills and excessive labels scattered across the screen
