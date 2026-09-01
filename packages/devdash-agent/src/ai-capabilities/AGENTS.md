<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# ai-capabilities

## Purpose

Discover slash-commands and MCP servers for an AI session on the developer machine, then **redact** secrets before the payload crosses the daemon socket. The UI (`src/components/ai/CommandPicker.tsx`, `McpPanel.tsx`) renders whatever this returns via `/api/ai-sessions/.../capabilities`.

## Key Files

| File | Description |
|------|-------------|
| `types.ts` | Capability DTOs. |
| `index.ts` | Public seam (`describe`, vendor dispatch). |
| `describe.ts` | Summarise capabilities for the server/UI. |
| `claude.ts` | Claude commands + MCP from its on-disk config. |
| `grok.ts` | Grok commands + MCP. |
| `redact.ts` | Strip tokens/keys from command/MCP descriptors. **Must stay on the agent** — don't move redaction to the server. |
| `fsdeps.ts` | Filesystem helpers for reading vendor config. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

Redaction is a security boundary. Tests in `test/ai-capabilities-redact.test.js` are the contract — a new field that can carry a token needs a redact case. Don't log raw vendor config.

Codex capabilities may be thinner; don't stub a vendor by copying Claude's paths.

### Testing Requirements

`test/ai-capabilities-claude-commands.test.js`, `ai-capabilities-claude-mcp.test.js`, `ai-capabilities-grok-commands.test.js`, `ai-capabilities-grok-mcp.test.js`, `ai-capabilities-describe.test.js`, `ai-capabilities-redact.test.js`, `ai-capabilities-seam.test.js`.

### Common Patterns

Read vendor files from the session cwd / home, map to a shared DTO, run `redact` last.

## Dependencies

### Internal

`ai-sessions.ts` seam; UI via ws-server → Next.js capabilities route.

### External

Vendor config on disk (`~/.claude`, `~/.grok`, project `.mcp.json`).

<!-- MANUAL: -->
