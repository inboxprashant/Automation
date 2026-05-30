import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

interface Props {
  label:    string;
  value:    string | number;
  sub?:     string;
  icon:     LucideIcon;
  color?:   'red' | 'green' | 'blue' | 'yellow' | 'purple';
  trend?:   'up' | 'down' | 'neutral';
}

const COLOR_MAP = {
  red:    'text-red-400    bg-red-900/20',
  green:  'text-green-400  bg-green-900/20',
  blue:   'text-blue-400   bg-blue-900/20',
  yellow: 'text-yellow-400 bg-yellow-900/20',
  purple: 'text-purple-400 bg-purple-900/20',
};

export default function StatCard({ label, value, sub, icon: Icon, color = 'blue', trend }: Props) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className={clsx('p-2 rounded-lg', COLOR_MAP[color])}>
          <Icon size={16} className={COLOR_MAP[color].split(' ')[0]} />
        </div>
        {trend && (
          <span className={clsx('text-xs font-medium',
            trend === 'up'   ? 'text-green-400' :
            trend === 'down' ? 'text-red-400'   : 'text-brand-muted'
          )}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—'}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-white mt-3">{value}</p>
      <p className="text-xs text-brand-muted font-medium">{label}</p>
      {sub && <p className="text-[11px] text-brand-muted/70 mt-0.5">{sub}</p>}
    </div>
  );
}
