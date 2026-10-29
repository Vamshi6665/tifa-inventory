import type { InventoryItem, Role, UserProfile } from './types';

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
  | 'export';

const ROLE_ACTIONS: Record<Role, ReadonlySet<Action>> = {
  admin: new Set<Action>(['item:read', 'item:count', 'item:edit', 'item:create', 'item:delete', 'supplier:manage', 'po:manage', 'po:receive', 'user:manage', 'settings:manage', 'audit:read', 'export']),
  staff: new Set<Action>(['item:read', 'item:count', 'po:receive', 'export']),
  viewer: new Set<Action>(['item:read', 'export']),
};

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', staff: 'Staff', viewer: 'Viewer' };
export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: 'Full access, including team, suppliers, orders and settings.',
  staff: 'Can record counts and receive deliveries in their categories.',
  viewer: 'Read-only access to their categories.',
};

type Who = Pick<UserProfile, 'role' | 'categories'> & { pending?: boolean };

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
  if (item && !canAccessCategory(user, item.category)) return false;
  return true;
}

export function visibleItems<T extends Pick<InventoryItem, 'category'>>(user: Who | null, items: readonly T[]): T[] {
  return items.filter((i) => canAccessCategory(user, i.category));
}
