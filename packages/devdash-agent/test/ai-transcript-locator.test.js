const test = require('node:test');
const assert = require('node:assert');
const {
  claudeProjectDir, pickNewest, locateTranscript,
} = require('../dist/ai-transcript-locator');

test('claudeProjectDir escapes the absolute cwd by replacing every slash', () => {
  assert.strictEqual(
    claudeProjectDir('/home/dev/.claude', '/Volumes/SSD/www/devdash'),
    '/home/dev/.claude/projects/-Volumes-SSD-www-devdash');
});

test('pickNewest returns the most recently modified file', () => {
  assert.strictEqual(pickNewest([
    { path: '/a.jsonl', mtimeMs: 100 },
    { path: '/b.jsonl', mtimeMs: 300 },
    { path: '/c.jsonl', mtimeMs: 200 },
  ]), '/b.jsonl');
});

test('pickNewest returns null for an empty list', () => {
  assert.strictEqual(pickNewest([]), null);
});

test('locateTranscript prefers an open write handle when the CLI holds one', () => {
  // grok-style CLIs keep the transcript open, which makes the mapping exact.
  const path = locateTranscript(28668, 'codex', {
    writeHandles: () => ['/home/dev/.codex/sessions/2026/05/05/rollout-x-uuid.jsonl'],
    procCwd: () => { throw new Error('must not be consulted'); },
  });
  assert.strictEqual(path, '/home/dev/.codex/sessions/2026/05/05/rollout-x-uuid.jsonl');
});

test('locateTranscript ignores open handles that are not transcripts', () => {
  const path = locateTranscript(1, 'claude', {
    writeHandles: () => ['/home/dev/.claude/logs/debug.log', '/dev/null'],
    procCwd: () => '/srv/app',
    procEnv: () => ({ HOME: '/home/dev', CLAUDE_CONFIG_DIR: '/home/dev/.iclaude' }),
    procStartMs: () => 0,
    listJsonl: () => [{ path: '/home/dev/.iclaude/projects/-srv-app/s1.jsonl', mtimeMs: 9 }],
    transcriptCwds: () => ['/srv/app'],
  });
  assert.strictEqual(path, '/home/dev/.iclaude/projects/-srv-app/s1.jsonl');
});

test('locateTranscript falls back to cwd + newest for Claude Code', () => {
  // Measured: Claude Code opens, appends and closes, so lsof finds nothing.
  const seen = [];
  const path = locateTranscript(1, 'claude', {
    writeHandles: () => [],
    procCwd: () => '/srv/app',
    procEnv: () => ({ HOME: '/home/dev' }),
    procStartMs: () => 0,
    listJsonl: (dir) => {
      seen.push(dir);
      return [
        { path: `${dir}/old.jsonl`, mtimeMs: 10 },
        { path: `${dir}/new.jsonl`, mtimeMs: 99 },
      ];
    },
    transcriptCwds: () => ['/srv/app'],
  });
  assert.deepStrictEqual(seen, ['/home/dev/.claude/projects/-srv-app']);
  assert.ok(path.endsWith('/new.jsonl'));
});

test('locateTranscript honours CLAUDE_CONFIG_DIR so multiple accounts resolve separately', () => {
  const path = locateTranscript(1, 'claude', {
    writeHandles: () => [],
    procCwd: () => '/srv/app',
    procEnv: () => ({ HOME: '/home/dev', CLAUDE_CONFIG_DIR: '/home/dev/.iclaude' }),
    procStartMs: () => 0,
    listJsonl: (dir) => [{ path: `${dir}/s.jsonl`, mtimeMs: 1 }],
    transcriptCwds: () => ['/srv/app'],
  });
  assert.strictEqual(path, '/home/dev/.iclaude/projects/-srv-app/s.jsonl');
});

test('locateTranscript rejects a candidate whose own cwd disagrees', () => {
  // The guard against attaching a pane to an unrelated session's transcript.
  const path = locateTranscript(1, 'claude', {
    writeHandles: () => [],
    procCwd: () => '/srv/app',
    procEnv: () => ({ HOME: '/home/dev' }),
    procStartMs: () => 0,
    listJsonl: (dir) => [{ path: `${dir}/s.jsonl`, mtimeMs: 1 }],
    transcriptCwds: () => ['/some/other/place'],
  });
  assert.strictEqual(path, null);
});

test('locateTranscript returns null when nothing is found', () => {
  assert.strictEqual(locateTranscript(1, 'claude', {
    writeHandles: () => [], procCwd: () => '', procEnv: () => ({}),
    listJsonl: () => [], transcriptCwds: () => [],
  }), null);
});

// --- Regression: two agents in one folder ---------------------------------
// Found live during Task 7 verification. Two tmux panes running claude in the
// same directory under the same config home both resolved to the newest
// transcript, so one of them showed the other's conversation.

test('locateTranscript ignores a transcript last written before the process started', () => {
  // The process must have written since it launched; a file older than that
  // belongs to a session that has already ended.
  const path = locateTranscript(1, 'claude', {
    writeHandles: () => [],
    procCwd: () => '/srv/app',
    procEnv: () => ({ HOME: '/home/dev' }),
    procStartMs: () => 5_000,
    listJsonl: (dir) => [{ path: `${dir}/stale.jsonl`, mtimeMs: 4_000 }],
    transcriptCwds: () => ['/srv/app'],
  });
  assert.strictEqual(path, null);
});

test('locateTranscript skips a transcript already claimed by another pane', () => {
  const path = locateTranscript(1, 'claude', {
    writeHandles: () => [],
    procCwd: () => '/srv/app',
    procEnv: () => ({ HOME: '/home/dev' }),
    procStartMs: () => 0,
    listJsonl: (dir) => [
      { path: `${dir}/newest.jsonl`, mtimeMs: 900 },
      { path: `${dir}/second.jsonl`, mtimeMs: 800 },
    ],
    transcriptCwds: () => ['/srv/app'],
    exclude: new Set(['/home/dev/.claude/projects/-srv-app/newest.jsonl']),
  });
  assert.ok(path.endsWith('/second.jsonl'));
});

test('locateTranscript returns null rather than guessing when every candidate is claimed', () => {
  // Not listing a session beats listing one that shows someone else's chat.
  const path = locateTranscript(1, 'claude', {
    writeHandles: () => [],
    procCwd: () => '/srv/app',
    procEnv: () => ({ HOME: '/home/dev' }),
    procStartMs: () => 0,
    listJsonl: (dir) => [{ path: `${dir}/only.jsonl`, mtimeMs: 900 }],
    transcriptCwds: () => ['/srv/app'],
    exclude: new Set(['/home/dev/.claude/projects/-srv-app/only.jsonl']),
  });
  assert.strictEqual(path, null);
});

test('an unknown process start time does not filter anything out', () => {
  // procStartMs returns 0 when ps fails; that must not hide every session.
  const path = locateTranscript(1, 'claude', {
    writeHandles: () => [],
    procCwd: () => '/srv/app',
    procEnv: () => ({ HOME: '/home/dev' }),
    procStartMs: () => 0,
    listJsonl: (dir) => [{ path: `${dir}/s.jsonl`, mtimeMs: 1 }],
    transcriptCwds: () => ['/srv/app'],
  });
  assert.ok(path.endsWith('/s.jsonl'));
});

test('claudeProjectDir replaces dots as well as slashes', () => {
  // Derived from 49 real project directories; a dot-only rule was wrong for 10.
  assert.strictEqual(
    claudeProjectDir('/home/dev/.claude', '/Users/me/www/saava.indianic.in'),
    '/home/dev/.claude/projects/-Users-me-www-saava-indianic-in');
});

test('locateTranscript accepts a transcript whose cwd drifted mid-session', () => {
  // A session that moved between a repo and its worktree records both paths.
  const path = locateTranscript(1, 'claude', {
    writeHandles: () => [],
    procCwd: () => '/srv/app/.claude/worktrees/wt',
    procEnv: () => ({ HOME: '/home/dev' }),
    procStartMs: () => 0,
    listJsonl: (dir) => [{ path: `${dir}/s.jsonl`, mtimeMs: 1 }],
    transcriptCwds: () => ['/srv/app', '/srv/app/.claude/worktrees/wt'],
  });
  assert.ok(path && path.endsWith('/s.jsonl'));
});
