import { AiKind, PermissionMode, PERMISSION_MODES } from '@dialout/shared';
export type { PermissionMode };
export { PERMISSION_MODES };
export interface LaunchedRecord {
    sessionId: string;
    kind: AiKind;
    cwd: string;
    title: string;
    permissionMode: PermissionMode;
    configHome: string;
    createdAt: number;
}
export declare function launchId(sessionId: string): string;
export declare function isLaunchId(id: string): boolean;
export declare function parseLaunchId(id: string): string | null;
export declare function buildLaunchArgs(rec: LaunchedRecord, firstTurn: boolean): string[];
export interface RegistryDeps {
    read?: () => string;
    write?: (text: string) => void;
}
export declare function listRecords(deps?: RegistryDeps): LaunchedRecord[];
export declare function addRecord(rec: LaunchedRecord, deps?: RegistryDeps): void;
export declare function removeRecord(sessionId: string, deps?: RegistryDeps): void;
export declare function isTurnRunning(sessionId: string): boolean;
export declare function runningSessionIds(): string[];
export interface RunTurnDeps {
    spawnTurn?: (rec: LaunchedRecord, args: string[], input: string) => {
        on: (event: string, cb: (...a: any[]) => void) => void;
        kill: () => void;
    };
}
export declare function runTurn(rec: LaunchedRecord, text: string, firstTurn: boolean, onDone?: (ok: boolean) => void, deps?: RunTurnDeps): void;
export declare function stopTurn(sessionId: string): void;
export declare function stopAllTurns(): void;
//# sourceMappingURL=ai-launch.d.ts.map