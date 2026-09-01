const test = require('node:test');
const assert = require('node:assert');
const { isConnectionStale, STALE_MULTIPLIER } = require('../dist/heartbeat');

// The agent sends `heartbeat` every intervalMs and the server answers `pong`.
// Nothing used to check the pong ever arrived, so a half-open socket could sit
// "connected" forever without reconnecting.
test('isConnectionStale is false while pongs keep arriving', () => {
  const now = 100_000;
  assert.strictEqual(isConnectionStale(now - 1_000, now, 30_000), false);
});

test('isConnectionStale is false just inside the grace window', () => {
  const now = 100_000;
  const interval = 30_000;
  const lastPong = now - (interval * STALE_MULTIPLIER) + 1;
  assert.strictEqual(isConnectionStale(lastPong, now, interval), false);
});

test('isConnectionStale is true once pongs stop for the grace window', () => {
  const now = 100_000;
  const interval = 30_000;
  const lastPong = now - (interval * STALE_MULTIPLIER) - 1;
  assert.strictEqual(isConnectionStale(lastPong, now, interval), true);
});

test('isConnectionStale never fires before a first pong is recorded', () => {
  // null = connected but no pong seen yet; the interval timer has not run.
  assert.strictEqual(isConnectionStale(null, 100_000, 30_000), false);
});
