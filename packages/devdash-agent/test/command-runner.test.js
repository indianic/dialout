const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runCommand } = require('../dist/command-runner.js');

test('foreground command captures stdout and exit 0', async () => {
  const r = await runCommand({ command: 'echo hello-ddx', background: false });
  assert.equal(r.ok, true);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /hello-ddx/);
});

test('foreground failing command reports ok:false with exit code', async () => {
  const r = await runCommand({ command: 'exit 3', background: false });
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 3);
});

test('empty command returns ok:false, no throw', async () => {
  const r = await runCommand({ command: '   ', background: false });
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test('background command returns immediately with a pid', async () => {
  const r = await runCommand({ command: 'sleep 5', background: true, logName: 'test-bg' });
  assert.equal(r.ok, true);
  assert.equal(typeof r.pid, 'number');
});

test('background command with an inaccessible cwd resolves ok:false and does NOT crash', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddx-cwd-'));
  fs.chmodSync(dir, 0o000);

  // If running as root (or on a platform where chmod 000 doesn't actually
  // restrict access), the directory will still be readable/executable —
  // skip the test rather than produce a false pass/fail.
  let restricted = true;
  try {
    fs.readdirSync(dir);
    restricted = false;
  } catch {
    restricted = true;
  }

  if (!restricted) {
    fs.chmodSync(dir, 0o755);
    fs.rmSync(dir, { recursive: true, force: true });
    t.skip('chmod 000 did not restrict access (likely running as root); skipping');
    return;
  }

  try {
    const r = await runCommand({ command: 'echo hi', cwd: dir, background: true });
    assert.equal(r.ok, false);
  } finally {
    fs.chmodSync(dir, 0o755);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
