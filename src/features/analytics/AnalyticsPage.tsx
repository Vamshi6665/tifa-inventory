import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { IconChartLine } from '@tabler/icons-react';
import { EmptyState, PageHeader, Panel, SelectField, Segmented, Skeleton, Stat } from '@/design-system';
import { useCountsByItem, useItemRows, useSchedules } from '@/data/hooks';
import { addDays, formatDate, formatShortDate, startOfWeek, isoDate } from '@/domain/dates';
import { isTracked, numericValue } from '@/domain/quantity';
import { forecastItem, formatRate, weeklySeries } from '@/domain/trends';
import { scheduleFor } from '@/domain/reorder';
import { FREQUENCY_DAYS } from '@/domain/types';
import { Sparkline } from '@/features/charts/Sparkline';
import styles from './Analytics.module.css';

const BarChart = lazy(() => import('@/features/charts/BarChart'));

type Window = '8' | '12' | '26';

export default function AnalyticsPage() {
  const { rows, isPending } = useItemRows();
  const { map, data: counts, isPending: countsPending } = useCountsByItem();
  const schedules = useSchedules();
  const [category, setCategory] = useState('');
  const [weeks, setWeeks] = useState<Window>('12');
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);
  const scope = useMemo(() => rows.filter((r) => isTracked(r) && (!category || r.category === category)), [rows, category]);
  const loading = isPending || countsPending;

  const analysed = useMemo(
    () =>
      scope.map((item) => {
        const history = map.get(item.id) ?? [];
        const freq = scheduleFor(item, schedules.data ?? []);
        return { item, series: weeklySeries(history, Number(weeks), undefined, item.unit_type), forecast: forecastItem(item, history, { windowDays: Number(weeks) * 7, cycleDays: freq ? FREQUENCY_DAYS[freq] : 14 }) };
      }),
    [scope, map, schedules.data, weeks],
  );

  const runningOut = analysed.filter((a) => a.forecast.status === 'ok' && a.forecast.daysToEmpty! <= 30).sort((a, b) => a.forecast.daysToEmpty! - b.forecast.daysToEmpty!).slice(0, 10);
  const movers = analysed
    .filter((a) => a.forecast.status === 'ok' && a.forecast.dailyRate! > 0)
    .map((a) => ({ ...a, cover: a.forecast.current! / (a.forecast.dailyRate! * 7) }))
    .sort((a, b) => b.forecast.dailyRate! / (b.item.par_level || 1) - a.forecast.dailyRate! / (a.item.par_level || 1))
    .slice(0, 10);

  const since = addDays(startOfWeek(new Date()), -7 * (Number(weeks) - 1));
  const scopeIds = new Set(scope.map((s) => s.id));
  const inWindow = (counts ?? []).filter((c) => scopeIds.has(c.item_id) && new Date(c.counted_at) >= since);
  const weekly = useMemo(() => {
    const buckets = Array.from({ length: Number(weeks) }, (_, i) => ({ week: isoDate(addDays(since, i * 7)), n: 0 }));
    for (const c of inWindow) {
      const w = isoDate(startOfWeek(c.counted_at));
      const b = buckets.find((x) => x.week === w);
      if (b) b.n++;
    }
    return buckets;
  }, [inWindow, weeks, since]);
  const numericShare = scope.length ? Math.round((scope.filter((s) => numericValue(s.current_value) != null).length / scope.length) * 100) : 0;
  const forecastable = analysed.filter((a) => a.forecast.status === 'ok').length;

  return (
    <>
      <PageHeader title="Analytics" description="Usage, run-out dates and counting habits, computed from your count history. Every number can be traced back to the counts behind it." />
      <div className={styles.controls}>
        <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All categories" options={categories.map((c) => ({ value: c, label: c }))} />
        <div className={styles.window}>
          <span className={styles.windowLabel} id="window-label">Period</span>
          <Segmented<Window> label="Period" value={weeks} onChange={setWeeks} options={[{ value: '8', label: '8 weeks' }, { value: '12', label: '12 weeks' }, { value: '26', label: '26 weeks' }]} />
        </div>
      </div>

      <div className={styles.stats}>
        <Panel className={styles.statPanel}><Stat label="Counts recorded" value={loading ? '–' : inWindow.length.toLocaleString()} hint={`Last ${weeks} weeks`} /></Panel>
        <Panel className={styles.statPanel}><Stat label="Counts per week" value={loading ? '–' : Math.round(inWindow.length / Number(weeks))} hint="Average" /></Panel>
        <Panel className={styles.statPanel}><Stat label="Readable counts" value={loading ? '–' : `${numericShare}%`} hint="Plain numbers the system can check" tone={numericShare < 90 ? 'warning' : 'ok'} /></Panel>
        <Panel className={styles.statPanel}><Stat label="Items with a forecast" value={loading ? '–' : `${forecastable} of ${scope.length}`} hint="Need two or more usage periods" /></Panel>
      </div>

      <div className={styles.grid}>
        <Panel title="Running out soonest" description="Days of stock left at the current rate of use, if nothing arrives." className={styles.half}>
          {loading ? <Skeleton height={240} /> : runningOut.length === 0 ? <p className={styles.muted}>Nothing is projected to run out in the next 30 days.</p> : (
            <ul role="list" className={styles.bars}>
              {runningOut.map((a) => (
                <li key={a.item.id} className={styles.barRow}>
                  <Link to={`/inventory/${a.item.id}`} className={styles.barName}>{a.item.name}</Link>
                  <span className={styles.barTrack} aria-hidden="true">
                    <span className={a.forecast.daysToEmpty! <= 7 ? styles.barDanger : a.forecast.daysToEmpty! <= 14 ? styles.barWarn : styles.barOk} style={{ width: `${Math.max(3, (a.forecast.daysToEmpty! / 30) * 100)}%` }} />
                  </span>
                  <span className={styles.barValue}>{a.forecast.daysToEmpty! < 1 ? 'Today' : `${Math.round(a.forecast.daysToEmpty!)} days`}<span className="sr-only"> left, around {formatDate(a.forecast.runsOutOn)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Counting activity" description="Counts recorded each week. Regular counting keeps forecasts accurate." className={styles.half}>
          {loading ? <Skeleton height={200} /> : (
            <Suspense fallback={<Skeleton height={200} />}>
              <BarChart labels={weekly.map((w) => formatShortDate(w.week))} values={weekly.map((w) => w.n)} label="Counts per week" />
            </Suspense>
          )}
        </Panel>

        <Panel title="Fastest movers" description="Highest daily use relative to par. Weeks of cover is stock on hand divided by weekly use." className={styles.full} padded={false}>
          {loading ? <div style={{ padding: 16 }}><Skeleton height={240} /></div> : movers.length === 0 ? <div style={{ padding: 16 }}><p className={styles.muted}>Not enough count history yet.</p></div> : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="sr-only">Fastest moving items</caption>
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Trend</th>
                    <th scope="col" className={styles.num}>Per day</th>
                    <th scope="col" className={styles.num}>Per week</th>
                    <th scope="col" className={styles.num}>Par</th>
                    <th scope="col" className={styles.num}>Weeks of cover</th>
                  </tr>
                </thead>
                <tbody>
                  {movers.map((m) => (
                    <tr key={m.item.id}>
                      <td><Link to={`/inventory/${m.item.id}`} className={styles.link}>{m.item.name}</Link><div className={styles.muted}>{m.item.category}</div></td>
                      <td><Sparkline points={m.series} par={m.item.par_level} label={m.item.name} width={120} height={32} /></td>
                      <td className={styles.num}>{formatRate(m.forecast.dailyRate!)}</td>
                      <td className={styles.num}>{formatRate(m.forecast.dailyRate! * 7)}</td>
                      <td className={styles.num}>{m.item.par_level ?? '—'}</td>
                      <td className={styles.num}><span className={m.cover < 1 ? styles.danger : m.cover < 2 ? styles.warn : undefined}>{m.cover.toFixed(1)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Weekly trends" description="Each line is the last count of the week, carried forward through weeks without a count. Dashed line is par." className={styles.full}>
          {loading ? <Skeleton height={300} /> : analysed.length === 0 ? <EmptyState icon={<IconChartLine />} title="No items in this category" /> : (
            <ul role="list" className={styles.multiples}>
              {analysed.filter((a) => a.series.some((p) => p.value != null)).map((a) => (
                <li key={a.item.id}>
                  <Link to={`/inventory/${a.item.id}`} className={styles.multiple}>
                    <span className={styles.mName}>{a.item.name}</span>
                    <Sparkline points={a.series} par={a.item.par_level} label={a.item.name} width={200} height={44} />
                    <span className={styles.mMeta}>
                      On hand {a.item.current_value ?? "—"}, par {a.item.par_level ?? "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
