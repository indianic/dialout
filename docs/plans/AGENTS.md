<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# plans

## Purpose

Older design/plan docs from before the Superpowers dated-spec workflow. Treat as historical. Current feature specs live in `docs/superpowers/`.

## Key Files

| File | Description |
|------|-------------|
| `2026-05-05-http-tunnel-plan.md` | Original HTTP tunnel plan (rewrite rules, path prefix). |
| `2026-05-05-remote-daemon-terminal-design.md` | Original remote daemon + terminal design. |
| `2026-08-21-mobile-app-react-native.md` | React Native mobile app plan (native client of `docs/api/openapi.yaml`). |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

If a Superpowers spec exists for the same feature, the Superpowers spec wins. Cross-check tunnel/terminal behavior against `src/ws-server/index.ts` and root `CLAUDE.md` — the plans here predate several invariants (detach grace, tmux upsert chaining, cowork wrapper token filter).

### Testing Requirements

None.

### Common Patterns

Dated filenames.

## Dependencies

### Internal

Implemented in `src/ws-server/`, `packages/devdash-agent/`, `src/app/api/tunnel/`.

### External

None.

<!-- MANUAL: -->
