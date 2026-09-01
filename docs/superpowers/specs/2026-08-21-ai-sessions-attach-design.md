# AI Sessions — Remote Chat Control of CLI Coding Agents (v1: attach mode) — Design

**Date:** 2026-08-21
**Status:** Draft for review
**Follow-on specs (not written yet):** launch mode (headless sessions started from DevDash, with structured approvals), additional vendor adapters, native mobile app.

## Goal

Let a developer open DevDash on a phone, see every AI coding-agent session running across all their machines — Claude Code, Codex, and later others — read it as a **chat**, and type into it. One app for every agent and every subscription.

The motivating pain: one developer with two Claude subscriptions (plus a third planned on API billing) needs three separate vendor mobile apps today, and gets nothing at all for Codex. DevDash already knows the machines, holds the sockets, and keeps the sessions alive in tmux. The missing piece is reading the agent's *conversation* rather than its terminal output.

## Why this is possible: the transcript is already structured

Every mainstream agent CLI persists a structured JSONL transcript beside the TUI. Verified on the development machine, 2026-08-21:

**Claude Code** — `~/.claude/projects/<escaped-cwd>/<session-uuid>.jsonl`
(`<escaped-cwd>` is the absolute path with `/` replaced by `-`.)

| Record `type` | Carries |
| --- | --- |
| `user`, `assistant` | full Anthropic `message` object (text / `tool_use` / `tool_result` blocks), plus `cwd`, `gitBranch`, `sessionId`, `uuid`, `parentUuid`, `timestamp`, `permissionMode`, `isSidechain`, `version` |
| `custom-title` | session title — ready-made for a list view |
| `last-prompt` | last user prompt — ready-made for a list subtitle |
| `file-history-snapshot` | edited-file snapshots (unused in v1) |

**Codex** — `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`, records of
`{timestamp, type, payload}` where `type` is `session_meta` | `turn_context` | `event_msg` | `response_item`.

**grok** — `~/.grok/sessions/<url-encoded-cwd>/<session-uuid>/events.jsonl`, and it keeps the
file open for writing (unlike Claude Code). A fifth CLI found on the development machine, with a
third distinct layout — which is precisely the argument for the adapter boundary below rather
than special-casing two vendors.

Same idea, different names. **This is what makes a vendor-neutral chat UI real rather than aspirational**, and it is why v1 does not parse the ANSI TUI. Claude Code's interface is a full-screen alternate-screen application with redraws and spinners; regexing rendered output back into meaning would break on every upstream release.

## Scope & non-goals

**In scope (v1):**

- Detecting which tmux sessions are running an AI CLI, and which one.
- Tailing that session's transcript and normalising it into one vendor-neutral event stream.
- A chat view in the DevDash PWA, backed by that stream.
- Sending text from the phone into the session (keystroke injection into the tmux pane).
- Web push when a session starts waiting on the user.
- Adapters: Claude Code (full), Codex (minimal — messages and state only).

**Out of scope (v1):**

- **Launch mode** — starting a new agent session from the phone. Requires the headless
  `claude -p --input-format stream-json --output-format stream-json` protocol and a
  session-lifecycle model; deferred to its own spec.
- **Structured Allow/Deny approval buttons.** Permission prompts only exist as protocol
  events in headless mode. In attach mode the prompt is text in the transcript and the user
  answers it as text.
- Gemini, cursor-agent, Antigravity, grok adapters.
- A native mobile app. (PWA first; port once the protocol has proven itself.)
- Sharing an AI session with a teammate.
- Storing transcripts in Postgres.

## Naming

The feature is **AI Sessions**, route `/ai`, DB/code prefix `aiSession*`. Deliberately *not*
"agents": `devdash-agent` already owns that word throughout the codebase and the ws-server
protocol, and overloading it would make every future message type ambiguous.

## Architecture

No new transport. The structured truth is already on the machine's disk; the agent reads it
and pushes it over the socket that already exists.

```
claude / codex running inside a tmux session on a developer machine
        |  writes
        v
  ~/.claude/projects/<cwd>/<uuid>.jsonl      ~/.codex/sessions/.../rollout-*.jsonl
        |  tail
        v
   devdash-agent --ai_session_list / ai_session_events--> ws-server --> PWA
        ^                                                     |
        +---------- ai_session_input (keys -> tmux pane) <-----+
```

### Agent modules (`packages/devdash-agent/src/`)

**`ai-session-detector.ts`** — for each tmux session the agent already reports, decide whether
an AI CLI is running in it. Inputs: `#{pane_pid}`, `#{pane_current_command}`,
`#{pane_current_path}` (the tmux manager already collects the last of these). Resolves the
process argv to classify `kind: 'claude' | 'codex' | null`.

It also reads `CLAUDE_CONFIG_DIR` from the process environment. **This is how multiple
subscriptions become multiple labelled profiles in one list** — DevDash never sees a
subscription, only a config home on a machine, so a second or third account needs no auth work
at all.

**`transcript-tail.ts`** — vendor-neutral follower for one file. Tracks byte position, handles
append, truncate and rotate, parses JSONL, hands raw records to an adapter. Emits nothing
itself; it has no idea what a message is.

**`ai-adapters/claude.ts`, `ai-adapters/codex.ts`** — translate vendor records into the
normalized event. **Both are written in v1 specifically so the schema cannot quietly become
Claude-shaped**: a single adapter always leaks its vendor into the supposedly neutral format.
Codex's is intentionally minimal (messages and state) — enough to prove the abstraction,
not enough to double the work.

### The normalized event

This is the contract every downstream component depends on. The PWA never learns which vendor
produced a session.

```ts
export type AiEvent =
  | { kind: 'message';     role: 'user' | 'assistant'; text: string; id: string; at: string }
  | { kind: 'tool_call';   name: string; summary: string; input: unknown; id: string; at: string }
  | { kind: 'tool_result'; forId: string; ok: boolean; preview: string; at: string }
  | { kind: 'thinking';    text: string; id: string; at: string }
  | { kind: 'state';       status: AiStatus; at: string };

export type AiStatus = 'working' | 'waiting_input' | 'waiting_approval' | 'idle';
```

`summary` on `tool_call` is a short human string built by the adapter (`Edit src/lib/schema.ts`,
`Bash: npm test`) so the UI never has to understand vendor tool schemas. `preview` on
`tool_result` is truncated server-side — full tool output can be megabytes.

### Status derivation

Derived from the tail alone, never from the TUI. The rows overlap by construction — an
unresolved `tool_use` is also a growing transcript — so they are **evaluated top to bottom and
the first match wins**:

| # | Status | Condition |
| --- | --- | --- |
| 1 | `idle` | no growth for >5 min |
| 2 | `waiting_approval` | a `tool_use` has no matching `tool_result` for >3 s |
| 3 | `waiting_input` | last record is a complete assistant message; no growth for >2 s |
| 4 | `working` | anything else, i.e. the transcript is advancing |

`waiting_approval` is a heuristic in v1 — attach mode cannot see the permission prompt as a
typed event. It is good enough to notify on and is stated as approximate in the UI.

### Input path

Text from the phone becomes keystrokes in the tmux pane, via the mechanism Drive already uses.
A natively-launched TUI cannot accept structured input; **this is the honest ceiling of attach
mode** and the reason launch mode exists as a follow-on.

### ws-server

New message types only, following the established chain: agent handler -> `websocket.ts`
message type -> `handleDaemonMessage` case resolving a `pendingRequests` entry ->
exported `request*()` -> HTTP route in `server.on('request')` -> wrapper in
`src/lib/daemon-status.ts` -> Next.js API route. Events ride the existing `/multiplex`
socket; no new upgrade path.

| Message | Direction | Purpose |
| --- | --- | --- |
| `ai_session_list` | server -> agent, agent -> server | enumerate detected AI sessions |
| `ai_session_open` | server -> agent | start tailing one session, replaying the last 200 events (older history is fetched explicitly, so opening a month-old session cannot flood the socket) |
| `ai_session_events` | agent -> server | batch of `AiEvent` |
| `ai_session_input` | server -> agent | text to inject into the pane |
| `ai_session_close` | server -> agent | stop tailing |

### Database

**No transcript table.** Transcripts are large, live on the machine, and are already durable
there; duplicating them into Postgres buys nothing and costs a lot. Sessions are re-tailed on
demand.

One small table `aiSessionSeen` for unread and notification bookkeeping:
`userId`, `machineId`, `vendorSessionId`, `lastSeenAt`, `lastNotifiedStatus`. Follows the house
convention: `text` timestamps defaulted to `now()`, camelCase properties, snake_case columns.
Ships with an `apply-ai-session-seen.mjs` script added to the `script:` chain in
`.gitlab-ci.yml` — a new column is not live until CI is told to run its script.

### Frontend

- `/ai` — session list. Title from `custom-title`, falling back to `last-prompt`; machine,
  folder, git branch, profile label, and a status dot.
- `/ai/[machineId]/[sessionId]` — the chat view.

Both inside the `(dash)` group. The chat view applies what the mobile terminal page already
proved: a real route rather than an overlay, `100dvh`, locked body scroll, and a composer
pinned above the on-screen keyboard.

### Push notifications

Service worker plus VAPID keys. Fires when a session transitions into `waiting_input` or
`waiting_approval` after a run of `working` — debounced server-side so a chatty session cannot
spam the device. The notification deep-links to the chat view. On iOS this requires the PWA be
installed to the home screen; that limitation is stated in `/help`.

## Risks

**Pane-to-transcript mapping is two-tier, and tier 2 is heuristic.** Measured on the
development machine 2026-08-21:

1. **Definitive (`lsof`).** Some CLIs hold their transcript open for writing, so
   `lsof -p <pid>` names the exact file. Confirmed for `grok` (`11w`, `37w` handles on its
   `events.jsonl`). Use this whenever it yields a match.
2. **Heuristic (cwd + mtime).** **Claude Code opens, appends and closes**, so `lsof` finds
   nothing — confirmed: `lsof <transcript>` returns no holder while the session is live. The
   fallback is the process's true cwd (`lsof -p <pid>` `cwd` row on macOS, `/proc/<pid>/cwd` on
   Linux) plus `CLAUDE_CONFIG_DIR` from its environment, which narrows to exactly one
   directory; then the newest `.jsonl` in it. The choice is then **validated against the
   `cwd` field inside the transcript's own records** before it is trusted.

Two agents in one folder under the same config home can still be mismatched. Mitigation: the UI
shows the matched title and folder so a mismatch is visible, and offers a manual re-pick. This
remains the most likely source of a confusing bug and should be validated early with a real
two-sessions-one-folder test.

**Process names are unreliable — do not classify on them.** Measured: a live agent CLI appears
in `ps` as `grok`, and Claude Code's own binary is `~/.local/share/claude/versions/<version>`,
i.e. named after a version number rather than the product. Classification is by open files and
config directory first, argv second, never by the process's `comm` alone.

**The transcript format is undocumented and will change.** Adapters must degrade, never throw:
unknown record type is skipped, unknown content block renders as plain text, and drift in the
observed `version` field is logged once per session. A vendor release must never take the
feature down.

**Two inputs into one pane.** The user may be typing at their desk while also typing on the
phone. The UI shows "attached at desk" from tmux's attached-client count and requires an
explicit take-input toggle before the composer is enabled.

**Transcript contents are sensitive.** They contain everything the model saw, including
whatever secrets exist in the repository. The agent already has filesystem access via
`fs-browser`, so this grants no new capability — but it moves that content across the socket
and it must never be logged by the ws-server or written to Postgres.

## Testing

Follows the split already in place: `node:test` for the agent, `vitest` for the web app.

- **Adapters** — table-driven pure functions over recorded fixture JSONL captured from real
  Claude Code and Codex sessions. Fixtures are committed and redacted.
- **Tailer** — temp file exercised through append, truncate and rotate.
- **Detector** — injected `list-panes` output, using the same dependency-injection seam style
  as `tmuxSessionExists` in `pty-manager.ts`.
- **Status machine** — a pure function over an array of events; every row of the status table
  above becomes a case.
- **ws-server relay** — existing vitest patterns for the `pendingRequests` chain.

## Decisions taken rather than deferred

**The session list groups by machine.** DevDash is machine-scoped everywhere else — the
sidebar picker, projects, terminals — and a list that grouped by folder would be the only
screen disagreeing with the rest of the app. Folder and branch appear as the subtitle on each
row, so a project spanning machines is still recognisable at a glance.

**The composer reuses `KeyChipBar`.** Answering a TUI means sending single keys (`y`, `n`,
Escape, Ctrl-C) far more often than sending sentences, and that component already exists for
exactly this problem on the mobile terminal. No new key-palette component.
