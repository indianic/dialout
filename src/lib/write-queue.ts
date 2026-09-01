// Output flow-control for the terminal: xterm.write() is synchronous and can
// stutter the UI thread when a PTY dumps a large burst (e.g. `cat` on a big
// file, a noisy build log). createWriteQueue() coalesces pushes and flushes
// them once per animation frame instead of writing every message the moment
// it arrives off the socket — same total bytes, fewer/larger writes, no
// dropped or reordered output.

export interface WriteQueueOptions {
  /** Caps how many characters a single flush writes. Any remainder stays
   *  queued (in order) and is written on the next scheduled flush(es)
   *  instead of being dropped. Defaults to unbounded (one flush = the whole
   *  queue). */
  maxCharsPerFlush?: number;
  /** Injectable scheduler for the coalesced flush — defaults to
   *  requestAnimationFrame. Tests pass a synchronous/deterministic fake so
   *  they don't depend on a real animation frame. */
  schedule?: (cb: () => void) => number;
  /** Cancels a handle returned by `schedule`. Defaults to
   *  cancelAnimationFrame. */
  cancel?: (handle: number) => void;
}

export interface WriteQueue {
  /** Enqueues a chunk of data; schedules a flush if one isn't already pending. */
  push(data: string): void;
  /** Flushes synchronously right now, cancelling any pending scheduled flush.
   *  No-op if nothing is queued. */
  flushNow(): void;
  /** Cancels any pending scheduled flush and drops whatever is queued,
   *  WITHOUT writing it. This is the teardown path (socket/component
   *  cleanup) — by that point there is nothing left to render output into,
   *  so discarding (not flushing) is the correct + simplest behavior. Call
   *  flushNow() first if you need the queued data written before disposal. */
  dispose(): void;
}

/**
 * Coalesces `write()` calls behind a requestAnimationFrame-scheduled flush.
 * Preserves order and never drops data: pushes accumulate in a queue and are
 * concatenated on flush; `maxCharsPerFlush` only caps how much of that queue
 * is written per flush, re-queuing (and re-scheduling) the remainder.
 */
export function createWriteQueue(
  write: (data: string) => void,
  opts: WriteQueueOptions = {},
): WriteQueue {
  const maxChars = opts.maxCharsPerFlush ?? Infinity;
  const schedule = opts.schedule ?? ((cb: () => void) => requestAnimationFrame(cb));
  const cancel = opts.cancel ?? ((h: number) => cancelAnimationFrame(h));

  let queue: string[] = [];
  let handle: number | null = null;
  let disposed = false;

  const scheduleFlush = () => {
    if (disposed || handle !== null) return;
    handle = schedule(flush);
  };

  const flush = () => {
    handle = null;
    if (queue.length === 0) return;
    const combined = queue.join('');
    queue = [];
    if (combined.length <= maxChars) {
      write(combined);
      return;
    }
    write(combined.slice(0, maxChars));
    queue.push(combined.slice(maxChars));
    // Still more queued than this flush was allowed to send — schedule the
    // next slice rather than waiting for another push() to trigger it.
    scheduleFlush();
  };

  return {
    push(data: string) {
      if (disposed) return;
      queue.push(data);
      scheduleFlush();
    },
    flushNow() {
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
      flush();
    },
    dispose() {
      disposed = true;
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
      queue = [];
    },
  };
}
