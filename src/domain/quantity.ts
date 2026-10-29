import type { InventoryItem, StockState, UnitType } from './types';

/**
 * Quantity parsing follows the system's parse-and-flag rule: values are read
 * when their meaning is clear, and everything else is surfaced for a person to
 * review instead of being guessed at.
 *
 * The rules were checked against every count value in the shop's imported
 * history (194 distinct entries, see quantity.real.test.ts):
 *
 *   "7", "2.5", "1/2"                    → that number
 *   "2 trays", "1 new", "5trays", "1box" → the leading number (unit words are kept by the person, not the math)
 *   "45% remaining", "75%"               → a percentage
 *   "1 new + 3", "1new+.75", "2+1 open"  → a sum of the same kind of container
 *   "1new+20% remaining", "1+10%"        → whole containers plus part of an open one (1.2, 1.1)
 *   "13 packs of 50=650", "1 open=500"   → the count before "of"/"=" (the rest is a size note)
 *   "6 x 5kg buckets"                    → 6
 *   "out", "sold out", "none", "0"       → zero
 *
 * Flagged for review: mixed units ("1 box + 10 packs", "10pc + 1 layer"),
 * ranges ("3-4"), lists ("5 pink; 1 white"), text that doesn't start with a
 * number ("open box 14/20", "Tifa logo-1 boxes"), and anything without digits.
 */

export type ParsedQuantity =
  | { kind: 'number'; value: number; percent: boolean }
  | { kind: 'empty' }
  | { kind: 'unparsed'; raw: string };

const ZERO_WORDS = new Set(['0', 'out', 'none', 'empty', 'sold out', 'zero', 'nil', 'out of stock']);
const EMPTY = new Set(['', '-', '—', '–']);
// Words that describe the state of a container rather than what it is.
const QUALIFIERS = new Set(['new', 'full', 'open', 'opened', 'sealed', 'unopened', 'left', 'remaining', 'existing', 'more', 'color', 'colour', 'each', 'approx', 'about']);
// One part of a count: a number (or fraction), optional %, optional words.
const PART = /^(\d*\.?\d+)(?:\s*\/\s*(\d+))?\s*(%)?\s*([a-z][a-z\s'’]*)?$/;

export function parseQuantity(raw: string | null | undefined): ParsedQuantity {
  if (raw == null) return { kind: 'empty' };
  const value = raw.trim().replace(/\s+/g, ' ');
  if (EMPTY.has(value)) return { kind: 'empty' };
  const unparsed = { kind: 'unparsed', raw: value } as const;

  const lower = value.toLowerCase();
  if (ZERO_WORDS.has(lower)) return { kind: 'number', value: 0, percent: false };
  if (!/\d/.test(lower) || lower.includes(';')) return unparsed;

  const cleaned = lower
    .replace(/\([^)]*\)/g, ' ') // "(500)" size notes
    .replace(/=\s*\d[\d.,]*/g, ' ') // "=650" totals in base units
    .replace(/^(\d*\.?\d+)\s*x\s*\d[\d.]*/, '$1 '); // "6 x 5kg buckets" → "6 kg buckets"

  const parts = cleaned.split('+').map((p) => p.trim().replace(/\s+of\s.*$/, '').trim());
  if (parts.some((p) => p === '')) return unparsed;

  let total = 0;
  let percentOnly = parts.length === 1;
  const nouns = new Set<string>();
  for (const part of parts) {
    const m = PART.exec(part);
    if (!m) return unparsed;
    const [, num, den, pct, words] = m;
    let n = Number(num);
    if (den != null) {
      if (Number(den) === 0) return unparsed;
      n = n / Number(den);
    }
    if (pct) {
      total += parts.length === 1 ? n : n / 100;
    } else {
      total += n;
      percentOnly = false;
    }
    for (const w of (words ?? '').split(/\s+/)) {
      if (w && !QUALIFIERS.has(w)) nouns.add(singular(w));
    }
  }
  if (parts.length > 1 && nouns.size > 1) return unparsed; // "1 box + 10 packs": different units

  return { kind: 'number', value: round(total), percent: percentOnly };
}

/** Numeric value or null when the entry needs a human to read it. */
export function numericValue(raw: string | null | undefined): number | null {
  const parsed = parseQuantity(raw);
  return parsed.kind === 'number' ? parsed.value : null;
}

/**
 * The number compared against par, on the item's own scale.
 * Percentage items compare in percent of one container: "45% remaining" → 45,
 * "1 new + 20%" → 120, "2" (two full containers) → 200.
 * Count items compare in containers: "40%" → 0.4.
 */
export function quantityOf(raw: string | null | undefined, unitType: UnitType | undefined): number | null {
  const parsed = parseQuantity(raw);
  if (parsed.kind !== 'number') return null;
  if (unitType === 'percentage') return parsed.percent ? parsed.value : round(parsed.value * 100);
  return parsed.percent ? round(parsed.value / 100) : parsed.value;
}

type Quantified = Pick<InventoryItem, 'current_value' | 'par_level' | 'status'> & { unit_type?: UnitType };

export function itemQuantity(item: Pick<InventoryItem, 'current_value'> & { unit_type?: UnitType }): number | null {
  return quantityOf(item.current_value, item.unit_type);
}

/** Only retired items drop out of stock checks (same rule as the original dashboard). */
export function isTracked(item: Pick<InventoryItem, 'status'>): boolean {
  return item.status !== 'discontinued';
}

export function stockState(item: Quantified): StockState {
  if (!isTracked(item)) return 'untracked';
  const parsed = parseQuantity(item.current_value);
  if (parsed.kind === 'empty') return item.par_level != null ? 'review' : 'untracked';
  if (parsed.kind === 'unparsed') return 'review';
  const value = quantityOf(item.current_value, item.unit_type)!;
  if (value <= 0) return 'out';
  if (item.par_level == null) return 'untracked';
  return value <= item.par_level ? 'low' : 'ok';
}

export function needsReorder(item: Quantified): boolean {
  const state = stockState(item);
  return state === 'low' || state === 'out';
}

/**
 * Fill level for the "pan" meter: 0..1, with par sitting at a fixed visual
 * position so every meter reads the same way at a glance.
 */
export const PAR_MARK = 0.4;
export function fillLevel(item: Pick<InventoryItem, 'current_value' | 'par_level'> & { unit_type?: UnitType }): number | null {
  const value = itemQuantity(item);
  if (value == null || item.par_level == null || item.par_level <= 0) return null;
  const ratio = (value / item.par_level) * PAR_MARK;
  return Math.max(0, Math.min(1, ratio));
}

export const STATE_LABEL: Record<StockState, string> = {
  out: 'Out of stock',
  low: 'Low',
  ok: 'In stock',
  review: 'Needs review',
  untracked: 'No par set',
};

export const STATE_ORDER: Record<StockState, number> = { out: 0, low: 1, review: 2, ok: 3, untracked: 4 };

function singular(w: string): string {
  if (w.length > 3 && w.endsWith('es') && /(x|ch|sh|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
