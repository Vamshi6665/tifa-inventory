import type { BackendFeatures, InventoryItem, Role, UserProfile } from './types';

export type Action =
  | 'item:read'
  | 'item:count' // record a count or confirm one
  | 'item:edit' // name, par, supplier, status
  | 'item:create'
  | 'item:delete'
  | 'supplier:manage'
  | 'po:manage'
  | 'po:receive'
  | 'user:manage'
  | 'settings:manage'
  | 'audit:read'
  | 'export'
  | 'purchasing:view';

const ROLE_ACTIONS: Record<Role, ReadonlySet<Action>> = {
  admin: new Set<Action>(['item:read', 'item:count', 'item:edit', 'item:create', 'item:delete', 'supplier:manage', 'po:manage', 'po:receive', 'user:manage', 'settings:manage', 'audit:read', 'export', 'purchasing:view']),
  staff: new Set<Action>(['item:read', 'item:count', 'po:receive', 'export', 'purchasing:view']),
  viewer: new Set<Action>(['item:read', 'export', 'purchasing:view']),
};

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', staff: 'Staff', viewer: 'Viewer' };
export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: 'Full access, including team, suppliers, orders and settings.',
  staff: 'Can record counts and receive deliveries in their categories.',
  viewer: 'Read-only access to their categories.',
};

type Who = Pick<UserProfile, 'role' | 'categories'> & Partial<Pick<UserProfile, 'pending' | 'features'>>;

/** Actions that need parts of the database added by the 2.0 update. */
const NEEDS: Partial<Record<Action, keyof BackendFeatures>> = {
  'purchasing:view': 'purchasing',
  'supplier:manage': 'purchasing',
  'po:manage': 'purchasing',
  'po:receive': 'purchasing',
  'audit:read': 'audit',
};

/** True when the action needs a database feature that isn't there yet. */
export function waitingForUpdate(user: Who | null, action: Action): boolean {
  const feature = NEEDS[action];
  return !!(feature && user?.features && !user.features[feature]);
}

export function canAccessCategory(user: Who | null, category: string): boolean {
  if (!user || user.pending) return false;
  if (user.role === 'admin' || user.categories == null) return true;
  return user.categories.includes(category);
}

/**
 * Client-side mirror of the database policies. The UI uses it to hide what a
 * person can't do; the database RLS policies are what actually enforce it.
 */
export function can(user: Who | null, action: Action, item?: Pick<InventoryItem, 'category'>): boolean {
  if (!user || user.pending) return false;
  if (!ROLE_ACTIONS[user.role].has(action)) return false;
  if (waitingForUpdate(user, action)) return false;
  if (item && !canAccessCategory(user, item.category)) return false;
  return true;
}

export function visibleItems<T extends Pick<InventoryItem, 'category'>>(user: Who | null, items: readonly T[]): T[] {
  return items.filter((i) => canAccessCategory(user, i.category));
}
