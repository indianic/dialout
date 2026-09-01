export declare const COWORK_BEGIN = "# >>> devdash cowork wrapper >>>";
export declare const COWORK_END = "# <<< devdash cowork wrapper <<<";
export declare const TOKEN_RE: RegExp;
export declare function sanitizeTokens(tokens: string[]): string[];
export declare function renderMatchGate(tokens: string[]): string;
export declare function renderCoworkBlock(tokens: string[]): string;
export declare function removeCoworkBlock(content: string): string;
export declare function installCoworkBlock(rcPath: string, tokens: string[]): 'installed' | 'updated' | 'created';
export interface TmuxInstall {
    /** Exact shell command to install tmux, or '' when only manual steps apply. */
    command: string;
    /** true when the command can be run automatically (package manager present). */
    canAuto: boolean;
    /** Manual instructions when canAuto is false. */
    manual?: string;
}
/** Tokens that cannot be produced by tokenFromEnv/proc detection here. */
export declare function unmatchableTokens(tokens: string[], platform: NodeJS.Platform): string[];
export interface CoworkViability {
    usable: boolean;
    /** Machine-readable reasons, in priority order. */
    reasons: Array<'ssh-session' | 'no-emulator'>;
}
export declare function coworkViability(env: NodeJS.ProcessEnv, anyEmulatorInstalled: boolean): CoworkViability;
export declare function pickTmuxInstall(platform: NodeJS.Platform, hasCommand: (bin: string) => boolean): TmuxInstall;
//# sourceMappingURL=cowork.d.ts.map