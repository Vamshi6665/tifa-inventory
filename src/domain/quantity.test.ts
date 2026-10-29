import { describe, expect, it } from 'vitest';
import { fillLevel, needsReorder, numericValue, parseQuantity, quantityOf, stockState } from './quantity';

describe('parseQuantity', () => {
  it.each([
    ['12', 12],
    ['0', 0],
    ['  7 ', 7],
    ['2.5', 2.5],
    ['.5', 0.5],
    ['1/2', 0.5],
    ['out', 0],
    ['Sold out', 0],
    ['NONE', 0],
  ])('reads %j as %d', (raw, expected) => {
    expect(numericValue(raw)).toBe(expected);
  });

  it('reads percentages and flags them', () => {
    expect(parseQuantity('50%')).toEqual({ kind: 'number', value: 50, percent: true });
    expect(parseQuantity('12.5 %')).toEqual({ kind: 'number', value: 12.5, percent: true });
    expect(parseQuantity('45% remaining')).toEqual({ kind: 'number', value: 45, percent: true });
  });

  it.each([
    ['2 trays', 2],
    ['1 new', 1],
    ['5trays', 5],
    ['1box', 1],
    ['3 new boxes', 3],
    ['5kg', 5],
    ['6 x 5kg buckets', 6],
    ['13 packs of 50=650', 13],
    ['3 packs of 250 each', 3],
    ['7 packs of 25 (175)', 7],
    ['1 open=500', 1],
    ['3/4 bottle remaining', 0.75],
  ])('reads the leading count in %j', (raw, expected) => {
    expect(numericValue(raw)).toBe(expected);
  });

  it.each([
    ['1 new + 3', 4],
    ['2 full + 1 open', 3],
    ['1+1+1', 3],
    ['0.5 + 0.25', 0.75],
    ['1new+.75', 1.75],
    ['1 new(500)+1 open(400)=900', 2],
    ['4 box of 50+1 box of 25=225', 5],
    ['1 new+2 trays', 3],
  ])('sums same-unit containers in %j', (raw, expected) => {
    expect(numericValue(raw)).toBe(expected);
  });

  it('adds part of an open container as a fraction', () => {
    expect(parseQuantity('1new+20% remaining')).toEqual({ kind: 'number', value: 1.2, percent: false });
    expect(parseQuantity('1 box + 25% of existing box')).toEqual({ kind: 'number', value: 1.25, percent: false });
  });

  it.each([
    'half a tub',
    'ask Naina',
    '3-4',
    '1,000',
    '12 + some',
    '1box+10 packs of 25',
    '10pc +1 layer',
    '5 pink; 1 white',
    'open box 14/20',
    'Tifa logo-1 boxes',
    '.5+box',
    '??',
  ])('does not guess at %j', (raw) => {
    expect(parseQuantity(raw)).toEqual({ kind: 'unparsed', raw });
  });

  it.each([null, undefined, '', '   ', '-', '—'])('treats %j as empty', (raw) => {
    expect(parseQuantity(raw)).toEqual({ kind: 'empty' });
  });

  it('collapses inner whitespace in the raw value it reports', () => {
    expect(parseQuantity('open   box  14/20')).toEqual({ kind: 'unparsed', raw: 'open box 14/20' });
  });
});

describe('quantityOf', () => {
  it('compares percentage items in percent of one container', () => {
    expect(quantityOf('45% remaining', 'percentage')).toBe(45);
    expect(quantityOf('1new+20% remaining', 'percentage')).toBe(120);
    expect(quantityOf('2', 'percentage')).toBe(200);
  });
  it('compares count items in containers', () => {
    expect(quantityOf('3', 'count')).toBe(3);
    expect(quantityOf('40%', 'count')).toBe(0.4);
    expect(quantityOf('1+10%', 'freeform')).toBe(1.1);
  });
});

describe('stockState', () => {
  const item = (current_value: string | null, par_level: number | null, status: 'active' | 'discontinued' | 'hold' | 'seasonal' = 'active') => ({ current_value, par_level, status });

  it('marks zero as out regardless of par', () => {
    expect(stockState(item('0', 4))).toBe('out');
    expect(stockState(item('out', null))).toBe('out');
  });
  it('treats exactly-at-par as low (reorder point is inclusive)', () => {
    expect(stockState(item('4', 4))).toBe('low');
    expect(stockState(item('5', 4))).toBe('ok');
  });
  it('sends unreadable values to review instead of guessing', () => {
    expect(stockState(item('1box+10 packs of 25', 2))).toBe('review');
  });
  it('asks for review when a par exists but no count does', () => {
    expect(stockState(item(null, 3))).toBe('review');
    expect(stockState(item(null, null))).toBe('untracked');
  });
  it('ignores retired items only, like the original dashboard', () => {
    expect(stockState(item('0', 4, 'discontinued'))).toBe('untracked');
    expect(stockState(item('0', 4, 'hold'))).toBe('out');
    expect(stockState(item('0', 4, 'seasonal'))).toBe('out');
  });
  it('is untracked without a par when stock exists', () => {
    expect(stockState(item('9', null))).toBe('untracked');
  });
  it('compares percentage items against a percentage par', () => {
    expect(stockState({ ...item('15% remaining', 20), unit_type: 'percentage' as const })).toBe('low');
    expect(stockState({ ...item('1new+10% remaining', 20), unit_type: 'percentage' as const })).toBe('ok');
  });
  it('needsReorder is true only for low and out', () => {
    expect(needsReorder(item('1', 4))).toBe(true);
    expect(needsReorder(item('0', 4))).toBe(true);
    expect(needsReorder(item('9', 4))).toBe(false);
    expect(needsReorder(item('a few', 4))).toBe(false);
  });
});

describe('fillLevel', () => {
  it('puts par at the 40% mark and clamps', () => {
    expect(fillLevel({ current_value: '4', par_level: 4 })).toBeCloseTo(0.4);
    expect(fillLevel({ current_value: '2', par_level: 4 })).toBeCloseTo(0.2);
    expect(fillLevel({ current_value: '100', par_level: 4 })).toBe(1);
    expect(fillLevel({ current_value: '0', par_level: 4 })).toBe(0);
  });
  it('returns null when it can’t be computed', () => {
    expect(fillLevel({ current_value: 'lots', par_level: 4 })).toBeNull();
    expect(fillLevel({ current_value: '3', par_level: null })).toBeNull();
    expect(fillLevel({ current_value: '3', par_level: 0 })).toBeNull();
  });
});
