# Docs

- **Mobile live release** (session summary, URLs, iPhone signing, test checklist, remaining store/Firebase work): [`sessions/2026-08-30-mobile-app-release.md`](sessions/2026-08-30-mobile-app-release.md)
- Product narrative: [`DEVDASH-GUIDE.md`](DEVDASH-GUIDE.md)
- Native HTTP contract: [`api/openapi.yaml`](api/openapi.yaml)

# Design sources

## `devdash-mobile-prototype.html`

The clickable prototype of the DevDash mobile app, reviewed before any app
code is written. This file is the **source**.

Self-contained — one HTML file. Open it in a browser (studio chrome on the
left: platform, theme, preview states). On a phone the studio hides and the
device fills the screen.

### Status: revision 3 — awaiting review

Revision 2 is the **approved information architecture**: cross-machine lists
with a machine filter, opt-in function keys, projects as cards, project detail.
Those decisions stand.

Revision 3 is the **platform-native reskin** plus the chat rebuild:

- **iOS** chrome: large titles, SF system type, grouped surfaces, hairlines,
  blurred tab bar, action sheet with Cancel.
- **Android** chrome: Material 3 surfaces, Roboto, top app bar, FAB for add,
  pill bottom nav, 16px cards with elevation.
- **Light and dark** as first-class palettes (studio toggle; Settings too).
- **Chat matches the shipped web app** (§3.9 / §3.10): markdown messages, a
  grouped tool trace with semantic chips (read / search / run / write), a
  shared `+` popover (function keys, slash commands, MCP), tail-pinning with
  a Jump to latest control, instant echo of a sent message.
- **One composer**, mounted on both chat and terminal.
- **Offline ≠ empty.** Filtering to an offline machine is a dedicated
  unreachable state, not a blank list. Capabilities `unavailable` is its own
  sentence.
- **Isometric splash** (agent / server / phone extruded blocks, one light
  direction, bottom-up assemble). `?t=N` freezes the timeline for stills.
  `prefers-reduced-motion` skips the drift.

The prototype is still **not** the React Native app. Sign this off before
Phase 1.

### What in revision 2 is stale

- Cross-platform IBM Plex chrome — replaced by SF (iOS) and Roboto (Android).
  Product colour (`#1a56db`), status trio, and JetBrains Mono for paths/terminal
  are unchanged so the phone and the dashboard stay one product.
- Chat as plain bubbles + `fx` toggle — replaced by markdown, grouped chips,
  and `+`.
- Skipping 2FA after PIN — login is now PIN then authenticator, as the API is.

### Updating it

Edit this file. If a published artifact URL exists, republish to the **same
URL** so the reviewer's link keeps working.

Design decisions and the review history live in
`docs/plans/2026-08-21-mobile-app-react-native.md` §5a.
