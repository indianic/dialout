<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# devdash-agent

## Purpose

CLI daemon installed on each developer machine. Connects **outbound** over WSS `/daemon` with `X-API-Key` (`mch_…`). Published to `https://registry.npmjs.org` as `dialout` (`os: ["darwin", "linux"]`). Version is independent of the web app (currently 2.7.3 vs app 2.0.0).

Config lives at `~/.devdash-agent/config.json`. `single-instance.ts` prevents competing daemons.

## Key Files

| File | Description |
|------|-------------|
| `package.json` | Bin `devdash-agent`. `files`: `bin`, `dist`, `scripts/postinstall.js`, `README.md`. `npm test` = `tsc` + `node --test`. `release` → `scripts/release-indianic`. |
| `tsconfig.json` | Compiles `src/` → `dist/`. **Build before publishing**; `src/` is the source of truth but npm ships `dist/`. |
| `README.md` | Install (`npm config set @indianic:registry …`) and command list. |
| `CHANGELOG.md` | Agent releases. |
| `.npmignore` | Keep test/docs out of the tarball. |
| `CLAUDE.md` | Local plugin notes (BrowserConnect) — **not** agent architecture. Use this AGENTS.md + root `CLAUDE.md`. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | Daemon modules, 1:1 with WS message types (see `src/AGENTS.md`) |
| `test/` | `node:test` suite as compiled JS (see `test/AGENTS.md`) |
| `bin/` | Node shebang entry (see `bin/AGENTS.md`) |
| `scripts/` | postinstall + private-registry release (see `scripts/AGENTS.md`) |
| `docs/` | Agent-specific write-ups (see `docs/AGENTS.md`) |

## For AI Agents

### Working In This Directory

```bash
cd packages/devdash-agent
npm run build           # tsc → dist/
npm test                # build + node --test
```

- Commands: `init`, `profiles`, `use <profile>`, `start`, `stop`, `restart`, `status`, `install-service`, `uninstall-service`, `setup-cron`, `remove-cron`, `repair`, `setup-cowork`, `update`, `config show|path|reset|set`.
- `setup-cowork` writes a guarded block into the user's shell rc. Everything interpolated is filtered through `TOKEN_RE` / `ENV_NAME_RE` in `cowork.ts` — rc-file injection defense. Never widen those patterns or interpolate an unsanitized value.
- Classification of AI CLIs is by **full argv**, never process name. Claude Code's binary is `~/.local/share/claude/versions/<version>` and other agent CLIs rename themselves.
- A 401 on `/daemon` means the key isn't registered, not that the agent is misconfigured.

### Testing Requirements

`test/*.test.js` (and one `.cjs`). Run from this package, not the repo root. Tests import compiled `dist/` in some cases — `npm test` builds first.

### Common Patterns

New capability = new `src/*.ts` module + message type in `websocket.ts` + matching case in `src/ws-server/index.ts` + `daemon-status.ts` wrapper. Don't let Next.js open a socket here.

## Dependencies

### Internal

Talks only to the ws-server (`/daemon`). Transcript locators read `~/.claude`, `~/.codex`, `~/.grok` on the developer machine.

### External

`commander`, `node-pty`, `ws`, `smol-toml`. Native: `tmux`, `lsof`.

<!-- MANUAL: -->
