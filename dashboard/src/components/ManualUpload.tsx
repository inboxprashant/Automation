'use client';
import { useState } from 'react';
import { Upload, Loader2, CheckCircle2, XCircle } from 'lucide-react';

const NICHES = ['tech', 'ai_tools', 'money_facts', 'automation', 'productivity', 'tech_facts'];

export default function ManualUpload() {
  const [jobId,    setJobId]    = useState('');
  const [title,    setTitle]    = useState('');
  const [niche,    setNiche]    = useState('tech');
  const [privacy,  setPrivacy]  = useState('public');
  const [schedule, setSchedule] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<{ ok: boolean; message: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobId.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch('/api/upload', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ jobId: jobId.trim(), title, niche, privacy, schedule: schedule || undefined }),
      });
      const json = await res.json();
      setResult(json);
    } catch (err: any) {
      setResult({ ok: false, message: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-sm font-semibold text-white">Manual Upload Override</h2>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-xs text-brand-muted mb-1 block">Job ID *</label>
          <input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="e.g. a1b2c3d4"
            required
            className="w-full bg-brand-dark border border-brand-border text-brand-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-red placeholder:text-brand-muted/50"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-brand-muted mb-1 block">Niche</label>
            <select value={niche} onChange={(e) => setNiche(e.target.value)}
              className="w-full bg-brand-dark border border-brand-border text-brand-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-red">
              {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-brand-muted mb-1 block">Privacy</label>
            <select value={privacy} onChange={(e) => setPrivacy(e.target.value)}
              className="w-full bg-brand-dark border border-brand-border text-brand-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-red">
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-brand-muted mb-1 block">Schedule (optional ISO datetime)</label>
          <input
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="2024-01-16T09:00:00Z"
            className="w-full bg-brand-dark border border-brand-border text-brand-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-red placeholder:text-brand-muted/50"
          />
        </div>
        <button type="submit" disabled={loading || !jobId.trim()} className="btn-primary w-full justify-center">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Upload Video
        </button>
      </form>

      {result && (
        <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
          result.ok
            ? 'bg-green-900/20 border-green-800/40 text-green-400'
            : 'bg-red-900/20 border-red-800/40 text-red-400'
        }`}>
          {result.ok ? <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" /> : <XCircle size={14} className="mt-0.5 flex-shrink-0" />}
          <p className="text-xs">{result.message}</p>
        </div>
      )}
    </div>
  );
}
