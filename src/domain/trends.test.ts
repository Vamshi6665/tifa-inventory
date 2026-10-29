import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { forecastItem, weeklySeries } from './trends';
import type { StockCount } from './types';

// Thursday 29 Oct 2026, noon local — weeks start Monday 26 Oct.
const NOW = new Date(2026, 9, 29, 12);
let id = 1;
const count = (daysAgo: number, value: string): StockCount => ({
  id: id++,
  item_id: 1,
  value,
  counted_at: addDays(NOW, -daysAgo).toISOString(),
  recorded_by: 'NB',
  source: 'manual',
  note: null,
});

describe('weeklySeries', () => {
  it('takes the last count in each week and carries forward through gaps', () => {
    const counts = [count(24, '10'), count(23, '9'), count(10, '6'), count(2, '4')];
    const s = weeklySeries(counts, 4, NOW);
    expect(s.map((p) => p.week)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    // Oct 5–11: counts on Oct 5 (24d ago) and Oct 6 (23d ago) → last is 9
    expect(s[0]).toEqual({ week: '2026-10-05', value: 9, carried: false });
    // Oct 12–18: no count → carry 9
    expect(s[1]).toEqual({ week: '2026-10-12', value: 9, carried: true });
    expect(s[2]).toEqual({ week: '2026-10-19', value: 6, carried: false });
    expect(s[3]).toEqual({ week: '2026-10-26', value: 4, carried: false });
  });

  it('uses counts from before the window as the carried starting value', () => {
    const s = weeklySeries([count(60, '12')], 2, NOW);
    expect(s.every((p) => p.value === 12 && p.carried)).toBe(true);
  });

  it('leaves weeks before any count empty', () => {
    const s = weeklySeries([count(1, '3')], 3, NOW);
    expect(s.map((p) => p.value)).toEqual([null, null, 3]);
    expect(s[0]!.carried).toBe(false);
  });

  it('skips unreadable counts rather than plotting them as zero', () => {
    const s = weeklySeries([count(9, '8'), count(2, 'a few')], 2, NOW);
    expect(s[1]).toEqual({ week: '2026-10-26', value: 8, carried: true });
  });

  it('is order-independent', () => {
    const a = [count(15, '10'), count(8, '7'), count(1, '5')];
    expect(weeklySeries([...a].reverse(), 3, NOW)).toEqual(weeklySeries(a, 3, NOW));
  });
});

describe('forecastItem', () => {
  it('reads percentage items on one scale, so a refill isn’t mistaken for usage', () => {
    // 45% → 2 full containers (200%) is a delivery; 200% → 150% → 110% is usage of 90 points over 14 days.
    const counts = [count(28, '45% remaining'), count(21, '2'), count(14, '1new+50% remaining'), count(7, '1+10%')];
    const f = forecastItem({ current_value: '1+10%', par_level: 25, unit_type: 'percentage' }, counts, { now: NOW });
    expect(f.status).toBe('ok');
    expect(f.current).toBe(110);
    expect(f.dailyRate).toBeCloseTo(90 / 14, 1);
  });

  it('computes rate from drops only and excludes deliveries', () => {
    // 14 → 10 over 7 days (4 used), delivery to 20, 20 → 13 over 7 days (7 used)
    const counts = [count(21, '14'), count(14, '10'), count(13, '20'), count(6, '13')];
    const f = forecastItem({ current_value: '13', par_level: 5 }, counts, { now: NOW, cycleDays: 14 });
    expect(f.status).toBe('ok');
    expect(f.intervalsUsed).toBe(2);
    expect(f.spanDays).toBe(14);
    expect(f.dailyRate).toBeCloseTo(11 / 14, 2);
    expect(f.daysToEmpty).toBeCloseTo(13 / (11 / 14), 1);
    expect(f.daysToPar).toBeCloseTo(8 / (11 / 14), 1);
    // target = 5 + rate*14 = 16 → order 3
    expect(f.suggestedQty).toBe(3);
    expect(f.explanation).toMatch(/2 count periods/);
  });

  it('adds supplier lead time to the target', () => {
    const counts = [count(21, '14'), count(14, '10'), count(7, '6')];
    const base = forecastItem({ current_value: '6', par_level: 4 }, counts, { now: NOW, cycleDays: 7 });
    const withLead = forecastItem({ current_value: '6', par_level: 4 }, counts, { now: NOW, cycleDays: 7, leadTimeDays: 7 });
    expect(withLead.suggestedQty! - base.suggestedQty!).toBe(4);
  });

  it('reports insufficient data with fewer than two usage periods', () => {
    const f = forecastItem({ current_value: '5', par_level: 2 }, [count(7, '9'), count(1, '5')], { now: NOW });
    expect(f.status).toBe('insufficient-data');
    expect(f.suggestedQty).toBeNull();
  });

  it('reports no usage when counts never drop', () => {
    const f = forecastItem({ current_value: '5', par_level: 2 }, [count(20, '5'), count(10, '5'), count(1, '5')], { now: NOW });
    expect(f.status).toBe('no-usage');
    expect(f.dailyRate).toBe(0);
  });

  it('refuses to project from an unreadable current value', () => {
    const f = forecastItem({ current_value: '1 box + 10 packs', par_level: 2 }, [count(20, '9'), count(10, '7'), count(1, '5')], { now: NOW });
    expect(f.status).toBe('unreadable');
  });

  it('ignores counts outside the window except one anchor', () => {
    const counts = [count(200, '100'), count(120, '90'), count(50, '20'), count(30, '16'), count(10, '12')];
    const f = forecastItem({ current_value: '12', par_level: 4 }, counts, { now: NOW, windowDays: 56 });
    // anchor 120d (90) → 50d (20): a drop of 70 spanning 70 days is kept as the anchor interval
    expect(f.intervalsUsed).toBe(3);
  });

  it('never suggests a negative order', () => {
    const counts = [count(21, '50'), count(14, '49'), count(7, '48')];
    const f = forecastItem({ current_value: '48', par_level: 2 }, counts, { now: NOW });
    expect(f.suggestedQty).toBe(0);
  });
});
