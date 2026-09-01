import WebSocket from 'ws';
export declare const STALE_MULTIPLIER = 2.5;
export declare function isConnectionStale(lastPong: number | null, now: number, intervalMs: number): boolean;
export declare function notePong(): void;
export declare function startHeartbeat(ws: WebSocket, intervalMs: number, onStale?: () => void): void;
export declare function stopHeartbeat(): void;
//# sourceMappingURL=heartbeat.d.ts.map