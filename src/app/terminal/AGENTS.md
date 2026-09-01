<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# terminal

## Purpose

Full-screen tmux attach (peek/drive) and the phone terminal. **Outside** the `(dash)` group — these pages need their own `<Suspense>` boundary because they don't inherit the group layout's.

## Key Files

| File | Description |
|------|-------------|
| `terminal-attach.css` | Full-screen attach layout. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `[machineId]/[name]/` | Full-screen attach to a named tmux session (`page.tsx` only) |
| `mobile/[projectId]/` | Phone terminal shell (`page.tsx` only) |

## For AI Agents

### Working In This Directory

- Attach connections skip recording (ws-server: `tmuxSession` set). Don't add a second recorder here.
- Mobile prefs live in `src/components/mobile-term-prefs.ts`; chrome is `MobileTerminalShell` + `KeyChipBar`.
- Browser sessions resume by deterministic `tmuxSessionName()` — `openSession` checks `tmuxSessionExists(dd-<sessionId>)` via `list-sessions` (not `tmux has-session`, whose target matching falls back to prefix/fnmatch and would attach `dd-abc` to `dd-abcdef`). The tab's startup command is **not** replayed on reattach.

### Testing Requirements

Manual: desktop attach + mobile viewport. No unit tests in this folder.

### Common Patterns

Client page + `useDevDashSocket().subscribe(sessionId)`.

## Dependencies

### Internal

`src/components/Terminal.tsx`, `MobileTerminalShell.tsx`, `src/hooks/useDevDashSocket.ts`

### External

xterm (desktop).

<!-- MANUAL: -->
