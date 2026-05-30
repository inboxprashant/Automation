'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { FileText, ChevronRight, X, Clock } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { formatDistanceToNow } from 'date-fns';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ScriptsPage() {
  const { data }          = useSWR('/api/scripts', fetcher);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: detail }  = useSWR(selected ? `/api/scripts?jobId=${selected}` : null, fetcher);

  const scripts = data?.scripts ?? [];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-6 space-y-4">
        <h1 className="text-xl font-bold text-white">Generated Scripts</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Script list */}
          <div className="card space-y-1 max-h-[calc(100vh-140px)] overflow-y-auto">
            <p className="section-title">{scripts.length} scripts</p>
            {scripts.length === 0 && (
              <p className="text-brand-muted text-sm py-4 text-center">No scripts generated yet</p>
            )}
            {scripts.map((s: any) => (
              <button
                key={s.jobId}
                onClick={() => setSelected(s.jobId)}
                className={`w-full text-left flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  selected === s.jobId
                    ? 'bg-brand-red/10 border-brand-red/40'
                    : 'border-transparent hover:bg-brand-border/40'
                }`}
              >
                <FileText size={14} className="text-brand-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-text truncate">{s.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-brand-muted bg-brand-border px-1.5 py-0.5 rounded">{s.niche}</span>
                    <span className="text-[10px] text-brand-muted flex items-center gap-1">
                      <Clock size={9} />
                      {s.estimatedDuration}s
                    </span>
                    <span className="text-[10px] text-brand-muted">
                      {s.generatedAt ? formatDistanceToNow(new Date(s.generatedAt), { addSuffix: true }) : ''}
                    </span>
                  </div>
                </div>
                <ChevronRight size={13} className="text-brand-muted flex-shrink-0" />
              </button>
            ))}
          </div>

          {/* Script detail */}
          <div className="card max-h-[calc(100vh-140px)] overflow-y-auto">
            {!selected && (
              <div className="flex flex-col items-center justify-center py-16 text-brand-muted">
                <FileText size={32} className="mb-3 opacity-30" />
                <p className="text-sm">Select a script to view details</p>
              </div>
            )}
            {selected && detail && !detail.error && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-bold text-white leading-snug">{detail.title}</h2>
                  <button onClick={() => setSelected(null)} className="btn-ghost p-1 flex-shrink-0">
                    <X size={13} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="badge-info">{detail.niche}</span>
                  <span className="badge-info">~{detail.estimatedDuration}s</span>
                  {detail.tags?.slice(0, 3).map((t: string) => (
                    <span key={t} className="text-[10px] text-brand-muted bg-brand-border px-1.5 py-0.5 rounded">#{t}</span>
                  ))}
                </div>

                {[
                  { label: 'Hook',        value: detail.hook },
                  { label: 'Body',        value: detail.body },
                  { label: 'CTA',         value: detail.cta },
                  { label: 'Description', value: detail.description },
                ].map(({ label, value }) => value && (
                  <div key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-muted mb-1">{label}</p>
                    <p className="text-sm text-brand-text bg-brand-dark rounded-lg p-3 border border-brand-border leading-relaxed">
                      {value}
                    </p>
                  </div>
                ))}

                {detail.keywords?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-muted mb-1">Keywords</p>
                    <div className="flex flex-wrap gap-1">
                      {detail.keywords.map((k: string) => (
                        <span key={k} className="text-[10px] text-brand-muted bg-brand-border px-1.5 py-0.5 rounded">{k}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
