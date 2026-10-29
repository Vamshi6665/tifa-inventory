import { can, canAccessCategory } from '@/domain/permissions';
import type { AuditEntry, InventoryItem, PurchaseOrder, UserProfile } from '@/domain/types';
import { applyReceipt } from '../receiving';
import { DataError, type AuthUser, type DataSource, type LiveTable } from '../source';
import { buildSeed, DEMO_VERSION, type DemoDB } from './seed';

const STORAGE_KEY = 'tifa.demo.db';
const SESSION_KEY = 'tifa.demo.session';

export interface DemoOptions {
  latencyMs?: number;
  persist?: boolean;
  now?: () => number;
}

/**
 * In-memory backend with the same rules as the database: role and category
 * checks mirror the RLS policies, every write lands in the audit log, and
 * other tabs are notified through BroadcastChannel (live updates).
 */
export function createDemoSource(opts: DemoOptions = {}): DataSource & { reset(): void; db(): DemoDB } {
  const latency = opts.latencyMs ?? 80;
  const persist = opts.persist ?? true;
  const now = opts.now ?? (() => Date.now());
  let db = load();
  let userId: string | null = readSession() ?? fromLink();
  const authListeners = new Set<(u: AuthUser | null) => void>();
  const liveListeners = new Set<(t: LiveTable) => void>();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tifa-demo') : null;

  // The message carries the data itself: other tabs may see the localStorage
  // write later than the message, so re-reading storage here would race.
  channel?.addEventListener('message', (e: MessageEvent<{ table: LiveTable; db: DemoDB }>) => {
    if (e.data?.db?.version === DEMO_VERSION) db = e.data.db;
    liveListeners.forEach((l) => l(e.data.table));
  });

  function load(): DemoDB {
    if (persist && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as DemoDB;
          if (parsed.version === DEMO_VERSION) return parsed;
        }
      } catch {
        /* corrupted storage: fall through to a fresh seed */
      }
    }
    const fresh = buildSeed(now());
    if (persist && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      } catch {
        /* quota: keep going in memory */
      }
    }
    return fresh;
  }
  function save(table: LiveTable) {
    if (persist && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      } catch {
        /* quota: demo keeps working in memory */
      }
    }
    channel?.postMessage({ table, db });
    liveListeners.forEach((l) => l(table));
  }
  /** Demo links like /?as=staff open the demo signed in with that role (for sharing). */
  function fromLink(): string | null {
    if (typeof location === 'undefined') return null;
    const role = new URLSearchParams(location.search).get('as');
    const person = role ? db.profiles.find((p) => p.role === role && !p.pending) : undefined;
    if (!person) return null;
    try {
      sessionStorage.setItem(SESSION_KEY, person.user_id);
    } catch {
      /* private mode */
    }
    return person.user_id;
  }
  function readSession(): string | null {
    try {
      return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null;
    } catch {
      return null;
    }
  }
  const wait = <T,>(v: T): Promise<T> => (latency ? new Promise((r) => setTimeout(() => r(structuredClone(v)), latency * (0.6 + Math.random() * 0.8))) : Promise.resolve(structuredClone(v)));
  const ts = () => new Date(now()).toISOString();

  function me(): UserProfile {
    const p = db.profiles.find((x) => x.user_id === userId);
    if (!p) throw new DataError('Your session has ended. Sign in again.', 'unauthorized');
    return p;
  }
  function authUser(p: UserProfile): AuthUser {
    return { id: p.user_id, email: p.email, name: p.display_name, avatarUrl: null };
  }
  function requireAction(action: Parameters<typeof can>[1], item?: Pick<InventoryItem, 'category'>) {
    if (!can(me(), action, item)) throw new DataError('You don’t have permission to do that.', 'forbidden');
  }
  function audit(table: string, recordId: string | number, action: AuditEntry['action'], changed: AuditEntry['changed']) {
    const actor = me();
    db.audit.unshift({ id: db.seq.audit++, table_name: table, record_id: String(recordId), action, actor_id: actor.user_id, actor_email: actor.email, changed, created_at: ts() });
    if (db.audit.length > 2000) db.audit.length = 2000;
  }
  function item(id: number): InventoryItem {
    const it = db.items.find((i) => i.id === id);
    if (!it) throw new DataError('That item no longer exists.', 'not_found');
    return it;
  }
  function initials(p: UserProfile) {
    return (p.display_name ?? p.email).split(/\s+/).map((s) => s[0]?.toUpperCase()).join('').slice(0, 3);
  }
  function diff<T extends object>(before: T, patch: Partial<T>) {
    const out: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(patch)) {
      const prev = (before as Record<string, unknown>)[k];
      if (JSON.stringify(prev) !== JSON.stringify(v)) out[k] = { from: prev, to: v };
    }
    return out;
  }

  const source: DataSource & { reset(): void; db(): DemoDB } = {
    kind: 'demo',
    reset() {
      db = buildSeed(now());
      save('inventory_items');
    },
    db: () => db,

    async getUser() {
      const p = db.profiles.find((x) => x.user_id === userId);
      return wait(p ? authUser(p) : null);
    },
    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    async signInWithPassword(email) {
      const p = db.profiles.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      await wait(null);
      if (!p) throw new DataError('No demo account with that email. Pick one of the demo roles.', 'unauthorized');
      userId = p.user_id;
      p.last_seen_at = ts();
      try {
        sessionStorage.setItem(SESSION_KEY, userId);
      } catch {
        /* private mode */
      }
      authListeners.forEach((l) => l(authUser(p)));
    },
    async signInWithGoogle() {
      throw new DataError('Google sign-in isn’t available in the demo. Pick a demo role instead.', 'validation');
    },
    async sendPasswordReset() {
      await wait(null);
    },
    async signOut() {
      userId = null;
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
      authListeners.forEach((l) => l(null));
    },
    async getProfile() {
      const p = me();
      if (p.pending) throw new DataError('Your account is waiting for approval. The shop owner needs to approve it before you can see the inventory.', 'forbidden');
      return wait(p);
    },

    async listItems() {
      const p = me();
      return wait(db.items.filter((i) => canAccessCategory(p, i.category)));
    },
    async createItem(input) {
      requireAction('item:create', input);
      if (!input.name.trim()) throw new DataError('Give the item a name.', 'validation');
      if (db.items.some((i) => i.category === input.category && i.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
        throw new DataError(`“${input.name}” already exists in ${input.category}.`, 'conflict');
      }
      const created: InventoryItem = {
        ...input,
        location: input.location ?? null,
        reorder_url: input.reorder_url ?? null,
        unit_label: input.unit_label ?? null,
        id: db.seq.item++,
        name: input.name.trim(),
        supplier: db.suppliers.find((s) => s.id === input.supplier_id)?.name ?? null,
        updated_at: ts(),
        last_verified_at: input.current_value ? ts() : null,
      };
      db.items.push(created);
      if (input.current_value) db.counts.push({ id: db.seq.count++, item_id: created.id, value: input.current_value, counted_at: ts(), recorded_by: initials(me()), source: 'manual', note: 'Initial count' });
      audit('inventory_items', created.id, 'insert', { name: { from: null, to: created.name } });
      save('inventory_items');
      return wait(created);
    },
    async updateItems(ids, patch) {
      const targets = ids.map(item);
      const editsMeta = Object.keys(patch).some((k) => k !== 'current_value' && k !== 'last_verified_at');
      for (const t of targets) requireAction(editsMeta ? 'item:edit' : 'item:count', t);
      if (patch.category) requireAction('item:edit', { category: patch.category });
      for (const t of targets) {
        const changed = diff(t, patch);
        Object.assign(t, patch, { updated_at: ts() });
        if ('supplier_id' in patch) t.supplier = db.suppliers.find((s) => s.id === patch.supplier_id)?.name ?? null;
        if (Object.keys(changed).length) audit('inventory_items', t.id, 'update', changed);
      }
      save('inventory_items');
      await wait(null);
    },
    async deleteItems(ids) {
      const targets = ids.map(item);
      for (const t of targets) requireAction('item:delete', t);
      db.items = db.items.filter((i) => !ids.includes(i.id));
      db.counts = db.counts.filter((c) => !ids.includes(c.item_id));
      for (const t of targets) audit('inventory_items', t.id, 'delete', { name: { from: t.name, to: null } });
      save('inventory_items');
      await wait(null);
    },
    async recordCount(itemId, value, note) {
      const t = item(itemId);
      requireAction('item:count', t);
      const v = value.trim();
      if (!v) throw new DataError('Enter a count.', 'validation');
      if (v.length > 120) throw new DataError('Keep counts under 120 characters.', 'validation');
      const prev = t.current_value;
      t.current_value = v;
      t.updated_at = ts();
      t.last_verified_at = ts();
      db.counts.push({ id: db.seq.count++, item_id: t.id, value: v, counted_at: ts(), recorded_by: initials(me()), source: 'manual', note: note ?? null });
      audit('inventory_counts', t.id, 'insert', { value: { from: prev, to: v } });
      save('inventory_counts');
      await wait(null);
    },
    async verifyItems(ids) {
      const targets = ids.map(item);
      for (const t of targets) requireAction('item:count', t);
      for (const t of targets) {
        t.last_verified_at = ts();
        audit('inventory_items', t.id, 'update', { last_verified_at: { from: null, to: t.last_verified_at } });
      }
      save('inventory_items');
      await wait(null);
    },

    async listCounts(sinceISO) {
      const p = me();
      const allowed = new Set(db.items.filter((i) => canAccessCategory(p, i.category)).map((i) => i.id));
      return wait(db.counts.filter((c) => allowed.has(c.item_id) && (!sinceISO || c.counted_at >= sinceISO)));
    },

    async listSchedules() {
      return wait(db.schedules);
    },
    async setSchedule(s) {
      requireAction('settings:manage');
      const existing = db.schedules.find((x) => x.category === s.category && x.subcategory === s.subcategory);
      const next = { ...existing, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) } as typeof s;
      const changed = diff(existing ?? {}, next);
      delete changed.category;
      delete changed.subcategory;
      if (existing) Object.assign(existing, next);
      else db.schedules.push(next);
      audit('subcategory_schedules', `${s.category}/${s.subcategory}`, existing ? 'update' : 'insert', changed);
      save('subcategory_schedules');
      await wait(null);
    },

    async listSuppliers() {
      return wait(db.suppliers);
    },
    async createSupplier(input) {
      requireAction('supplier:manage');
      if (!input.name.trim()) throw new DataError('Give the supplier a name.', 'validation');
      if (db.suppliers.some((s) => s.name.toLowerCase() === input.name.trim().toLowerCase())) throw new DataError(`${input.name} is already a supplier.`, 'conflict');
      const s = { ...input, name: input.name.trim(), id: db.seq.supplier++, created_at: ts() };
      db.suppliers.push(s);
      audit('suppliers', s.id, 'insert', { name: { from: null, to: s.name } });
      save('suppliers');
      return wait(s);
    },
    async updateSupplier(id, patch) {
      requireAction('supplier:manage');
      const s = db.suppliers.find((x) => x.id === id);
      if (!s) throw new DataError('That supplier no longer exists.', 'not_found');
      audit('suppliers', id, 'update', diff(s, patch));
      Object.assign(s, patch);
      if (patch.name) db.items.forEach((i) => i.supplier_id === id && (i.supplier = patch.name!));
      save('suppliers');
      await wait(null);
    },
    async deleteSupplier(id) {
      requireAction('supplier:manage');
      if (db.purchaseOrders.some((p) => p.supplier_id === id && p.status !== 'cancelled' && p.status !== 'received')) {
        throw new DataError('This supplier has open orders. Receive or cancel them first.', 'conflict');
      }
      const s = db.suppliers.find((x) => x.id === id);
      db.suppliers = db.suppliers.filter((x) => x.id !== id);
      db.items.forEach((i) => {
        if (i.supplier_id === id) {
          i.supplier_id = null;
          i.supplier = null;
        }
      });
      audit('suppliers', id, 'delete', { name: { from: s?.name, to: null } });
      save('suppliers');
      await wait(null);
    },

    async listPurchaseOrders() {
      requireAction('item:read');
      return wait(db.purchaseOrders);
    },
    async createPurchaseOrder(input) {
      requireAction('po:manage');
      if (!input.lines.length) throw new DataError('Add at least one item to the order.', 'validation');
      if (input.lines.some((l) => !(l.quantity > 0))) throw new DataError('Quantities must be greater than zero.', 'validation');
      const id = db.seq.po++;
      const number = `PO-${1040 + id}`;
      const po: PurchaseOrder = {
        id, number, supplier_id: input.supplier_id, status: 'draft', notes: input.notes, expected_on: input.expected_on, sent_at: null, received_at: null, created_at: ts(), created_by: me().user_id,
        lines: input.lines.map((l) => ({ ...l, id: db.seq.line++, po_id: id, received_quantity: 0 })),
      };
      db.purchaseOrders.unshift(po);
      audit('purchase_orders', id, 'insert', { number: { from: null, to: number } });
      save('purchase_orders');
      return wait(po);
    },
    async updatePurchaseOrder(id, patch) {
      requireAction('po:manage');
      const po = db.purchaseOrders.find((p) => p.id === id);
      if (!po) throw new DataError('That order no longer exists.', 'not_found');
      if (patch.status === 'sent' && po.status !== 'draft') throw new DataError('Only drafts can be marked as sent.', 'conflict');
      audit('purchase_orders', id, 'update', diff(po, patch));
      Object.assign(po, patch);
      if (patch.status === 'sent') po.sent_at = ts();
      save('purchase_orders');
      await wait(null);
    },
    async receivePurchaseOrder(id, lines) {
      requireAction('po:receive');
      const po = db.purchaseOrders.find((p) => p.id === id);
      if (!po) throw new DataError('That order no longer exists.', 'not_found');
      if (po.status === 'draft' || po.status === 'cancelled' || po.status === 'received') throw new DataError('Only sent orders can be received.', 'conflict');
      for (const r of lines) {
        const line = po.lines.find((l) => l.id === r.line_id);
        if (!line || r.quantity <= 0) continue;
        const target = item(line.item_id);
        if (!canAccessCategory(me(), target.category)) throw new DataError(`You can’t receive ${target.name}.`, 'forbidden');
        line.received_quantity += r.quantity;
        const { value, reconciled } = applyReceipt(target.current_value, r.quantity);
        target.current_value = value;
        target.updated_at = ts();
        db.counts.push({ id: db.seq.count++, item_id: target.id, value: value ?? '', counted_at: ts(), recorded_by: initials(me()), source: 'received', note: reconciled ? `Received ${r.quantity} on ${po.number}` : `Received ${r.quantity} on ${po.number}; count needs updating` });
      }
      po.status = po.lines.every((l) => l.received_quantity >= l.quantity) ? 'received' : 'partially_received';
      if (po.status === 'received') po.received_at = ts();
      audit('purchase_orders', id, 'update', { status: { from: 'sent', to: po.status } });
      save('purchase_orders');
      await wait(null);
    },

    async listProfiles() {
      requireAction('user:manage');
      return wait(db.profiles);
    },
    async updateProfile(uid, patch) {
      requireAction('user:manage');
      const p = db.profiles.find((x) => x.user_id === uid);
      if (!p) throw new DataError('That person no longer exists.', 'not_found');
      const losesAdmin = p.role === 'admin' && !p.pending && (patch.pending === true || (patch.role !== undefined && patch.role !== 'admin'));
      // Mirrors guard_profile_change in the database.
      if (losesAdmin && uid === me().user_id) throw new DataError('You can’t remove your own admin access.', 'conflict');
      if (losesAdmin && !db.profiles.some((x) => x.user_id !== uid && x.role === 'admin' && !x.pending)) throw new DataError('There must be at least one admin.', 'conflict');
      const next: Partial<UserProfile> = { ...patch };
      if (patch.pending === true) next.categories = [];
      const role = next.role ?? p.role;
      if (role === 'admin') next.categories = null;
      else if (next.categories === null || (next.categories === undefined && p.categories === null)) next.categories = [];
      audit('profiles', uid, 'update', diff(p, next));
      Object.assign(p, next);
      save('profiles');
      await wait(null);
    },
    async rejectProfile(uid) {
      requireAction('user:manage');
      const p = db.profiles.find((x) => x.user_id === uid);
      if (!p) throw new DataError('That person no longer exists.', 'not_found');
      if (!p.pending) throw new DataError('Only people waiting for approval can be turned down. Remove their access instead.', 'conflict');
      db.profiles = db.profiles.filter((x) => x.user_id !== uid);
      audit('profiles', uid, 'delete', { email: { from: p.email, to: null } });
      save('profiles');
      await wait(null);
    },

    async listAudit({ limit, before }) {
      requireAction('audit:read');
      return wait(db.audit.filter((a) => !before || a.created_at < before).slice(0, limit));
    },

    subscribe(cb) {
      liveListeners.add(cb);
      return () => liveListeners.delete(cb);
    },
  };
  return source;
}
