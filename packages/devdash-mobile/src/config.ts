import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra || {}) as {
  apiUrl?: string;
  wsUrl?: string;
  variant?: string;
};

export const APP_VARIANT = extra.variant === 'development' ? 'development' : 'live';

// Compiled in at build time. Both are empty in an open-source build that sets
// no EXPO_PUBLIC_* env, which is what makes the server screen appear.
export const BAKED_API_URL = process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || '';
export const BAKED_WS_URL = process.env.EXPO_PUBLIC_WS_URL || extra.wsUrl || '';

// Live values. useServer pushes into these on hydrate and on change, the same
// way the auth store pushes tokens through setAccessToken(). Consumers read
// through the getters at call time so a server change needs no reload.
let apiUrl = BAKED_API_URL;
let wsUrl = BAKED_WS_URL;

export function setServerUrls(next: { apiUrl: string; wsUrl: string }) {
  apiUrl = next.apiUrl;
  wsUrl = next.wsUrl;
}

export function getApiUrl(): string {
  return apiUrl;
}

export function getWsUrl(): string {
  return wsUrl;
}
