const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DIST = path.join(__dirname, '..', 'dist', 'has-command.js');
const { hasCommand } = require(DIST);

// --- basic resolution ---

test('hasCommand: a binary that certainly exists resolves true', () => {
  assert.strictEqual(hasCommand('sh'), true);
});

test('hasCommand: a binary that certainly does not exist resolves false', () => {
  assert.strictEqual(hasCommand('__devdash_no_such_bin__'), false);
});

// --- injection safety ---
//
// `bin` must never be interpretable as shell syntax. Each of these would, if
// concatenated into a shell command line unescaped, run an attacker command —
// here, creating a marker file. Assert both that hasCommand reports false
// (none of these resolve as a real binary) AND that the marker file was never
// created (no side effect actually ran).

test('hasCommand: shell metacharacters in bin are inert, not executed', () => {
  const marker = path.join(
    os.tmpdir(),
    `devdash-hascommand-injection-${process.pid}-${Date.now()}.marker`
  );
  try {
    if (fs.existsSync(marker)) fs.unlinkSync(marker);

    const malicious = [
      `; touch ${marker}`,
      `$(touch ${marker})`,
      `a b`, // whitespace: must not be split into separate argv positions
    ];

    for (const bin of malicious) {
      assert.strictEqual(hasCommand(bin), false, `expected false for bin=${JSON.stringify(bin)}`);
      assert.strictEqual(
        fs.existsSync(marker),
        false,
        `injection succeeded — marker file was created for bin=${JSON.stringify(bin)}`
      );
    }
  } finally {
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
  }
});

// --- DEP0190 ---
//
// Node 22+ emits DEP0190 when an args array is passed together with a truthy
// `shell` option to execFileSync/execFile/spawn — exactly the old
// `execFileSync('command', ['-v', bin], { stdio: 'pipe', shell: '/bin/sh' })`
// pattern this file replaces. Not every installed Node build implements
// DEP0190 (it's absent on some patch lines) — probe for that first so this
// test skips cleanly instead of vacuously passing or failing on those
// runtimes.

function runtimeEmitsDep0190() {
  // Deliberately reproduces the OLD vulnerable call shape (args + shell) to
  // check whether *this* Node build warns on it at all — independent of our
  // fix, which must never hit this pattern.
  const probe = spawnSync(process.execPath, ['-e', `
    const { execFileSync } = require('child_process');
    try {
      execFileSync('command', ['-v', 'sh'], { stdio: 'pipe', shell: '/bin/sh' });
    } catch {}
  `]);
  return /DEP0190/.test(probe.stderr.toString());
}

test('hasCommand never triggers the DEP0190 deprecation warning', (t) => {
  if (!runtimeEmitsDep0190()) {
    t.skip(`${process.version} does not implement DEP0190 — nothing to assert here`);
    return;
  }

  const result = spawnSync(process.execPath, ['-e', `
    const { hasCommand } = require(${JSON.stringify(DIST)});
    hasCommand('sh');
  `]);

  assert.doesNotMatch(
    result.stderr.toString(),
    /DeprecationWarning/,
    `hasCommand triggered a deprecation warning on ${process.version}:\n${result.stderr.toString()}`
  );
});
