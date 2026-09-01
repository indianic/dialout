<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# app

## Purpose

Next.js 15 App Router tree. `(dash)` is the authenticated product UI. `api/` is the REST surface. `terminal/` and `sessions/` sit **outside** the dash group because they need their own `<Suspense>` boundary (they do not inherit the group layout).

## Key Files

| File | Description |
|------|-------------|
| `layout.tsx` | Root HTML shell, fonts, `globals.css`. |
| `page.tsx` | 5-line redirect into the dashboard. |
| `not-found.tsx` | App-wide 404. |
| `globals.css` | Tailwind layers and global tokens. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `(dash)/` | Authenticated dashboard pages (see `(dash)/AGENTS.md`) |
| `api/` | REST route handlers (see `api/AGENTS.md`) |
| `terminal/` | Full-screen tmux attach + mobile terminal (see `terminal/AGENTS.md`) |
| `sessions/` | Recording playback (see `sessions/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- `(dash)` pages consume `useDashboard()` and stay presentational. Orchestration lives in `src/components/dashboard/DashboardContext.tsx`.
- Overlays are query-param driven and rendered by `GlobalOverlays` — do not add per-page modal booleans.
- Routes outside `(dash)` must bring their own `<Suspense>` if they use `useSearchParams` / client hooks that the group layout already wraps.
- Auth is **not** uniform across `api/`. Many routes call `getSession()` + `isEnrolled()`; several older ones do not. See `api/AGENTS.md` before adding a new route.

### Testing Requirements

Page/route behavior is mostly covered indirectly (lib unit tests, manual). New API routes should at least have a session/ownership story documented.

### Common Patterns

- App Router: `page.tsx` / `layout.tsx` / `loading.tsx` / `route.ts`.
- Dynamic segments: `[id]`, `[machineId]`, `[tmuxName]`, `[port]`, `[[...path]]`.

## Dependencies

### Internal

`src/components/`, `src/lib/`, `src/hooks/`, `src/types/`

### External

`next/navigation`, React 19.

<!-- MANUAL: -->
