'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Lock, Search } from 'lucide-react';
import type { TerminalHandle, TermConnectionState, TerminalSearchResult } from './Terminal';
import KeyChipBar from './KeyChipBar';
import type { CtrlState } from './KeyChipBar';
import TerminalComposer from './TerminalComposer';
import TerminalSearchBar from './TerminalSearchBar';
import TerminalSettingsDrawer from './TerminalSettingsDrawer';
import ConnectionPill from './ConnectionPill';
import { useFullscreen } from './useFullscreen';
import {
  clampFont,
  getSavedFontSize,
  saveFontSize,
  DEFAULT_FONT,
  getSavedThemeId,
  saveThemeId,
  getSavedKeys,
  saveKeys,
  getCursorBlink,
  saveCursorBlink,
  getHaptics,
  saveHaptics,
  getFontFamily,
  saveFontFamily,
  getFullscreenHintSeen,
  setFullscreenHintSeen,
} from './mobile-term-prefs';
import { TERMINAL_THEMES } from './terminal-themes';
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
  connectionState: TermConnectionState;
  /** True when the active tab's terminal viewport is pinned to the newest
   *  output (follow-tail). Drives the "Jump to latest" pill and gates the
   *  keyboard-resize auto-scroll below. */
  atBottom: boolean;
  getActiveHandle: () => TerminalHandle | null;
  onSelectTab: (id: string) => void;
  onNewTab?: () => void;
  onCloseTab: (id: string) => void;
  onClose: () => void;
  commands: { id: number; label: string; command: string; icon: string }[];
  onOpenCommand: (command: string, label: string) => void;
  children: React.ReactNode;
  /** Peek mode: composer + chips are replaced with a read-only banner. */
  readOnlyBanner?: boolean;
  /** Invoked when the Peek banner is tapped ("tap to Drive"). */
  onRequestDrive?: () => void;
}

// Full-screen mobile terminal (spec §12): the terminal is the screen,
// input is a composer, keys are chips.
export default function MobileTerminalShell({
  title,
  tabs,
  activeTabId,
  connectionState,
  atBottom,
  getActiveHandle,
  onSelectTab,
  onNewTab,
  onCloseTab,
  onClose,
  commands,
  onOpenCommand,
  children,
  readOnlyBanner,
  onRequestDrive,
}: MobileTerminalShellProps) {
  const [inputMode, setInputMode] = useState<InputMode>('composer');
  const [ctrlState, setCtrlState] = useState<CtrlState>('off');
  const [tabsMenuOpen, setTabsMenuOpen] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResult, setSearchResult] = useState<TerminalSearchResult | null>(null);
  const [wakeOn, setWakeOn] = useState(false);
  const [vvHeight, setVvHeight] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [themeId, setThemeId] = useState(() => getSavedThemeId());
  const [fontFamily, setFontFamilyState] = useState(() => getFontFamily());
  const [enabledKeys, setEnabledKeys] = useState(() => getSavedKeys());
  const [cursorBlink, setCursorBlink] = useState(() => getCursorBlink());
  const [haptics, setHaptics] = useState(() => getHaptics());
  const [fullscreenHint, setFullscreenHint] = useState(false);
  // Close-confirm sheet: null when hidden; { tabId: null } when confirming
  // the whole-shell close (topbar X), or { tabId } when confirming a
  // specific tab's close (tabs-menu per-tab X). Only shown for live
  // sessions — see isTabLive below for how "live" is determined per tab.
  const [closeConfirm, setCloseConfirm] = useState<{ tabId: string | null } | null>(null);
  // Reactive mirror of fontSizeRef, for the drawer's controlled slider only.
  // The hot pinch-zoom path below stays on the ref to avoid re-render churn
  // on every touchmove; this is synced at the low-frequency points (drawer
  // change, double-tap reset, pinch end).
  const [fontSize, setFontSize] = useState(() => getSavedFontSize());

  const shellRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, supported: fullscreenSupported, toggle: toggleFullscreen } = useFullscreen(shellRef);
  const termAreaRef = useRef<HTMLDivElement>(null);
  const fontSizeRef = useRef(getSavedFontSize());
  const pinchRef = useRef<{ startDist: number; startSize: number } | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  // Element focused right before the settings drawer opens (the gear
  // trigger), restored when the drawer closes.
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  // Element focused right before the close-confirm sheet opens (the topbar
  // X or a tab's close button), restored when the sheet is dismissed.
  const closeTriggerRef = useRef<HTMLElement | null>(null);
  const closeCancelBtnRef = useRef<HTMLButtonElement>(null);
  const closeConfirmBtnRef = useRef<HTMLButtonElement>(null);
  // Restart button in the "session ended" overlay — focused when the
  // overlay appears so keyboard/screen-reader users land on the sole
  // recovery action without hunting for it (Task 9 a11y fix #5).
  const restartBtnRef = useRef<HTMLButtonElement>(null);
  // aria-live announcement text for connection-state transitions (fix #5).
  // Starts empty so nothing is announced on first mount.
  const [liveMessage, setLiveMessage] = useState('');
  const announcedOnceRef = useRef(false);
  const handleRef = useRef(getActiveHandle);
  useEffect(() => { handleRef.current = getActiveHandle; });
  // Live-ref mirror of the atBottom prop so the visualViewport resize
  // effect below (empty deps — registered once) always reads the current
  // follow-tail state instead of closing over the value from mount time.
  const atBottomRef = useRef(atBottom);
  useEffect(() => { atBottomRef.current = atBottom; });
  // Last command sent via the composer + the buffer line it started at, for
  // the copy menu's "Copy last output" / "Copy last command" actions.
  const lastCommandRef = useRef('');

  const sendRaw = (data: string) => {
    getActiveHandle()?.sendInput(data);
    getActiveHandle()?.scrollToBottom();
  };
  const sendLine = (text: string) => {
    lastCommandRef.current = text;
    getActiveHandle()?.snapshotOutputStart();
    // '\r' is what a real terminal Enter sends
    sendRaw(text + '\r');
  };

  const copyLastOutput = () => {
    const h = getActiveHandle();
    h?.copyText(h?.getLastOutput(lastCommandRef.current) ?? '');
    setCopyMenuOpen(false);
  };
  const copyLastCommand = () => {
    const h = getActiveHandle();
    h?.copyText(lastCommandRef.current);
    setCopyMenuOpen(false);
  };
  const copyScreen = () => {
    const h = getActiveHandle();
    h?.copyText(h?.getScreenText() ?? '');
    setCopyMenuOpen(false);
  };

  const openSearch = () => {
    setTabsMenuOpen(false);
    setCopyMenuOpen(false);
    setSearchOpen(true);
  };
  const closeSearch = () => {
    getActiveHandle()?.clearSearch();
    setSearchResult(null);
    setSearchOpen(false);
  };
  // findNext/findPrevious fire onDidChangeResults synchronously before
  // returning (see Terminal.tsx), so getSearchResults() read right after
  // calling the handle already reflects this call's outcome.
  const runSearch = (term: string) => {
    const h = getActiveHandle();
    h?.search(term);
    setSearchResult(h?.getSearchResults() ?? null);
  };
  const searchNext = () => {
    const h = getActiveHandle();
    h?.searchNext();
    setSearchResult(h?.getSearchResults() ?? null);
  };
  const searchPrev = () => {
    const h = getActiveHandle();
    h?.searchPrev();
    setSearchResult(h?.getSearchResults() ?? null);
  };

  const applyFont = (px: number) => {
    const size = clampFont(px);
    fontSizeRef.current = size;
    getActiveHandle()?.setFontSize(size);
  };

  const onDrawerFontSize = (px: number) => {
    applyFont(px);
    saveFontSize(px);
    setFontSize(fontSizeRef.current);
  };

  const applyTheme = (id: string) => {
    const theme = TERMINAL_THEMES.find((t) => t.id === id);
    if (theme) getActiveHandle()?.setTheme(theme);
    saveThemeId(id);
    setThemeId(id);
  };

  const applyFontFamily = (css: string) => {
    getActiveHandle()?.setFontFamily(css);
    saveFontFamily(css);
    setFontFamilyState(css);
  };

  const onToggleKey = (id: string, on: boolean) => {
    setEnabledKeys((prev) => {
      const next = { ...prev, [id]: on };
      saveKeys(next);
      return next;
    });
  };

  const onToggleCursorBlink = (v: boolean) => {
    getActiveHandle()?.setCursorBlink(v);
    setCursorBlink(v);
    saveCursorBlink(v);
  };

  const onToggleHaptics = (v: boolean) => {
    setHaptics(v);
    saveHaptics(v);
  };

  const openDrawer = () => {
    // Capture the trigger so focus can be restored to it on close, then
    // blur the composer so the mobile keyboard closes and the sheet sits
    // above it instead of being pushed up / obscured.
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    (document.activeElement as HTMLElement | null)?.blur?.();
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    lastFocusedRef.current?.focus?.();
    lastFocusedRef.current = null;
  };

  // A tab is "live" if it's the active tab and the shared connectionState
  // says connected, or — for any other (background) tab, where we don't
  // have a per-tab connection state — if it isn't marked exited. `exited`
  // is the best available signal for background tabs: it's set false for
  // connecting/connected/reconnecting/disconnected alike, all of which are
  // sessions still worth confirming before losing (only a truly-dead PTY
  // is safe to close silently).
  const isTabLive = (t: MobileTab) =>
    t.id === activeTabId ? connectionState === 'connected' : !t.exited;

  const requestClose = () => {
    if (connectionState === 'connected') {
      closeTriggerRef.current = document.activeElement as HTMLElement | null;
      setCloseConfirm({ tabId: null });
    } else {
      onClose();
    }
  };

  const requestCloseTab = (t: MobileTab) => {
    if (isTabLive(t)) {
      setTabsMenuOpen(false);
      closeTriggerRef.current = document.activeElement as HTMLElement | null;
      setCloseConfirm({ tabId: t.id });
    } else {
      onCloseTab(t.id);
      setTabsMenuOpen(false);
    }
  };

  const cancelCloseConfirm = () => {
    setCloseConfirm(null);
    closeTriggerRef.current?.focus?.();
    closeTriggerRef.current = null;
  };

  const confirmClose = () => {
    const target = closeConfirm;
    setCloseConfirm(null);
    closeTriggerRef.current = null;
    if (!target) return;
    if (target.tabId === null) onClose();
    else onCloseTab(target.tabId);
  };

  const onFullscreenClick = () => {
    if (fullscreenSupported) {
      toggleFullscreen();
      return;
    }
    if (!getFullscreenHintSeen()) {
      setFullscreenHintSeen();
      setFullscreenHint(true);
      setTimeout(() => setFullscreenHint(false), 4000);
    }
  };

  // --- visualViewport keyboard avoidance (spec §12.3) ---
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setVvHeight(vv.height);
      requestAnimationFrame(() => {
        handleRef.current()?.fit();
        // Only re-pin to the bottom if the reader was already there before
        // the keyboard showed/hid — don't yank a scrolled-up reader down
        // just because the viewport resized.
        if (atBottomRef.current) handleRef.current()?.scrollToBottom();
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
        setFontSize(fontSizeRef.current);
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

  // Apply persisted font size + theme + font-family + cursor-blink to the
  // active terminal on mount/tab switch (xterm inits async, hence the small
  // delay; the Terminal also reads the saved font-family/theme itself at
  // construction — this is a belt-and-suspenders re-apply for that timing).
  useEffect(() => {
    const t = setTimeout(() => {
      handleRef.current()?.setFontSize(fontSizeRef.current);
      const theme = TERMINAL_THEMES.find((th) => th.id === themeId);
      if (theme) handleRef.current()?.setTheme(theme);
      handleRef.current()?.setFontFamily(fontFamily);
      handleRef.current()?.setCursorBlink(cursorBlink);
    }, 150);
    return () => clearTimeout(t);
  }, [activeTabId, themeId, fontFamily, cursorBlink]);

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
  // and focuses xterm's own input (spec §12.2 raw mode for TUIs). The
  // single-tap action is deferred behind a ~300ms timer so a following
  // second tap can cancel it and run the double-tap action instead.
  useEffect(() => () => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
  }, []);

  // Close the tabs/copy popovers on Escape too (backdrop click already
  // closes them). The search bar has its own input-focused Escape handler
  // (TerminalSearchBar's onKeyDown) for the common case; this covers Escape
  // firing while some other element has focus.
  useEffect(() => {
    // The close-confirm sheet and the settings drawer are each a modal on
    // top of everything else here — while either is open, its own Escape
    // handler owns Escape instead (this bail prevents e.g. one Escape
    // closing both the settings drawer AND the search bar/tabs menu when
    // they happen to be open at the same time).
    if (closeConfirm || drawerOpen || (!tabsMenuOpen && !copyMenuOpen && !searchOpen)) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setTabsMenuOpen(false);
      setCopyMenuOpen(false);
      if (searchOpen) closeSearch();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [tabsMenuOpen, copyMenuOpen, searchOpen, closeConfirm, drawerOpen]);

  // Close-confirm sheet: initial focus on open (mirrors the settings
  // drawer's lastFocusedRef pattern), Escape to cancel, and a small Tab
  // focus trap between the two buttons (only two focusable elements, so a
  // full querySelector-based trap like the drawer's is unnecessary).
  useEffect(() => {
    if (closeConfirm) closeCancelBtnRef.current?.focus();
  }, [closeConfirm]);

  useEffect(() => {
    if (!closeConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelCloseConfirm();
        return;
      }
      if (e.key !== 'Tab') return;
      const cancelEl = closeCancelBtnRef.current;
      const confirmEl = closeConfirmBtnRef.current;
      if (!cancelEl || !confirmEl) return;
      if (e.shiftKey) {
        if (document.activeElement === cancelEl) {
          e.preventDefault();
          confirmEl.focus();
        }
      } else {
        if (document.activeElement === confirmEl) {
          e.preventDefault();
          cancelEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeConfirm]);

  // A tab switch means a different Terminal instance (and thus a different
  // SearchAddon) is now active — the previous match count no longer applies.
  useEffect(() => {
    setSearchResult(null);
  }, [activeTabId]);

  // Announce connection-state transitions to screen readers (Task 9 a11y
  // fix #5). Only reconnecting/disconnected/exited are worth interrupting
  // for; `connected`/`connecting` are covered visually by the pill and
  // don't need an announcement. Fires only on a state CHANGE (the effect's
  // dep array already guarantees that), and is additionally skipped on the
  // very first run so nothing is blurted out on mount.
  useEffect(() => {
    if (!announcedOnceRef.current) {
      announcedOnceRef.current = true;
      return;
    }
    if (connectionState === 'reconnecting') setLiveMessage('Reconnecting…');
    else if (connectionState === 'disconnected') setLiveMessage('Disconnected');
    else if (connectionState === 'exited') setLiveMessage('Session ended');
  }, [connectionState]);

  // Move focus to the Restart button whenever the "session ended" overlay
  // becomes the only recovery action available.
  useEffect(() => {
    if (connectionState === 'exited' && onNewTab) {
      restartBtnRef.current?.focus();
    }
  }, [connectionState, onNewTab]);

  const onTermTap = () => {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      applyFont(DEFAULT_FONT);
      saveFontSize(DEFAULT_FONT);
      setFontSize(DEFAULT_FONT);
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      // Peek: tapping the terminal must not switch to raw mode or focus
      // xterm — the read-only banner is the only affordance to drive.
      if (readOnlyBanner) return;
      if (tabs.length > 0) {
        setInputMode('raw');
        handleRef.current()?.focusTerminal();
      }
    }, 300);
  };

  const switchMode = () => {
    const next: InputMode = inputMode === 'raw' ? 'composer' : 'raw';
    setInputMode(next);
    if (next === 'raw') getActiveHandle()?.focusTerminal();
  };

  return (
    <div
      className="devdash-mts"
      ref={shellRef}
      style={vvHeight ? { height: `${vvHeight}px` } : undefined}
    >
      {/* Visually-hidden live region announcing connection-state changes
          (Task 9 a11y fix #5) — Tailwind's .sr-only utility. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>
      {/* slim top bar */}
      <div className="devdash-mts-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <ConnectionPill
            state={connectionState}
            title={title}
            onForceReconnect={() => getActiveHandle()?.forceReconnect()}
          />
          <button
            type="button"
            className="devdash-mts-tabsbtn"
            onClick={() => setTabsMenuOpen((o) => !o)}
            title="Switch terminal"
            aria-label="Switch terminal tab"
            aria-haspopup="menu"
            aria-expanded={tabsMenuOpen}
          >
            {tabs.length > 1 && <span className="devdash-mts-count">{tabs.length}</span>}
            <span className="devdash-mts-caret">&#9662;</span>
          </button>
        </div>
        <div className="devdash-mts-actions">
          {readOnlyBanner && (
            <button
              type="button"
              className="devdash-mts-iconbtn"
              onClick={onRequestDrive}
              title="Read-only — tap to take control"
              aria-label="Read-only — tap to take control"
            >
              <Lock size={16} />
            </button>
          )}
          <button
            type="button"
            className={`devdash-mts-iconbtn ${copyMenuOpen ? 'on' : ''}`}
            onClick={() => setCopyMenuOpen((o) => !o)}
            title="Copy"
            aria-label="Copy from terminal"
            aria-haspopup="menu"
            aria-expanded={copyMenuOpen}
          >
            <Copy size={16} />
          </button>
          <button
            type="button"
            className={`devdash-mts-iconbtn ${searchOpen ? 'on' : ''}`}
            onClick={() => (searchOpen ? closeSearch() : openSearch())}
            title="Search terminal buffer"
            aria-label="Search terminal buffer"
            aria-pressed={searchOpen}
          >
            <Search size={16} />
          </button>
          <button
            type="button"
            className={`devdash-mts-iconbtn ${wakeOn ? 'on' : ''}`}
            onClick={toggleWake}
            title="Keep screen awake"
            aria-label="Keep screen awake"
            aria-pressed={wakeOn}
          >
            &#9728;
          </button>
          {!readOnlyBanner && (
            <button
              type="button"
              className={`devdash-mts-iconbtn ${inputMode === 'raw' ? 'on' : ''}`}
              onClick={switchMode}
              title={inputMode === 'raw' ? 'Switch to composer input' : 'Switch to raw terminal input'}
              aria-label="Toggle input mode"
              aria-pressed={inputMode === 'raw'}
            >
              {inputMode === 'raw' ? 'RAW' : 'ABC'}
            </button>
          )}
          <button
            type="button"
            className={`devdash-mts-iconbtn ${isFullscreen ? 'on' : ''}`}
            onClick={onFullscreenClick}
            title={fullscreenSupported ? 'Toggle fullscreen' : 'Add to Home Screen for fullscreen'}
            aria-label="Toggle fullscreen"
            aria-pressed={isFullscreen}
          >
            &#9974;
          </button>
          <button
            type="button"
            className="devdash-mts-iconbtn"
            onClick={openDrawer}
            title="Terminal settings"
            aria-label="Terminal settings"
          >
            &#9881;
          </button>
          <button
            type="button"
            className="devdash-mts-iconbtn"
            onClick={requestClose}
            title="Close terminal"
            aria-label="Close terminal"
          >
            &#10005;
          </button>
        </div>
      </div>
      {searchOpen && (
        <TerminalSearchBar
          onSearch={runSearch}
          onNext={searchNext}
          onPrev={searchPrev}
          onClose={closeSearch}
          result={searchResult}
        />
      )}
      {fullscreenHint && (
        <div className="devdash-mts-fshint">
          Fullscreen isn&apos;t supported in this browser — add Dialout to your Home Screen instead.
        </div>
      )}

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
                  onClick={(e) => { e.stopPropagation(); requestCloseTab(t); }}
                >
                  &times;
                </button>
              </div>
            ))}
            {onNewTab && (
              <div
                className="devdash-mts-menu-item new"
                onClick={() => { onNewTab(); setTabsMenuOpen(false); }}
              >
                + New shell
              </div>
            )}
          </div>
        </>
      )}

      {/* copy menu */}
      {copyMenuOpen && (
        <>
          <div className="devdash-mts-menu-backdrop" onClick={() => setCopyMenuOpen(false)} />
          <div className="devdash-mts-copymenu">
            <button type="button" className="devdash-mts-copymenu-item" onClick={copyLastOutput}>
              Copy last output
            </button>
            <button type="button" className="devdash-mts-copymenu-item" onClick={copyLastCommand}>
              Copy last command
            </button>
            <button type="button" className="devdash-mts-copymenu-item" onClick={copyScreen}>
              Copy screen
            </button>
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
        {(connectionState === 'reconnecting' || connectionState === 'disconnected') && (
          <div className="devdash-mts-reconnect">
            {connectionState === 'disconnected' ? 'offline — retrying…' : 'reconnecting…'}
          </div>
        )}
        {/* Session ended (shell exited, or a reattach found the PTY gone after
            the server grace period). Land in the existing 'exited' state and
            offer an explicit Restart — never silently spawn a fresh shell into
            the old view. Restart reuses the existing new-session path. */}
        {connectionState === 'exited' && onNewTab && (
          <div className="devdash-mts-exited" onClick={(e) => e.stopPropagation()}>
            <span className="devdash-mts-exited-label">session ended</span>
            <button
              type="button"
              className="devdash-mts-restart"
              ref={restartBtnRef}
              onClick={() => onNewTab()}
            >
              Restart
            </button>
          </div>
        )}
        {!atBottom && tabs.length > 0 && (
          <button
            type="button"
            className="devdash-mts-jumpbottom"
            onClick={() => getActiveHandle()?.scrollToBottom()}
            aria-label="Jump to latest output"
          >
            <span aria-hidden="true">&#8595;</span> Jump to latest
          </button>
        )}
      </div>

      {/* input area */}
      {readOnlyBanner ? (
        <button type="button" className="devdash-mts-peekbar" onClick={onRequestDrive}>
          <span className="devdash-mts-peekdot" /> Peek &mdash; read-only &middot; tap to Drive
        </button>
      ) : (
        <>
          <KeyChipBar
            onSend={sendRaw}
            ctrlState={ctrlState}
            onCtrlStateChange={setCtrlState}
            enabledKeys={enabledKeys}
            haptics={haptics}
          />
          {inputMode === 'composer' && (
            <TerminalComposer
              onSendLine={sendLine}
              onSendRaw={sendRaw}
              ctrlState={ctrlState}
              onCtrlStateChange={setCtrlState}
            />
          )}
        </>
      )}

      <TerminalSettingsDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        fontSize={fontSize}
        onFontSize={onDrawerFontSize}
        themeId={themeId}
        onThemeId={applyTheme}
        fontFamily={fontFamily}
        onFontFamily={applyFontFamily}
        enabledKeys={enabledKeys}
        onToggleKey={onToggleKey}
        fullscreenSupported={fullscreenSupported}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onFullscreenClick}
        wakeOn={wakeOn}
        onToggleWake={toggleWake}
        cursorBlink={cursorBlink}
        onToggleCursorBlink={onToggleCursorBlink}
        haptics={haptics}
        onToggleHaptics={onToggleHaptics}
      />

      {/* Close-confirm sheet — only shown for a live session (see
          requestClose/requestCloseTab); exited/non-connected sessions close
          immediately with no prompt. */}
      {closeConfirm && (
        <div
          className="devdash-mts-confirm-root"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="devdash-mts-confirm-title"
        >
          <div className="devdash-mts-confirm-backdrop" onClick={cancelCloseConfirm} />
          <div className="devdash-mts-confirm-sheet">
            <div className="devdash-mts-confirm-handle" />
            <p id="devdash-mts-confirm-title" className="devdash-mts-confirm-title">
              Close this session?
            </p>
            <div className="devdash-mts-confirm-actions">
              <button
                type="button"
                className="devdash-mts-confirm-btn cancel"
                ref={closeCancelBtnRef}
                onClick={cancelCloseConfirm}
              >
                Cancel
              </button>
              <button
                type="button"
                className="devdash-mts-confirm-btn danger"
                ref={closeConfirmBtnRef}
                onClick={confirmClose}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
