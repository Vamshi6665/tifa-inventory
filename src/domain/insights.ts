import { ageInDays } from './dates';
import { isTracked, numericValue, stockState } from './quantity';
import type { RestockSuggestion } from './reorder';
import { formatRate } from './trends';
import type { InventoryItem, PurchaseOrder, Supplier } from './types';

export type InsightTone = 'danger' | 'warning' | 'review' | 'info' | 'ok';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  action?: { label: string; to: string };
}

/**
 * Deterministic insights: every one is a plain rule over the data, so the
 * reasoning can be stated in the UI and checked by hand.
 */
export function deriveInsights(items: readonly InventoryItem[], suggestions: readonly RestockSuggestion[], now: Date = new Date()): Insight[] {
  const out: Insight[] = [];
  const tracked = items.filter(isTracked);

  const projected = suggestions.filter((s) => s.reason === 'projected');
  if (projected.length) {
    const first = projected[0]!;
    out.push({
      id: 'projected',
      tone: 'warning',
      title: projected.length === 1 ? `${first.item.name} will drop below par before the next order` : `${projected.length} items will drop below par before their next order`,
      detail: `Based on recent usage. ${first.item.name} has about ${Math.round(first.forecast.daysToPar ?? 0)} days left above par.`,
      action: { label: 'Review reorder list', to: '/reorder' },
    });
  }

  const byCat = new Map<string, number[]>();
  for (const i of tracked) {
    const age = ageInDays(i.last_verified_at ?? i.updated_at, now);
    if (age == null) continue;
    const list = byCat.get(i.category) ?? [];
    list.push(age);
    byCat.set(i.category, list);
  }
  let stalest: { cat: string; median: number } | null = null;
  for (const [cat, ages] of byCat) {
    const sorted = [...ages].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    if (median >= 10 && (!stalest || median > stalest.median)) stalest = { cat, median };
  }
  if (stalest) {
    out.push({ id: `stale-${stalest.cat}`, tone: 'info', title: `${stalest.cat} hasn’t been counted in ${stalest.median} days`, detail: 'Half the items in this category were last confirmed more than that long ago.', action: { label: 'Start a count', to: `/count?category=${encodeURIComponent(stalest.cat)}` } });
  }

  const unreadable = tracked.filter((i) => stockState(i) === 'review');
  if (unreadable.length) {
    out.push({ id: 'review', tone: 'review', title: `${unreadable.length} ${unreadable.length === 1 ? 'count needs' : 'counts need'} a closer look`, detail: 'These are written in a way the system can’t compare to par, so they won’t trigger low-stock alerts.', action: { label: 'Show them', to: '/inventory?state=review' } });
  }

  const noPar = tracked.filter((i) => i.par_level == null && numericValue(i.current_value) != null);
  if (noPar.length >= 3) {
    out.push({ id: 'no-par', tone: 'info', title: `${noPar.length} items have no par level`, detail: 'Without a par, they can never show as low. Setting one takes a few seconds per item.', action: { label: 'Set par levels', to: '/inventory?state=untracked' } });
  }

  const fastest = suggestions.filter((s) => s.forecast.dailyRate && s.item.par_level).sort((a, b) => b.forecast.dailyRate! / b.item.par_level! - a.forecast.dailyRate! / a.item.par_level!)[0];
  if (fastest?.forecast.dailyRate) {
    out.push({ id: `fast-${fastest.item.id}`, tone: 'ok', title: `${fastest.item.name} is your fastest mover`, detail: `It goes through about ${formatRate(fastest.forecast.dailyRate)} a day against a par of ${fastest.item.par_level}. Consider raising its par.`, action: { label: 'Open item', to: `/inventory/${fastest.item.id}` } });
  }

  return out;
}

export interface AppNotification {
  id: string;
  tone: InsightTone;
  title: string;
  detail?: string;
  to: string;
  at: string;
}

export function deriveNotifications(items: readonly InventoryItem[], orders: readonly PurchaseOrder[], suppliers: readonly Supplier[], now: Date = new Date()): AppNotification[] {
  const out: AppNotification[] = [];
  for (const i of items) {
    const s = stockState(i);
    if (s === 'out') out.push({ id: `out:${i.id}:${i.updated_at}`, tone: 'danger', title: `${i.name} is out of stock`, detail: i.category, to: `/inventory/${i.id}`, at: i.updated_at });
  }
  const low = items.filter((i) => stockState(i) === 'low');
  if (low.length) {
    const latest = low.reduce((a, b) => (a.updated_at > b.updated_at ? a : b));
    out.push({ id: `low:${low.length}:${latest.updated_at}`, tone: 'warning', title: `${low.length} ${low.length === 1 ? 'item is' : 'items are'} at or below par`, detail: low.slice(0, 3).map((i) => i.name).join(', ') + (low.length > 3 ? '…' : ''), to: '/reorder', at: latest.updated_at });
  }
  const today = now.toISOString().slice(0, 10);
  const name = (id: number) => suppliers.find((s) => s.id === id)?.name ?? 'supplier';
  for (const po of orders) {
    if ((po.status === 'sent' || po.status === 'partially_received') && po.expected_on) {
      if (po.expected_on < today) out.push({ id: `late:${po.id}`, tone: 'danger', title: `${po.number} from ${name(po.supplier_id)} is overdue`, detail: `Expected ${po.expected_on}`, to: `/orders/${po.id}`, at: `${po.expected_on}T00:00:00Z` });
      else if (po.expected_on === today) out.push({ id: `due:${po.id}`, tone: 'info', title: `${po.number} from ${name(po.supplier_id)} arrives today`, detail: 'Receive it when it lands to update stock.', to: `/orders/${po.id}`, at: `${po.expected_on}T00:00:00Z` });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
