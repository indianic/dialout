'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ScanLine, LayoutGrid, Table } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import ProjectGrid from '@/components/ProjectGrid';
import ProjectTable from '@/components/ProjectTable';
import EmptyState from '@/components/EmptyState';
import type { FilterType } from '@/components/FilterBar';

const STATUS_TABS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'offline', label: 'Offline' },
  { key: 'archived', label: 'Archived' },
];

const RUNNERS = ['', 'npm', 'pm2', 'yarn', 'php', 'docker', 'python', 'custom'];

function splitCsv(s: string) {
  return (s || '').split(',').map((x) => x.trim()).filter(Boolean);
}

export default function ProjectsPage() {
  const router = useRouter();
  const {
    projects, search, runnerFilter, setRunnerFilter, stats,
    openEdit, openDelete, openShare, openTerminal, openAdd, deleteProjects,
    onlineMachineIds,
  } = useDashboard();
  const [filter, setFilter] = useState<FilterType>('all');
  const [view, setView] = useState<'card' | 'table'>('card');
  const [techFilter, setTechFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  useEffect(() => {
    try {
      const v = localStorage.getItem('devdash-projects-view');
      if (v === 'table' || v === 'card') setView(v);
    } catch {}
  }, []);

  function changeView(v: 'card' | 'table') {
    setView(v);
    try { localStorage.setItem('devdash-projects-view', v); } catch {}
  }

  const techOptions = useMemo(() => {
    const s = new Set<string>();
    projects.forEach((p) => splitCsv(p.techStack).forEach((t) => s.add(t)));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const tagOptions = useMemo(() => {
    const s = new Set<string>();
    projects.forEach((p) => splitCsv(p.tags).forEach((t) => s.add(t)));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const q = search.toLowerCase();
  const filtered = projects.filter((p) => {
    const matchesSearch = !q || [p.name, String(p.port || ''), p.addonPorts || '', p.techStack || '', p.tags || '', p.description || '', p.runner || '']
      .some((s) => s.toLowerCase().includes(q));
    const matchesRunner = !runnerFilter || p.runner === runnerFilter;
    const matchesTech = !techFilter || splitCsv(p.techStack).includes(techFilter);
    const matchesTag = !tagFilter || splitCsv(p.tags).includes(tagFilter);
    const matchesFilter =
      filter === 'all' ? p.status !== 'archived' :
      filter === 'live' ? p.isRunning :
      filter === 'offline' ? (!p.isRunning && p.status !== 'archived') :
      filter === 'archived' ? p.status === 'archived' : true;
    return matchesSearch && matchesRunner && matchesTech && matchesTag && matchesFilter;
  });

  const resetKey = `${q}|${filter}|${runnerFilter}|${techFilter}|${tagFilter}`;

  const tabCount: Record<string, number> = {
    all: projects.filter((p) => p.status !== 'archived').length,
    live: stats.running,
    offline: stats.offline,
    archived: stats.archived,
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="font-display" style={{ fontSize: 27, lineHeight: 1.1, color: 'var(--txt)' }}>Projects</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--muted)' }}>
            {stats.running} running · {stats.total} total on this machine
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => router.push('/scanner')}><ScanLine size={16} /> Scan ports</button>
          <button className="btn-grad" onClick={openAdd}><Plus size={17} /> New project</button>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <div className="flex items-center gap-1 glass rounded-full p-1">
          {STATUS_TABS.map(({ key, label }) => (
            <button key={key} className={`ftab ${filter === key ? 'on' : ''}`} onClick={() => setFilter(key)}>
              {label}
              {tabCount[key] > 0 && <span className="font-mono tnum" style={{ fontSize: 11, color: 'var(--dim)' }}>{tabCount[key]}</span>}
            </button>
          ))}
        </div>
        <select value={runnerFilter} onChange={(e) => setRunnerFilter(e.target.value)} className="inp" style={{ width: 'auto', padding: '8px 12px', fontSize: 12 }}>
          {RUNNERS.map((r) => <option key={r} value={r}>{r ? r.toUpperCase() : 'All runners'}</option>)}
        </select>
        {techOptions.length > 0 && (
          <select value={techFilter} onChange={(e) => setTechFilter(e.target.value)} className="inp" style={{ width: 'auto', padding: '8px 12px', fontSize: 12 }}>
            <option value="">All tech</option>
            {techOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {tagOptions.length > 0 && (
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="inp" style={{ width: 'auto', padding: '8px 12px', fontSize: 12 }}>
            <option value="">All tags</option>
            {tagOptions.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
        )}

        <div className="flex items-center gap-1 glass rounded-full p-1 ml-auto">
          <button className={`ftab ${view === 'card' ? 'on' : ''}`} onClick={() => changeView('card')} title="Card view" aria-label="Card view"><LayoutGrid size={14} /></button>
          <button className={`ftab ${view === 'table' ? 'on' : ''}`} onClick={() => changeView('table')} title="Table view" aria-label="Table view"><Table size={14} /></button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState onAdd={openAdd} />
      ) : view === 'table' ? (
        <ProjectTable
          projects={filtered}
          resetKey={resetKey}
          onEdit={openEdit}
          onDelete={(id) => openDelete(id)}
          onOpenNotes={(id) => router.push(`/projects/${id}?tab=notes`)}
          onOpenTodos={(id) => router.push(`/projects/${id}?tab=todos`)}
          onShare={openShare}
          onTerminal={(id) => { const p = projects.find((x) => x.id === id); if (p) openTerminal(p); }}
          onBulkDelete={deleteProjects}
          onlineMachineIds={onlineMachineIds}
        />
      ) : (
        <ProjectGrid
          projects={filtered}
          filter={filter}
          onEdit={openEdit}
          onDelete={(id) => openDelete(id)}
          onOpenNotes={(id) => router.push(`/projects/${id}?tab=notes`)}
          onOpenTodos={(id) => router.push(`/projects/${id}?tab=todos`)}
          onShare={openShare}
          onTerminal={(id) => { const p = projects.find((x) => x.id === id); if (p) openTerminal(p); }}
          onlineMachineIds={onlineMachineIds}
        />
      )}
    </div>
  );
}
