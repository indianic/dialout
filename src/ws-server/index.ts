import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { createHash, timingSafeEqual } from 'crypto';
import { IncomingMessage } from 'http';

// --- Config ---
const PORT = parseInt(process.env.WS_PORT || '50052', 10);
const DATABASE_URL = process.env.DATABASE_URL || '';

// Shared secret gating privileged relay endpoints (see PRIVILEGED_PREFIXES below).
// Derived from JWT_SECRET by default so the raw signing secret never travels in
// a header, and no new required config is needed. Fail closed: if neither secret
// is set the token would derive from an empty string (a guessable value), so
// refuse to start rather than serve a bypassable gate.
// Bytes of the session-signing secret, for verifying WebSocket upgrades.
// Separate from the internal relay token below: that one authenticates
// Next.js to this process, this one authenticates a person's browser.
//
// Checked on its own rather than folded into the RAW_TOKEN_SECRET guard,
// which accepts EITHER variable. A server started with WS_INTERNAL_TOKEN set
// but JWT_SECRET missing would pass that guard, boot cleanly, and then reject
// every browser connection with a bare 401 and no explanation.
if (!process.env.JWT_SECRET) {
  console.error('[devdash-ws] JWT_SECRET must be set — it verifies browser sessions');
  process.exit(1);
}
const JWT_SECRET_BYTES = new TextEncoder().encode(process.env.JWT_SECRET);

const RAW_TOKEN_SECRET = process.env.WS_INTERNAL_TOKEN || process.env.JWT_SECRET;
if (!RAW_TOKEN_SECRET) {
  console.error('[devdash-ws] WS_INTERNAL_TOKEN or JWT_SECRET must be set');
  process.exit(1);
}
const INTERNAL_TOKEN = process.env.WS_INTERNAL_TOKEN
  || createHash('sha256').update(RAW_TOKEN_SECRET).digest('hex');

// Constant-time compare so the token check can't be probed via timing.
// Length mismatch (or a missing header) short-circuits — token length is fixed
// and not secret, so leaking it via the length check is harmless.
function internalTokenValid(provided: string | string[] | undefined): boolean {
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(INTERNAL_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

if (!DATABASE_URL) {
  console.error('[devdash-ws] DATABASE_URL not set');
  process.exit(1);
}

// Dynamic import for postgres (ESM default export)
let sql: any;
(async () => {
  const pg = await import('postgres');
  const createClient = (pg as any).default || pg;
  sql = createClient(DATABASE_URL);
})();

// --- Connection Registry ---
interface DaemonConnection {
  ws: WebSocket;
  machineId: number;
  connectedAt: Date;
  lastHeartbeat: Date;
}

const daemonConnections = new Map<number, DaemonConnection>();

// Browser connections waiting for terminal data
interface BrowserTerminalConnection {
  ws: WebSocket;
  userId: number;
  machineId: number;
  sessionId: string;
  dbSessionId?: number;
  startedAt: number;
  recording: boolean;
  detachTimer?: NodeJS.Timeout;
}

const browserConnections = new Map<string, BrowserTerminalConnection>();

// --- Cowork: live tmux-session registry (per machine) ---
const machineOwnerCache = new Map<number, number>();

async function getMachineOwner(machineId: number): Promise<number | null> {
  if (machineOwnerCache.has(machineId)) return machineOwnerCache.get(machineId)!;
  if (!sql) return null;
  try {
    const rows = await sql`SELECT user_id FROM machines WHERE id = ${machineId}`;
    if (rows.length === 0) return null;
    machineOwnerCache.set(machineId, rows[0].user_id);
    return rows[0].user_id;
  } catch {
    return null;
  }
}

interface TmuxSessionInfo {
  name: string; createdAt: number; attached: number; lastActivity: number;
  width: number; height: number; termProgram: string; origin: string;
  folder?: string; folderPath?: string; createdLocal?: string; gitBranch?: string; lastLines?: string;
}

// --- AI session alerts -----------------------------------------------------
//
// The whole point of the feature: start something long, put the phone away,
// and get pulled back only when the agent actually needs you.
//
// Only the transition INTO a waiting state fires. Notifying on the state
// itself would re-fire every five seconds for as long as the session sat
// idle, which trains people to turn notifications off.

import { shouldNotifyAi } from '../lib/ai-notify';
import { extractWsToken, verifyWsToken } from '../lib/ws-auth';

const lastAiStatus = new Map<string, string>();
const lastAiNotifiedAt = new Map<string, number>();

async function notifyAiTransitions(machineId: number, sessions: any[]): Promise<void> {
  if (!sql) return;
  const now = Date.now();
  const due: any[] = [];

  for (const session of sessions) {
    const key = `${machineId}:${session.tmuxName}`;
    const previous = lastAiStatus.get(key);
    if (shouldNotifyAi(previous, session.status, lastAiNotifiedAt.get(key), now)) {
      due.push(session);
      lastAiNotifiedAt.set(key, now);
    }
    lastAiStatus.set(key, session.status);
  }
  if (!due.length) return;

  try {
    const userId = await getMachineOwner(machineId);
    if (userId == null) return;
    const subs = await sql`
      SELECT endpoint, p256dh, auth, platform, device_token FROM push_subscriptions WHERE user_id = ${userId}`;
    if (!subs.length) return;

    const { sendPush } = await import('../lib/push');
    for (const session of due) {
      const payload = {
        title: session.status === 'waiting_approval'
          ? `${session.title || 'Agent'} needs you`
          : `${session.title || 'Agent'} finished`,
        body: `${session.kind} · ${session.folder || 'session'}`,
        url: `/ai/${machineId}/${encodeURIComponent(session.tmuxName)}`,
        // One notification per session, replaced rather than stacked.
        tag: `ai-${machineId}-${session.tmuxName}`,
      };
      for (const sub of subs) {
        const alive = await sendPush(
          {
            endpoint: sub.endpoint,
            p256dh: sub.p256dh,
            auth: sub.auth,
            platform: sub.platform,
            deviceToken: sub.device_token,
          }, payload);
        if (!alive) {
          // The browser threw this subscription away; keeping the row would
          // mean retrying a dead endpoint forever.
          await sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`;
        }
      }
    }
  } catch (err: any) {
    // Never let a notification failure disturb the session relay.
    console.error('[ws] ai notify failed:', err?.message);
  }
}

// Forget a machine's session statuses when its agent disconnects, so a
// reconnect does not fire a notification for every session at once.
export function forgetAiStatuses(machineId: number): void {
  for (const key of Array.from(lastAiStatus.keys())) {
    if (key.startsWith(`${machineId}:`)) {
      lastAiStatus.delete(key);
      lastAiNotifiedAt.delete(key);
    }
  }
  aiSessionCache.delete(machineId);
}

// Last `ai_session_list` from each agent. Native terminals are a DB read
// because tmux_sessions is written on every poll; AI listing used to wait
// on a fresh lsof+transcript walk (10s timeout per machine). The agent
// already pushes this every 5s — serve that snapshot instead of asking again.
const aiSessionCache = new Map<number, any[]>();

async function replayAiCache(ws: WebSocket, userId: number): Promise<void> {
  for (const [machineId, sessions] of aiSessionCache) {
    const owner = await getMachineOwner(machineId);
    if (owner !== userId || ws.readyState !== WebSocket.OPEN) continue;
    ws.send(JSON.stringify({ type: 'ai_session_list', machineId, sessions }));
  }
}

// tmux_sessions reports for one machine must apply in arrival order —
// overlapping upserts double-insert (no unique constraint) and a stale
// snapshot's vanish-pass can kill a just-revived session.
const tmuxUpsertChains = new Map<number, Promise<void>>();

function enqueueTmuxSessions(machineId: number, sessions: TmuxSessionInfo[]): void {
  const prev = tmuxUpsertChains.get(machineId) || Promise.resolve();
  const next = prev
    .then(() => handleTmuxSessions(machineId, sessions))
    .catch(() => {}); // handleTmuxSessions catches internally; belt-and-braces
  tmuxUpsertChains.set(machineId, next);
}

async function handleTmuxSessions(machineId: number, sessions: TmuxSessionInfo[]): Promise<void> {
  if (!sql) return;
  const userId = await getMachineOwner(machineId);
  if (userId == null) return;
  const recordOn = await isRecordingEnabled(userId);
  try {
    const names = sessions.map((s) => s.name);
    for (const s of sessions) {
      const lastActive = new Date(s.lastActivity * 1000).toISOString();
      const updated = await sql`
        UPDATE terminal_sessions
        SET is_live = true, last_active_at = ${lastActive}, last_seen_at = now(),
            term_program = ${s.termProgram}, origin = ${s.origin},
            cols = ${s.width}, rows = ${s.height}, ended_at = NULL,
            folder = ${s.folder ?? null}, folder_path = ${s.folderPath ?? null},
            created_local = ${s.createdLocal ?? null}, git_branch = ${s.gitBranch ?? null},
            last_lines = ${recordOn ? (s.lastLines ?? null) : null}
        WHERE machine_id = ${machineId} AND tmux_name = ${s.name} AND ended_at IS NULL
        RETURNING id`;
      if (updated.length === 0) {
        await sql`
          INSERT INTO terminal_sessions
            (machine_id, user_id, command, cwd, tmux_name, term_program, origin, is_live,
             last_active_at, last_seen_at, cols, rows, folder, folder_path, created_local, git_branch, last_lines)
          VALUES
            (${machineId}, ${userId}, ${'tmux:' + s.name}, ${s.folderPath || '~'}, ${s.name},
             ${s.termProgram}, ${s.origin}, true, ${lastActive}, now(), ${s.width}, ${s.height},
             ${s.folder ?? null}, ${s.folderPath ?? null}, ${s.createdLocal ?? null},
             ${s.gitBranch ?? null}, ${recordOn ? (s.lastLines ?? null) : null})`;
      }
    }
    // Sessions that vanished from the report are over.
    if (names.length > 0) {
      await sql`
        UPDATE terminal_sessions SET is_live = false, ended_at = now()
        WHERE machine_id = ${machineId} AND is_live = true AND tmux_name IS NOT NULL
          AND tmux_name NOT IN ${sql(names)}`;
    } else {
      await sql`
        UPDATE terminal_sessions SET is_live = false, ended_at = now()
        WHERE machine_id = ${machineId} AND is_live = true AND tmux_name IS NOT NULL`;
    }
  } catch (err: any) {
    console.error('[devdash-ws] tmux registry upsert failed:', err.message);
  }
}

// When a browser socket drops (network blip, proxy timeout, page reload) the
// PTY is held for this grace period so a reconnect reattaches instantly with
// the same sessionId. Past it we hand the PTY back — see releaseSession.
const DETACH_GRACE_MS = 10 * 60 * 1000;

// Grace expiry: give up the PTY, never the shell.
//
// This used to send pty_close, which on a cowork-wrapped session made the
// agent kill the tmux session as well — so closing a browser tab for eleven
// minutes silently destroyed whatever was running in it. pty_detach drops only
// the agent's tmux client; the session keeps running and stays resumable from
// the Web tab or by reopening the dock. For a session with no tmux behind it
// the agent still kills the shell, since nothing could ever reach it again.
//
// Explicit closes do NOT come through here — they send pty_close from the
// browser's own handler, and killing is exactly what the user asked for.
function releaseSession(sessionId: string, conn: BrowserTerminalConnection) {
  const daemon = daemonConnections.get(conn.machineId);
  if (daemon && daemon.ws.readyState === WebSocket.OPEN) {
    daemon.ws.send(JSON.stringify({ type: 'pty_detach', id: sessionId }));
  }
  if (conn.dbSessionId) {
    flushChunks();
    endDbSession(conn.dbSessionId, -1);
  }
  browserConnections.delete(sessionId);
}

function detachSession(sessionId: string, conn: BrowserTerminalConnection) {
  if (conn.detachTimer) clearTimeout(conn.detachTimer);
  conn.detachTimer = setTimeout(() => {
    console.log(`[devdash-ws] Session ${sessionId} detach grace expired, releasing PTY (shell kept)`);
    releaseSession(sessionId, conn);
  }, DETACH_GRACE_MS);
  console.log(`[devdash-ws] Session ${sessionId} detached, PTY kept alive for reattach`);
}

// --- Recording helpers ---
const chunkBuffer: { sessionId: number; timestamp: number; type: string; data: string }[] = [];
let flushTimer: NodeJS.Timeout | null = null;

async function flushChunks() {
  if (chunkBuffer.length === 0 || !sql) return;
  const batch = chunkBuffer.splice(0, chunkBuffer.length);
  try {
    for (const chunk of batch) {
      await sql`INSERT INTO terminal_chunks (session_id, timestamp, type, data)
        VALUES (${chunk.sessionId}, ${chunk.timestamp}, ${chunk.type}, ${chunk.data})`;
    }
  } catch (err: any) {
    console.error('[devdash-ws] Failed to flush chunks:', err.message);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushChunks();
  }, 2000);
}

function recordChunk(dbSessionId: number, startedAt: number, type: string, data: string) {
  chunkBuffer.push({
    sessionId: dbSessionId,
    timestamp: Date.now() - startedAt,
    type,
    data: Buffer.from(data).toString('base64'),
  });
  scheduleFlush();
}

async function createDbSession(machineId: number, userId: number, command: string, cwd: string): Promise<number | null> {
  if (!sql) return null;
  try {
    const rows = await sql`INSERT INTO terminal_sessions (machine_id, user_id, command, cwd)
      VALUES (${machineId}, ${userId}, ${command}, ${cwd}) RETURNING id`;
    return rows[0]?.id || null;
  } catch (err: any) {
    console.error('[devdash-ws] Failed to create session record:', err.message);
    return null;
  }
}

async function endDbSession(dbSessionId: number, exitCode: number) {
  if (!sql) return;
  try {
    await sql`UPDATE terminal_sessions SET ended_at = now(), exit_code = ${exitCode}
      WHERE id = ${dbSessionId}`;
  } catch { /* silent */ }
}

async function isRecordingEnabled(userId: number): Promise<boolean> {
  if (!sql) return false;
  try {
    const rows = await sql`SELECT record_sessions FROM user_settings WHERE user_id = ${userId}`;
    if (rows.length === 0) return true; // default: recording on
    return rows[0].record_sessions !== false;
  } catch {
    return true;
  }
}

// --- Daily flush cron for expired recordings ---
async function flushExpiredRecordings() {
  if (!sql) return;
  try {
    // Get all user retention settings
    const settings = await sql`SELECT user_id, retention_days FROM user_settings WHERE retention_days > 0`;
    for (const s of settings) {
      const days = s.retention_days || 15;
      await sql`DELETE FROM terminal_chunks WHERE session_id IN (
        SELECT id FROM terminal_sessions WHERE user_id = ${s.user_id}
        AND started_at < now() - interval '1 day' * ${days}
      )`;
      await sql`DELETE FROM terminal_sessions WHERE user_id = ${s.user_id}
        AND started_at < now() - interval '1 day' * ${days}`;
    }
    console.log('[devdash-ws] Flushed expired recordings');
  } catch (err: any) {
    console.error('[devdash-ws] Flush expired recordings failed:', err.message);
  }
}

// Run flush every 24 hours
setInterval(flushExpiredRecordings, 24 * 60 * 60 * 1000);

// --- Auth ---
async function authenticateApiKey(apiKey: string): Promise<number | null> {
  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  const rows = await sql`
    SELECT machine_id FROM machine_api_keys WHERE key_hash = ${keyHash}
  `;

  if (rows.length === 0) return null;

  // Update last_used_at
  await sql`
    UPDATE machine_api_keys SET last_used_at = now() WHERE key_hash = ${keyHash}
  `;

  return rows[0].machine_id;
}

// --- WebSocket Server ---
const server = createServer();
const wss = new WebSocketServer({ noServer: true });

// noServer mode never emits 'connection', so keepalive state is attached
// here, called from every handleUpgrade callback.
function trackKeepalive(ws: WebSocket): void {
  const c = ws as WebSocket & { isAlive?: boolean };
  c.isAlive = true;
  c.on('pong', () => { c.isAlive = true; });
}

server.on('upgrade', async (request: IncomingMessage, socket, head) => {
  const url = new URL(request.url || '/', `http://localhost:${PORT}`);

  if (url.pathname === '/daemon') {
    // Daemon connection — authenticate via API key
    const apiKey = request.headers['x-api-key'] as string;
    if (!apiKey) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const machineId = await authenticateApiKey(apiKey);
    if (!machineId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      trackKeepalive(ws);
      handleDaemonConnection(ws, machineId);
    });
  } else if (url.pathname === '/multiplex' || url.pathname === '/terminal') {
    // Terminal + dashboard multiplex, and the standalone terminal socket.
    //
    // Both previously took userId and machineId straight from the query
    // string — the /terminal branch even described that as authentication.
    // These sockets drive PTYs on a developer's machine, so identity now
    // comes from the signed session and machine access is checked against
    // the database rather than asserted by the caller.
    const requestedMachine = parseInt(url.searchParams.get('machineId') || '0', 10);
    void (async () => {
      const identity = await verifyWsToken(
        extractWsToken(request.headers.cookie, url.searchParams.get('token')),
        JWT_SECRET_BYTES
      );
      if (!identity || !requestedMachine) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const owner = await getMachineOwner(requestedMachine);
      if (owner !== identity.userId) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        trackKeepalive(ws);
        if (url.pathname === '/multiplex') {
          handleMultiplexConnection(ws, identity.userId, requestedMachine);
        } else {
          handleBrowserConnection(ws, identity.userId, requestedMachine);
        }
      });
    })();

  } else if (url.pathname === '/dashboard') {
    // Dashboard real-time updates.
    //
    // Identity comes from the signed session, never from ?userId= — that was
    // caller-supplied, so anyone could claim to be anyone. Browsers send the
    // cookie on the upgrade automatically; native clients pass ?token=.
    void (async () => {
      const identity = await verifyWsToken(
        extractWsToken(request.headers.cookie, url.searchParams.get('token')),
        JWT_SECRET_BYTES
      );
      if (!identity) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        trackKeepalive(ws);
        handleDashboardConnection(ws, identity.userId);
      });
    })();
  } else {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  }
});

// --- Dashboard Connections (real-time updates to browser) ---
const dashboardConnections = new Set<{ ws: WebSocket; userId: number }>();

function handleDashboardConnection(ws: WebSocket, userId: number): void {
  const conn = { ws, userId };
  dashboardConnections.add(conn);

  ws.on('close', () => {
    dashboardConnections.delete(conn);
  });

  // Send current machine statuses immediately
  const onlineMachines = Array.from(daemonConnections.keys());
  ws.send(JSON.stringify({ type: 'machine_status_sync', machines: onlineMachines }));
  void replayAiCache(ws, userId);
}

// Send only to the sockets belonging to one user.
//
// Anything derived from a machine's contents MUST go through here. AI session
// events carry conversation text, tool calls and tool output; sending those to
// every connected dashboard hands one user's work to all the others.
function sendToUser(userId: number, event: any) {
  dashboardConnections.forEach((conn) => {
    if (conn.userId === userId && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(event));
    }
  });
}

// Resolve the machine's owner, then deliver only to them.
async function sendToMachineOwner(machineId: number, event: any): Promise<void> {
  const userId = await getMachineOwner(machineId);
  if (userId == null) return;
  sendToUser(userId, event);
}

// --- Multiplex Handler (single WS for terminal + dashboard) ---
function handleMultiplexConnection(ws: WebSocket, userId: number, machineId: number): void {
  // Register as dashboard listener
  const dashConn = { ws, userId };
  dashboardConnections.add(dashConn);

  // Send current machine statuses
  const onlineMachines = Array.from(daemonConnections.keys());
  ws.send(JSON.stringify({ type: 'machine_status_sync', machines: onlineMachines }));
  void replayAiCache(ws, userId);

  ws.on('message', async (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      // Route terminal messages to the browser handler logic
      const daemon = daemonConnections.get(machineId);

      switch (msg.type) {
        case 'pty_open': {
          // Idempotent reattach
          const existingConn = browserConnections.get(msg.id);
          if (existingConn) {
            existingConn.ws = ws;
            if (existingConn.detachTimer) {
              clearTimeout(existingConn.detachTimer);
              existingConn.detachTimer = undefined;
            }
            ws.send(JSON.stringify({ type: 'pty_opened', id: msg.id }));
            break;
          }
          if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pty_error', id: msg.id, error: 'Machine is offline' }));
            break;
          }
          // Attach connections (tmuxSession set) skip recording: the tmux
          // registry row already tracks the session, and multiple viewers
          // would otherwise duplicate chunks.
          const recording = msg.tmuxSession ? false : await isRecordingEnabled(userId);
          const startedAt = Date.now();
          let dbSessionId: number | undefined;
          if (recording) {
            const id = await createDbSession(machineId, userId, msg.command || '/bin/zsh', msg.cwd || '~');
            if (id) dbSessionId = id;
          }
          browserConnections.set(msg.id, { ws, userId, machineId, sessionId: msg.id, dbSessionId, startedAt, recording });
          daemon.ws.send(JSON.stringify({
            type: 'pty_open',
            id: msg.id,
            command: msg.command,
            cwd: msg.cwd,
            cols: msg.cols,
            rows: msg.rows,
            tmuxSession: msg.tmuxSession || undefined,
            readOnly: !!msg.readOnly,
          }));
          ws.send(JSON.stringify({ type: 'pty_opened', id: msg.id }));
          break;
        }

        case 'pty_data': {
          if (daemon && daemon.ws.readyState === WebSocket.OPEN) {
            daemon.ws.send(JSON.stringify({ type: 'pty_data', id: msg.id, data: msg.data }));
          }
          break;
        }

        case 'pty_resize': {
          if (daemon && daemon.ws.readyState === WebSocket.OPEN) {
            daemon.ws.send(JSON.stringify({ type: 'pty_resize', id: msg.id, cols: msg.cols, rows: msg.rows }));
          }
          break;
        }

        case 'pty_close': {
          if (daemon && daemon.ws.readyState === WebSocket.OPEN) {
            daemon.ws.send(JSON.stringify({ type: 'pty_close', id: msg.id }));
          }
          browserConnections.delete(msg.id);
          break;
        }
      }
    } catch (err) {
      console.error('[devdash-ws] Invalid multiplex message:', err);
    }
  });

  ws.on('close', () => {
    dashboardConnections.delete(dashConn);
    // Detach (don't kill) terminal sessions owned by this connection
    browserConnections.forEach((conn, sessionId) => {
      if (conn.ws === ws) {
        detachSession(sessionId, conn);
      }
    });
  });
}

// --- Daemon Handler ---
function handleDaemonConnection(ws: WebSocket, machineId: number): void {
  // Close existing connection for this machine if any
  const existing = daemonConnections.get(machineId);
  if (existing) {
    existing.ws.close();
  }

  const conn: DaemonConnection = {
    ws,
    machineId,
    connectedAt: new Date(),
    lastHeartbeat: new Date(),
  };

  daemonConnections.set(machineId, conn);
  console.log(`[devdash-ws] Daemon connected: machine ${machineId}`);
  // Scoped to the owner: which machines exist, and when they come and go,
  // is not other users' business either.
  void sendToMachineOwner(machineId, { type: 'machine_online', machineId });

  ws.send(JSON.stringify({ type: 'auth_ok', machineId }));

  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleDaemonMessage(machineId, msg);
    } catch (err) {
      console.error('[devdash-ws] Invalid daemon message:', err);
    }
  });

  ws.on('close', () => {
    daemonConnections.delete(machineId);
    // Otherwise a reconnect looks like every session transitioning at once.
    forgetAiStatuses(machineId);
    console.log(`[devdash-ws] Daemon disconnected: machine ${machineId}`);
    void sendToMachineOwner(machineId, { type: 'machine_offline', machineId });
    const prev = tmuxUpsertChains.get(machineId) || Promise.resolve();
    tmuxUpsertChains.set(machineId, prev.then(async () => {
      if (!sql) return;
      await sql`UPDATE terminal_sessions SET is_live = false, ended_at = now()
                WHERE machine_id = ${machineId} AND is_live = true AND tmux_name IS NOT NULL`;
    }).catch(() => {}));
  });
}

function handleDaemonMessage(machineId: number, msg: any): void {
  switch (msg.type) {
    case 'heartbeat': {
      const conn = daemonConnections.get(machineId);
      if (conn) {
        conn.lastHeartbeat = new Date();
        conn.ws.send(JSON.stringify({ type: 'pong' }));
      }
      break;
    }

    case 'port_scan_result': {
      // Forward to any pending request (via requestId)
      // Stored in pending requests map, resolved by requestId
      const resolver = pendingRequests.get(msg.requestId);
      if (resolver) {
        resolver(msg);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }

    case 'ai_capabilities': {
      const resolver = pendingRequests.get(msg.requestId);
      if (resolver) {
        resolver(msg);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }

    case 'fs_list': {
      const resolver = pendingRequests.get(msg.requestId);
      if (resolver) {
        resolver(msg);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }

    case 'project_scan_result': {
      const resolver = pendingRequests.get(msg.requestId);
      if (resolver) {
        resolver(msg);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }

    case 'run_command_result': {
      const resolver = pendingRequests.get(msg.requestId);
      if (resolver) {
        resolver(msg);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }

    case 'kill_tmux_result': {
      const resolver = pendingRequests.get(msg.requestId);
      if (resolver) {
        resolver(msg);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }

    case 'pty_data': {
      // Forward terminal output to browser
      const browserConn = browserConnections.get(msg.id);
      if (browserConn && browserConn.ws.readyState === WebSocket.OPEN) {
        browserConn.ws.send(JSON.stringify({ type: 'pty_data', id: msg.id, data: msg.data }));
      }
      // Record chunk if enabled
      if (browserConn?.recording && browserConn.dbSessionId) {
        recordChunk(browserConn.dbSessionId, browserConn.startedAt, 'output', msg.data);
      }
      break;
    }

    case 'pty_exit': {
      const browserConn = browserConnections.get(msg.id);
      if (browserConn?.detachTimer) clearTimeout(browserConn.detachTimer);
      if (browserConn && browserConn.ws.readyState === WebSocket.OPEN) {
        browserConn.ws.send(JSON.stringify({ type: 'pty_exit', id: msg.id, code: msg.code }));
      }
      // End DB session
      if (browserConn?.dbSessionId) {
        flushChunks();
        endDbSession(browserConn.dbSessionId, msg.code ?? 0);
      }
      browserConnections.delete(msg.id);
      break;
    }

    case 'http_response': {
      const resolver = pendingRequests.get(msg.requestId);
      if (resolver) {
        resolver(msg);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }

    case 'ai_session_list': {
      aiSessionCache.set(machineId, Array.isArray(msg.sessions) ? msg.sessions : []);
      void notifyAiTransitions(machineId, Array.isArray(msg.sessions) ? msg.sessions : []);

      const resolver = pendingRequests.get(msg.requestId);
      if (resolver) {
        pendingRequests.delete(msg.requestId);
        resolver(msg);
      }
      // Unsolicited polls also refresh the owner's open dashboards, so a
      // session changing status updates the list without anyone asking.
      // Scoped to the owner: session titles are the user's own prompts.
      void sendToMachineOwner(machineId, {
        type: 'ai_session_list', machineId, sessions: msg.sessions || [],
      });
      break;
    }

    case 'ai_session_created':
    case 'ai_session_deleted': {
      const resolver = pendingRequests.get(msg.requestId);
      if (resolver) {
        pendingRequests.delete(msg.requestId);
        resolver(msg);
      }
      break;
    }

    case 'ai_session_events': {
      // Transcript content is deliberately NOT logged here — it contains
      // everything the model saw, including any secrets in the repository —
      // and goes only to the machine's owner, for the same reason.
      void sendToMachineOwner(machineId, {
        type: 'ai_session_events',
        machineId,
        tmuxName: msg.tmuxName,
        events: msg.events || [],
        status: msg.status,
      });
      break;
    }

    case 'tmux_sessions': {
      enqueueTmuxSessions(machineId, Array.isArray(msg.sessions) ? msg.sessions : []);
      break;
    }

    case 'active_ptys': {
      // Reaper, second half. browserConnections and the detach timers are
      // in-memory only, so a ws-server restart loses every record of who was
      // watching what while the agent's client PTYs keep running. The agent
      // reports what it holds on each (re)connect; anything we no longer track
      // has no browser behind it and its PTY is released. pty_detach never
      // ends the underlying tmux session, so this is safe to run against a
      // machine full of live work — it reclaims node-pty processes only.
      const ids: string[] = Array.isArray(msg.ids) ? msg.ids : [];
      const orphaned = ids.filter((id) => !browserConnections.has(id));
      if (orphaned.length > 0) {
        const daemon = daemonConnections.get(machineId);
        for (const id of orphaned) {
          daemon?.ws.send(JSON.stringify({ type: 'pty_detach', id }));
        }
        console.log(`[devdash-ws] Released ${orphaned.length} orphaned PTY(s) on machine ${machineId}`);
      }
      break;
    }
  }
}

// --- Browser Handler ---
function handleBrowserConnection(ws: WebSocket, userId: number, machineId: number): void {
  console.log(`[devdash-ws] Browser terminal connected: user=${userId} machine=${machineId}`);

  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());
      console.log(`[devdash-ws] Browser msg: ${msg.type} id=${msg.id || 'n/a'}`);
      handleBrowserMessage(ws, userId, machineId, msg);
    } catch (err) {
      console.error('[devdash-ws] Invalid browser message:', err);
    }
  });

  ws.on('close', () => {
    console.log(`[devdash-ws] Browser terminal disconnected: user=${userId}`);
    // Detach (don't kill) sessions this browser owned — the PTY stays alive
    // for DETACH_GRACE_MS so the client can reconnect and reattach.
    browserConnections.forEach((conn, sessionId) => {
      if (conn.ws === ws) {
        detachSession(sessionId, conn);
      }
    });
  });
}

async function handleBrowserMessage(ws: WebSocket, userId: number, machineId: number, msg: any): Promise<void> {
  try {
  // Keepalive: answer client pings regardless of daemon state so idle
  // proxies see traffic and the client knows the link is healthy.
  if (msg.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }));
    return;
  }

  const daemon = daemonConnections.get(machineId);

  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', error: 'Machine is offline' }));
    return;
  }

  switch (msg.type) {
    case 'pty_open': {
      const sessionId = msg.id || generateSessionId();

      // Idempotent: if session already exists, reattach — update the WS
      // reference and cancel any pending detach kill.
      if (browserConnections.has(sessionId)) {
        const existing = browserConnections.get(sessionId)!;
        existing.ws = ws;
        if (existing.detachTimer) {
          clearTimeout(existing.detachTimer);
          existing.detachTimer = undefined;
        }
        console.log(`[devdash-ws] Session ${sessionId} reattached`);
        ws.send(JSON.stringify({ type: 'pty_opened', id: sessionId }));
        break;
      }

      const startedAt = Date.now();

      // Register IMMEDIATELY (before async calls) to prevent duplicate pty_open
      browserConnections.set(sessionId, { ws, userId, machineId, sessionId, dbSessionId: undefined, startedAt, recording: false });

      // Async recording setup (non-blocking) — skipped for tmux attach
      // connections, since the tmux registry row already tracks the session
      // and multiple viewers would otherwise duplicate chunks.
      if (!msg.tmuxSession) {
        (async () => {
          try {
            const recording = await isRecordingEnabled(userId);
            if (recording) {
              const id = await createDbSession(machineId, userId, msg.command || '/bin/zsh', msg.cwd || '~');
              const conn = browserConnections.get(sessionId);
              if (conn) {
                conn.recording = recording;
                if (id) conn.dbSessionId = id;
              }
            }
          } catch (err: any) {
            console.error('[devdash-ws] Recording setup failed (continuing):', err.message);
          }
        })();
      }
      daemon.ws.send(JSON.stringify({
        type: 'pty_open',
        id: sessionId,
        command: msg.command,
        cwd: msg.cwd,
        cols: msg.cols,
        rows: msg.rows,
        tmuxSession: msg.tmuxSession || undefined,
        readOnly: !!msg.readOnly,
      }));
      ws.send(JSON.stringify({ type: 'pty_opened', id: sessionId }));
      break;
    }

    case 'pty_data': {
      daemon.ws.send(JSON.stringify({ type: 'pty_data', id: msg.id, data: msg.data }));
      break;
    }

    case 'pty_resize': {
      daemon.ws.send(JSON.stringify({ type: 'pty_resize', id: msg.id, cols: msg.cols, rows: msg.rows }));
      break;
    }

    case 'pty_close': {
      const conn = browserConnections.get(msg.id);
      if (conn?.detachTimer) clearTimeout(conn.detachTimer);
      if (conn?.dbSessionId) {
        flushChunks();
        endDbSession(conn.dbSessionId, 0);
      }
      daemon.ws.send(JSON.stringify({ type: 'pty_close', id: msg.id }));
      browserConnections.delete(msg.id);
      break;
    }
  }
  } catch (err: any) {
    console.error('[devdash-ws] handleBrowserMessage error:', err.message);
  }
}

// --- Pending Requests (for port scan / fs browse from HTTP API) ---
const pendingRequests = new Map<string, (result: any) => void>();

function generateSessionId(): string {
  return 'ses_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function generateRequestId(): string {
  return 'req_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// --- Public API (called from Next.js API routes via HTTP) ---
// Expose functions for querying daemon state

export function isDaemonOnline(machineId: number): boolean {
  return daemonConnections.has(machineId);
}

export function getOnlineMachines(): number[] {
  return Array.from(daemonConnections.keys());
}

export async function requestPortScan(
  machineId: number,
  options: { ports?: number[]; from?: number; to?: number }
): Promise<{ openPorts: number[] } | null> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return null;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(null);
    }, 30000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve({ openPorts: result.openPorts || [] });
    });

    daemon.ws.send(JSON.stringify({
      type: 'port_scan_request',
      requestId,
      ...options,
    }));
  });
}

export async function requestFsBrowse(
  machineId: number,
  path: string
): Promise<{ path: string; entries: any[] } | null> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return null;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(null);
    }, 10000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve({ path: result.path, entries: result.entries || [] });
    });

    daemon.ws.send(JSON.stringify({
      type: 'fs_browse',
      requestId,
      path,
    }));
  });
}

export async function requestAiCapabilities(
  machineId: number,
  kind: string,
  cwd: string
): Promise<any | null> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return null;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    // An agent predating this message type never replies. Ten seconds later
    // this resolves null, the route returns an empty set, and the UI says the
    // agent needs updating — it does not error.
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(null);
    }, 10000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve(result.caps || null);
    });

    daemon.ws.send(JSON.stringify({ type: 'ai_capabilities_request', requestId, kind, cwd }));
  });
}

export async function requestAiSessions(machineId: number): Promise<any[] | null> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return null;
  if (aiSessionCache.has(machineId)) return aiSessionCache.get(machineId)!;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(null);
    }, 10000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve(result.sessions || []);
    });

    daemon.ws.send(JSON.stringify({ type: 'ai_session_list_request', requestId }));
  });
}

export async function createAiSessionOnDaemon(
  machineId: number,
  body: { kind?: string; cwd: string; prompt: string; permissionMode?: string; configHome?: string }
): Promise<string | null> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return null;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(null);
    }, 15000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve(result.id || null);
    });

    daemon.ws.send(JSON.stringify({ type: 'ai_session_create', requestId, ...body }));
  });
}

export async function deleteAiSessionOnDaemon(
  machineId: number,
  id: string
): Promise<boolean> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return false;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(false);
    }, 10000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve(!!result.ok);
    });

    daemon.ws.send(JSON.stringify({ type: 'ai_session_delete', requestId, id }));
  });
}

// Fire-and-forget: a tail produces many messages over time rather than one
// reply, so these answer as broadcast ai_session_events, not as a resolution.
function sendToDaemon(machineId: number, payload: Record<string, unknown>): boolean {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return false;
  daemon.ws.send(JSON.stringify(payload));
  return true;
}

export function openAiSessionOnDaemon(machineId: number, tmuxName: string): boolean {
  return sendToDaemon(machineId, { type: 'ai_session_open', tmuxName });
}

export function closeAiSessionOnDaemon(machineId: number, tmuxName: string): boolean {
  return sendToDaemon(machineId, { type: 'ai_session_close', tmuxName });
}

export function sendAiInputToDaemon(machineId: number, tmuxName: string, text: string): boolean {
  return sendToDaemon(machineId, { type: 'ai_session_input', tmuxName, text });
}

export async function requestProjectScan(
  machineId: number,
  path: string,
  depth: number
): Promise<{ projects: any[]; error?: string } | null> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return null;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(null);
    }, 60000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve({ projects: result.projects || [], error: result.error });
    });

    daemon.ws.send(JSON.stringify({
      type: 'project_scan',
      requestId,
      path,
      depth,
    }));
  });
}

export async function requestRunCommand(
  machineId: number,
  args: { command: string; cwd: string; background: boolean; logName?: string }
): Promise<{ ok: boolean; pid?: number; exitCode?: number; output?: string; error?: string } | null> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return null;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(null);
    }, 25000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve({
        ok: !!result.ok,
        pid: result.pid,
        exitCode: result.exitCode,
        output: result.output,
        error: result.error,
      });
    });

    daemon.ws.send(JSON.stringify({
      type: 'run_command',
      requestId,
      command: args.command,
      cwd: args.cwd,
      background: args.background,
      logName: args.logName,
    }));
  });
}

// Force-kill a tmux session on a machine by name. Returns null if the machine
// is offline. Used by the Terminals "kill" action to actually terminate a live
// session (native or browser) rather than only hiding its DB row.
export async function requestKillTmux(
  machineId: number,
  name: string
): Promise<{ ok: boolean } | null> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return null;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(null);
    }, 8000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve({ ok: !!result.ok });
    });

    daemon.ws.send(JSON.stringify({ type: 'kill_tmux', requestId, name }));
  });
}

// --- HTTP Tunnel (proxy local dev servers via daemon) ---
const MAX_TUNNEL_BODY = 10 * 1024 * 1024; // 10MB

function PLACEHOLDER_PAGE(title: string, message: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DevDash Tunnel — ${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.card{max-width:480px;width:100%;background:#171717;border:1px solid #262626;border-radius:12px;padding:40px;text-align:center}
.icon{font-size:48px;margin-bottom:16px;opacity:0.6}
h1{font-size:20px;font-weight:600;margin-bottom:12px;color:#fafafa}
p{font-size:14px;line-height:1.6;color:#a3a3a3}
code{background:#262626;padding:2px 8px;border-radius:4px;font-size:13px;color:#f59e0b}
.retry{margin-top:20px;display:inline-block;padding:8px 20px;background:#262626;border:1px solid #404040;border-radius:6px;color:#e5e5e5;text-decoration:none;font-size:13px;cursor:pointer}
.retry:hover{background:#333}</style></head>
<body><div class="card"><div class="icon">&#9888;</div><h1>${title}</h1><p>${message}</p>
<a class="retry" onclick="location.reload()">Retry</a></div></body></html>`;
}

async function requestHttpTunnel(
  machineId: number,
  options: { port?: number; baseUrl?: string },
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ status: number; headers: Record<string, string>; body: string } | null> {
  const daemon = daemonConnections.get(machineId);
  if (!daemon || daemon.ws.readyState !== WebSocket.OPEN) return null;

  const requestId = generateRequestId();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve(null);
    }, 30000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve({
        status: result.status || 502,
        headers: result.headers || {},
        body: result.body || '',
      });
    });

    daemon.ws.send(JSON.stringify({
      type: 'http_request',
      requestId,
      port: options.port || null,
      baseUrl: options.baseUrl || null,
      method,
      path,
      headers,
      body: body || null,
    }));
  });
}

// --- HTTP Endpoints (for Next.js API to query) ---
function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

server.on('request', async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  const PRIVILEGED_PREFIXES = ['/scan/', '/check/', '/browse/', '/project-scan/',
    '/run-command/', '/kill-tmux/', '/ai-sessions/', '/ai-open/', '/ai-close/', '/ai-input/',
    '/ai-create/', '/ai-delete/', '/ai-capabilities/'];
  if (PRIVILEGED_PREFIXES.some((p) => url.pathname.startsWith(p))
      && !internalTokenValid(req.headers['x-internal-token'])) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  if (url.pathname === '/status/online' && req.method === 'GET') {
    const machineIds = Array.from(daemonConnections.keys());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ machineIds }));

  } else if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', connections: daemonConnections.size }));

  } else if (url.pathname.startsWith('/scan/') && req.method === 'POST') {
    // POST /scan/:machineId — request port scan via daemon
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);

    const result = await requestPortScan(machineId, {
      ports: body.ports,
      from: body.from,
      to: body.to,
    });

    if (result === null) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Machine offline' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }

  } else if (url.pathname.startsWith('/browse/') && req.method === 'POST') {
    // POST /browse/:machineId — request fs browse via daemon
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);

    const result = await requestFsBrowse(machineId, body.path || '/');

    if (result === null) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Machine offline' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }

  } else if (url.pathname.startsWith('/ai-create/') && req.method === 'POST') {
    // POST /ai-create/:machineId — start a new AI session on that machine
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);
    const id = await createAiSessionOnDaemon(machineId, {
      kind: body.kind, cwd: body.cwd, prompt: body.prompt,
      permissionMode: body.permissionMode, configHome: body.configHome,
    });

    if (!id) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Could not start session' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id }));
    }

  } else if (url.pathname.startsWith('/ai-delete/') && req.method === 'POST') {
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);
    const ok = await deleteAiSessionOnDaemon(machineId, String(body.id || ''));

    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ok ? { ok: true } : { error: 'Machine offline' }));

  } else if (url.pathname.startsWith('/ai-capabilities/') && req.method === 'POST') {
    // POST /ai-capabilities/:machineId  { kind, cwd }
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);
    const caps = await requestAiCapabilities(
      machineId,
      String(body.kind || ''),
      String(body.cwd || '')
    );
    if (caps === null) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Machine offline or agent too old' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(caps));
    }

  } else if (url.pathname.startsWith('/ai-sessions/') && req.method === 'POST') {
    // POST /ai-sessions/:machineId — list AI CLI sessions via daemon
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const sessions = await requestAiSessions(machineId);

    if (sessions === null) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Machine offline' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions }));
    }

  } else if ((url.pathname.startsWith('/ai-open/') || url.pathname.startsWith('/ai-close/')
              || url.pathname.startsWith('/ai-input/')) && req.method === 'POST') {
    // POST /ai-{open,close,input}/:machineId — control one AI session
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);
    const tmuxName = String(body.tmuxName || '');

    let ok = false;
    if (url.pathname.startsWith('/ai-open/')) ok = openAiSessionOnDaemon(machineId, tmuxName);
    else if (url.pathname.startsWith('/ai-close/')) ok = closeAiSessionOnDaemon(machineId, tmuxName);
    else ok = sendAiInputToDaemon(machineId, tmuxName, String(body.text || ''));

    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ok ? { ok: true } : { error: 'Machine offline' }));

  } else if (url.pathname.startsWith('/project-scan/') && req.method === 'POST') {
    // POST /project-scan/:machineId — scan a folder for projects via daemon
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);

    const result = await requestProjectScan(machineId, body.path || '/', body.depth ?? 2);

    if (result === null) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Machine offline' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }

  } else if (url.pathname.startsWith('/check/') && req.method === 'POST') {
    // POST /check/:machineId — check specific ports on a machine
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);
    const ports = Array.isArray(body.ports) ? body.ports : [body.port].filter(Boolean);

    const result = await requestPortScan(machineId, { ports });

    if (result === null) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Machine offline' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }

  } else if (url.pathname.startsWith('/run-command/') && req.method === 'POST') {
    // POST /run-command/:machineId — run a shell command on a machine via daemon
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);

    const result = await requestRunCommand(machineId, {
      command: body.command || '',
      cwd: body.cwd || '',
      background: !!body.background,
      logName: body.logName,
    });

    if (result === null) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Machine offline' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }

  } else if (url.pathname.startsWith('/kill-tmux/') && req.method === 'POST') {
    // POST /kill-tmux/:machineId — force-kill a tmux session by name via daemon
    const machineId = parseInt(url.pathname.split('/')[2], 10);
    const body = await parseBody(req);
    const name = typeof body.name === 'string' ? body.name : '';

    if (!name) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'name is required' }));
      return;
    }

    const result = await requestKillTmux(machineId, name);
    if (result === null) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Machine offline' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }

  } else if (url.pathname.startsWith('/tunnel/') && req.method) {
    // /tunnel/:machineId/:port/...path — port-based tunnel
    // /tunnel/:machineId/site/:base64url/...path — URL-based tunnel (static/PHP)
    const parts = url.pathname.replace('/tunnel/', '').split('/');
    const machineId = parseInt(parts[0], 10);

    let tunnelOpts: { port?: number; baseUrl?: string } = {};
    let tunnelPath: string;
    let tunnelId: string; // for rewriting paths

    if (parts[1] === 'site') {
      // URL-based: /tunnel/{machineId}/site/{base64url}/...
      const base64url = parts[2] || '';
      try {
        tunnelOpts.baseUrl = Buffer.from(base64url, 'base64').toString('utf-8').replace(/\/$/, '');
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid base64 URL' }));
        return;
      }
      tunnelPath = '/' + parts.slice(3).join('/') + (url.search || '');
      tunnelId = `${machineId}/site/${base64url}`;
    } else {
      // Port-based: /tunnel/{machineId}/{port}/...
      const port = parseInt(parts[1], 10);
      if (!port) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid machineId or port' }));
        return;
      }
      tunnelOpts.port = port;
      tunnelPath = '/' + parts.slice(2).join('/') + (url.search || '');
      tunnelId = `${machineId}/${port}`;
    }

    if (!machineId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid machineId' }));
      return;
    }

    // Read request body if present
    const bodyData = await parseBody(req);
    const bodyStr = Object.keys(bodyData).length > 0 ? Buffer.from(JSON.stringify(bodyData)).toString('base64') : undefined;

    // Forward relevant headers (strip host/connection)
    const fwdHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(req.headers)) {
      if (['host', 'connection', 'upgrade', 'x-api-key'].includes(key)) continue;
      if (typeof val === 'string') fwdHeaders[key] = val;
    }

    const result = await requestHttpTunnel(machineId, tunnelOpts, req.method, tunnelPath, fwdHeaders, bodyStr);

    if (result === null) {
      res.writeHead(503, { 'Content-Type': 'text/html' });
      res.end(PLACEHOLDER_PAGE('Machine offline', 'The daemon on this machine is not connected. Start the agent with: devdash-agent start'));
    } else if (result.status === 502) {
      // Local server not running — show placeholder
      const bodyText = result.body ? Buffer.from(result.body, 'base64').toString('utf-8') : '';
      if (bodyText.includes('Tunnel error:')) {
        res.writeHead(502, { 'Content-Type': 'text/html' });
        res.end(PLACEHOLDER_PAGE('Local Server Not Running',
          tunnelOpts.baseUrl
            ? `Could not connect to <strong>${tunnelOpts.baseUrl}</strong>. Make sure your local web server is running.`
            : `Could not connect to <strong>localhost:${tunnelOpts.port}</strong>. Start your dev server first.`
        ));
        return;
      }
      // Pass through other 502s
      res.writeHead(502, result.headers);
      res.end(result.body ? Buffer.from(result.body, 'base64') : '');
    } else {
      // Set response headers from daemon response
      const resHeaders: Record<string, string> = {};
      const wsPrefix = process.env.WS_PATH_PREFIX || '/ws';
      const tunnelBase = `${wsPrefix}/tunnel/${tunnelId}`;
      for (const [key, val] of Object.entries(result.headers)) {
        // Skip hop-by-hop headers
        if (['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) continue;
        // Rewrite Location header for redirects
        if (key.toLowerCase() === 'location' && val.startsWith('/') && !val.startsWith(tunnelBase)) {
          resHeaders[key] = tunnelBase + val;
        } else {
          resHeaders[key] = val;
        }
      }
      // Add CORS headers for browser access
      resHeaders['access-control-allow-origin'] = '*';

      // For HTML responses, inject <base> tag so relative URLs route through tunnel
      const contentType = (resHeaders['content-type'] || '').toLowerCase();
      let bodyBuf = result.body ? Buffer.from(result.body, 'base64') : null;

      const shouldRewrite = bodyBuf && (
        contentType.includes('text/html') ||
        contentType.includes('javascript') ||
        contentType.includes('text/css')
      );
      if (shouldRewrite) {
        let text = bodyBuf!.toString('utf-8');
        // Rewrite absolute paths so assets/API calls route through tunnel
        text = text.replace(/(["'(=])\/_next\//g, `$1${tunnelBase}/_next/`);
        text = text.replace(/(["'(=])\/api\//g, `$1${tunnelBase}/api/`);

        // For HTML: inject tunnel navigation script to handle all routes
        if (contentType.includes('text/html')) {
          const tunnelScript = `<script>(function(){var B="${tunnelBase}";`
            + `var F=window.fetch;window.fetch=function(u,o){if(typeof u==="string"&&u.startsWith("/")&&!u.startsWith(B))u=B+u;if(u instanceof Request){var nu=u.url;if(nu.startsWith("/")&&!nu.startsWith(B)){u=new Request(B+nu,u)}}return F.call(this,u,o)};`
            + `var P=history.pushState;history.pushState=function(s,t,u){if(typeof u==="string"&&u.startsWith("/")&&!u.startsWith(B))u=B+u;return P.call(this,s,t,u)};`
            + `var R=history.replaceState;history.replaceState=function(s,t,u){if(typeof u==="string"&&u.startsWith("/")&&!u.startsWith(B))u=B+u;return R.call(this,s,t,u)};`
            + `document.addEventListener("click",function(e){var a=e.target.closest("a");if(a){var h=a.getAttribute("href");if(h&&h.startsWith("/")&&!h.startsWith(B)&&!h.startsWith("//")){ e.preventDefault();window.location.href=B+h;}}},true);`
            + `var X=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==="string"&&u.startsWith("/")&&!u.startsWith(B))u=B+u;return X.apply(this,arguments)};`
            + `var N=window.Navigation;if(N&&N.prototype){var nv=N.prototype.navigate;N.prototype.navigate=function(u,o){if(typeof u==="string"&&u.startsWith("/")&&!u.startsWith(B))u=B+u;return nv.call(this,u,o)}}`
            + `if(window.navigation){try{window.navigation.addEventListener("navigate",function(e){var u=new URL(e.destination.url);if(u.pathname.startsWith("/")&&!u.pathname.startsWith(B)){e.preventDefault();window.location.href=B+u.pathname+u.search+u.hash}})}catch(ex){}}`
            + `})()</script>`;
          // Inject right after <head> so it runs before any async scripts
          if (text.includes('<head>')) {
            text = text.replace('<head>', '<head>' + tunnelScript);
          } else {
            text = text.replace(/<head([^>]*)>/, `<head$1>` + tunnelScript);
          }
        }

        bodyBuf = Buffer.from(text, 'utf-8');
        if (resHeaders['content-length']) {
          resHeaders['content-length'] = String(bodyBuf.length);
        }
      }

      // Remove content-encoding since we decoded the body
      delete resHeaders['content-encoding'];

      res.writeHead(result.status, resHeaders);
      if (bodyBuf) {
        res.end(bodyBuf);
      } else {
        res.end();
      }
    }

  } else {
    res.writeHead(404);
    res.end();
  }
});

// --- Protocol-level keepalive ---
// Ping every connected socket (browsers auto-pong, ws clients auto-pong).
// Generates traffic so reverse proxies never see an idle connection, and
// reaps sockets that stopped answering.
const KEEPALIVE_INTERVAL_MS = 30_000;
setInterval(() => {
  wss.clients.forEach((client) => {
    const c = client as WebSocket & { isAlive?: boolean };
    if (c.isAlive === false) {
      c.terminate();
      return;
    }
    c.isAlive = false;
    try { c.ping(); } catch {}
  });
}, KEEPALIVE_INTERVAL_MS);

// --- Prevent crashes from unhandled errors ---
process.on('unhandledRejection', (err: any) => {
  console.error('[devdash-ws] Unhandled rejection:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[devdash-ws] Uncaught exception:', err.message);
});

// --- Kill existing port user & Start Server ---
import { execSync } from 'child_process';

function startServer() {
  // Bind to localhost by default: the HTTP relay endpoints (/check, /browse,
  // /project-scan, /run-command) are privileged and internal-only — Next.js
  // calls them on localhost, and Apache reverse-proxies /ws/ from 127.0.0.1 on
  // the same host. Binding 0.0.0.0 would expose unauthenticated command
  // execution to the LAN. Set WS_HOST=0.0.0.0 only if the ws-server runs on a
  // separate host from the web app, and firewall the port yourself.
  const HOST = process.env.WS_HOST || '127.0.0.1';
  server.listen(PORT, HOST, () => {
    console.log(`[devdash-ws] WebSocket server running on ${HOST}:${PORT}`);
  });
}

try {
  const pids = execSync(`lsof -ti:${PORT}`, { encoding: 'utf-8' }).trim();
  if (pids) {
    execSync(`kill -9 ${pids.split('\n').join(' ')}`);
    console.log(`[devdash-ws] Killed existing process on port ${PORT}`);
    setTimeout(startServer, 1000);
  } else {
    startServer();
  }
} catch {
  startServer();
}
