import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getConfigDir } from './config';

// Why this exists: the agent can be launched by several uncoordinated paths —
// a launchd/systemd service (KeepAlive), the cron watchdog, and CLI
// `start --daemon` / `restart`. None of them knew about the others, so two or
// more `index.js` processes could run at once, each opening a WebSocket with
// the SAME api key. The server keeps only one connection per key and drops the
// rest (close 1006), producing an endless connect/disconnect flap and stopping
// live-session reporting. This lock makes duplicates structurally impossible.
//
// The lock is keyed by SERVER URL, not globally: a machine may legitimately run
// one agent against the remote server and one against a localhost server at the
// same time (the remote/local profiles). One daemon per unique URL — no more.

// A pidfile is used as the lock. It is intentionally NOT flock(2): Node has no
// portable flock, and a pidfile + liveness probe reclaims cleanly after a crash
// or SIGKILL (where no unlock handler could ever run) without a native dep.
function lockPathFor(serverUrl: string): string {
  const key = crypto.createHash('sha1').update(serverUrl).digest('hex').slice(0, 12);
  return path.join(getConfigDir(), `agent-${key}.lock`);
}

// A pid is "alive" if signal 0 succeeds. EPERM means the pid exists but is owned
// by another user — still alive, so treat it as held.
function isAlive(pid: number): boolean {
  if (!pid || Number.isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function removeIfOurs(lock: string): void {
  try {
    const held = parseInt(fs.readFileSync(lock, 'utf-8').trim(), 10);
    if (held === process.pid) fs.unlinkSync(lock);
  } catch {
    /* already gone / unreadable — nothing to clean */
  }
}

/**
 * Ensure at most one agent runs per server URL (first-holder-wins).
 *
 * Returns true if THIS process now owns the lock and should proceed. Returns
 * false if a healthy agent already owns it — the caller must exit, so a
 * watchdog/service respawn or a stray manual start quietly stands aside instead
 * of stacking a second connection. A stale lock (dead/SIGKILLed holder) is
 * reclaimed automatically. The lock is released on normal process exit; a
 * SIGKILLed holder leaves a stale file that the next start reclaims.
 *
 * First-wins (not "new kills old") is deliberate: with two independent
 * supervisors (launchd + cron), a "new always takes over" rule would let them
 * ping-pong — each killing and respawning the other forever. An explicit
 * `restart` still works: it SIGTERMs the old daemon first, which releases the
 * lock, then the fresh start acquires it.
 */
export function acquireSingleInstanceLock(serverUrl: string): boolean {
  const lock = lockPathFor(serverUrl);

  // Two attempts: the second only runs after we reclaim a proven-stale lock.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // O_CREAT|O_EXCL — atomic "create only if absent", so two racing starts
      // can't both believe they won.
      const fd = fs.openSync(lock, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      // Release on any normal exit. 'exit' must stay synchronous (it is).
      // index.ts's SIGINT/SIGTERM handlers call process.exit, which fires this.
      process.on('exit', () => removeIfOurs(lock));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;

      let holder = 0;
      try {
        holder = parseInt(fs.readFileSync(lock, 'utf-8').trim(), 10);
      } catch {
        /* unreadable — treat as stale below */
      }

      if (holder && holder !== process.pid && isAlive(holder)) {
        return false; // a healthy agent already owns this URL
      }

      // Stale (dead holder, our own leftover, or unreadable): drop and retry.
      try {
        fs.unlinkSync(lock);
      } catch {
        /* someone else won the race to reclaim — loop will re-evaluate */
      }
    }
  }

  // Could not acquire after reclaiming once (lost a reclaim race to a peer that
  // is now the healthy holder). Stand aside.
  return false;
}

/** The pid currently holding the lock for a URL, or 0 if none/stale. */
export function currentLockHolder(serverUrl: string): number {
  const lock = lockPathFor(serverUrl);
  try {
    const holder = parseInt(fs.readFileSync(lock, 'utf-8').trim(), 10);
    return isAlive(holder) ? holder : 0;
  } catch {
    return 0;
  }
}
