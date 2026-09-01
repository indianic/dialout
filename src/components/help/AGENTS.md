<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# help

## Purpose

In-app help renderer used by `/help` and `/help/agent`.

## Key Files

| File | Description |
|------|-------------|
| `HelpArticle.tsx` | Markdown article layout. |
| `CopyBlock.tsx` | Copy-to-clipboard command block (agent install snippets). |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

Agent install copy must match the real package (`dialout`, public npm) and the `init` / `install-service` flow. There is no registry to configure any more — don't reintroduce that step, and don't invent a second install path.

### Testing Requirements

None.

### Common Patterns

`react-markdown` + GFM.

## Dependencies

### Internal

`src/app/(dash)/help/`

### External

`react-markdown`, `remark-gfm`.

<!-- MANUAL: -->
