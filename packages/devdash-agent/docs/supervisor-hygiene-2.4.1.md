# 2.4.1 — Supervisor hygiene + two cosmetic fixes

## Context

Diagnosed live on build-box (Ubuntu, ISPConfig, agent 2.4.0) on 2026-08-02. The
machine had **three supervisors and four daemons** competing, and the CLI could
not see any of it.

What was actually running:

| PID | Package | Started | Supervisor |
|---|---|---|---|
| 3628434 | `devdash-agent` 2.4.0 | Aug 2 10:37 | manual (`devdash-agent restart`) |
| 182274 | `devdash-agent` | Jul 28 | orphan, PPID 1 |
| 3453106 | **`dialout` 1.1.2** | Aug 2 07:33 | **user** systemd unit |

Supervisors found: a **system** systemd unit (correct path), a **user** systemd
unit pointing at the pre-rename `dialout` path, and a **cron
watchdog** whose `SCRIPT=` also pointed at the pre-rename path. The agent log
flapped continuously — `Authenticated as machine 9 → Disconnected (1006) →
Reconnecting →` — as the daemons fought over machine 9's registration. The
system unit was simultaneously stuck in a restart loop at
`restart counter is at 42`, each attempt exiting with
`Already running for wss://… — exiting (single instance)`.

**The single-instance lock behaved correctly throughout.** It is the surrounding
tooling that is at fault:

1. `getServiceStatus()` (`src/service-installer.ts:411-421`) checks the system
   unit first and **returns early**, so a coexisting user unit is invisible.
   `isServiceInstalled()` (`:383-391`) has the same first-match-wins shape. Same
   early return on darwin for LaunchDaemon vs LaunchAgent. `status` therefore
   reported one supervisor while three were running.
2. `getWatchdogScript()` (`:430-470`) writes `SCRIPT=` from `getAgentScript()`,
   correct at write time — but nothing ever rewrites a watchdog written by an
   older version. A watchdog authored when the package was `dialout`
   keeps resurrecting the deprecated package every 5 minutes, forever.
3. `DEP0190` is printed by Node 22+ on every agent start and every
   `setup-cowork` run, from three byte-identical copies of the same helper.
4. `setup-cowork` on a headless host offers 16 rows all marked "not installed",
   accepts a selection, and prints a green `Cowork enabled.` that can never take
   effect — the gate's own `[ -z "$SSH_TTY" ]` precondition guarantees it.

Item 4 is the same silent-success class that 2.4.0's `unmatchableTokens` guard
rail was built for; that guard only covers platform mismatch, not "no emulator
present / SSH-only".

Note `installCron` already refuses to install when a service is present
(`src/cli.ts:719-726`), so the *conflict* cannot be newly created by current
code. This plan is about detecting and repairing conflicts that already exist on
deployed machines.

## Global Constraints

1. **macOS behavior must not change** beyond the new detection and messages.
   Every existing test keeps passing unmodified unless a task says otherwise.
2. **Detection is read-only.** Nothing in `status` may kill a process, stop a
   unit, or edit a crontab. Repair happens only from an explicit command.
3. **Never auto-remove a supervisor the user may depend on.** Repairing a stale
   watchdog rewrites its `SCRIPT=` path; it does not delete the watchdog, the
   cron entry, or any unit file.
4. Shelling out must not trigger `DEP0190`: never pass an args array together
   with a `shell` option. Use `execFileSync('/bin/sh', ['-c', script, 'sh', arg])`
   so arguments arrive as positional parameters, which is also injection-safe.
5. TDD required. Tests must fail against pre-task code for the stated reason.
6. Run `npm test` (= `npm run build && node --test`) from
   `packages/devdash-agent/` before reporting DONE. Suite is **163/163 green**
   and must stay green.
7. Work only inside `packages/devdash-agent/`.

## Task 1 — One shared `hasCommand`, no `DEP0190`

Three byte-identical copies exist: `src/terminal-detect.ts:93`, `src/cli.ts:788`,
`src/pty-manager.ts:9`, all
`execFileSync('command', ['-v', bin], { stdio: 'pipe', shell: '/bin/sh' })`.
Passing an args array with `shell` set triggers `DEP0190` on Node 22+ and is the
warning seen on build-box.

Create `packages/devdash-agent/src/has-command.ts`:

```ts
/** True when `bin` resolves on PATH. Never throws. */
export function hasCommand(bin: string): boolean;
```

Implement with
`execFileSync('/bin/sh', ['-c', 'command -v "$1" >/dev/null 2>&1', 'sh', bin], { stdio: 'pipe' })`
— no `shell` option, so no `DEP0190`; `bin` arrives as `$1` so it cannot be
interpreted as shell syntax. Return `false` on any throw.

Replace all three call sites with imports. Delete the local copies. Keep each
call site's existing behavior identical (`terminal-detect.ts` passes it as the
`hasCommand` dep default; `cli.ts` uses it in `setup-cowork`; `pty-manager.ts`
uses it for clipboard probing).

Tests in `test/has-command.test.js`:
- a binary that certainly exists (`sh`) → `true`
- a binary that certainly does not (`__devdash_no_such_bin__`) → `false`
- an argument containing shell metacharacters (`; touch /tmp/x`, `$(id)`,
  `a b`) → `false` and no side effect (assert the injected file was NOT created)
- **no `DEP0190` on stderr**: spawn a child `node -e` that calls the compiled
  `hasCommand` and assert `stderr` contains no `DeprecationWarning`. This test
  must fail against the old implementation — that is the RED for this task.

## Task 2 — Report every supervisor, not the first one

`getServiceStatus()` and `isServiceInstalled()` return on first match, hiding a
coexisting second unit. That is why build-box's user unit was invisible.

Add to `src/service-installer.ts`:

```ts
export interface SupervisorInfo {
  kind: ServiceKind | 'cron';
  path: string;          // unit/plist path, or the crontab marker for cron
  running: boolean;
  pid: number | null;
  atBoot: boolean;
  /** For cron: the SCRIPT= path its watchdog will launch. Else ''. */
  targetScript: string;
  /** True when targetScript does not match this install's agent script. */
  stale: boolean;
}

/** Every supervisor present, not just the first match. */
export function listSupervisors(): SupervisorInfo[];
```

It must report, independently and all at once: LaunchDaemon AND LaunchAgent on
darwin; systemd system unit AND user unit on linux; and the cron watchdog when
`isCronInstalled()`. For cron, read the existing `~/.devdash-agent/watchdog.sh`,
parse its `SCRIPT="…"` line, and set `stale` when it differs from
`getAgentScript()`. A unit file whose `ExecStart` names a different script path
is stale too — parse and compare the same way.

Leave `getServiceStatus()` and `isServiceInstalled()` exactly as they are;
existing callers keep working. This is additive.

In `src/cli.ts`'s `status` command, after the existing `Service:`/`Cron:` lines,
when `listSupervisors().length > 1` print a yellow conflict block naming each
supervisor, its path, and whether it is running — plus the explanation that more
than one supervisor causes connect/disconnect flapping and that the
single-instance lock will make all but one exit. When any supervisor is `stale`,
print a yellow line naming the path it wrongly targets and the repair command
from Task 3. Detection only — `status` must not change anything (Constraint 2).

Tests in `test/service-installer.test.js` with injected deps (do not touch real
unit files or the real crontab — the suite runs on macOS):
- both a system and a user unit present → `listSupervisors()` returns 2 entries,
  where today `getServiceStatus()` returns only the system one (this is the RED)
- daemon + agent plists on darwin → 2 entries
- one unit + cron installed → 2 entries, cron entry carries its `targetScript`
- a watchdog whose `SCRIPT=` names `dialout/dist/index.js` while the
  agent script is `dialout/dist/index.js` → `stale: true`
- matching paths → `stale: false`
- nothing installed → `[]`

## Task 3 — Repair a stale watchdog

A watchdog written before the package rename keeps launching the deprecated
package. `getWatchdogScript()` already regenerates correct content; nothing ever
calls it again after the initial `setup-cron`.

- Export `repairWatchdog(): { repaired: boolean; from: string; to: string }`
  from `src/service-installer.ts`. When `~/.devdash-agent/watchdog.sh` exists and
  its `SCRIPT=` differs from `getAgentScript()`, back it up to
  `watchdog.sh.bak-<ISO-ish timestamp>` and rewrite via the existing
  `getWatchdogScript()` generator so there is ONE source of truth for the
  content. Return what changed. No-op returning `repaired: false` when absent or
  already correct.
- Add `devdash-agent repair` to `src/cli.ts`: runs `repairWatchdog()`, then
  prints `listSupervisors()` (Task 2) with the conflict block. It repairs the
  stale watchdog path and **nothing else** (Constraint 3) — it must not delete
  units, kill processes, or edit the crontab. When it detects multiple
  supervisors it explains what to remove and with which command
  (`remove-cron`, `uninstall-service`) and stops there.
- `devdash-agent update` calls `repairWatchdog()` after a successful upgrade and
  reports it, so machines self-heal on the next update.

Tests in `test/service-installer.test.js` against a temp `HOME` (never the real
one):
- stale watchdog → rewritten, `SCRIPT=` now the current agent script, a
  `.bak-*` file exists, and the rest of the script body is byte-identical to a
  freshly generated one
- already-correct watchdog → `repaired: false`, file mtime/content unchanged, no
  backup created
- missing watchdog → `repaired: false`, nothing created
- the rewritten file is still `bash -n` clean and mode `0755`

## Task 4 — Headless-aware `setup-cowork`

The generated gate's precondition includes `[ -z "$SSH_TTY" ]`
(`src/cowork.ts`), so cowork can never fire in an SSH session. On a headless
host there is additionally no emulator to select. Presenting the checklist there
is the silent-success trap 2.4.0's guard rail was meant to close.

Add to `src/cowork.ts`:

```ts
export interface CoworkViability {
  usable: boolean;
  /** Machine-readable reasons, in priority order. */
  reasons: Array<'ssh-session' | 'no-emulator'>;
}

export function coworkViability(
  env: NodeJS.ProcessEnv,
  anyEmulatorInstalled: boolean
): CoworkViability;
```

- `ssh-session` when `env.SSH_TTY` or `env.SSH_CONNECTION` is set — the gate
  cannot fire regardless of selection.
- `no-emulator` when `anyEmulatorInstalled` is false — nothing to select.
- `usable` is false when any reason is present.

In `src/cli.ts`'s `setup-cowork`, after `detectTerminals()` and before the
checklist:
- If not usable and the user did NOT pass `--terminals`: print a yellow
  explanation naming each reason in plain language — for `ssh-session`, that the
  wrapper deliberately skips SSH logins so this cannot work over SSH; for
  `no-emulator`, that no terminal emulator is installed here because the
  emulator runs on the machine being connected FROM. Then state what to do
  instead on a remote server: open a terminal from the DevDash panel, which
  creates a tmux session on this machine and needs no cowork. Exit `1` without
  showing the checklist.
- If the user DID pass `--terminals`, print the same warning but proceed, so
  dotfile-syncing users keep working (matches the existing `unmatchableTokens`
  warn-don't-refuse philosophy).
- `--remove` must keep working unconditionally, before this check.

Tests in `test/cowork.test.js`:
- `coworkViability({ SSH_TTY: '/dev/pts/0' }, true)` → not usable, reasons
  include `ssh-session`
- `coworkViability({ SSH_CONNECTION: '… … … …' }, true)` → not usable
- `coworkViability({}, false)` → not usable, reasons include `no-emulator`
- `coworkViability({ SSH_TTY: '/dev/pts/0' }, false)` → both reasons, in the
  documented order
- `coworkViability({}, true)` → usable, no reasons
