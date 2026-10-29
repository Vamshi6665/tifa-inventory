import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ReactNode } from 'react';
import { Providers, makeQueryClient } from '@/app/Providers';
import { createDemoSource } from '@/data/demo/demoSource';
import { DEMO_PEOPLE } from '@/data/demo/seed';
import type { Role } from '@/domain/types';
import { router as appRouter } from '@/app/router';

export const NOW = new Date(2026, 9, 29, 12).getTime();

export async function makeSource(role: Role | null = 'admin') {
  sessionStorage.clear();
  localStorage.clear();
  const source = createDemoSource({ latencyMs: 0, persist: false, now: () => NOW });
  if (role) {
    const person = DEMO_PEOPLE.find((p) => p.role === role)!;
    await source.signInWithPassword(person.email, 'x');
  }
  return source;
}

/** Renders the real app routes at a URL, signed in with a demo role. */
export async function renderApp(path: string, role: Role | null = 'admin') {
  const source = await makeSource(role);
  const router = createMemoryRouter(appRouter.routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const utils = render(
    <Providers source={source} client={makeQueryClient()}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...utils, user, source, router };
}

/** Renders any element inside the providers (no routes). */
export async function renderWithProviders(ui: ReactNode, role: Role | null = 'admin') {
  const source = await makeSource(role);
  const router = createMemoryRouter([{ path: '*', element: ui }]);
  const user = userEvent.setup();
  const utils = render(
    <Providers source={source} client={makeQueryClient()}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...utils, user, source, router };
}

export async function waitForPage(title: string | RegExp) {
  return waitFor(() => expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument(), { timeout: 4000 });
}
