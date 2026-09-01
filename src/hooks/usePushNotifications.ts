'use client';

import { useCallback, useEffect, useState } from 'react';

// Subscribing a browser to "your agent is waiting for you" alerts.
//
// Three things must all be true before this can work, and they fail
// separately, so the hook reports which one is missing rather than a single
// unhelpful "unsupported":
//   1. the browser has Push and Service Worker APIs
//   2. the server has VAPID keys configured
//   3. the user has granted notification permission
//
// On iOS, (1) is only true once the PWA has been added to the home screen.
// In a Safari tab the APIs are simply absent, which is why the UI has to
// explain rather than just disable a switch.

export type PushState =
  | 'unsupported'
  | 'server-disabled'
  | 'denied'
  | 'off'
  | 'on'
  | 'working';

// The VAPID public key arrives base64url-encoded; the Push API wants bytes.
// Backed by an explicit ArrayBuffer because applicationServerKey requires one
// (a plain Uint8Array may be viewing a SharedArrayBuffer as far as types go).
function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buffer;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('working');

  const supported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supported) {
        if (!cancelled) setState('unsupported');
        return;
      }
      try {
        const res = await fetch('/api/push/subscribe');
        const data = await res.json();
        if (cancelled) return;
        if (!data.enabled) {
          setState('server-disabled');
          return;
        }
        if (Notification.permission === 'denied') {
          setState('denied');
          return;
        }
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = await reg?.pushManager.getSubscription();
        setState(existing ? 'on' : 'off');
      } catch {
        if (!cancelled) setState('server-disabled');
      }
    })();
    return () => { cancelled = true; };
  }, [supported]);

  const enable = useCallback(async () => {
    setState('working');
    try {
      const info = await (await fetch('/api/push/subscribe')).json();
      if (!info.enabled || !info.publicKey) { setState('server-disabled'); return; }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState('denied'); return; }

      const reg = await navigator.serviceWorker.register('/sw.js');
      // The registration is not usable for subscribing until it is active.
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(info.publicKey),
      });

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      setState('on');
    } catch {
      setState('off');
    }
  }, []);

  const disable = useCallback(async () => {
    setState('working');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
    } catch {
      setState('on');
    }
  }, []);

  return { state, enable, disable };
}
