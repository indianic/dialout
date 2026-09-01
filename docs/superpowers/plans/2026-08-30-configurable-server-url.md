# Configurable Server URL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a DevDash mobile install point at any DevDash server, chosen on first launch and changeable in Settings.

**Architecture:** `src/config.ts` stops exporting constants and holds module-level mutables behind `getApiUrl()` / `getWsUrl()`, written by `setServerUrls()`. A new `useServer` zustand store owns persistence and pushes into those mutables — the same shape as the auth store pushing tokens through `setAccessToken()`. A new `/server` route collects the URL; Settings routes back to it.

**Tech Stack:** Expo SDK 57, React Native 0.86, expo-router, zustand, expo-secure-store, vitest (added by Task 1).

**Spec:** `docs/superpowers/specs/2026-08-30-configurable-server-url-design.md`

## Global Constraints

- Work only inside `packages/devdash-mobile`. No web app or ws-server changes.
- Storage goes through `src/storage.ts` (`storageGet` / `storageSet` / `storageDel`). Never call `expo-secure-store` directly.
- Theme colors come from `useTheme()`. Available keys: `bg`, `bgSub`, `card`, `txt`, `muted`, `dim`, `b1`, `accent`, `accentWeak`, `cta`, `ctaFg`, `live`, `waiting`, `offline`, `termBg`, `termFg`. Use `t.offline` for error text.
- Border radius comes from `radius` in `src/ui/tokens.ts`.
- Never import `URL` or a URL polyfill. React Native's `URL` is partial; all parsing is regex-based.
- `npm run typecheck` must pass at the end of every task.
- Commit after every task. No `Co-Authored-By` and no `Claude-Session` trailer.

---

### Task 1: Pure URL helpers, with a test runner

**Files:**
- Create: `packages/devdash-mobile/src/server-url.ts`
- Create: `packages/devdash-mobile/src/server-url.test.ts`
- Modify: `packages/devdash-mobile/package.json` (add `vitest` devDependency and `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeApiUrl(input: string): string | null`, `deriveWsUrl(apiUrl: string): string`.

`devdash-mobile` has no test runner today. These two functions are pure and carry every edge case in the feature, so they get the first one.

- [ ] **Step 1: Add vitest**

```bash
cd packages/devdash-mobile
npm install -D vitest@^4.1.10
```

Matching the root package's `^4.1.10` keeps one vitest major across the repo.

Then add to `package.json` `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

No vitest config file is needed — `server-url.ts` imports nothing, so the default resolver handles it.

- [ ] **Step 2: Write the failing tests**

Create `packages/devdash-mobile/src/server-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveWsUrl, normalizeApiUrl } from './server-url';

describe('normalizeApiUrl', () => {
  it('adds https when no scheme is given', () => {
    expect(normalizeApiUrl('dash.example.com')).toBe('https://dash.example.com');
  });
  it('trims whitespace and a trailing slash', () => {
    expect(normalizeApiUrl('  https://dash.example.com/  ')).toBe('https://dash.example.com');
  });
  it('keeps an explicit http scheme and port', () => {
    expect(normalizeApiUrl('http://192.168.1.5:50051')).toBe('http://192.168.1.5:50051');
  });
  it('keeps a sub-path but drops its trailing slash', () => {
    expect(normalizeApiUrl('https://example.com/devdash/')).toBe('https://example.com/devdash');
  });
  it('lowercases the host', () => {
    expect(normalizeApiUrl('HTTPS://Dash.Example.COM')).toBe('https://dash.example.com');
  });
  it('rejects an empty string', () => {
    expect(normalizeApiUrl('   ')).toBeNull();
  });
  it('rejects a non-http scheme', () => {
    expect(normalizeApiUrl('ftp://example.com')).toBeNull();
  });
  it('rejects a host containing whitespace', () => {
    expect(normalizeApiUrl('not a url')).toBeNull();
  });
});

describe('deriveWsUrl', () => {
  it('maps https to wss and appends /ws', () => {
    expect(deriveWsUrl('https://dash.example.com')).toBe('wss://dash.example.com/ws');
  });
  it('maps http to ws and keeps the port', () => {
    expect(deriveWsUrl('http://192.168.1.5:50051')).toBe('ws://192.168.1.5:50051/ws');
  });
  it('preserves a sub-path', () => {
    expect(deriveWsUrl('https://example.com/devdash')).toBe('wss://example.com/devdash/ws');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/devdash-mobile && npm test`
Expected: FAIL — `Failed to resolve import "./server-url"`.

- [ ] **Step 4: Implement**

Create `packages/devdash-mobile/src/server-url.ts`:

```ts
// Regex, not URL. React Native's URL is a partial polyfill whose pathname and
// host behaviour differs from the web, and these strings decide whether the app
// can reach a server at all.
const PARTS = /^(https?):\/\/([^/?#]+)(\/[^?#]*)?/i;

export function normalizeApiUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  const m = PARTS.exec(hasScheme ? raw : `https://${raw}`);
  if (!m) return null;
  const host = m[2].toLowerCase();
  if (!host || host.startsWith(':') || /\s/.test(host)) return null;
  const path = (m[3] || '').replace(/\/+$/, '');
  return `${m[1].toLowerCase()}://${host}${path}`;
}

export function deriveWsUrl(apiUrl: string): string {
  const m = PARTS.exec(apiUrl);
  if (!m) return '';
  const scheme = m[1].toLowerCase() === 'http' ? 'ws' : 'wss';
  const path = (m[3] || '').replace(/\/+$/, '');
  return `${scheme}://${m[2].toLowerCase()}${path}/ws`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd packages/devdash-mobile && npm test`
Expected: PASS — 11 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/devdash-mobile/src/server-url.ts packages/devdash-mobile/src/server-url.test.ts packages/devdash-mobile/package.json
git commit -m "feat(mobile): pure helpers to normalize a server URL and derive its socket URL"
```

---

### Task 2: Make the URLs runtime-settable

**Files:**
- Modify: `packages/devdash-mobile/src/config.ts` (whole file)
- Modify: `packages/devdash-mobile/src/api/client.ts:1,36`
- Modify: `packages/devdash-mobile/src/ws/manager.ts:2,35`
- Modify: `packages/devdash-mobile/app/terminal/[id].tsx:11,46`
- Modify: `packages/devdash-mobile/app/(tabs)/settings.tsx:8,82`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `BAKED_API_URL: string`, `BAKED_WS_URL: string`, `APP_VARIANT: 'development' | 'live'`, `getApiUrl(): string`, `getWsUrl(): string`, `setServerUrls(next: { apiUrl: string; wsUrl: string }): void`.

All four consumers change in this task so `npm run typecheck` stays green. Settings keeps displaying the URL for now; Task 7 turns it into a control.

- [ ] **Step 1: Rewrite config.ts**

Replace the whole of `packages/devdash-mobile/src/config.ts`:

```ts
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
```

- [ ] **Step 2: Update the fetch client**

In `packages/devdash-mobile/src/api/client.ts`, change line 1:

```ts
import { getApiUrl } from '../config';
```

and line 36:

```ts
  const res = await fetch(`${getApiUrl()}${path}`, { ...init, headers });
```

- [ ] **Step 3: Update the dashboard socket**

In `packages/devdash-mobile/src/ws/manager.ts`, change line 2:

```ts
import { getWsUrl } from '../config';
```

and the `url()` method at line 34-36:

```ts
  private url() {
    return `${getWsUrl()}/dashboard?token=${encodeURIComponent(this.token)}`;
  }
```

- [ ] **Step 4: Update the terminal socket**

In `packages/devdash-mobile/app/terminal/[id].tsx`, change line 11:

```ts
import { getWsUrl } from '../../src/config';
```

and line 46:

```ts
    const ws = new WebSocket(`${getWsUrl()}/terminal?token=${encodeURIComponent(token)}&machineId=${mid}`);
```

- [ ] **Step 5: Update Settings' display**

In `packages/devdash-mobile/app/(tabs)/settings.tsx`, change line 8:

```ts
import { getApiUrl, APP_VARIANT } from '../../src/config';
```

and line 82:

```tsx
            <Text style={{ color: t.dim, fontSize: 12, marginTop: 3 }}>{getApiUrl()}</Text>
```

- [ ] **Step 6: Verify nothing still imports the old constants**

Run: `cd packages/devdash-mobile && grep -rn "API_URL\|WS_URL" src app | grep -v "BAKED_\|EXPO_PUBLIC_"`
Expected: no output.

Run: `cd packages/devdash-mobile && npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 7: Commit**

```bash
git add packages/devdash-mobile/src/config.ts packages/devdash-mobile/src/api/client.ts packages/devdash-mobile/src/ws/manager.ts "packages/devdash-mobile/app/terminal/[id].tsx" "packages/devdash-mobile/app/(tabs)/settings.tsx"
git commit -m "refactor(mobile): read the server URLs through getters instead of constants"
```

---

### Task 3: Probe a candidate server

**Files:**
- Create: `packages/devdash-mobile/src/api/probe.ts`
- Create: `packages/devdash-mobile/src/api/probe.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Verdict = 'ok' | 'not-devdash' | 'unreachable' | 'tls'`, `probeServer(apiUrl: string, timeoutMs?: number): Promise<Verdict>`, `verdictMessage(v: Verdict): string`.

Every DevDash route authenticates, so there is nothing anonymous to call. An unauthenticated `GET /api/projects` answering `401` with a JSON body is the signal. Verified against production on 2026-08-30: `401`, `content-type: application/json`, `{"error":"Not authenticated"}`.

- [ ] **Step 1: Write the failing tests**

Create `packages/devdash-mobile/src/api/probe.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeServer } from './probe';

function mockFetch(res: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue(res) as never;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('probeServer', () => {
  it('accepts a 401 carrying JSON', async () => {
    mockFetch({ status: 401, headers: new Headers({ 'content-type': 'application/json' }) });
    await expect(probeServer('https://x.test')).resolves.toBe('ok');
  });

  it('rejects a 401 that is not JSON', async () => {
    mockFetch({ status: 401, headers: new Headers({ 'content-type': 'text/html' }) });
    await expect(probeServer('https://x.test')).resolves.toBe('not-devdash');
  });

  it('rejects a 200', async () => {
    mockFetch({ status: 200, headers: new Headers({ 'content-type': 'text/html' }) });
    await expect(probeServer('https://x.test')).resolves.toBe('not-devdash');
  });

  it('rejects a 404', async () => {
    mockFetch({ status: 404, headers: new Headers({ 'content-type': 'application/json' }) });
    await expect(probeServer('https://x.test')).resolves.toBe('not-devdash');
  });

  it('reports an unreachable host', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Network request failed')) as never;
    await expect(probeServer('https://x.test')).resolves.toBe('unreachable');
  });

  it('separates a certificate failure from a network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('The certificate for this server is invalid')) as never;
    await expect(probeServer('https://x.test')).resolves.toBe('tls');
  });

  it('calls /api/projects on the given origin', async () => {
    const spy = vi.fn().mockResolvedValue({ status: 401, headers: new Headers({ 'content-type': 'application/json' }) });
    globalThis.fetch = spy as never;
    await probeServer('https://x.test');
    expect(spy.mock.calls[0][0]).toBe('https://x.test/api/projects');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/devdash-mobile && npm test`
Expected: FAIL — `Failed to resolve import "./probe"`.

- [ ] **Step 3: Implement**

Create `packages/devdash-mobile/src/api/probe.ts`:

```ts
export type Verdict = 'ok' | 'not-devdash' | 'unreachable' | 'tls';

export function verdictMessage(v: Verdict): string {
  switch (v) {
    case 'not-devdash': return 'That address answered, but it is not a DevDash server.';
    case 'unreachable': return 'Could not reach that address. Check the URL and your network.';
    case 'tls': return "The server's certificate was rejected.";
    case 'ok': return '';
  }
}

// Every DevDash route calls getSession(), so there is no anonymous endpoint to
// ask "are you DevDash?". An unauthenticated GET answering 401 with a JSON body
// is the proof: it means something is listening, it speaks the API, and it
// enforces auth. Anything else is a different server or a wrong address.
export async function probeServer(apiUrl: string, timeoutMs = 8000): Promise<Verdict> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}/api/projects`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-DevDash-Client': 'native' },
      signal: ctl.signal,
    });
    if (res.status !== 401) return 'not-devdash';
    const type = res.headers.get('content-type') || '';
    return type.includes('application/json') ? 'ok' : 'not-devdash';
  } catch (e) {
    // React Native reports a rejected certificate through the same TypeError as
    // a DNS failure. The message is the only thing that separates them, so a
    // missed keyword degrades to 'unreachable' rather than lying.
    const msg = String((e as Error)?.message || '').toLowerCase();
    if (msg.includes('certificate') || msg.includes('ssl') || msg.includes('trust anchor')) return 'tls';
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/devdash-mobile && npm test`
Expected: PASS — 18 tests total across both files.

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-mobile/src/api/probe.ts packages/devdash-mobile/src/api/probe.test.ts
git commit -m "feat(mobile): probe a candidate server by its authenticated 401"
```

---

### Task 4: The server store

**Files:**
- Create: `packages/devdash-mobile/src/store/server.ts`
- Modify: `packages/devdash-mobile/src/store/auth.ts:6` (export `TOKEN_KEY`)

**Interfaces:**
- Consumes: `deriveWsUrl` (Task 1); `BAKED_API_URL`, `BAKED_WS_URL`, `setServerUrls` (Task 2).
- Produces: `useServer` with `{ ready: boolean; apiUrl: string; wsUrl: string; configured: boolean; hydrate(): Promise<void>; setServer(apiUrl: string, wsUrl: string): Promise<void>; clearServer(): Promise<void> }`.

- [ ] **Step 1: Export the token key from the auth store**

`src/store/auth.ts:6` currently reads `const TOKEN_KEY = 'devdash-token';`. Change it to:

```ts
export const TOKEN_KEY = 'devdash-token';
```

The server store needs to know whether a session already exists, and a second copy of that string would drift.

- [ ] **Step 2: Write the store**

Create `packages/devdash-mobile/src/store/server.ts`:

```ts
import { create } from 'zustand';
import { storageDel, storageGet, storageSet } from '../storage';
import { BAKED_API_URL, BAKED_WS_URL, setServerUrls } from '../config';
import { deriveWsUrl } from '../server-url';
import { TOKEN_KEY } from './auth';

const API_KEY = 'devdash-api-url';
const WS_KEY = 'devdash-ws-url';

interface ServerState {
  ready: boolean;
  apiUrl: string;
  wsUrl: string;
  configured: boolean;
  hydrate: () => Promise<void>;
  setServer: (apiUrl: string, wsUrl: string) => Promise<void>;
  clearServer: () => Promise<void>;
}

export const useServer = create<ServerState>((set) => ({
  ready: false,
  apiUrl: BAKED_API_URL,
  wsUrl: BAKED_WS_URL,
  configured: false,

  hydrate: async () => {
    try {
      const [storedApi, storedWs, token] = await Promise.all([
        storageGet(API_KEY),
        storageGet(WS_KEY),
        storageGet(TOKEN_KEY),
      ]);

      if (storedApi) {
        const ws = storedWs || deriveWsUrl(storedApi);
        setServerUrls({ apiUrl: storedApi, wsUrl: ws });
        set({ ready: true, apiUrl: storedApi, wsUrl: ws, configured: true });
        return;
      }

      // Upgrade path. Someone already signed in against the baked server must
      // not be dumped on a setup screen by an update they did not ask for.
      if (token && BAKED_API_URL) {
        const ws = BAKED_WS_URL || deriveWsUrl(BAKED_API_URL);
        await storageSet(API_KEY, BAKED_API_URL);
        await storageSet(WS_KEY, ws);
        setServerUrls({ apiUrl: BAKED_API_URL, wsUrl: ws });
        set({ ready: true, apiUrl: BAKED_API_URL, wsUrl: ws, configured: true });
        return;
      }

      set({ ready: true, configured: false });
    } catch {
      // Same contract as usePrefs: always reach ready, so a keychain fault
      // cannot hang the splash screen forever.
      set({ ready: true, configured: false });
    }
  },

  setServer: async (apiUrl, wsUrl) => {
    await storageSet(API_KEY, apiUrl);
    await storageSet(WS_KEY, wsUrl);
    setServerUrls({ apiUrl, wsUrl });
    set({ apiUrl, wsUrl, configured: true });
  },

  clearServer: async () => {
    await storageDel(API_KEY);
    await storageDel(WS_KEY);
    setServerUrls({ apiUrl: BAKED_API_URL, wsUrl: BAKED_WS_URL });
    set({ apiUrl: BAKED_API_URL, wsUrl: BAKED_WS_URL, configured: false });
  },
}));
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/devdash-mobile && npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add packages/devdash-mobile/src/store/server.ts packages/devdash-mobile/src/store/auth.ts
git commit -m "feat(mobile): persist the chosen server, adopting the baked URL on upgrade"
```

---

### Task 5: The server screen

**Files:**
- Create: `packages/devdash-mobile/app/server.tsx`

**Interfaces:**
- Consumes: `normalizeApiUrl`, `deriveWsUrl` (Task 1); `BAKED_API_URL` (Task 2); `probeServer`, `verdictMessage` (Task 3); `useServer` (Task 4).
- Produces: the `/server` route.

- [ ] **Step 1: Write the screen**

Create `packages/devdash-mobile/app/server.tsx`:

```tsx
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { probeServer, verdictMessage } from '../src/api/probe';
import { deriveWsUrl, normalizeApiUrl } from '../src/server-url';
import { useServer } from '../src/store/server';
import { BAKED_API_URL } from '../src/config';
import { useTheme } from '../src/ui/Theme';
import { radius } from '../src/ui/tokens';

export default function ServerScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const storedApi = useServer((s) => s.apiUrl);
  const configured = useServer((s) => s.configured);
  const setServer = useServer((s) => s.setServer);

  const [input, setInput] = useState(configured ? storedApi : BAKED_API_URL);
  const [advanced, setAdvanced] = useState(false);
  const [wsOverride, setWsOverride] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const normalized = normalizeApiUrl(input);
  const derivedWs = normalized ? deriveWsUrl(normalized) : '';
  const effectiveWs = wsOverride.trim() || derivedWs;

  const submit = async () => {
    if (busy) return;
    setError('');
    if (!normalized) {
      setError('That does not look like a web address.');
      return;
    }
    setBusy(true);
    try {
      const verdict = await probeServer(normalized);
      if (verdict !== 'ok') {
        setError(verdictMessage(verdict));
        return;
      }
      await setServer(normalized, effectiveWs);
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  const field = {
    backgroundColor: t.card, color: t.txt, fontSize: 17, padding: 16,
    borderRadius: radius.md, borderWidth: 1, borderColor: t.b1,
  } as const;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: t.bg }}
    >
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: t.txt, fontSize: 28, fontWeight: '700' }}>Connect to your server</Text>
        <Text style={{ color: t.muted, fontSize: 15, marginTop: 8, lineHeight: 21 }}>
          DevDash is self-hosted. Enter the address of the server you run.
        </Text>

        <Text style={{ color: t.dim, fontSize: 12, fontWeight: '600', marginTop: 28, marginBottom: 8 }}>
          SERVER URL
        </Text>
        <TextInput
          value={input}
          onChangeText={(v) => { setInput(v); setError(''); }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
          placeholder="dash.example.com"
          placeholderTextColor={t.dim}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          style={field}
        />

        {!!derivedWs && !advanced && (
          <Text style={{ color: t.dim, fontSize: 12, marginTop: 8 }}>Sockets: {effectiveWs}</Text>
        )}

        <Pressable onPress={() => setAdvanced((v) => !v)} style={{ marginTop: 16 }}>
          <Text style={{ color: t.accent, fontSize: 13, fontWeight: '600' }}>
            {advanced ? '▾ Advanced' : '▸ Advanced'}
          </Text>
        </Pressable>

        {advanced && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: t.dim, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
              WEBSOCKET URL
            </Text>
            <TextInput
              value={wsOverride || derivedWs}
              onChangeText={setWsOverride}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="wss://dash.example.com/ws"
              placeholderTextColor={t.dim}
              style={field}
            />
            <Text style={{ color: t.dim, fontSize: 12, marginTop: 8 }}>
              Only change this if your server sets a custom WS_PATH_PREFIX.
            </Text>
          </View>
        )}

        {!!error && (
          <Text style={{ color: t.offline, fontSize: 14, marginTop: 16 }}>{error}</Text>
        )}

        <Pressable
          onPress={() => void submit()}
          disabled={busy}
          style={{
            backgroundColor: t.cta, borderRadius: radius.md, paddingVertical: 16,
            alignItems: 'center', marginTop: 28, opacity: busy ? 0.6 : 1,
          }}
        >
          {busy
            ? <ActivityIndicator color={t.ctaFg} />
            : <Text style={{ color: t.ctaFg, fontSize: 16, fontWeight: '700' }}>Continue</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/devdash-mobile && npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add packages/devdash-mobile/app/server.tsx
git commit -m "feat(mobile): server address screen with a live-derived socket URL"
```

---

### Task 6: Route to the screen when no server is set

**Files:**
- Modify: `packages/devdash-mobile/app/index.tsx` (whole file)
- Modify: `packages/devdash-mobile/app/_layout.tsx` (hydrate the store, extend the gate)

**Interfaces:**
- Consumes: `useServer` (Task 4); the `/server` route (Task 5).
- Produces: nothing consumed later.

The intro carousel comes first — a new user should learn what DevDash is before being asked for an address.

- [ ] **Step 1: Gate the index route**

Replace the whole of `packages/devdash-mobile/app/index.tsx`:

```tsx
import { Redirect } from 'expo-router';
import { useAuth } from '../src/store/auth';
import { usePrefs } from '../src/store/prefs';
import { useServer } from '../src/store/server';
import { BrandSplash } from '../src/ui/BrandSplash';

export default function Index() {
  const authReady = useAuth((s) => s.ready);
  const token = useAuth((s) => s.token);
  const pending = useAuth((s) => s.pending);
  const prefsReady = usePrefs((s) => s.ready);
  const introSeen = usePrefs((s) => s.introSeen);
  const serverReady = useServer((s) => s.ready);
  const configured = useServer((s) => s.configured);

  if (!authReady || !prefsReady || !serverReady) return <BrandSplash />;
  if (!introSeen) return <Redirect href="/intro" />;
  if (!configured) return <Redirect href="/server" />;
  if (pending === '2fa') return <Redirect href="/(auth)/totp" />;
  if (token) return <Redirect href="/(tabs)/sessions" />;
  return <Redirect href="/(auth)/login" />;
}
```

- [ ] **Step 2: Hydrate the store at startup**

In `packages/devdash-mobile/app/_layout.tsx`, add the import beside the other stores:

```ts
import { useServer } from '../src/store/server';
```

In `Root()`, add the hydrate call. The server store reads the token key, and the auth store writes it, so hydrate the server store first:

```tsx
  const hydrateAuth = useAuth((s) => s.hydrate);
  const hydratePrefs = usePrefs((s) => s.hydrate);
  const hydrateServer = useServer((s) => s.hydrate);
  useEffect(() => {
    void hydrateServer().then(() => { void hydrateAuth(); });
    void hydratePrefs();
  }, [hydrateAuth, hydratePrefs, hydrateServer]);
```

In `RootNav()`, hold the splash until all three are ready:

```tsx
  const serverReady = useServer((s) => s.ready);
  ...
  useEffect(() => {
    if (authReady && prefsReady && serverReady) void SplashScreen.hideAsync();
  }, [authReady, prefsReady, serverReady]);
```

- [ ] **Step 3: Teach the auth gate about /server**

In `useAuthGate()` in the same file, the effect currently reads:

```tsx
    const root = segments[0];
    const inAuth = root === '(auth)';
    const inIntro = root === 'intro';
    const introSeen = usePrefs.getState().introSeen;
```

Add `/server` as a third route allowed without a token, and send an unconfigured user there rather than to login:

```tsx
    const root = segments[0];
    const inAuth = root === '(auth)';
    const inIntro = root === 'intro';
    const inServer = root === 'server';
    const introSeen = usePrefs.getState().introSeen;
    const configured = useServer.getState().configured;
```

then change the unauthenticated branch:

```tsx
    if (!token && !inAuth && !inIntro && !inServer) {
      if (!introSeen) router.replace('/intro');
      else router.replace(configured ? '/(auth)/login' : '/server');
      return;
    }
```

Without `inServer` the gate would bounce the user off the server screen the moment they arrived.

- [ ] **Step 4: Typecheck**

Run: `cd packages/devdash-mobile && npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add packages/devdash-mobile/app/index.tsx packages/devdash-mobile/app/_layout.tsx
git commit -m "feat(mobile): send a launch with no configured server to the address screen"
```

---

### Task 7: Change server from Settings

**Files:**
- Modify: `packages/devdash-mobile/app/(tabs)/settings.tsx` (imports, the API row at ~line 80-86)

**Interfaces:**
- Consumes: `useServer` (Task 4); the `/server` route (Task 5).
- Produces: nothing consumed later.

- [ ] **Step 1: Add the imports**

At the top of `packages/devdash-mobile/app/(tabs)/settings.tsx`:

```ts
import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useServer } from '../../src/store/server';
import { resetSocket } from '../../src/ws/manager';
```

Keep the existing `getApiUrl, APP_VARIANT` import from `../../src/config`.

- [ ] **Step 2: Add the handler**

Inside `Settings()`, beside the existing hooks:

```tsx
  const router = useRouter();
  const qc = useQueryClient();
  const clearServer = useServer((s) => s.clearServer);

  const changeServer = () => {
    Alert.alert(
      'Change server',
      'This signs you out. Your session belongs to the current server and cannot be carried across.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change server',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              // Order matters. Clearing the URL first would leave a live socket
              // pointed at a server the app no longer admits to knowing.
              resetSocket();
              qc.clear();
              await logout();
              await clearServer();
              router.replace('/server');
            })();
          },
        },
      ],
    );
  };
```

- [ ] **Step 3: Turn the API row into a control**

Replace the existing API `Row` (around line 80-86):

```tsx
        <Row onPress={changeServer}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.txt, fontSize: 16, fontWeight: '600' }}>Server</Text>
            <Text style={{ color: t.dim, fontSize: 12, marginTop: 3 }}>{getApiUrl()}</Text>
          </View>
          <Text style={{ color: t.accent, fontSize: 14, fontWeight: '600' }}>Change</Text>
        </Row>
```

- [ ] **Step 4: Typecheck and test**

Run: `cd packages/devdash-mobile && npm run typecheck && npm test`
Expected: typecheck exit 0; 18 tests pass.

- [ ] **Step 5: Commit**

```bash
git add "packages/devdash-mobile/app/(tabs)/settings.tsx"
git commit -m "feat(mobile): change server from Settings, tearing the session down in order"
```

---

### Task 8: Verify on device, then ship over the air

**Files:** none changed unless a check fails.

**Interfaces:**
- Consumes: everything above.
- Produces: a published update on the `preview` channel.

- [ ] **Step 1: Full local verification**

Run: `cd packages/devdash-mobile && npm run typecheck && npm test`
Expected: typecheck exit 0; 18 tests pass.

- [ ] **Step 2: Exercise the flows in the Dev app over Metro**

Run: `cd packages/devdash-mobile && npm run start:dev-client`

Then, on the device, confirm each of these:

1. Settings → Server → Change → confirm. Lands on the server screen, signed out.
2. Enter a deliberately wrong host (`nope.invalid`). Expect "Could not reach that address."
3. Enter a real non-DevDash host (`example.com`). Expect "That address answered, but it is not a DevDash server."
4. Enter `www.dialout.dev`. Expect the socket line to read `wss://www.dialout.dev/ws`, then Continue succeeds and login appears.
5. Sign in. Projects, terminals, and an AI session all load — this proves the sockets picked up the runtime URL.
6. Open Advanced and confirm the WebSocket field is prefilled and editable.

- [ ] **Step 3: Commit any fixes, then publish to the Live app**

```bash
cd packages/devdash-mobile
npx eas-cli update --branch preview -m "configurable server URL"
```

- [ ] **Step 4: Confirm the update reached the Live app**

Force-close the Live app on the device and reopen it. It should behave exactly as before — already signed in, no server screen — because `hydrate()` adopts the baked URL when a token exists. Then Settings → Server shows the new **Change** control.

This is the single most important check in the plan: it proves the migration rule protects an existing session.

- [ ] **Step 5: Push**

```bash
git push origin main
```

Note this triggers the production deploy of the web app. The changes are mobile-only, so the deployed app is functionally unchanged.

---

## Notes

**The Dev app cannot receive `eas update`.** It is a local Xcode build whose `ios/DevDash/Supporting/Expo.plist` carries `EXUpdatesEnabled=false` and no channel, so `eas update --branch development` publishes successfully and reaches nothing. Test the Dev app through Metro, as Task 8 Step 2 does. Giving it OTA means replacing the local build with an EAS development build.

**Not covered, deliberately:** multiple saved servers. One server at a time; switching replaces. See the spec's non-goals.
