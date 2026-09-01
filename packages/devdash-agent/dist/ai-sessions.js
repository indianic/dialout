"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPLAY_LIMIT = void 0;
exports.launchedTranscript = launchedTranscript;
exports.listLaunchedSessions = listLaunchedSessions;
exports.discoverAiSessions = discoverAiSessions;
exports.createAiSession = createAiSession;
exports.deleteAiSession = deleteAiSession;
exports.openAiSession = openAiSession;
exports.closeAiSession = closeAiSession;
exports.closeAllAiSessions = closeAllAiSessions;
exports.sendKeysArgs = sendKeysArgs;
exports.sendAiInput = sendAiInput;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const ai_session_detector_1 = require("./ai-session-detector");
const ai_transcript_locator_1 = require("./ai-transcript-locator");
const ai_launch_1 = require("./ai-launch");
const os = __importStar(require("os"));
const crypto_1 = require("crypto");
const ai_transcript_tail_1 = require("./ai-transcript-tail");
const ai_adapters_1 = require("./ai-adapters");
const ai_status_1 = require("./ai-status");
const tmux_manager_1 = require("./tmux-manager");
const shared_1 = require("@dialout/shared");
Object.defineProperty(exports, "REPLAY_LIMIT", { enumerable: true, get: function () { return shared_1.REPLAY_LIMIT; } });
const open = new Map();
function defaultPanePid(tmuxName) {
    try {
        const out = (0, child_process_1.execFileSync)('tmux', ['list-panes', '-t', tmuxName, '-F', '#{pane_pid}'], { timeout: 5000, stdio: 'pipe' }).toString();
        return parseInt(out.split('\n')[0], 10) || 0;
    }
    catch {
        return 0;
    }
}
// The label that keeps two Claude subscriptions on one machine apart. DevDash
// never sees an account — only which config home the process was started with.
function defaultProfileOf(pid) {
    try {
        const env = process.platform === 'linux'
            ? fs.readFileSync(`/proc/${pid}/environ`, 'utf8')
            : (0, child_process_1.execFileSync)('ps', ['eww', '-p', String(pid), '-o', 'command='], { timeout: 5000, stdio: 'pipe' }).toString();
        const m = env.match(/CLAUDE_CONFIG_DIR=([^\s\0]+)/);
        if (!m)
            return 'default';
        const parts = m[1].split('/').filter(Boolean);
        return parts[parts.length - 1] || 'default';
    }
    catch {
        return 'default';
    }
}
function launchedTranscript(rec) {
    // Must match the config home the CHILD will actually use, not a guess. The
    // child inherits the agent's environment, so an agent started under a
    // non-default CLAUDE_CONFIG_DIR writes its transcripts there — predicting
    // ~/.claude would point at a file that never appears.
    const home = rec.configHome
        || process.env.CLAUDE_CONFIG_DIR
        || `${os.homedir()}/.claude`;
    return `${(0, ai_transcript_locator_1.claudeProjectDir)(home, rec.cwd)}/${rec.sessionId}.jsonl`;
}
// Launched sessions are not tmux sessions, so they are listed from the agent's
// own registry rather than discovered. Their transcript path is deterministic
// because DevDash chose the session id when it started them.
function listLaunchedSessions() {
    return (0, ai_launch_1.listRecords)().map((rec) => {
        const live = open.get((0, ai_launch_1.launchId)(rec.sessionId));
        const running = (0, ai_launch_1.isTurnRunning)(rec.sessionId);
        return {
            tmuxName: (0, ai_launch_1.launchId)(rec.sessionId),
            kind: rec.kind,
            title: live?.title || rec.title || rec.sessionId.slice(0, 8),
            folder: rec.cwd.split('/').filter(Boolean).pop() || '',
            folderPath: rec.cwd,
            gitBranch: '',
            profile: rec.configHome ? rec.configHome.split('/').filter(Boolean).pop() : 'default',
            // A turn in flight is definitive: the process is running right now, so
            // there is no need to infer 'working' from transcript timing.
            status: running
                ? 'working'
                : (live ? (0, ai_status_1.deriveStatus)(live.events, live.tail.lastGrowthMs, Date.now()) : 'waiting_input'),
            origin: 'launched',
            permissionMode: rec.permissionMode,
            updatedAt: rec.createdAt,
            transcript: launchedTranscript(rec),
        };
    });
}
async function discoverAiSessions(deps = {}) {
    const list = deps.listSessions || tmux_manager_1.listSessions;
    const panePid = deps.panePid || defaultPanePid;
    const table = deps.processTable || (() => (0, ai_session_detector_1.readProcessTable)());
    const locate = deps.locate
        || ((pid, kind, exclude) => (0, ai_transcript_locator_1.locateTranscript)(pid, kind, { exclude }));
    const procStartMs = deps.procStartMs || ai_transcript_locator_1.defaultProcStartMs;
    const profileOf = deps.profileOf || defaultProfileOf;
    const rows = await table();
    // Resolve the agent process for every pane first, then claim transcripts
    // newest-process-first. Two claude sessions in one folder under one config
    // home both match the same directory, so without a claim set the newer one
    // wins twice and the older pane shows the newer pane's conversation.
    // Verified live on 2026-08-21: two panes, two pids, one transcript.
    const panes = [];
    for (const session of await list()) {
        const pid = panePid(session.name);
        if (!pid)
            continue;
        const agent = (0, ai_session_detector_1.findAgentInPane)(rows, pid);
        if (!agent)
            continue;
        panes.push({ session, agent, startedAt: procStartMs(agent.pid) });
    }
    panes.sort((a, b) => b.startedAt - a.startedAt);
    const claimed = new Set();
    const out = [];
    for (const { session, agent } of panes) {
        // A session whose transcript cannot be found is not showable as chat.
        // Listing it would produce a row that opens into permanent emptiness.
        const transcript = locate(agent.pid, agent.kind, claimed);
        if (!transcript)
            continue;
        claimed.add(transcript);
        const live = open.get(session.name);
        out.push({
            tmuxName: session.name,
            kind: agent.kind,
            title: live?.title || session.folder || session.name,
            folder: session.folder || '',
            folderPath: session.folderPath || '',
            gitBranch: session.gitBranch || '',
            profile: profileOf(agent.pid),
            status: live ? (0, ai_status_1.deriveStatus)(live.events, live.tail.lastGrowthMs, Date.now()) : 'idle',
            origin: 'tmux',
            updatedAt: (session.lastActivity || 0) * 1000,
            transcript,
        });
    }
    // Launched sessions come from the registry, not from tmux, and are listed
    // alongside so the user sees one list rather than two.
    return [...out, ...(deps.listSessions ? [] : listLaunchedSessions())];
}
// Start a brand-new session and send its first message. Returns the id the
// browser should open, or null if the request was unusable.
function createAiSession(opts) {
    const cwd = String(opts.cwd || '').trim();
    const prompt = String(opts.prompt || '').trim();
    // An absolute path only: a relative one would resolve against the agent's
    // own working directory, which is not where the user thinks they are.
    if (!cwd.startsWith('/') || !prompt)
        return null;
    try {
        if (!fs.statSync(cwd).isDirectory())
            return null;
    }
    catch {
        return null;
    }
    const mode = ai_launch_1.PERMISSION_MODES.includes(String(opts.permissionMode))
        ? opts.permissionMode
        : 'default';
    const rec = {
        sessionId: (0, crypto_1.randomUUID)(),
        kind: opts.kind === 'codex' ? 'codex' : 'claude',
        cwd,
        // The first prompt is the best title we have until the CLI writes its own.
        title: prompt.slice(0, 60),
        permissionMode: mode,
        configHome: String(opts.configHome || ''),
        createdAt: Date.now(),
    };
    (0, ai_launch_1.addRecord)(rec);
    (0, ai_launch_1.runTurn)(rec, prompt, true);
    return (0, ai_launch_1.launchId)(rec.sessionId);
}
function deleteAiSession(id) {
    const sessionId = (0, ai_launch_1.parseLaunchId)(id);
    if (!sessionId)
        return false;
    (0, ai_launch_1.stopTurn)(sessionId);
    closeAiSession(id);
    (0, ai_launch_1.removeRecord)(sessionId);
    return true;
}
function openAiSession(tmuxName, onEvents) {
    closeAiSession(tmuxName);
    void (async () => {
        // Ask discovery rather than resolving again: it is the only place that
        // claims transcripts across all panes, so re-resolving here in isolation
        // would race the other panes and could pick a different file than the row
        // the user tapped.
        const row = (0, ai_launch_1.isLaunchId)(tmuxName)
            ? listLaunchedSessions().find((r) => r.tmuxName === tmuxName)
            : (await discoverAiSessions()).find((r) => r.tmuxName === tmuxName);
        if (!row || !row.transcript)
            return;
        const path = row.transcript;
        const adapter = (0, ai_adapters_1.adapterFor)(row.kind);
        const live = {
            tail: null,
            events: [], kind: row.kind, title: '',
        };
        live.tail = new ai_transcript_tail_1.TranscriptTail(path, (records) => {
            const batch = [];
            for (const record of records) {
                const title = adapter.title(record);
                if (title)
                    live.title = title;
                batch.push(...adapter.toEvents(record));
            }
            live.events.push(...batch);
            // Bound memory: a long session's transcript is unbounded, the agent's
            // heap is not.
            if (live.events.length > shared_1.REPLAY_LIMIT * 5) {
                live.events = live.events.slice(-shared_1.REPLAY_LIMIT * 5);
            }
            if (batch.length) {
                onEvents(batch, (0, ai_status_1.deriveStatus)(live.events, live.tail.lastGrowthMs, Date.now()));
            }
        });
        open.set(tmuxName, live);
        live.tail.start();
    })();
}
function closeAiSession(tmuxName) {
    const live = open.get(tmuxName);
    if (!live)
        return;
    live.tail.stop();
    open.delete(tmuxName);
}
function closeAllAiSessions() {
    for (const name of Array.from(open.keys()))
        closeAiSession(name);
    // Turns are child processes; leaving them running after a disconnect would
    // orphan them with nobody reading the result.
    (0, ai_launch_1.stopAllTurns)();
}
// Named keys must be sent as key presses, not literal text: sending the byte
// 0x03 literally types a control character into the buffer instead of
// interrupting the agent.
const NAMED_KEYS = {
    '\u001b': 'Escape',
    '\u0003': 'C-c',
    '\r': 'Enter',
    '\t': 'Tab',
};
function sendKeysArgs(tmuxName, text) {
    const named = NAMED_KEYS[text];
    if (named)
        return [['send-keys', '-t', tmuxName, named]];
    return [
        // `-l` sends literally; `--` stops tmux parsing text that starts with '-'
        // as an option, which would otherwise let composed text run tmux commands.
        ['send-keys', '-t', tmuxName, '-l', '--', text],
        ['send-keys', '-t', tmuxName, 'Enter'],
    ];
}
function sendAiInput(tmuxName, text, deps = {}) {
    // A launched session takes structured input on stdin; a tmux one takes
    // keystrokes. Same call site, different mechanism.
    const sessionId = (0, ai_launch_1.parseLaunchId)(tmuxName);
    if (sessionId) {
        const rec = (0, ai_launch_1.listRecords)().find((r) => r.sessionId === sessionId);
        if (rec)
            (0, ai_launch_1.runTurn)(rec, text, false);
        return;
    }
    const run = deps.run || ((args) => {
        (0, child_process_1.execFile)('tmux', args, { timeout: 5000 }, () => { });
    });
    for (const args of sendKeysArgs(tmuxName, text))
        run(args);
}
//# sourceMappingURL=ai-sessions.js.map