import type { AiCommand, McpServerInfo, CapabilityDeps } from './types';
export declare function parseGrokCommandTable(readme: string): AiCommand[];
export declare function grokCommands(deps?: CapabilityDeps): AiCommand[];
export declare function grokMcpServers(cwd: string, repoRoot: string, deps?: CapabilityDeps): McpServerInfo[];
//# sourceMappingURL=grok.d.ts.map