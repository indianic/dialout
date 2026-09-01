'use client';

import { Bell, BellOff } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

// Each failure mode gets its own sentence. "Notifications unavailable" tells
// someone nothing about what to do; "add DevDash to your home screen" does.
const COPY: Record<string, string> = {
  unsupported: 'Add Dialout to your home screen to get alerts',
  'server-disabled': 'Alerts are not configured on this server',
  denied: 'Notifications are blocked in your browser settings',
};

export default function PushToggle() {
  const { state, enable, disable } = usePushNotifications();

  if (state === 'working') return null;

  const explanation = COPY[state];
  if (explanation) {
    return (
      <span style={{ fontSize: 12, color: 'var(--dim)', display: 'inline-flex',
                     alignItems: 'center', gap: 6 }}>
        <BellOff size={14} /> {explanation}
      </span>
    );
  }

  const on = state === 'on';
  return (
    <button
      className="btn-ghost"
      onClick={() => void (on ? disable() : enable())}
      title={on ? 'Stop alerting me when an agent needs me' : 'Alert me when an agent needs me'}
    >
      {on ? <Bell size={16} /> : <BellOff size={16} />}
      {on ? 'Alerts on' : 'Alerts off'}
    </button>
  );
}
