import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseSource, mapCount, mapItem, mapProfile, mapSchedule } from './supabaseSource';
import { DataError } from './source';

/** Minimal chainable stand-in for the PostgREST query builder. */
function fakeClient(tables: Record<string, Array<Record<string, unknown>>>, opts: { error?: { code: string; message: string } } = {}) {
  const calls: Array<{ table: string; range?: [number, number]; filters: string[] }> = [];
  const rpc = vi.fn(async () => ({ data: null, error: opts.error ?? null }));
  const from = (table: string) => {
    const call = { table, filters: [] as string[], range: undefined as [number, number] | undefined };
    calls.push(call);
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'eq', 'in', 'lt', 'limit', 'update', 'insert', 'upsert', 'delete', 'maybeSingle', 'single']) b[m] = (...a: unknown[]) => (call.filters.push(`${m}:${JSON.stringify(a)}`), b);
    b.gte = (col: string, v: string) => (call.filters.push(`gte:${col}:${v}`), b);
    b.range = (a: number, z: number) => ((call.range = [a, z]), b);
    b.then = (res: (v: unknown) => unknown) => {
      if (opts.error) return Promise.resolve({ data: null, error: opts.error }).then(res);
      const rows = tables[table] ?? [];
      const data = call.range ? rows.slice(call.range[0], call.range[1] + 1) : rows;
      return Promise.resolve({ data, error: null }).then(res);
    };
    return b;
  };
  const client = { from, rpc, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } as unknown as SupabaseClient;
  return { client, calls, rpc };
}

describe('Supabase adapter', () => {
  it('pages past PostgREST’s silent 1,000-row cap', async () => {
    const counts = Array.from({ length: 2345 }, (_, i) => ({ id: i + 1, item_id: 1, recorded_value: String(i), recorded_at: '2026-10-01T00:00:00Z', source: 'migrated' }));
    const { client, calls } = fakeClient({ inventory_counts: counts });
    const src = createSupabaseSource('https://x', 'k', client);
    const rows = await src.listCounts('2026-01-01T00:00:00Z');
    expect(rows).toHaveLength(2345);
    expect(calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(calls[0]!.filters).toContain('gte:recorded_at:2026-01-01T00:00:00Z');
    expect(rows[2344]).toMatchObject({ value: '2344', counted_at: '2026-10-01T00:00:00Z' });
  });

  it('maps the live v1 columns', () => {
    expect(mapCount({ id: '3', item_id: '7', recorded_value: '1new+.75', recorded_at: '2026-10-01T09:00:00Z', recorded_by: 'RP', source: 'migrated' })).toEqual({ id: 3, item_id: 7, value: '1new+.75', counted_at: '2026-10-01T09:00:00Z', recorded_by: 'RP', source: 'migrated', note: null });
    expect(mapItem({ id: 1, name: 'Mango', category: 'Gelato', par_level: '2', current_value: 3, location: 'Back freezer', reorder_url: 'https://x.example/mango' })).toMatchObject({ par_level: 2, current_value: '3', status: 'active', unit_type: 'count', supplier_id: null, location: 'Back freezer', reorder_url: 'https://x.example/mango', unit_label: null });
    expect(mapSchedule({ id: 4, category: 'Gelato', subcategory: 'Uncategorized', reorder_frequency: 'weekly', reorder_day: 'Monday', vendor_url: null })).toEqual({ category: 'Gelato', subcategory: 'Uncategorized', frequency: 'weekly', reorder_day: 'Monday', vendor_url: null });
  });

  it('maps v1 roles: employee is Staff, pending and unknown roles get no access', () => {
    const row = { id: 'u1', email: 'a@b.c', full_name: 'Rekha', requested_at: '2026-07-01T00:00:00Z' };
    expect(mapProfile({ ...row, role: 'employee' }, ['Gelato', 'Cookies & Pastries'])).toMatchObject({ user_id: 'u1', display_name: 'Rekha', role: 'staff', categories: ['Cookies & Pastries', 'Gelato'], pending: false });
    expect(mapProfile({ ...row, role: 'admin' }, [])).toMatchObject({ role: 'admin', categories: null, pending: false });
    expect(mapProfile({ ...row, role: 'pending' }, [])).toMatchObject({ pending: true });
    expect(mapProfile({ ...row, role: 'something-else' }, [])).toMatchObject({ pending: true });
  });

  it('changes access through one RPC, sending Staff as v1 "employee" on the server', async () => {
    const { client, rpc } = fakeClient({});
    const src = createSupabaseSource('https://x', 'k', client);
    await src.updateProfile('u1', { role: 'staff', categories: ['Gelato'], pending: false });
    expect(rpc).toHaveBeenCalledWith('set_member_access', { p_user_id: 'u1', p_role: 'staff', p_categories: ['Gelato'] });
    await src.updateProfile('u1', { pending: true });
    expect(rpc).toHaveBeenLastCalledWith('set_member_access', { p_user_id: 'u1', p_role: 'pending', p_categories: null });
    await src.rejectProfile('u2');
    expect(rpc).toHaveBeenLastCalledWith('reject_member', { p_user_id: 'u2' });
  });

  it('treats an update that changed no rows as a permission problem', async () => {
    const { client } = fakeClient({ inventory_items: [] });
    const err = await createSupabaseSource('https://x', 'k', client).updateItems([1], { par_level: 3 }).catch((e) => e);
    expect(err).toMatchObject({ code: 'forbidden' });
  });

  it('records counts through the atomic RPC', async () => {
    const { client, rpc } = fakeClient({});
    await createSupabaseSource('https://x', 'k', client).recordCount(5, '12', 'note');
    expect(rpc).toHaveBeenCalledWith('record_count', { p_item_id: 5, p_value: '12', p_note: 'note' });
  });

  it.each([
    [{ code: '42501', message: 'permission denied for table' }, 'forbidden'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'unauthorized'],
    [{ code: '23505', message: 'duplicate key' }, 'conflict'],
    [{ code: '23514', message: 'check constraint' }, 'validation'],
    [{ code: 'P0001', message: 'Only drafts can be marked as sent.' }, 'conflict'],
  ])('turns database error %j into a %s message people can act on', async (error, code) => {
    const { client } = fakeClient({}, { error });
    const err = await createSupabaseSource('https://x', 'k', client).listItems().catch((e) => e);
    expect(err).toBeInstanceOf(DataError);
    expect(err.code).toBe(code);
    expect(err.message).not.toMatch(/constraint|JWT|duplicate key/); // no raw database text leaks to the UI
  });
});
