# Screenshot and video assets

Every file here is a **placeholder**. Replace it with a real capture using the
same filename and the README on GitHub and the package page on npm both update
with no markup change.

| File | Size | What it should show |
| --- | --- | --- |
| `hero.png` | 1600 × 900 | The dashboard: projects across machines, ports live |
| `projects.png` | 1280 × 800 | Projects list — ports, stack, notes, todos, per machine |
| `terminals.png` | 1280 × 800 | A tmux session running in the browser |
| `ai-sessions.png` | 1280 × 800 | Claude Code / Codex / Grok sessions rendered as chat |
| `tunnel.png` | 1280 × 800 | A local dev server reached through its public tunnel URL |
| `mobile.png` | 900 × 1200 | The phone app, portrait |
| `demo-poster.png` | 1600 × 900 | Poster frame for the demo video, linked to dialout.dev/demo |

## Rules

- **PNG or JPG only.** `raw.githubusercontent.com` serves `.svg` as
  `text/plain`, so an SVG referenced from the npm README will not render.
- **Use the dark theme.** The terminal, the AI chat and the port list all sit on
  `#0c0e13`, so dark shots read as one product rather than three screens.
  `docs/brand/brand-guidelines.md` has the reasoning.
- **Keep the filenames and aspect ratios.** Both READMEs hardcode them.
- **Nothing real in the frame.** No live API keys, client names, `mch_…` keys or
  private repository paths — these files are public on GitHub and npm.

## npm images need the repo to be public

The npm README references these images by absolute
`raw.githubusercontent.com/indianic/dialout/main/…` URL, because relative paths
do not resolve on npmjs.com. Those URLs 404 for anonymous readers while the
GitHub repository is private, so the package page shows broken images until the
repo is flipped to public.

## Regenerating the placeholders

They were generated on-brand rather than downloaded, so a missing one can be
recreated. See the script recorded in `docs/brand/brand-guidelines.md` § Logo —
terminal ground `#0c0e13`, the chevron mark in white, label in `#d6dae3`,
caption in `#6b7385`.
