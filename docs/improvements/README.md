# Improvement suggestions — service layer & data access

> **Status (2026-06-25): all six suggestions have shipped.** This folder was a
> set of **advisory** proposals to move direct database access out of the route
> handlers and into services. They have since been implemented — the routes now
> delegate to `account.service.ts`, `auth.service.ts`, `transactionQuery.service.ts`,
> `personalDetails.service.ts`, and `aiPendingTransfer.service.ts`, and the
> data-access seam from the [Postgres migration](../superpowers/specs/2026-06-22-postgres-migration-design.md)
> put **all** model access behind repositories (suggestion #6). The files below
> are kept as a record of the rationale; each now carries an **Implemented**
> banner noting where the work landed. The only residual follow-ups (cursor
> pagination, the `{ ownerId, counterpartyEmail, createdAt }` compound index) are
> called out in [transaction-query-service.md](transaction-query-service.md).

This folder collected **advisory** improvement suggestions found by scanning the
project for places that query the database directly from a route handler
instead of delegating to a service. Each file was a self-contained proposal you
could pick up independently.

## The pattern

`virly` already has two clean, service-backed flows that are the model to copy:

- **`videoSession.routes.ts`** → delegates everything to `videoSession.service.ts`
  (the routes never touch the `VideoSession` model directly).
- **Transfers** → `transaction.routes.ts` `POST /` and the AI confirm path both
  go through `transfer.service.ts` (`executeTransfer` / `executeTransferWithSession`).

The routes below instead import Mongoose models and call `.find` / `.findById` /
`.create` / `.aggregate` / `.countDocuments` inline, mixing data access,
authorization, and HTTP concerns in the handler. Because the app was built
incrementally this is expected — these notes just mark where to converge.

## How these were found

```sh
# direct model method calls inside the route layer
grep -rnE '\b(User|Transaction|PersonalDetails|AiPendingTransfer)\.(find|findOne|findById|create|updateOne|countDocuments|aggregate|exists)\b' server/src/routes/
```

> This grep now returns **zero** matches: no route file touches a model
> directly. More broadly, `server/src/repositories/no-direct-model-imports.test.ts`
> fails the build if any file outside `repositories/mongo/` (and `ai/evals/`)
> imports a Mongoose model, so the convention is now enforced automatically.

## Suggestions (all implemented)

| # | Suggestion | Routes affected | Priority | Status |
|---|------------|-----------------|----------|--------|
| 1 | [Extract an `AccountService` for `User` access](account-service.md) | auth, user, userProfile | High | ✅ Done — `services/account.service.ts` (commit `625b4b4`) |
| 2 | [Extract an `AuthService` from `auth.routes.ts`](auth-service.md) | auth | High | ✅ Done — `services/auth.service.ts` + tests (commit `672869d`) |
| 3 | [Extract a `TransactionQueryService` for ledger reads](transaction-query-service.md) | transaction, user, userProfile | High | ✅ Done — `services/transactionQuery.service.ts` (commit `7eaed76`); cursor-pagination follow-up still open |
| 4 | [Consolidate `PersonalDetails` access into a service](personal-details-service.md) | user, userProfile, auth | Medium | ✅ Done — `services/personalDetails.service.ts` (idempotent `ensureForUser` upsert) |
| 5 | [Stop bypassing `aiPendingTransfer.service` in the confirm route](ai-pending-transfer-confirm-direct-query.md) | ai | Medium | ✅ Done — `getResumablePendingForUser()` used in `ai.routes.ts` |
| 6 | [Give the AI tools a shared, authorization-scoped data-access seam](ai-tools-data-access.md) | ai/tools, ai/v2/tools | Low | ✅ Done — subsumed by the repository seam (Postgres migration) |

## Conventions to follow when acting on these

- **Routes become thin controllers**: parse input (zod) → call a service → map
  the result to a response (or `next(error)` for the central handler).
- **Services own data access and authorization scoping** (always filter by the
  authenticated `ownerId`/`userId`), are framework-agnostic (no `req`/`res`),
  and throw `AppError` for client-facing failures (see `utils/app-error.ts`).
- **DTO mapping stays at the boundary** (`utils/*-dto.ts`) and is called by the
  route or the service consistently — not half in each.
- Pair security-sensitive extractions (auth, money) with tests — see the
  test-coverage gaps noted in the project review.
