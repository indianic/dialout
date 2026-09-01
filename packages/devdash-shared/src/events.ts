// The one shape the whole feature speaks. The browser never learns which
// vendor produced a session, which is the entire point of the adapter layer.

export type AiStatus = 'working' | 'waiting_input' | 'waiting_approval' | 'idle';

export type AiEvent =
  | { kind: 'message';     role: 'user' | 'assistant'; text: string; id?: string; at?: string }
  | { kind: 'tool_call';   name: string; summary: string; input?: unknown; id?: string; at?: string }
  | { kind: 'tool_result'; forId: string; ok: boolean; preview: string; at?: string }
  | { kind: 'thinking';    text: string; id?: string; at?: string }
  | { kind: 'state';       status: AiStatus; at?: string };

export interface AiAdapter {
  // Never throws. An unrecognised record yields [].
  toEvents(record: unknown): AiEvent[];
  // A display title if this record carries one, else null.
  title(record: unknown): string | null;
}

// Tool output is routinely megabytes (a full test run, a large file read).
// Only a preview crosses the socket; the full text is never needed to follow
// a conversation, and shipping it would stall a phone on mobile data.
export const PREVIEW_LIMIT = 2000;

export function preview(text: string): string {
  return text.length <= PREVIEW_LIMIT ? text : `${text.slice(0, PREVIEW_LIMIT)}\n…truncated`;
}
