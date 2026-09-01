<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-31 | Updated: 2026-08-31 -->

# brand

## Purpose

Naming, visual identity and marketing-site source material for the open-source release. Read these before changing anything user-facing: an icon, the favicon, a color token, an app display name, or store copy.

These are **proposals pending a decision on the rename**. The product still ships as DevDash. Nothing here has been applied to code.

## Key Files

| File | Description |
|------|-------------|
| `naming-and-domain.md` | Recommends the name **Dialout** and `dialout.dev`. Carries RDAP availability measured 2026-08-31 and a table of what a rename actually costs. |
| `brand-guidelines.md` | Voice, color, type, logo construction. The palette is the product's existing contrast-measured tokens — do not invent a new one. Two hard rules: no gradients, CTA is ink not blue. |
| `mobile-app-identity.md` | App name, store copy, and iOS/Android icon specs. Documents that the shipped `icon.png` has construction guides baked into it. |
| `product-inventory.md` | Every feature with its marketing angle, measured proof points, competitive framing, and a page-by-page site plan with ready copy. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

Three findings in here are about the **current** codebase and are true regardless of whether the rename happens:

1. `packages/devdash-mobile/assets/icon.png` ships with its design guides visible — dashed centre lines, circles, a crosshair.
2. `public/favicon.svg` uses a purple-to-magenta gradient that appears nowhere else and contradicts `globals.css`, which states outright that gradients are not part of the system.
3. Three unrelated marks ship under one name (web favicon, mobile icon, Android adaptive).

Counts in `product-inventory.md` were measured on 2026-08-31 and drift. Re-run the counts before quoting them anywhere public.

## Dependencies

### Internal

`../DEVDASH-GUIDE.md` (narrative spec, still v2.0 and predating AI sessions), `src/app/globals.css` and `packages/devdash-mobile/src/ui/tokens.ts` (the canonical palettes), `packages/devdash-mobile/assets/` and `public/` (icon artwork).

### External

None.

<!-- MANUAL: -->
