const test = require('node:test');
const assert = require('node:assert');
const { parseGrokCommandTable } = require('../dist/ai-capabilities/grok');

const README = [
  '## Something else',
  '',
  '### Slash Commands',
  '',
  'Type `/` in the input to access commands:',
  '',
  '| Command | Alias | Description |',
  '| --- | --- | --- |',
  '| `/model <name>` | `/m` | Switch to a different model |',
  '| `/new` | | Start a new session (clears context) |',
  '| `/compact [context]` | | Compact conversation history |',
  '| `/exit` | `/quit` | Exit the TUI |',
  '',
  '### Features',
  '| not | a | command table |',
].join('\n');

test('parses every row, stripping slashes and argument placeholders', () => {
  const cmds = parseGrokCommandTable(README);
  assert.strictEqual(cmds.length, 4);
  const by = Object.fromEntries(cmds.map((c) => [c.name, c]));
  assert.strictEqual(by.model.alias, 'm');
  assert.strictEqual(by.model.description, 'Switch to a different model');
  assert.strictEqual(by.new.alias, undefined);
  assert.strictEqual(by.exit.alias, 'quit');
  assert.ok(cmds.every((c) => c.source === 'builtin'));
});

test('stops at the next heading and ignores later tables', () => {
  assert.ok(!parseGrokCommandTable(README).some((c) => c.name === 'not'));
});

// All-or-nothing: a half-parsed menu that silently drops /compact is worse
// than no menu, because the reader cannot tell it is incomplete.
test('a missing section yields an empty list', () => {
  assert.deepStrictEqual(parseGrokCommandTable('# Nothing here'), []);
});

test('fewer than three rows is treated as a failed parse', () => {
  const thin = '### Slash Commands\n\n| Command | Alias | Description |\n| --- | --- | --- |\n| `/x` | | y |';
  assert.deepStrictEqual(parseGrokCommandTable(thin), []);
});
