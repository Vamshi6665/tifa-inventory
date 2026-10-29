/**
 * Automated accessibility pass over every page with axe-core (jsdom).
 * Colour contrast is checked separately (tokens.test.ts) and again in real
 * Chromium by the Playwright suite, since jsdom can't compute styles.
 */
import { describe, expect, it } from 'vitest';
import axe from 'axe-core';
import { renderApp, waitForPage } from './render';

const PAGES: Array<[string, string | RegExp]> = [
  ['/', /Good/],
  ['/inventory', 'Inventory'],
  ['/count', 'Stock count'],
  ['/reorder', 'Reorder'],
  ['/orders', 'Purchase orders'],
  ['/suppliers', 'Suppliers'],
  ['/analytics', 'Analytics'],
  ['/reports', 'Reports'],
  ['/activity', 'Activity'],
  ['/team', 'Team'],
  ['/settings', 'Settings'],
];

async function violations(container: Element) {
  const res = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
  return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
}

describe('accessibility (axe)', () => {
  it.each(PAGES)('%s has no violations', async (path, title) => {
    const { container } = await renderApp(path);
    await waitForPage(title);
    await new Promise((r) => setTimeout(r, 50));
    expect(await violations(container)).toEqual([]);
  }, 15_000);

  it('login page has no violations', async () => {
    const { container } = await renderApp('/login', null);
    await waitForPage('Sign in to Tifa Inventory');
    expect(await violations(container)).toEqual([]);
  });
});
