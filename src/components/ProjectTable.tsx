'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ExternalLink, SquareTerminal, StickyNote, ListChecks,
  Share2, Pencil, Trash2, ArrowUp, ArrowDown, Trash,
} from 'lucide-react';
import { Project } from '@/types';
import ProcessControls from './ProcessControls';
import Pagination from './Pagination';
import BulkDeleteModal from './BulkDeleteModal';

interface ProjectTableProps {
  projects: Project[];
  resetKey: string;
  onEdit: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  onOpenNotes: (id: number) => void;
  onOpenTodos: (id: number) => void;
  onShare: (id: number) => void;
  onTerminal?: (id: number) => void;
  onBulkDelete: (ids: number[]) => Promise<void>;
  onlineMachineIds?: number[];
}

type SortKey = 'name' | 'port' | 'status' | 'runner' | 'age';
type SortDir = 'asc' | 'desc';

function splitCsv(s: string) {
  return (s || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function statusRank(p: Project) {
  if (p.status === 'archived') return 3;
  if (p.isRunning) return 0;
  if (!p.port && p.url) return 1; // static
  return 2; // offline
}

function statusMeta(p: Project) {
  const arch = p.status === 'archived';
  const isStatic = !p.port && !!p.url;
  const live = p.isRunning;
  const cls = arch ? 'arch' : isStatic ? (live ? 'live' : 'static') : live ? 'live' : 'offline';
  const label = arch ? 'Archived' : isStatic ? (live ? 'Live' : 'Static') : live ? 'Live' : 'Offline';
  return { cls, label };
}

function ageDays(p: Project) {
  if (!p.startDate) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(p.startDate).getTime()) / 86400000));
}

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'name', label: 'Name' },
  { key: 'port', label: 'Ports' },
  { key: 'runner', label: 'Runner' },
];

const thStyle: React.CSSProperties = {
  padding: '10px 12px', color: 'var(--muted)', fontSize: 10.5,
  letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
};

export default function ProjectTable({
  projects, resetKey, onEdit, onDelete, onOpenNotes, onOpenTodos, onShare, onTerminal, onBulkDelete, onlineMachineIds = [],
}: ProjectTableProps) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'status', dir: 'asc' });
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(30);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset selection + page whenever the upstream filters change.
  useEffect(() => { setSelected(new Set()); setPage(0); }, [resetKey]);

  const sorted = useMemo(() => {
    const arr = [...projects];
    const dir = sort.dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'port': cmp = (a.port || 99999) - (b.port || 99999); break;
        case 'status': cmp = statusRank(a) - statusRank(b) || a.name.localeCompare(b.name); break;
        case 'runner': cmp = (a.runner || 'npm').localeCompare(b.runner || 'npm'); break;
        case 'age': cmp = (ageDays(a) ?? -1) - (ageDays(b) ?? -1); break;
      }
      return cmp * dir;
    });
    return arr;
  }, [projects, sort]);

  const total = sorted.length;
  const paged = perPage === 0 ? sorted : sorted.slice(page * perPage, (page + 1) * perPage);
  const pageIds = paged.map((p) => p.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  function toggleSort(key: SortKey) {
    setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }
  function toggleRow(id: number) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleAllOnPage() {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => n.delete(id));
      else pageIds.forEach((id) => n.add(id));
      return n;
    });
  }
  async function confirmBulkDelete() {
    setDeleting(true);
    await onBulkDelete([...selected]);
    setDeleting(false);
    setConfirmOpen(false);
    setSelected(new Set());
  }

  const selectedNames = projects.filter((p) => selected.has(p.id)).map((p) => p.name);

  function sortIcon(key: SortKey) {
    if (sort.key !== key) return null;
    return sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />;
  }

  return (
    <>
      <Pagination total={total} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />

      <div style={{ overflowX: 'auto' }} className="glass rounded-2xl">
        <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--b1)' }}>
              <th style={{ width: 40, padding: '10px 12px' }}>
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  ref={(el) => { if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected; }}
                  onChange={toggleAllOnPage}
                  aria-label="Select all on page"
                />
              </th>
              {SORT_COLUMNS.map((c) => (
                <th key={c.key} onClick={() => toggleSort(c.key)} className="text-left font-mono" style={{ ...thStyle, cursor: 'pointer' }}>
                  <span className="inline-flex items-center gap-1">{c.label}{sortIcon(c.key)}</span>
                </th>
              ))}
              <th className="text-left font-mono" style={thStyle}>Tech</th>
              <th className="text-left font-mono" style={thStyle}>Tags</th>
              <th onClick={() => toggleSort('age')} className="text-left font-mono" style={{ ...thStyle, cursor: 'pointer' }}>
                <span className="inline-flex items-center gap-1">Age{sortIcon('age')}</span>
              </th>
              <th className="text-right font-mono" style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((p) => {
              const { cls, label } = statusMeta(p);
              const arch = p.status === 'archived';
              const live = p.isRunning;
              const daemonOnline = p.machineId ? onlineMachineIds.includes(p.machineId) : false;
              const addon = splitCsv(p.addonPorts).map(Number).filter((n) => !isNaN(n));
              const allPorts = [p.port, ...addon].filter(Boolean) as number[];
              const techs = splitCsv(p.techStack);
              const tags = splitCsv(p.tags);
              const days = ageDays(p);
              const isSel = selected.has(p.id);
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--b1)', background: isSel ? 'rgba(124,110,255,.08)' : 'transparent' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <input type="checkbox" checked={isSel} onChange={() => toggleRow(p.id)} aria-label={`Select ${p.name}`} />
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span className={`status-chip ${cls}`}>
                      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
                      {label}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <button
                      onClick={() => router.push(`/projects/${p.id}`)}
                      className="text-left font-semibold hover:opacity-80"
                      style={{ color: arch ? 'var(--muted)' : 'var(--txt)', fontSize: 13.5 }}
                    >
                      {p.name}
                    </button>
                  </td>
                  <td className="font-mono tnum" style={{ padding: '8px 12px', color: live ? 'var(--accent)' : 'var(--dim)', whiteSpace: 'nowrap' }}>
                    {allPorts.length ? allPorts.map((n) => `:${n}`).join(' ') : '—'}
                  </td>
                  <td style={{ padding: '8px 12px' }}><span className="pill">{(p.runner || 'npm').toUpperCase()}</span></td>
                  <td style={{ padding: '8px 12px' }}>
                    <div className="flex flex-wrap gap-1">
                      {techs.slice(0, 3).map((t) => <span key={t} className="pill">{t}</span>)}
                      {techs.length > 3 && <span className="pill">+{techs.length - 3}</span>}
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <div className="flex flex-wrap gap-1">
                      {tags.slice(0, 2).map((t) => <span key={t} className="tag-chip">#{t}</span>)}
                      {tags.length > 2 && <span className="tag-chip">+{tags.length - 2}</span>}
                    </div>
                  </td>
                  <td className="font-mono" style={{ padding: '8px 12px', color: 'var(--dim)', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {days === null ? '—' : days === 0 ? 'today' : `${days}d`}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <div className="flex items-center justify-end gap-1">
                      <ProcessControls project={p} onlineMachineIds={onlineMachineIds} size={15} />
                      {p.url && (
                        <a className="btn-icon" title="Open URL" href={p.url} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a>
                      )}
                      {!arch && onTerminal && daemonOnline && (
                        <button className="btn-icon" title="Terminal" onClick={() => onTerminal(p.id)}><SquareTerminal size={15} /></button>
                      )}
                      {!arch && <button className="btn-icon" title="Notes" onClick={() => onOpenNotes(p.id)}><StickyNote size={15} /></button>}
                      {!arch && <button className="btn-icon" title="Todos" onClick={() => onOpenTodos(p.id)}><ListChecks size={15} /></button>}
                      {!arch && <button className="btn-icon" title="Share" onClick={() => onShare(p.id)}><Share2 size={15} /></button>}
                      <button className="btn-icon" title="Edit" onClick={() => onEdit(p.id)}><Pencil size={15} /></button>
                      <button className="btn-icon danger" title="Delete" onClick={() => onDelete(p.id, p.name)}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination total={total} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />

      {selected.size > 0 && (
        <div
          className="glass"
          style={{ position: 'sticky', bottom: 16, zIndex: 20, marginTop: 12, padding: '10px 16px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 30px rgba(0,0,0,.25)' }}
        >
          <span className="font-mono tnum" style={{ fontSize: 13, color: 'var(--txt)' }}>{selected.size} selected</span>
          <span className="flex-1" />
          <button className="btn-ghost" onClick={() => setSelected(new Set())}>Clear</button>
          <button className="btn-solid btn-red" onClick={() => setConfirmOpen(true)}><Trash size={15} /> Delete selected</button>
        </div>
      )}

      <BulkDeleteModal
        open={confirmOpen}
        names={selectedNames}
        onClose={() => { if (!deleting) setConfirmOpen(false); }}
        onConfirm={confirmBulkDelete}
      />
    </>
  );
}
