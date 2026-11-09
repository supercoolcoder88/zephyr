// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

const codeTokens = (selector: string) => {
  const start = css.indexOf(selector);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--color-(code-[\w-]+):\s*(#[0-9a-f]+)/gi)].map((m) => [
      m[1],
      m[2].toLowerCase(),
    ]),
  );
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

const dark = codeTokens('@theme {');
const light = codeTokens(":root[data-theme='light']");
const cyber = codeTokens(":root[data-theme='cyber']");

it('gives each theme a full code palette of its own', () => {
  expect(Object.keys(dark).length).toBeGreaterThan(0);
  expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
  expect(Object.keys(cyber).sort()).toEqual(Object.keys(dark).sort());
  for (const token of ['code-bg', 'code-fg']) {
    expect(new Set([dark[token], light[token], cyber[token]]).size).toBe(3);
  }
  expect(luminance(light['code-bg'])).toBeGreaterThan(0.8);
  expect(luminance(dark['code-bg'])).toBeLessThan(0.2);
  expect(luminance(cyber['code-bg'])).toBeLessThan(0.2);
});
