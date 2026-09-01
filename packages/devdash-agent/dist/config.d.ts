export interface ProfileConfig {
    serverUrl: string;
    apiKey: string;
}
export interface AgentConfig {
    serverUrl: string;
    apiKey: string;
    activeProfile?: string;
    profiles?: Record<string, ProfileConfig>;
    scanPorts: number[];
    scanRange: {
        from: number;
        to: number;
    };
    heartbeatInterval: number;
    cronInterval: number;
    cowork?: boolean;
    /** Terminal-app tokens whose shells auto-wrap into tmux for remote access. */
    coworkTerminals?: string[];
}
export declare const DEFAULT_SERVER_URL = "wss://www.dialout.dev/ws";
export declare const DEFAULT_LOCAL_SERVER_URL = "ws://localhost:50052";
export declare function getConfigDir(): string;
export declare function getPidFile(): string;
export declare function ensureConfigDir(): void;
export declare function loadConfig(): AgentConfig;
export declare function applyProfile(config: AgentConfig, name?: string): AgentConfig;
export declare function saveProfile(name: string, profile: ProfileConfig, makeActive?: boolean): AgentConfig;
export declare function saveConfig(config: AgentConfig): void;
export declare function getConfigPath(): string;
//# sourceMappingURL=config.d.ts.map