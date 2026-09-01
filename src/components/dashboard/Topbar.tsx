'use client';

import Link from 'next/link';
import { Menu, Search, RefreshCw, Bell, Moon, Sun, MonitorSmartphone, LifeBuoy } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { useDashboard } from './DashboardContext';
import { useNotifications } from '@/components/NotificationDrawer';

const THEME_ICON = { dark: Moon, light: Sun, system: MonitorSmartphone } as const;

export default function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { theme, cycle } = useTheme();
  const { search, setSearch, searchRef, refreshAll, refreshing, lastRefresh, stats, setNotifOpen } = useDashboard();
  const { unreadCount } = useNotifications();
  const ThemeIcon = THEME_ICON[theme];

  return (
    <header className="sticky top-0 z-30 glass-strong" style={{ borderBottom: '1px solid var(--b1)' }}>
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 h-[60px]">
        {/* Mobile hamburger + brand */}
        <button className="btn-icon md:hidden" onClick={onOpenMobileNav} aria-label="Open menu"><Menu size={18} /></button>
        <span className="md:hidden" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontWeight: 700, letterSpacing: '-0.02em', fontSize: 20, color: 'var(--txt)' }}>Dialout</span>

        {/* Search */}
        <div className="hidden sm:flex items-center gap-2 flex-1 max-w-md glass rounded-[var(--r-sm)] px-3 h-[38px]">
          <Search size={15} style={{ color: 'var(--muted)' }} />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search projects, ports, tech…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent outline-none flex-1 text-[13px]"
            style={{ color: 'var(--txt)' }}
          />
          <span className="kbd">⌘K</span>
        </div>

        <div className="flex-1 sm:hidden" />

        {/* Stat chips (desktop) */}
        <div className="hidden lg:flex items-center gap-1.5">
          <StatChip label="live" value={stats.running} color="var(--live)" />
          <StatChip label="offline" value={stats.offline} color="var(--offline)" />
          <StatChip label="total" value={stats.total} color="var(--accent)" />
        </div>

        {/* Last refresh */}
        <span className="hidden xl:block font-mono text-[11px]" style={{ color: 'var(--dim)' }}>{lastRefresh}</span>

        {/* Actions */}
        <button className="theme-toggle" onClick={refreshAll} title="Refresh" aria-label="Refresh">
          <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
        </button>
        <button className="theme-toggle relative" onClick={() => setNotifOpen(true)} title="Notifications" aria-label="Notifications">
          <Bell size={15} />
          {unreadCount > 0 && (
            <span className="absolute grid place-items-center font-mono"
              style={{ top: -4, right: -4, minWidth: 16, height: 16, padding: '0 3px', borderRadius: 999, background: 'var(--offline)', color: '#fff', fontSize: 9, fontWeight: 700 }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        <Link className="theme-toggle" href="/help" title="Help & guides" aria-label="Help and guides">
          <LifeBuoy size={15} />
        </Link>
        <button className="theme-toggle" onClick={cycle} title={`Theme: ${theme}`} aria-label="Toggle theme">
          <ThemeIcon size={15} />
        </button>
      </div>
    </header>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 glass rounded-full pl-2.5 pr-3 h-[34px]">
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="font-mono text-[13px] font-semibold tnum stat-val" style={{ color: 'var(--txt)' }}>{value}</span>
      <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{label}</span>
    </div>
  );
}
