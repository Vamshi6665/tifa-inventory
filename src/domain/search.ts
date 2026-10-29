/**
 * Lightweight ranked matching for global search and grid highlighting.
 * Returns plain segments — the UI renders them as text nodes, never HTML.
 */

export interface Segment {
  text: string;
  match: boolean;
}

export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function tokens(query: string): string[] {
  return normalize(query)
    .replace(/[?!,;:"\u201c\u201d\u2018\u2019'()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** 0 = no match. Higher is better: prefix of the whole string > word prefix > substring. */
export function score(haystack: string, query: string): number {
  const qs = tokens(query);
  if (qs.length === 0) return 0;
  const h = normalize(haystack);
  let total = 0;
  for (const q of qs) {
    const idx = h.indexOf(q);
    if (idx === -1) return 0;
    if (idx === 0) total += 3;
    else if (/\W/.test(h[idx - 1] ?? '')) total += 2;
    else total += 1;
  }
  return total + 1 / (1 + h.length / 100);
}

export function highlight(text: string, query: string): Segment[] {
  const qs = tokens(query);
  if (!text || qs.length === 0) return [{ text, match: false }];
  const n = normalize(text);
  // Normalisation may change length for some scripts; fall back to no highlight then.
  if (n.length !== text.length) return [{ text, match: false }];
  const marks = new Array<boolean>(text.length).fill(false);
  for (const q of qs) {
    let from = 0;
    let idx: number;
    while ((idx = n.indexOf(q, from)) !== -1) {
      for (let i = idx; i < idx + q.length; i++) marks[i] = true;
      from = idx + q.length;
    }
  }
  const out: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.match === marks[i]) last.text += text[i];
    else out.push({ text: text[i]!, match: marks[i]! });
  }
  return out;
}

export function rank<T>(items: readonly T[], query: string, fields: (item: T) => string[], limit = 50): T[] {
  if (!query.trim()) return items.slice(0, limit);
  const scored: Array<{ item: T; s: number }> = [];
  for (const item of items) {
    const s = Math.max(0, ...fields(item).map((f, i) => score(f, query) * (i === 0 ? 1.5 : 1)));
    if (s > 0) scored.push({ item, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.item);
}
