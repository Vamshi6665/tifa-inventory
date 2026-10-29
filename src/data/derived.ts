import { useMemo } from 'react';
import { deriveInsights, deriveNotifications } from '@/domain/insights';
import { restockSuggestions } from '@/domain/reorder';
import { isTracked } from '@/domain/quantity';
import { useCountsByItem, useItems, useOrders, useSchedules, useSuppliers } from './hooks';

/** Restock suggestions shared by the dashboard, reorder page and nav badges. */
export function useRestock() {
  const items = useItems();
  const counts = useCountsByItem();
  const schedules = useSchedules();
  const suppliers = useSuppliers();
  const suggestions = useMemo(
    () => (items.data ? restockSuggestions(items.data.filter(isTracked), counts.map, schedules.data ?? [], suppliers.data ?? []) : []),
    [items.data, counts.map, schedules.data, suppliers.data],
  );
  // Wait for every input: rendering early and regrouping when suppliers arrive shifts the layout.
  return { suggestions, isPending: items.isPending || counts.isPending || schedules.isPending || suppliers.isPending, error: items.error ?? counts.error };
}

export function useInsights() {
  const items = useItems();
  const { suggestions, isPending } = useRestock();
  const insights = useMemo(() => (items.data ? deriveInsights(items.data, suggestions) : []), [items.data, suggestions]);
  return { insights, isPending };
}

export function useNotifications(enabled = true) {
  const items = useItems();
  const orders = useOrders();
  const suppliers = useSuppliers();
  return useMemo(
    () => (enabled && items.data ? deriveNotifications(items.data, orders.data ?? [], suppliers.data ?? []) : []),
    [enabled, items.data, orders.data, suppliers.data],
  );
}
