import { forecastItem, type Forecast } from './trends';
import { needsReorder, stockState, STATE_ORDER } from './quantity';
import { FREQUENCY_DAYS, NO_SUBCATEGORY, type InventoryItem, type ReorderFrequency, type StockCount, type StockState, type SubcategorySchedule, type Supplier } from './types';

export interface RestockSuggestion {
  item: InventoryItem;
  state: StockState;
  forecast: Forecast;
  frequency: ReorderFrequency;
  reason: 'below-par' | 'out' | 'projected';
  /** Lower is more urgent. */
  urgency: number;
}

/**
 * Default ordering cadence by category, used until someone sets a schedule for
 * a group. Carried over from the original dashboard: perishable, frequently made
 * items lean weekly; bulk staples and non-perishables lean monthly.
 */
export const DEFAULT_FREQUENCY: Readonly<Record<string, ReorderFrequency>> = {
  Gelato: 'weekly',
  'Cookies & Pastries': 'weekly',
  'Truffles & Chocolates': 'biweekly',
  'Gelato Supplies': 'biweekly',
  'Gelato/Drink/Pastry/Chocolate Supplies': 'biweekly',
  'Covertures, Waffle Mix, Coffee, Water & Soda': 'monthly',
  'House Supplies': 'monthly',
};

/** Schedules are kept per category + subcategory; items without one use "Uncategorized". */
export function groupKey(item: Pick<InventoryItem, 'category' | 'subcategory'>): { category: string; subcategory: string } {
  const sub = item.subcategory?.trim();
  return { category: item.category, subcategory: sub ? sub : NO_SUBCATEGORY };
}

export function scheduleRow(item: Pick<InventoryItem, 'category' | 'subcategory'>, schedules: readonly SubcategorySchedule[]): SubcategorySchedule | undefined {
  const g = groupKey(item);
  return schedules.find((s) => s.category === g.category && s.subcategory === g.subcategory);
}

export function scheduleFor(item: Pick<InventoryItem, 'category' | 'subcategory'>, schedules: readonly SubcategorySchedule[]): ReorderFrequency {
  return scheduleRow(item, schedules)?.frequency ?? DEFAULT_FREQUENCY[item.category] ?? 'monthly';
}

/**
 * Items to order now: everything at/below par, plus anything the forecast says
 * will cross par before the next order cycle comes around.
 */
export function restockSuggestions(
  items: readonly InventoryItem[],
  countsByItem: ReadonlyMap<number, readonly StockCount[]>,
  schedules: readonly SubcategorySchedule[],
  suppliers: readonly Supplier[] = [],
  now: Date = new Date(),
): RestockSuggestion[] {
  const leadById = new Map(suppliers.map((s) => [s.id, s.lead_time_days ?? 0]));
  const out: RestockSuggestion[] = [];

  for (const item of items) {
    const state = stockState(item);
    if (state === 'untracked' || state === 'review') continue;
    const frequency = scheduleFor(item, schedules);
    const cycleDays = FREQUENCY_DAYS[frequency];
    const leadTimeDays = item.supplier_id != null ? leadById.get(item.supplier_id) ?? 0 : 0;
    const forecast = forecastItem(item, countsByItem.get(item.id) ?? [], { now, cycleDays, leadTimeDays });

    let reason: RestockSuggestion['reason'] | null = null;
    if (state === 'out') reason = 'out';
    else if (needsReorder(item)) reason = 'below-par';
    else if (forecast.status === 'ok' && forecast.daysToPar != null && forecast.daysToPar <= cycleDays + leadTimeDays) reason = 'projected';
    if (!reason) continue;

    const urgency = STATE_ORDER[state] * 1000 + (forecast.daysToEmpty ?? 999);
    out.push({ item, state, forecast, frequency, reason, urgency });
  }
  return out.sort((a, b) => a.urgency - b.urgency || a.item.name.localeCompare(b.item.name));
}

export const REASON_LABEL: Record<RestockSuggestion['reason'], string> = {
  out: 'Out of stock',
  'below-par': 'At or below par',
  projected: 'Will drop below par before next order',
};
