"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.grokAdapter = void 0;
const types_1 = require("./types");
// Grok CLI writes a directory per session, not a single file:
//
//   ~/.grok/sessions/<encodeURIComponent(cwd)>/<session-uuid>/
//       chat_history.jsonl   the conversation
//       events.jsonl         telemetry
//       summary.json         title, cwd, timestamps
//
// We tail chat_history.jsonl. events.jsonl is tempting — it is the only file
// with timestamps, and it carries tool outcomes and permission decisions — but
// it is telemetry, not conversation: measured on a real session, 1843 of its
// 2011 records were `phase_changed`, and it contains no message text at all.
// Status is derived from the event stream and file growth (see ai-status.ts),
// which chat_history drives correctly on its own.
//
// Record types, measured on a real 57-line transcript 2026-08-21:
//   system       1   the system prompt
//   user         4   see the prompt_index rule below
//   reasoning   16   { id, summary: [{type, text}], encrypted_content, status }
//   assistant   16   { content: string, tool_calls: [{id, name, arguments}] }
//   tool_result 20   { tool_call_id, content: string }
// chat_history.jsonl records carry NO timestamp — only events.jsonl does. The
// AiEvent contract allows an empty `at` (the Codex adapter does the same for
// ids it cannot supply), the UI does not render it, and deriveStatus() uses
// file growth rather than record time, so nothing downstream needs it.
const NO_TIMESTAMP = '';
function textOf(content) {
    if (typeof content === 'string')
        return content;
    if (Array.isArray(content)) {
        return content.map((b) => (typeof b?.text === 'string' ? b.text : '')).join('');
    }
    return '';
}
// Grok wraps the real prompt in <user_query>…</user_query> and then APPENDS a
// <system-reminder> block (attached files, skill listings) after the closing
// tag, inside the same record. Measured: a 776-character prompt record whose
// last 90 characters are `</attached_files>\n\n</system-reminder>`.
//
// So the match must NOT be anchored to the end of the string — an end-anchored
// pattern never fires on a real record, and both the literal tags and the
// appended reminder end up in the chat bubble and in the session title. Taking
// the first matched pair yields exactly what the human typed and drops the
// appended block as a side effect. Text with no wrapper is returned untouched.
function unwrapQuery(text) {
    const m = text.match(/<user_query>\n?([\s\S]*?)\n?<\/user_query>/);
    return m ? m[1] : text;
}
// Only one of the four `user` records in a real transcript is something the
// human typed. The other three are context grok injects into the conversation:
//
//   prompt_index=undefined, synthetic_reason=undefined  -> <user_info> preamble
//   prompt_index=undefined, synthetic_reason='system_reminder' -> injected notice
//   prompt_index=0,         synthetic_reason=undefined  -> the actual prompt
//
// So a real prompt is exactly a record carrying a numeric prompt_index. Testing
// `!synthetic_reason` instead would let the <user_info> preamble through, and
// that block is the first thing in every session — it would become every
// session's title and first chat bubble.
function isRealPrompt(rec) {
    return typeof rec.prompt_index === 'number';
}
exports.grokAdapter = {
    toEvents(record) {
        const rec = record;
        if (!rec || typeof rec !== 'object')
            return [];
        switch (rec.type) {
            case 'user': {
                if (!isRealPrompt(rec))
                    return [];
                const text = unwrapQuery(textOf(rec.content));
                if (!text)
                    return [];
                return [{
                        kind: 'message', role: 'user', text,
                        id: `prompt-${rec.prompt_index}`, at: NO_TIMESTAMP,
                    }];
            }
            case 'assistant': {
                const out = [];
                const text = textOf(rec.content);
                // An assistant turn that only calls tools has empty content; emitting a
                // blank bubble for it would break up the transcript for no reason.
                if (text) {
                    out.push({
                        kind: 'message', role: 'assistant', text,
                        id: '', at: NO_TIMESTAMP,
                    });
                }
                for (const call of Array.isArray(rec.tool_calls) ? rec.tool_calls : []) {
                    if (!call || typeof call !== 'object')
                        continue;
                    // `arguments` is a JSON *string*, not an object. Parse it so the UI
                    // gets structured input, but never let malformed JSON kill the event:
                    // the raw string is still more useful than dropping the tool call.
                    let input = call.arguments;
                    if (typeof call.arguments === 'string') {
                        try {
                            input = JSON.parse(call.arguments);
                        }
                        catch { /* keep the raw string */ }
                    }
                    out.push({
                        kind: 'tool_call',
                        name: String(call.name || 'tool'),
                        summary: (0, types_1.preview)(typeof call.arguments === 'string'
                            ? call.arguments
                            : JSON.stringify(call.arguments ?? '')),
                        input,
                        id: String(call.id || ''),
                        at: NO_TIMESTAMP,
                    });
                }
                return out;
            }
            case 'reasoning': {
                const text = textOf(rec.summary);
                if (!text)
                    return [];
                return [{
                        kind: 'thinking', text, id: String(rec.id || ''), at: NO_TIMESTAMP,
                    }];
            }
            case 'tool_result': {
                return [{
                        kind: 'tool_result',
                        forId: String(rec.tool_call_id || ''),
                        // chat_history.jsonl records no outcome — only events.jsonl does, as
                        // `tool_completed.outcome`. All 23 outcomes in the measured session
                        // were 'success', so no failure shape was observable to key off. A
                        // wrong `ok: false` would mark healthy results as errors in the UI,
                        // so report success and let the result text speak for itself.
                        ok: true,
                        preview: (0, types_1.preview)(textOf(rec.content)),
                        at: NO_TIMESTAMP,
                    }];
            }
            // 'system' is the system prompt — 6 KB of instructions the user never
            // wrote and does not want to read back.
            default:
                return [];
        }
    },
    // chat_history.jsonl has no title record; summary.json holds grok's own
    // ("session_summary") but is a different file this tail never reads. The
    // first thing the human typed is the best title available from the stream,
    // and it matches how launch mode titles its sessions (ai-launch.ts).
    title(record) {
        const rec = record;
        if (!rec || typeof rec !== 'object')
            return null;
        if (rec.type !== 'user' || !isRealPrompt(rec))
            return null;
        if (rec.prompt_index !== 0)
            return null; // only the FIRST prompt names the session
        const text = unwrapQuery(textOf(rec.content)).replace(/\s+/g, ' ').trim();
        return text ? text.slice(0, 60) : null;
    },
};
//# sourceMappingURL=grok.js.map