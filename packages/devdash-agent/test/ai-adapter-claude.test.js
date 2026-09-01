const test = require('node:test');
const assert = require('node:assert');
const { claudeAdapter } = require('../dist/ai-adapters/claude');

const at = '2026-08-21T10:00:00.000Z';

test('a user record becomes one user message', () => {
  const events = claudeAdapter.toEvents({
    type: 'user', uuid: 'u1', timestamp: at,
    message: { role: 'user', content: [{ type: 'text', text: 'run the tests' }] },
  });
  assert.deepStrictEqual(events, [
    { kind: 'message', role: 'user', text: 'run the tests', id: 'u1', at },
  ]);
});

test('a plain string content is accepted as well as a block array', () => {
  const events = claudeAdapter.toEvents({
    type: 'user', uuid: 'u2', timestamp: at, message: { role: 'user', content: 'hello' },
  });
  assert.strictEqual(events[0].text, 'hello');
});

test('an assistant record splits text and tool_use into separate events', () => {
  const events = claudeAdapter.toEvents({
    type: 'assistant', uuid: 'a1', timestamp: at,
    message: { role: 'assistant', content: [
      { type: 'text', text: 'Running them now.' },
      { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'npm test' } },
    ] },
  });
  assert.strictEqual(events.length, 2);
  assert.deepStrictEqual(events[0],
    { kind: 'message', role: 'assistant', text: 'Running them now.', id: 'a1', at });
  assert.deepStrictEqual(events[1], {
    kind: 'tool_call', name: 'Bash', summary: 'Bash: npm test',
    input: { command: 'npm test' }, id: 'tu1', at,
  });
});

test('tool summaries name the file for file tools', () => {
  const [e] = claudeAdapter.toEvents({
    type: 'assistant', uuid: 'a2', timestamp: at,
    message: { content: [
      { type: 'tool_use', id: 't', name: 'Edit', input: { file_path: '/srv/app/src/index.ts' } },
    ] },
  });
  assert.strictEqual(e.summary, 'Edit src/index.ts');
});

test('an unknown tool still gets a usable summary', () => {
  const [e] = claudeAdapter.toEvents({
    type: 'assistant', uuid: 'a3', timestamp: at,
    message: { content: [{ type: 'tool_use', id: 't', name: 'Weather', input: { city: 'Pune' } }] },
  });
  assert.strictEqual(e.summary, 'Weather');
});

test('tool_result becomes a truncated preview linked to its call', () => {
  const [e] = claudeAdapter.toEvents({
    type: 'user', uuid: 'u3', timestamp: at,
    message: { content: [
      { type: 'tool_result', tool_use_id: 'tu1', is_error: false, content: 'x'.repeat(5000) },
    ] },
  });
  assert.strictEqual(e.kind, 'tool_result');
  assert.strictEqual(e.forId, 'tu1');
  assert.strictEqual(e.ok, true);
  assert.ok(e.preview.length < 5000, 'tool output can be megabytes');
});

test('a thinking block becomes a thinking event', () => {
  const [e] = claudeAdapter.toEvents({
    type: 'assistant', uuid: 'a4', timestamp: at,
    message: { content: [{ type: 'thinking', thinking: 'weighing options' }] },
  });
  assert.deepStrictEqual(e, { kind: 'thinking', text: 'weighing options', id: 'a4', at });
});

test('sidechain records are dropped', () => {
  // Subagent chatter would interleave incomprehensibly with the main thread.
  assert.deepStrictEqual(claudeAdapter.toEvents({
    type: 'assistant', uuid: 'a5', timestamp: at, isSidechain: true,
    message: { content: [{ type: 'text', text: 'subagent noise' }] },
  }), []);
});

test('unknown record types and malformed records yield nothing, never throw', () => {
  assert.deepStrictEqual(claudeAdapter.toEvents({ type: 'file-history-snapshot' }), []);
  assert.deepStrictEqual(claudeAdapter.toEvents(null), []);
  assert.deepStrictEqual(claudeAdapter.toEvents({ type: 'user' }), []);
  assert.deepStrictEqual(claudeAdapter.toEvents('nonsense'), []);
});

test('an unknown content block renders as plain text rather than disappearing', () => {
  const [e] = claudeAdapter.toEvents({
    type: 'assistant', uuid: 'a6', timestamp: at,
    message: { content: [{ type: 'future_block_type', text: 'still readable' }] },
  });
  assert.strictEqual(e.kind, 'message');
  assert.strictEqual(e.text, 'still readable');
});

test('title reads custom-title, then last-prompt', () => {
  assert.strictEqual(
    claudeAdapter.title({ type: 'custom-title', customTitle: 'Fix the deploy' }), 'Fix the deploy');
  assert.strictEqual(
    claudeAdapter.title({ type: 'last-prompt', lastPrompt: 'why is CI red' }), 'why is CI red');
  assert.strictEqual(claudeAdapter.title({ type: 'assistant' }), null);
});
