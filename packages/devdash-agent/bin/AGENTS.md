<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# bin

## Purpose

npm bin shim. `package.json` `"bin": { "devdash-agent": "./bin/devdash-agent.js" }`.

## Key Files

| File | Description |
|------|-------------|
| `devdash-agent.js` | Shebang wrapper that loads `dist/` CLI. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

Don't put logic here — keep it a thin require/import of `dist`. After changing `src/cli.ts`, `npm run build` must run before the bin does anything new.

### Testing Requirements

Covered indirectly by CLI tests / manual `devdash-agent --help`.

### Common Patterns

Unix shebang + `require('../dist/...')`.

## Dependencies

### Internal

`../dist/` (built from `../src/`)

### External

None.

<!-- MANUAL: -->
