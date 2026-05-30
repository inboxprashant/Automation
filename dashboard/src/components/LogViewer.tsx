'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { RefreshCw } from 'lucide-react';
import clsx from 'clsx';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type LogType = 'uploads' | 'workflow' | 'app';

const LEVEL_COLOR: Record<string, string> = {
  error: 'text-red-400',
  warn:  'text-yellow-400',
  info:  'text-blue-400',
  debug: 'text-brand-muted',
};

function levelFromLine(line: string) {
  if (line.includes('[error]')) return 'error';
  if (line.includes('[warn]'))  return 'warn';
  if (line.includes('[info]'))  return 'info';
  return 'debug';
}

export default function LogViewer() {
  const [type, setType] = useState<LogType>('workflow');
  const { data, mutate, isLoading } = useSWR(
    `/api/logs?type=${type}&n=60`,
    fetcher,
    { refreshInterval: 10_000 }
  );

  const TABS: { key: LogType; label: string }[] = [
    { key: 'workflow', label: 'Workflow' },
    { key: 'uploads',  label: 'Uploads'  },
    { key: 'app',      label: 'App Log'  },
  ];

  return (
    <div className="card flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={clsx(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                type === t.key
                  ? 'bg-brand-red/20 text-brand-red'
                  : 'text-brand-muted hover:text-brand-text hover:bg-brand-border/50'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => mutate()} className="btn-ghost p-1.5">
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-brand-dark rounded-lg border border-brand-border p-3 font-mono text-xs space-y-0.5 max-h-80">
        {type === 'app' && data?.lines?.map((line: string, i: number) => {
          const level = levelFromLine(line);
          return (
            <p key={i} className={clsx('leading-5 whitespace-pre-wrap break-all', LEVEL_COLOR[level])}>
              {line}
            </p>
          );
        })}

        {type === 'workflow' && data?.runs?.map((r: any) => (
          <div key={r.jobId} className="py-1 border-b border-brand-border/30 last:border-0">
            <span className={r.success ? 'text-green-400' : 'text-red-400'}>
              {r.success ? '✓' : '✗'}
            </span>
            <span className="text-brand-muted ml-2">{r.jobId}</span>
            <span className="text-brand-text ml-2">{r.title ?? r.niche}</span>
            {r.errorMessage && <span className="text-red-400 ml-2 truncate">— {r.errorMessage}</span>}
            <span className="text-brand-muted/50 ml-2 text-[10px]">
              {r.completedAt ? new Date(r.completedAt).toLocaleTimeString() : ''}
            </span>
          </div>
        ))}

        {type === 'uploads' && data?.uploads?.map((u: any) => (
          <div key={u.jobId} className="py-1 border-b border-brand-border/30 last:border-0">
            <span className={u.status === 'success' ? 'text-green-400' : 'text-red-400'}>
              [{u.status}]
            </span>
            <span className="text-brand-text ml-2">{u.title}</span>
            {u.errorMessage && <span className="text-red-400 ml-2">— {u.errorMessage}</span>}
          </div>
        ))}

        {!isLoading && !data && (
          <p className="text-brand-muted">No log data available.</p>
        )}
      </div>
    </div>
  );
}
