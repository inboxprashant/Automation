'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, BarChart2, TrendingUp, FileText,
  Upload, Settings, Youtube, Activity,
} from 'lucide-react';
import clsx from 'clsx';

const NAV = [
  { href: '/',           label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/analytics',  label: 'Analytics',  icon: BarChart2 },
  { href: '/trends',     label: 'Trends',     icon: TrendingUp },
  { href: '/scripts',    label: 'Scripts',    icon: FileText },
  { href: '/uploads',    label: 'Uploads',    icon: Upload },
  { href: '/logs',       label: 'Logs',       icon: Activity },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 w-56 bg-brand-gray border-r border-brand-border flex flex-col z-30">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-brand-border">
        <div className="w-7 h-7 bg-brand-red rounded-lg flex items-center justify-center flex-shrink-0">
          <Youtube size={14} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-none">Shorts Bot</p>
          <p className="text-[10px] text-brand-muted mt-0.5">Automation</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-red/15 text-brand-red'
                  : 'text-brand-muted hover:text-brand-text hover:bg-brand-border/50'
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-brand-border">
        <p className="text-[10px] text-brand-muted">v1.0.0 · Dark Mode</p>
      </div>
    </aside>
  );
}
