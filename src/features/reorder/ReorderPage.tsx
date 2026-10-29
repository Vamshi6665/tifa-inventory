import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { IconFileInvoice, IconDownload, IconChecks, IconInfoCircle, IconExternalLink } from '@tabler/icons-react';
import { Badge, Button, EmptyState, PageHeader, Panel, SelectField, Skeleton, StockBadge, Tabs, Checkbox } from '@/design-system';
import { useRestock } from '@/data/derived';
import { useCreateOrder, useItems, useSchedules, useSetSchedule, useSuppliers } from '@/data/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { waitingForUpdate } from '@/domain/permissions';
import { DEFAULT_FREQUENCY, REASON_LABEL, groupKey, scheduleRow, type RestockSuggestion } from '@/domain/reorder';
import { formatRate } from '@/domain/trends';
import { formatWhen } from '@/domain/dates';
import { downloadXLSX, fileStamp } from '@/lib/csv';
import { NO_SUBCATEGORY, WEEKDAYS, type ReorderFrequency, type SubcategorySchedule } from '@/domain/types';
import styles from './Reorder.module.css';

export default function ReorderPage() {
  const { suggestions, isPending } = useRestock();
  const suppliers = useSuppliers();
  const { can } = useAuth();
  const [tab, setTab] = useState('suggestions');

  const bySupplier = useMemo(() => {
    const m = new Map<number | null, RestockSuggestion[]>();
    for (const s of suggestions) m.set(s.item.supplier_id, [...(m.get(s.item.supplier_id) ?? []), s]);
    return [...m.entries()].sort((a, b) => (a[0] == null ? 1 : b[0] == null ? -1 : (b[1].length - a[1].length)));
  }, [suggestions]);

  const exportAll = () =>
    void downloadXLSX(`reorder-${fileStamp()}.xlsx`, [
      {
        name: 'Reorder',
        headers: ['Item', 'Category', 'Supplier', 'Reason', 'On hand', 'Par', 'Used per day', 'Suggested order', 'Runs out'],
        rows: suggestions.map((s) => [s.item.name, s.item.category, s.item.supplier ?? '', REASON_LABEL[s.reason], s.item.current_value, s.item.par_level, s.forecast.dailyRate, s.forecast.suggestedQty, s.forecast.runsOutOn]),
      },
    ]);

  return (
    <>
      <PageHeader
        title="Reorder"
        description="Everything at or below par, plus items the forecast says will get there before their next order."
        actions={
          can('export') && (
            <Button icon={<IconDownload />} onClick={exportAll} disabled={!suggestions.length}>
              Export list
            </Button>
          )
        }
      />
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List aria-label="Reorder views">
          <Tabs.Trigger value="suggestions">Suggestions {suggestions.length ? `(${suggestions.length})` : ''}</Tabs.Trigger>
          <Tabs.Trigger value="schedules">Order schedules</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="suggestions">
          <details className={styles.how}>
            <summary>
              <IconInfoCircle aria-hidden="true" size={16} /> How quantities are calculated
            </summary>
            <p>
              For each item, usage per day is the drop between counts divided by the days between them, over the last 8 weeks. Deliveries (counts that go up) are left out rather than guessed. The suggested order brings stock back to par plus enough for one order cycle and the supplier’s lead time. Items whose counts aren’t plain numbers are skipped and listed under Inventory → Review.
            </p>
          </details>
          {isPending ? (
            <Skeleton height={320} />
          ) : suggestions.length === 0 ? (
            <EmptyState icon={<IconChecks />} title="Nothing to order">
              No item is below par or projected to drop there before its next order.
            </EmptyState>
          ) : (
            <div className={styles.groups}>
              {bySupplier.map(([supplierId, list]) => (
                <SupplierGroup key={supplierId ?? 'none'} supplierId={supplierId} supplierName={suppliers.data?.find((s) => s.id === supplierId)?.name} leadTime={suppliers.data?.find((s) => s.id === supplierId)?.lead_time_days ?? null} list={list} canOrder={can('po:manage')} />
              ))}
            </div>
          )}
        </Tabs.Content>
        <Tabs.Content value="schedules">
          <Schedules />
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}

function SupplierGroup({ supplierId, supplierName, leadTime, list, canOrder }: { supplierId: number | null; supplierName?: string; leadTime: number | null; list: RestockSuggestion[]; canOrder: boolean }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const waiting = waitingForUpdate(profile, 'purchasing:view');
  const schedules = useSchedules();
  const create = useCreateOrder();
  const [qty, setQty] = useState<Record<number, string>>(() => Object.fromEntries(list.map((s) => [s.item.id, s.forecast.suggestedQty ? String(s.forecast.suggestedQty) : ''])));
  const [include, setInclude] = useState<Set<number>>(() => new Set(list.map((s) => s.item.id)));
  const lines = list.filter((s) => include.has(s.item.id) && Number(qty[s.item.id]) > 0);
  const headingId = `sup-${supplierId ?? 'none'}`;

  return (
    <Panel
      id={headingId}
      padded={false}
      title={supplierName ?? 'No supplier set'}
      description={supplierId == null ? (canOrder || !waiting ? 'Assign suppliers to these items to order them together.' : 'Order these from your usual vendors; suppliers and purchase orders turn on after the database update.') : `${list.length} ${list.length === 1 ? 'item' : 'items'}${leadTime ? `, usually arrives in ${leadTime} days` : ''}`}
      actions={
        canOrder &&
        supplierId != null && (
          <Button
            variant="primary"
            size="sm"
            icon={<IconFileInvoice />}
            disabled={!lines.length}
            loading={create.isPending}
            onClick={() =>
              create.mutate(
                { supplier_id: supplierId, notes: null, expected_on: null, lines: lines.map((s) => ({ item_id: s.item.id, quantity: Number(qty[s.item.id]), unit_label: null })) },
                { onSuccess: (po) => navigate(`/orders/${po.id}`) },
              )
            }
          >
            Create draft order ({lines.length})
          </Button>
        )
      }
    >
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">Items to reorder from {supplierName ?? 'no supplier'}</caption>
          <thead>
            <tr>
              {canOrder && supplierId != null && (
                <th scope="col" className={styles.check}>
                  <span className="sr-only">Include</span>
                </th>
              )}
              <th scope="col">Item</th>
              <th scope="col">Why</th>
              <th scope="col" className={styles.num}>On hand</th>
              <th scope="col" className={styles.num}>Par</th>
              <th scope="col" className={styles.num}>Per day</th>
              <th scope="col">Runs out</th>
              <th scope="col" className={styles.num}>Order</th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.item.id}>
                {canOrder && supplierId != null && (
                  <td className={styles.check}>
                    <Checkbox label={`Include ${s.item.name}`} checked={include.has(s.item.id)} onChange={(on) => setInclude((set) => { const n = new Set(set); if (on) n.add(s.item.id); else n.delete(s.item.id); return n; })} />
                  </td>
                )}
                <td>
                  <Link to={`/inventory/${s.item.id}`} className={styles.itemLink}>
                    {s.item.name}
                  </Link>
                  <div className={styles.sub}>
                    {s.item.category}
                    <OrderLink href={orderLink(s.item, schedules.data ?? [])} name={s.item.name} />
                  </div>
                </td>
                <td>
                  {s.reason === 'projected' ? <Badge tone="info">Projected</Badge> : <StockBadge state={s.state} />}
                </td>
                <td className={styles.num}>{s.item.current_value}</td>
                <td className={styles.num}>{s.item.par_level}</td>
                <td className={styles.num} title={s.forecast.explanation}>{s.forecast.dailyRate != null ? formatRate(s.forecast.dailyRate) : '—'}</td>
                <td>{s.forecast.runsOutOn ? formatWhen(s.forecast.runsOutOn) : <span className={styles.sub}>Not enough history</span>}</td>
                <td className={styles.num}>
                  {canOrder && supplierId != null ? (
                    <input className={styles.qty} value={qty[s.item.id] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [s.item.id]: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" aria-label={`Order quantity for ${s.item.name}`} placeholder="Qty" />
                  ) : (
                    s.forecast.suggestedQty ?? '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function OrderLink({ href, name }: { href: string | null; name: string }) {
  if (!href) return null;
  return (
    <>
      {' · '}
      <a href={href} target="_blank" rel="noopener noreferrer" className={styles.extLink} aria-label={`Order page for ${name} (opens in a new tab)`}>
        Order page <IconExternalLink aria-hidden="true" size={12} />
      </a>
    </>
  );
}

/** The item's own reorder link, else its group's vendor page. */
function orderLink(item: RestockSuggestion['item'], schedules: readonly SubcategorySchedule[]): string | null {
  return item.reorder_url || scheduleRow(item, schedules)?.vendor_url || null;
}

function Schedules() {
  const items = useItems();
  const schedules = useSchedules();
  const set = useSetSchedule();
  const { can } = useAuth();
  const admin = can('settings:manage');
  const groups = useMemo(() => {
    const m = new Map<string, { category: string; subcategory: string; count: number }>();
    for (const i of items.data ?? []) {
      if (i.status === 'discontinued') continue;
      const key = groupKey(i);
      const k = `${key.category}\u0000${key.subcategory}`;
      const g = m.get(k) ?? { ...key, count: 0 };
      g.count++;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => a.category.localeCompare(b.category) || (a.subcategory === NO_SUBCATEGORY ? 1 : b.subcategory === NO_SUBCATEGORY ? -1 : a.subcategory.localeCompare(b.subcategory)));
  }, [items.data]);
  const row = (c: string, s: string) => schedules.data?.find((x) => x.category === c && x.subcategory === s);
  // Changing one field keeps the others; a group with no row yet starts from its category default.
  const save = (c: string, s: string, patch: Partial<SubcategorySchedule>) => {
    const existing = row(c, s);
    set.mutate({ category: c, subcategory: s, frequency: existing?.frequency ?? DEFAULT_FREQUENCY[c] ?? 'monthly', reorder_day: existing?.reorder_day ?? null, vendor_url: existing?.vendor_url ?? null, ...patch });
  };

  return (
    <Panel padded={false} title="How often each group is ordered" description={`Used to size suggested orders: weekly groups get a 7-day cycle, every two weeks 14, monthly 30. Groups without a setting use their category's default.${admin ? ' Order days are only shown to admins.' : ''}`}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">Order schedule by group</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Group</th>
              <th scope="col" className={styles.num}>Items</th>
              <th scope="col">Ordered</th>
              {admin && <th scope="col">Order day</th>}
              <th scope="col">Vendor page</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const r = row(g.category, g.subcategory);
              const fallback = DEFAULT_FREQUENCY[g.category] ?? 'monthly';
              return (
                <tr key={`${g.category}/${g.subcategory}`}>
                  <td>{g.category}</td>
                  <td>{g.subcategory}</td>
                  <td className={styles.num}>{g.count}</td>
                  <td className={styles.freqCell}>
                    {admin ? (
                      <SelectField
                        label={`How often ${g.subcategory} in ${g.category} is ordered`}
                        hideLabel
                        size="sm"
                        value={r?.frequency ?? ''}
                        placeholder={`Default: ${FREQUENCY_LABEL[fallback].toLowerCase()}`}
                        onChange={(e) => e.target.value && save(g.category, g.subcategory, { frequency: e.target.value as ReorderFrequency })}
                        options={FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))}
                      />
                    ) : (
                      FREQUENCY_LABEL[r?.frequency ?? fallback]
                    )}
                  </td>
                  {admin && (
                    <td className={styles.dayCell}>
                      <SelectField
                        label={`Order day for ${g.subcategory} in ${g.category}`}
                        hideLabel
                        size="sm"
                        value={r?.reorder_day ?? ''}
                        placeholder="Not set"
                        onChange={(e) => save(g.category, g.subcategory, { reorder_day: e.target.value || null })}
                        options={WEEKDAYS.map((d) => ({ value: d, label: d }))}
                      />
                    </td>
                  )}
                  <td className={styles.linkCell}>
                    {admin ? (
                      <VendorLinkInput key={r?.vendor_url ?? ''} group={`${g.subcategory} in ${g.category}`} value={r?.vendor_url ?? ''} onSave={(url) => save(g.category, g.subcategory, { vendor_url: url })} />
                    ) : r?.vendor_url ? (
                      <a href={r.vendor_url} target="_blank" rel="noopener noreferrer" className={styles.extLink} aria-label={`Open vendor page for ${g.subcategory} in ${g.category} (opens in a new tab)`}>
                        Open <IconExternalLink aria-hidden="true" size={14} />
                      </a>
                    ) : (
                      <span className={styles.sub}>None</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

const FREQUENCIES: ReorderFrequency[] = ['weekly', 'biweekly', 'monthly'];
const FREQUENCY_LABEL: Record<ReorderFrequency, string> = { weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly' };

function VendorLinkInput({ group, value, onSave }: { group: string; value: string; onSave: (url: string | null) => void }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);
  const commit = () => {
    const next = draft.trim();
    if (next === value) return setError(false);
    if (next && !/^https?:\/\/\S+$/i.test(next)) return setError(true);
    setError(false);
    onSave(next || null);
  };
  return (
    <div className={styles.linkRow}>
      <input
        className={styles.linkInput}
        type="url"
        inputMode="url"
        value={draft}
        placeholder="https://"
        aria-label={`Vendor page for ${group}`}
        aria-invalid={error || undefined}
        title={error ? 'Use a full address starting with https://' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(value);
        }}
      />
      {value && (
        <a href={value} target="_blank" rel="noopener noreferrer" className={styles.extLink} aria-label={`Open vendor page for ${group} (opens in a new tab)`}>
          <IconExternalLink aria-hidden="true" size={16} />
        </a>
      )}
      {error && <span className={styles.linkError} role="alert">Start with https://</span>}
    </div>
  );
}
