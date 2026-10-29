import { useMemo, useState, type ReactNode } from 'react';
import type { Column, Table } from '@tanstack/react-table';
import { IconFilter, IconLayoutColumns, IconDownload, IconBookmark, IconX, IconArrowUp, IconArrowDown, IconTrash, IconCheck } from '@tabler/icons-react';
import { useViews, type GridState } from '@/stores/views';
import { usePreferences } from '@/stores/preferences';
import { downloadCSV, downloadXLSX, fileStamp, type Cell } from '@/lib/csv';
import { Button, IconButton } from '../components/Button';
import { SearchInput, Checkbox, TextField } from '../components/Field';
import { Popover, Menu, Dialog } from '../components/Overlay';
import { Segmented } from '../components/Display';
import styles from './DataGrid.module.css';

interface Props {
  gridId: string;
  table: Table<unknown>;
  data: unknown[];
  query: string;
  onQuery: (q: string) => void;
  searchPlaceholder?: string;
  start?: ReactNode;
  end?: ReactNode;
  exportName?: string;
  state: GridState;
  applyState: (s: Partial<GridState>) => void;
  selectedCount: number;
}

function labelOf(c: Column<unknown>): string {
  const m = c.columnDef.meta;
  return m?.label ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id);
}

export function GridToolbar({ gridId, table, data, query, onQuery, searchPlaceholder, start, end, exportName, state, applyState, selectedCount }: Props) {
  const filterable = table.getAllLeafColumns().filter((c) => c.columnDef.meta?.filter === 'select');
  const activeFilters = table.getState().columnFilters.filter((f) => Array.isArray(f.value) && (f.value as string[]).length);

  const doExport = async (format: 'csv' | 'xlsx', onlySelected: boolean) => {
    const cols = table.getVisibleLeafColumns().filter((c) => c.id !== '__select');
    const rows = (onlySelected ? table.getSelectedRowModel().rows : table.getPrePaginationRowModel().rows).map((r) =>
      cols.map((c): Cell => {
        const meta = c.columnDef.meta;
        if (meta?.exportValue) return meta.exportValue(r.original);
        const v = r.getValue(c.id);
        return v == null ? null : (v as Cell);
      }),
    );
    const headers = cols.map(labelOf);
    const name = `${exportName ?? gridId}-${fileStamp()}`;
    if (format === 'csv') downloadCSV(`${name}.csv`, headers, rows);
    else await downloadXLSX(`${name}.xlsx`, [{ name: exportName ?? 'Export', headers, rows }]);
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarRow}>
        <SearchInput value={query} onChange={onQuery} placeholder={searchPlaceholder ?? 'Search'} label={searchPlaceholder ?? 'Search table'} className={styles.search} />
        {start}
        <div className={styles.toolbarEnd}>
          {filterable.length > 0 && <FilterButton columns={filterable} data={data} activeCount={activeFilters.length} />}
          <ColumnsButton table={table} />
          <ViewsButton gridId={gridId} state={state} applyState={applyState} />
          {exportName !== undefined && (
            <Menu
              label="Export"
              trigger={<IconButton variant="secondary" label="Export" icon={<IconDownload />} />}
              items={[
                { label: 'Export to Excel', icon: <IconDownload />, onSelect: () => void doExport('xlsx', false) },
                { label: 'Export to CSV', icon: <IconDownload />, onSelect: () => void doExport('csv', false) },
                ...(selectedCount
                  ? (['separator', { label: `Export ${selectedCount} selected (Excel)`, icon: <IconDownload />, onSelect: () => void doExport('xlsx', true) }] as const)
                  : []),
              ]}
            />
          )}
          {end}
        </div>
      </div>
      {activeFilters.length > 0 && (
        <div className={styles.chips} role="list" aria-label="Active filters">
          {activeFilters.map((f) => {
            const col = table.getColumn(f.id)!;
            const meta = col.columnDef.meta;
            const values = f.value as string[];
            const text = values.map((v) => meta?.filterLabel?.(v) ?? (v || 'Blank')).join(', ');
            return (
              <span key={f.id} role="listitem" className={styles.chip}>
                <span className={styles.chipLabel}>{labelOf(col)}:</span> {text}
                <button type="button" className={styles.chipX} aria-label={`Remove ${labelOf(col)} filter`} onClick={() => col.setFilterValue(undefined)}>
                  <IconX aria-hidden="true" />
                </button>
              </span>
            );
          })}
          <Button size="sm" variant="ghost" onClick={() => table.resetColumnFilters()}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterButton({ columns, data, activeCount }: { columns: Column<unknown>[]; data: unknown[]; activeCount: number }) {
  return (
    <Popover
      label="Filters"
      width={300}
      trigger={
        <Button variant="secondary" icon={<IconFilter />}>
          <span className={styles.hideNarrow}>Filter</span>
          <span className="sr-only">{activeCount ? ` (${activeCount} active)` : ''}</span>
          {activeCount > 0 && <span className={styles.countPill} aria-hidden="true">{activeCount}</span>}
        </Button>
      }
    >
      <div className={styles.popBody}>
        {columns.map((c) => (
          <FilterGroup key={c.id} column={c} data={data} />
        ))}
      </div>
    </Popover>
  );
}

function FilterGroup({ column }: { column: Column<unknown>; data: unknown[] }) {
  const meta = column.columnDef.meta;
  const facets = column.getFacetedUniqueValues();
  const options = useMemo(() => [...facets.entries()].map(([v, n]) => [String(v ?? ''), n as number] as const).sort((a, b) => a[0].localeCompare(b[0])), [facets]);
  const selected = (column.getFilterValue() as string[] | undefined) ?? [];
  const toggle = (v: string, on: boolean) => {
    const next = on ? [...selected, v] : selected.filter((x) => x !== v);
    column.setFilterValue(next.length ? next : undefined);
  };
  return (
    <fieldset className={styles.filterGroup}>
      <legend className={styles.filterLegend}>{labelOf(column)}</legend>
      <ul role="list" className={styles.filterList}>
        {options.map(([v, n]) => (
          <li key={v}>
            <label className={styles.filterOption}>
              <Checkbox label={meta?.filterLabel?.(v) ?? (v || 'Blank')} checked={selected.includes(v)} onChange={(on) => toggle(v, on)} />
              <span className={styles.filterText}>{meta?.filterLabel?.(v) ?? (v || 'Blank')}</span>
              <span className={styles.filterCount}>{n}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function ColumnsButton({ table }: { table: Table<unknown> }) {
  const density = usePreferences((s) => s.density);
  const setPref = usePreferences((s) => s.set);
  const order = table.getState().columnOrder.length ? table.getState().columnOrder : table.getAllLeafColumns().map((c) => c.id);
  const cols = order.map((id) => table.getColumn(id)).filter((c): c is Column<unknown> => !!c && !c.columnDef.meta?.locked);
  const move = (id: string, dir: -1 | 1) => {
    const next = [...order];
    const i = next.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= next.length || table.getColumn(next[j]!)?.columnDef.meta?.locked) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    table.setColumnOrder(next);
  };
  return (
    <Popover label="Columns" width={300} trigger={<IconButton variant="secondary" label="Columns and density" icon={<IconLayoutColumns />} />}>
      <div className={styles.popBody}>
        <p className={styles.popHint}>Show, hide and reorder columns. You can also drag column headers.</p>
        <ul role="list" className={styles.columnList}>
          {cols.map((c, i) => (
            <li key={c.id} className={styles.columnItem}>
              <label className={styles.filterOption}>
                <Checkbox label={`Show ${labelOf(c)}`} checked={c.getIsVisible()} onChange={(v) => c.toggleVisibility(v)} />
                <span className={styles.filterText}>{labelOf(c)}</span>
              </label>
              <IconButton size="sm" label={`Move ${labelOf(c)} up`} icon={<IconArrowUp />} disabled={i === 0} onClick={() => move(c.id, -1)} />
              <IconButton size="sm" label={`Move ${labelOf(c)} down`} icon={<IconArrowDown />} disabled={i === cols.length - 1} onClick={() => move(c.id, 1)} />
            </li>
          ))}
        </ul>
        <div className={styles.popRow}>
          <span className={styles.popLabel}>Row height</span>
          <Segmented size="sm" label="Row height" value={density} onChange={(v) => setPref('density', v)} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
        </div>
        <Button size="sm" variant="ghost" onClick={() => { table.resetColumnOrder(); table.resetColumnVisibility(); table.resetColumnSizing(); }}>
          Reset columns
        </Button>
      </div>
    </Popover>
  );
}

function ViewsButton({ gridId, state, applyState }: { gridId: string; state: GridState; applyState: (s: Partial<GridState>) => void }) {
  const allViews = useViews((s) => s.views);
  const views = useMemo(() => allViews.filter((v) => v.gridId === gridId), [allViews, gridId]);
  const save = useViews((s) => s.save);
  const remove = useViews((s) => s.remove);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const current = views.find((v) => JSON.stringify(v.state) === JSON.stringify(state));

  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
        label="Saved views"
        width={280}
        trigger={
          <Button variant="secondary" icon={<IconBookmark />} aria-label={current ? `Saved views, current: ${current.name}` : 'Saved views'}>
            <span className={styles.hideNarrow}>{current ? current.name : 'Views'}</span>
          </Button>
        }
      >
        <div className={styles.popBody}>
          <ul role="list" className={styles.viewList}>
            <li>
              <button type="button" className={styles.viewItem} onClick={() => { applyState({}); setOpen(false); }}>
                <span>Default</span>
              </button>
            </li>
            {views.map((v) => (
              <li key={v.id} className={styles.viewRow}>
                <button type="button" className={styles.viewItem} onClick={() => { applyState(v.state); setOpen(false); }} aria-current={current?.id === v.id || undefined}>
                  {current?.id === v.id && <IconCheck aria-hidden="true" size={14} />}
                  <span>{v.name}</span>
                </button>
                <IconButton size="sm" label={`Delete view ${v.name}`} icon={<IconTrash />} onClick={() => remove(v.id)} />
              </li>
            ))}
          </ul>
          <Button size="sm" variant="subtle" block onClick={() => { setOpen(false); setName(''); setNaming(true); }}>
            Save current view
          </Button>
        </div>
      </Popover>
      <Dialog
        open={naming}
        onOpenChange={setNaming}
        title="Save view"
        description="Saves the current search, filters, sorting and columns."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNaming(false)}>Cancel</Button>
            <Button variant="primary" form={`save-view-${gridId}`} type="submit">Save view</Button>
          </>
        }
      >
        <form
          id={`save-view-${gridId}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            save(gridId, name, state);
            setNaming(false);
          }}
        >
                    <TextField label="View name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Low gelato supplies" maxLength={60} required data-autofocus />
        </form>
      </Dialog>
    </>
  );
}
