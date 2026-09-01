# Kickoff prompt — Mobile-first shared terminal sessions

Copy-paste the block below into a fresh Claude Code session in this repo.

---

Read the approved spec at
`docs/superpowers/specs/2026-06-29-shared-terminal-sessions-design.md` fully
before doing anything — it was revised 2026-07-05 with the mobile-first UX
(§12), current infrastructure state (§2, all accurate), and phasing (§14).

**Task: implement Phase 1 — the mobile-first terminal experience — against the
existing PTY terminal infrastructure.** Do NOT build tmux/shared sessions yet
(that is Phase 2). Phase 1 is defined by spec §12 and its acceptance criteria
§12.7: full-screen mobile terminal at `/sessions/[id]`, chat-style
TerminalComposer (a real textarea so OS keyboard dictation works like
WhatsApp — no custom speech code), KeyChipBar with modifier/arrow/Ctrl chips,
visualViewport keyboard avoidance, pinch-to-zoom font scaling persisted in
localStorage, reconnect-on-visibilitychange UX, and the PWA manifest.

Process:
1. Use superpowers:writing-plans to turn spec §12 + §12.7 into an
   implementation plan (the spec is already approved — no brainstorming
   needed; if you find a genuine contradiction, ask before planning around it).
2. Execute with superpowers:subagent-driven-development, committing directly
   to `main` (repo convention).
3. Verify against §12.7 using Chrome DevTools mobile emulation via the
   claude-in-chrome tools (iPhone 14 Pro and Pixel 7 viewports minimum), and
   tell me which criteria need a real device to confirm (dictation, haptics,
   wake lock).

Key context you'd otherwise have to rediscover (all verified 2026-07-05):
- Local stack: `npm run dev` = Next.js :50051 + ws-server :50052 (tsx).
  Restart it to pick up ws-server changes — Next hot-reloads, the ws-server
  does not.
- Local agent from source: `cd packages/devdash-agent && npm run build &&
  node dist/cli.js start --profile local`. Terminal PTY flow: browser
  `/terminal` WS ↔ ws-server ↔ agent pty-manager. Sessions survive reconnects
  (10-min detach grace, sessionStorage tab persistence already exist — reuse,
  don't rebuild).
- Existing terminal frontend: `src/components/Terminal.tsx`,
  `TerminalPanel.tsx`, `TerminalDockBar.tsx`, themes in
  `terminal-themes.ts`, session page at `src/app/sessions/[id]/page.tsx`.
- Deploy: push to `main` → GitLab CI builds on the server and restarts pm2.
  Root `.npmrc` (@indianic scope → registry.npmjs.org) is required — never
  remove it. Agent releases: `npm run release` in `packages/devdash-agent`
  (only needed if you touch the agent — Phase 1 should not).
- DB is shared between local dev and production — additive schema changes
  only (Phase 1 should need none).
- UI conventions: existing utility classes (`inp`, `label`, `btn-grad`,
  `btn-ghost`, `btn-icon`, `glass`) and CSS vars (`--txt --muted --dim
  --accent --b1 --b2 --card --live --offline`); `const { toast } =
  useToast()`; `useDashboard()` for session/machines state.

Definition of done: all §12.7 criteria pass in mobile emulation (except the
real-device-only ones, listed explicitly), existing desktop terminal behavior
unchanged, `npx tsc --noEmit` and `npm run build` clean, committed and pushed.

---

After Phase 1 ships, start a new session with: "Read
docs/superpowers/specs/2026-06-29-shared-terminal-sessions-design.md and
implement Phase 2 (tmux shared sessions, single machine) per §14" — plus the
same key-context block above.
