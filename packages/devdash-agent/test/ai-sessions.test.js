const test = require('node:test');
const assert = require('node:assert');
const { sendKeysArgs, discoverAiSessions } = require('../dist/ai-sessions');

const ESC = '\u001b';    // the byte a phone's Esc chip sends
const CTRL_C = '\u0003'; // the byte a phone's Ctrl-C chip sends

test('sendKeysArgs sends the text literally, then Enter', () => {
  assert.deepStrictEqual(sendKeysArgs('dd-abc', 'yes please'), [
    ['send-keys', '-t', 'dd-abc', '-l', '--', 'yes please'],
    ['send-keys', '-t', 'dd-abc', 'Enter'],
  ]);
});

test('sendKeysArgs does not let text starting with a dash become a flag', () => {
  // Without the -- terminator tmux would parse '-X ...' as an option, which
  // turns composed text into tmux commands.
  const [literal] = sendKeysArgs('dd-abc', '-X kill-session');
  assert.strictEqual(literal[literal.length - 2], '--');
  assert.strictEqual(literal[literal.length - 1], '-X kill-session');
});

test('sendKeysArgs maps a bare control key to a key press, not literal text', () => {
  assert.deepStrictEqual(sendKeysArgs('dd-abc', ESC), [
    ['send-keys', '-t', 'dd-abc', 'Escape'],
  ]);
  assert.deepStrictEqual(sendKeysArgs('dd-abc', CTRL_C), [
    ['send-keys', '-t', 'dd-abc', 'C-c'],
  ]);
});

test('discoverAiSessions returns one entry per pane running an AI CLI', async () => {
  const found = await discoverAiSessions({
    listSessions: async () => ([
      { name: 'dd-a', folder: 'app', folderPath: '/srv/app', gitBranch: 'main', lastActivity: 1 },
      { name: 'plain', folder: 'x', folderPath: '/srv/x', gitBranch: '', lastActivity: 1 },
    ]),
    panePid: (name) => (name === 'dd-a' ? 100 : 200),
    processTable: async () => ([
      { pid: 100, ppid: 1, command: '-zsh' },
      { pid: 101, ppid: 100, command: '/home/d/.local/share/claude/versions/2.1.238' },
      { pid: 200, ppid: 1, command: '-zsh' },
    ]),
    locate: () => '/home/d/.claude/projects/-srv-app/s.jsonl',
    profileOf: () => 'default',
  });
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].tmuxName, 'dd-a');
  assert.strictEqual(found[0].kind, 'claude');
  assert.strictEqual(found[0].folder, 'app');
});

test('discoverAiSessions skips a pane whose transcript cannot be located', async () => {
  const found = await discoverAiSessions({
    listSessions: async () => ([
      { name: 'dd-a', folder: 'app', folderPath: '/srv/app', gitBranch: '', lastActivity: 1 },
    ]),
    panePid: () => 100,
    processTable: async () => ([
      { pid: 100, ppid: 1, command: '-zsh' },
      { pid: 101, ppid: 100, command: 'claude' },
    ]),
    locate: () => null,
    profileOf: () => 'default',
  });
  assert.deepStrictEqual(found, []);
});

test('discoverAiSessions surfaces the profile so two subscriptions stay apart', async () => {
  const found = await discoverAiSessions({
    listSessions: async () => ([
      { name: 'dd-a', folder: 'app', folderPath: '/srv/app', gitBranch: '', lastActivity: 1 },
    ]),
    panePid: () => 100,
    processTable: async () => ([
      { pid: 100, ppid: 1, command: '-zsh' },
      { pid: 101, ppid: 100, command: 'claude' },
    ]),
    locate: () => '/x/s.jsonl',
    profileOf: () => '.iclaude',
  });
  assert.strictEqual(found[0].profile, '.iclaude');
});
