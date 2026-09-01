# Project Folder Scanner — Design

Date: 2026-07-05
Status: Approved

## Goal

Let a user pick a folder on any machine running the devdash-agent, scan it for
development projects (stack, port, start command, URL), review the results on
the `/scanner` page, and add selected projects to that machine's catalog —
individually (with edit) or in bulk.

Source of the detection logic: `scripts/project-scanner.mjs` (standalone
prototype, kept as reference).

## Decisions

- **Scan runs in the agent** (`packages/devdash-agent`), following the
  existing `fs_browse` message pattern. Works on remote machines; requires an
  agent release for them.
- **Duplicates are marked, not hidden**: results matching an existing project
  (by `rootPath`, port as secondary hint) are greyed out with an
  "already added" badge and cannot be re-added.
- **No incremental cache**: each scan is a fresh, stateless analysis. The
  prototype's fingerprint cache is dropped.

## Architecture

```
/scanner page (ProjectFolderScanner.tsx)
  └─ POST /api/scan/projects {machineId, path, depth}
       └─ requestProjectScan() in src/lib/daemon-status.ts
            └─ ws-server HTTP POST /project-scan/:machineId
                 └─ WS message project_scan → agent
                      └─ project-scanner.ts → project_scan_result
```

### 1. Agent — `packages/devdash-agent/src/project-scanner.ts` (new)

`scanProjects(rootPath: string, maxDepth: number): Promise<DetectedProject[]>`

Ported from the prototype:
- Walk `rootPath` up to `maxDepth` levels; skip `ignoreDirs`
  (node_modules, .git, vendor, dist, …) and dot-directories; stop descending
  into a directory once it is identified as a project.
- Stack detection: package.json deps (next/nuxt/angular/sveltekit/svelte/
  vite/cra/nest/vue/express), composer.json (laravel/symfony/php),
  manage.py / requirements.txt / pyproject.toml (django/flask/fastapi),
  go.mod, Cargo.toml, Gemfile, pom.xml/build.gradle, pubspec.yaml,
  loose `*.php`, `index.html` (static).
- Port resolution order: script flags (`-p`/`--port`) → `.env`/`.env.local`
  (`PORT`/`APP_PORT`/`SERVER_PORT`) → framework config files (vite/vue/nuxt/
  svelte config `port:`) → framework default.
- PHP/static/no-port projects get a deterministic suggested port from 8000+
  (skipping ports already used by other results in this scan), flagged
  `portSource: 'assigned'`.
- Start command derived per stack (npm/yarn/pnpm/bun script, artisan serve,
  `php -S`, manage.py runserver, uvicorn, flask, go run, cargo run, etc.),
  with docroot detection (public/web/www/htdocs/dist) for PHP/static.
- Each result's port gets a fast local TCP probe → `running: boolean`.

Result shape:
```ts
interface DetectedProject {
  name: string; path: string;
  stack: string; framework: string; language: string;
  packageManager: string | null;
  port: number | null; portSource: 'script'|'env'|'config'|'default'|'assigned';
  url: string | null;
  startCommand: string | null;
  running: boolean;
}
```

`websocket.ts`: handle `project_scan` message `{requestId, path, depth}`,
reply `project_scan_result` `{requestId, projects}` (errors reply with
`{requestId, error}`).

### 2. ws-server — `src/ws-server/index.ts`

`POST /project-scan/:machineId` with body `{path, depth}` — same
pending-request correlation used by `/browse/`, timeout 60s.

### 3. Next.js server

- `src/lib/daemon-status.ts`: `requestProjectScan(machineId, path, depth)`
  (fetch timeout 65s).
- New route `src/app/api/scan/projects/route.ts` — `POST`:
  auth via `getSession()`; relays to daemon; on success loads the machine's
  registered projects (owned + mapped, as in `GET /api/projects`) and
  annotates each result: `existing: boolean`, `existingProjectId?`,
  `existingName?`. Match rule: normalized `rootPath` equality; if no path
  match, same non-null port sets `portConflict: true` (informational only).
  Machine offline → 503 `{error: 'Machine offline'}`.
- Project creation reuses existing `POST /api/projects`; the client submits
  selected results one at a time. No bulk endpoint.

### 4. UI — `/scanner` page

New `src/components/ProjectFolderScanner.tsx`, rendered as a section on
`src/app/(dash)/scanner/page.tsx` alongside the existing `PortScanner`.

Flow:
1. Folder picker button opens the existing `FsBrowserModal`
   (machineId = session machine). Depth select 1–3 (default 2). Scan button.
2. During scan: spinner + "Scanning <path>…". Errors (offline, timeout)
   render inline with a hint to start the agent.
3. Results table, one row per detected project:
   `[checkbox] [🟢/⚪] name  framework-badge  port(+"suggested" hint)
   url  path  startCommand` — existing projects greyed, unselectable,
   "already added" badge; `portConflict` rows show a small warning hint.
4. Toolbar: "Select all new" / "Clear selection" / **Add N selected** /
   "Clear results". Per row: **Edit & add** (opens existing `ProjectModal`
   prefilled) and quick **Add**.
5. Bulk add posts sequentially, shows per-row success/error state, toasts a
   summary, and refreshes the dashboard project list.

Field mapping → `ProjectFormData`:
| Scanner field | Project field |
|---|---|
| name | name |
| port | port |
| url | url |
| path | rootPath |
| framework + language | techStack (e.g. "nextjs, TypeScript") |
| packageManager/stack | runner: npm→npm, yarn→yarn, pnpm/bun→custom; php/laravel/symfony/static→php; python stacks→python; other→custom |
| startCommand | description: "Detected <framework> · start: <cmd>" |
| — | tags: "scanned"; status: "active" |

## Error handling

- Agent offline → 503, UI shows "Machine offline — start the devdash-agent".
- Scan exception on agent (bad path, permissions) → `error` in result,
  surfaced inline.
- Timeout (60s ws-server / 65s fetch) → UI error with retry.
- Individual add failures during bulk add don't abort the batch; failed rows
  stay selected with an error marker.

## Testing

- Agent: unit-style test of `scanProjects` against fixture directories
  (next+ts, vite, laravel, plain php, static html, django) verifying stack,
  port, start command, assigned-port determinism.
- Manual e2e: run agent locally from source (`node dist/cli.js start
  --profile local`), scan a real folder, add a project, verify it appears on
  the dashboard.

## Rollout

- Local machine: works with agent run from source.
- Remote machines (Server7, SKM Office Desktop): publish agent
  (`cd packages/devdash-agent && npm run release`) so they self-update.
- ws-server changes deploy via the normal GitLab CI pipeline.
