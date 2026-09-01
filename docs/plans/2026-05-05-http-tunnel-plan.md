# HTTP Tunnel — Implementation Plan

**Date:** 2026-05-05  
**Status:** Draft  
**Goal:** Expose local dev server ports as public URLs via the existing DevDash daemon tunnel.

---

## How It Works

```
Browser (anywhere)
  │
  │  GET https://devdash.server.com/tunnel/5/3000/dashboard?q=1
  │
  ▼
DevDash Server (port 50052 HTTP handler)
  │  1. Parse: machineId=5, port=3000, path=/dashboard?q=1
  │  2. Look up daemon WSS connection for machine 5
  │  3. Send http_request message via WSS
  │  4. Wait for http_response (timeout 30s)
  │
  ▼ (existing WSS tunnel)
Daemon (dev machine)
  │  1. Receive http_request
  │  2. fetch("http://localhost:3000/dashboard?q=1")
  │  3. Send http_response back via WSS
  │
  ▼
Server returns response to browser
```

---

## Protocol Messages

| Message | Direction | Payload |
|---------|-----------|---------|
| `http_request` | server → daemon | `{ requestId, port, method, path, headers, body? }` |
| `http_response` | daemon → server | `{ requestId, status, headers, body (base64) }` |

---

## Implementation Steps

### Step 1: Server — Add HTTP tunnel endpoint

**File:** `src/ws-server/index.ts`

Add a new route in the existing `server.on('request', ...)` handler:

```
URL pattern: /tunnel/:machineId/:port/*path
```

Logic:
1. Parse machineId, port, and remaining path from URL
2. Check daemon is online for that machineId
3. Generate requestId (existing `generateRequestId()`)
4. Send `http_request` to daemon via WSS:
   ```json
   {
     "type": "http_request",
     "requestId": "req_abc123",
     "port": 3000,
     "method": "GET",
     "path": "/dashboard?q=1",
     "headers": { "accept": "text/html", ... },
     "body": null
   }
   ```
5. Wait for response via `pendingRequests` map (30s timeout)
6. Return the daemon's response (status, headers, body) to the browser

**Auth:** Require a valid session cookie or token query param (same as terminal WS auth). For simplicity, Phase 1 can use a `?token=` query param validated against the JWT secret.

---

### Step 2: Server — Handle `http_response` from daemon

**File:** `src/ws-server/index.ts`

In `handleDaemonMessage()`, add a case for `http_response`:

```typescript
case 'http_response': {
  const resolver = pendingRequests.get(msg.requestId);
  if (resolver) {
    resolver(msg);
    pendingRequests.delete(msg.requestId);
  }
  break;
}
```

This is identical to how `port_scan_result` and `fs_list` already work.

---

### Step 3: Daemon — Add `http_request` handler

**File:** `packages/devdash-agent/src/websocket.ts`

Add a new case in `handleMessage()`:

```typescript
case 'http_request': {
  try {
    const url = `http://localhost:${msg.port}${msg.path}`;
    const resp = await fetch(url, {
      method: msg.method || 'GET',
      headers: msg.headers || {},
      body: msg.body ? Buffer.from(msg.body, 'base64') : undefined,
    });
    const bodyBuf = Buffer.from(await resp.arrayBuffer());
    ws.send(JSON.stringify({
      type: 'http_response',
      requestId: msg.requestId,
      status: resp.status,
      headers: Object.fromEntries(resp.headers.entries()),
      body: bodyBuf.toString('base64'),
    }));
  } catch (err: any) {
    ws.send(JSON.stringify({
      type: 'http_response',
      requestId: msg.requestId,
      status: 502,
      headers: { 'content-type': 'text/plain' },
      body: Buffer.from(`Tunnel error: ${err.message}`).toString('base64'),
    }));
  }
  break;
}
```

---

### Step 4: Next.js API route (optional convenience)

**File:** `src/app/api/tunnel/[machineId]/[port]/[...path]/route.ts`

A Next.js catch-all route that proxies to the WS server's `/tunnel/` endpoint. This allows using the main DevDash domain (port 50051) with existing auth cookies, avoiding CORS issues.

```typescript
// Forwards to ws-server HTTP endpoint at localhost:50052/tunnel/...
// Passes along the session cookie for auth validation
```

---

### Step 5: Frontend — "Live Preview" button

**File:** `src/components/ProjectCard.tsx` (or TerminalPanel)

- Add a "Preview" / "Open Live URL" button per project
- Button visible only when the project's machine is online AND port is open
- Opens: `/tunnel/{machineId}/{port}/` in a new tab
- Optionally: show a copy-able shareable URL

---

## Limitations & Mitigations

| Limitation | Mitigation |
|------------|------------|
| **Latency** (round-trip through server) | Fine for dev preview; not for production traffic |
| **Body size** (base64 over WSS) | Cap at 10MB per response; stream chunked for larger |
| **HMR WebSocket** (Vite/Next hot reload) | Phase 2: add WebSocket passthrough at `/tunnel/:mid/:port/_ws/` |
| **Concurrent requests** | Each request gets its own requestId; fully parallel |
| **Binary content** (images, fonts) | Base64 handles this; just decode on server side |
| **CORS** | Server sets appropriate headers on tunnel responses |

---

## Phase 2 Enhancements (future)

1. **HMR/WebSocket passthrough** — Proxy WebSocket upgrade requests through the tunnel so hot reload works
2. **Subdomain-based routing** — `project-name.devdash.server.com` instead of `/tunnel/5/3000/`
3. **Bandwidth optimization** — Stream large responses in chunks instead of buffering entire body
4. **Access control** — Allow sharing tunnel URLs with teammates (read-only, time-limited tokens)
5. **Auto-detect** — When a project's dev server starts (detected via port scan), auto-show the preview button

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/ws-server/index.ts` | Add `/tunnel/:machineId/:port/*` HTTP handler + `http_response` in daemon message handler |
| `packages/devdash-agent/src/websocket.ts` | Add `http_request` case in `handleMessage()` |
| `src/app/api/tunnel/[machineId]/[port]/[...path]/route.ts` | New — proxy from Next.js to WS server (optional) |
| `src/components/ProjectCard.tsx` | Add "Live Preview" button |

---

## Estimated Effort

- **Server tunnel handler:** ~60 lines
- **Daemon http_request handler:** ~30 lines  
- **Server `http_response` case:** ~5 lines
- **Next.js proxy route:** ~40 lines
- **UI button:** ~15 lines

**Total: ~150 lines of code.** Fits naturally into the existing architecture with zero new dependencies.
