import { lazy, type ReactNode } from 'react';
import { createBrowserRouter, createMemoryRouter, Navigate, useLocation, useRouteError, isRouteErrorResponse, Link, type RouteObject } from 'react-router';
import { IconLock, IconAlertTriangle, IconMapOff } from '@tabler/icons-react';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Action } from '@/domain/permissions';
import { Button, EmptyState, Spinner } from '@/design-system';
import { AppShell } from './shell/AppShell';
import { Logo } from './shell/Logo';

// Each page is its own chunk; only the current page's code is downloaded.
const pages = {
  login: () => import('@/features/auth/LoginPage'),
  '': () => import('@/features/dashboard/DashboardPage'),
  inventory: () => import('@/features/inventory/InventoryPage'),
  count: () => import('@/features/count/CountPage'),
  reorder: () => import('@/features/reorder/ReorderPage'),
  orders: () => import('@/features/orders/OrdersPage'),
  suppliers: () => import('@/features/suppliers/SuppliersPage'),
  analytics: () => import('@/features/analytics/AnalyticsPage'),
  reports: () => import('@/features/reports/ReportsPage'),
  activity: () => import('@/features/activity/ActivityPage'),
  team: () => import('@/features/team/TeamPage'),
  settings: () => import('@/features/settings/SettingsPage'),
};

/** Starts downloading the page for a URL in parallel with auth and data, instead of after. */
export function preloadRoute(pathname: string) {
  const key = pathname.split('/')[1] ?? '';
  void (pages[key as keyof typeof pages] ?? pages[''])().catch(() => undefined);
}

const LoginPage = lazy(pages.login);
const DashboardPage = lazy(pages['']);
const InventoryPage = lazy(pages.inventory);
const CountPage = lazy(pages.count);
const ReorderPage = lazy(pages.reorder);
const OrdersPage = lazy(pages.orders);
const SuppliersPage = lazy(pages.suppliers);
const AnalyticsPage = lazy(pages.analytics);
const ReportsPage = lazy(pages.reports);
const ActivityPage = lazy(pages.activity);
const TeamPage = lazy(pages.team);
const SettingsPage = lazy(pages.settings);

export function FullScreenStatus({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', alignContent: 'center', gap: 16, minHeight: '100dvh', padding: 24 }}>
      <Logo size={36} />
      {children}
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status, profileError, signOut } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <FullScreenStatus>
        <Spinner size={20} label="Loading your inventory" />
      </FullScreenStatus>
    );
  }
  if (status === 'signed-out') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (profileError) {
    return (
      <FullScreenStatus>
        <EmptyState icon={<IconLock />} title="No access yet" action={<Button onClick={() => void signOut()}>Sign out</Button>}>
          {profileError.message}
        </EmptyState>
      </FullScreenStatus>
    );
  }
  return <>{children}</>;
}

function RequirePermission({ action, children }: { action: Action; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(action)) {
    return (
      <EmptyState icon={<IconLock />} title="This page is for admins" action={<Button asChild variant="secondary"><Link to="/">Back to overview</Link></Button>}>
        Ask an admin if you need access.
      </EmptyState>
    );
  }
  return <>{children}</>;
}

function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (import.meta.env.DEV) console.error(error);
  return (
    <FullScreenStatus>
      <EmptyState
        icon={notFound ? <IconMapOff /> : <IconAlertTriangle />}
        title={notFound ? 'Page not found' : 'This page hit a problem'}
        action={
          <Button variant="primary" onClick={() => (notFound ? window.location.assign('/') : window.location.reload())}>
            {notFound ? 'Go to overview' : 'Reload'}
          </Button>
        }
      >
        {notFound ? 'The link may be old, or the page has moved.' : 'Your data is safe. Reloading usually fixes it; if not, sign out and back in.'}
      </EmptyState>
    </FullScreenStatus>
  );
}

function NotFound() {
  return (
    <EmptyState icon={<IconMapOff />} title="Page not found" action={<Button asChild variant="secondary"><Link to="/">Go to overview</Link></Button>}>
      The link may be old, or the page has moved.
    </EmptyState>
  );
}

// Embedded previews (e.g. a sandboxed demo page) can't use real URLs, so they route in memory,
// starting from a plain #name like #inventory when one is given.
function makeRouter(routes: RouteObject[]) {
  if (import.meta.env.VITE_ROUTER !== 'memory') return createBrowserRouter(routes);
  const start = typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : '';
  return createMemoryRouter(routes, { initialEntries: [/^[a-z-]+$/.test(start) ? `/${start}` : '/'] });
}

export const router = makeRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'inventory/:itemId', element: <InventoryPage /> },
      { path: 'count', element: <RequirePermission action="item:count"><CountPage /></RequirePermission> },
      { path: 'reorder', element: <ReorderPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'orders/:orderId', element: <OrdersPage /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'suppliers/:supplierId', element: <SuppliersPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'reports', element: <RequirePermission action="export"><ReportsPage /></RequirePermission> },
      { path: 'activity', element: <RequirePermission action="audit:read"><ActivityPage /></RequirePermission> },
      { path: 'team', element: <RequirePermission action="user:manage"><TeamPage /></RequirePermission> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'dashboard', element: <Navigate to="/" replace /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
