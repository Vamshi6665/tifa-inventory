import { describe, expect, it } from 'vitest';
import { addDays, relativeTime, startOfWeek } from './dates';
import { can, canAccessCategory, visibleItems } from './permissions';
import { restockSuggestions, scheduleFor } from './reorder';
import { highlight, rank, score } from './search';
import type { InventoryItem, StockCount } from './types';
import { sanitizeCell, toCSV } from '@/lib/csv';

const NOW = new Date(2026, 9, 29, 12);

const mk = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 1,
  name: 'Item',
  category: 'Gelato',
  subcategory: 'Bases',
  unit_type: 'count',
  unit_label: null,
  current_value: '10',
  par_level: 4,
  par_source_note: null,
  supplier: null,
  supplier_id: null,
  status: 'active',
  notes: null,
  location: null,
  reorder_url: null,
  updated_at: NOW.toISOString(),
  last_verified_at: null,
  ...over,
});

describe('permissions', () => {
  const admin = { role: 'admin' as const, categories: ['Gelato'] };
  const staff = { role: 'staff' as const, categories: ['Gelato'] };
  const allStaff = { role: 'staff' as const, categories: null };
  const viewer = { role: 'viewer' as const, categories: null };

  it('admins can do everything in every category', () => {
    expect(can(admin, 'item:delete', { category: 'House Supplies' })).toBe(true);
    expect(can(admin, 'user:manage')).toBe(true);
  });
  it('staff can count only inside their categories', () => {
    expect(can(staff, 'item:count', { category: 'Gelato' })).toBe(true);
    expect(can(staff, 'item:count', { category: 'House Supplies' })).toBe(false);
    expect(can(staff, 'item:edit', { category: 'Gelato' })).toBe(false);
    expect(can(allStaff, 'item:count', { category: 'House Supplies' })).toBe(true);
  });
  it('viewers are read-only', () => {
    expect(can(viewer, 'item:read', { category: 'Gelato' })).toBe(true);
    expect(can(viewer, 'item:count', { category: 'Gelato' })).toBe(false);
  });
  it('signed-out users can do nothing', () => {
    expect(can(null, 'item:read')).toBe(false);
    expect(canAccessCategory(null, 'Gelato')).toBe(false);
  });
  it('filters item lists to allowed categories', () => {
    const items = [mk({ id: 1, category: 'Gelato' }), mk({ id: 2, category: 'House Supplies' })];
    expect(visibleItems(staff, items).map((i) => i.id)).toEqual([1]);
    expect(visibleItems(admin, items)).toHaveLength(2);
  });
});

describe('restockSuggestions', () => {
  const counts = (itemId: number, values: Array<[number, string]>): StockCount[] =>
    values.map(([daysAgo, value], i) => ({ id: itemId * 100 + i, item_id: itemId, value, counted_at: addDays(NOW, -daysAgo).toISOString(), recorded_by: null, source: 'manual', note: null }));

  it('orders out-of-stock first, then low, then projected; skips review/untracked', () => {
    const items = [
      mk({ id: 1, name: 'Plenty', current_value: '40' }),
      mk({ id: 2, name: 'Low', current_value: '3' }),
      mk({ id: 3, name: 'Out', current_value: '0' }),
      mk({ id: 4, name: 'Projected', current_value: '8' }),
      mk({ id: 5, name: 'Unreadable', current_value: '1 box + 10 packs' }),
      mk({ id: 6, name: 'Retired', current_value: '0', status: 'discontinued' }),
    ];
    const map = new Map<number, StockCount[]>([[4, counts(4, [[21, '20'], [14, '16'], [7, '12'], [0, '8']])]]);
    const s = restockSuggestions(items, map, [{ category: 'Gelato', subcategory: 'Bases', frequency: 'weekly' }], [], NOW);
    expect(s.map((x) => x.item.name)).toEqual(['Out', 'Low', 'Projected']);
    expect(s[2]!.reason).toBe('projected');
    expect(s[2]!.frequency).toBe('weekly');
  });

  it('matches schedules on category + subcategory, with "Uncategorized" for items without one', () => {
    expect(scheduleFor({ category: 'Gelato', subcategory: 'Bases' }, [{ category: 'Gelato', subcategory: 'Bases', frequency: 'monthly' }])).toBe('monthly');
    expect(scheduleFor({ category: 'Gelato', subcategory: null }, [{ category: 'Gelato', subcategory: 'Uncategorized', frequency: 'biweekly' }])).toBe('biweekly');
  });

  it('falls back to the category defaults carried over from the original dashboard', () => {
    expect(scheduleFor({ category: 'Gelato', subcategory: 'Bases' }, [])).toBe('weekly');
    expect(scheduleFor({ category: 'Truffles & Chocolates', subcategory: null }, [])).toBe('biweekly');
    expect(scheduleFor({ category: 'House Supplies', subcategory: 'Cleaning' }, [])).toBe('monthly');
    expect(scheduleFor({ category: 'Something new', subcategory: null }, [])).toBe('monthly');
  });
});

describe('search', () => {
  it('ranks prefix matches above mid-word matches', () => {
    expect(score('Pistachio paste', 'pist')).toBeGreaterThan(score('Sicilian pistachio', 'pist'));
    expect(score('Sicilian pistachio', 'pist')).toBeGreaterThan(score('Unpistachioed', 'pist'));
  });
  it('requires every token', () => {
    expect(score('Dark chocolate 70%', 'dark milk')).toBe(0);
    expect(score('Dark chocolate 70%', 'choc dark')).toBeGreaterThan(0);
  });
  it('ignores accents', () => {
    expect(score('Crème brûlée base', 'creme brulee')).toBeGreaterThan(0);
  });
  it('highlights every occurrence as text segments', () => {
    expect(highlight('Cocoa cocoa nibs', 'cocoa')).toEqual([
      { text: 'Cocoa', match: true },
      { text: ' ', match: false },
      { text: 'cocoa', match: true },
      { text: ' nibs', match: false },
    ]);
    expect(highlight('<img onerror=x>', 'img')).toEqual([
      { text: '<', match: false },
      { text: 'img', match: true },
      { text: ' onerror=x>', match: false },
    ]);
  });
  it('rank returns best matches first and respects limit', () => {
    const r = rank(['Milk chocolate', 'Chocolate chips', 'Hot chocolate mix', 'Vanilla'], 'choc', (s) => [s], 2);
    expect(r).toEqual(['Chocolate chips', 'Milk chocolate']);
  });
});

describe('csv', () => {
  it('neutralises formula injection', () => {
    expect(sanitizeCell('=HYPERLINK("http://evil")')).toBe('\'=HYPERLINK("http://evil")');
    expect(sanitizeCell('+1')).toBe("'+1");
    expect(sanitizeCell('-5')).toBe("'-5");
    expect(sanitizeCell(-5)).toBe('-5');
  });
  it('quotes commas, quotes and newlines and prefixes a BOM', () => {
    const csv = toCSV(['Name', 'Note'], [['Hazelnut, toasted', 'say "hi"\nnow']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Hazelnut, toasted","say ""hi""\nnow"');
  });
});

describe('dates', () => {
  it('weeks start on Monday', () => {
    expect(startOfWeek(new Date(2026, 9, 25)).getDate()).toBe(19); // Sunday → previous Monday
    expect(startOfWeek(new Date(2026, 9, 26)).getDate()).toBe(26);
  });
  it('formats relative time', () => {
    expect(relativeTime(addDays(NOW, -1), NOW)).toBe('yesterday');
    expect(relativeTime(null, NOW)).toBe('Never');
    expect(relativeTime(new Date(NOW.getTime() - 10_000), NOW)).toBe('Just now');
  });
});

describe('date-only strings', () => {
  it('formats a calendar day without shifting it across time zones', async () => {
    const { formatShortDate, toDate } = await import('./dates');
    expect(toDate('2026-10-26').getDate()).toBe(26);
    expect(formatShortDate('2026-10-26')).toBe('Oct 26');
  });
});
