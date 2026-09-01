'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import type { TerminalTheme } from './terminal-themes';
import { createWriteQueue, type WriteQueue } from '../lib/write-queue';
import { saveScrollback, loadScrollback, wasRestored, markRestored } from '../lib/terminal-scrollback-cache';
import { getFontFamily } from './mobile-term-prefs';

export type TermConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'exited';

export interface TerminalSearchOptions {
  regex?: boolean;
  wholeWord?: boolean;
  caseSensitive?: boolean;
}

export interface TerminalSearchResult {
  /** 0-based index of the active match; -1 if none (or the highlight limit was exceeded). */
  index: number;
  /** Total number of matches currently highlighted. */
  count: number;
}

export interface TerminalHandle {
  sendInput: (data: string) => void;
  setFontSize: (px: number) => void;
  getFontSize: () => number;
  /** Sets the xterm font-family stack live (Task 6: font-family choice). */
  setFontFamily: (css: string) => void;
  fit: () => void;
  focusTerminal: () => void;
  scrollToBottom: () => void;
  /** True when the viewport is pinned to the newest output (follow-tail). */
  isAtBottom: () => boolean;
  closeSession: () => void;
  setTheme: (theme: TerminalTheme) => void;
  setCursorBlink: (v: boolean) => void;
  forceReconnect: () => void;
  /** Routes through the same secure-context clipboard writer used by native copy/OSC-52. */
  copyText: (text: string) => void;
  /** Records the current end of the xterm buffer as the start line for getLastOutput(). */
  snapshotOutputStart: () => void;
  /** Buffer text from the last snapshotOutputStart() line to the current end, trimmed.
   *  Pass the last command to strip its leading echo line from the result. */
  getLastOutput: (lastCommand?: string) => string;
  /** Text of the rows currently visible in the viewport (the on-screen "page"), trimmed. */
  getScreenText: () => string;
  /** In-buffer search (SearchAddon). Starts a fresh search for `term` from the
   *  current position, wrapping the buffer if nothing matches ahead. Passing
   *  an empty string clears the search instead. */
  search: (term: string, opts?: TerminalSearchOptions) => void;
  /** Advances to the next match of the last search() term. */
  searchNext: () => void;
  /** Goes back to the previous match of the last search() term. */
  searchPrev: () => void;
  /** Clears search highlighting/selection and forgets the search term. */
  clearSearch: () => void;
  /** Latest match-count/active-index reported by the addon for the last
   *  search()/searchNext()/searchPrev() call, or null before any search. */
  getSearchResults: () => TerminalSearchResult | null;
}

// Highlight colors for SearchAddon's `decorations` option — enabling
// decorations is also what makes onDidChangeResults fire (see search()
// below), so this is passed on every findNext/findPrevious call rather than
// being purely cosmetic. Kept as fixed colors (not theme-derived) since the
// match highlight needs to stand out against ANY of the curated terminal
// themes, light or dark.
const SEARCH_DECORATIONS = {
  matchBackground: '#5c4813',
  matchBorder: '#d9a520',
  matchOverviewRuler: '#d9a520',
  activeMatchBackground: '#ff8f00',
  activeMatchBorder: '#ffffff',
  activeMatchColorOverviewRuler: '#ff8f00',
};

// Maps our TerminalTheme shape to xterm's ITheme option object. Extracted so
// both the init-time theme and the live setTheme() update share one field
// set instead of drifting out of sync.
function mapTheme(t: TerminalTheme) {
  return {
    background: t.background,
    foreground: t.foreground,
    cursor: t.cursor,
    cursorAccent: t.cursorAccent,
    selectionBackground: t.selectionBackground,
    black: t.black,
    red: t.red,
    green: t.green,
    yellow: t.yellow,
    blue: t.blue,
    magenta: t.magenta,
    cyan: t.cyan,
    white: t.white,
    brightBlack: t.brightBlack,
    brightRed: t.brightRed,
    brightGreen: t.brightGreen,
    brightYellow: t.brightYellow,
    brightBlue: t.brightBlue,
    brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan,
    brightWhite: t.brightWhite,
  };
}

interface TerminalProps {
  sessionId: string;
  wsUrl: string;
  machineId: number;
  userId: number;
  command?: string;
  cwd?: string;
  visible?: boolean;
  theme?: TerminalTheme;
  fontSize?: number;
  onExit?: (code: number) => void;
  onConnectionChange?: (state: TermConnectionState) => void;
  /** Fires whenever the viewport's pinned-to-bottom state changes (follow-tail). */
  onScrollChange?: (atBottom: boolean) => void;
  /** Fires whenever the SearchAddon reports a match-count change (only while
   *  decorations are enabled, which search()/searchNext()/searchPrev() below
   *  always do). Prefer the handle's getSearchResults() for a synchronous
   *  read right after calling those methods — this callback is for
   *  consumers that render off the Terminal's own props tree. */
  onSearchResults?: (index: number, count: number) => void;
  /** Attach to this tmux session instead of spawning a shell (cowork). */
  tmuxSession?: string;
  /** Read-only attach (Peek): input and resize are suppressed. */
  readOnly?: boolean;
  /** Render at a fixed grid instead of fitting the container (Peek shows the session's true size). */
  fixedSize?: { cols: number; rows: number };
}

// Keepalive: client pings every 25s (keeps idle proxies from dropping the
// socket); if no pong within 10s the connection is considered dead and we
// force a reconnect. The ws-server keeps the PTY alive for a grace period,
// so reconnecting with the same sessionId reattaches to the running shell.
const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const RECONNECT_MAX_DELAY_MS = 15_000;

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
  onScrollChange,
  onSearchResults,
  tmuxSession,
  readOnly,
  fixedSize,
}: TerminalProps, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<any>(null);
  const termRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const exitedRef = useRef(false);
  const connRef = useRef(onConnectionChange);
  useEffect(() => { connRef.current = onConnectionChange; });
  const scrollChangeRef = useRef(onScrollChange);
  useEffect(() => { scrollChangeRef.current = onScrollChange; });
  const searchResultsCallbackRef = useRef(onSearchResults);
  useEffect(() => { searchResultsCallbackRef.current = onSearchResults; });
  // Live-ref mirror of the follow-tail state: written from the xterm
  // onScroll handler inside the connect-effect (see notifyAtBottom below),
  // read by isAtBottom() on the imperative handle. Starts true (empty
  // terminal is trivially "at bottom").
  const atBottomRef = useRef(true);
  // Cross-scope handles into the connect-effect's internals so
  // forceReconnect() (defined in useImperativeHandle, outside the effect)
  // can reset backoff state and kick a reconnect immediately.
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectFnRef = useRef<(() => void) | null>(null);
  // Buffer line (baseY + cursorY) recorded by snapshotOutputStart(); getLastOutput()
  // reads from here to the current end of the buffer.
  const outputStartRef = useRef(0);
  // Set inside init() to the same secure-context clipboard writer used by
  // native copy and OSC-52 — copyText() on the handle routes through this
  // rather than duplicating the guard.
  const copyToClipboardRef = useRef<(text: string) => void>(() => {});
  // rAF-coalesced write queue for PTY output (see ../lib/write-queue.ts):
  // ws.onmessage pushes into this instead of calling term.write() directly,
  // so a burst of `pty_data` messages in one frame becomes one xterm write
  // instead of many. Created per-connection in init(), disposed on cleanup —
  // read via this ref (not a closure) so the imperative handle below always
  // reaches the current connection's queue.
  const writeQueueRef = useRef<WriteQueue | null>(null);
  // SearchAddon instance for the current connection (created in init(), read
  // by the search()/searchNext()/searchPrev()/clearSearch() handle methods
  // below via this ref — same live-ref pattern as fitRef/termRef).
  const searchAddonRef = useRef<any>(null);
  // SerializeAddon instance for the current connection (Task 4: scrollback
  // cache) — created in init() alongside the other addons, read by the
  // save-on-hide/teardown logic below via this ref.
  const serializeAddonRef = useRef<any>(null);
  // Last term/options passed to search(), reused by searchNext()/searchPrev()
  // so they can repeat the same query without the caller re-supplying it.
  const searchTermRef = useRef('');
  const searchOptsRef = useRef<TerminalSearchOptions | undefined>(undefined);
  // Latest { index, count } reported via onDidChangeResults — findNext/
  // findPrevious fire that event synchronously before returning (confirmed
  // against the addon's source), so getSearchResults() right after calling
  // search()/searchNext()/searchPrev() always reflects that call's outcome.
  const searchResultRef = useRef<TerminalSearchResult | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let exited = false;
    exitedRef.current = false;
    atBottomRef.current = true;
    let term: any = null;
    let ws: WebSocket | null = null;
    let ro: ResizeObserver | null = null;
    let reopenTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pongTimer: ReturnType<typeof setTimeout> | null = null;
    reconnectAttemptsRef.current = 0;
    reconnectTimerRef.current = null;
    let wasDisconnected = false;

    // Task 4 (scrollback cache): keyed by tmuxSession when present (the
    // stable /terminal/[machineId]/[name] surface) else the client
    // sessionId (stable across a same-tab reload, per TerminalPanel's
    // sessionStorage — see D1 in the as-built audit). Computed once per
    // mount since neither prop changes across this effect's lifetime
    // (deps: [sessionId]).
    const cacheKey = tmuxSession || sessionId;

    const stopKeepalive = () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
    };

    const startKeepalive = () => {
      stopKeepalive();
      pingTimer = setInterval(() => {
        if (ws?.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'ping' }));
        if (!pongTimer) {
          pongTimer = setTimeout(() => {
            pongTimer = null;
            // No pong — connection is dead. Force close to trigger reconnect.
            try { ws?.close(); } catch {}
          }, PONG_TIMEOUT_MS);
        }
      }, PING_INTERVAL_MS);
    };

    const statusLine = (text: string, color = '240') => {
      // Drain any pushed-but-unflushed PTY output first: pty_data now goes
      // through the rAF-coalesced queue, so a status banner written
      // synchronously here (exit/error/connection) would otherwise render
      // ABOVE earlier output that's still sitting in the queue — reordering
      // the stream. Flushing first keeps banners after the output they follow.
      writeQueueRef.current?.flushNow();
      try { term?.write(`\r\n\x1b[38;5;${color}m--- ${text} ---\x1b[0m\r\n`); } catch {}
    };

    // Follow-tail detection: recomputed on every xterm scroll event (user
    // drag, wheel, keyboard, or the programmatic auto-follow xterm itself
    // does on write() when already pinned to the bottom). Small threshold
    // so being within a line or two of the bottom still counts as "at
    // bottom" (avoids flicker from rounding at the exact last row).
    const notifyAtBottom = () => {
      const b = term?.buffer?.active;
      if (!term || !b) return;
      const threshold = 2;
      // Fully scrolled down => viewportY === baseY; scrolled up => viewportY
      // < baseY. (An earlier `viewportY + rows >= baseY + length` form was
      // wrong: baseY ≈ length - rows once any scrollback exists, so it
      // collapses to `rows >= length` and reads false at the true bottom.)
      const next = b.viewportY >= b.baseY - threshold;
      if (atBottomRef.current !== next) {
        atBottomRef.current = next;
        scrollChangeRef.current?.(next);
      }
    };

    // Task 4: serialize + persist a bounded xterm snapshot so a cold PWA/tab
    // relaunch can restore "what this device last saw" before the live
    // stream resumes. Called from the visibilitychange 'hidden'/'pagehide'
    // branch below and from this effect's own teardown — the only two
    // points where the live term is about to go away without a guaranteed
    // future write.
    const saveSnapshotNow = () => {
      const addon = serializeAddonRef.current;
      if (!term || !addon) return;
      // serialize() is a synchronous buffer read — drain any rAF-queued PTY
      // output first (Task 2 rule) or the snapshot loses the most-recent tail.
      // This matters exactly when it fires: on visibilitychange:hidden /
      // pagehide, rAF is frozen so the pending frame is still queued (not in
      // the buffer), and on teardown the queue is disposed (discarded) right
      // after — the very tail cold-load restore exists to preserve.
      writeQueueRef.current?.flushNow();
      try {
        const snap = addon.serialize({ scrollback: 1000 });
        if (snap) saveScrollback(cacheKey, snap);
      } catch {}
    };

    const scheduleReconnect = () => {
      if (destroyed || exited || reconnectTimerRef.current) return;
      reconnectAttemptsRef.current += 1;
      const delay = Math.min(1000 * 2 ** Math.min(reconnectAttemptsRef.current, 4), RECONNECT_MAX_DELAY_MS)
        + Math.floor(Math.random() * 500);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    };

    const sendOpen = () => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      const cols = fixedSize?.cols || term?.cols || 80;
      const rows = fixedSize?.rows || term?.rows || 24;
      // Idempotent on server & agent: reattaches if the session still exists,
      // spawns a fresh PTY otherwise.
      ws.send(JSON.stringify({
        type: 'pty_open',
        id: sessionId,
        command: command || '',
        cwd: cwd || '~',
        cols,
        rows,
        tmuxSession: tmuxSession || undefined,
        readOnly: !!readOnly,
      }));
      if (!readOnly) {
        ws.send(JSON.stringify({ type: 'pty_resize', id: sessionId, cols, rows }));
      }
    };

    const connect = () => {
      if (destroyed || exited) return;
      if (wsRef.current) return; // a socket already exists / is connecting — don't double-connect
      connRef.current?.('connecting');
      const url = `${wsUrl}/terminal?userId=${userId}&machineId=${machineId}`;
      try {
        ws = new WebSocket(url);
        wsRef.current = ws;
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        if (destroyed) { ws?.close(); return; }
        reconnectAttemptsRef.current = 0;
        connRef.current?.('connected');
        if (wasDisconnected) {
          statusLine('reconnected', '114');
          wasDisconnected = false;
        }
        // Task 4 (cold-load restore): fires once per PAGE LOAD per cacheKey,
        // gated by a module-level Set (wasRestored/markRestored) rather than a
        // per-mount ref. The /terminal attach page remounts <Terminal> on
        // every Peek/Drive toggle (its key embeds a switchMode() nonce) while
        // cacheKey (= tmuxSession) is unchanged — a per-mount guard would
        // re-inject the restored block on each toggle. The module Set skips
        // any subsequent SPA remount of the same key, yet resets on a real
        // page load / F5 (fresh module) so a genuine cold load still restores.
        // A same-socket reconnect within one mount is also covered: the key is
        // marked on the first successful connect. Pushed through the write
        // queue so it orders correctly against any pty_data that arrives right
        // after — nothing can arrive before this synchronous handler returns.
        if (!wasRestored(cacheKey)) {
          markRestored(cacheKey);
          try {
            const saved = loadScrollback(cacheKey);
            if (saved) {
              writeQueueRef.current?.push('\r\n\x1b[2m--- restored ---\x1b[0m\r\n' + saved + '\r\n');
            }
          } catch {}
        }
        sendOpen();
        startKeepalive();
      };

      ws.onmessage = (e) => {
        if (destroyed) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'pty_data') {
            writeQueueRef.current?.push(msg.data);
          } else if (msg.type === 'pong') {
            if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
          } else if (msg.type === 'pty_exit') {
            exited = true;
            exitedRef.current = true;
            statusLine(`exited (${msg.code})`);
            onExit?.(msg.code);
            connRef.current?.('exited');
          } else if (msg.type === 'error' || msg.type === 'pty_error') {
            statusLine(msg.error || 'terminal error', '203');
            // Machine offline — retry the open periodically so the session
            // comes up as soon as the agent reconnects.
            if (!exited && !reopenTimer && /offline/i.test(msg.error || '')) {
              reopenTimer = setTimeout(() => { reopenTimer = null; sendOpen(); }, 5000);
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        stopKeepalive();
        ws = null;
        wsRef.current = null;
        if (destroyed || exited) return;
        // Retries are always scheduled below (no backoff-abandonment logic
        // here) — but when the browser itself is offline, surface
        // 'disconnected' instead of 'reconnecting' since the retry loop has
        // no chance of succeeding until connectivity returns.
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        connRef.current?.(isOffline ? 'disconnected' : 'reconnecting');
        if (!wasDisconnected) {
          statusLine('connection lost — reconnecting…', '178');
          wasDisconnected = true;
        }
        scheduleReconnect();
      };

      ws.onerror = () => { /* onclose follows */ };
    };
    connectFnRef.current = connect;

    const init = async () => {
      const xterm = await import('xterm');
      const fit = await import('@xterm/addon-fit');
      const search = await import('@xterm/addon-search');
      const ser = await import('@xterm/addon-serialize');
      let webLinks: any = null;
      try { webLinks = await import('xterm-addon-web-links'); } catch {}
      // @ts-ignore
      await import('xterm/css/xterm.css');

      if (destroyed || !containerRef.current) return;

      const fitAddon = new fit.FitAddon();
      fitRef.current = fitAddon;

      const defaultTheme = {
        background: 'rgba(13, 13, 20, 0.97)',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        cursorAccent: '#0d0d14',
        selectionBackground: 'rgba(56, 139, 253, 0.3)',
        black: '#0d1117',
        red: '#ff7b72',
        green: '#7ee787',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#d2a8ff',
        cyan: '#79c0ff',
        white: '#c9d1d9',
        brightBlack: '#484f58',
        brightRed: '#ffa198',
        brightGreen: '#aff5b4',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#a5d6ff',
        brightWhite: '#f0f6fc',
      };

      const appliedTheme = theme ? mapTheme(theme) : defaultTheme;

      term = new xterm.Terminal({
        cursorBlink: true,
        cursorStyle: 'bar' as const,
        cursorWidth: 2,
        fontSize: fontSize ?? 13,
        // Task 6: read the per-device saved font-family choice at init
        // (mirrors how the saved theme is read by the caller and passed
        // in — font-family has no prop of its own, so this component reads
        // the pref directly). Falls back to the pre-Task-6 default
        // ('JetBrains Mono', Menlo, Monaco, monospace) when nothing is saved.
        fontFamily: getFontFamily(),
        lineHeight: 1.3,
        scrollback: 50000,
        allowTransparency: true,
        macOptionIsMeta: true,
        // Option-drag = force a real OS-level selection, bypassing mouse
        // reporting. tmux runs with `mouse on`, so a plain drag is tmux's
        // select-and-copy; this is the escape hatch for when you want the
        // terminal's own highlight instead (unwrapped lines, across panes).
        // xterm.js gates it: shouldForceSelection() is
        // `isMac ? altKey && macOptionClickForcesSelection : shiftKey`, and
        // the option defaults to FALSE — so without this line macOS had NO
        // bypass gesture at all, while Linux got Shift-drag for free.
        // Independent of macOptionIsMeta above, which is a keydown concern.
        macOptionClickForcesSelection: true,
        theme: appliedTheme,
      });

      termRef.current = term;
      writeQueueRef.current = createWriteQueue((data: string) => {
        try { term.write(data); } catch {}
      });
      term.loadAddon(fitAddon);

      const searchAddon = new search.SearchAddon();
      term.loadAddon(searchAddon);
      searchAddonRef.current = searchAddon;
      try {
        searchAddon.onDidChangeResults((e: { resultIndex: number; resultCount: number }) => {
          const result = { index: e.resultIndex, count: e.resultCount };
          searchResultRef.current = result;
          searchResultsCallbackRef.current?.(result.index, result.count);
        });
      } catch {}

      // Task 4 (scrollback cache): used only to serialize a bounded snapshot
      // on hide/teardown — see saveSnapshotNow() above.
      const serializeAddon = new ser.SerializeAddon();
      term.loadAddon(serializeAddon);
      serializeAddonRef.current = serializeAddon;

      if (webLinks) {
        try {
          term.loadAddon(new webLinks.WebLinksAddon((_e: MouseEvent, uri: string) => {
            window.open(uri, '_blank', 'noopener,noreferrer');
          }));
        } catch {}
      }
      term.open(containerRef.current);

      // navigator.clipboard only exists in a SECURE CONTEXT (https, or
      // localhost). Served over plain http on a LAN IP it is undefined, and
      // every copy/paste below would silently do nothing. Say so out loud
      // rather than failing invisibly — this is the single most likely reason
      // for "copy just doesn't work" when the tmux side is healthy.
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        statusLine('clipboard unavailable here — open Dialout over https or localhost', '178');
      }

      const copyToClipboard = (text: string) => {
        if (!text) return;
        // Rejects when the document isn't focused or permission is denied;
        // surface it instead of swallowing so a silent failure is visible.
        navigator.clipboard?.writeText(text).catch(() => {
          statusLine('copy blocked by the browser (needs https + window focus)', '178');
        });
      };
      // Expose the same closure to the imperative handle's copyText() so
      // there is exactly one clipboard writer / secure-context guard in
      // this component.
      copyToClipboardRef.current = copyToClipboard;

      // OSC 52: tmux emits this on every copy (set-clipboard on), which is how
      // a drag / double / triple-click selection made INSIDE tmux reaches this
      // browser's clipboard — xterm.js ignores OSC 52 by default.
      // Payload is "<selection>;<base64>", e.g. "c;SGVsbG8=".
      try {
        term.parser.registerOscHandler(52, (data: string) => {
          const semi = data.indexOf(';');
          const b64 = semi >= 0 ? data.slice(semi + 1) : data;
          if (b64 && b64 !== '?') {
            try {
              const text = decodeURIComponent(escape(atob(b64)));
              copyToClipboard(text);
            } catch {}
          }
          return true;
        });
      } catch {}

      // Native copy/paste.
      //
      // COPY — Cmd+C (mac) / Ctrl+Shift+C (win/linux) copy the xterm selection.
      // Plain Ctrl+C is never intercepted: it stays SIGINT.
      //
      // The chord is swallowed even when there is NO selection. That looks
      // wrong but is the actual bugfix: with tmux `mouse on` a drag is consumed
      // by tmux, so xterm holds no selection of its own and getSelection() is
      // empty — and xterm.js resolves Ctrl+Shift+C to ^C, so falling through
      // fired SIGINT at the moment the user meant "copy". Nothing is lost by
      // swallowing: tmux already copied the text to the clipboard via OSC 52 on
      // drag-release. Shift+drag bypasses tmux's mouse reporting and gives a
      // real xterm selection if you want the literal chord path.
      //
      // PASTE — Cmd+V / Ctrl+V are deliberately NOT handled here. The browser
      // already fires a native paste event on xterm's textarea and xterm
      // inserts it; handling them too would paste twice. Ctrl+Shift+V produces
      // no native paste event, so it is the only one we implement.
      // term.paste() (not a raw ws send) so bracketed-paste mode is honoured —
      // a multi-line paste must not auto-execute each line.
      try {
        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
          if (e.type !== 'keydown') return true;

          const isCopyChord =
            (e.key === 'c' || e.key === 'C') &&
            ((e.metaKey && !e.ctrlKey) || (e.ctrlKey && e.shiftKey));
          if (isCopyChord) {
            copyToClipboard(term.getSelection());
            return false; // never fall through to ^C
          }

          const isPasteChord = (e.key === 'v' || e.key === 'V') && e.ctrlKey && e.shiftKey;
          if (isPasteChord) {
            e.preventDefault();
            if (!readOnly) {
              navigator.clipboard?.readText?.()
                .then((text) => { if (text) term.paste(text); })
                .catch(() => {
                  statusLine('paste blocked by the browser (needs https + permission)', '178');
                });
            }
            return false;
          }

          return true;
        });
      } catch {}

      if (fixedSize) {
        try { term.resize(fixedSize.cols, fixedSize.rows); } catch {}
      } else {
        try { fitAddon.fit(); } catch {}
      }

      if (destroyed) { term.dispose(); return; }

      term.onData((data: string) => {
        if (readOnly) return;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pty_data', id: sessionId, data }));
        }
      });

      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (readOnly) return;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pty_resize', id: sessionId, cols, rows }));
        }
      });

      try { term.onScroll(() => notifyAtBottom()); } catch {}

      if (!fixedSize) {
        ro = new ResizeObserver(() => {
          if (!destroyed) try { fitAddon.fit(); } catch {}
        });
        ro.observe(containerRef.current);
      }

      connect();
    };

    init();

    // --- Backgrounding / reattach policy ---
    // Mobile/PWA: when the tab or installed app is backgrounded the OS may
    // drop the WebSocket. On return to `visible` we reattach to the SAME
    // PTY/tmux session (same sessionId / tmuxSession) via the existing
    // reconnect path — the ws-server keeps the PTY alive for a grace period,
    // so pty_open with the same id reattaches instead of spawning a fresh
    // shell. We never spawn a new session here. If the server has torn the
    // session down (grace expired) it reports pty_exit, which onmessage above
    // turns into the existing 'exited' state; the shell then offers an
    // explicit Restart (no silent auto-spawn into the old view).
    //
    // CLOSING-race fix: decide off the LIVE socket (wsRef.current) and its
    // readyState — the exact value connect() guards on — never the
    // effect-closure `ws`. A healthy OPEN/CONNECTING socket is left alone
    // (respects connect()'s in-flight `if (wsRef.current) return` guard; no
    // double-connect). A dead/dying socket (CLOSING/CLOSED, e.g. a
    // backgrounded drop or a forced close still in flight) must NOT be
    // reconnected via connect() here: connect() would no-op against the
    // still-non-null ref, and racing a new socket in before the old onclose
    // fires would let that stale onclose clobber the new one. Instead we
    // close() it (idempotent) and let its onclose drive the reconnect — with
    // backoff reset so the retry starts at the shortest delay. Only when
    // there is no socket at all do we connect() right now. This mirrors
    // forceReconnect()'s branch, so visibility and the pill's reconnect share
    // one code path rather than a parallel one.
    const onVisible = (ev?: Event) => {
      // Task 4 (scrollback cache): the buffer is at risk of loss the moment
      // the tab/PWA is backgrounded (OS may suspend or kill it before it
      // ever comes back to 'visible') — save a bounded snapshot right here,
      // on the SAME listener as the T5 reattach logic below rather than a
      // second visibilitychange subscription. `pagehide` covers the cases
      // where the page is torn down without visibilitychange firing first
      // (some iOS Safari / bfcache paths). Neither branch reconnects, so we
      // return before the visible-only reattach logic below.
      if (ev?.type === 'pagehide' || document.visibilityState === 'hidden') {
        saveSnapshotNow();
        if (ev?.type === 'pagehide') return;
      }
      if (document.visibilityState !== 'visible' || destroyed || exited) return;
      const w = wsRef.current;
      if (w && (w.readyState === WebSocket.OPEN || w.readyState === WebSocket.CONNECTING)) return;
      reconnectAttemptsRef.current = 0;
      if (w) {
        // CLOSING/CLOSED but onclose hasn't cleaned up yet — let onclose
        // drive the reconnect; connecting against the stale ref would no-op
        // (or clobber a new socket). close() is idempotent if already closing.
        try { w.close(); } catch {}
      } else {
        if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('pagehide', onVisible);

    return () => {
      destroyed = true;
      // Task 4: last-chance save before the term is disposed below — covers
      // unmounts that aren't preceded by a hide (e.g. mobile/desktop layout
      // swap, tab close via closeSession()'s own unmount).
      saveSnapshotNow();
      stopKeepalive();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      connectFnRef.current = null;
      if (reopenTimer) clearTimeout(reopenTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('pagehide', onVisible);
      if (ro) ro.disconnect();
      if (ws) {
        try {
          // Unmount may just be a layout switch (mobile/desktop branch swap,
          // full<->card view-mode change), not a user-initiated close — do
          // NOT send pty_close here. A bare socket close only detaches; the
          // ws-server keeps the PTY alive for a reattach grace period, and a
          // remount's pty_open with the same sessionId reattaches to it.
          // Explicit, intentional closes go through closeSession() instead.
          ws.close();
        } catch {}
      }
      if (term) { try { term.dispose(); } catch {} }
      // Discard (not flush) — the terminal these writes would have targeted
      // is already being torn down, so there's nothing left to render into.
      writeQueueRef.current?.dispose();
      writeQueueRef.current = null;
      wsRef.current = null;
      fitRef.current = null;
      termRef.current = null;
      outputStartRef.current = 0;
      atBottomRef.current = true;
      copyToClipboardRef.current = () => {};
      searchAddonRef.current = null;
      searchTermRef.current = '';
      searchOptsRef.current = undefined;
      searchResultRef.current = null;
      serializeAddonRef.current = null;
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!fixedSize) {
        try { fitRef.current?.fit(); } catch {}
      }
    },
    getFontSize: () => termRef.current?.options?.fontSize ?? fontSize ?? 13,
    setFontFamily: (css: string) => {
      const t = termRef.current;
      if (t) {
        try { t.options.fontFamily = css; } catch {}
      }
    },
    fit: () => {
      if (fixedSize) return;
      try { fitRef.current?.fit(); } catch {}
    },
    focusTerminal: () => { try { termRef.current?.focus(); } catch {} },
    scrollToBottom: () => { try { termRef.current?.scrollToBottom(); } catch {} },
    isAtBottom: () => atBottomRef.current,
    closeSession: () => {
      if (exitedRef.current) return;
      const w = wsRef.current;
      if (w?.readyState === WebSocket.OPEN) {
        w.send(JSON.stringify({ type: 'pty_close', id: sessionId }));
      }
    },
    setTheme: (t: TerminalTheme) => {
      const term = termRef.current;
      if (term) {
        try { term.options.theme = mapTheme(t); } catch {}
      }
    },
    setCursorBlink: (v: boolean) => {
      const term = termRef.current;
      if (term) {
        try { term.options.cursorBlink = v; } catch {}
      }
    },
    forceReconnect: () => {
      if (exitedRef.current) return;
      // Reset backoff so the next attempt starts at the shortest delay
      // rather than wherever the previous attempt count had climbed to.
      reconnectAttemptsRef.current = 0;
      const w = wsRef.current;
      if (w) {
        // Triggers the existing onclose → scheduleReconnect path.
        try { w.close(); } catch {}
      } else {
        // No live socket — we're mid-backoff waiting on reconnectTimer.
        // Skip the wait and reconnect right now.
        if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
        connectFnRef.current?.();
      }
    },
    copyText: (text: string) => copyToClipboardRef.current(text),
    snapshotOutputStart: () => {
      // Flush any queued-but-not-yet-written output first: baseY+cursorY
      // must reflect what xterm has actually rendered, or the recorded start
      // line drifts behind the real end of output and getLastOutput() later
      // re-includes (or skips) lines depending on timing.
      writeQueueRef.current?.flushNow();
      const b = termRef.current?.buffer?.active;
      outputStartRef.current = b ? b.baseY + b.cursorY : 0;
    },
    getLastOutput: (lastCommand?: string) => {
      // Reads the buffer synchronously — flush first so nothing queued is
      // missing from the snapshot.
      writeQueueRef.current?.flushNow();
      const term = termRef.current;
      const b = term?.buffer?.active;
      if (!b) return '';
      // getLine(i) is valid for i in [0, b.length); baseY is already absolute
      // within that range, so the end bound is just b.length.
      const end = b.length;
      let out = '';
      for (let i = outputStartRef.current; i < end; i++) {
        const line = b.getLine(i);
        if (line) out += line.translateToString(true) + '\n';
      }
      out = out.trimEnd();
      // snapshotOutputStart() records the prompt line, onto which the shell
      // echoes the command — so the first line here is "…$ <command>". Strip it
      // for the common single-line case; leave wrapped/multiline commands alone
      // (graceful: only strips when the first non-empty line ends with the echo).
      // A perfect output boundary needs shell integration (OSC 133) — Phase 2.
      const cmd = lastCommand?.trim();
      if (cmd) {
        const lines = out.split('\n');
        const firstIdx = lines.findIndex((l) => l.trim() !== '');
        if (firstIdx >= 0 && lines[firstIdx].trimEnd().endsWith(cmd)) {
          lines.splice(0, firstIdx + 1);
          out = lines.join('\n').replace(/^\n+/, '');
        }
      }
      return out;
    },
    getScreenText: () => {
      // Same reasoning as getLastOutput()/snapshotOutputStart(): this reads
      // the buffer synchronously, so flush first.
      writeQueueRef.current?.flushNow();
      const term = termRef.current;
      const b = term?.buffer?.active;
      if (!b || !term) return '';
      const start = b.viewportY;
      const end = start + term.rows;
      let out = '';
      for (let i = start; i < end; i++) {
        const line = b.getLine(i);
        if (line) out += line.translateToString(true) + '\n';
      }
      return out.trimEnd();
    },
    search: (term: string, opts?: TerminalSearchOptions) => {
      searchTermRef.current = term;
      searchOptsRef.current = opts;
      const addon = searchAddonRef.current;
      if (!addon) return;
      if (!term) {
        try { addon.clearDecorations(); } catch {}
        searchResultRef.current = null;
        return;
      }
      try { addon.findNext(term, { ...opts, decorations: SEARCH_DECORATIONS }); } catch {}
    },
    searchNext: () => {
      const addon = searchAddonRef.current;
      const term = searchTermRef.current;
      if (!addon || !term) return;
      try { addon.findNext(term, { ...searchOptsRef.current, decorations: SEARCH_DECORATIONS }); } catch {}
    },
    searchPrev: () => {
      const addon = searchAddonRef.current;
      const term = searchTermRef.current;
      if (!addon || !term) return;
      try { addon.findPrevious(term, { ...searchOptsRef.current, decorations: SEARCH_DECORATIONS }); } catch {}
    },
    clearSearch: () => {
      searchTermRef.current = '';
      searchOptsRef.current = undefined;
      searchResultRef.current = null;
      try { searchAddonRef.current?.clearDecorations(); } catch {}
    },
    getSearchResults: () => searchResultRef.current,
  }), [sessionId, fontSize]);

  // Apply theme changes live without remounting
  useEffect(() => {
    if (theme && termRef.current) {
      try { termRef.current.options.theme = mapTheme(theme); } catch {}
    }
  }, [theme]);

  // Refit on visibility change
  useEffect(() => {
    if (fixedSize) return;
    if (visible && fitRef.current) {
      try { fitRef.current.fit(); } catch {}
    }
  }, [visible, fixedSize]);

  return (
    <div ref={containerRef} className="devdash-terminal" style={{ width: '100%', height: '100%' }} />
  );
});

export default Terminal;
