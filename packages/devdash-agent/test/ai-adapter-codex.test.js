const test = require('node:test');
const assert = require('node:assert');
const { codexAdapter } = require('../dist/ai-adapters/codex');
const { adapterFor } = require('../dist/ai-adapters/index');

const at = '2026-08-21T10:00:00.000Z';

test('a codex response_item message becomes a normalized message', () => {
  const events = codexAdapter.toEvents({
    timestamp: at, type: 'response_item',
    payload: { type: 'message', role: 'assistant', id: 'c1',
      content: [{ type: 'output_text', text: 'done' }] },
  });
  assert.deepStrictEqual(events, [
    { kind: 'message', role: 'assistant', text: 'done', id: 'c1', at },
  ]);
});

test('a codex user message keeps the user role', () => {
  const [e] = codexAdapter.toEvents({
    timestamp: at, type: 'response_item',
    payload: { type: 'message', role: 'user', id: 'c2', content: [{ text: 'go' }] },
  });
  assert.strictEqual(e.role, 'user');
});

test('session_meta yields a title from the cwd', () => {
  assert.strictEqual(
    codexAdapter.title({ type: 'session_meta', payload: { cwd: '/srv/app' } }), 'app');
});

test('unrecognised codex records yield nothing, never throw', () => {
  assert.deepStrictEqual(codexAdapter.toEvents({ type: 'turn_context' }), []);
  assert.deepStrictEqual(codexAdapter.toEvents(null), []);
  assert.deepStrictEqual(codexAdapter.toEvents({ type: 'response_item' }), []);
});

test('adapterFor returns a distinct adapter per kind', () => {
  assert.notStrictEqual(adapterFor('claude'), adapterFor('codex'));
  assert.strictEqual(typeof adapterFor('codex').toEvents, 'function');
});

// --- depth: v1 emitted messages only and dropped 60 of 128 records ---
//
// Every shape below is copied from a real ~/.codex rollout captured 2026-08-21
// (128 records: 19 message, 20 reasoning, 20 custom_tool_call, 20
// custom_tool_call_output, 1 function_call, 1 function_call_output).

const item = (payload) => ({ timestamp: at, type: 'response_item', payload });

const customCall = item({
  type: 'custom_tool_call',
  id: 'ctc_0e47cf439b3f79e8',
  status: 'completed',
  call_id: 'call_XJDKdovXj8PCt50LuyKHsGvM',
  name: 'exec',
  input: "const r = await tools.exec_command({cmd:\"sed -n '1,240p' SKILL.md\"})",
});

const customOutput = item({
  type: 'custom_tool_call_output',
  id: 'ctco_019fcbe1-06f5-7ed1',
  call_id: 'call_XJDKdovXj8PCt50LuyKHsGvM',
  output: [
    { type: 'input_text', text: 'Script completed\n' },
    { type: 'input_image', image_url: 'data:image/png;base64,AAAA' },
    { type: 'input_text', text: 'Output: ok' },
  ],
});

test('a custom_tool_call becomes a tool_call keyed by call_id, NOT id', () => {
  // The call and its output carry different `id`s for the same call — ctc_… and
  // ctco_… — so pairing on `id` matches 0 of 21 in a real transcript while
  // call_id matches 21 of 21. Pairing on `id` leaves every call unresolved,
  // which pins deriveStatus() at 'waiting_approval' forever.
  const [e] = codexAdapter.toEvents(customCall);
  assert.strictEqual(e.kind, 'tool_call');
  assert.strictEqual(e.name, 'exec');
  assert.strictEqual(e.id, 'call_XJDKdovXj8PCt50LuyKHsGvM');
  assert.notStrictEqual(e.id, 'ctc_0e47cf439b3f79e8');
});

test('a tool output resolves the call it belongs to', () => {
  const [call] = codexAdapter.toEvents(customCall);
  const [out] = codexAdapter.toEvents(customOutput);
  assert.strictEqual(out.kind, 'tool_result');
  assert.strictEqual(out.forId, call.id, 'forId must match the tool_call id or status breaks');
  assert.strictEqual(out.ok, true);
});

test('output text skips image blocks that carry no text', () => {
  const [out] = codexAdapter.toEvents(customOutput);
  assert.strictEqual(out.preview, 'Script completed\nOutput: ok');
});

test('a function_call parses its JSON-string arguments', () => {
  const [e] = codexAdapter.toEvents(item({
    type: 'function_call', id: 'fc_1', call_id: 'call_Sndchc7Z',
    name: 'wait', arguments: '{"cell_id":"4","yield_time_ms":120000}',
  }));
  assert.strictEqual(e.kind, 'tool_call');
  assert.strictEqual(e.id, 'call_Sndchc7Z');
  assert.deepStrictEqual(e.input, { cell_id: '4', yield_time_ms: 120000 });
});

test('malformed function_call arguments keep the raw string instead of dropping the call', () => {
  const [e] = codexAdapter.toEvents(item({
    type: 'function_call', id: 'fc_2', call_id: 'c2', name: 'x', arguments: '{not json',
  }));
  assert.strictEqual(e.kind, 'tool_call');
  assert.strictEqual(e.input, '{not json');
});

test('a function_call_output resolves by call_id too', () => {
  const [e] = codexAdapter.toEvents(item({
    type: 'function_call_output', id: 'fco_1', call_id: 'call_Sndchc7Z',
    output: [{ type: 'input_text', text: 'done' }],
  }));
  assert.strictEqual(e.kind, 'tool_result');
  assert.strictEqual(e.forId, 'call_Sndchc7Z');
});

// --- roles: `developer` is Codex's own instruction block, not conversation ---

test('a developer message is not rendered as something the assistant said', () => {
  // 7 of 19 messages in the measured transcript were role 'developer' — sandbox
  // permissions and base instructions. v1 mapped every non-user role to
  // 'assistant', so all 7 appeared as agent replies.
  assert.deepStrictEqual(codexAdapter.toEvents(item({
    type: 'message', role: 'developer', id: 'msg_dev',
    content: [{ type: 'input_text', text: '<permissions instructions>…' }],
  })), []);
});

test('user and assistant messages still come through with their real roles', () => {
  const [u] = codexAdapter.toEvents(item({ type: 'message', role: 'user', id: 'm1', content: [{ type: 'input_text', text: 'hi' }] }));
  const [a] = codexAdapter.toEvents(item({ type: 'message', role: 'assistant', id: 'm2', content: [{ type: 'output_text', text: 'hello' }] }));
  assert.strictEqual(u.role, 'user');
  assert.strictEqual(a.role, 'assistant');
});

// --- reasoning is encrypted, so emit nothing rather than a blank bubble ---

test('encrypted reasoning with an empty summary yields no event', () => {
  // All 20 reasoning records had summary: [] and their text in
  // encrypted_content, which we cannot read.
  assert.deepStrictEqual(codexAdapter.toEvents(item({
    type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'gAAAAABqcaIJ…',
  })), []);
});

test('reasoning DOES surface if codex ever writes a readable summary', () => {
  const [e] = codexAdapter.toEvents(item({
    type: 'reasoning', id: 'rs_2', summary: [{ type: 'summary_text', text: 'Planning the edit' }],
  }));
  assert.strictEqual(e.kind, 'thinking');
  assert.strictEqual(e.text, 'Planning the edit');
});

// --- the whole point: status can now reach waiting_approval ---

test('an unresolved codex tool call is visible to deriveStatus', () => {
  const { deriveStatus } = require('../dist/ai-status');
  const events = codexAdapter.toEvents(customCall);
  // Quiet for longer than APPROVAL_MS with a call and no result.
  assert.strictEqual(deriveStatus(events, 0, 10_000), 'waiting_approval');
  // And once the output lands it is no longer waiting on approval.
  const resolved = [...events, ...codexAdapter.toEvents(customOutput)];
  assert.notStrictEqual(deriveStatus(resolved, 0, 10_000), 'waiting_approval');
});

test('junk and unknown payload types still yield [] rather than throwing', () => {
  for (const bad of [null, 42, {}, item(null), item({ type: 'brand_new' }), { type: 'world_state' }]) {
    assert.deepStrictEqual(codexAdapter.toEvents(bad), []);
  }
});
