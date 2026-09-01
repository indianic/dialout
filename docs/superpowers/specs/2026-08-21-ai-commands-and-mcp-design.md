# AI Chat — Slash Commands and MCP Discovery — Design

**Date:** 2026-08-21
**Status:** Draft for review
**Follows:** `2026-08-21-ai-chat-surface-redesign-design.md` (shipped), `2026-08-21-ai-chat-phase-2-backlog.md` item 5
**Vendors in v1:** Claude Code, Grok. Codex returns empty.

## Goal

Bring the two things you reach for constantly in a CLI agent into the web chat:
the slash-command menu, and the ability to see which MCP servers this agent can
actually reach. On a phone, where you cannot remember 29 command names and
cannot see the TUI's own autocomplete, this is the difference between the chat
being usable and being a read-only window.

## Scope & non-goals

**In scope:** discovering commands and MCP servers on the machine that owns a
session, and surfacing them in the composer.

**Explicitly not in scope — the browser never invokes MCP.** For an attach
session the user's text is injected as keystrokes into a real CLI TUI; for a
launch session it goes to `claude -p --resume`. Both already speak MCP
natively. A picker that "called" an MCP tool would in fact be writing a prompt
and hoping the model complied — deterministic-looking and not deterministic. So
the MCP half is **informational**: it tells you what this agent can reach.

**Commands insert, they never send.** Picking `/compact` puts the text in the
input so arguments can be added. Nothing auto-sends.

## What is actually on disk

Measured on `SKM-MAC-PRO`, 2026-08-21. These are the facts the design rests on;
re-measure before trusting any of them a release from now.

### Claude Code — commands

| Source | Path | Tagged |
| --- | --- | --- |
| user | `~/.claude/commands/*.md` (29 present) | `user` |
| project | `<cwd>/.claude/commands/*.md` (none in this repo) | `project` |
| plugin | `~/.claude/plugins/marketplaces/<marketplace>/<plugin>/commands/*.md` | `plugin` |

Two traps:

- **Frontmatter is not reliable.** `~/.claude/commands/seo.md` opens with
  `# SEO Machine` and has no `---` block at all. A parser that requires
  frontmatter returns an empty description for most of these files. Description
  resolution is therefore: frontmatter `description:` → first `# heading` →
  first non-empty line → empty string. Never throw, never skip the command.
- **Plugin nesting is not uniform.** Most are
  `<marketplace>/<plugin>/commands`, but `impeccable/bin/commands` exists. The
  walk must find `commands` directories rather than assume a fixed depth, and
  must cap its depth so a deep tree cannot stall the poll.

Plugin commands are namespaced `plugin:name` to match how the CLI presents them
and to stop two marketplaces colliding on a common name.

### Claude Code — MCP servers

Four sources, all of which really exist here:

| Source | Path | Scope shown |
| --- | --- | --- |
| global | `~/.claude.json` → `mcpServers` (20 servers) | `global` |
| settings | `~/.claude/settings.json` → `mcpServers` (16 servers) | `global` |
| project file | `<project>/.mcp.json` → `mcpServers` | `project` |
| per-project | `~/.claude.json` → `projects[<cwd>].mcpServers` | `project` |

The two global lists **overlap but differ** — `settings.json` carries
`context7` and `digitalocean-apps` that `~/.claude.json` does not. This is a
merge, not a lookup.

**An honest limit, and it belongs in the UI as much as in this document.** The
*locations* are measured; Claude's runtime *precedence* between them is not. So
this feature does not claim to reproduce it. Every server is displayed with the
scope it came from, and when a name appears at more than one scope the narrower
one is shown. That is our display rule, not an emulation of Claude's
resolution, and the panel says "as configured" rather than "in use".

### Grok — commands

Grok has **no user-defined commands directory**. Its slash commands are the
built-in set, documented as a markdown table under `### Slash Commands` in
`~/.grok/README.md`, which ships beside the binary.

The agent parses that table at runtime. This deliberately trades robustness for
staying current: a hardcoded list would pin one CLI version into our source and
rot, which the codebase has paid for before. The table gives command, alias and
description directly.

**Failure is all-or-nothing.** If the section is missing or the parse yields
fewer than three rows, return an **empty** list and log once. A half-parsed
menu that silently drops `/compact` is worse than no menu.

### Grok — MCP servers

TOML, `[mcp_servers.<name>]`, with `command`, `args`, `env`, `headers`,
`enabled`, and timeout fields. Three levels, loaded by walking from the
session's cwd up to the git repo root:

| Path | Priority |
| --- | --- |
| `~/.grok/config.toml` | lowest |
| `<repo-root>/.grok/config.toml` | middle |
| `<cwd>/.grok/config.toml` | highest |

**A same-named project server replaces the global entirely — fields are not
merged.** Omitted fields take defaults rather than inheriting. This is
documented behaviour and is implemented exactly, because getting it wrong would
show a server with a command it does not actually run.

Note that `~/.grok/config.toml` currently defines **zero** MCP servers, so an
empty Grok panel is correct rather than broken. The empty state must say
"none configured", not "none found".

### Codex

**Codex is out of v1 entirely** — both halves return empty. It is described
here only so the next person knows what was found and what was not.

`~/.codex/config.toml` uses the same `[mcp_servers.<name>]` shape (two servers
present here), so the Grok TOML reader will largely serve it when the time
comes. Whether Codex has user-defined slash commands was **not measured**.

Including its MCP servers now would be nearly free, and is still deliberately
excluded: it was not asked for, and shipping an unrequested half-vendor invites
exactly the "Claude-shaped with others bolted on" outcome the backlog warned
about. Codex becomes its own small change, measured first.

### TOML

Grok and Codex both need TOML. The agent package has no TOML parser. Add
`smol-toml` — small, no dependencies, actively maintained — rather than
hand-rolling, since `env` and `headers` are inline tables and per-tool timeout
maps are nested.

## Transport

The full daemon path, exactly as the architecture requires:

```
ai-capabilities.ts (agent)
  → websocket.ts: ai_capabilities_request / ai_capabilities_result
  → ws-server handleDaemonMessage, resolving pendingRequests by requestId
  → requestAiCapabilities(machineId, tmuxName) in ws-server
  → HTTP route in ws-server's server.on('request')
  → wrapper in daemon-status.ts
  → GET /api/ai-sessions/[machineId]/[tmuxName]/capabilities
```

The API route calls `getSession()` and `userOwnsMachine()`. The AI-session
routes already use that guard and this one is no exception — a caller-supplied
`machineId` is never trusted.

**Version skew is safe by construction.** `requestAiSessions()` establishes the
pattern: a 10-second timeout that resolves `null`. An agent predating this
message type simply never replies, the request resolves `null`, and the API
returns an empty capability set. The UI then shows "no commands found". A stale
agent degrades; it does not error.

## Shape returned

```ts
type CommandSource = 'user' | 'project' | 'plugin' | 'builtin';

interface AiCommand {
  name: string;          // without the leading slash
  alias?: string;        // Grok publishes these
  description: string;   // may be empty; never undefined
  source: CommandSource;
}

interface McpServerInfo {
  name: string;
  scope: 'global' | 'project';
  transport: 'stdio' | 'http';   // http when a url/headers are present
  enabled: boolean;              // Grok's explicit flag; true by default
  origin: string;                // the file it came from, for the detail row
  command?: string;              // stdio only
  args?: string[];               // redacted, see below
}

interface AiCapabilities {
  kind: 'claude' | 'codex' | 'grok';
  commands: AiCommand[];
  mcpServers: McpServerInfo[];
  // Discovery is filesystem work; the browser caches on this.
  scannedAt: string;
}
```

Secrets never cross this boundary. `env` and `headers` on an MCP server
routinely hold API keys, so **only the key names are ever returned, never the
values** — and for v1 not even the names, since the panel does not show them.
`command` and `args` are returned for the detail row; a token passed as a CLI
argument would leak, so `args` entries matching the existing `TOKEN_RE`-style
secret shapes are redacted before sending.

## UI

**The `/` trigger.** Typing `/` as the first character of an empty input opens
a filtered list anchored above the composer. Subsequent characters filter it by
name and description. Escape closes it; Enter or tap inserts `"/name "` and
closes. On a coarse pointer there are no arrow keys, so the list is tappable
and scrollable.

The trigger rule is a pure function — `commandQuery(text)` returns the filter
string or `null` — so "when is the menu open" is testable without a DOM.

**The `+` menu** gains its two real rows: **Commands** opens the same list for
browsing, **MCP servers** opens the informational panel. Both are **overlays**,
`position: absolute` above the composer. This is not a style preference: the
composer is a flex sibling of a `flex: 1` chat, so anything that changes its
height resizes the conversation. That bug has been paid for once already.

**Fetching.** Capabilities load lazily on first open, not on page load —
discovery walks several directories and no one should pay for it just by
reading a chat. Cached per session in memory for the life of the page, with a
manual refresh in the panel.

**Empty states are distinct.** "No commands found" (discovery ran, found
nothing), "Machine offline" (no daemon), and "Update the agent to see commands"
(daemon replied with an unsupported-message error or timed out) are three
different sentences. Collapsing them is what made the tmux bug take three
months.

## Testing

Vitest for the web app, `node:test` for the agent — they do not overlap, and
the discovery code lives in the agent.

**Agent (`node:test`), all pure:**

- Description resolution across all four shapes: frontmatter, `# heading`,
  first line, and an empty file.
- Plugin walk finds `<mp>/<plugin>/commands` and the non-uniform
  `impeccable/bin/commands`, and stops at the depth cap.
- Grok TOML merge: a project server with a global's name replaces it entirely,
  and a field omitted in the project version reads as its default rather than
  the global's value.
- Grok README table parsing: a well-formed table yields every row with aliases;
  a missing section yields `[]`; a table of two rows yields `[]` rather than a
  partial list.
- Secret redaction: an `args` entry shaped like a token is redacted; a normal
  flag is not.

**Web (Vitest):**

- `commandQuery(text)`: `/` on empty input opens; `/comp` filters to `comp`;
  a `/` mid-sentence does not open it; a space after the name closes it.
- Command filtering ranks a name match above a description match.

The pickers themselves are verified by eye, in both themes, at phone and
desktop width.

## Risks

**The Grok README parse.** Accepted deliberately, with an all-or-nothing
fallback and a log line. If xAI restructures that section the menu empties and
says so; it never shows a partial list.

**Discovery cost.** Walking plugin directories on every open would be wasteful
on a large install. Mitigated by the lazy fetch, the browser-side cache, and a
depth cap on the walk. If it proves slow, the next step is an agent-side cache
keyed on the directories' mtimes — not a background poll, which would burn IO
on every machine for a menu nobody opened.

**Claude's real precedence.** Unmeasured, and deliberately not claimed. If the
displayed scope ever contradicts what the CLI actually loads, the fix is to
measure the precedence and encode it — not to guess harder now.

**Two vendors, one interface.** Claude discovers from the filesystem and Grok
reads a shipped table; they share only the returned shape. The seam is
`discoverCapabilities(kind, cwd)` with a per-kind implementation behind it,
mirroring how `ADAPTERS` is already a `Record<AiKind, AiAdapter>` so that
adding a vendor without implementing it is a compile error rather than a
runtime hole.
