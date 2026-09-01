<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# types

## Purpose

Hand-maintained TypeScript interfaces consumed by the client. These are **not** inferred from Drizzle. Changing a table the UI reads means updating `src/lib/schema.ts` **and** this file.

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | `User`, `Machine`, `SessionInfo`, `Project`, `ProjectFormData`, `ProjectNote`, `ProjectTodo`, `ProjectCredential`, `ShareComment`, `ProjectShare`, `Notification`, `SystemService`, `Stats`, `ScanResult`, `ScannedProject`, `LiveTerminalSession`. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

Keep this file aligned with whatever `GET /api/projects` (and siblings) actually return after merging `projectMachines` overrides. If you add a column the UI needs, add it here in the same change.

### Testing Requirements

Typecheck (`npx tsc --noEmit`) is the check. No runtime tests.

### Common Patterns

Plain interfaces, no Zod. Server routes may return a slightly richer shape; the client type is the contract the UI is written against.

## Dependencies

### Internal

Mirrors `src/lib/schema.ts` + API response shapes.

### External

None.

<!-- MANUAL: -->
