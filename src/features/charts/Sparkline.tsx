import type { WeeklyPoint } from '@/domain/trends';

/** Tiny SVG sparkline: no canvas, no library, cheap enough for a grid of 100. */
export function Sparkline({ points, par, width = 160, height = 40, label }: { points: WeeklyPoint[]; par: number | null; width?: number; height?: number; label: string }) {
  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  if (values.length < 2) {
    return (
      <svg width={width} height={height} role="img" aria-label={`${label}: not enough counts to chart`}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--color-border)" strokeDasharray="3 3" />
      </svg>
    );
  }
  const max = Math.max(...values, par ?? 0) * 1.1 || 1;
  const pad = 3;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  let d = '';
  points.forEach((p, i) => {
    if (p.value == null) return;
    d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  const last = [...points].reverse().find((p) => p.value != null)!;
  const lastIdx = points.lastIndexOf(last);
  const first = values[0]!;
  const trend = last.value! > first ? 'up' : last.value! < first ? 'down' : 'flat';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${trend} from ${first} to ${last.value} over ${points.length} weeks${par != null ? `, par ${par}` : ''}`}>
      {par != null && <line x1={pad} x2={width - pad} y1={y(par)} y2={y(par)} stroke="var(--color-warning-fill)" strokeDasharray="3 3" strokeWidth="1" />}
      <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(lastIdx)} cy={y(last.value!)} r="2.5" fill={par != null && last.value! <= par ? 'var(--color-warning-fill)' : 'var(--color-accent)'} />
    </svg>
  );
}
