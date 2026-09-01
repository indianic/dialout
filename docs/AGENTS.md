<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-31 -->

# docs

## Purpose

Human-readable product and design documentation. The narrative spec is `DEVDASH-GUIDE.md`. Feature work that went through Superpowers lives under `superpowers/specs/` (what) and `superpowers/plans/` (how). The native-client HTTP contract is the hand-maintained OpenAPI file in `api/`.

## Key Files

| File | Description |
|------|-------------|
| `DEVDASH-GUIDE.md` | Narrative product spec — start here for "what is DevDash". |
| `DIALOUT-LAUNCH.md` | Open-source launch runbook: rebrand, audit, GitHub repo, marketing site, cutover. Fill in the SSH block at the top before Phase 2. |
| `CASE-STUDY.md` | Written-up case study of the project. |
| `TEST.md` | Manual / exploratory test notes. |
| `todo.md` | Scratch todo list — not the source of truth for work. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `brand/` | Naming, identity and marketing source material (see `brand/AGENTS.md`) |
| `api/` | Hand-maintained OpenAPI for native clients (see `api/AGENTS.md`) |
| `debugging/` | Incident write-ups (see `debugging/AGENTS.md`) |
| `design/` | UI prototypes (see `design/AGENTS.md`) |
| `plans/` | Older pre-superpowers design/plans (see `plans/AGENTS.md`) |
| `sessions/` | Session notes (see `sessions/AGENTS.md`) |
| `superpowers/` | Dated specs + executed plans (see `superpowers/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Read the matching spec in `superpowers/specs/` **before** touching a feature it covers.
- `docs/api/openapi.yaml` is **not** generated. A route change that native clients consume must update it in the same commit — a shipped mobile app is pinned to it.
- Do not treat `todo.md` or session notes as current architecture; prefer `CLAUDE.md` and the dated spec.

### Testing Requirements

Docs-only. No automated tests.

### Common Patterns

Filenames are dated (`YYYY-MM-DD-topic.md`). Specs describe intent; plans describe the implementation that shipped.

## Dependencies

### Internal

Mirrors `src/` and `packages/devdash-agent/` as they existed when each doc was written — they drift.

### External

None.

<!-- MANUAL: -->
