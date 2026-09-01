<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# dashboard

## Purpose

App chrome and the single client-side orchestrator. Pages under `src/app/(dash)/` consume `useDashboard()` and stay presentational. `Shell` is the auth gate.

## Key Files

| File | Description |
|------|-------------|
| `DashboardContext.tsx` | Session, projects, shared projects, services, online machine IDs, stats, filters, project CRUD, process actions, terminal dock state, overlay navigation. |
| `Shell.tsx` | Unauthenticated → `LoginPage`; `requires2faEnrollment` → `TwoFactorWizard`. API enforces 2FA independently. |
| `Sidebar.tsx` | Nav. |
| `Topbar.tsx` | Top bar (machine switch, connection, notifications). |
| `PageHeader.tsx` | Per-page header. |
| `GlobalOverlays.tsx` | Renders create/edit/delete/share overlays from the URL. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- New global state belongs in `DashboardContext`, not in a page.
- New overlays: add a query param and a branch in `GlobalOverlays`. Don't add `useState(showModal)`.
- Terminal dock state persists in `sessionStorage` (`devdash-open-terminals`, `devdash-active-terminal`, `devdash-docked-height`).

### Testing Requirements

No dedicated tests. Context changes affect every dash page — check list + detail + terminals.

### Common Patterns

React context + `useDashboard()` hook export.

## Dependencies

### Internal

`src/hooks/useDashboardSocket.ts`, `src/types/`, `/api/projects` and friends.

### External

React 19.

<!-- MANUAL: -->
