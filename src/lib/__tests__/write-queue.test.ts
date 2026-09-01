import { describe, it, expect, vi, afterEach } from 'vitest';
import { createWriteQueue } from '../write-queue';

// Deterministic fake scheduler standing in for requestAnimationFrame: holds
// at most one pending callback (mirrors the queue's own "only ever one flush
// in flight" invariant) and exposes flushPending()/hasPending() so tests can
// drive the coalesced flush by hand instead of waiting on a real rAF tick.
function createFakeScheduler() {
  let cb: (() => void) | null = null;
  let handle = 0;
  return {
    schedule(fn: () => void) {
      handle += 1;
      cb = fn;
      return handle;
    },
    cancel(h: number) {
      if (h === handle) cb = null;
    },
    flushPending() {
      const fn = cb;
      cb = null;
      fn?.();
    },
    hasPending() {
      return cb !== null;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createWriteQueue', () => {
  it('accumulates pushes and flushes them concatenated in order', () => {
    const write = vi.fn();
    const sched = createFakeScheduler();
    const q = createWriteQueue(write, { schedule: sched.schedule, cancel: sched.cancel });

    q.push('a');
    q.push('b');
    q.push('c');
    expect(write).not.toHaveBeenCalled();

    sched.flushPending();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('abc');
  });

  it('splits a flush across maxCharsPerFlush boundaries, preserving order with nothing lost', () => {
    const write = vi.fn();
    const sched = createFakeScheduler();
    const q = createWriteQueue(write, {
      maxCharsPerFlush: 3,
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    q.push('abcdefghi'); // 9 chars, caps at 3/flush => 3 flushes

    sched.flushPending();
    expect(write).toHaveBeenNthCalledWith(1, 'abc');
    expect(sched.hasPending()).toBe(true); // remainder re-scheduled automatically

    sched.flushPending();
    expect(write).toHaveBeenNthCalledWith(2, 'def');
    expect(sched.hasPending()).toBe(true);

    sched.flushPending();
    expect(write).toHaveBeenNthCalledWith(3, 'ghi');
    expect(sched.hasPending()).toBe(false); // nothing left, no further schedule

    expect(write.mock.calls.map((c) => c[0]).join('')).toBe('abcdefghi');
  });

  it('splits across flushes even when pushes arrive in separate smaller chunks', () => {
    const write = vi.fn();
    const sched = createFakeScheduler();
    const q = createWriteQueue(write, {
      maxCharsPerFlush: 4,
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    q.push('ab');
    q.push('cde');
    q.push('fg'); // combined queue: 'abcdefg' (7 chars)

    sched.flushPending();
    expect(write).toHaveBeenNthCalledWith(1, 'abcd');
    sched.flushPending();
    expect(write).toHaveBeenNthCalledWith(2, 'efg');
    expect(sched.hasPending()).toBe(false);

    expect(write.mock.calls.map((c) => c[0]).join('')).toBe('abcdefg');
  });

  it('flushNow writes synchronously and cancels a pending scheduled flush', () => {
    const write = vi.fn();
    const sched = createFakeScheduler();
    const q = createWriteQueue(write, { schedule: sched.schedule, cancel: sched.cancel });

    q.push('x');
    expect(sched.hasPending()).toBe(true);

    q.flushNow();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('x');
    expect(sched.hasPending()).toBe(false);

    // If the (now-cancelled) rAF tick fires anyway, nothing double-writes.
    sched.flushPending();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('flushNow is a no-op when there is nothing queued', () => {
    const write = vi.fn();
    const sched = createFakeScheduler();
    const q = createWriteQueue(write, { schedule: sched.schedule, cancel: sched.cancel });

    q.flushNow();
    expect(write).not.toHaveBeenCalled();
  });

  it('dispose cancels the pending flush and discards queued data without writing', () => {
    const write = vi.fn();
    const sched = createFakeScheduler();
    const q = createWriteQueue(write, { schedule: sched.schedule, cancel: sched.cancel });

    q.push('never written');
    expect(sched.hasPending()).toBe(true);

    q.dispose();
    expect(sched.hasPending()).toBe(false);

    sched.flushPending(); // no-op: cancelled
    expect(write).not.toHaveBeenCalled();

    // Further pushes/flushNow after dispose stay inert.
    q.push('still nothing');
    q.flushNow();
    expect(write).not.toHaveBeenCalled();
  });

  it('defaults to requestAnimationFrame for scheduling when no schedule option is given', () => {
    let rafCb: (() => void) | null = null;
    const raf = vi.fn((cb: () => void) => { rafCb = cb; return 1; });
    const caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', caf);

    const write = vi.fn();
    const q = createWriteQueue(write);
    q.push('hi');

    expect(raf).toHaveBeenCalledTimes(1);
    rafCb!();
    expect(write).toHaveBeenCalledWith('hi');
  });
});
