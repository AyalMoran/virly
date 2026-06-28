# Backend area: Accounts / Users

> The authenticated user's own account + personal details (`/api/accounts`) and
> read-only views of **other** users with relationship stats (`/api/users`). See
> [`../index.md`](../index.md) for layering and
> [`../../api/README.md`](../../api/README.md) for request/response shapes.

**Routers:** `server/src/routes/user.routes.ts` (mounted at **`/api/accounts`**),
`server/src/routes/userProfile.routes.ts` (mounted at **`/api/users`**)
**Services:** `server/src/services/account.service.ts`,
`server/src/services/personalDetails.service.ts`,
`server/src/services/transactionQuery.service.ts`
**Utils/DTOs:** `server/src/utils/personal-details.ts`,
`server/src/utils/user-profile-dto.ts`, `server/src/utils/transaction-dto.ts`,
`server/src/utils/pagination.ts`

> Note the mount/file mismatch: `user.routes.ts` serves `/api/accounts`
> (own account), while `userProfile.routes.ts` serves `/api/users` (other
> users). This is faithfully reflected in `app.ts`.

## Endpoints — `/api/accounts` (`user.routes.ts`)

| Method | Path | Auth | Handler calls | Notes |
|--------|------|------|---------------|-------|
| GET | `/api/accounts/me` | Yes | `accountService.getById`, `personalDetailsService.ensureForUser`, `transactionQueryService.listForOwner` | Balance + personal-details status + paginated own transactions. |
| GET | `/api/accounts/personal-details` | Yes | `accountService.getById`, `personalDetailsService.ensureForUser` | Returns the personal-details DTO. |
| PUT | `/api/accounts/personal-details` | Yes (+ CSRF) | `personalDetailsService.update` | Zod-validated name/DOB/address; ensure-then-update so a first PUT creates. |
| POST | `/api/accounts/personal-details/skip` | Yes (+ CSRF) | `personalDetailsService.markSkipped` | Marks KYC as skipped. |

## Endpoints — `/api/users` (`userProfile.routes.ts`)

| Method | Path | Auth | Handler calls | Notes |
|--------|------|------|---------------|-------|
| GET | `/api/users/:userId/profile` | Yes | `accountService.findByIdOrEmail`, `personalDetailsService.getDisplayName`, `transactionQueryService.getRelationshipStats` + `recentWithCounterparty` | `:userId` = ObjectId or email. Self-profile returns a zeroed relationship; other users return sent/received/net totals + recent 5. |
| GET | `/api/users/:userId/transactions` | Yes | `accountService.findByIdOrEmail`, `transactionQueryService.listForOwner` (with `counterpartyEmail`) | The **viewer's own** ledger filtered to the counterparty; paginated. |

Request/response bodies: [API reference §1 (Account / Users)](../../api/README.md#1-endpoint-groups).

## Layer walk

- **Route** validates input, resolves the viewer (`accountService.findById`) and
  (for `/api/users`) the viewed user (`findByIdOrEmail`), then composes DTOs with
  `toPersonalDetailsDto` / `toPublicUserProfileDto` /
  `toRelationshipTransactionDto` / `toTransactionDto`. Relationship status is
  resolved by `resolveRelationshipStatus` (`utils/user-profile-dto.ts`).
- **Service** — `account.service.ts` owns user lookup; `personalDetails.service.ts`
  owns the ensure/read/update/skip lifecycle; `transactionQuery.service.ts` owns
  paginated history, the counterparty filter, and relationship aggregation.
- **Repository** access through the `users`, `personalDetails`, and
  `transactions` seam interfaces.

## Cross-cutting

- All endpoints require `requireAuth`. Pagination (`page`/`limit`) is parsed by
  `utils/pagination.ts`; see [API reference §4](../../api/README.md#4-pagination).
- Self-profile is an explicit branch: it never exposes another user's ledger.
