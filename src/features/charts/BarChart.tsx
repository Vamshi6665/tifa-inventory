import { useEffect, useState } from 'react';
import { Chart as ChartJS, BarElement, LinearScale, CategoryScale, Tooltip, type ChartOptions } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip);

const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export default function BarChart({ labels, values, label, height = 200 }: { labels: string[]; values: number[]; label: string; height?: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setTick((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 400 },
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: v('--color-text-3'), font: { size: 11 }, maxRotation: 0, autoSkipPadding: 12 } },
      y: { beginAtZero: true, grid: { color: v('--chart-grid') }, border: { display: false }, ticks: { color: v('--color-text-3'), precision: 0, font: { size: 11 } } },
    },
  };
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ position: 'relative', height }} aria-hidden="true">
        <Bar data={{ labels, datasets: [{ label, data: values, backgroundColor: v('--color-accent'), borderRadius: 4, maxBarThickness: 28 }] }} options={options} />
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {labels.map((l, i) => (
            <tr key={l}>
              <th scope="row">{l}</th>
              <td>{values[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
