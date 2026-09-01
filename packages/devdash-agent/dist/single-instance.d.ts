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
export declare function acquireSingleInstanceLock(serverUrl: string): boolean;
/** The pid currently holding the lock for a URL, or 0 if none/stale. */
export declare function currentLockHolder(serverUrl: string): number;
//# sourceMappingURL=single-instance.d.ts.map