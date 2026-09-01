const test = require('node:test');
const assert = require('node:assert');
const { adapterFor } = require('../dist/ai-adapters');
const { classifyProcess } = require('../dist/ai-session-detector');
const { grokTranscriptPath, grokTranscript } = require('../dist/ai-transcript-locator');

const grok = adapterFor('grok');

// Every record shape below is copied from a real ~/.grok chat_history.jsonl
// captured 2026-08-21 (57 lines: 1 system, 4 user, 16 reasoning, 16 assistant,
// 20 tool_result), not invented.

// --- detection ---

test('grok is classified from its install layout and bare argv', () => {
  assert.strictEqual(classifyProcess('/Users/me/.grok/bin/grok'), 'grok');
  assert.strictEqual(classifyProcess('grok'), 'grok');
  assert.strictEqual(classifyProcess('grok --yolo'), 'grok');
});

test('grok classification does not swallow lookalikes', () => {
  // Anchored on a path-segment boundary, same as claude/codex.
  assert.strictEqual(classifyProcess('grokking-notes.md'), null);
  assert.strictEqual(classifyProcess('vim /tmp/grok.txt'), null);
});

// --- user records: only one of four is something a human typed ---

const userInfoPreamble = { type: 'user', content: [{ type: 'text', text: '<user_info>\nOS Version: macos\n</user_info>' }] };
const systemReminder = { type: 'user', synthetic_reason: 'system_reminder', content: [{ type: 'text', text: '<system-reminder>skills…</system-reminder>' }] };
const realPrompt = {
  type: 'user',
  prompt_index: 0,
  content: [{ type: 'text', text: '<user_query>\nplease read the spec\n</user_query>\n\n<system-reminder>\n<attached_files/>\n</system-reminder>' }],
};

test('only a record with a numeric prompt_index is a real user prompt', () => {
  assert.deepStrictEqual(grok.toEvents(userInfoPreamble), []);
  assert.deepStrictEqual(grok.toEvents(systemReminder), []);
  assert.strictEqual(grok.toEvents(realPrompt).length, 1);
});

test('the <user_query> wrapper AND the appended system-reminder are stripped', () => {
  // The match must not be end-anchored: grok appends a <system-reminder> block
  // after the closing tag inside the SAME record, so an end-anchored pattern
  // never fires and the tags reach the chat bubble.
  const [e] = grok.toEvents(realPrompt);
  assert.strictEqual(e.kind, 'message');
  assert.strictEqual(e.role, 'user');
  assert.strictEqual(e.text, 'please read the spec');
});

test('prompt_index 0 is a real prompt — a falsy check would drop the first one', () => {
  assert.strictEqual(grok.toEvents({ ...realPrompt, prompt_index: 0 }).length, 1);
});

test('a user message with no wrapper survives untouched', () => {
  const [e] = grok.toEvents({ type: 'user', prompt_index: 3, content: [{ type: 'text', text: 'plain text' }] });
  assert.strictEqual(e.text, 'plain text');
});

// --- assistant: message + tool calls ---

const assistantWithCalls = {
  type: 'assistant',
  content: "I'll start by reading the spec.",
  tool_calls: [{ id: 'call-abc-0', name: 'read_file', arguments: '{"target_file":"/tmp/a.md"}' }],
  model_id: 'grok-4.6-build',
};

test('an assistant turn yields its message and one tool_call per call', () => {
  const ev = grok.toEvents(assistantWithCalls);
  assert.deepStrictEqual(ev.map((e) => e.kind), ['message', 'tool_call']);
  assert.strictEqual(ev[0].role, 'assistant');
  assert.strictEqual(ev[1].name, 'read_file');
  assert.strictEqual(ev[1].id, 'call-abc-0');
});

test('tool_call arguments are parsed from their JSON STRING into structured input', () => {
  const [, call] = grok.toEvents(assistantWithCalls);
  assert.deepStrictEqual(call.input, { target_file: '/tmp/a.md' });
});

test('malformed tool_call arguments keep the raw string instead of dropping the call', () => {
  const ev = grok.toEvents({ type: 'assistant', content: '', tool_calls: [{ id: 'c1', name: 'x', arguments: '{not json' }] });
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].kind, 'tool_call');
  assert.strictEqual(ev[0].input, '{not json');
});

test('a tool-only assistant turn emits no empty message bubble', () => {
  const ev = grok.toEvents({ type: 'assistant', content: '', tool_calls: [{ id: 'c1', name: 'x', arguments: '{}' }] });
  assert.deepStrictEqual(ev.map((e) => e.kind), ['tool_call']);
});

// --- reasoning / tool_result / system ---

test('reasoning becomes thinking, read from summary[].text not encrypted_content', () => {
  const [e] = grok.toEvents({
    type: 'reasoning', id: 'rs_1', status: 'completed',
    summary: [{ type: 'summary_text', text: 'The user wants me to read the spec' }],
    encrypted_content: 'YC1sV/K5n9O8rDaj',
  });
  assert.strictEqual(e.kind, 'thinking');
  assert.strictEqual(e.text, 'The user wants me to read the spec');
  assert.strictEqual(e.id, 'rs_1');
});

test('tool_result links back by tool_call_id so deriveStatus can pair it', () => {
  const [e] = grok.toEvents({ type: 'tool_result', tool_call_id: 'call-abc-0', content: '1→# Spec' });
  assert.strictEqual(e.kind, 'tool_result');
  assert.strictEqual(e.forId, 'call-abc-0');
  assert.strictEqual(e.ok, true);
});

test('the system prompt is never surfaced as a message', () => {
  assert.deepStrictEqual(grok.toEvents({ type: 'system', content: 'You are Grok 4.6…' }), []);
});

test('unknown records and junk yield [] rather than throwing', () => {
  for (const bad of [null, undefined, 42, 'str', {}, { type: 'brand_new_type' }]) {
    assert.deepStrictEqual(grok.toEvents(bad), []);
  }
});

// --- title ---

test('the title is the FIRST real prompt only', () => {
  assert.strictEqual(grok.title(realPrompt), 'please read the spec');
  // A later prompt must not rename a session mid-conversation.
  assert.strictEqual(grok.title({ ...realPrompt, prompt_index: 4 }), null);
  assert.strictEqual(grok.title(userInfoPreamble), null);
  assert.strictEqual(grok.title(systemReminder), null);
});

test('the title collapses newlines and caps at 60 chars', () => {
  const long = { type: 'user', prompt_index: 0, content: [{ type: 'text', text: `<user_query>\n${'ab '.repeat(60)}\n</user_query>` }] };
  const t = grok.title(long);
  assert.ok(t.length <= 60, `title was ${t.length} chars`);
  assert.ok(!t.includes('\n'));
});

// --- transcript location ---

test('grokTranscriptPath encodes the cwd with encodeURIComponent', () => {
  assert.strictEqual(
    grokTranscriptPath('/home/me', '/Volumes/SSD/www/app', 'uuid-1'),
    '/home/me/.grok/sessions/%2FVolumes%2FSSD%2Fwww%2Fapp/uuid-1/chat_history.jsonl'
  );
});

test('grokTranscript resolves a pid straight from grok active_sessions map', () => {
  const sessions = [
    { session_id: 's-other', pid: 111, cwd: '/a' },
    { session_id: 's-mine', pid: 222, cwd: '/b/c' },
  ];
  assert.strictEqual(
    grokTranscript(222, '/home/me', { grokSessions: () => sessions }),
    '/home/me/.grok/sessions/%2Fb%2Fc/s-mine/chat_history.jsonl'
  );
});

test('grokTranscript returns null for a pid the map does not know', () => {
  assert.strictEqual(grokTranscript(999, '/home/me', { grokSessions: () => [{ session_id: 's', pid: 1, cwd: '/a' }] }), null);
});

test('grokTranscript survives a missing or malformed active_sessions.json', () => {
  assert.strictEqual(grokTranscript(1, '/home/me', { grokSessions: () => [] }), null);
  assert.strictEqual(grokTranscript(1, '/home/me', { grokSessions: () => [null] }), null);
});

test('two grok sessions in ONE folder resolve to different transcripts', () => {
  // This is the collision that the cwd+newest tier cannot solve and that made
  // one Claude pane render another pane's conversation. An explicit pid map
  // makes it impossible rather than merely unlikely.
  const sessions = [
    { session_id: 'aaa', pid: 10, cwd: '/same/folder' },
    { session_id: 'bbb', pid: 20, cwd: '/same/folder' },
  ];
  const deps = { grokSessions: () => sessions };
  const a = grokTranscript(10, '/h', deps);
  const b = grokTranscript(20, '/h', deps);
  assert.notStrictEqual(a, b);
  assert.match(a, /\/aaa\/chat_history\.jsonl$/);
  assert.match(b, /\/bbb\/chat_history\.jsonl$/);
});
