import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { IconPlus, IconClipboardCheck, IconCircleCheck, IconTrash, IconTag, IconPackage } from '@tabler/icons-react';
import { Button, ConfirmDialog, Menu, PageHeader, Segmented, StockBadge, StockMeter } from '@/design-system';
import { DataGrid } from '@/design-system/datagrid';
import { useDeleteItems, useItemRows, useRecordCount, useUpdateItems, useVerifyItems, type ItemRow } from '@/data/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { ageInDays } from '@/domain/dates';
import { ITEM_STATUSES, STATUS_LABEL, type ItemStatus } from '@/domain/types';
import { inventoryColumns } from './columns';
import { ItemDrawer } from './ItemDrawer';
import { ItemFormDialog } from './ItemForm';
import styles from './Inventory.module.css';

type Quick = 'all' | 'reorder' | 'review' | 'stale' | 'retired';

const QUICK: Record<Quick, (r: ItemRow) => boolean> = {
  all: (r) => r.status !== 'discontinued',
  reorder: (r) => r.state === 'low' || r.state === 'out',
  review: (r) => r.state === 'review',
  stale: (r) => r.status !== 'discontinued' && (ageInDays(r.last_verified_at) ?? 999) > 14,
  retired: (r) => r.status === 'discontinued',
};

export default function InventoryPage() {
  const { itemId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { rows, isPending, error, refetch } = useItemRows();
  const recordCount = useRecordCount();
  const update = useUpdateItems();
  const verify = useVerifyItems();
  const del = useDeleteItems();
  const [confirmDelete, setConfirmDelete] = useState<ItemRow[] | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const stateParam = params.get('state');
  const quick: Quick = stateParam === 'review' ? 'review' : stateParam === 'reorder' ? 'reorder' : stateParam === 'stale' ? 'stale' : stateParam === 'retired' ? 'retired' : 'all';
  const prefilter = stateParam === 'untracked' ? (r: ItemRow) => r.state === 'untracked' && r.status !== 'discontinued' : QUICK[quick];
  const counts = useMemo(() => Object.fromEntries((Object.keys(QUICK) as Quick[]).map((k) => [k, rows.filter(QUICK[k]).length])), [rows]);
  const categories = new Set(rows.map((r) => r.category)).size;
  const canEditMeta = can('item:edit');

  const columns = useMemo(() => inventoryColumns({ canEditMeta, canCount: (r) => can('item:count', r) }), [canEditMeta, can]);
  const open = itemId ? rows.find((r) => String(r.id) === itemId) : undefined;

  const setQuick = (q: Quick) => {
    const next = new URLSearchParams(params);
    if (q === 'all') next.delete('state');
    else next.set('state', q);
    setParams(next, { replace: true });
  };

  const onEdit = (row: ItemRow, columnId: string, value: string) => {
    if (columnId === 'current_value') return recordCount.mutate({ itemId: row.id, value, name: row.name });
    if (columnId === 'par_level') return update.mutate({ ids: [row.id], patch: { par_level: value === '' ? null : Number(value) }, message: `Par for ${row.name} set to ${value || 'none'}` });
    if (columnId === 'location') return update.mutate({ ids: [row.id], patch: { location: value.trim() || null }, message: value.trim() ? `${row.name} is kept in ${value.trim()}` : `Location cleared for ${row.name}` });
    if (columnId === 'status') return update.mutate({ ids: [row.id], patch: { status: value as ItemStatus }, message: `${row.name} marked ${STATUS_LABEL[value as ItemStatus].toLowerCase()}` });
  };

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Every item with its stock, par and supplier. Click a count to change it, or open an item for its history."
        meta={!isPending && <span className={styles.muted}>{counts.all} items across {categories} categories</span>}
        actions={
          <>
            {can('item:count') && (
              <Button asChild icon={<IconClipboardCheck />}>
                <Link to="/count">Start a count</Link>
              </Button>
            )}
            {can('item:create') && (
              <Button variant="primary" icon={<IconPlus />} onClick={() => setParams((p) => { p.set('new', '1'); return p; })}>
                Add item
              </Button>
            )}
          </>
        }
      />

      <DataGrid<ItemRow>
        id="inventory"
        label="Inventory items"
        data={rows}
        columns={columns}
        getRowId={(r) => String(r.id)}
        loading={isPending}
        error={error}
        onRetry={() => void refetch()}
        prefilter={prefilter}
        enableSelection
        resetSelectionKey={resetKey}
        exportName="inventory"
        searchPlaceholder="Search items, categories, suppliers"
        initialState={{ columnVisibility: { updated_at: false }, sorting: [{ id: 'category', desc: false }] }}
        onRowOpen={(r) => navigate(`/inventory/${r.id}${params.toString() ? `?${params}` : ''}`)}
        onEdit={onEdit}
        rowTone={(r) => (r.state === 'out' ? 'danger' : r.state === 'low' ? 'warning' : r.state === 'review' ? 'review' : undefined)}
        empty={{ icon: <IconPackage />, title: quick === 'all' ? 'No items yet' : 'Nothing here right now', body: quick === 'all' ? 'Add your first item to start tracking stock.' : 'This list is empty, which usually means things are in good shape.' }}
        toolbarStart={
          <Segmented<Quick>
            label="Quick filter"
            value={quick}
            onChange={setQuick}
            options={[
              { value: 'all', label: `All ${counts.all ?? ''}` },
              { value: 'reorder', label: `To reorder ${counts.reorder ?? ''}` },
              { value: 'review', label: `Review ${counts.review ?? ''}` },
              { value: 'stale', label: `Not counted 14d+ ${counts.stale ?? ''}` },
              { value: 'retired', label: 'Retired' },
            ]}
          />
        }
        mobileRow={(r) => (
          <div className={styles.mCard}>
            <div className={styles.mTop}>
              <div>
                <Link to={`/inventory/${r.id}`} className={styles.mName}>
                  {r.name}
                </Link>
                <div className={styles.mSub}>
                  {r.category}
                  {r.subcategory ? ` / ${r.subcategory}` : ''}
                </div>
              </div>
              <StockBadge state={r.state} compact />
            </div>
            <div className={styles.mBottom}>
              <span className={styles.mQty}>{r.current_value || 'Not counted'}</span>
              <StockMeter level={r.level} state={r.state} label={r.name} />
              <span className={styles.mSub}>Par {r.par_level ?? '—'}</span>
            </div>
          </div>
        )}
        bulkActions={({ rows: sel, clear }) => (
          <>
            {sel.every((r) => can('item:count', r)) && (
              <Button size="sm" variant="secondary" icon={<IconCircleCheck />} onClick={() => verify.mutate(sel.map((r) => r.id), { onSuccess: clear })}>
                Confirm counts
              </Button>
            )}
            {canEditMeta && (
              <Menu
                label="Set status"
                trigger={
                  <Button size="sm" variant="secondary" icon={<IconTag />}>
                    Set status
                  </Button>
                }
                items={ITEM_STATUSES.map((s) => ({ label: STATUS_LABEL[s], onSelect: () => update.mutate({ ids: sel.map((r) => r.id), patch: { status: s }, message: `${sel.length} items marked ${STATUS_LABEL[s].toLowerCase()}` }, { onSuccess: clear }) }))}
              />
            )}
            {can('item:delete') && (
              <Button size="sm" variant="danger" icon={<IconTrash />} onClick={() => setConfirmDelete(sel)}>
                Delete
              </Button>
            )}
          </>
        )}
      />

      <ItemDrawer item={open} loading={!!itemId && isPending} onClose={() => navigate({ pathname: '/inventory', search: params.toString() })} />
      <ItemFormDialog open={params.get('new') === '1'} onOpenChange={(o) => !o && setParams((p) => { p.delete('new'); return p; })} existing={rows} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        danger
        loading={del.isPending}
        title={confirmDelete?.length === 1 ? `Delete ${confirmDelete[0]!.name}?` : `Delete ${confirmDelete?.length} items?`}
        description="This also deletes their count history. If you might stock them again, mark them retired instead."
        confirmLabel="Delete"
        onConfirm={() =>
          del.mutate(confirmDelete!.map((r) => r.id), {
            onSuccess: () => {
              setConfirmDelete(null);
              setResetKey((k) => k + 1);
            },
          })
        }
      />
    </>
  );
}
