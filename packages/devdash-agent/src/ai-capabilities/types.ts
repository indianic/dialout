import type { AiKind } from '@dialout/shared';

export type { CommandSource, AiCommand, McpServerInfo, AiCapabilities } from '@dialout/shared';

// Every disk read goes through here so tests never touch a real home dir.
export interface CapabilityDeps {
  homeDir?: () => string;
  readFile?: (path: string) => string | null;   // null when unreadable
  readDir?: (path: string) => string[];         // [] when unreadable
  isDir?: (path: string) => boolean;
  exists?: (path: string) => boolean;
}

export type { AiKind };
