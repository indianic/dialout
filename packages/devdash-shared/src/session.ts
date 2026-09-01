import type { AiKind } from './kinds';
import type { AiStatus } from './events';
import type { PermissionMode } from './permission';

export interface AiSessionSummary {
  tmuxName: string;
  kind: AiKind;
  title: string;
  folder: string;
  folderPath: string;
  gitBranch: string;
  profile: string;
  status: AiStatus;
  // 'tmux' = you started it in your own terminal; 'launched' = DevDash did.
  origin: 'tmux' | 'launched';
  permissionMode?: PermissionMode;
  updatedAt: number;
  // Which file this row was built from, so opening the session resolves to
  // the same one rather than re-racing the other panes.
  transcript: string;
}

// Replay cap. Opening a month-old session must not flood the socket, and a
// phone cannot render ten thousand bubbles anyway.
export const REPLAY_LIMIT = 200;
