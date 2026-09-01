const test = require('node:test');
const assert = require('node:assert');
const { grokMcpServers } = require('../dist/ai-capabilities/grok');

function fakeFs(tree) {
  return {
    homeDir: () => '/home/dev',
    exists: (p) => p in tree,
    isDir: () => false,
    readDir: () => [],
    readFile: (p) => (typeof tree[p] === 'string' ? tree[p] : null),
  };
}

test('reads the global config', () => {
  const deps = fakeFs({
    '/home/dev/.grok/config.toml': '[mcp_servers.mailman]\ncommand = "npx"\nargs = ["-y", "@indianic/mailman"]\n',
  });
  const s = grokMcpServers('/work/repo', '/work/repo', deps);
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].scope, 'global');
  assert.strictEqual(s[0].command, 'npx');
});

// Documented behaviour: a project server with a global's name REPLACES it
// entirely. Fields the project omits take defaults, they do not inherit.
test('a project server replaces a global of the same name, without merging fields', () => {
  const deps = fakeFs({
    '/home/dev/.grok/config.toml':
      '[mcp_servers.db]\ncommand = "global"\nargs = ["--x"]\nstartup_timeout_sec = 99\n',
    '/work/repo/.grok/config.toml': '[mcp_servers.db]\ncommand = "project"\n',
  });
  const s = grokMcpServers('/work/repo', '/work/repo', deps);
  assert.strictEqual(s.length, 1);
  // The WHOLE object is asserted, not just one field. Checking `args` alone
  // was vacuous: every server object carries every key, so a spread-merge and
  // a replace are indistinguishable unless the full shape is pinned. Any
  // field that leaked through from the global entry fails this.
  assert.deepStrictEqual(s[0], {
    name: 'db',
    scope: 'project',
    origin: '/work/repo/.grok/config.toml',
    transport: 'stdio',
    enabled: true,
    command: 'project',
    args: undefined,
  });
});

test('cwd beats repo root, which beats global', () => {
  const deps = fakeFs({
    '/home/dev/.grok/config.toml': '[mcp_servers.a]\ncommand = "g"\n',
    '/work/repo/.grok/config.toml': '[mcp_servers.a]\ncommand = "r"\n',
    '/work/repo/pkg/.grok/config.toml': '[mcp_servers.a]\ncommand = "c"\n',
  });
  const s = grokMcpServers('/work/repo/pkg', '/work/repo', deps);
  assert.strictEqual(s[0].command, 'c');
});

test('honours the enabled flag and redacts args', () => {
  const deps = fakeFs({
    '/home/dev/.grok/config.toml':
      '[mcp_servers.x]\ncommand = "s"\nenabled = false\nargs = ["--token", "' + 'a'.repeat(30) + '"]\n',
  });
  const s = grokMcpServers('/work/repo', '/work/repo', deps);
  assert.strictEqual(s[0].enabled, false);
  assert.deepStrictEqual(s[0].args, ['--token', '[redacted]']);
});

test('malformed TOML yields nothing rather than throwing', () => {
  const deps = fakeFs({ '/home/dev/.grok/config.toml': '[[[ not toml' });
  assert.deepStrictEqual(grokMcpServers('/work/repo', '/work/repo', deps), []);
});
