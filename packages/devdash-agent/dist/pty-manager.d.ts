import type WebSocket from 'ws';
export declare function setActiveSocket(ws: WebSocket | null): void;
export declare function isPtyAvailable(): boolean;
export declare function openSession(id: string, command: string, cwd: string, cols?: number, rows?: number, opts?: {
    coworkWrap?: boolean;
}): boolean;
export interface CopyVerbDeps {
    platform?: NodeJS.Platform;
    hasCommand?: (bin: string) => boolean;
}
export declare function clipboardCommand(deps?: CopyVerbDeps): string | null;
export declare function copyVerb(deps?: CopyVerbDeps): string[];
export declare function clipboardBindings(): string[][];
export declare function applyNativeTmuxOptions(): void;
export interface SessionExistsDeps {
    /** Injected in tests; defaults to `tmux list-sessions -F '#{session_name}'`. */
    list?: () => string;
}
export declare function tmuxSessionExists(name: string, deps?: SessionExistsDeps): boolean;
export declare function applyBrowserSessionOptions(name: string): void;
export declare function openAttach(id: string, tmuxName: string, readOnly: boolean, cols?: number, rows?: number): boolean;
export declare function writeToSession(id: string, data: string): void;
export declare function resizeSession(id: string, cols: number, rows: number): void;
export declare function closeSession(id: string): Promise<void>;
export declare function detachPtySession(id: string): void;
export declare function closeAllSessions(): void;
export declare function getActiveSessions(): string[];
//# sourceMappingURL=pty-manager.d.ts.map