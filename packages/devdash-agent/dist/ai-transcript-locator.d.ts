import { AiKind } from './ai-session-detector';
export interface LocatorDeps {
    writeHandles?: (pid: number) => string[];
    procCwd?: (pid: number) => string;
    procEnv?: (pid: number) => Record<string, string>;
    procStartMs?: (pid: number) => number;
    listJsonl?: (dir: string) => {
        path: string;
        mtimeMs: number;
    }[];
    transcriptCwds?: (path: string) => string[];
    exclude?: Set<string>;
    /** Grok's own pid -> session map; see grokTranscript(). */
    grokSessions?: (home: string) => GrokSession[];
    /** Newest chat_history.jsonl under a grok cwd directory, for the fallback. */
    grokNewest?: (cwdDir: string) => {
        path: string;
        mtimeMs: number;
    }[];
}
export interface GrokSession {
    session_id: string;
    pid: number;
    cwd: string;
}
export declare function grokTranscriptPath(home: string, cwd: string, sessionId: string): string;
export declare function claudeProjectDir(configHome: string, cwd: string): string;
export declare function defaultProcStartMs(pid: number): number;
export declare function pickNewest(files: {
    path: string;
    mtimeMs: number;
}[]): string | null;
export declare function grokTranscript(pid: number, home: string, deps?: LocatorDeps): string | null;
export declare function locateTranscript(pid: number, kind: AiKind, deps?: LocatorDeps): string | null;
//# sourceMappingURL=ai-transcript-locator.d.ts.map