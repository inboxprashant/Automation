'use client';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface Props {
  high:    number;
  average: number;
  low:     number;
}

export default function PerformanceChart({ high, average, low }: Props) {
  const total = high + average + low;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-brand-muted text-sm">
        No performance data yet
      </div>
    );
  }

  const data = {
    labels:   ['High', 'Average', 'Low'],
    datasets: [{
      data:            [high, average, low],
      backgroundColor: ['#22c55e40', '#3b82f640', '#ef444440'],
      borderColor:     ['#22c55e',   '#3b82f6',   '#ef4444'],
      borderWidth:     2,
      hoverOffset:     4,
    }],
  };

  const options = {
    responsive:          true,
    maintainAspectRatio: false,
    cutout:              '68%',
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels:   { color: '#6B7280', font: { size: 11 }, boxWidth: 10, padding: 14 },
      },
      tooltip: {
        backgroundColor: '#1A1A1A',
        borderColor:     '#2A2A2A',
        borderWidth:     1,
        titleColor:      '#E5E7EB',
        bodyColor:       '#9CA3AF',
        callbacks: {
          label: (ctx: any) => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw / total * 100)}%)`,
        },
      },
    },
  };

  return (
    <div className="h-44 relative">
      <Doughnut data={data} options={options} />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: '32px' }}>
        <div className="text-center">
          <p className="text-xl font-bold text-white">{total}</p>
          <p className="text-[10px] text-brand-muted">videos</p>
        </div>
      </div>
    </div>
  );
}
