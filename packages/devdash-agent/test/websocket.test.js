const test = require('node:test');
const assert = require('node:assert');
const { reconnectDelay, RECONNECT_BASE_MS, RECONNECT_MAX_MS } = require('../dist/websocket');

// Reconnect used to be a flat 5s forever: every agent in the fleet retried in
// lockstep and hammered the server the moment it went down.
test('reconnectDelay starts near the base delay on the first attempt', () => {
  // rand = 0.5 → no jitter offset, so the raw backoff shows through.
  assert.strictEqual(reconnectDelay(1, () => 0.5), RECONNECT_BASE_MS);
});

test('reconnectDelay backs off exponentially across attempts', () => {
  const d1 = reconnectDelay(1, () => 0.5);
  const d2 = reconnectDelay(2, () => 0.5);
  const d3 = reconnectDelay(3, () => 0.5);
  assert.strictEqual(d2, d1 * 2);
  assert.strictEqual(d3, d1 * 4);
});

test('reconnectDelay caps the backoff so retries never stall out', () => {
  assert.strictEqual(reconnectDelay(99, () => 0.5), RECONNECT_MAX_MS);
});

test('reconnectDelay jitters within +/-20% so agents do not retry in lockstep', () => {
  const low = reconnectDelay(3, () => 0);
  const high = reconnectDelay(3, () => 1);
  const mid = reconnectDelay(3, () => 0.5);
  assert.strictEqual(low, Math.round(mid * 0.8));
  assert.strictEqual(high, Math.round(mid * 1.2));
  assert.ok(low < mid && mid < high);
});

test('reconnectDelay is always a positive integer', () => {
  for (const attempt of [1, 2, 5, 10, 50]) {
    for (const r of [0, 0.5, 1]) {
      const d = reconnectDelay(attempt, () => r);
      assert.ok(Number.isInteger(d), `attempt ${attempt} rand ${r} => ${d}`);
      assert.ok(d > 0);
    }
  }
});
