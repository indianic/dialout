'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import AiChat from '@/components/ai/AiChat';
import type { AiEvent } from '@/components/ai/ai-events';
import AiComposer from '@/components/ai/AiComposer';
import AiStatusDot from '@/components/ai/AiStatusDot';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { useDashboardSocket } from '@/hooks/useDashboardSocket';

const PENDING_TIMEOUT_MS = 10_000;

export default function AiSessionPage() {
  const params = useParams();
  const router = useRouter();
  const { session } = useDashboard();

  const machineId = parseInt(String(params?.machineId), 10);
  const tmuxName = decodeURIComponent(String(params?.tmuxName));

  const [events, setEvents] = useState<AiEvent[]>([]);
  const [status, setStatus] = useState('idle');

  // A sent message only appears once it round-trips through the transcript
  // tail, which leaves the chat looking frozen for a second or more. Echo it
  // locally and reconcile when the real event arrives.
  const [pending, setPending] = useState<string | null>(null);
  const [pendingFailed, setPendingFailed] = useState(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const command = useCallback(
    async (action: 'open' | 'close' | 'input', text?: string) => {
      await fetch(`/api/ai-sessions/${machineId}/${encodeURIComponent(tmuxName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text }),
      });
    },
    [machineId, tmuxName]
  );

  // Open on mount, close on unmount — the agent stops tailing when nobody is
  // watching, so an abandoned tab does not keep a file poll alive forever.
  useEffect(() => {
    void command('open');
    return () => { void command('close'); };
  }, [command]);

  const clearPending = useCallback(() => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
    setPending(null);
    setPendingFailed(false);
  }, []);

  const send = useCallback((text: string) => {
    setPending(text);
    setPendingFailed(false);
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    // Ten seconds, then say so. A ghost bubble that never resolves is worse
    // than an honest failure.
    pendingTimer.current = setTimeout(() => setPendingFailed(true), PENDING_TIMEOUT_MS);
    void command('input', text);
  }, [command]);

  useEffect(() => () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
  }, []);

  const onAiEvents = useCallback(
    (eventMachineId: number, eventTmux: string, incoming: any[], nextStatus: string) => {
      if (eventMachineId !== machineId || eventTmux !== tmuxName) return;
      setEvents((prev) => [...prev, ...incoming]);
      setStatus(nextStatus);
      // The echoed user message is the acknowledgement. A user cannot send two
      // messages inside the window without the first having already echoed, so
      // matching on "any user message arrived" is enough.
      if (incoming.some((e) => e.kind === 'message' && e.role === 'user')) clearPending();
    },
    [machineId, tmuxName, clearPending]
  );

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL
    || (typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
      : '');

  useDashboardSocket({
    userId: session?.userId || 0,
    machineId: session?.machineId || 0,
    wsUrl,
    onAiEvents,
  });

  return (
    // Fills the shell's full-bleed main rather than claiming the viewport:
    // this page sits inside the (dash) layout, under a Topbar, so 100dvh here
    // overflowed by exactly the header's height.
    <div style={{
      display: 'flex', flexDirection: 'column',
      flex: 1, minHeight: 0, overflow: 'hidden',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderBottom: '1px solid var(--b1)',
      }}>
        <button className="btn-icon" onClick={() => router.push('/ai')} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <span style={{
          flex: 1, minWidth: 0, color: 'var(--txt)', fontSize: 14.5,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{tmuxName}</span>
        <AiStatusDot status={status} />
      </header>

      <AiChat events={events} pendingText={pending} pendingFailed={pendingFailed} />

      <AiComposer
        attachedElsewhere={false}
        machineId={machineId}
        tmuxName={tmuxName}
        onSend={send}
        // Keystrokes go straight through: no pending bubble, nothing to
        // reconcile, and nothing that would time out as "not delivered".
        onSendKeys={(data) => void command('input', data)}
      />
    </div>
  );
}
