import WebSocket from 'ws';

let heartbeatTimer: NodeJS.Timeout | null = null;
let lastPongAt: number | null = null;

// How many heartbeat intervals of silence before the socket is declared dead.
// 2.5 tolerates one dropped heartbeat plus jitter without a false positive.
export const STALE_MULTIPLIER = 2.5;

// The server answers every `heartbeat` with a `pong`. If pongs stop arriving
// the socket is half-open: sends still "succeed" into a dead TCP connection and
// 'close' may not fire for many minutes, so nothing would trigger a reconnect.
export function isConnectionStale(
  lastPong: number | null,
  now: number,
  intervalMs: number
): boolean {
  if (lastPong === null) return false; // no pong expected yet
  return now - lastPong > intervalMs * STALE_MULTIPLIER;
}

export function notePong(): void {
  lastPongAt = Date.now();
}

export function startHeartbeat(ws: WebSocket, intervalMs: number, onStale?: () => void): void {
  stopHeartbeat();
  lastPongAt = Date.now(); // treat connect as a fresh pong
  heartbeatTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (isConnectionStale(lastPongAt, Date.now(), intervalMs)) {
      console.error('[dialout] No pong from server — connection is dead, reconnecting');
      stopHeartbeat();
      onStale?.();
      return;
    }
    ws.send(JSON.stringify({ type: 'heartbeat', ts: Date.now() }));
  }, intervalMs);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  lastPongAt = null;
}
