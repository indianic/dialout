'use client';

import { useState } from 'react';
import { ProjectTodo } from '@/types';
import { useToast } from './Toast';
import { Plus, Square, CheckSquare, Flag, Archive, Trash2, RotateCcw } from 'lucide-react';

interface DrawerTodosProps {
  projectId: number;
  todos: ProjectTodo[];
  onReload: () => void;
  isOwner: boolean;
}

const PRIORITY_COLORS = { high: 'var(--offline)', medium: 'var(--static)', low: 'var(--muted)' };
type Priority = 'low' | 'medium' | 'high';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function DrawerTodos({ projectId, todos, onReload, isOwner }: DrawerTodosProps) {
  const { toast } = useToast();
  const [newText, setNewText] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const active = todos.filter((t) => !t.isArchived && !t.isDone);
  const done = todos.filter((t) => !t.isArchived && t.isDone);
  const archived = todos.filter((t) => t.isArchived);

  async function addTodo() {
    if (!newText.trim()) return;
    await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, text: newText.trim(), priority: newPriority }),
    });
    setNewText('');
    toast('Todo added');
    onReload();
  }

  async function toggleDone(id: number, val: boolean) {
    await fetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: val }),
    });
    onReload();
  }

  async function updateText(id: number) {
    if (!editText.trim()) return;
    await fetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: editText.trim() }),
    });
    setEditingId(null);
    onReload();
  }

  async function cyclePriority(id: number, current: string) {
    const order: Priority[] = ['low', 'medium', 'high'];
    const next = order[(order.indexOf(current as Priority) + 1) % 3];
    await fetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: next }),
    });
    onReload();
  }

  async function archiveTodo(id: number, val: boolean) {
    await fetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: val }),
    });
    toast(val ? 'Todo archived' : 'Todo restored');
    onReload();
  }

  async function removeTodo(id: number) {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    toast('Todo deleted');
    onReload();
  }

  function PriorityFlag({ priority, onClick }: { priority: string; onClick?: () => void }) {
    const color = PRIORITY_COLORS[priority as Priority] || PRIORITY_COLORS.medium;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        title={`Priority: ${priority}${onClick ? ' (click to cycle)' : ''}`}
        aria-label={`Priority: ${priority}`}
        className="shrink-0 inline-flex items-center justify-center"
        style={{
          background: 'none', border: 'none', padding: 0,
          color, cursor: onClick ? 'pointer' : 'default',
          transition: 'transform .1s',
        }}
        onMouseOver={(e) => onClick && (e.currentTarget.style.transform = 'scale(1.2)')}
        onMouseOut={(e) => onClick && (e.currentTarget.style.transform = 'scale(1)')}
      >
        <Flag size={14} fill={priority === 'low' ? 'none' : color} />
      </button>
    );
  }

  function renderTodoItem(t: ProjectTodo, isDone: boolean, isArch: boolean) {
    const isEditing = editingId === t.id;

    return (
      <div key={t.id} className="group flex items-center gap-2.5"
        style={{
          padding: '8px 10px', background: 'var(--card)', border: '1px solid var(--b1)',
          borderRadius: 'var(--r-sm)',
          marginBottom: 4, transition: 'background .12s',
          opacity: isArch ? 0.4 : isDone ? 0.55 : 1,
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'var(--card-h)')}
        onMouseOut={(e) => (e.currentTarget.style.background = 'var(--card)')}
      >
        {!isArch && isOwner && (
          <button onClick={() => toggleDone(t.id, !isDone)} className="shrink-0 inline-flex"
            title={isDone ? 'Mark as not done' : 'Mark as done'} aria-label={isDone ? 'Mark as not done' : 'Mark as done'}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: isDone ? 'var(--accent)' : 'var(--muted)' }}>
            {isDone ? <CheckSquare size={16} /> : <Square size={16} />}
          </button>
        )}
        {!isArch && !isOwner && (
          <span className="shrink-0 inline-flex" style={{ color: isDone ? 'var(--dim)' : 'var(--b3)' }}>
            {isDone ? <CheckSquare size={16} /> : <Square size={16} />}
          </span>
        )}

        <PriorityFlag priority={t.priority} onClick={isOwner && !isDone && !isArch ? () => cyclePriority(t.id, t.priority) : undefined} />

        <div className="flex-1 min-w-0">
          {isOwner && isEditing ? (
            <input
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') updateText(t.id); if (e.key === 'Escape') setEditingId(null); }}
              onBlur={() => updateText(t.id)}
              className="bg-transparent outline-none w-full"
              style={{ fontSize: 13, color: 'var(--txt)' }}
            />
          ) : (
            <span
              className={isOwner ? 'cursor-pointer' : ''}
              onClick={() => { if (isOwner && !isDone && !isArch) { setEditingId(t.id); setEditText(t.text); } }}
              style={{
                fontSize: 13, color: isDone ? 'var(--dim)' : 'var(--txt)',
                textDecoration: isDone ? 'line-through' : 'none',
                display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {t.text}
            </span>
          )}
        </div>

        <span className="font-mono tnum shrink-0 hidden group-hover:inline" style={{ fontSize: 11, color: 'var(--dim)' }}>
          {timeAgo(t.updatedAt || t.createdAt)}
        </span>

        {isOwner && (
        <div className="flex gap-0.5 shrink-0">
          {isArch ? (
            <button className="btn-icon opacity-0 group-hover:opacity-100" onClick={() => archiveTodo(t.id, false)}
              title="Restore" aria-label="Restore"><RotateCcw size={14} /></button>
          ) : (
            <>
              <button className="btn-icon opacity-0 group-hover:opacity-100" onClick={() => archiveTodo(t.id, true)}
                title="Archive" aria-label="Archive"><Archive size={14} /></button>
              <button className="btn-icon danger opacity-0 group-hover:opacity-100" onClick={() => removeTodo(t.id)}
                title="Delete" aria-label="Delete"><Trash2 size={14} /></button>
            </>
          )}
        </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Add todo — owner only */}
      {isOwner && <div className="flex items-center gap-2 mb-3" style={{ background: 'var(--inp-bg)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', padding: '6px 10px' }}>
        <input
          type="text"
          placeholder="Add a todo..."
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTodo()}
          className="bg-transparent outline-none flex-1"
          style={{ fontSize: 13, color: 'var(--txt)' }}
        />
        <div className="flex gap-1 items-center">
          {(['low', 'medium', 'high'] as Priority[]).map((p) => {
            const selected = newPriority === p;
            return (
              <button key={p} onClick={() => setNewPriority(p)} title={`Priority: ${p}`} aria-label={`Priority: ${p}`}
                aria-pressed={selected}
                className="inline-flex items-center justify-center"
                style={{
                  width: 24, height: 24, borderRadius: 'var(--r-sm)', cursor: 'pointer',
                  color: selected ? '#fff' : PRIORITY_COLORS[p],
                  background: selected ? PRIORITY_COLORS[p] : 'transparent',
                  border: `1px solid ${selected ? PRIORITY_COLORS[p] : 'var(--b2)'}`,
                  transition: 'all .12s',
                }}>
                <Flag size={13} fill={selected ? '#fff' : (p === 'low' ? 'none' : PRIORITY_COLORS[p])} />
              </button>
            );
          })}
        </div>
        <button className="btn-grad inline-flex items-center gap-1.5" onClick={addTodo}>
          <Plus size={14} /> Add
        </button>
      </div>}

      {/* Active todos */}
      {active.length === 0 && done.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-10" style={{ color: 'var(--dim)' }}>
          <CheckSquare size={20} />
          <span style={{ fontSize: 13 }}>No todos yet</span>
        </div>
      )}
      {active.map((t) => renderTodoItem(t, false, false))}

      {/* Done section */}
      {done.length > 0 && (
        <>
          <div className="flex items-center gap-2 my-3">
            <div style={{ flex: 1, height: 1, background: 'var(--b1)' }} />
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              <span className="font-mono tnum">{done.length}</span> done
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--b1)' }} />
          </div>
          {done.map((t) => renderTodoItem(t, true, false))}
        </>
      )}

      {/* Archived toggle */}
      {archived.length > 0 && (
        <div className="mt-4">
          <button className="btn-ghost w-full inline-flex items-center justify-center gap-1.5" onClick={() => setShowArchived(!showArchived)}>
            <Archive size={14} />
            {showArchived ? 'Hide' : 'Show'} {archived.length} archived
          </button>
          {showArchived && <div className="mt-2">{archived.map((t) => renderTodoItem(t, t.isDone, true))}</div>}
        </div>
      )}
    </div>
  );
}
