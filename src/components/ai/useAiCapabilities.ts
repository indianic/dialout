'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiCapabilities } from './capability-types';

export type CapabilityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; caps: AiCapabilities }
  | { status: 'unavailable' }        // offline, or an agent that predates 2.7.2
  | { status: 'error' };

// Discovery walks several directories on the developer's machine. Nobody
// should pay for that just by reading a chat, so this fetches on first open
// and then serves from memory for the life of the page.
export function useAiCapabilities(machineId: number, tmuxName: string) {
  const [state, setState] = useState<CapabilityState>({ status: 'idle' });
  const inflight = useRef(false);

  // A different session must not serve the previous one's commands.
  useEffect(() => {
    setState({ status: 'idle' });
    inflight.current = false;
  }, [machineId, tmuxName]);

  const load = useCallback(async (force = false) => {
    if (inflight.current) return;
    if (!force && state.status !== 'idle') return;
    inflight.current = true;
    setState({ status: 'loading' });
    try {
      const res = await fetch(
        `/api/ai-sessions/${machineId}/${encodeURIComponent(tmuxName)}/capabilities`
      );
      if (!res.ok) { setState({ status: 'error' }); return; }
      const caps: AiCapabilities = await res.json();
      setState(caps.unavailable ? { status: 'unavailable' } : { status: 'ready', caps });
    } catch {
      setState({ status: 'error' });
    } finally {
      inflight.current = false;
    }
  }, [machineId, tmuxName, state.status]);

  return { state, load, refresh: () => load(true) };
}
