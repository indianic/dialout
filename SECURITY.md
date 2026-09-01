# Security Policy

Dialout is self-hosted. Every instance is operated by the person who installed
it, so a vulnerability here is a vulnerability on someone's own machines — not
on a service we run. That shapes both how we handle reports and what we ask of
operators.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting on this repository
(Security → Report a vulnerability), or email **security@dialout.dev**.

Please include:

- what an attacker can do, not just what looks wrong
- the affected component — web app, `ws-server`, agent, or mobile app
- a reproduction, or the request/message sequence that triggers it
- the version or commit you tested against

You will get an acknowledgement within 3 working days and an assessment within
10. If we agree it is a vulnerability, we will tell you the fix timeline and
credit you in the release notes unless you ask us not to.

## Scope

**In scope**

- Authentication and session handling (`POST /api/auth`, the `devdash-session`
  JWT, bearer tokens for native clients)
- Authorization on any route that accepts a client-supplied `machineId`,
  `projectId`, or row id
- The `ws-server` daemon protocol and its internal HTTP relay
- The HTTP tunnel and its response rewriting
- Agent command execution, the tmux/cowork shell-rc wrapper, and the
  filesystem browser
- Encryption at rest for credentials, 2FA secrets, and machine API keys

**Out of scope**

- Findings that require an operator to have already misconfigured the deploy in
  a way the documentation warns against — most notably setting `WS_HOST=0.0.0.0`
  without a firewall (see below)
- Denial of service through resource exhaustion on an instance you control
- Anything requiring physical access to a developer machine that is already
  running the agent under the attacker's own account
- Vulnerabilities in third-party dependencies with no exploitable path through
  Dialout — report those upstream

## The design decisions a reviewer should know first

These are deliberate, documented in the code, and worth understanding before
filing a report against them.

**The agent connects outbound.** Developer machines open no inbound ports. The
agent authenticates to the server with an `mch_…` API key, SHA-256 compared
against a stored hash. A 401 on the `/daemon` upgrade means the key is not
registered.

**`ws-server` binds `127.0.0.1` by default.** Its `/scan/`, `/check/`,
`/browse/`, `/project-scan/`, `/run-command/` and `/kill-tmux/` endpoints are
unauthenticated remote command execution if they are reachable. They are gated
behind a constant-time compare of an `X-Internal-Token` header derived from
`JWT_SECRET`, and the process **refuses to start** if no signing secret is set,
because a token derived from an empty string would be guessable. Only set
`WS_HOST=0.0.0.0` when the ws-server runs on a different host from the web app,
and firewall it when you do.

**Every route authenticates, and every client-supplied id is authorized
separately.** A valid session proves only that the caller is *some* user.
Ownership is checked through `userOwnsMachine` / `isProjectOwner` /
`canReadProject`. Child rows (a note, a todo, a quick-launch command) are
resolved to their parent project and that is what gets authorized. Denials by
id return `404` rather than `403` so ids cannot be enumerated.

**Quick-launch commands are shell strings that the owner later runs on their own
machine.** An unauthorized write there is code execution with the owner's click
as the trigger. Treat any authorization gap on `projects/[id]/commands` as
high severity.

**The cowork shell-rc wrapper is injection-hardened.** Everything interpolated
into the block written to a user's shell rc passes through fixed token and
environment-name patterns. Widening those patterns is a security change.

**Two-factor is mandatory and enforced at the API layer**, not only in the UI
shell. The 2FA lockout counters are deliberately separate from the PIN login
counters: login clears the PIN counters on every correct PIN, so sharing them
would let a PIN-holder reset the TOTP lockout and brute-force it.

**Secrets are AES-256-GCM at rest** — 2FA secrets, project credentials, machine
API keys — and are never returned by list endpoints, only by explicit reveal
routes.

## Operator responsibilities

Self-hosting means these are yours, not ours:

- Set a strong, unique `JWT_SECRET`. Never share one across two deployments —
  a session minted by either would be valid on both.
- Terminate TLS in front of the app. Sessions and terminal traffic are not
  safe over plain HTTP.
- Keep `ws-server` on `127.0.0.1` unless you have a firewalled reason not to.
- Treat the HTTP tunnel as public. Anything you tunnel is reachable by anyone
  with the URL.
- Keep agents updated. `devdash-agent update` exists for this.

## Supported versions

The latest release on `main` is supported. There are no long-term support
branches.
