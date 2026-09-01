'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LogoMark } from '@/components/marketing/Logo';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid, Share2, Radar, TerminalSquare, Server, MonitorSmartphone, Settings,
  Plus, LogOut, Check, ChevronDown, X, Circle, LifeBuoy, Bot } from 'lucide-react';
import { useDashboard } from './DashboardContext';

const NAV = [
  { href: '/projects', label: 'Projects', icon: LayoutGrid, countKey: 'projects' as const },
  { href: '/shared',   label: 'Shared',   icon: Share2,     countKey: 'shared' as const },
  { href: '/scanner',  label: 'Scanner',  icon: Radar,      countKey: null },
  { href: '/terminals', label: 'Terminals', icon: TerminalSquare, countKey: null },
  { href: '/ai',        label: 'AI Sessions', icon: Bot,      countKey: null },
  { href: '/services', label: 'Services', icon: Server,     countKey: 'services' as const },
  { href: '/machines', label: 'Machines', icon: MonitorSmartphone, countKey: null },
  { href: '/settings', label: 'Settings', icon: Settings,   countKey: null },
  { href: '/help',     label: 'Help',     icon: LifeBuoy,   countKey: null },
];

export default function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const pathname = usePathname();
  const { session, stats, sharedProjects, services, handleMachineSwitch, handleAddMachine, handleLogout } = useDashboard();
  const [machineMenu, setMachineMenu] = useState(false);
  const [addingMachine, setAddingMachine] = useState(false);
  const [newMachine, setNewMachine] = useState('');

  const currentMachine = session?.machines.find((m) => m.id === session.machineId);

  const counts: Record<string, number> = {
    projects: stats.total,
    shared: sharedProjects.length,
    services: services.length,
  };

  function submitMachine() {
    if (!newMachine.trim()) return;
    handleAddMachine(newMachine.trim());
    setNewMachine(''); setAddingMachine(false); setMachineMenu(false);
  }

  const content = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <Link href="/projects" className="flex items-center gap-2.5" onClick={onCloseMobile}>
          <span className="grid place-items-center rounded-lg" style={{ width: 34, height: 34, background: 'var(--accent-solid)' }}>
            <LogoMark size={19} className="text-white" />
          </span>
          <span style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontWeight: 700, letterSpacing: '-0.02em', fontSize: 23, lineHeight: 1, color: 'var(--txt)' }}>Dialout</span>
        </Link>
        <button className="btn-icon md:hidden" onClick={onCloseMobile} aria-label="Close menu"><X size={16} /></button>
      </div>

      {/* Machine selector */}
      {session && currentMachine && (
        <div className="px-3 pb-3 relative">
          <button
            onClick={() => setMachineMenu((v) => !v)}
            className="w-full flex items-center gap-2 glass rounded-[var(--r-sm)] px-3 py-2.5"
            style={{ color: 'var(--txt)' }}
          >
            <MonitorSmartphone size={15} style={{ color: 'var(--accent)' }} />
            <span className="text-[13px] font-medium truncate flex-1 text-left">{currentMachine.name}</span>
            <ChevronDown size={14} style={{ color: 'var(--muted)' }} />
          </button>
          {machineMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setMachineMenu(false); setAddingMachine(false); }} />
              <div className="absolute left-3 right-3 top-full mt-1 z-50 card-v2 overflow-hidden" style={{ padding: 4 }}>
                {session.machines.filter((m) => !m.hidden).map((m) => (
                  <button key={m.id}
                    onClick={() => { handleMachineSwitch(m.id); setMachineMenu(false); }}
                    className="w-full flex items-center gap-2 rounded-[var(--r-sm)] px-3 py-2 text-[13px] text-left transition-colors"
                    style={{ color: m.id === session.machineId ? 'var(--txt)' : 'var(--muted)', background: m.id === session.machineId ? 'var(--accent-weak)' : 'transparent' }}
                  >
                    {m.id === session.machineId ? <Check size={14} style={{ color: 'var(--accent)' }} /> : <Circle size={6} style={{ color: 'var(--dim)' }} />}
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
                <div style={{ borderTop: '1px solid var(--b1)', marginTop: 4, paddingTop: 4 }}>
                  {addingMachine ? (
                    <div className="flex items-center gap-1.5 p-1">
                      <input autoFocus className="inp" style={{ fontSize: 12, padding: '6px 8px' }}
                        placeholder="Machine name" value={newMachine}
                        onChange={(e) => setNewMachine(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submitMachine()} />
                      <button className="btn-grad" style={{ padding: '6px 10px', fontSize: 12 }} onClick={submitMachine}>Add</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingMachine(true)}
                      className="w-full flex items-center gap-2 rounded-[var(--r-sm)] px-3 py-2 text-[12.5px] text-left"
                      style={{ color: 'var(--accent)' }}>
                      <Plus size={14} /> Add machine
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon, countKey }) => {
          const active = pathname === href || (href !== '/projects' && pathname?.startsWith(href)) || (href === '/projects' && pathname?.startsWith('/projects'));
          const count = countKey ? counts[countKey] : undefined;
          return (
            <Link key={href} href={href} onClick={onCloseMobile} className={`nav-item ${active ? 'active' : ''}`}>
              <Icon size={18} strokeWidth={active ? 2.3 : 1.9} style={{ color: active ? 'var(--accent)' : 'inherit' }} />
              <span>{label}</span>
              {count !== undefined && count > 0 && <span className="nav-badge">{count}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer: add + user */}
      <div className="px-3 pt-3 pb-4 space-y-2" style={{ borderTop: '1px solid var(--b1)' }}>
        <AddProjectButton onCloseMobile={onCloseMobile} />
        {session && (
          <div className="flex items-center gap-2 px-1">
            {/* The identity IS the link to the profile — the avatar and name are
                the thing you'd click anyway, so a separate icon was one more
                target competing for the same intent. Log out keeps its own
                button: it must never be a mis-click away from "edit profile". */}
            <Link
              href="/profile"
              onClick={onCloseMobile}
              title="Your profile"
              aria-current={pathname === '/profile' ? 'page' : undefined}
              className="user-link flex items-center gap-2 min-w-0 flex-1 rounded-lg"
              style={{ padding: '4px 5px', margin: '-4px -5px' }}
            >
              <span className="grid place-items-center rounded-full shrink-0" style={{ width: 30, height: 30, background: 'var(--grad-soft)', border: '1px solid var(--glass-border)', fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>
                {session.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium truncate" style={{ color: 'var(--txt)' }}>{session.name}</span>
                <span className="block text-[11px] truncate" style={{ color: 'var(--dim)' }}>{session.email}</span>
              </span>
            </Link>
            <button className="btn-icon" onClick={handleLogout} title="Log out"><LogOut size={15} /></button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col shrink-0 glass-strong" style={{ width: 248, borderRight: '1px solid var(--b1)', position: 'sticky', top: 0, height: '100dvh' }}>
        {content}
      </aside>

      {/* Mobile slide-over */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[70]">
          <div className="absolute inset-0" style={{ background: 'var(--overlay)', backdropFilter: 'blur(4px)' }} onClick={onCloseMobile} />
          <aside className="devdash-drawer absolute left-0 top-0 h-full" style={{ width: 'min(84vw, 320px)', background: 'var(--bg-sub)', borderRight: '1px solid var(--b2)', animation: 'sideSlideIn .28s cubic-bezier(.22,1,.36,1)' }}>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}

function AddProjectButton({ onCloseMobile }: { onCloseMobile: () => void }) {
  const { openAdd } = useDashboard();
  return (
    <button className="btn-grad w-full" onClick={() => { openAdd(); onCloseMobile(); }}>
      <Plus size={17} /> New project
    </button>
  );
}
