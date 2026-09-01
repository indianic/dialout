const test = require('node:test');
const assert = require('node:assert');
const { describeCommand } = require('../dist/ai-capabilities/describe');

test('prefers frontmatter description', () => {
  const md = '---\nname: x\ndescription: Does the thing\n---\n\n# Heading\n\nBody';
  assert.strictEqual(describeCommand(md), 'Does the thing');
});

// ~/.claude/commands/seo.md has no frontmatter at all — it opens with a
// heading. A parser that requires --- returns nothing for most real files.
test('falls back to the first heading', () => {
  assert.strictEqual(describeCommand('# SEO Machine\n\nLaunch the workspace.'), 'SEO Machine');
});

test('falls back to the first non-empty line', () => {
  assert.strictEqual(describeCommand('\n\nJust a sentence.\nAnd more.'), 'Just a sentence.');
});

test('returns empty string for an empty file, never undefined', () => {
  assert.strictEqual(describeCommand(''), '');
  assert.strictEqual(describeCommand('\n\n   \n'), '');
});

test('truncates a very long description', () => {
  const long = 'x'.repeat(300);
  const out = describeCommand(long);
  assert.ok(out.length <= 160);
  assert.ok(out.endsWith('…'));
});

test('ignores frontmatter that is not closed', () => {
  assert.strictEqual(describeCommand('---\ndescription: nope\n\n# Real'), 'Real');
});
