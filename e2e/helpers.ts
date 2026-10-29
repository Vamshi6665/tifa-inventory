import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export type Role = 'Admin' | 'Staff' | 'Viewer';

export async function signIn(page: Page, role: Role = 'Admin', path = '/') {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(`Continue as ${role}`) }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  if (path !== '/') await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

export async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    const raw = localStorage.getItem('tifa.preferences');
    const parsed = raw ? JSON.parse(raw) : { state: {}, version: 1 };
    parsed.state.theme = t;
    localStorage.setItem('tifa.preferences', JSON.stringify(parsed));
  }, theme);
}

export async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

export async function noHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}
