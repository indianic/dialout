<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# superpowers

## Purpose

Design docs and executed plans produced by the Superpowers workflow. Dated filenames. **Read the matching spec before touching a feature it covers.** Specs are intent; plans are the implementation that shipped (or was supposed to).

## Key Files

None at this level.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `specs/` | Design specs (see `specs/AGENTS.md`) |
| `plans/` | Execution plans (see `plans/AGENTS.md`) |

## For AI Agents

### Working In This Directory

Pair `specs/YYYY-MM-DD-<topic>-design.md` with `plans/YYYY-MM-DD-<topic>.md`. If they disagree with the code, the code plus root `CLAUDE.md` comments win — those comments encode bugs already paid for.

### Testing Requirements

None for the docs themselves. Plans often contain a verification section — use it when working on that feature.

### Common Patterns

`YYYY-MM-DD-kebab-topic.md` (plans) and `…-design.md` (specs). Kickoff prompts are also specs.

## Dependencies

### Internal

Implemented across `src/` and `packages/devdash-agent/`.

### External

None.

<!-- MANUAL: -->
