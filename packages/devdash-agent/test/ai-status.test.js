const test = require('node:test');
const assert = require('node:assert');
const { deriveStatus } = require('../dist/ai-status');

const NOW = 1_000_000;
const msg = (role) => ({ kind: 'message', role, text: 'x', id: 'm', at: '' });
const call = (id) => ({ kind: 'tool_call', name: 'Bash', summary: 'Bash', input: {}, id, at: '' });
const result = (forId) => ({ kind: 'tool_result', forId, ok: true, preview: '', at: '' });

// The four rules overlap by construction, so they are evaluated in order and
// the first match wins. Each test below pins one row of that table.

test('rule 1: no growth for over five minutes is idle', () => {
  assert.strictEqual(deriveStatus([msg('assistant')], NOW - 400_000, NOW), 'idle');
});

test('rule 1 beats rule 2: an old unresolved tool call is idle, not waiting', () => {
  assert.strictEqual(deriveStatus([call('t1')], NOW - 400_000, NOW), 'idle');
});

test('rule 2: a tool call unresolved for over three seconds is waiting_approval', () => {
  assert.strictEqual(deriveStatus([call('t1')], NOW - 5_000, NOW), 'waiting_approval');
});

test('rule 2 does not fire while the call is still fresh', () => {
  assert.strictEqual(deriveStatus([call('t1')], NOW - 1_000, NOW), 'working');
});

test('a resolved tool call is not waiting_approval', () => {
  assert.strictEqual(
    deriveStatus([call('t1'), result('t1')], NOW - 5_000, NOW), 'working');
});

test('rule 3: a settled assistant message is waiting_input', () => {
  assert.strictEqual(deriveStatus([msg('assistant')], NOW - 10_000, NOW), 'waiting_input');
});

test('rule 3 does not fire before the settle window', () => {
  assert.strictEqual(deriveStatus([msg('assistant')], NOW - 500, NOW), 'working');
});

test('rule 4: a fresh user message means the agent is working', () => {
  assert.strictEqual(deriveStatus([msg('user')], NOW - 500, NOW), 'working');
});

test('a settled user message is still working — the agent owes a reply', () => {
  assert.strictEqual(deriveStatus([msg('user')], NOW - 10_000, NOW), 'working');
});

test('an empty stream is idle', () => {
  assert.strictEqual(deriveStatus([], 0, NOW), 'idle');
});
