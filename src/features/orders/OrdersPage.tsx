import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { IconPlus, IconFileInvoice, IconSend, IconTruckDelivery, IconX, IconCopy, IconTrash } from '@tabler/icons-react';
import { toast } from 'sonner';
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, IconButton, PageHeader, SelectField, Skeleton, TextArea, TextField, type Tone } from '@/design-system';
import { DataGrid } from '@/design-system/datagrid';
import { useCreateOrder, useItems, useOrders, useReceiveOrder, useSuppliers, useUpdateOrder } from '@/data/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDate, formatWhen, relativeTime } from '@/domain/dates';
import type { InventoryItem, PurchaseOrder, PurchaseOrderStatus, Supplier } from '@/domain/types';
import styles from './Orders.module.css';

export const PO_STATUS: Record<PurchaseOrderStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'info' },
  partially_received: { label: 'Partly received', tone: 'warning' },
  received: { label: 'Received', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

interface PoRow extends PurchaseOrder {
  supplierName: string;
  units: number;
}

const col = createColumnHelper<PoRow>();

export default function OrdersPage() {
  const { orderId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const orders = useOrders();
  const suppliers = useSuppliers();
  const items = useItems();

  const rows = useMemo<PoRow[]>(
    () => (orders.data ?? []).map((o) => ({ ...o, supplierName: suppliers.data?.find((s) => s.id === o.supplier_id)?.name ?? 'Unknown supplier', units: o.lines.reduce((n, l) => n + l.quantity, 0) })),
    [orders.data, suppliers.data],
  );

  const columns = useMemo(
    () => [
      col.accessor('number', { header: 'Order', size: 120, meta: { label: 'Order', searchable: true, sticky: true, locked: true }, cell: (c) => <span className={styles.number}>{c.getValue()}</span> }),
      col.accessor('supplierName', { header: 'Supplier', size: 220, meta: { label: 'Supplier', searchable: true, filter: 'select' } }),
      col.accessor('status', { header: 'Status', size: 150, meta: { label: 'Status', filter: 'select', filterLabel: (v) => PO_STATUS[v as PurchaseOrderStatus]?.label ?? v, exportValue: (r) => PO_STATUS[r.status].label }, cell: (c) => <Badge tone={PO_STATUS[c.getValue()].tone} dot>{PO_STATUS[c.getValue()].label}</Badge> }),
      col.accessor((r) => r.lines.length, { id: 'lines', header: 'Items', size: 90, meta: { label: 'Items', align: 'right' } }),
      col.accessor('expected_on', { header: 'Expected', size: 140, meta: { label: 'Expected' }, cell: (c) => (c.getValue() ? formatWhen(c.getValue()) : <span className={styles.muted}>Not set</span>) }),
      col.accessor('created_at', { header: 'Created', size: 140, meta: { label: 'Created', exportValue: (r) => new Date(r.created_at) }, cell: (c) => relativeTime(c.getValue()) }),
    ],
    [],
  );

  const open = orderId ? rows.find((r) => String(r.id) === orderId) : undefined;

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Draft orders from the reorder list, send them to suppliers, and receive deliveries to update stock."
        actions={
          can('po:manage') && (
            <Button variant="primary" icon={<IconPlus />} onClick={() => setParams({ new: '1' })}>
              New order
            </Button>
          )
        }
      />
      <DataGrid<PoRow>
        id="orders"
        label="Purchase orders"
        data={rows}
        columns={columns}
        getRowId={(r) => String(r.id)}
        loading={orders.isPending}
        error={orders.error}
        onRetry={() => void orders.refetch()}
        exportName="purchase-orders"
        searchPlaceholder="Search orders or suppliers"
        initialState={{ sorting: [{ id: 'created_at', desc: true }] }}
        onRowOpen={(r) => navigate(`/orders/${r.id}`)}
        empty={{ icon: <IconFileInvoice />, title: 'No purchase orders yet', body: 'Create one here, or from the reorder list where quantities are filled in for you.' }}
        mobileRow={(r) => (
          <button type="button" className={styles.mCard} onClick={() => navigate(`/orders/${r.id}`)}>
            <span className={styles.mTop}>
              <span className={styles.number}>{r.number}</span>
              <Badge tone={PO_STATUS[r.status].tone} dot>{PO_STATUS[r.status].label}</Badge>
            </span>
            <span>{r.supplierName}</span>
            <span className={styles.muted}>
              {r.lines.length} items{r.expected_on ? `, expected ${formatWhen(r.expected_on)}` : ''}
            </span>
          </button>
        )}
      />
      <OrderDrawer order={open} loading={!!orderId && orders.isPending} supplier={suppliers.data?.find((s) => s.id === open?.supplier_id)} items={items.data ?? []} onClose={() => navigate('/orders')} />
      {can('po:manage') && <NewOrderDialog open={params.get('new') === '1'} onOpenChange={(o) => !o && setParams({})} suppliers={suppliers.data ?? []} items={items.data ?? []} />}
    </>
  );
}

function orderText(order: PurchaseOrder, supplier: Supplier | undefined, items: InventoryItem[]) {
  const name = (id: number) => items.find((i) => i.id === id)?.name ?? `Item ${id}`;
  return [
    `Purchase order ${order.number}`,
    supplier ? `To: ${supplier.name}` : '',
    order.expected_on ? `Needed by: ${formatDate(order.expected_on)}` : '',
    '',
    ...order.lines.map((l) => `- ${name(l.item_id)}: ${l.quantity}${l.unit_label ? ` ${l.unit_label}` : ''}`),
    order.notes ? `\nNotes: ${order.notes}` : '',
    '',
    'Tifa Chocolate & Gelato',
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
}

function OrderDrawer({ order, loading, supplier, items, onClose }: { order?: PoRow; loading: boolean; supplier?: Supplier; items: InventoryItem[]; onClose: () => void }) {
  const { can } = useAuth();
  const update = useUpdateOrder();
  const receive = useReceiveOrder();
  const [receiving, setReceiving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [qty, setQty] = useState<Record<number, string>>({});
  const name = (id: number) => items.find((i) => i.id === id)?.name ?? 'Removed item';

  const startReceive = () => {
    setQty(Object.fromEntries((order?.lines ?? []).map((l) => [l.id, String(Math.max(0, l.quantity - l.received_quantity))])));
    setReceiving(true);
  };

  const submitReceive = (e: FormEvent) => {
    e.preventDefault();
    if (!order) return;
    const lines = order.lines.map((l) => ({ line_id: l.id, quantity: Number(qty[l.id] || 0) })).filter((l) => l.quantity > 0);
    if (!lines.length) return toast.error('Enter at least one quantity received.');
    receive.mutate({ id: order.id, lines }, { onSuccess: () => setReceiving(false) });
  };

  const copy = async () => {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(orderText(order, supplier, items));
      toast.success('Order copied. Paste it into an email to the supplier.');
    } catch {
      toast.error('Couldn’t copy. Your browser blocked clipboard access.');
    }
  };

  return (
    <>
      <Dialog open={!!order || loading} onOpenChange={(o) => !o && onClose()} variant="sheet" title={order ? order.number : 'Loading order'} description={order ? `${order.supplierName}, created ${formatDate(order.created_at)}` : undefined}>
        {!order ? (
          loading ? <Skeleton height={240} /> : <EmptyState title="Order not found">It may have been removed.</EmptyState>
        ) : (
          <>
            <div className={styles.headerRow}>
              <Badge tone={PO_STATUS[order.status].tone} dot>{PO_STATUS[order.status].label}</Badge>
              {order.expected_on && <span className={styles.muted}>Expected {formatWhen(order.expected_on)}</span>}
              {order.sent_at && <span className={styles.muted}>Sent {relativeTime(order.sent_at)}</span>}
            </div>
            <div className={styles.actions}>
              {order.status === 'draft' && can('po:manage') && (
                <Button variant="primary" icon={<IconSend />} loading={update.isPending} onClick={() => update.mutate({ id: order.id, patch: { status: 'sent' }, message: `${order.number} marked as sent` })}>
                  Mark as sent
                </Button>
              )}
              {(order.status === 'sent' || order.status === 'partially_received') && can('po:receive') && (
                <Button variant="primary" icon={<IconTruckDelivery />} onClick={startReceive}>
                  Receive delivery
                </Button>
              )}
              <Button icon={<IconCopy />} onClick={() => void copy()}>
                Copy for email
              </Button>
              {(order.status === 'draft' || order.status === 'sent') && can('po:manage') && (
                <Button variant="ghost" icon={<IconX />} onClick={() => setConfirmCancel(true)}>
                  Cancel order
                </Button>
              )}
            </div>
            <table className={styles.lines}>
              <caption className="sr-only">Items on {order.number}</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className={styles.num}>Ordered</th>
                  <th scope="col" className={styles.num}>Received</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{name(l.item_id)}</td>
                    <td className={styles.num}>
                      {l.quantity}
                      {l.unit_label ? ` ${l.unit_label}` : ''}
                    </td>
                    <td className={styles.num}>{l.received_quantity >= l.quantity ? <span className={styles.ok}>{l.received_quantity}</span> : l.received_quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {order.notes && <p className={styles.notes}>{order.notes}</p>}
            {supplier && (
              <dl className={styles.contact}>
                <dt>Contact</dt>
                <dd>{supplier.contact_name ?? '—'}</dd>
                <dt>Email</dt>
                <dd>{supplier.email ? <a href={`mailto:${supplier.email}?subject=${encodeURIComponent(`Order ${order.number}`)}&body=${encodeURIComponent(orderText(order, supplier, items))}`}>{supplier.email}</a> : '—'}</dd>
                <dt>Phone</dt>
                <dd>{supplier.phone ? <a href={`tel:${supplier.phone.replace(/[^\d+]/g, '')}`}>{supplier.phone}</a> : '—'}</dd>
              </dl>
            )}
          </>
        )}
      </Dialog>

      <Dialog
        open={receiving}
        onOpenChange={setReceiving}
        title={`Receive ${order?.number ?? ''}`}
        description="Enter what actually arrived. Plain-number counts go up automatically; anything else is flagged for a recount."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReceiving(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="receive-form" loading={receive.isPending}>Receive and update stock</Button>
          </>
        }
      >
        <form id="receive-form" onSubmit={submitReceive} className={styles.receive}>
          {order?.lines.map((l) => (
            <TextField key={l.id} label={`${name(l.item_id)} (ordered ${l.quantity}, received so far ${l.received_quantity})`} value={qty[l.id] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" />
          ))}
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        danger
        title={`Cancel ${order?.number}?`}
        description="The order stays in the list as cancelled. Nothing changes in stock."
        confirmLabel="Cancel order"
        loading={update.isPending}
        onConfirm={() => order && update.mutate({ id: order.id, patch: { status: 'cancelled' }, message: `${order.number} cancelled` }, { onSuccess: () => setConfirmCancel(false) })}
      />
    </>
  );
}

function NewOrderDialog({ open, onOpenChange, suppliers, items }: { open: boolean; onOpenChange: (o: boolean) => void; suppliers: Supplier[]; items: InventoryItem[] }) {
  const create = useCreateOrder();
  const navigate = useNavigate();
  const [supplierId, setSupplierId] = useState('');
  const [expected, setExpected] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Array<{ item_id: string; quantity: string }>>([{ item_id: '', quantity: '' }]);
  const [error, setError] = useState<string | null>(null);
  const options = useMemo(() => {
    const sid = Number(supplierId);
    const fromSupplier = items.filter((i) => i.supplier_id === sid && i.status !== 'discontinued');
    const rest = items.filter((i) => i.supplier_id !== sid && i.status !== 'discontinued');
    return [...fromSupplier, ...rest].map((i) => ({ value: String(i.id), label: i.supplier_id === sid ? i.name : `${i.name} (${i.category})` }));
  }, [items, supplierId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const valid = lines.filter((l) => l.item_id && Number(l.quantity) > 0);
    if (!supplierId) return setError('Choose a supplier.');
    if (!valid.length) return setError('Add at least one item with a quantity.');
    setError(null);
    create.mutate(
      { supplier_id: Number(supplierId), notes: notes.trim() || null, expected_on: expected || null, lines: valid.map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity), unit_label: null })) },
      {
        onSuccess: (po) => {
          onOpenChange(false);
          setLines([{ item_id: '', quantity: '' }]);
          setSupplierId('');
          setNotes('');
          setExpected('');
          navigate(`/orders/${po.id}`);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New purchase order"
      description="Saved as a draft. Mark it sent once it’s with the supplier."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-po" loading={create.isPending}>Create draft</Button>
        </>
      }
    >
      <form id="new-po" onSubmit={submit} className={styles.newForm} noValidate>
        <SelectField label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="Choose a supplier" options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))} required />
        <TextField label="Needed by" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
        <fieldset className={styles.lineSet}>
          <legend className={styles.legend}>Items</legend>
          {lines.map((l, i) => (
            <div key={i} className={styles.lineRow}>
              <SelectField label={`Item ${i + 1}`} hideLabel value={l.item_id} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, item_id: e.target.value } : x)))} placeholder="Choose an item" options={options} />
              <TextField label={`Quantity for item ${i + 1}`} hideLabel value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: e.target.value.replace(/[^\d.]/g, '') } : x)))} placeholder="Qty" inputMode="decimal" />
              <IconButton label={`Remove item ${i + 1}`} icon={<IconTrash />} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<IconPlus />} onClick={() => setLines((ls) => [...ls, { item_id: '', quantity: '' }])}>
            Add another item
          </Button>
        </fieldset>
        <TextArea label="Notes for the supplier" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} />
        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
