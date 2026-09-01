# Naming and Domain

**Date:** 2026-08-31
**Status:** Recommendation, awaiting decision
**Availability measured:** 2026-08-31 via RDAP. Re-check before buying — these move.

## Recommendation

**Brand name: Dialout. Primary domain: `dialout.dev`.**

Buy `dialout.dev`, `dialout.io`, `dialout.sh`, `dialout.co`, and `getdialout.com` together. All five were available on 2026-08-31. Redirect everything to `dialout.dev`.

## Why this name

The product has exactly one architectural claim that no competitor can copy without rebuilding: **the agent connects outbound.** No inbound ports, no VPN, no port forwarding, no firewall rule. It is the first line of the repo's own `CLAUDE.md` and the reason the thing works on a laptop behind hotel Wi-Fi.

"Dialout" *is* that mechanism. The name does the positioning before a visitor reads a word of copy. It also carries a second meaning for the audience: on Linux, `dialout` is the group that grants access to serial devices — the permission to talk to hardware you own. The name sounds native to people who already know that.

Compare with the current name. **DevDash** is descriptive rather than distinctive: it says "a dashboard, for devs", which is true of a hundred products. `devdash.dev` is taken, as is every sensible TLD. It gives a search engine nothing to distinguish you by, and gives a reader nothing to remember.

## Measured availability

| Domain | Status |
| --- | --- |
| `dialout.dev` | **available** |
| `dialout.io` | **available** |
| `dialout.sh` | **available** |
| `dialout.co` | **available** |
| `getdialout.com` | **available** |
| `usedialout.com` | **available** |
| `dialout.com` | taken |
| `dialout.app` | taken |
| `dialout.net` | taken |
| `devdash.dev` | taken |

`.dev` is the right primary for a developer tool: it is on the HSTS preload list, so it cannot be served over plain HTTP, which is a small but real signal for a product whose whole pitch is "you host this yourself, safely."

## Risks, stated plainly

**No `.com`.** `dialout.com` is registered. `getdialout.com` is the fallback for anyone who types `.com` by reflex. For a developer tool this matters less than it would for a consumer product, but it is a genuine cost and you should decide with your eyes open.

**Search noise.** Querying "dialout" surfaces Linux serial-port permission threads (`usermod -aG dialout`). You will be competing for that word. Mitigate by always writing the brand as **Dialout** in prose and pairing it with a qualifier in titles and meta descriptions — "Dialout — the self-hosted dev control room" — never the bare word.

**One prior product.** [DialOut/EZ](https://www.tacticalsoftware.com/products/dialout-ez-site-edition) by Tactical Software is a legacy Windows modem-redirector. Different category, different spelling convention (they camel-case the O), no apparent active marketing. Low collision risk, but have a lawyer clear the mark before you print anything.

## Alternatives considered

Every nautical and control-room metaphor worth having is gone on `.dev` and `.com`. Measured as taken: `switchboard`, `homeport`, `flightdeck`, `portside`, `machineroom`, `patchbay`, `signalbox`, `crowsnest`, `drydock`, `roost`, `dispatch`, `uplink`, `deckhand`, `harbormaster`, `backhaul`, `callsign`, `anchorage`, `roundhouse`, `controlroom`, `outbound`.

Several survive on `.sh` only — `machineroom.sh`, `crowsnest.sh`, `signalbox.sh`, `portside.sh`, `homeport.sh`. A `.sh`-only brand with no `.dev` and no `.com` is a weaker position than `dialout`'s four-TLD set, which is why none of them is the recommendation.

## What a rename actually costs

This is not free, and the estimate belongs next to the recommendation rather than in a footnote. The identifier `devdash` is load-bearing in at least these places:

| Surface | Occurrences | Notes |
| --- | --- | --- |
| npm packages | 3 | `dialout`, `-shared`, `devdash-mobile` |
| Mobile bundle IDs | 2 | `com.indianic.devdash`, `.dev` — **already registered with Apple** |
| Agent config path | 1 | `~/.devdash-agent/config.json` on every installed machine |
| tmux session prefix | 1 | `dd-<sessionId>`, matched by prefix in live code |
| Shell rc guard block | 1 | `# >>> devdash cowork wrapper >>>` already written into users' rc files |
| Session cookie | 1 | `devdash-session` |
| Storage keys | ~8 | `devdash:*` in SecureStore / localStorage |
| Docs | 554-line guide + 37 `AGENTS.md` | |

The two that genuinely hurt are the **Apple bundle identifier** (re-registering means a new App ID, new provisioning, and existing installs cannot upgrade in place — they become a separate app) and the **cowork rc block plus agent config path**, which live on machines you do not control and need a migration path rather than a rename.

**Recommended sequencing:** take the domains now, launch the marketing site as Dialout, and keep the internal identifiers as `devdash` until there is a reason to pay for changing them. A product's public name and its package names do not have to match on day one, and pretending otherwise is how launches slip.
