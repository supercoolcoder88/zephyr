zephyr is an early-stage agent orchestration tool currently only supporting claude code via Claude Agent SDK and Claude subscription.

# Coding rules

- Do not make architecture or customer facing decisions on your own, always ask the user.
- Your goal should be to write the least number of lines of code as required without sacrificing readability and efficiency.
- Keep abstractions thin. Simple examples include: do not reach for interfaces or classes too early, prefer in-line functions if functions are used less than a few times and wide reaching code is bad.
- Avoid multi-line comments. Comments should be sparingly used only to let the reader understand important breakpoints in the code.
- Use Behaviour driven tests.
- Sparingly use unit tests for strict edge cases or when end-to-end tests will be costly. Ultimately, prefer end-to-end tests when testing consumer facing functions and behaviours.

# Glossary

- **Thread**: a Claude session in a workspace, shown as one chat in the sidebar.
- **Subthread**: a subagent spawned inside a thread, listed under the turn that started it and opened in a popup.

# Styling

Before changing any UI, styling, or components, read `STYLES.md` and follow it. You don't need it for non-UI work.

Components that you create should be intentional and practical. Bad designs include the following:

- Using unnecessary subheadings under major titles that provide commentary about the title
- Random pills and excessive labels scattered across the screen
