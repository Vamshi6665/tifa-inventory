import { createColumnHelper } from '@tanstack/react-table';
import { Link } from 'react-router';
import { StockBadge, StockMeter, Badge } from '@/design-system';
import { Highlight } from '@/design-system/datagrid';
import type { ItemRow } from '@/data/hooks';
import { STATE_LABEL, STATE_ORDER } from '@/domain/quantity';
import { STATUS_LABEL, ITEM_STATUSES, type ItemStatus, type StockState } from '@/domain/types';
import { relativeTime, formatDate, ageInDays } from '@/domain/dates';
import { validateCount, validateLocation, validatePar } from './validation';
import styles from './Inventory.module.css';

const col = createColumnHelper<ItemRow>();

const STATUS_TONE: Record<ItemStatus, 'neutral' | 'info' | 'review' | 'warning'> = { active: 'neutral', seasonal: 'info', trial: 'review', hold: 'warning', discontinued: 'neutral' };

export function inventoryColumns(opts: { canEditMeta: boolean; canCount: (r: ItemRow) => boolean }) {
  return [
    col.accessor('name', {
      header: 'Item',
      size: 240,
      minSize: 160,
      meta: { label: 'Item', searchable: true, sticky: true, locked: true },
      cell: (c) => (
        <Link to={`/inventory/${c.row.original.id}`} className={styles.nameLink}>
          <Highlight text={c.getValue()} />
        </Link>
      ),
    }),
    col.accessor('current_value', {
      header: 'On hand',
      size: 150,
      meta: {
        label: 'On hand',
        searchable: true,
        editable: { type: 'text', placeholder: 'e.g. 12 or 50%', validate: (v) => validateCount(v), canEdit: (r) => opts.canCount(r) },
        exportValue: (r) => r.current_value,
      },
      cell: (c) => <span className={c.getValue() ? styles.qty : styles.muted}>{c.getValue() || 'Not counted'}</span>,
      sortingFn: (a, b) => (a.original.qty ?? -1) - (b.original.qty ?? -1),
    }),
    col.accessor('level', {
      header: 'Level',
      size: 120,
      enableSorting: true,
      meta: { label: 'Level vs par', exportValue: (r) => (r.level == null ? null : Math.round((r.level / 0.4) * 100) / 100) },
      cell: (c) => <StockMeter level={c.getValue()} state={c.row.original.state} label={c.row.original.name} />,
      sortingFn: (a, b) => (a.original.level ?? 2) - (b.original.level ?? 2),
    }),
    col.accessor('par_level', {
      header: 'Par',
      size: 90,
      meta: {
        label: 'Par',
        align: 'right',
        editable: opts.canEditMeta ? { type: 'number', placeholder: 'None', validate: (v) => validatePar(v), initial: (r) => (r.par_level == null ? '' : String(r.par_level)) } : undefined,
      },
      cell: (c) => <span className={c.getValue() == null ? styles.muted : undefined}>{c.getValue() ?? '—'}</span>,
      sortingFn: (a, b) => (a.original.par_level ?? -1) - (b.original.par_level ?? -1),
    }),
    col.accessor('state', {
      header: 'Stock',
      size: 140,
      meta: { label: 'Stock', filter: 'select', filterLabel: (v) => STATE_LABEL[v as StockState] ?? v, exportValue: (r) => STATE_LABEL[r.state] },
      cell: (c) => <StockBadge state={c.getValue()} />,
      sortingFn: (a, b) => STATE_ORDER[a.original.state] - STATE_ORDER[b.original.state],
    }),
    col.accessor('category', {
      header: 'Category',
      size: 180,
      meta: { label: 'Category', filter: 'select', searchable: true },
    }),
    col.accessor((r) => r.subcategory ?? '', {
      id: 'subcategory',
      header: 'Group',
      size: 150,
      meta: { label: 'Group', filter: 'select', searchable: true, searchValue: (r) => r.subcategory ?? '', filterLabel: (v) => v || 'No group' },
      cell: (c) => <Highlight text={c.getValue() || '—'} />,
    }),
    col.accessor((r) => r.location ?? '', {
      id: 'location',
      header: 'Location',
      size: 150,
      meta: {
        label: 'Location',
        filter: 'select',
        searchable: true,
        searchValue: (r) => r.location ?? '',
        filterLabel: (v) => v || 'Not set',
        editable: opts.canEditMeta ? { type: 'text', placeholder: 'e.g. Back freezer', validate: (v) => validateLocation(v), initial: (r) => r.location ?? '' } : undefined,
      },
      cell: (c) => (c.getValue() ? <Highlight text={c.getValue()} /> : <span className={styles.muted}>—</span>),
    }),
    col.accessor((r) => r.supplier ?? '', {
      id: 'supplier',
      header: 'Supplier',
      size: 180,
      meta: { label: 'Supplier', filter: 'select', searchable: true, searchValue: (r) => r.supplier ?? '', filterLabel: (v) => v || 'No supplier' },
      cell: (c) => (c.getValue() ? <Highlight text={c.getValue()} /> : <span className={styles.muted}>—</span>),
    }),
    col.accessor('status', {
      header: 'Status',
      size: 120,
      meta: {
        label: 'Status',
        filter: 'select',
        filterLabel: (v) => STATUS_LABEL[v as ItemStatus] ?? v,
        exportValue: (r) => STATUS_LABEL[r.status],
        editable: opts.canEditMeta ? { type: 'select', options: ITEM_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })) } : undefined,
      },
      cell: (c) => <Badge tone={STATUS_TONE[c.getValue()]}>{STATUS_LABEL[c.getValue()]}</Badge>,
    }),
    col.accessor((r) => r.last_verified_at ?? r.updated_at, {
      id: 'counted',
      header: 'Last counted',
      size: 140,
      meta: { label: 'Last counted', exportValue: (r) => (r.last_verified_at ? new Date(r.last_verified_at) : null) },
      cell: (c) => {
        const age = ageInDays(c.row.original.last_verified_at);
        return (
          <span className={age == null || age > 14 ? styles.stale : undefined} title={formatDate(c.row.original.last_verified_at)}>
            {c.row.original.last_verified_at ? relativeTime(c.row.original.last_verified_at) : 'Never confirmed'}
          </span>
        );
      },
      sortingFn: (a, b) => (a.original.last_verified_at ?? '').localeCompare(b.original.last_verified_at ?? ''),
    }),
    col.accessor('updated_at', {
      header: 'Last changed',
      size: 140,
      meta: { label: 'Last changed', exportValue: (r) => new Date(r.updated_at) },
      cell: (c) => <span title={formatDate(c.getValue())}>{relativeTime(c.getValue())}</span>,
    }),
  ];
}
