'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Play, Square, Zap, Loader2 } from 'lucide-react';
import clsx from 'clsx';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const NICHES = ['tech', 'ai_tools', 'money_facts', 'automation', 'productivity', 'tech_facts'];

export default function AutomationControl() {
  const { data, mutate } = useSWR('/api/automation', fetcher, { refreshInterval: 5000 });
  const [loading, setLoading]   = useState(false);
  const [niche,   setNiche]     = useState('tech');
  const [message, setMessage]   = useState('');

  const running = data?.running ?? false;

  async function call(action: string) {
    setLoading(true);
    setMessage('');
    try {
      const res  = await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, niche }),
      });
      const json = await res.json();
      setMessage(json.message ?? '');
      mutate();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Automation Control</h2>
        <span className={clsx(
          'flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full',
          running
            ? 'bg-green-900/30 text-green-400 border border-green-800/40'
            : 'bg-zinc-800 text-brand-muted border border-brand-border'
        )}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', running ? 'bg-green-400 animate-pulse' : 'bg-zinc-600')} />
          {running ? 'Running' : 'Stopped'}
        </span>
      </div>

      {running && data?.startedAt && (
        <p className="text-xs text-brand-muted">
          Started: {new Date(data.startedAt).toLocaleString()}
          {data.pid && <span className="ml-2 font-mono">PID {data.pid}</span>}
        </p>
      )}

      <div className="flex items-center gap-2">
        <select
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          className="flex-1 bg-brand-dark border border-brand-border text-brand-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-red"
        >
          {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="flex gap-2">
        {!running ? (
          <button onClick={() => call('start')} disabled={loading} className="btn-primary flex-1">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Start Scheduler
          </button>
        ) : (
          <button onClick={() => call('stop')} disabled={loading} className="btn-secondary flex-1 border border-red-800/50 text-red-400 hover:bg-red-900/20">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
            Stop Scheduler
          </button>
        )}
        <button onClick={() => call('run_now')} disabled={loading} className="btn-secondary">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          Run Now
        </button>
      </div>

      {message && (
        <p className="text-xs text-brand-muted bg-brand-dark rounded-lg px-3 py-2 border border-brand-border">
          {message}
        </p>
      )}

      {data?.queue && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="bg-brand-dark rounded-lg p-3 border border-brand-border text-center">
            <p className="text-lg font-bold text-white">{data.queue.pending ?? 0}</p>
            <p className="text-[10px] text-brand-muted uppercase tracking-wide">Pending</p>
          </div>
          <div className="bg-brand-dark rounded-lg p-3 border border-brand-border text-center">
            <p className="text-lg font-bold text-white">{data.queue.running ?? 0}</p>
            <p className="text-[10px] text-brand-muted uppercase tracking-wide">Running</p>
          </div>
        </div>
      )}
    </div>
  );
}
