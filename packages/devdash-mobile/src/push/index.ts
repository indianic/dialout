import { Platform } from 'react-native';
import { api } from '../api/client';

// Firebase credentials arrive later. Until then this is a no-op so the rest of
// the app ships: deep links still work, subscribe is skipped, and turning
// notifications on in Settings explains why nothing is delivered.

export async function registerPush(): Promise<{ ok: boolean; reason?: string }> {
  return { ok: false, reason: 'Firebase credentials are not configured yet. Push is disabled, not broken.' };
}

export async function subscribeNativeToken(token: string) {
  const platform = Platform.OS === 'ios' ? 'apns' : 'fcm';
  await api('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ platform, token }),
  });
}
