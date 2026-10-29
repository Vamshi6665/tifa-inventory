import { useMemo } from 'react';
import { useItems, useOrders } from '@/data/hooks';
import { needsReorder, stockState } from '@/domain/quantity';

export function useNavBadges(): Record<'reorder' | 'orders' | 'review', number> {
  const items = useItems();
  const orders = useOrders();
  return useMemo(() => {
    const list = items.data ?? [];
    return {
      reorder: list.filter(needsReorder).length,
      review: list.filter((i) => stockState(i) === 'review').length,
      orders: (orders.data ?? []).filter((o) => o.status === 'sent' || o.status === 'partially_received').length,
    };
  }, [items.data, orders.data]);
}
