# Mobile Terminal — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the touch settings drawer (font, 9-theme grid, key toggles, screen toggles), runtime theme/font switching, fullscreen (+iPhone fallback), orientation/iPad polish, and the image-1 topbar wins (connection pill, read-only lock, copy/paste) for the mobile/iPad terminal.

**Architecture:** New isolated units — a per-device prefs module (extends `mobile-term-prefs.ts`), a `TerminalSettingsDrawer` bottom sheet, a `useFullscreen` hook, a `ConnectionPill` — wired into the existing `MobileTerminalShell`. `TerminalHandle` gains `setTheme`/`forceReconnect`/copy helpers. All prefs are per-device localStorage; no DB changes.

**Tech Stack:** Next.js 15, React 19, xterm.js, vitest (prefs unit tests), lucide-react icons, plain CSS in `mobile-terminal.css`.

## Global Constraints

- **Reuse, don't rebuild:** the existing `MobileTerminalShell` (visualViewport keyboard avoidance, pinch-zoom, wake-lock, tabs, RAW/ABC), `terminal-themes.ts` (`TERMINAL_THEMES` — 9 themes, `DEFAULT_THEME_ID`), `mobile-term-prefs.ts` (font size), `KeyChipBar` (haptics + paste chip already exist), `TerminalComposer`, and `Terminal.tsx` reconnect/backoff/clipboard/OSC-52. Do not duplicate any of it.
- **Theme/font are applied ONLY through `TerminalHandle`** (`setFontSize`, new `setTheme`) — never re-import or duplicate xterm option logic.
- Prefs are per-device, `localStorage`, validated on read (fail-safe to defaults). Keys: `devdash-mobile-fontsize` (existing), `devdash-terminal-theme`, `devdash-terminal-keys`, `devdash-terminal-cursorblink`, `devdash-fullscreen-hint-seen`.
- Font range stays 10–22px (`MIN_FONT`/`MAX_FONT`/`DEFAULT_FONT`). 9 themes exactly as in `terminal-themes.ts`.
- Touch UI: ≥44px targets, `env(safe-area-inset-*)` padding, `prefers-reduced-motion` on the sheet animation, `focus-visible`. Follow existing `devdash-mts-*` / `devdash-kcb-*` CSS naming.
- Verify web changes with `npx tsc --noEmit` and `npm run build`; unit tests with `npx vitest run`. No DB/`db:push`.
- Clipboard ops must keep the existing secure-context guard ("clipboard unavailable over http").

## File Structure

**Create:**
- `src/components/TerminalSettingsDrawer.tsx` — bottom-sheet drawer (presentational + callbacks)
- `src/components/useFullscreen.ts` — fullscreen hook
- `src/components/ConnectionPill.tsx` — status pill
- `src/lib/__tests__/terminal-prefs.test.ts` — prefs unit tests

**Modify:**
- `src/components/mobile-term-prefs.ts` — add theme/keys/cursor-blink/hint prefs
- `src/components/terminal-keys.ts` — add Home/End/PgUp/PgDn; export `DEFAULT_ENABLED_KEYS`
- `src/components/KeyChipBar.tsx` — filter by `enabledKeys`
- `src/components/Terminal.tsx` — `setTheme`/`forceReconnect` on handle; `mapTheme` extraction; expand `TermConnectionState`
- `src/components/MobileTerminalShell.tsx` — gear/drawer, pill, lock, copy/paste, fullscreen wiring
- `src/components/mobile-terminal.css` — drawer, pill, lock, orientation, safe-area, reduced-motion
- Consumers of `TermConnectionState` (`TerminalPanel.tsx`, attach page) — new enum members

---

## Task 1: Prefs module (extend `mobile-term-prefs.ts`)

**Files:**
- Modify: `src/components/mobile-term-prefs.ts`
- Test: `src/lib/__tests__/terminal-prefs.test.ts`

**Interfaces:**
- Consumes: `TERMINAL_THEMES`, `DEFAULT_THEME_ID` from `./terminal-themes`.
- Produces (new exports, alongside existing `MIN_FONT`/`MAX_FONT`/`DEFAULT_FONT`/`clampFont`/`getSavedFontSize`/`saveFontSize`):
  - `getSavedThemeId(): string` / `saveThemeId(id: string): void`
  - `getSavedKeys(): Record<string, boolean>` / `saveKeys(map: Record<string, boolean>): void`
  - `getCursorBlink(): boolean` / `saveCursorBlink(v: boolean): void`
  - `getFullscreenHintSeen(): boolean` / `setFullscreenHintSeen(): void`

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/terminal-prefs.test.ts`

Note the import path: `mobile-term-prefs.ts` lives in `src/components/`. Import `from '../../components/mobile-term-prefs'`. The test needs a localStorage stub in the node env.

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_THEME_ID } from '../../components/terminal-themes';
import {
  getSavedThemeId, saveThemeId, getSavedKeys, saveKeys,
  getCursorBlink, saveCursorBlink, getFullscreenHintSeen, setFullscreenHintSeen,
} from '../../components/mobile-term-prefs';

beforeEach(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
    },
  });
});

describe('terminal-prefs', () => {
  it('theme id defaults and round-trips, rejects unknown ids', () => {
    expect(getSavedThemeId()).toBe(DEFAULT_THEME_ID);
    saveThemeId('dracula');
    expect(getSavedThemeId()).toBe('dracula');
    saveThemeId('not-a-theme');
    expect(getSavedThemeId()).toBe(DEFAULT_THEME_ID); // invalid rejected on read/write
  });

  it('keys default to the default-enabled set and round-trip', () => {
    const def = getSavedKeys();
    expect(typeof def).toBe('object');
    expect(def.esc).toBe(true);
    saveKeys({ ...def, esc: false });
    expect(getSavedKeys().esc).toBe(false);
  });

  it('cursor blink defaults true and round-trips', () => {
    expect(getCursorBlink()).toBe(true);
    saveCursorBlink(false);
    expect(getCursorBlink()).toBe(false);
  });

  it('fullscreen hint is one-shot', () => {
    expect(getFullscreenHintSeen()).toBe(false);
    setFullscreenHintSeen();
    expect(getFullscreenHintSeen()).toBe(true);
  });

  it('corrupt localStorage falls back safely', () => {
    window.localStorage.setItem('devdash-terminal-keys', '{bad json');
    expect(getSavedKeys().esc).toBe(true); // no throw, defaults
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/__tests__/terminal-prefs.test.ts`
Expected: FAIL — the new exports don't exist.

- [ ] **Step 3: Append to `src/components/mobile-term-prefs.ts`**

```ts
import { TERMINAL_THEMES, DEFAULT_THEME_ID } from './terminal-themes';
import { DEFAULT_ENABLED_KEYS } from './terminal-keys';

const THEME_KEY = 'devdash-terminal-theme';
const KEYS_KEY = 'devdash-terminal-keys';
const CURSOR_KEY = 'devdash-terminal-cursorblink';
const HINT_KEY = 'devdash-fullscreen-hint-seen';

function isKnownTheme(id: string): boolean {
  return TERMINAL_THEMES.some((t) => t.id === id);
}

export function getSavedThemeId(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    if (v && isKnownTheme(v)) return v;
  } catch {}
  return DEFAULT_THEME_ID;
}
export function saveThemeId(id: string): void {
  if (!isKnownTheme(id)) return;
  try { window.localStorage.setItem(THEME_KEY, id); } catch {}
}

export function getSavedKeys(): Record<string, boolean> {
  if (typeof window === 'undefined') return { ...DEFAULT_ENABLED_KEYS };
  try {
    const raw = window.localStorage.getItem(KEYS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return { ...DEFAULT_ENABLED_KEYS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_ENABLED_KEYS };
}
export function saveKeys(map: Record<string, boolean>): void {
  try { window.localStorage.setItem(KEYS_KEY, JSON.stringify(map)); } catch {}
}

export function getCursorBlink(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(CURSOR_KEY) !== 'false'; } catch { return true; }
}
export function saveCursorBlink(v: boolean): void {
  try { window.localStorage.setItem(CURSOR_KEY, String(v)); } catch {}
}

export function getFullscreenHintSeen(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(HINT_KEY) === 'true'; } catch { return true; }
}
export function setFullscreenHintSeen(): void {
  try { window.localStorage.setItem(HINT_KEY, 'true'); } catch {}
}
```

Note: this requires `terminal-keys.ts` to export `DEFAULT_ENABLED_KEYS` and each theme to have an `id`. Task 4 adds `DEFAULT_ENABLED_KEYS`; **verify `TerminalTheme` already has an `id` field** — `terminal-themes.ts` has `DEFAULT_THEME_ID = 'tokyo-night'`, so ids exist; if the theme objects use a different id field, adjust `isKnownTheme` accordingly (check `terminal-themes.ts` first). Do Task 4's `DEFAULT_ENABLED_KEYS` addition before running this test, or stub it.

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/lib/__tests__/terminal-prefs.test.ts`
Expected: PASS (5 tests). (If `DEFAULT_ENABLED_KEYS` isn't added yet, do Task 4 Step 1 first.)

- [ ] **Step 5: Commit**

```bash
git add src/components/mobile-term-prefs.ts src/lib/__tests__/terminal-prefs.test.ts
git commit -m "feat(mobile-term): per-device prefs for theme, keys, cursor-blink, fullscreen hint"
```

---

## Task 2: `terminal-keys.ts` — nav keys + default enabled set

**Files:**
- Modify: `src/components/terminal-keys.ts`

**Interfaces:**
- Produces: 4 new chips (`home`,`end`,`pgup`,`pgdn`) appended to `KEY_CHIPS`; `DEFAULT_ENABLED_KEYS: Record<string, boolean>`.

- [ ] **Step 1: Add nav-key chips to `KEY_CHIPS`** (after `dash`, before the `ctrl-*` group):

```ts
  { id: 'home', label: 'Home', seq: '\x1b[H' },
  { id: 'end', label: 'End', seq: '\x1b[F' },
  { id: 'pgup', label: 'PgUp', seq: '\x1b[5~' },
  { id: 'pgdn', label: 'PgDn', seq: '\x1b[6~' },
```

- [ ] **Step 2: Export the default-enabled set** (bottom of file). Enabled by default = the image-3 defaults (Esc, Tab, Ctrl, arrows, `|`, `/`, `~`, `-` on; Home/End/PgUp/PgDn off; the `^C/^D/^Z/^R/^L` power chips + paste on):

```ts
// Which chips show by default in the KeyChipBar (user-overridable, persisted).
export const DEFAULT_ENABLED_KEYS: Record<string, boolean> = {
  esc: true, tab: true, ctrl: true,
  up: true, down: true, left: true, right: true,
  pipe: true, tilde: true, slash: true, dash: true,
  home: false, end: false, pgup: false, pgdn: false,
  'ctrl-c': true, 'ctrl-d': true, 'ctrl-z': true, 'ctrl-r': true, 'ctrl-l': true,
  paste: true,
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/terminal-keys.ts
git commit -m "feat(mobile-term): add Home/End/PgUp/PgDn chips + default-enabled key set"
```

---

## Task 3: `KeyChipBar` filters by enabled keys

**Files:**
- Modify: `src/components/KeyChipBar.tsx`

**Interfaces:**
- Consumes: `DEFAULT_ENABLED_KEYS`.
- Produces: `KeyChipBarProps` gains `enabledKeys?: Record<string, boolean>`; renders only enabled chips, preserving `KEY_CHIPS` order; horizontal scroll unchanged.

- [ ] **Step 1: Add the prop + filter**

In `KeyChipBarProps` add `enabledKeys?: Record<string, boolean>;`. In the component, compute the visible list and map over it instead of `KEY_CHIPS`:
```ts
import { KEY_CHIPS, ctrlByte, DEFAULT_ENABLED_KEYS } from './terminal-keys';
// ...
const enabled = enabledKeys ?? DEFAULT_ENABLED_KEYS;
const visibleChips = KEY_CHIPS.filter((c) => enabled[c.id] !== false);
// render: visibleChips.map((chip) => ...)  (unchanged chip button body)
```
Keep the existing haptic/ctrl/paste/pointer logic exactly as-is.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/KeyChipBar.tsx
git commit -m "feat(mobile-term): KeyChipBar renders only enabled keys"
```

---

## Task 4: `mapTheme` + `setTheme` on the terminal handle

**Files:**
- Modify: `src/components/Terminal.tsx`

**Interfaces:**
- Produces: a module `mapTheme(theme: TerminalTheme): ITheme`-shaped object (extracted from the existing init mapping ~lines 244-259); `TerminalHandle.setTheme(theme: TerminalTheme): void`.

- [ ] **Step 1: Extract the theme mapping**

Find the inline `const appliedTheme = theme ? { background: theme.background, ... } : undefined;` block used at xterm init. Extract it to a module-level helper:
```ts
function mapTheme(t: TerminalTheme) {
  return {
    background: t.background, foreground: t.foreground, cursor: t.cursor,
    cursorAccent: t.cursorAccent, selectionBackground: t.selectionBackground,
    black: t.black, red: t.red, green: t.green, yellow: t.yellow, blue: t.blue,
    magenta: t.magenta, cyan: t.cyan, white: t.white,
    brightBlack: t.brightBlack, brightRed: t.brightRed, brightGreen: t.brightGreen,
    brightYellow: t.brightYellow, brightBlue: t.brightBlue, brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan, brightWhite: t.brightWhite,
  };
}
```
(Copy the EXACT field set the init block currently uses — read lines ~244-268 and match every field; do not invent fields.) Use `theme ? mapTheme(theme) : undefined` at init.

- [ ] **Step 2: Add `setTheme` to the handle**

In the `useImperativeHandle` object add:
```ts
    setTheme: (t: TerminalTheme) => {
      const term = termRef.current;
      if (term) { try { term.options.theme = mapTheme(t); } catch {} }
    },
```
Add `setTheme` to the `TerminalHandle` interface.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/components/Terminal.tsx
git commit -m "feat(mobile-term): setTheme on TerminalHandle for runtime theme switching"
```

---

## Task 5: Expand `TermConnectionState` + `forceReconnect`

**Files:**
- Modify: `src/components/Terminal.tsx`; consumers `src/components/TerminalPanel.tsx`, `src/app/terminal/[machineId]/[name]/page.tsx`, `src/components/MobileTerminalShell.tsx`

**Interfaces:**
- Produces: `TermConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'exited'`; `TerminalHandle.forceReconnect(): void`.

- [ ] **Step 1: Widen the type + emit new states**

Change the type. In the WS lifecycle: emit `'connecting'` right before `new WebSocket(url)` (and on the reconnect timer firing); keep `'connected'` on `onopen`; keep `'reconnecting'` on `onclose` while it will retry; emit `'disconnected'` when retries are abandoned (e.g. `destroyed`/`exited` false but no further retry) or when `navigator.onLine === false` at close. Keep `'exited'` for session end. Do NOT change the backoff logic itself.

- [ ] **Step 2: `forceReconnect` handle method**

Add a method that, if not exited, closes the current socket to trigger the existing reconnect path immediately and resets the attempt counter:
```ts
    forceReconnect: () => {
      try { wsRef.current?.close(); } catch {}
      // the existing onclose → scheduleReconnect path handles the rest
    },
```
Add `forceReconnect` to `TerminalHandle`. (If the attempt counter is in closure scope, expose a reset via a ref or call the existing connect function directly — match the file's existing reconnect structure.)

- [ ] **Step 3: Update consumers for the new enum members**

Grep `TermConnectionState` usages. Anywhere that switches on the old 3 members, handle `'connecting'` (treat like reconnecting/not-live) and `'disconnected'` (treat like dead). In `MobileTerminalShell`, `live` currently = `connectionState !== 'exited'` — tighten to `connectionState === 'connected'` for the pill's live treatment (Task 7 uses this).

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed (no non-exhaustive-switch or type errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/Terminal.tsx src/components/TerminalPanel.tsx "src/app/terminal/[machineId]/[name]/page.tsx" src/components/MobileTerminalShell.tsx
git commit -m "feat(mobile-term): richer connection states (connecting/disconnected) + forceReconnect"
```

---

## Task 6: `useFullscreen` hook

**Files:**
- Create: `src/components/useFullscreen.ts`

**Interfaces:**
- Produces: `useFullscreen(ref: RefObject<HTMLElement>): { isFullscreen: boolean; supported: boolean; toggle: () => void }`.

- [ ] **Step 1: Implement**

```ts
import { useCallback, useEffect, useState, type RefObject } from 'react';

type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };

export function useFullscreen(ref: RefObject<HTMLElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const supported = typeof document !== 'undefined' && (() => {
    const el = document.documentElement as FsEl;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen);
  })();

  useEffect(() => {
    const onChange = () => {
      const d = document as FsDoc;
      setIsFullscreen(!!(document.fullscreenElement || d.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange as EventListener);
    };
  }, []);

  const toggle = useCallback(() => {
    const d = document as FsDoc;
    const el = ref.current as FsEl | null;
    if (!el) return;
    if (document.fullscreenElement || d.webkitFullscreenElement) {
      (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
    } else {
      (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
    }
  }, [ref]);

  return { isFullscreen, supported, toggle };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/useFullscreen.ts
git commit -m "feat(mobile-term): useFullscreen hook with webkit fallback + supported flag"
```

---

## Task 7: `ConnectionPill` component

**Files:**
- Create: `src/components/ConnectionPill.tsx`

**Interfaces:**
- Consumes: `TermConnectionState`.
- Produces: `ConnectionPill({ state, title, onForceReconnect })` — a rounded chip with a status dot + label; tap forces reconnect when not `connected`.

- [ ] **Step 1: Implement**

```tsx
'use client';
import type { TermConnectionState } from './Terminal';

const LABEL: Record<TermConnectionState, string> = {
  connecting: 'connecting', connected: 'live', reconnecting: 'reconnecting',
  disconnected: 'offline', exited: 'ended',
};

interface Props {
  state: TermConnectionState;
  title: string;
  onForceReconnect: () => void;
}

export default function ConnectionPill({ state, title, onForceReconnect }: Props) {
  const interactive = state !== 'connected' && state !== 'exited';
  return (
    <button
      type="button"
      className={`devdash-connpill ${state}`}
      onClick={interactive ? onForceReconnect : undefined}
      aria-label={interactive ? `Connection ${LABEL[state]} — tap to reconnect` : `Connection ${LABEL[state]}`}
      title={title}
    >
      <span className="devdash-connpill-dot" />
      <span className="devdash-connpill-label">{LABEL[state]}</span>
      <span className="devdash-connpill-title">{title}</span>
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/ConnectionPill.tsx
git commit -m "feat(mobile-term): ConnectionPill with per-state treatment + tap-to-reconnect"
```

---

## Task 8: `TerminalSettingsDrawer` component

**Files:**
- Create: `src/components/TerminalSettingsDrawer.tsx`

**Interfaces:**
- Consumes: `TERMINAL_THEMES`, `MIN_FONT`/`MAX_FONT`/`DEFAULT_FONT`, `KEY_CHIPS`.
- Produces:
```ts
interface TerminalSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  fontSize: number;
  onFontSize: (px: number) => void;   // live-apply + persist handled by parent
  themeId: string;
  onThemeId: (id: string) => void;
  enabledKeys: Record<string, boolean>;
  onToggleKey: (id: string, on: boolean) => void;
  fullscreenSupported: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  wakeOn: boolean;
  onToggleWake: () => void;
  cursorBlink: boolean;
  onToggleCursorBlink: (v: boolean) => void;
}
```

- [ ] **Step 1: Implement the bottom sheet** (per images 2 & 3)

A bottom sheet with backdrop + drag handle + close X, four sections (FONT SIZE, THEME, KEYBOARD KEYS, SCREEN). Render `null` when `!open`. Use `devdash-tsd-*` classes (styled in Task 11). Sections:
- **Font size:** `−` button (→ `onFontSize(clamp(fontSize-1))`), an `<input type="range" min={MIN_FONT} max={MAX_FONT}>` (→ `onFontSize`), `+` button, current `{fontSize}px` label, reset button (→ `onFontSize(DEFAULT_FONT)`).
- **Theme:** 2-col grid over `TERMINAL_THEMES`; each card = theme name + a 6-swatch ANSI strip (`red,green,yellow,blue,magenta,cyan`) on the theme `background`; `active` class + check when `t.id === themeId`; tap → `onThemeId(t.id)`.
- **Keyboard keys:** map `KEY_CHIPS` (exclude the modifier/paste/`ctrl-*` power chips OR include all — include the label set shown in image 3: esc,tab,ctrl,up,down,left,right,pipe,slash,tilde,dash,home,end,pgup,pgdn) to a toggle row each; a toggle → `onToggleKey(id, next)`. Use a real checkbox `<input type="checkbox" role="switch">` styled as a toggle for a11y.
- **Screen:** Fullscreen toggle (disabled + "not supported on this browser — Add to Home Screen" note when `!fullscreenSupported`), Keep-screen-awake toggle (`wakeOn`/`onToggleWake`), Cursor-blink toggle (`cursorBlink`/`onToggleCursorBlink`).

Backdrop click and the X call `onClose`. The sheet content scrolls if taller than the viewport.

Full skeleton (fill the section bodies per above):
```tsx
'use client';
import { X, RotateCcw } from 'lucide-react';
import { TERMINAL_THEMES } from './terminal-themes';
import { MIN_FONT, MAX_FONT, DEFAULT_FONT } from './mobile-term-prefs';
import { KEY_CHIPS } from './terminal-keys';
// ...props interface above...
export default function TerminalSettingsDrawer(props: TerminalSettingsDrawerProps) {
  if (!props.open) return null;
  const swatch = (t: (typeof TERMINAL_THEMES)[number]) =>
    [t.red, t.green, t.yellow, t.blue, t.magenta, t.cyan];
  return (
    <div className="devdash-tsd-root" role="dialog" aria-modal="true" aria-label="Terminal settings">
      <div className="devdash-tsd-backdrop" onClick={props.onClose} />
      <div className="devdash-tsd-sheet">
        <div className="devdash-tsd-handle" />
        <div className="devdash-tsd-head">
          <span>Terminal settings</span>
          <button className="devdash-tsd-x" aria-label="Close" onClick={props.onClose}><X size={18} /></button>
        </div>
        {/* FONT SIZE section */}
        {/* THEME grid */}
        {/* KEYBOARD KEYS toggles */}
        {/* SCREEN toggles */}
      </div>
    </div>
  );
}
```
Implement each section fully following the props above; use the theme fields from `TerminalTheme` for swatches (read `terminal-themes.ts` for exact field names). Keys list = the 15 label chips from image 3.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add src/components/TerminalSettingsDrawer.tsx
git commit -m "feat(mobile-term): settings drawer (font, theme grid, key toggles, screen)"
```

---

## Task 9: Wire everything into `MobileTerminalShell`

**Files:**
- Modify: `src/components/MobileTerminalShell.tsx`

**Interfaces:**
- Consumes: `TerminalSettingsDrawer`, `ConnectionPill`, `useFullscreen`, the prefs getters/setters, the handle's `setTheme`/`setFontSize`/`forceReconnect`.

- [ ] **Step 1: State + prefs**

Add state: `drawerOpen`, `themeId` (init `getSavedThemeId()`), `enabledKeys` (init `getSavedKeys()`), `cursorBlink` (init `getCursorBlink()`). Add `shellRef` for `useFullscreen(shellRef)`. Keep the existing `fontSizeRef`/wake/vv logic.

- [ ] **Step 2: Apply theme/font live + persist**

- `applyTheme(id)`: resolve `TERMINAL_THEMES.find(t => t.id === id)`, call `getActiveHandle()?.setTheme(theme)`, `saveThemeId(id)`, `setThemeId(id)`.
- On tab switch/mount effect (mirror the existing font effect at `[activeTabId]`): also apply the saved theme to the newly active handle.
- Font: the drawer's `onFontSize` calls the existing `applyFont(px)` + `saveFontSize(px)`.
- `onToggleKey(id,on)`: update `enabledKeys` state + `saveKeys(next)`.
- `onToggleCursorBlink(v)`: `setCursorBlink(v)` + `saveCursorBlink(v)` (+ apply to handle if a cursorBlink setter is added; if not, it applies on next mount — acceptable, note it).

- [ ] **Step 3: Topbar per image 1**

Replace the current tabs button's bare dot+title with `<ConnectionPill state={connectionState} title={title} onForceReconnect={() => getActiveHandle()?.forceReconnect()} />` (keep the tabs dropdown trigger — e.g. the pill opens tabs, or add a small caret button; preserve tab switching). Add to `devdash-mts-actions`, in image-1 order: read-only **lock** button (Task 10-adjacent: shows when `readOnlyBanner`, calls `onRequestDrive`), **copy** button (Task 10), **fullscreen** button (`useFullscreen` — icon reflects `isFullscreen`; when `!supported`, tapping shows the add-to-home-screen hint once via `getFullscreenHintSeen`/`setFullscreenHintSeen`), **gear** button (`setDrawerOpen(true)`), **close** (existing). Keep wake + RAW/ABC (RAW/ABC can move into the drawer's Screen section OR stay — keep in topbar for now).

- [ ] **Step 4: Render the drawer + pass KeyChipBar the enabled set**

Render `<TerminalSettingsDrawer open={drawerOpen} ... />` at the end. Pass `enabledKeys` to `<KeyChipBar enabledKeys={enabledKeys} ... />`. Opening the drawer should blur the composer (dismiss keyboard) so the sheet sits above it.

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/components/MobileTerminalShell.tsx
git commit -m "feat(mobile-term): wire drawer, connection pill, fullscreen, theme/font persistence"
```

---

## Task 10: Read-only lock + copy/paste

**Files:**
- Modify: `src/components/Terminal.tsx` (copy helpers on handle), `src/components/MobileTerminalShell.tsx` (last-command tracking, topbar copy/lock, composer paste)

**Interfaces:**
- Produces on `TerminalHandle`: `copyText(text: string): void` (reuse the existing secure-context clipboard writer + guard), `getLastOutput(): string` (buffer text from the snapshot line to the end), `snapshotOutputStart(): void` (record current buffer length).

- [ ] **Step 1: Handle copy helpers in `Terminal.tsx`**

Reuse the existing `copyToClipboard`/secure-context guard already in the file. Add a ref `outputStartRef` (line index). Expose:
```ts
    copyText: (text: string) => copyToClipboard(text),
    snapshotOutputStart: () => { const b = termRef.current?.buffer?.active; outputStartRef.current = b ? b.baseY + b.cursorY : 0; },
    getLastOutput: () => {
      const term = termRef.current; const b = term?.buffer?.active; if (!b) return '';
      const end = b.baseY + b.length; let out = '';
      for (let i = outputStartRef.current; i < end; i++) {
        const line = b.getLine(i); if (line) out += line.translateToString(true) + '\n';
      }
      return out.trimEnd();
    },
```
Add these to `TerminalHandle`. (Match the actual xterm buffer API used elsewhere in the file; adjust `baseY`/`length` usage to what xterm exposes.)

- [ ] **Step 2: Shell last-command + copy actions**

In `MobileTerminalShell`, track `lastCommandRef`: in `sendLine(text)` set `lastCommandRef.current = text` and call `getActiveHandle()?.snapshotOutputStart()` (so "last output" starts after the command). Topbar **copy** button opens a tiny popover with: "Copy last output" → `copyText(getActiveHandle()?.getLastOutput() ?? '')`, "Copy last command" → `copyText(lastCommandRef.current)`, "Copy screen" → copy the visible viewport text (loop the rows in view). Use `devdash-mts-copymenu` classes.

- [ ] **Step 3: Read-only lock button**

In the topbar, when `readOnlyBanner`, render a lock icon button (`Lock` from lucide) with `onClick={onRequestDrive}` and `aria-label="Read-only — tap to take control"`. When not read-only, show an open lock (or omit). Keep the existing peek banner too.

- [ ] **Step 4: Composer paste**

A paste chip already exists in `KeyChipBar` (kind `'paste'`). Additionally add a small paste button to the composer row (or ensure the paste chip is enabled by default — it is). If adding a composer button: `navigator.clipboard.readText().then(t => t && onSendRaw(t))` guarded. (Minimal — the keychip already covers paste; only add the composer button if it reads cleaner.)

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/components/Terminal.tsx src/components/MobileTerminalShell.tsx
git commit -m "feat(mobile-term): read-only lock indicator + copy last output/command/screen"
```

---

## Task 11: CSS — drawer, pill, lock, orientation, safe-area, a11y

**Files:**
- Modify: `src/components/mobile-terminal.css`

- [ ] **Step 1: Add styles** (follow the existing `devdash-mts-*` conventions)

- `.devdash-tsd-root` (fixed inset, z above shell), `.devdash-tsd-backdrop` (dim), `.devdash-tsd-sheet` (bottom sheet: `position:absolute; left/right/bottom:0; max-height:85dvh; overflow-y:auto; border-radius 16px top; padding-bottom: env(safe-area-inset-bottom)`), `.devdash-tsd-handle` (drag grip), section headers, `.devdash-tsd-theme-grid` (2 cols), theme card + `.active` (accent border + check), swatch strip, toggle rows with ≥44px targets, range/stepper controls.
- `.devdash-connpill` + per-state (`.connecting`,`.connected`,`.reconnecting`,`.disconnected`,`.exited`) dot/label colors; amber pulse on connecting/reconnecting.
- Topbar lock/copy/gear/fullscreen icon buttons sized ≥44px hit area.
- **Sheet enter animation** (slide up) wrapped in `@media (prefers-reduced-motion: no-preference)`; no transform under reduced-motion.
- **Landscape** `@media (orientation: landscape)`: compact topbar height, keychip/composer height, maximize terminal area.
- `env(safe-area-inset-*)` padding on topbar (top), input row + drawer (bottom).
- `:focus-visible` outlines on all new interactive elements.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/mobile-terminal.css
git commit -m "style(mobile-term): drawer, pill, lock, orientation, safe-area, reduced-motion"
```

---

## Task 12: a11y pass + full verification + manual checklist

**Files:** none (verification)

- [ ] **Step 1: a11y audit** — run the `ui-craft:a11y-auditor` agent over `TerminalSettingsDrawer.tsx`, `ConnectionPill.tsx`, and the new `mobile-terminal.css`. Fix any Critical/Important findings (target size, focus-visible, contrast of theme labels on light themes, `role="switch"`/`aria-checked` on toggles, reduced-motion, dialog focus trap on the sheet).

- [ ] **Step 2: Full verification**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: prefs tests pass, tsc 0, build succeeds.

- [ ] **Step 3: Manual test checklist (hand to user — real device)**

1. Gear opens the drawer; font stepper/slider/reset change size live and persist across reload.
2. Theme grid: tapping a theme recolors the terminal instantly and persists; check on a light theme (GitHub Light) too.
3. Key toggles: turning Home/End/PgUp/PgDn on/off adds/removes chips; persists.
4. Screen: Fullscreen enters/exits on Android/iPad; on iPhone shows the "add to home screen" hint once. Keep-awake + cursor-blink toggles work.
5. Connection pill shows live/reconnecting/offline as you background/lock/switch network; tapping when offline forces a reconnect.
6. Read-only lock shows in Peek; tapping takes control (Drive).
7. Copy: "copy last command" and "copy last output" put the right text on the clipboard (over https/localhost); the http guard message appears otherwise.
8. Portrait + landscape both usable; nothing hidden behind the notch/home-indicator; input stays above the keyboard.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "test(mobile-term): a11y pass + verification"
```

---

## Self-Review Notes (author)

- **Spec coverage:** drawer/font/theme/keys/screen (Tasks 1,2,3,8,9,11), fullscreen+iPhone fallback (Tasks 6,9), runtime theme (Task 4), connection pill+states (Tasks 5,7,9), read-only lock (Task 10), copy/paste (Task 10), orientation/safe-area/a11y (Tasks 11,12). All Phase-1 spec items map to a task.
- **Already-exists reuse:** haptics (KeyChipBar) and paste chip are reused, not rebuilt; reconnect/backoff/PTY-reattach untouched (only surfaced via the pill).
- **Naming consistency:** `setTheme`/`forceReconnect`/`copyText`/`getLastOutput`/`snapshotOutputStart` on the handle; `enabledKeys` on KeyChipBar; `DEFAULT_ENABLED_KEYS`; the 5 localStorage keys — used identically across tasks.
- **Known unknowns to verify during impl:** the exact `TerminalTheme` field names + `id` field (Task 1/4/8 read `terminal-themes.ts`); the exact xterm buffer API for `getLastOutput` (Task 10); the reconnect-attempt-counter scope for `forceReconnect` reset (Task 5).
