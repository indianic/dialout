const test = require('node:test');
const assert = require('node:assert');
const { discoverCapabilities } = require('../dist/ai-capabilities/index');

const empty = {
  homeDir: () => '/home/dev',
  exists: () => false,
  isDir: () => false,
  readDir: () => [],
  readFile: () => null,
};

test('returns the kind and a timestamp, with empty lists when nothing is installed', () => {
  const caps = discoverCapabilities('claude', '/work/repo', empty);
  assert.strictEqual(caps.kind, 'claude');
  assert.deepStrictEqual(caps.commands, []);
  assert.deepStrictEqual(caps.mcpServers, []);
  assert.ok(!Number.isNaN(Date.parse(caps.scannedAt)));
});

// Codex is deliberately out of v1: its command layout was never measured, and
// a guess shipped as a feature is worse than an honest empty.
test('codex returns empty rather than a guess', () => {
  const caps = discoverCapabilities('codex', '/work/repo', empty);
  assert.deepStrictEqual(caps.commands, []);
  assert.deepStrictEqual(caps.mcpServers, []);
});

test('an unknown kind does not throw', () => {
  const caps = discoverCapabilities('something-new', '/work/repo', empty);
  assert.deepStrictEqual(caps.commands, []);
});
