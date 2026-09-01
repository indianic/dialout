'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Eye, Play } from 'lucide-react';
import Terminal from '@/components/Terminal';
import type { TerminalHandle, TermConnectionState } from '@/components/Terminal';
import MobileTerminalShell from '@/components/MobileTerminalShell';
import ConnectionPill from '@/components/ConnectionPill';
import { getSavedFontSize } from '@/components/mobile-term-prefs';
import { renderTerminalName, factsFromSession, DEFAULT_TERMINAL_TEMPLATE } from '@/lib/terminal-name';
import '../../terminal-attach.css';

// Full-screen attach view for a live tmux session (spec §11 Peek/Drive).
// Deep-linkable: /terminal/{machineId}/{tmuxName}?mode=peek|drive&cols=&rows=
//
// useSearchParams() opts the nearest Suspense boundary into client-side
// rendering; unlike (dash)/* pages (whose layout already wraps children in
// <Suspense>), this route lives outside that group, so it needs its own
// boundary here to avoid Next's "missing-suspense-with-csr-bailout" build error.
export default function AttachPage() {
  return (
    <Suspense fallback={<div className="devdash-attach-center">Connecting&hellip;</div>}>
      <AttachPageInner />
    </Suspense>
  );
}

function AttachPageInner() {
  const params = useParams<{ machineId: string; name: string }>();
  const sp = useSearchParams();
  const router = useRouter();

  const machineId = Number(params.machineId);
  const tmuxName = decodeURIComponent(params.name);
  const sessionCols = Number(sp.get('cols')) || 80;
  const sessionRows = Number(sp.get('rows')) || 24;

  const [userId, setUserId] = useState<number | null>(null);
  const [machine, setMachine] = useState<{ name?: string; terminalNameTemplate?: string | null } | null>(null);
  const [authError, setAuthError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mode, setMode] = useState<'peek' | 'drive' | null>(null);
  const [connState, setConnState] = useState<TermConnectionState>('connecting');
  const [exited, setExited] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const handleRef = useRef<TerminalHandle | null>(null);
  // Fresh id per mode so switching Peek↔Drive cleanly respawns the attach client.
  const [nonce, setNonce] = useState(0);

  // Reactive mobile-layout detection (parity with TerminalPanel): re-evaluate
  // on resize/orientationchange so a desktop browser resized down to mobile
  // width switches to MobileTerminalShell live — not just at first mount.
  useEffect(() => {
    const check = () =>
      setIsMobile(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  useEffect(() => {
    const touch = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640;
    setMode((sp.get('mode') === 'drive' ? 'drive' : sp.get('mode') === 'peek' ? 'peek' : touch ? 'peek' : 'drive'));
    fetch('/api/auth')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s) => {
        setUserId(s.userId);
        const m = (s.machines || []).find((x: { id: number }) => x.id === machineId);
        setMachine(m || null);
      })
      .catch(() => setAuthError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName = renderTerminalName(
    machine?.terminalNameTemplate || DEFAULT_TERMINAL_TEMPLATE,
    factsFromSession({
      machineName: machine?.name || '', folder: null, folderPath: null, createdLocal: null,
      startedAt: null, gitBranch: null, termProgram: null, tmuxName,
    }),
    tmuxName
  );

  const wsUrl = useMemo(
    () =>
      typeof window === 'undefined'
        ? ''
        : process.env.NEXT_PUBLIC_WS_URL ||
          `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`,
    []
  );

  if (authError) {
    return (
      <div className="devdash-attach-center">
        Not signed in. <a href="/" style={{ color: 'var(--accent)', marginLeft: 6 }}>Go to Dialout</a>
      </div>
    );
  }
  if (userId == null || mode == null) {
    return <div className="devdash-attach-center">Connecting&hellip;</div>;
  }

  const peek = mode === 'peek';
  const sessionId = `att-${tmuxName}-${mode}-${nonce}`;
  const switchMode = (m: 'peek' | 'drive') => {
    if (m === mode) return;
    setMode(m);
    setNonce((n) => n + 1);
    setExited(false);
    setAtBottom(true);
  };

  const term = (
    <Terminal
      key={sessionId}
      sessionId={sessionId}
      wsUrl={wsUrl}
      machineId={machineId}
      userId={userId}
      tmuxSession={tmuxName}
      readOnly={peek}
      fixedSize={peek ? { cols: sessionCols, rows: sessionRows } : undefined}
      fontSize={isMobile ? getSavedFontSize() : undefined}
      onConnectionChange={setConnState}
      onScrollChange={setAtBottom}
      onExit={() => setExited(true)}
      ref={(h) => { handleRef.current = h; }}
    />
  );

  if (isMobile) {
    return (
      <MobileTerminalShell
        title={displayName}
        tabs={[{ id: sessionId, label: tmuxName, exited }]}
        activeTabId={sessionId}
        connectionState={exited ? 'exited' : connState}
        atBottom={atBottom}
        getActiveHandle={() => handleRef.current}
        onSelectTab={() => {}}
        onCloseTab={() => {
          handleRef.current?.closeSession();
          router.push('/terminals');
        }}
        onClose={() => {
          handleRef.current?.closeSession();
          router.push('/terminals');
        }}
        commands={[]}
        onOpenCommand={() => {}}
        readOnlyBanner={peek}
        onRequestDrive={() => switchMode('drive')}
      >
        <div className={`devdash-mts-pane ${peek ? 'peek' : ''}`}>{term}</div>
      </MobileTerminalShell>
    );
  }

  return (
    <div className="devdash-attach">
      <div className="devdash-attach-bar">
        <button className="devdash-attach-btn" onClick={() => { handleRef.current?.closeSession(); router.push('/terminals'); }} aria-label="Back">
          <ArrowLeft size={15} />
        </button>
        <ConnectionPill
          state={exited ? 'exited' : connState}
          title={displayName}
          onForceReconnect={() => handleRef.current?.forceReconnect()}
        />
        <div className="devdash-attach-actions">
          <button className={`devdash-attach-mode ${peek ? 'on' : ''}`} onClick={() => switchMode('peek')} title="Read-only" aria-pressed={peek}>
            <Eye size={13} /> Peek
          </button>
          <button className={`devdash-attach-mode ${!peek ? 'on' : ''}`} onClick={() => switchMode('drive')} title="Read-write" aria-pressed={!peek}>
            <Play size={13} /> Drive
          </button>
        </div>
      </div>
      <div className={`devdash-attach-term ${peek ? 'peek' : ''}`}>{term}</div>
    </div>
  );
}
