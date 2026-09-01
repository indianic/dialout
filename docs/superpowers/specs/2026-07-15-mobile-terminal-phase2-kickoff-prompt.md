# Mobile Terminal Phase 2 — Kickoff Prompt (paste into a fresh session)

Execute **Phase 2** of the mobile/iPad terminal work using subagent-driven development.

## State
- **Phase 1 is DONE and deployed to prod** (merged to `main` at `a6a806e`, pushed). It shipped: the settings drawer (font, 9-theme grid, key toggles, screen toggles), runtime theme/font, fullscreen (+iPhone fallback), a 5-state connection pill with tap-to-reconnect, read-only lock, copy last output/command/screen, orientation/safe-area, and a full a11y pass. No DB changes (per-device localStorage).
- **Work on branch `feat/mobile-terminal-phase2`** (already created off `a6a806e`): `git checkout feat/mobile-terminal-phase2`.

## What to do
1. Read the Phase 2 plan: `docs/superpowers/plans/2026-07-15-mobile-terminal-phase2.md`. Its **RE-AUDIT GATE** header lists the Phase-1-audit flags you MUST honor per task — do not skip them.
2. Read the spec's Phase 2 section for intent: `docs/superpowers/specs/2026-07-15-mobile-terminal-settings-design.md`.
3. Execute the 8 tasks with **subagent-driven-development**: fresh implementer per task, a review after each, a whole-branch opus audit at the end. Use haiku for mechanical/complete-code tasks, sonnet for integration + reviews, opus for the final audit. Track progress in `.superpowers/sdd/progress.md` (append a new Phase 2 section).

## Phase 2 tasks (see plan for detail)
T1 follow-tail (Jump-to-latest + pause-follow) · T2 output flow-control (rAF write-queue, TDD) · T3 in-buffer search (`@xterm/addon-search`) · T4 scrollback-restore on cold load (replay `terminal_chunks` via a new API route) · T5 backgrounding/reattach policy · T6 font-family choice · T7 haptics toggle · T8 confirm-before-close · T9 verify + a11y.

## Audit re-check flags (from the Phase 1 whole-branch audit — apply these)
- **T1:** pausing follow must ALSO suppress the EXISTING forced `scrollToBottom()` — `sendRaw()` (keep: user action should re-pin) and the `visualViewport` resize handler (gate: only re-pin if already at bottom) in `MobileTerminalShell.tsx`.
- **T2:** `flushNow()` the write-queue before `snapshotOutputStart()` (not just `getLastOutput`/`getScreenText`), or the copy-boundary start line goes stale.
- **T4:** a cold load is a fresh page — key replay off `tmuxSession`, NOT the client `sessionId` (`tab.id`), unless you confirm `tab.id` is stable across reloads. Also confirm the ws-server doesn't ALREADY replay on same-`sessionId` reattach (grace-period path) or you'll double-write history.
- **T5:** `Terminal.tsx` ALREADY has a `visibilitychange`/`pageshow` → `connect()` reattach handler — reconcile with it, do NOT add a parallel `forceReconnect()` visibility path. Also handle the CLOSING-race (`onVisible` tests closure `ws` but `connect()` now guards on `wsRef.current`) and map "session gone → exited + Restart" onto the existing `pty_exit → 'exited'`.
- **T3/T6:** new handle methods (`search*`, `setFontFamily`) must read live refs, not close over render state (`useImperativeHandle` deps are `[sessionId, fontSize]`).
- **T7:** haptics ALREADY fire in `KeyChipBar` (`navigator.vibrate(10)`) — only add the on/off pref + gating.

## Key as-built facts (don't re-derive)
- `TerminalHandle` (`src/components/Terminal.tsx`) methods: `sendInput, setFontSize, getFontSize, setTheme, setCursorBlink, fit, focusTerminal, scrollToBottom, closeSession, forceReconnect, copyText, snapshotOutputStart, getLastOutput(lastCommand?), getScreenText`.
- `TermConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'exited'`. Reconnect: exp-backoff + ping/pong; `connect()` has an `if (wsRef.current) return` in-flight guard; `onclose` nulls `wsRef.current` before `scheduleReconnect()`.
- Per-device prefs live in `src/components/mobile-term-prefs.ts` (font, theme id, keys, cursor-blink, fullscreen-hint) — follow that pattern for `font-family` (`devdash-terminal-fontfamily`) and `haptics` (`devdash-terminal-haptics`).
- Mobile surfaces: `src/components/MobileTerminalShell.tsx` (topbar/drawer/keychip/composer) + the `/terminal/[machineId]/[name]` attach route + the `isMobile||isTouch` branch in `src/components/TerminalPanel.tsx`.
- `terminal_chunks` table exists (ws-server records output there) — T4 READS it for replay.
- Themes: `src/components/terminal-themes.ts` (`TERMINAL_THEMES` 9 themes, each with `id`+ANSI fields).
- vitest is set up (`src/lib/__tests__/`); the write-queue (T2) + font-family prefs (T6) get unit tests. UI/device behavior is verified by a real-device manual checklist (user runs it).

## Build/verify gotchas
- Verify: `npx vitest run && npx tsc --noEmit`, then **`rm -rf .next && npm run build`** — a bare `npm run build` intermittently throws a stale-cache `PageNotFoundError: Cannot find module for page: /api/...` during page-data collection when `.next` is dirty from concurrent builds; the `rm -rf .next` clears it (this is NOT a code error).
- Do NOT push/merge to `main` without the user's explicit go (pushing `main` auto-deploys to prod).

## When done
Whole-branch opus audit → present results + a real-device manual checklist → let the user decide on merge/push.
