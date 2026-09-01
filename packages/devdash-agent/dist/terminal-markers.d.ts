export interface EnvMarker {
    /** Env var whose non-empty presence identifies the terminal. */
    envVar: string;
    /** Canonical token, must satisfy /^[A-Za-z0-9._-]+$/. */
    token: string;
}
/**
 * The generic VTE catch-all token (ENV_MARKERS' last entry).
 *
 * PROVISIONAL, not final. Every VTE-based terminal exports VTE_VERSION, so a
 * bare `vte` result only means "some VTE terminal" — it does NOT mean env
 * resolution identified the emulator. Terminals like xfce4-terminal set no
 * specific env marker but ARE in PROC_NAMES, so a `vte` result must not stop
 * resolution: the /proc walk still runs and a specific token from it wins,
 * with `vte` restored when the walk finds nothing. Both sides implement this —
 * currentTerminalToken() in terminal-detect.ts and the walk guard emitted by
 * renderProcWalk() in cowork.ts — so they resolve identically (Constraint 5).
 *
 * Without it, the "XFCE Terminal" checklist row could never be `current` and
 * selecting it was a silent no-op: the exact bug this branch exists to fix.
 */
export declare const GENERIC_ENV_TOKEN = "vte";
export declare const ENV_MARKERS: EnvMarker[];
/** Resolve a token from env: TERM_PROGRAM first, then ENV_MARKERS in order. */
export declare function tokenFromEnv(env: NodeJS.ProcessEnv): string;
/** Linux emulator process names (from /proc/<pid>/comm) → canonical token. */
export declare const PROC_NAMES: Record<string, string>;
export interface ProcDeps {
    /** Returns the trimmed contents of /proc/<pid>/comm. */
    readComm?: (pid: number) => string;
    /** Returns the ppid parsed from /proc/<pid>/stat. */
    readPPid?: (pid: number) => number;
}
/**
 * Parses the ppid out of raw /proc/<pid>/stat contents. Must parse from the
 * LAST ")" forward: the process name (2nd field, in parens) can itself
 * contain spaces and parentheses, so a naive whitespace split would grab the
 * wrong field. After the last ")" the remaining fields are: state, ppid, ...
 */
export declare function ppidFromStat(stat: string): number;
/**
 * Walks up the process tree from startPid, at most 10 levels, looking for a
 * comm that matches PROC_NAMES. Returns the first matching token, or '' if
 * nothing matched, the bound was hit, or any read failed.
 *
 * This runs on every interactive shell start (via the generated rc block's
 * shell-equivalent walk), so the 10-level bound is a hard requirement, and a
 * read failure (e.g. no /proc on macOS) must end the walk silently rather
 * than throw.
 */
export declare function tokenFromProcTree(startPid: number, deps?: ProcDeps): string;
//# sourceMappingURL=terminal-markers.d.ts.map