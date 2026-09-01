# Mobile — Configurable Server URL — Design

**Date:** 2026-08-30
**Status:** Approved, not yet implemented
**Package:** `packages/devdash-mobile`
**Reason:** the mobile app is going open source. Today it can only ever talk to
`www.dialout.dev`.

## Goal

Let anyone who installs the app point it at their own DevDash server, and let
them change that choice later without reinstalling. A first launch with no
server stored asks for one. Settings can change it. Changing it signs the user
out, because the session belongs to the old server.

## Scope & non-goals

**In scope:** storing an API URL and a WebSocket URL per install, collecting
them on first launch, editing them in Settings, and tearing down the session
cleanly when they change.

**Not in scope — the server never learns it is being pointed at.** No
registration, no discovery, no directory of public DevDash servers. The user
types an address they already know.

**Not in scope — no per-server profiles.** One server at a time. Switching
replaces; it does not accumulate a list. Multi-server is a larger feature and
nothing today asks for it.

## Facts the design rests on

Measured in `packages/devdash-mobile` on 2026-08-30.

| Fact | Where | Consequence |
| --- | --- | --- |
| `API_URL` and `WS_URL` are module constants | `src/config.ts:8-9` | A build-time value. Nothing can change it at runtime. |
| Four consumers, no more | `api/client.ts:36`, `ws/manager.ts:35`, `app/terminal/[id].tsx:46`, `app/(tabs)/settings.tsx:82` | The change is small and fully enumerable. |
| The WS URL is **not** derived from the API URL | `src/config.ts:9` | `https://host` + `wss://host/ws`. Two independent values today. |
| `WS_PATH_PREFIX` is server-configurable | root `CLAUDE.md`, Deployment | `/ws` is a convention, not a guarantee. Derivation needs an escape hatch. |
| **Every** API route calls `getSession()` | verified across `src/app/api/**/route.ts` | No unauthenticated endpoint exists to probe. |
| `client.ts` already holds a module-level mutable pushed in by a store | `let accessToken` + `setAccessToken()` | The pattern for runtime-settable config already exists here. Follow it. |
| `resetSocket()` already exists | `src/ws/manager.ts:117` | The in-app teardown needs no new socket plumbing. |
| `usePrefs` gates first-run UI on a stored flag | `src/store/prefs.ts`, `app/index.tsx` | The `introSeen` → `/intro` gate is the shape to copy. |
| `devdash-mobile` has no test runner | `package.json` has no `test` script | Any test for this feature requires adding one. |

## Approach

`src/config.ts` keeps the current URLs in module-level mutables behind
`getApiUrl()` and `getWsUrl()`. A new `useServer` store pushes into them on
hydrate and on change, exactly as the auth store pushes tokens through
`setAccessToken()`.

Two alternatives lost. A React context with a `useServerUrl()` hook is more
idiomatic, but `api()` is a plain async function called from outside components,
so the URL would have to thread through every call signature. Re-reading
SecureStore per request needs no cache invalidation but puts an async keychain
read in front of every fetch and every socket open.

## Components

### `src/server-url.ts` — pure

- `normalizeApiUrl(input): string | null` — trim, prepend `https://` when the
  input carries no scheme, strip a trailing slash, return `null` for anything
  that is not a usable origin.
- `deriveWsUrl(apiUrl): string` — `http` becomes `ws`, `https` becomes `wss`,
  append `/ws`.

Pure string functions with no imports. They fail on the cases nobody pictures:
a bare host, an explicit port, an IP address, a trailing slash, a URL already
carrying a path.

### `src/api/probe.ts`

`probeServer(apiUrl): Promise<Verdict>` where `Verdict` is `'ok' |
'not-devdash' | 'unreachable' | 'tls'`.

It sends an unauthenticated `GET /api/projects` with a short timeout. Because
every route authenticates, a real DevDash server answers `401` with a JSON
error body, and that response alone proves the address is reachable and
DevDash-shaped. Measured against production on 2026-08-30:

```
$ curl -i https://www.dialout.dev/api/projects
401  content-type: application/json
{"error":"Not authenticated"}
```

A wrong address fails differently, and the difference is what the user needs to
read:

| Probe result | Verdict | Message |
| --- | --- | --- |
| `401` and a JSON body | `ok` | — |
| `200`, HTML, or `404` | `not-devdash` | That address answered, but it is not a DevDash server. |
| DNS failure, timeout, refused | `unreachable` | Could not reach that address. |
| Certificate rejected | `tls` | The server's certificate was rejected. |

### `src/store/server.ts`

Mirrors `usePrefs`. State: `ready`, `apiUrl`, `wsUrl`, `configured`. Actions:
`hydrate()`, `setServer(apiUrl, wsUrl)`, `clearServer()`.

`hydrate()` decides what a launch means:

| Stored URL | Token | Outcome |
| --- | --- | --- |
| present | either | Use it. |
| absent | present | Adopt the baked build URL and continue. **An upgrade must not interrupt a signed-in user.** |
| absent | absent | `configured: false`. Show the server screen. |

Every path ends by calling `setServerUrls()` so the module mutables and the
store never disagree.

### `src/config.ts` — changed

Baked values become `BAKED_API_URL` and `BAKED_WS_URL`, either of which may be
empty in an open-source build. Current values live behind `getApiUrl()`,
`getWsUrl()`, and `setServerUrls()`.

### `app/server.tsx` — new route

One field, prefilled from `BAKED_API_URL`. The resolved socket URL shows
beneath it as the user types. An **Advanced** disclosure reveals an editable
WebSocket URL for a deployment that moved `WS_PATH_PREFIX`; touching it stops
the derivation from overwriting the user's value.

Continue normalizes, probes, and saves. A failed probe reports the verdict and
saves nothing.

### Routing — changed

`app/index.tsx` gains `!configured → /server`, placed after the intro check so
a new user meets the carousel before the address form. `useAuthGate()` in
`app/_layout.tsx` learns `/server` as a route that may run without a token,
alongside its existing `inIntro` guard. Without that, the gate and the redirect
fight each other.

### Settings — changed

`app/(tabs)/settings.tsx:82` shows the API URL as dim, read-only text. It
becomes a **Change server** row. Confirming runs, in order:

1. `resetSocket()` — drop the dashboard socket
2. `qc.clear()` — drop every cached query from the old server
3. `logout()` — clear token, user, machines
4. `clearServer()` — clear the stored URLs
5. `router.replace('/server')`

Order matters. Clearing the URL before closing the socket leaves a live
connection to a server the app no longer admits to knowing.

## Error handling

The probe is the only new failure surface, and its four verdicts each carry
their own message. Beyond it: a normalize failure blocks Continue with inline
text rather than an alert, and `hydrate()` keeps `usePrefs`'s habit of always
reaching `ready: true` so a storage fault can never hang the splash screen.

## Testing

Add vitest to `packages/devdash-mobile` and test `server-url.ts` against bare
hosts, explicit ports, IP addresses, trailing slashes, both schemes, and
garbage. These pure functions carry the edge cases; the rest of the feature is
UI and gets a manual pass on a device.

Manual checks, on the device:

1. Fresh install, no stored URL — the server screen appears, prefilled.
2. A deliberately wrong address — the right verdict shows and nothing saves.
3. Settings → Change server — lands on the server screen, signed out.
4. Re-enter and sign in — the app works.
5. An already signed-in install taking this as an update — nothing changes.

## Release

The Live app receives this over the air: `eas update --branch preview`.

The Dev app cannot. It is a local Xcode build whose baked
`ios/DevDash/Supporting/Expo.plist` carries `EXUpdatesEnabled=false` and no
channel, so `eas update --branch development` reaches nothing regardless of what
is pushed. Test the Dev app through Metro instead. Giving it OTA would mean
replacing the local build with an EAS development build.
