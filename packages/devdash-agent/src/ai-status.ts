import { AiEvent, AiStatus } from './ai-adapters/types';

// Status is derived from the transcript alone, never from the TUI.
//
// The rules overlap by construction — an unresolved tool call is also a
// growing transcript — so they are evaluated in order and the first match
// wins. Changing the order changes the meaning.

export const IDLE_MS = 300_000;
export const APPROVAL_MS = 3_000;
export const INPUT_MS = 2_000;

export function deriveStatus(
  events: AiEvent[],
  lastGrowthMs: number,
  nowMs: number
): AiStatus {
  if (!events.length) return 'idle';
  const quietFor = nowMs - lastGrowthMs;

  // 1. Nothing has happened for a long time.
  if (quietFor > IDLE_MS) return 'idle';

  // 2. A tool call with no matching result. In attach mode the permission
  // prompt itself is not a typed event, so an unresolved call that has sat
  // still is the best available signal that the CLI is asking to proceed.
  const resolved = new Set<string>();
  for (const e of events) if (e.kind === 'tool_result') resolved.add(e.forId);
  const unresolved = events.some((e) => e.kind === 'tool_call' && !!e.id && !resolved.has(e.id));
  if (unresolved && quietFor > APPROVAL_MS) return 'waiting_approval';

  // 3. A complete assistant message that has settled: the agent has finished
  // and the ball is with the user.
  const last = events[events.length - 1];
  if (last.kind === 'message' && last.role === 'assistant' && quietFor > INPUT_MS) {
    return 'waiting_input';
  }

  // 4. Anything else: the transcript is advancing, or the last thing said was
  // the user's and a reply is owed.
  return 'working';
}
