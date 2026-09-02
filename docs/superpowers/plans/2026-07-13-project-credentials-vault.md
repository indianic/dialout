# Project Credentials Vault — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each project an encrypted credentials vault — a list of entries (environment, kind, label, backend URL, username, password) with copy buttons — replacing the free-text credentials that used to live in `notes`.

**Architecture:** A new `projectCredentials` table stores everything plaintext EXCEPT the password, which is encrypted at rest via the **existing** `src/lib/secret-crypto.ts` (`encryptSecret`/`decryptSecret`, AES-256-GCM keyed off `SECRET_ENC_KEY || JWT_SECRET`). CRUD lives at `/api/projects/[id]/credentials`; a separate `/reveal` endpoint returns a decrypted secret for the copy button. A shared access helper authorizes the project **owner and any shared-with user**. The UI is a new `Credentials` tab (`DrawerCredentials`) on the project detail page, mirroring the existing Notes/Todos/Comments drawers.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Drizzle ORM (postgres.js), lucide-react.

## Global Constraints

- The web app has NO unit-test harness — verification is `npx tsc --noEmit` + `npm run build` + manual checks. Do NOT add a web test framework.
- **Reuse `src/lib/secret-crypto.ts`** — do NOT write a new crypto module or introduce a `CREDENTIALS_KEY`. The existing `encryptSecret(plain): string` / `decryptSecret(stored): string | null` and its `SECRET_ENC_KEY || JWT_SECRET` key are the standard for secrets at rest in this repo (also used by machine API keys).
- **Encrypt only the password** (`secretEnc`). `environment`, `kind`, `label`, `backendUrl`, `username` are identifiers, stored plaintext so they can be listed/searched.
- **Secrets never leave except via the explicit reveal endpoint.** List/GET responses MUST omit `secretEnc` and return `hasSecret: boolean` instead. No secret in any URL, query string, or log.
- **Authorization** for every credentials endpoint: `getSession()` → 401; then `canAccessProjectCredentials(session.userId, projectId)` → 403 if false. Access = project owner (`project.userId === session.userId`) OR a `projectShares` row with `projectId` and `sharedWith === session.userId`.
- Reuse existing CSS utility classes only (`inp`, `label`, `btn-icon`, `btn-icon danger`, `btn-ghost`, `btn-grad`, `pill`, `tag-chip`, `glass`, `ftab`/`on`, `status-chip`) and CSS vars (`--txt`, `--muted`, `--dim`, `--accent`, `--b1`, `--offline`, `--live`). No new global CSS.
- The `[id]` route param: guard `parseInt` against `NaN` before querying.
- Commit after each task; end commit messages with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV`.

---

### Task 1: Schema + type + push

**Files:**
- Modify: `src/lib/schema.ts` (+`projectCredentials`)
- Modify: `src/types/index.ts` (+`ProjectCredential`)

**Interfaces:**
- Produces: `projectCredentials` table and a `ProjectCredential` TS type.

- [ ] **Step 1: Add the table to `src/lib/schema.ts`**

After the `projectCommands` table definition, add:

```ts
export const projectCredentials = pgTable('project_credentials', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  environment: text('environment').default('local'), // 'local' | 'live'
  kind: text('kind').default('login'),               // 'login' | 'email' | 'api' | 'db' | 'other'
  label: text('label').default(''),
  backendUrl: text('backend_url').default(''),
  username: text('username').default(''),
  secretEnc: text('secret_enc').default(''),          // AES-256-GCM ciphertext (never returned in lists)
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`now()`),
  updatedAt: text('updated_at').default(sql`now()`),
});
```

(`pgTable`, `serial`, `integer`, `text`, `sql` are already imported in this file.)

- [ ] **Step 2: Add the type to `src/types/index.ts`**

```ts
export interface ProjectCredential {
  id: number;
  projectId: number;
  environment: string;
  kind: string;
  label: string;
  backendUrl: string;
  username: string;
  hasSecret: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

(Note: the client type carries `hasSecret`, NOT `secretEnc` — the API never sends the ciphertext to the browser.)

- [ ] **Step 3: Push schema + type-check**

Run: `npm run db:push`
Expected: creates `project_credentials` additively. If prompted, choose the additive/create option; never a destructive one (STOP + report BLOCKED if it can only proceed destructively).

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/schema.ts src/types/index.ts
git commit -m "feat(projects): projectCredentials table + type

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 2: Access helper + CRUD API

**Files:**
- Create: `src/lib/project-access.ts`
- Create: `src/app/api/projects/[id]/credentials/route.ts`

**Interfaces:**
- Consumes: `encryptSecret` from `@/lib/secret-crypto`; schema from Task 1.
- Produces: `isProjectOwner(userId, projectId)` (owner-only) and `canAccessProjectCredentials(userId, projectId)` (owner + shared-with), both `: Promise<boolean>`.
- Produces (HTTP): `GET` (read: owner or shared) + `POST/PUT/DELETE` (manage: owner only) `/api/projects/[id]/credentials`.

- [ ] **Step 1: Create the access helper `src/lib/project-access.ts`**

```ts
import { db } from '@/lib/db';
import { projects, projectShares } from '@/lib/schema';
import { and, eq } from 'drizzle-orm';

// Owner-only: manage (create/update/delete) credentials.
export async function isProjectOwner(userId: number, projectId: number): Promise<boolean> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  return !!project && project.userId === userId;
}

// Owner OR shared-with: view/reveal/copy credentials.
export async function canAccessProjectCredentials(userId: number, projectId: number): Promise<boolean> {
  if (await isProjectOwner(userId, projectId)) return true;
  const [share] = await db.select().from(projectShares)
    .where(and(eq(projectShares.projectId, projectId), eq(projectShares.sharedWith, userId)));
  return !!share;
}
```

- [ ] **Step 2: Create `src/app/api/projects/[id]/credentials/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectCredentials } from '@/lib/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { encryptSecret } from '@/lib/secret-crypto';
import { canAccessProjectCredentials, isProjectOwner } from '@/lib/project-access';

// mode 'read' → owner or shared-with (GET); mode 'manage' → owner only (POST/PUT/DELETE).
async function authorize(idParam: string, mode: 'read' | 'manage'): Promise<{ projectId: number; userId: number } | { error: NextResponse }> {
  const projectId = parseInt(idParam, 10);
  if (Number.isNaN(projectId)) return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) };
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const ok = mode === 'manage'
    ? await isProjectOwner(session.userId, projectId)
    : await canAccessProjectCredentials(session.userId, projectId);
  if (!ok) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { projectId, userId: session.userId };
}

// GET — list credentials WITHOUT secrets (owner or shared-with)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, 'read');
  if ('error' in auth) return auth.error;

  const rows = await db.select().from(projectCredentials)
    .where(eq(projectCredentials.projectId, auth.projectId))
    .orderBy(asc(projectCredentials.sortOrder), asc(projectCredentials.id));

  return NextResponse.json(rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    environment: r.environment,
    kind: r.kind,
    label: r.label,
    backendUrl: r.backendUrl,
    username: r.username,
    hasSecret: !!r.secretEnc,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  })));
}

// POST — create (owner only)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, 'manage');
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const { environment, kind, label, backendUrl, username, secret } = body;

  const [created] = await db.insert(projectCredentials).values({
    projectId: auth.projectId,
    environment: environment || 'local',
    kind: kind || 'login',
    label: label || '',
    backendUrl: backendUrl || '',
    username: username || '',
    secretEnc: secret ? encryptSecret(String(secret)) : '',
    sortOrder: body.sortOrder ?? 0,
  }).returning();

  return NextResponse.json({ id: created.id, hasSecret: !!created.secretEnc }, { status: 201 });
}

// PUT — update by { credentialId, ...fields }. If `secret` present, re-encrypt; if absent, leave stored secret.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, 'manage');
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const credentialId = parseInt(body.credentialId, 10);
  if (Number.isNaN(credentialId)) return NextResponse.json({ error: 'credentialId required' }, { status: 400 });

  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const f of ['environment', 'kind', 'label', 'backendUrl', 'username', 'sortOrder'] as const) {
    if (body[f] !== undefined) set[f] = body[f];
  }
  if (typeof body.secret === 'string') set.secretEnc = body.secret ? encryptSecret(body.secret) : '';

  await db.update(projectCredentials).set(set)
    .where(and(eq(projectCredentials.id, credentialId), eq(projectCredentials.projectId, auth.projectId)));

  return NextResponse.json({ success: true });
}

// DELETE — remove by { credentialId }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, 'manage');
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const credentialId = parseInt(body.credentialId, 10);
  if (Number.isNaN(credentialId)) return NextResponse.json({ error: 'credentialId required' }, { status: 400 });

  await db.delete(projectCredentials)
    .where(and(eq(projectCredentials.id, credentialId), eq(projectCredentials.projectId, auth.projectId)));

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/project-access.ts "src/app/api/projects/[id]/credentials/route.ts"
git commit -m "feat(projects): credentials CRUD API + access helper (owner + shared)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 3: Reveal endpoint

**Files:**
- Create: `src/app/api/projects/[id]/credentials/[credId]/reveal/route.ts`

**Interfaces:**
- Consumes: `decryptSecret` from `@/lib/secret-crypto`; `canAccessProjectCredentials`.
- Produces (HTTP): `POST /api/projects/[id]/credentials/[credId]/reveal` → `200 { secret }`, `401`, `403`, `404`, `500`.

- [ ] **Step 1: Create the reveal route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectCredentials } from '@/lib/schema';
import { and, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { decryptSecret } from '@/lib/secret-crypto';
import { canAccessProjectCredentials } from '@/lib/project-access';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; credId: string }> }) {
  const { id, credId } = await params;
  const projectId = parseInt(id, 10);
  const credentialId = parseInt(credId, 10);
  if (Number.isNaN(projectId) || Number.isNaN(credentialId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await canAccessProjectCredentials(session.userId, projectId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [row] = await db.select().from(projectCredentials)
    .where(and(eq(projectCredentials.id, credentialId), eq(projectCredentials.projectId, projectId)));
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const secret = row.secretEnc ? decryptSecret(row.secretEnc) : '';
  if (secret === null) return NextResponse.json({ error: 'Could not decrypt' }, { status: 500 });

  return NextResponse.json({ secret });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/projects/[id]/credentials/[credId]/reveal/route.ts"
git commit -m "feat(projects): credential reveal endpoint (owner + shared)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 4: Credentials tab UI

**Files:**
- Create: `src/components/DrawerCredentials.tsx`
- Modify: `src/app/(dash)/projects/[id]/page.tsx` (add the `credentials` tab)

**Interfaces:**
- Consumes: the credentials CRUD + reveal endpoints.
- Produces: `DrawerCredentials` default export, props `{ projectId: number; isOwner: boolean }`.

- [ ] **Step 1: Create `src/components/DrawerCredentials.tsx`**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Copy, Eye, EyeOff, Check } from 'lucide-react';
import { ProjectCredential } from '@/types';
import { useToast } from '@/components/Toast';

const ENVIRONMENTS = ['local', 'live'];
const KINDS = ['login', 'email', 'api', 'db', 'other'];

interface DrawerCredentialsProps {
  projectId: number;
  isOwner: boolean;
}

interface DraftState {
  environment: string; kind: string; label: string;
  backendUrl: string; username: string; secret: string;
}

const EMPTY: DraftState = { environment: 'local', kind: 'login', label: '', backendUrl: '', username: '', secret: '' };

export default function DrawerCredentials({ projectId, isOwner }: DrawerCredentialsProps) {
  const { toast } = useToast();
  const [creds, setCreds] = useState<ProjectCredential[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [copiedKey, setCopiedKey] = useState<string>('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/credentials`);
      if (r.ok) setCreds(await r.json());
    } catch {}
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function reveal(credId: number): Promise<string | null> {
    if (revealed[credId] !== undefined) return revealed[credId];
    try {
      const r = await fetch(`/api/projects/${projectId}/credentials/${credId}/reveal`, { method: 'POST' });
      if (!r.ok) { toast('Could not reveal'); return null; }
      const { secret } = await r.json();
      setRevealed((m) => ({ ...m, [credId]: secret }));
      return secret;
    } catch { toast('Could not reveal'); return null; }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1200);
    } catch { toast('Copy failed'); }
  }

  async function copySecret(credId: number) {
    const s = await reveal(credId);
    if (s !== null) copy(s, `secret-${credId}`);
  }

  function toggleReveal(credId: number) {
    if (revealed[credId] !== undefined) {
      setRevealed((m) => { const n = { ...m }; delete n[credId]; return n; });
    } else {
      reveal(credId);
    }
  }

  async function addCredential() {
    if (!draft.label && !draft.username && !draft.secret) { toast('Enter at least a label or username'); return; }
    try {
      const r = await fetch(`/api/projects/${projectId}/credentials`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      });
      if (!r.ok) throw new Error();
      toast('Credential added');
      setDraft(EMPTY); setAdding(false); load();
    } catch { toast('Save failed'); }
  }

  async function remove(credId: number) {
    try {
      const r = await fetch(`/api/projects/${projectId}/credentials`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credentialId: credId }),
      });
      if (!r.ok) throw new Error();
      toast('Deleted'); load();
    } catch { toast('Delete failed'); }
  }

  function CopyBtn({ text, k }: { text: string; k: string }) {
    if (!text) return null;
    return (
      <button className="btn-icon" title="Copy" onClick={() => copy(text, k)}>
        {copiedKey === k ? <Check size={13} /> : <Copy size={13} />}
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px]" style={{ color: 'var(--muted)' }}>
          Encrypted at rest. {isOwner ? 'You and anyone this project is shared with' : 'Shared with you'} can reveal &amp; copy.
        </p>
        {isOwner && !adding && (
          <button className="btn-ghost" onClick={() => setAdding(true)}><Plus size={15} /> Add credential</button>
        )}
      </div>

      {adding && (
        <div className="glass rounded-xl p-4 mb-3 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <select className="inp" value={draft.environment} onChange={(e) => setDraft({ ...draft, environment: e.target.value })}>
              {ENVIRONMENTS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select className="inp" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
              {KINDS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <input className="inp" placeholder="Label (e.g. Admin panel)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <input className="inp" placeholder="Backend / login URL" value={draft.backendUrl} onChange={(e) => setDraft({ ...draft, backendUrl: e.target.value })} />
          <input className="inp" placeholder="Username / email" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
          <input className="inp" type="password" placeholder="Password / secret" value={draft.secret} onChange={(e) => setDraft({ ...draft, secret: e.target.value })} />
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => { setAdding(false); setDraft(EMPTY); }}>Cancel</button>
            <button className="btn-grad" onClick={addCredential}>Save</button>
          </div>
        </div>
      )}

      {creds.length === 0 && !adding && (
        <p className="text-[13px]" style={{ color: 'var(--dim)' }}>No credentials yet.</p>
      )}

      <div className="flex flex-col gap-2.5">
        {creds.map((c) => (
          <div key={c.id} className="glass rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <span className={`status-chip ${c.environment === 'live' ? 'live' : 'static'}`}>{c.environment}</span>
              <span className="pill">{c.kind}</span>
              {c.label && <span className="text-[13px] font-semibold" style={{ color: 'var(--txt)' }}>{c.label}</span>}
              <span className="flex-1" />
              {isOwner && <button className="btn-icon danger" title="Delete" onClick={() => remove(c.id)}><Trash2 size={14} /></button>}
            </div>
            <div className="flex flex-col gap-1.5 font-mono text-[12px]" style={{ color: 'var(--muted)' }}>
              {c.backendUrl && (
                <div className="flex items-center gap-2">
                  <span style={{ minWidth: 70, color: 'var(--dim)' }}>URL</span>
                  <a href={c.backendUrl} target="_blank" rel="noreferrer" className="hover:underline truncate" style={{ color: 'var(--accent)' }}>{c.backendUrl}</a>
                  <CopyBtn text={c.backendUrl} k={`url-${c.id}`} />
                </div>
              )}
              {c.username && (
                <div className="flex items-center gap-2">
                  <span style={{ minWidth: 70, color: 'var(--dim)' }}>User</span>
                  <span className="truncate" style={{ color: 'var(--txt)' }}>{c.username}</span>
                  <CopyBtn text={c.username} k={`user-${c.id}`} />
                </div>
              )}
              {c.hasSecret && (
                <div className="flex items-center gap-2">
                  <span style={{ minWidth: 70, color: 'var(--dim)' }}>Secret</span>
                  <span className="truncate" style={{ color: 'var(--txt)' }}>
                    {revealed[c.id] !== undefined ? (revealed[c.id] || '(empty)') : '••••••••'}
                  </span>
                  <button className="btn-icon" title={revealed[c.id] !== undefined ? 'Hide' : 'Reveal'} onClick={() => toggleReveal(c.id)}>
                    {revealed[c.id] !== undefined ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button className="btn-icon" title="Copy secret" onClick={() => copySecret(c.id)}>
                    {copiedKey === `secret-${c.id}` ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the `credentials` tab into the detail page**

In `src/app/(dash)/projects/[id]/page.tsx`:

Add the import:
```ts
import DrawerCredentials from '@/components/DrawerCredentials';
```
Add `KeyRound` to the existing `lucide-react` import.

Change the `Tab` type and `TABS` array:
```ts
type Tab = 'notes' | 'todos' | 'comments' | 'credentials';
```
Add to the `TABS` array (after comments):
```ts
  { key: 'credentials', label: 'Credentials', icon: KeyRound },
```

In the tab-content conditional, add a branch (before the final fallback):
```tsx
        ) : tab === 'credentials' ? (
          <DrawerCredentials projectId={project.id} isOwner={isOwner} />
```
(Insert it into the existing `tab === 'notes' ? ... : tab === 'todos' ? ... : ...` chain so `credentials` renders `DrawerCredentials`.)

If the `counts` record is typed `Record<Tab, number>`, add `credentials: creds.length` is NOT required — credentials count isn't tracked; set `credentials: 0` in the `counts` object so the `Record<Tab, number>` stays exhaustive and type-checks. (The tab button shows a count badge only when > 0, so 0 renders no badge.)

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit`
Expected: exits 0.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/DrawerCredentials.tsx "src/app/(dash)/projects/[id]/page.tsx"
git commit -m "feat(projects): Credentials tab with reveal + copy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 5: Manual verification

**Files:** none.

- [ ] **Step 1: Verify in the browser** (dev server on :50051; user performs UI checks)

- [ ] Open a project → the detail page shows a **Credentials** tab.
- [ ] Add a credential (local, login, label, backend URL, username, password) → it appears; the list network response does NOT contain the password (only `hasSecret: true`).
- [ ] Copy buttons on URL / username work; the eye toggle reveals the password (via the reveal endpoint) and copy-secret copies the plaintext.
- [ ] Add a `live` credential; both environments show with correct badges.
- [ ] Delete a credential removes it.
- [ ] A user the project is **shared with** can view + reveal + copy (owner-only controls like Add/Delete gated on `isOwner`).
- [ ] A non-participant gets 403 (no access).

- [ ] **Step 2: Commit any fixes discovered**

```bash
git add -A
git commit -m "fix(projects): credentials-vault verification findings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

## Self-Review Notes

**Spec coverage:** `projectCredentials` table (environment/kind/label/backendUrl/username/encrypted secret) → Task 1; reversible AES-256-GCM via existing `secret-crypto.ts` → Tasks 2/3 (spec's proposed new crypto module + CREDENTIALS_KEY intentionally superseded by the existing helper — noted); CRUD without leaking secrets (`hasSecret` only) → Task 2; reveal endpoint for copy → Task 3; owner + shared-with authorization → `canAccessProjectCredentials` (Tasks 2/3); editor with copy buttons + reveal, local/live, backend URL, multiple entries → Task 4; new-project "save first" is satisfied structurally because the editor lives on the detail page (which only exists once a project has an id).

**Type consistency:** `ProjectCredential` (Task 1) is what the API returns (Task 2 GET maps to exactly those fields incl. `hasSecret`, never `secretEnc`) and what `DrawerCredentials` consumes (Task 4). `canAccessProjectCredentials(userId, projectId)` signature identical across Tasks 2 and 3. `DrawerCredentials` props `{ projectId, isOwner }` match the detail-page usage (Task 4 Step 2).

**Security:** secret encrypted at rest; never in list/GET responses, URLs, or logs; reveal is an authenticated POST gated by `canAccessProjectCredentials` (owner + shared-with). Mutations (POST/PUT/DELETE) are gated server-side by `isProjectOwner` (owner only) AND hidden in the UI via `isOwner` — shared users can view/reveal/copy but cannot add, edit, or delete. This matches the spec's intent (shared users see/copy; owner manages).

**No placeholders:** every code step contains complete code.
