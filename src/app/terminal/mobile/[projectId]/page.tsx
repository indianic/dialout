'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import TerminalPanel from '@/components/TerminalPanel';
import type { SessionInfo } from '@/types';

// The mobile terminal is a PAGE, not an overlay.
//
// As an overlay it sat on top of a scrollable dashboard, which is what made it
// so hard to type into: the on-screen keyboard resizes the visual viewport, the
// page behind kept its own scroll position and rubber-banded under the finger,
// and the browser had no reason to collapse its own chrome because nothing had
// navigated. A real route fixes all three at once — the address bar collapses
// on scroll like any other page, there is nothing behind to scroll, and the
// hardware back button does what a back button should instead of exiting the
// dashboard entirely.
//
// Everything the panel needs is passed in the URL rather than looked up: this
// route is also reached for machine-level terminals, whose "project" is a
// synthetic record (id = -machineId) that exists nowhere in the database.
// Fetching by id would 404 for exactly the case people use most on a phone.
function MobileTerminalPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [failed, setFailed] = useState(false);

  const projectId = Number(params?.projectId);
  const machineId = Number(search.get('m'));
  const name = search.get('name') || 'Terminal';
  const path = search.get('path') || '~';

  // This route lives outside the (dash) group, so it has no DashboardProvider
  // above it and must establish identity itself.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/auth');
        if (!r.ok) throw new Error('not authenticated');
        const data = await r.json();
        if (!cancelled) setSession(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // A phone terminal wants every pixel and no page scroll underneath it.
  useEffect(() => {
    const { overflow, overscrollBehavior } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.overscrollBehavior = overscrollBehavior;
    };
  }, []);

  if (failed) {
    return (
      <div className="grid place-items-center px-6 text-center" style={{ minHeight: '100dvh' }}>
        <div>
          <p style={{ color: 'var(--txt)', fontSize: 15 }}>Your session has expired.</p>
          <button className="btn-grad mt-4" onClick={() => router.push('/projects')}>Sign in again</button>
        </div>
      </div>
    );
  }

  if (!session || !Number.isFinite(machineId) || machineId <= 0) {
    return (
      <div className="grid place-items-center" style={{ minHeight: '100dvh' }}>
        <span style={{ color: 'var(--dim)', fontSize: 13 }}>Connecting…</span>
      </div>
    );
  }

  const wsUrl =
    process.env.NEXT_PUBLIC_WS_URL ||
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

  return (
    <TerminalPanel
      machineId={machineId}
      userId={session.userId}
      wsUrl={wsUrl}
      projectName={name}
      projectPath={path}
      projectId={Number.isFinite(projectId) ? projectId : undefined}
      viewMode="full"
      onViewModeChange={() => { /* a page has one mode; the dock lives on desktop */ }}
      onClose={() => router.back()}
    />
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="grid place-items-center" style={{ minHeight: '100dvh' }}>
          <span style={{ color: 'var(--dim)', fontSize: 13 }}>Loading…</span>
        </div>
      }
    >
      <MobileTerminalPage />
    </Suspense>
  );
}
