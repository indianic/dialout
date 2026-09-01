<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# packages

## Purpose

Workspace packages that ship independently of the Next.js app. Today there is one: `dialout`, the CLI daemon installed on each developer machine.

## Key Files

None at this level.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `devdash-agent/` | Outbound daemon: ports, tmux/PTY, FS browse, project scan, AI transcript tail (see `devdash-agent/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- The agent has its **own** `package.json`, TypeScript config, test runner (`node:test`), and publish pipeline.
- Do not add a second package here without a decision about how it is built and published (this is not a formal npm workspaces monorepo in `package.json`).

### Testing Requirements

Each package runs its own tests. Root `npm test` does not recurse here.

### Common Patterns

`devdash-agent` ships compiled `dist/` — source of truth is `src/`, but `dist/` must be in sync before publish.

## Dependencies

### Internal

Agent talks to the root app's ws-server, not to Next.js.

### External

See `devdash-agent/AGENTS.md`.

<!-- MANUAL: -->
