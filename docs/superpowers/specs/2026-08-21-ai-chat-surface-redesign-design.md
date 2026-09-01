# AI Chat Surface — Redesign — Design

**Date:** 2026-08-21
**Status:** Draft for review
**Builds on:** `2026-08-21-ai-sessions-attach-design.md` (the event stream this renders)
**Follow-on spec (not written yet):** provider-aware slash commands + MCP discovery

## Goal

Make `/ai/[machineId]/[tmuxName]` readable and usable — on a phone first, and on a
desktop second. The event stream landing in the browser is already correct; what the
browser does with it is not.

Six complaints, all of them true today:

1. Scroll jumps to the bottom while you are reading history.
2. Messages render as plain text — no markdown, so agent output is a wall.
3. Long content forces the whole viewport to scroll sideways.
4. Nothing distinguishes a message from a tool call at a glance.
5. The function-key bar occupies permanent vertical space above the input.
6. None of it is tuned for a phone or an iPad, which is where this feature is used.

## Scope & non-goals

**In scope:** `AiChat.tsx`, `AiComposer.tsx`, and
`src/app/(dash)/ai/[machineId]/[tmuxName]/page.tsx`. Browser only.

**Explicitly out of scope:** slash commands, MCP discovery, and anything requiring a new
daemon message type. Nothing in this spec touches the agent, the ws-server, the database,
or any API route. It ships without an agent release.

**Deliberately not done:** the browser will never execute an MCP call itself. For attach
sessions the user's text is injected as keystrokes into a real CLI TUI, and for launch
sessions it goes to `claude -p --resume`; both already speak MCP natively. A second,
worse MCP client in the browser is not a feature.

## Decisions taken during design

| Question | Decision | Why |
| --- | --- | --- |
| Markdown renderer | `react-markdown` + `remark-gfm`, dynamically imported | Never renders raw HTML, so agent output cannot inject. Handles the nested lists and tables Claude actually emits. Hand-rolled parsers break exactly there. |
| Colour treatment | Semantic tool chips | Prose stays calm; colour is confined to 21px chips keyed to what a tool *does*. The theme is monochrome plus one blue, so per-row stripes in five hues would fight it. |
| `+` button | Popover menu | One working row now, two reserved. Makes the follow-on spec an added row rather than a redesign. |
| `thinking` / `state` events | Collapsed, shown | A dim `thought for 12s` line and a status divider. Dropping them loses the one signal that matters on a phone: the agent is blocked on you. |

## Component boundaries

`AiChat.tsx` is 93 lines doing one job. Adding markdown, grouping, chips and pinning
would push it past 400, so it splits along the seams the work already has:

| Unit | Does | Depends on |
| --- | --- | --- |
| `AiChat` | Owns the scroll container, the pin/follow rule and the jump-back pill. Groups consecutive events into blocks. | `AiMessage`, `AiToolTrace` |
| `AiMessage` | Renders one `message` event as markdown. | `react-markdown`, `remark-gfm` |
| `AiToolTrace` | Renders a run of `tool_call` / `tool_result` events as one scannable block. | `tool-appearance.ts` |
| `tool-appearance.ts` | Maps a tool name to `{ icon, colour, className }`. Pure, no React. | nothing |
| `AiComposer` | Input, send, and the `+` popover that owns `KeyChipBar`'s visibility. | `KeyChipBar` |

`tool-appearance.ts` is where the behavioural risk of this change lives — every other unit
is layout — so it is the piece with real unit tests.

## Scroll behaviour

The current effect fires `scrollIntoView` on every change to `events.length`, which is
what yanks the reader down. Replaced with the rule a terminal uses:

- Track `isPinned`: true while the scroll position is within **80px** of the bottom.
- New events scroll to the bottom **only when `isPinned`**.
- Scrolling up unsets `isPinned` and reveals a `↓ N new messages` pill; tapping it
  re-pins and scrolls down. `N` counts events received since unpinning.
- Sending a message always force-pins. Sending is an intent to watch the bottom.
- `overflow-anchor: none` on the scroller — Chrome's scroll anchoring actively fights
  streaming content and produces a visible jitter.
- Pin state is measured on `scroll` (passive listener, rAF-throttled), never derived from
  the event array.

## Why content currently scrolls sideways

Not one bug, three, and all three need fixing or the symptom returns:

1. Flex and grid children default to `min-width: auto`, so one long token — a file path,
   a stack frame, a base64 blob — sets the column's minimum width and drags the page.
   Every chat child gets `min-width: 0`.
2. Prose gets `overflow-wrap: anywhere` so an unbroken token wraps instead of extending.
3. `overflow-x: auto` is scoped to `<pre>` alone, so code scrolls **inside its own box**.
   Tool paths ellipsise instead of pushing.

The page body must never scroll horizontally at any width.

## Rendering rules

**Messages.** User messages are right-aligned bubbles, max 80% (88% under 640px).
Assistant messages are full-width prose with no bubble — a bubble around 60 lines of
markdown wastes the narrowest dimension on a phone.

**Markdown.** GFM: tables, task lists, strikethrough. Tables and code blocks each scroll
inside their own `overflow-x: auto` container. Raw HTML is not enabled. Links get
`rel="noopener noreferrer"`. `react-markdown` and `remark-gfm` are imported on demand inside
`AiMessage`, so the `/ai` route carries the cost and the rest of the dashboard does
not. A plain `next/dynamic` wrapper cannot see the message text, so its `loading`
state would blank the bubble; importing by hand lets the fallback render the text as
pre-wrap — the current behaviour — until the chunk lands.

**Tool calls.** Consecutive tool events collapse into one block under a `did N things`
rule. Each row is `[chip] Name path`, the path ellipsised. Chips by action class:

| Class | Tools | Colour |
| --- | --- | --- |
| read | Read, Glob, NotebookRead | blue `--accent` |
| search | Grep, WebSearch | teal |
| run | Bash, Task | violet |
| write | Edit, Write, NotebookEdit | amber `--static` |
| failure | any result with `ok: false` | red `--offline` |

Unknown tool names fall back to a neutral chip. New tools appear constantly; an unknown
name must never render as a broken row.

`--accent`, `--static` and `--offline` already exist. **Teal and violet do not**, so this
adds `--tool-search` and `--tool-run` to `globals.css` in both the light and dark blocks,
following the existing convention of defining every colour in both. The chips are tinted
backgrounds at ~16% alpha with the solid colour as the glyph, which is what keeps them
legible on `--card` in light and on `--bg` in dark without a second set of values.

Every colour in this spec is a token. None is hard-coded in a component, and the design
is checked in both themes — the mockups were dark, which is the harder case for tinted
chips, but light must be verified before this is called done.

**Tool results.** Collapsed, as today, with the line count in the summary. Failures are
not collapsed — an error the reader has to expand to see is an error they will miss.

**Thinking.** One dim, expandable `thought for a moment` line. The transcript does not
carry a reliable duration for a thinking block — deriving one would mean differencing
timestamps across events that may not be adjacent — so the label does not claim a
number it cannot stand behind.

**State.** A status change renders as a horizontal divider labelled with the new status,
amber for `waiting_approval` and `waiting_input`. Consecutive identical statuses collapse
to one divider.

## Composer

The `+` button opens a popover above the input:

| Row | State |
| --- | --- |
| Function keys | Working toggle, persisted per device in `localStorage` |
| Commands | Disabled, `soon` |
| MCP servers | Disabled, `soon` |

`KeyChipBar` is unchanged and renders between the popover and the input when enabled.
Escape and an outside click close the popover; it is not a route overlay, because it is a
control local to the composer rather than app navigation.

The input stays at `font-size: 16px` — anything smaller makes iOS zoom the page on focus.

## Optimistic echo

A sent message currently appears only after it round-trips through the transcript tail,
so the chat looks frozen for a second or more. Sending now appends a local pending bubble
immediately, rendered at reduced opacity, and reconciles when the matching `message`
event arrives.

Reconciliation is by text match against the next `role: 'user'` event, with a **10 second**
timeout after which the pending bubble is marked failed with a retry affordance. Text
match is sufficient here because a user cannot send two messages within the window
without the first having already echoed.

## Responsive

Single column at every width; the layout does not restructure, it re-tunes.

| Width | Behaviour |
| --- | --- |
| < 640px (phone) | Bubbles 88%, chat padding 10px, header condenses to name + status dot |
| 640–1024px (iPad) | Bubbles 80%, chat padding 16px |
| > 1024px | Content column capped at 860px and centred; prose beyond that is unreadable |

Height uses `100dvh`, not `100vh`, so the composer is not hidden under a mobile keyboard
or browser chrome. Every interactive target is at least 38px.

## Testing

Vitest, `src/**/*.test.ts`, matching the existing web-app runner.

- `tool-appearance.ts` — every known tool maps to its class; an unknown name falls back
  to neutral rather than throwing; `ok: false` beats the name-derived class.
- Event grouping — consecutive tool events collapse into one block; a message between
  two tool calls splits them; a lone tool call still renders.
- Pin rule — a pure `shouldFollow(scrollTop, scrollHeight, clientHeight)` helper, tested
  at the boundary, so the decision is not trapped inside an effect.
- Status divider collapsing — repeated identical statuses yield one divider.

Layout is verified by eye at 330px, 768px and 1440px. Markdown rendering is not
re-tested; that is `react-markdown`'s job.

## Risks

**Bundle size.** `react-markdown` + `remark-gfm` is roughly 40KB gzipped. Mitigated by
dynamic import on one route. If it proves heavy on mobile data, the fallback is to render
plain text until the chunk resolves, which is the current behaviour and therefore not a
regression.

**Pin heuristics.** An 80px threshold is a guess. It is a single constant, and the pure
helper makes it trivial to change.

**Grouping hides ordering.** Collapsing tool calls into a block asserts they are
contiguous. They are, in the transcript — but if an adapter ever interleaves events the
block would misrepresent order. Grouping only ever merges *adjacent* events, so the worst
case is two blocks instead of one, never a reordering.
