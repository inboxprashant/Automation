'use client';
import useSWR from 'swr';
import { Flame, Calendar } from 'lucide-react';
import Sidebar   from '@/components/Sidebar';
import TrendCard from '@/components/TrendCard';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function TrendsPage() {
  const { data } = useSWR('/api/trends', fetcher, { refreshInterval: 60000 });

  const report = data?.latestReport;
  const trends = report?.trends ?? [];
  const index  = data?.index    ?? [];

  const barData = {
    labels:   trends.map((t: any) => t.topic.slice(0, 20)),
    datasets: [{
      label:           'Viral Score',
      data:            trends.map((t: any) => t.viralScore),
      backgroundColor: trends.map((t: any) =>
        t.viralScore >= 80 ? '#ef444460' : t.viralScore >= 60 ? '#f59e0b60' : '#3b82f660'
      ),
      borderColor: trends.map((t: any) =>
        t.viralScore >= 80 ? '#ef4444' : t.viralScore >= 60 ? '#f59e0b' : '#3b82f6'
      ),
      borderWidth: 1,
      borderRadius: 4,
    }],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1A1A1A',
        borderColor: '#2A2A2A',
        borderWidth: 1,
        titleColor: '#E5E7EB',
        bodyColor: '#9CA3AF',
      },
    },
    scales: {
      x: { grid: { color: '#2A2A2A' }, ticks: { color: '#6B7280', font: { size: 10 }, maxRotation: 45 } },
      y: { grid: { color: '#2A2A2A' }, ticks: { color: '#6B7280', font: { size: 11 } }, min: 0, max: 100 },
    },
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Trends</h1>
          {report?.date && (
            <span className="flex items-center gap-1.5 text-xs text-brand-muted">
              <Calendar size={12} /> {report.date}
            </span>
          )}
        </div>

        {/* Stats */}
        {report && (
          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center">
              <p className="text-2xl font-bold text-white">{report.topicCount ?? trends.length}</p>
              <p className="text-xs text-brand-muted mt-1">Topics Found</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-white">{report._meta?.totalRawTrends ?? '—'}</p>
              <p className="text-xs text-brand-muted mt-1">Raw Signals</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-red-400">{trends[0]?.viralScore ?? '—'}</p>
              <p className="text-xs text-brand-muted mt-1">Top Score</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bar chart */}
          <div className="card">
            <p className="section-title">Viral Score Comparison</p>
            <div className="h-56">
              {trends.length > 0
                ? <Bar data={barData} options={barOptions} />
                : <div className="flex items-center justify-center h-full text-brand-muted text-sm">No trend data</div>
              }
            </div>
          </div>

          {/* Top 10 list */}
          <div className="card">
            <p className="section-title">Top 10 Topics</p>
            <TrendCard trends={trends.slice(0, 10)} />
          </div>
        </div>

        {/* History */}
        {index.length > 0 && (
          <div className="card">
            <p className="section-title">Report History</p>
            <div className="space-y-1">
              {index.map((entry: any) => (
                <div key={entry.date} className="flex items-center justify-between py-2 border-b border-brand-border/40 last:border-0">
                  <span className="text-sm text-brand-text font-mono">{entry.date}</span>
                  <span className="text-xs text-brand-muted">{entry.topicCount} topics</span>
                  <span className="text-xs text-brand-text truncate max-w-[200px]">{entry.topTopic}</span>
                  <span className="text-xs font-bold text-red-400">{entry.topViralScore}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
