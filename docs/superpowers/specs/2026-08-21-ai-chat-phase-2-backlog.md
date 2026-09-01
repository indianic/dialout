# AI Chat — Phase 2 Backlog

**Date:** 2026-08-21
**Status:** Backlog, not yet specced
**Follows:** `2026-08-21-ai-chat-surface-redesign-design.md` (shipped as c3d918e)

Feedback from using the shipped chat, plus the item deliberately deferred out of
phase 1. Ordered by how much it hurts, not by effort.

## 1. The composer must be fixed to the bottom

The input has to stay parked at the bottom of the viewport at all times — it
must never ride up or down with content, and never be pushed off-screen.

Today the page is a `100dvh` flex column with the chat at `flex: 1` and the
composer as a plain sibling, so anything that changes the composer's height
changes the chat's. That is the root of items 1 and 2 both.

## 2. The `+` popover must overlay the chat, not grow the composer

**This is a real defect, and the cause is known.** `.aic-pop` is rendered as a
grid child of the composer wrapper in `AiComposer.tsx`. Because the composer is
a flex sibling of a `flex: 1` chat, adding a row makes the composer taller and
the chat shorter — the whole conversation jumps every time the menu opens.

The fix is a positioned overlay, not a layout row: `position: relative` on the
composer wrapper and `position: absolute; bottom: 100%` on `.aic-pop`, so it
floats above the input over the chat and takes the conversation with it
nowhere. The same applies to anything else the `+` menu grows into later.

## 3. The compact keyboard is mobile-only

`KeyChipBar` should appear only on a touch/mobile viewport. On a desktop with a
real keyboard it is wasted vertical space, and it is one of the things
currently resizing the chat. Two decisions to make when this is specced:

- Is the trigger viewport width, a coarse-pointer media query, or both? A
  narrow desktop window is not a phone, and `(pointer: coarse)` is the more
  honest test.
- Should the `+` menu still show a disabled "Function keys" row on desktop, or
  hide it entirely? Showing a row that can never do anything is its own kind of
  noise.

## 4. Sending must work from both the send button and Enter

Confirm — and fix if broken — that a message sends on the send button and on
Enter (with Shift+Enter for a newline). The handler exists in `AiComposer.tsx`
and both paths call the same `submit()`, so if this is failing in practice the
cause is upstream of the composer and worth finding before touching the UI.

Note for whoever picks this up: on a phone the on-screen keyboard's Enter is a
newline in a `textarea` by convention, so "Enter sends" and "mobile" interact.
Decide deliberately rather than inheriting the desktop behaviour.

## 5. Provider-aware slash commands and MCP discovery

Deferred out of phase 1 on purpose, and unchanged since: the `+` popover
already carries disabled **Commands** and **MCP servers** rows so this lands as
an added row rather than a redesign.

This one is not browser-only. It needs the full agent path — a module to read
`.claude/commands/`, `.mcp.json`, `~/.claude.json` and Codex's `config.toml` →
a new daemon message type → a ws-server relay → a `daemon-status.ts` wrapper →
an API route → the composer autocomplete. It ships with an agent release, and
old agents must degrade to "no commands found" rather than erroring.

**The browser must not execute MCP calls itself.** For attach sessions the text
is injected as keystrokes into a real CLI TUI; for launch sessions it goes to
`claude -p --resume`. Both already speak MCP. The web chat's job is discovery
and insertion — find what exists, show a picker, insert the right text.

Grok is now a third vendor (`53fc76a`), so any command/MCP discovery has to be
per-kind from the start rather than Claude-shaped with others bolted on.

## Carried over: never verified

Two things from phase 1 were built and typechecked but never watched working.
Item 2 above is feedback on the first, so it is half-answered already.

- The `+` popover's toggle persisting across a reload, and closing on Escape
  and outside click.
- Optimistic echo: the pending bubble appearing immediately and reconciling on
  the echoed event, plus the 10s undelivered state.

## Carried over: worth a second opinion

`AiChat.tsx` renders `data-pinned` on the scroll container. It is scaffolding by
origin — added to debug the pin rule — kept deliberately and commented, because
whether the chat is following is otherwise invisible until a message arrives.
Decide whether it earns its place or comes out.
