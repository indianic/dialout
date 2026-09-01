# Mobile/iPad Terminal — Settings Drawer, Themes, Runtime Font, Fullscreen

**Date:** 2026-07-15
**Status:** Approved (design), pending implementation plan
**Branch:** feat/mobile-terminal-settings

## Goal

Make the DevDash browser terminal genuinely usable on phones and iPads for
streaming live sessions: a touch-friendly settings drawer (font size, color
theme, keyboard keys, screen behavior), runtime theme + font switching, a
fullscreen mode, and clean behavior in both portrait and landscape — building
on the mobile terminal work that already exists.

## What already exists (build on, do not replace)

- `src/components/MobileTerminalShell.tsx` — full-screen mobile terminal shell
  (topbar, tabs menu, terminal area, input area). Already implements:
  - **Keyboard avoidance** via `window.visualViewport` (panel height binds to
    `vv.height`, refits xterm above the on-screen keyboard).
  - **Font resize** via pinch-to-zoom + double-tap-reset, persisted 10–22px.
  - **Mobile input** — `KeyChipBar` (special keys as chips) + `TerminalComposer`
    (composer input) + RAW/ABC input modes.
  - **Wake lock** (keep screen awake) with visibility re-acquire.
- `src/components/mobile-term-prefs.ts` — font-size persistence
  (`MIN_FONT=10`, `MAX_FONT=22`, `DEFAULT_FONT=13`, localStorage).
- `src/components/terminal-themes.ts` — **9 curated themes** (`TERMINAL_THEMES`:
  Tokyo Night, Dracula, Monokai Pro, Catppuccin, Nord, Solarized Dark, GitHub
  Light, Solarized Light, Rose Pine Dawn) + `DEFAULT_THEME_ID`.
- `src/components/Terminal.tsx` — `TerminalHandle` exposes `setFontSize(px)`,
  `fit()`, `focusTerminal()`, `scrollToBottom()`; accepts a `theme` prop applied
  to xterm at init.
- `/terminal/[machineId]/[name]` route — deep-linkable full-screen attach view
  that renders `MobileTerminalShell`.

## Decisions (locked)

- **Fullscreen:** true fullscreen via the browser **Fullscreen API** where
  supported (Android Chrome, iPadOS Safari 16.4+, desktop). On **iPhone Safari**
  (no Fullscreen API) fall back to an immersive-CSS mode + a one-time
  "Add to Home Screen" hint (the app is already a PWA; installed = no browser
  chrome = real fullscreen).
- **Persistence:** theme + font size are **global per-device** (localStorage),
  applied live to the visible terminal; other terminals pick up the value on
  mount/tab-switch (same pattern the font size already uses).
- **Drawer contents:** font size, theme picker, keyboard-keys config, and
  screen/behavior toggles — all four.
- **Reuse** the existing pinch-zoom, wake-lock, and visualViewport keyboard
  avoidance rather than replacing them.

## Scope & phasing

The full vision (mockup **image 1** = the attach UI; **images 2–3** = the drawer)
ships in two phases so each is a reviewable plan. Nothing is dropped.

**Phase 1 (this spec / next plan):** the settings drawer (font size + 9-theme grid
+ key toggles + screen toggles), runtime theme/font, fullscreen (+iPhone fallback),
orientation/iPad, a11y — PLUS the low-cost "surface what already exists" topbar
wins that make the attach UI match image 1: the **connection pill**, the
**read-only lock** indicator, and **copy last output / copy last command / paste**.
These reuse infrastructure that already exists (auto-reconnect+backoff+PTY-reattach
in `Terminal.tsx`, the clipboard/OSC-52 helper, peek/drive mode).

**Phase 2 (separate spec + plan):** follow-tail "Jump to latest" + pause-follow,
output flow-control/throttling, in-buffer search, scrollback-restore on a cold
load (killed PWA), a formal backgrounding/reattach policy, font-family choice,
haptic feedback, and confirm-before-close. Enumerated at the end of this doc.

## Architecture

New, isolated units (keep the already-large `MobileTerminalShell` from growing
further; each unit is independently understandable/testable):

- `src/components/TerminalSettingsDrawer.tsx` — the bottom-sheet drawer UI
  (font, theme, keys, screen sections). Presentational + callbacks; owns no
  terminal refs.
- Extend `src/components/mobile-term-prefs.ts` into the single per-device prefs
  module: font size (existing) + **theme id**, **keychip config**, **cursor-blink**,
  **fullscreen-hint-seen**. Pure get/set + clamp/validate + localStorage. Unit
  tested. (Keeping it in the existing file means current importers of
  `getSavedFontSize`/`clampFont` keep working unchanged.)
- `src/components/useFullscreen.ts` — `useFullscreen(ref)` hook returning
  `{ isFullscreen, supported, toggle }`. Wraps `requestFullscreen`/
  `exitFullscreen` (+ vendor-prefixed webkit), listens to `fullscreenchange`,
  and reports `supported=false` on iPhone Safari so the shell renders the
  fallback.
- Extend `TerminalHandle` in `Terminal.tsx` with **`setTheme(theme: TerminalTheme)`**
  → sets `xtermInstance.options.theme = mapped` at runtime (same field mapping
  already used at init).

Wiring: `MobileTerminalShell` gains a gear button in the topbar actions, holds
`drawerOpen` state, reads prefs from `terminal-prefs`, and passes current
values + setters to `TerminalSettingsDrawer`. Changing font/theme calls the
active `TerminalHandle` setter + persists; on tab switch/mount the saved values
are applied (mirroring the existing font effect). KeyChipBar receives the
configured key set.

## Components / behavior

### 1. Settings drawer (bottom sheet)
- **Trigger:** a gear icon-button added to `devdash-mts-actions` (alongside
  wake/RAW/close).
- **Sheet:** slides up from the bottom (thumb-reachable), drag-handle at top,
  dimmed backdrop; dismiss via tap-backdrop, swipe-down, or a close control.
  Padded with `env(safe-area-inset-bottom)`. All controls ≥44px touch targets.
  Opening the drawer blurs the terminal input so it sits above (not under) the
  keyboard; the sheet is scrollable if it exceeds the visible viewport.
- **Sections:**
  - **Font size** — label showing current px, a large `−`/`+` stepper, a range
    slider (10–22), and a Reset (→ `DEFAULT_FONT`). Applies live + persists.
  - **Theme** — 2-column grid of the 9 themes; each card shows the theme
    background with a small ANSI-color strip (red/green/yellow/blue/magenta/cyan)
    and the name; the active theme is checked. Tap = apply live + persist.
  - **Keys** — a list of toggles for the KeyChipBar keys (Esc, Tab, Ctrl, ↑↓←→,
    `|`, `/`, `~`, `-`, Home/End, PgUp/PgDn); on/off persisted; KeyChipBar renders
    only enabled keys. A sane default set is enabled out of the box.
  - **Screen** — Fullscreen toggle (enter/exit, or the iPhone fallback + hint),
    Keep-screen-awake toggle (drives the existing wake-lock), Cursor-blink toggle.

### 2. Runtime theme switching
- `TerminalHandle.setTheme(theme)` updates `xterm.options.theme`.
- `Terminal` reads the saved theme id → theme object as its initial `theme` prop.
- On theme change: shell resolves id → `TerminalTheme`, calls `setTheme` on the
  active handle, persists the id. On tab switch/mount: apply saved theme (a
  small effect like the existing font one).

### 3. Fullscreen
- `useFullscreen(shellRef)`:
  - `supported` = `!!element.requestFullscreen || !!element.webkitRequestFullscreen`.
  - `toggle()` enters/exits; `isFullscreen` tracks `document.fullscreenElement`
    via the `fullscreenchange` listener.
- Shell renders the fullscreen control's state from `isFullscreen`. When
  `supported === false` (iPhone Safari): the toggle instead enables an
  **immersive-CSS** class on the shell (`position: fixed; inset: 0;` filling
  `visualViewport`, hiding the app's own chrome) and shows a dismissible
  "Add to Home Screen for true fullscreen" hint once (persisted so it's shown
  at most once).

### 4. Orientation & responsiveness
- Both orientations already function via the `vvHeight` binding. Add:
  - Landscape tuning in `mobile-terminal.css` (compact topbar + keychip + composer
    so the terminal gets maximum height; larger min font legibility).
  - `orientationchange` → `fit()` + `scrollToBottom()` (in addition to the
    existing `visualViewport` resize handler).
  - `env(safe-area-inset-*)` padding on topbar/input/drawer so notch and
    home-indicator never occlude content in either orientation.

### 5. Keyboard focus (already works — polish only)
- Keep the visualViewport avoidance. Ensure: focusing input scrolls terminal to
  bottom; the keychip/composer row and the open drawer stay above the keyboard.

### 6. Connection pill (Phase 1)
- Expand `TermConnectionState` from `'connected' | 'reconnecting' | 'exited'` to
  `'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'exited'` — add
  `connecting` (initial socket open, before first `onopen`) and `disconnected`
  (retries exhausted, or `navigator.onLine === false`); keep `connected` (shown as
  **"live"** in the UI) and `exited` (session ended). `Terminal.tsx` sets these at
  the existing state transitions; the small cross-cutting change updates the
  consumers (`TerminalPanel`, `MobileTerminalShell`, the attach page) for the new
  members. The reconnect+backoff+PTY-reattach that drives these already exists.
- **Pill** (image 1, top-left): a rounded chip = status dot + label with a
  per-state treatment — live=green, connecting/reconnecting=amber (subtle pulse),
  disconnected=red, exited=grey. Replaces the current bare dot+title in the
  `MobileTerminalShell` topbar (and can be reused on desktop later).
- **Tap:** when not `connected`, tapping forces an immediate reconnect (resets
  backoff); when live it's non-interactive. (The mockup's "tap to cycle states" is
  only a preview affordance — real taps force-reconnect.)

### 7. Read-only lock (Phase 1)
- Surface the existing peek/drive (`readOnlyBanner`) state as a **lock icon** in
  the topbar (image 1): closed lock = read-only (peek), tapping requests Drive
  (reuses `onRequestDrive`); open lock = interactive. Indicator + shortcut only —
  input gating is already enforced server-side (tmux `-r`) and client-side (peek
  suppresses input); this doesn't change the gating, just exposes it.

### 8. Copy / paste (Phase 1)
- Reuse the existing secure-context clipboard helper + OSC-52 path in
  `Terminal.tsx`; extend `TerminalHandle` with the copy/paste helpers rather than
  duplicating clipboard logic.
- **Copy last command:** the composer already knows the last line it sent — store
  it; a button copies it.
- **Copy last output:** on each command send, snapshot the xterm buffer's current
  line count; "copy last output" copies buffer text from that snapshot line to the
  current end (approximate, needs no shell integration). "Copy screen" (visible
  viewport) is offered as a fallback.
- **Paste:** a paste control in the composer reads `navigator.clipboard.readText()`
  (secure-context guarded) into the composer (or sends raw in RAW mode).
- Surfaced via the topbar **copy icon** (image 1) opening a small action set
  (last output / last command / screen) + a paste control in the composer row. All
  ops honor the existing "clipboard unavailable over http" guard.

## Data model

No database changes. All new state is per-device in `localStorage`:
- `devdash-mobile-fontsize` (existing)
- `devdash-terminal-theme` — theme id (validated against `TERMINAL_THEMES`;
  invalid/absent → `DEFAULT_THEME_ID`)
- `devdash-terminal-keys` — JSON map of `{ keyId: boolean }`; absent → defaults
- `devdash-terminal-cursorblink` — boolean
- `devdash-fullscreen-hint-seen` — boolean (iPhone hint shown once)

## Testing

- Unit tests (vitest, already set up) for `terminal-prefs.ts`: font clamp,
  theme id validation/fallback, keychip config parse/serialize/defaults,
  cursor-blink/hint booleans, corrupt-localStorage fail-safe.
- `useFullscreen` capability detection is environment-dependent; cover its pure
  parts if practical, otherwise verify in the manual checklist.
- Everything else (drawer UI, orientation, fullscreen, keyboard-above-keyboard)
  verified by a manual mobile/iPad checklist (real device — Fullscreen API,
  visualViewport, and touch cannot be exercised headlessly).

## Design quality

- Build the drawer + theme swatches per the **ui-craft** skill (touch-first,
  dense-dashboard aesthetic consistent with DevDash).
- Run **ui-craft:a11y-auditor** over the drawer: ≥44px targets, `focus-visible`,
  theme-swatch/label contrast, `prefers-reduced-motion` for the sheet slide,
  ARIA for the toggles and the modal sheet.

## Phase 2 (deferred — separate spec + plan)

Captured here so nothing is lost; each gets designed properly in its own pass.

- **Follow-tail:** detect scroll-up during a live stream → show a "Jump to latest"
  button (image 1); while scrolled up, pause auto-follow so reading isn't yanked to
  the bottom; tapping resumes follow.
- **Output flow-control / throttling:** rAF-coalesce / batch heavy writes (e.g. a
  webpack build spewing thousands of lines) with a max-chunk-per-frame so xterm
  doesn't jank on a phone.
- **In-buffer search:** xterm `SearchAddon` + a mobile search bar (Ctrl-F
  equivalent) with next/prev.
- **Scrollback restore on cold load:** on a fresh attach after a killed PWA, replay
  recent `terminal_chunks` into xterm (bounded) so history isn't lost.
- **Backgrounding policy:** define + implement reattach-to-same-PTY vs fresh-session
  on resume, coordinated with wake-lock and the reconnect grace period.
- **Font family choice:** font-family picker in the drawer (a few bundled monos +
  a ligature option), persisted like the theme.
- **Haptics:** `navigator.vibrate` on key-chip taps (guarded; respects a setting).
- **Confirm-before-close** on a still-live session.

## Out of scope (YAGNI)

- Per-terminal (non-global) theme/font.
- Account-synced (server-side) preferences.
- Custom user-authored themes / a theme editor.
- Desktop `TerminalPanel` settings (the drawer is mobile-first; it can be reused
  later but isn't required now).
- Reflowing key chips beyond enable/disable (no drag-reorder).

## Key constraints / gotchas

- **iPhone Safari has no Fullscreen API** — the fallback path is mandatory, not
  optional.
- React root touch events are passive since React 17; native `preventDefault`
  listeners are required for gestures (already done for pinch — follow the same
  pattern for any new gesture).
- Chrome's dev resize clamps at 606px; mobile-breakpoint testing needs an
  `innerWidth` override (project memory).
- Applying a theme/font must go through the `TerminalHandle` (never re-import or
  duplicate xterm option logic elsewhere).
