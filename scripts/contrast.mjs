// WCAG 2.2 contrast check, reading colours straight from src/design-system/tokens.css.
// Run: node scripts/contrast.mjs [-v]
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/design-system/tokens.css', import.meta.url), 'utf8');
function block(selector) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Missing ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const vars = {};
  for (const m of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[m[1]] = m[2].toLowerCase();
  return vars;
}
const light = block(":root,\n[data-theme='light']");
const dark = { ...light, ...block("[data-theme='dark']") };

const hex = (h) => h.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const L = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const surfaces = ['color-bg', 'color-surface', 'color-surface-2', 'color-sunken'];
const text = [['color-text', 7], ['color-text-2', 4.5], ['color-text-3', 4.5], ['color-accent-text', 4.5], ['color-danger', 4.5], ['color-warning', 4.5], ['color-review', 4.5], ['color-info', 4.5]];
const pairs = [['color-danger', 'color-danger-soft'], ['color-warning', 'color-warning-soft'], ['color-review', 'color-review-soft'], ['color-accent-text', 'color-accent-soft'], ['color-info', 'color-info-soft'], ['color-text', 'color-accent-soft'], ['color-text-2', 'color-accent-soft']];

const checks = [];
for (const [name, t] of [['light', light], ['dark', dark]]) {
  for (const [fg, min] of text) for (const bg of surfaces) checks.push([name, fg, bg, ratio(t[fg], t[bg]), min]);
  checks.push([name, 'color-on-accent', 'color-accent-strong', ratio(t['color-on-accent'], t['color-accent-strong']), 4.5]);
  for (const [fg, bg] of pairs) checks.push([name, fg, bg, ratio(t[fg], t[bg]), 4.5]);
  // Non-text contrast (1.4.11): control borders, meter fills and focus ring vs surfaces
  for (const ui of ['color-border-strong', 'color-accent', 'color-focus', 'color-danger', 'color-warning-fill'])
    for (const bg of ['color-surface', 'color-bg']) checks.push([name, ui, bg, ratio(t[ui], t[bg]), 3]);
}
let fail = 0;
for (const [th, fg, bg, r, min] of checks) {
  const ok = r >= min;
  if (!ok) fail++;
  if (!ok || process.argv.includes('-v')) console.log(`${ok ? 'pass' : 'FAIL'}  ${th.padEnd(5)} ${fg.padEnd(20)} on ${bg.padEnd(18)} ${r.toFixed(2)} (min ${min})`);
}
console.log(`${checks.length - fail}/${checks.length} contrast checks pass`);
process.exitCode = fail ? 1 : 0;
