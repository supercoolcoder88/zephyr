# Zephyr style guide

Read this before changing any UI or styling. Tokens live in `src/index.css`; use them through Tailwind classes (`bg-void`, `text-mute`, `border-line`, `text-cyan`) rather than raw hex values.

## Principle

Blocky, futuristic, black and white. Monochrome carries the whole interface. Neon cyan is reserved for **key moments**: the agent doing something right now. If cyan is visible while the app is idle, something is wrong.

## Palette

| Token         | Value     | Use                                            |
| ------------- | --------- | ---------------------------------------------- |
| `void`        | `#000000` | App background                                 |
| `panel`       | `#0A0A0A` | Raised surfaces (sidebar, composer)            |
| `line`        | `#1F1F1F` | 1px hairlines, dividers, grid                  |
| `line-strong` | `#3A3A3A` | Hover and active borders                       |
| `mute`        | `#6B6B6B` | Secondary text, indices, metadata              |
| `ink`         | `#EDEDED` | Primary text                                   |
| `paper`       | `#FFFFFF` | Inverted blocks, primary button                |
| `cyan`        | `#00E5FF` | Key moments only                               |
| `cyan-deep`   | `#0066FF` | Glow falloff behind cyan                       |
| `alert`       | `#FF2E4D` | Errors and destructive actions, just as sparse |
| `ok`          | `#00E676` | Thread status dot: finished, unseen            |
| `warn`        | `#FF9100` | Thread status dot: needs attention             |

- Light (`<html data-theme="light">`) and cyber (`data-theme="cyber"`, dark navy with white text) modes redefine these tokens in `src/index.css`; components never branch on theme.
- Thread status dots in the sidebar are the only place `ok` and `warn` appear: cyan running, `alert` error, `ok` done, `warn` needs attention, `mute` read.
- Emphasis is done by **inversion** (`bg-paper text-void`), not by adding colour.
- Never set long text in cyan. Cyan marks things like rules, outlines, cursors and short status words.
- No surface gradients. The only gradient allowed is the cyan glow falloff.

## Type

- **JetBrains Mono everywhere**: UI, body, headings. No second typeface.
- Sizes: 11 / 13 / 16 / 24 / 48 px (`text-2xs`, `text-sm`, `text-base`, `text-2xl`, `text-5xl`). Avoid in-between sizes.
- Small labels and controls: 11px, uppercase, `tracking-widest`.
- Headings: uppercase, wide tracking, regular-to-medium weight. Bold is rare.

## Shape and layout

- **Border radius is 0.** `--radius-*` is reset in the theme, so `rounded-*` does nothing. Don't work around it.
- Depth comes from 1px borders and inversion. No drop shadows except the cyan glow.
- Bracket small controls and indices: `[ SEND ]`, `[ + NEW ]`, `01`.
- Dense spacing on a 4px base. This is a tool, not a landing page.
- A chamfered corner (`.chamfer`) is allowed on at most one primary element per view.

## Key moments (the only places cyan appears)

| Moment           | Treatment                                                                 |
| ---------------- | ------------------------------------------------------------------------- |
| Agent running    | Cyan scanline sweeps the composer's top edge; status word turns cyan      |
| Streaming output | Newest agent line gets a cyan left rule; it drops to `line` once stale    |
| Tool in flight   | Tool name in an inverted block with a cyan outline until the run moves on |
| Run completes    | One `.flash` glow pulse (~400ms) on the finished turn, then monochrome    |
| Keyboard focus   | 1px cyan outline (`focus-visible` only)                                   |

Glow, for key moments only:

```css
box-shadow:
  0 0 0 1px var(--color-cyan),
  0 0 12px -2px var(--color-cyan-deep);
```

## Code blocks

Fenced code in agent output is highlighted by `rehype-highlight` and coloured with the user's neovim theme (aether, One Dark palette), the one deliberate exception to monochrome. It looks the same in every app theme, like a fixed neovim window. The `code-*` tokens are for code blocks only; inline code stays monochrome.

| Token          | Value     | Use                                         |
| -------------- | --------- | ------------------------------------------- |
| `code-bg`      | `#1C2028` | Block background                            |
| `code-line`    | `#15181E` | Block border                                |
| `code-fg`      | `#ABB2BF` | Default text, variables, operators          |
| `code-punct`   | `#646A75` | Punctuation, tag brackets                   |
| `code-comment` | `#5C6370` | Comments (italic)                           |
| `code-purple`  | `#C678DD` | Keywords, escapes                           |
| `code-green`   | `#98C379` | Strings                                     |
| `code-yellow`  | `#E5C07B` | Numbers, literals, types and classes (bold) |
| `code-blue`    | `#61AFEF` | Functions (bold)                            |
| `code-cyan`    | `#56B6C2` | Built-ins, properties, params, meta, regex  |
| `code-red`     | `#E06C75` | Tag names                                   |

## Motion

- Mechanical: `ease-mech` (`cubic-bezier(0.2, 0, 0, 1)`) or `steps()`, 120–200ms.
- No idle animation. If nothing is happening, nothing moves.
- No glitch or scramble effects on streamed text.

## Avoid

- Japanese or other decorative accent text.
- Multi-colour neon (magenta, yellow) or scanline overlays across the whole screen.
- Pills, badges and labels that don't carry state (see AGENTS.md).
- Rounded corners, soft shadows, or Tailwind palette colours (`slate-*`, `sky-*`, …).
