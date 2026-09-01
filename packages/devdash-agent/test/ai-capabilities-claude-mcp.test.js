const test = require('node:test');
const assert = require('node:assert');
const { claudeMcpServers } = require('../dist/ai-capabilities/claude');

function fakeFs(tree) {
  return {
    homeDir: () => '/home/dev',
    exists: (p) => p in tree,
    isDir: () => false,
    readDir: () => [],
    readFile: (p) => (typeof tree[p] === 'string' ? tree[p] : null),
  };
}

test('merges the two global sources, which really do differ', () => {
  const deps = fakeFs({
    '/home/dev/.claude.json': JSON.stringify({ mcpServers: { github: { command: 'gh-mcp' } } }),
    '/home/dev/.claude/settings.json': JSON.stringify({ mcpServers: { context7: { command: 'c7' } } }),
  });
  const names = claudeMcpServers('/work/repo', deps).map((s) => s.name).sort();
  assert.deepStrictEqual(names, ['context7', 'github']);
});

test('tags project scope and lets the narrower scope win a name collision', () => {
  const deps = fakeFs({
    '/home/dev/.claude.json': JSON.stringify({
      mcpServers: { db: { command: 'global-db' } },
      projects: { '/work/repo': { mcpServers: { db: { command: 'project-db' } } } },
    }),
  });
  const servers = claudeMcpServers('/work/repo', deps);
  assert.strictEqual(servers.length, 1);
  assert.strictEqual(servers[0].scope, 'project');
  assert.strictEqual(servers[0].command, 'project-db');
});

test('reads .mcp.json at the project root', () => {
  const deps = fakeFs({
    '/work/repo/.mcp.json': JSON.stringify({ mcpServers: { local: { command: 'x' } } }),
  });
  const s = claudeMcpServers('/work/repo', deps);
  assert.strictEqual(s[0].scope, 'project');
  assert.strictEqual(s[0].origin, '/work/repo/.mcp.json');
});

test('classifies transport and redacts args', () => {
  const deps = fakeFs({
    '/home/dev/.claude.json': JSON.stringify({
      mcpServers: {
        remote: { url: 'https://example.com/mcp' },
        local: { command: 'srv', args: ['--api-key', 'abc123'] },
      },
    }),
  });
  const by = Object.fromEntries(claudeMcpServers('/work/repo', deps).map((s) => [s.name, s]));
  assert.strictEqual(by.remote.transport, 'http');
  assert.strictEqual(by.local.transport, 'stdio');
  assert.deepStrictEqual(by.local.args, ['--api-key', '[redacted]']);
});

test('malformed JSON yields nothing rather than throwing', () => {
  const deps = fakeFs({ '/home/dev/.claude.json': '{ not json' });
  assert.deepStrictEqual(claudeMcpServers('/work/repo', deps), []);
});
