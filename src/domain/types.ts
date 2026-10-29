/**
 * Core domain types. These mirror the Supabase schema (see supabase/migrations)
 * but carry no framework or transport concerns.
 */

export type ItemStatus = 'active' | 'seasonal' | 'hold' | 'trial' | 'discontinued';
export type UnitType = 'count' | 'percentage' | 'freeform';
export type StockState = 'out' | 'low' | 'ok' | 'review' | 'untracked';
export type CountSource = 'migrated' | 'manual' | 'received' | 'import';
export type ReorderFrequency = 'weekly' | 'biweekly' | 'monthly';
export type Role = 'admin' | 'staff' | 'viewer';

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  subcategory: string | null;
  unit_type: UnitType;
  /** Free-form on purpose: "12", "50%", "6 x 5kg buckets", "1 new + 3". */
  current_value: string | null;
  par_level: number | null;
  par_source_note: string | null;
  /** How one unit is defined for this item's group, e.g. "1 unit = 1 tray = 12 macarons". */
  unit_label: string | null;
  /** Free-text supplier name from the original sheets. */
  supplier: string | null;
  supplier_id: number | null;
  status: ItemStatus;
  notes: string | null;
  /** Where it's kept in the shop, e.g. "Back freezer". */
  location: string | null;
  /** Link to reorder this exact product. */
  reorder_url: string | null;
  updated_at: string;
  /** Last time someone physically confirmed the count, even if unchanged. */
  last_verified_at: string | null;
}

export interface StockCount {
  id: number;
  item_id: number;
  value: string;
  counted_at: string;
  recorded_by: string | null;
  source: CountSource;
  note: string | null;
}

export interface SubcategorySchedule {
  category: string;
  /** "Uncategorized" for items without a subcategory, as in the original dashboard. */
  subcategory: string;
  frequency: ReorderFrequency;
  /** Day the group is usually ordered, e.g. "Monday". */
  reorder_day?: string | null;
  /** Supplier page shared by every item in the group. */
  vendor_url?: string | null;
}

export const NO_SUBCATEGORY = 'Uncategorized';
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export interface Supplier {
  id: number;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  lead_time_days: number | null;
  notes: string | null;
  created_at: string;
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled';

export interface PurchaseOrderLine {
  id: number;
  po_id: number;
  item_id: number;
  quantity: number;
  unit_label: string | null;
  received_quantity: number;
}

export interface PurchaseOrder {
  id: number;
  number: string;
  supplier_id: number;
  status: PurchaseOrderStatus;
  notes: string | null;
  expected_on: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  created_by: string | null;
  lines: PurchaseOrderLine[];
}

export interface UserProfile {
  user_id: string;
  email: string;
  display_name: string | null;
  role: Role;
  /** Categories a non-admin can see (and, for staff, count). null means every category (admins). */
  categories: string[] | null;
  /** Signed in but not approved yet: no access until an admin approves them. */
  pending: boolean;
  /** What the connected database supports. Missing means everything (the demo, or after the 2.0 update). */
  features?: BackendFeatures;
  created_at: string;
  last_seen_at: string | null;
}

export interface BackendFeatures {
  /** Suppliers and purchase orders. */
  purchasing: boolean;
  /** The activity (audit) log. */
  audit: boolean;
  /** The read-only Viewer role. */
  viewerRole: boolean;
}

export type AuditAction = 'insert' | 'update' | 'delete';

export interface AuditEntry {
  id: number;
  table_name: string;
  record_id: string;
  action: AuditAction;
  actor_id: string | null;
  actor_email: string | null;
  changed: Record<string, { from: unknown; to: unknown }> | null;
  created_at: string;
}

export const ITEM_STATUSES: readonly ItemStatus[] = ['active', 'seasonal', 'trial', 'hold', 'discontinued'];
export const STATUS_LABEL: Record<ItemStatus, string> = {
  active: 'Active',
  seasonal: 'Seasonal',
  trial: 'Trial',
  hold: 'On hold',
  discontinued: 'Retired',
};
export const FREQUENCY_DAYS: Record<ReorderFrequency, number> = { weekly: 7, biweekly: 14, monthly: 30 };
