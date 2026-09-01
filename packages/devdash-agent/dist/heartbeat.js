"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STALE_MULTIPLIER = void 0;
exports.isConnectionStale = isConnectionStale;
exports.notePong = notePong;
exports.startHeartbeat = startHeartbeat;
exports.stopHeartbeat = stopHeartbeat;
const ws_1 = __importDefault(require("ws"));
let heartbeatTimer = null;
let lastPongAt = null;
// How many heartbeat intervals of silence before the socket is declared dead.
// 2.5 tolerates one dropped heartbeat plus jitter without a false positive.
exports.STALE_MULTIPLIER = 2.5;
// The server answers every `heartbeat` with a `pong`. If pongs stop arriving
// the socket is half-open: sends still "succeed" into a dead TCP connection and
// 'close' may not fire for many minutes, so nothing would trigger a reconnect.
function isConnectionStale(lastPong, now, intervalMs) {
    if (lastPong === null)
        return false; // no pong expected yet
    return now - lastPong > intervalMs * exports.STALE_MULTIPLIER;
}
function notePong() {
    lastPongAt = Date.now();
}
function startHeartbeat(ws, intervalMs, onStale) {
    stopHeartbeat();
    lastPongAt = Date.now(); // treat connect as a fresh pong
    heartbeatTimer = setInterval(() => {
        if (ws.readyState !== ws_1.default.OPEN)
            return;
        if (isConnectionStale(lastPongAt, Date.now(), intervalMs)) {
            console.error('[devdash-agent] No pong from server — connection is dead, reconnecting');
            stopHeartbeat();
            onStale?.();
            return;
        }
        ws.send(JSON.stringify({ type: 'heartbeat', ts: Date.now() }));
    }, intervalMs);
}
function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    lastPongAt = null;
}
//# sourceMappingURL=heartbeat.js.map