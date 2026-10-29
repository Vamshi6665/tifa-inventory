// Screenshot helper: node scripts/shoot.mjs <outDir> <theme> <width>x<height> <path...>
import { chromium } from '@playwright/test';
const [outDir, theme = 'light', size = '1440x900', ...paths] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const base = process.env.BASE_URL || 'http://localhost:4173';
const role = process.env.ROLE || 'Admin';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(base + '/login');
await page.getByRole('button', { name: new RegExp(`Continue as ${role}`) }).click();
await page.waitForURL((u) => !u.pathname.startsWith('/login'));
for (const p of paths) {
  await page.goto(base + p);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(700);
  const name = (p === '/' ? 'home' : p.replace(/[/?=&]+/g, '_').replace(/^_/, '')) + `-${theme}-${width}`;
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: process.env.FULL === '1' });
}
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
