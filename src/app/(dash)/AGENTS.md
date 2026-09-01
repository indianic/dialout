<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# (dash)

## Purpose

Authenticated product UI. The route group layout wraps every page here in `Shell` (unauthenticated → `LoginPage`; `requires2faEnrollment` → `TwoFactorWizard`). Pages consume `useDashboard()` and stay presentational. Overlays (`?new=1`, `?edit=<id>`, `?delete=<id>`, `?share=<id>`, `?tab=notes`) are rendered by `GlobalOverlays` from the URL.

Leaf page folders (`projects/[id]/`, `ai/[machineId]/[tmuxName]/`, …) contain only `page.tsx` — they are listed here rather than given their own AGENTS.md.

## Key Files

| File | Description |
|------|-------------|
| `layout.tsx` | Dash layout: `Shell` + sidebar/topbar. Inherits root `<Suspense>` needs for searchParams. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `projects/` | Project list (`page.tsx`, `loading.tsx`) and detail (`[id]/page.tsx`) |
| `shared/` | Projects shared with the current user (read-only + comments) |
| `scanner/` | Port / folder scanner |
| `terminals/` | Live tmux registry split into **Local** (`origin !== 'browser'`) and **Web** (`origin === 'browser'`) tabs |
| `ai/` | AI session list; `[machineId]/[tmuxName]/` is the chat |
| `services/` | System services |
| `machines/` | Machines + API keys |
| `settings/` | User / terminal settings |
| `profile/` | Profile + 2FA management |
| `help/` | In-app help; `help/agent/` is agent install |

## For AI Agents

### Working In This Directory

- Do not add local modal state. Put the overlay in the URL so it is linkable and Escape-closable.
- `/terminals` Local vs Web split is load-bearing — tmux status bar is turned off per-session for `dd-*` only (`applyBrowserSessionOptions`); native sessions keep theirs.
- `/ai` never parses the TUI. Transcripts are tailed on the agent and normalised into `AiEvent`. Don't add a "scrape the pane" shortcut.

### Testing Requirements

Presentational. Logic tests live next to extracted modules (`src/components/ai/*.test.ts`, `src/lib/*.test.ts`).

### Common Patterns

`export default function Page()` + `useDashboard()`.

## Dependencies

### Internal

`src/components/dashboard/`, `src/components/`, `src/hooks/`, `src/app/api/`

### External

`next/navigation`.

<!-- MANUAL: -->
