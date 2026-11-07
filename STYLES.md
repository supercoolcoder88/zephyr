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

- Light mode (`<html data-theme="light">`) redefines these tokens in `src/index.css`; components never branch on theme.
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

## Motion

- Mechanical: `ease-mech` (`cubic-bezier(0.2, 0, 0, 1)`) or `steps()`, 120–200ms.
- No idle animation. If nothing is happening, nothing moves.
- No glitch or scramble effects on streamed text.

## Avoid

- Japanese or other decorative accent text.
- Multi-colour neon (magenta, yellow) or scanline overlays across the whole screen.
- Pills, badges and labels that don't carry state (see AGENTS.md).
- Rounded corners, soft shadows, or Tailwind palette colours (`slate-*`, `sky-*`, …).
