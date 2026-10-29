const DAY = 86_400_000;

export function startOfWeek(input: Date | string): Date {
  const d = new Date(input);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

export function addDays(input: Date | string, days: number): Date {
  const d = new Date(input);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetween(a: Date | string, b: Date | string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / DAY;
}

export function isoDate(d: Date | string): string {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['week', 7 * DAY],
  ['day', DAY],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

export function relativeTime(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return 'Never';
  const diff = new Date(value).getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 45_000) return 'Just now';
  for (const [unit, ms] of UNITS) {
    if (abs >= ms || unit === 'minute') return rtf.format(Math.round(diff / ms), unit);
  }
  return 'Just now';
}

/** Date-only strings ("2026-10-26") are calendar days, not UTC instants. */
export function toDate(v: string | Date): Date {
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
}

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const formatDate = (v: string | Date | null | undefined) => (v ? dateFmt.format(toDate(v)) : '—');
export const formatShortDate = (v: string | Date | null | undefined) => (v ? shortFmt.format(toDate(v)) : '—');
export const formatDateTime = (v: string | Date | null | undefined) => (v ? dateTimeFmt.format(toDate(v)) : '—');

const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
const monthDayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** Human date for nearby days: "today", "tomorrow", "Friday", "Nov 7", or with year when not this year. */
export function formatWhen(v: string | Date | null | undefined, now: Date = new Date()): string {
  if (!v) return '—';
  const d = toDate(v);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((a - b) / DAY);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1 && diff < 7) return weekdayFmt.format(d);
  return d.getFullYear() === now.getFullYear() ? monthDayFmt.format(d) : dateFmt.format(d);
}

/** Days since a timestamp, floored; null when never. */
export function ageInDays(value: string | null | undefined, now: Date = new Date()): number | null {
  if (!value) return null;
  return Math.floor(daysBetween(value, now));
}
