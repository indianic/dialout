'use client';

import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { ProjectNote } from '@/types';
import { useToast } from './Toast';
import {
  Plus, Pencil, Trash2, Archive, RotateCcw, X, Save, Eye, Code,
  Bold, Italic, Heading, List, Link as LinkIcon, Braces,
} from 'lucide-react';

interface DrawerNotesProps {
  projectId: number;
  notes: ProjectNote[];
  onReload: () => void;
  isOwner: boolean;
}

const TAG_COLORS: Record<string, string> = {
  bug: '#ef4444', fix: '#ef4444',
  idea: '#a78bfa', feature: '#a78bfa',
  meeting: '#60a5fa', call: '#60a5fa',
  urgent: '#f59e0b', important: '#f59e0b',
  docs: '#34d399', documentation: '#34d399',
  research: '#38bdf8',
  design: '#f472b6',
};

function getTagColor(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] || 'var(--muted)';
}

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

function splitTags(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Markdown Renderer ──────────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let inCodeBlock = false;
  let codeContent = '';
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block fence
    if (line.trimStart().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.trimStart().slice(3).trim();
        codeContent = '';
        continue;
      } else {
        const escaped = escHtml(codeContent.replace(/\n$/, ''));
        const id = `cb-${Date.now()}-${i}`;
        html.push(
          `<div class="md-codeblock" style="position:relative; margin:8px 0;">` +
          `<div style="display:flex; align-items:center; justify-content:space-between; padding:4px 10px; background:var(--b1); border:1px solid var(--b2); border-bottom:none;">` +
          `<span class="font-mono" style="font-size:8px; color:var(--dim); letter-spacing:.1em; text-transform:uppercase;">${escHtml(codeLang) || 'CODE'}</span>` +
          `<button onclick="(function(){var b=document.getElementById('${id}');navigator.clipboard.writeText(b.textContent);var t=this;t.textContent='COPIED';setTimeout(function(){t.textContent='COPY'},1500)}).call(this)" ` +
          `class="font-mono" style="font-size:8px; color:var(--dim); background:none; border:1px solid var(--b2); padding:1px 7px; cursor:pointer; letter-spacing:.08em; transition:all .12s;" ` +
          `onmouseover="this.style.background='var(--accent)';this.style.color='var(--card)';this.style.borderColor='var(--accent)'" ` +
          `onmouseout="this.style.background='none';this.style.color='var(--dim)';this.style.borderColor='var(--b2)'" ` +
          `>COPY</button>` +
          `</div>` +
          `<pre id="${id}" class="font-mono" style="margin:0; padding:10px 12px; background:var(--inp-bg); border:1px solid var(--b2); overflow-x:auto; font-size:11px; line-height:1.6; color:var(--txt);">${escaped}</pre>` +
          `</div>`
        );
        inCodeBlock = false;
        codeContent = '';
        codeLang = '';
        continue;
      }
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      html.push(`<div style="font-weight:700; font-size:13px; color:var(--txt); margin:12px 0 4px;">${inlineFormat(escHtml(line.slice(4)))}</div>`);
      continue;
    }
    if (line.startsWith('## ')) {
      html.push(`<div style="font-weight:700; font-size:14px; color:var(--txt); margin:14px 0 4px;">${inlineFormat(escHtml(line.slice(3)))}</div>`);
      continue;
    }
    if (line.startsWith('# ')) {
      html.push(`<div style="font-weight:700; font-size:16px; color:var(--txt); margin:16px 0 6px;">${inlineFormat(escHtml(line.slice(2)))}</div>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      html.push(`<hr style="border:none; border-top:1px solid var(--b1); margin:10px 0;" />`);
      continue;
    }

    // List items
    if (/^[\s]*[-*]\s/.test(line)) {
      const indent = line.match(/^(\s*)/)?.[1].length || 0;
      const text = line.replace(/^[\s]*[-*]\s/, '');
      html.push(`<div style="padding-left:${8 + indent * 8}px; margin:2px 0; line-height:1.6; font-size:12px; color:var(--txt);">` +
        `<span style="color:var(--dim); margin-right:6px;">&#8226;</span>${inlineFormat(escHtml(text))}</div>`);
      continue;
    }

    // Numbered list
    if (/^[\s]*\d+\.\s/.test(line)) {
      const match = line.match(/^([\s]*)(\d+)\.\s(.*)/);
      if (match) {
        const indent = match[1].length;
        html.push(`<div style="padding-left:${8 + indent * 8}px; margin:2px 0; line-height:1.6; font-size:12px; color:var(--txt);">` +
          `<span class="font-mono" style="color:var(--dim); margin-right:6px; font-size:10px;">${match[2]}.</span>${inlineFormat(escHtml(match[3]))}</div>`);
        continue;
      }
    }

    // Empty line
    if (!line.trim()) {
      html.push(`<div style="height:8px;"></div>`);
      continue;
    }

    // Paragraph
    html.push(`<div style="line-height:1.6; font-size:12px; color:var(--txt); margin:2px 0;">${inlineFormat(escHtml(line))}</div>`);
  }

  // Close unclosed code block
  if (inCodeBlock && codeContent) {
    html.push(`<pre class="font-mono" style="margin:8px 0; padding:10px 12px; background:var(--inp-bg); border:1px solid var(--b2); overflow-x:auto; font-size:11px; line-height:1.6; color:var(--txt);">${escHtml(codeContent)}</pre>`);
  }

  return html.join('');
}

function inlineFormat(text: string): string {
  // Bold **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;">$1</strong>');
  // Italic *text*
  text = text.replace(/\*(.+?)\*/g, '<em style="font-style:italic; color:var(--muted);">$1</em>');
  // Inline code `text`
  text = text.replace(/`([^`]+)`/g,
    '<code class="font-mono" style="font-size:10.5px; padding:1px 5px; background:var(--b1); border:1px solid var(--b2); color:var(--txt);">$1</code>');
  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" style="color:var(--accent); text-decoration:underline; text-underline-offset:2px;">$1</a>');
  return text;
}

// ── Component ──────────────────────────────────────────────────────────────

function ToolbarBtn({ icon, title, onClick, active }: { icon: ReactNode; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" className="btn-icon" title={title} aria-label={title} onClick={onClick}
      style={{
        background: active ? 'var(--accent)' : undefined,
        color: active ? '#fff' : undefined,
        borderColor: active ? 'var(--accent)' : undefined,
      }}>
      {icon}
    </button>
  );
}

export default function DrawerNotes({ projectId, notes, onReload, isOwner }: DrawerNotesProps) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const active = notes.filter((n) => !n.isArchived);
  const archived = notes.filter((n) => n.isArchived);

  useEffect(() => {
    if (editingId !== null && !showPreview) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          autoGrow(textareaRef.current);
        }
      }, 50);
    }
  }, [editingId, showPreview]);

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 400) + 'px';
  }

  function insertFormat(prefix: string, suffix: string = '') {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = editContent.substring(start, end);
    const replacement = prefix + (selected || 'text') + (suffix || prefix);
    const newContent = editContent.substring(0, start) + replacement + editContent.substring(end);
    setEditContent(newContent);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + prefix.length;
      ta.selectionEnd = start + prefix.length + (selected || 'text').length;
    }, 10);
  }

  function insertCodeBlock() {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const selected = editContent.substring(ta.selectionStart, ta.selectionEnd);
    const block = '\n```\n' + (selected || 'code here') + '\n```\n';
    const newContent = editContent.substring(0, start) + block + editContent.substring(ta.selectionEnd);
    setEditContent(newContent);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + 5;
      ta.selectionEnd = start + 5 + (selected || 'code here').length;
    }, 10);
  }

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  }, [toast]);

  function startNew() {
    setEditingId('new');
    setEditContent('');
    setEditTags('');
    setEditTitle('');
    setShowPreview(false);
    setViewingId(null);
  }

  function startEdit(note: ProjectNote) {
    setEditingId(note.id);
    setEditContent(note.content);
    setEditTags(note.tags);
    setEditTitle(note.title);
    setShowPreview(false);
    setViewingId(null);
  }

  function viewNote(note: ProjectNote) {
    if (viewingId === note.id) {
      setViewingId(null);
    } else {
      setViewingId(note.id);
      setEditingId(null);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setShowPreview(false);
  }

  async function save() {
    if (!editContent.trim() && editingId === 'new') { toast('Note is empty'); return; }

    if (editingId === 'new') {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, content: editContent, tags: editTags, title: editTitle || undefined }),
      });
      toast('Note added');
    } else {
      await fetch(`/api/notes/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent, tags: editTags, title: editTitle || undefined }),
      });
      toast('Note updated');
    }
    setEditingId(null);
    setShowPreview(false);
    onReload();
  }

  async function archive(id: number, val: boolean) {
    await fetch(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: val }),
    });
    toast(val ? 'Note archived' : 'Note restored');
    if (viewingId === id) setViewingId(null);
    onReload();
  }

  async function remove(id: number) {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    toast('Note deleted');
    if (editingId === id) setEditingId(null);
    if (viewingId === id) setViewingId(null);
    onReload();
  }

  function renderEditor() {
    return (
      <div style={{ background: 'var(--inp-bg)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', marginBottom: 12 }}>
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderBottom: '1px solid var(--b1)' }}>
          <ToolbarBtn icon={<Bold size={14} />} title="Bold" onClick={() => insertFormat('**')} />
          <ToolbarBtn icon={<Italic size={14} />} title="Italic" onClick={() => insertFormat('*')} />
          <ToolbarBtn icon={<Heading size={14} />} title="Heading" onClick={() => insertFormat('## ', '')} />
          <ToolbarBtn icon={<Code size={14} />} title="Inline code" onClick={() => insertFormat('`')} />
          <ToolbarBtn icon={<Braces size={14} />} title="Code block" onClick={insertCodeBlock} />
          <ToolbarBtn icon={<List size={14} />} title="List" onClick={() => insertFormat('- ', '')} />
          <ToolbarBtn icon={<LinkIcon size={14} />} title="Link" onClick={() => insertFormat('[', '](url)')} />
          <div style={{ width: 1, height: 16, background: 'var(--b1)', margin: '0 2px' }} />
          <ToolbarBtn icon={showPreview ? <Pencil size={14} /> : <Eye size={14} />} title={showPreview ? 'Edit' : 'Preview'} onClick={() => setShowPreview(!showPreview)} active={showPreview} />
          <div className="flex-1" />
          <input
            type="text"
            placeholder="Title (optional)"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="bg-transparent outline-none"
            style={{ fontSize: 13, color: 'var(--muted)', width: 130, textAlign: 'right' }}
          />
        </div>

        {/* Editor or Preview */}
        {showPreview ? (
          <div className="px-3 py-3" style={{ minHeight: 80, maxHeight: 400, overflowY: 'auto' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }} />
        ) : (
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => { setEditContent(e.target.value); autoGrow(e.target); }}
            placeholder="Write your note in markdown..."
            className="font-mono w-full bg-transparent outline-none resize-none px-3 py-2.5"
            style={{ fontSize: 12.5, color: 'var(--txt)', minHeight: 80, maxHeight: 400, lineHeight: 1.6 }}
          />
        )}

        {/* Tags input */}
        <div className="px-3 py-2.5" style={{ borderTop: '1px solid var(--b1)' }}>
          <div className="flex items-center gap-2">
            <span className="label" style={{ margin: 0 }}>Tags</span>
            <input
              type="text"
              placeholder="bug, idea, urgent"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              className="bg-transparent outline-none flex-1"
              style={{ fontSize: 13, color: 'var(--muted)' }}
            />
          </div>
          {editTags && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {splitTags(editTags).map((t) => (
                <span key={t} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 'var(--r-sm)',
                  background: getTagColor(t) + '18', color: getTagColor(t), border: `1px solid ${getTagColor(t)}33`,
                }}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-3 py-2.5" style={{ borderTop: '1px solid var(--b1)' }}>
          <div className="flex gap-2">
            {editingId !== 'new' && (
              <>
                <button className="btn-ghost inline-flex items-center gap-1.5" onClick={() => archive(editingId as number, true)}>
                  <Archive size={14} /> Archive
                </button>
                <button className="btn-icon danger" title="Delete note" aria-label="Delete note" onClick={() => remove(editingId as number)}>
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost inline-flex items-center gap-1.5" onClick={cancelEdit}>
              <X size={14} /> Cancel
            </button>
            <button className="btn-grad inline-flex items-center gap-1.5" onClick={save}>
              <Save size={14} /> Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderNoteView(note: ProjectNote) {
    const tags = splitTags(note.tags);
    return (
      <div key={`view-${note.id}`} style={{ background: 'var(--inp-bg)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', marginBottom: 6 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid var(--b1)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display font-bold truncate" style={{ fontSize: 14, color: 'var(--txt)' }}>
              {note.title || 'Untitled'}
            </span>
            {tags.map((t) => (
              <span key={t} className="shrink-0" style={{
                fontSize: 11, padding: '1px 7px', borderRadius: 'var(--r-sm)',
                background: getTagColor(t) + '18', color: getTagColor(t), border: `1px solid ${getTagColor(t)}33`,
              }}>{t}</span>
            ))}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isOwner && (
              <button className="btn-icon" onClick={() => startEdit(note)} title="Edit" aria-label="Edit"><Pencil size={14} /></button>
            )}
            <button className="btn-icon" onClick={() => setViewingId(null)} title="Close" aria-label="Close"><X size={14} /></button>
          </div>
        </div>
        {/* Rendered markdown */}
        <div className="px-3 py-3" style={{ maxHeight: 500, overflowY: 'auto' }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(note.content) }} />
        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2" style={{ borderTop: '1px solid var(--b1)' }}>
          <span className="font-mono tnum" style={{ fontSize: 11, color: 'var(--dim)' }}>{timeAgo(note.updatedAt || note.createdAt)}</span>
          {isOwner && (
            <div className="flex gap-2">
              <button className="btn-ghost inline-flex items-center gap-1.5" onClick={() => archive(note.id, true)}>
                <Archive size={14} /> Archive
              </button>
              <button className="btn-icon danger" title="Delete" aria-label="Delete" onClick={() => remove(note.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderNoteItem(note: ProjectNote, isArch: boolean) {
    const tags = splitTags(note.tags);
    const preview = note.content.split('\n').find((l) => l.trim()) || '';

    if (isOwner && editingId === note.id) return <div key={note.id}>{renderEditor()}</div>;
    if (viewingId === note.id) return renderNoteView(note);

    return (
      <div key={note.id}
        className="group cursor-pointer"
        onClick={() => !isArch ? viewNote(note) : undefined}
        style={{
          padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--b1)',
          borderRadius: 'var(--r)',
          marginBottom: 6, transition: 'background .12s, border-color .12s',
          opacity: isArch ? 0.5 : 1,
        }}
        onMouseOver={(e) => { e.currentTarget.style.background = 'var(--card-h)'; e.currentTarget.style.borderColor = 'var(--b2)'; }}
        onMouseOut={(e) => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.borderColor = 'var(--b1)'; }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)', marginBottom: 3, lineHeight: 1.3 }}>
              {note.title || 'Untitled'}
            </div>
            <div style={{
              fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.5,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {preview.replace(/^#+\s*/, '').substring(0, 60)}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isOwner && isArch && (
              <button className="btn-icon opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); archive(note.id, false); }}
                title="Restore" aria-label="Restore"><RotateCcw size={14} /></button>
            )}
            {isOwner && !isArch && (
              <>
                <button className="btn-icon opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); startEdit(note); }}
                  title="Edit" aria-label="Edit"><Pencil size={14} /></button>
                <button className="btn-icon danger opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); remove(note.id); }}
                  title="Delete" aria-label="Delete"><Trash2 size={14} /></button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} style={{
                fontSize: 11, padding: '1px 7px', borderRadius: 'var(--r-sm)',
                background: getTagColor(t) + '18', color: getTagColor(t), border: `1px solid ${getTagColor(t)}33`,
              }}>
                {t}
              </span>
            ))}
          </div>
          <span className="font-mono tnum" style={{ fontSize: 11, color: 'var(--dim)' }}>{timeAgo(note.updatedAt || note.createdAt)}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Add note button — owner only */}
      {isOwner && editingId !== 'new' && (
        <button className="btn-ghost w-full mb-3 flex items-center justify-center gap-1.5"
          onClick={startNew}>
          <Plus size={14} /> Add note
        </button>
      )}

      {isOwner && editingId === 'new' && renderEditor()}

      {/* Active notes */}
      {active.length === 0 && editingId !== 'new' && (
        <div className="flex flex-col items-center justify-center gap-2 py-10" style={{ color: 'var(--dim)' }}>
          <Pencil size={20} />
          <span style={{ fontSize: 13 }}>No notes yet</span>
        </div>
      )}
      {active.map((n) => renderNoteItem(n, false))}

      {/* Archived toggle */}
      {archived.length > 0 && (
        <div className="mt-4">
          <button className="btn-ghost w-full inline-flex items-center justify-center gap-1.5" onClick={() => setShowArchived(!showArchived)}>
            <Archive size={14} />
            {showArchived ? 'Hide' : 'Show'} {archived.length} archived
          </button>
          {showArchived && (
            <div className="mt-2" style={{ opacity: 0.6 }}>
              {archived.map((n) => renderNoteItem(n, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
