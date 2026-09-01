<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# components

## Purpose

Client UI for the dashboard. Most feature components live **flat** in this directory (historical layout — about 48 files). Feature clusters that grew large enough to need a folder: `dashboard/` (shell + orchestrator), `ai/` (chat surface), `help/` (docs renderer).

## Key Files

| File | Description |
|------|-------------|
| `LoginPage.tsx` | PIN login. Unauthenticated shell destination. |
| `TwoFactorWizard.tsx` | Mandatory TOTP enrollment. |
| `OtpInput.tsx` | Digit OTP field. |
| `ThemeProvider.tsx` | Light/dark theme. |
| `Toast.tsx` | Toast notifications. |
| `ProjectCard.tsx` / `ProjectGrid.tsx` / `ProjectTable.tsx` | Projects list (view pref in `localStorage`). |
| `ProjectModal.tsx` | Create/edit project. Overlay, not a local boolean. |
| `FilterBar.tsx` / `EmptyState.tsx` / `Pagination.tsx` | List chrome. |
| `ProcessControls.tsx` | Start/stop/restart a project's process via the agent. |
| `PortScanner.tsx` / `ProjectFolderScanner.tsx` | Scanner UI. |
| `FsBrowserModal.tsx` | Remote filesystem browse. |
| `RunCommandModal.tsx` | Run a command on a machine. |
| `DrawerNotes.tsx` / `DrawerTodos.tsx` / `DrawerComments.tsx` / `DrawerCredentials.tsx` | Project drawers. |
| `ShareModal.tsx` / `SharingManagement.tsx` | Project sharing. |
| `DeleteModal.tsx` / `BulkDeleteModal.tsx` | Destructive confirms. |
| `MachineManagement.tsx` / `AddMachineModal.tsx` | Machines + API keys. |
| `SettingsPanel.tsx` / `ProfilePage.tsx` | Settings / profile. |
| `SystemServices.tsx` | Tracked system services. |
| `NotificationDrawer.tsx` / `ConnectionPill.tsx` | Notifications + agent connection. |
| `Terminal.tsx` / `TerminalPanel.tsx` / `TerminalDockBar.tsx` | Desktop terminal (xterm). Tab list is in **localStorage** (ids must outlive the browser tab). |
| `TerminalComposer.tsx` / `TerminalSearchBar.tsx` / `TerminalSettingsDrawer.tsx` / `TerminalNamingSettings.tsx` | Terminal chrome. |
| `terminal-themes.ts` / `terminal-keys.ts` / `terminal-panel.css` | Terminal theming, key maps, styles. |
| `MobileTerminalShell.tsx` / `KeyChipBar.tsx` / `mobile-term-prefs.ts` / `mobile-terminal.css` | Phone terminal. |
| `RecordingsPanel.tsx` | Session recording list/playback entry. |
| `useFullscreen.ts` | Fullscreen helper. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `dashboard/` | Shell, sidebar, topbar, overlays, `DashboardContext` (see `dashboard/AGENTS.md`) |
| `ai/` | AI session chat UI (see `ai/AGENTS.md`) |
| `help/` | Help article renderer (see `help/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Don't open raw `WebSocket`s — use `src/hooks/`.
- Overlays are URL-driven. `GlobalOverlays` owns them.
- Terminal dock state: `sessionStorage` keys `devdash-open-terminals`, `devdash-active-terminal`, `devdash-docked-height`. Terminal **tab list** is `localStorage` on purpose.
- Projects list view preference is `localStorage`.
- Keep components presentational; mutations go through `useDashboard()` or a dedicated fetch.

### Testing Requirements

AI-cluster tests are colocated under `ai/*.test.ts`. Other components are largely untested — prefer extracting logic (as `ai/` does) over adding RTL for the whole tree unless asked.

### Common Patterns

- `'use client'` on anything that touches hooks/browser APIs.
- lucide-react for icons.
- Tailwind utility classes; no CSS modules except the terminal CSS files.

## Dependencies

### Internal

`src/hooks/`, `src/types/`, `src/components/dashboard/DashboardContext.tsx`

### External

`xterm` + addons, `lucide-react`, `react-markdown` / `remark-gfm` (help + notes).

<!-- MANUAL: -->
