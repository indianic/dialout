# Mobile Terminal — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.
>
> **RE-AUDIT GATE:** This plan is authored before Phase 1 ships. After Phase 1 is done, re-audit each task against the as-built code (the connection-state model, the drawer, and the handle API may have shifted). Confirm the "Needs re-confirmation" notes on Tasks 4/5/2 before executing them.
>
> **Phase 1 audit flags (from the 2026-07-15 whole-branch audit — MUST address when building these tasks):**
> - **T1 (follow-tail):** pausing follow must suppress the EXISTING forced `scrollToBottom()` calls too — `sendRaw()` scrolls after every input, and the `visualViewport` handler scrolls on every keyboard resize. Both will yank a scrolled-up reader to the bottom unless gated on the new at-bottom state.
> - **T2 (write-queue):** `flushNow()` must run before `snapshotOutputStart()` as well as before `getLastOutput()`/`getScreenText()` — otherwise the recorded start line (`baseY+cursorY`) is stale against a not-yet-flushed buffer and the copy boundary drifts.
> - **T4 (scrollback restore):** a cold load is a fresh page — confirm whether `tab.id` (the client `sessionId`) is stable across reloads (it's persisted in TerminalPanel) or regenerated; if regenerated, replay MUST key off `tmuxSession`, not `sessionId`. Also confirm the ws-server doesn't ALREADY replay scrollback on same-`sessionId` reattach (the grace-period path), or Phase 2 double-writes history.
> - **T5 (backgrounding):** `Terminal.tsx` ALREADY owns a `visibilitychange`/`pageshow` → `connect()` reattach handler. Do NOT add a parallel `forceReconnect()` visibility path — reconcile with the existing `onVisible`. Also handle the CLOSING-race (Phase 1 Minor #3: `onVisible` tests closure `ws` but `connect()` guards on `wsRef.current`) and align "session gone → exited + Restart" with the existing `pty_exit → 'exited'` transition (no new state).
> - **T3/T6 (new handle methods):** `useImperativeHandle` deps are `[sessionId, fontSize]`; new methods (`search*`, `setFontFamily`) must read live refs (like `outputStartRef`/`copyToClipboardRef`) rather than close over render state, to avoid staleness between handle rebuilds.
> - **T7 (haptics):** already fires in `KeyChipBar` (`navigator.vibrate(10)`) — this task only adds the on/off pref + gating.

**Goal:** Add the mobile-terminal resilience + productivity layer: follow-tail (Jump-to-latest) + pause-follow, output flow-control, in-buffer search, scrollback restore on cold load, a defined backgrounding/reattach policy, font-family choice, a haptics setting, and confirm-before-close.

**Architecture:** Extends the Phase 1 surfaces. Terminal.tsx gains a write queue (flow control), scroll tracking (follow-tail), search addon, and cold-load replay. A new API route serves recent `terminal_chunks` for replay. The drawer gains font-family + haptics. No new persistent user schema (replay reads existing `terminal_chunks`).

**Tech Stack:** xterm.js + `@xterm/addon-search` (new dep), Next.js API route (chunk replay), the Phase 1 prefs module + drawer.

## Global Constraints

- Build on Phase 1's `TerminalHandle`, `TerminalSettingsDrawer`, prefs module, and connection-state model — do not fork them.
- `terminal_chunks` already exists (ws-server records output there); replay READS it, never changes how it's written.
- Flow-control must not drop output or reorder it — only coalesce timing.
- Verify with `npx tsc --noEmit`, `npm run build`, `npx vitest run`. New pure logic (flow-control queue, at-bottom math, font-family prefs) gets vitest tests. Behavior (search UI, replay, backgrounding) verified via the real-device manual checklist.
- Font-family and haptics prefs follow the Phase 1 per-device localStorage pattern (`devdash-terminal-fontfamily`, `devdash-terminal-haptics`).

## File Structure

**Create:**
- `src/components/TerminalSearchBar.tsx` — mobile in-buffer search UI
- `src/app/api/terminal-chunks/[sessionId]/route.ts` — GET recent chunks for cold-load replay
- `src/lib/write-queue.ts` — flow-control write coalescer (pure, tested)
- `src/lib/__tests__/write-queue.test.ts`

**Modify:**
- `src/components/Terminal.tsx` — write queue, scroll/at-bottom tracking, search addon, cold-load replay, `setFontFamily`
- `src/components/MobileTerminalShell.tsx` — Jump-to-latest button, search trigger, confirm-before-close, font-family + haptics in drawer wiring
- `src/components/TerminalSettingsDrawer.tsx` — font-family picker + haptics toggle
- `src/components/mobile-term-prefs.ts` — font-family + haptics prefs
- `src/components/KeyChipBar.tsx` — gate `navigator.vibrate` on the haptics pref
- `package.json` — `@xterm/addon-search`

---

## Task 1: Follow-tail ("Jump to latest") + pause-follow

**Files:** Modify `src/components/Terminal.tsx`, `src/components/MobileTerminalShell.tsx`

**Interfaces:**
- `TerminalHandle` gains `isAtBottom(): boolean` and an `onScrollChange?(atBottom: boolean)` prop callback on `Terminal`.
- `MobileTerminalShell` shows a `Jump to latest` button when not at bottom during a live stream; tap → `scrollToBottom()` (which already exists) + resume follow.

- [ ] **Step 1:** In `Terminal.tsx`, use xterm's `onScroll` (and buffer position) to compute `atBottom` (`buffer.viewportY >= buffer.baseY - threshold` — NOTE: an earlier draft of this line read `viewportY + rows >= baseY + length - threshold`, which is mathematically wrong once scrollback exists (baseY ≈ length − rows), so it never reads true; the corrected check compares viewportY directly to baseY). Call `onScrollChange(atBottom)`. **Suppress auto-scroll-to-bottom on new output while the user is scrolled up** (only auto-follow when `atBottom`). Expose `isAtBottom()`.
- [ ] **Step 2:** In `MobileTerminalShell`, track `atBottom` state from `onScrollChange`; render a floating `Jump to latest` pill (image 1, bottom-right) when `!atBottom`; tap → `scrollToBottom()`.
- [ ] **Step 3:** `npx tsc --noEmit && npm run build`.
- [ ] **Step 4:** Commit `feat(mobile-term): follow-tail Jump-to-latest + pause-follow while scrolled up`.

---

## Task 2: Output flow-control / throttling

**Files:** Create `src/lib/write-queue.ts` (+ test); Modify `src/components/Terminal.tsx`

> **Needs re-confirmation after Phase 1:** confirm the current `ws.onmessage` → `term.write` path (Phase 1 didn't change it, but verify) before inserting the queue.

**Interfaces:** `createWriteQueue(write: (data: string) => void, opts?: { maxCharsPerFlush?: number }): { push(data: string): void; flushNow(): void; dispose(): void }` — coalesces pushes and flushes on `requestAnimationFrame`, capped per flush, preserving order.

- [ ] **Step 1 (TDD):** Test the queue with an injected flush trigger (pass a `schedule` fn so it's deterministic without real rAF): pushes accumulate, flush concatenates in order, `maxCharsPerFlush` splits across flushes, no data lost. RED → implement → GREEN.
- [ ] **Step 2:** Implement `write-queue.ts` (pure; rAF injected via optional param defaulting to `requestAnimationFrame`).
- [ ] **Step 3:** In `Terminal.tsx`, route `ws.onmessage` PTY output through the queue instead of writing directly; `dispose()` on cleanup; `flushNow()` before actions that need a synchronous buffer (e.g. `getLastOutput`).
- [ ] **Step 4:** `npx vitest run src/lib/__tests__/write-queue.test.ts && npx tsc --noEmit && npm run build`.
- [ ] **Step 5:** Commit `feat(mobile-term): rAF write-coalescing flow control for heavy output`.

---

## Task 3: In-buffer search (Ctrl-F equivalent)

**Files:** `package.json`; Create `src/components/TerminalSearchBar.tsx`; Modify `src/components/Terminal.tsx`, `src/components/MobileTerminalShell.tsx`

- [ ] **Step 1:** `npm install @xterm/addon-search`.
- [ ] **Step 2:** In `Terminal.tsx`, load `SearchAddon`; expose `search(term, opts)`, `searchNext()`, `searchPrev()`, `clearSearch()` on the handle.
- [ ] **Step 3:** `TerminalSearchBar.tsx` — a slim top bar (input + up/down/close), touch-sized; calls the handle search methods; shows match count if available.
- [ ] **Step 4:** In `MobileTerminalShell`, a search icon (topbar or drawer) toggles the search bar; Esc/close clears.
- [ ] **Step 5:** `npx tsc --noEmit && npm run build`.
- [ ] **Step 6:** Commit `feat(mobile-term): in-buffer search (xterm SearchAddon) with mobile search bar`.

---

## Task 4: Scrollback restore on cold load — CLIENT-SIDE (revised 2026-07-15 per re-audit + user decision)

> **RE-AUDIT RESULT (why the original design was dropped):** `terminal_chunks` is recorded ONLY for directly-spawned (non-tmux) PTYs — tmux-attach connections explicitly SKIP recording (`recording = msg.tmuxSession ? false : …`, deliberately, to avoid multi-viewer duplication). The killed-PWA/cold-load scenario is the tmux `/terminal` surface (Surface B), which therefore has NO chunks to replay. `terminal_chunks.session_id` FKs `terminal_sessions.id` (server `dbSessionId`), not the client WS `sessionId`, and the client `sessionId` is `sessionStorage`-backed (lost on cold PWA launch). Full tmux scrollback lives only in the on-machine daemon (`tmux capture-pane`), which is a separate out-of-repo package. **Decision (user):** implement a self-contained CLIENT-SIDE restore instead — no API route, no DB, no daemon, no change to how chunks are written.

**Files:** Create `src/lib/terminal-scrollback-cache.ts` (+ `src/lib/__tests__/terminal-scrollback-cache.test.ts`); Modify `src/components/Terminal.tsx`; `package.json` (`@xterm/addon-serialize`).

**Design:** Persist a bounded snapshot of the xterm buffer to `localStorage` (per-device) keyed by a stable session key, and replay it into xterm at cold mount before the live stream. Keyed by `tmuxSession` when present (the streaming surface — stable, comes from the `/terminal/[machineId]/[name]` URL); falls back to `sessionId` for plain-PTY tabs (stable across a same-tab reload). This restores what THIS device last saw (bounded), not full server scrollback — an accepted limitation.

**Interfaces:**
- `terminal-scrollback-cache.ts` (pure, tested): `saveScrollback(key: string, data: string): void` (namespaced localStorage key e.g. `devdash-term-scrollback:<key>`, hard byte cap e.g. ≤128KB — truncate from the FRONT so the most-recent tail is kept, never store unbounded), `loadScrollback(key: string): string | null` (corrupt/oversize-safe → null), `clearScrollback(key: string): void`. Fail-safe try/catch like `mobile-term-prefs.ts`.
- `@xterm/addon-serialize@^0.13.x` (scoped, mirrors `@xterm/addon-fit`/`@xterm/addon-search`; peer `@xterm/xterm ^5.0.0` satisfied by classic `xterm@5.3.0` in practice, same as the other scoped addons). Load it via the existing dynamic-import + `loadAddon` pattern; keep a `serializeAddonRef`.

- [ ] **Step 1 (TDD):** Test `terminal-scrollback-cache.ts`: save→load round-trips; oversize input is truncated to the cap keeping the tail; corrupt/missing → null; clear removes it; key namespacing. RED → implement → GREEN.
- [ ] **Step 2:** `npm install @xterm/addon-serialize@^0.13`. In `Terminal.tsx` load `SerializeAddon` (dynamic import, `serializeAddonRef`). Choose `cacheKey = tmuxSession || sessionId`.
- [ ] **Step 3 (save):** Serialize + save on the points where the buffer is at risk of loss: on `visibilitychange → hidden`/`pagehide` (reuse the existing visibility handler from Task 5 — do NOT add a second listener) and on effect teardown, using `serializeAddon.serialize({ scrollback: <N, e.g. 1000> })` to bound lines, then `saveScrollback(cacheKey, str)`. Guard: only when there is a live term.
- [ ] **Step 4 (restore):** On COLD mount only (first connect for this mount — guard with a `restoredRef` so a same-socket reconnect never re-restores), if `loadScrollback(cacheKey)` returns data, write it into xterm **through the Task 2 write-queue** with a subtle `--- restored ---` marker line, before/as the live stream begins. The live stream then continues appending. (Follow-tail from Task 1: restore writes should leave the view pinned to bottom.)
- [ ] **Step 5:** `npx vitest run && npx tsc --noEmit && rm -rf .next && npm run build`.
- [ ] **Step 6:** Commit `feat(mobile-term): client-side scrollback restore on cold load (xterm serialize + localStorage)`.

---

## Task 5: Backgrounding / reattach policy

**Files:** Modify `src/components/Terminal.tsx`, `src/components/MobileTerminalShell.tsx`

> **Needs re-confirmation after Phase 1:** the connection-state model changed in Phase 1; align this with `forceReconnect` and the reconnect grace period rather than adding a parallel path.

**Policy to implement (define explicitly in code comments + spec):**
- Tab/PWA backgrounded → socket may drop; on `visibilitychange` back to `visible`, **reattach to the same PTY** (same sessionId/tmuxName) via the existing reconnect path; do NOT spawn a fresh session.
- If the PTY's grace period expired server-side (session gone), show `exited` and offer restart (do not silently spawn a new shell into the old view).
- Pair with the existing wake-lock re-acquire on visibility.

- [ ] **Step 1:** On `visibilitychange → visible`, if the socket isn't open and the session isn't `exited`, call `forceReconnect()` (which reattaches). Ensure the wake-lock re-acquire (already present) and this don't conflict.
- [ ] **Step 2:** When a reattach finds the session gone (server says exited), surface `exited` + a Restart affordance in the shell instead of auto-spawning.
- [ ] **Step 3:** `npx tsc --noEmit && npm run build`.
- [ ] **Step 4:** Commit `feat(mobile-term): defined background→foreground reattach-to-same-PTY policy`.

---

## Task 6: Font-family choice

**Files:** Modify `src/components/mobile-term-prefs.ts`, `src/components/Terminal.tsx`, `src/components/TerminalSettingsDrawer.tsx`, `src/components/MobileTerminalShell.tsx`

**Interfaces:** prefs `getFontFamily()/saveFontFamily()`; `TerminalHandle.setFontFamily(css: string)`; a small curated list `TERMINAL_FONTS` (e.g. system mono, `JetBrains Mono` (already loaded in the app), `Menlo`, a ligature option) — no heavy web-font downloads beyond what's already bundled.

- [ ] **Step 1 (TDD):** prefs test for font-family default + validation (unknown → default), mirroring the Phase 1 prefs tests.
- [ ] **Step 2:** Add the pref + a `TERMINAL_FONTS` list (only fonts already available to avoid new network fonts).
- [ ] **Step 3:** `Terminal.tsx` `setFontFamily(css)` → `term.options.fontFamily = css`; read saved on init.
- [ ] **Step 4:** Drawer: a font picker (radio list) under FONT SIZE; `MobileTerminalShell` applies live + persists (mirrors theme).
- [ ] **Step 5:** `npx vitest run && npx tsc --noEmit && npm run build`.
- [ ] **Step 6:** Commit `feat(mobile-term): font-family choice with ligature option`.

---

## Task 7: Haptics as a setting

**Files:** Modify `src/components/mobile-term-prefs.ts`, `src/components/KeyChipBar.tsx`, `src/components/TerminalSettingsDrawer.tsx`, `src/components/MobileTerminalShell.tsx`

> Haptics already fire in `KeyChipBar` (`navigator.vibrate(10)`). This only makes them user-toggleable.

- [ ] **Step 1:** prefs `getHaptics()/saveHaptics()` (default true).
- [ ] **Step 2:** `KeyChipBar` reads a `haptics?: boolean` prop (default true) and gates its `haptic()` on it.
- [ ] **Step 3:** Drawer Screen section: a Haptics toggle; shell passes `haptics` to `KeyChipBar` + persists.
- [ ] **Step 4:** `npx tsc --noEmit && npm run build`.
- [ ] **Step 5:** Commit `feat(mobile-term): user-toggleable key-tap haptics`.

---

## Task 8: Confirm-before-close on a live session

**Files:** Modify `src/components/MobileTerminalShell.tsx`

- [ ] **Step 1:** The topbar close (and the tabs-menu per-tab close) — when the target session is **live** (`connectionState === 'connected'` and not exited), show a lightweight confirm (a small sheet/inline confirm, not a JS `confirm()` per the browser-dialog constraint) before calling `onClose`/`onCloseTab`. Exited sessions close without confirmation.
- [ ] **Step 2:** `npx tsc --noEmit && npm run build`.
- [ ] **Step 3:** Commit `feat(mobile-term): confirm before closing a live session`.

---

## Task 9: a11y pass + verification + manual checklist

- [ ] **Step 1:** `ui-craft:a11y-auditor` over the new search bar, Jump-to-latest button, font picker, and confirm sheet.
- [ ] **Step 2:** `npx vitest run && npx tsc --noEmit && npm run build`.
- [ ] **Step 3:** Manual checklist (real device):
  1. Heavy output (`yes` / a webpack build) stays smooth (flow control); no dropped/reordered lines.
  2. Scroll up mid-stream → Jump-to-latest appears + follow pauses; tap resumes.
  3. Search finds + steps through matches; clears cleanly.
  4. Kill the PWA and reopen the session → recent scrollback is restored.
  5. Lock the phone / switch WiFi↔cellular / background the PWA → on return it reattaches to the SAME shell (not a fresh one); if the session died, it shows exited + Restart.
  6. Font-family switch applies live + persists; ligatures render if chosen.
  7. Haptics toggle silences/enables key-tap vibration.
  8. Closing a live session asks to confirm; an exited one doesn't.
- [ ] **Step 4:** Commit `test(mobile-term): phase 2 a11y + verification`.

---

## Task 10: Desktop chrome unification (added 2026-07-15 per user decision)

**Why:** Both terminal surfaces already share the xterm engine (`Terminal.tsx`) and, on touch devices, the same `MobileTerminalShell` (so mobile already has the full Phase 1/2 polish). The gap is **desktop-only**: neither desktop chrome uses the Phase 1 `ConnectionPill` or `TerminalSettingsDrawer` — `TerminalPanel.tsx` desktop has a bespoke `devdash-theme-picker` overlay (~lines 442-515) and no pill; the `/terminal/[machineId]/[name]` attach page desktop bar shows plain-text connection status and has no settings entry point. This task brings the polish to both desktop chromes via SHARED components (do not fork the mobile ones).

**Files:** Modify `src/components/TerminalPanel.tsx` (desktop branch), `src/app/terminal/[machineId]/[name]/page.tsx` (desktop bar). Possibly extract a small shared desktop-settings surface if `TerminalSettingsDrawer` (a bottom sheet) doesn't translate cleanly to desktop.

**Interfaces / decisions:**
- **ConnectionPill first (low-risk, clearly shared):** render `ConnectionPill` (with `onForceReconnect` → the handle's `forceReconnect`) in BOTH desktop chromes, replacing the bespoke plain-text status. The pill already accepts `TermConnectionState`; both desktop chromes already track connection state.
- **Settings on desktop:** surface theme + font-size + font-family + (Phase 2) search from the same source of truth the mobile drawer uses (`mobile-term-prefs` + `TerminalHandle`). Decide during implementation whether to (a) reuse `TerminalSettingsDrawer` rendered as a desktop popover/side panel rather than a bottom sheet, or (b) extract the shared sections into a presentational core both the mobile sheet and a desktop panel consume. Replace `TerminalPanel`'s bespoke `devdash-theme-picker` with whichever is chosen so there is ONE theme picker. Prefer (a) if the sheet restyles cleanly via a variant class; fall back to (b) only if the bottom-sheet layout is structurally wrong for desktop.
- **No behavior change to spawn/attach, WS protocol, or the mobile shell.** This is chrome consolidation only.
- Haptics is mobile-only (N/A on desktop). Font-family + search UI SHOULD appear in the desktop settings surface so desktop users get the Phase 2 controls too.

- [ ] **Step 1:** Add `ConnectionPill` (with force-reconnect wiring) to the `/terminal` attach-page desktop bar and to `TerminalPanel` desktop, replacing plain-text/absent status.
- [ ] **Step 2:** Provide a desktop settings entry point (gear) that opens the shared settings surface (theme grid + font size + font-family + search); remove `TerminalPanel`'s bespoke `devdash-theme-picker` in favor of it. One theme picker only.
- [ ] **Step 3:** `npx vitest run && npx tsc --noEmit && rm -rf .next && npm run build`.
- [ ] **Step 4:** `ui-craft:a11y-auditor` over the new desktop pill + settings surface.
- [ ] **Step 5:** Commit `feat(terminal): unify desktop chrome — shared ConnectionPill + settings across both surfaces`.

---

## Self-Review Notes (author)

- **Spec coverage:** follow-tail (T1), flow-control (T2), search (T3), scrollback restore (T4), backgrounding (T5), font-family (T6), haptics (T7), confirm-close (T8) — all Phase-2 spec items map to a task.
- **Re-audit flags:** T2 (write path), T4 (chunk↔session key, existing replay), and T5 (align with Phase 1 connection model) MUST be re-confirmed against as-built Phase 1 code before execution — noted inline.
- **Reuse:** haptics + paste already exist; scrollback uses existing `terminal_chunks`; reconnect/grace-period reused for backgrounding.
- **Testable core:** write-queue and font-family/haptics prefs get vitest; the rest is device-verified.
