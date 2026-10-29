import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { IconPlus, IconBuildingStore, IconPencil, IconTrash, IconWand } from '@tabler/icons-react';
import { Button, ConfirmDialog, Dialog, EmptyState, PageHeader, Skeleton, StockBadge, TextArea, TextField } from '@/design-system';
import { DataGrid } from '@/design-system/datagrid';
import { useCreateSupplier, useDeleteSupplier, useItemRows, useOrders, useUpdateItems, useUpdateSupplier, useSuppliers } from '@/data/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Supplier } from '@/domain/types';
import { z } from 'zod';
import styles from './Suppliers.module.css';

interface SupplierRow extends Supplier {
  itemCount: number;
  lowCount: number;
  openOrders: number;
}

const col = createColumnHelper<SupplierRow>();

const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Give the supplier a name.').max(120),
  contact_name: z.string().trim().max(120).transform((v) => v || null),
  email: z.union([z.literal(''), z.email('Enter a valid email, or leave it blank.')]).transform((v) => v || null),
  phone: z.string().trim().max(40).transform((v) => v || null),
  website: z.union([z.literal(''), z.url({ protocol: /^https?$/, message: 'Enter a full web address starting with https://' })]).transform((v) => v || null),
  lead_time_days: z.string().trim().transform((v) => (v === '' ? null : Number(v))).refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 120), 'Lead time is a whole number of days, 0–120.'),
  notes: z.string().trim().max(1000).transform((v) => v || null),
});
type SupplierForm = z.input<typeof supplierSchema>;

export default function SuppliersPage() {
  const { supplierId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const suppliers = useSuppliers();
  const { rows: items } = useItemRows();
  const orders = useOrders();
  const create = useCreateSupplier();
  const updateItems = useUpdateItems();

  const rows = useMemo<SupplierRow[]>(
    () =>
      (suppliers.data ?? []).map((s) => {
        const mine = items.filter((i) => i.supplier_id === s.id);
        return { ...s, itemCount: mine.length, lowCount: mine.filter((i) => i.state === 'low' || i.state === 'out').length, openOrders: (orders.data ?? []).filter((o) => o.supplier_id === s.id && (o.status === 'sent' || o.status === 'partially_received' || o.status === 'draft')).length };
      }),
    [suppliers.data, items, orders.data],
  );

  // Items that carry a supplier name from the old text column but aren't linked to a supplier record.
  const unlinked = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const i of items) if (!i.supplier_id && i.supplier?.trim()) m.set(i.supplier.trim(), [...(m.get(i.supplier.trim()) ?? []), i.id]);
    return [...m.entries()];
  }, [items]);

  const linkAll = async () => {
    for (const [name, ids] of unlinked) {
      const existing = suppliers.data?.find((s) => s.name.toLowerCase() === name.toLowerCase());
      const supplier = existing ?? (await create.mutateAsync({ name, contact_name: null, email: null, phone: null, website: null, lead_time_days: null, notes: 'Created from item supplier names' }));
      await updateItems.mutateAsync({ ids, patch: { supplier_id: supplier.id }, message: `Linked ${ids.length} items to ${supplier.name}` });
    }
  };

  const columns = useMemo(
    () => [
      col.accessor('name', { header: 'Supplier', size: 240, meta: { label: 'Supplier', searchable: true, sticky: true, locked: true }, cell: (c) => <span className={styles.name}>{c.getValue()}</span> }),
      col.accessor('itemCount', { header: 'Items', size: 90, meta: { label: 'Items', align: 'right' } }),
      col.accessor('lowCount', { header: 'To reorder', size: 110, meta: { label: 'To reorder', align: 'right' }, cell: (c) => (c.getValue() ? <span className={styles.warn}>{c.getValue()}</span> : <span className={styles.muted}>0</span>) }),
      col.accessor('openOrders', { header: 'Open orders', size: 120, meta: { label: 'Open orders', align: 'right' } }),
      col.accessor('lead_time_days', { header: 'Lead time', size: 120, meta: { label: 'Lead time (days)', align: 'right' }, cell: (c) => (c.getValue() == null ? <span className={styles.muted}>—</span> : `${c.getValue()} days`) }),
      col.accessor((r) => r.contact_name ?? '', { id: 'contact', header: 'Contact', size: 160, meta: { label: 'Contact', searchable: true, searchValue: (r) => r.contact_name ?? '' } }),
      col.accessor((r) => r.email ?? '', { id: 'email', header: 'Email', size: 240, meta: { label: 'Email', searchable: true, searchValue: (r) => r.email ?? '' } }),
      col.accessor((r) => r.phone ?? '', { id: 'phone', header: 'Phone', size: 150, meta: { label: 'Phone' } }),
    ],
    [],
  );

  const open = supplierId ? rows.find((r) => String(r.id) === supplierId) : undefined;

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who you buy from, how long deliveries take, and what each one supplies. Lead times feed into suggested order quantities."
        actions={
          can('supplier:manage') && (
            <Button variant="primary" icon={<IconPlus />} onClick={() => setParams({ new: '1' })}>
              Add supplier
            </Button>
          )
        }
      />
      {can('supplier:manage') && unlinked.length > 0 && (
        <div className={styles.banner} role="status">
          <div>
            <strong>{unlinked.length} supplier {unlinked.length === 1 ? 'name is' : 'names are'} only written on items</strong>
            <p>{unlinked.map(([n, ids]) => `${n} (${ids.length})`).join(', ')}. Turn them into suppliers to track lead times and send orders.</p>
          </div>
          <Button icon={<IconWand />} loading={create.isPending || updateItems.isPending} onClick={() => void linkAll()}>
            Create and link
          </Button>
        </div>
      )}
      <DataGrid<SupplierRow>
        id="suppliers"
        label="Suppliers"
        data={rows}
        columns={columns}
        getRowId={(r) => String(r.id)}
        loading={suppliers.isPending}
        error={suppliers.error}
        exportName="suppliers"
        searchPlaceholder="Search suppliers or contacts"
        initialState={{ sorting: [{ id: 'name', desc: false }] }}
        onRowOpen={(r) => navigate(`/suppliers/${r.id}`)}
        empty={{ icon: <IconBuildingStore />, title: 'No suppliers yet', body: 'Add the companies you order from to group reorders and track lead times.' }}
        mobileRow={(r) => (
          <button type="button" className={styles.mCard} onClick={() => navigate(`/suppliers/${r.id}`)}>
            <span className={styles.name}>{r.name}</span>
            <span className={styles.muted}>
              {r.itemCount} items{r.lowCount ? `, ${r.lowCount} to reorder` : ''}
              {r.lead_time_days != null ? `, ${r.lead_time_days}-day lead time` : ''}
            </span>
          </button>
        )}
      />
      <SupplierDrawer supplier={open} loading={!!supplierId && suppliers.isPending} onClose={() => navigate('/suppliers')} />
      <SupplierFormDialog open={params.get('new') === '1'} onOpenChange={(o) => !o && setParams({})} />
    </>
  );
}

function SupplierDrawer({ supplier, loading, onClose }: { supplier?: SupplierRow; loading: boolean; onClose: () => void }) {
  const { can } = useAuth();
  const { rows: items } = useItemRows();
  const del = useDeleteSupplier();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const theirs = items.filter((i) => i.supplier_id === supplier?.id);
  return (
    <>
      <Dialog open={!!supplier || loading} onOpenChange={(o) => !o && onClose()} variant="sheet" title={supplier?.name ?? 'Loading supplier'} description={supplier ? `${supplier.itemCount} items${supplier.lead_time_days != null ? `, ${supplier.lead_time_days}-day lead time` : ''}` : undefined}>
        {!supplier ? (
          loading ? <Skeleton height={240} /> : <EmptyState title="Supplier not found">It may have been removed.</EmptyState>
        ) : (
          <>
            {can('supplier:manage') && (
              <div className={styles.actions}>
                <Button icon={<IconPencil />} onClick={() => setEditing(true)}>Edit</Button>
                <Button variant="ghost" icon={<IconTrash />} onClick={() => setConfirm(true)}>Remove</Button>
              </div>
            )}
            <dl className={styles.details}>
              <dt>Contact</dt>
              <dd>{supplier.contact_name ?? '—'}</dd>
              <dt>Email</dt>
              <dd>{supplier.email ? <a href={`mailto:${supplier.email}`}>{supplier.email}</a> : '—'}</dd>
              <dt>Phone</dt>
              <dd>{supplier.phone ? <a href={`tel:${supplier.phone.replace(/[^\d+]/g, '')}`}>{supplier.phone}</a> : '—'}</dd>
              <dt>Website</dt>
              <dd>{supplier.website ? <a href={supplier.website} target="_blank" rel="noopener noreferrer">{supplier.website.replace(/^https?:\/\//, '')}</a> : '—'}</dd>
              {supplier.notes && (
                <>
                  <dt>Notes</dt>
                  <dd>{supplier.notes}</dd>
                </>
              )}
            </dl>
            <h3 className={styles.sectionTitle}>Items from {supplier.name}</h3>
            {theirs.length ? (
              <ul role="list" className={styles.itemList}>
                {theirs.map((i) => (
                  <li key={i.id}>
                    <Link to={`/inventory/${i.id}`} className={styles.itemRow}>
                      <span>{i.name}</span>
                      <span className={styles.muted}>{i.current_value ?? '—'}</span>
                      <StockBadge state={i.state} compact />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>No items linked yet. Set the supplier on an item to link it.</p>
            )}
          </>
        )}
      </Dialog>
      {supplier && <SupplierFormDialog open={editing} onOpenChange={setEditing} supplier={supplier} />}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        danger
        title={`Remove ${supplier?.name}?`}
        description="Items stay in inventory but lose their supplier link. Suppliers with open orders can’t be removed."
        confirmLabel="Remove supplier"
        loading={del.isPending}
        onConfirm={() => supplier && del.mutate(supplier.id, { onSuccess: () => { setConfirm(false); onClose(); } })}
      />
    </>
  );
}

function SupplierFormDialog({ open, onOpenChange, supplier }: { open: boolean; onOpenChange: (o: boolean) => void; supplier?: Supplier }) {
  const empty: SupplierForm = { name: '', contact_name: '', email: '', phone: '', website: '', lead_time_days: '', notes: '' };
  const [values, setValues] = useState<SupplierForm>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateSupplier();
  const update = useUpdateSupplier();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setValues(supplier ? { name: supplier.name, contact_name: supplier.contact_name ?? '', email: supplier.email ?? '', phone: supplier.phone ?? '', website: supplier.website ?? '', lead_time_days: supplier.lead_time_days == null ? '' : String(supplier.lead_time_days), notes: supplier.notes ?? '' } : empty);
  }, [open, supplier]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof SupplierForm, v: string) => setValues((s) => ({ ...s, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = supplierSchema.safeParse(values);
    if (!r.success) {
      const errs: Record<string, string> = {};
      for (const i of r.error.issues) errs[String(i.path[0])] ??= i.message;
      return setErrors(errs);
    }
    if (supplier) update.mutate({ id: supplier.id, patch: r.data }, { onSuccess: () => onOpenChange(false) });
    else create.mutate(r.data, { onSuccess: () => onOpenChange(false) });
  };
  const formId = supplier ? `supplier-${supplier.id}` : 'new-supplier';
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={supplier ? `Edit ${supplier.name}` : 'Add a supplier'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} loading={create.isPending || update.isPending}>{supplier ? 'Save changes' : 'Add supplier'}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className={styles.form} noValidate>
                <TextField className={styles.full} label="Name" value={values.name} onChange={(e) => set('name', e.target.value)} error={errors.name} required data-autofocus />
        <TextField label="Contact person" value={values.contact_name} onChange={(e) => set('contact_name', e.target.value)} error={errors.contact_name} autoComplete="off" />
        <TextField label="Lead time (days)" value={values.lead_time_days} onChange={(e) => set('lead_time_days', e.target.value)} error={errors.lead_time_days} inputMode="numeric" hint="Days from ordering to delivery." />
        <TextField label="Email" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} error={errors.email} autoComplete="off" />
        <TextField label="Phone" type="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} autoComplete="off" />
        <TextField className={styles.full} label="Website" type="url" value={values.website} onChange={(e) => set('website', e.target.value)} error={errors.website} placeholder="https://" />
        <TextArea className={styles.full} label="Notes" value={values.notes} onChange={(e) => set('notes', e.target.value)} error={errors.notes} rows={3} hint="Delivery days, minimums, account numbers you’re comfortable storing here." />
      </form>
    </Dialog>
  );
}
