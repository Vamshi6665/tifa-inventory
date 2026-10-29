import { ageInDays, formatWhen } from '@/domain/dates';
import { isTracked, stockState, STATE_LABEL } from '@/domain/quantity';
import { REASON_LABEL, type RestockSuggestion } from '@/domain/reorder';
import { normalize, rank, score, tokens } from '@/domain/search';
import { forecastItem, formatRate } from '@/domain/trends';
import type { InventoryItem, StockCount, Supplier } from '@/domain/types';

export interface AnswerItem {
  id: number;
  name: string;
  detail: string;
}

export interface Answer {
  text: string;
  items?: AnswerItem[];
  source: 'local' | 'claude';
}

export interface AssistantContext {
  items: InventoryItem[];
  counts: ReadonlyMap<number, readonly StockCount[]>;
  suggestions: RestockSuggestion[];
  suppliers: Supplier[];
  now?: Date;
}

export const SUGGESTED_QUESTIONS = ['What should I order this week?', 'What’s out of stock?', 'When will pistachio paste run out?', 'What hasn’t been counted lately?', 'What do we get from Northbay?'];

const has = (q: string, ...words: string[]) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(q));

/**
 * Answers common questions directly from the data in the browser. Every answer
 * comes from the same rules the rest of the app uses, so it never invents stock.
 */
export function answerLocally(question: string, ctx: AssistantContext): Answer {
  const q = normalize(question.trim());
  const now = ctx.now ?? new Date();
  const tracked = ctx.items.filter(isTracked);
  const line = (i: InventoryItem, extra = '') => ({ id: i.id, name: i.name, detail: `${i.current_value ?? 'not counted'}${i.par_level != null ? `, par ${i.par_level}` : ''}${extra ? `. ${extra}` : ''}` });

  if (!q) return { text: 'Ask about stock levels, what to order, run-out dates, suppliers or counts.', source: 'local' };

  if (has(q, 'help', 'what can you')) {
    return { text: 'I can tell you what to order, what’s out or low, when a specific item will run out, what a supplier provides, and which items haven’t been counted recently. I only answer from your inventory data.', source: 'local' };
  }

  // Specific item: "when will X run out", "how much X", or the question is mostly an item name.
  const itemHits = rank(ctx.items, question.replace(/\b(when|will|run|runs|out|how|much|many|left|do|we|have|is|the|of|last|long|what|about|status)\b/gi, ' '), (i) => [i.name], 3);
  // The question must contain the whole item name ("pistachio paste"), not just share a word.
  const named = ctx.items.filter((i) => score(question, i.name) > 0).sort((a, b) => b.name.length - a.name.length);
  const strongItem = named[0];
  if (strongItem && (has(q, 'when', 'how much', 'how many', 'how long', 'left', 'run out', 'last') || tokens(question).length <= tokens(strongItem.name).length + 2)) {
    const i = strongItem;
    const f = forecastItem(i, ctx.counts.get(i.id) ?? [], { now });
    const state = STATE_LABEL[stockState(i)];
    const parts = [`${i.name} has ${i.current_value ?? 'no count'} on hand${i.par_level != null ? ` against a par of ${i.par_level}` : ''} (${state.toLowerCase()}).`];
    if (f.status === 'ok') parts.push(`It’s used at about ${formatRate(f.dailyRate!)} a day, so it runs out around ${formatWhen(f.runsOutOn, now)}${f.daysToPar != null ? ` and reaches par in about ${Math.round(f.daysToPar)} days` : ''}.`);
    else parts.push(f.explanation);
    return { text: parts.join(' '), items: [line(i)], source: 'local' };
  }

  // Supplier
  const sup = ctx.suppliers.find((s) => tokens(s.name).some((t) => t.length > 3 && tokens(question).includes(t)) && has(q, 'from', 'supplier', 'get', 'buy', 'order'));
  if (sup) {
    const theirs = tracked.filter((i) => i.supplier_id === sup.id);
    const low = theirs.filter((i) => ['low', 'out'].includes(stockState(i)));
    return {
      text: `${sup.name} supplies ${theirs.length} items${sup.lead_time_days != null ? ` with a ${sup.lead_time_days}-day lead time` : ''}. ${low.length ? `${low.length} of them need reordering.` : 'None of them need reordering right now.'}`,
      items: (low.length ? low : theirs).slice(0, 8).map((i) => line(i, STATE_LABEL[stockState(i)])),
      source: 'local',
    };
  }

  if (has(q, 'out of stock', 'sold out', 'run out of', 'ran out', 'empty') || /\bout\b/.test(q)) {
    const out = tracked.filter((i) => stockState(i) === 'out');
    return { text: out.length ? `${out.length} ${out.length === 1 ? 'item is' : 'items are'} out of stock.` : 'Nothing is out of stock.', items: out.slice(0, 10).map((i) => line(i)), source: 'local' };
  }

  if (has(q, 'order', 'buy', 'reorder', 'restock', 'low', 'need', 'running low', 'purchase')) {
    const top = ctx.suggestions.slice(0, 10);
    if (!top.length) return { text: 'Nothing needs ordering. No item is below par or projected to drop there before its next order.', source: 'local' };
    return {
      text: `${ctx.suggestions.length} ${ctx.suggestions.length === 1 ? 'item needs' : 'items need'} ordering. Quantities cover the next order cycle plus par.`,
      items: top.map((s) => ({ id: s.item.id, name: s.item.name, detail: `${REASON_LABEL[s.reason]}. ${s.forecast.suggestedQty ? `Order about ${s.forecast.suggestedQty}` : 'Not enough history for a quantity'}` })),
      source: 'local',
    };
  }

  if (has(q, 'count', 'stale', 'checked', 'verify', 'confirm', 'lately', 'recent')) {
    const stale = tracked.map((i) => ({ i, age: ageInDays(i.last_verified_at, now) ?? 999 })).filter((x) => x.age > 14).sort((a, b) => b.age - a.age);
    return { text: stale.length ? `${stale.length} items haven’t been confirmed in over two weeks.` : 'Everything has been counted or confirmed in the last two weeks.', items: stale.slice(0, 10).map(({ i, age }) => line(i, age >= 999 ? 'Never confirmed' : `${age} days ago`)), source: 'local' };
  }

  if (has(q, 'review', 'unreadable', 'can.t read', 'messy', 'text')) {
    const review = tracked.filter((i) => stockState(i) === 'review');
    return { text: review.length ? `${review.length} counts are written in a way the system can’t compare to par.` : 'Every count is readable.', items: review.map((i) => line(i)), source: 'local' };
  }

  const cats = [...new Set(ctx.items.map((i) => i.category))];
  const cat = cats.find((c) => score(question, c) > 0);
  if (cat) {
    const inCat = tracked.filter((i) => i.category === cat);
    const low = inCat.filter((i) => ['low', 'out'].includes(stockState(i)));
    return { text: `${cat} has ${inCat.length} active items. ${low.length ? `${low.length} need reordering.` : 'None need reordering.'}`, items: low.slice(0, 10).map((i) => line(i, STATE_LABEL[stockState(i)])), source: 'local' };
  }

  if (has(q, 'summary', 'overview', 'how are we', 'status', 'today')) {
    const states = tracked.map((i) => stockState(i));
    const n = (s: string) => states.filter((x) => x === s).length;
    return { text: `${tracked.length} active items: ${n('out')} out, ${n('low')} low, ${n('review')} need a closer look, and the rest are in stock. ${ctx.suggestions.length} are on the reorder list.`, source: 'local' };
  }

  if (itemHits.length) {
    return { text: 'Here are the closest matching items.', items: itemHits.map((i) => line(i, STATE_LABEL[stockState(i)])), source: 'local' };
  }
  return { text: 'I couldn’t match that to anything in your inventory. Try an item name, a supplier, or ask what to order.', source: 'local' };
}
