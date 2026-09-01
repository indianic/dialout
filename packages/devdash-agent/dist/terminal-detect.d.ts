import { ProcDeps } from './terminal-markers';
export interface KnownTerminal {
    /** Display name for the checklist, e.g. "iTerm". */
    name: string;
    /** Canonical token stored in config and matched at runtime. */
    token: string;
    /** macOS .app bundle basenames that indicate it is installed. */
    appBundles: string[];
    /** true when the app bundle is present on disk (or launcher present on Linux). */
    installed: boolean;
    /** true when this is the terminal setup is currently running in. */
    current: boolean;
}
export interface DetectDeps {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    /** macOS: true when the given .app bundle exists in a standard location. */
    appExists?: (bundle: string) => boolean;
    /** Linux: true when the given launcher binary is on PATH. */
    hasCommand?: (bin: string) => boolean;
    /** Injectable for testing the /proc fallback; see currentTerminalToken. */
    ppid?: number;
    /** Injectable for testing the /proc fallback; see currentTerminalToken. */
    procDeps?: ProcDeps;
}
/** Optional injectable deps for currentTerminalToken's /proc fallback, for testing. */
export interface CurrentTokenDeps {
    ppid?: number;
    platform?: NodeJS.Platform;
    procDeps?: ProcDeps;
}
/**
 * Canonical token for the terminal setup is running in, or "" if unknown.
 * Delegates to the shared terminal-markers.ts table so this can never drift
 * from the generated shell gate (cowork.ts): tokenFromEnv() first (handles
 * the TMUX guard, TERM_PROGRAM, and ENV_MARKERS), then — only on linux, where
 * /proc exists — tokenFromProcTree() walks up from the ppid for the emulators
 * that set no distinguishing env var at all (xfce4-terminal, foot, urxvt,
 * xterm, st, ...). macOS never reaches the /proc fallback: behavior there is
 * unchanged.
 *
 * The generic GENERIC_ENV_TOKEN ("vte") result is PROVISIONAL: every VTE-based
 * terminal exports VTE_VERSION, so treating it as final shadowed every
 * PROC_NAMES entry that is also VTE-based (xfce4-terminal today; guake,
 * mate-terminal tomorrow) and made their checklist rows unreachable. So the
 * walk still runs for it and a specific token wins, with "vte" restored when
 * the walk finds nothing. The emitted shell walk guard does exactly the same
 * (renderProcWalk in cowork.ts) — that is the invariant.
 */
export declare function currentTerminalToken(env?: NodeJS.ProcessEnv, deps?: CurrentTokenDeps): string;
export declare function detectTerminals(deps?: DetectDeps): KnownTerminal[];
//# sourceMappingURL=terminal-detect.d.ts.map