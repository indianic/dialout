<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# test

## Purpose

Agent tests using Node's built-in runner (`node --test`) over compiled JS. This is **not** vitest. Root `npm test` does not run these.

## Key Files

| File | Description |
|------|-------------|
| `websocket.test.js` | Daemon WS message handling. |
| `pty-manager.test.js` | PTY open/detach/close. |
| `tmux-manager.test.js` | list-sessions matching (not prefix/fnmatch). |
| `cowork.test.js` | rc injection filter (`TOKEN_RE` / `ENV_NAME_RE`). |
| `command-runner.test.js` | Command execution. |
| `heartbeat.test.js` | Heartbeat payload. |
| `checklist.test.js` | Supervisor hygiene. |
| `service-installer.test.js` | launchd/systemd unit content. |
| `has-command.test.js` / `update-check.test.js` / `terminal-detect.test.js` / `terminal-markers.test.js` | Small helpers. |
| `project-scanner.test.cjs` | Folder scanner (CJS on purpose). |
| `ai-session-detector.test.js` / `ai-transcript-locator.test.js` / `ai-transcript-tail.test.js` / `ai-sessions.test.js` / `ai-status.test.js` / `ai-launch.test.js` | AI pipeline. Locator tests encode the measured escaping rules. |
| `ai-adapter-claude.test.js` / `ai-adapter-codex.test.js` / `ai-adapter-grok.test.js` | Vendor JSONL → `AiEvent`. |
| `ai-capabilities-*.test.js` | Commands, MCP, redact, describe, seam. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

```bash
cd packages/devdash-agent && npm test
```

Add a `*.test.js` next to the module's name. Locator/adapter tests should use **real** path examples (`saava.indianic.in` → `-saava-indianic-in`) — a slash-only rule was wrong for 10 of 49 measured directories.

### Testing Requirements

This directory *is* the suite. Keep tests runnable without a live server (mock WS / fs).

### Common Patterns

`node:test` + `node:assert/strict`. Some files import `../dist/...`.

## Dependencies

### Internal

`packages/devdash-agent/src/` (via `dist/`)

### External

Node.js `node:test`.

<!-- MANUAL: -->
