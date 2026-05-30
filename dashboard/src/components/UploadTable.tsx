'use client';
import { ExternalLink, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Upload {
  jobId:       string;
  videoId?:    string;
  title:       string;
  status:      'success' | 'failure' | 'scheduled';
  videoUrl?:   string;
  completedAt?: string;
  retryCount?: number;
  errorMessage?: string;
}

interface Props { uploads: Upload[]; }

const STATUS_ICON = {
  success:   <CheckCircle2 size={14} className="text-green-400" />,
  failure:   <XCircle      size={14} className="text-red-400"   />,
  scheduled: <Clock        size={14} className="text-blue-400"  />,
};

const STATUS_BADGE = {
  success:   'badge-success',
  failure:   'badge-error',
  scheduled: 'badge-info',
};

export default function UploadTable({ uploads }: Props) {
  if (uploads.length === 0) {
    return (
      <div className="text-center py-10 text-brand-muted text-sm">
        No uploads yet. Run a workflow to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-border">
            {['Title', 'Status', 'Retries', 'Completed', 'Link'].map((h) => (
              <th key={h} className="text-left text-[11px] font-semibold uppercase tracking-wider text-brand-muted pb-2 pr-4">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border/50">
          {uploads.map((u) => (
            <tr key={u.jobId} className="hover:bg-brand-border/20 transition-colors">
              <td className="py-2.5 pr-4 max-w-[220px]">
                <p className="truncate text-brand-text font-medium">{u.title}</p>
                <p className="text-[10px] text-brand-muted font-mono">{u.jobId}</p>
              </td>
              <td className="py-2.5 pr-4">
                <span className={STATUS_BADGE[u.status]}>
                  {STATUS_ICON[u.status]}
                  {u.status}
                </span>
                {u.errorMessage && (
                  <p className="text-[10px] text-red-400 mt-0.5 max-w-[160px] truncate" title={u.errorMessage}>
                    {u.errorMessage}
                  </p>
                )}
              </td>
              <td className="py-2.5 pr-4 text-brand-muted">{u.retryCount ?? 0}</td>
              <td className="py-2.5 pr-4 text-brand-muted text-xs whitespace-nowrap">
                {u.completedAt
                  ? formatDistanceToNow(new Date(u.completedAt), { addSuffix: true })
                  : '—'}
              </td>
              <td className="py-2.5">
                {u.videoUrl ? (
                  <a href={u.videoUrl} target="_blank" rel="noopener noreferrer"
                     className="text-brand-red hover:text-red-400 transition-colors">
                    <ExternalLink size={14} />
                  </a>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
