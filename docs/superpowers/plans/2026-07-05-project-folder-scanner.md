# Project Folder Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scan a user-chosen folder on any agent-connected machine for dev projects (stack, port, start command) and let the user review, edit, and add them as DevDash projects from the `/scanner` page.

**Architecture:** Detection logic (ported from `scripts/project-scanner.mjs`, stateless — no cache) lives in the devdash-agent as a new `project_scan` WebSocket message, relayed by the ws-server's existing pending-request plumbing to a new Next.js API route that annotates results against already-registered projects. A new `ProjectFolderScanner` component on `/scanner` drives folder pick → scan → multi-select add.

**Tech Stack:** TypeScript, Next.js 15 App Router, Drizzle/PostgreSQL, ws (WebSocket), node:test for agent unit tests.

**Spec:** `docs/superpowers/specs/2026-07-05-project-folder-scanner-design.md`

## Global Constraints

- Agent package (`packages/devdash-agent`) compiles with `tsc` to CommonJS (`module: commonjs`, target ES2022); no new runtime dependencies allowed.
- Agent supports Node >= 18, darwin + linux only.
- Scanner is stateless: no cache files, no persisted state on the agent.
- Runner enum values are exactly: `npm, pm2, yarn, php, docker, python, custom`.
- Timeouts: ws-server waits 60s for `project_scan_result`; Next.js `daemon-status` fetch waits 65s.
- Frontend uses relative API URLs and existing CSS utility classes (`inp`, `label`, `btn-grad`, `btn-ghost`, `btn-icon`, `glass`, `overlay`, `modal-box`, CSS vars `--txt --muted --dim --accent --b1 --b2 --card --offline --live`).
- Toast API: `const { toast } = useToast();` then `toast('message')`.
- All commands below run from repo root `/Volumes/SandeepSSD/www/tools/devdash` unless a `cd` is shown.

---

### Task 1: Agent detection module `project-scanner.ts` with tests

**Files:**
- Create: `packages/devdash-agent/src/project-scanner.ts`
- Create: `packages/devdash-agent/test/project-scanner.test.cjs`
- Modify: `packages/devdash-agent/package.json` (add `test` script)

**Interfaces:**
- Consumes: `scanPorts(ports: number[]): Promise<number[]>` from `./port-scanner` (already exists).
- Produces: `scanProjects(rootPath: string, maxDepth?: number): Promise<DetectedProject[]>` and the `DetectedProject` interface — used by Task 2 (websocket) and mirrored by the `ScannedProject` UI type in Task 5.

- [ ] **Step 1: Add test script to agent package.json**

In `packages/devdash-agent/package.json`, add to `"scripts"`:

```json
    "test": "npm run build && node --test test/",
```

(after the `"build"` entry; keep the rest unchanged.)

- [ ] **Step 2: Write the failing test**

Create `packages/devdash-agent/test/project-scanner.test.cjs`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scanProjects } = require('../dist/project-scanner.js');

function makeFixtures() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devdash-scan-'));
  const write = (rel, content) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };

  // Next.js + TypeScript, port from script flag
  write('next-app/package.json', JSON.stringify({
    dependencies: { next: '15.0.0', react: '19.0.0' },
    devDependencies: { typescript: '5.0.0' },
    scripts: { dev: 'next dev -p 4200' },
  }));
  write('next-app/tsconfig.json', '{}');

  // Vite, port from config file
  write('vite-app/package.json', JSON.stringify({
    devDependencies: { vite: '6.0.0' },
    scripts: { dev: 'vite' },
  }));
  write('vite-app/vite.config.ts', 'export default { server: { port: 5199 } }');
  write('vite-app/yarn.lock', '');

  // Express, port from .env
  write('api-app/package.json', JSON.stringify({
    dependencies: { express: '4.0.0' },
    scripts: { start: 'node index.js' },
  }));
  write('api-app/.env', 'PORT=4123\n');

  // Laravel
  write('laravel-app/composer.json', JSON.stringify({
    require: { 'laravel/framework': '^11.0' },
  }));

  // Plain PHP and static HTML (both get assigned ports)
  write('php-site/index.php', '<?php echo "hi";');
  write('static-site/index.html', '<h1>hi</h1>');

  // Django, nested one level deep
  write('group/django-app/manage.py', '#!/usr/bin/env python');

  // Must be ignored: project inside node_modules
  write('next-app/node_modules/fake/package.json', JSON.stringify({
    dependencies: { express: '4.0.0' },
  }));

  return root;
}

test('scanProjects detects stacks, ports, and start commands', async () => {
  const root = makeFixtures();
  try {
    const projects = await scanProjects(root, 2);
    const byName = Object.fromEntries(projects.map((p) => [p.name, p]));

    assert.equal(projects.length, 7);

    assert.equal(byName['next-app'].framework, 'nextjs');
    assert.equal(byName['next-app'].language, 'TypeScript');
    assert.equal(byName['next-app'].port, 4200);
    assert.equal(byName['next-app'].portSource, 'script');
    assert.equal(byName['next-app'].startCommand, 'npm run dev');
    assert.equal(byName['next-app'].url, 'http://localhost:4200');

    assert.equal(byName['vite-app'].framework, 'vite');
    assert.equal(byName['vite-app'].port, 5199);
    assert.equal(byName['vite-app'].portSource, 'config');
    assert.equal(byName['vite-app'].packageManager, 'yarn');
    assert.equal(byName['vite-app'].startCommand, 'yarn dev');

    assert.equal(byName['api-app'].framework, 'express');
    assert.equal(byName['api-app'].port, 4123);
    assert.equal(byName['api-app'].portSource, 'env');

    assert.equal(byName['laravel-app'].framework, 'laravel');
    assert.equal(byName['laravel-app'].port, 8000);
    assert.equal(byName['laravel-app'].startCommand, 'php artisan serve --port=8000');

    assert.equal(byName['django-app'].framework, 'django');
    assert.equal(byName['django-app'].port, 8000);
    assert.equal(byName['django-app'].startCommand, 'python manage.py runserver 8000');

    // php/static get deterministic assigned ports, skipping used ones
    assert.equal(byName['php-site'].stack, 'php');
    assert.equal(byName['php-site'].portSource, 'assigned');
    assert.equal(byName['static-site'].stack, 'static');
    assert.equal(byName['static-site'].portSource, 'assigned');
    const assigned = [byName['php-site'].port, byName['static-site'].port];
    assert.deepEqual(new Set(assigned).size, 2);
    for (const p of assigned) assert.ok(p >= 8000 && p < 8100);
    // laravel already holds 8000, django holds 8000 too (not unique-per-project
    // constraint — only assigned ports must avoid collisions)
    for (const p of assigned) assert.ok(p !== 8000);
    // start command carries the assigned port
    assert.match(byName['php-site'].startCommand, new RegExp(`localhost:${byName['php-site'].port}`));

    // nothing detected inside node_modules
    assert.ok(!byName['fake']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scanProjects is deterministic across runs', async () => {
  const root = makeFixtures();
  try {
    const a = await scanProjects(root, 2);
    const b = await scanProjects(root, 2);
    assert.deepEqual(
      a.map((p) => [p.path, p.port]),
      b.map((p) => [p.path, p.port])
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scanProjects respects maxDepth', async () => {
  const root = makeFixtures();
  try {
    const shallow = await scanProjects(root, 0);
    // root itself is not a project, depth 0 means don't descend
    assert.equal(shallow.length, 0);
    const depth1 = await scanProjects(root, 1);
    // group/django-app is at depth 2, so not found at depth 1
    assert.ok(!depth1.some((p) => p.name === 'django-app'));
    assert.ok(depth1.some((p) => p.name === 'next-app'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scanProjects detects a project when the root itself is one', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devdash-scan-root-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      dependencies: { '@nestjs/core': '10.0.0' },
      scripts: { dev: 'nest start --watch' },
    }));
    const projects = await scanProjects(root, 2);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].framework, 'nest');
    assert.equal(projects[0].path, fs.realpathSync(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

Note: on macOS `os.mkdtempSync(os.tmpdir())` paths live under `/var/...`, a symlink to `/private/var/...`. The implementation must therefore resolve its root with `fs.realpathSync(path.resolve(rootPath))` (try/catch, falling back to `path.resolve`), which is why the root-project test compares against `fs.realpathSync(root)`.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/devdash-agent && npm test`
Expected: FAIL — `Cannot find module '../dist/project-scanner.js'` (build succeeds but module doesn't exist yet; if build itself fails that's equivalent — the module is missing).

- [ ] **Step 4: Write the implementation**

Create `packages/devdash-agent/src/project-scanner.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { scanPorts } from './port-scanner';

// Stateless project detection, ported from scripts/project-scanner.mjs
// (incremental cache intentionally dropped — every scan is fresh).

export interface DetectedProject {
  name: string;
  path: string;
  stack: string;
  framework: string;
  language: string;
  packageManager: string | null;
  port: number | null;
  portSource: 'script' | 'env' | 'config' | 'default' | 'assigned';
  url: string | null;
  startCommand: string | null;
  running: boolean;
}

type PortSource = DetectedProject['portSource'];
type Candidate = Omit<DetectedProject, 'running'>;

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.svelte-kit', '.venv', 'venv', '__pycache__', '.cache',
  'coverage', '.idea', '.vscode', 'tmp', 'storage', 'bootstrap',
]);

const DEFAULT_PORTS: Record<string, number> = {
  nextjs: 3000, nuxt: 3000, angular: 4200, vite: 5173, cra: 3000,
  sveltekit: 5173, svelte: 5173, vue: 8080, nest: 3000, express: 3000,
  node: 3000, laravel: 8000, symfony: 8000, django: 8000, flask: 5000,
  fastapi: 8000, rails: 3000, go: 8080, rust: 8080, spring: 8080,
};

const ASSIGNED_PORT_START = 8000;

function readJSON(p: string): any {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function readText(p: string): string {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}
function fileExists(p: string): boolean {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function parseScriptPort(scripts: Record<string, string> | undefined): number | null {
  const str = JSON.stringify(scripts || {});
  let m = str.match(/(?:-p|--port)[ =]+(\d{2,5})/);
  if (m) return +m[1];
  m = str.match(/\bPORT[ =]+(\d{2,5})/);
  if (m) return +m[1];
  return null;
}

function envPort(dir: string): number | null {
  for (const f of ['.env.local', '.env']) {
    const t = readText(path.join(dir, f));
    const m = t.match(/(?:^|\n)\s*(?:PORT|APP_PORT|SERVER_PORT)\s*=\s*"?(\d{2,5})"?/);
    if (m) return +m[1];
  }
  return null;
}

function configPort(dir: string): number | null {
  for (const f of ['vite.config.ts', 'vite.config.js', 'vue.config.js',
                   'nuxt.config.ts', 'nuxt.config.js', 'svelte.config.js']) {
    const p = path.join(dir, f);
    if (!fileExists(p)) continue;
    const m = readText(p).match(/port\s*:\s*(\d{2,5})/);
    if (m) return +m[1];
  }
  return null;
}

function detectPM(dir: string): string {
  if (fileExists(path.join(dir, 'bun.lockb'))) return 'bun';
  if (fileExists(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fileExists(path.join(dir, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function runCmd(pm: string, script: string): string {
  if (pm === 'npm') return script === 'start' ? 'npm start' : `npm run ${script}`;
  if (pm === 'yarn') return `yarn ${script}`;
  if (pm === 'pnpm') return `pnpm ${script}`;
  if (pm === 'bun') return `bun run ${script}`;
  return `npm run ${script}`;
}

function pickScript(scripts: Record<string, string> | undefined): string | null {
  for (const s of ['dev', 'start', 'serve']) if (scripts && scripts[s]) return s;
  return null;
}

function docroot(dir: string): string {
  for (const d of ['public', 'web', 'www', 'htdocs', 'dist'])
    if (fileExists(path.join(dir, d))) return path.join(dir, d);
  return dir;
}

interface StackInfo {
  stack: string;
  framework: string;
  language: string;
  pkg?: any;
}

function analyzeStack(dir: string, names: string[]): StackInfo | null {
  if (names.includes('package.json')) {
    const pkg = readJSON(path.join(dir, 'package.json')) || {};
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const has = (k: string) => Object.prototype.hasOwnProperty.call(deps, k);
    const ts = has('typescript') || fileExists(path.join(dir, 'tsconfig.json'));
    const language = ts ? 'TypeScript' : 'JavaScript';

    let framework = 'node';
    if (has('next')) framework = 'nextjs';
    else if (has('nuxt') || has('nuxt3')) framework = 'nuxt';
    else if (has('@angular/core')) framework = 'angular';
    else if (has('@sveltejs/kit')) framework = 'sveltekit';
    else if (has('svelte')) framework = 'svelte';
    else if (has('@nestjs/core')) framework = 'nest';
    else if (has('react-scripts')) framework = 'cra';
    else if (has('vite')) framework = 'vite';
    else if (has('vue')) framework = 'vue';
    else if (has('express') || has('koa') || has('fastify')) framework = 'express';
    return { stack: 'node', framework, language, pkg };
  }

  if (names.includes('composer.json')) {
    const comp = readJSON(path.join(dir, 'composer.json')) || {};
    const req = { ...(comp.require || {}), ...(comp['require-dev'] || {}) };
    let framework = 'php';
    if (req['laravel/framework']) framework = 'laravel';
    else if (Object.keys(req).some((k) => k.startsWith('symfony/'))) framework = 'symfony';
    return { stack: 'php', framework, language: 'PHP' };
  }

  if (names.includes('manage.py'))
    return { stack: 'python', framework: 'django', language: 'Python' };
  if (names.includes('requirements.txt') || names.includes('pyproject.toml') || names.includes('Pipfile')) {
    const reqTxt = (readText(path.join(dir, 'requirements.txt')) +
                    readText(path.join(dir, 'pyproject.toml'))).toLowerCase();
    let framework = 'python';
    if (reqTxt.includes('fastapi')) framework = 'fastapi';
    else if (reqTxt.includes('flask')) framework = 'flask';
    else if (reqTxt.includes('django')) framework = 'django';
    return { stack: 'python', framework, language: 'Python' };
  }

  if (names.includes('go.mod'))       return { stack: 'go', framework: 'go', language: 'Go' };
  if (names.includes('Cargo.toml'))   return { stack: 'rust', framework: 'rust', language: 'Rust' };
  if (names.includes('Gemfile'))      return { stack: 'ruby', framework: 'rails', language: 'Ruby' };
  if (names.includes('pom.xml') || names.includes('build.gradle'))
    return { stack: 'java', framework: 'spring', language: 'Java' };
  if (names.includes('pubspec.yaml')) return { stack: 'flutter', framework: 'flutter', language: 'Dart' };

  if (names.some((n) => n.endsWith('.php')))
    return { stack: 'php', framework: 'php', language: 'PHP' };
  if (names.includes('index.html'))
    return { stack: 'static', framework: 'static', language: 'HTML' };

  return null;
}

function resolvePort(dir: string, info: StackInfo): { port: number | null; source: PortSource } {
  if (info.stack === 'node') {
    const sp = parseScriptPort(info.pkg?.scripts);
    if (sp) return { port: sp, source: 'script' };
    const ep = envPort(dir);
    if (ep) return { port: ep, source: 'env' };
    const cp = configPort(dir);
    if (cp) return { port: cp, source: 'config' };
    return { port: DEFAULT_PORTS[info.framework] || 3000, source: 'default' };
  }
  if (info.stack === 'python') {
    const ep = envPort(dir);
    if (ep) return { port: ep, source: 'env' };
    return { port: DEFAULT_PORTS[info.framework] || 8000, source: 'default' };
  }
  if (info.stack === 'php' && info.framework === 'laravel') {
    const ep = envPort(dir);
    if (ep) return { port: ep, source: 'env' };
    return { port: 8000, source: 'default' };
  }
  if (['go', 'rust', 'ruby', 'java'].includes(info.stack))
    return { port: DEFAULT_PORTS[info.framework] || null, source: 'default' };
  // plain php, symfony, static, flutter → assigned later
  return { port: null, source: 'assigned' };
}

function buildStartCommand(
  dir: string,
  info: StackInfo,
  port: number
): { cmd: string | null; pm?: string } {
  const f = info.framework;
  switch (info.stack) {
    case 'node': {
      const pm = detectPM(dir);
      const s = pickScript(info.pkg?.scripts);
      return { cmd: s ? runCmd(pm, s) : `${pm} install`, pm };
    }
    case 'php':
      if (f === 'laravel') return { cmd: `php artisan serve --port=${port}` };
      if (f === 'symfony') return { cmd: `symfony serve --port=${port}` };
      return { cmd: `php -S localhost:${port} -t "${docroot(dir)}"` };
    case 'static':
      return { cmd: `php -S localhost:${port} -t "${docroot(dir)}"` };
    case 'python':
      if (f === 'django')  return { cmd: `python manage.py runserver ${port}` };
      if (f === 'fastapi') return { cmd: `uvicorn main:app --reload --port ${port}` };
      if (f === 'flask')   return { cmd: `flask run --port ${port}` };
      return { cmd: 'python main.py' };
    case 'go':      return { cmd: 'go run .' };
    case 'rust':    return { cmd: 'cargo run' };
    case 'ruby':    return { cmd: `bundle exec rails server -p ${port}` };
    case 'java':    return { cmd: fileExists(path.join(dir, 'pom.xml')) ? 'mvn spring-boot:run' : './gradlew bootRun' };
    case 'flutter': return { cmd: 'flutter run' };
    default:        return { cmd: null };
  }
}

function analyzeProject(dir: string, names: string[]): Candidate | null {
  const info = analyzeStack(dir, names);
  if (!info) return null;
  const { port, source } = resolvePort(dir, info);
  const start = buildStartCommand(dir, info, port ?? ASSIGNED_PORT_START);
  return {
    name: path.basename(dir),
    path: dir,
    stack: info.stack,
    framework: info.framework,
    language: info.language,
    packageManager: start.pm || null,
    port,
    portSource: port == null ? 'assigned' : source,
    url: port ? `http://localhost:${port}` : null,
    startCommand: start.cmd,
  };
}

function findProjects(root: string, depth: number, out: Candidate[]): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  const names = entries.filter((e) => e.isFile()).map((e) => e.name);
  const proj = analyzeProject(root, names);
  if (proj) {
    out.push(proj);
    return; // stop descending once a project is found
  }
  if (depth <= 0) return;
  for (const e of entries) {
    if (e.isDirectory() && !IGNORE_DIRS.has(e.name) && !e.name.startsWith('.'))
      findProjects(path.join(root, e.name), depth - 1, out);
  }
}

export async function scanProjects(rootPath: string, maxDepth = 2): Promise<DetectedProject[]> {
  let resolved = path.resolve(rootPath);
  try { resolved = fs.realpathSync(resolved); } catch { /* keep resolved */ }

  const found: Candidate[] = [];
  findProjects(resolved, maxDepth, found);
  found.sort((a, b) => a.path.localeCompare(b.path));

  // Deterministic port assignment for php/static/etc: sorted path order,
  // first free port from 8000 that no other result uses.
  const used = new Set<number>(
    found.map((p) => p.port).filter((n): n is number => n != null)
  );
  for (const p of found) {
    if (p.port != null) continue;
    let port = ASSIGNED_PORT_START;
    while (used.has(port)) port++;
    used.add(port);
    p.port = port;
    p.url = `http://localhost:${port}`;
    if (p.startCommand) {
      p.startCommand = p.startCommand
        .replace(/localhost:\d+/, `localhost:${port}`)
        .replace(/--port=\d+/, `--port=${port}`);
    }
  }

  // Probe each port once to mark running projects.
  const uniquePorts = Array.from(new Set(found.map((p) => p.port as number)));
  const open = new Set(await scanPorts(uniquePorts));
  return found.map((p) => ({ ...p, running: p.port != null && open.has(p.port) }));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/devdash-agent && npm test`
Expected: PASS — 4 tests, 0 failures. (The probe uses real TCP against 127.0.0.1 with an 800ms timeout per port; fixture ports are almost certainly closed, so `running` is false — the tests don't assert on `running` except implicitly via shape.)

- [ ] **Step 6: Commit**

```bash
git add packages/devdash-agent/src/project-scanner.ts packages/devdash-agent/test/project-scanner.test.cjs packages/devdash-agent/package.json
git commit -m "feat(agent): stateless project folder scanner with stack/port/start-command detection"
```

---

### Task 2: Agent WebSocket wiring — `project_scan` message

**Files:**
- Modify: `packages/devdash-agent/src/websocket.ts`

**Interfaces:**
- Consumes: `scanProjects(rootPath, maxDepth)` from Task 1.
- Produces: WS protocol message — request `{type: 'project_scan', requestId, path, depth}`, response `{type: 'project_scan_result', requestId, projects: DetectedProject[], error?: string}`. Task 3 depends on these exact type strings and fields.

- [ ] **Step 1: Add import**

In `packages/devdash-agent/src/websocket.ts`, after the line `import { listDirectory } from './fs-browser';` add:

```ts
import { scanProjects } from './project-scanner';
```

- [ ] **Step 2: Add message case**

In the `switch (msg.type)` inside `handleMessage`, directly after the closing brace of `case 'fs_browse': { ... }`, add:

```ts
    case 'project_scan': {
      try {
        const projects = await scanProjects(msg.path || process.env.HOME || '/', msg.depth ?? 2);
        ws.send(JSON.stringify({ type: 'project_scan_result', requestId: msg.requestId, projects }));
      } catch (err: any) {
        ws.send(JSON.stringify({
          type: 'project_scan_result',
          requestId: msg.requestId,
          projects: [],
          error: err?.message || 'Scan failed',
        }));
      }
      break;
    }
```

- [ ] **Step 3: Verify agent builds**

Run: `cd packages/devdash-agent && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/devdash-agent/src/websocket.ts
git commit -m "feat(agent): handle project_scan message"
```

---

### Task 3: ws-server relay — pending request + HTTP endpoint

**Files:**
- Modify: `src/ws-server/index.ts`

**Interfaces:**
- Consumes: agent messages from Task 2 (`project_scan` / `project_scan_result`).
- Produces: `POST /project-scan/:machineId` with JSON body `{path: string, depth: number}` → `200 {projects: [...], error?}` or `503 {error: 'Machine offline'}`. Task 4's `requestProjectScan` in `daemon-status.ts` calls this exact endpoint.

- [ ] **Step 1: Add result dispatch case**

In `src/ws-server/index.ts`, in the daemon message switch, directly after the closing brace of `case 'fs_list': { ... }` (around line 445), add:

```ts
    case 'project_scan_result': {
      const resolver = pendingRequests.get(msg.requestId);
      if (resolver) {
        resolver(msg);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }
```

- [ ] **Step 2: Add request function**

Directly after the `requestFsBrowse` function (ends around line 690), add:

```ts
export async function requestProjectScan(
  machineId: number,
  path: string,
  depth: number
): Promise<{ projects: any[]; error?: string } | null> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return null;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(null);
    }, 60000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve({ projects: result.projects || [], error: result.error });
    });

    daemon.ws.send(JSON.stringify({
      type: 'project_scan',
      requestId,
      path,
      depth,
    }));
  });
}
```

- [ ] **Step 3: Add HTTP endpoint**

In the `server.on('request', ...)` handler, directly after the `/browse/` branch's closing `}` (before `} else if (url.pathname.startsWith('/check/')`), add:

```ts
  } else if (url.pathname.startsWith('/project-scan/') && req.method === 'POST') {
    // POST /project-scan/:machineId — scan a folder for projects via daemon
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);

    const result = await requestProjectScan(machineId, body.path || '/', body.depth ?? 2);

    if (result === null) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Machine offline' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }
```

- [ ] **Step 4: Verify it type-checks and boots**

Run: `npx tsc --noEmit 2>&1 | grep -c "ws-server" || true`
Expected: `0` (no new errors mentioning ws-server; pre-existing errors elsewhere, if any, are out of scope).

Run: `timeout 5 npx tsx src/ws-server/index.ts; echo "exit=$?"`
Expected: startup log line (e.g. listening on 50052) and `exit=124` (killed by timeout, meaning it booted without crashing). If port 50052 is busy because `npm run dev` is running, that's fine — skip this boot check.

- [ ] **Step 5: Commit**

```bash
git add src/ws-server/index.ts
git commit -m "feat(ws-server): relay project_scan requests to agent via /project-scan/:machineId"
```

---

### Task 4: Next.js — daemon helper + `/api/scan/projects` route + shared type

**Files:**
- Modify: `src/lib/daemon-status.ts`
- Create: `src/app/api/scan/projects/route.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: ws-server `POST /project-scan/:machineId` from Task 3; Drizzle tables `projects`, `projectMachines` from `@/lib/schema`; `getSession()` from `@/lib/auth`.
- Produces:
  - `requestProjectScan(machineId: number, path: string, depth: number): Promise<{projects: any[]; error?: string} | null>` in `daemon-status.ts`.
  - `POST /api/scan/projects` body `{machineId?, path, depth?}` → `{path, count, projects: ScannedProject[]}`.
  - `ScannedProject` interface in `src/types/index.ts` — Task 5's UI imports it.

- [ ] **Step 1: Add daemon helper**

At the end of `src/lib/daemon-status.ts`, add:

```ts
export async function requestProjectScan(
  machineId: number,
  path: string,
  depth: number
): Promise<{ projects: any[]; error?: string } | null> {
  try {
    const res = await fetch(`${WS_SERVER_URL}/project-scan/${machineId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, depth }),
      signal: AbortSignal.timeout(65000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Add ScannedProject type**

In `src/types/index.ts`, after the `ScanResult` interface (or at the end of the file if ordering is unclear), add:

```ts
export interface ScannedProject {
  name: string;
  path: string;
  stack: string;
  framework: string;
  language: string;
  packageManager: string | null;
  port: number | null;
  portSource: 'script' | 'env' | 'config' | 'default' | 'assigned';
  url: string | null;
  startCommand: string | null;
  running: boolean;
  // annotations added by /api/scan/projects
  existing: boolean;
  existingProjectId?: number;
  existingName?: string;
  portConflict?: boolean;
  portConflictWith?: string;
}
```

- [ ] **Step 3: Create the API route**

Create `src/app/api/scan/projects/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, projectMachines } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { requestProjectScan } from '@/lib/daemon-status';

const norm = (p: string | null | undefined) => (p || '').replace(/\/+$/, '');

// POST — scan a folder on a machine for projects, annotate against existing
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { machineId, path, depth } = await request.json();
  const targetMachine = machineId || session.machineId;
  if (!path || typeof path !== 'string') {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }
  const boundedDepth = Math.min(Math.max(parseInt(depth, 10) || 2, 0), 3);

  const result = await requestProjectScan(targetMachine, path, boundedDepth);
  if (!result) return NextResponse.json({ error: 'Machine offline' }, { status: 503 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  // Existing projects on this machine: directly owned + mapped copies
  const owned = await db.select().from(projects).where(eq(projects.machineId, targetMachine));
  const mappings = await db.select().from(projectMachines)
    .where(eq(projectMachines.machineId, targetMachine));
  const mapped = (await Promise.all(
    mappings.map(async (m) => {
      const [p] = await db.select().from(projects).where(eq(projects.id, m.projectId));
      if (!p) return null;
      return { id: p.id, name: p.name, rootPath: m.rootPath || p.rootPath, port: m.port ?? p.port };
    })
  )).filter((x): x is NonNullable<typeof x> => x !== null);

  const existing = [
    ...owned.map((p) => ({ id: p.id, name: p.name, rootPath: p.rootPath, port: p.port })),
    ...mapped,
  ];
  const byPath = new Map(
    existing.filter((e) => e.rootPath).map((e) => [norm(e.rootPath), e])
  );
  const byPort = new Map(
    existing.filter((e) => e.port).map((e) => [e.port as number, e])
  );

  const annotated = result.projects.map((d: any) => {
    const pathMatch = byPath.get(norm(d.path));
    const portMatch = d.port != null ? byPort.get(d.port) : undefined;
    return {
      ...d,
      existing: !!pathMatch,
      existingProjectId: pathMatch?.id,
      existingName: pathMatch?.name,
      portConflict: !pathMatch && !!portMatch,
      portConflictWith: !pathMatch && portMatch ? portMatch.name : undefined,
    };
  });

  return NextResponse.json({ path, count: annotated.length, projects: annotated });
}
```

- [ ] **Step 4: Verify with a real request**

Requires the dev stack and a connected local agent. Start in background if not already running: `npm run dev` (background), and the agent: `cd packages/devdash-agent && npm run build && node dist/cli.js start --profile local` (background). Then, with a logged-in session cookie exported from the browser (or skip to Task 7's browser-level E2E if extracting a cookie is impractical):

```bash
curl -s -X POST http://localhost:50051/api/scan/projects \
  -H 'Content-Type: application/json' \
  -H "Cookie: $DEVDASH_COOKIE" \
  -d '{"path":"/Volumes/SandeepSSD/www/tools","depth":2}' | head -c 2000
```

Expected: JSON with `count` and `projects` array where entries carry `framework`, `port`, `startCommand`, `existing`. Without a cookie, expected: `{"error":"Not authenticated"}` (which still proves routing works). Full UI verification happens in Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/lib/daemon-status.ts src/types/index.ts src/app/api/scan/projects/route.ts
git commit -m "feat(api): POST /api/scan/projects — folder scan via daemon with existing-project annotation"
```

---

### Task 5: ProjectModal — `initialData` prefill for new projects

**Files:**
- Modify: `src/components/ProjectModal.tsx`

**Interfaces:**
- Produces: new optional prop `initialData?: Partial<ProjectFormData>` — when `editingProject` is null, form fields default to `initialData` values. Task 6 uses this for "Edit & add".
- Existing behavior unchanged when `initialData` is not passed.

- [ ] **Step 1: Extend props and defaults**

In `src/components/ProjectModal.tsx`:

1. Change the props interface:

```ts
interface ProjectModalProps {
  open: boolean;
  editingProject: Project | null;
  machineId?: number;
  initialData?: Partial<ProjectFormData>;
  onClose: () => void;
  onSave: (data: ProjectFormData, id?: number) => void;
}
```

2. Change the component signature line to:

```ts
export default function ProjectModal({ open, editingProject, machineId, initialData, onClose, onSave }: ProjectModalProps) {
```

3. Just after `const isEdit = !!editingProject;` add a merged defaults object:

```ts
  const init: Partial<ProjectFormData> = editingProject ?? initialData ?? {};
```

(`Project` is structurally compatible with `Partial<ProjectFormData>` for the shared fields; if TypeScript complains about nullable columns, use `const init = (editingProject ?? initialData ?? {}) as Partial<ProjectFormData> & Record<string, any>;`)

4. Replace every `defaultValue={editingProject?.X || fallback}` with `init`:

- name: `defaultValue={init.name || ''}`
- port: `defaultValue={init.port || ''}`
- addonPorts: `defaultValue={init.addonPorts || ''}`
- url: `defaultValue={init.url || ''}`
- runner select: `defaultValue={init.runner || 'npm'}`
- status select: `defaultValue={init.status || 'active'}`
- startDate: `defaultValue={init.startDate || today()}`
- techStack: `defaultValue={init.techStack || ''}`
- tags: `defaultValue={init.tags || ''}`
- description: `defaultValue={init.description || ''}`
- notes: `defaultValue={init.notes || ''}`

5. In the `useEffect` that runs on open, change the rootPath line to:

```ts
      setRootPath(editingProject?.rootPath || initialData?.rootPath || '');
```

and add `initialData` to the dependency array: `[open, editingProject, initialData]`.

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20` (run in background; it's a full Next build)
Expected: build succeeds. Alternatively `npx tsc --noEmit` for a faster type-only check.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProjectModal.tsx
git commit -m "feat(ui): ProjectModal accepts initialData to prefill new-project form"
```

---

### Task 6: `ProjectFolderScanner` component + `/scanner` page wiring

**Files:**
- Create: `src/components/ProjectFolderScanner.tsx`
- Modify: `src/app/(dash)/scanner/page.tsx`

**Interfaces:**
- Consumes: `useDashboard()` (`session`, `onlineMachineIds`, `reloadProjects`), `useToast()`, `FsBrowserModal`, `ProjectModal` with `initialData` (Task 5), `POST /api/scan/projects` (Task 4), existing `POST /api/projects`.
- Produces: default-export React component `<ProjectFolderScanner />` (no props).

- [ ] **Step 1: Create the component**

Create `src/components/ProjectFolderScanner.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  FolderSearch, Loader2, Plus, Pencil, CheckCircle2, AlertTriangle, X,
} from 'lucide-react';
import { useToast } from './Toast';
import { useDashboard } from './dashboard/DashboardContext';
import FsBrowserModal from './FsBrowserModal';
import ProjectModal from './ProjectModal';
import { ProjectFormData, ScannedProject } from '@/types';

function today() {
  return new Date().toISOString().split('T')[0];
}

export function toFormData(d: ScannedProject): ProjectFormData {
  const runner =
    d.packageManager === 'yarn' ? 'yarn'
    : d.packageManager === 'pnpm' || d.packageManager === 'bun' ? 'custom'
    : d.stack === 'node' ? 'npm'
    : d.stack === 'php' || d.stack === 'static' ? 'php'
    : d.stack === 'python' ? 'python'
    : 'custom';
  const stackBits = [d.framework, d.language].filter(
    (s, i, arr) => s && arr.indexOf(s) === i
  );
  return {
    name: d.name,
    port: d.port,
    addonPorts: '',
    url: d.url || '',
    techStack: stackBits.join(', '),
    description: `Detected ${d.framework}`,
    startDate: today(),
    runner,
    status: 'active',
    tags: 'scanned',
    notes: d.startCommand || '',
    rootPath: d.path,
  };
}

type RowState = 'idle' | 'adding' | 'added' | 'error';

export default function ProjectFolderScanner() {
  const { session, onlineMachineIds, reloadProjects } = useDashboard();
  const { toast } = useToast();

  const machineId = session?.machineId;
  const online = machineId != null && onlineMachineIds.includes(machineId);

  const [browseOpen, setBrowseOpen] = useState(false);
  const [folder, setFolder] = useState('');
  const [depth, setDepth] = useState(2);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<ScannedProject[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [bulkAdding, setBulkAdding] = useState(false);
  const [editTarget, setEditTarget] = useState<ScannedProject | null>(null);

  async function runScan() {
    if (!folder.trim()) { setError('Choose a folder to scan first.'); return; }
    setScanning(true);
    setError('');
    setResults(null);
    setSelected(new Set());
    setRowState({});
    try {
      const r = await fetch('/api/scan/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folder.trim(), depth }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(
          data.error === 'Machine offline'
            ? 'Machine offline — start the devdash-agent on this machine and try again.'
            : data.error || 'Scan failed'
        );
      } else {
        setResults(data.projects as ScannedProject[]);
      }
    } catch {
      setError('Scan failed — server unreachable or request timed out.');
    }
    setScanning(false);
  }

  async function postProject(data: ProjectFormData): Promise<boolean> {
    try {
      const r = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async function addOne(p: ScannedProject, data?: ProjectFormData): Promise<boolean> {
    setRowState((s) => ({ ...s, [p.path]: 'adding' }));
    const ok = await postProject(data || toFormData(p));
    setRowState((s) => ({ ...s, [p.path]: ok ? 'added' : 'error' }));
    if (ok) setSelected((sel) => { const n = new Set(sel); n.delete(p.path); return n; });
    return ok;
  }

  async function quickAdd(p: ScannedProject) {
    const ok = await addOne(p);
    toast(ok ? `Added ${p.name}` : `Failed to add ${p.name}`);
    if (ok) await reloadProjects();
  }

  async function addSelected() {
    if (!results) return;
    const targets = results.filter(
      (p) => selected.has(p.path) && !p.existing && rowState[p.path] !== 'added'
    );
    if (!targets.length) { toast('Nothing selected'); return; }
    setBulkAdding(true);
    let ok = 0;
    for (const p of targets) {
      if (await addOne(p)) ok++;
    }
    setBulkAdding(false);
    toast(`Added ${ok} of ${targets.length} project${targets.length === 1 ? '' : 's'}`);
    await reloadProjects();
  }

  function toggle(path: string) {
    setSelected((sel) => {
      const n = new Set(sel);
      if (n.has(path)) n.delete(path); else n.add(path);
      return n;
    });
  }

  const addable = (results || []).filter((p) => !p.existing && rowState[p.path] !== 'added');
  const allSelected = addable.length > 0 && addable.every((p) => selected.has(p.path));

  return (
    <div className="glass" style={{ borderRadius: 'var(--r-sm)', padding: '20px 22px', marginBottom: 24 }}>
      <div className="label flex items-center gap-1.5" style={{ marginBottom: 12 }}>
        <FolderSearch size={14} style={{ color: 'var(--muted)' }} />
        Scan a folder for projects
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          className="inp flex-1 font-mono"
          style={{ minWidth: 220, fontSize: 13 }}
          placeholder="/Users/you/www"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        />
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setBrowseOpen(true)}
          disabled={!machineId}
        >
          Browse
        </button>
        <select
          className="inp"
          style={{ width: 110 }}
          value={depth}
          onChange={(e) => setDepth(parseInt(e.target.value, 10))}
          title="How many folder levels deep to look for projects"
        >
          <option value={1}>Depth 1</option>
          <option value={2}>Depth 2</option>
          <option value={3}>Depth 3</option>
        </select>
        <button className="btn-grad flex items-center gap-1.5" onClick={runScan} disabled={scanning || !online}>
          {scanning ? <Loader2 size={15} className="animate-spin" /> : <FolderSearch size={15} />}
          {scanning ? 'Scanning…' : 'Scan projects'}
        </button>
      </div>

      {!online && (
        <p className="text-[12.5px] mt-2" style={{ color: 'var(--offline)' }}>
          This machine&apos;s agent is offline — start <code className="font-mono">devdash-agent</code> to scan folders.
        </p>
      )}
      {error && (
        <p className="text-[13px] mt-3" style={{ color: 'var(--offline)' }}>{error}</p>
      )}

      {/* Results */}
      {results && (
        <div style={{ marginTop: 18 }}>
          <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 10 }}>
            <div className="text-[13px]" style={{ color: 'var(--muted)' }}>
              Found <strong style={{ color: 'var(--txt)' }}>{results.length}</strong> project{results.length === 1 ? '' : 's'}
              {results.some((p) => p.existing) &&
                ` · ${results.filter((p) => p.existing).length} already added`}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost"
                onClick={() =>
                  setSelected(allSelected ? new Set() : new Set(addable.map((p) => p.path)))
                }
                disabled={addable.length === 0}
              >
                {allSelected ? 'Clear selection' : 'Select all new'}
              </button>
              <button
                className="btn-grad flex items-center gap-1.5"
                onClick={addSelected}
                disabled={bulkAdding || selected.size === 0}
              >
                {bulkAdding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Add {selected.size} selected
              </button>
              <button className="btn-icon" onClick={() => { setResults(null); setSelected(new Set()); setRowState({}); }} aria-label="Clear results">
                <X size={15} />
              </button>
            </div>
          </div>

          {results.length === 0 && (
            <p className="text-[13px]" style={{ color: 'var(--dim)' }}>
              No projects detected in this folder. Try increasing the depth.
            </p>
          )}

          <div style={{ overflowX: 'auto' }}>
            {results.map((p) => {
              const state = rowState[p.path] || 'idle';
              const disabled = p.existing || state === 'added';
              return (
                <div
                  key={p.path}
                  className="flex items-center gap-3 py-2 px-2 rounded"
                  style={{
                    borderBottom: '1px solid var(--b1)',
                    opacity: disabled ? 0.5 : 1,
                    minWidth: 640,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.path)}
                    onChange={() => toggle(p.path)}
                    disabled={disabled}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span title={p.running ? 'Port is responding' : 'Port not responding'}>
                    {p.running ? '🟢' : '⚪'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-[13.5px]" style={{ color: 'var(--txt)' }}>{p.name}</strong>
                      <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded" style={{ background: 'var(--b1)', color: 'var(--accent)' }}>
                        {p.framework}
                      </span>
                      {p.existing && (
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: 'var(--b1)', color: 'var(--muted)' }}>
                          <CheckCircle2 size={11} /> already added{p.existingName && p.existingName !== p.name ? ` as ${p.existingName}` : ''}
                        </span>
                      )}
                      {state === 'added' && (
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: 'var(--b1)', color: 'var(--live, var(--accent))' }}>
                          <CheckCircle2 size={11} /> added
                        </span>
                      )}
                      {state === 'error' && (
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded" style={{ background: 'var(--b1)', color: 'var(--offline)' }}>
                          add failed
                        </span>
                      )}
                      {p.portConflict && !p.existing && (
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: 'var(--b1)', color: 'var(--offline)' }} title={`Port ${p.port} is already used by ${p.portConflictWith}`}>
                          <AlertTriangle size={11} /> port in use by {p.portConflictWith}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[11.5px] truncate" style={{ color: 'var(--dim)' }}>
                      {p.path}{p.startCommand ? `  ·  ${p.startCommand}` : ''}
                    </div>
                  </div>
                  <div className="font-mono text-[12.5px] shrink-0" style={{ color: 'var(--muted)' }}>
                    :{p.port ?? '—'}
                    {p.portSource === 'assigned' && (
                      <span className="text-[10px]" style={{ color: 'var(--dim)' }}> (suggested)</span>
                    )}
                  </div>
                  {!disabled && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="btn-icon"
                        title="Edit & add"
                        onClick={() => setEditTarget(p)}
                        disabled={state === 'adding'}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="btn-icon"
                        title="Add project"
                        onClick={() => quickAdd(p)}
                        disabled={state === 'adding'}
                      >
                        {state === 'adding' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Folder picker */}
      {machineId != null && (
        <FsBrowserModal
          open={browseOpen}
          machineId={machineId}
          currentPath={folder || '/'}
          onSelect={(p) => setFolder(p)}
          onClose={() => setBrowseOpen(false)}
        />
      )}

      {/* Edit & add */}
      <ProjectModal
        open={editTarget !== null}
        editingProject={null}
        machineId={machineId}
        initialData={editTarget ? toFormData(editTarget) : undefined}
        onClose={() => setEditTarget(null)}
        onSave={async (data) => {
          const target = editTarget!;
          setEditTarget(null);
          const ok = await addOne(target, data);
          toast(ok ? `Added ${data.name}` : `Failed to add ${data.name}`);
          if (ok) await reloadProjects();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire into the scanner page**

Replace the full contents of `src/app/(dash)/scanner/page.tsx` with:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Radar } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import PageHeader from '@/components/dashboard/PageHeader';
import PortScanner from '@/components/PortScanner';
import ProjectFolderScanner from '@/components/ProjectFolderScanner';

export default function ScannerPage() {
  const router = useRouter();
  const { projects } = useDashboard();
  return (
    <div>
      <PageHeader
        title="Scanner"
        subtitle="Discover projects in a folder, or scan ports and register what you find."
        icon={<Radar size={20} />}
      />
      <ProjectFolderScanner />
      <PortScanner visible projects={projects} onQuickAdd={(port) => router.push(`/projects?new=${port}`)} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: exits 0 (or only pre-existing errors unrelated to these files — compare against `git stash; npx tsc --noEmit; git stash pop` if unsure).

- [ ] **Step 4: Commit**

```bash
git add src/components/ProjectFolderScanner.tsx "src/app/(dash)/scanner/page.tsx"
git commit -m "feat(ui): project folder scanner on /scanner — pick folder, scan, multi-select add"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only)

**Interfaces:** exercises the full chain from Task 1–6.

- [ ] **Step 1: Build agent and start the stack**

```bash
cd packages/devdash-agent && npm run build
node dist/cli.js start --profile local   # background — local agent from source
```

```bash
npm run dev   # background, repo root — Next.js :50051 + ws-server :50052
```

Expected: agent logs `Connected to server` and `Authenticated as machine <id>`.

- [ ] **Step 2: Drive the UI**

In a browser (or with browser automation), logged into DevDash at `http://localhost:50051`:

1. Go to `/scanner` — the "Scan a folder for projects" panel renders above the port scanner; the machine-offline warning must NOT show.
2. Click **Browse** → FsBrowserModal opens → navigate to a folder containing real projects (e.g. `/Volumes/SandeepSSD/www/tools`) → Select This Directory.
3. Click **Scan projects** → results appear; `devdash` itself should be detected (nextjs, TypeScript, port 50051) and flagged **already added** if registered.
4. Verify a running project shows 🟢 and its detected port.
5. Select one new project → **Add 1 selected** → toast "Added 1 of 1 project"; row flips to "added"; project appears on `/projects`.
6. Click **Edit & add** (pencil) on another new project → ProjectModal opens prefilled (name, port, URL, tech stack, root path, notes with start command) → change the name → Create project → appears on `/projects`.
7. Re-scan the same folder → both just-added projects now show "already added".
8. Stop the agent (`Ctrl+C` on its process) → re-scan → inline error "Machine offline — start the devdash-agent…".

- [ ] **Step 3: Run agent tests one final time**

Run: `cd packages/devdash-agent && npm test`
Expected: PASS.

- [ ] **Step 4: Commit any fixes found, then push**

```bash
git status   # should be clean apart from intentional fixes
git push origin main
```

Rollout reminder (post-merge, not part of this plan): release the agent so remote machines pick up `project_scan` — `cd packages/devdash-agent && npm run release`. Machines still on an older agent answer nothing for `project_scan` (unknown message type is logged and ignored), so the ws-server times out after 60s and the UI shows the offline/timeout error — acceptable degraded behavior until they self-update.
