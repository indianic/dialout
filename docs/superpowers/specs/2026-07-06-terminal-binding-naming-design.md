# Terminal Binding Wizard + Per-Machine Naming & Preview — Design

**Status:** Approved, ready for planning
**Date:** 2026-07-06
**Owner:** Sandeep Mundra
**Builds on:** Phase 2 tmux shared sessions (`docs/superpowers/specs/2026-06-29-shared-terminal-sessions-design.md` §14) — already implemented locally (commits through c7016d6).

## 1. Goal

Two connected improvements to cowork terminals:

1. **First-run binding wizard.** When a machine first enables cowork, guide the user: detect tmux, list any *existing* tmux sessions and let them adopt the ones they want live now, then install the shell wrapper so every *new* terminal auto-binds forever. One guided setup, then hands-off.

2. **Per-machine naming + preview.** Each machine gets a configurable terminal **name template** (default `[machine_name]-[folder_name]-[date]-[time][ampm]`) rendered at display time from raw facts, plus a short **description preview** (last N lines of the terminal, default 3) shown on the session card. Both are per-machine settings, set once, editable in Settings.

## 2. The one hard constraint (recap)

A process cannot attach to a PTY master owned by another app. So an **already-running non-tmux terminal cannot be bound live** — only tmux sessions can. The wizard therefore:
- **Adopts** existing *tmux* sessions on request (stamps DevDash metadata so they report).
- **Installs the wrapper** so *future* interactive shells re-exec into tmux and bind automatically.
- Cannot retroactively bind a plain shell already running in iTerm/Terminal — that shell binds only when next opened (inside the wrapper) or manually re-launched in tmux.

## 3. Live scope decision

Once a machine has cowork enabled, **all wrapper-created tmux sessions go live automatically** (they carry `@devdash_origin`). The wizard's "pick which to bind" applies **only to pre-existing tmux sessions the agent did not create**. Per-shell opt-out stays `DEVDASH_NO_WRAP=1`. No per-session opt-in bookkeeping.

## 4. Name rendering decision

Names render **at display time in the web UI** from raw facts stamped on each session. Changing a machine's template updates every session's displayed name instantly (including running ones). The tmux session keeps a short, safe internal id (`<dirbase>-<shortid>` / `dd-<shortid>`) used as the attach target; the pretty name is presentation only.

## 5. Architecture & data flow

```
Wrapper stamps tmux options at shell start:
  @devdash_folder, @devdash_folder_path, @devdash_created, @devdash_git,
  @term_program, @devdash_origin
        │
        ▼
Agent poller (listSessions) reads options + capture-pane tail → tmux_sessions report:
  { name, createdAt, attached, lastActivity, width, height, termProgram, origin,
    folder, folderPath, createdLocal, gitBranch, lastLines }
        │
        ▼
ws-server upsert → terminal_sessions row (lastLines stored only if owner recording on)
        │
        ▼
Web /terminals + attach header render:  renderTemplate(machine.template, sessionVars)
                                          + preview block (machine.previewLines of lastLines)
```

## 6. Components & changes

| Area | File(s) | Change |
|---|---|---|
| Shell wrapper | `packages/devdash-agent/src/cli.ts` (`COWORK_BLOCK`) | Stamp `@devdash_folder`, `@devdash_folder_path`, `@devdash_created` (machine-local ISO), `@devdash_git` (best-effort branch) at session create, alongside existing stamps |
| Browser-origin wrap | `packages/devdash-agent/src/pty-manager.ts` | Stamp the same facts on `openSession`'s cowork-wrap path (folder from `resolvedCwd`, created = now, git best-effort) |
| tmux-manager | `packages/devdash-agent/src/tmux-manager.ts` | Read the new `@devdash_*` options into `TmuxSessionInfo`; add `capturePane(name, lines)` (`tmux capture-pane -p -t <name> \| tail -N`, safe-default `''`) |
| Wizard | `packages/devdash-agent/src/cli.ts` (`setup-cowork`, and `init`'s cowork step) | Interactive: detect tmux → list existing non-DevDash tmux sessions → adopt selected (stamp `@devdash_origin=native` + folder facts) → install wrapper → set `cowork:true`. Flags `--adopt-all` / `--no-adopt` |
| Agent report | `packages/devdash-agent/src/websocket.ts` | Extend `tmux_sessions` payload with `folder, folderPath, createdLocal, gitBranch, lastLines`; capture up to `PREVIEW_CAP` (5) lines per session in the poller |
| ws-server | `src/ws-server/index.ts` | Store new fields; `last_lines` only when `isRecordingEnabled(owner)` else null; machine-owner cache already exists |
| Schema | `src/lib/schema.ts` + apply script | `terminal_sessions`: `folder, folder_path, created_local, git_branch, last_lines`. `machines`: `terminal_name_template`, `terminal_preview_lines` |
| Naming lib | new `src/lib/terminal-name.ts` | Pure `renderTerminalName(template, vars)` + `TERMINAL_NAME_TOKENS` list; empty-token + dangling-separator collapse |
| Live API | `src/app/api/live-sessions/route.ts` | Include new fields + the owning machine's template/previewLines in the response (or the UI joins client-side from `session.machines`) |
| Machine settings API | `src/app/api/machines/route.ts` (or new `machines/[id]`) | `PATCH` to update a machine's `terminal_name_template` + `terminal_preview_lines` (owner-scoped) |
| Terminals page | `src/app/(dash)/terminals/page.tsx` | Render name via `renderTerminalName`; show preview block (previewLines of `lastLines`); keep raw id small |
| Settings | `src/app/(dash)/settings/…` + `SettingsPanel.tsx` | New "Terminals" panel: per-machine template field w/ token buttons + live preview, preview-lines 0–5 |
| Attach header | `src/app/terminal/[machineId]/[name]/page.tsx` | Title via `renderTerminalName` (fetch machine template + facts) |

## 7. Naming template

**Tokens** (bracket syntax, matching the user's mental model):
`[machine_name]` `[folder_name]` `[folder_path]` `[date]` `[time]` `[ampm]` `[git_branch]` `[term_program]` `[short_id]`

**Default template:** `[machine_name]-[folder_name]-[date]-[time][ampm]`
→ e.g. `SKMTest-local-phasepilot-2026-07-06-11:02am`

**Rendering rules** (`renderTerminalName`):
- Substitute each `[token]` with its value; unknown tokens render literally-empty.
- **Empty-token collapse:** if a token resolves to empty (e.g. no git branch), remove it *and* one adjacent separator run (`-`, `_`, space) so no `--` or leading/trailing separators remain.
- `[date]` = `YYYY-MM-DD`, `[time]` = `h:mm` (12-hour), `[ampm]` = `am`/`pm`, all from `created_local` (machine-local at creation); fall back to the row's `started_at` (server tz) for adopted/legacy sessions with no stamp.
- `[folder_name]` = basename; `[folder_path]` = full path (may be empty for pre-wrapper sessions).
- Final safety: if the whole thing renders empty, fall back to the raw tmux name.

**Fact sources:**
- `machine_name` — `machines.name` (server).
- `folder`, `folder_path`, `created_local`, `git_branch` — stamped by the wrapper as `@devdash_*`, read by the agent, stored on the row.
- `term_program`, `short_id` (tail of tmux name) — already available.

## 8. Description preview

- Agent captures **up to `PREVIEW_CAP = 5`** lines per session each poll via `capturePane(name, 5)` (blank/failed → `''`). Cheap; runs only for reported sessions.
- ws-server stores `last_lines` **only if `isRecordingEnabled(owner)`** (per-user `user_settings.record_sessions`, already checked elsewhere); otherwise `null`. This respects the existing recording opt-out — the preview is a strict subset of what recording already captures, and users with recording off store nothing.
- UI shows `machines.terminal_preview_lines` (0–5, default 3) trailing lines of `last_lines`, monospace, muted, truncated per line. `0` = hide the preview entirely.
- Preview refreshes with the 10s list poll (server data refreshes on the agent's ~5s change-driven report).

## 9. First-run wizard

`devdash-agent setup-cowork` (and the cowork branch of `init`) becomes:

```
Enable shared / co-work terminal sessions on this machine? [Y/n]
✓ tmux 3.6a found
Found 2 existing tmux sessions not managed by DevDash:
  1) work        (~/www/api,       iTerm2, 1 window)
  2) scratch     (~,               unknown, 1 window)
Bind which to DevDash? [1,2 / a=all / n=none]: a
✓ Adopted 2 sessions (now live in DevDash → Terminals)
Install the shell wrapper so new terminals auto-bind? [Y/n] y
✓ Wrapper installed in ~/.zshrc
✓ Cowork enabled. Open a new terminal or visit Terminals.
```

- **Adopt** = stamp `@devdash_origin=native`, `@devdash_folder`/`@devdash_folder_path` (from the session's `#{pane_current_path}`), `@devdash_created` (best-effort: session_created epoch → ISO), `@term_program unknown` if unset. The next poll reports them with folder/name facts.
- **Visibility (decided 2026-07-06):** the agent reports **all** tmux sessions on a cowork-enabled machine — visibility is NOT gated on adoption (consistent with Phase 2). Adoption only **enriches** a pre-existing session's name (folder/git); an un-adopted session still appears, just with an empty folder in its rendered name. To keep a shell out of the web view, use `DEVDASH_NO_WRAP=1` or don't run it in tmux. (This supersedes any earlier "unpicked sessions stay private" phrasing.)
- **"not managed by DevDash"** = sessions whose `@devdash_folder` is unset (the wizard offers these for enrichment).
- **Cache note:** the agent caches a session's `@devdash_*` options at first enumeration, so adopting a session the running agent has already seen requires an agent restart (the wizard already prompts for one) before the folder appears.
- Wrapper install reuses Phase 2's marker-bounded idempotent block (now with the extra stamps).
- Non-interactive: `--adopt-all`, `--no-adopt`, existing `--enable-cowork`/`--no-cowork` semantics.
- tmux missing → print per-OS install command, exit 1 (unchanged).

## 10. Data model (additive only, shared local/prod DB)

`terminal_sessions` +:
`folder text`, `folder_path text`, `created_local text`, `git_branch text`, `last_lines text`

`machines` +:
`terminal_name_template text` (app default `[machine_name]-[folder_name]-[date]-[time][ampm]` when null),
`terminal_preview_lines integer default 3`

All via `scripts/apply-terminal-naming-columns.mjs` (`ADD COLUMN IF NOT EXISTS`, nullable/defaulted). Never `drizzle-kit push`.

## 11. Settings UI

**Settings → Terminals** (new panel):
- **Machine selector** (defaults to current machine) — settings are per-machine.
- **Name template** text input, default shown; a row of clickable token chips inserts `[token]` at the cursor; a **live preview** line renders the template against the most-recent live session on that machine (or a mock: machine name + `phasepilot` + now).
- **Description lines** stepper 0–5 (default 3).
- **Save** → `PATCH /api/machines/[id]` (owner-scoped). Applies immediately to rendering (no session mutation).

## 12. Security & privacy

- `last_lines` gated on the owner's recording setting (server-side, at upsert). Recording off → nothing stored.
- Machine settings edits are owner-scoped (the machine's `user_id` must equal the session user).
- Preview shows on the list card (same auth scope as opening the session — user's own machines only).
- `@devdash_folder_path` can expose a full path; it is opt-in (not in the default template) and only rendered for the machine owner.

## 13. Cross-cutting notes

- **Agent must be re-released** for real machines to stamp the new facts and capture previews. Until then, adopted/legacy sessions render with `started_at` fallback, empty folder/git, no preview — all handled by the collapse/fallback rules. Graceful degradation, no errors.
- **Wrapper change** ⇒ users re-run `setup-cowork` (or the auto-update ships the new block; the marker-bounded installer replaces the old block idempotently).
- Rendering is one pure function shared by list, attach header, and mobile top bar — one name everywhere.

## 14. Out of scope (YAGNI for v1)

- Renaming a session to an arbitrary free-text label (template-only for v1).
- Blocklist/exclude UI for auto-wrapped sessions (opt-out stays `DEVDASH_NO_WRAP`).
- Live-streaming the preview (poll cadence only).
- Timezone selection for `[date]`/`[time]` (machine-local at creation, fixed).
- Per-session template overrides (per-machine only).

## 15. Acceptance criteria

1. `setup-cowork` on a machine with pre-existing tmux sessions lists them, adopts selected ones, and they appear live in `/terminals` within ~5s with folder + client badge.
2. A new terminal opened after wrapper install auto-appears, named per the machine's template.
3. Changing a machine's template in Settings updates all its sessions' displayed names immediately (no reopen).
4. Default template renders `[machine]-[folder]-[date]-[time][ampm]`; a session with no git branch shows no dangling separator.
5. Session card shows the last 3 lines of terminal output (recording on); with recording off, no preview stored/shown; `preview_lines=0` hides it.
6. Settings are per-machine: two machines can have different templates simultaneously.
7. Legacy/adopted sessions with no stamped facts still render a sensible name (started_at fallback) and never error.
