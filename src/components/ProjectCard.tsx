'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Globe, ExternalLink, SquareTerminal, StickyNote, ListChecks,
  Share2, Pencil, Trash2, Server,
} from 'lucide-react';
import { Project } from '@/types';
import ProcessControls from './ProcessControls';

interface ProjectCardProps {
  project: Project;
  index: number;
  onEdit: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  onOpenNotes: (id: number) => void;
  onOpenTodos: (id: number) => void;
  onShare?: (id: number) => void;
  onTerminal?: (id: number) => void;
  onlineMachineIds?: number[];
}

function splitCsv(s: string) {
  return (s || '').split(',').map((x) => x.trim()).filter(Boolean);
}

export default function ProjectCard({
  project: p, index, onEdit, onDelete, onOpenNotes, onOpenTodos, onShare, onTerminal, onlineMachineIds = [],
}: ProjectCardProps) {
  const router = useRouter();
  const [offline, setOffline] = useState(false);

  const live = p.isRunning;
  const arch = p.status === 'archived';
  const isStatic = !p.port && !!p.url;
  const daemonOnline = p.machineId ? onlineMachineIds.includes(p.machineId) : false;
  const addonPorts = splitCsv(p.addonPorts).map(Number).filter((n) => !isNaN(n));
  const allPorts = [p.port, ...addonPorts].filter(Boolean) as number[];
  const techs = splitCsv(p.techStack);
  const tags = splitCsv(p.tags);
  const days = p.startDate ? Math.max(0, Math.floor((Date.now() - new Date(p.startDate).getTime()) / 86400000)) : null;

  const cls = arch ? 'is-arch' : isStatic ? (live ? 'is-live' : 'is-static') : live ? 'is-live' : 'is-dead';
  const statusClass = arch ? 'arch' : isStatic ? (live ? 'live' : 'static') : live ? 'live' : 'offline';
  const statusLabel = arch ? 'Archived' : isStatic ? (live ? 'Live' : 'Static') : live ? 'Live' : 'Offline';

  function flashOffline(e: React.MouseEvent) {
    e.stopPropagation();
    setOffline(true);
    setTimeout(() => setOffline(false), 2400);
  }

  return (
    <div
      className={`p-card ${cls} flex flex-col p-5`}
      style={{ minHeight: 210, animation: 'cardIn .35s ease both', animationDelay: `${Math.min(index, 12) * 28}ms` }}
    >
      {/* Top: status + daemon */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className={`status-chip ${statusClass}`}>
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
            {statusLabel}
          </span>
          <span className="pill">{(p.runner || 'npm').toUpperCase()}</span>
        </div>
        {!arch && p.machineId && (
          <span className="flex items-center gap-1.5" title={daemonOnline ? 'Agent online' : 'Agent offline'}>
            <Server size={12} style={{ color: daemonOnline ? 'var(--live)' : 'var(--dim)' }} />
            <span className="font-mono text-[9.5px]" style={{ color: daemonOnline ? 'var(--live)' : 'var(--dim)', letterSpacing: '.06em' }}>
              {daemonOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </span>
        )}
      </div>

      {/* Name (click → detail) */}
      <button
        onClick={() => router.push(`/projects/${p.id}`)}
        className="text-left font-semibold transition-colors hover:opacity-80"
        style={{ fontSize: 17, color: arch ? 'var(--muted)' : 'var(--txt)', lineHeight: 1.25 }}
      >
        {p.name}
      </button>

      {/* Ports + URL */}
      <div className="flex items-center gap-2.5 flex-wrap mt-1.5">
        {allPorts.map((port, i) => (
          <span key={`${port}-${i}`} className="font-mono tnum" style={{ fontSize: i === 0 ? 14 : 11, fontWeight: i === 0 ? 700 : 500, color: live ? (i === 0 ? 'var(--accent)' : 'var(--muted)') : 'var(--dim)' }}>
            :{port}
          </span>
        ))}
        {p.url && (
          <a href={p.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="font-mono url-clip hover:underline" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {p.url.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>

      {/* Description */}
      {p.description && (
        <p className="mt-2.5" style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {p.description}
        </p>
      )}

      {/* Tech */}
      {techs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {techs.slice(0, 5).map((t) => <span key={t} className="pill">{t}</span>)}
          {techs.length > 5 && <span className="pill">+{techs.length - 5}</span>}
        </div>
      )}

      <div className="flex-1" />

      {/* Tags + age */}
      {(tags.length > 0 || days !== null) && (
        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="flex flex-wrap gap-1.5 min-w-0">
            {tags.slice(0, 3).map((t) => <span key={t} className="tag-chip">#{t}</span>)}
          </div>
          {days !== null && (
            <span className="font-mono text-[10.5px] shrink-0" style={{ color: 'var(--dim)' }}>
              {days === 0 ? 'today' : `${days}d ago`}
            </span>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="card-acts flex items-center gap-1.5 mt-4 pt-3" style={{ borderTop: '1px solid var(--b1)' }}>
        {/* Live preview (tunnel) */}
        {!arch && p.machineId && ((live && p.port) || isStatic) && (
          daemonOnline ? (
            <a className="btn-icon" title="Live preview" onClick={(e) => e.stopPropagation()}
              href={isStatic ? `/ws/tunnel/${p.machineId}/site/${btoa(p.url)}/` : `/ws/tunnel/${p.machineId}/${p.port}/`}
              target="_blank" rel="noreferrer"><Globe size={16} /></a>
          ) : (
            <button className="btn-icon" title="Agent offline — preview unavailable" onClick={flashOffline}><Globe size={16} /></button>
          )
        )}
        {/* Open URL */}
        {p.url && (
          <a className="btn-icon" title="Open in browser" href={p.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><ExternalLink size={16} /></a>
        )}
        {/* Terminal */}
        {!arch && onTerminal && (
          daemonOnline ? (
            <button className="btn-icon" title="Terminal" onClick={(e) => { e.stopPropagation(); onTerminal(p.id); }}><SquareTerminal size={16} /></button>
          ) : (
            <button className="btn-icon" title="Agent offline — terminal unavailable" onClick={flashOffline}><SquareTerminal size={16} /></button>
          )
        )}
        {!arch && (
          <>
            <ProcessControls project={p} onlineMachineIds={onlineMachineIds} size={16} />
            <button className="btn-icon" title="Notes" onClick={(e) => { e.stopPropagation(); onOpenNotes(p.id); }}><StickyNote size={16} /></button>
            <button className="btn-icon" title="Todos" onClick={(e) => { e.stopPropagation(); onOpenTodos(p.id); }}><ListChecks size={16} /></button>
          </>
        )}

        <span className="flex-1" />

        {onShare && !arch && (
          <button className="btn-icon" title="Share" onClick={(e) => { e.stopPropagation(); onShare(p.id); }}><Share2 size={16} /></button>
        )}
        <button className="btn-icon" title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(p.id); }}><Pencil size={16} /></button>
        <button className="btn-icon danger" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(p.id, p.name); }}><Trash2 size={16} /></button>
      </div>

      {offline && (
        <div className="absolute left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg font-mono text-[10px]"
          style={{ bottom: 10, background: 'rgba(244,63,94,.14)', border: '1px solid rgba(244,63,94,.4)', color: 'var(--offline)', whiteSpace: 'nowrap', zIndex: 10 }}>
          Agent offline — start it on this machine
        </div>
      )}
    </div>
  );
}
