import type { AiKind } from '@dialout/shared';
export type { AiKind };
export interface ProcRow {
    pid: number;
    ppid: number;
    command: string;
}
export declare function parseProcessTable(psOutput: string): ProcRow[];
export declare function descendantsOf(rows: ProcRow[], rootPid: number): ProcRow[];
export declare function classifyProcess(command: string): AiKind | null;
export declare function findAgentInPane(rows: ProcRow[], panePid: number): {
    pid: number;
    kind: AiKind;
} | null;
export interface ProcessTableDeps {
    run?: () => Promise<string>;
}
export declare function readProcessTable(deps?: ProcessTableDeps): Promise<ProcRow[]>;
//# sourceMappingURL=ai-session-detector.d.ts.map