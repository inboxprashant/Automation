'use client';
import useSWR from 'swr';
import {
  Upload, CheckCircle2, XCircle, BarChart2,
  TrendingUp, Clock, RefreshCw,
} from 'lucide-react';
import Sidebar           from '@/components/Sidebar';
import StatCard          from '@/components/StatCard';
import AutomationControl from '@/components/AutomationControl';
import DailyBatch        from '@/components/DailyBatch';
import UploadTable       from '@/components/UploadTable';
import TrendCard         from '@/components/TrendCard';
import LogViewer         from '@/components/LogViewer';
import ViewsChart        from '@/components/ViewsChart';
import PerformanceChart  from '@/components/PerformanceChart';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DashboardPage() {
  const { data: status, mutate: mutateStatus } = useSWR('/api/status',    fetcher, { refreshInterval: 8000 });
  const { data: trends }                        = useSWR('/api/trends',    fetcher, { refreshInterval: 60000 });
  const { data: analytics }                     = useSWR('/api/analytics', fetcher, { refreshInterval: 30000 });

  const uploads   = status?.uploads   ?? {};
  const workflow  = status?.workflow  ?? {};
  const analyticsIdx = analytics?.index ?? [];

  const high    = analyticsIdx.filter((v: any) => v.latestTier === 'high').length;
  const average = analyticsIdx.filter((v: any) => v.latestTier === 'average').length;
  const low     = analyticsIdx.filter((v: any) => v.latestTier === 'low').length;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Dashboard</h1>
            <p className="text-xs text-brand-muted mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button onClick={() => mutateStatus()} className="btn-ghost">
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Uploads"   value={uploads.total   ?? 0} icon={Upload}       color="blue"   />
          <StatCard label="Successful"      value={uploads.success ?? 0} icon={CheckCircle2} color="green"  />
          <StatCard label="Failed"          value={uploads.failed  ?? 0} icon={XCircle}      color="red"    />
          <StatCard label="Today's Runs"    value={workflow.todayCount ?? 0}
                    sub={`${workflow.todaySuccess ?? 0} ok · ${workflow.todayFailed ?? 0} failed`}
                    icon={Clock} color="yellow" />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Left col — control + daily batch */}
          <div className="space-y-4">
            <AutomationControl />
            <DailyBatch />
          </div>

          {/* Centre col — views chart */}
          <div className="lg:col-span-2 card">
            <p className="section-title">Views Over Time</p>
            <ViewsChart series={analytics?.viewsSeries ?? {}} />
          </div>
        </div>

        {/* Second row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Performance donut */}
          <div className="card">
            <p className="section-title">Performance Tiers</p>
            <PerformanceChart high={high} average={average} low={low} />
          </div>

          {/* Trends */}
          <div className="card">
            <p className="section-title">Today's Top Trends</p>
            <TrendCard trends={trends?.latestReport?.trends?.slice(0, 5) ?? []} />
          </div>

          {/* Logs */}
          <LogViewer />
        </div>

        {/* Upload table */}
        <div className="card">
          <p className="section-title">Recent Uploads</p>
          <UploadTable uploads={uploads.recent ?? []} />
        </div>

      </main>
    </div>
  );
}
