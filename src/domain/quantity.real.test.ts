import { describe, expect, it } from 'vitest';
import { parseQuantity, stockState } from './quantity';
import { REAL_ITEMS, REAL_VALUES } from './fixtures/realData';

/** The original dashboard's rule: the first number anywhere in the text. */
function v1Parse(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function v1Alert(unitType: string, value: string | null, par: number | null, status: string): 'retired' | 'out' | 'low' | 'none' {
  void unitType;
  if (status === 'discontinued') return 'retired';
  const v = v1Parse(value);
  if (v === null) return 'none';
  if (v <= 0) return 'out';
  if (par != null && v <= par) return 'low';
  return 'none';
}

describe('quantity rules against the shop’s real count history', () => {
  const total = REAL_VALUES.reduce((s, [, n]) => s + n, 0);

  it('covers every distinct value from the import', () => {
    expect(REAL_VALUES).toHaveLength(194);
    expect(total).toBe(1721);
  });

  it('never produces a negative or non-finite number', () => {
    for (const [raw] of REAL_VALUES) {
      const p = parseQuantity(raw);
      if (p.kind === 'number') {
        expect(Number.isFinite(p.value), raw).toBe(true);
        expect(p.value, raw).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('reads the same number as the original dashboard for 95% of entries, and flags only 25 for review', () => {
    let same = 0;
    let review = 0;
    for (const [raw, n] of REAL_VALUES) {
      const p = parseQuantity(raw);
      if (p.kind === 'unparsed') review += n;
      if ((p.kind === 'number' ? p.value : null) === v1Parse(raw)) same += n;
    }
    expect(same).toBe(1628);
    expect(review).toBe(25);
  });

  it('keeps every value’s outcome stable (snapshot)', () => {
    const outcomes = REAL_VALUES.map(([raw]) => {
      const p = parseQuantity(raw);
      return `${raw} → ${p.kind === 'number' ? `${p.value}${p.percent ? '%' : ''}` : p.kind}`;
    });
    expect(outcomes).toMatchSnapshot();
  });

  it('changes alerts only where the original rule misread the count', () => {
    const transitions: Record<string, number> = {};
    for (const [unit_type, current_value, par_level, status] of REAL_ITEMS) {
      const before = v1Alert(unit_type, current_value, par_level, status);
      const s = stockState({ unit_type, current_value, par_level, status });
      const after = s === 'untracked' ? (status === 'discontinued' ? 'retired' : 'none') : s === 'ok' ? 'none' : s;
      const key = `${before} → ${after}`;
      transitions[key] = (transitions[key] ?? 0) + 1;
    }
    expect(transitions).toEqual({
      'none → none': 312,
      'out → out': 40,
      'low → low': 36,
      'retired → retired': 26,
      // "1new+.75" with par 1 is 1.75 trays, not 1: the old rule raised a false low alert.
      'low → none': 6,
      // "Tifa logo-1 new+1open boxes" was read as -1 (out of stock); now it asks a person.
      'out → review': 1,
      // 23 items with a par but no count yet, and 6 with text that can't be read reliably.
      'none → review': 29,
    });
  });
});
