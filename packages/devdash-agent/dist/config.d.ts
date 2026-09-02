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
/**
 * Where the agent keeps config, logs, the pid file and the watchdog.
 *
 * `configDirFor` is parameterised on the home directory so the service
 * installer and its tests can resolve the same path for a home other than the
 * current user's.
 */
export declare function configDirFor(homedir: string): string;
/** The pre-rename location, kept only so an existing install can be migrated. */
export declare function legacyConfigDirFor(homedir: string): string;
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