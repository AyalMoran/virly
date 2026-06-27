# Backend area: Transactions / Transfers

> Ledger history, FX quote, and the **manual money-movement** endpoint. Mounted
> at `/api/transactions`. See [`../index.md`](../index.md) for layering.

> **Money movement is documented in depth elsewhere — this file does not
> duplicate it.** The mechanics (atomic debit/credit, limits, idempotency,
> the FX-quote echo-back rule, and the AI confirm path) live in the
> [Transfers domain doc](../../domain/transfers.md). Per-endpoint request/response
> bodies live in the [API reference](../../api/README.md#1-endpoint-groups). This
> file is the **layer map**: which route calls which service.

**Router:** `server/src/routes/transaction.routes.ts`
**Services:** `server/src/services/transfer.service.ts`,
`server/src/services/fx.service.ts`,
`server/src/services/transactionQuery.service.ts`,
`server/src/services/email.service.ts` (hold-notification email)
**Fraud modules:** `server/src/fraud/service.ts` (`scoreTransfer`, `recordTransferRiskFlag`),
`server/src/fraud/holds.ts` (`shouldHold`, `createHold`, `confirmHold`, `cancelHold`)
**Utils/DTOs:** `server/src/utils/transaction-dto.ts`,
`server/src/utils/pagination.ts`

## Endpoints

| Method | Path | Auth | Handler calls | Notes |
|--------|------|------|---------------|-------|
| GET | `/api/transactions` | Yes | `transactionQueryService.listForOwner` | Paginated own ledger; optional `counterparty` (email) filter. |
| POST | `/api/transactions/quote` | Yes (+ CSRF) | `fx.service`: `assertSupportedCurrency`, `getCurrentRates`, `buildTransferQuote` | Server-issued FX quote; ILS returns rate 1 with no provider fetch. |
| POST | `/api/transactions` | Yes (+ CSRF) | fraud gate → `transfer.service.executeTransfer` → `recordTransferRiskFlag` | **Money movement.** Fraud gate may short-circuit with 202 (see below). Non-ILS must echo the quote back; mismatch → 409 (`QUOTE_RATE_CHANGED`), missing → 400 (`QUOTE_REQUIRED`). |
| GET | `/api/transactions/held/confirm` | None (token-guarded) | renders HTML confirm/cancel form | Renders an action page for the email link; a GET alone cannot move money. Rate-limited (20 req/min). |
| POST | `/api/transactions/held/confirm` | None (token-guarded) | `confirmHold(id, token)` from `fraud/holds.ts` | **Money movement via held path.** Compare-and-set: `pending → confirming → confirmed`. Returns HTML. |
| POST | `/api/transactions/held/cancel` | None (token-guarded) | `cancelHold(id, token)` from `fraud/holds.ts` | Cancels a pending held transfer. Token must match; returns HTML. |

The held confirm/cancel endpoints are intentionally public (no session cookie) but
token-guarded — the token is sent only in the hold-notification email to the sender.
For the token structure and double-spend safety, see the
[Fraud area](fraud.md#holdsts) and the
[Transfers domain doc](../../domain/transfers.md).

Request/response bodies and the curl example: [API reference §1 + §7](../../api/README.md#1-endpoint-groups).
Mechanics and invariants: [Transfers domain](../../domain/transfers.md).

## Layer walk

- **Route** validates with Zod (`transferSchema`, `quoteSchema`). The in-route
  helper `resolveTransferAmount` converts the entered amount/currency into the
  authoritative ILS amount + FX ledger metadata, enforcing the quote echo-back
  (the only business rule that lives in this route, and it is FX-validation, not
  settlement).

  **Fraud gate** (when `config.fraud.holdLevel !== "off"`): before calling
  `executeTransfer`, the route calls `scoreTransfer` (reads app repos, no AI
  Postgres). If `shouldHold(risk.level)` is true it calls `createHold` in the AI
  Postgres and sends a hold-notification email, then returns 202 without moving
  money. Any scoring or hold-creation failure is fail-open — the transfer
  proceeds normally and is logged. This fail-open rule means a fraud infra outage
  must never block a legitimate transfer. See the [Fraud area](fraud.md) and
  [Transfers domain doc](../../domain/transfers.md) for the hold lifecycle and
  trust boundary. For details on the security of the token-guarded hold confirm
  link, see [`../../security.md`](../../security.md).

  After a successful `executeTransfer`, the route calls `recordTransferRiskFlag`
  (best-effort post-commit flag; never affects the completed transfer).

- **Service** — `transfer.service.ts` (`executeTransfer` /
  `executeTransferWithSession`) performs the atomic debit + credit inside a
  transaction. AI transfer limits (`assertAiTransferWithinLimits`) are **not**
  enforced on this manual path — that function is called only from
  `aiPendingTransfer.service.ts` for AI-confirmed transfers (see
  [Transfers domain §2b](../../domain/transfers.md)).
  `fx.service.ts` owns rate fetch/cache and quote math.
  `transactionQuery.service.ts` owns history + filtering.
- **Repository** access through the `transactions` and `users` seam interfaces;
  the cross-driver transaction wrapper lives behind the seam.

## Cross-cutting

- All endpoints require `requireAuth`; unsafe methods require CSRF.
- Error codes `QUOTE_REQUIRED` / `QUOTE_RATE_CHANGED` are surfaced via
  `AppError` (`utils/app-error.ts`) and normalised by the error handler — see
  [API reference §3](../../api/README.md#3-error-envelope).
- The **AI confirm path** (`POST /api/ai/confirmations/:id`) is the *other*
  money-movement entry point; it is documented in [AI](ai.md) and the
  [Transfers domain doc](../../domain/transfers.md).
