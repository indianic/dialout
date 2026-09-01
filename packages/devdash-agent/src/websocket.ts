import WebSocket from 'ws';
import { AgentConfig } from './config';
import { startHeartbeat, stopHeartbeat, notePong } from './heartbeat';
import { scanPorts, scanRange } from './port-scanner';
import { listDirectory } from './fs-browser';
import { scanProjects } from './project-scanner';
import { runCommand } from './command-runner';
import {
  openSession,
  openAttach,
  writeToSession,
  resizeSession,
  closeSession,
  detachPtySession,
  closeAllSessions,
  getActiveSessions,
  isPtyAvailable,
  setActiveSocket,
  applyNativeTmuxOptions,
} from './pty-manager';
import { listSessions, tmuxAvailable, capturePane, killTmuxSession } from './tmux-manager';
import {
  discoverAiSessions, openAiSession, closeAiSession, closeAllAiSessions, sendAiInput,
  createAiSession, deleteAiSession,
} from './ai-sessions';
import { discoverCapabilities } from './ai-capabilities';

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;
let reconnectAttempt = 0;

export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 60_000;

// Exponential backoff with +/-20% jitter. A flat delay made every agent in the
// fleet retry in lockstep and hammer the server the moment it went down; the
// jitter spreads the herd out across the window.
export function reconnectDelay(attempt: number, rand: () => number = Math.random): number {
  const raw = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
  return Math.round(raw * (0.8 + rand() * 0.4));
}

let tmuxPollTimer: NodeJS.Timeout | null = null;
let lastTmuxSnapshot = '';
const TMUX_POLL_MS = 5000;
const TMUX_RESYNC_MS = 60_000;
const PREVIEW_CAP = 5;
let lastTmuxSentAt = 0;
let reportedSinceConnect = false;

async function pollTmuxSessions(): Promise<void> {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (!(await tmuxAvailable())) return;
  try {
    const sessions = await listSessions();
    const enriched = await Promise.all(sessions.map(async (s) => ({
      ...s,
      lastLines: await capturePane(s.name, PREVIEW_CAP),
    })));
    // folderPath is part of the change key: it is now the LIVE pane path, so a
    // bare `cd` changes nothing else and the update would otherwise be held
    // back until the next 60s resync (or forever, if nothing else changes).
    const snapshot = JSON.stringify(enriched.map((s) => [s.name, s.attached, s.width, s.height, s.folderPath, s.lastLines]));
    const now = Date.now();
    if (snapshot !== lastTmuxSnapshot || now - lastTmuxSentAt > TMUX_RESYNC_MS) {
      lastTmuxSnapshot = snapshot;
      lastTmuxSentAt = now;
      ws.send(JSON.stringify({ type: 'tmux_sessions', sessions: enriched }));
      // Say what the FIRST report after a connect actually contained. An agent
      // that cannot read the user's tmux sessions sends an empty list forever
      // and looks online and healthy, while the dashboard shows no terminals
      // and no AI sessions. Reporting "0 sessions" is the difference between
      // that and "nothing is running", and it costs one line per connect.
      //
      // The message names uid AND locale because both have caused this, and the
      // first version of this line named only the uid — which sent the next
      // investigation straight down the wrong path on a machine whose uid was
      // correct and whose locale was not. Print the facts, not a conclusion.
      if (!reportedSinceConnect) {
        reportedSinceConnect = true;
        const uid = typeof process.getuid === 'function' ? process.getuid() : '?';
        const locale = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || '(unset)';
        console.log(
          `[devdash-agent] reporting ${enriched.length} tmux session(s)`
          + (enriched.length === 0
            ? ` — none visible. uid=${uid}, locale=${locale}.`
              + ' If you do have tmux sessions, compare that uid with `id -u`'
              + ' (a daemon running as another user reads a different'
              + ' /tmp/tmux-<uid> socket).'
            : `: ${enriched.map((s) => s.name).join(', ')}`)
        );
      }
    }
  } catch (err: any) {
    console.error('[devdash-agent] tmux poll failed:', err.message);
  }
}

function startTmuxPolling(): void {
  stopTmuxPolling();
  lastTmuxSnapshot = '';
  reportedSinceConnect = false;
  tmuxPollTimer = setInterval(() => { void pollTmuxSessions(); }, TMUX_POLL_MS);
  void pollTmuxSessions(); // immediate sync on connect
}

function stopTmuxPolling(): void {
  if (tmuxPollTimer) { clearInterval(tmuxPollTimer); tmuxPollTimer = null; }
}

// AI sessions are discovered from the same tmux sessions the poll above
// reports, but resolving the process tree and the transcript for each one is
// far more work than a list-sessions, so it gets its own cadence and its own
// change-detection.
let aiPollTimer: NodeJS.Timeout | null = null;
let lastAiSnapshot = '';
const AI_POLL_MS = 5000;

async function pollAiSessions(): Promise<void> {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const sessions = await discoverAiSessions();
    const snapshot = JSON.stringify(sessions);
    if (snapshot === lastAiSnapshot) return;
    lastAiSnapshot = snapshot;
    ws.send(JSON.stringify({ type: 'ai_session_list', sessions }));
  } catch (err: any) {
    console.error('[devdash-agent] ai session poll failed:', err.message);
  }
}

function startAiPolling(): void {
  stopAiPolling();
  lastAiSnapshot = '';
  aiPollTimer = setInterval(() => { void pollAiSessions(); }, AI_POLL_MS);
  void pollAiSessions();
}

function stopAiPolling(): void {
  if (aiPollTimer) { clearInterval(aiPollTimer); aiPollTimer = null; }
  // Tails are per-connection state: a reconnect re-opens whatever the browser
  // is still watching, and leaving them running would poll files nobody reads.
  closeAllAiSessions();
}

export function connect(config: AgentConfig, onConnected?: () => void): void {
  isShuttingDown = false;

  const url = config.serverUrl.replace(/\/$/, '') + '/daemon';
  ws = new WebSocket(url, {
    headers: { 'X-API-Key': config.apiKey },
  });

  ws.on('open', () => {
    console.log('[devdash-agent] Connected to server');
    reconnectAttempt = 0; // a good connection resets the backoff
    setActiveSocket(ws);
    // A dead socket may never emit 'close' on its own — terminate() forces it,
    // which runs the 'close' handler and schedules the reconnect.
    startHeartbeat(ws!, config.heartbeatInterval, () => {
      try { ws?.terminate(); } catch { /* already gone */ }
    });
    startTmuxPolling();
    startAiPolling();
    // Reaper handshake. Detach timers live only in the ws-server's memory, so
    // a ws-server restart forgets every browser connection while our client
    // PTYs keep running with nothing on the other end. Reporting what we hold
    // lets the server answer pty_detach for the ones it no longer tracks. The
    // tmux sessions behind them are untouched either way — this reclaims
    // node-pty processes, it does not end anyone's work.
    ws!.send(JSON.stringify({ type: 'active_ptys', ids: getActiveSessions() }));
    applyNativeTmuxOptions(); // native terminals (Hyper etc.) get mouse/scroll/no-status without a wrapper re-install
    onConnected?.();
  });

  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleMessage(msg, config);
    } catch (err) {
      console.error('[devdash-agent] Invalid message:', err);
    }
  });

  ws.on('close', (code: number) => {
    console.log(`[devdash-agent] Disconnected (code: ${code})`);
    stopHeartbeat();
    stopTmuxPolling();
    stopAiPolling();
    // Keep PTY sessions alive across reconnects — output resumes on the new
    // socket once we're back (sessions are only killed by explicit pty_close
    // or agent shutdown).
    scheduleReconnect(config, onConnected);
  });

  ws.on('error', (err: Error) => {
    console.error('[devdash-agent] WebSocket error:', err.message);
  });
}

export function disconnect(): void {
  isShuttingDown = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopHeartbeat();
  stopTmuxPolling();
  stopAiPolling();
  closeAllSessions();
  if (ws) {
    ws.close();
    ws = null;
  }
}

export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

function scheduleReconnect(config: AgentConfig, onConnected?: () => void): void {
  if (isShuttingDown) return;
  if (reconnectTimer) return;

  const delay = reconnectDelay(++reconnectAttempt);
  console.log(`[devdash-agent] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${reconnectAttempt})...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(config, onConnected);
  }, delay);
}

async function handleMessage(msg: any, config: AgentConfig): Promise<void> {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  switch (msg.type) {
    case 'auth_ok':
      console.log(`[devdash-agent] Authenticated as machine ${msg.machineId}`);
      break;

    case 'pong':
      // Server acknowledged heartbeat — proves the socket is still two-way.
      notePong();
      break;

    case 'port_scan_request': {
      const { ports, from, to } = msg;
      let openPorts: number[];
      if (ports && Array.isArray(ports)) {
        openPorts = await scanPorts(ports);
      } else if (from != null && to != null) {
        openPorts = await scanRange(from, to);
      } else {
        openPorts = await scanPorts(config.scanPorts);
      }
      ws.send(JSON.stringify({ type: 'port_scan_result', requestId: msg.requestId, openPorts }));
      break;
    }

    case 'fs_browse': {
      const entries = listDirectory(msg.path || '/');
      ws.send(JSON.stringify({ type: 'fs_list', requestId: msg.requestId, path: msg.path, entries }));
      break;
    }

    case 'project_scan': {
      try {
        const projects = await scanProjects(msg.path || process.env.HOME || '/', msg.depth ?? 2);
        ws.send(JSON.stringify({ type: 'project_scan_result', requestId: msg.requestId, projects }));
      } catch (err: any) {
        ws.send(JSON.stringify({
          type: 'project_scan_result',
          requestId: msg.requestId,
          projects: [],
          error: err?.message || 'Scan failed',
        }));
      }
      break;
    }

    case 'run_command': {
      const result = await runCommand({
        command: msg.command || '',
        cwd: msg.cwd,
        background: !!msg.background,
        logName: msg.logName,
      });
      ws.send(JSON.stringify({ type: 'run_command_result', requestId: msg.requestId, ...result }));
      break;
    }

    case 'pty_open': {
      if (!isPtyAvailable()) {
        ws.send(JSON.stringify({ type: 'pty_error', id: msg.id, error: 'node-pty not available' }));
        break;
      }
      let opened: boolean;
      if (msg.tmuxSession) {
        opened = openAttach(
          msg.id,
          String(msg.tmuxSession),
          !!msg.readOnly,
          msg.cols || 80,
          msg.rows || 24
        );
      } else {
        opened = openSession(
          msg.id,
          msg.command || '',
          msg.cwd || process.env.HOME || '/',
          msg.cols || 80,
          msg.rows || 24,
          { coworkWrap: !!config.cowork }
        );
      }
      if (!opened) {
        ws.send(JSON.stringify({ type: 'pty_error', id: msg.id, error: msg.tmuxSession ? 'Failed to attach to session' : 'Failed to open session' }));
      }
      break;
    }

    case 'pty_data': {
      writeToSession(msg.id, msg.data);
      break;
    }

    case 'pty_resize': {
      resizeSession(msg.id, msg.cols, msg.rows);
      break;
    }

    case 'pty_close': {
      void closeSession(msg.id);
      break;
    }

    case 'pty_detach': {
      // Browser is gone for good, but the work is not: drop our tmux client
      // and leave the session running. See detachPtySession().
      detachPtySession(msg.id);
      break;
    }

    case 'ai_session_list_request': {
      const sessions = await discoverAiSessions();
      ws.send(JSON.stringify({ type: 'ai_session_list', requestId: msg.requestId, sessions }));
      break;
    }

    case 'ai_capabilities_request': {
      // cwd comes from the server, which took it from the session registry —
      // the agent does not re-derive it, so the answer matches the session the
      // user is actually looking at.
      const caps = discoverCapabilities(
        String(msg.kind || ''),
        String(msg.cwd || ''),
      );
      ws.send(JSON.stringify({ type: 'ai_capabilities', requestId: msg.requestId, caps }));
      break;
    }

    case 'ai_session_open': {
      const name = String(msg.tmuxName || '');
      if (!name) break;
      openAiSession(name, (events, status) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ai_session_events', tmuxName: name, events, status }));
        }
      });
      break;
    }

    case 'ai_session_create': {
      const id = createAiSession({
        kind: msg.kind,
        cwd: msg.cwd,
        prompt: msg.prompt,
        permissionMode: msg.permissionMode,
        configHome: msg.configHome,
      });
      ws.send(JSON.stringify({
        type: 'ai_session_created', requestId: msg.requestId, id,
      }));
      // The new session should appear in the list immediately rather than on
      // the next five-second poll.
      lastAiSnapshot = '';
      void pollAiSessions();
      break;
    }

    case 'ai_session_delete': {
      const ok = deleteAiSession(String(msg.id || ''));
      ws.send(JSON.stringify({
        type: 'ai_session_deleted', requestId: msg.requestId, ok,
      }));
      lastAiSnapshot = '';
      void pollAiSessions();
      break;
    }

    case 'ai_session_close': {
      closeAiSession(String(msg.tmuxName || ''));
      break;
    }

    case 'ai_session_input': {
      // Input is keystrokes into the pane: a natively-launched TUI cannot
      // accept structured input. This is the ceiling of attach mode.
      if (msg.tmuxName && typeof msg.text === 'string') {
        sendAiInput(String(msg.tmuxName), msg.text);
      }
      break;
    }

    case 'kill_tmux': {
      // Force-kill a tmux session by name (used by the Terminals "kill" action).
      // Kills the session and every process in it; any attached client PTY exits.
      // An already-gone session counts as success; a broken tmux reports the
      // real error so the UI can tell "killed" from "failed".
      const killed = await killTmuxSession(msg.name);
      if (!killed.ok) {
        console.error(`[devdash-agent] kill_tmux ${msg.name} failed: ${killed.error}`);
      }
      ws.send(JSON.stringify({
        type: 'kill_tmux_result',
        requestId: msg.requestId,
        ok: killed.ok,
        error: killed.error,
      }));
      break;
    }

    case 'http_request': {
      try {
        const url = msg.baseUrl
          ? `${msg.baseUrl}${msg.path}`
          : `http://localhost:${msg.port}${msg.path}`;
        const fetchOpts: RequestInit = {
          method: msg.method || 'GET',
          headers: msg.headers || {},
        };
        // Only attach body for methods that support it
        if (msg.body && !['GET', 'HEAD'].includes((msg.method || 'GET').toUpperCase())) {
          fetchOpts.body = Buffer.from(msg.body, 'base64');
        }
        const resp = await fetch(url, fetchOpts);
        const bodyBuf = Buffer.from(await resp.arrayBuffer());
        const respHeaders: Record<string, string> = {};
        resp.headers.forEach((val, key) => { respHeaders[key] = val; });
        ws.send(JSON.stringify({
          type: 'http_response',
          requestId: msg.requestId,
          status: resp.status,
          headers: respHeaders,
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

    default:
      console.warn('[devdash-agent] Unknown message type:', msg.type);
  }
}
