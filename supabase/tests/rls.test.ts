/**
 * Runs the real migration against a copy of the v1 schema in real Postgres
 * (PGlite) and checks the permission rules as each kind of user. These are the
 * rules the UI mirrors; if one fails here, hiding a button would not have been enough.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const BASELINE = read('./fixtures/baseline.sql');
const MIGRATION = read('../migrations/20261029000001_redesign.sql');

const OWNER = '00000000-0000-0000-0000-000000000001';
const STAFF = '00000000-0000-0000-0000-000000000002';
const NEWBIE = '00000000-0000-0000-0000-000000000003';
const VIEWER = '00000000-0000-0000-0000-000000000004';
const SECOND_ADMIN = '00000000-0000-0000-0000-000000000005';

let db: PGlite;

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec('reset role');
  if (user) {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [user, JSON.stringify({ sub: user, email: `${user.slice(-1)}@tifa.test` })]);
    await db.exec('set role authenticated');
  } else {
    await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)`);
    await db.exec('set role anon');
  }
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
async function expectDenied(p: Promise<unknown>, code = '42501') {
  await expect(p).rejects.toMatchObject({ code });
}
const role = async (id: string) => (await admin<{ role: string }>(`select role from public.profiles where id = $1`, [id]))[0]?.role;
const grants = async (id: string) => (await admin<{ category: string }>(`select category from public.category_access where user_id = $1 order by category`, [id])).map((r) => r.category);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BASELINE);
  // The shop as it is in v1: an owner (admin), one approved employee, data and history.
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data, created_at) values
      ('${OWNER}', 'owner@tifa.test', '{"full_name": "Naina B"}', now() - interval '90 days'),
      ('${STAFF}', 'staff@tifa.test', '{}', now() - interval '30 days');
    update public.profiles set role = 'admin', approved_at = now() where id = '${OWNER}';
    update public.profiles set role = 'employee', approved_at = now(), approved_by = '${OWNER}' where id = '${STAFF}';
    insert into public.category_access (user_id, category, granted_by) values ('${STAFF}', 'Gelato Supplies', '${OWNER}');
    insert into public.inventory_items (name, category, subcategory, unit_type, current_value, par_level) values
      ('Pistachio paste', 'Gelato Supplies', 'Pastes', 'count', '6', 3),
      ('Napkins (case)', 'House Supplies', 'Paper Goods', 'freeform', '2 boxes', 2),
      ('Mango', 'Gelato', null, 'count', '1', 2);
    insert into public.inventory_counts (item_id, recorded_value, recorded_at, source) values (1, '6', now() - interval '7 days', 'migrated');
    insert into public.subcategory_schedules (category, subcategory, reorder_frequency, reorder_day, vendor_url)
      values ('Gelato Supplies', 'Pastes', 'biweekly', 'Monday', 'https://supplier.example/pastes');
  `);
  await db.exec(MIGRATION);
}, 60_000);

describe('migration on the v1 schema', () => {
  it('is idempotent', async () => {
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
  });

  it('keeps every v1 role, grant, schedule and row as it was', async () => {
    expect(await role(OWNER)).toBe('admin');
    expect(await role(STAFF)).toBe('employee');
    expect(await grants(STAFF)).toEqual(['Gelato Supplies']);
    expect(await admin(`select reorder_frequency, reorder_day, vendor_url from public.subcategory_schedules`)).toEqual([{ reorder_frequency: 'biweekly', reorder_day: 'Monday', vendor_url: 'https://supplier.example/pastes' }]);
    expect(await admin(`select count(*)::int as n from public.inventory_items`)).toEqual([{ n: 3 }]);
    expect(await admin(`select recorded_value, source from public.inventory_counts`)).toEqual([{ recorded_value: '6', source: 'migrated' }]);
  });

  it('replaces the old allow-everything policies', async () => {
    const [r] = await admin<{ n: number }>(`select count(*)::int as n from pg_policies where policyname like 'Authenticated users can%'`);
    expect(r!.n).toBe(0);
  });

  it('new sign-ups still wait for approval and see nothing', async () => {
    await admin(`insert into auth.users (id, email) values ($1, 'new@tifa.test'), ($2, 'viewer@tifa.test'), ($3, 'second@tifa.test')`, [NEWBIE, VIEWER, SECOND_ADMIN]);
    expect(await role(NEWBIE)).toBe('pending');
    expect(await as(NEWBIE, 'select * from public.inventory_items')).toHaveLength(0);
    expect(await as(NEWBIE, 'select * from public.suppliers')).toHaveLength(0);
    expect(await as<{ app_role: string | null }>(NEWBIE, 'select public.app_role()')).toEqual([{ app_role: null }]);
  });
});

describe('team access (set_member_access / reject_member)', () => {
  it('only admins can change access', async () => {
    await expectDenied(as(STAFF, `select public.set_member_access($1, 'staff', array['Gelato'])`, [NEWBIE]));
    await expectDenied(as(STAFF, `select public.reject_member($1)`, [NEWBIE]));
  });

  it('approving sets the role, the approval stamp and the categories in one step', async () => {
    await as(OWNER, `select public.set_member_access($1, 'viewer', array['Gelato', 'House Supplies'])`, [VIEWER]);
    const [p] = await admin<{ role: string; approved_by: string; approved: boolean }>(`select role, approved_by, approved_at is not null as approved from public.profiles where id = $1`, [VIEWER]);
    expect(p).toEqual({ role: 'viewer', approved_by: OWNER, approved: true });
    expect(await grants(VIEWER)).toEqual(['Gelato', 'House Supplies']);
  });

  it('staff are stored as v1 "employee" and category lists are replaced, not appended', async () => {
    await as(OWNER, `select public.set_member_access($1, 'staff', array['Gelato Supplies', 'Gelato'])`, [SECOND_ADMIN]);
    await as(OWNER, `select public.set_member_access($1, null, array['Gelato'])`, [SECOND_ADMIN]);
    expect(await role(SECOND_ADMIN)).toBe('employee');
    expect(await grants(SECOND_ADMIN)).toEqual(['Gelato']);
  });

  it('protects admins: no self-demotion, no removing the last admin, no deleting an admin', async () => {
    await expect(as(OWNER, `select public.set_member_access($1, 'staff', array['Gelato'])`, [OWNER])).rejects.toMatchObject({ code: 'P0001' });
    await as(OWNER, `select public.set_member_access($1, 'admin', null)`, [SECOND_ADMIN]);
    await as(SECOND_ADMIN, `select public.set_member_access($1, 'staff', array['Gelato'])`, [OWNER]);
    expect(await role(OWNER)).toBe('employee');
    await expect(as(OWNER, `select public.set_member_access($1, 'staff', array['Gelato'])`, [SECOND_ADMIN])).rejects.toMatchObject({ code: '42501' });
    await as(SECOND_ADMIN, `select public.set_member_access($1, 'admin', null)`, [OWNER]);
    await as(OWNER, `select public.set_member_access($1, 'pending', null)`, [SECOND_ADMIN]);
    expect(await role(SECOND_ADMIN)).toBe('pending');
    // Now OWNER is the only admin and can't be demoted by anyone.
    await expect(admin(`update public.profiles set role = 'employee' where id = $1`, [OWNER])).rejects.toMatchObject({ code: 'P0001' });
    await expect(admin(`delete from public.profiles where id = $1`, [OWNER])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('removing access sends someone back to pending and clears their categories', async () => {
    await as(OWNER, `select public.set_member_access($1, 'staff', array['Gelato'])`, [SECOND_ADMIN]);
    await as(OWNER, `select public.set_member_access($1, 'pending', null)`, [SECOND_ADMIN]);
    expect(await role(SECOND_ADMIN)).toBe('pending');
    expect(await grants(SECOND_ADMIN)).toEqual([]);
  });

  it('only pending sign-ups can be turned down', async () => {
    await expect(as(OWNER, `select public.reject_member($1)`, [STAFF])).rejects.toMatchObject({ code: 'P0001' });
    await as(OWNER, `select public.reject_member($1)`, [SECOND_ADMIN]);
    expect(await role(SECOND_ADMIN)).toBeUndefined();
  });

  it('non-admins can’t change their own role directly', async () => {
    await as(STAFF, `update public.profiles set role = 'admin' where id = $1`, [STAFF]);
    await as(STAFF, `insert into public.category_access (user_id, category) values ($1, 'Gelato')`, [STAFF]).catch(() => undefined);
    expect(await role(STAFF)).toBe('employee');
    expect(await grants(STAFF)).toEqual(['Gelato Supplies']);
  });

  it('a first sign-in can only create its own profile as pending', async () => {
    const id = '00000000-0000-0000-0000-000000000009';
    await admin(`insert into auth.users (id, email) values ($1, 'x@tifa.test')`, [id]);
    await admin(`delete from public.profiles where id = $1`, [id]);
    await expectDenied(as(id, `insert into public.profiles (id, email, role) values ($1, 'x@tifa.test', 'admin')`, [id]));
    await as(id, `insert into public.profiles (id, email, role) values ($1, 'x@tifa.test', 'pending')`, [id]);
    expect(await role(id)).toBe('pending');
  });
});

describe('category-scoped reads', () => {
  it('staff only see their categories, including history', async () => {
    const items = await as<{ name: string }>(STAFF, 'select name from public.inventory_items order by id');
    expect(items.map((i) => i.name)).toEqual(['Pistachio paste']);
    const counts = await as(STAFF, 'select * from public.inventory_counts');
    expect(counts.length).toBeGreaterThan(0);
    expect(counts.every((c) => c.item_id === 1)).toBe(true);
  });

  it('viewers see their granted categories; admins see everything', async () => {
    expect((await as<{ name: string }>(VIEWER, 'select name from public.inventory_items order by id')).map((i) => i.name)).toEqual(['Napkins (case)', 'Mango']);
    expect(await as(OWNER, 'select id from public.inventory_items')).toHaveLength(3);
  });

  it('people see only their own profile and grants; admins see the whole team', async () => {
    expect(await as(STAFF, 'select id from public.profiles')).toEqual([{ id: STAFF }]);
    expect(await as(STAFF, 'select category from public.category_access')).toEqual([{ category: 'Gelato Supplies' }]);
    expect((await as(OWNER, 'select id from public.profiles')).length).toBeGreaterThan(3);
  });

  it('signed-out visitors see nothing', async () => {
    expect(await as(null, 'select id from public.inventory_items')).toHaveLength(0);
    expect(await as(null, 'select * from public.suppliers')).toHaveLength(0);
    expect(await as(null, 'select * from public.profiles')).toHaveLength(0);
  });
});

describe('writing stock', () => {
  it('staff record counts in their categories through record_count', async () => {
    await as(STAFF, `select public.record_count(1, ' 4 ', 'after Friday rush')`);
    const [item] = await admin<{ current_value: string; verified: boolean }>(`select current_value, last_verified_at is not null as verified from public.inventory_items where id = 1`);
    expect(item).toEqual({ current_value: '4', verified: true });
    const [count] = await admin(`select recorded_value, source, note, recorded_by from public.inventory_counts where item_id = 1 order by id desc limit 1`);
    expect(count).toEqual({ recorded_value: '4', source: 'manual', note: 'after Friday rush', recorded_by: 'staff@tifa.test' });
  });

  it('uses the person’s name for recorded_by when they have one', async () => {
    await as(OWNER, `select public.record_count(3, '2')`);
    const [count] = await admin(`select recorded_by from public.inventory_counts where item_id = 3 order by id desc limit 1`);
    expect(count).toEqual({ recorded_by: 'Naina B' });
  });

  it('staff cannot count outside their categories; viewers cannot count at all', async () => {
    await expectDenied(as(STAFF, `select public.record_count(3, '5')`));
    await expectDenied(as(VIEWER, `select public.record_count(3, '5')`));
  });

  it('staff cannot edit items directly (par, value, status)', async () => {
    await as(STAFF, `update public.inventory_items set par_level = 99, current_value = '100', status = 'hold' where id = 1`);
    const [r] = await admin<{ par_level: string; current_value: string; status: string }>(`select par_level, current_value, status from public.inventory_items where id = 1`);
    expect({ ...r, par_level: Number(r!.par_level) }).toEqual({ par_level: 3, current_value: '4', status: 'active' });
  });

  it('rejects empty and oversized counts and negative par', async () => {
    await expect(as(OWNER, `select public.record_count(1, '   ')`)).rejects.toMatchObject({ code: '23514' });
    await expect(as(OWNER, `select public.record_count(1, $1)`, ['x'.repeat(121)])).rejects.toMatchObject({ code: '23514' });
    await expect(as(OWNER, `update public.inventory_items set par_level = -1 where id = 1`)).rejects.toMatchObject({ code: '23514' });
  });

  it('count history is append-only, even for admins', async () => {
    await as(OWNER, `update public.inventory_counts set recorded_value = 'tampered'`);
    await as(OWNER, `delete from public.inventory_counts`);
    const [r] = await admin<{ n: number; t: number }>(`select count(*)::int as n, count(*) filter (where recorded_value = 'tampered')::int as t from public.inventory_counts`);
    expect(r!.t).toBe(0);
    expect(r!.n).toBeGreaterThan(1);
  });

  it('verify_items confirms without changing the value, within scope', async () => {
    await as(STAFF, `select public.verify_items(array[1])`);
    await expectDenied(as(STAFF, `select public.verify_items(array[1, 3])`));
  });

  it('only admins change schedules, vendor links and order days', async () => {
    await as(STAFF, `update public.subcategory_schedules set reorder_day = 'Friday'`);
    await as(OWNER, `insert into public.subcategory_schedules (category, subcategory, reorder_frequency) values ('Gelato', 'Uncategorized', 'weekly')`);
    expect(await as(STAFF, `select reorder_day from public.subcategory_schedules where subcategory = 'Pastes'`)).toEqual([{ reorder_day: 'Monday' }]);
    expect(await as(VIEWER, `select subcategory from public.subcategory_schedules order by subcategory`)).toHaveLength(2);
  });
});

describe('purchase orders', () => {
  let poId: number;
  beforeAll(async () => {
    await as(OWNER, `insert into public.suppliers (name, lead_time_days) values ('Valle Imports', 7)`);
  });

  it('only admins create orders', async () => {
    await expectDenied(as(STAFF, `select public.create_purchase_order(1, null, null, '[{"item_id":1,"quantity":4}]'::jsonb)`));
    const [r] = await as<{ id: number }>(OWNER, `select public.create_purchase_order(1, 'rush', null, '[{"item_id":1,"quantity":4},{"item_id":2,"quantity":3}]'::jsonb) as id`);
    poId = r!.id;
    const [po] = await as<{ number: string; status: string }>(STAFF, `select number, status from public.purchase_orders where id = $1`, [poId]);
    expect(po).toEqual({ number: 'PO-1041', status: 'draft' });
  });

  it('cannot be received while still a draft', async () => {
    await expect(as(OWNER, `select public.receive_purchase_order($1, '[]'::jsonb)`, [poId])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('receiving adds to plain-number counts, keeps wording like "2 boxes", and logs both as deliveries', async () => {
    await as(OWNER, `select public.mark_purchase_order_sent($1)`, [poId]);
    const lines = await admin<{ id: number; item_id: number }>(`select id, item_id from public.purchase_order_lines where po_id = $1 order by item_id`, [poId]);
    await as(OWNER, `select public.receive_purchase_order($1, $2::jsonb)`, [poId, JSON.stringify([{ line_id: lines[0]!.id, quantity: 4 }, { line_id: lines[1]!.id, quantity: 1 }])]);
    expect(await admin(`select id, current_value from public.inventory_items where id in (1, 2) order by id`)).toEqual([
      { id: 1, current_value: '8' },
      { id: 2, current_value: '2 boxes' },
    ]);
    const deliveries = await admin<{ item_id: number; source: string; note: string }>(`select item_id, source, note from public.inventory_counts where source = 'received' order by item_id`);
    expect(deliveries.map((d) => d.item_id)).toEqual([1, 2]);
    expect(deliveries[1]!.note).toMatch(/count needs updating/);
    const [po] = await admin<{ status: string }>(`select status from public.purchase_orders where id = $1`, [poId]);
    expect(po!.status).toBe('partially_received');
  });

  it('staff can receive only lines in their categories', async () => {
    const [line] = await admin<{ id: number }>(`select id from public.purchase_order_lines where po_id = $1 and item_id = 2`, [poId]);
    await expectDenied(as(STAFF, `select public.receive_purchase_order($1, $2::jsonb)`, [poId, JSON.stringify([{ line_id: line!.id, quantity: 2 }])]));
  });
});

describe('audit log', () => {
  it('records who did what, readable only by admins and never editable', async () => {
    const entries = await as<{ table_name: string; actor_email: string }>(OWNER, `select table_name, actor_email from public.audit_log where table_name = 'inventory_counts' order by id`);
    expect(entries.some((e) => e.actor_email === '2@tifa.test')).toBe(true);
    expect(await as(STAFF, `select * from public.audit_log`)).toHaveLength(0);
    await as(OWNER, `delete from public.audit_log`);
    await as(OWNER, `update public.audit_log set actor_email = 'x'`);
    const [r] = await admin<{ n: number; x: number }>(`select count(*)::int as n, count(*) filter (where actor_email = 'x')::int as x from public.audit_log`);
    expect(r!.n).toBeGreaterThan(0);
    expect(r!.x).toBe(0);
  });

  it('records field-level changes on item edits and access changes', async () => {
    await as(OWNER, `update public.inventory_items set par_level = 5 where id = 3`);
    const [e] = await as<{ changed: Record<string, { from: unknown; to: unknown }> }>(OWNER, `select changed from public.audit_log where table_name = 'inventory_items' and record_id = '3' order by id desc limit 1`);
    expect(e!.changed.par_level).toEqual({ from: 2, to: 5 });
    const access = await as<{ record_id: string }>(OWNER, `select record_id from public.audit_log where table_name = 'category_access' and record_id = $1`, [VIEWER]);
    expect(access.length).toBe(2);
  });

  it('labels schedule changes by category and group', async () => {
    const [e] = await as<{ record_id: string }>(OWNER, `select record_id from public.audit_log where table_name = 'subcategory_schedules' order by id desc limit 1`);
    expect(e!.record_id).toBe('Gelato/Uncategorized');
  });
});
