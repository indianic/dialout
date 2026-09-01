// Per-device AI chat preferences. Every read and write is guarded, because
// blocked storage must degrade to the default rather than break the composer.
//
// Storage is injected so this stays free of both `window` assumptions in the
// function signatures and of any React Native / Next import. The web default
// uses localStorage; a native client passes SecureStore.

export const FUNCTION_KEYS_PREF = 'devdash-ai-function-keys';

export interface PrefStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): PrefStore | null {
  const w = (globalThis as { window?: { localStorage?: PrefStore } }).window;
  if (!w?.localStorage) return null;
  try {
    return w.localStorage;
  } catch {
    return null;
  }
}

export function getFunctionKeysVisible(store: PrefStore | null = browserStore()): boolean {
  if (!store) return false;
  try {
    return store.getItem(FUNCTION_KEYS_PREF) === '1';
  } catch {
    return false;
  }
}

export function setFunctionKeysVisible(on: boolean, store: PrefStore | null = browserStore()): void {
  if (!store) return;
  try {
    store.setItem(FUNCTION_KEYS_PREF, on ? '1' : '0');
  } catch { /* blocked storage: keep the in-memory default */ }
}
