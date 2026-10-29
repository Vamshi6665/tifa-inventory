import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type Row,
  type RowSelectionState,
  type Table,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { IconArrowUp, IconArrowDown, IconSelector, IconChevronLeft, IconChevronRight, IconAlertTriangle, IconSearchOff } from '@tabler/icons-react';
import { score } from '@/domain/search';
import { useViews, type GridState } from '@/stores/views';
import { usePreferences } from '@/stores/preferences';
import { useIsNarrow } from '@/lib/useMediaQuery';
import { cx } from '@/lib/cx';
import { Checkbox } from '../components/Field';
import { Button, IconButton } from '../components/Button';
import { EmptyState, Skeleton } from '../components/Display';
import { SelectField } from '../components/Field';
import { EditableCell } from './EditableCell';
import { GridSearchContext, Highlight } from './Highlight';
import { GridToolbar } from './Toolbar';
import type { BulkContext, GridEmpty } from './types';
import styles from './DataGrid.module.css';
import './types';

export type PageSize = 25 | 50 | 100 | 'all';
const VIRTUALIZE_AFTER = 80;

export interface DataGridProps<T> {
  id: string;
  label: string;
  data: T[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  empty?: GridEmpty;
  onRowOpen?: (row: T) => void;
  onEdit?: (row: T, columnId: string, value: string) => void | Promise<void>;
  bulkActions?: (ctx: BulkContext<T>) => ReactNode;
  enableSelection?: boolean;
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  exportName?: string;
  searchPlaceholder?: string;
  initialState?: Partial<GridState>;
  defaultPageSize?: PageSize;
  mobileRow?: (row: T) => ReactNode;
  rowTone?: (row: T) => 'danger' | 'warning' | 'review' | undefined;
  /** Filter applied before search and column filters (e.g. quick-filter tabs). */
  prefilter?: (row: T) => boolean;
  /** Increment to programmatically clear selection. */
  resetSelectionKey?: number;
}

const inSet: FilterFn<unknown> = (row, columnId, values: string[]) => !values?.length || values.includes(String(row.getValue(columnId) ?? ''));
inSet.autoRemove = (v: string[]) => !v?.length;

const EMPTY_STATE: GridState = { sorting: [], columnFilters: [], columnOrder: [], columnVisibility: {}, columnSizing: {}, globalFilter: '' };

export function DataGrid<T>(props: DataGridProps<T>) {
  const { id, label, data, getRowId, loading, error, onRetry, empty, onRowOpen, onEdit, bulkActions, enableSelection, prefilter, defaultPageSize = 'all', mobileRow, rowTone } = props;
  const remembered = useViews((s) => s.lastState[id]);
  const remember = useViews((s) => s.remember);
  const density = usePreferences((s) => s.density);
  const narrow = useIsNarrow();
  const start = useMemo<GridState>(() => ({ ...EMPTY_STATE, ...props.initialState, ...remembered }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [sorting, setSorting] = useState(start.sorting);
  const [columnFilters, setColumnFilters] = useState(start.columnFilters);
  const [columnOrder, setColumnOrder] = useState(start.columnOrder);
  const [columnVisibility, setColumnVisibility] = useState(start.columnVisibility);
  const [columnSizing, setColumnSizing] = useState(start.columnSizing);
  const [query, setQuery] = useState(start.globalFilter);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageSize, setPageSize] = useState<PageSize>(defaultPageSize);
  const [pageIndex, setPageIndex] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);
  const [mobileLimit, setMobileLimit] = useState(40);
  const lastSelected = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => setRowSelection({}), [props.resetSelectionKey]);

  // Remember layout and filters per grid so people return to what they left.
  useEffect(() => {
    const t = setTimeout(() => remember(id, { sorting, columnFilters, columnOrder, columnVisibility, columnSizing, globalFilter: query }), 300);
    return () => clearTimeout(t);
  }, [id, remember, sorting, columnFilters, columnOrder, columnVisibility, columnSizing, query]);

  useEffect(() => setPageIndex(0), [query, columnFilters, pageSize, prefilter]);

  const searchableAccessors = useMemo(
    () =>
      props.columns
        .filter((c) => c.meta?.searchable)
        .map((c) => {
          const meta = c.meta!;
          const key = 'accessorKey' in c ? (c.accessorKey as keyof T) : undefined;
          return (row: T) => (meta.searchValue ? meta.searchValue(row) : key != null ? String(row[key] ?? '') : '');
        }),
    [props.columns],
  );

  const searched = useMemo(() => {
    const base = prefilter ? data.filter(prefilter) : data;
    if (!query.trim()) return base;
    return base.filter((r) => score(searchableAccessors.map((f) => f(r)).join(' • '), query) > 0);
  }, [data, prefilter, query, searchableAccessors]);

  const columns = useMemo<ColumnDef<T>[]>(() => {
    const cols = props.columns.map((c) => {
      const meta = c.meta;
      const out: ColumnDef<T> = { ...c, filterFn: meta?.filter === 'select' ? (inSet as FilterFn<T>) : c.filterFn };
      if (meta?.editable && onEdit) {
        const original = c.cell;
        out.cell = (ctx) => {
          const display = typeof original === 'function' ? original(ctx) : original ?? String(ctx.getValue() ?? '');
          return (
            <EditableCell
              row={ctx.row.original}
              value={String(ctx.getValue() ?? '')}
              label={`${meta.label ?? ctx.column.id} for ${String((ctx.row.original as { name?: string }).name ?? 'row')}`}
              config={meta.editable!}
              display={display}
              onCommit={(v) => onEdit(ctx.row.original, ctx.column.id, v)}
            />
          );
        };
      } else if (!c.cell && meta?.searchable) {
        out.cell = (ctx) => <Highlight text={String(ctx.getValue() ?? '')} />;
      }
      return out;
    });
    if (!enableSelection) return cols;
    const select: ColumnDef<T> = {
      id: '__select',
      size: 44,
      enableResizing: false,
      enableSorting: false,
      meta: { locked: true, sticky: true, label: 'Select' },
      header: ({ table }) => (
        <Checkbox
          label={table.getIsAllRowsSelected() ? 'Deselect all rows' : `Select all ${table.getPrePaginationRowModel().rows.length} rows`}
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={(v) => table.toggleAllRowsSelected(v)}
        />
      ),
      cell: () => null, // rendered by the row so shift-click can see the row index
    };
    return [select, ...cols];
  }, [props.columns, enableSelection, onEdit]);

  const table = useReactTable({
    data: searched,
    columns,
    getRowId: (r) => getRowId(r),
    state: { sorting, columnFilters, columnOrder, columnVisibility, columnSizing, rowSelection, pagination: { pageIndex, pageSize: pageSize === 'all' ? Number.MAX_SAFE_INTEGER : pageSize } },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: (u) => {
      const next = typeof u === 'function' ? u({ pageIndex, pageSize: pageSize === 'all' ? Number.MAX_SAFE_INTEGER : pageSize }) : u;
      setPageIndex(next.pageIndex);
    },
    enableRowSelection: !!enableSelection,
    enableMultiSort: true,
    columnResizeMode: 'onChange',
    defaultColumn: { minSize: 64, size: 160, maxSize: 640 },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    autoResetPageIndex: false,
  });

  const rows = table.getRowModel().rows;
  const allFiltered = table.getPrePaginationRowModel().rows;
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const clearSelection = useCallback(() => setRowSelection({}), []);
  const rowHeight = density === 'compact' ? 36 : 44;
  const virtual = rows.length > VIRTUALIZE_AFTER;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    enabled: virtual && !narrow,
  });
  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer]);

  const items = virtual && !narrow ? virtualizer.getVirtualItems() : null;
  const padTop = items?.length ? items[0]!.start : 0;
  const padBottom = items?.length ? virtualizer.getTotalSize() - items[items.length - 1]!.end : 0;
  const visibleRows = items ? items.map((v) => rows[v.index]!) : rows;

  const toggleRow = (row: Row<T>, index: number, shift: boolean) => {
    if (shift && lastSelected.current != null) {
      const [a, b] = [lastSelected.current, index].sort((x, y) => x - y);
      const next = { ...rowSelection };
      const value = !row.getIsSelected();
      for (let i = a!; i <= b!; i++) {
        const r = rows[i];
        if (r) {
          if (value) next[r.id] = true;
          else delete next[r.id];
        }
      }
      setRowSelection(next);
    } else {
      row.toggleSelected();
    }
    lastSelected.current = index;
  };

  const focusRow = (index: number) => {
    const i = Math.max(0, Math.min(rows.length - 1, index));
    setFocusIndex(i);
    if (virtual) virtualizer.scrollToIndex(i, { align: 'auto' });
    requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.focus());
  };

  const onBodyKeyDown = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'TR') return;
    const index = Number(target.dataset.index);
    const row = rows[index];
    if (!row) return;
    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        focusRow(index + 1);
        break;
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        focusRow(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusRow(0);
        break;
      case 'End':
        e.preventDefault();
        focusRow(rows.length - 1);
        break;
      case 'Enter':
        if (onRowOpen) {
          e.preventDefault();
          onRowOpen(row.original);
        }
        break;
      case ' ':
      case 'x':
        if (enableSelection) {
          e.preventDefault();
          toggleRow(row, index, e.shiftKey);
        }
        break;
      case 'Escape':
        if (Object.keys(rowSelection).length) {
          e.preventDefault();
          clearSelection();
        }
        break;
    }
  };

  // Sticky left offsets for pinned columns.
  const leaf = table.getVisibleLeafColumns();
  const stickyLeft = new Map<string, number>();
  let acc = 0;
  for (const c of leaf) {
    if (!c.columnDef.meta?.sticky) break;
    stickyLeft.set(c.id, acc);
    acc += c.getSize();
  }

  const state: GridState = { sorting, columnFilters, columnOrder, columnVisibility, columnSizing, globalFilter: query };
  const applyState = (s: Partial<GridState>) => {
    setSorting(s.sorting ?? []);
    setColumnFilters(s.columnFilters ?? []);
    setColumnOrder(s.columnOrder ?? []);
    setColumnVisibility(s.columnVisibility ?? {});
    setColumnSizing(s.columnSizing ?? {});
    setQuery(s.globalFilter ?? '');
  };

  const showEmpty = !loading && !error && allFiltered.length === 0;
  const filtered = query.trim() !== '' || columnFilters.length > 0;

  return (
    <GridSearchContext.Provider value={query}>
      <div className={styles.grid}>
        <GridToolbar
          gridId={id}
          table={table as Table<unknown>}
          data={searched as unknown[]}
          query={query}
          onQuery={setQuery}
          searchPlaceholder={props.searchPlaceholder}
          start={props.toolbarStart}
          end={props.toolbarEnd}
          exportName={props.exportName}
          state={state}
          applyState={applyState}
          selectedCount={selected.length}
        />

        <p className="sr-only" aria-live="polite">
          {loading ? '' : `${allFiltered.length} ${allFiltered.length === 1 ? 'row' : 'rows'}${filtered ? ' match' : ''}`}
        </p>

        {error ? (
          <div className={styles.frame}>
            <EmptyState icon={<IconAlertTriangle />} title="Couldn’t load this table" action={onRetry && <Button onClick={onRetry}>Try again</Button>}>
              {error.message}
            </EmptyState>
          </div>
        ) : narrow && mobileRow ? (
          <div className={styles.mobileList}>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={72} radius={12} />)
            ) : showEmpty ? (
              <GridEmptyState empty={empty} filtered={filtered} onClear={() => applyState({ ...state, columnFilters: [], globalFilter: '' })} />
            ) : (
              <>
                <ul role="list" aria-label={label} className={styles.cards}>
                  {allFiltered.slice(0, mobileLimit).map((r) => (
                    <li key={r.id} className={cx(styles.card, r.getIsSelected() && styles.cardSelected)}>
                      {enableSelection && (
                        <span className={styles.cardCheck}>
                          <Checkbox label={`Select ${(r.original as { name?: string }).name ?? 'row'}`} checked={r.getIsSelected()} onChange={() => r.toggleSelected()} />
                        </span>
                      )}
                      {mobileRow(r.original)}
                    </li>
                  ))}
                </ul>
                {allFiltered.length > mobileLimit && (
                  <Button variant="secondary" block onClick={() => setMobileLimit((n) => n + 40)}>
                    Show more ({allFiltered.length - mobileLimit} left)
                  </Button>
                )}
              </>
            )}
          </div>
        ) : (
          <div ref={scrollRef} className={cx(styles.frame, styles.scroll, virtual && styles.tall)} tabIndex={-1}>
            <table className={styles.table} style={{ width: table.getTotalSize(), minWidth: '100%' }} aria-label={label} aria-rowcount={allFiltered.length + 1} aria-busy={loading || undefined}>
              <colgroup>
                {leaf.map((c) => (
                  <col key={c.id} style={{ width: c.getSize() }} />
                ))}
              </colgroup>
              <thead className={styles.thead}>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} aria-rowindex={1}>
                    {hg.headers.map((h) => (
                      <HeaderCell key={h.id} header={h} table={table} stickyLeft={stickyLeft.get(h.column.id)} />
                    ))}
                  </tr>
                ))}
              </thead>
              {/* Arrow keys move between rows: one delegated handler instead of one per row. */}
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
              <tbody ref={bodyRef} onKeyDown={onBodyKeyDown}>
                {loading ? (
                  Array.from({ length: 10 }, (_, i) => (
                    <tr key={i} className={styles.row}>
                      {leaf.map((c) => (
                        <td key={c.id} className={styles.td}>
                          <Skeleton width={c.id === '__select' ? 16 : '70%'} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : showEmpty ? (
                  <tr>
                    <td colSpan={leaf.length}>
                      <GridEmptyState empty={empty} filtered={filtered} onClear={() => applyState({ ...state, columnFilters: [], globalFilter: '' })} />
                    </td>
                  </tr>
                ) : (
                  <>
                    {padTop > 0 && <tr aria-hidden="true" style={{ height: padTop }} />}
                    {visibleRows.map((row) => {
                      const index = rows.indexOf(row);
                      const tone = rowTone?.(row.original);
                      return (
                        <tr
                          key={row.id}
                          data-index={index}
                          aria-rowindex={pageSize === 'all' ? index + 2 : pageIndex * (pageSize as number) + index + 2}
                          aria-selected={enableSelection ? row.getIsSelected() : undefined}
                          tabIndex={index === focusIndex ? 0 : -1}
                          className={cx(styles.row, row.getIsSelected() && styles.selected, onRowOpen && styles.clickable, tone && styles[`tone_${tone}`])}
                          style={{ height: rowHeight }}
                          onFocus={() => setFocusIndex(index)}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label')) return;
                            setFocusIndex(index);
                            onRowOpen?.(row.original);
                          }}
                        >
                          {row.getVisibleCells().map((cell) => {
                            const meta = cell.column.columnDef.meta;
                            const left = stickyLeft.get(cell.column.id);
                            return (
                              <td key={cell.id} className={cx(styles.td, meta?.align === 'right' && styles.right, meta?.align === 'center' && styles.center, left != null && styles.sticky)} style={left != null ? { left } : undefined}>
                                {cell.column.id === '__select' ? (
                                  <Checkbox label={`Select ${(row.original as { name?: string }).name ?? 'row'}`} checked={row.getIsSelected()} onChange={(_v, shift) => toggleRow(row, index, shift)} />
                                ) : (
                                  flexRender(cell.column.columnDef.cell, cell.getContext())
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {padBottom > 0 && <tr aria-hidden="true" style={{ height: padBottom }} />}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}

        <footer className={styles.footer}>
          <span className={styles.count}>
            {loading ? 'Loading…' : pageSize === 'all' || allFiltered.length <= (pageSize as number) ? `${allFiltered.length.toLocaleString()} ${allFiltered.length === 1 ? 'row' : 'rows'}` : `${(pageIndex * (pageSize as number) + 1).toLocaleString()}–${Math.min((pageIndex + 1) * (pageSize as number), allFiltered.length).toLocaleString()} of ${allFiltered.length.toLocaleString()}`}
            {data.length !== allFiltered.length && !loading && <span className={styles.ofTotal}> (of {data.length.toLocaleString()})</span>}
          </span>
          {!narrow && (
            <div className={styles.pager}>
              <SelectField
                label="Rows per page"
                hideLabel
                size="sm"
                value={String(pageSize)}
                onChange={(e) => setPageSize(e.target.value === 'all' ? 'all' : (Number(e.target.value) as PageSize))}
                options={[
                  { value: '25', label: '25 per page' },
                  { value: '50', label: '50 per page' },
                  { value: '100', label: '100 per page' },
                  { value: 'all', label: 'Show all' },
                ]}
              />
              {pageSize !== 'all' && (
                <>
                  <IconButton size="sm" label="Previous page" icon={<IconChevronLeft />} disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} />
                  <span className={styles.pageNum}>
                    Page {pageIndex + 1} of {Math.max(1, table.getPageCount())}
                  </span>
                  <IconButton size="sm" label="Next page" icon={<IconChevronRight />} disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} />
                </>
              )}
            </div>
          )}
        </footer>

        {enableSelection && bulkActions && selected.length > 0 && (
          <div className={styles.bulk} role="region" aria-label={`${selected.length} selected`}>
            <span className={styles.bulkCount}>
              <strong>{selected.length}</strong> selected
            </span>
            <div className={styles.bulkActions}>{bulkActions({ rows: selected, clear: clearSelection })}</div>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        )}
      </div>
    </GridSearchContext.Provider>
  );
}

function GridEmptyState({ empty, filtered, onClear }: { empty?: GridEmpty; filtered: boolean; onClear: () => void }) {
  if (filtered) {
    return (
      <EmptyState icon={<IconSearchOff />} title="No matches" action={<Button onClick={onClear}>Clear search and filters</Button>}>
        Nothing matches the current search and filters.
      </EmptyState>
    );
  }
  return (
    <EmptyState icon={empty?.icon} title={empty?.title ?? 'Nothing here yet'} action={empty?.action}>
      {empty?.body}
    </EmptyState>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HeaderCell<T>({ header, table, stickyLeft }: { header: any; table: Table<T>; stickyLeft?: number }) {
  const column = header.column;
  const meta = column.columnDef.meta ?? {};
  const sorted = column.getIsSorted() as false | 'asc' | 'desc';
  const [dragOver, setDragOver] = useState(false);
  const label = meta.label ?? (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id);
  const draggable = !meta.locked;

  /* The resize handle is a focusable separator (ARIA window-splitter pattern) driven by arrow keys. */
  const move = (fromId: string) => {
    if (fromId === column.id) return;
    const order = table.getState().columnOrder.length ? [...table.getState().columnOrder] : table.getAllLeafColumns().map((c) => c.id);
    const from = order.indexOf(fromId);
    const to = order.indexOf(column.id);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, order.splice(from, 1)[0]!);
    table.setColumnOrder(order);
  };

  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- focusable separator (window-splitter pattern) */
  return (
    <th
      scope="col"
      className={cx(styles.th, meta.align === 'right' && styles.right, meta.align === 'center' && styles.center, stickyLeft != null && styles.sticky, dragOver && styles.dragOver)}
      style={stickyLeft != null ? { left: stickyLeft } : undefined}
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : column.getCanSort() ? 'none' : undefined}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-column', column.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (!draggable || !e.dataTransfer.types.includes('text/x-column')) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        const from = e.dataTransfer.getData('text/x-column');
        if (from) move(from);
      }}
    >
      {header.isPlaceholder ? null : column.getCanSort() ? (
        <button type="button" className={styles.sortButton} onClick={column.getToggleSortingHandler()} title={`Sort by ${label}${sorted ? '' : ' (shift-click to add)'}`}>
          <span className={styles.thLabel}>{flexRender(column.columnDef.header, header.getContext())}</span>
          <span className={cx(styles.sortIcon, sorted && styles.sortActive)} aria-hidden="true">
            {sorted === 'asc' ? <IconArrowUp /> : sorted === 'desc' ? <IconArrowDown /> : <IconSelector />}
          </span>
          {sorted && table.getState().sorting.length > 1 && <span className={styles.sortIndex}>{column.getSortIndex() + 1}</span>}
        </button>
      ) : (
        <span className={styles.thLabel}>{flexRender(column.columnDef.header, header.getContext())}</span>
      )}
      {column.getCanResize() && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label} column`}
          aria-valuenow={Math.round(column.getSize())}
          aria-valuemin={column.columnDef.minSize ?? 64}
          aria-valuemax={column.columnDef.maxSize ?? 640}
          tabIndex={0}
          className={cx(styles.resizer, column.getIsResizing() && styles.resizing)}
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          onDoubleClick={() => column.resetSize()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const delta = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 40 : 10);
            table.setColumnSizing((s) => ({ ...s, [column.id]: Math.max(64, Math.min(640, column.getSize() + delta)) }));
          }}
        />
      )}
    </th>
  );
  /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
}
