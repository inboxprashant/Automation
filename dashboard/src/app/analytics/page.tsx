'use client';
import useSWR from 'swr';
import { ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Sidebar        from '@/components/Sidebar';
import ViewsChart     from '@/components/ViewsChart';
import PerformanceChart from '@/components/PerformanceChart';
import clsx from 'clsx';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function pct(v: number | null | undefined) {
  return v != null ? `${(v * 100).toFixed(1)}%` : '—';
}
function num(v: number | null | undefined) {
  return v != null ? v.toLocaleString() : '—';
}

export default function AnalyticsPage() {
  const { data } = useSWR('/api/analytics', fetcher, { refreshInterval: 30000 });

  const index   = data?.index         ?? [];
  const report  = data?.latestReport  ?? null;
  const series  = data?.viewsSeries   ?? {};

  const high    = index.filter((v: any) => v.latestTier === 'high').length;
  const average = index.filter((v: any) => v.latestTier === 'average').length;
  const low     = index.filter((v: any) => v.latestTier === 'low').length;

  const tierBadge = (tier: string | null) => {
    if (tier === 'high')    return <span className="badge-success">High</span>;
    if (tier === 'low')     return <span className="badge-error">Low</span>;
    if (tier === 'average') return <span className="badge-info">Avg</span>;
    return <span className="text-brand-muted text-xs">—</span>;
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-6 space-y-6">
        <h1 className="text-xl font-bold text-white">Analytics</h1>

        {/* Channel averages */}
        {report?.channelAvg && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Avg Views',     value: num(Math.round(report.channelAvg.views ?? 0)) },
              { label: 'Avg CTR',       value: pct(report.channelAvg.ctr) },
              { label: 'Avg Retention', value: report.channelAvg.retention ? `${report.channelAvg.retention.toFixed(1)}%` : '—' },
              { label: 'Avg Like Rate', value: pct(report.channelAvg.likeRate) },
            ].map((s) => (
              <div key={s.label} className="card text-center">
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-brand-muted mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 card">
            <p className="section-title">Views Trend</p>
            <ViewsChart series={series} />
          </div>
          <div className="card">
            <p className="section-title">Performance Distribution</p>
            <PerformanceChart high={high} average={average} low={low} />
          </div>
        </div>

        {/* Suggestions */}
        {report?.suggestions?.length > 0 && (
          <div className="card space-y-3">
            <p className="section-title">Optimisation Suggestions</p>
            {report.suggestions.map((s: any, i: number) => (
              <div key={i} className={clsx(
                'p-3 rounded-lg border text-sm',
                s.priority === 'high'   ? 'bg-red-900/10 border-red-800/30' :
                s.priority === 'medium' ? 'bg-yellow-900/10 border-yellow-800/30' :
                                          'bg-blue-900/10 border-blue-800/30'
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={clsx('text-xs font-bold uppercase',
                    s.priority === 'high' ? 'text-red-400' : s.priority === 'medium' ? 'text-yellow-400' : 'text-blue-400'
                  )}>{s.priority}</span>
                  <span className="text-xs text-brand-muted bg-brand-border px-1.5 py-0.5 rounded">{s.category}</span>
                </div>
                <p className="text-brand-text font-medium text-xs">{s.finding}</p>
                <p className="text-brand-muted text-xs mt-1">→ {s.action}</p>
              </div>
            ))}
          </div>
        )}

        {/* Video table */}
        <div className="card">
          <p className="section-title">Tracked Videos ({index.length})</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Title', 'Niche', 'Views', 'CTR', 'Retention', 'Tier', 'Link'].map((h) => (
                    <th key={h} className="text-left text-[11px] font-semibold uppercase tracking-wider text-brand-muted pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/50">
                {index.map((v: any) => (
                  <tr key={v.videoId} className="hover:bg-brand-border/20 transition-colors">
                    <td className="py-2.5 pr-4 max-w-[200px]">
                      <p className="truncate text-brand-text font-medium">{v.title}</p>
                      <p className="text-[10px] text-brand-muted font-mono">{v.videoId}</p>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="text-xs text-brand-muted bg-brand-border px-1.5 py-0.5 rounded">{v.niche}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-brand-text">{num(v.latestViews)}</td>
                    <td className="py-2.5 pr-4 text-brand-text">{pct(v.latestCtr)}</td>
                    <td className="py-2.5 pr-4 text-brand-text">
                      {v.latestRetention != null ? `${v.latestRetention.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2.5 pr-4">{tierBadge(v.latestTier)}</td>
                    <td className="py-2.5">
                      <a href={`https://youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer"
                         className="text-brand-red hover:text-red-400">
                        <ExternalLink size={13} />
                      </a>
                    </td>
                  </tr>
                ))}
                {index.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-brand-muted text-sm">No tracked videos yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
