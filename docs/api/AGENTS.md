<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-21 | Updated: 2026-08-21 -->

# api

## Purpose

Hand-maintained OpenAPI contract for **native clients** (Flutter app, scripts). Browsers use cookies and never see this file. A shipped mobile app is pinned to this YAML in a way the web UI never was — it drifts unless a route change updates it in the same commit.

## Key Files

| File | Description |
|------|-------------|
| `openapi.yaml` | HTTP contract: auth (`X-DevDash-Client: native` to receive JWT in body), projects, machines, terminals, etc. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

If you change a route native clients consume — request/response shape, auth header, error codes — update `openapi.yaml` in the same change. Do not regenerate it from code; there is no codegen.

Auth reminder: browsers get an HttpOnly `devdash-session` cookie; native clients send `Authorization: Bearer <jwt>`. `getSession()` accepts either, Bearer winning when both are present.

### Testing Requirements

None automated. Drift is the failure mode.

### Common Patterns

Keep operationIds and path params aligned with `src/app/api/**/route.ts`.

## Dependencies

### Internal

`src/app/api/`

### External

OpenAPI 3.

<!-- MANUAL: -->
