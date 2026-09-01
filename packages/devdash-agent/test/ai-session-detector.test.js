const test = require('node:test');
const assert = require('node:assert');
const {
  parseProcessTable, descendantsOf, classifyProcess, findAgentInPane,
} = require('../dist/ai-session-detector');

const PS = [
  '    1     0 /sbin/launchd',
  '56045     1 tmux new-session -d -s dd-ses_abc -c /Users/dev',
  '40148 56045 -zsh',
  '28668 40148 /Users/dev/.local/share/claude/versions/2.1.238',
  '29647 28668 node /Users/dev/.claude/plugins/mcp-server.cjs',
  '77001 40148 /opt/homebrew/Caskroom/codex/0.146.0/bin/codex',
].join('\n');

test('parseProcessTable reads pid, ppid and the full command', () => {
  const rows = parseProcessTable(PS);
  assert.strictEqual(rows.length, 6);
  assert.deepStrictEqual(rows[3], {
    pid: 28668, ppid: 40148,
    command: '/Users/dev/.local/share/claude/versions/2.1.238',
  });
});

test('parseProcessTable ignores blank and malformed lines', () => {
  assert.deepStrictEqual(parseProcessTable('\n  \nnot a process row\n'), []);
});

test('descendantsOf walks the whole subtree, not just direct children', () => {
  const pids = descendantsOf(parseProcessTable(PS), 56045).map((r) => r.pid);
  assert.deepStrictEqual(pids.sort(), [28668, 29647, 40148, 77001]);
});

test('descendantsOf terminates on a cycle', () => {
  // ps output is a snapshot and pid reuse can produce a parent loop; a naive
  // walk would hang the agent's poll loop forever.
  const rows = parseProcessTable('10 11 a\n11 10 b');
  assert.ok(descendantsOf(rows, 10).length <= 2);
});

test('classifyProcess identifies Claude Code by its versioned binary path', () => {
  // The binary is named after a version number, so the process NAME is useless.
  assert.strictEqual(
    classifyProcess('/Users/dev/.local/share/claude/versions/2.1.238'), 'claude');
});

test('classifyProcess identifies a plain claude invocation', () => {
  assert.strictEqual(classifyProcess('claude --resume'), 'claude');
  assert.strictEqual(classifyProcess('/usr/local/bin/claude'), 'claude');
});

test('classifyProcess identifies codex', () => {
  assert.strictEqual(
    classifyProcess('/opt/homebrew/Caskroom/codex/0.146.0/bin/codex'), 'codex');
});

test('classifyProcess does not match unrelated processes', () => {
  assert.strictEqual(classifyProcess('-zsh'), null);
  assert.strictEqual(classifyProcess('node /app/claudette/server.js'), null);
  assert.strictEqual(classifyProcess('vim claude-notes.md'), null);
});

test('findAgentInPane returns the agent process under a pane shell', () => {
  assert.deepStrictEqual(
    findAgentInPane(parseProcessTable(PS), 40148), { pid: 28668, kind: 'claude' });
});

test('findAgentInPane returns null when the pane runs no AI CLI', () => {
  const rows = parseProcessTable('40148 56045 -zsh\n50000 40148 vim README.md');
  assert.strictEqual(findAgentInPane(rows, 40148), null);
});
