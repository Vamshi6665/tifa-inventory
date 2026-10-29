import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import { createColumnHelper } from '@tanstack/react-table';
import { useState } from 'react';
import { DataGrid } from './DataGrid';
import { renderWithProviders } from '@/test/render';
import { Button } from '../components/Button';

interface Row {
  id: number;
  name: string;
  category: string;
  qty: string;
}
const col = createColumnHelper<Row>();
const columns = [
  col.accessor('name', { header: 'Item', meta: { label: 'Item', searchable: true, sticky: true, locked: true } }),
  col.accessor('category', { header: 'Category', meta: { label: 'Category', filter: 'select', searchable: true } }),
  col.accessor('qty', { header: 'On hand', meta: { label: 'On hand', editable: { type: 'text', validate: (v) => (v.length > 5 ? 'Too long' : null) } } }),
];
const DATA: Row[] = [
  { id: 1, name: 'Pistachio paste', category: 'Pastes', qty: '4' },
  { id: 2, name: 'Hazelnut paste', category: 'Pastes', qty: '2' },
  { id: 3, name: 'Waffle cones', category: 'Cones', qty: '9' },
];

function Harness({ onEdit, onOpen, data = DATA }: { onEdit?: (r: Row, c: string, v: string) => void; onOpen?: (r: Row) => void; data?: Row[] }) {
  const [rows, setRows] = useState(data);
  return (
    <DataGrid<Row>
      id="test"
      label="Test items"
      data={rows}
      columns={columns}
      getRowId={(r) => String(r.id)}
      enableSelection
      exportName="test"
      onRowOpen={onOpen}
      onEdit={(r, c, v) => {
        onEdit?.(r, c, v);
        setRows((all) => all.map((x) => (x.id === r.id ? { ...x, [c]: v } : x)));
      }}
      bulkActions={({ rows: sel, clear }) => <Button onClick={clear}>Do {sel.length}</Button>}
    />
  );
}

const bodyRows = () => within(screen.getByRole('table', { name: 'Test items' })).getAllByRole('row').slice(1);
const names = () => bodyRows().map((r) => within(r).getAllByRole('cell')[1]!.textContent);

describe('DataGrid', () => {
  beforeEach(() => localStorage.clear());

  it('renders a labelled table with a header row and every row', async () => {
    await renderWithProviders(<Harness />);
    expect(screen.getByRole('table', { name: 'Test items' })).toHaveAttribute('aria-rowcount', '4');
    expect(names()).toEqual(['Pistachio paste', 'Hazelnut paste', 'Waffle cones']);
  });

  it('sorts by clicking a header and exposes aria-sort', async () => {
    const { user } = await renderWithProviders(<Harness />);
    const header = screen.getByRole('columnheader', { name: /Item/ });
    await user.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(names()).toEqual(['Hazelnut paste', 'Pistachio paste', 'Waffle cones']);
    await user.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(names()[0]).toBe('Waffle cones');
  });

  it('searches across searchable columns and highlights matches as text', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.type(screen.getByRole('searchbox', { name: 'Search table' }), 'paste');
    expect(names()).toEqual(['Pistachio paste', 'Hazelnut paste']);
    // Item names and the "Pastes" category both match.
    expect([...document.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['paste', 'Paste', 'paste', 'Paste']);
    expect(screen.getByText('2 rows match')).toBeInTheDocument();
  });

  it('shows a clear way out when nothing matches', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.type(screen.getByRole('searchbox', { name: 'Search table' }), 'zzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    expect(names()).toHaveLength(3);
  });

  it('filters by facet values with counts and removable chips', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Cones' }));
    await waitFor(() => expect(names()).toEqual(['Waffle cones']));
    await user.keyboard('{Escape}');
    const chip = screen.getByRole('listitem', { name: '' }) ?? null;
    expect(chip).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove Category filter' }));
    expect(names()).toHaveLength(3);
  });

  it('selects rows, supports shift-range selection and shows bulk actions', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'Select Pistachio paste' }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Select Waffle cones' }));
    await user.keyboard('{/Shift}');
    expect(screen.getByRole('region', { name: '3 selected' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Do 3' }));
    expect(screen.queryByRole('region', { name: /selected/ })).not.toBeInTheDocument();
  });

  it('select-all checkbox selects every filtered row', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'Select all 3 rows' }));
    expect(screen.getByRole('region', { name: '3 selected' })).toBeInTheDocument();
  });

  it('edits a cell inline: Enter saves, validation blocks bad values, Escape cancels', async () => {
    const onEdit = vi.fn();
    const { user } = await renderWithProviders(<Harness onEdit={onEdit} />);
    await user.click(screen.getByRole('button', { name: 'Edit On hand for Pistachio paste' }));
    const input = screen.getByRole('textbox', { name: 'Edit On hand for Pistachio paste' });
    await user.clear(input);
    await user.type(input, 'way too long{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Too long');
    expect(onEdit).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '12{Enter}');
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'qty', '12');
    expect(bodyRows()[0]).toHaveTextContent('12');

    await user.click(screen.getByRole('button', { name: 'Edit On hand for Hazelnut paste' }));
    await user.type(screen.getByRole('textbox', { name: 'Edit On hand for Hazelnut paste' }), '99{Escape}');
    expect(onEdit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit On hand for Hazelnut paste' })).toHaveFocus());
  });

  it('moves between rows with the keyboard and opens with Enter', async () => {
    const onOpen = vi.fn();
    const { user } = await renderWithProviders(<Harness onOpen={onOpen} />);
    const rows = bodyRows();
    rows[0]!.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(bodyRows()[1]).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'Hazelnut paste' }));
    await user.keyboard(' ');
    expect(screen.getByRole('region', { name: '1 selected' })).toBeInTheDocument();
  });

  it('hides columns from the columns menu', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Columns and density' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Show Category' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('columnheader', { name: /Category/ })).not.toBeInTheDocument();
  });

  it('resizes a column with the keyboard', async () => {
    await renderWithProviders(<Harness />);
    const handle = screen.getByRole('separator', { name: 'Resize Category column' });
    const before = Number(handle.getAttribute('aria-valuenow'));
    handle.focus();
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    await waitFor(() => expect(Number(screen.getByRole('separator', { name: 'Resize Category column' }).getAttribute('aria-valuenow'))).toBe(before + 10));
  });

  it('exports the filtered rows as CSV with neutralised formulas', async () => {
    const csv = await import('@/lib/csv');
    const spy = vi.spyOn(csv, 'downloadCSV').mockImplementation(() => {});
    const { user } = await renderWithProviders(<Harness data={[...DATA, { id: 4, name: '=cmd()', category: 'Cones', qty: '1' }]} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search table' }), 'cones');
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Export to CSV' }));
    expect(spy).toHaveBeenCalledTimes(1);
    const [, headers, rows] = spy.mock.calls[0]!;
    expect(headers).toEqual(['Item', 'Category', 'On hand']);
    expect(rows).toEqual([['Waffle cones', 'Cones', '9'], ['=cmd()', 'Cones', '1']]);
    expect(csv.sanitizeCell('=cmd()')).toBe("'=cmd()");
    spy.mockRestore();
  });

  it('remembers search and layout per grid', async () => {
    const first = await renderWithProviders(<Harness />);
    await first.user.type(screen.getByRole('searchbox', { name: 'Search table' }), 'waffle');
    await new Promise((r) => setTimeout(r, 350));
    first.unmount();
    const stored = JSON.parse(localStorage.getItem('tifa.views')!);
    expect(stored.state.lastState.test.globalFilter).toBe('waffle');
  });
});
