import { AiAdapter, AiEvent, preview } from './types';

// Codex writes ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl as
// { timestamp, type, payload } where type is
// session_meta | turn_context | event_msg | response_item | world_state.
//
// Everything the UI shows comes from response_item. Measured on a real 128-line
// rollout, its payload types are:
//
//   message                  19   role: developer 7 | user 3 | assistant 9
//   reasoning                20   summary EMPTY on all 20; text is encrypted
//   custom_tool_call         20   status 'completed' on all 20
//   custom_tool_call_output  20
//   function_call             1
//   function_call_output      1
//
// v1 of this adapter emitted only `message` and dropped the other 60 records.
// That was not merely shallow: deriveStatus() decides 'waiting_approval' by
// finding a tool_call with no matching tool_result, so a Codex session could
// never report that status at all — it only ever read working/waiting_input/idle.

// Tool calls and their outputs are paired by `call_id`, NOT by `id`. The two
// records carry different ids for the same call — `ctc_…` on the call and
// `ctco_…` on the output — so pairing on `id` silently never matches and every
// call looks unresolved forever, which pins the session at 'waiting_approval'.
function callIdOf(payload: any): string {
  return String(payload.call_id || payload.id || '');
}

// Content and output blocks are [{type, text}] — but not every block has text:
// a real output carried 39 input_text blocks and 2 input_image blocks, the
// latter holding an image_url and no text at all. Joining `b.text` blindly is
// safe only because a missing one yields ''.
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((b: any) => (typeof b?.text === 'string' ? b.text : '')).join('');
  }
  return '';
}

export const codexAdapter: AiAdapter = {
  toEvents(record: unknown): AiEvent[] {
    const rec = record as any;
    if (!rec || typeof rec !== 'object') return [];
    if (rec.type !== 'response_item') return [];
    const payload = rec.payload;
    if (!payload || typeof payload !== 'object') return [];

    const at = typeof rec.timestamp === 'string' ? rec.timestamp : '';

    switch (payload.type) {
      case 'message': {
        // `developer` is Codex's own instruction block — sandbox permissions,
        // base instructions — injected into the conversation, and there were 7
        // of them in a 19-message transcript. v1 mapped every non-user role to
        // 'assistant', so all 7 rendered as things the agent had said.
        if (payload.role !== 'user' && payload.role !== 'assistant') return [];
        const text = textOf(payload.content);
        if (!text) return [];
        return [{
          kind: 'message',
          role: payload.role,
          text,
          id: String(payload.id || ''),
          at,
        }];
      }

      case 'reasoning': {
        // Codex encrypts its reasoning: `summary` was an empty array on all 20
        // records and the text lives in `encrypted_content`, which we cannot
        // read and must not surface as a blank thinking bubble. Emit only when
        // a summary actually carries text, so this starts working by itself if
        // Codex ever stops encrypting it.
        const text = textOf(payload.summary);
        if (!text) return [];
        return [{ kind: 'thinking', text, id: String(payload.id || ''), at }];
      }

      case 'custom_tool_call': {
        // `input` is a free-form string (a JS snippet for the exec tool), not
        // JSON, so it is passed through rather than parsed.
        const input = payload.input;
        return [{
          kind: 'tool_call',
          name: String(payload.name || 'tool'),
          summary: preview(typeof input === 'string' ? input : JSON.stringify(input ?? '')),
          input,
          id: callIdOf(payload),
          at,
        }];
      }

      case 'function_call': {
        // `arguments` IS a JSON string here. Parse it for structured input, but
        // never let malformed JSON drop the call — the raw string still tells
        // the user what ran.
        let input: unknown = payload.arguments;
        if (typeof payload.arguments === 'string') {
          try { input = JSON.parse(payload.arguments); } catch { /* keep the raw string */ }
        }
        return [{
          kind: 'tool_call',
          name: String(payload.name || 'tool'),
          summary: preview(typeof payload.arguments === 'string'
            ? payload.arguments
            : JSON.stringify(payload.arguments ?? '')),
          input,
          id: callIdOf(payload),
          at,
        }];
      }

      case 'custom_tool_call_output':
      case 'function_call_output': {
        return [{
          kind: 'tool_result',
          forId: callIdOf(payload),
          // No failure shape was observable: `status` appears only on the CALL
          // and was 'completed' on all 20, and outputs carry no error field.
          // Reporting ok:false on a guess would mark healthy results as errors.
          ok: true,
          preview: preview(textOf(payload.output)),
          at,
        }];
      }

      default:
        return [];
    }
  },

  title(record: unknown): string | null {
    const rec = record as any;
    if (!rec || typeof rec !== 'object') return null;
    // Codex records no user-facing title, so the folder is the best available.
    if (rec.type === 'session_meta' && typeof rec.payload?.cwd === 'string') {
      const parts = rec.payload.cwd.split('/').filter(Boolean);
      return parts[parts.length - 1] || null;
    }
    return null;
  },
};
