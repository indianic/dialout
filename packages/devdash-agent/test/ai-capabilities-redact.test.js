const test = require('node:test');
const assert = require('node:assert');
const { redactArgs } = require('../dist/ai-capabilities/redact');

test('keeps ordinary flags and paths', () => {
  assert.deepStrictEqual(
    redactArgs(['-y', '@indianic/mailman', '--port', '3000']),
    ['-y', '@indianic/mailman', '--port', '3000']
  );
});

test('redacts anything long and token-shaped', () => {
  const out = redactArgs(['--token', 'ghp_' + 'a'.repeat(36)]);
  assert.deepStrictEqual(out, ['--token', '[redacted]']);
});

test('redacts the value after a secret-looking flag even if it looks tame', () => {
  assert.deepStrictEqual(redactArgs(['--api-key', 'abc123']), ['--api-key', '[redacted]']);
  assert.deepStrictEqual(redactArgs(['--password', 'hunter2']), ['--password', '[redacted]']);
});

test('redacts inline KEY=value secrets', () => {
  assert.deepStrictEqual(redactArgs(['TOKEN=abcdef123456']), ['TOKEN=[redacted]']);
});

test('handles a non-array safely', () => {
  assert.deepStrictEqual(redactArgs(undefined), undefined);
});
