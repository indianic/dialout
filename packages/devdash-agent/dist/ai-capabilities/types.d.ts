import type { AiKind } from '@dialout/shared';
export type { CommandSource, AiCommand, McpServerInfo, AiCapabilities } from '@dialout/shared';
export interface CapabilityDeps {
    homeDir?: () => string;
    readFile?: (path: string) => string | null;
    readDir?: (path: string) => string[];
    isDir?: (path: string) => boolean;
    exists?: (path: string) => boolean;
}
export type { AiKind };
//# sourceMappingURL=types.d.ts.map