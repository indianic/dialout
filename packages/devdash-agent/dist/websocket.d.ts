import { AgentConfig } from './config';
export declare const RECONNECT_BASE_MS = 1000;
export declare const RECONNECT_MAX_MS = 60000;
export declare function reconnectDelay(attempt: number, rand?: () => number): number;
export declare function connect(config: AgentConfig, onConnected?: () => void): void;
export declare function disconnect(): void;
export declare function isConnected(): boolean;
//# sourceMappingURL=websocket.d.ts.map