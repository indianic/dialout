'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Terminal from './Terminal';
import type { TerminalHandle, TermConnectionState, TerminalSearchResult } from './Terminal';
import MobileTerminalShell from './MobileTerminalShell';
import ConnectionPill from './ConnectionPill';
import TerminalSettingsDrawer from './TerminalSettingsDrawer';
import TerminalSearchBar from './TerminalSearchBar';
import { useFullscreen } from './useFullscreen';
import {
  clampFont,
  getSavedFontSize,
  saveFontSize,
  getSavedThemeId,
  saveThemeId,
  getFontFamily,
  saveFontFamily,
  getCursorBlink,
  saveCursorBlink,
  getSavedKeys,
  saveKeys,
  getHaptics,
  saveHaptics,
} from './mobile-term-prefs';
import { TERMINAL_THEMES, getThemeById } from './terminal-themes';
import './terminal-panel.css';

interface TerminalTab {
  id: string;
  label: string;
  command: string;
  cwd: string;
  projectId?: number;
  exited: boolean;
  exitCode?: number;
  pane: number; // which pane this tab is assigned to (0-based)
}

interface QuickCommand {
  id: number;
  label: string;
  command: string;
  icon: string;
}

export type ViewMode = 'full' | 'docked' | 'card';
type SplitLayout = 'single' | 'vsplit' | 'hsplit' | 'quad' | 'main-side';

const PANE_COLORS = ['#58a6ff', '#7ee787', '#d2a8ff', '#ff7b72'];
const PANE_LABELS = ['1', '2', '3', '4'];

interface TerminalPanelProps {
  machineId: number;
  userId: number;
  wsUrl: string;
  projectName?: string;
  projectPath?: string;
  projectId?: number;
  commands?: QuickCommand[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onClose?: () => void;
  dockedHeight?: number;
  onDockedHeightChange?: (h: number) => void;
}

function genId(): string {
  return 'ses_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Persist open tabs per project so reopening the terminal reattaches to the
// still-running sessions.
//
// localStorage, NOT sessionStorage: sessionStorage is scoped to the browser
// tab and is wiped when it closes, so every session id was lost precisely when
// it mattered most — the user shut the tab, came back tomorrow, and got a
// fresh shell while yesterday's tmux session sat orphaned. Since a
// cowork-wrapped session now survives indefinitely (agent detaches instead of
// killing), the id is the only thing needed to land back in it, and it has to
// outlive the tab that created it.
//
// Stale ids are harmless: a session the agent no longer has is recreated under
// the same deterministic dd-<id> tmux name, and one whose tmux session is gone
// too just becomes a new shell.
function tabsStorageKey(projectId: number | undefined, machineId: number): string {
  return `devdash-tabs-${projectId ?? `m${machineId}`}`;
}

function loadSavedTabs(key: string): TerminalTab[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(key) ?? sessionStorage.getItem(key); // sessionStorage: one-time migration for tabs open when this shipped
    if (saved) return (JSON.parse(saved) as TerminalTab[]).filter((t) => !t.exited);
  } catch {}
  return [];
}

const DEFAULT_COMMANDS: QuickCommand[] = [
  { id: -1, label: 'Claude Code', command: 'claude', icon: 'C' },
  { id: -2, label: 'Codex', command: 'codex', icon: 'X' },
  { id: -3, label: 'npm dev', command: 'npm run dev', icon: 'N' },
  { id: -4, label: 'git status', command: 'git status', icon: 'G' },
  { id: -5, label: 'Shell', command: '', icon: '$' },
];

function getPaneCount(layout: SplitLayout): number {
  switch (layout) {
    case 'single': return 1;
    case 'vsplit': case 'hsplit': return 2;
    case 'main-side': return 3;
    case 'quad': return 4;
  }
}

// splitH = horizontal divider ratio (top/bottom), splitV = vertical divider ratio (left/right)
function getGridStyle(layout: SplitLayout, splitV: number, splitH: number): React.CSSProperties {
  const v1 = splitV;
  const v2 = 100 - splitV;
  const h1 = splitH;
  const h2 = 100 - splitH;
  switch (layout) {
    case 'single': return { gridTemplate: '1fr / 1fr' };
    case 'vsplit': return { gridTemplate: `1fr / ${v1}fr ${v2}fr` };
    case 'hsplit': return { gridTemplate: `${h1}fr ${h2}fr / 1fr` };
    case 'quad': return { gridTemplate: `${h1}fr ${h2}fr / ${v1}fr ${v2}fr` };
    case 'main-side': return { gridTemplate: `${h1}fr ${h2}fr / ${v1}fr ${v2}fr` };
  }
}

export default function TerminalPanel({
  machineId,
  userId,
  wsUrl,
  projectName,
  projectPath,
  projectId,
  commands = [],
  viewMode,
  onViewModeChange,
  onClose,
  dockedHeight = 320,
  onDockedHeightChange,
}: TerminalPanelProps) {
  const storageKey = tabsStorageKey(projectId, machineId);
  const [tabs, setTabs] = useState<TerminalTab[]>(() => loadSavedTabs(storageKey));
  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    const saved = loadSavedTabs(storageKey);
    return saved.length > 0 ? saved[saved.length - 1].id : null;
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(tabs)); } catch {}
  }, [tabs, storageKey]);
  const [customCmd, setCustomCmd] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);
  const [splitLayout, setSplitLayout] = useState<SplitLayout>('single');
  const [splitV, setSplitV] = useState(50); // vertical divider ratio (left %)
  const [splitH, setSplitH] = useState(50); // horizontal divider ratio (top %)

  // --- Shared desktop settings surface (Task 10) ---
  // One settings panel (reusing TerminalSettingsDrawer variant="panel")
  // replaces the old bespoke per-tab theme-picker overlay. Prefs are the same
  // global mobile-term-prefs source of truth the mobile shell uses, applied
  // live to every open tab's handle so split panes stay consistent.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeId, setThemeId] = useState<string>(() => getSavedThemeId());
  const [fontSize, setFontSize] = useState<number>(() => getSavedFontSize());
  const [fontFamily, setFontFamily] = useState<string>(() => getFontFamily());
  const [cursorBlink, setCursorBlink] = useState<boolean>(() => getCursorBlink());
  const [enabledKeys, setEnabledKeys] = useState<Record<string, boolean>>(() => getSavedKeys());
  const [haptics, setHaptics] = useState<boolean>(() => getHaptics());
  const [wakeOn, setWakeOn] = useState(false);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  // In-buffer search (SearchAddon) for the active tab, mirrors the mobile shell.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResult, setSearchResult] = useState<TerminalSearchResult | null>(null);

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
  // Per-tab follow-tail state (mirrors connStates above), fed by each
  // Terminal's onScrollChange and read for the active tab only (mobile
  // shell's "Jump to latest" pill + keyboard-resize gating).
  const [atBottomStates, setAtBottomStates] = useState<Map<string, boolean>>(new Map());
  const setTabAtBottom = useCallback((tabId: string, v: boolean) => {
    setAtBottomStates((prev) => {
      if (prev.get(tabId) === v) return prev;
      const next = new Map(prev);
      next.set(tabId, v);
      return next;
    });
  }, []);

  // Prune connection state for tabs that no longer exist (closed via closeTab
  // or handleExit's clean-exit path) so the map doesn't grow unbounded.
  useEffect(() => {
    setConnStates((prev) => {
      const validIds = new Set(tabs.map((t) => t.id));
      let allValid = true;
      for (const id of prev.keys()) {
        if (!validIds.has(id)) { allValid = false; break; }
      }
      if (allValid) return prev;
      const next = new Map<string, TermConnectionState>();
      for (const [id, state] of prev) {
        if (validIds.has(id)) next.set(id, state);
      }
      return next;
    });
  }, [tabs]);

  // Same pruning as connStates above, for atBottomStates.
  useEffect(() => {
    setAtBottomStates((prev) => {
      const validIds = new Set(tabs.map((t) => t.id));
      let allValid = true;
      for (const id of prev.keys()) {
        if (!validIds.has(id)) { allValid = false; break; }
      }
      if (allValid) return prev;
      const next = new Map<string, boolean>();
      for (const [id, v] of prev) {
        if (validIds.has(id)) next.set(id, v);
      }
      return next;
    });
  }, [tabs]);

  // Fullscreen (browser) — shared by the titlebar button and the settings
  // panel's Screen section. Targets the panel wrapper element.
  const panelRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, supported: fullscreenSupported, toggle: toggleFullscreen } = useFullscreen(panelRef);

  // Apply a mutation to every live terminal handle (keeps split-pane views
  // consistent when a global preference changes).
  const applyToAll = useCallback((fn: (h: TerminalHandle) => void) => {
    for (const h of termHandles.current.values()) if (h) fn(h);
  }, []);

  // --- Settings actions (global mobile-term-prefs source of truth) ---
  const applyFontSize = useCallback((px: number) => {
    const size = clampFont(px);
    setFontSize(size);
    saveFontSize(size);
    applyToAll((h) => h.setFontSize(size));
  }, [applyToAll]);

  const applyTheme = useCallback((id: string) => {
    setThemeId(id);
    saveThemeId(id);
    const theme = TERMINAL_THEMES.find((t) => t.id === id);
    if (theme) applyToAll((h) => h.setTheme(theme));
  }, [applyToAll]);

  const applyFontFamily = useCallback((css: string) => {
    setFontFamily(css);
    saveFontFamily(css);
    applyToAll((h) => h.setFontFamily(css));
  }, [applyToAll]);

  const applyCursorBlink = useCallback((v: boolean) => {
    setCursorBlink(v);
    saveCursorBlink(v);
    applyToAll((h) => h.setCursorBlink(v));
  }, [applyToAll]);

  const onToggleKey = useCallback((id: string, on: boolean) => {
    setEnabledKeys((prev) => {
      const next = { ...prev, [id]: on };
      saveKeys(next);
      return next;
    });
  }, []);

  const onToggleHaptics = useCallback((v: boolean) => {
    setHaptics(v);
    saveHaptics(v);
  }, []);

  // Screen wake lock (works on desktop Chromium; no-ops elsewhere). Mirrors
  // the mobile shell's toggle so the shared panel's "Keep screen awake" row
  // is functional rather than decorative.
  const toggleWake = useCallback(async () => {
    if (wakeOn) {
      try { await wakeRef.current?.release(); } catch {}
      wakeRef.current = null;
      setWakeOn(false);
      return;
    }
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void>; addEventListener?: (e: string, cb: () => void) => void }> } };
      const sentinel = await nav.wakeLock?.request('screen');
      if (sentinel) {
        wakeRef.current = sentinel;
        setWakeOn(true);
        sentinel.addEventListener?.('release', () => { wakeRef.current = null; setWakeOn(false); });
      }
    } catch {}
  }, [wakeOn]);
  useEffect(() => () => { try { wakeRef.current?.release(); } catch {} }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    settingsBtnRef.current?.focus();
  }, []);

  // --- In-buffer search wired to the active tab's handle ---
  const activeHandle = useCallback(
    () => (activeTabId ? termHandles.current.get(activeTabId) ?? null : null),
    [activeTabId]
  );
  const runSearch = useCallback((term: string) => {
    const h = activeHandle();
    h?.search(term);
    setSearchResult(h?.getSearchResults() ?? null);
  }, [activeHandle]);
  const searchNext = useCallback(() => {
    const h = activeHandle();
    h?.searchNext();
    setSearchResult(h?.getSearchResults() ?? null);
  }, [activeHandle]);
  const searchPrev = useCallback(() => {
    const h = activeHandle();
    h?.searchPrev();
    setSearchResult(h?.getSearchResults() ?? null);
  }, [activeHandle]);
  const closeSearch = useCallback(() => {
    activeHandle()?.clearSearch();
    setSearchResult(null);
    setSearchOpen(false);
  }, [activeHandle]);

  // A tab switch means a different SearchAddon is active — reset the count and
  // clear the leaving tab's highlight/selection so it doesn't linger.
  useEffect(() => {
    setSearchResult(null);
    return () => {
      if (activeTabId) termHandles.current.get(activeTabId)?.clearSearch();
    };
  }, [activeTabId]);

  // Re-apply the persisted prefs to every terminal handle shortly after a
  // tab set change (a newly opened tab's xterm inits async, so a small delay
  // mirrors the mobile shell's re-apply). Live pref edits already apply
  // instantly via the apply* handlers; this catches freshly mounted handles.
  useEffect(() => {
    const t = setTimeout(() => {
      const theme = TERMINAL_THEMES.find((th) => th.id === themeId);
      applyToAll((h) => {
        h.setFontSize(fontSize);
        if (theme) h.setTheme(theme);
        h.setFontFamily(fontFamily);
        h.setCursorBlink(cursorBlink);
      });
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, applyToAll]);

  // Drag-and-drop tab state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Resize handle state (docked panel height)
  const resizing = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartH = useRef(0);

  // Split pane divider drag state
  const gridRef = useRef<HTMLDivElement>(null);
  const splitDragging = useRef<'v' | 'h' | null>(null);

  // Responsive: detect narrow screens
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 640);
      setIsTablet(window.innerWidth < 1024);
    }
    check();
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const allCommands = [...commands, ...DEFAULT_COMMANDS.filter(
    (dc) => !commands.some((c) => c.command === dc.command)
  )];

  const paneCount = getPaneCount(splitLayout);

  const openTab = useCallback((command: string, label?: string, pane?: number) => {
    const id = genId();
    const targetPane = pane ?? 0;
    setTabs((prev) => [...prev, {
      id,
      label: label || command || 'zsh',
      command,
      cwd: projectPath || '~',
      projectId,
      exited: false,
      pane: targetPane,
    }]);
    setActiveTabId(id);
    setShowCustom(false);
    setCustomCmd('');
    if (viewMode === 'card') onViewModeChange('docked');
  }, [projectPath, projectId, viewMode, onViewModeChange]);

  const closeTab = useCallback((tabId: string) => {
    termHandles.current.get(tabId)?.closeSession();
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId && remaining.length > 0) {
        setActiveTabId(remaining[remaining.length - 1].id);
      } else if (remaining.length === 0) {
        setActiveTabId(null);
      }
      return remaining;
    });
  }, [activeTabId]);

  // Keep the latest onClose reachable from state updaters without re-creating callbacks
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const handleExit = useCallback((tabId: string, code: number) => {
    if (code === 0) {
      // Clean exit (`exit` / Ctrl+D) — close the tab like a local terminal;
      // when it was the last tab, close the whole panel too.
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== tabId);
        if (remaining.length === 0) {
          try { localStorage.removeItem(storageKey); sessionStorage.removeItem(storageKey); } catch {}
          setTimeout(() => onCloseRef.current?.(), 0);
        } else if (activeTabId === tabId) {
          setActiveTabId(remaining[remaining.length - 1].id);
        }
        return remaining;
      });
      return;
    }
    // Abnormal exit — keep the tab open so the error output stays readable
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, exited: true, exitCode: code } : t))
    );
  }, [activeTabId, storageKey]);

  const setTabPane = useCallback((tabId: string, pane: number) => {
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, pane } : t));
  }, []);

  const handleCustomSubmit = () => {
    if (customCmd.trim()) {
      openTab(customCmd.trim(), customCmd.trim().split(' ')[0]);
    }
  };

  // Keyboard — Escape minimizes a fullscreen panel, but yields to the
  // settings panel and the search bar (which own Escape while open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && viewMode === 'full' && !settingsOpen && !searchOpen) {
        onViewModeChange('card');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onViewModeChange, viewMode, settingsOpen, searchOpen]);

  // Drag-and-drop tab reorder
  function handleTabDragStart(e: React.DragEvent, idx: number) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }
  function handleTabDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  }
  function handleTabDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    setTabs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(null);
    setDragOverIdx(null);
  }
  function handleTabDragEnd() { setDragIdx(null); setDragOverIdx(null); }

  // Resize handle for docked mode
  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    resizing.current = true;
    resizeStartY.current = e.clientY;
    resizeStartH.current = dockedHeight;
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }
  function handleResizeMove(e: MouseEvent) {
    if (!resizing.current) return;
    const delta = resizeStartY.current - e.clientY;
    const newH = Math.min(Math.max(resizeStartH.current + delta, 180), window.innerHeight - 60);
    onDockedHeightChange?.(newH);
  }
  function handleResizeEnd() {
    resizing.current = false;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }

  // --- Split pane divider drag ---
  function handleSplitDragStart(axis: 'v' | 'h') {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      splitDragging.current = axis;
      document.addEventListener('mousemove', handleSplitDragMove);
      document.addEventListener('mouseup', handleSplitDragEnd);
      document.body.style.cursor = axis === 'v' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    };
  }
  function handleSplitDragMove(e: MouseEvent) {
    if (!splitDragging.current || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    if (splitDragging.current === 'v') {
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitV(Math.min(Math.max(pct, 20), 80));
    } else {
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setSplitH(Math.min(Math.max(pct, 20), 80));
    }
  }
  function handleSplitDragEnd() {
    splitDragging.current = null;
    document.removeEventListener('mousemove', handleSplitDragMove);
    document.removeEventListener('mouseup', handleSplitDragEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  // Constrain layout on small screens
  const effectiveLayout = isMobile
    ? (splitLayout === 'hsplit' ? 'hsplit' : 'single')
    : splitLayout;

  const hasTabs = tabs.length > 0;
  const runningCount = tabs.filter((t) => !t.exited).length;

  // Get active tab per pane (the last focused tab assigned to each pane)
  function getActiveTabForPane(pane: number): TerminalTab | undefined {
    const paneTabs = tabs.filter((t) => t.pane === pane);
    if (paneTabs.length === 0) return undefined;
    // If the globally active tab is in this pane, use it
    const active = paneTabs.find((t) => t.id === activeTabId);
    if (active) return active;
    // Otherwise use the last tab in this pane
    return paneTabs[paneTabs.length - 1];
  }

  // --- Split layout toolbar (between tabs and terminal area) ---
  const renderSplitBar = () => {
    const layouts: { id: SplitLayout; label: string; icon: React.ReactNode; minWidth?: number }[] = [
      { id: 'single', label: 'Single', icon: (
        <svg viewBox="0 0 16 12" width="16" height="12"><rect x="1" y="1" width="14" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>
      )},
      { id: 'vsplit', label: 'Left/Right', minWidth: 640, icon: (
        <svg viewBox="0 0 16 12" width="16" height="12"><rect x="1" y="1" width="14" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2"/><line x1="8" y1="1" x2="8" y2="11" stroke="currentColor" strokeWidth="1.2"/></svg>
      )},
      { id: 'hsplit', label: 'Top/Bottom', icon: (
        <svg viewBox="0 0 16 12" width="16" height="12"><rect x="1" y="1" width="14" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2"/><line x1="1" y1="6" x2="15" y2="6" stroke="currentColor" strokeWidth="1.2"/></svg>
      )},
      { id: 'quad', label: 'Quad', minWidth: 1024, icon: (
        <svg viewBox="0 0 16 12" width="16" height="12"><rect x="1" y="1" width="14" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2"/><line x1="8" y1="1" x2="8" y2="11" stroke="currentColor" strokeWidth="1.2"/><line x1="1" y1="6" x2="15" y2="6" stroke="currentColor" strokeWidth="1.2"/></svg>
      )},
      { id: 'main-side', label: 'Main+Side', minWidth: 1024, icon: (
        <svg viewBox="0 0 16 12" width="16" height="12"><rect x="1" y="1" width="14" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2"/><line x1="10" y1="1" x2="10" y2="11" stroke="currentColor" strokeWidth="1.2"/><line x1="10" y1="6" x2="15" y2="6" stroke="currentColor" strokeWidth="1.2"/></svg>
      )},
    ];

    const available = layouts.filter((l) => {
      if (isMobile && l.id !== 'single' && l.id !== 'hsplit') return false;
      if (isTablet && l.minWidth && l.minWidth > 1024) return false;
      return true;
    });

    return (
      <div className="devdash-split-bar">
        <span className="devdash-split-label">LAYOUT</span>
        {available.map((l) => (
          <button
            key={l.id}
            className={`devdash-split-btn ${effectiveLayout === l.id ? 'active' : ''}`}
            onClick={() => setSplitLayout(l.id)}
            title={l.label}
          >{l.icon}</button>
        ))}
        <span className="devdash-split-sep" />
        <span className="devdash-split-label">{getPaneCount(effectiveLayout)} PANE{getPaneCount(effectiveLayout) > 1 ? 'S' : ''}</span>
      </div>
    );
  };

  // --- Tab bar ---
  const renderTabs = () => (
    <div className="devdash-tabs">
      {tabs.map((tab, idx) => (
        <div
          key={tab.id}
          className={`devdash-tab ${activeTabId === tab.id ? 'active' : ''} ${dragOverIdx === idx ? 'devdash-tab-dragover' : ''}`}
          onClick={() => setActiveTabId(tab.id)}
          draggable
          onDragStart={(e) => handleTabDragStart(e, idx)}
          onDragOver={(e) => handleTabDragOver(e, idx)}
          onDrop={(e) => handleTabDrop(e, idx)}
          onDragEnd={handleTabDragEnd}
        >
          <span className={`devdash-tab-dot ${tab.exited ? 'exited' : 'running'}`} />
          <span className="devdash-tab-label">{tab.label}</span>
          {paneCount > 1 && (
            <span
              className="devdash-tab-pane-badge"
              style={{ background: `${PANE_COLORS[tab.pane]}22`, color: PANE_COLORS[tab.pane] }}
              onClick={(e) => {
                e.stopPropagation();
                setTabPane(tab.id, (tab.pane + 1) % paneCount);
              }}
              title={`Pane ${tab.pane + 1} — click to move`}
            >{PANE_LABELS[tab.pane]}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
            className="devdash-tab-close"
          >&times;</button>
        </div>
      ))}
      <button className="devdash-tab-new" onClick={() => openTab('', 'zsh')} title="New shell">+</button>
      <div className="devdash-tabbar-commands">
        {allCommands.map((cmd) => (
          <button
            key={cmd.id}
            onClick={() => openTab(cmd.command, cmd.label)}
            className="devdash-tabbar-cmd"
            title={cmd.command || 'Open shell'}
          >
            <span className="devdash-quickbtn-icon">{cmd.icon}</span>
            <span className="devdash-tabbar-cmd-label">{cmd.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  // --- Terminal split grid ---
  const renderTerminalGrid = () => {
    const epCount = getPaneCount(effectiveLayout);
    const panes: React.ReactNode[] = [];

    for (let p = 0; p < epCount; p++) {
      const paneTabs = tabs.filter((t) => t.pane === p);
      const activeInPane = getActiveTabForPane(p);

      panes.push(
        <div
          key={`pane-${p}`}
          className="devdash-split-pane"
          style={effectiveLayout === 'main-side' && p === 0 ? { gridRow: '1 / 3' } : undefined}
        >
          {/* Pane header */}
          {epCount > 1 && (
            <div className="devdash-pane-header" style={{ borderColor: `${PANE_COLORS[p]}33` }}>
              <span style={{ color: PANE_COLORS[p] }}>PANE {p + 1}</span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>
                {activeInPane ? activeInPane.label : 'empty'}
              </span>
            </div>
          )}
          <div className="devdash-terminal-area">
            {/* Render ALL tabs assigned to this pane, show only the active one */}
            {paneTabs.map((tab) => (
              <div
                key={tab.id}
                className="devdash-terminal-pane"
                style={{
                  visibility: activeInPane?.id === tab.id ? 'visible' : 'hidden',
                  zIndex: activeInPane?.id === tab.id ? 1 : 0,
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
                  visible={activeInPane?.id === tab.id && viewMode !== 'card'}
                  theme={getThemeById(themeId)}
                  fontSize={fontSize}
                  onExit={(code) => handleExit(tab.id, code)}
                  onConnectionChange={(s) => setTabConnState(tab.id, s)}
                />
              </div>
            ))}
            {paneTabs.length === 0 && (
              <div className="devdash-pane-empty" onClick={() => openTab('', 'zsh', p)}>
                <span style={{ color: PANE_COLORS[p] }}>+</span>
                <span>Open terminal in Pane {p + 1}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Also render tabs assigned to panes beyond current layout (keep alive but hidden)
    const hiddenTabs = tabs.filter((t) => t.pane >= epCount);

    // Determine which dividers to show
    const showVDivider = effectiveLayout === 'vsplit' || effectiveLayout === 'quad' || effectiveLayout === 'main-side';
    const showHDivider = effectiveLayout === 'hsplit' || effectiveLayout === 'quad' || effectiveLayout === 'main-side';

    return (
      <>
        <div className="devdash-split-wrapper" ref={gridRef}>
          <div className="devdash-split-grid" style={getGridStyle(effectiveLayout, splitV, splitH)}>
            {panes}
          </div>
          {/* Vertical divider (left/right) */}
          {showVDivider && (
            <div
              className="devdash-pane-divider-v"
              style={{ left: `${splitV}%` }}
              onMouseDown={handleSplitDragStart('v')}
              onDoubleClick={() => setSplitV(effectiveLayout === 'main-side' ? 65 : 50)}
              title="Drag to resize, double-click to reset"
            />
          )}
          {/* Horizontal divider (top/bottom) */}
          {showHDivider && (
            <div
              className="devdash-pane-divider-h"
              style={{ top: `${splitH}%` }}
              onMouseDown={handleSplitDragStart('h')}
              onDoubleClick={() => setSplitH(50)}
              title="Drag to resize, double-click to reset"
            />
          )}
        </div>
        {hiddenTabs.length > 0 && (
          <div style={{ position: 'fixed', left: -9999, top: -9999, width: 1, height: 1, overflow: 'hidden' }}>
            {hiddenTabs.map((tab) => (
              <Terminal
                key={tab.id}
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
                visible={false}
                theme={getThemeById(themeId)}
                fontSize={fontSize}
                onExit={(code) => handleExit(tab.id, code)}
                onConnectionChange={(s) => setTabConnState(tab.id, s)}
              />
            ))}
          </div>
        )}
      </>
    );
  };

  // --- Empty state (no tabs, full mode) ---
  const renderEmptyState = () => (
    <div className="devdash-terminal-area">
      <div className="devdash-terminal-empty">
        <div className="devdash-terminal-logo">&#9654;</div>
        <div className="devdash-terminal-empty-title">Ready to launch</div>
        <div className="devdash-terminal-empty-subtitle">
          Pick a command from the tab bar or press + for a new shell
        </div>
        <div className="devdash-cmd-grid">
          {allCommands.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => openTab(cmd.command, cmd.label)}
              className="devdash-cmd-card"
            >
              <span className="devdash-cmd-card-icon">{cmd.icon}</span>
              <span className="devdash-cmd-card-label">{cmd.label}</span>
              <span className="devdash-cmd-card-cmd">{cmd.command || '/bin/zsh'}</span>
            </button>
          ))}
          {showCustom ? (
            <form
              className="devdash-cmd-card devdash-cmd-card-form"
              onSubmit={(e) => { e.preventDefault(); handleCustomSubmit(); }}
            >
              <input
                ref={customInputRef}
                value={customCmd}
                onChange={(e) => setCustomCmd(e.target.value)}
                placeholder="type command..."
                className="devdash-custom-input"
                autoFocus
                onBlur={() => { if (!customCmd) setShowCustom(false); }}
              />
              <button type="submit" className="devdash-custom-run" disabled={!customCmd.trim()}>Run</button>
            </form>
          ) : (
            <button
              className="devdash-cmd-card devdash-cmd-card-custom"
              onClick={() => { setShowCustom(true); setTimeout(() => customInputRef.current?.focus(), 50); }}
            >
              <span className="devdash-cmd-card-icon">+</span>
              <span className="devdash-cmd-card-label">Custom</span>
              <span className="devdash-cmd-card-cmd">run any command</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // --- Title bar ---
  const renderTitleBar = () => {
    const activeTab = activeTabId ? tabs.find((t) => t.id === activeTabId) : undefined;
    return (
    <div className="devdash-panel-titlebar">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-[6px]">
          <button
            onClick={() => {
              for (const h of termHandles.current.values()) h?.closeSession();
              try { localStorage.removeItem(storageKey); sessionStorage.removeItem(storageKey); } catch {}
              onClose?.();
            }}
            className="devdash-traffic-light devdash-traffic-close"
            title="Close terminal"
          />
          <button
            onClick={() => onViewModeChange(viewMode === 'full' ? 'docked' : viewMode === 'docked' ? 'card' : 'docked')}
            className="devdash-traffic-light devdash-traffic-minimize"
            title={viewMode === 'full' ? 'Dock to bottom' : viewMode === 'docked' ? 'Minimize to card' : 'Dock to bottom'}
          />
          <button
            onClick={() => onViewModeChange('full')}
            className="devdash-traffic-light devdash-traffic-maximize"
            title="Full screen"
          />
        </div>
        <span className="devdash-panel-title">
          {projectName || 'Terminal'}
          {projectPath && projectPath !== '~' && (
            <span className="devdash-panel-path">{projectPath}</span>
          )}
        </span>
        {runningCount > 0 && (
          <span className="devdash-running-badge">{runningCount} running</span>
        )}
        {activeTab && (
          <ConnectionPill
            state={connStates.get(activeTab.id) ?? 'connecting'}
            title={activeTab.label}
            onForceReconnect={() => termHandles.current.get(activeTab.id)?.forceReconnect()}
          />
        )}
      </div>
      <div className="flex items-center gap-1">
        {/* In-buffer search toggle */}
        {hasTabs && (
          <button
            className={`devdash-fullscreen-btn ${searchOpen ? 'active' : ''}`}
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            title="Search terminal buffer"
            aria-label="Search terminal buffer"
            aria-pressed={searchOpen}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="4.5" /><path d="M11 11l3 3" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {/* Terminal settings panel */}
        <button
          ref={settingsBtnRef}
          className={`devdash-fullscreen-btn ${settingsOpen ? 'active' : ''}`}
          onClick={openSettings}
          title="Terminal settings"
          aria-label="Terminal settings"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="8" cy="8" r="2.2" />
            <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" strokeLinecap="round" />
          </svg>
        </button>
        {/* Fullscreen browser toggle */}
        <button
          className={`devdash-fullscreen-btn ${isFullscreen ? 'active' : ''}`}
          onClick={toggleFullscreen}
          title="Toggle browser fullscreen"
          aria-label="Toggle browser fullscreen"
          aria-pressed={isFullscreen}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
          </svg>
        </button>
      </div>
    </div>
    );
  };

  // Card mode: hidden render
  if (viewMode === 'card') {
    return (
      <div style={{ position: 'fixed', left: -9999, top: -9999, width: 1, height: 1, overflow: 'hidden' }}>
        {tabs.map((tab) => (
          <Terminal
            key={tab.id}
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
            visible={false}
            theme={getThemeById(themeId)}
            fontSize={fontSize}
            onExit={(code) => handleExit(tab.id, code)}
            onConnectionChange={(s) => setTabConnState(tab.id, s)}
          />
        ))}
      </div>
    );
  }

  // --- Mobile: full-screen shell with composer + key chips (spec §12) ---
  if (isMobile || isTouch) {
    const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[tabs.length - 1];
    return (
      <MobileTerminalShell
        title={activeTab?.label || projectName || 'Terminal'}
        tabs={tabs.map((t) => ({ id: t.id, label: t.label, exited: t.exited }))}
        activeTabId={activeTab?.id ?? null}
        connectionState={activeTab ? connStates.get(activeTab.id) ?? 'connecting' : 'connecting'}
        atBottom={activeTab ? atBottomStates.get(activeTab.id) ?? true : true}
        getActiveHandle={() =>
          activeTab ? termHandles.current.get(activeTab.id) ?? null : null
        }
        onSelectTab={setActiveTabId}
        onNewTab={() => openTab('', 'zsh')}
        onCloseTab={closeTab}
        onClose={() => {
          for (const h of termHandles.current.values()) h?.closeSession();
          try { localStorage.removeItem(storageKey); sessionStorage.removeItem(storageKey); } catch {}
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
              theme={getThemeById(getSavedThemeId())}
              fontSize={getSavedFontSize()}
              onExit={(code) => handleExit(tab.id, code)}
              onConnectionChange={(s) => setTabConnState(tab.id, s)}
              onScrollChange={(v) => setTabAtBottom(tab.id, v)}
            />
          </div>
        ))}
      </MobileTerminalShell>
    );
  }

  // Full or docked
  return (
    // Fullscreen targets THIS outer wrapper (not the inner .devdash-panel) so
    // the settings drawer (variant="panel") and search bar — both descendants
    // of this wrapper — stay inside the fullscreened subtree and keep
    // rendering in the browser top layer. Targeting the inner panel would
    // orphan the drawer, which is a sibling after it.
    <div
      ref={panelRef}
      className={viewMode === 'full' ? 'devdash-fullscreen-overlay' : 'devdash-docked-wrapper'}
      style={viewMode === 'docked' ? { height: dockedHeight } : undefined}
    >
      {viewMode === 'docked' && (
        <div className="devdash-resize-handle" onMouseDown={handleResizeStart} />
      )}
      <div
        className={viewMode === 'full' ? 'devdash-panel' : 'devdash-panel devdash-panel-docked'}
      >
        {renderTitleBar()}
        {searchOpen && hasTabs && (
          <TerminalSearchBar
            onSearch={runSearch}
            onNext={searchNext}
            onPrev={searchPrev}
            onClose={closeSearch}
            result={searchResult}
          />
        )}
        {renderTabs()}
        {hasTabs && renderSplitBar()}
        {hasTabs ? renderTerminalGrid() : renderEmptyState()}
      </div>
      <TerminalSettingsDrawer
        variant="panel"
        open={settingsOpen}
        onClose={closeSettings}
        fontSize={fontSize}
        onFontSize={applyFontSize}
        themeId={themeId}
        onThemeId={applyTheme}
        fontFamily={fontFamily}
        onFontFamily={applyFontFamily}
        enabledKeys={enabledKeys}
        onToggleKey={onToggleKey}
        fullscreenSupported={fullscreenSupported}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        wakeOn={wakeOn}
        onToggleWake={toggleWake}
        cursorBlink={cursorBlink}
        onToggleCursorBlink={applyCursorBlink}
        haptics={haptics}
        onToggleHaptics={onToggleHaptics}
      />
    </div>
  );
}
