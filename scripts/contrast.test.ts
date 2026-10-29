import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('design tokens', () => {
  it('meet WCAG 2.2 AA contrast in light and dark themes', () => {
    const script = resolve(process.cwd(), 'scripts/contrast.mjs');
    const out = execFileSync(process.execPath, [script], { encoding: 'utf8' });
    const [, pass, total] = /(\d+)\/(\d+) contrast checks pass/.exec(out)!;
    expect(Number(total)).toBeGreaterThanOrEqual(100);
    expect(pass).toBe(total);
  });
});
