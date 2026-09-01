const test = require('node:test');
const assert = require('node:assert');
const { parseSessionLine, tailLines, tmuxSessionName, killTmuxSession, SEP,
        tmuxAvailable, resetTmuxAvailableCache, tmuxLocaleEnv } = require('../dist/tmux-manager');

// Fields are joined with \x1f (unit separator). It cannot occur in a session
// name or a filesystem path, so every field can be read positionally — unlike
// '|', which is legal in both and forced the old right-anchored parse.
const line = (...f) => f.join(SEP);

test('parseSessionLine parses a full list-sessions line', () => {
  const s = parseSessionLine(line('devdash-4821', '1751800000', '1', '1751800100', '120', '32', '/Users/dev/www/api'));
  assert.deepStrictEqual(s, {
    name: 'devdash-4821', createdAt: 1751800000, attached: 1,
    lastActivity: 1751800100, width: 120, height: 32,
    folder: 'api', folderPath: '/Users/dev/www/api',
    createdLocal: '', gitBranch: '',
  });
});

test('parseSessionLine reports the LIVE pane path, deriving folder from it', () => {
  // The whole point: @devdash_folder_path is frozen at session creation, so a
  // `cd` makes it lie. pane_current_path always reflects where the user is now.
  const s = parseSessionLine(line('s', '1', '0', '2', '80', '24', '/Users/indianic/www/products/reimage'));
  assert.strictEqual(s.folderPath, '/Users/indianic/www/products/reimage');
  assert.strictEqual(s.folder, 'reimage');
});

test('parseSessionLine tolerates session names containing dashes and dots', () => {
  const s = parseSessionLine(line('my.dir-name-77', '1', '0', '2', '80', '24', '/tmp'));
  assert.strictEqual(s.name, 'my.dir-name-77');
  assert.strictEqual(s.attached, 0);
});

test('parseSessionLine returns null on malformed lines', () => {
  assert.strictEqual(parseSessionLine(''), null);
  assert.strictEqual(parseSessionLine('garbage'), null);
  assert.strictEqual(parseSessionLine(line('a', 'b', 'c', 'd', 'e', 'f', '/tmp')), null);
});

test('parseSessionLine keeps pipes inside session names and paths', () => {
  const s = parseSessionLine(line('foo|bar', '1751800000', '1', '1751800100', '120', '32', '/tmp/we|rd'));
  assert.strictEqual(s.name, 'foo|bar');
  assert.strictEqual(s.folderPath, '/tmp/we|rd');
  assert.strictEqual(s.folder, 'we|rd');
  assert.strictEqual(s.width, 120);
});

test('parseSessionLine rejects empty names', () => {
  assert.strictEqual(parseSessionLine(line('', '1', '2', '3', '4', '5', '/tmp')), null);
});

test('parseSessionLine survives a session with no pane path', () => {
  // Empty path must not crash or invent a folder — listSessions falls back to
  // the @devdash_folder_path option for these.
  const s = parseSessionLine(line('s', '1', '0', '2', '80', '24', ''));
  assert.strictEqual(s.folderPath, '');
  assert.strictEqual(s.folder, '');
});

test('parseSessionLine handles a root pane path', () => {
  const s = parseSessionLine(line('s', '1', '0', '2', '80', '24', '/'));
  assert.strictEqual(s.folderPath, '/');
  assert.strictEqual(s.folder, '');
});

test('parseSessionLine strips a trailing slash when deriving folder', () => {
  const s = parseSessionLine(line('s', '1', '0', '2', '80', '24', '/Users/dev/api/'));
  assert.strictEqual(s.folder, 'api');
});

test('tailLines returns the last N non-trailing-blank lines', () => {
  assert.strictEqual(tailLines('a\nb\nc\nd\n', 2), 'c\nd');
  assert.strictEqual(tailLines('only\n\n\n', 3), 'only');
  assert.strictEqual(tailLines('x\ny', 0), '');
  assert.strictEqual(tailLines('', 3), '');
});

// Server ids are `ses_` + random + Date.now().toString(36), and the base36
// timestamp is exactly 8 chars — so a name built from the last 8 chars keeps
// only the millisecond and throws the random part away. Two sessions opened in
// the same millisecond then collide onto one tmux name.
test('tmuxSessionName keeps ids unique when only the random part differs', () => {
  const a = tmuxSessionName('ses_aaaaaaaaaa1mabcdefg');
  const b = tmuxSessionName('ses_bbbbbbbbbb1mabcdefg');
  assert.notStrictEqual(a, b);
});

test('tmuxSessionName is deterministic for the same id', () => {
  assert.strictEqual(tmuxSessionName('ses_abc123'), tmuxSessionName('ses_abc123'));
});

test('tmuxSessionName strips characters tmux treats specially', () => {
  const name = tmuxSessionName('ses_a.b:c d/e');
  assert.match(name, /^dd-[a-zA-Z0-9_-]+$/);
});

test('killTmuxSession reports ok when tmux kills the session', async () => {
  const calls = [];
  const res = await killTmuxSession('dd-live', { run: async (args) => { calls.push(args); return ''; } });
  assert.deepStrictEqual(res, { ok: true });
  assert.deepStrictEqual(calls, [['kill-session', '-t', 'dd-live']]);
});

test('killTmuxSession treats an already-gone session as success', async () => {
  const res = await killTmuxSession('dd-gone', {
    run: async () => { throw new Error("can't find session: dd-gone"); },
  });
  assert.deepStrictEqual(res, { ok: true });
});

test('killTmuxSession reports failure when tmux itself is broken', async () => {
  const res = await killTmuxSession('dd-x', {
    run: async () => { throw new Error('spawn tmux ENOENT'); },
  });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /ENOENT/);
});


// --- tmuxAvailable: a missing tmux must not be a permanent, silent death ---
//
// pollTmuxSessions() opens with `if (!(await tmuxAvailable())) return;`. The
// negative answer used to be cached for the life of the process and nothing was
// logged, so an agent that started before tmux was installed stayed ONLINE and
// reported zero terminal sessions and zero AI sessions forever — indistinguish-
// able from "nothing is running", and unfixable without restarting the daemon.

// MUST await fn before restoring: tmuxAvailable() logs from an async callback,
// so a synchronous finally puts console back before the message is ever written
// and the capture comes back empty.
async function withSilencedConsole(fn) {
  const err = console.error, log = console.log;
  const out = [];
  console.error = (m) => out.push(String(m));
  console.log = (m) => out.push(String(m));
  try { return { value: await fn(out), out }; } finally { console.error = err; console.log = log; }
}

test('tmuxAvailable re-probes after the backoff, so installing tmux self-heals', async () => {
  resetTmuxAvailableCache();
  const realPath = process.env.PATH;
  try {
    // tmux unreachable: an empty PATH cannot resolve it.
    process.env.PATH = '';
    const first = await withSilencedConsole(() => tmuxAvailable(() => 0));
    assert.strictEqual(first.value, false);

    // Still inside the backoff window -> cached, no re-probe.
    process.env.PATH = realPath;
    const cached = await withSilencedConsole(() => tmuxAvailable(() => 1000));
    assert.strictEqual(cached.value, false, 'must not re-probe on every single poll');

    // Past the window -> probes again and recovers WITHOUT an agent restart.
    const healed = await withSilencedConsole(() => tmuxAvailable(() => 61_000));
    assert.strictEqual(healed.value, true, 'a later probe must pick tmux up');
  } finally {
    process.env.PATH = realPath;
    resetTmuxAvailableCache();
  }
});

test('tmuxAvailable logs once, naming PATH, when tmux cannot be found', async () => {
  resetTmuxAvailableCache();
  const realPath = process.env.PATH;
  try {
    process.env.PATH = '/nonexistent-devdash-probe';
    const { out } = await withSilencedConsole(() => tmuxAvailable(() => 0));
    const warnings = out.filter((m) => m.includes('tmux not found on PATH'));
    assert.strictEqual(warnings.length, 1, 'exactly one warning, not one per 5s poll');
    assert.match(warnings[0], /nonexistent-devdash-probe/, 'the warning must name the PATH it searched');
    assert.match(warnings[0], /AI sessions/, 'must say what breaks, not just that a binary is missing');
  } finally {
    process.env.PATH = realPath;
    resetTmuxAvailableCache();
  }
});

test('tmuxAvailable caches a positive answer and stops probing', async () => {
  resetTmuxAvailableCache();
  const a = await tmuxAvailable(() => 0);
  if (!a) return; // no tmux on this machine; nothing to assert
  const realPath = process.env.PATH;
  try {
    process.env.PATH = ''; // would fail if it probed again
    assert.strictEqual(await tmuxAvailable(() => 999_999), true, 'a positive result is cached');
  } finally {
    process.env.PATH = realPath;
    resetTmuxAvailableCache();
  }
});

// tmux replaces \x1f with '_' in -F output unless it runs in a UTF-8 locale,
// and launchd/systemd start a daemon with no locale at all. That turned every
// list-sessions line into one unsplittable field and the agent reported zero
// terminals forever, while looking online and healthy.
test('tmuxLocaleEnv forces a UTF-8 locale when none is set', () => {
  const env = tmuxLocaleEnv({ PATH: '/usr/bin' });
  assert.strictEqual(env.LC_ALL, 'C.UTF-8');
  assert.strictEqual(env.PATH, '/usr/bin', 'must not drop the rest of the environment');
});

test('tmuxLocaleEnv overrides an explicitly non-UTF-8 locale', () => {
  assert.strictEqual(tmuxLocaleEnv({ LC_ALL: 'C' }).LC_ALL, 'C.UTF-8');
  assert.strictEqual(tmuxLocaleEnv({ LANG: 'POSIX' }).LC_ALL, 'C.UTF-8');
});

test('tmuxLocaleEnv leaves a UTF-8 locale alone', () => {
  // LC_ALL wins over LC_CTYPE and LANG, so it is the one that is read first.
  assert.strictEqual(tmuxLocaleEnv({ LC_ALL: 'en_US.UTF-8' }).LC_ALL, 'en_US.UTF-8');
  assert.strictEqual(tmuxLocaleEnv({ LC_CTYPE: 'UTF-8' }).LC_ALL, undefined);
  assert.strictEqual(tmuxLocaleEnv({ LANG: 'en_GB.utf8' }).LC_ALL, undefined);
});

test('parseSessionLine returns null when tmux sanitized the separator to _', () => {
  // Exactly what the daemon received: the whole line as one field.
  assert.strictEqual(parseSessionLine('sandeep-5940_1787295617_1_1787295709_150_49_/Users/sandeep'), null);
});
