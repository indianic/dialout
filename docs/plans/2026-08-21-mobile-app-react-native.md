# DevDash Mobile (React Native) — Plan, Findings, and Required Fixes

**Date:** 2026-08-21
**Status:** Design signed off (revision 3, 2026-08-21). Phases 0–7 implemented
and merged to `main`. USB iPhone install talks to production. Push delivery
waits on Firebase. App Store / Play / EAS IPA is still account work — see
`docs/sessions/2026-08-30-mobile-app-release.md`.
**Companion documents:**
`docs/api/openapi.yaml` (the contract to build against),
`docs/superpowers/specs/2026-08-21-ai-sessions-attach-design.md` (why AI Sessions works the way it does).

---

## 1. What we are building

A native React Native app for iOS, Android and iPad that does what the DevDash
web app does, but designed for a phone rather than squeezed onto one:

- **Work on your machine remotely.** Real terminals, real filesystem, real
  process control — from anywhere, with no VPN and no open ports.
- **Manage AI coding sessions as chat.** Read what Claude Code or Codex is doing
  on any of your machines, reply, and start new sessions from the phone.
- **One app for every subscription.** The pain that started this: three Claude
  subscriptions means three vendor apps today, and nothing at all for Codex.

The bar is the Anthropic mobile app's feel — not a responsive website in a
WebView.

### Why React Native rather than Flutter

Reversed on 2026-08-21, after this plan was first written against Flutter.

DevDash is TypeScript end to end — the Next.js app, the ws-server, the agent.
React Native is TypeScript and React, so the app is written in the language the
team already uses. Flutter would add a second language, a second toolchain, and
a second copy of the domain model maintained by hand.

That second copy is the deciding argument, and it is not hypothetical. The
domain types that took the longest to settle — `AiEvent`, `AiStatus`,
`AiSessionSummary`, and the `shouldNotifyAi` rules — are the ones an app must
agree with exactly. **They have already drifted once, between two TypeScript
files in this repo**: `AiSessionSummary` in `src/lib/daemon-status.ts` is
missing `origin` and `permissionMode`, both added to the agent's copy when
launch mode landed. It works at runtime only because the API passes the object
through untyped. In Dart that drift becomes a silent runtime bug on someone's
phone; in TypeScript it becomes a compile error — once the type has one home
(§4.5).

Flutter genuinely wins on pixel-identical rendering across platforms and on
heavy custom animation. This app is lists, chat bubbles and a terminal. Neither
advantage is worth a second language.

The terminal argues the same way: the web app already uses xterm.js, which runs
in React Native inside a WebView. `xterm.dart` is a reimplementation with a
smaller community, and escape-sequence handling is the last place to want a
less-trodden library.

### Why this is achievable

DevDash's architecture already fits a mobile client, and this was not an accident
of luck:

- The agent connects **outbound**, so the phone never needs to reach the
  developer's machine. It talks to the server; the server already holds the
  agent socket.
- AI sessions are already normalised into one vendor-neutral `AiEvent` union, so
  the app never learns which CLI produced a message.
- Sessions are tmux-backed and transcript-backed, so they survive the app being
  closed, the phone sleeping, and the agent restarting.

---

## 2. What is already done and verified

Completed 2026-08-21. Each item was tested, not assumed.

| Capability | State | Evidence |
| --- | --- | --- |
| Bearer token auth | Done | Live server: no credential → 401, `Authorization: Bearer` → 200 with real data |
| Browser sessions stay cookie-only | Done | A browser request returns zero `token` fields |
| WebSocket auth for native clients | Done | Production: `?token=<jwt>` accepted, no-credential upgrade → 401 |
| API contract | Done | `docs/api/openapi.yaml`, including the WebSocket paths |
| AI session list / open / input / create / delete | Done | Verified against real sessions on a real machine |
| Multi-subscription separation | Done | `profile` field distinguishes `.iclaude` from `default` live |

**The blocker is gone.** Before this, `createSession()` minted a JWT and
`/api/auth` discarded it, so no native client could hold a session at all.

---

## 3. Findings that should shape the app

These are measured facts from building the backend, not guesses. Several of them
will produce a bad app if ignored.

### 3.1 There are no per-step approval buttons, and there cannot be

Verified against Claude Code CLI 2.1.238: `--permission-mode manual` emits **no**
permission event over `stream-json`, and there is no `--permission-prompt-tool`
flag. `canUseTool` exists only in the Agent SDK.

**Consequence for the app:** do not design an "Allow / Deny" sheet. The trust
level is chosen once, when a session is launched, and holds for the whole
session. In a `default`-mode session a permission prompt arrives as *text in the
chat* and the user answers by sending `y`.

This is the single most important thing to get right in the UX, because the
obvious design is impossible and discovering that late is expensive.

### 3.2 `offline` is not the same as `no sessions`

`GET /api/ai-sessions` returns `{sessions: [], offline: true}` when the machine's
agent is unreachable. Rendering that as an empty list tells the user "nothing is
running" when the truth is "we cannot see". These need visibly different screens.

### 3.3 `GET /api/projects` live-checks every port on every call

It is intentionally expensive and is the known hot path — it probes each port
through the agent, or by TCP, on **every request**. A mobile app that polls it on
a timer will be slow and will drain battery. Load it on demand; take live updates
from the `port_status` WebSocket event instead.

### 3.4 Status is derived, and "idle" is normal

Session status comes from transcript activity, not from asking the CLI. A session
nobody has touched for five minutes reads `idle` even though it is perfectly
alive. Do not present `idle` as a problem state.

### 3.5 Terminal output is raw ANSI

There is no pre-parsed form and there will not be. The `/multiplex` socket carries
bytes. Host **xterm.js** — the same library the web app uses — inside
`react-native-webview`, so ANSI handling is code that is already proven against
this exact server. Budget real time for keyboard handling, which is where mobile
terminals usually fail, not for the emulator itself.

### 3.6 The login flow is not one call

`POST /api/auth {action: login}` returns `{pending: "2fa"}` or
`{pending: "enroll"}` far more often than it returns a session, and the pending
state is carried in its **own short-lived cookie**. A Bearer-token client must
therefore still keep a cookie jar *for the login exchange*. This surprises people
and is the most likely thing to be got wrong on day one.

### 3.7 Query-parameter conventions are a trap worth learning from

The web app drives overlays from the URL (`?new=1`, `?edit=<id>`). When the AI
Sessions page reused `?new=1`, it opened the *project* create modal at the same
time, because `GlobalOverlays` renders from the same parameter globally
(fixed in `fff904c`). The lesson for the app: **do not port the web app's
URL-as-state convention into the app.** expo-router is file-based like Next.js,
which makes the mistake easy to repeat — keep overlay state in component state,
not the route.

### 3.8 Transcript content is sensitive

`ai_session_events` carries everything the model saw, including any secrets in
the repository. It is never logged server-side. **Do not log it client-side
either**, and do not write it to unencrypted local storage. A crash reporter
capturing a chat screen would exfiltrate a customer's source code.

---

### 3.9 The chat surface is no longer a list of bubbles

Rebuilt on the web between 2026-08-21 and now. The app must match it, not the
earlier prototype:

- **Messages render as markdown** — headings, lists, code blocks, inline code.
  Agent output is written as markdown and reads as noise without it.
- **Tool calls are a grouped trace with semantic chips**, not one line each. A
  run of twelve reads/edits collapses into something scannable, and each tool
  has an appearance derived from its name (`tool-appearance.ts`).
- **Function keys live in a `+` popover**, and the choice persists per device
  (`ai-chat-prefs.ts`). The prototype's `fx` toggle was the same instinct; the
  web settled on `+`, so the app should use `+`.
- **The chat pins to the tail rather than yanking to it**, and only a gesture
  unpins (`scroll-pin.ts`). Getting this wrong makes reading history impossible
  while an agent is writing.
- **A sent message echoes immediately**, before the transcript confirms it.

The pure logic behind all of this — `chat-blocks.ts`, `scroll-pin.ts`,
`tool-appearance.ts`, `composer-behaviour.ts` — is unit-tested and framework
free. **Move it into the shared package (§4.5) and the app imports the same
rules the web uses**, instead of reimplementing four subtle behaviours.

### 3.10 Commands and MCP are a first-class surface

`GET /api/ai-sessions/{machineId}/{tmuxName}/capabilities` returns the CLI's
slash commands and its configured MCP servers, discovered on the machine.

Two things about it shape the UI:

- It is **fetched lazily and cached per page**, not streamed. It changes when
  config files change, not turn by turn. Do not put it on the session-list path.
- `unavailable: true` means the agent could not scan, which is **not** the same
  as "this session has no commands" — the same distinction as §3.2, and it needs
  its own presentation again.

MCP `args` are redacted agent-side for token-shaped values. Render them as
diagnostic text, never as something to copy and run.

### 3.11 There are three vendors now, and there will be more

`AiKind` is `claude | codex | grok`. The union grew after the app plan was
written, which is the point: **treat an unknown `kind` as generic rather than
switching exhaustively on it.** A client that fails closed on a new vendor will
break on someone's phone the week a fourth is added.

## 4. Server-side fixes required

Three gaps. None blocks starting; all block shipping.

### 4.1 Push notifications: FCM/APNs — REQUIRED

**The problem.** What exists is Web Push (VAPID + service worker), which works
only in a browser or an installed PWA. A native app cannot receive it.

**What is reusable.** The decision logic — `src/lib/ai-notify.ts` —
already answers "is this change worth interrupting someone for", with a cooldown
and first-sighting suppression, unit-tested rule by rule. Keep it exactly as is.

**What must be built.**
- Extend `pushSubscriptions` with a `platform` column (`web` | `fcm` | `apns`)
  and store device tokens alongside the existing web endpoints.
- A delivery abstraction in `src/lib/push.ts`: pick the transport per row.
- Firebase Admin SDK for Android and iOS (APNs via FCM is simpler than direct).
  The client half is `@react-native-firebase/messaging`; the server half is
  identical whatever the app is written in.
- An idempotent `scripts/apply-push-platform.mjs`, **added to `ORDER` in
  `scripts/apply-migrations.mjs`** — the runner refuses to deploy otherwise.

**Estimate:** 1–2 days including Firebase project setup.

### 4.2 Token refresh — REQUIRED

**The problem.** The JWT lasts 30 days and there is no refresh endpoint. On
expiry the user is thrown out with no warning. Acceptable on web where logging in
again is two taps; on a phone, with 2FA, it is not.

**Options.**
- *Sliding session:* any authenticated request with a token older than N days
  returns a fresh one in a response header. Simple, no new storage, no new
  endpoint. **Recommended.**
- *Refresh tokens:* a proper pair with rotation and revocation. Correct, more
  work, needs a table.

Take the sliding session now and revisit if multi-device revocation becomes a
real requirement.

**Estimate:** half a day.

### 4.3 Machine-scoped access checks — SHOULD FIX

`/api/terminals` and `/api/terminals/recordings` accept a caller-supplied
`machineId` without an ownership check. They scope their queries by `userId`, so
they are **not** exploitable for reading another user's data — but they are the
last routes not using `userOwnsMachine`, and a mobile client will exercise them
heavily. Fix them for consistency before the app's traffic makes any future
mistake harder to spot.

**Estimate:** an hour.

### 4.4 Cross-machine listing — REQUIRED

**Found by the design review, 2026-08-21.** The prototype lists AI sessions,
terminals and projects across **all** machines by default, with the machine as a
filter. The API cannot do that: `/api/ai-sessions` and `/api/terminals` both take
a single `machineId` and default to the session's current machine.

Doing it client-side means one request per machine, each relaying to a different
agent — N round trips on exactly the screen the user opens first, over mobile
data. That is the wrong place to spend latency.

**What must be built.** Accept `machineId=all` (or its absence) on
`/api/ai-sessions` and `/api/terminals`: resolve the user's owned machines, fan
out in parallel, and return a flat list with `machineId` and `machineName` on
each row. Offline machines must be reported per-machine rather than collapsing
into a single boolean — the UI distinguishes "this machine is unreachable" from
"nothing is running" (§3.2), and with several machines that distinction is
per-machine.

`GET /api/projects` already spans machines, so only the two need changing.

**Estimate:** half a day.

**This reverses an earlier decision.** The AI Sessions web page was built
machine-scoped, on the reasoning that the sidebar picker, projects and terminals
are all machine-scoped and consistency mattered. On a phone that is wrong: you
want "what needs me", not "what needs me on the machine I last selected". The
web page should follow the app here, not the other way round.

### 4.5 One home for the domain types — REQUIRED

**This fixes a defect that already exists, and the repo keeps adding to it.**
`AiSessionSummary` is declared twice — `packages/devdash-agent/src/ai-sessions.ts`
and `src/lib/daemon-status.ts` — and the copies have diverged: the web one is
missing `origin` and `permissionMode`, added to the agent when launch mode
landed. Nothing broke, because `/api/ai-sessions` spreads the object through
without checking it against the type.

The capability types are the same story one step further on.
`src/components/ai/capability-types.ts` opens with a comment instructing the
reader to *"Update both when the payload changes"* — a hand-maintained mirror of
the agent's own file, written deliberately because the browser cannot import
from the agent package. That is a workaround for a missing workspace, not a
design. A mobile app makes it three copies of two type families.

**What must be built.**
- Add an npm `workspaces` field to the root `package.json`. There is none today,
  which is why `packages/devdash-agent` is a sibling rather than a workspace.
- Create `packages/devdash-shared` exporting the domain model and nothing else:
  `AiEvent`, `AiStatus`, `AiAdapter`, `AiSessionSummary`, `PermissionMode`,
  `PERMISSION_MODES`, `shouldNotifyAi`, the capability types (`AiCommand`,
  `McpServerInfo`, `AiCapabilities`), and the pure chat rules that now exist on
  the web: `chat-blocks`, `scroll-pin`, `tool-appearance`, `command-filter`,
  `composer-behaviour`, `ai-chat-prefs` — all of them already unit-tested and
  free of both React and Node.
- Point the agent, the web app and the mobile app at it. Delete both duplicate
  declarations; the compiler then finds the next drift instead of a user.

Keep it types-and-pure-functions only. The moment it imports `fs`, `next/…` or
`react-native`, it stops being shareable and becomes a fourth thing to maintain.

**Estimate:** half a day, and it pays for itself the first time a field changes.

### 4.6 Not required, worth considering

- **A `since` cursor on session events.** Reconnecting currently replays the last
  200 events. On a flaky mobile connection that is a lot of redundant traffic.
- **Response compression on `/api/projects`.** It is the largest payload.
- **A `GET /api/ai-sessions/{machineId}/{tmuxName}/history` endpoint.** History
  currently arrives only over the WebSocket after `open`. An HTTP endpoint would
  let the app render a chat instantly from cache before the socket connects.

---

---

## 5. Proposed React Native architecture

Deliberately conventional. The interesting problems here are the terminal and
the socket lifecycle; nothing is gained by also having an adventurous state
layer.

```
packages/
  devdash-shared/     ← §4.5. Types + pure functions, imported by all three.
  devdash-agent/      ← exists
  devdash-mobile/     ← the app
    app/              expo-router, file-based like the Next.js app the team knows
      (auth)/         login, the 2FA step, machine picker
      (tabs)/         sessions · terminals · projects · settings
      session/[id]    chat
      project/[id]    detail
      terminal/[id]   xterm host
    src/
      api/            typed client generated from docs/api/openapi.yaml
      ws/             socket manager: reconnect, backoff, subscriptions
      store/          zustand slices
      ui/             the design system from the prototype, as components
```

**Expo, with EAS development builds — not Expo Go.** Expo gives config,
over-the-air updates and a build service worth having. Expo Go cannot load
native Firebase, so push (§4.1) will not work in it. Plan for a development
build from day one rather than discovering this in Phase 4.

**Packages.** `expo` · `expo-router` · `expo-secure-store` (the session token,
never AsyncStorage) · `@tanstack/react-query` (server state, caching, retries) ·
`zustand` (UI state) · `react-native-webview` + `xterm.js` (terminal) ·
`@react-native-firebase/messaging` (push).

**Types come from two places, both generated or imported, neither hand-written:**
`packages/devdash-shared` for the domain model, and a client generated from
`docs/api/openapi.yaml` for request and response shapes. A hand-written model
layer would reintroduce exactly the drift §4.5 removes.

**Socket lifecycle — the part that will actually be hard.** Mobile backgrounding
kills sockets. The app must drop the socket on background, reconnect on
foreground, re-`open` whichever session is being viewed, and reconcile missed
events. Design this before writing the chat screen, not after.

**The design system is already decided.** `docs/design/devdash-mobile-prototype.html`
holds the approved tokens, spacing, type scale and component shapes. Port them
to React Native primitives rather than re-deciding them; the prototype is the
source of truth for anything visual.

---

## 5a. Design first — how this project runs

No app code is written until the screens are agreed. The order is
deliberate: UI decisions are cheap to change in a prototype, expensive in
Dart, and ruinous once a screen has state and tests attached to it.

```
  Clickable prototype  ──►  Your review  ──►  Revisions  ──►  Signed-off design
          │                                                          │
          └──────────  iterate until right  ◄──────────              ▼
                                                            Development handoff
```

### Stage A — Clickable prototype  ▸ REVISION 3, 2026-08-21

Source: `docs/design/devdash-mobile-prototype.html`

Open the file in a browser. The left studio switches **iOS / Android** and
**light / dark** without leaving the page; on a phone the studio hides and the
device fills the screen.

**Revision 2 IA is unchanged** (and still approved): every list spans all
machines with a filter, function keys are opt-in, projects are cards, project
detail exists, there is no Allow/Deny sheet.

**Revision 3** is the native reskin the previous round asked for, plus the
chat rebuild that revision 2 could not have:

- **iOS** — large titles, SF system type, grouped surfaces, hairline
  separators, blurred tab bar, action sheet with Cancel.
- **Android** — Material 3 surfaces, Roboto, top app bar, FAB for add (the
  header + is iOS-only), pill bottom nav, elevation instead of hairlines.
- **Chat matches the shipped web app** (§3.9 / §3.10): markdown (headings,
  lists, fenced code), a grouped tool trace with semantic chips from
  `tool-appearance.ts` (◇ read, ⌕ search, ▸ run, ✎ write), a shared `+`
  popover, slash-command picker and MCP panel (with the three-way
  unavailable / none / list copy), tail-pinning plus Jump to latest, instant
  echo of a sent message.
- **One composer**, used on chat and on the terminal. In a terminal the `+`
  popover offers function keys and saved project commands, not slash commands
  — those belong to an AI CLI.
- **Login is two steps** (PIN, then TOTP), as the API actually is.
- **Offline ≠ empty.** Filtering to Server 7 is a dedicated unreachable
  screen, not a blank list. Studio “Empty” shows the other truth.
- **Isometric splash** — agent / server / phone as extruded blocks, one
  light, bottom-up assemble. `?t=N` seeks the GSAP timeline. Reduced motion
  skips the drift.

Product colour (`#1a56db`), the ink CTA, the status trio, and JetBrains Mono
for paths/terminal are the web app's tokens, so the phone and the dashboard
remain one product. The *chrome* is native; the *meaning* is shared.

**Deliverable:** open the HTML, tap through it on a phone, tell me what is
wrong. No React Native until this is signed off.

### Stage B — Your review

Change anything. Layout, wording, colour, order of screens, what is on the
first screen versus buried, whether the composer belongs at the bottom. This is
the cheap moment — a change here costs minutes.

Feedback is best as "on the chat screen, X should be Y". Screenshots with
scribbles are equally good.

### Stage C — Revisions

The prototype is updated at the same URL. Repeat B and C until you would be
happy to ship it.

### Stage D — Development handoff

Only once the design is signed off. Produces, from the *approved* prototype:

- A screen inventory: every screen, its states (loading, empty, error, offline),
  and what it does on tap.
- Design tokens — colour, type scale, spacing, radii, motion — as Dart constants
  rather than prose.
- The navigation graph, as `go_router` routes.
- Per-screen API mapping: which endpoint and which WebSocket event feeds each
  piece of the UI.
- The interaction rules that are easy to lose in translation: what happens on a
  dropped socket, what an idle session looks like, how a permission prompt in
  chat is presented (§3.1).

**Why this document exists at all:** a developer who was not part of these
conversations must be able to build the right thing without rediscovering §3. The handoff is that document, written against a design you have already
approved.

---

## 6. Phases

Each produces something usable and testable on a real device.

**Phase 0 — Server fixes (§4.1–§4.5).** ▸ done (Firebase delivery still a no-op
until `FIREBASE_SERVICE_ACCOUNT` is set). Shared package, sliding JWT,
`machineId=all`, `userOwnsMachine` on terminals, native `pendingToken`,
`GET /api/me`.

**Phase 1 — Shell and auth.** ▸ done. Expo SDK 57 in `packages/devdash-mobile`,
tokens from the prototype, PIN + TOTP, secure-store restore via `/api/me`.

**Phase 2 — AI Sessions, read-only.** ▸ done. Cross-machine list, markdown +
grouped tools, dashboard WS dropped on background and re-`open`ed on
foreground.

**Phase 3 — AI Sessions, interactive.** ▸ done. Shared `+` composer, launch
sheet with trust-level picker, delete for `launch:*`, slash commands and MCP.

**Phase 4 — Push.** ▸ stubbed. Subscribe + Settings toggle exist; delivery
waits on Firebase credentials. Deep links (`devdash://session/...`, `/ai/...`)
are wired.

**Phase 5 — Terminals.** ▸ done. xterm.js in a WebView over `/terminal`,
`pty_data` in and out, Local vs Web split, same composer with project commands.

**Phase 6 — Projects and the rest.** ▸ done. List with machine filter, process
control (runs on the *project's* machine), notes, todos, credentials with
biometric reveal.

**Phase 7 — Polish.** ▸ app-side done (iPad orientation + two-column cards,
offline banner, EAS profiles, README). Store submission is account work.

---

## 7. Risks

| Risk | Why it matters | Response |
| --- | --- | --- |
| ~~The web UI has never been verified~~ | **Retired 2026-08-21.** The user clicked through `/ai` on production: working, with a few UI changes wanted. The API shapes are now observed, not inferred. | Fold those UI changes into the prototype (Stage A) rather than patching the web app twice. |
| Mobile terminal keyboard | Where phone terminals usually fail | Prototype in Phase 5 before committing to a layout |
| xterm.js in a WebView | A bridge between JS contexts; input latency and paste are the usual casualties | Spike it early in Phase 5 and measure keystroke latency on a real device, not a simulator |
| Socket lifecycle on background | Subtle, and it corrupts state rather than crashing | Design it in Phase 2; test with real backgrounding |
| Spec drift | The contract is hand-maintained | Update `openapi.yaml` in the same commit as any route change |
| Two authors on `main` | Concurrent commits appeared during this work (`7aa452e`, `c45ef72`, `fff904c`) | Branch the app separately; confirm who else is committing |

---

## 8. Open questions for the user

1. **Does the app replace the PWA, or sit beside it?** Recommendation: keep the
   web app as-is and target phone/tablet only. React Native for Web would
   duplicate a product that already works.
2. **Firebase acceptable?** It is by far the shortest path to iOS + Android push.
   If Google services are unwanted, direct APNs plus FCM is more work.
3. **Team distribution or public App Store?** Changes the review burden and the
   timeline, and is worth deciding before Phase 7, not during it. Expo's EAS
   Submit handles both, but TestFlight and internal-track distribution are far
   less ceremony than a public listing.
4. **Does the app need project sharing and comments,** or is v1 for the machine
   owner only? Sharing is a whole permission surface.
5. **What do commands and MCP mean in a plain terminal?** The decision is that
   terminals and AI sessions share one input surface. Slash commands and MCP
   servers belong to an *AI CLI*, not to a shell — so in a terminal the `+`
   popover presumably offers function keys and saved project commands
   (`projectCommands` already exists) rather than slash commands. Confirm what
   should appear there before Phase 5 builds it.
6. **Which `/ai` UI changes do you want?** You mentioned a few after clicking
   through production. List them and they go straight into the prototype, so the
   phone design and the web app converge rather than drift.
