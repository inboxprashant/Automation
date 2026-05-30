'use client';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const COLORS = [
  '#FF0000', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
];

interface Props {
  series: Record<string, number[]>;
  labels?: string[];
}

export default function ViewsChart({ series, labels }: Props) {
  const keys    = Object.keys(series);
  const maxLen  = Math.max(...keys.map((k) => series[k].length), 1);
  const xLabels = labels ?? Array.from({ length: maxLen }, (_, i) => `Day ${i + 1}`);

  const datasets = keys.map((key, i) => ({
    label:           key,
    data:            series[key],
    borderColor:     COLORS[i % COLORS.length],
    backgroundColor: COLORS[i % COLORS.length] + '18',
    borderWidth:     2,
    pointRadius:     3,
    pointHoverRadius:5,
    tension:         0.4,
    fill:            false,
  }));

  const options = {
    responsive:          true,
    maintainAspectRatio: false,
    interaction:         { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels:   { color: '#6B7280', font: { size: 11 }, boxWidth: 12, padding: 16 },
      },
      tooltip: {
        backgroundColor: '#1A1A1A',
        borderColor:     '#2A2A2A',
        borderWidth:     1,
        titleColor:      '#E5E7EB',
        bodyColor:       '#9CA3AF',
      },
    },
    scales: {
      x: {
        grid:  { color: '#2A2A2A' },
        ticks: { color: '#6B7280', font: { size: 11 } },
      },
      y: {
        grid:  { color: '#2A2A2A' },
        ticks: { color: '#6B7280', font: { size: 11 } },
        beginAtZero: true,
      },
    },
  };

  if (keys.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-brand-muted text-sm">
        No analytics data yet
      </div>
    );
  }

  return (
    <div className="h-56">
      <Line data={{ labels: xLabels, datasets }} options={options} />
    </div>
  );
}
