import { useEffect, useMemo, useState } from 'react';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler, type ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatShortDate } from '@/domain/dates';
import type { WeeklyPoint } from '@/domain/trends';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function useThemeColors() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setTick((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return useMemo(
    () => ({ accent: cssVar('--color-accent'), text: cssVar('--color-text-3'), grid: cssVar('--chart-grid'), par: cssVar('--color-warning-fill'), surface: cssVar('--color-surface'), tick }),
    [tick],
  );
}

/**
 * Weekly stock level with the par line. Canvas is decorative for screen readers;
 * the same numbers are available as a table right below it.
 */
export default function TrendChart({ points, par, label, height = 200, compact = false }: { points: WeeklyPoint[]; par: number | null; label: string; height?: number; compact?: boolean }) {
  const c = useThemeColors();
  const labels = points.map((p) => formatShortDate(p.week));
  const reduced = typeof window !== 'undefined' && (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced');

  const data = {
    labels,
    datasets: [
      {
        label,
        data: points.map((p) => p.value),
        borderColor: c.accent,
        backgroundColor: `${c.accent}22`,
        fill: true,
        tension: 0.3,
        spanGaps: true,
        pointRadius: compact ? 0 : points.map((p) => (p.carried ? 2 : 3)),
        pointBackgroundColor: points.map((p) => (p.carried ? c.surface : c.accent)),
        pointBorderColor: c.accent,
        borderWidth: 2,
      },
      ...(par != null
        ? [{ label: 'Par', data: points.map(() => par), borderColor: c.par, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false }]
        : []),
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduced ? false : { duration: 400 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const p = points[ctx.dataIndex];
            if (ctx.datasetIndex === 1) return ` Par: ${par}`;
            return ` ${ctx.formattedValue}${p?.carried ? ' (no count that week; carried forward)' : ''}`;
          },
        },
      },
    },
    scales: {
      x: { display: !compact, grid: { display: false }, ticks: { color: c.text, maxRotation: 0, autoSkipPadding: 16, font: { size: 11 } } },
      y: { display: !compact, beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { color: c.text, precision: 0, font: { size: 11 } } },
    },
  };

  return (
    <figure style={{ margin: 0 }}>
      <div style={{ position: 'relative', height }} aria-hidden="true">
        <Line data={data} options={options} />
      </div>
      {!compact && (
        <details style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--color-text-3)' }}>
          <summary style={{ cursor: 'pointer' }}>Show as table</summary>
          <table style={{ marginTop: 8, borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
            <caption className="sr-only">{label}, weekly</caption>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', paddingRight: 16 }}>Week of</th>
                <th scope="col" style={{ textAlign: 'right' }}>Level</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.week}>
                  <td style={{ paddingRight: 16 }}>{formatShortDate(p.week)}</td>
                  <td style={{ textAlign: 'right' }}>{p.value ?? '—'}{p.carried ? ' (carried)' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </figure>
  );
}
