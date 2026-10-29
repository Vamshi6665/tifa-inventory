import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { IconAdjustmentsHorizontal, IconArrowUp, IconArrowDown, IconChecks, IconBulb } from '@tabler/icons-react';
import { Button, Dialog, EmptyState, IconButton, PageHeader, Panel, Skeleton, Stat, StockBadge, StockMeter, Switch } from '@/design-system';
import { useCountsByItem, useItemRows, useOrders, useSuppliers, type ItemRow } from '@/data/hooks';
import { useInsights, useRestock } from '@/data/derived';
import { useAuth } from '@/features/auth/AuthProvider';
import { ALL_WIDGETS, usePreferences, type WidgetId } from '@/stores/preferences';
import { ageInDays, formatWhen, relativeTime } from '@/domain/dates';
import { STATE_ORDER, isTracked } from '@/domain/quantity';
import { REASON_LABEL } from '@/domain/reorder';
import { cx } from '@/lib/cx';
import styles from './Dashboard.module.css';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const { rows, isPending } = useItemRows();
  const orders = useOrders();
  const suppliers = useSuppliers();
  const widgets = usePreferences((s) => s.widgets);
  const hidden = usePreferences((s) => s.hiddenWidgets);
  const [customizing, setCustomizing] = useState(false);
  const firstName = (profile?.display_name ?? '').split(' ')[0];

  const nextDelivery = useMemo(() => {
    const open = (orders.data ?? []).filter((o) => (o.status === 'sent' || o.status === 'partially_received') && o.expected_on).sort((a, b) => a.expected_on!.localeCompare(b.expected_on!));
    const o = open[0];
    if (!o) return null;
    return { ...o, supplier: suppliers.data?.find((s) => s.id === o.supplier_id)?.name ?? 'supplier' };
  }, [orders.data, suppliers.data]);

  const toReorder = rows.filter((r) => r.state === 'low' || r.state === 'out').length;
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

  const visible = widgets.filter((w) => !hidden.includes(w));
  const render: Record<WidgetId, () => React.ReactNode> = {
    attention: () => <AttentionWidget rows={rows} loading={isPending} />,
    insights: () => <InsightsWidget />,
    restock: () => <RestockWidget />,
    categories: () => <CategoryWidget rows={rows} loading={isPending} />,
    freshness: () => <FreshnessWidget rows={rows} loading={isPending} />,
    activity: () => <ActivityWidget rows={rows} />,
  };

  return (
    <>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        description={
          isPending
            ? today
            : `${today}. ${toReorder ? `${toReorder} ${toReorder === 1 ? 'item needs' : 'items need'} reordering` : 'Nothing needs reordering'}${nextDelivery ? `, and ${nextDelivery.number} from ${nextDelivery.supplier} is due ${formatWhen(nextDelivery.expected_on)}.` : '.'}`
        }
        actions={
          <Button icon={<IconAdjustmentsHorizontal />} onClick={() => setCustomizing(true)}>
            Customize
          </Button>
        }
      />
      <div className={styles.grid}>
        {visible.map((w) => (
          <div key={w} className={cx(styles.cell, styles[`w_${w}`])}>
            {render[w]()}
          </div>
        ))}
      </div>
      {visible.length === 0 && (
        <EmptyState title="Your overview is empty" action={<Button onClick={() => setCustomizing(true)}>Choose widgets</Button>}>
          Turn widgets back on to see what needs attention.
        </EmptyState>
      )}
      <CustomizeDialog open={customizing} onOpenChange={setCustomizing} />
    </>
  );
}

/* ---------------- Widgets ---------------- */

function AttentionWidget({ rows, loading }: { rows: ItemRow[]; loading: boolean }) {
  const navigate = useNavigate();
  const tracked = rows.filter(isTracked);
  const out = tracked.filter((r) => r.state === 'out');
  const low = tracked.filter((r) => r.state === 'low');
  const review = tracked.filter((r) => r.state === 'review');
  const stale = tracked.filter((r) => (ageInDays(r.last_verified_at) ?? 999) > 14);
  const list = [...out, ...low].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.level ?? 0) - (b.level ?? 0)).slice(0, 8);

  return (
    <Panel id="w-attention" title="Needs attention" description="Out of stock first, then the lowest relative to par." actions={<Button asChild size="sm" variant="ghost"><Link to="/inventory?state=reorder">See all</Link></Button>}>
      <div className={styles.stats}>
        <Stat label="Out of stock" value={loading ? '–' : out.length} tone={out.length ? 'danger' : 'neutral'} onClick={() => navigate('/inventory?state=reorder')} />
        <Stat label="Low" value={loading ? '–' : low.length} tone={low.length ? 'warning' : 'neutral'} onClick={() => navigate('/inventory?state=reorder')} />
        <Stat label="Needs review" value={loading ? '–' : review.length} tone={review.length ? 'review' : 'neutral'} onClick={() => navigate('/inventory?state=review')} />
        <Stat label="Not counted 14d+" value={loading ? '–' : stale.length} onClick={() => navigate('/inventory?state=stale')} />
      </div>
      {loading ? (
        <div className={styles.listSkeleton}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={40} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={<IconChecks />} title="Everything is above par">
          Nothing is low or out right now.
        </EmptyState>
      ) : (
        <ul role="list" className={styles.attnList}>
          {list.map((r) => (
            <li key={r.id}>
              <Link to={`/inventory/${r.id}`} className={styles.attnRow}>
                <span className={styles.attnName}>
                  {r.name}
                  <span className={styles.attnCat}>{r.category}</span>
                </span>
                <span className={styles.attnQty}>
                  {r.current_value} <span className={styles.attnPar}>/ par {r.par_level}</span>
                </span>
                <span className={styles.attnMeter}>
                  <StockMeter level={r.level} state={r.state} label={r.name} />
                </span>
                <StockBadge state={r.state} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function InsightsWidget() {
  const { insights, isPending } = useInsights();
  return (
    <Panel id="w-insights" title="Insights" description="Rules applied to your counts. Each one says why.">
      {isPending ? (
        <Skeleton height={160} />
      ) : insights.length === 0 ? (
        <EmptyState icon={<IconBulb />} title="Nothing stands out">
          Insights appear when usage, counts or par levels need a look.
        </EmptyState>
      ) : (
        <ul role="list" className={styles.insights}>
          {insights.map((i) => (
            <li key={i.id} className={cx(styles.insight, styles[`i_${i.tone}`])}>
              <p className={styles.insightTitle}>{i.title}</p>
              <p className={styles.insightDetail}>{i.detail}</p>
              {i.action && (
                <Link className={styles.insightAction} to={i.action.to}>
                  {i.action.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RestockWidget() {
  const { suggestions, isPending } = useRestock();
  const top = suggestions.slice(0, 6);
  return (
    <Panel id="w-restock" title="Restock suggestions" description="Quantities cover the next order cycle plus par." actions={<Button asChild size="sm" variant="ghost"><Link to="/reorder">Open reorder list</Link></Button>}>
      {isPending ? (
        <Skeleton height={180} />
      ) : top.length === 0 ? (
        <EmptyState icon={<IconChecks />} title="No orders needed">Nothing is projected to drop below par before its next order.</EmptyState>
      ) : (
        <table className={styles.miniTable}>
          <caption className="sr-only">Top restock suggestions</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Why</th>
              <th scope="col" className={styles.num}>Order</th>
            </tr>
          </thead>
          <tbody>
            {top.map((s) => (
              <tr key={s.item.id}>
                <td>
                  <Link to={`/inventory/${s.item.id}`}>{s.item.name}</Link>
                </td>
                <td className={styles.muted}>{REASON_LABEL[s.reason]}</td>
                <td className={styles.num}>{s.forecast.suggestedQty ?? <span className={styles.muted} title={s.forecast.explanation}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function CategoryWidget({ rows, loading }: { rows: ItemRow[]; loading: boolean }) {
  const cats = useMemo(() => {
    const m = new Map<string, { total: number; ok: number; low: number; out: number; review: number }>();
    for (const r of rows.filter(isTracked)) {
      const c = m.get(r.category) ?? { total: 0, ok: 0, low: 0, out: 0, review: 0 };
      c.total++;
      if (r.state === 'ok' || r.state === 'untracked') c.ok++;
      else c[r.state]++;
      m.set(r.category, c);
    }
    return [...m.entries()].sort((a, b) => b[1].out + b[1].low - (a[1].out + a[1].low));
  }, [rows]);

  return (
    <Panel id="w-categories" title="Category health" description="Share of items in each state.">
      {loading ? (
        <Skeleton height={180} />
      ) : (
        <ul role="list" className={styles.cats}>
          {cats.map(([name, c]) => (
            <li key={name}>
              <Link to={`/inventory?state=reorder`} className={styles.catRow}>
                <span className={styles.catName}>
                  {name}
                  <span className="sr-only">: {c.ok} in stock, {c.low} low, {c.out} out, {c.review} to review.</span>
                </span>
                <span className={styles.catBar} aria-hidden="true">
                  <span style={{ flex: c.ok }} className={styles.segOk} />
                  <span style={{ flex: c.review }} className={styles.segReview} />
                  <span style={{ flex: c.low }} className={styles.segLow} />
                  <span style={{ flex: c.out }} className={styles.segOut} />
                </span>
                <span className={styles.catCount}>{c.low + c.out ? `${c.low + c.out} to order` : 'All good'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.legend} aria-hidden="true">
        <span><i className={styles.segOk} /> In stock</span>
        <span><i className={styles.segReview} /> Review</span>
        <span><i className={styles.segLow} /> Low</span>
        <span><i className={styles.segOut} /> Out</span>
      </div>
    </Panel>
  );
}

function FreshnessWidget({ rows, loading }: { rows: ItemRow[]; loading: boolean }) {
  const cats = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const r of rows.filter(isTracked)) {
      const list = m.get(r.category) ?? [];
      list.push(ageInDays(r.last_verified_at) ?? 99);
      m.set(r.category, list);
    }
    return [...m.entries()].map(([name, ages]) => {
      const sorted = ages.sort((a, b) => a - b);
      return { name, median: sorted[Math.floor(sorted.length / 2)]!, oldest: sorted[sorted.length - 1]! };
    }).sort((a, b) => b.median - a.median);
  }, [rows]);
  return (
    <Panel id="w-freshness" title="Count freshness" description="Typical days since each category was confirmed.">
      {loading ? (
        <Skeleton height={180} />
      ) : (
        <ul role="list" className={styles.fresh}>
          {cats.map((c) => (
            <li key={c.name} className={styles.freshRow}>
              <span className={styles.catName}>{c.name}</span>
              <span className={cx(styles.freshDays, c.median > 14 ? styles.freshStale : c.median > 7 ? styles.freshAging : styles.freshOk)}>{c.median === 0 ? 'Today' : `${c.median}d`}</span>
              <Link to={`/count?category=${encodeURIComponent(c.name)}`} className={styles.freshAction}>
                Count {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ActivityWidget({ rows }: { rows: ItemRow[] }) {
  const { data, isPending } = useCountsByItem();
  const recent = useMemo(() => {
    const names = new Map(rows.map((r) => [r.id, r.name]));
    return [...(data ?? [])].sort((a, b) => b.counted_at.localeCompare(a.counted_at)).slice(0, 7).map((c) => ({ ...c, name: names.get(c.item_id) ?? 'Removed item' }));
  }, [data, rows]);
  return (
    <Panel id="w-activity" title="Recent counts" actions={<Button asChild size="sm" variant="ghost"><Link to="/activity">Full activity</Link></Button>}>
      {isPending ? (
        <Skeleton height={180} />
      ) : (
        <ol className={styles.activity}>
          {recent.map((c) => (
            <li key={c.id} className={styles.actRow}>
              <span className={styles.actWho} aria-hidden="true">{c.recorded_by ?? '–'}</span>
              <span className={styles.actText}>
                <Link to={`/inventory/${c.item_id}`}>{c.name}</Link> {c.source === 'received' ? 'received, now' : 'counted at'} <strong>{c.value}</strong>
              </span>
              <span className={styles.actTime}>{relativeTime(c.counted_at)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/* ---------------- Personalization ---------------- */

function CustomizeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const widgets = usePreferences((s) => s.widgets);
  const hidden = usePreferences((s) => s.hiddenWidgets);
  const set = usePreferences((s) => s.set);
  const ordered = [...widgets, ...ALL_WIDGETS.map((w) => w.id).filter((id) => !widgets.includes(id))];
  const move = (i: number, dir: -1 | 1) => {
    const next = [...ordered];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    set('widgets', next);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Customize overview" description="Choose which widgets show and in what order. Saved on this device." footer={<Button variant="primary" onClick={() => onOpenChange(false)}>Done</Button>}>
      <ul role="list" className={styles.customList}>
        {ordered.map((id, i) => {
          const w = ALL_WIDGETS.find((x) => x.id === id)!;
          return (
            <li key={id} className={styles.customRow}>
              <div className={styles.customSwitch}>
                <Switch id={`widget-${id}`} label={w.label} description={w.description} checked={!hidden.includes(id)} onCheckedChange={(on) => set('hiddenWidgets', on ? hidden.filter((h) => h !== id) : [...hidden, id])} />
              </div>
              <IconButton size="sm" label={`Move ${w.label} up`} icon={<IconArrowUp />} disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton size="sm" label={`Move ${w.label} down`} icon={<IconArrowDown />} disabled={i === ordered.length - 1} onClick={() => move(i, 1)} />
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
