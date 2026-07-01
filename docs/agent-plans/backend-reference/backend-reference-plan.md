# Plan: Backend / Server Reference

> **Deliverable:** `docs/backend/` (an `index.md` + `_inventory.md` + per-area files, mirroring `docs/frontend/`)
> **Type:** Architecture / module reference
> **Audience:** Backend contributors and AI agents navigating `server/src`
> **Status:** Done - shipped as `docs/backend/` (`index.md`, `_inventory.md`, and 11 area files).
> **Gap:** Table 2 #1 — the server is the larger half of the app and has no structured reference.

## Why this doc
`docs/frontend/` catalogues every client component, but the server (routes,
services, repositories, models, middleware, 35 AI tools: 29 v1 + 6 v2) has no equivalent.
Contributors and agents must read source to understand the layering. This doc
makes the backend navigable the same way the frontend reference does.

## Source material (already in the repo)
- Routes: `server/src/routes/*.routes.ts` (auth, user, userProfile, transaction, exchangeRate, ai, videoSession)
- Services: `server/src/services/*.service.ts`
- Repositories + seam: `server/src/repositories/{types.ts,registry.ts,index.ts,mongo/,postgres/}`
- Models (Mongo backing): `server/src/models/*.ts`
- Middleware: `server/src/middleware/{auth,cookies,roles,error-handler}.ts`
- Utils/DTOs: `server/src/utils/*`
- Boot: `server/src/{app.ts,index.ts,db.ts,config.ts}`
- Existing prose to reuse: `docs/improvements/README.md` (service map), the Postgres design spec (data layer).

## Phases
### Phase 1 — Inventory (source of truth)
- [x] Build `docs/backend/_inventory.md`: a table of every route, service, repository, model, and middleware with path, layer, and one-line role — the same "inventory drives the area files" pattern as `docs/frontend/_inventory.md`.
- [x] Define the areas: **Auth**, **Accounts/Users**, **Transactions/Transfers**, **Exchange rates/FX**, **AI**, **Fraud**, **RAG/knowledge**, **MCP support**, **Video sessions**, **Data layer (repositories/seam)**, **Cross-cutting (middleware/utils)**.
- **Deliverable:** `_inventory.md` reviewed for completeness against `find server/src`.

### Phase 2 — Layering overview + diagram
- [x] Write `docs/backend/index.md`: the request lifecycle (route → service → repository → driver), the "routes are thin controllers, services own logic+authz, repositories own data access" rule, and the `no-direct-model-imports` guard.
- [x] Add one ASCII/Mermaid diagram of the layers.
- **Deliverable:** `index.md` with a table of contents linking the area files.

### Phase 3 — Per-area files
- [x] One file per area under `docs/backend/areas/`, each documenting its routes (method, path, auth, request/response shape) and the services/repositories they call.
- [x] For money-movement and AI, **link** to the Transfers domain doc and AI architecture doc rather than duplicating (Table 2 #6, #2).
- **Deliverable:** `areas/*.md` for all areas.

### Phase 4 — Cross-link + verify
- [x] Link from the root `README.md` and `docs/frontend/index.md` ("Backend contract").
- [x] Verify every cited path exists (`test -f`) and every endpoint matches `app.ts` mounts + `openapi.yaml`.
- **Deliverable:** a verification note at the bottom of `index.md` (paths/endpoints checked on <date>).

## Acceptance criteria
- [x] Every file under `server/src/{routes,services,repositories,models,middleware}` appears in `_inventory.md`.
- [x] Every documented endpoint exists in `app.ts` and `openapi.yaml`.
- [x] No content duplicates the API reference, AI architecture, or Transfers domain docs — those are linked.

## Related docs (link, don't duplicate)
[api-reference](../api-reference/api-reference-plan.md) · [ai-architecture](../ai-architecture/ai-architecture-plan.md) · [transfers-domain](../transfers-domain/transfers-domain-plan.md) · `docs/improvements/README.md`

## Effort estimate
Large (L) — broadest doc; sequence after the API reference exists so endpoints can be linked, not re-described.
