import { describe, expect, it } from 'vitest';
import { buildSeed } from '@/data/demo/seed';
import { isTracked, stockState } from '@/domain/quantity';
import { restockSuggestions } from '@/domain/reorder';
import type { StockCount } from '@/domain/types';
import { answerLocally, type AssistantContext } from './localAssistant';

const NOW = new Date(2026, 9, 29, 12);
const db = buildSeed(NOW.getTime());
const counts = new Map<number, StockCount[]>();
for (const c of db.counts) counts.set(c.item_id, [...(counts.get(c.item_id) ?? []), c]);
const ctx: AssistantContext = { items: db.items, counts, suppliers: db.suppliers, suggestions: restockSuggestions(db.items.filter(isTracked), counts, db.schedules, db.suppliers, NOW), now: NOW };

describe('local assistant', () => {
  it('lists what to order using the same suggestions as the reorder page', () => {
    const a = answerLocally('What should I order this week?', ctx);
    expect(a.items?.map((i) => i.id)).toEqual(ctx.suggestions.slice(0, 10).map((s) => s.item.id));
    expect(a.text).toMatch(new RegExp(`^${ctx.suggestions.length} items need ordering`));
  });

  it('lists out-of-stock items only', () => {
    const a = answerLocally("What's out of stock?", ctx);
    const out = db.items.filter((i) => isTracked(i) && stockState(i) === 'out').map((i) => i.id);
    expect(a.items?.map((i) => i.id).sort()).toEqual(out.sort());
  });

  it('answers about a specific item with its forecast', () => {
    const a = answerLocally('When will hazelnut paste run out?', ctx);
    expect(a.text).toMatch(/^Hazelnut paste has/);
    expect(a.items?.[0]?.name).toBe('Hazelnut paste');
  });

  it('answers about a supplier', () => {
    const a = answerLocally('What do we get from Northbay?', ctx);
    expect(a.text).toMatch(/^Northbay Dairy Co\. supplies \d+ items with a 2-day lead time/);
  });

  it('summarises a category', () => {
    expect(answerLocally('how is Truffles & Chocolates looking', ctx).text).toMatch(/^Truffles & Chocolates has \d+ active items/);
  });

  it('never invents an item that doesn’t exist', () => {
    const a = answerLocally('When will unicorn sprinkles run out?', ctx);
    expect(a.items?.some((i) => /unicorn/i.test(i.name)) ?? false).toBe(false);
  });

  it('handles empty input', () => {
    expect(answerLocally('   ', ctx).text).toMatch(/^Ask about/);
  });
});
