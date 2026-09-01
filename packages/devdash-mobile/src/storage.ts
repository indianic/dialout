import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Native uses the Keychain / Keystore. The web stub of expo-secure-store is an
// empty object (`getValueWithKeyAsync` is missing), which is what a QR scan
// in the phone browser hits. Fall back to localStorage there — same as any
// other browser client — and never let a storage miss hang hydration.

const PREFIX = 'devdash:';

function webGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

function webSet(key: string, value: string) {
  try { globalThis.localStorage?.setItem(PREFIX + key, value); } catch { /* private mode */ }
}

function webDel(key: string) {
  try { globalThis.localStorage?.removeItem(PREFIX + key); } catch { /* private mode */ }
}

function nativeOk() {
  return Platform.OS !== 'web' && typeof SecureStore.getItemAsync === 'function';
}

export async function storageGet(key: string): Promise<string | null> {
  if (!nativeOk()) return webGet(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return webGet(key);
  }
}

export async function storageSet(key: string, value: string): Promise<void> {
  if (!nativeOk()) { webSet(key, value); return; }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    webSet(key, value);
  }
}

export async function storageDel(key: string): Promise<void> {
  if (!nativeOk()) { webDel(key); return; }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    webDel(key);
  }
}
