const test = require('node:test');
const assert = require('node:assert');
const { claudeCommands } = require('../dist/ai-capabilities/claude');

// A fake filesystem: paths -> contents for files, arrays for directories.
function fakeFs(tree) {
  return {
    homeDir: () => '/home/dev',
    exists: (p) => p in tree,
    isDir: (p) => Array.isArray(tree[p]),
    readDir: (p) => (Array.isArray(tree[p]) ? tree[p] : []),
    readFile: (p) => (typeof tree[p] === 'string' ? tree[p] : null),
  };
}

test('finds user, project and plugin commands and tags each', () => {
  const deps = fakeFs({
    '/home/dev/.claude/commands': ['seo.md', 'notes.md', 'README.txt'],
    '/home/dev/.claude/commands/seo.md': '# SEO Machine',
    '/home/dev/.claude/commands/notes.md': '---\ndescription: Take notes\n---\n',
    '/work/repo/.claude/commands': ['deploy.md'],
    '/work/repo/.claude/commands/deploy.md': '# Deploy it',
    '/home/dev/.claude/plugins/marketplaces': ['mp'],
    '/home/dev/.claude/plugins/marketplaces/mp': ['plug'],
    '/home/dev/.claude/plugins/marketplaces/mp/plug': ['commands'],
    '/home/dev/.claude/plugins/marketplaces/mp/plug/commands': ['run.md'],
    '/home/dev/.claude/plugins/marketplaces/mp/plug/commands/run.md': '# Run',
  });

  const cmds = claudeCommands('/work/repo', deps);
  const by = Object.fromEntries(cmds.map((c) => [c.name, c]));

  assert.strictEqual(by['seo'].source, 'user');
  assert.strictEqual(by['seo'].description, 'SEO Machine');
  assert.strictEqual(by['notes'].description, 'Take notes');
  assert.strictEqual(by['deploy'].source, 'project');
  // Plugin commands are namespaced, so two marketplaces cannot collide.
  assert.strictEqual(by['plug:run'].source, 'plugin');
  // Non-markdown is ignored.
  assert.ok(!('README' in by));
});

// The three shapes that actually exist on disk, measured 2026-08-21.
test('handles all three real plugin layouts', () => {
  const deps = fakeFs({
    '/home/dev/.claude/plugins/marketplaces': ['hud', 'kw', 'official'],

    // <marketplace>/commands — the marketplace is the plugin
    '/home/dev/.claude/plugins/marketplaces/hud': ['commands'],
    '/home/dev/.claude/plugins/marketplaces/hud/commands': ['setup.md'],
    '/home/dev/.claude/plugins/marketplaces/hud/commands/setup.md': '# Set up',

    // <marketplace>/<plugin>/commands
    '/home/dev/.claude/plugins/marketplaces/kw': ['pdf-viewer'],
    '/home/dev/.claude/plugins/marketplaces/kw/pdf-viewer': ['commands'],
    '/home/dev/.claude/plugins/marketplaces/kw/pdf-viewer/commands': ['open.md'],
    '/home/dev/.claude/plugins/marketplaces/kw/pdf-viewer/commands/open.md': '# Open',

    // <marketplace>/plugins/<plugin>/commands — the common case
    '/home/dev/.claude/plugins/marketplaces/official': ['plugins'],
    '/home/dev/.claude/plugins/marketplaces/official/plugins': ['code-review'],
    '/home/dev/.claude/plugins/marketplaces/official/plugins/code-review': ['commands'],
    '/home/dev/.claude/plugins/marketplaces/official/plugins/code-review/commands': ['run.md'],
    '/home/dev/.claude/plugins/marketplaces/official/plugins/code-review/commands/run.md': '# Run',
  });
  const names = claudeCommands('/work/repo', deps).map((c) => c.name).sort();
  assert.deepStrictEqual(names, ['code-review:run', 'hud:setup', 'pdf-viewer:open']);
});

// A marketplace checkout has its own .claude/commands — that repo's project
// commands, which the user's CLI does not expose. Including them namespaced
// everything `.claude:` and was plainly wrong on a real install.
test('ignores a marketplace repo own .claude/commands', () => {
  const deps = fakeFs({
    '/home/dev/.claude/plugins/marketplaces': ['mp'],
    '/home/dev/.claude/plugins/marketplaces/mp': ['.claude'],
    '/home/dev/.claude/plugins/marketplaces/mp/.claude': ['commands'],
    '/home/dev/.claude/plugins/marketplaces/mp/.claude/commands': ['dedupe.md'],
    '/home/dev/.claude/plugins/marketplaces/mp/.claude/commands/dedupe.md': '# Dedupe',
  });
  assert.deepStrictEqual(claudeCommands('/work/repo', deps), []);
});

test('returns empty when nothing exists, and never throws', () => {
  assert.deepStrictEqual(claudeCommands('/nope', fakeFs({})), []);
});

test('an unreadable directory does not blank the rest', () => {
  const deps = fakeFs({
    '/home/dev/.claude/commands': ['ok.md'],
    '/home/dev/.claude/commands/ok.md': '# Fine',
  });
  deps.readDir = (p) => {
    if (p.includes('plugins')) throw new Error('EACCES');
    return p === '/home/dev/.claude/commands' ? ['ok.md'] : [];
  };
  const names = claudeCommands('/work/repo', deps).map((c) => c.name);
  assert.deepStrictEqual(names, ['ok']);
});
