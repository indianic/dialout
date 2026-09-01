<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# sessions

## Purpose

Recording playback. Outside the `(dash)` group (own `<Suspense>`). Chunks are stored base64 in `terminalChunks`, flushed every 2 s by the ws-server, and purged by a daily cron against each user's `retentionDays`.

## Key Files

None at this level.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `[id]/` | Playback page for one `terminalSessions` row (`page.tsx` only) |

## For AI Agents

### Working In This Directory

Attach connections (`tmuxSession` set) are not recorded — don't expect a recording for a live attach. UI entry point is `RecordingsPanel`.

### Testing Requirements

Manual playback. Chunk fetch: `GET /api/terminals/[sessionId]/chunks`.

### Common Patterns

Load session metadata then stream chunks into xterm.

## Dependencies

### Internal

`src/app/api/terminals/`, `src/components/RecordingsPanel.tsx`

### External

xterm.

<!-- MANUAL: -->
