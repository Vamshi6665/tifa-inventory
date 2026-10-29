import { createClient, type PostgrestError, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { AuditEntry, InventoryItem, PurchaseOrder, Role, StockCount, SubcategorySchedule, Supplier, UserProfile } from '@/domain/types';
import { DataError, type AuthUser, type DataSource, type LiveTable } from './source';

/**
 * Table names in one place. These match the live Tifa project: the v1 tables
 * (inventory_items, inventory_counts, subcategory_schedules, profiles,
 * category_access) plus the ones added by the 2.0 migration.
 */
export const T = {
  items: 'inventory_items',
  counts: 'inventory_counts',
  schedules: 'subcategory_schedules',
  suppliers: 'suppliers',
  orders: 'purchase_orders',
  orderLines: 'purchase_order_lines',
  profiles: 'profiles',
  access: 'category_access',
  audit: 'audit_log',
} as const;

/** v1 stores roles as admin / employee / pending; 2.0 adds viewer. "employee" is shown as Staff. */
const ROLE_FROM_DB: Readonly<Record<string, Role>> = { admin: 'admin', employee: 'staff', viewer: 'viewer' };
export const ROLE_TO_DB: Readonly<Record<Role, string>> = { admin: 'admin', staff: 'employee', viewer: 'viewer' };

const PAGE = 1000; // PostgREST silently caps responses at 1,000 rows.

function toError(e: PostgrestError | Error | null | undefined, fallback = 'Something went wrong. Try again.'): DataError {
  if (!e) return new DataError(fallback);
  const code = 'code' in e ? e.code : undefined;
  if (code === '42501' || /row-level security|permission denied/i.test(e.message)) return new DataError('You don’t have permission to do that.', 'forbidden');
  if (code === 'PGRST301' || /JWT/i.test(e.message)) return new DataError('Your session has ended. Sign in again.', 'unauthorized');
  if (code === '23505') return new DataError('That already exists.', 'conflict');
  if (code === '23514' || code === '22P02') return new DataError('Some values aren’t valid. Check the form and try again.', 'validation');
  if (code === 'P0001') return new DataError(e.message, 'conflict'); // raised by our own SQL functions
  if (/fetch|network/i.test(e.message)) return new DataError('Can’t reach the server. Check your connection.', 'network');
  return new DataError(fallback);
}

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw toError(error);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => (v == null || v === '' ? null : Number(v));

export function mapItem(r: Row): InventoryItem {
  return {
    id: Number(r.id),
    name: String(r.name ?? ''),
    category: String(r.category ?? ''),
    subcategory: str(r.subcategory),
    unit_type: (r.unit_type as InventoryItem['unit_type']) ?? 'count',
    unit_label: str(r.unit_label),
    current_value: str(r.current_value),
    par_level: num(r.par_level),
    par_source_note: str(r.par_source_note),
    supplier: str(r.supplier),
    supplier_id: num(r.supplier_id),
    status: (r.status as InventoryItem['status']) ?? 'active',
    notes: str(r.notes),
    location: str(r.location),
    reorder_url: str(r.reorder_url),
    updated_at: String(r.updated_at ?? new Date(0).toISOString()),
    last_verified_at: str(r.last_verified_at),
  };
}

/** inventory_counts: recorded_value / recorded_at in the live schema. */
export function mapCount(r: Row): StockCount {
  return {
    id: Number(r.id),
    item_id: Number(r.item_id),
    value: String(r.recorded_value ?? ''),
    counted_at: String(r.recorded_at),
    recorded_by: str(r.recorded_by),
    source: (r.source as StockCount['source']) ?? 'manual',
    note: str(r.note),
  };
}

export function mapSchedule(r: Row): SubcategorySchedule {
  return {
    category: String(r.category),
    subcategory: String(r.subcategory),
    frequency: (r.reorder_frequency as SubcategorySchedule['frequency']) ?? 'monthly',
    reorder_day: str(r.reorder_day),
    vendor_url: str(r.vendor_url),
  };
}

/** profiles + category_access → one profile. Unknown or pending roles fail closed. */
export function mapProfile(r: Row, categories: readonly string[]): UserProfile {
  const dbRole = String(r.role ?? 'pending');
  const role = ROLE_FROM_DB[dbRole] ?? 'staff';
  return {
    user_id: String(r.id),
    email: String(r.email ?? ''),
    display_name: str(r.full_name),
    role,
    categories: role === 'admin' ? null : [...categories].sort(),
    pending: !(dbRole in ROLE_FROM_DB),
    created_at: String(r.requested_at ?? r.approved_at ?? r.created_at ?? ''),
    last_seen_at: null,
  };
}

function mapUser(u: User | null | undefined): AuthUser | null {
  if (!u) return null;
  return { id: u.id, email: u.email ?? '', name: (u.user_metadata?.full_name as string) ?? (u.user_metadata?.name as string) ?? null, avatarUrl: (u.user_metadata?.avatar_url as string) ?? null };
}

export function createSupabaseSource(url: string, anonKey: string, client?: SupabaseClient): DataSource {
  const sb = client ?? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });

  const run = async <R,>(p: PromiseLike<{ data: R; error: PostgrestError | null }>): Promise<R> => {
    const { data, error } = await p;
    if (error) throw toError(error);
    return data;
  };

  return {
    kind: 'supabase',

    async getUser() {
      const { data } = await sb.auth.getSession();
      return mapUser(data.session?.user);
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(mapUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    async signInWithPassword(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new DataError(error.status === 400 ? 'That email and password don’t match.' : 'Couldn’t sign in. Try again.', 'unauthorized');
    },
    async signInWithGoogle() {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } });
      if (error) throw new DataError('Couldn’t start Google sign-in.', 'unknown');
    },
    async sendPasswordReset(email) {
      // Same response whether or not the account exists (no account enumeration).
      await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/settings` });
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async getAccessToken() {
      const { data } = await sb.auth.getSession();
      return data.session?.access_token ?? null;
    },
    async getProfile() {
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) throw new DataError('Your session has ended. Sign in again.', 'unauthorized');
      const row = (await run(sb.from(T.profiles).select('*').eq('id', auth.user.id).maybeSingle())) as Row | null;
      const access = (await run(sb.from(T.access).select('category').eq('user_id', auth.user.id))) as Row[];
      const profile = row ? mapProfile(row, access.map((a) => String(a.category))) : null;
      // Same rule as the original sign-in page: no approved role, no dashboard.
      if (!profile || profile.pending) throw new DataError('Your account is waiting for approval. The shop owner needs to approve it before you can see the inventory.', 'forbidden');
      return profile;
    },

    async listItems() {
      const rows = await fetchAll<Row>((a, b) => sb.from(T.items).select('*').order('category').order('subcategory').order('name').range(a, b));
      return rows.map(mapItem);
    },
    async createItem(input) {
      return mapItem((await run(sb.from(T.items).insert(input).select("*").single())) as Row);
    },
    async updateItems(ids, patch) {
      // RLS turns a write you're not allowed into "0 rows changed" rather than an error.
      const rows = (await run(sb.from(T.items).update(patch).in('id', ids).select('id'))) as Row[];
      if (rows.length === 0) throw new DataError('You don’t have permission to change that.', 'forbidden');
    },
    async deleteItems(ids) {
      const rows = (await run(sb.from(T.items).delete().in('id', ids).select('id'))) as Row[];
      if (rows.length === 0) throw new DataError('You don’t have permission to delete that.', 'forbidden');
    },
    async recordCount(itemId, value, note) {
      await run(sb.rpc('record_count', { p_item_id: itemId, p_value: value, p_note: note ?? null }));
    },
    async verifyItems(ids) {
      await run(sb.rpc('verify_items', { p_ids: ids }));
    },

    async listCounts(sinceISO) {
      const rows = await fetchAll<Row>((a, b) => {
        let q = sb.from(T.counts).select('*').order('recorded_at', { ascending: true }).order('id', { ascending: true }).range(a, b);
        if (sinceISO) q = q.gte('recorded_at', sinceISO);
        return q;
      });
      return rows.map(mapCount);
    },

    async listSchedules() {
      return ((await run(sb.from(T.schedules).select('*'))) as Row[]).map(mapSchedule);
    },
    async setSchedule(s) {
      const row: Row = { category: s.category, subcategory: s.subcategory, reorder_frequency: s.frequency };
      if (s.reorder_day !== undefined) row.reorder_day = s.reorder_day;
      if (s.vendor_url !== undefined) row.vendor_url = s.vendor_url;
      await run(sb.from(T.schedules).upsert(row, { onConflict: 'category,subcategory' }));
    },

    async listSuppliers() {
      return (await run(sb.from(T.suppliers).select('*').order('name'))) as Supplier[];
    },
    async createSupplier(input) {
      return (await run(sb.from(T.suppliers).insert(input).select('*').single())) as Supplier;
    },
    async updateSupplier(id, patch) {
      await run(sb.from(T.suppliers).update(patch).eq('id', id));
    },
    async deleteSupplier(id) {
      await run(sb.from(T.suppliers).delete().eq('id', id));
    },

    async listPurchaseOrders() {
      const rows = await run(sb.from(T.orders).select(`*, lines:${T.orderLines}(*)`).order('created_at', { ascending: false }));
      return rows as unknown as PurchaseOrder[];
    },
    async createPurchaseOrder(input) {
      const id = await run(sb.rpc('create_purchase_order', { p_supplier_id: input.supplier_id, p_notes: input.notes, p_expected_on: input.expected_on, p_lines: input.lines }));
      const row = await run(sb.from(T.orders).select(`*, lines:${T.orderLines}(*)`).eq('id', id as number).single());
      return row as unknown as PurchaseOrder;
    },
    async updatePurchaseOrder(id, patch) {
      if (patch.status === 'sent') {
        await run(sb.rpc('mark_purchase_order_sent', { p_id: id }));
        const { status: _s, ...rest } = patch;
        if (Object.keys(rest).length) await run(sb.from(T.orders).update(rest).eq('id', id));
        return;
      }
      await run(sb.from(T.orders).update(patch).eq('id', id));
    },
    async receivePurchaseOrder(id, lines) {
      await run(sb.rpc('receive_purchase_order', { p_id: id, p_lines: lines }));
    },

    async listProfiles() {
      const [rows, access] = await Promise.all([
        run(sb.from(T.profiles).select('*').order('requested_at', { ascending: true, nullsFirst: true })) as Promise<Row[]>,
        run(sb.from(T.access).select('user_id, category')) as Promise<Row[]>,
      ]);
      const byUser = new Map<string, string[]>();
      for (const a of access) byUser.set(String(a.user_id), [...(byUser.get(String(a.user_id)) ?? []), String(a.category)]);
      return rows.map((r) => mapProfile(r, byUser.get(String(r.id)) ?? []));
    },
    async updateProfile(userId, patch) {
      if (patch.display_name !== undefined) {
        await run(sb.from(T.profiles).update({ full_name: patch.display_name }).eq('id', userId));
      }
      if (patch.role !== undefined || patch.categories !== undefined || patch.pending !== undefined) {
        // One transaction on the server: role, approval stamp and category grants change together.
        await run(
          sb.rpc('set_member_access', {
            p_user_id: userId,
            p_role: patch.pending ? 'pending' : (patch.role ?? null),
            p_categories: patch.categories === undefined ? null : patch.categories,
          }),
        );
      }
    },
    async rejectProfile(userId) {
      await run(sb.rpc('reject_member', { p_user_id: userId }));
    },

    async listAudit({ limit, before }) {
      let q = sb.from(T.audit).select('*').order('created_at', { ascending: false }).limit(limit);
      if (before) q = q.lt('created_at', before);
      return (await run(q)) as AuditEntry[];
    },

    subscribe(onChange) {
      const tables: LiveTable[] = ['inventory_items', 'inventory_counts', 'suppliers', 'purchase_orders', 'profiles', 'subcategory_schedules'];
      const channel = sb.channel('tifa-live');
      for (const table of tables) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange(table));
      }
      channel.subscribe();
      return () => {
        void sb.removeChannel(channel);
      };
    },
  };
}
