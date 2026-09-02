# Project Process Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start / stop / restart a project's process on its server from DevDash using user-defined commands stored as structured fields, executed through a new headless `run_command` capability in the agent.

**Architecture:** New `startCommand`/`stopCommand`/`restartCommand`/`runInBackground` columns on `projects`. The agent gains a `run_command` websocket message (detached background spawn → log file, or foreground capture). The ws-server brokers it via the existing `pendingRequests`/`requestId` pattern behind `POST /run-command/:machineId`; `src/lib/daemon-status.ts` relays from Next.js. A new `POST /api/projects/[id]/process` resolves the command for an action and relays it. UI: Start/Stop/Restart buttons on card/table/detail (agent-online + port-based only) and a `RunCommandModal` for the missing-command "ask & save" flow.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Drizzle ORM (postgres.js), the `@indianic/devdash-agent` package (node, `child_process`, `ws`), lucide-react.

## Global Constraints

- The web app (`src/`) has NO unit-test harness — verification for web tasks is `npx tsc --noEmit` + `npm run build` + manual checks. Do NOT add a web test framework. The agent package (`packages/devdash-agent`) DOES use `node:test` (`node --test`); agent tasks add tests there.
- The agent ships its `dist/` (git-tracked, `files:["dist"]`, `main: dist/index.js`, no `prepublishOnly`). Every agent `src` change MUST rebuild (`npm run build` inside `packages/devdash-agent`) and commit `dist/` in the same commit.
- Do NOT publish the agent to npm until the final task; earlier agent tasks build + commit dist but do not publish.
- Reuse existing CSS utility classes only (`btn-icon`, `btn-icon danger`, `inp`, `label`, `overlay`, `modal-box`, `btn-ghost`, `btn-solid`, `btn-grad`, `status-chip`, `glass`) and CSS vars (`--txt`, `--muted`, `--accent`, `--live`, `--offline`, `--b1`). No new global CSS.
- Message/relay shapes are fixed across tasks: agent request `{ type:'run_command', requestId, command, cwd, background, logName? }`; agent response `{ type:'run_command_result', requestId, ok, pid?, exitCode?, output?, error? }`; relay/HTTP JSON `{ command, cwd, background, logName? }` → `{ ok, pid?, exitCode?, output?, error? }` or 503 `{ error }`.
- Process controls apply ONLY to port-based projects (project has a `port`); static/url-only and archived projects show none.
- Commit after each task; end commit messages with the repo's standard trailers:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV`.

---

### Task 1: Schema fields + type + persistence

**Files:**
- Modify: `src/lib/schema.ts` (projects table +4 columns)
- Modify: `src/types/index.ts` (`Project` + `ProjectFormData`)
- Modify: `src/app/api/projects/route.ts` (POST persists new fields)
- Modify: `src/app/api/projects/[id]/route.ts` (PUT persists new fields)

**Interfaces:**
- Produces: `Project.startCommand/stopCommand/restartCommand: string`, `Project.runInBackground: boolean`, same on `ProjectFormData`; both project write routes accept and persist them.

- [ ] **Step 1: Add columns to the projects table**

In `src/lib/schema.ts`, inside `export const projects = pgTable('projects', {...})`, add after the `rootPath` line:

```ts
  startCommand: text('start_command').default(''),
  stopCommand: text('stop_command').default(''),
  restartCommand: text('restart_command').default(''),
  runInBackground: boolean('run_in_background').default(true),
```

(`boolean` is already imported in this file — it's used by `projects.isRunning`. Confirm the import line `import { pgTable, ... boolean ... } from 'drizzle-orm/pg-core';` includes it; if not, add it.)

- [ ] **Step 2: Extend the types**

In `src/types/index.ts`, in `interface Project`, add after `rootPath: string;`:

```ts
  startCommand: string;
  stopCommand: string;
  restartCommand: string;
  runInBackground: boolean;
```

In `interface ProjectFormData`, add the same four fields (matching the existing optionality style of that interface — if `ProjectFormData` fields are all required strings, use `startCommand: string; stopCommand: string; restartCommand: string; runInBackground: boolean;`).

- [ ] **Step 3: Persist in POST `/api/projects`**

In `src/app/api/projects/route.ts`, in the `POST` handler, destructure the new fields from the body and include them in the `db.insert(projects).values({...})` object:

```ts
    startCommand: startCommand || '',
    stopCommand: stopCommand || '',
    restartCommand: restartCommand || '',
    runInBackground: runInBackground ?? true,
```

Add `startCommand, stopCommand, restartCommand, runInBackground` to the `const { ... } = body;` destructure.

- [ ] **Step 4: Persist in PUT `/api/projects/[id]`**

In `src/app/api/projects/[id]/route.ts` `PUT`, add the four fields to both the destructure and the `.set({...})` object, mirroring Step 3 (`startCommand: startCommand || '', … runInBackground: runInBackground ?? true,`).

- [ ] **Step 5: Push schema + type-check**

Run: `npm run db:push`
Expected: applies the 4 new columns (additive, no data loss). If it prompts, accept the additive changes.

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schema.ts src/types/index.ts src/app/api/projects/route.ts "src/app/api/projects/[id]/route.ts"
git commit -m "feat(projects): start/stop/restart command fields on projects

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 2: Agent `run_command` capability

**Files:**
- Create: `packages/devdash-agent/src/command-runner.ts`
- Modify: `packages/devdash-agent/src/websocket.ts` (import + `run_command` case)
- Create: `packages/devdash-agent/test/command-runner.test.js`
- Rebuild + commit `packages/devdash-agent/dist/`

**Interfaces:**
- Produces: `runCommand(args): Promise<RunCommandResult>` where `args = { command: string; cwd?: string; background?: boolean; logName?: string }` and `RunCommandResult = { ok: boolean; pid?: number; exitCode?: number; output?: string; error?: string }`.
- Produces (protocol): agent handles `{ type:'run_command', requestId, command, cwd, background, logName? }` → replies `{ type:'run_command_result', requestId, ...RunCommandResult }`.

- [ ] **Step 1: Write the failing test**

Create `packages/devdash-agent/test/command-runner.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { runCommand } = require('../dist/command-runner.js');

test('foreground command captures stdout and exit 0', async () => {
  const r = await runCommand({ command: 'echo hello-ddx', background: false });
  assert.equal(r.ok, true);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /hello-ddx/);
});

test('foreground failing command reports ok:false with exit code', async () => {
  const r = await runCommand({ command: 'exit 3', background: false });
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 3);
});

test('empty command returns ok:false, no throw', async () => {
  const r = await runCommand({ command: '   ', background: false });
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test('background command returns immediately with a pid', async () => {
  const r = await runCommand({ command: 'sleep 5', background: true, logName: 'test-bg' });
  assert.equal(r.ok, true);
  assert.equal(typeof r.pid, 'number');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd packages/devdash-agent && node --test test/command-runner.test.js`
Expected: FAIL — `Cannot find module '../dist/command-runner.js'`.

- [ ] **Step 3: Implement `command-runner.ts`**

Create `packages/devdash-agent/src/command-runner.ts`:

```ts
import { spawn, exec } from 'child_process';
import { openSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const LOG_DIR = join(homedir(), '.devdash-agent', 'logs');

function sanitize(name: string): string {
  return (name || 'run').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'run';
}

export interface RunCommandArgs {
  command: string;
  cwd?: string;
  background?: boolean;
  logName?: string;
}

export interface RunCommandResult {
  ok: boolean;
  pid?: number;
  exitCode?: number;
  output?: string;
  error?: string;
}

export function runCommand(args: RunCommandArgs): Promise<RunCommandResult> {
  const command = (args.command || '').trim();
  if (!command) return Promise.resolve({ ok: false, error: 'Empty command' });

  const cwd = args.cwd && existsSync(args.cwd) ? args.cwd : homedir();

  if (args.background) {
    try {
      mkdirSync(LOG_DIR, { recursive: true });
      const logPath = join(LOG_DIR, `${sanitize(args.logName || 'run')}.log`);
      const fd = openSync(logPath, 'a');
      const child = spawn(command, { cwd, shell: true, detached: true, stdio: ['ignore', fd, fd] });
      const pid = child.pid;
      child.unref();
      if (!pid) return Promise.resolve({ ok: false, error: 'Failed to start process' });
      return Promise.resolve({ ok: true, pid });
    } catch (err: any) {
      return Promise.resolve({ ok: false, error: err?.message || 'spawn failed' });
    }
  }

  return new Promise((resolve) => {
    exec(command, { cwd, timeout: 20000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const output = String((stdout || '') + (stderr || '')).slice(0, 4000);
      if (err) {
        const exitCode = typeof (err as any).code === 'number' ? (err as any).code : 1;
        resolve({ ok: false, exitCode, output, error: err.message });
      } else {
        resolve({ ok: true, exitCode: 0, output });
      }
    });
  });
}
```

- [ ] **Step 4: Wire the websocket case**

In `packages/devdash-agent/src/websocket.ts`, add to the imports at the top:

```ts
import { runCommand } from './command-runner';
```

In `handleMessage`'s `switch (msg.type)`, add a case (place it after the `project_scan` case):

```ts
    case 'run_command': {
      const result = await runCommand({
        command: msg.command || '',
        cwd: msg.cwd,
        background: !!msg.background,
        logName: msg.logName,
      });
      ws.send(JSON.stringify({ type: 'run_command_result', requestId: msg.requestId, ...result }));
      break;
    }
```

- [ ] **Step 5: Build the agent and run the tests green**

Run: `cd packages/devdash-agent && npm run build && node --test test/command-runner.test.js`
Expected: build succeeds; 4/4 tests pass. (The test requires `dist/command-runner.js`, so the build must run first.)

- [ ] **Step 6: Confirm dist is rebuilt for changed files**

Run: `cd packages/devdash-agent && git status --short dist/`
Expected: `dist/command-runner.js` (new) and `dist/websocket.js` (modified) appear.

- [ ] **Step 7: Commit (src + dist together)**

```bash
cd "$(git rev-parse --show-toplevel)"
git add packages/devdash-agent/src/command-runner.ts packages/devdash-agent/src/websocket.ts packages/devdash-agent/test/command-runner.test.js packages/devdash-agent/dist/
git commit -m "feat(agent): run_command message for headless start/stop/restart

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 3: ws-server brokering + daemon-status relay

**Files:**
- Modify: `src/ws-server/index.ts` (`run_command_result` resolver case, `requestRunCommand` helper, `POST /run-command/:machineId` route)
- Modify: `src/lib/daemon-status.ts` (`requestRunCommand`)

**Interfaces:**
- Consumes: agent protocol from Task 2.
- Produces: `daemon-status.requestRunCommand(machineId, { command, cwd, background, logName? }) => Promise<{ ok, pid?, exitCode?, output?, error? } | null>` (null when offline/timeout).

- [ ] **Step 1: Add the result resolver case in the ws-server**

In `src/ws-server/index.ts`, in the daemon-message `switch` (where `port_scan_result` / `fs_list` / `project_scan_result` cases live), add:

```ts
    case 'run_command_result': {
      const resolver = pendingRequests.get(msg.requestId);
      if (resolver) {
        resolver(msg);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }
```

- [ ] **Step 2: Add the `requestRunCommand` helper in the ws-server**

In `src/ws-server/index.ts`, next to `requestProjectScan`, add:

```ts
export async function requestRunCommand(
  machineId: number,
  args: { command: string; cwd: string; background: boolean; logName?: string }
): Promise<{ ok: boolean; pid?: number; exitCode?: number; output?: string; error?: string } | null> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return null;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(null);
    }, 25000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve({
        ok: !!result.ok,
        pid: result.pid,
        exitCode: result.exitCode,
        output: result.output,
        error: result.error,
      });
    });

    daemon.ws.send(JSON.stringify({
      type: 'run_command',
      requestId,
      command: args.command,
      cwd: args.cwd,
      background: args.background,
      logName: args.logName,
    }));
  });
}
```

- [ ] **Step 3: Add the HTTP route in the ws-server**

In the HTTP request handler in `src/ws-server/index.ts`, add a branch immediately after the `/check/` branch (before `/tunnel/`):

```ts
  } else if (url.pathname.startsWith('/run-command/') && req.method === 'POST') {
    // POST /run-command/:machineId — run a shell command on a machine via daemon
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);

    const result = await requestRunCommand(machineId, {
      command: body.command || '',
      cwd: body.cwd || '',
      background: !!body.background,
      logName: body.logName,
    });

    if (result === null) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Machine offline' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }
```

- [ ] **Step 4: Add the Next.js relay**

In `src/lib/daemon-status.ts`, add next to `requestProjectScan`:

```ts
export async function requestRunCommand(
  machineId: number,
  args: { command: string; cwd: string; background: boolean; logName?: string }
): Promise<{ ok: boolean; pid?: number; exitCode?: number; output?: string; error?: string } | null> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/run-command/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/ws-server/index.ts src/lib/daemon-status.ts
git commit -m "feat(ws): broker run_command to daemon + requestRunCommand relay

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 4: Process-control API route

**Files:**
- Create: `src/app/api/projects/[id]/process/route.ts`

**Interfaces:**
- Consumes: `requestRunCommand` (Task 3), the project command fields (Task 1).
- Produces (HTTP): `POST /api/projects/[id]/process` body `{ action:'start'|'stop'|'restart', command?, background?, save? }` → `200 { ok, pid?, output?, error? }`, `409 { error:'no-command', action }`, `401`, `404`, `502 { error }`.

- [ ] **Step 1: Create the route**

Create `src/app/api/projects/[id]/process/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { isMachineOnline, requestRunCommand } from '@/lib/daemon-status';

type Action = 'start' | 'stop' | 'restart';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const projectId = parseInt(id, 10);
  const body = await request.json().catch(() => ({}));
  const action = body.action as Action;
  if (!['start', 'stop', 'restart'].includes(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (project.machineId !== session.machineId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const stored = {
    start: project.startCommand || '',
    stop: project.stopCommand || '',
    restart: project.restartCommand || '',
  };

  // Resolve command(s) to run for this action.
  const provided = typeof body.command === 'string' ? body.command.trim() : '';
  const background = body.background ?? project.runInBackground ?? true;
  const cwd = project.rootPath || '';
  const logName = `project-${project.id}`;

  // restart with no explicit restart command but both start+stop present → stop then start
  if (action === 'restart' && !stored.restart && !provided && stored.start && stored.stop) {
    if (!(await isMachineOnline(session.machineId))) {
      return NextResponse.json({ error: 'Machine offline' }, { status: 502 });
    }
    await requestRunCommand(session.machineId, { command: stored.stop, cwd, background: false, logName });
    const startRes = await requestRunCommand(session.machineId, { command: stored.start, cwd, background, logName });
    if (startRes === null) return NextResponse.json({ error: 'Machine offline' }, { status: 502 });
    return NextResponse.json(startRes);
  }

  const command = provided || stored[action];
  if (!command) {
    return NextResponse.json({ error: 'no-command', action }, { status: 409 });
  }

  // Optionally persist the provided command to the matching field.
  if (provided && body.save) {
    const col = action === 'start' ? { startCommand: provided } :
                action === 'stop' ? { stopCommand: provided } :
                { restartCommand: provided };
    await db.update(projects)
      .set({ ...col, ...(action === 'start' ? { runInBackground: background } : {}), updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId));
  }

  if (!(await isMachineOnline(session.machineId))) {
    return NextResponse.json({ error: 'Machine offline' }, { status: 502 });
  }

  const result = await requestRunCommand(session.machineId, {
    command,
    cwd,
    background: action === 'start' ? background : false,
    logName,
  });
  if (result === null) return NextResponse.json({ error: 'Machine offline' }, { status: 502 });
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/projects/[id]/process/route.ts"
git commit -m "feat(projects): POST /api/projects/[id]/process start/stop/restart

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 5: Form fields + RunCommandModal

**Files:**
- Modify: `src/components/ProjectModal.tsx` (fields + form-data)
- Create: `src/components/RunCommandModal.tsx`

**Interfaces:**
- Produces: `ProjectModal` writes the 4 new fields into `ProjectFormData`.
- Produces: `RunCommandModal` default export, props `{ open: boolean; action: 'start'|'stop'|'restart'; projectName: string; onClose: () => void; onSubmit: (command: string, opts: { background: boolean; save: boolean }) => void }`. Renders null when closed; Escape calls `onClose`.

- [ ] **Step 1: Add the process-control fields to the form**

In `src/components/ProjectModal.tsx` `handleSubmit`, extend the `data` object with:

```ts
      startCommand: (fd.get('startCommand') as string || '').trim(),
      stopCommand: (fd.get('stopCommand') as string || '').trim(),
      restartCommand: (fd.get('restartCommand') as string || '').trim(),
      runInBackground: fd.get('runInBackground') === 'on',
```

In the JSX, replace the current NOTES label text (`NOTES / START COMMAND (credentials, commands, URLs)`) with just `NOTES`, drop the command-y placeholder (use `placeholder="Anything worth remembering about this project"`), and add a "Process control" block above or below the NOTES field:

```tsx
              <div>
                <label className="label">START COMMAND</label>
                <input name="startCommand" type="text" placeholder="npm run dev  ·  pm2 start ecosystem.config.js"
                  className="inp" defaultValue={init.startCommand || ''} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">STOP COMMAND</label>
                  <input name="stopCommand" type="text" placeholder="pm2 stop app" className="inp" defaultValue={init.stopCommand || ''} />
                </div>
                <div>
                  <label className="label">RESTART COMMAND</label>
                  <input name="restartCommand" type="text" placeholder="pm2 restart app" className="inp" defaultValue={init.restartCommand || ''} />
                </div>
              </div>
              <label className="flex items-center gap-2 mt-1" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                <input name="runInBackground" type="checkbox" defaultChecked={init.runInBackground ?? true} />
                Run start command in the background
              </label>
```

Match the surrounding field wrappers' markup (each field is wrapped like the existing `techStack`/`tags` blocks). Keep `ProjectFormData` field names exact.

- [ ] **Step 2: Create `RunCommandModal.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';

interface RunCommandModalProps {
  open: boolean;
  action: 'start' | 'stop' | 'restart';
  projectName: string;
  onClose: () => void;
  onSubmit: (command: string, opts: { background: boolean; save: boolean }) => void;
}

const PLACEHOLDER: Record<string, string> = {
  start: 'npm run dev',
  stop: 'pm2 stop app',
  restart: 'pm2 restart app',
};

export default function RunCommandModal({ open, action, projectName, onClose, onSubmit }: RunCommandModalProps) {
  const [command, setCommand] = useState('');
  const [background, setBackground] = useState(true);
  const [save, setSave] = useState(true);

  useEffect(() => { if (open) { setCommand(''); setBackground(true); setSave(true); } }, [open, action]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const title = action.charAt(0).toUpperCase() + action.slice(1);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <div style={{ padding: '24px 26px' }}>
          <h2 className="font-display" style={{ fontSize: 20, color: 'var(--txt)' }}>{title} “{projectName}”</h2>
          <p className="mt-1" style={{ fontSize: 12.5, color: 'var(--muted)' }}>No {action} command is saved for this project. Enter one to run now.</p>

          <label className="label mt-4">{title.toUpperCase()} COMMAND</label>
          <input autoFocus className="inp" value={command} onChange={(e) => setCommand(e.target.value)} placeholder={PLACEHOLDER[action]} />

          {action === 'start' && (
            <label className="flex items-center gap-2 mt-3" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              <input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} />
              Run in the background
            </label>
          )}
          <label className="flex items-center gap-2 mt-2" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
            Save this command to the project
          </label>

          <div className="flex gap-2.5 justify-end mt-6">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-grad" disabled={!command.trim()}
              onClick={() => onSubmit(command.trim(), { background, save })}>
              <Play size={15} /> {title}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProjectModal.tsx src/components/RunCommandModal.tsx
git commit -m "feat(projects): process-control form fields + RunCommandModal

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 6: Control buttons + context action (card, table, detail)

**Files:**
- Modify: `src/components/dashboard/DashboardContext.tsx` (`runProcessAction`)
- Create: `src/components/ProcessControls.tsx` (shared buttons + ask-modal wiring)
- Modify: `src/components/ProjectCard.tsx` (render controls)
- Modify: `src/components/ProjectTable.tsx` (render controls in the Actions cell)
- Modify: `src/app/(dash)/projects/page.tsx` (pass through if needed)

**Interfaces:**
- Consumes: `POST /api/projects/[id]/process` (Task 4), `RunCommandModal` (Task 5), `onlineMachineIds`.
- Produces (context): `runProcessAction(project: Project, action: 'start'|'stop'|'restart', extra?: { command?: string; background?: boolean; save?: boolean }) => Promise<{ ok: boolean; needCommand?: boolean }>`.
- Produces: `ProcessControls` default export, props `{ project: Project; onlineMachineIds: number[]; size?: number }`.

- [ ] **Step 1: Add `runProcessAction` to the context**

In `src/components/dashboard/DashboardContext.tsx`, add to the `DashboardCtx` interface (after `deleteProjects`):

```ts
  runProcessAction: (project: Project, action: 'start' | 'stop' | 'restart', extra?: { command?: string; background?: boolean; save?: boolean }) => Promise<{ ok: boolean; needCommand?: boolean }>;
```

Implement near `deleteProjects`:

```ts
  const runProcessAction = useCallback(async (
    project: Project,
    action: 'start' | 'stop' | 'restart',
    extra?: { command?: string; background?: boolean; save?: boolean },
  ): Promise<{ ok: boolean; needCommand?: boolean }> => {
    try {
      const r = await fetch(`/api/projects/${project.id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (r.status === 409) return { ok: false, needCommand: true };
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { toast(data.error || 'Command failed'); return { ok: false }; }
      if (data.ok === false) { toast(data.error || (data.output ? String(data.output).slice(0, 120) : 'Command failed')); }
      else { toast(action === 'start' ? 'Starting…' : action === 'stop' ? 'Stopping…' : 'Restarting…'); }
      // Re-check status shortly after.
      setTimeout(() => { reloadProjects(); }, 1500);
      return { ok: data.ok !== false };
    } catch { toast('Command failed'); return { ok: false }; }
  }, [reloadProjects, toast]);
```

Add `runProcessAction` to the context `value` object.

- [ ] **Step 2: Create `ProcessControls.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Play, Square, RotateCw } from 'lucide-react';
import { Project } from '@/types';
import { useDashboard } from './dashboard/DashboardContext';
import RunCommandModal from './RunCommandModal';

interface ProcessControlsProps {
  project: Project;
  onlineMachineIds: number[];
  size?: number;
}

export default function ProcessControls({ project: p, onlineMachineIds, size = 16 }: ProcessControlsProps) {
  const { runProcessAction } = useDashboard();
  const [ask, setAsk] = useState<null | 'start' | 'stop' | 'restart'>(null);

  const arch = p.status === 'archived';
  const portBased = !!p.port;
  const daemonOnline = p.machineId ? onlineMachineIds.includes(p.machineId) : false;
  if (arch || !portBased || !daemonOnline) return null;

  async function trigger(action: 'start' | 'stop' | 'restart') {
    const res = await runProcessAction(p, action);
    if (res.needCommand) setAsk(action);
  }

  return (
    <>
      {!p.isRunning ? (
        <button className="btn-icon" title="Start" onClick={(e) => { e.stopPropagation(); trigger('start'); }}><Play size={size} /></button>
      ) : (
        <>
          <button className="btn-icon" title="Restart" onClick={(e) => { e.stopPropagation(); trigger('restart'); }}><RotateCw size={size} /></button>
          <button className="btn-icon danger" title="Stop" onClick={(e) => { e.stopPropagation(); trigger('stop'); }}><Square size={size} /></button>
        </>
      )}

      <RunCommandModal
        open={ask !== null}
        action={ask || 'start'}
        projectName={p.name}
        onClose={() => setAsk(null)}
        onSubmit={async (command, opts) => {
          const a = ask!;
          setAsk(null);
          await runProcessAction(p, a, { command, background: opts.background, save: opts.save });
        }}
      />
    </>
  );
}
```

- [ ] **Step 3: Render in `ProjectCard.tsx`**

Add the import `import ProcessControls from './ProcessControls';` and render it in the action bar (the `card-acts` row), before the Notes button:

```tsx
        <ProcessControls project={p} onlineMachineIds={onlineMachineIds} size={16} />
```

- [ ] **Step 4: Render in `ProjectTable.tsx`**

Add `import ProcessControls from './ProcessControls';` and, inside the Actions cell `<div className="flex items-center justify-end gap-1">`, add as the first child:

```tsx
                      <ProcessControls project={p} onlineMachineIds={onlineMachineIds} size={15} />
```

- [ ] **Step 5: Type-check + build**

Run: `npx tsc --noEmit`
Expected: exits 0.

Run: `npm run build`
Expected: build succeeds, no type/lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/DashboardContext.tsx src/components/ProcessControls.tsx src/components/ProjectCard.tsx src/components/ProjectTable.tsx
git commit -m "feat(projects): start/stop/restart controls on card + table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

### Task 7: Publish agent 2.3.0 + manual verification

**Files:** none (release + verification)

- [ ] **Step 1: Bump + publish the agent**

From `packages/devdash-agent`, follow the repo's existing release flow (the same `npm run release:*` used for 2.2.x — check `package.json` scripts). Confirm the published tarball ships `dist/command-runner.js` and the updated `dist/websocket.js`. Tag + push per the established convention. Do NOT push the web branch unless the user asks (pushing triggers the GitLab deploy).

- [ ] **Step 2: Update the running agent on this machine**

Run: `devdash-agent update && devdash-agent restart`
Expected: agent reports the new version.

- [ ] **Step 3: Manual verification**

With the dev server running and a **port-based** project on an **online** machine:

- [ ] Edit a project → the form shows Start/Stop/Restart command fields and the "run in background" checkbox; NOTES no longer mentions commands. Save persists them.
- [ ] A **stopped** port-based project shows a **Start** (▶) button on its card and table row; a **running** one shows **Restart** + **Stop**. Static/url-only and archived projects show none. Offline-agent projects show none.
- [ ] Click **Start** on a project with a saved start command → toast "Starting…"; within ~a couple seconds the port goes live and the status flips to Live.
- [ ] Click **Start** on a project with **no** command → the RunCommandModal appears; entering a command with "Save to project" checked runs it AND persists it (re-open edit to confirm).
- [ ] **Stop** kills the process (port goes offline); **Restart** cycles it.
- [ ] Background start survives (process keeps running after the request); a log file appears under `~/.devdash-agent/logs/project-<id>.log`.

- [ ] **Step 4: Commit any fixes discovered**

```bash
git add -A
git commit -m "fix(projects): process-control verification findings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016DZnvsFArQNBwXCSyqRTHV"
```

---

## Self-Review Notes

**Spec coverage:** structured start/stop/restart fields split from notes → Task 1 + Task 5; agent headless exec → Task 2; broker + relay → Task 3; action resolution + save + restart-fallback → Task 4; "run in background" flag → Tasks 1/4/5; ask-&-save modal → Tasks 5/6; controls gated on agent-online + port-based, Start-when-offline / Stop+Restart-when-running → Task 6; static/server-managed projects excluded → Task 6 guard; agent publish → Task 7.

**Type consistency:** `run_command` request/response shape is identical in Tasks 2 (agent), 3 (ws-server + relay), 4 (consumer). `requestRunCommand(machineId, { command, cwd, background, logName? })` signature matches between `src/ws-server/index.ts` and `src/lib/daemon-status.ts`. `runProcessAction` (Task 6 context) matches its consumers in `ProcessControls`. `RunCommandModal` props match between Task 5 (definition) and Task 6 (usage). New project fields `startCommand/stopCommand/restartCommand/runInBackground` are named identically across schema, types, form, API, and route.

**No placeholders:** every code step contains complete code.
