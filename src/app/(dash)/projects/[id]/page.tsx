'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ExternalLink, SquareTerminal, Pencil, Share2, Trash2,
  StickyNote, ListChecks, MessageSquare, Globe, KeyRound,
} from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { ProjectNote, ProjectTodo } from '@/types';
import DrawerNotes from '@/components/DrawerNotes';
import DrawerTodos from '@/components/DrawerTodos';
import DrawerComments from '@/components/DrawerComments';
import DrawerCredentials from '@/components/DrawerCredentials';

type Tab = 'notes' | 'todos' | 'comments' | 'credentials';
const TABS: { key: Tab; label: string; icon: typeof StickyNote }[] = [
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'todos', label: 'Todos', icon: ListChecks },
  { key: 'comments', label: 'Comments', icon: MessageSquare },
  { key: 'credentials', label: 'Credentials', icon: KeyRound },
];

function splitCsv(s: string) { return (s || '').split(',').map((x) => x.trim()).filter(Boolean); }

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sp = useSearchParams();
  const id = Number(params.id);
  const { session, getProject, onlineMachineIds, openEdit, openShare, openDelete, openTerminal } = useDashboard();

  const tab = (sp.get('tab') as Tab) || 'notes';
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [todos, setTodos] = useState<ProjectTodo[]>([]);
  const [commentCount, setCommentCount] = useState(0);

  const project = getProject(id);

  const loadData = useCallback(async () => {
    if (!id) return;
    const [n, t, c] = await Promise.all([
      fetch(`/api/notes?projectId=${id}`),
      fetch(`/api/todos?projectId=${id}`),
      fetch(`/api/comments?projectId=${id}`),
    ]);
    if (n.ok) setNotes(await n.json());
    if (t.ok) setTodos(await t.json());
    if (c.ok) setCommentCount((await c.json()).length);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  function setTab(next: Tab) { router.replace(`/projects/${id}?tab=${next}`, { scroll: false }); }

  if (!project) {
    return (
      <div className="empty-state">
        <div className="font-display grad-text" style={{ fontSize: 28 }}>Project not found</div>
        <p className="text-[13px] mt-2" style={{ color: 'var(--muted)' }}>It may have been deleted or isn’t on this machine.</p>
        <button className="btn-ghost mt-5" onClick={() => router.push('/projects')}><ArrowLeft size={16} /> Back to projects</button>
      </div>
    );
  }

  const isOwner = !!(session && project.userId === session.userId);
  const live = project.isRunning;
  const arch = project.status === 'archived';
  const isStatic = !project.port && !!project.url;
  const daemonOnline = project.machineId ? onlineMachineIds.includes(project.machineId) : false;
  const techs = splitCsv(project.techStack);
  const tags = splitCsv(project.tags);
  const notesCount = notes.filter((n) => !n.isArchived).length;
  const todosCount = todos.filter((t) => !t.isArchived && !t.isDone).length;
  const counts: Record<Tab, number> = { notes: notesCount, todos: todosCount, comments: commentCount, credentials: 0 };

  const statusClass = arch ? 'arch' : isStatic ? (live ? 'live' : 'static') : live ? 'live' : 'offline';
  const statusLabel = arch ? 'Archived' : isStatic ? (live ? 'Live' : 'Static') : live ? 'Live' : 'Offline';

  return (
    <div>
      <button className="btn-ghost mb-5" onClick={() => router.push('/projects')}><ArrowLeft size={16} /> Projects</button>

      {/* Project header card */}
      <div className="card-v2 p-5 sm:p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display" style={{ fontSize: 26, lineHeight: 1.1, color: 'var(--txt)' }}>{project.name}</h1>
              <span className={`status-chip ${statusClass}`}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'currentColor' }} />
                {statusLabel}
              </span>
              <span className="pill">{(project.runner || 'npm').toUpperCase()}</span>
            </div>
            <div className="flex items-center gap-3 mt-3 flex-wrap font-mono text-[13px]" style={{ color: 'var(--muted)' }}>
              {project.port && <span className="tnum" style={{ color: 'var(--accent)', fontWeight: 600 }}>:{project.port}</span>}
              {project.url && (
                <a href={project.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline" style={{ color: 'var(--muted)' }}>
                  <Globe size={13} /> {project.url}
                </a>
              )}
            </div>
            {project.description && <p className="text-[13.5px] mt-3" style={{ color: 'var(--muted)', maxWidth: '65ch', lineHeight: 1.6 }}>{project.description}</p>}
            {techs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {techs.map((t) => <span key={t} className="pill">{t}</span>)}
              </div>
            )}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((t) => <span key={t} className="tag-chip">#{t}</span>)}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {project.url && (
              <a href={project.url} target="_blank" rel="noreferrer" className="btn-icon" title="Open in browser"><ExternalLink size={16} /></a>
            )}
            {daemonOnline && !arch && (
              <button className="btn-icon" title="Open terminal" onClick={() => openTerminal(project)}><SquareTerminal size={16} /></button>
            )}
            {isOwner && (
              <>
                <button className="btn-icon" title="Edit" onClick={() => openEdit(project.id)}><Pencil size={16} /></button>
                <button className="btn-icon" title="Share" onClick={() => openShare(project.id)}><Share2 size={16} /></button>
                <button className="btn-icon danger" title="Delete" onClick={() => openDelete(project.id)}><Trash2 size={16} /></button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 glass rounded-full p-1 mb-5 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} className={`ftab ${tab === key ? 'on' : ''}`} onClick={() => setTab(key)}>
            <Icon size={15} /> {label}
            {counts[key] > 0 && <span className="font-mono tnum" style={{ fontSize: 11, color: 'var(--dim)' }}>{counts[key]}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card-v2 p-5">
        {tab === 'notes' ? (
          <DrawerNotes projectId={project.id} notes={notes} onReload={loadData} isOwner={isOwner} />
        ) : tab === 'todos' ? (
          <DrawerTodos projectId={project.id} todos={todos} onReload={loadData} isOwner={isOwner} />
        ) : tab === 'credentials' ? (
          <DrawerCredentials projectId={project.id} isOwner={isOwner} />
        ) : (
          <DrawerComments projectId={project.id} currentUserId={session?.userId || 0} />
        )}
      </div>
    </div>
  );
}
