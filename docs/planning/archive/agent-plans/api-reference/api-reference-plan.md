# Plan: API Reference (surface `openapi.yaml`)

> **Deliverable:** `docs/api/README.md` (+ optional rendered `docs/api/index.html`)
> **Type:** API documentation
> **Audience:** Frontend devs, integrators, and agents calling the HTTP API
> **Status:** Done - shipped as `docs/api/README.md`.
> **Gap:** Table 2 #3 - a ~59 KB `openapi.yaml` exists at repo root but nothing in `docs/` links or renders it.

## Why this doc
The OpenAPI spec is the contract of record but is invisible from the docs tree.
A short, navigable API reference that renders the spec and documents the cross-
cutting concerns (auth, errors, pagination, rate limits) turns it into something
a reader can actually use.

## Source material (already in the repo)
- `openapi.yaml` (repo root) — the spec to surface
- Mounts + middleware: `server/src/app.ts` (`/api/auth`, `/api/accounts`, `/api/users`, `/api/transactions`, `/api/exchange-rates`, `/api/ai`, `/api/video-sessions`, `/api/admin/video-sessions`; `authLimiter`, `aiLimiter`, `helmet`, `cors`)
- Errors: `server/src/utils/app-error.ts`, `server/src/middleware/error-handler.ts`
- Pagination: `server/src/utils/pagination.ts`
- Auth/CSRF: `server/src/middleware/{auth,cookies}.ts`, client `client/src/lib/api.ts` (CSRF header on unsafe methods, SSE parsing)

## Phases
### Phase 1 — Validate & freshness-check the spec
- [x] Lint `openapi.yaml` (e.g. `redocly lint` or `swagger-cli validate`).
- [x] Diff documented paths against `app.ts` mounts + each `*.routes.ts` to catch drift; fix the spec if stale.
- **Deliverable:** a validation report; spec passes lint.

### Phase 2 — Reference index
- [x] Write `docs/api/README.md`: base URL, how endpoints are grouped, and a link to the rendered spec.
- [x] Document **auth** (HttpOnly JWT cookie + CSRF token on unsafe methods), the **error envelope** (`AppError` → status + `issues`/`details`), **pagination** (page/limit + `getPaginationMeta`), and **rate limits** (auth vs ai).
- **Deliverable:** `README.md` covering the cross-cutting concerns the raw spec under-explains.

### Phase 3 — Render (optional but recommended)
- [x] Add a `docs:api` script that renders `openapi.yaml` to static HTML (Redoc/Stoplight) into `docs/api/index.html`.
- [x] Note the regeneration command so it stays current.
- **Deliverable:** rendered HTML + regeneration instructions.

### Phase 4 — SSE + examples
- [x] Document the streaming endpoint `POST /api/ai/chat/stream` (SSE event shapes) since OpenAPI describes it poorly; reference `ai/v2/streamEvents.ts` and `client/src/lib/api.ts`.
- [x] Add 2–3 end-to-end `curl` examples (login → list transactions → quote).
- **Deliverable:** an "examples & streaming" section.

## Acceptance criteria
- [x] `openapi.yaml` passes lint and every path matches a real mounted route.
- [x] Auth, errors, pagination, and rate limits are documented in one place.
- [x] The SSE chat endpoint is documented with its event shapes.

## Related docs (link, don't duplicate)
[security-model](../security-model/security-model-plan.md) · [backend-reference](../backend-reference/backend-reference-plan.md) · [ai-architecture](../ai-architecture/ai-architecture-plan.md)

## Effort estimate
Medium (M) — most content exists in `openapi.yaml`; the work is validation, rendering, and the cross-cutting prose.
