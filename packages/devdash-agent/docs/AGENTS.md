<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# docs

## Purpose

Agent-specific write-ups that don't belong in the root `docs/` (Linux cowork, supervisor hygiene, copy-select verification).

## Key Files

| File | Description |
|------|-------------|
| `linux-cowork-phase1.md` | Linux cowork wrapper notes. |
| `supervisor-hygiene-2.4.1.md` | launchd/systemd/cron watchdog hygiene (v2.4.1). Pair with `checklist.ts` / `repair`. |
| `verify-select-copy.md` | Terminal select/copy verification notes. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

Supervisor/cron issues: read `supervisor-hygiene-2.4.1.md` before adding another watchdog. Cowork rc injection rules still live in `src/cowork.ts`.

### Testing Requirements

None.

### Common Patterns

Versioned incident/design notes.

## Dependencies

### Internal

`src/service-installer.ts`, `src/checklist.ts`, `src/cowork.ts`

### External

None.

<!-- MANUAL: -->
