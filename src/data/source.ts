import type {
  AuditEntry,
  InventoryItem,
  PurchaseOrder,
  PurchaseOrderStatus,
  StockCount,
  SubcategorySchedule,
  Supplier,
  UserProfile,
} from '@/domain/types';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export type NewItemInput = Pick<InventoryItem, 'name' | 'category' | 'subcategory' | 'unit_type' | 'current_value' | 'par_level' | 'par_source_note' | 'supplier_id' | 'status' | 'notes'> &
  Partial<Pick<InventoryItem, 'location' | 'reorder_url' | 'unit_label'>>;
export type ItemPatch = Partial<Omit<InventoryItem, 'id' | 'updated_at'>>;
export type NewSupplierInput = Omit<Supplier, 'id' | 'created_at'>;
export interface NewPurchaseOrderInput {
  supplier_id: number;
  notes: string | null;
  expected_on: string | null;
  lines: Array<{ item_id: number; quantity: number; unit_label: string | null }>;
}
export interface PurchaseOrderPatch {
  status?: PurchaseOrderStatus;
  notes?: string | null;
  expected_on?: string | null;
}
export interface ReceiveLine {
  line_id: number;
  quantity: number;
}
export type LiveTable = 'inventory_items' | 'inventory_counts' | 'suppliers' | 'purchase_orders' | 'profiles' | 'subcategory_schedules';
/** Approving someone sets pending: false; removing their access sets pending: true. */
export type ProfilePatch = Partial<Pick<UserProfile, 'role' | 'categories' | 'display_name' | 'pending'>>;

/**
 * Everything the UI needs from a backend. Pages and hooks depend on this
 * interface only, so the Supabase implementation and the in-memory demo are
 * interchangeable — and tests can swap in either.
 */
export interface DataSource {
  readonly kind: 'supabase' | 'demo';

  getUser(): Promise<AuthUser | null>;
  onAuthChange(cb: (user: AuthUser | null) => void): () => void;
  signInWithPassword(email: string, password: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
  getProfile(): Promise<UserProfile>;
  /** Bearer token for our own serverless functions (not available in the demo). */
  getAccessToken?(): Promise<string | null>;

  listItems(): Promise<InventoryItem[]>;
  createItem(input: NewItemInput): Promise<InventoryItem>;
  updateItems(ids: number[], patch: ItemPatch): Promise<void>;
  deleteItems(ids: number[]): Promise<void>;
  /** Writes a history row and updates the live value atomically. */
  recordCount(itemId: number, value: string, note?: string | null): Promise<void>;
  /** Confirms counts are still right without changing them. */
  verifyItems(ids: number[]): Promise<void>;

  listCounts(sinceISO?: string): Promise<StockCount[]>;

  listSchedules(): Promise<SubcategorySchedule[]>;
  setSchedule(schedule: SubcategorySchedule): Promise<void>;

  listSuppliers(): Promise<Supplier[]>;
  createSupplier(input: NewSupplierInput): Promise<Supplier>;
  updateSupplier(id: number, patch: Partial<NewSupplierInput>): Promise<void>;
  deleteSupplier(id: number): Promise<void>;

  listPurchaseOrders(): Promise<PurchaseOrder[]>;
  createPurchaseOrder(input: NewPurchaseOrderInput): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: number, patch: PurchaseOrderPatch): Promise<void>;
  receivePurchaseOrder(id: number, lines: ReceiveLine[]): Promise<void>;

  /** Everyone who has signed in, including people waiting for approval (admins only). */
  listProfiles(): Promise<UserProfile[]>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<void>;
  /** Turns down a sign-up request. Only pending accounts can be removed. */
  rejectProfile(userId: string): Promise<void>;

  listAudit(opts: { limit: number; before?: string }): Promise<AuditEntry[]>;

  /** Live updates: calls back with the table that changed. */
  subscribe(onChange: (table: LiveTable) => void): () => void;
}

export class DataError extends Error {
  constructor(
    message: string,
    readonly code: 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'validation' | 'network' | 'unknown' = 'unknown',
  ) {
    super(message);
    this.name = 'DataError';
  }
}
