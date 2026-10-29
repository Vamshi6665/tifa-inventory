import { describe, expect, it, beforeEach } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import { renderApp, waitForPage } from '@/test/render';
import { stockState } from '@/domain/quantity';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('authentication and routing', () => {
  it('sends signed-out visitors to sign in, then back to where they were going', async () => {
    const { user, router } = await renderApp('/reorder', null);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    await user.click(await screen.findByRole('button', { name: /Continue as Admin/ }));
    await waitForPage('Reorder');
    expect(router.state.location.pathname).toBe('/reorder');
  });

  it('blocks admin-only pages for staff with a clear message', async () => {
    await renderApp('/team', 'staff');
    expect(await screen.findByRole('heading', { name: 'This page is for admins' })).toBeInTheDocument();
  });

  it('hides admin navigation for staff and counting for viewers', async () => {
    await renderApp('/', 'staff');
    // Sidebar nav (desktop); the mobile tab bar is hidden by CSS at this width.
    const nav = (await screen.findAllByRole('navigation', { name: 'Primary' }))[0]!;
    expect(within(nav).queryByRole('link', { name: /Activity/ })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Stock count/ })).toBeInTheDocument();
  });

  it('shows a not-found page inside the app for unknown paths', async () => {
    await renderApp('/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('overview', () => {
  it('greets the user and lists what needs attention', async () => {
    await renderApp('/');
    await waitForPage(/Good (morning|afternoon|evening), Alex/);
    const attention = await screen.findByRole('region', { name: 'Needs attention' });
    await waitFor(() => expect(within(attention).getAllByRole('link').length).toBeGreaterThan(1));
  });

  it('lets people hide widgets and remembers it', async () => {
    const { user } = await renderApp('/');
    await waitForPage(/Good/);
    await user.click(screen.getByRole('button', { name: 'Customize' }));
    await user.click(await screen.findByRole('switch', { name: 'Insights' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Insights' })).not.toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem('tifa.preferences')!).state.hiddenWidgets).toContain('insights');
  });
});

describe('inventory', () => {
  it('quick-filters to items that need reordering', async () => {
    const { user, source } = await renderApp('/inventory');
    await waitForPage('Inventory');
    await user.click(await screen.findByRole('radio', { name: /To reorder/ }));
    const expected = source.db().items.filter((i) => ['low', 'out'].includes(stockState(i))).length;
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Inventory items' })).getAllByRole('row')).toHaveLength(expected + 1));
  });

  it('records a count inline and writes history', async () => {
    const { user, source } = await renderApp('/inventory');
    await waitForPage('Inventory');
    const item = source.db().items.find((i) => i.name === 'Pistachio')!;
    await user.type(screen.getByRole('searchbox', { name: /Search items/ }), 'Pistachio');
    await user.click(await screen.findByRole('button', { name: 'Edit On hand for Pistachio' }));
    const input = screen.getByRole('textbox', { name: 'Edit On hand for Pistachio' });
    await user.clear(input);
    await user.type(input, '7{Enter}');
    await waitFor(() => expect(source.db().items.find((i) => i.id === item.id)!.current_value).toBe('7'));
    const last = source.db().counts.filter((c) => c.item_id === item.id).at(-1)!;
    expect(last).toMatchObject({ value: '7', source: 'manual', recorded_by: 'AR' });
    expect(source.db().audit[0]).toMatchObject({ table_name: 'inventory_counts', actor_email: 'alex.rivera@demo.tifa' });
  });

  it('staff can count but cannot edit par levels', async () => {
    const { source } = await renderApp('/inventory', 'staff');
    await waitForPage('Inventory');
    const table = await screen.findByRole('table', { name: 'Inventory items' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(5));
    expect(within(table).queryAllByRole('button', { name: /^Edit Par/ })).toHaveLength(0);
    expect(within(table).getAllByRole('button', { name: /^Edit On hand/ }).length).toBeGreaterThan(0);
    // Only their categories are visible
    const allowed = source.db().profiles.find((p) => p.user_id === 'demo-staff')!.categories!;
    expect(within(table).queryByText('House Supplies')).not.toBeInTheDocument();
    expect(allowed).not.toContain('House Supplies');
  });

  it('opens an item with its forecast and history, and adds an item through the form', async () => {
    const { user, router, source } = await renderApp('/inventory/2');
    expect(await screen.findByRole('dialog', { name: 'Stracciatella' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Forecast' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Count history' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/inventory'));

    await user.click(screen.getByRole('button', { name: 'Add item' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add an item' });
    await user.click(within(dialog).getByRole('button', { name: 'Add item' }));
    expect(await within(dialog).findByText('Give the item a name.')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Lavender honey');
    await user.type(within(dialog).getByRole('combobox', { name: /Category/ }), 'Gelato');
    await user.type(within(dialog).getByRole('textbox', { name: /Current count/ }), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(source.db().items.some((i) => i.name === 'Lavender honey' && i.current_value === '3')).toBe(true));
  });
});

describe('stock count', () => {
  it('saves with Enter, confirms with an empty Enter, and tracks progress', async () => {
    const { user, source } = await renderApp('/count?category=Coffee%20%26%20Beverages', 'staff');
    await waitForPage('Stock count');
    const inputs = await screen.findAllByRole('textbox');
    const first = inputs.find((i) => i.id.startsWith('count-'))!;
    const id = Number(first.id.replace('count-', ''));
    await user.type(first, '11{Enter}');
    await waitFor(() => expect(source.db().items.find((i) => i.id === id)!.current_value).toBe('11'));
    await waitFor(() => expect(document.activeElement?.id).toMatch(/^count-/));
    expect(document.activeElement).not.toBe(first);
    const second = Number((document.activeElement as HTMLElement).id.replace('count-', ''));
    const before = source.db().items.find((i) => i.id === second)!.current_value;
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).not.toBe('0'));
    expect(source.db().items.find((i) => i.id === second)!.current_value).toBe(before);
    expect(screen.getByRole('group', { name: 'Count progress' })).toHaveTextContent(/^2 of \d+ done/);
  });
});

describe('purchasing', () => {
  it('turns reorder suggestions into a draft order, sends it and receives it into stock', async () => {
    const { user, source, router } = await renderApp('/reorder');
    await waitForPage('Reorder');
    const create = await screen.findAllByRole('button', { name: /Create draft order/ });
    await user.click(create[0]!);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/orders\/\d+$/));
    const po = source.db().purchaseOrders[0]!;
    expect(po.status).toBe('draft');
    expect(po.lines.length).toBeGreaterThan(0);

    await user.click(await screen.findByRole('button', { name: 'Mark as sent' }));
    await waitFor(() => expect(source.db().purchaseOrders[0]!.status).toBe('sent'));
    await user.click(await screen.findByRole('button', { name: 'Receive delivery' }));
    const dialog = await screen.findByRole('dialog', { name: /Receive PO-/ });
    const line = po.lines[0]!;
    const item = source.db().items.find((i) => i.id === line.item_id)!;
    const before = Number(item.current_value);
    await user.click(within(dialog).getByRole('button', { name: 'Receive and update stock' }));
    await waitFor(() => expect(source.db().purchaseOrders[0]!.status).toBe('received'));
    if (Number.isFinite(before)) expect(Number(source.db().items.find((i) => i.id === line.item_id)!.current_value)).toBe(before + line.quantity);
  });

  it('validates a new supplier form', async () => {
    const { user, source } = await renderApp('/suppliers?new=1');
    const dialog = await screen.findByRole('dialog', { name: 'Add a supplier' });
    await user.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Sunrise Fruit');
    await user.type(within(dialog).getByRole('textbox', { name: /Email/ }), 'not-an-email');
    await user.type(within(dialog).getByRole('textbox', { name: /Lead time/ }), '-3');
    await user.click(within(dialog).getByRole('button', { name: 'Add supplier' }));
    expect(await within(dialog).findByText('Enter a valid email, or leave it blank.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Lead time is a whole number/)).toBeInTheDocument();
    await user.clear(within(dialog).getByRole('textbox', { name: /Email/ }));
    await user.clear(within(dialog).getByRole('textbox', { name: /Lead time/ }));
    await user.type(within(dialog).getByRole('textbox', { name: /Lead time/ }), '4');
    await user.click(within(dialog).getByRole('button', { name: 'Add supplier' }));
    await waitFor(() => expect(source.db().suppliers.some((s) => s.name === 'Sunrise Fruit' && s.lead_time_days === 4)).toBe(true));
  });
});

describe('team, activity and settings', () => {
  it('changes a person’s role and categories', async () => {
    const { user, source } = await renderApp('/team');
    await waitForPage('Team');
    await user.click(await screen.findByRole('button', { name: 'Change access for Jordan Lee' }));
    const dialog = await screen.findByRole('dialog', { name: /Access for Jordan Lee/ });
    await user.click(within(dialog).getByRole('radio', { name: /Staff/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Cookies & Pastries' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Truffles & Chocolates' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save access' }));
    await waitFor(() => expect(source.db().profiles.find((p) => p.user_id === 'demo-viewer')).toMatchObject({ role: 'staff', categories: ['Gelato'] }));
  });

  it('approves someone waiting, with a role and categories', async () => {
    const { user, source } = await renderApp('/team');
    await waitForPage('Team');
    expect(await screen.findByRole('heading', { name: 'Waiting for approval (1)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve Maya Ortiz' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve Maya Ortiz' });
    expect(within(dialog).getByRole('button', { name: 'Approve' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Every category' }));
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(source.db().profiles.find((p) => p.user_id === 'demo-pending')).toMatchObject({ pending: false, role: 'staff' }));
    expect(source.db().profiles.find((p) => p.user_id === 'demo-pending')!.categories!.length).toBeGreaterThan(3);
    expect(await screen.findByText('No one is waiting right now.')).toBeInTheDocument();
  });

  it('turns down a sign-up request after confirming', async () => {
    const { user, source } = await renderApp('/team');
    await user.click(await screen.findByRole('button', { name: 'Turn down Maya Ortiz' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Turn down Maya Ortiz?' });
    await user.click(within(confirm).getByRole('button', { name: 'Turn down' }));
    await waitFor(() => expect(source.db().profiles.some((p) => p.user_id === 'demo-pending')).toBe(false));
  });

  it('removes someone’s access, sending them back to waiting', async () => {
    const { user, source } = await renderApp('/team');
    await user.click(await screen.findByRole('button', { name: 'Change access for Priya Nair' }));
    const dialog = await screen.findByRole('dialog', { name: /Access for Priya Nair/ });
    await user.click(within(dialog).getByRole('button', { name: 'Remove access' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove access for Priya Nair?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove access' }));
    await waitFor(() => expect(source.db().profiles.find((p) => p.user_id === 'demo-staff-2')).toMatchObject({ pending: true, categories: [] }));
  });

  it('prevents an admin from removing their own admin role', async () => {
    const { user } = await renderApp('/team');
    await user.click(await screen.findByRole('button', { name: 'Change access for Alex Rivera' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: /Staff/ })).toBeDisabled();
  });

  it('shows activity with readable sentences', async () => {
    await renderApp('/activity');
    await waitForPage('Activity');
    expect((await screen.findAllByText(/counted/)).length).toBeGreaterThan(0);
  });

  it('switches theme and persists it', async () => {
    const { user } = await renderApp('/settings');
    await waitForPage('Settings');
    await user.click(screen.getByRole('radio', { name: /Dark/ }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(JSON.parse(localStorage.getItem('tifa.preferences')!).state.theme).toBe('dark');
  });
});

describe('before the database update', () => {
  const v1 = (source: { db(): { profiles: Array<{ features?: unknown }> } }) => {
    for (const p of source.db().profiles) p.features = { purchasing: false, audit: false, viewerRole: false };
  };

  it('hides purchasing and the activity log, and explains why if someone opens them', async () => {
    const { user } = await renderApp('/', 'admin', v1);
    await waitForPage(/Good/);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).queryByRole('link', { name: /Purchase orders/ })).toBeNull();
    expect(within(nav).queryByRole('link', { name: /Suppliers/ })).toBeNull();
    expect(within(nav).queryByRole('link', { name: /Activity/ })).toBeNull();
    expect(within(nav).getByRole('link', { name: /Stock count/ })).toBeInTheDocument();
    await user.click(within(nav).getByRole('link', { name: /Reorder/ }));
    expect(await screen.findByText(/turn on after the database update/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create draft order/ })).toBeNull();
  });

  it('shows a notice instead of an error on purchasing pages', async () => {
    await renderApp('/orders', 'admin', v1);
    expect(await screen.findByRole('heading', { name: 'Turns on after the database update' })).toBeInTheDocument();
  });

  it('offers only Admin and Staff when approving someone', async () => {
    const { user } = await renderApp('/team', 'admin', v1);
    await user.click(await screen.findByRole('button', { name: 'Approve Maya Ortiz' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve Maya Ortiz' });
    expect(within(dialog).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['admin', 'staff']);
  });
});

describe('command palette', () => {
  it('opens with Ctrl+K, finds an item and navigates to it', async () => {
    const { user, router } = await renderApp('/');
    await waitForPage(/Good/);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = await screen.findByPlaceholderText('Search items, pages, actions…');
    await user.type(input, 'hazelnut paste');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/inventory\/\d+$/));
  });

  it('does not steal "/" while typing in a field', async () => {
    const { user } = await renderApp('/inventory');
    await waitForPage('Inventory');
    await user.type(screen.getByRole('searchbox', { name: /Search items/ }), 'a/b');
    expect(screen.queryByPlaceholderText('Search items, pages, actions…')).not.toBeInTheDocument();
  });
});
