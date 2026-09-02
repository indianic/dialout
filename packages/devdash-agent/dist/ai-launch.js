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
exports.PERMISSION_MODES = void 0;
exports.launchId = launchId;
exports.isLaunchId = isLaunchId;
exports.parseLaunchId = parseLaunchId;
exports.buildLaunchArgs = buildLaunchArgs;
exports.listRecords = listRecords;
exports.addRecord = addRecord;
exports.removeRecord = removeRecord;
exports.isTurnRunning = isTurnRunning;
exports.runningSessionIds = runningSessionIds;
exports.runTurn = runTurn;
exports.stopTurn = stopTurn;
exports.stopAllTurns = stopAllTurns;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const shared_1 = require("@dialout/shared");
Object.defineProperty(exports, "PERMISSION_MODES", { enumerable: true, get: function () { return shared_1.PERMISSION_MODES; } });
const config_1 = require("./config");
// Launch mode: sessions DevDash starts, rather than ones the user started in
// their own terminal.
//
// Turn-based by design. Each message spawns
//   claude -p --resume <uuid> --input-format stream-json --output-format stream-json
// which runs that one turn, appends to the session's transcript, and exits.
// There is no long-lived child to supervise, an agent restart loses nothing,
// and a session stays resumable forever because the transcript IS the state.
//
// The transcript it writes is byte-identical in shape and location to the one
// a native session writes, so the entire attach-mode read path — tail,
// adapter, status — works on launched sessions with no changes at all.
//
// What this deliberately does NOT do is per-tool Allow/Deny. Verified against
// CLI 2.1.238 on 2026-08-21: --permission-mode manual emits no permission
// event over stream-json (the tool simply runs), and there is no
// --permission-prompt-tool flag. A canUseTool callback exists only in the
// Agent SDK. So the trust level is chosen once, at launch.
const LAUNCH_PREFIX = 'launch:';
// Launched sessions share a list with tmux ones, so their ids are namespaced.
// A tmux session cannot contain ':' in a name that reaches us, so the two can
// never be confused.
function launchId(sessionId) {
    return `${LAUNCH_PREFIX}${sessionId}`;
}
function isLaunchId(id) {
    return id.startsWith(LAUNCH_PREFIX);
}
function parseLaunchId(id) {
    return isLaunchId(id) ? id.slice(LAUNCH_PREFIX.length) : null;
}
function safeMode(mode) {
    return shared_1.PERMISSION_MODES.includes(mode)
        ? mode
        : 'default';
}
function buildLaunchArgs(rec, firstTurn) {
    if (rec.kind === 'codex') {
        // Codex has no --session-id; it names its own rollout file. Resuming is
        // done by its own subcommand, so v1 launches a fresh codex exec per turn
        // and relies on the rollout for history.
        return ['exec', '--json', '-'];
    }
    return [
        '-p',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--verbose',
        ...(firstTurn ? ['--session-id', rec.sessionId] : ['--resume', rec.sessionId]),
        '--permission-mode', safeMode(rec.permissionMode),
    ];
}
function registryPath() {
    return path.join((0, config_1.configDirFor)(os.homedir()), 'ai-launched.json');
}
function defaultRead() {
    return fs.readFileSync(registryPath(), 'utf8');
}
function defaultWrite(text) {
    const file = registryPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
}
function listRecords(deps = {}) {
    const read = deps.read || defaultRead;
    try {
        const parsed = JSON.parse(read());
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        // Missing or corrupt. An unreadable registry must not take the agent down
        // with it; the worst case is that launched sessions stop being listed.
        return [];
    }
}
function addRecord(rec, deps = {}) {
    const write = deps.write || defaultWrite;
    const others = listRecords(deps).filter((r) => r.sessionId !== rec.sessionId);
    write(JSON.stringify([...others, rec], null, 2));
}
function removeRecord(sessionId, deps = {}) {
    const write = deps.write || defaultWrite;
    write(JSON.stringify(listRecords(deps).filter((r) => r.sessionId !== sessionId), null, 2));
}
// --- running turns ----------------------------------------------------------
// sessionId -> the child currently running a turn for it. Presence here is
// what makes a launched session read as 'working'.
const running = new Map();
function isTurnRunning(sessionId) {
    return running.has(sessionId);
}
function runningSessionIds() {
    return Array.from(running.keys());
}
// Send one message and let the turn run to completion in the background.
// Returns immediately: the answer arrives through the transcript tail, exactly
// as it does for a session the user started themselves.
function runTurn(rec, text, firstTurn, onDone, deps = {}) {
    if (running.has(rec.sessionId)) {
        // A turn is already in flight. Claude Code cannot process two at once, and
        // resuming the same session twice would fork the transcript.
        return;
    }
    const args = buildLaunchArgs(rec, firstTurn);
    const message = JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text }] },
    });
    const spawnTurn = deps.spawnTurn || ((r, a, input) => {
        const env = { ...process.env };
        if (r.configHome)
            env.CLAUDE_CONFIG_DIR = r.configHome;
        const child = (0, child_process_1.spawn)(r.kind === 'claude' ? 'claude' : 'codex', a, {
            cwd: r.cwd,
            env,
            stdio: ['pipe', 'ignore', 'ignore'],
        });
        // stdout is ignored on purpose: the transcript on disk is the source of
        // truth and is already being tailed. Reading both would double-render.
        try {
            child.stdin.write(`${input}\n`);
            child.stdin.end();
        }
        catch { /* the child died before we could write; 'close' still fires */ }
        return child;
    });
    let child;
    try {
        child = spawnTurn(rec, args, message);
    }
    catch {
        onDone?.(false);
        return;
    }
    running.set(rec.sessionId, { startedAt: Date.now(), kill: () => { try {
            child.kill();
        }
        catch { /* already gone */ } } });
    child.on('close', (code) => {
        running.delete(rec.sessionId);
        onDone?.(code === 0);
    });
    child.on('error', () => {
        running.delete(rec.sessionId);
        onDone?.(false);
    });
}
function stopTurn(sessionId) {
    running.get(sessionId)?.kill();
    running.delete(sessionId);
}
function stopAllTurns() {
    for (const id of Array.from(running.keys()))
        stopTurn(id);
}
//# sourceMappingURL=ai-launch.js.map