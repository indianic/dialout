export declare function serviceUser(env?: NodeJS.ProcessEnv, info?: () => string): string;
export interface UninstallDeps {
    platform?: NodeJS.Platform;
    existsSync?: (p: string) => boolean;
    isRoot?: () => boolean;
    canPromptSudo?: () => boolean;
    run?: (cmd: string, opts?: object) => void;
    log?: (msg: string) => void;
}
export interface UninstallResult {
    /** Something was actually removed from disk. */
    removed: boolean;
    /** Manual steps the caller must still run, because we could not escalate. */
    pending: string[];
}
export interface LingerDeps {
    run?: (cmd: string) => void;
    isEnabled?: (user: string) => boolean;
}
export interface LingerResult {
    ok: boolean;
    alreadyOn: boolean;
    error?: string;
}
export declare function isLingerEnabled(user: string): boolean;
export declare function enableLinger(user: string, deps?: LingerDeps): LingerResult;
export interface LinuxScopeDeps {
    isRoot?: () => boolean;
}
export declare function defaultLinuxScope(deps?: LinuxScopeDeps): 'system' | 'user';
export type ServiceKind = 'launchd-agent' | 'launchd-daemon' | 'systemd-user' | 'systemd-system';
export interface ServiceStatus {
    installed: boolean;
    running: boolean;
    pid: number | null;
    kind: ServiceKind | null;
    atBoot: boolean;
}
export interface InstallOptions {
    system?: boolean;
}
export declare function installService(opts?: InstallOptions): void;
export declare function uninstallService(deps?: UninstallDeps): UninstallResult;
export declare function isServiceInstalled(): boolean;
export declare function getServiceStatus(): ServiceStatus;
export declare function getWatchdogScript(): string;
export declare function installCron(intervalMinutes?: number): void;
export declare function uninstallCron(): void;
export declare function isCronInstalled(): boolean;
export interface SupervisorInfo {
    kind: ServiceKind | 'cron';
    path: string;
    running: boolean;
    pid: number | null;
    atBoot: boolean;
    /** For cron: the SCRIPT= path its watchdog will launch. Else ''. */
    targetScript: string;
    /** True when targetScript does not match this install's agent script. */
    stale: boolean;
}
/** Injectable dependencies so listSupervisors() never touches a real unit file, the real crontab, or the real $HOME in tests. */
export interface ListSupervisorsDeps {
    platform?: NodeJS.Platform;
    homedir?: string;
    existsSync?: (p: string) => boolean;
    readFileSync?: (p: string) => string;
    launchdPid?: (domainTarget: string) => number | null;
    systemdActive?: (scope: 'user' | 'system') => {
        active: boolean;
        pid: number | null;
    };
    isCronInstalled?: () => boolean;
    /** Override for getAgentScript() — the "correct" script path to compare against. */
    agentScript?: string;
    /** Override for fs.realpathSync — used to canonicalize paths before the staleness compare. */
    realpathSync?: (p: string) => string;
}
/** Every supervisor present, not just the first match. */
export declare function listSupervisors(deps?: ListSupervisorsDeps): SupervisorInfo[];
export interface WatchdogRepairResult {
    repaired: boolean;
    /** The SCRIPT= path the watchdog pointed at before repair (empty if there was nothing to repair). */
    from: string;
    /** The current agent script path repair rewrites SCRIPT= to. */
    to: string;
}
export declare function staleSupervisorAdvice(s: SupervisorInfo): string[];
/**
 * Rewrite `~/.dialout/watchdog.sh` if its SCRIPT= line has drifted from
 * the current agent script. No-op (repaired: false) when the watchdog is
 * absent or already correct — in particular, an already-correct watchdog is
 * left byte-for-byte and mtime-untouched, and no backup is created.
 */
export declare function repairWatchdog(): WatchdogRepairResult;
//# sourceMappingURL=service-installer.d.ts.map