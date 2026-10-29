import { expect, test } from '@playwright/test';
import { axe, noHorizontalScroll, setTheme, signIn } from './helpers';

const PAGES = ['/', '/inventory', '/inventory/2', '/count', '/reorder', '/orders', '/orders/2', '/suppliers', '/analytics', '/reports', '/activity', '/team', '/settings'];

test.describe('accessibility in real Chromium (with colour contrast)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`all pages pass axe in ${theme} mode`, async ({ page }) => {
      test.setTimeout(120_000);
      await signIn(page);
      await setTheme(page, theme);
      const failures: string[] = [];
      for (const path of PAGES) {
        await page.goto(path);
        // Detail routes open a modal, which hides the page heading from assistive tech.
        if (/\/\d+$/.test(path)) await expect(page.getByRole('dialog')).toBeVisible();
        else await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await page.waitForTimeout(400);
        for (const v of await axe(page)) failures.push(`${path}: ${v}`);
      }
      // States behind a click: order schedules (admin editing) and the approval dialog.
      await page.goto('/reorder');
      await page.getByRole('tab', { name: 'Order schedules' }).click();
      await expect(page.getByRole('table', { name: 'Order schedule by group' })).toBeVisible();
      for (const v of await axe(page)) failures.push(`/reorder schedules: ${v}`);
      await page.goto('/team');
      await page.getByRole('button', { name: 'Approve Maya Ortiz' }).click();
      await expect(page.getByRole('dialog', { name: 'Approve Maya Ortiz' })).toBeVisible();
      await page.waitForTimeout(400);
      for (const v of await axe(page)) failures.push(`/team approve: ${v}`);
      const login = await page.context().newPage();
      await login.goto('/login');
      for (const v of await axe(login)) failures.push(`/login: ${v}`);
      expect(failures).toEqual([]);
    });
  }
});

test.describe('keyboard and focus', () => {
  test('skip link jumps to the main content', async ({ page }) => {
    await signIn(page);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });

  test('navigating moves focus to the new page heading', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Suppliers' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Suppliers' })).toBeFocused();
  });

  test('dialogs trap focus and return it on close', async ({ page }) => {
    await signIn(page, 'Admin', '/suppliers');
    const trigger = page.getByRole('button', { name: 'Add supplier' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Add a supplier' });
    await expect(dialog.getByRole('textbox', { name: /Name/ })).toBeFocused();
    for (let i = 0; i < 15; i++) await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('command palette works entirely from the keyboard', async ({ page }) => {
    await signIn(page);
    await page.keyboard.press('Control+k');
    await expect(page.getByPlaceholder('Search items, pages, actions…')).toBeFocused();
    await page.keyboard.type('analytics');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/analytics$/);
  });

  test('table rows can be walked with arrow keys and opened with Enter', async ({ page }) => {
    await signIn(page, 'Admin', '/suppliers');
    const rows = page.getByRole('table', { name: 'Suppliers' }).getByRole('row');
    await rows.nth(1).focus();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(2)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/suppliers\/\d+$/);
  });

  test('respects reduced motion', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await signIn(page);
    const duration = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--duration-base').trim());
    expect(duration).toMatch(/^0?\.01ms$/);
    await ctx.close();
  });
});

test.describe('responsive layouts', () => {
  const SIZES: Array<[number, number]> = [
    [2560, 1440], [1920, 1080], [1440, 900], [1366, 768], [1024, 768], [768, 1024], [430, 932], [390, 844], [375, 667], [320, 640],
  ];
  for (const [w, h] of SIZES) {
    test(`no sideways scrolling at ${w}px`, async ({ browser }) => {
      test.setTimeout(90_000);
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w <= 430, hasTouch: w <= 1024 });
      const page = await ctx.newPage();
      await signIn(page);
      const broken: string[] = [];
      for (const path of ['/', '/inventory', '/count', '/reorder', '/orders', '/analytics', '/reports', '/team', '/settings']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await page.waitForTimeout(250);
        if (!(await noHorizontalScroll(page))) broken.push(path);
        if (path === '/' || path === '/inventory') await page.screenshot({ path: `test-results/responsive/${w}${path === '/' ? '-overview' : path.replace('/', '-')}.png` });
      }
      // Navigation adapts: sidebar on wide screens, tab bar on phones.
      if (w <= 768) await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'More' })).toBeVisible();
      else await expect(page.getByRole('complementary', { name: 'Main' })).toBeVisible();
      expect(broken).toEqual([]);
      await ctx.close();
    });
  }
});

test.describe('performance', () => {
  test('stays fast with 5,000 items (virtualised rows)', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page);
    await page.evaluate(() => {
      const raw = localStorage.getItem('tifa.demo.db')!;
      const db = raw ? JSON.parse(raw) : null;
      if (!db) return;
      const base = db.items;
      const big = [];
      for (let i = 0; i < 5000; i++) {
        const src = base[i % base.length];
        big.push({ ...src, id: 100000 + i, name: `${src.name} #${i}` });
      }
      db.items = big;
      localStorage.setItem('tifa.demo.db', JSON.stringify(db));
    });
    const start = Date.now();
    await page.goto('/inventory');
    await expect(page.getByRole('table', { name: 'Inventory items' })).toHaveAttribute('aria-rowcount', /^\d{4}$/);
    const loadMs = Date.now() - start;
    const domRows = await page.getByRole('table', { name: 'Inventory items' }).locator('tbody tr').count();
    expect(domRows).toBeLessThan(120); // only what's on screen is rendered
    const t0 = Date.now();
    await page.getByRole('searchbox', { name: /Search items/ }).fill('pistachio #178');
    await expect(page.getByRole('row', { name: /Pistachio #178\b/ }).first()).toBeVisible();
    const searchMs = Date.now() - t0;
    console.log(`5,000 items: page ready in ${loadMs}ms, ${domRows} rows in the DOM, search in ${searchMs}ms`);
    expect(loadMs).toBeLessThan(5000);
    expect(searchMs).toBeLessThan(1500);
  });
});
