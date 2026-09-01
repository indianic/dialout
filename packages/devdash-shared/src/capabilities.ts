import type { AiKind } from './kinds';

export type CommandSource = 'user' | 'project' | 'plugin' | 'builtin';

export interface AiCommand {
  name: string;          // without the leading slash
  alias?: string;        // Grok publishes these
  description: string;   // may be empty, never undefined
  source: CommandSource;
}

export interface McpServerInfo {
  name: string;
  scope: 'global' | 'project';
  transport: 'stdio' | 'http';
  enabled: boolean;
  origin: string;        // the file it came from
  command?: string;      // stdio only
  args?: string[];       // redacted before it leaves the machine
}

export interface AiCapabilities {
  kind: AiKind | string;
  commands: AiCommand[];
  mcpServers: McpServerInfo[];
  scannedAt: string;
  // Set by the server when the agent could not scan. That is not the same as
  // "this session has no commands" — three facts, three sentences.
  unavailable?: boolean;
}
