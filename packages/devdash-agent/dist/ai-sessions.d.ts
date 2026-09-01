import { AiKind, ProcRow } from './ai-session-detector';
import { LaunchedRecord } from './ai-launch';
import { AiEvent, AiStatus } from './ai-adapters';
import type { AiSessionSummary } from '@dialout/shared';
import { REPLAY_LIMIT } from '@dialout/shared';
export type { AiSessionSummary };
export { REPLAY_LIMIT };
export interface DiscoverDeps {
    listSessions?: () => Promise<any[]>;
    panePid?: (tmuxName: string) => number;
    processTable?: () => Promise<ProcRow[]>;
    locate?: (pid: number, kind: AiKind, exclude: Set<string>) => string | null;
    procStartMs?: (pid: number) => number;
    profileOf?: (pid: number) => string;
}
export declare function launchedTranscript(rec: LaunchedRecord): string;
export declare function listLaunchedSessions(): AiSessionSummary[];
export declare function discoverAiSessions(deps?: DiscoverDeps): Promise<AiSessionSummary[]>;
export interface CreateSessionOptions {
    kind?: AiKind;
    cwd: string;
    prompt: string;
    permissionMode?: string;
    configHome?: string;
}
export declare function createAiSession(opts: CreateSessionOptions): string | null;
export declare function deleteAiSession(id: string): boolean;
export declare function openAiSession(tmuxName: string, onEvents: (events: AiEvent[], status: AiStatus) => void): void;
export declare function closeAiSession(tmuxName: string): void;
export declare function closeAllAiSessions(): void;
export declare function sendKeysArgs(tmuxName: string, text: string): string[][];
export interface SendDeps {
    run?: (args: string[]) => void;
}
export declare function sendAiInput(tmuxName: string, text: string, deps?: SendDeps): void;
//# sourceMappingURL=ai-sessions.d.ts.map