import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react';
import { IconCircleCheck, IconPencil, IconTruckDelivery, IconArrowBackUp, IconExternalLink } from '@tabler/icons-react';
import { Badge, Button, Dialog, Skeleton, StockBadge, StockMeter, TextField, EmptyState } from '@/design-system';
import { useCountsByItem, useRecordCount, useSchedules, useSuppliers, useVerifyItems, type ItemRow } from '@/data/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDateTime, formatWhen, relativeTime } from '@/domain/dates';
import { forecastItem, formatRate, weeklySeries } from '@/domain/trends';
import { scheduleFor, scheduleRow } from '@/domain/reorder';
import { FREQUENCY_DAYS, STATUS_LABEL } from '@/domain/types';
import { validateCount } from './validation';
import { ItemFormDialog } from './ItemForm';
import styles from './Inventory.module.css';

const TrendChart = lazy(() => import('@/features/charts/TrendChart'));

export function ItemDrawer({ item, loading, onClose }: { item: ItemRow | undefined; loading: boolean; onClose: () => void }) {
  const open = !!item || loading;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} variant="sheet" size="lg" title={item?.name ?? 'Loading item'} description={item ? `${item.category}${item.subcategory ? ` / ${item.subcategory}` : ''}` : undefined}>
      {item ? <ItemDetail item={item} /> : loading ? <Skeleton height={300} /> : <EmptyState title="Item not found">It may have been deleted.</EmptyState>}
    </Dialog>
  );
}

function ItemDetail({ item }: { item: ItemRow }) {
  const { can } = useAuth();
  const { map } = useCountsByItem();
  const schedules = useSchedules();
  const suppliers = useSuppliers();
  const record = useRecordCount();
  const verify = useVerifyItems();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const history = useMemo(() => map.get(item.id) ?? [], [map, item.id]);
  const frequency = scheduleFor(item, schedules.data ?? []);
  const orderUrl = item.reorder_url || scheduleRow(item, schedules.data ?? [])?.vendor_url || null;
  const supplier = suppliers.data?.find((s) => s.id === item.supplier_id);
  const forecast = useMemo(() => forecastItem(item, history, { cycleDays: FREQUENCY_DAYS[frequency], leadTimeDays: supplier?.lead_time_days ?? 0 }), [item, history, frequency, supplier]);
  const series = useMemo(() => weeklySeries(history, 12, undefined, item.unit_type), [history, item.unit_type]);
  const canCount = can('item:count', item);
  const previous = history.length > 1 ? history[history.length - 2] : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validateCount(value);
    if (problem) return setError(problem);
    setError(null);
    record.mutate({ itemId: item.id, value: value.trim(), name: item.name }, { onSuccess: () => setValue('') });
  };

  return (
    <>
      <div className={styles.drawerTop}>
        <StockBadge state={item.state} />
        <Badge>{STATUS_LABEL[item.status]}</Badge>
        <Badge tone="info">Ordered {FREQUENCY_TEXT[frequency]}</Badge>
      </div>

      <section className={styles.stockCard} aria-label="Current stock">
        <div>
          <div className={styles.qtyLabel}>On hand</div>
          <div className={styles.bigQty}>{item.current_value || 'Not counted'}</div>
        </div>
        <div className={styles.stockMeta}>
          <span>Par {item.par_level ?? 'not set'}</span>
          <span>Changed {relativeTime(item.updated_at)}</span>
          <span>{item.last_verified_at ? `Confirmed ${relativeTime(item.last_verified_at)}` : 'Never confirmed'}</span>
        </div>
        <div className={styles.meterRow}>
          <StockMeter level={item.level} state={item.state} label={item.name} />
        </div>
      </section>

      {item.state === 'review' && (
        <p className={styles.explain}>This count is written in a way the system can’t compare to par, so it won’t raise low-stock alerts. Counts like 12, 2 trays, 40% or 1 new + 3 are checked automatically; mixed units such as “1 box + 10 packs” aren’t.</p>
      )}

      {canCount && (
        <>
          <form className={styles.countForm} onSubmit={submit} noValidate>
            <TextField label="New count" value={value} onChange={(e) => setValue(e.target.value)} placeholder={item.unit_type === 'percentage' ? 'e.g. 60%' : 'e.g. 12'} error={error} inputMode={item.unit_type === 'freeform' ? 'text' : 'decimal'} maxLength={120} />
            <Button type="submit" variant="primary" loading={record.isPending}>
              Save count
            </Button>
          </form>
          <div className={styles.actionsRow}>
            <Button size="sm" icon={<IconCircleCheck />} onClick={() => verify.mutate([item.id])} loading={verify.isPending}>
              Count is still right
            </Button>
            {previous && previous.value !== item.current_value && (
              <Button size="sm" variant="ghost" icon={<IconArrowBackUp />} onClick={() => record.mutate({ itemId: item.id, value: previous.value, note: 'Reverted to previous count', name: item.name })}>
                Revert to {previous.value}
              </Button>
            )}
            {can('item:edit', item) && (
              <Button size="sm" variant="ghost" icon={<IconPencil />} onClick={() => setEditing(true)}>
                Edit details
              </Button>
            )}
          </div>
        </>
      )}

      <section className={styles.section} aria-labelledby="forecast-h">
        <h3 id="forecast-h" className={styles.sectionTitle}>
          Forecast
        </h3>
        {forecast.status === 'ok' ? (
          <>
            <div className={styles.forecast}>
              <div className={styles.fStat}>
                <span className={styles.fValue}>{formatRate(forecast.dailyRate!)}</span>
                <span className={styles.fLabel}>used per day</span>
              </div>
              <div className={styles.fStat}>
                <span className={styles.fValue}>{forecast.daysToPar == null ? '—' : forecast.daysToPar < 1 ? 'Now' : `${Math.round(forecast.daysToPar)} days`}</span>
                <span className={styles.fLabel}>until par</span>
              </div>
              <div className={styles.fStat}>
                <span className={styles.fValue}>{forecast.suggestedQty}</span>
                <span className={styles.fLabel}>suggested order</span>
              </div>
            </div>
            <p className={styles.explain}>
              {forecast.explanation} Suggested order covers {CYCLE_TEXT[frequency]} cycle{supplier?.lead_time_days ? ` plus ${supplier.lead_time_days} days lead time from ${supplier.name}` : ''} on top of par. Runs out around {formatWhen(forecast.runsOutOn)} if nothing arrives.
            </p>
          </>
        ) : (
          <p className={styles.explain}>{forecast.explanation}</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="trend-h">
        <h3 id="trend-h" className={styles.sectionTitle}>
          Last 12 weeks
        </h3>
        {series.some((p) => p.value != null) ? (
          <Suspense fallback={<Skeleton height={200} />}>
            <TrendChart points={series} par={item.par_level} label={`${item.name} weekly level`} />
          </Suspense>
        ) : (
          <p className={styles.explain}>No numeric counts yet, so there’s nothing to chart.</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="details-h">
        <h3 id="details-h" className={styles.sectionTitle}>
          Details
        </h3>
        <dl className={styles.details}>
          <dt>Supplier</dt>
          <dd>{supplier?.name ?? item.supplier ?? 'None'}</dd>
          <dt>Location</dt>
          <dd>{item.location ?? 'Not set'}</dd>
          {orderUrl && (
            <>
              <dt>Order from</dt>
              <dd>
                <a href={orderUrl} target="_blank" rel="noopener noreferrer" className={styles.extLink}>
                  {item.reorder_url ? 'Product page' : 'Vendor page for this group'} <IconExternalLink aria-hidden="true" size={14} />
                </a>
              </dd>
            </>
          )}
          {item.unit_label && (
            <>
              <dt>One unit is</dt>
              <dd>{item.unit_label.replace(/^1 unit\s*=\s*/i, '')}</dd>
            </>
          )}
          <dt>Counted as</dt>
          <dd>{item.unit_type === 'count' ? 'A number' : item.unit_type === 'percentage' ? 'A percentage' : 'Free text'}</dd>
          {item.par_source_note && (
            <>
              <dt>Par source</dt>
              <dd>{item.par_source_note}</dd>
            </>
          )}
          {item.notes && (
            <>
              <dt>Notes</dt>
              <dd>{item.notes}</dd>
            </>
          )}
        </dl>
      </section>

      <section className={styles.section} aria-labelledby="history-h">
        <h3 id="history-h" className={styles.sectionTitle}>
          Count history
        </h3>
        {history.length ? (
          <ol className={styles.timeline}>
            {[...history]
              .reverse()
              .slice(0, 30)
              .map((c) => (
                <li key={c.id} className={styles.tItem}>
                  <span className={c.source === 'received' ? `${styles.tDot} ${styles.tDotReceived}` : styles.tDot} aria-hidden="true" />
                  <span>
                    <span className={styles.tValue}>{c.value || '—'}</span>
                    {c.source === 'received' && (
                      <>
                        {' '}
                        <IconTruckDelivery size={14} aria-label="delivery" style={{ verticalAlign: '-2px' }} />
                      </>
                    )}
                    {c.note && <span> — {c.note}</span>}
                  </span>
                  <span className={styles.tMeta}>
                    {formatDateTime(c.counted_at)}
                    {c.recorded_by ? ` by ${c.recorded_by}` : ''}
                  </span>
                </li>
              ))}
          </ol>
        ) : (
          <p className={styles.explain}>No counts recorded yet.</p>
        )}
      </section>

      {editing && <ItemFormDialog open={editing} onOpenChange={setEditing} item={item} />}
    </>
  );
}

const FREQUENCY_TEXT = { weekly: 'weekly', biweekly: 'every two weeks', monthly: 'monthly' } as const;
const CYCLE_TEXT = { weekly: 'a one-week', biweekly: 'a two-week', monthly: 'a one-month' } as const;
