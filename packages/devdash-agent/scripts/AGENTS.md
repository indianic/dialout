<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# scripts

## Purpose

Agent package lifecycle: postinstall and publish to the private IndiaNIC npm registry.

## Key Files

| File | Description |
|------|-------------|
| `postinstall.js` | `package.json` `"postinstall"`. Keep it safe for CI and for machines that don't want a daemon yet. |
| `release-indianic` | Publish helper. `npm run release` / `release:minor` / `release:major`. Registry `https://registry.npmjs.org`. **Build `dist/` first.** |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

The tarball is `bin` + `dist` + this postinstall + README. Tests and `src/` are not shipped (`.npmignore`). Forgetting `npm run build` publishes stale JS.

### Testing Requirements

`service-installer` / postinstall behavior has unit tests under `test/`. Do a dry-run of the release script before a real publish.

### Common Patterns

Shell release script with version bump + `npm publish`.

## Dependencies

### Internal

`packages/devdash-agent/package.json` `publishConfig.registry`

### External

Private npm at `https://registry.npmjs.org`.

<!-- MANUAL: -->
