import { AiEvent, AiStatus } from './ai-adapters/types';
export declare const IDLE_MS = 300000;
export declare const APPROVAL_MS = 3000;
export declare const INPUT_MS = 2000;
export declare function deriveStatus(events: AiEvent[], lastGrowthMs: number, nowMs: number): AiStatus;
//# sourceMappingURL=ai-status.d.ts.map