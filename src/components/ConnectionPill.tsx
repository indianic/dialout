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
      disabled={!interactive}
      aria-label={interactive ? `Connection ${LABEL[state]} — tap to reconnect` : `Connection ${LABEL[state]}`}
      title={title}
    >
      <span className="devdash-connpill-dot" />
      <span className="devdash-connpill-label">{LABEL[state]}</span>
      <span className="devdash-connpill-title">{title}</span>
    </button>
  );
}
