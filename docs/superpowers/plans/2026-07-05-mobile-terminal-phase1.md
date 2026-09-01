# Mobile-First Terminal (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing PTY browser terminal a first-class phone experience — full-screen shell with a chat-style composer (OS dictation-ready), key-chip toolbar, keyboard avoidance, pinch font scaling, reconnect UX and PWA manifest — per spec §12 (docs/superpowers/specs/2026-06-29-shared-terminal-sessions-design.md), Phase 1 only (NO tmux).

**Architecture:** On viewports < 640 px, `TerminalPanel` swaps its desktop chrome for a new `MobileTerminalShell` that hosts the same `Terminal` (xterm.js) instances. `Terminal.tsx` gains an imperative handle (`sendInput`, `setFontSize`, …) so the composer and key chips write to the PTY through the existing `pty_data` WebSocket messages — **zero server/agent changes**. New components: `TerminalComposer` (real `<textarea>` → OS keyboard mic/dictation works), `KeyChipBar` (Esc/Tab/Ctrl/arrows/^C…), plus a PWA manifest and viewport metadata.

**Tech Stack:** Next.js 15 App Router, React 19, xterm 5 + @xterm/addon-fit, plain CSS files with existing `--var` design tokens (no Tailwind utilities in terminal CSS — the terminal styles live in dedicated CSS files, `terminal-panel.css` pattern).

## Global Constraints

- **Never remove or modify the root `.npmrc`** (maps `@indianic` scope to registry.npmjs.org — required by prod deploy).
- **No DB schema changes in this phase** (DB is shared local/prod; Phase 1 needs none — do not touch `src/lib/schema.ts`).
- **No changes to `src/ws-server/` or `packages/devdash-agent/`** — Phase 1 is frontend-only; input flows through the existing `pty_data` / `pty_resize` / `pty_open` messages.
- Commit directly to `main`, one commit per task, message style `feat(mobile-term): …` / `fix(...)` matching repo history.
- UI must use the existing CSS custom properties from `src/app/globals.css` (`--bg`, `--bg-sub`, `--b1`, `--txt`, `--muted`, `--accent`, `--accent-weak`, `--accent-ring`, `--glass`, `--glass-strong`, `--grad`, `--live`, `--offline`, `--r-sm`, `--r`, `--inp-bg`, `--inp-ph`) and class-prefix conventions (`devdash-…`).
- Terminal font family everywhere: `'JetBrains Mono', Menlo, Monaco, monospace`.
- **No frontend test framework exists in this repo** (only `packages/devdash-agent` has tests). Do NOT add one. Each task verifies with `npx tsc --noEmit` (must produce no NEW errors — run it once before your change to baseline) plus the stated manual checks; final acceptance is Chrome mobile-emulation (Task 7).
- Dev run: `npm run dev` (Next :50051 + ws-server :50052). ws-server is untouched, so no ws restart concerns.
- The mobile full-screen shell uses `z-index: 9999` (same as `.devdash-fullscreen-overlay` it replaces).
- Node is v22 (zlib.deflateSync available for the icon script).

## Spec deviations (documented, agreed)

- §12.1 "top bar auto-hides on scroll/idle" → Phase 1 keeps a slim, always-visible top bar (40 px). Auto-hide is Phase 4 polish; no acceptance criterion tests it.
- §12.4 mobile session list + pull-to-refresh → deferred to Phase 2 (needs the tmux `session_list` registry; no live-session registry exists for fresh-shell PTYs). Mobile entry point for Phase 1 is the existing dashboard project cards → terminal button.
- §12.6 "launch straight to /sessions" → manifest `start_url` is `/` (no /sessions list page exists yet).
- §12.7 criterion 9 (tmux two-client sharing, Peek/Drive) → Phase 2 by definition.

---

### Task 1: Terminal.tsx — imperative handle, connection-state callback, visibility reconnect, fontSize prop

**Files:**
- Modify: `src/components/Terminal.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 4–5):
  ```ts
  export type TermConnectionState = 'connected' | 'reconnecting' | 'exited';
  export interface TerminalHandle {
    sendInput: (data: string) => void;   // raw bytes → pty_data over the existing ws
    setFontSize: (px: number) => void;   // live-applies + refits
    getFontSize: () => number;
    fit: () => void;
    focusTerminal: () => void;
    scrollToBottom: () => void;
  }
  ```
  New optional props on `TerminalProps`: `fontSize?: number` (initial font size, default 13), `onConnectionChange?: (state: TermConnectionState) => void`.
  Component becomes `forwardRef<TerminalHandle, TerminalProps>`; default export unchanged (`export default Terminal`).

- [ ] **Step 1: Convert to forwardRef and add the new props/types**

In `src/components/Terminal.tsx`:

Replace the import line:
```tsx
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
```

Below the imports, add the exported types:
```tsx
export type TermConnectionState = 'connected' | 'reconnecting' | 'exited';

export interface TerminalHandle {
  sendInput: (data: string) => void;
  setFontSize: (px: number) => void;
  getFontSize: () => number;
  fit: () => void;
  focusTerminal: () => void;
  scrollToBottom: () => void;
}
```

Add to `TerminalProps`:
```tsx
  fontSize?: number;
  onConnectionChange?: (state: TermConnectionState) => void;
```

Change the component declaration from `export default function Terminal({ ... }: TerminalProps) {` to:
```tsx
const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal({
  sessionId,
  wsUrl,
  machineId,
  userId,
  command,
  cwd,
  visible = true,
  theme,
  fontSize,
  onExit,
  onConnectionChange,
}: TerminalProps, ref) {
```
and at the very end of the file, after the closing `}` of the function body, close the forwardRef and re-export:
```tsx
});

export default Terminal;
```

- [ ] **Step 2: Track the live WebSocket + latest callback in refs, wire connection events**

Right after the existing `const termRef = useRef<any>(null);` add:
```tsx
  const wsRef = useRef<WebSocket | null>(null);
  const connRef = useRef(onConnectionChange);
  useEffect(() => { connRef.current = onConnectionChange; });
```

Inside `connect()`, immediately after `ws = new WebSocket(url);` (inside the `try`) add:
```tsx
        wsRef.current = ws;
```

In `ws.onopen`, after `reconnectAttempts = 0;` add:
```tsx
        connRef.current?.('connected');
```

In `ws.onmessage`, in the `pty_exit` branch, after `onExit?.(msg.code);` add:
```tsx
            connRef.current?.('exited');
```

In `ws.onclose`, after `ws = null;` add `wsRef.current = null;`, and after the `if (destroyed || exited) return;` line add:
```tsx
        connRef.current?.('reconnecting');
```

In the effect cleanup (the `return () => { ... }` block), after `if (term) { try { term.dispose(); } catch {} }` add:
```tsx
      wsRef.current = null;
```

- [ ] **Step 3: Apply the fontSize prop and add visibility-driven instant reconnect**

In the `new xterm.Terminal({ ... })` options, change `fontSize: 13,` to:
```tsx
        fontSize: fontSize ?? 13,
```

Inside the main `useEffect`, after the `init();` call and before the cleanup `return`, add:
```tsx
    // Mobile browsers kill background sockets; reconnect the moment the tab
    // is visible again instead of waiting out the backoff timer.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || destroyed || exited) return;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        reconnectAttempts = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
```
and in the cleanup block add:
```tsx
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
```

- [ ] **Step 4: Expose the imperative handle**

After the main `useEffect` (before the theme-change effect), add:
```tsx
  useImperativeHandle(ref, () => ({
    sendInput: (data: string) => {
      const w = wsRef.current;
      if (w?.readyState === WebSocket.OPEN) {
        w.send(JSON.stringify({ type: 'pty_data', id: sessionId, data }));
      }
    },
    setFontSize: (px: number) => {
      const t = termRef.current;
      if (!t) return;
      t.options.fontSize = px;
      try { fitRef.current?.fit(); } catch {}
    },
    getFontSize: () => termRef.current?.options?.fontSize ?? fontSize ?? 13,
    fit: () => { try { fitRef.current?.fit(); } catch {} },
    focusTerminal: () => { try { termRef.current?.focus(); } catch {} },
    scrollToBottom: () => { try { termRef.current?.scrollToBottom(); } catch {} },
  }), [sessionId, fontSize]);
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors referencing `src/components/Terminal.tsx` (baseline any pre-existing unrelated errors first).

- [ ] **Step 6: Commit**

```bash
git add src/components/Terminal.tsx
git commit -m "feat(mobile-term): expose imperative TerminalHandle, connection-state callback, visibility reconnect"
```

---

### Task 2: Key sequences module + KeyChipBar component + base mobile CSS

**Files:**
- Create: `src/components/terminal-keys.ts`
- Create: `src/components/KeyChipBar.tsx`
- Create: `src/components/mobile-terminal.css`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (used by Tasks 3–4):
  ```ts
  // terminal-keys.ts
  export interface KeyChip { id: string; label: string; seq?: string; kind?: 'modifier-ctrl' | 'paste'; }
  export const KEY_CHIPS: KeyChip[];
  export function ctrlByte(ch: string): string | null;   // 'c' → '\x03', null for non a-z

  // KeyChipBar.tsx
  export type CtrlState = 'off' | 'armed' | 'locked';
  interface KeyChipBarProps {
    onSend: (data: string) => void;
    ctrlState: CtrlState;
    onCtrlStateChange: (s: CtrlState) => void;
  }
  export default function KeyChipBar(props: KeyChipBarProps): JSX.Element;
  ```

- [ ] **Step 1: Create `src/components/terminal-keys.ts`**

```ts
// Raw byte sequences for the mobile KeyChipBar (spec §12.2).
// Chips send these verbatim to the PTY via TerminalHandle.sendInput.

export interface KeyChip {
  id: string;
  label: string;
  /** Bytes sent when tapped. Absent for modifier/paste chips. */
  seq?: string;
  kind?: 'modifier-ctrl' | 'paste';
}

export const KEY_CHIPS: KeyChip[] = [
  { id: 'esc', label: 'Esc', seq: '\x1b' },
  { id: 'tab', label: 'Tab', seq: '\t' },
  { id: 'ctrl', label: 'Ctrl', kind: 'modifier-ctrl' },
  { id: 'up', label: '↑', seq: '\x1b[A' },
  { id: 'down', label: '↓', seq: '\x1b[B' },
  { id: 'left', label: '←', seq: '\x1b[D' },
  { id: 'right', label: '→', seq: '\x1b[C' },
  { id: 'pipe', label: '|', seq: '|' },
  { id: 'tilde', label: '~', seq: '~' },
  { id: 'slash', label: '/', seq: '/' },
  { id: 'dash', label: '-', seq: '-' },
  { id: 'ctrl-c', label: '^C', seq: '\x03' },
  { id: 'ctrl-d', label: '^D', seq: '\x04' },
  { id: 'ctrl-z', label: '^Z', seq: '\x1a' },
  { id: 'ctrl-r', label: '^R', seq: '\x12' },
  { id: 'ctrl-l', label: '^L', seq: '\x0c' },
  { id: 'paste', label: 'Paste', kind: 'paste' },
];

/** Ctrl+<letter> control byte, e.g. 'c' → 0x03. Returns null for non-letters. */
export function ctrlByte(ch: string): string | null {
  if (!ch) return null;
  const c = ch.toLowerCase().charCodeAt(0);
  if (c < 97 || c > 122) return null;
  return String.fromCharCode(c - 96);
}
```

- [ ] **Step 2: Create `src/components/KeyChipBar.tsx`**

```tsx
'use client';

import { useRef } from 'react';
import { KEY_CHIPS, ctrlByte } from './terminal-keys';
import type { KeyChip } from './terminal-keys';

export type CtrlState = 'off' | 'armed' | 'locked';

interface KeyChipBarProps {
  onSend: (data: string) => void;
  ctrlState: CtrlState;
  onCtrlStateChange: (s: CtrlState) => void;
}

const LONG_PRESS_MS = 450;

export default function KeyChipBar({ onSend, ctrlState, onCtrlStateChange }: KeyChipBarProps) {
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({
    timer: null,
    fired: false,
  });

  const haptic = () => { try { navigator.vibrate?.(10); } catch {} };

  const tapChip = (chip: KeyChip) => {
    haptic();
    if (chip.kind === 'modifier-ctrl') {
      // Tap cycles off → armed → off; long-press (below) locks.
      onCtrlStateChange(ctrlState === 'off' ? 'armed' : 'off');
      return;
    }
    if (chip.kind === 'paste') {
      navigator.clipboard?.readText?.()
        .then((t) => { if (t) onSend(t); })
        .catch(() => {});
      return;
    }
    if (!chip.seq) return;
    if (ctrlState !== 'off' && chip.seq.length === 1) {
      const b = ctrlByte(chip.seq);
      if (b) {
        onSend(b);
        if (ctrlState === 'armed') onCtrlStateChange('off');
        return;
      }
    }
    onSend(chip.seq);
    if (ctrlState === 'armed') onCtrlStateChange('off');
  };

  const ctrlPointerDown = () => {
    longPress.current.fired = false;
    longPress.current.timer = setTimeout(() => {
      longPress.current.fired = true;
      haptic();
      onCtrlStateChange('locked');
    }, LONG_PRESS_MS);
  };
  const ctrlPointerUp = () => {
    if (longPress.current.timer) {
      clearTimeout(longPress.current.timer);
      longPress.current.timer = null;
    }
  };

  return (
    <div className="devdash-kcb">
      {KEY_CHIPS.map((chip) => {
        const isCtrl = chip.kind === 'modifier-ctrl';
        return (
          <button
            key={chip.id}
            type="button"
            className={`devdash-kcb-chip${isCtrl && ctrlState !== 'off' ? ` ${ctrlState}` : ''}`}
            // preventDefault keeps focus in the composer textarea so the
            // mobile keyboard does not close when a chip is tapped.
            onPointerDown={(e) => {
              e.preventDefault();
              if (isCtrl) ctrlPointerDown();
            }}
            onPointerUp={() => { if (isCtrl) ctrlPointerUp(); }}
            onPointerLeave={() => { if (isCtrl) ctrlPointerUp(); }}
            onClick={() => {
              if (isCtrl && longPress.current.fired) { longPress.current.fired = false; return; }
              tapChip(chip);
            }}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/mobile-terminal.css`** (chip styles now; Tasks 3–4 append to this file)

```css
/* Mobile terminal UI (spec §12) — shell, composer, key chips.
   Uses the design tokens from globals.css. */

/* --- KeyChipBar --- */
.devdash-kcb {
  flex: none;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 6px 10px;
  background: var(--bg-sub);
  border-top: 1px solid var(--b1);
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.devdash-kcb::-webkit-scrollbar { display: none; }

.devdash-kcb-chip {
  flex: none;
  min-width: 40px;
  height: 34px;
  padding: 0 12px;
  border-radius: var(--r-sm);
  background: var(--glass);
  border: 1px solid var(--b1);
  color: var(--txt);
  font-family: 'JetBrains Mono', Menlo, Monaco, monospace;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}
.devdash-kcb-chip:active { background: var(--glass-strong); }
.devdash-kcb-chip.armed {
  background: var(--accent-weak);
  border-color: var(--accent-ring);
  color: var(--accent);
}
.devdash-kcb-chip.locked {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--white);
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors in the new files.

- [ ] **Step 5: Commit**

```bash
git add src/components/terminal-keys.ts src/components/KeyChipBar.tsx src/components/mobile-terminal.css
git commit -m "feat(mobile-term): KeyChipBar with sticky/lockable Ctrl and raw byte sequences"
```

---

### Task 3: TerminalComposer component

**Files:**
- Create: `src/components/TerminalComposer.tsx`
- Modify: `src/components/mobile-terminal.css` (append composer styles)

**Interfaces:**
- Consumes: `ctrlByte` from `./terminal-keys` (Task 2), `CtrlState` type from `./KeyChipBar` (Task 2).
- Produces (used by Task 4):
  ```ts
  interface TerminalComposerProps {
    onSendLine: (text: string) => void;  // full command WITHOUT trailing newline; parent appends '\r'
    onSendRaw: (data: string) => void;   // ctrl-modified single bytes
    ctrlState: CtrlState;
    onCtrlStateChange: (s: CtrlState) => void;
  }
  export default function TerminalComposer(props: TerminalComposerProps): JSX.Element;
  ```

- [ ] **Step 1: Create `src/components/TerminalComposer.tsx`**

```tsx
'use client';

import { useRef, useState } from 'react';
import { ctrlByte } from './terminal-keys';
import type { CtrlState } from './KeyChipBar';

interface TerminalComposerProps {
  onSendLine: (text: string) => void;
  onSendRaw: (data: string) => void;
  ctrlState: CtrlState;
  onCtrlStateChange: (s: CtrlState) => void;
}

// Chat-style input bar (spec §12.2). A REAL textarea so the OS keyboard
// provides swipe-typing and the mic/dictation button — this is the whole
// point: xterm's hidden textarea fights mobile IMEs and dictation.
export default function TerminalComposer({
  onSendLine,
  onSendRaw,
  ctrlState,
  onCtrlStateChange,
}: TerminalComposerProps) {
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  const send = () => {
    onSendLine(value);
    setValue('');
    // Keep the keyboard up, WhatsApp-style: focus never leaves the textarea.
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) { ta.style.height = 'auto'; ta.focus(); }
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    // Armed/locked Ctrl: the next typed letter becomes a control byte
    // instead of entering the composer.
    if (ctrlState !== 'off' && next.length === value.length + 1 && next.startsWith(value)) {
      const b = ctrlByte(next.slice(-1));
      if (b) {
        onSendRaw(b);
        if (ctrlState === 'armed') onCtrlStateChange('off');
        return;
      }
    }
    setValue(next);
    autoGrow();
  };

  return (
    <div className="devdash-composer">
      <button
        type="button"
        className="devdash-composer-hide"
        aria-label="Hide keyboard"
        onClick={() => taRef.current?.blur()}
      >
        &#8964;
      </button>
      <textarea
        ref={taRef}
        rows={1}
        value={value}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        className="devdash-composer-input"
        placeholder="Type a command&hellip;"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
      />
      <button
        type="button"
        className="devdash-composer-send"
        aria-label="Send"
        // preventDefault so tapping Send doesn't blur the textarea (keyboard stays up)
        onPointerDown={(e) => e.preventDefault()}
        onClick={send}
      >
        &#10148;
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Append composer styles to `src/components/mobile-terminal.css`**

```css
/* --- TerminalComposer --- */
.devdash-composer {
  flex: none;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
  background: var(--bg-sub);
  border-top: 1px solid var(--b1);
}
.devdash-composer-input {
  flex: 1;
  min-width: 0;
  resize: none;
  background: var(--inp-bg);
  border: 1px solid var(--b2);
  border-radius: var(--r);
  color: var(--txt);
  font-family: 'JetBrains Mono', Menlo, Monaco, monospace;
  /* 16px minimum: below that iOS Safari auto-zooms the page on focus */
  font-size: 16px;
  line-height: 1.4;
  padding: 8px 12px;
  max-height: 120px;
  outline: none;
}
.devdash-composer-input::placeholder { color: var(--inp-ph); }
.devdash-composer-input:focus { border-color: var(--accent-ring); }
.devdash-composer-send {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--grad);
  color: #fff;
  border: none;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.devdash-composer-send:active { opacity: 0.85; }
.devdash-composer-hide {
  flex: none;
  width: 32px;
  height: 40px;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 18px;
  cursor: pointer;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors in `TerminalComposer.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/TerminalComposer.tsx src/components/mobile-terminal.css
git commit -m "feat(mobile-term): chat-style TerminalComposer (real textarea = OS dictation works)"
```

---

### Task 4: Font-size prefs module + MobileTerminalShell

**Files:**
- Create: `src/components/mobile-term-prefs.ts`
- Create: `src/components/MobileTerminalShell.tsx`
- Modify: `src/components/mobile-terminal.css` (append shell styles)

**Interfaces:**
- Consumes: `TerminalHandle` from `./Terminal` (Task 1), `KeyChipBar` + `CtrlState` (Task 2), `TerminalComposer` (Task 3).
- Produces (used by Task 5):
  ```ts
  // mobile-term-prefs.ts
  export const MIN_FONT = 10; export const MAX_FONT = 22; export const DEFAULT_FONT = 13;
  export function clampFont(px: number): number;
  export function getSavedFontSize(): number;   // SSR-safe, default 13
  export function saveFontSize(px: number): void;

  // MobileTerminalShell.tsx
  export interface MobileTab { id: string; label: string; exited: boolean; }
  interface MobileTerminalShellProps {
    title: string;
    tabs: MobileTab[];
    activeTabId: string | null;
    connectionState: 'connected' | 'reconnecting' | 'exited';
    getActiveHandle: () => TerminalHandle | null;
    onSelectTab: (id: string) => void;
    onNewTab: () => void;
    onCloseTab: (id: string) => void;
    onClose: () => void;
    commands: { id: number; label: string; command: string; icon: string }[];
    onOpenCommand: (command: string, label: string) => void;
    children: React.ReactNode;   // absolutely-positioned .devdash-mts-pane divs
  }
  export default function MobileTerminalShell(props: MobileTerminalShellProps): JSX.Element;
  ```

- [ ] **Step 1: Create `src/components/mobile-term-prefs.ts`**

```ts
// Per-device mobile terminal preferences (spec §12.1: font size 10–22px,
// persisted in localStorage, double-tap resets).

const FONT_KEY = 'devdash-mobile-fontsize';

export const MIN_FONT = 10;
export const MAX_FONT = 22;
export const DEFAULT_FONT = 13;

export function clampFont(px: number): number {
  return Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(px)));
}

export function getSavedFontSize(): number {
  if (typeof window === 'undefined') return DEFAULT_FONT;
  try {
    const v = Number(window.localStorage.getItem(FONT_KEY));
    if (Number.isFinite(v) && v >= MIN_FONT && v <= MAX_FONT) return v;
  } catch {}
  return DEFAULT_FONT;
}

export function saveFontSize(px: number): void {
  try { window.localStorage.setItem(FONT_KEY, String(clampFont(px))); } catch {}
}
```

- [ ] **Step 2: Create `src/components/MobileTerminalShell.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { TerminalHandle } from './Terminal';
import KeyChipBar from './KeyChipBar';
import type { CtrlState } from './KeyChipBar';
import TerminalComposer from './TerminalComposer';
import { clampFont, getSavedFontSize, saveFontSize, DEFAULT_FONT } from './mobile-term-prefs';
import './mobile-terminal.css';

export interface MobileTab {
  id: string;
  label: string;
  exited: boolean;
}

type InputMode = 'composer' | 'raw';

interface MobileTerminalShellProps {
  title: string;
  tabs: MobileTab[];
  activeTabId: string | null;
  connectionState: 'connected' | 'reconnecting' | 'exited';
  getActiveHandle: () => TerminalHandle | null;
  onSelectTab: (id: string) => void;
  onNewTab: () => void;
  onCloseTab: (id: string) => void;
  onClose: () => void;
  commands: { id: number; label: string; command: string; icon: string }[];
  onOpenCommand: (command: string, label: string) => void;
  children: React.ReactNode;
}

// Full-screen mobile terminal (spec §12): the terminal is the screen,
// input is a composer, keys are chips.
export default function MobileTerminalShell({
  title,
  tabs,
  activeTabId,
  connectionState,
  getActiveHandle,
  onSelectTab,
  onNewTab,
  onCloseTab,
  onClose,
  commands,
  onOpenCommand,
  children,
}: MobileTerminalShellProps) {
  const [inputMode, setInputMode] = useState<InputMode>('composer');
  const [ctrlState, setCtrlState] = useState<CtrlState>('off');
  const [tabsMenuOpen, setTabsMenuOpen] = useState(false);
  const [wakeOn, setWakeOn] = useState(false);
  const [vvHeight, setVvHeight] = useState<number | null>(null);

  const termAreaRef = useRef<HTMLDivElement>(null);
  const fontSizeRef = useRef(getSavedFontSize());
  const pinchRef = useRef<{ startDist: number; startSize: number } | null>(null);
  const lastTapRef = useRef(0);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const handleRef = useRef(getActiveHandle);
  useEffect(() => { handleRef.current = getActiveHandle; });

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const live = !!activeTab && !activeTab.exited && connectionState !== 'exited';

  const sendRaw = (data: string) => {
    getActiveHandle()?.sendInput(data);
    getActiveHandle()?.scrollToBottom();
  };
  const sendLine = (text: string) => {
    // '\r' is what a real terminal Enter sends
    sendRaw(text + '\r');
  };

  const applyFont = (px: number) => {
    const size = clampFont(px);
    fontSizeRef.current = size;
    getActiveHandle()?.setFontSize(size);
  };

  // --- visualViewport keyboard avoidance (spec §12.3) ---
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setVvHeight(vv.height);
      requestAnimationFrame(() => {
        handleRef.current()?.fit();
        handleRef.current()?.scrollToBottom();
      });
    };
    vv.addEventListener('resize', update);
    update();
    return () => vv.removeEventListener('resize', update);
  }, []);

  // --- pinch-to-zoom font scaling (native listeners: React touch events
  // are passive at the root since React 17, so preventDefault needs these) ---
  useEffect(() => {
    const el = termAreaRef.current;
    if (!el) return;
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = { startDist: dist(e.touches), startSize: fontSizeRef.current };
        e.preventDefault();
      }
    };
    const onMove = (e: TouchEvent) => {
      if (pinchRef.current && e.touches.length === 2) {
        e.preventDefault();
        const next = clampFont(
          pinchRef.current.startSize * (dist(e.touches) / pinchRef.current.startDist)
        );
        if (next !== fontSizeRef.current) {
          fontSizeRef.current = next;
          handleRef.current()?.setFontSize(next);
        }
      }
    };
    const onEnd = () => {
      if (pinchRef.current) {
        pinchRef.current = null;
        saveFontSize(fontSizeRef.current);
      }
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // Apply persisted font size to the active terminal on mount/tab switch
  // (xterm inits async, hence the small delay; the Terminal also receives
  // the same size as its initial fontSize prop).
  useEffect(() => {
    const t = setTimeout(() => {
      handleRef.current()?.setFontSize(fontSizeRef.current);
    }, 150);
    return () => clearTimeout(t);
  }, [activeTabId]);

  // --- wake lock (spec §12.5) ---
  const toggleWake = async () => {
    if (wakeOn) {
      try { await wakeRef.current?.release(); } catch {}
      wakeRef.current = null;
      setWakeOn(false);
      return;
    }
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<any> } };
      const sentinel = await nav.wakeLock?.request('screen');
      if (sentinel) {
        wakeRef.current = sentinel;
        setWakeOn(true);
        sentinel.addEventListener?.('release', () => { wakeRef.current = null; });
      }
    } catch {}
  };
  useEffect(() => {
    if (!wakeOn) return;
    const onVis = async () => {
      if (document.visibilityState !== 'visible' || wakeRef.current) return;
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<any> } };
        const sentinel = await nav.wakeLock?.request('screen');
        if (sentinel) {
          wakeRef.current = sentinel;
          sentinel.addEventListener?.('release', () => { wakeRef.current = null; });
        }
      } catch {}
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [wakeOn]);
  useEffect(() => () => { try { wakeRef.current?.release(); } catch {} }, []);

  // Tap terminal: double-tap resets font; single tap switches to raw mode
  // and focuses xterm's own input (spec §12.2 raw mode for TUIs).
  const onTermTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      applyFont(DEFAULT_FONT);
      saveFontSize(DEFAULT_FONT);
    } else if (tabs.length > 0) {
      setInputMode('raw');
      getActiveHandle()?.focusTerminal();
    }
    lastTapRef.current = now;
  };

  const switchMode = () => {
    const next: InputMode = inputMode === 'raw' ? 'composer' : 'raw';
    setInputMode(next);
    if (next === 'raw') getActiveHandle()?.focusTerminal();
  };

  return (
    <div className="devdash-mts" style={vvHeight ? { height: `${vvHeight}px` } : undefined}>
      {/* slim top bar */}
      <div className="devdash-mts-topbar">
        <button
          type="button"
          className="devdash-mts-tabsbtn"
          onClick={() => setTabsMenuOpen((o) => !o)}
        >
          <span className={`devdash-mts-dot ${live ? 'live' : 'dead'}`} />
          <span className="devdash-mts-title">{title}</span>
          {tabs.length > 1 && <span className="devdash-mts-count">{tabs.length}</span>}
          <span className="devdash-mts-caret">&#9662;</span>
        </button>
        <div className="devdash-mts-actions">
          <button
            type="button"
            className={`devdash-mts-iconbtn ${wakeOn ? 'on' : ''}`}
            onClick={toggleWake}
            title="Keep screen awake"
            aria-label="Keep screen awake"
          >
            &#9728;
          </button>
          <button
            type="button"
            className={`devdash-mts-iconbtn ${inputMode === 'raw' ? 'on' : ''}`}
            onClick={switchMode}
            title={inputMode === 'raw' ? 'Switch to composer input' : 'Switch to raw terminal input'}
            aria-label="Toggle input mode"
          >
            {inputMode === 'raw' ? 'RAW' : 'ABC'}
          </button>
          <button
            type="button"
            className="devdash-mts-iconbtn"
            onClick={onClose}
            title="Close terminal"
            aria-label="Close terminal"
          >
            &#10005;
          </button>
        </div>
      </div>

      {/* tabs dropdown */}
      {tabsMenuOpen && (
        <>
          <div className="devdash-mts-menu-backdrop" onClick={() => setTabsMenuOpen(false)} />
          <div className="devdash-mts-menu">
            {tabs.map((t) => (
              <div
                key={t.id}
                className={`devdash-mts-menu-item ${t.id === activeTabId ? 'active' : ''}`}
                onClick={() => { onSelectTab(t.id); setTabsMenuOpen(false); }}
              >
                <span className={`devdash-mts-dot ${t.exited ? 'dead' : 'live'}`} />
                <span className="devdash-mts-menu-label">{t.label}</span>
                <button
                  type="button"
                  className="devdash-mts-menu-close"
                  aria-label={`Close ${t.label}`}
                  onClick={(e) => { e.stopPropagation(); onCloseTab(t.id); }}
                >
                  &times;
                </button>
              </div>
            ))}
            <div
              className="devdash-mts-menu-item new"
              onClick={() => { onNewTab(); setTabsMenuOpen(false); }}
            >
              + New shell
            </div>
          </div>
        </>
      )}

      {/* terminal area */}
      <div className="devdash-mts-term" ref={termAreaRef} onClick={onTermTap}>
        {tabs.length === 0 ? (
          <div className="devdash-mts-launcher" onClick={(e) => e.stopPropagation()}>
            <div className="devdash-mts-launcher-title">Start a session</div>
            {commands.map((c) => (
              <button
                key={c.id}
                type="button"
                className="devdash-mts-launchbtn"
                onClick={() => onOpenCommand(c.command, c.label)}
              >
                <span className="devdash-mts-launchicon">{c.icon}</span>
                <span>{c.label}</span>
                <span className="devdash-mts-launchcmd">{c.command || '/bin/zsh'}</span>
              </button>
            ))}
          </div>
        ) : (
          children
        )}
        {connectionState === 'reconnecting' && (
          <div className="devdash-mts-reconnect">reconnecting&hellip;</div>
        )}
      </div>

      {/* input area */}
      <KeyChipBar onSend={sendRaw} ctrlState={ctrlState} onCtrlStateChange={setCtrlState} />
      {inputMode === 'composer' && (
        <TerminalComposer
          onSendLine={sendLine}
          onSendRaw={sendRaw}
          ctrlState={ctrlState}
          onCtrlStateChange={setCtrlState}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Append shell styles to `src/components/mobile-terminal.css`**

```css
/* --- MobileTerminalShell --- */
.devdash-mts {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999; /* same layer as .devdash-fullscreen-overlay it replaces */
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  overscroll-behavior: none;
}

.devdash-mts-topbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: env(safe-area-inset-top) 6px 0 calc(6px + env(safe-area-inset-left));
  height: calc(40px + env(safe-area-inset-top));
  background: var(--bg-sub);
  border-bottom: 1px solid var(--b1);
}

.devdash-mts-tabsbtn {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  background: none;
  border: none;
  color: var(--txt);
  padding: 6px 8px;
  cursor: pointer;
}
.devdash-mts-title {
  font-family: 'JetBrains Mono', Menlo, Monaco, monospace;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 45vw;
}
.devdash-mts-count {
  font-size: 10px;
  color: var(--accent);
  background: var(--accent-weak);
  border-radius: 8px;
  padding: 1px 6px;
}
.devdash-mts-caret { color: var(--dim); font-size: 10px; }

.devdash-mts-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.devdash-mts-dot.live { background: var(--live); box-shadow: 0 0 6px var(--live); }
.devdash-mts-dot.dead { background: var(--offline); }

.devdash-mts-actions { display: flex; align-items: center; gap: 2px; }
.devdash-mts-iconbtn {
  min-width: 38px;
  height: 34px;
  background: none;
  border: none;
  border-radius: var(--r-sm);
  color: var(--muted);
  font-size: 13px;
  font-family: 'JetBrains Mono', Menlo, Monaco, monospace;
  cursor: pointer;
  padding: 0 8px;
}
.devdash-mts-iconbtn.on { color: var(--accent); background: var(--accent-weak); }

.devdash-mts-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: var(--overlay);
}
.devdash-mts-menu {
  position: absolute;
  top: calc(42px + env(safe-area-inset-top));
  left: 8px;
  right: 8px;
  z-index: 10001;
  background: var(--modal-bg);
  border: 1px solid var(--b2);
  border-radius: var(--r);
  overflow: hidden;
  box-shadow: 0 12px 40px var(--shadow);
}
.devdash-mts-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--b1);
  color: var(--txt);
  cursor: pointer;
}
.devdash-mts-menu-item:last-child { border-bottom: none; }
.devdash-mts-menu-item.active { background: var(--accent-weak); }
.devdash-mts-menu-item.new { color: var(--accent); justify-content: center; font-size: 13px; }
.devdash-mts-menu-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'JetBrains Mono', Menlo, Monaco, monospace;
  font-size: 13px;
}
.devdash-mts-menu-close {
  background: none;
  border: none;
  color: var(--dim);
  font-size: 18px;
  padding: 0 6px;
  cursor: pointer;
}

.devdash-mts-term {
  flex: 1;
  position: relative;
  min-height: 0;
  overflow: hidden;
  touch-action: pan-y; /* our JS handles pinch; browser keeps vertical scroll */
}
.devdash-mts-pane {
  position: absolute;
  inset: 0;
  padding: 2px 4px 0 calc(4px + env(safe-area-inset-left));
}

.devdash-mts-reconnect {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--toast-bg);
  color: var(--toast-fg);
  border: 1px solid var(--b2);
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 11px;
  font-family: 'JetBrains Mono', Menlo, Monaco, monospace;
  z-index: 5;
  pointer-events: none;
}

.devdash-mts-launcher {
  height: 100%;
  overflow-y: auto;
  padding: 24px 16px calc(24px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.devdash-mts-launcher-title {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.devdash-mts-launchbtn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: var(--card);
  border: 1px solid var(--b1);
  border-radius: var(--r);
  color: var(--txt);
  font-size: 14px;
  cursor: pointer;
  text-align: left;
}
.devdash-mts-launchbtn:active { background: var(--card-h); }
.devdash-mts-launchicon {
  width: 30px;
  height: 30px;
  border-radius: var(--r-sm);
  background: var(--accent-weak);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', Menlo, Monaco, monospace;
  flex: none;
}
.devdash-mts-launchcmd {
  margin-left: auto;
  color: var(--dim);
  font-size: 11px;
  font-family: 'JetBrains Mono', Menlo, Monaco, monospace;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors in the new files.

- [ ] **Step 5: Commit**

```bash
git add src/components/mobile-term-prefs.ts src/components/MobileTerminalShell.tsx src/components/mobile-terminal.css
git commit -m "feat(mobile-term): full-screen MobileTerminalShell — keyboard avoidance, pinch font scaling, wake lock, reconnect toast"
```

---

### Task 5: TerminalPanel mobile integration

**Files:**
- Modify: `src/components/TerminalPanel.tsx`

**Interfaces:**
- Consumes: `TerminalHandle`, `TermConnectionState` from `./Terminal` (Task 1); `MobileTerminalShell`, `MobileTab` from `./MobileTerminalShell` (Task 4); `getSavedFontSize` from `./mobile-term-prefs` (Task 4).
- Produces: no new exports; behavior change — on viewports < 640 px with `viewMode !== 'card'`, the panel renders `MobileTerminalShell` instead of the desktop chrome. `card` mode (hidden keep-alive render) is unchanged on all viewports.

- [ ] **Step 1: Add imports and per-tab handle/connection tracking**

In `src/components/TerminalPanel.tsx`, extend the imports:
```tsx
import Terminal from './Terminal';
import type { TerminalHandle, TermConnectionState } from './Terminal';
import MobileTerminalShell from './MobileTerminalShell';
import { getSavedFontSize } from './mobile-term-prefs';
```

Inside the component, after the `const [showThemePicker, ...]` line, add:
```tsx
  // Mobile shell: imperative handles + per-tab connection state
  const termHandles = useRef<Map<string, TerminalHandle | null>>(new Map());
  const [connStates, setConnStates] = useState<Map<string, TermConnectionState>>(new Map());
  const setTabConnState = useCallback((tabId: string, s: TermConnectionState) => {
    setConnStates((prev) => {
      if (prev.get(tabId) === s) return prev;
      const next = new Map(prev);
      next.set(tabId, s);
      return next;
    });
  }, []);
```

- [ ] **Step 2: Add the mobile render path**

Immediately AFTER the existing `if (viewMode === 'card') { ... }` block (so card mode keeps its hidden keep-alive render on mobile too) and BEFORE the final desktop `return`, add:

```tsx
  // --- Mobile: full-screen shell with composer + key chips (spec §12) ---
  if (isMobile) {
    const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[tabs.length - 1];
    return (
      <MobileTerminalShell
        title={activeTab?.label || projectName || 'Terminal'}
        tabs={tabs.map((t) => ({ id: t.id, label: t.label, exited: t.exited }))}
        activeTabId={activeTab?.id ?? null}
        connectionState={activeTab ? connStates.get(activeTab.id) ?? 'connected' : 'connected'}
        getActiveHandle={() =>
          activeTab ? termHandles.current.get(activeTab.id) ?? null : null
        }
        onSelectTab={setActiveTabId}
        onNewTab={() => openTab('', 'zsh')}
        onCloseTab={closeTab}
        onClose={() => {
          try { sessionStorage.removeItem(storageKey); } catch {}
          onClose?.();
        }}
        commands={allCommands}
        onOpenCommand={(cmd, label) => openTab(cmd, label)}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="devdash-mts-pane"
            style={{
              visibility: activeTab?.id === tab.id ? 'visible' : 'hidden',
              zIndex: activeTab?.id === tab.id ? 1 : 0,
            }}
          >
            <Terminal
              ref={(h) => {
                if (h) termHandles.current.set(tab.id, h);
                else termHandles.current.delete(tab.id);
              }}
              sessionId={tab.id}
              wsUrl={wsUrl}
              machineId={machineId}
              userId={userId}
              command={tab.command}
              cwd={tab.cwd}
              visible={activeTab?.id === tab.id}
              theme={getThemeById(tab.themeId)}
              fontSize={getSavedFontSize()}
              onExit={(code) => handleExit(tab.id, code)}
              onConnectionChange={(s) => setTabConnState(tab.id, s)}
            />
          </div>
        ))}
      </MobileTerminalShell>
    );
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: no errors in `TerminalPanel.tsx`. (The `ref` callback returning a value would error — note the callback body uses braces, returning void.)

- [ ] **Step 4: Desktop smoke check**

Run: `npm run build 2>&1 | tail -15`
Expected: build succeeds (`✓ Compiled successfully` / route table printed).

- [ ] **Step 5: Commit**

```bash
git add src/components/TerminalPanel.tsx
git commit -m "feat(mobile-term): TerminalPanel renders MobileTerminalShell on phones"
```

---

### Task 6: Viewport metadata, PWA manifest, icons

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `public/manifest.webmanifest`
- Create: `scripts/generate-pwa-icons.js`
- Create (generated): `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: PWA install surface (spec §12.6) + `viewport-fit=cover` / `interactive-widget=resizes-content` meta (spec §12.3) that MobileTerminalShell's safe-area CSS relies on.

- [ ] **Step 1: Replace `src/app/layout.tsx` contents**

```tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DevDash — Local Project HQ',
  description: 'Manage, monitor and share your development projects from one command center.',
  applicationName: 'DevDash',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DevDash',
  },
  openGraph: {
    title: 'DevDash — Local Project HQ',
    description: 'Manage, monitor and share your development projects from one command center.',
    type: 'website',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Create `public/manifest.webmanifest`**

```json
{
  "name": "DevDash",
  "short_name": "DevDash",
  "description": "Manage, monitor and share your development projects from one command center.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#08080d",
  "theme_color": "#0a0a0f",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 3: Create `scripts/generate-pwa-icons.js`** (dependency-free PNG writer; Node ≥ 18)

```js
#!/usr/bin/env node
// Generates public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png.
// Dependency-free: hand-rolled PNG encoder (zlib deflate + crc32 table).
// Mark: dark tile, violet '>' chevron, green cursor block — terminal prompt.
const { deflateSync } = require('node:zlib');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, 0x12, 0x12, 0x1c);
  const u = size / 16;
  const th = Math.max(1, Math.round(u * 0.7));
  const line = (x0, y0, x1, y1, r, g, b) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let s = 0; s <= steps; s++) {
      const cx = Math.round(x0 + ((x1 - x0) * s) / steps);
      const cy = Math.round(y0 + ((y1 - y0) * s) / steps);
      for (let dy = -th; dy <= th; dy++) {
        for (let dx = -th; dx <= th; dx++) {
          if (dx * dx + dy * dy <= th * th) set(cx + dx, cy + dy, r, g, b);
        }
      }
    }
  };
  // violet '>' chevron (accent #8b5cf6)
  line(4.4 * u, 4.6 * u, 7.6 * u, 8 * u, 0x8b, 0x5c, 0xf6);
  line(7.6 * u, 8 * u, 4.4 * u, 11.4 * u, 0x8b, 0x5c, 0xf6);
  // green cursor block (live #22c55e)
  for (let y = Math.round(10.7 * u); y < Math.round(11.9 * u); y++) {
    for (let x = Math.round(9 * u); x < Math.round(12.6 * u); x++) set(x, y, 0x22, 0xc5, 0x5e);
  }
  return px;
}

for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const out = join(__dirname, '..', 'public', file);
  writeFileSync(out, png(size, draw(size)));
  console.log('wrote', out);
}
```

- [ ] **Step 4: Generate icons and validate**

Run: `node scripts/generate-pwa-icons.js && file public/icon-192.png public/icon-512.png public/apple-touch-icon.png`
Expected: each reported as `PNG image data, <size> x <size>, 8-bit/color RGBA`.

- [ ] **Step 5: Build**

Run: `npm run build 2>&1 | tail -10`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx public/manifest.webmanifest scripts/generate-pwa-icons.js public/icon-192.png public/icon-512.png public/apple-touch-icon.png
git commit -m "feat(mobile-term): PWA manifest, icons, viewport-fit=cover + interactive-widget meta"
```

---

### Task 7: Chrome mobile-emulation verification (§12.7)

**Files:** none created; fixes (if any) go to the files above with `fix(mobile-term): …` commits.

This task runs in the MAIN session (needs claude-in-chrome), not a subagent.

- [ ] **Step 1:** Start `npm run dev` (background). Wait for Next on :50051 and ws-server on :50052. Ensure the local agent is running: `node dist/cli.js start --profile local` from `packages/devdash-agent` (background) if not already up.
- [ ] **Step 2:** In Chrome (claude-in-chrome): open `http://localhost:50051`, resize window to **393×852 (iPhone 14 Pro)**. Open a project's terminal → MobileTerminalShell appears full-screen, ≥13 px font, top bar + chips + composer visible (criterion 1 analog).
- [ ] **Step 3:** Composer: type `ls -la`, send → output streams (criterion 2). Send `ping localhost` (macOS pings forever), tap `^C` chip → interrupt (criterion 5). Run `top`, toggle RAW, verify arrow chips move selection and `q` typed via xterm quits (criterion 4).
- [ ] **Step 4:** Font scaling: dispatch synthetic two-finger `TouchEvent`s via `javascript_tool` on `.devdash-mts-term` to pinch; verify xterm font size changes and `localStorage['devdash-mobile-fontsize']` persists across reload (criterion 8).
- [ ] **Step 5:** Reconnect: `document.dispatchEvent`-level simulation is weak — instead kill/restart the WS path is out of scope; verify the reconnect toast by toggling network via CDP if available, else verify `visibilitychange` handler exists and statusline appears on ws drop (criterion 7 partial — real device required).
- [ ] **Step 6:** Repeat the core pass at **412×915 (Pixel 7)**.
- [ ] **Step 7:** Verify `manifest.webmanifest` loads (DevTools → Application) and viewport meta contains `viewport-fit=cover, interactive-widget=resizes-content`.
- [ ] **Step 8:** Report: criteria verified in emulation vs. those needing a real device (expected: #3 dictation, #6 real keyboard geometry/visualViewport, #7 lock/unlock, safe-area notch rendering in #1, haptics; #9 is Phase 2).

## Self-Review Notes

- Spec coverage: §12.1 (full-screen, dvh, safe-area, pinch font 10–22 persisted, double-tap reset) → Tasks 4/6; §12.2 (composer, raw mode, KeyChipBar, haptics, no custom speech) → Tasks 2/3/4; §12.3 (visualViewport, viewport meta, keep-focus, hide-keyboard chevron) → Tasks 3/4/6; §12.5 (visibility reconnect, reconnect toast, wake lock) → Tasks 1/4; §12.6 (manifest, standalone, apple-touch-icon) → Task 6. §12.4 + criterion 9 deferred (documented deviations). WebGL addon (§12.1) intentionally skipped: not installed today, canvas renderer already ships; adding `@xterm/addon-webgl` is a perf polish item for Phase 4.
- Type consistency: `TerminalHandle` (sendInput/setFontSize/getFontSize/fit/focusTerminal/scrollToBottom) used identically in Tasks 1, 4, 5. `CtrlState` defined once in KeyChipBar, imported by Composer/Shell. `TermConnectionState` defined in Terminal, used in Panel/Shell props.
