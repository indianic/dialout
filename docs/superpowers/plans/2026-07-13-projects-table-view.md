# Projects Table View, Faceted Filter & Bulk Delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sortable table view, Tech/Tags filter facets, and table-only bulk select & delete to the `/projects` listing, leaving the card view unchanged.

**Architecture:** `projects/page.tsx` gains a persisted Card/Table toggle and two facet dropdowns, composes all filters, and renders either the existing `ProjectGrid` (card) or a new `ProjectTable`. `ProjectTable` handles sorting, pagination, checkbox selection, and a confirm-modal-driven bulk delete backed by a new machine-scoped `DELETE /api/projects` endpoint exposed through a `deleteProjects(ids)` context method.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Drizzle ORM (postgres.js), Tailwind 3, lucide-react icons.

## Global Constraints

- The web app (`src/`) has **no unit-test harness** (jest/vitest). Only `packages/devdash-agent` has `node:test` tests. Per-task verification is `npx tsc --noEmit` (type check) plus manual browser verification; the final task runs `npm run build`. Do **not** add a test framework.
- All new client components start with `'use client';`.
- Reuse existing CSS utility classes: `glass`, `status-chip` (`live`/`offline`/`static`/`arch`), `pill`, `tag-chip`, `btn-icon`, `btn-icon danger`, `btn-ghost`, `btn-solid btn-red`, `ftab` (`on`), `inp`, `font-mono`, `tnum`, `overlay`, `modal-box`. Do not invent new global CSS.
- CSS variables in use: `--txt`, `--muted`, `--dim`, `--accent`, `--offline`, `--live`, `--b1`, `--b2`, `--grad`.
- Card view (`ProjectGrid` / `ProjectCard`) must not change.
- All projects returned by `GET /api/projects` are scoped to `session.machineId`; bulk delete must stay machine-scoped.
- Commit after each task with a `feat:`/`docs:` message and the repo's standard trailers.

---

### Task 1: Bulk-delete backend endpoint + context method

**Files:**
- Modify: `src/app/api/projects/route.ts` (add `DELETE` handler; extend imports)
- Modify: `src/components/dashboard/DashboardContext.tsx` (add `deleteProjects`; extend interface + value)

**Interfaces:**
- Produces (HTTP): `DELETE /api/projects` with JSON body `{ ids: number[] }` → `200 { success: true, deleted: number }`, `400 { error }` on empty/invalid ids, `401 { error }` if unauthenticated, `500 { error }` on failure.
- Produces (context): `deleteProjects(ids: number[]): Promise<void>` on `useDashboard()`.

- [ ] **Step 1: Extend imports in `src/app/api/projects/route.ts`**

The top of the file currently reads:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, projectMachines } from '@/lib/schema';
import { asc, eq } from 'drizzle-orm';
import { checkPort } from '@/lib/port-check';
import { getSession } from '@/lib/auth';
import { isMachineOnline, requestPortCheck, requestUrlCheck } from '@/lib/daemon-status';
```

Change the schema import and the drizzle import to:

```ts
import { projects, projectMachines, projectNotes, projectTodos } from '@/lib/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
```

- [ ] **Step 2: Append the `DELETE` handler at the end of `src/app/api/projects/route.ts`**

```ts
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const ids: number[] = Array.isArray(body?.ids)
      ? body.ids.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array of integers' }, { status: 400 });
    }

    // Only delete projects owned by the current machine.
    const owned = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.machineId, session.machineId), inArray(projects.id, ids)));
    const ownedIds = owned.map((p) => p.id);
    if (ownedIds.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    await db.delete(projectNotes).where(inArray(projectNotes.projectId, ownedIds));
    await db.delete(projectTodos).where(inArray(projectTodos.projectId, ownedIds));
    await db.delete(projects).where(inArray(projects.id, ownedIds));

    return NextResponse.json({ success: true, deleted: ownedIds.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Type-check the backend change**

Run: `npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 4: Add `deleteProjects` to the context interface in `src/components/dashboard/DashboardContext.tsx`**

In the `DashboardCtx` interface, immediately after the existing line `deleteProject: (id: number) => Promise<void>;`, add:

```ts
  deleteProjects: (ids: number[]) => Promise<void>;
```

- [ ] **Step 5: Implement `deleteProjects` next to `deleteProject`**

Immediately after the existing `deleteProject` `useCallback` block (the one ending with `}, [reloadProjects, toast]);`), add:

```ts
  const deleteProjects = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    try {
      const r = await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json().catch(() => ({ deleted: ids.length }));
      const n = data.deleted ?? ids.length;
      toast(`Deleted ${n} project${n === 1 ? '' : 's'}`);
      await reloadProjects();
    } catch { toast('Delete failed'); }
  }, [reloadProjects, toast]);
```

- [ ] **Step 6: Expose `deleteProjects` in the context value**

In the `const value: DashboardCtx = { ... }` object, find `deleteProject,` and change it to:

```ts
    deleteProject, deleteProjects,
```

- [ ] **Step 7: Type-check the context change**

Run: `npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/projects/route.ts src/components/dashboard/DashboardContext.tsx
git commit -m "feat(projects): machine-scoped bulk delete endpoint + deleteProjects context

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 2: BulkDeleteModal component

**Files:**
- Create: `src/components/BulkDeleteModal.tsx`

**Interfaces:**
- Produces: default export `BulkDeleteModal` with props `{ open: boolean; names: string[]; onClose: () => void; onConfirm: () => void }`. Renders nothing when `open` is false; Escape key calls `onClose`.

- [ ] **Step 1: Create `src/components/BulkDeleteModal.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';

interface BulkDeleteModalProps {
  open: boolean;
  names: string[];
  onClose: () => void;
  onConfirm: () => void;
}

export default function BulkDeleteModal({ open, names, onClose, onConfirm }: BulkDeleteModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const count = names.length;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 420 }}>
        <div style={{ padding: '30px 28px', textAlign: 'center' }}>
          <span className="grid place-items-center mx-auto rounded-2xl mb-4" style={{ width: 52, height: 52, background: 'rgba(244,63,94,.14)', border: '1px solid rgba(244,63,94,.3)', color: 'var(--offline)' }}>
            <Trash2 size={24} />
          </span>
          <h2 className="font-display" style={{ fontSize: 22, color: 'var(--txt)' }}>
            Delete {count} project{count === 1 ? '' : 's'}?
          </h2>
          <div className="mt-3 mx-auto text-left" style={{ maxWidth: 320, maxHeight: 150, overflowY: 'auto', borderRadius: 10, border: '1px solid var(--b1)', padding: '8px 12px' }}>
            {names.map((n, i) => (
              <span key={i} style={{ display: 'block', fontSize: 12.5, color: 'var(--txt)', lineHeight: 1.7 }}>{n}</span>
            ))}
          </div>
          <p className="mt-3" style={{ fontSize: 12.5, color: 'var(--muted)' }}>This permanently removes them and their notes &amp; todos.</p>
          <div className="flex gap-2.5 justify-center mt-6">
            <button className="btn-ghost" onClick={onClose} style={{ minWidth: 110 }}>Cancel</button>
            <button className="btn-solid btn-red" onClick={onConfirm} style={{ minWidth: 110 }}><Trash2 size={16} /> Delete {count}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/BulkDeleteModal.tsx
git commit -m "feat(projects): BulkDeleteModal confirmation component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 3: ProjectTable component

**Files:**
- Create: `src/components/ProjectTable.tsx`

**Interfaces:**
- Consumes: `Project` from `@/types`; `Pagination` (default export, props `{ total, page, perPage, onPageChange, onPerPageChange }`); `BulkDeleteModal` from Task 2 (`{ open, names, onClose, onConfirm }`).
- Produces: default export `ProjectTable` with props:

```ts
interface ProjectTableProps {
  projects: Project[];              // already filtered by the page
  resetKey: string;                 // changes when filters change → clears selection + resets page
  onEdit: (id: number) => void;
  onDelete: (id: number, name: string) => void;   // single-row delete (reuses page overlay)
  onOpenNotes: (id: number) => void;
  onOpenTodos: (id: number) => void;
  onShare: (id: number) => void;
  onTerminal?: (id: number) => void;
  onBulkDelete: (ids: number[]) => Promise<void>;
  onlineMachineIds?: number[];
}
```

- [ ] **Step 1: Create `src/components/ProjectTable.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ExternalLink, SquareTerminal, StickyNote, ListChecks,
  Share2, Pencil, Trash2, ArrowUp, ArrowDown, Trash,
} from 'lucide-react';
import { Project } from '@/types';
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProjectTable.tsx
git commit -m "feat(projects): sortable ProjectTable with row selection + bulk delete bar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 4: Wire view toggle + facets into the projects page

**Files:**
- Modify: `src/app/(dash)/projects/page.tsx`

**Interfaces:**
- Consumes: `deleteProjects` from `useDashboard()` (Task 1); `ProjectTable` (Task 3).
- Produces: user-facing Card/Table toggle (persisted to `localStorage['devdash-projects-view']`), Tech/Tags facet dropdowns, and composed filtering feeding both views.

- [ ] **Step 1: Update imports at the top of `src/app/(dash)/projects/page.tsx`**

Replace:

```ts
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ScanLine } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import ProjectGrid from '@/components/ProjectGrid';
import EmptyState from '@/components/EmptyState';
import type { FilterType } from '@/components/FilterBar';
```

with:

```ts
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ScanLine, LayoutGrid, Table } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import ProjectGrid from '@/components/ProjectGrid';
import ProjectTable from '@/components/ProjectTable';
import EmptyState from '@/components/EmptyState';
import type { FilterType } from '@/components/FilterBar';
```

- [ ] **Step 2: Add a `splitCsv` helper below the `RUNNERS` constant**

After the line `const RUNNERS = ['', 'npm', 'pm2', 'yarn', 'php', 'docker', 'python', 'custom'];` add:

```ts
function splitCsv(s: string) {
  return (s || '').split(',').map((x) => x.trim()).filter(Boolean);
}
```

- [ ] **Step 3: Pull `deleteProjects` from the context destructure**

In the `useDashboard()` destructure, add `deleteProjects,` — change:

```ts
    openEdit, openDelete, openShare, openTerminal, openAdd,
```

to:

```ts
    openEdit, openDelete, openShare, openTerminal, openAdd, deleteProjects,
```

- [ ] **Step 4: Add view + facet state and the persisted-view effect**

Immediately after `const [filter, setFilter] = useState<FilterType>('all');` add:

```ts
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
```

- [ ] **Step 5: Extend the `filtered` predicate with the facets**

Replace the existing block:

```ts
  const q = search.toLowerCase();
  const filtered = projects.filter((p) => {
    const matchesSearch = !q || [p.name, String(p.port || ''), p.addonPorts || '', p.techStack || '', p.tags || '', p.description || '', p.runner || '']
      .some((s) => s.toLowerCase().includes(q));
    const matchesRunner = !runnerFilter || p.runner === runnerFilter;
    const matchesFilter =
      filter === 'all' ? p.status !== 'archived' :
      filter === 'live' ? p.isRunning :
      filter === 'offline' ? (!p.isRunning && p.status !== 'archived') :
      filter === 'archived' ? p.status === 'archived' : true;
    return matchesSearch && matchesRunner && matchesFilter;
  });
```

with:

```ts
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
```

- [ ] **Step 6: Add the view toggle + facet dropdowns to the filter row**

In the "Filter row" `div` (`<div className="flex items-center gap-2 mb-6 flex-wrap">`), after the existing runner `<select>...</select>`, add:

```tsx
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
```

- [ ] **Step 7: Branch the render on `view`**

Replace the final render block:

```tsx
      {filtered.length === 0 ? (
        <EmptyState onAdd={openAdd} />
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
```

with:

```tsx
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
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(dash)/projects/page.tsx"
git commit -m "feat(projects): Card/Table toggle + Tech/Tags facets on listing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 5: Full build + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Production build (full type + lint check)**

> Note: `npm run build` writes to `.next` and can clobber a running `npm run dev`. Stop the dev server first if running, or expect to restart it afterward.

Run: `npm run build`
Expected: build completes with no TypeScript or ESLint errors.

- [ ] **Step 2: Start the app and verify in the browser**

Run: `npm run dev` (serves on port 50051). Log in, go to `/projects`, and confirm each item:

- [ ] Card/Table toggle switches views; **Card view is visually unchanged**.
- [ ] Reload the page — the last-chosen view persists (localStorage).
- [ ] Table shows columns: checkbox, Status, Name, Ports, Runner, Tech, Tags, Age, Actions.
- [ ] Clicking Name/Port/Status/Runner/Age headers sorts; clicking again reverses (arrow flips).
- [ ] Tech and Tags dropdowns are populated from real project values and filter **both** views; they compose with the search box, status tabs, and runner filter.
- [ ] Header checkbox selects all rows on the current page; partial selection shows the indeterminate state.
- [ ] With rows selected, the sticky bar shows the count, Clear, and Delete selected.
- [ ] Delete selected opens the confirmation modal listing the names; confirming removes exactly those projects and their notes/todos, then the list refreshes.
- [ ] Changing any filter or switching to Card view clears the selection.
- [ ] Row action icons (URL, Terminal when daemon online, Notes, Todos, Share, Edit, Delete) behave like the card equivalents.

- [ ] **Step 3: Commit any fixes discovered during verification**

If verification surfaced fixes, commit them:

```bash
git add -A
git commit -m "fix(projects): address table-view verification findings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

## Self-Review Notes

**Spec coverage:**
- View toggle + persistence → Task 4 (Steps 4, 6, 7).
- Facets (Tech/Tags, single-select, from full dataset, compose with AND) → Task 4 (Steps 4, 5, 6).
- Table view (flat, sortable, columns, row actions, pagination, responsive scroll) → Task 3.
- Bulk select & delete (table-only, select-all-on-page, indeterminate, sticky bar, confirm modal, clears on filter change) → Task 3 + Task 2.
- Backend bulk DELETE (machine-scoped, cascade notes/todos, validation) + `deleteProjects` → Task 1.
- Card view unchanged → Task 4 keeps the `ProjectGrid` branch intact.
- Out-of-scope items (machine facet, other bulk actions, server-side paging, multi-select facets) are not implemented.

**Type consistency:** `deleteProjects(ids: number[]) => Promise<void>` is defined in Task 1 and consumed as `onBulkDelete` in Tasks 3–4. `ProjectTable` prop names in Task 3's interface match the JSX in Task 4 Step 7. `BulkDeleteModal` props (`open/names/onClose/onConfirm`) match between Task 2 and Task 3.

**No placeholders:** every code step contains complete, runnable code.
