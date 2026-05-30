'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { RefreshCw, Download } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import clsx from 'clsx';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Tab = 'workflow' | 'uploads' | 'app';

const LEVEL_COLOR: Record<string, string> = {
  error: 'text-red-400',
  warn:  'text-yellow-400',
  info:  'text-blue-300',
  debug: 'text-brand-muted',
};

function levelFromLine(line: string) {
  if (line.includes('[error]')) return 'error';
  if (line.includes('[warn]'))  return 'warn';
  if (line.includes('[info]'))  return 'info';
  return 'debug';
}

export default function LogsPage() {
  const [tab,    setTab]    = useState<Tab>('workflow');
  const [filter, setFilter] = useState('');

  const { data, mutate, isLoading } = useSWR(
    `/api/logs?type=${tab}&n=100`,
    fetcher,
    { refreshInterval: 8000 }
  );

  const TABS: { key: Tab; label: string }[] = [
    { key: 'workflow', label: 'Workflow Runs' },
    { key: 'uploads',  label: 'Upload Logs'  },
    { key: 'app',      label: 'App Log'      },
  ];

  const appLines: string[]  = data?.lines   ?? [];
  const workflowRuns: any[] = data?.runs    ?? [];
  const uploadLogs: any[]   = data?.uploads ?? [];

  const filteredLines = filter
    ? appLines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : appLines;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Logs</h1>
          <button onClick={() => mutate()} className="btn-ghost">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-brand-gray border border-brand-border rounded-lg p-1 w-fit">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={clsx('px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
                tab === t.key ? 'bg-brand-red text-white' : 'text-brand-muted hover:text-brand-text'
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* App log filter */}
        {tab === 'app' && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter log lines..."
            className="w-full max-w-sm bg-brand-dark border border-brand-border text-brand-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-red placeholder:text-brand-muted/50"
          />
        )}

        {/* App log */}
        {tab === 'app' && (
          <div className="card bg-brand-dark font-mono text-xs overflow-y-auto max-h-[calc(100vh-260px)] space-y-0.5">
            {filteredLines.length === 0
              ? <p className="text-brand-muted py-4 text-center">No log lines found</p>
              : filteredLines.map((line, i) => {
                  const level = levelFromLine(line);
                  return (
                    <p key={i} className={clsx('leading-5 whitespace-pre-wrap break-all py-0.5 border-b border-brand-border/20 last:border-0', LEVEL_COLOR[level])}>
                      {line}
                    </p>
                  );
                })
            }
          </div>
        )}

        {/* Workflow runs */}
        {tab === 'workflow' && (
          <div className="card overflow-y-auto max-h-[calc(100vh-220px)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Status', 'Job ID', 'Niche', 'Title', 'Duration', 'Steps', 'Completed'].map((h) => (
                    <th key={h} className="text-left text-[11px] font-semibold uppercase tracking-wider text-brand-muted pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/50">
                {workflowRuns.map((r: any) => (
                  <tr key={r.jobId} className="hover:bg-brand-border/20 transition-colors">
                    <td className="py-2.5 pr-4">
                      {r.success
                        ? <span className="badge-success">✓ ok</span>
                        : <span className="badge-error">✗ fail</span>}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-brand-muted">{r.jobId}</td>
                    <td className="py-2.5 pr-4">
                      <span className="text-xs bg-brand-border text-brand-muted px-1.5 py-0.5 rounded">{r.niche}</span>
                    </td>
                    <td className="py-2.5 pr-4 max-w-[180px]">
                      <p className="truncate text-brand-text">{r.title ?? '—'}</p>
                      {r.errorMessage && <p className="text-[10px] text-red-400 truncate">{r.errorMessage}</p>}
                    </td>
                    <td className="py-2.5 pr-4 text-brand-muted text-xs whitespace-nowrap">
                      {r.durationMs ? `${(r.durationMs / 1000).toFixed(0)}s` : '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-xs">
                      <span className="text-green-400">{r.completedSteps?.length ?? 0}✓</span>
                      {r.failedSteps?.length > 0 && <span className="text-red-400 ml-1">{r.failedSteps.length}✗</span>}
                    </td>
                    <td className="py-2.5 text-brand-muted text-xs whitespace-nowrap">
                      {r.completedAt ? new Date(r.completedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
                {workflowRuns.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-brand-muted text-sm">No workflow runs yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Upload logs */}
        {tab === 'uploads' && (
          <div className="card overflow-y-auto max-h-[calc(100vh-220px)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  {['Status', 'Job ID', 'Title', 'Retries', 'Duration', 'Completed'].map((h) => (
                    <th key={h} className="text-left text-[11px] font-semibold uppercase tracking-wider text-brand-muted pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/50">
                {uploadLogs.map((u: any) => (
                  <tr key={u.jobId + u.startedAt} className="hover:bg-brand-border/20 transition-colors">
                    <td className="py-2.5 pr-4">
                      {u.status === 'success'
                        ? <span className="badge-success">✓ ok</span>
                        : <span className="badge-error">✗ fail</span>}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-brand-muted">{u.jobId}</td>
                    <td className="py-2.5 pr-4 max-w-[200px]">
                      <p className="truncate text-brand-text">{u.title}</p>
                      {u.errorMessage && <p className="text-[10px] text-red-400 truncate">{u.errorMessage}</p>}
                    </td>
                    <td className="py-2.5 pr-4 text-brand-muted">{u.retryCount ?? 0}</td>
                    <td className="py-2.5 pr-4 text-brand-muted text-xs">
                      {u.durationMs ? `${(u.durationMs / 1000).toFixed(0)}s` : '—'}
                    </td>
                    <td className="py-2.5 text-brand-muted text-xs whitespace-nowrap">
                      {u.completedAt ? new Date(u.completedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
                {uploadLogs.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-brand-muted text-sm">No upload logs yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
