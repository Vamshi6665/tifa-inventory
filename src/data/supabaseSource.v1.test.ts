/**
 * Before the 2.0 database update runs, the app must work against the v1 tables
 * exactly as dashboard.html did. These tests drive the adapter with a fake
 * PostgREST client that behaves like the v1 database: no suppliers table, no
 * RPCs, no supplier_id column.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseSource, isMissing } from './supabaseSource';

type Row = Record<string, unknown>;
interface Call {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  body?: unknown;
  filters: string[];
}

function fakeDb(opts: { updated: boolean; tables?: Record<string, Row[]>; user?: { id: string; email: string; name?: string } }) {
  const calls: Call[] = [];
  const rpcs: Array<[string, unknown]> = [];
  const tables = opts.tables ?? {};
  const v2Only = ['suppliers', 'purchase_orders', 'purchase_order_lines', 'audit_log'];
  const user = opts.user ?? { id: 'u-admin', email: 'owner@tifa.test', name: 'Naina B' };

  const from = (table: string) => {
    const call: Call = { table, op: 'select', filters: [] };
    calls.push(call);
    const b: Record<string, unknown> = {};
    const chain = (name: string) => (...a: unknown[]) => (call.filters.push(`${name}:${JSON.stringify(a)}`), b);
    for (const m of ['select', 'order', 'eq', 'in', 'lt', 'gte', 'limit', 'range', 'maybeSingle', 'single']) b[m] = chain(m);
    for (const op of ['insert', 'update', 'upsert'] as const) b[op] = (body: unknown) => ((call.op = op), (call.body = body), b);
    b.delete = () => ((call.op = 'delete'), b);
    b.then = (res: (v: unknown) => unknown) => {
      if (!opts.updated && v2Only.includes(table)) {
        return Promise.resolve({ data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` } }).then(res);
      }
      const body = call.body as Row | undefined;
      if (!opts.updated && table === 'inventory_items' && body && 'supplier_id' in body) {
        return Promise.resolve({ data: null, error: { code: 'PGRST204', message: "Could not find the 'supplier_id' column of 'inventory_items' in the schema cache" } }).then(res);
      }
      const rows = tables[table] ?? [];
      const single = call.filters.some((f) => f.startsWith('maybeSingle') || f.startsWith('single'));
      const data = call.op === 'select' ? (single ? (rows[0] ?? null) : rows) : call.op === 'insert' && single ? { id: 99, ...body } : [{ id: 1 }];
      return Promise.resolve({ data, error: null }).then(res);
    };
    return b;
  };
  const rpc = async (name: string, args: unknown) => {
    rpcs.push([name, args]);
    return opts.updated ? { data: null, error: null } : { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } };
  };
  const session = { user: { id: user.id, email: user.email, user_metadata: { full_name: user.name } } };
  const client = {
    from,
    rpc,
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: async () => undefined,
    auth: {
      getSession: async () => ({ data: { session } }),
      getUser: async () => ({ data: { user: session.user } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  } as unknown as SupabaseClient;
  return { source: createSupabaseSource('https://x', 'k', client), calls, rpcs };
}

const writes = (calls: Call[]) => calls.filter((c) => c.op !== 'select').map((c) => ({ table: c.table, op: c.op, body: c.body }));

describe('before the database update (v1 tables only)', () => {
  it('records a count the way v1 did: update the item, then log the count', async () => {
    const { source, calls, rpcs } = fakeDb({ updated: false });
    await source.recordCount(7, ' 1new+.75 ');
    expect(rpcs).toEqual([]);
    const w = writes(calls);
    expect(w[0]).toMatchObject({ table: 'inventory_items', op: 'update', body: { current_value: '1new+.75' } });
    expect(w[1]).toMatchObject({ table: 'inventory_counts', op: 'insert', body: { item_id: 7, recorded_value: '1new+.75', recorded_by: 'Naina B', source: 'manual' } });
    expect((w[1]!.body as Row).recorded_at).toBe((w[0]!.body as Row).last_verified_at);
  });

  it('confirms counts by stamping last_verified_at, without changing the value', async () => {
    const { source, calls } = fakeDb({ updated: false });
    await source.verifyItems([1, 2]);
    const [w] = writes(calls);
    expect(w).toMatchObject({ table: 'inventory_items', op: 'update' });
    expect(Object.keys(w!.body as Row)).toEqual(['last_verified_at']);
  });

  it('keeps purchasing and the activity log switched off instead of erroring', async () => {
    const { source } = fakeDb({ updated: false });
    expect(await source.listSuppliers()).toEqual([]);
    expect(await source.listPurchaseOrders()).toEqual([]);
    expect(await source.listAudit({ limit: 10 })).toEqual([]);
    await expect(source.createSupplier({ name: 'X', contact_name: null, email: null, phone: null, website: null, lead_time_days: null, notes: null })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('tells the app which features exist, and trusts v1’s own policies for employees', async () => {
    const employee = fakeDb({ updated: false, tables: { profiles: [{ id: 'u-1', email: 'e@tifa.test', role: 'employee' }], category_access: [] } });
    expect(await employee.source.getProfile()).toMatchObject({ role: 'staff', categories: null, features: { purchasing: false, audit: false, viewerRole: false } });
    const scoped = fakeDb({ updated: false, tables: { profiles: [{ id: 'u-1', email: 'e@tifa.test', role: 'employee' }], category_access: [{ category: 'Gelato' }] } });
    expect(await scoped.source.getProfile()).toMatchObject({ categories: ['Gelato'] });
  });

  it('still keeps pending accounts out', async () => {
    const { source } = fakeDb({ updated: false, tables: { profiles: [{ id: 'u-1', email: 'p@tifa.test', role: 'pending' }] } });
    await expect(source.getProfile()).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('saves items even though supplier_id doesn’t exist yet (empty 2.0-only columns are dropped)', async () => {
    const { source, calls } = fakeDb({ updated: false });
    await source.updateItems([3], { par_level: 4, supplier_id: null, location: 'Back freezer' });
    const ok = writes(calls).at(-1)!;
    expect(ok.body).toEqual({ par_level: 4, location: 'Back freezer' });
  });

  it('approves someone the way v1’s Manage access tab did', async () => {
    const { source, calls } = fakeDb({ updated: false, tables: { profiles: [{ id: 'u-new', role: 'pending' }], category_access: [] } });
    await source.updateProfile('u-new', { role: 'staff', categories: ['Gelato', 'House Supplies'], pending: false });
    const w = writes(calls);
    expect(w[0]).toMatchObject({ table: 'profiles', op: 'update', body: { role: 'employee', approved_by: 'u-admin' } });
    expect(w[1]).toMatchObject({ table: 'category_access', op: 'insert', body: [{ user_id: 'u-new', category: 'Gelato', granted_by: 'u-admin' }, { user_id: 'u-new', category: 'House Supplies', granted_by: 'u-admin' }] });
  });

  it('doesn’t offer the Viewer role until the update adds it', async () => {
    const { source } = fakeDb({ updated: false, tables: { profiles: [{ id: 'u-new', role: 'pending' }] } });
    await expect(source.updateProfile('u-new', { role: 'viewer', categories: ['Gelato'], pending: false })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('stops an admin removing their own admin access', async () => {
    const { source } = fakeDb({ updated: false, tables: { profiles: [{ id: 'u-admin', role: 'admin' }] } });
    await expect(source.updateProfile('u-admin', { role: 'staff', categories: ['Gelato'] })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('turns down a request by deleting the pending profile', async () => {
    const { source, calls } = fakeDb({ updated: false });
    await source.rejectProfile('u-new');
    expect(writes(calls)).toEqual([{ table: 'profiles', op: 'delete', body: undefined }]);
    expect(calls.at(-1)!.filters).toContain('eq:["role","pending"]');
  });
});

describe('after the database update', () => {
  it('uses the transactional functions and reports every feature', async () => {
    const { source, rpcs, calls } = fakeDb({ updated: true, tables: { profiles: [{ id: 'u-admin', email: 'o@tifa.test', role: 'admin' }], category_access: [] } });
    await source.recordCount(7, '4', 'note');
    await source.verifyItems([7]);
    expect(rpcs.map((r) => r[0])).toEqual(['record_count', 'verify_items']);
    expect(writes(calls)).toEqual([]);
    expect(await source.getProfile()).toMatchObject({ role: 'admin', features: { purchasing: true, audit: true, viewerRole: true } });
  });
});

describe('isMissing', () => {
  it.each([
    [{ code: 'PGRST205', message: "Could not find the table 'public.suppliers' in the schema cache" }, true],
    [{ code: '42P01', message: 'relation "public.suppliers" does not exist' }, true],
    [{ code: 'PGRST202', message: 'Could not find the function public.record_count' }, true],
    [{ code: '42501', message: 'permission denied' }, false],
    [null, false],
  ])('%j → %s', (e, expected) => {
    expect(isMissing(e)).toBe(expected);
  });
});
