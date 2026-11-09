# Zephyr style guide

Read this before changing any UI or styling. Tokens live in `src/index.css`; use them through Tailwind classes (`bg-void`, `text-mute`, `border-line`, `text-cyan`) rather than raw hex values.

## Principle

Blocky, futuristic, black and white. Monochrome carries the whole interface. Neon cyan is reserved for **key moments**: the agent doing something right now. If cyan is visible while the app is idle, something is wrong.

## Palette

| Token         | Value       | Use                                              |
| ------------- | ----------- | ------------------------------------------------ |
| `void`        | `#100F14`   | App background                                   |
| `panel`       | `#17151D`   | Raised surfaces (sidebar, composer)              |
| `line`        | `#26232E`   | 1px hairlines, dividers, grid                    |
| `line-strong` | `#403C4A`   | Hover and active borders                         |
| `mute`        | `#77737F`   | Secondary text, indices, metadata                |
| `ink`         | `#EDEDED`   | Primary text                                     |
| `paper`       | `#E8ECF2`   | Inverted blocks, primary button                  |
| `cyan`        | `#00E5FF`   | Key moments only                                 |
| `cyan-deep`   | `#0066FF`   | Glow falloff behind cyan                         |
| `blue`        | `#61AFEF`   | Bold text in agent output only                   |
| `alert`       | `#FF2E4D`   | Errors and destructive actions, just as sparse   |
| `ok`          | `#00E676`   | Thread status dot: finished, unseen              |
| `warn`        | `#FF9100`   | Needs-attention dot; the user's question answers |
| `draft`       | `#FFD600`   | Thread status dot: unsent draft with text        |
| `unmerged`    | code-purple | Thread status dot: idle worktree not yet merged  |
| `command`     | code-purple | Valid slash command in the composer              |
| `file`        | code-green  | Existing file path in the composer               |
| `folder`      | code-yellow | Existing folder path in the composer             |

- Light (`<html data-theme="light">`) and cyber (`data-theme="cyber"`, dark navy with white text) modes redefine these tokens in `src/index.css`; components never branch on theme.
- `warn` also marks the user's own answers in an answered question box (chosen option labels and typed "Other" text).
- Otherwise thread and subthread status dots are the only place `ok`, `warn`, `draft` and `unmerged` appear: cyan running, `alert` error, `ok` done, `warn` needs attention, `draft` unsent draft with text, `unmerged` a seen worktree thread waiting to be merged, `mute` read.
- `command`, `file` and `folder` colour only the matching text in the composer, so the user can see a command or path resolved before sending.
- Emphasis is done by **inversion** (`bg-paper text-void`), not by adding colour.
- Never set long text in cyan. Cyan marks things like rules, outlines, cursors and short status words.
- No surface gradients. The only gradient allowed is the cyan glow falloff.

## Type

- **JetBrains Mono everywhere**: UI, body, headings. No second typeface.
- Sizes: 11 / 13 / 16 / 24 / 48 px (`text-2xs`, `text-sm`, `text-base`, `text-2xl`, `text-5xl`). Avoid in-between sizes.
- Small labels and controls: 11px, uppercase, `tracking-widest`.
- Headings: uppercase, wide tracking, regular-to-medium weight. Bold is rare.
- Big against small: 48px is for one uppercase statement or a key number per view (empty thread, settings section title, usage), always paired with 11px labels. Skip the sizes between them there.

## Shape and layout

- **Border radius is 0.** `--radius-*` is reset in the theme, so `rounded-*` does nothing. Don't work around it. The one exception is the orange update dot, which is `rounded-full`.
- Depth comes from 1px borders and inversion. No drop shadows except the cyan glow.
- Bracket small controls and indices: `[ SEND ]`, `[ + NEW ]`, `01`.
- Dense spacing on a 4px base. This is a tool, not a landing page.
- A chamfered corner (`.chamfer`) is allowed on at most one primary element per view.
- Icons come from `lucide-react` at 14px with a 1.5 stroke, `strokeLinecap="square"` and `strokeLinejoin="miter"`. Use one only where a glyph reads better than a bracketed label (panel toggle, drag grip).
- Drag and drop: a drop zone is a 1px `border-line-strong` box on `bg-panel` with a bracketed label, inverted while dragged over. A drop target over existing content (the chat) is a 1px `border-line-strong` frame inset by 8px with the same label centred; the frame turns `ink` and the label inverts while dragged over. An insertion point is a 1px `bg-ink` line, and the dragged source dims to `opacity-50`.

## Component architecture

Follows the shadcn/ui approach without the library: the app owns a small set of primitives in `src/components/ui/`, styled with Tailwind and driven by state, not by props that mirror state.

- **Own the primitive, keep it thin.** A primitive is a plain element wrapper that forwards every native prop and `ref`. Add one only when the same markup and classes repeat in three or more places; otherwise write the element inline.
- **Variants are maps, not branches.** Looks and sizes live in small `variants` / `sizes` objects joined into the class string. Add a key to the map rather than a new prop or a one-off class string. Callers may append `className` for layout (`ml-auto`, `w-full`, `chamfer`), not to restyle a variant.
- **Style from state attributes.** Put state on the element (`aria-expanded`, `aria-selected`, `aria-checked`, `aria-current`, `data-highlighted`) and style it with Tailwind variants (`aria-expanded:text-ink`, `not-aria-checked:text-mute`, `group-focus:text-void`). A ternary that picks classes from the same boolean the ARIA attribute already holds is a smell.
- **Accessibility is part of the component.** Use the correct role (`menu`/`menuitemradio`, `listbox`/`option`, `combobox`, `dialog`), arrow keys cycle items, Escape closes and returns focus to the trigger, dialogs take focus on open and restore focus on close (plain Tab is disabled app-wide). Every button sets `type`; icon-only buttons have `aria-label`.
- **One way to dismiss.** Overlays close through `useDismiss` (outside pointerdown and Escape), plus an `onBlur` check when tabbing out should close them.
- **Tokens only.** Colours, sizes and easing come from `src/index.css` tokens and the Tailwind scale. No hex values, no Tailwind palette colours, no arbitrary values (`h-[38px]`) when a scale step exists.

### Primitives

- **Button** (`ui/Button.tsx`) for every bracketed control. Variants: `ghost` (default, mute → ink, ink while `aria-expanded`), `primary` (inverted paper block), `destructive` (mute → alert), `outline-destructive` (alert outline, fills on hover). Sizes: `inline` (default, no box), `sm` h-6, `md` h-8, `lg` h-10, which matches a one-line input.
- **MenuItem** (`ui/MenuItem.tsx`) for menu rows: a `menuitemradio` with the `>` checked marker. Focus follows the pointer and the row inverts from `focus:` only, so exactly one row is highlighted.
- **useDismiss** (`ui/useDismiss.ts`): `useDismiss(ref, open, onClose)`.
- **Popover surface** (menus, listboxes, usage): `bg-panel`, `border-line` hairline, `py-1`; drop the edge that sits on an existing hairline (`border-b-0` above the composer or footer, only `border-t` when spanning the full width). Items are `px-3 py-1 text-sm`, highlighted by inversion (`bg-paper text-void`), checked `text-ink`, the rest `text-mute`.

## Key moments (the only places cyan appears)

| Moment           | Treatment                                                                |
| ---------------- | ------------------------------------------------------------------------ |
| Agent running    | Cyan block-character wave at the end of the transcript; status word cyan |
| Streaming output | Newest agent line gets a cyan left rule; it drops to `line` once stale   |
| Tool in flight   | Tool name in its one-line mute summary turns cyan until the run moves on |
| Run completes    | One `.flash` glow pulse (~400ms) on the finished turn, then monochrome   |
| Keyboard focus   | 1px cyan outline (`focus-visible` only)                                  |

Glow, for key moments only:

```css
box-shadow:
  0 0 0 1px var(--color-cyan),
  0 0 12px -2px var(--color-cyan-deep);
```

## Code blocks

Fenced code in agent output is highlighted by `rehype-highlight`, the one deliberate exception to monochrome. Each app theme has its own palette: dark uses One Dark, light uses Catppuccin Latte, cyber uses Tokyo Night. The `code-*` tokens are for code blocks only; inline code stays monochrome.

| Token          | Dark      | Light     | Cyber     | Use                                         |
| -------------- | --------- | --------- | --------- | ------------------------------------------- |
| `code-bg`      | `#1C2028` | `#E6E9EF` | `#0C1631` | Block background                            |
| `code-line`    | `#15181E` | `#DCE0E8` | `#16264F` | Block border                                |
| `code-fg`      | `#ABB2BF` | `#4C4F69` | `#A9B1D6` | Default text, variables, operators          |
| `code-punct`   | `#646A75` | `#7C7F93` | `#737AA2` | Punctuation, tag brackets                   |
| `code-comment` | `#5C6370` | `#8C8FA1` | `#565F89` | Comments (italic)                           |
| `code-purple`  | `#C678DD` | `#8839EF` | `#BB9AF7` | Keywords, escapes                           |
| `code-green`   | `#98C379` | `#40A02B` | `#9ECE6A` | Strings                                     |
| `code-yellow`  | `#E5C07B` | `#FE640B` | `#FF9E64` | Numbers, literals, types and classes (bold) |
| `code-blue`    | `#61AFEF` | `#1E66F5` | `#7AA2F7` | Functions (bold)                            |
| `code-cyan`    | `#56B6C2` | `#179299` | `#7DCFFF` | Built-ins, properties, params, meta, regex  |
| `code-red`     | `#E06C75` | `#D20F39` | `#F7768E` | Tag names                                   |

## Motion

- Mechanical: `ease-mech` (`cubic-bezier(0.2, 0, 0, 1)`) or `steps()`, 120–200ms.
- No idle animation. If nothing is happening, nothing moves.
- No glitch or scramble effects on streamed text.

## Avoid

- Japanese or other decorative accent text.
- Multi-colour neon (magenta, yellow) or scanline overlays across the whole screen.
- Pills, badges and labels that don't carry state (see AGENTS.md).
- Rounded corners, soft shadows, or Tailwind palette colours (`slate-*`, `sky-*`, …).
