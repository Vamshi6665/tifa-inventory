import type { LiveTable } from './source';

export const qk = {
  me: ['me'] as const,
  items: ['items'] as const,
  counts: ['counts'] as const,
  schedules: ['schedules'] as const,
  suppliers: ['suppliers'] as const,
  orders: ['orders'] as const,
  profiles: ['profiles'] as const,
  audit: ['audit'] as const,
};

export function keysFor(table: LiveTable): ReadonlyArray<readonly string[]> {
  switch (table) {
    case 'inventory_items':
      return [qk.items, qk.audit];
    case 'inventory_counts':
      return [qk.items, qk.counts, qk.audit];
    case 'suppliers':
      return [qk.suppliers, qk.items, qk.audit];
    case 'purchase_orders':
      return [qk.orders, qk.items, qk.counts, qk.audit];
    case 'profiles':
      return [qk.profiles, qk.me, qk.audit];
    case 'subcategory_schedules':
      return [qk.schedules, qk.audit];
  }
}
