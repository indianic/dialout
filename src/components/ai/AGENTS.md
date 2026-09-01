<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# ai

## Purpose

Chat UI for Claude Code / Codex / Grok sessions running on a machine. It **never parses the TUI** — the agent tails each CLI's JSONL transcript and the UI renders a normalised `AiEvent` stream. Launch mode is turn-based (`claude -p --resume <uuid>`); no long-lived child on the agent.

## Key Files

| File | Description |
|------|-------------|
| `AiChat.tsx` | Chat transcript surface. |
| `AiComposer.tsx` | Composer; launch vs attach. |
| `AiMessage.tsx` | One event/message. |
| `AiToolTrace.tsx` | Tool-call trace. |
| `AiStatusDot.tsx` | working / waiting / idle. |
| `CommandPicker.tsx` | Slash-command picker (from capabilities). |
| `McpPanel.tsx` | MCP server list (from capabilities). |
| `NewAiSessionModal.tsx` | Launch a new session. Trust level chosen once; `bypassPermissions` is offered by none of the three layers that validate it. Per-tool Allow/Deny is impossible in launch mode. |
| `PushToggle.tsx` | Per-session push (fires on `working → waiting_*` only). |
| `ai-events.ts` | Client event types matching the agent's `AiEvent` union. |
| `ai-chat-prefs.ts` | Chat prefs (tested). |
| `chat-blocks.ts` | Transcript block grouping (tested). |
| `command-filter.ts` | Command list filtering (tested). |
| `composer-behaviour.ts` | Composer key/submit behaviour (tested). |
| `scroll-pin.ts` | Stick-to-bottom (tested). |
| `tool-appearance.ts` | Tool chip labels/icons (tested). |
| `capability-types.ts` / `useAiCapabilities.ts` | Commands + MCP from `/api/ai-sessions/.../capabilities`. |
| `ai-chat.css` | Chat styles. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- Logic is extracted into `*.ts` next to the component so it can be unit-tested without RTL. Keep it that way — don't dump new branching into JSX.
- `AiKind` is a union on the agent; UI should not special-case a vendor except where the adapter already does (Grok pid map, nested transcript filename).
- Don't scrape tmux panes from here.

### Testing Requirements

Colocated `*.test.ts` (vitest, node env). Add a test file when you add a `*.ts` helper.

### Common Patterns

Pure helpers + thin `'use client'` components. Fetch capabilities via `useAiCapabilities`.

## Dependencies

### Internal

`src/app/api/ai-sessions/`, `src/hooks/`, agent `ai-adapters` / `ai-capabilities` (shape only — runs on the machine).

### External

None beyond React.

<!-- MANUAL: -->
