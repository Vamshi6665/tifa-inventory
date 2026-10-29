import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signIn } from './helpers';

test.describe('sign in and access', () => {
  test('protected pages redirect to sign in and come back after', async ({ page }) => {
    await page.goto('/reorder');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('button', { name: /Continue as Admin/ }).click();
    await expect(page).toHaveURL(/\/reorder$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Reorder' })).toBeVisible();
  });

  test('signing out clears the session', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: /Account:/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/inventory');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('viewers cannot reach counting or admin pages', async ({ page }) => {
    await signIn(page, 'Viewer');
    await expect(page.getByRole('link', { name: 'Stock count' })).toHaveCount(0);
    await page.goto('/team');
    await expect(page.getByRole('heading', { name: 'This page is for admins' })).toBeVisible();
  });
});

test.describe('inventory', () => {
  test('add an item, record a count inline, see it in history', async ({ page }) => {
    await signIn(page, 'Admin', '/inventory');
    await page.getByRole('button', { name: 'Add item' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add an item' });
    await dialog.getByRole('textbox', { name: /Name/ }).fill('Lavender honey');
    await dialog.getByRole('combobox', { name: /Category/ }).fill('Gelato');
    await dialog.getByRole('textbox', { name: /Current count/ }).fill('3');
    await dialog.getByRole('textbox', { name: /Par level/ }).fill('2');
    await dialog.getByRole('button', { name: 'Add item' }).click();
    await expect(page.getByText('Added Lavender honey')).toBeVisible();

    await page.getByRole('searchbox', { name: /Search items/ }).fill('lavender');
    await expect(page.locator('mark', { hasText: /lavender/i }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Edit On hand for Lavender honey' }).click();
    const cell = page.getByRole('textbox', { name: 'Edit On hand for Lavender honey' });
    await cell.fill('1');
    await cell.press('Enter');
    await expect(page.getByRole('row', { name: /Lavender honey/ }).getByText('Low')).toBeVisible();

    await page.getByRole('link', { name: 'Lavender honey' }).click();
    const drawer = page.getByRole('dialog', { name: 'Lavender honey' });
    await expect(drawer.getByRole('heading', { name: 'Count history' })).toBeVisible();
    await expect(drawer.getByRole('listitem').filter({ hasText: /^1/ })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Revert to 3' })).toBeVisible();
  });

  test('exports the filtered table to CSV and Excel', async ({ page }) => {
    await signIn(page, 'Admin', '/inventory');
    await page.getByRole('radio', { name: /To reorder/ }).click();
    await page.getByRole('button', { name: 'Export' }).click();
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export to CSV' }).click()]);
    expect(csv.suggestedFilename()).toMatch(/^inventory-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = readFileSync((await csv.path())!, 'utf8');
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toContain('Item,On hand,Level vs par,Par,Stock');
    const rows = await page.getByRole('table', { name: 'Inventory items' }).getByRole('row').count();
    expect(lines.length).toBe(rows); // header + same rows as on screen

    await page.getByRole('button', { name: 'Export' }).click();
    const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export to Excel' }).click()]);
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
    const bytes = readFileSync((await xlsx.path())!);
    expect(bytes.subarray(0, 2).toString()).toBe('PK'); // a real zip-based workbook
  });

  test('saved views restore search and filters', async ({ page }) => {
    await signIn(page, 'Admin', '/inventory');
    await page.getByRole('searchbox', { name: /Search items/ }).fill('paste');
    await page.getByRole('button', { name: 'Saved views' }).click();
    await page.getByRole('button', { name: 'Save current view' }).click();
    await page.getByRole('textbox', { name: 'View name' }).fill('Pastes');
    await page.getByRole('button', { name: 'Save view' }).click();
    await page.getByRole('searchbox', { name: /Search items/ }).fill('');
    await page.getByRole('button', { name: 'Saved views' }).click();
    await page.getByRole('button', { name: 'Pastes', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: /Search items/ })).toHaveValue('paste');
  });
});

test.describe('purchasing', () => {
  test('reorder → draft → sent → received updates stock', async ({ page }) => {
    await signIn(page, 'Admin', '/reorder');
    const group = page.locator('section').filter({ has: page.getByRole('button', { name: /Create draft order/ }) }).first();
    const firstRow = group.getByRole('row').nth(1);
    const itemName = (await firstRow.getByRole('link').first().textContent())!.trim();
    const onHand = Number(await firstRow.getByRole('cell').nth(3).textContent());
    const qty = Number(await firstRow.getByRole('textbox').inputValue());
    await group.getByRole('button', { name: /Create draft order/ }).click();
    await expect(page).toHaveURL(/\/orders\/\d+$/);
    await page.getByRole('button', { name: 'Mark as sent' }).click();
    await page.getByRole('button', { name: 'Receive delivery' }).click();
    await page.getByRole('button', { name: 'Receive and update stock' }).click();
    await expect(page.getByText('Delivery received and stock updated')).toBeVisible();
    await page.goto('/inventory');
    await page.getByRole('searchbox', { name: /Search items/ }).fill(itemName);
    await expect(page.getByRole('row', { name: new RegExp(itemName.replace(/[()]/g, '.')) }).getByText(String(onHand + qty), { exact: true })).toBeVisible();
  });
});

test.describe('stock count @mobile', () => {
  test('count a category from a phone-sized screen', async ({ page }) => {
    await signIn(page, 'Staff', '/count');
    const first = page.locator('input[id^="count-"]').first();
    await first.fill('9');
    await first.press('Enter');
    await expect(page.getByRole('group', { name: 'Count progress' })).toContainText('1 of');
    await expect(page.locator('input[id^="count-"]').nth(1)).toBeFocused();
    await page.keyboard.press('Enter'); // empty = still the same
    await expect(page.getByRole('group', { name: 'Count progress' })).toContainText('2 of');
  });
});

test.describe('live updates', () => {
  test('a change in one tab shows up in another without reloading', async ({ context }) => {
    const a = await context.newPage();
    await signIn(a, 'Admin', '/inventory');
    const b = await context.newPage();
    await signIn(b, 'Admin', '/inventory'); // demo sessions are per tab
    await expect(b.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible();
    await a.getByRole('searchbox', { name: /Search items/ }).fill('Espresso beans');
    await a.getByRole('button', { name: 'Edit On hand for Espresso beans (1 kg)' }).click();
    await a.getByRole('textbox', { name: 'Edit On hand for Espresso beans (1 kg)' }).fill('77');
    await a.keyboard.press('Enter');
    await b.getByRole('searchbox', { name: /Search items/ }).fill('Espresso beans');
    await expect(b.getByRole('row', { name: /Espresso beans/ }).getByText('77', { exact: true })).toBeVisible({ timeout: 5000 });
  });
});

test.describe('assistant', () => {
  test('answers from inventory data', async ({ page }) => {
    await signIn(page);
    await page.keyboard.press('Control+j');
    const sheet = page.getByRole('dialog', { name: 'Ask about your inventory' });
    await sheet.getByRole('button', { name: 'What’s out of stock?' }).click();
    await expect(sheet.getByText(/items? (is|are) out of stock|Nothing is out of stock/)).toBeVisible();
    await expect(sheet.getByText('Calculated from your data')).toBeVisible();
  });
});
