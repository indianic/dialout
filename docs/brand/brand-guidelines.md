# Brand Guidelines

**Date:** 2026-08-31
**Applies to:** marketing site, web app, mobile app, agent CLI, README and social cards.

## The one-line positioning

> **Your machines, one room. The agent dials out, so nothing has to dial in.**

Everything below serves that sentence.

## Voice

The audience is developers who already run their own servers. They do not need to be told what a port is, and they can smell marketing language from the first paragraph.

**Write like the codebase already does.** This repo's comments explain *why* a non-obvious choice was made — ordering guarantees, why the 2FA lockout counters are split from the PIN ones, why the ws-server binds `127.0.0.1`. That habit is the brand voice. Carry it into the marketing copy.

| Do | Don't |
| --- | --- |
| "The agent connects outbound. No inbound ports, no VPN." | "Seamlessly connect your development environment." |
| "Port checks take 800 ms and run on every dashboard load." | "Blazing-fast real-time monitoring." |
| "Self-hosted. Your data is in your Postgres." | "Enterprise-grade security you can trust." |
| Name the constraint, then the workaround. | Claim there are no constraints. |
| "Claude Code, Codex and Grok sessions, read as chat." | "AI-powered developer productivity." |

Specific numbers beat adjectives. "38 API routes, 19 tables, one 1,753-line WebSocket process" tells a developer more about the shape of the thing than "powerful" ever will.

Never use: seamless, effortless, revolutionary, game-changing, blazing-fast, unlock, supercharge, leverage (as a verb), 10x.

## Color

**The palette already exists and is already measured. Do not invent a new one for the website.** `src/app/globals.css` carries a note that every text token is contrast-checked against its own background — `--muted` at 5.9:1, `--dim` at 4.6:1, `--accent` at 5.9:1. That work is done and it is an asset. The marketing site inherits it so the site and the product look like the same thing.

### Core

| Role | Light | Dark | Notes |
| --- | --- | --- | --- |
| Accent | `#1a56db` | `#5b9cf8` | One interactive blue. Links and accents only. |
| Accent weak | `rgba(26,86,219,.09)` | `rgba(91,156,248,.14)` | Fills, tiles, selected states. |
| CTA | `#17191f` on `#ffffff` | `#eceef3` on `#14161c` | **The primary button is ink, not blue.** |
| Ground | `#fafafa` (web), `#f2f2f7` (mobile) | `#000000` | |
| Surface | `#ffffff` | `#1c1c1e` | |
| Text | `#1c1f27` | `#ffffff` | |
| Muted | `#5b6274` | `#ebebf5` | |
| Dim | `#6b7385` | `rgba(235,235,245,.6)` | |
| Hairline | `rgba(20,22,28,.08)` | `rgba(84,84,88,.65)` | |

### Status

These carry meaning in the product and must not be redecorated.

| Meaning | Light | Dark |
| --- | --- | --- |
| Running / live | `#0f7a3d` | `#3ddc84` |
| Waiting | `#a55a00` | `#f0b429` |
| Offline / stopped | `#c2273f` | `#ff6b7a` |

### Terminal

`#0c0e13` ground, `#d6dae3` foreground. This near-black is the brand's anchor color for hero imagery, the splash screen, and the app icon background — it is the color of the thing the product actually shows you.

### Two rules with teeth

1. **No gradients.** `globals.css` says it outright: *"Gradients are not part of this system."* The `--g1/--g2/--g3` tokens still exist only because 60+ call sites reference them, and they are all set to the same flat blue. Any gradient on the marketing site immediately makes it look like a different product.
2. **The CTA is ink, not brand color.** A black pill reads as "the action" without spending the blue, which is then free to mean "link". Keep this on the website. A blue "Get started" button breaks the system.

## Typography

The product uses the platform system stack, and the site should too — it loads instantly, needs no license, and matches the app.

- **UI and body:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- **Code, ports, session names, anything monospaced in the product:** `Menlo, "SF Mono", Consolas, monospace`

Ports (`:50051`), tmux session names, and machine names are **always** monospace, in both the product and the marketing copy. That consistency is doing real work: it tells the reader "this is a literal string you will type or see", and it is one of the few places where the product's typography carries meaning.

If you want one display face for marketing headlines only, choose a grotesque with a real 500 and 700 (Inter Tight, Aeonik, or similar) and use it **only** at 32px and above. Never for UI.

## Logo

### What exists today, and why it needs fixing

There are currently **three unrelated marks** shipping under one name:

| Where | What it is | Problem |
| --- | --- | --- |
| `public/favicon.svg` | Rounded square, a circle, three descending bars | Three-stop **purple-to-magenta gradient** (`#6366f1 → #8b5cf6 → #d946ef`) — a palette that appears nowhere else in the product and directly contradicts the no-gradient rule |
| `packages/devdash-mobile/assets/icon.png` | A blue chevron | **Construction guides are baked into the shipped PNG** — dashed centre lines, two circles and a crosshair are visible in the artwork. It also uses a gradient. |
| `assets/android-icon-*` | Adaptive foreground on `#17191f` | Third variant of the mark |

The visible construction guides in the shipped iOS icon are the single most urgent item in this document. It reads as unfinished, and it is on every installed phone right now.

### The mark

Keep the **chevron**. It already ships, it is the strongest of the three, and it is on-concept: a chevron is an arrowhead pointing *out*, which is precisely what the product does. Rebuild it clean.

**Construction, on a 24×24 grid:**

- Chevron: a single stroke path, `M 4 17 L 12 7 L 20 17`
- Stroke width `3`, `stroke-linecap="round"`, `stroke-linejoin="round"`
- A dot below: circle at `cx=12 cy=20.5 r=1.75`, filled
- One flat color. No gradient, no inner shadow, no bevel.

The dot is the machine. The chevron is the connection leaving it. Read together they say "dial out" without a word of explanation, and they survive being 16 pixels wide.

**Colors:** accent (`#1a56db` light / `#5b9cf8` dark) on transparent; or `#ffffff` on the `#0c0e13` terminal ground for the app icon and social cards. Never more than one color in the mark.

### Wordmark

"Dialout" set in the UI sans at weight 700, tracking `-0.02em`, sentence case — **Dialout**, never DialOut, DIALOUT, or dial-out. The lowercase "o" matters: it is what distinguishes the brand from the legacy `DialOut/EZ` product.

**Lockup:** mark left, wordmark right, gap equal to the mark's stroke width × 2. Optically centre the wordmark on the chevron's apex, not on the bounding box.

### Clear space and minimum sizes

- Clear space on all sides: the height of the dot (`3.5` units on the 24-grid).
- Mark alone: minimum 16px. Below that, drop the dot and keep the chevron.
- Lockup: minimum 96px wide. Below that, use the mark alone.

### Don't

- Don't add a gradient. This is the rule most likely to be broken.
- Don't put the mark on a busy photo. It needs a flat ground.
- Don't recolor the mark to a status color — `#3ddc84` and `#ff6b7a` mean *running* and *offline* in the product, and a green logo would be read as a status.
- Don't outline the wordmark, add a shadow, or rotate the mark.
- Don't ship anything with construction guides visible. Check the exported PNG at 100%, then at 16px.

## Application

**Favicon.** Replace `public/favicon.svg` with the flat chevron. Keep the 32×32 viewBox and the `rx=8` rounded square if you want the container, but the fill becomes flat accent and the purple gradient goes.

**Social card (`og:image`, 1200×630).** Terminal ground `#0c0e13`, mark in white at 96px top-left with clear space, headline in white at 56px, one line of `#d6dae3` support text at 24px. No screenshot — screenshots do not survive the crop that most platforms apply.

**Screenshots for the site.** Use the dark theme. It is the stronger of the two here because the terminal, the AI chat and the port list all sit on `#0c0e13`, so the shots look like one product rather than three screens.
