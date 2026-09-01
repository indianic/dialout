<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# ai-adapters

## Purpose

Vendor JSONL → one `AiEvent` union. `AiKind` is a union and `ADAPTERS` is `Record<AiKind, AiAdapter>`, so adding a vendor without writing its adapter is a **compile error**, not a runtime hole.

Cwd-escaping is **not** guessable — it was measured:

| kind | transcript | cwd escaping |
|------|------------|--------------|
| `claude` | `~/.claude/projects/<escaped-cwd>/<uuid>.jsonl` | every non-alphanumeric → `-` |
| `codex` | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | none (date-partitioned) |
| `grok` | `~/.grok/sessions/<enc-cwd>/<uuid>/chat_history.jsonl` | `encodeURIComponent` |

Locator logic lives in `../ai-transcript-locator.ts`, not here. Adapters only parse lines.

## Key Files

| File | Description |
|------|-------------|
| `types.ts` | `AiKind`, `AiEvent`, `AiAdapter`. |
| `index.ts` | `ADAPTERS` exhaustive map. |
| `claude.ts` | Claude Code JSONL. |
| `codex.ts` | Codex `rollout-*.jsonl`. |
| `grok.ts` | Grok `chat_history.jsonl` (nested filename — generic newest-`*.jsonl` cannot see it). |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- New vendor: add `AiKind` + adapter file + `ADAPTERS` entry (compiler will nag) + locator walk + tests under `test/ai-adapter-<kind>.test.js`.
- Don't scrape the alternate-screen TUI. It breaks on every upstream release.
- Launched sessions render through the same adapters with no special casing.

### Testing Requirements

`test/ai-adapter-claude.test.js`, `ai-adapter-codex.test.js`, `ai-adapter-grok.test.js`. Feed real-ish JSONL lines.

### Common Patterns

Pure functions: `parseLine(line) → AiEvent | null`.

## Dependencies

### Internal

Consumed by `ai-transcript-tail.ts` / `ai-sessions.ts`.

### External

None.

<!-- MANUAL: -->
