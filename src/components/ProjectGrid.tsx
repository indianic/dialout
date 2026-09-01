'use client';

import { useState, useEffect } from 'react';
import { Archive } from 'lucide-react';
import { Project } from '@/types';
import { FilterType } from './FilterBar';
import ProjectCard from './ProjectCard';
import Pagination from './Pagination';

interface ProjectGridProps {
  projects: Project[];
  filter: FilterType;
  onEdit: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  onOpenNotes: (id: number) => void;
  onOpenTodos: (id: number) => void;
  onShare: (id: number) => void;
  onTerminal?: (id: number) => void;
  onlineMachineIds?: number[];
}

function sortByPortAsc(a: Project, b: Project) {
  return (a.port || 99999) - (b.port || 99999);
}

export default function ProjectGrid({ projects, filter, onEdit, onDelete, onOpenNotes, onOpenTodos, onShare, onTerminal, onlineMachineIds = [] }: ProjectGridProps) {
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(30);

  useEffect(() => { setPage(0); }, [filter, projects.length]);

  const live = projects.filter((p) => p.isRunning && p.status !== 'archived').sort(sortByPortAsc);
  const off = projects.filter((p) => !p.isRunning && p.status !== 'archived').sort(sortByPortAsc);
  const arch = projects.filter((p) => p.status === 'archived').sort(sortByPortAsc);

  const allSorted = [...live, ...off, ...arch];
  const total = allSorted.length;
  const paged = perPage === 0 ? allSorted : allSorted.slice(page * perPage, (page + 1) * perPage);

  const pagedLive = paged.filter((p) => p.isRunning && p.status !== 'archived');
  const pagedOff = paged.filter((p) => !p.isRunning && p.status !== 'archived');
  const pagedArch = paged.filter((p) => p.status === 'archived');

  const hideLive = pagedLive.length === 0 && (filter === 'archived' || filter === 'offline');
  const hideOff = pagedOff.length === 0 && (filter === 'live' || filter === 'archived');
  const hideArch = pagedArch.length === 0;

  const cardProps = { onEdit, onDelete, onOpenNotes, onOpenTodos, onShare, onTerminal, onlineMachineIds };
  const gridCls = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4';

  return (
    <>
      <Pagination total={total} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />

      {!hideLive && (
        <section>
          <div className="sec-label">
            <span className="live-dot" />
            <span style={{ color: 'var(--live)' }}>Live</span>
            <span className="sec-count">{live.length}</span>
          </div>
          <div className={gridCls}>
            {pagedLive.map((p, i) => <ProjectCard key={p.id} project={p} index={i} {...cardProps} />)}
          </div>
        </section>
      )}

      {!hideOff && (
        <section>
          <div className="sec-label">
            <span className="dead-dot" />
            <span style={{ color: 'var(--offline)' }}>Offline</span>
            <span className="sec-count">{off.length}</span>
          </div>
          <div className={gridCls}>
            {pagedOff.map((p, i) => <ProjectCard key={p.id} project={p} index={pagedLive.length + i} {...cardProps} />)}
          </div>
        </section>
      )}

      {!hideArch && (
        <section>
          <div className="sec-label">
            <Archive size={15} style={{ color: 'var(--muted)' }} />
            <span>Archived</span>
            <span className="sec-count">{arch.length}</span>
          </div>
          <div className={gridCls}>
            {pagedArch.map((p, i) => <ProjectCard key={p.id} project={p} index={pagedLive.length + pagedOff.length + i} {...cardProps} />)}
          </div>
        </section>
      )}

      <Pagination total={total} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />
    </>
  );
}
