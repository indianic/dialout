const test = require('node:test');
const assert = require('node:assert');
const {
  launchId, isLaunchId, parseLaunchId, buildLaunchArgs,
  addRecord, removeRecord, listRecords, PERMISSION_MODES,
} = require('../dist/ai-launch');

const rec = (over = {}) => ({
  sessionId: '596ba650-2e95-46f6-890e-923ac45dee69',
  kind: 'claude',
  cwd: '/srv/app',
  title: 'fix the deploy',
  permissionMode: 'default',
  configHome: '',
  createdAt: 1,
  ...over,
});

test('launch ids are namespaced so they cannot collide with a tmux name', () => {
  const id = launchId('abc-123');
  assert.strictEqual(id, 'launch:abc-123');
  assert.ok(isLaunchId(id));
  assert.strictEqual(parseLaunchId(id), 'abc-123');
});

test('a tmux session name is not mistaken for a launch id', () => {
  assert.strictEqual(isLaunchId('dd-ses_abc'), false);
  assert.strictEqual(parseLaunchId('dd-ses_abc'), null);
});

test('the first turn pins the session id so the transcript is findable', () => {
  const args = buildLaunchArgs(rec(), true);
  assert.ok(args.includes('--session-id'));
  assert.strictEqual(args[args.indexOf('--session-id') + 1], rec().sessionId);
  assert.ok(!args.includes('--resume'));
});

test('later turns resume that same session rather than starting a new one', () => {
  const args = buildLaunchArgs(rec(), false);
  assert.ok(args.includes('--resume'));
  assert.strictEqual(args[args.indexOf('--resume') + 1], rec().sessionId);
  assert.ok(!args.includes('--session-id'));
});

test('every turn speaks stream-json in both directions', () => {
  const args = buildLaunchArgs(rec(), true);
  assert.ok(args.includes('-p'));
  assert.strictEqual(args[args.indexOf('--input-format') + 1], 'stream-json');
  assert.strictEqual(args[args.indexOf('--output-format') + 1], 'stream-json');
});

test('the permission mode chosen at launch is passed through', () => {
  const args = buildLaunchArgs(rec({ permissionMode: 'plan' }), true);
  assert.strictEqual(args[args.indexOf('--permission-mode') + 1], 'plan');
});

test('an unrecognised permission mode falls back to default rather than being passed on', () => {
  // Never hand an arbitrary string to the CLI: 'bypassPermissions' arriving
  // from a tampered request must not be reachable by accident.
  const args = buildLaunchArgs(rec({ permissionMode: 'sudo-everything' }), true);
  assert.strictEqual(args[args.indexOf('--permission-mode') + 1], 'default');
});

test('bypassPermissions is not offered as a selectable mode', () => {
  // It disables every check. Reachable only by someone editing the agent
  // config by hand on the machine itself, never from a phone.
  assert.ok(!PERMISSION_MODES.includes('bypassPermissions'));
  assert.ok(PERMISSION_MODES.includes('plan'));
  assert.ok(PERMISSION_MODES.includes('acceptEdits'));
});

test('codex launches use its own argv, not claude flags', () => {
  const args = buildLaunchArgs(rec({ kind: 'codex' }), true);
  assert.ok(!args.includes('--session-id'), 'codex has no --session-id');
});

// --- registry ---------------------------------------------------------------

test('addRecord appends and listRecords reads back', () => {
  let disk = '[]';
  const deps = { read: () => disk, write: (t) => { disk = t; } };
  addRecord(rec(), deps);
  const all = listRecords(deps);
  assert.strictEqual(all.length, 1);
  assert.strictEqual(all[0].sessionId, rec().sessionId);
});

test('addRecord replaces an existing entry rather than duplicating it', () => {
  let disk = '[]';
  const deps = { read: () => disk, write: (t) => { disk = t; } };
  addRecord(rec(), deps);
  addRecord(rec({ title: 'renamed' }), deps);
  const all = listRecords(deps);
  assert.strictEqual(all.length, 1);
  assert.strictEqual(all[0].title, 'renamed');
});

test('removeRecord drops just the one', () => {
  let disk = '[]';
  const deps = { read: () => disk, write: (t) => { disk = t; } };
  addRecord(rec(), deps);
  addRecord(rec({ sessionId: 'other' }), deps);
  removeRecord(rec().sessionId, deps);
  const all = listRecords(deps);
  assert.strictEqual(all.length, 1);
  assert.strictEqual(all[0].sessionId, 'other');
});

test('a corrupt registry file reads as empty instead of crashing the agent', () => {
  const deps = { read: () => 'not json at all', write: () => {} };
  assert.deepStrictEqual(listRecords(deps), []);
});

test('a missing registry file reads as empty', () => {
  const deps = { read: () => { throw new Error('ENOENT'); }, write: () => {} };
  assert.deepStrictEqual(listRecords(deps), []);
});
