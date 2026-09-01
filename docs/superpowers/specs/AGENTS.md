<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-30 -->

# specs

## Purpose

Design specs (intent) for features that went through Superpowers. Read the spec **before** changing the feature. Pair with the same-date file in `../plans/`.

## Key Files

| File | Description |
|------|-------------|
| `2026-06-29-shared-terminal-sessions-design.md` | Shared tmux / cowork. |
| `2026-07-05-project-folder-scanner-design.md` | Folder-based project discovery. |
| `2026-07-05-mobile-terminal-kickoff-prompt.md` | Mobile terminal phase 1 kickoff. |
| `2026-07-06-terminal-binding-naming-design.md` | Terminal naming / binding. |
| `2026-07-07-app-gated-cowork-wrapping-design.md` | App-gated cowork wrapper. |
| `2026-07-13-project-credentials-vault-design.md` | Encrypted project credentials. |
| `2026-07-13-project-process-control-design.md` | Start/stop/restart. |
| `2026-07-13-projects-table-view-design.md` | Projects table vs grid. |
| `2026-07-14-2fa-and-profile-design.md` | Mandatory TOTP + profile. Lockout columns must stay split from PIN counters. |
| `2026-07-15-mobile-terminal-settings-design.md` | Mobile terminal settings. |
| `2026-07-15-mobile-terminal-phase2-kickoff-prompt.md` | Phase 2 kickoff. |
| `2026-08-21-ai-sessions-attach-design.md` | AI attach (transcript tail, not TUI scrape). |
| `2026-08-21-ai-chat-surface-redesign-design.md` | Chat UI redesign. |
| `2026-08-21-ai-commands-and-mcp-design.md` | Commands + MCP panel. |
| `2026-08-21-ai-chat-phase-2-backlog.md` | Chat phase 2 backlog (not a full spec). |
| `2026-08-30-configurable-server-url-design.md` | Runtime-settable API/WS URL for open-source release. Probe accepts 401-with-JSON; every route authenticates so nothing else can be probed. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

If spec and code disagree, trust the code plus comments in `CLAUDE.md` (they encode paid-for bugs), then update the spec if the product intent changed.

### Testing Requirements

None.

### Common Patterns

`YYYY-MM-DD-<topic>-design.md`

## Dependencies

### Internal

`../plans/`, implementation in `src/` + `packages/devdash-agent/`

### External

None.

<!-- MANUAL: -->
