import { describe, expect, it } from 'vitest';
import { createDemoSource } from './demoSource';
import { DEMO_PEOPLE } from './seed';
import { applyReceipt } from '../receiving';
import { DataError } from '../source';

const NOW = new Date(2026, 9, 29, 12).getTime();

async function as(role: 'admin' | 'staff' | 'viewer') {
  const s = createDemoSource({ latencyMs: 0, persist: false, now: () => NOW });
  await s.signInWithPassword(DEMO_PEOPLE.find((p) => p.role === role)!.email, 'x');
  return s;
}
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof DataError ? e.code : 'unknown';
  }
};

describe('demo backend mirrors the database rules', () => {
  it('keeps people waiting for approval out, like the original sign-in page', async () => {
    const s = createDemoSource({ latencyMs: 0, persist: false, now: () => NOW });
    await s.signInWithPassword(DEMO_PEOPLE.find((p) => p.pending)!.email, 'x');
    expect(await code(s.getProfile())).toBe('forbidden');
    expect(await code(s.listItems())).toBe('ok');
    expect(await s.listItems()).toEqual([]);
  });

  it('guards admins the way the database trigger does', async () => {
    const s = await as('admin');
    expect(await code(s.updateProfile('demo-admin', { role: 'staff', categories: ['Gelato'] }))).toBe('conflict');
    expect(await code(s.rejectProfile('demo-staff'))).toBe('conflict');
    expect(await code(s.updateProfile('demo-pending', { role: 'viewer', categories: ['Gelato'], pending: false }))).toBe('ok');
    expect(s.db().profiles.find((p) => p.user_id === 'demo-pending')).toMatchObject({ role: 'viewer', categories: ['Gelato'], pending: false });
  });

  it('keeps an order day and vendor link when only the frequency changes', async () => {
    const s = await as('admin');
    const row = s.db().schedules.find((x) => x.vendor_url)!;
    await s.setSchedule({ category: row.category, subcategory: row.subcategory, frequency: 'monthly' });
    expect(s.db().schedules.find((x) => x.category === row.category && x.subcategory === row.subcategory)).toMatchObject({ frequency: 'monthly', vendor_url: row.vendor_url });
  });

  it('scopes items and counts by category for staff', async () => {
    const s = await as('staff');
    const items = await s.listItems();
    const allowed = DEMO_PEOPLE.find((p) => p.role === 'staff')!.categories!;
    expect(items.every((i) => allowed.includes(i.category))).toBe(true);
    const counts = await s.listCounts();
    const ids = new Set(items.map((i) => i.id));
    expect(counts.every((c) => ids.has(c.item_id))).toBe(true);
  });

  it('staff can count in scope but not edit metadata or count out of scope', async () => {
    const s = await as('staff');
    const mine = (await s.listItems())[0]!;
    const other = s.db().items.find((i) => i.category === 'House Supplies')!;
    expect(await code(s.recordCount(mine.id, '5'))).toBe('ok');
    expect(await code(s.recordCount(other.id, '5'))).toBe('forbidden');
    expect(await code(s.updateItems([mine.id], { par_level: 99 }))).toBe('forbidden');
    expect(await code(s.deleteItems([mine.id]))).toBe('forbidden');
  });

  it('viewers are read-only', async () => {
    const s = await as('viewer');
    const item = (await s.listItems())[0]!;
    expect(await code(s.recordCount(item.id, '5'))).toBe('forbidden');
    expect(await code(s.createSupplier({ name: 'x', contact_name: null, email: null, phone: null, website: null, lead_time_days: null, notes: null }))).toBe('forbidden');
    expect(await code(s.listProfiles())).toBe('forbidden');
  });

  it('validates counts and blocks duplicate items', async () => {
    const s = await as('admin');
    const item = s.db().items[0]!;
    expect(await code(s.recordCount(item.id, '   '))).toBe('validation');
    expect(await code(s.recordCount(item.id, 'x'.repeat(121)))).toBe('validation');
    expect(await code(s.createItem({ name: item.name.toUpperCase(), category: item.category, subcategory: null, unit_type: 'count', current_value: null, par_level: null, par_source_note: null, supplier_id: null, status: 'active', notes: null }))).toBe('conflict');
  });

  it('enforces the order lifecycle', async () => {
    const s = await as('admin');
    const draft = s.db().purchaseOrders.find((p) => p.status === 'draft')!;
    expect(await code(s.receivePurchaseOrder(draft.id, [{ line_id: draft.lines[0]!.id, quantity: 1 }]))).toBe('conflict');
    const received = s.db().purchaseOrders.find((p) => p.status === 'received')!;
    expect(await code(s.updatePurchaseOrder(received.id, { status: 'sent' }))).toBe('conflict');
    expect(await code(s.deleteSupplier(s.db().purchaseOrders.find((p) => p.status === 'sent')!.supplier_id))).toBe('conflict');
  });

  it('admins cannot demote themselves', async () => {
    const s = await as('admin');
    expect(await code(s.updateProfile('demo-admin', { role: 'staff' }))).toBe('conflict');
  });

  it('records every write in the audit log with the actor', async () => {
    const s = await as('admin');
    const item = s.db().items[0]!;
    await s.updateItems([item.id], { par_level: 9 });
    expect(s.db().audit[0]).toMatchObject({ table_name: 'inventory_items', record_id: String(item.id), action: 'update', actor_email: 'alex.rivera@demo.tifa', changed: { par_level: { to: 9 } } });
  });

  it('signs out cleanly', async () => {
    const s = await as('admin');
    await s.signOut();
    expect(await s.getUser()).toBeNull();
    expect(await code(s.listItems())).toBe('unauthorized');
  });
});

describe('applyReceipt (mirrors receive_purchase_order SQL)', () => {
  it.each([
    ['4', 3, '7', true],
    ['2.5', 0.5, '3', true],
    [null, 6, '6', true],
    ['', 6, '6', true],
    ['2 boxes', 3, '2 boxes', false],
    ['40%', 1, '40%', false],
  ])('%j + %d → %j (reconciled: %s)', (current, received, value, reconciled) => {
    expect(applyReceipt(current, received)).toEqual({ value, reconciled });
  });
});
