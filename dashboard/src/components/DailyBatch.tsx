'use client';
import { useState } from 'react';
import useSWR from 'swr';
import {
  Zap, Loader2, CheckCircle2, XCircle, Clock,
  Film, Mic, Subtitles, Upload, Image, RefreshCw,
  Calendar, ExternalLink, AlertTriangle, Square,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ── Types ─────────────────────────────────────────────────────────────────────

type VideoStatus = 'pending' | 'generating' | 'rendering' | 'uploading' | 'scheduled' | 'failed';

interface BatchVideo {
  index:        number;
  jobId:        string | null;
  niche:        string;
  scheduledFor: string;
  status:       VideoStatus;
  title:        string | null;
  videoId:      string | null;
  videoUrl:     string | null;
  errorMessage: string | null;
  startedAt:    string | null;
  completedAt:  string | null;
  currentStep:  string | null;
}

interface BatchState {
  batchId:     string;
  status:      'running' | 'completed' | 'failed' | 'cancelled';
  startedAt:   string;
  completedAt: string | null;
  count:       number;
  timezone:    string;
  videos:      BatchVideo[];
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<VideoStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending:    { label: 'Pending',    color: 'text-brand-muted',  icon: <Clock size={12} /> },
  generating: { label: 'Generating', color: 'text-blue-400',     icon: <Loader2 size={12} className="animate-spin" /> },
  rendering:  { label: 'Rendering',  color: 'text-yellow-400',   icon: <Film size={12} className="animate-pulse" /> },
  uploading:  { label: 'Uploading',  color: 'text-purple-400',   icon: <Upload size={12} className="animate-pulse" /> },
  scheduled:  { label: 'Scheduled',  color: 'text-green-400',    icon: <CheckCircle2 size={12} /> },
  failed:     { label: 'Failed',     color: 'text-red-400',      icon: <XCircle size={12} /> },
};

const STEP_LABELS: Record<string, string> = {
  generateScript:    'Writing script…',
  generateVoice:     'Generating voice…',
  fetchClips:        'Downloading clips…',
  generateCaptions:  'Generating captions…',
  createVideo:       'Rendering video…',
  generateThumbnail: 'Creating thumbnail…',
  uploadVideo:       'Uploading to YouTube…',
  notify:            'Sending notification…',
  cleanup:           'Cleaning up…',
};

function formatScheduleTime(iso: string, tz: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: tz ?? 'UTC',
    });
  } catch { return iso; }
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function BatchProgress({ videos }: { videos: BatchVideo[] }) {
  const total     = videos.length;
  const done      = videos.filter((v) => v.status === 'scheduled' || v.status === 'failed').length;
  const scheduled = videos.filter((v) => v.status === 'scheduled').length;
  const pct       = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-brand-muted">{done}/{total} complete</span>
        <span className="text-green-400 font-medium">{scheduled} scheduled</span>
      </div>
      <div className="w-full bg-brand-border rounded-full h-2">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Video row ─────────────────────────────────────────────────────────────────

function VideoRow({ video, tz }: { video: BatchVideo; tz: string }) {
  const cfg = STATUS_CONFIG[video.status];

  return (
    <div className={clsx(
      'p-3 rounded-lg border transition-colors',
      video.status === 'scheduled' ? 'border-green-800/40 bg-green-900/10' :
      video.status === 'failed'    ? 'border-red-800/40 bg-red-900/10' :
      video.status === 'generating' || video.status === 'rendering' || video.status === 'uploading'
        ? 'border-blue-800/40 bg-blue-900/10' :
      'border-brand-border bg-brand-dark'
    )}>
      <div className="flex items-start justify-between gap-3">
        {/* Left: index + title */}
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="text-xs font-bold text-brand-muted mt-0.5 w-4 flex-shrink-0">
            {video.index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-brand-text truncate">
              {video.title ?? video.niche}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-brand-muted bg-brand-border px-1.5 py-0.5 rounded">
                {video.niche}
              </span>
              {video.currentStep && (
                <span className="text-[10px] text-blue-400 animate-pulse">
                  {STEP_LABELS[video.currentStep] ?? video.currentStep}
                </span>
              )}
              {video.errorMessage && (
                <span className="text-[10px] text-red-400 truncate max-w-[200px]" title={video.errorMessage}>
                  {video.errorMessage.slice(0, 60)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: status + schedule time + link */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={clsx('flex items-center gap-1 text-xs font-medium', cfg.color)}>
            {cfg.icon} {cfg.label}
          </span>
          <span className="text-[10px] text-brand-muted flex items-center gap-1">
            <Calendar size={9} />
            {formatScheduleTime(video.scheduledFor, tz)}
          </span>
          {video.videoUrl && (
            <a
              href={video.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-brand-red hover:text-red-400 flex items-center gap-0.5"
            >
              <ExternalLink size={9} /> Watch
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DailyBatch() {
  const { data, mutate, isLoading } = useSWR('/api/batch', fetcher, { refreshInterval: 3000 });
  const [starting, setStarting]     = useState(false);
  const [count,    setCount]        = useState(4);
  const [message,  setMessage]      = useState('');

  const state: BatchState | null = data?.state ?? null;
  const isRunning = state?.status === 'running';

  async function handleStart() {
    setStarting(true);
    setMessage('');
    try {
      const res  = await fetch('/api/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'start', count }),
      });
      const json = await res.json();
      setMessage(json.message ?? '');
      mutate();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setStarting(false);
    }
  }

  async function handleCancel() {
    await fetch('/api/batch', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'cancel' }),
    });
    mutate();
  }

  const scheduled = state?.videos?.filter((v) => v.status === 'scheduled').length ?? 0;
  const failed    = state?.videos?.filter((v) => v.status === 'failed').length ?? 0;

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap size={14} className="text-yellow-400" />
            Daily Batch Generator
          </h2>
          <p className="text-[11px] text-brand-muted mt-0.5">
            Generate &amp; schedule multiple Shorts for the day
          </p>
        </div>
        <button onClick={() => mutate()} className="btn-ghost p-1.5">
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Controls — only show when not running */}
      {!isRunning && (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-brand-muted uppercase tracking-wide mb-1 block">
              Videos to generate
            </label>
            <div className="flex gap-1">
              {[3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={clsx(
                    'flex-1 py-1.5 text-sm font-semibold rounded-lg border transition-colors',
                    count === n
                      ? 'bg-brand-red border-brand-red text-white'
                      : 'border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted/50'
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleStart}
            disabled={starting || isRunning}
            className="btn-primary px-5 py-2.5 self-end"
          >
            {starting
              ? <><Loader2 size={14} className="animate-spin" /> Starting…</>
              : <><Zap size={14} /> Generate Daily Shorts</>
            }
          </button>
        </div>
      )}

      {/* Message */}
      {message && (
        <p className="text-xs text-brand-muted bg-brand-dark rounded-lg px-3 py-2 border border-brand-border">
          {message}
        </p>
      )}

      {/* Active batch */}
      {state && (
        <div className="space-y-3">
          {/* Batch header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={clsx(
                'flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border',
                state.status === 'running'
                  ? 'bg-blue-900/30 text-blue-400 border-blue-800/40'
                  : state.status === 'completed'
                  ? 'bg-green-900/30 text-green-400 border-green-800/40'
                  : state.status === 'failed' || state.status === 'cancelled'
                  ? 'bg-red-900/30 text-red-400 border-red-800/40'
                  : 'bg-zinc-800 text-brand-muted border-brand-border'
              )}>
                {state.status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                {state.status === 'completed' && <CheckCircle2 size={10} />}
                {(state.status === 'failed' || state.status === 'cancelled') && <XCircle size={10} />}
                {state.status.charAt(0).toUpperCase() + state.status.slice(1)}
              </span>
              <span className="text-[10px] text-brand-muted font-mono">{state.batchId}</span>
            </div>

            <div className="flex items-center gap-2">
              {state.status === 'completed' && (
                <span className="text-xs text-brand-muted">
                  {scheduled}/{state.count} scheduled
                  {failed > 0 && <span className="text-red-400 ml-1">· {failed} failed</span>}
                </span>
              )}
              {isRunning && (
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 border border-red-800/40 rounded-lg hover:bg-red-900/20 transition-colors"
                >
                  <Square size={10} /> Cancel
                </button>
              )}
            </div>
          </div>

          {/* Progress bar (only while running) */}
          {isRunning && <BatchProgress videos={state.videos} />}

          {/* Completion stats */}
          {state.status === 'completed' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-brand-dark rounded-lg p-2.5 border border-brand-border text-center">
                <p className="text-lg font-bold text-white">{state.count}</p>
                <p className="text-[10px] text-brand-muted">Total</p>
              </div>
              <div className="bg-green-900/20 rounded-lg p-2.5 border border-green-800/30 text-center">
                <p className="text-lg font-bold text-green-400">{scheduled}</p>
                <p className="text-[10px] text-brand-muted">Scheduled</p>
              </div>
              <div className="bg-red-900/20 rounded-lg p-2.5 border border-red-800/30 text-center">
                <p className="text-lg font-bold text-red-400">{failed}</p>
                <p className="text-[10px] text-brand-muted">Failed</p>
              </div>
            </div>
          )}

          {/* Video queue */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-muted">
              Video Queue
            </p>
            {state.videos.map((v) => (
              <VideoRow key={v.index} video={v} tz={state.timezone ?? 'UTC'} />
            ))}
          </div>

          {/* Started time */}
          <p className="text-[10px] text-brand-muted/60 text-right">
            Started {formatDistanceToNow(new Date(state.startedAt), { addSuffix: true })}
            {state.completedAt && ` · Completed ${formatDistanceToNow(new Date(state.completedAt), { addSuffix: true })}`}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!state && !isLoading && (
        <div className="text-center py-6 text-brand-muted text-xs">
          No batch has been run today. Click "Generate Daily Shorts" to start.
        </div>
      )}
    </div>
  );
}
