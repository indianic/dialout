"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECONNECT_MAX_MS = exports.RECONNECT_BASE_MS = void 0;
exports.reconnectDelay = reconnectDelay;
exports.connect = connect;
exports.disconnect = disconnect;
exports.isConnected = isConnected;
const ws_1 = __importDefault(require("ws"));
const heartbeat_1 = require("./heartbeat");
const port_scanner_1 = require("./port-scanner");
const fs_browser_1 = require("./fs-browser");
const project_scanner_1 = require("./project-scanner");
const command_runner_1 = require("./command-runner");
const pty_manager_1 = require("./pty-manager");
const tmux_manager_1 = require("./tmux-manager");
const ai_sessions_1 = require("./ai-sessions");
const ai_capabilities_1 = require("./ai-capabilities");
let ws = null;
let reconnectTimer = null;
let isShuttingDown = false;
let reconnectAttempt = 0;
exports.RECONNECT_BASE_MS = 1000;
exports.RECONNECT_MAX_MS = 60_000;
// Exponential backoff with +/-20% jitter. A flat delay made every agent in the
// fleet retry in lockstep and hammer the server the moment it went down; the
// jitter spreads the herd out across the window.
function reconnectDelay(attempt, rand = Math.random) {
    const raw = Math.min(exports.RECONNECT_BASE_MS * 2 ** (attempt - 1), exports.RECONNECT_MAX_MS);
    return Math.round(raw * (0.8 + rand() * 0.4));
}
let tmuxPollTimer = null;
let lastTmuxSnapshot = '';
const TMUX_POLL_MS = 5000;
const TMUX_RESYNC_MS = 60_000;
const PREVIEW_CAP = 5;
let lastTmuxSentAt = 0;
let reportedSinceConnect = false;
async function pollTmuxSessions() {
    if (!ws || ws.readyState !== ws_1.default.OPEN)
        return;
    if (!(await (0, tmux_manager_1.tmuxAvailable)()))
        return;
    try {
        const sessions = await (0, tmux_manager_1.listSessions)();
        const enriched = await Promise.all(sessions.map(async (s) => ({
            ...s,
            lastLines: await (0, tmux_manager_1.capturePane)(s.name, PREVIEW_CAP),
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
                console.log(`[dialout] reporting ${enriched.length} tmux session(s)`
                    + (enriched.length === 0
                        ? ` — none visible. uid=${uid}, locale=${locale}.`
                            + ' If you do have tmux sessions, compare that uid with `id -u`'
                            + ' (a daemon running as another user reads a different'
                            + ' /tmp/tmux-<uid> socket).'
                        : `: ${enriched.map((s) => s.name).join(', ')}`));
            }
        }
    }
    catch (err) {
        console.error('[dialout] tmux poll failed:', err.message);
    }
}
function startTmuxPolling() {
    stopTmuxPolling();
    lastTmuxSnapshot = '';
    reportedSinceConnect = false;
    tmuxPollTimer = setInterval(() => { void pollTmuxSessions(); }, TMUX_POLL_MS);
    void pollTmuxSessions(); // immediate sync on connect
}
function stopTmuxPolling() {
    if (tmuxPollTimer) {
        clearInterval(tmuxPollTimer);
        tmuxPollTimer = null;
    }
}
// AI sessions are discovered from the same tmux sessions the poll above
// reports, but resolving the process tree and the transcript for each one is
// far more work than a list-sessions, so it gets its own cadence and its own
// change-detection.
let aiPollTimer = null;
let lastAiSnapshot = '';
const AI_POLL_MS = 5000;
async function pollAiSessions() {
    if (!ws || ws.readyState !== ws_1.default.OPEN)
        return;
    try {
        const sessions = await (0, ai_sessions_1.discoverAiSessions)();
        const snapshot = JSON.stringify(sessions);
        if (snapshot === lastAiSnapshot)
            return;
        lastAiSnapshot = snapshot;
        ws.send(JSON.stringify({ type: 'ai_session_list', sessions }));
    }
    catch (err) {
        console.error('[dialout] ai session poll failed:', err.message);
    }
}
function startAiPolling() {
    stopAiPolling();
    lastAiSnapshot = '';
    aiPollTimer = setInterval(() => { void pollAiSessions(); }, AI_POLL_MS);
    void pollAiSessions();
}
function stopAiPolling() {
    if (aiPollTimer) {
        clearInterval(aiPollTimer);
        aiPollTimer = null;
    }
    // Tails are per-connection state: a reconnect re-opens whatever the browser
    // is still watching, and leaving them running would poll files nobody reads.
    (0, ai_sessions_1.closeAllAiSessions)();
}
function connect(config, onConnected) {
    isShuttingDown = false;
    const url = config.serverUrl.replace(/\/$/, '') + '/daemon';
    ws = new ws_1.default(url, {
        headers: { 'X-API-Key': config.apiKey },
    });
    ws.on('open', () => {
        console.log('[dialout] Connected to server');
        reconnectAttempt = 0; // a good connection resets the backoff
        (0, pty_manager_1.setActiveSocket)(ws);
        // A dead socket may never emit 'close' on its own — terminate() forces it,
        // which runs the 'close' handler and schedules the reconnect.
        (0, heartbeat_1.startHeartbeat)(ws, config.heartbeatInterval, () => {
            try {
                ws?.terminate();
            }
            catch { /* already gone */ }
        });
        startTmuxPolling();
        startAiPolling();
        // Reaper handshake. Detach timers live only in the ws-server's memory, so
        // a ws-server restart forgets every browser connection while our client
        // PTYs keep running with nothing on the other end. Reporting what we hold
        // lets the server answer pty_detach for the ones it no longer tracks. The
        // tmux sessions behind them are untouched either way — this reclaims
        // node-pty processes, it does not end anyone's work.
        ws.send(JSON.stringify({ type: 'active_ptys', ids: (0, pty_manager_1.getActiveSessions)() }));
        (0, pty_manager_1.applyNativeTmuxOptions)(); // native terminals (Hyper etc.) get mouse/scroll/no-status without a wrapper re-install
        onConnected?.();
    });
    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            handleMessage(msg, config);
        }
        catch (err) {
            console.error('[dialout] Invalid message:', err);
        }
    });
    ws.on('close', (code) => {
        console.log(`[dialout] Disconnected (code: ${code})`);
        (0, heartbeat_1.stopHeartbeat)();
        stopTmuxPolling();
        stopAiPolling();
        // Keep PTY sessions alive across reconnects — output resumes on the new
        // socket once we're back (sessions are only killed by explicit pty_close
        // or agent shutdown).
        scheduleReconnect(config, onConnected);
    });
    ws.on('error', (err) => {
        console.error('[dialout] WebSocket error:', err.message);
    });
}
function disconnect() {
    isShuttingDown = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    (0, heartbeat_1.stopHeartbeat)();
    stopTmuxPolling();
    stopAiPolling();
    (0, pty_manager_1.closeAllSessions)();
    if (ws) {
        ws.close();
        ws = null;
    }
}
function isConnected() {
    return ws !== null && ws.readyState === ws_1.default.OPEN;
}
function scheduleReconnect(config, onConnected) {
    if (isShuttingDown)
        return;
    if (reconnectTimer)
        return;
    const delay = reconnectDelay(++reconnectAttempt);
    console.log(`[dialout] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${reconnectAttempt})...`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect(config, onConnected);
    }, delay);
}
async function handleMessage(msg, config) {
    if (!ws || ws.readyState !== ws_1.default.OPEN)
        return;
    switch (msg.type) {
        case 'auth_ok':
            console.log(`[dialout] Authenticated as machine ${msg.machineId}`);
            break;
        case 'pong':
            // Server acknowledged heartbeat — proves the socket is still two-way.
            (0, heartbeat_1.notePong)();
            break;
        case 'port_scan_request': {
            const { ports, from, to } = msg;
            let openPorts;
            if (ports && Array.isArray(ports)) {
                openPorts = await (0, port_scanner_1.scanPorts)(ports);
            }
            else if (from != null && to != null) {
                openPorts = await (0, port_scanner_1.scanRange)(from, to);
            }
            else {
                openPorts = await (0, port_scanner_1.scanPorts)(config.scanPorts);
            }
            ws.send(JSON.stringify({ type: 'port_scan_result', requestId: msg.requestId, openPorts }));
            break;
        }
        case 'fs_browse': {
            const entries = (0, fs_browser_1.listDirectory)(msg.path || '/');
            ws.send(JSON.stringify({ type: 'fs_list', requestId: msg.requestId, path: msg.path, entries }));
            break;
        }
        case 'project_scan': {
            try {
                const projects = await (0, project_scanner_1.scanProjects)(msg.path || process.env.HOME || '/', msg.depth ?? 2);
                ws.send(JSON.stringify({ type: 'project_scan_result', requestId: msg.requestId, projects }));
            }
            catch (err) {
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
            const result = await (0, command_runner_1.runCommand)({
                command: msg.command || '',
                cwd: msg.cwd,
                background: !!msg.background,
                logName: msg.logName,
            });
            ws.send(JSON.stringify({ type: 'run_command_result', requestId: msg.requestId, ...result }));
            break;
        }
        case 'pty_open': {
            if (!(0, pty_manager_1.isPtyAvailable)()) {
                ws.send(JSON.stringify({ type: 'pty_error', id: msg.id, error: 'node-pty not available' }));
                break;
            }
            let opened;
            if (msg.tmuxSession) {
                opened = (0, pty_manager_1.openAttach)(msg.id, String(msg.tmuxSession), !!msg.readOnly, msg.cols || 80, msg.rows || 24);
            }
            else {
                opened = (0, pty_manager_1.openSession)(msg.id, msg.command || '', msg.cwd || process.env.HOME || '/', msg.cols || 80, msg.rows || 24, { coworkWrap: !!config.cowork });
            }
            if (!opened) {
                ws.send(JSON.stringify({ type: 'pty_error', id: msg.id, error: msg.tmuxSession ? 'Failed to attach to session' : 'Failed to open session' }));
            }
            break;
        }
        case 'pty_data': {
            (0, pty_manager_1.writeToSession)(msg.id, msg.data);
            break;
        }
        case 'pty_resize': {
            (0, pty_manager_1.resizeSession)(msg.id, msg.cols, msg.rows);
            break;
        }
        case 'pty_close': {
            void (0, pty_manager_1.closeSession)(msg.id);
            break;
        }
        case 'pty_detach': {
            // Browser is gone for good, but the work is not: drop our tmux client
            // and leave the session running. See detachPtySession().
            (0, pty_manager_1.detachPtySession)(msg.id);
            break;
        }
        case 'ai_session_list_request': {
            const sessions = await (0, ai_sessions_1.discoverAiSessions)();
            ws.send(JSON.stringify({ type: 'ai_session_list', requestId: msg.requestId, sessions }));
            break;
        }
        case 'ai_capabilities_request': {
            // cwd comes from the server, which took it from the session registry —
            // the agent does not re-derive it, so the answer matches the session the
            // user is actually looking at.
            const caps = (0, ai_capabilities_1.discoverCapabilities)(String(msg.kind || ''), String(msg.cwd || ''));
            ws.send(JSON.stringify({ type: 'ai_capabilities', requestId: msg.requestId, caps }));
            break;
        }
        case 'ai_session_open': {
            const name = String(msg.tmuxName || '');
            if (!name)
                break;
            (0, ai_sessions_1.openAiSession)(name, (events, status) => {
                if (ws && ws.readyState === ws_1.default.OPEN) {
                    ws.send(JSON.stringify({ type: 'ai_session_events', tmuxName: name, events, status }));
                }
            });
            break;
        }
        case 'ai_session_create': {
            const id = (0, ai_sessions_1.createAiSession)({
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
            const ok = (0, ai_sessions_1.deleteAiSession)(String(msg.id || ''));
            ws.send(JSON.stringify({
                type: 'ai_session_deleted', requestId: msg.requestId, ok,
            }));
            lastAiSnapshot = '';
            void pollAiSessions();
            break;
        }
        case 'ai_session_close': {
            (0, ai_sessions_1.closeAiSession)(String(msg.tmuxName || ''));
            break;
        }
        case 'ai_session_input': {
            // Input is keystrokes into the pane: a natively-launched TUI cannot
            // accept structured input. This is the ceiling of attach mode.
            if (msg.tmuxName && typeof msg.text === 'string') {
                (0, ai_sessions_1.sendAiInput)(String(msg.tmuxName), msg.text);
            }
            break;
        }
        case 'kill_tmux': {
            // Force-kill a tmux session by name (used by the Terminals "kill" action).
            // Kills the session and every process in it; any attached client PTY exits.
            // An already-gone session counts as success; a broken tmux reports the
            // real error so the UI can tell "killed" from "failed".
            const killed = await (0, tmux_manager_1.killTmuxSession)(msg.name);
            if (!killed.ok) {
                console.error(`[dialout] kill_tmux ${msg.name} failed: ${killed.error}`);
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
                const fetchOpts = {
                    method: msg.method || 'GET',
                    headers: msg.headers || {},
                };
                // Only attach body for methods that support it
                if (msg.body && !['GET', 'HEAD'].includes((msg.method || 'GET').toUpperCase())) {
                    fetchOpts.body = Buffer.from(msg.body, 'base64');
                }
                const resp = await fetch(url, fetchOpts);
                const bodyBuf = Buffer.from(await resp.arrayBuffer());
                const respHeaders = {};
                resp.headers.forEach((val, key) => { respHeaders[key] = val; });
                const b64 = bodyBuf.toString('base64');
                // Split a large body across several frames.
                //
                // A single frame carrying ~10 MB of base64 — a 7.6 MB dev-server chunk,
                // say — did not survive the hop to the server: the request never
                // completed and eventually timed out, while every smaller asset on the
                // same socket went through. That is why one big script could 404 on a
                // page whose other chunks all loaded.
                //
                // The threshold comes from the server on each request. An older server
                // does not send it, `chunkThreshold` is undefined, and this whole branch
                // is skipped — so the agent keeps behaving exactly as it does today
                // rather than sending frames the other end cannot reassemble.
                const threshold = typeof msg.chunkThreshold === 'number' && msg.chunkThreshold > 0
                    ? msg.chunkThreshold
                    : undefined;
                if (threshold && b64.length > threshold) {
                    const total = Math.ceil(b64.length / threshold);
                    for (let i = 0; i < total; i++) {
                        ws.send(JSON.stringify({
                            type: 'http_response_chunk',
                            requestId: msg.requestId,
                            index: i,
                            data: b64.slice(i * threshold, (i + 1) * threshold),
                        }));
                    }
                    // The metadata frame goes last and carries no body: it is what tells
                    // the server the parts are all sent and how many to expect, so a
                    // short delivery is detected rather than silently truncating.
                    ws.send(JSON.stringify({
                        type: 'http_response',
                        requestId: msg.requestId,
                        status: resp.status,
                        headers: respHeaders,
                        chunked: true,
                        totalChunks: total,
                    }));
                }
                else {
                    ws.send(JSON.stringify({
                        type: 'http_response',
                        requestId: msg.requestId,
                        status: resp.status,
                        headers: respHeaders,
                        body: b64,
                    }));
                }
            }
            catch (err) {
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
            console.warn('[dialout] Unknown message type:', msg.type);
    }
}
//# sourceMappingURL=websocket.js.map