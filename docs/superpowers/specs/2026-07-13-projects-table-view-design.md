# Projects: Table View, Faceted Filter & Bulk Delete — Design

**Date:** 2026-07-13
**Status:** Approved for planning

## Goal

Add three capabilities to the projects listing (`/projects`) without changing the existing card view:

1. **Table view** — a flat, sortable alternative to the card grid, toggled per browser.
2. **Faceted search & filter** — keep the existing global search + runner/status filters, add Tech and Tags facets, all composing over the full dataset.
3. **Bulk Select & Delete** — checkbox selection and multi-delete, available in table view only.

The card view (`ProjectGrid` / `ProjectCard`) and its Live/Offline/Archived sectioning stay exactly as they are.

## Context

Current architecture (as of this spec):

- `src/app/(dash)/projects/page.tsx` is the orchestrator. It reads from `useDashboard()`, applies search + runner + status-tab filters inline, and passes the filtered list to `ProjectGrid`.
- `ProjectGrid` renders Live/Offline/Archived sections of `ProjectCard`s with a client-side `Pagination`.
- Global search comes from the header (`useDashboard().search`, Cmd+K) and already scans the whole dataset client-side.
- Deletion is single-item: `openDelete(id)` sets a query-param overlay → `DeleteModal` → `deleteProject(id)` → `DELETE /api/projects/[id]` (cascades `projectNotes` + `projectTodos`).
- `GET /api/projects` returns only projects scoped to `session.machineId` (owned + machine-mapped). All rows shown are on the current machine, so a "machine" facet would be meaningless and is intentionally excluded.

## Design

### 1. View toggle (Card ↔ Table)

- A segmented `Card | Table` toggle in the projects page filter row.
- View state persisted to `localStorage` under key `devdash-projects-view`; value is `'card'` or `'table'`; defaults to `'card'` on first visit and when the stored value is invalid.
- The toggle lives in `page.tsx` local state seeded from `localStorage`, written back on change.
- Card path renders the unchanged `ProjectGrid`. Table path renders the new `ProjectTable`.

### 2. Faceted search & filter (applies to both views)

- Existing filters unchanged: global search (`search`), `runnerFilter`, and the status tabs (all/live/offline/archived).
- Add two **single-select** facet dropdowns to the filter row:
  - **Tech** — distinct values parsed from the CSV `techStack` field across all projects.
  - **Tags** — distinct values parsed from the CSV `tags` field across all projects.
- Facet option lists are derived from `projects` (the full dataset), sorted alphabetically, with an "All …" empty option.
- All filters compose with AND: `search AND status AND runner AND tech AND tag`.
- The composed `filtered` list feeds whichever view is active. Facet state lives in `page.tsx`.
- A project matches a Tech/Tag facet if the selected value is present in its (comma-split, trimmed) CSV list.

### 3. Table view — new `src/components/ProjectTable.tsx`

- A flat, sortable table. No Live/Offline/Archived sections — status is a column.
- Columns, in order:
  1. Selection checkbox
  2. Status (chip: Live / Offline / Static / Archived — reuse existing status class logic)
  3. Name (links to `/projects/{id}`)
  4. Port(s) (primary port + addon ports)
  5. Runner
  6. Tech (first 3 tech pills + overflow count)
  7. Tags (first 2 tag chips + overflow count)
  8. Age (days since `startDate`, matching card logic)
  9. Actions (compact icon buttons)
- **Sorting:** clicking a header sorts by that column; clicking again toggles asc/desc. Sortable columns: Name, Port, Status, Runner, Age. Sort state (`{ key, dir }`) is local to `ProjectTable`, defaulting to the current running-first / port order equivalent (default sort: Status then Name).
- **Row actions** mirror `ProjectCard`'s action bar and honor the same guards:
  - Live preview / terminal buttons respect `onlineMachineIds` (daemon online/offline), showing the same offline affordance.
  - Notes, Todos, Share, Edit, Delete wired to the same handlers passed from `page.tsx`.
  - Archived rows hide the actions that cards hide for archived projects.
- Reuses the existing `Pagination` component with the same per-page options; pagination + sort are computed inside `ProjectTable` over the `filtered` prop.
- Responsive: on narrow screens the table scrolls horizontally inside an `overflow-x: auto` container; the page body never scrolls horizontally.

### 4. Bulk Select & Delete (table only)

- Selection state (`Set<number>` of project ids) lives inside `ProjectTable`.
- Header checkbox selects/deselects all rows **on the current page**; indeterminate when partially selected.
- When ≥1 row is selected, a sticky action bar appears above/below the table: `N selected · [Delete selected] · [Clear]`.
- **Delete selected** opens a confirmation modal (`BulkDeleteModal`) showing the count and the names of the selected projects.
- On confirm, call `deleteProjects(ids)` from the dashboard context (see Backend). On success, clear selection and reload.
- Selection is cleared when: delete completes, the filter/facet/search inputs change, or the view switches away from table.
- Card view has no checkboxes and no selection affordance.

### 5. Backend

- Add a `DELETE` handler to `src/app/api/projects/route.ts` accepting a JSON body `{ ids: number[] }`.
  - Validate `ids` is a non-empty array of integers; return 400 otherwise.
  - Scope deletion to the session machine: only delete projects whose `machineId === session.machineId` (guard against deleting others' rows). Return 401 if unauthenticated.
  - Cascade delete `projectNotes` and `projectTodos` for those ids, then the `projects` rows, mirroring the single-item `DELETE /api/projects/[id]`.
  - Return `{ success: true, deleted: <count> }`.
- Add `deleteProjects(ids: number[]): Promise<void>` to `DashboardContext`, calling the bulk endpoint, toasting result, and `reloadProjects()` on success — mirroring the existing `deleteProject`.

## Components & Interfaces

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `projects/page.tsx` | View toggle + facet state, compose filters, render Card or Table | `useDashboard`, `ProjectGrid`, `ProjectTable` |
| `ProjectTable.tsx` (new) | Sort, paginate, select, render rows + bulk bar | `Project`, `Pagination`, `BulkDeleteModal`, action handlers |
| `BulkDeleteModal.tsx` (new) | Confirm bulk delete (count + names) | — |
| `DashboardContext.tsx` | `deleteProjects(ids)` | bulk DELETE endpoint |
| `api/projects/route.ts` | Bulk `DELETE` handler | `getSession`, drizzle |

## Error Handling

- Bulk delete endpoint: invalid/empty `ids` → 400; unauthenticated → 401; DB error → 500 with message. Client toasts "Delete failed" on non-OK, mirroring existing patterns.
- Facet dropdowns with no distinct values render just the "All" option (no crash on empty dataset).
- Invalid `localStorage` view value falls back to `'card'`.

## Testing

- Manual verification via the running app (per project verify skill):
  - Toggle Card ↔ Table; confirm persistence across reload.
  - Facets filter both views; filters compose with search + status + runner.
  - Table sorting toggles asc/desc per sortable column.
  - Select-all-on-page + partial selection (indeterminate); bulk delete removes exactly the selected rows and cascades notes/todos.
  - Selection clears on filter change / view switch.
  - Card view unchanged.
- Verify `npm run build` / typecheck passes.

## Out of Scope (YAGNI)

- Machine facet (all rows are single-machine).
- Bulk actions other than delete (archive, share, edit).
- Bulk select in card view.
- Server-side pagination/sorting (dataset is client-held already).
- Per-column search fields and multi-select facets (can revisit later).
