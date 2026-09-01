<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# scripts

## Purpose

Agent package lifecycle: the postinstall hook and the prepack step that bundles `@dialout/shared` into the tarball.

## Key Files

| File | Description |
|------|-------------|
| `postinstall.js` | `package.json` `"postinstall"`. Keep it safe for CI and for machines that don't want a daemon yet. |
| `prepack.js` | `package.json` `"prepack"`. Stages `@dialout/shared` into this package's own `node_modules` — `bundleDependencies` packs from there, not from the workspace symlink, so without this the tarball ships an unresolvable dependency. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

The tarball is `bin` + `dist` + this postinstall + README. Tests and `src/` are not shipped (`.npmignore`). Forgetting `npm run build` publishes stale JS.

### Testing Requirements

`service-installer` / postinstall behavior has unit tests under `test/`. Run `npm pack --dry-run` before a real publish and confirm `@dialout/shared` appears under **Bundled Dependencies**.

### Common Patterns

Publishing is plain `npm publish` to the public registry after `npm run build`. There is no release wrapper script; version bumps are manual.

## Dependencies

### Internal

`packages/devdash-agent/package.json` `publishConfig.registry`, `bundleDependencies`, and `packages/devdash-shared`

### External

The public npm registry at `https://registry.npmjs.org`. The package is published as `dialout`.

<!-- MANUAL: -->
