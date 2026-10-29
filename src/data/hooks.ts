import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fillLevel, itemQuantity, stockState } from '@/domain/quantity';
import type { InventoryItem, StockCount, StockState } from '@/domain/types';
import { useData } from './DataProvider';
import { qk } from './keys';
import { DataError, type ItemPatch, type NewItemInput, type NewPurchaseOrderInput, type NewSupplierInput, type PurchaseOrderPatch, type ReceiveLine } from './source';
import { addDays } from '@/domain/dates';

const HISTORY_DAYS = 182;

export function useItems() {
  const data = useData();
  return useQuery({ queryKey: qk.items, queryFn: () => data.listItems() });
}

export function useCounts() {
  const data = useData();
  return useQuery({ queryKey: qk.counts, queryFn: () => data.listCounts(addDays(new Date(), -HISTORY_DAYS).toISOString()), staleTime: 60_000 });
}

export function useSchedules() {
  const data = useData();
  return useQuery({ queryKey: qk.schedules, queryFn: () => data.listSchedules(), staleTime: 5 * 60_000 });
}

export function useSuppliers() {
  const data = useData();
  return useQuery({ queryKey: qk.suppliers, queryFn: () => data.listSuppliers(), staleTime: 5 * 60_000 });
}

export function useOrders() {
  const data = useData();
  return useQuery({ queryKey: qk.orders, queryFn: () => data.listPurchaseOrders() });
}

export function useProfiles(enabled = true) {
  const data = useData();
  return useQuery({ queryKey: qk.profiles, queryFn: () => data.listProfiles(), enabled });
}

export function useAudit(limit = 200, enabled = true) {
  const data = useData();
  return useQuery({ queryKey: [...qk.audit, limit], queryFn: () => data.listAudit({ limit }), enabled });
}

/** An item plus everything derived from it, computed once per data change. */
export interface ItemRow extends InventoryItem {
  state: StockState;
  qty: number | null;
  level: number | null;
}

export function toRow(i: InventoryItem): ItemRow {
  return { ...i, state: stockState(i), qty: itemQuantity(i), level: fillLevel(i) };
}

export function useItemRows() {
  const q = useItems();
  const rows = useMemo(() => (q.data ?? []).map(toRow), [q.data]);
  return { ...q, rows };
}

export function useCountsByItem() {
  const q = useCounts();
  const map = useMemo(() => {
    const m = new Map<number, StockCount[]>();
    for (const c of q.data ?? []) {
      const list = m.get(c.item_id);
      if (list) list.push(c);
      else m.set(c.item_id, [c]);
    }
    for (const list of m.values()) list.sort((a, b) => a.counted_at.localeCompare(b.counted_at));
    return m;
  }, [q.data]);
  return { ...q, map };
}

/* ---------------- Mutations ---------------- */

function errorMessage(e: unknown): string {
  return e instanceof DataError ? e.message : 'Something went wrong. Try again.';
}

function useMut<V, R>(fn: (v: V) => Promise<R>, opts: { invalidate: QueryKey[]; success?: string | ((v: V) => string); optimistic?: (v: V) => (() => void) | void }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onMutate: (v) => {
      const rollback = opts.optimistic?.(v);
      return { rollback };
    },
    onError: (e, _v, ctx) => {
      ctx?.rollback?.();
      toast.error(errorMessage(e));
    },
    onSuccess: (_r, v) => {
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(v) : opts.success);
    },
    onSettled: () => {
      for (const key of opts.invalidate) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** Optimistically patch cached items so inline edits feel instant. */
function usePatchItemsCache() {
  const qc = useQueryClient();
  return (ids: number[], patch: Partial<InventoryItem>) => {
    const prev = qc.getQueryData<InventoryItem[]>(qk.items);
    void qc.cancelQueries({ queryKey: qk.items });
    qc.setQueryData<InventoryItem[]>(qk.items, (old) => old?.map((i) => (ids.includes(i.id) ? { ...i, ...patch, updated_at: new Date().toISOString() } : i)));
    return () => qc.setQueryData(qk.items, prev);
  };
}

export function useRecordCount() {
  const data = useData();
  const patch = usePatchItemsCache();
  return useMut((v: { itemId: number; value: string; note?: string | null; name?: string }) => data.recordCount(v.itemId, v.value, v.note), {
    invalidate: [qk.items, qk.counts, qk.audit],
    optimistic: (v) => patch([v.itemId], { current_value: v.value, last_verified_at: new Date().toISOString() }),
  });
}

export function useVerifyItems() {
  const data = useData();
  const patch = usePatchItemsCache();
  return useMut((ids: number[]) => data.verifyItems(ids), {
    invalidate: [qk.items, qk.audit],
    success: (ids) => (ids.length === 1 ? 'Count confirmed' : `${ids.length} counts confirmed`),
    optimistic: (ids) => patch(ids, { last_verified_at: new Date().toISOString() }),
  });
}

export function useUpdateItems() {
  const data = useData();
  const patch = usePatchItemsCache();
  return useMut((v: { ids: number[]; patch: ItemPatch; message?: string }) => data.updateItems(v.ids, v.patch), {
    invalidate: [qk.items, qk.audit],
    success: (v) => v.message ?? (v.ids.length === 1 ? 'Item updated' : `${v.ids.length} items updated`),
    optimistic: (v) => patch(v.ids, v.patch),
  });
}

export function useCreateItem() {
  const data = useData();
  return useMut((input: NewItemInput) => data.createItem(input), { invalidate: [qk.items, qk.counts, qk.audit], success: (i) => `Added ${i.name}` });
}

export function useDeleteItems() {
  const data = useData();
  return useMut((ids: number[]) => data.deleteItems(ids), { invalidate: [qk.items, qk.counts, qk.audit], success: (ids) => (ids.length === 1 ? 'Item deleted' : `${ids.length} items deleted`) });
}

export function useSetSchedule() {
  const data = useData();
  return useMut((s: Parameters<typeof data.setSchedule>[0]) => data.setSchedule(s), { invalidate: [qk.schedules, qk.audit], success: 'Schedule saved' });
}

export function useCreateSupplier() {
  const data = useData();
  return useMut((input: NewSupplierInput) => data.createSupplier(input), { invalidate: [qk.suppliers, qk.audit], success: (s) => `Added ${s.name}` });
}
export function useUpdateSupplier() {
  const data = useData();
  return useMut((v: { id: number; patch: Partial<NewSupplierInput> }) => data.updateSupplier(v.id, v.patch), { invalidate: [qk.suppliers, qk.items, qk.audit], success: 'Supplier saved' });
}
export function useDeleteSupplier() {
  const data = useData();
  return useMut((id: number) => data.deleteSupplier(id), { invalidate: [qk.suppliers, qk.items, qk.audit], success: 'Supplier removed' });
}

export function useCreateOrder() {
  const data = useData();
  return useMut((input: NewPurchaseOrderInput) => data.createPurchaseOrder(input), { invalidate: [qk.orders, qk.audit], success: 'Draft order created' });
}
export function useUpdateOrder() {
  const data = useData();
  return useMut((v: { id: number; patch: PurchaseOrderPatch; message?: string }) => data.updatePurchaseOrder(v.id, v.patch), { invalidate: [qk.orders, qk.audit], success: (v) => v.message ?? 'Order updated' });
}
export function useReceiveOrder() {
  const data = useData();
  return useMut((v: { id: number; lines: ReceiveLine[] }) => data.receivePurchaseOrder(v.id, v.lines), { invalidate: [qk.orders, qk.items, qk.counts, qk.audit], success: 'Delivery received and stock updated' });
}

export function useUpdateProfile() {
  const data = useData();
  return useMut((v: { userId: string; patch: Parameters<typeof data.updateProfile>[1]; success?: string }) => data.updateProfile(v.userId, v.patch), {
    invalidate: [qk.profiles, qk.audit],
    success: (v) => v.success ?? 'Access updated',
  });
}
export function useRejectProfile() {
  const data = useData();
  return useMut((userId: string) => data.rejectProfile(userId), { invalidate: [qk.profiles, qk.audit], success: 'Request turned down' });
}
