import { addDays, daysBetween, startOfWeek, isoDate } from './dates';
import { quantityOf } from './quantity';
import type { InventoryItem, StockCount, UnitType } from './types';

export interface WeeklyPoint {
  /** ISO date (yyyy-mm-dd) of the Monday that starts the week. */
  week: string;
  value: number | null;
  /** True when no count happened that week and the previous value carries forward. */
  carried: boolean;
}

interface NumericCount {
  at: number;
  value: number;
}

function numericCounts(counts: readonly StockCount[], unitType?: UnitType): NumericCount[] {
  const out: NumericCount[] = [];
  for (const c of counts) {
    const value = quantityOf(c.value, unitType);
    if (value != null) out.push({ at: new Date(c.counted_at).getTime(), value });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Weekly buckets with carry-forward: each week shows the last count recorded in
 * it; a week without a count repeats the last known value and is marked carried.
 */
export function weeklySeries(counts: readonly StockCount[], weeks: number, now: Date = new Date(), unitType?: UnitType): WeeklyPoint[] {
  const sorted = numericCounts(counts, unitType);
  const lastWeek = startOfWeek(now);
  const first = addDays(lastWeek, -7 * (weeks - 1));
  const points: WeeklyPoint[] = [];
  let cursor = 0;
  let lastKnown: number | null = null;

  for (let i = 0; i < weeks; i++) {
    const start = addDays(first, i * 7);
    const end = addDays(start, 7).getTime();
    let inWeek: number | null = null;
    while (cursor < sorted.length && sorted[cursor]!.at < end) {
      const c = sorted[cursor]!;
      if (c.at >= start.getTime()) inWeek = c.value;
      lastKnown = c.value;
      cursor++;
    }
    points.push({ week: isoDate(start), value: inWeek ?? lastKnown, carried: inWeek == null && lastKnown != null });
  }
  return points;
}

export type ForecastStatus = 'ok' | 'insufficient-data' | 'no-usage' | 'unreadable';

export interface Forecast {
  status: ForecastStatus;
  /** Average units used per day across the window (restock jumps excluded). */
  dailyRate: number | null;
  intervalsUsed: number;
  spanDays: number;
  current: number | null;
  daysToPar: number | null;
  daysToEmpty: number | null;
  runsOutOn: string | null;
  suggestedQty: number | null;
  /** Plain-language account of the math so the number can be trusted or challenged. */
  explanation: string;
}

export interface ForecastOptions {
  now?: Date;
  windowDays?: number;
  cycleDays?: number;
  leadTimeDays?: number;
}

/**
 * Transparent consumption-rate forecast. Between consecutive numeric counts,
 * a drop is usage and a rise is a delivery; deliveries are excluded rather than
 * guessed at. Rate = units used ÷ days observed.
 */
export function forecastItem(
  item: Pick<InventoryItem, 'current_value' | 'par_level'> & { unit_type?: UnitType },
  counts: readonly StockCount[],
  opts: ForecastOptions = {},
): Forecast {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 56;
  const cycleDays = opts.cycleDays ?? 14;
  const lead = opts.leadTimeDays ?? 0;
  const current = quantityOf(item.current_value, item.unit_type);
  const base = { current, daysToPar: null, daysToEmpty: null, runsOutOn: null, suggestedQty: null };

  if (current == null) {
    return { ...base, status: 'unreadable', dailyRate: null, intervalsUsed: 0, spanDays: 0, explanation: 'Current count is not a plain number, so usage can’t be projected.' };
  }

  const since = now.getTime() - windowDays * 86_400_000;
  const all = numericCounts(counts, item.unit_type);
  // Keep one count before the window as the starting anchor.
  const firstIdx = Math.max(0, all.findIndex((c) => c.at >= since) - 1);
  const series = all.findIndex((c) => c.at >= since) === -1 ? all.slice(-1) : all.slice(firstIdx);

  let used = 0;
  let days = 0;
  let intervals = 0;
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1]!;
    const b = series[i]!;
    const span = daysBetween(new Date(a.at), new Date(b.at));
    if (span <= 0 || b.value > a.value) continue; // same-instant duplicate or a delivery
    used += a.value - b.value;
    days += span;
    intervals++;
  }

  if (intervals < 2 || days < 3) {
    return { ...base, status: 'insufficient-data', dailyRate: null, intervalsUsed: intervals, spanDays: round(days), explanation: `Needs at least two usage periods to project; found ${intervals}.` };
  }

  const rate = used / days;
  if (rate === 0) {
    return { ...base, status: 'no-usage', dailyRate: 0, intervalsUsed: intervals, spanDays: round(days), explanation: `No usage recorded across ${intervals} periods (${Math.round(days)} days).` };
  }

  const daysToEmpty = current / rate;
  const daysToPar = item.par_level != null ? Math.max(0, (current - item.par_level) / rate) : null;
  const target = (item.par_level ?? 0) + rate * (cycleDays + lead);
  const suggestedQty = Math.max(0, Math.ceil(target - current));

  return {
    status: 'ok',
    dailyRate: round(rate),
    intervalsUsed: intervals,
    spanDays: round(days),
    current,
    daysToPar: daysToPar == null ? null : round(daysToPar),
    daysToEmpty: round(daysToEmpty),
    runsOutOn: isoDate(new Date(now.getTime() + daysToEmpty * 86_400_000)),
    suggestedQty,
    explanation: `Used ${formatRate(rate)} per day on average across ${intervals} count periods (${Math.round(days)} days, deliveries excluded).`,
  };
}

export function formatRate(rate: number): string {
  if (rate >= 10) return rate.toFixed(0);
  if (rate >= 1) return rate.toFixed(1);
  return rate.toFixed(2);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
