// Curated screenshots for docs. Needs the demo preview running on :4173.
import { chromium } from '@playwright/test';
const B = process.env.BASE_URL || 'http://localhost:4173';
const shots = [
  ['overview-light', '/?as=admin', 1440, 900, 'light'],
  ['overview-dark', '/?as=admin', 1440, 900, 'dark'],
  ['inventory', '/inventory?as=admin', 1440, 900, 'light'],
  ['item-detail', '/inventory/2?as=admin', 1440, 900, 'dark'],
  ['reorder', '/reorder?as=admin', 1440, 900, 'light'],
  ['analytics-dark', '/analytics?as=admin', 1440, 900, 'dark'],
  ['palette', '/inventory?as=admin', 1440, 900, 'light', 'palette'],
  ['mobile-overview', '/?as=admin', 390, 844, 'light'],
  ['mobile-count', '/count?as=staff', 390, 844, 'dark'],
  ['mobile-inventory', '/inventory?as=admin', 390, 844, 'light'],
  ['team', '/team?as=admin', 1440, 900, 'light'],
];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
for (const [name, path, w, h, theme, extra] of shots) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(B + path);
  await page.locator('#page-title').waitFor({ state: 'attached' });
  await page.waitForTimeout(900);
  if (extra === 'palette') {
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('Search items, pages, actions…').waitFor();
    await page.keyboard.type('pista');
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
  await ctx.close();
}
await browser.close();
console.log('saved', shots.length);
