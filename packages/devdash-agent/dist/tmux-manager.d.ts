export interface TmuxSessionInfo {
    name: string;
    createdAt: number;
    attached: number;
    lastActivity: number;
    width: number;
    height: number;
    termProgram: string;
    origin: 'native' | 'browser';
    folder: string;
    folderPath: string;
    createdLocal: string;
    gitBranch: string;
}
export declare const SEP = "\u001F";
export declare function tmuxLocaleEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export declare function tmuxAvailable(now?: () => number): Promise<boolean>;
/** Test seam: forget the cached probe result. */
export declare function resetTmuxAvailableCache(): void;
export declare function parseSessionLine(line: string): Omit<TmuxSessionInfo, 'termProgram' | 'origin'> | null;
export declare function getSessionOption(name: string, option: string): Promise<string>;
export declare function listSessions(): Promise<TmuxSessionInfo[]>;
export declare function tmuxSessionName(id: string): string;
export interface KillDeps {
    run?: (args: string[]) => Promise<string>;
}
export interface KillResult {
    ok: boolean;
    error?: string;
}
export declare function killTmuxSession(name: string, deps?: KillDeps): Promise<KillResult>;
export declare function countClients(name: string): Promise<number>;
export declare function tailLines(text: string, lines: number): string;
export declare function capturePane(name: string, lines: number): Promise<string>;
//# sourceMappingURL=tmux-manager.d.ts.map