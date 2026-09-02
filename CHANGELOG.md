# Changelog

Notable changes to the Dialout server and dashboard. The agent has its own
history in [`packages/devdash-agent/CHANGELOG.md`](packages/devdash-agent/CHANGELOG.md),
because it is versioned and published separately.

Dates are the day the change reached `dialout.dev`.

## Unreleased

Nothing yet.

## 2026-09-02

- **The agent moved to `@indianic/dialout`.** Install instructions across the
  README, the marketing site, the in-app help, the quick-start docs and the
  invite and approval emails now point at the scoped name. The command is still
  `dialout` and existing configuration is untouched — only the install line
  changes. The old `dialout` package is deprecated rather than unpublished,
  because unpublishing would release the name back to npm's public pool while it
  is still printed in a public README.

## 2026-09-01

### Tunnel

- **Large responses no longer vanish.** Probing the live tunnel one asset at a
  time: 140 KB returned in 2.9s, 249 KB in 3.3s, and a 7.6 MB dev-server chunk
  timed out. That body base64-encodes to about 10.1 MB and a WebSocket frame
  that size did not survive the hop from the agent. Because a browser requests
  several scripts at once, the large one starved the others, so which files
  failed changed between reloads. The agent now splits anything over 256 KB
  across indexed frames and the server reassembles by index, refusing a short
  delivery rather than serving a truncated file. **Requires agent 1.1.0.**
- **Absolute URLs are folded back through the tunnel.** Frameworks that build
  fully-qualified asset URLs from a configured origin — Laravel from `APP_URL`,
  Vite from its dev-server origin — emitted `http://myapp.localhost/build/app.js`,
  which no path rewrite could see. The browser requested it directly and was
  refused as cross-origin, and the console called it a CORS error, which sends
  people looking for a header to add. No header would have helped: the request
  was never meant to leave the tunnel. Only origins actually being proxied are
  rewritten, with a trailing boundary so `http://app.localhost` does not also
  match `http://app.localhost.evil.com`.
- **Asset paths beyond `/_next/` and `/api/` are rewritten.** Those two prefixes
  were the only ones handled, which covered a Next.js app's framework chunks and
  none of its content — every `/images/…`, `/styles/…`, `/fonts/…` and
  `/favicon.ico` resolved against the server's own root and 404'd. HTML is now
  rewritten by attribute, including `srcset`, and CSS `url(…)` in stylesheets
  and `<style>` blocks.
- **URLs built at runtime are caught too.** The injected script now patches the
  `src`/`href` setters on script, img, link, source, media, iframe and track
  elements, plus `setAttribute` and `EventSource`, so a dynamically injected
  chunk resolves correctly.
- **Truncated bodies fixed.** `content-length` was recomputed only on the
  rewrite path, so other responses carried whatever length upstream reported —
  wrong for anything the agent had decompressed. It is now recomputed from the
  bytes actually sent, and `accept-encoding` is no longer forwarded.
- **A timeout no longer claims the machine is offline.** Both cases returned the
  same page, advising you to start an agent that was already running. A timeout
  now returns 504 and says so; the wait rose from 30s to 90s, since a dev server
  compiling a route for the first time routinely takes longer than thirty.

### Accounts

- **Registration is gated.** Three ways in, checked in order: the instance has
  no users at all (the first account wins and becomes admin, so a fresh install
  is not a locked room with the key inside), open registration is on, or a valid
  single-use invite issued to that exact address. Enforced in the API, not only
  in the interface.
- **Two switches in Settings**, admin only — open registration, and an access
  request queue for when it is closed. Both default off.
- **Invites** are single-use, locked to one address, and expire in 14 days. Only
  a hash is stored, so the link is shown to the sender once. Any enrolled user
  may invite, capped at ten outstanding each.
- **An access request queue** on the marketing site, with the same defences as
  the enquiry form: capped fields, a server-verified captcha and a per-address
  rate limit. Approving one mints an invite and emails it.
- **Two-factor enrolment shows the right name.** The TOTP issuer still said
  DevDash, so every QR code scanned since the rebrand filed the entry under the
  old name. Existing enrolments keep working — the issuer is display text, not
  part of the secret.

### Machines

- **Machines can be deleted**, along with everything belonging to them. There is
  no `ON DELETE CASCADE` in this schema, so the cascade is explicit and follows
  reachability rather than direct references: deleting only rows with a
  `machine_id` would leave notes, todos, commands, credentials, shares and
  comments behind, unreachable from the interface and still holding encrypted
  secrets. One transaction. Confirmation requires typing the machine name.
  Refuses the last remaining machine, and the one you are signed in on.
- **A machine goes online without a page reload.** The server had been
  broadcasting machine status the whole time and nothing on the dashboard was
  listening, so the normal sequence — generate a key, then go and install the
  agent — always ended in a manual refresh.
- **A newly added machine appears immediately** rather than after a reload.

### Interface

- The sidebar brand used the same icon as the Projects nav row; both now use the
  Dialout mark.
- Machine card actions are colour-coded tiles rather than four identical grey
  squares, and Revoke and Regen share a silhouette — one was a pill, the other a
  rounded rectangle.

### Site

- **The homepage opens with the whole journey**, not with `npm install`, which
  was step four and assumed a reader who already had an account, a machine and a
  key. Each step carries a plain sentence and the specifics underneath, and says
  *where* it happens — running the install on the laptop you are browsing from
  is the most common way the setup fails.
- Contact and enterprise enquiry forms, with a sealed captcha and a database row
  written before either email is attempted.
- Optional Google Tag Manager or GA4 via `NEXT_PUBLIC_GTM_ID` /
  `NEXT_PUBLIC_GA_MEASUREMENT_ID`. Unset loads no Google script at all.

## 2026-08-31 — Dialout 1.0

The open-source release. Renamed from DevDash, MIT licensed, published at
[github.com/indianic/dialout](https://github.com/indianic/dialout) with the
agent on npm as [`dialout`](https://www.npmjs.com/package/dialout) and the site
at [dialout.dev](https://www.dialout.dev).

Everything before this point was developed privately and is not itemised here.
[`docs/DEVDASH-GUIDE.md`](docs/DEVDASH-GUIDE.md) describes the product as it
stood at that release.
