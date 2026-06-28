# Give the AI tools a shared, authorization-scoped data-access seam

> **✅ Implemented — via the repository seam.** The
> [Postgres migration](../superpowers/specs/2026-06-22-postgres-migration-design.md)
> introduced a single repository layer that every consumer — routes, services,
> **and AI tools** — now goes through. No file under `server/src/ai/tools/` or
> `server/src/ai/v2/tools/` imports a Mongoose model anymore; the
> `no-direct-model-imports.test.ts` guard enforces it. `ownerId`/`userId`
> scoping is applied through the shared repository methods rather than being
> re-implemented per tool, which is exactly the "north star" this note described.

**Priority:** Low · **Effort:** Large · **Risk:** Medium

## Problem

Beyond the route layer, the AI tool implementations are themselves a large
surface that queries the database directly, with the all-important
`ownerId`/`userId` authorization scoping repeated tool-by-tool rather than
enforced in one place:

- `server/src/ai/tools/getUserAccounts.ts`, `getAccountBalance.ts` — load the
  authenticated `User` directly.
- `server/src/ai/tools/transferPreflightHelpers.ts` — `User.findById` (`:82`),
  `Transaction.find` (`:105`), `Transaction.exists` (`:184`).
- Many other `server/src/ai/tools/*.ts` and `server/src/ai/v2/tools/*.ts` query
  `Transaction` / `User` directly to build read results.

For a banking assistant the highest-stakes invariant is *"a tool can only ever
read the authenticated user's own data."* Today that invariant is upheld by each
tool independently remembering to filter by `ctx.userId` — which is correct in
the current code, but is N copies of a security-critical filter rather than one.

## Proposed direction

Introduce a single read-data-access module (or reuse the same services the HTTP
layer adopts, e.g. [`TransactionQueryService`](transaction-query-service.md) and
[`AccountService`](account-service.md)) that the tools call:

```ts
// every tool read goes through a context-scoped accessor
const txns = await transactionQueryService.listForOwner({ ownerId: ctx.userId, ... });
```

so the `ownerId` scoping is applied in exactly one place and cannot be forgotten
by a future tool. This also removes duplicate pagination/aggregation logic
between the AI tools and the HTTP routes.

## Caveats / sequencing

- This is the **largest** item here and should come **after** the HTTP-side
  services exist, so the tools can adopt them rather than inventing a parallel
  layer.
- It intersects with the architecture-review finding that banking services
  currently import their type contracts from the v1 AI module
  (`server/src/ai/state.ts`). Extracting shared contracts into a neutral module
  is a prerequisite for cleanly sharing services between the HTTP and AI layers.
- Scope it per-tool-group; do not attempt a big-bang rewrite of all ~40 tools.

## Reference

Treat this as the "north star" once suggestions 1–5 land — it is the point where
the banking core and the AI layer share one authorization-scoped data path.
