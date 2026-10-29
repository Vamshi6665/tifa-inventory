import {
  IconLayoutDashboard,
  IconPackage,
  IconClipboardCheck,
  IconShoppingCartPlus,
  IconFileInvoice,
  IconBuildingStore,
  IconChartLine,
  IconFileSpreadsheet,
  IconHistory,
  IconUsers,
  IconSettings,
  type Icon,
} from '@tabler/icons-react';
import type { Action } from '@/domain/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  description: string;
  requires?: Action;
  badge?: 'reorder' | 'orders' | 'review';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: 'Daily',
    items: [
      { to: '/', label: 'Overview', icon: IconLayoutDashboard, description: 'What needs attention today' },
      { to: '/inventory', label: 'Inventory', icon: IconPackage, description: 'Every item, its stock and par', badge: 'review' },
      { to: '/count', label: 'Stock count', icon: IconClipboardCheck, description: 'Walk the shelves and record counts', requires: 'item:count' },
      { to: '/reorder', label: 'Reorder', icon: IconShoppingCartPlus, description: 'What to order and how much', badge: 'reorder' },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      { to: '/orders', label: 'Purchase orders', icon: IconFileInvoice, description: 'Drafts, sent orders and deliveries', badge: 'orders', requires: 'purchasing:view' },
      { to: '/suppliers', label: 'Suppliers', icon: IconBuildingStore, description: 'Who you buy from and lead times', requires: 'purchasing:view' },
    ],
  },
  {
    label: 'Insight',
    items: [
      { to: '/analytics', label: 'Analytics', icon: IconChartLine, description: 'Usage trends and run-out forecasts' },
      { to: '/reports', label: 'Reports', icon: IconFileSpreadsheet, description: 'Exports and printable count sheets', requires: 'export' },
      { to: '/activity', label: 'Activity', icon: IconHistory, description: 'Audit log of every change', requires: 'audit:read' },
    ],
  },
];

export const NAV_FOOTER: NavItem[] = [
  { to: '/team', label: 'Team', icon: IconUsers, description: 'People, roles and category access', requires: 'user:manage' },
  { to: '/settings', label: 'Settings', icon: IconSettings, description: 'Appearance, schedules and preferences' },
];

export const ALL_NAV: NavItem[] = [...NAV.flatMap((g) => g.items), ...NAV_FOOTER];
