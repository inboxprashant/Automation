import { TrendingUp, Flame } from 'lucide-react';
import clsx from 'clsx';

interface Trend {
  rank:        number;
  topic:       string;
  niche:       string;
  viralScore:  number;
  keywords:    string[];
}

interface Props { trends: Trend[]; }

function scoreColor(score: number) {
  if (score >= 80) return 'text-red-400';
  if (score >= 60) return 'text-yellow-400';
  return 'text-brand-muted';
}

function scoreBar(score: number) {
  return (
    <div className="w-full bg-brand-border rounded-full h-1 mt-1.5">
      <div
        className={clsx('h-1 rounded-full transition-all', score >= 80 ? 'bg-red-500' : score >= 60 ? 'bg-yellow-500' : 'bg-blue-500')}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

export default function TrendCard({ trends }: Props) {
  if (trends.length === 0) {
    return (
      <div className="text-center py-8 text-brand-muted text-sm">
        No trend data. Run <code className="font-mono text-xs bg-brand-border px-1 rounded">npm run find:trends</code>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {trends.map((t) => (
        <div key={t.rank} className="flex items-start gap-3 p-3 bg-brand-dark rounded-lg border border-brand-border hover:border-brand-muted/40 transition-colors">
          <span className="text-xs font-bold text-brand-muted w-5 flex-shrink-0 mt-0.5">#{t.rank}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-brand-text truncate">{t.topic}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-brand-muted bg-brand-border px-1.5 py-0.5 rounded">{t.niche}</span>
              {t.keywords?.slice(0, 2).map((k) => (
                <span key={k} className="text-[10px] text-brand-muted/70">{k}</span>
              ))}
            </div>
            {scoreBar(t.viralScore)}
          </div>
          <div className="flex-shrink-0 text-right">
            <span className={clsx('text-sm font-bold', scoreColor(t.viralScore))}>{t.viralScore}</span>
            {t.viralScore >= 80 && <Flame size={10} className="text-red-400 ml-auto mt-0.5" />}
          </div>
        </div>
      ))}
    </div>
  );
}
