## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- The reason the change is worth making. If it fixes a non-obvious bug,
     say what the bug actually was — that sentence usually belongs in a code
     comment too. -->

## How to verify

<!-- The commands or clicks a reviewer runs to see it working. -->

## Checklist

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` passes
- [ ] `npm run build` exits 0
- [ ] Agent tests pass, if `packages/devdash-agent` was touched
      (`cd packages/devdash-agent && npm test`)
- [ ] New database column? Schema updated, a new idempotent `scripts/apply-*.mjs`
      added, **and** that script added to `ORDER` in `scripts/apply-migrations.mjs`
- [ ] New or changed API route? Ownership is authorized, not just the session —
      `machine-access.ts` / `project-access.ts`, and `docs/api/openapi.yaml`
      updated in this same commit
- [ ] No `Co-Authored-By:` model trailer, session link, or generated-with footer
      in any commit message
