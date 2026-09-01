export declare const SSH_LN_BEGIN = "# >>> devdash ssh local-network workaround >>>";
export declare const SSH_LN_END = "# <<< devdash ssh local-network workaround <<<";
export declare const DEFAULT_CONNECT_TIMEOUT = 15;
/**
 * Only macOS gates local-network access this way; on Linux the block would be
 * a gratuitous edit to the user's ssh config.
 */
export declare function sshLocalNetworkApplies(platform?: NodeJS.Platform): boolean;
export declare function defaultSshConfigPath(home?: string): string;
export declare function renderSshLocalNetworkBlock(timeoutSeconds?: number): string;
export declare function removeSshLocalNetworkBlock(content: string): string;
/**
 * True when some earlier stanza already sets ConnectTimeout. ssh keeps the
 * FIRST value it obtains for a keyword, so an existing setting wins over ours
 * and appending would be dead weight.
 */
export declare function hasConnectTimeout(content: string): boolean;
export type SshBlockResult = 'created' | 'installed' | 'updated' | 'skipped-existing' | 'skipped-platform';
/**
 * Append (or refresh) the block at the END of the file. Position matters:
 * ssh takes the first value it obtains for each keyword, so a trailing
 * `Host *` supplies defaults without overriding any host-specific stanza
 * above it. Putting it first would silently change every existing Host block.
 */
export declare function installSshLocalNetworkBlock(configPath?: string, timeoutSeconds?: number, platform?: NodeJS.Platform): SshBlockResult;
//# sourceMappingURL=ssh-local-network.d.ts.map