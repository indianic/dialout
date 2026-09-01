import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const SSH_LN_BEGIN = '# >>> devdash ssh local-network workaround >>>';
export const SSH_LN_END = '# <<< devdash ssh local-network workaround <<<';

// Why this exists at all:
//
// macOS 15+ gates local-network access per *responsible process*, and for
// anything running in tmux that responsible process is the tmux SERVER — not
// the shell, not the agent, not the terminal app the user thinks they are in.
// A denied tmux server makes every LAN ssh inside it fail with the useless
//   ssh: connect to host <host> port 22: Undefined error: 0
// (errno 0 — the connection never reached a socket). The unified log is
// explicit: "unsatisfied (Local network prohibited)". The same git remote
// works in a non-tmux window of the same terminal app, which is what makes
// this look like a devdash bug when it is not one.
//
// Four things were measured before settling on this fix, because the obvious
// explanations are all wrong:
//
//   - ssh as a direct child of a user LaunchAgent running plain `node`:
//     ALLOWED. So it is not "launchd jobs are denied".
//   - the same, after a double-fork + setsid: ALLOWED. So it is not
//     daemonising or losing the session leader either.
//   - ssh inside a tmux server started by that same LaunchAgent: DENIED.
//     tmux is the only variable, and one tmux server serves the whole user,
//     so every session on the machine inherits its verdict no matter who
//     opened it.
//   - the agent re-launched from a hand-built, ad-hoc-signed .app bundle:
//     still DENIED. Giving the agent a grantable identity does not help,
//     because the agent is not the identity being judged.
//
// The real cure is granting tmux itself under System Settings > Privacy &
// Security > Local Network, which is a click the agent cannot perform. What
// the agent CAN do is set ConnectTimeout, which switches ssh to the legacy
// BSD-socket connect — a path that is not gated at all. It goes in ssh_config
// rather than a GIT_SSH_COMMAND wrapper because bare `ssh`, `git`, `npm`,
// `scp` and everything else that shells out to ssh all have to be covered,
// including inside tmux sessions that already existed before this shipped.
export const DEFAULT_CONNECT_TIMEOUT = 15;

/**
 * Only macOS gates local-network access this way; on Linux the block would be
 * a gratuitous edit to the user's ssh config.
 */
export function sshLocalNetworkApplies(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'darwin';
}

export function defaultSshConfigPath(home: string = os.homedir()): string {
  return path.join(home, '.ssh', 'config');
}

export function renderSshLocalNetworkBlock(
  timeoutSeconds: number = DEFAULT_CONNECT_TIMEOUT
): string {
  // Clamped, then rendered as an integer: this value is interpolated into a
  // config file, so it must not be able to carry anything but digits.
  const asNumber = Number(timeoutSeconds);
  const base = Number.isFinite(asNumber) ? asNumber : DEFAULT_CONNECT_TIMEOUT;
  const secs = Math.max(1, Math.min(300, Math.trunc(base)));
  return `${SSH_LN_BEGIN}
# Managed by devdash-agent — do not edit inside the markers.
# macOS Local Network Privacy judges the tmux SERVER, so every tmux session on
# this machine is denied LAN access and ssh to a local host dies with
# "Undefined error: 0" — while the same command works in a non-tmux window.
# ConnectTimeout selects ssh's legacy BSD-socket connect, which is not gated.
# The real cure is to allow tmux under System Settings > Privacy & Security >
# Local Network. Removed by "devdash-agent uninstall-service" and
# "devdash-agent setup-cowork --remove", or delete the block by hand.
Host *
  ConnectTimeout ${secs}
${SSH_LN_END}`;
}

export function removeSshLocalNetworkBlock(content: string): string {
  const begin = content.indexOf(SSH_LN_BEGIN);
  if (begin === -1) return content;
  const end = content.indexOf(SSH_LN_END);
  if (end === -1 || end < begin) return content;
  return (content.slice(0, begin) + content.slice(end + SSH_LN_END.length))
    .replace(/\n{3,}$/g, '\n\n');
}

/**
 * True when some earlier stanza already sets ConnectTimeout. ssh keeps the
 * FIRST value it obtains for a keyword, so an existing setting wins over ours
 * and appending would be dead weight.
 */
export function hasConnectTimeout(content: string): boolean {
  const withoutOurs = removeSshLocalNetworkBlock(content);
  return /^[ \t]*ConnectTimeout[ \t=]/im.test(withoutOurs);
}

export type SshBlockResult = 'created' | 'installed' | 'updated' | 'skipped-existing' | 'skipped-platform';

/**
 * Append (or refresh) the block at the END of the file. Position matters:
 * ssh takes the first value it obtains for each keyword, so a trailing
 * `Host *` supplies defaults without overriding any host-specific stanza
 * above it. Putting it first would silently change every existing Host block.
 */
export function installSshLocalNetworkBlock(
  configPath: string = defaultSshConfigPath(),
  timeoutSeconds: number = DEFAULT_CONNECT_TIMEOUT,
  platform: NodeJS.Platform = process.platform
): SshBlockResult {
  if (!sshLocalNetworkApplies(platform)) return 'skipped-platform';

  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const existed = fs.existsSync(configPath);
  const content = existed ? fs.readFileSync(configPath, 'utf-8') : '';
  const had = content.includes(SSH_LN_BEGIN);

  if (!had && hasConnectTimeout(content)) return 'skipped-existing';

  const cleaned = removeSshLocalNetworkBlock(content);
  const next = (cleaned.trim() ? cleaned.replace(/\n*$/, '\n\n') : '')
    + renderSshLocalNetworkBlock(timeoutSeconds) + '\n';
  fs.writeFileSync(configPath, next, { mode: 0o600 });
  // writeFileSync's mode only applies on create; ssh refuses a group/world
  // readable config, so enforce it on the pre-existing case too.
  fs.chmodSync(configPath, 0o600);

  return had ? 'updated' : existed ? 'installed' : 'created';
}
